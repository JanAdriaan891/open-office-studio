import type MDBReader from "mdb-reader";
import {
  leesFormaat,
  leesRijenRuw,
  leesTabeldefinitie,
  telRijenRuw,
  type RuwFormaat,
} from "./access-pagina.ts";
import { reconstrueerQuery, type QueryRij } from "./access-query.ts";
import { leesCfb } from "./cfb.ts";
import {
  leesProjectBeveiliging,
  leesVbaDir,
  leesVbaModuleBron,
  decodeerVbaTekst,
} from "./ovba.ts";
import type {
  Compatibiliteitsrapport,
  DatabaseObject,
  Rapportregel,
} from "./model.ts";

// Leest alleen metadata en broncode. Macro’s, VBA, query’s en gekoppelde bronnen worden nooit uitgevoerd.
type Rij = Record<string, unknown>;
const inventaris: Record<number, "Formulier" | "Rapport" | "Macro"> = {
  [-32768]: "Formulier",
  [-32764]: "Rapport",
  [-32766]: "Macro",
};
const MODULE = -32761;

function melding(fout: unknown) {
  return fout instanceof Error ? fout.message : String(fout);
}
function tekstOf(waarde: unknown) {
  return typeof waarde === "string" ? waarde : null;
}
function getal(waarde: unknown) {
  return typeof waarde === "number" ? waarde : null;
}
async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function systeemtabel(db: MDBReader, naam: string): Rij[] | null {
  if (
    !db
      .getTableNames({ normalTables: false, systemTables: true })
      .includes(naam)
  )
    return null;
  return db.getTable(naam).getData() as Rij[];
}

interface VbaStromen {
  bron: string;
  stromen: Map<string, Uint8Array>;
}
export function vbaUitOpslag(rijen: Rij[]): VbaStromen {
  const perId = new Map(rijen.map((r) => [getal(r.Id), r]));
  const pad = (rij: Rij): string => {
    const delen: string[] = [];
    for (
      let huidig: Rij | undefined = rij, stap = 0;
      huidig && stap < 64;
      stap++
    ) {
      const naam = tekstOf(huidig.Name) ?? "";
      if (naam === "MSysAccessStorage_ROOT") break;
      delen.unshift(naam);
      const ouder = getal(huidig.ParentId);
      if (ouder === getal(huidig.Id)) break;
      huidig = perId.get(ouder);
    }
    return delen.join("/");
  };
  const stromen = new Map<string, Uint8Array>();
  for (const rij of rijen)
    if (getal(rij.Type) === 2 && rij.Lv instanceof Uint8Array)
      stromen.set(pad(rij).toLowerCase(), rij.Lv);
  return { bron: "MSysAccessStorage", stromen };
}
function vbaUitObjecten(rijen: Rij[]): VbaStromen {
  const gesorteerd = rijen
    .filter((r) => r.Data instanceof Uint8Array)
    .sort((a, b) => (getal(a.ID) ?? 0) - (getal(b.ID) ?? 0));
  const start = gesorteerd.findIndex((r) =>
    [0xd0, 0xcf, 0x11, 0xe0].every((b, i) => (r.Data as Uint8Array)[i] === b),
  );
  if (start < 0)
    throw new Error("MSysAccessObjects bevat geen compound-bestand.");
  const delen = gesorteerd.slice(start).map((r) => r.Data as Uint8Array);
  const geheel = new Uint8Array(delen.reduce((som, d) => som + d.length, 0));
  delen.reduce((positie, d) => (geheel.set(d, positie), positie + d.length), 0);
  const stromen = new Map<string, Uint8Array>();
  for (const item of leesCfb(geheel))
    if (item.data) stromen.set(item.pad.toLowerCase(), item.data);
  return { bron: "MSysAccessObjects", stromen };
}

export interface Analyse {
  objecten: DatabaseObject[];
  rapport: Compatibiliteitsrapport;
}

