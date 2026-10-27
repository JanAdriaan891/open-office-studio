/**
 * Pure logica voor het scherm “Externe verwijzingen”: groeperen van
 * afhankelijkheden, filters, ketenweergave, padverkorting en export van het
 * resultaat van “Uitvoeren wat werkt”. Geen broncode, geen verbindingsreeksen.
 */
import type {
  Afhankelijkheid,
  AfhankelijkheidSoort,
  Beschikbaarheid,
  ExterneAnalyse,
  GekoppeldeTabelInvoer,
  OntbrekendModus,
  ProcedureAnalyse,
  ProcedureReden,
  ProcedureStatus,
  Uitvoering,
  UitvoeringStatus,
  WatWerktSamenvatting,
} from "../../../vba/src/extern-typen.ts";
import { csv, type DatabaseObject } from "../model.ts";

// ---------------------------------------------------------------- teksten

export const STATUS_BESCHIKBAAR: Record<Beschikbaarheid, { tekst: string; teken: string }> = {
  ingebouwd: { tekst: "Ingebouwd", teken: "✓" },
  deels: { tekst: "Deels nagebootst", teken: "◐" },
  ontbreekt: { tekst: "Ontbreekt", teken: "✕" },
};

export const STATUS_PROCEDURE: Record<ProcedureStatus, { tekst: string; teken: string }> = {
  uitvoerbaar: { tekst: "Uitvoerbaar", teken: "✓" },
  deels: { tekst: "Deels uitvoerbaar", teken: "◐" },
  niet: { tekst: "Niet uitvoerbaar", teken: "✕" },
};

export const STATUS_UITVOERING: Record<UitvoeringStatus | "niet-uitgevoerd", { tekst: string; teken: string }> = {
  geslaagd: { tekst: "Geslaagd", teken: "✓" },
  fout: { tekst: "Fout", teken: "✕" },
  tijdslimiet: { tekst: "Tijdslimiet", teken: "⏱" },
  gestopt: { tekst: "Gestopt", teken: "■" },
  "niet-uitgevoerd": { tekst: "Niet uitgevoerd", teken: "–" },
};

export const MODI: { waarde: OntbrekendModus; naam: string; uitleg: string }[] = [
  {
    waarde: "stoppen",
    naam: "Stoppen",
    uitleg: "De procedure stopt bij het eerste ontbrekende onderdeel. Veiligste keuze; standaard.",
  },
  {
    waarde: "fout",
    naam: "Fout teruggeven aan VBA",
    uitleg:
      "Het ontbrekende onderdeel geeft de VBA-fout die Access zelf zou geven (bv. 429 bij CreateObject). De eigen foutafhandeling van de code (On Error) werkt dan gewoon.",
  },
  {
    waarde: "overslaan",
    naam: "Overslaan en vastleggen",
    uitleg:
      "De instructie wordt overgeslagen en vastgelegd; een functie levert een lege waarde, een object een plaatsvervanger. De rest van de code loopt door.",
  },
];

export const SOORT_NAAM: Record<AfhankelijkheidSoort, string> = {
  bibliotheek: "Bibliotheek",
  declare: "Windows-API (Declare)",
  createobject: "COM-object",
  bestand: "Bestand",
  proces: "Proces starten (Shell)",
  toetsenbord: "Toetsenbord (SendKeys)",
  omgeving: "Omgeving (Environ)",
  register: "Register",
  pad: "Pad",
  "gekoppelde-tabel": "Gekoppelde tabel",
  "externe-database": "Externe database (OpenDatabase)",
  hyperlink: "Hyperlink",
  export: "Export",
  onbekend: "Onbekende naam",
  syntaxis: "Syntaxisfout",
};

// ---------------------------------------------------------------- paden

/**
 * Kort een pad af tot de bestandsnaam, zodat een gebruikersnaam in het pad
 * (C:\Users\naam\…) niet in beeld staat. Het volledige pad gaat naar de tooltip.
 */
export function verkortPad(pad: string | undefined | null): { kort: string; volledig: string } | null {
  if (!pad) return null;
  const schoon = pad.trim().replace(/\0+$/, "");
  if (!schoon) return null;
  const delen = schoon.split(/[\\/]+/).filter(Boolean);
  const kort = delen[delen.length - 1] ?? schoon;
  return { kort, volledig: schoon };
}

// ---------------------------------------------------------------- ketens

/** `Module.Proc` → `Proc` (de module staat elders al). */
function procNaam(sleutel: string): string {
  const i = sleutel.lastIndexOf(".");
  return i >= 0 ? sleutel.slice(i + 1) : sleutel;
}

/** “Knop_Click → Exporteer → CreateObject(Excel.Application)”. */
export function ketenTekst(reden: Pick<ProcedureReden, "keten" | "oorzaak">, metModule = false): string {
  const stappen = reden.keten.map((s) => (metModule ? s : procNaam(s)));
  return [...stappen, reden.oorzaak].join(" → ");
}

// ---------------------------------------------------------------- groeperen

export type Groep = "bibliotheek" | "windows-api" | "com" | "bestanden" | "gekoppeld" | "overig";

export function groepVan(soort: AfhankelijkheidSoort): Groep {
  switch (soort) {
    case "bibliotheek":
      return "bibliotheek";
    case "declare":
      return "windows-api";
    case "createobject":
      return "com";
    case "bestand":
    case "pad":
      return "bestanden";
    case "gekoppelde-tabel":
      return "gekoppeld";
    default:
      return "overig";
  }
}

export interface Plek {
  module: string;
  procedure?: string;
  regel: number;
  omzeilbaar: boolean;
  foutnummer?: number;
}

export interface AfhankelijkheidRij {
  sleutel: string;
  soort: AfhankelijkheidSoort;
  naam: string;
  bibliotheek?: string;
  /** Slechtste status over alle plekken. */
  status: Beschikbaarheid;
  plekken: Plek[];
  /** Procedures (`Module.Proc`), uniek. */
  procedures: string[];
}

const ERNST: Record<Beschikbaarheid, number> = { ingebouwd: 0, deels: 1, ontbreekt: 2 };

/** Voegt afhankelijkheden met dezelfde soort, naam en bibliotheek samen; gesorteerd op status en naam. */
export function groepeerAfhankelijkheden(lijst: Afhankelijkheid[]): Record<Groep, AfhankelijkheidRij[]> {
  const uit: Record<Groep, AfhankelijkheidRij[]> = { bibliotheek: [], "windows-api": [], com: [], bestanden: [], gekoppeld: [], overig: [] };
  const index = new Map<string, AfhankelijkheidRij>();
  for (const a of lijst) {
    const sleutel = `${a.soort}|${a.naam.toLowerCase()}|${(a.bibliotheek ?? "").toLowerCase()}`;
    let rij = index.get(sleutel);
    if (!rij) {
      rij = { sleutel, soort: a.soort, naam: a.naam, bibliotheek: a.bibliotheek, status: a.status, plekken: [], procedures: [] };
      index.set(sleutel, rij);
      uit[groepVan(a.soort)].push(rij);
    }
    if (ERNST[a.status] > ERNST[rij.status]) rij.status = a.status;
    rij.plekken.push({
      module: a.module,
      ...(a.procedure ? { procedure: a.procedure } : {}),
      regel: a.regel,
      omzeilbaar: a.omzeilbaar,
      ...(a.foutnummer !== undefined ? { foutnummer: a.foutnummer } : {}),
    });
    const proc = a.procedure ? `${a.module}.${a.procedure}` : a.module;
    if (!rij.procedures.includes(proc)) rij.procedures.push(proc);
  }
  for (const groep of Object.values(uit)) {
    groep.sort((a, b) => ERNST[b.status] - ERNST[a.status] || a.naam.localeCompare(b.naam, "nl"));
    for (const r of groep) r.plekken.sort((a, b) => a.module.localeCompare(b.module, "nl") || a.regel - b.regel);
  }
  return uit;
}

// ---------------------------------------------------------------- overzicht

/** Belangrijkste oorzaken, aflopend op aantal procedures. */
export function belangrijksteOorzaken(analyse: Pick<ExterneAnalyse, "samenvatting">, aantal = 6): { oorzaak: string; procedures: number }[] {
  return Object.entries(analyse.samenvatting.perOorzaak)
    .map(([oorzaak, procedures]) => ({ oorzaak, procedures }))
    .filter((o) => o.procedures > 0)
    .sort((a, b) => b.procedures - a.procedures || a.oorzaak.localeCompare(b.oorzaak, "nl"))
    .slice(0, aantal);
}