export async function analyseerDatabase(
  db: MDBReader,
  bytes: Uint8Array,
  bestand: { naam: string; grootte: number },
): Promise<Analyse> {
  const regels: Rapportregel[] = [];
  const objecten: DatabaseObject[] = [];
  const regel = (
    onderdeel: string,
    status: Rapportregel["status"],
    aantal: number | null,
    toelichting: string,
  ) => regels.push({ onderdeel, status, aantal, toelichting });

  let formaat: RuwFormaat | null = null;
  let formaatNaam = "Onbekend";
  try {
    formaat = leesFormaat(bytes);
    formaatNaam =
      formaat.naam + (formaat.sleutel ? " · RC4-paginaversleuteling" : "");
  } catch (fout) {
    regel("Bestandskop", "gedeeltelijk", null, melding(fout));
  }
  const msysObjecten = (db.getTable("MSysObjects").getData() as Rij[]).map(
    (r) => ({
      id: getal(r.Id) ?? 0,
      naam: tekstOf(r.Name) ?? "",
      type: getal(r.Type) ?? 0,
      vlaggen: getal(r.Flags) ?? 0,
    }),
  );
  const perNaam = new Map(
    msysObjecten.filter((o) => o.type === 1).map((o) => [o.naam, o]),
  );

  const tabelnamen = db.getTableNames();
  let rijtelling: Map<number, number> | null = null;
  try {
    if (formaat) rijtelling = telRijenRuw(bytes, formaat);
  } catch (fout) {
    regel("Onafhankelijke rijtelling", "niet gelezen", null, melding(fout));
  }
  const tabelProblemen: string[] = [];
  const telAfwijkingen: string[] = [];
  let indexen = 0;
  let indexFouten = 0;
  for (const naam of tabelnamen) {
    const object: DatabaseObject = {
      id: naam,
      naam,
      soort: "Tabel",
      beperkingen: [],
    };
    objecten.push(object);
    let rijen: number | null = null;
    try {
      const tabel = db.getTable(naam);
      rijen = tabel.rowCount;
      tabel.getColumns();
    } catch (fout) {
      tabelProblemen.push(naam);
      object.beperkingen!.push(`Kolommen niet leesbaar: ${melding(fout)}`);
    }
    const pagina = (perNaam.get(naam)?.id ?? 0) & 0xffffff;
    if (!formaat || !pagina) continue;
    try {
      const definitie = leesTabeldefinitie(bytes, formaat, pagina);
      object.indexen = definitie.indexen.map((i) => ({
        naam: i.naam,
        kolommen: i.kolommen.map(
          (k) => k.naam + (k.oplopend ? "" : " (aflopend)"),
        ),
        primair: i.primair,
        uniek: i.uniek,
        extern: i.extern,
      }));
      indexen += definitie.indexen.length;
      const ruw = rijtelling?.get(pagina) ?? 0;
      if (rijtelling && rijen !== null && ruw !== rijen) {
        telAfwijkingen.push(naam);
        object.beperkingen!.push(
          `Rijaantal wijkt af: tabeldefinitie ${rijen}, eigen paginascan ${ruw}.`,
        );
      }
    } catch (fout) {
      indexFouten++;
      object.beperkingen!.push(`Indexen niet gelezen: ${melding(fout)}`);
    }
  }
  regel(
    "Tabellen",
    tabelProblemen.length
      ? "gedeeltelijk"
      : tabelnamen.length
        ? "gelezen"
        : "niet aanwezig",
    tabelnamen.length,
    tabelProblemen.length
      ? `Kolommen niet leesbaar door niet-ondersteunde veldtypen in: ${tabelProblemen.join(", ")}.`
      : "Gebruikerstabellen, kolomnamen, typen en rijaantallen via mdb-reader; gegevens per pagina van 200 rijen.",
  );
  if (rijtelling)
    regel(
      "Rijaantallen (onafhankelijke controle)",
      telAfwijkingen.length ? "gedeeltelijk" : "gelezen",
      tabelnamen.length - telAfwijkingen.length,
      telAfwijkingen.length
        ? `Eigen paginascan wijkt af bij: ${telAfwijkingen.join(", ")}. Zie de tabelbeperkingen.`
        : "De eigen scan van datapagina’s komt voor alle tabellen overeen met de tabeldefinitie.",
    );
  regel(
    "Indexen en primaire sleutels",
    indexFouten ? "gedeeltelijk" : indexen ? "gelezen" : "niet aanwezig",
    indexen,
    indexFouten
      ? `Bij ${indexFouten} tabel(len) kon de tabeldefinitie niet ruw worden gelezen.`
      : "Uit de tabeldefinitiepagina’s gelezen met een eigen lezer (namen, kolommen, primair, uniek, relatie-index).",
  );

  const gekoppeld = msysObjecten.filter((o) => o.type === 4 || o.type === 6);
  for (const o of gekoppeld)
    objecten.push({
      id: `gekoppeld:${o.naam}`,
      naam: o.naam,
      soort: "Gekoppelde tabel",
      eigenschappen: [
        ["Soort", o.type === 4 ? "ODBC-koppeling" : "Gekoppelde Access-tabel"],
      ],
      beperkingen: [
        "Alleen inventaris. De externe bron wordt niet geopend; de verbindingsreeks wordt niet getoond.",
      ],
    });
  regel(
    "Gekoppelde tabellen",
    gekoppeld.length ? "niet gelezen" : "niet aanwezig",
    gekoppeld.length,
    gekoppeld.length
      ? "Alleen namen geïnventariseerd; externe bronnen worden niet geopend."
      : "Geen gekoppelde tabellen in MSysObjects.",
  );

  try {
    const rijen = systeemtabel(db, "MSysRelationships");
    if (!rijen)
      regel("Relaties", "niet aanwezig", 0, "MSysRelationships ontbreekt.");
    else {
      const groepen = new Map<string, Rij[]>();
      for (const rij of rijen) {
        const naam = tekstOf(rij.szRelationship) ?? "";
        groepen.set(naam, [...(groepen.get(naam) ?? []), rij]);
      }
      let systeem = 0;
      for (const [naam, lijst] of groepen) {
        lijst.sort((a, b) => (getal(a.icolumn) ?? 0) - (getal(b.icolumn) ?? 0));
        const eerste = lijst[0];
        if (
          /^MSys/i.test(tekstOf(eerste.szObject) ?? "") &&
          /^MSys/i.test(tekstOf(eerste.szReferencedObject) ?? "")
        ) {
          systeem++;
          continue;
        }
        const vlag = getal(eerste.grbit) ?? 0;
        const van = `${tekstOf(eerste.szObject)} (${lijst.map((r) => tekstOf(r.szColumn)).join(", ")})`;
        const naar = `${tekstOf(eerste.szReferencedObject)} (${lijst.map((r) => tekstOf(r.szReferencedColumn)).join(", ")})`;
        objecten.push({
          id: `relatie:${naam}`,
          naam,
          soort: "Relatie",
          eigenschappen: [
            ["Van (refererend)", van],
            ["Naar (primair)", naar],
            ["Soort", vlag & 0x1 ? "Eén-op-één" : "Eén-op-veel"],
            [
              "Referentiële integriteit",
              vlag & 0x2 ? "Niet afgedwongen" : "Afgedwongen",
            ],
            ["Trapsgewijs bijwerken", vlag & 0x100 ? "Ja" : "Nee"],
            ["Trapsgewijs verwijderen", vlag & 0x1000 ? "Ja" : "Nee"],
            [
              "Standaardjoin",
              vlag & 0x1000000
                ? "LEFT JOIN"
                : vlag & 0x2000000
                  ? "RIGHT JOIN"
                  : "INNER JOIN",
            ],
          ],
        });
      }
      const gebruiker = groepen.size - systeem;
      regel(
        "Relaties",
        gebruiker ? "gelezen" : "niet aanwezig",
        gebruiker,
        (gebruiker
          ? "Uit MSysRelationships: tabellen, kolommen, integriteit en trapsgewijze acties."
          : "Geen gebruikersrelaties in MSysRelationships.") +
          (systeem
            ? ` ${systeem} interne Access-relatie(s) tussen systeemtabellen zijn niet in de objectbrowser opgenomen.`
            : ""),
      );
    }
  } catch (fout) {
    regel("Relaties", "niet gelezen", null, melding(fout));
  }

  const queryObjecten = msysObjecten.filter((o) => o.type === 5);
  try {
    const rijen = queryObjecten.length ? systeemtabel(db, "MSysQueries") : [];
    if (rijen === null) throw new Error("MSysQueries ontbreekt.");
    const perQuery = new Map<number, QueryRij[]>();
    for (const rij of rijen) {
      const id = getal(rij.ObjectId) ?? 0;
      perQuery.set(id, [
        ...(perQuery.get(id) ?? []),
        {
          Attribute: getal(rij.Attribute) ?? -1,
          Expression: tekstOf(rij.Expression),
          Flag: getal(rij.Flag),
          LvExtra: getal(rij.LvExtra),
          Name1: tekstOf(rij.Name1),
          Name2: tekstOf(rij.Name2),
        },
      ]);
    }
    const mislukt: string[] = [];
    for (const query of queryObjecten) {
      const resultaat = reconstrueerQuery(
        perQuery.get(query.id) ?? [],
        query.vlaggen,
      );
      if (resultaat.sql === null) mislukt.push(query.naam);
      objecten.push({
        id: `query:${query.naam}`,
        naam: query.naam,
        soort: "Query",
        bron: resultaat.sql ?? undefined,
        eigenschappen: [
          ["Querysoort", resultaat.soort],
          ...(query.naam.startsWith("~")
            ? ([
                [
                  "Verborgen",
                  "Ja, systeemquery voor een formulier, rapport of besturingselement",
                ],
              ] as [string, string][])
            : []),
        ],
        beperkingen: resultaat.beperkingen,
      });
    }
    regel(
      "Opgeslagen query’s",
      !queryObjecten.length
        ? "niet aanwezig"
        : mislukt.length
          ? "gedeeltelijk"
          : "gelezen",
      queryObjecten.length,
      !queryObjecten.length
        ? "Geen query’s in MSysObjects."
        : `SQL uit MSysQueries gereconstrueerd voor ${queryObjecten.length - mislukt.length} van ${queryObjecten.length}.${mislukt.length ? ` Niet gereconstrueerd: ${mislukt.join(", ")}.` : ""} Query’s worden niet uitgevoerd.`,
    );
  } catch (fout) {
    regel(
      "Opgeslagen query’s",
      "niet gelezen",
      queryObjecten.length,
      melding(fout),
    );
  }

  for (const [type, soort] of Object.entries(inventaris)) {
    const lijst = msysObjecten.filter((o) => o.type === Number(type));
    for (const o of lijst)
      objecten.push({
        id: `${soort}:${o.naam}`,
        naam: o.naam,
        soort,
        beperkingen: [
          `Alleen inventaris (naam en soort uit MSysObjects). ${soort === "Macro" ? "Macro’s worden niet weergegeven of uitgevoerd." : `${soort}en worden niet weergegeven of uitgevoerd.`}`,
        ],
      });
    const meervoud = {
      Formulier: "Formulieren",
      Rapport: "Rapporten",
      Macro: "Macro’s",
    }[soort];
    regel(
      meervoud,
      lijst.length ? "niet gelezen" : "niet aanwezig",
      lijst.length,
      lijst.length
        ? "Alleen naam en soort geïnventariseerd; ontwerp en gedrag worden niet weergegeven of uitgevoerd."
        : "Niet aanwezig volgens MSysObjects.",
    );
  }

  const moduleObjecten = msysObjecten.filter((o) => o.type === MODULE);
  try {
    const namen = db.getTableNames({ normalTables: false, systemTables: true });
    let opslag: VbaStromen | null = null;
    if (namen.includes("MSysAccessStorage"))
      opslag = vbaUitOpslag(
        db.getTable("MSysAccessStorage").getData() as Rij[],
      );
    else if (namen.includes("MSysAccessObjects")) {
      let rijen: Rij[];
      try {
        rijen = db.getTable("MSysAccessObjects").getData() as Rij[];
      } catch {
        const pagina =
          msysObjecten.find((o) => o.naam === "MSysAccessObjects")!.id &
          0xffffff;
        if (!formaat) throw new Error("Bestandskop onleesbaar.");
        rijen = leesRijenRuw(bytes, formaat, pagina);
      }
      opslag = vbaUitObjecten(rijen);
    }
    const dir = [...(opslag?.stromen ?? [])].find(([pad]) =>
      /(^|\/)vba\/vbaproject\/vba\/dir$/.test(pad),
    );
    if (!opslag || !dir) {
      const reden = namen.includes("MSysModules2")
        ? "Access 97-moduleopslag (MSysModules2) wordt niet gedecodeerd."
        : "Geen VBA-projectopslag gevonden.";
      regel(
        "VBA-modules",
        moduleObjecten.length ? "niet gelezen" : "niet aanwezig",
        moduleObjecten.length,
        `${reden} MSysObjects vermeldt ${moduleObjecten.length} module(s).`,
      );
      for (const o of moduleObjecten)
        objecten.push({
          id: `vba:${o.naam}`,
          naam: o.naam,
          soort: "VBA",
          beperkingen: [`Broncode niet teruggewonnen. ${reden}`],
        });
    } else {
      const basis = dir[0].slice(0, -"vba/dir".length);
      const info = leesVbaDir(dir[1]);
      const project = opslag.stromen.get(`${basis}project`);
      const beveiliging = project
        ? leesProjectBeveiliging(decodeerVbaTekst(project, info.codepagina))
        : null;
      let metBron = 0;
      for (const module of info.modules) {
        const object: DatabaseObject = {
          id: `vba:${module.naam}`,
          naam: module.naam,
          soort: "VBA",
          eigenschappen: [
            ["Moduletype", module.soort],
            ["Opslag", `${opslag.bron}, stroom ${module.stroom}`],
          ],
          beperkingen: [],
        };
        objecten.push(object);
        const stroom = opslag.stromen.get(
          `${basis}vba/${module.stroom.toLowerCase()}`,
        );
        if (!stroom) {
          object.beperkingen!.push(
            "Broncode niet teruggewonnen: de modulestroom ontbreekt in het VBA-project.",
          );
          continue;
        }
        try {
          const bron = leesVbaModuleBron(
            stroom,
            module.offset,
            info.codepagina,
          );
          if (bron === null)
            object.beperkingen!.push(
              "Geen broncode aanwezig, alleen gecompileerde code (bijvoorbeeld MDE/ACCDE). Er is niets teruggewonnen.",
            );
          else {
            object.bron = bron;
            metBron++;
          }
        } catch (fout) {
          object.beperkingen!.push(
            `Broncode niet teruggewonnen: ${melding(fout)}`,
          );
        }
      }
      const verwijzingen = info.verwijzingen.map(
        (v) => `${v.naam} (${v.soort.toLowerCase()})`,
      );
      regel(
        "VBA-modules",
        !info.modules.length
          ? "niet aanwezig"
          : metBron === info.modules.length
            ? "gelezen"
            : "gedeeltelijk",
        info.modules.length,
        `VBA-project ‘${info.projectnaam}’ gevonden in ${opslag.bron} (codepagina ${info.codepagina}). ` +
          (info.modules.length
            ? `Broncode teruggewonnen voor ${metBron} van ${info.modules.length} module(s) met eigen MS-OVBA-decompressie. `
            : "De dir-stroom vermeldt geen modules. ") +
          `MSysObjects vermeldt ${moduleObjecten.length} standaard- of klassemodule(s). ` +
          (beveiliging?.vergrendeld
            ? "Het project is vergrendeld voor weergave. "
            : beveiliging?.wachtwoord
              ? "Het project heeft een wachtwoord. "
              : "") +
          (verwijzingen.length
            ? `Verwijzingen: ${verwijzingen.join(", ")}. `
            : "") +
          "VBA wordt nooit uitgevoerd.",
      );
    }
  } catch (fout) {
    regel(
      "VBA-modules",
      "niet gelezen",
      moduleObjecten.length,
      `VBA-project niet gelezen: ${melding(fout)}`,
    );
  }
  regel(
    "Uitvoering",
    "niet uitgevoerd",
    null,
    "Openen voert geen query’s, macro’s, VBA, AutoExec of gekoppelde bronnen uit. Het origineel wordt niet gewijzigd.",
  );

  return {
    objecten,
    rapport: {
      bestand: bestand.naam,
      grootte: bestand.grootte,
      sha256: await sha256(bytes),
      formaat: formaatNaam,
      lezer:
        "mdb-reader 3.2.0 met eigen MSysQueries-, tabeldefinitie-, CFB- en MS-OVBA-lezer",
      datum: new Date().toISOString(),
      regels,
    },
  };
}