// ---------------------------------------------------------------- procedures

export interface ProcedureFilter {
  status: ProcedureStatus | "alle";
  module: string | "alle";
  zoek: string;
}

export function filterProcedures(lijst: ProcedureAnalyse[], f: ProcedureFilter): ProcedureAnalyse[] {
  const zoek = f.zoek.trim().toLowerCase();
  return lijst.filter(
    (p) =>
      (f.status === "alle" || p.status === f.status) &&
      (f.module === "alle" || p.module === f.module) &&
      (!zoek ||
        p.sleutel.toLowerCase().includes(zoek) ||
        p.redenen.some((r) => r.oorzaak.toLowerCase().includes(zoek) || (r.bibliotheek ?? "").toLowerCase().includes(zoek))),
  );
}

/** Kan deze procedure los worden uitgevoerd (publieke parameterloze Sub/Function in een standaardmodule)? */
export function losUitvoerbaar(p: ProcedureAnalyse): boolean {
  return p.moduleSoort === "module" && (p.soort === "sub" || p.soort === "function") && p.publiek && p.zonderVerplichteParameters && !p.gebeurtenis;
}

/**
 * Splitst de procedures in kandidaten voor “Uitvoeren wat werkt” en
 * procedures die niet worden uitgevoerd (met reden), zoals `voerUitWatWerkt`
 * dat doet. Formulier- en rapportmodules vallen af: er is tijdens een reeks
 * geen geopend formulier.
 */
export function verdeelKandidaten(lijst: ProcedureAnalyse[], metDeels: boolean) {
  const kandidaten: ProcedureAnalyse[] = [];
  const nietUitgevoerd: WatWerktSamenvatting["nietUitgevoerd"] = [];
  for (const p of lijst) {
    const reden =
      p.soort !== "sub" && p.soort !== "function"
        ? "eigenschapsprocedure"
        : p.moduleSoort === "klasse"
          ? "klassenmodule (vraagt een instantie)"
          : p.gebeurtenis
            ? "gebeurtenisprocedure"
            : p.moduleSoort === "formulier"
              ? "formulier- of rapportmodule (vraagt een geopend formulier)"
              : !p.publiek
                ? "niet publiek"
                : !p.zonderVerplichteParameters
                  ? "heeft verplichte parameters"
                  : p.status === "niet" || (p.status === "deels" && !metDeels)
                    ? `status ${STATUS_PROCEDURE[p.status].tekst.toLowerCase()}`
                    : null;
    if (reden) nietUitgevoerd.push({ module: p.module, procedure: p.naam, reden });
    else kandidaten.push(p);
  }
  return { kandidaten, nietUitgevoerd };
}

// ---------------------------------------------------------------- gekoppelde tabellen

/** Gekoppelde tabellen uit de alleen-lezen-analyse: alleen naam en soort bron, nooit een verbindingsreeks. */
export function gekoppeldeTabellenUit(objecten: DatabaseObject[], inWerkkopie: string[] = []): GekoppeldeTabelInvoer[] {
  const aanwezig = new Set(inWerkkopie.map((n) => n.toLowerCase()));
  return objecten
    .filter((o) => o.soort === "Gekoppelde tabel")
    .map((o) => ({
      naam: o.naam,
      bron: o.eigenschappen?.find(([k]) => k === "Soort")?.[1] ?? "Gekoppelde tabel",
      inWerkkopie: aanwezig.has(o.naam.toLowerCase()),
    }));
}

// ---------------------------------------------------------------- resultaat

export interface Resultaatregel {
  module: string;
  procedure: string;
  status: UitvoeringStatus | "niet-uitgevoerd";
  uitvoering?: Uitvoering;
  reden?: string;
  /** Modus en proefmodus van deze uitvoering (losse uitvoeringen kunnen afwijken van de reeks). */
  ontbrekend?: OntbrekendModus;
  teruggedraaid?: boolean;
}

/** Naam van een oorzaak uit `samenvatting.perOorzaak` (soort of bibliotheek). */
export function oorzaakNaam(oorzaak: string): string {
  return (SOORT_NAAM as Record<string, string>)[oorzaak] ?? oorzaak;
}

/** Leesbare fouttekst: “Fout 429: ActiveX-onderdeel kan geen object maken (Module1, regel 12)”. */
export function uitvoeringFoutTekst(u: Uitvoering): string {
  const f = u.fout;
  if (!f) return "";
  const waar = [f.module, f.regel ? `regel ${f.regel}` : ""].filter(Boolean).join(", ");
  return `${f.nummer ? `Fout ${f.nummer}: ` : ""}${f.omschrijving.trim()}${waar ? ` (${waar})` : ""}`;
}

export function telResultaat(regels: Resultaatregel[]) {
  const tel = (s: Resultaatregel["status"]) => regels.filter((r) => r.status === s).length;
  return {
    geslaagd: tel("geslaagd"),
    fout: tel("fout"),
    tijdslimiet: tel("tijdslimiet"),
    gestopt: tel("gestopt"),
    nietUitgevoerd: tel("niet-uitgevoerd"),
    metOvergeslagen: regels.filter((r) => r.uitvoering?.overgeslagen.length).length,
  };
}

export interface ResultaatExport {
  database: string;
  datum: string;
  opties: { ontbrekend: OntbrekendModus; metDeels: boolean; terugdraaien: boolean; dialogenAutomatisch: boolean };
  teruggedraaid: boolean;
  regels: Resultaatregel[];
}

/** JSON-export: status, fouten, overgeslagen onderdelen en uitvoer — geen broncode. */
export function resultaatAlsJson(r: ResultaatExport): string {
  return JSON.stringify(
    {
      database: r.database,
      datum: r.datum,
      opties: r.opties,
      teruggedraaid: r.teruggedraaid,
      totalen: telResultaat(r.regels),
      procedures: r.regels.map((x) => ({
        module: x.module,
        procedure: x.procedure,
        status: x.status,
        ...(x.reden ? { reden: x.reden } : {}),
        ...(x.ontbrekend ? { ontbrekend: x.ontbrekend } : {}),
        ...(x.teruggedraaid !== undefined ? { teruggedraaid: x.teruggedraaid } : {}),
        ...(x.uitvoering
          ? {
              duurMs: x.uitvoering.duurMs,
              ...(x.uitvoering.stappen !== undefined ? { stappen: x.uitvoering.stappen } : {}),
              ...(x.uitvoering.fout ? { fout: x.uitvoering.fout } : {}),
              overgeslagen: x.uitvoering.overgeslagen,
              uitvoer: x.uitvoering.uitvoer,
              hostgebeurtenissen: x.uitvoering.hostgebeurtenissen,
            }
          : {}),
      })),
    },
    null,
    2,
  );
}

export function resultaatAlsCsv(r: ResultaatExport): string {
  const kolommen = ["Module", "Procedure", "Status", "Foutnummer", "Omschrijving", "Regel", "Duur (ms)", "Overgeslagen", "Overgeslagen onderdelen", "Debug.Print", "Hostgebeurtenissen"];
  const rijen = r.regels.map((x) => {
    const u = x.uitvoering;
    return [
      x.module,
      x.procedure,
      STATUS_UITVOERING[x.status].tekst,
      u?.fout?.nummer !== undefined ? String(u.fout.nummer) : "",
      u?.fout ? u.fout.omschrijving.trim() : (x.reden ?? ""),
      u?.fout?.regel !== undefined ? String(u.fout.regel) : "",
      u ? String(u.duurMs) : "",
      u ? String(u.overgeslagen.reduce((s, o) => s + o.aantal, 0)) : "",
      u ? u.overgeslagen.map((o) => o.melding).join(" | ") : "",
      u ? u.uitvoer.join(" | ") : "",
      u ? u.hostgebeurtenissen.map(hostgebeurtenisTekst).join(" | ") : "",
    ];
  });
  return csv(kolommen, rijen);
}

export function hostgebeurtenisTekst(h: Uitvoering["hostgebeurtenissen"][number]): string {
  const naam = h.soort === "msgBox" ? "MsgBox" : h.soort === "inputBox" ? "InputBox" : h.soort === "formulier" ? `Formulier.${h.naam ?? "?"}` : `DoCmd.${h.naam ?? "?"}`;
  return h.doel ? `${naam} (${h.doel})` : naam;
}

/** Duur leesbaar: “120 ms”, “2,4 s”. */
export function duurTekst(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} s`;
}
