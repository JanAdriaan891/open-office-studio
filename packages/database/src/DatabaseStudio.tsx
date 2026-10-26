import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  ClipboardList,
  Code2,
  Database,
  Download,
  FileCode2,
  FileJson,
  FilePlus2,
  FileText,
  FolderOpen,
  Hammer,
  LayoutTemplate,
  Link2,
  ListTree,
  Moon,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Square,
  Sun,
  Table2,
  TableProperties,
  Terminal,
  X,
  type LucideIcon,
} from "lucide-react";
import { rapportAlsTekst, VERSLEUTELD_MELDING, type DatabaseObject, type DatabaseSession, type Objectsoort } from "./model";
import { DatabaseClient, DatabaseFout, WerkkopieClient } from "./database-client";
import { Ribbon, Groep, Actie } from "../../../src/Ribbon";
import { past } from "../../../src/lint/sneltoetsen";
import { downloadDatabaseUitvoer, type DatabaseUitvoer } from "./uitvoer";
import { VREEMDE_SQLITE, type OpgeslagenQuery, type Ontwerp, type RelatieSchema, type TabelSchema, type Veldsoort, type Waarde } from "./werkkopie/contract";
import { modulesUitAnalyse as analyseModules } from "./werkkopie/modules";
import type { Voortgang } from "./werkkopie/opbouw";
import { DialoogBron, useDialogen } from "./ui/Dialoog";
import type { WerkkopieSessie } from "./ui/werkkopie-sessie";
import { TabelWeergave } from "./ui/TabelWeergave";
import { NieuweTabel, TabelOntwerp } from "./ui/TabelOntwerp";
import { QueryEditor, type QueryUitvoer } from "./ui/QueryEditor";
import { Formulier } from "./ui/Formulier";
import { FormulierOntwerper } from "./ui/FormulierOntwerper";
import { RapportOntwerper, RapportVoorbeeld } from "./ui/Rapport";
import { VbaPaneel, VbaUitvoer } from "./ui/VbaPaneel";
import { CompatibiliteitWeergave, OpbouwRapportWeergave, OpbouwVoortgang } from "./ui/Overzichten";
import { RelatieVenster } from "./ui/Relaties";
import { AlleenLezenObject } from "./ui/AlleenLezen";
import { Foutgrens } from "./ui/Foutgrens";
import { useVba } from "./ui/useVba";
import { controleerModulenaam, moduleSoort, moduleUitRecord, nieuweModuleBron, type VbaModule } from "./ui/vba-sessie";
import { automatischFormulier, leesFormulierDefinitie } from "./ui/formulier-logica";
import { leegRapport, leesRapportDefinitie, type RapportDefinitie } from "./ui/rapport-logica";
import { kolommenVan } from "./ui/bron";
import { leesbareFout } from "./ui/invoer";
import { ACTIENAMEN, veiligeNaam } from "./ui/sql";
import { csvUitWaarden, downloadBinair, type DatabaseBinaireUitvoer } from "./ui/export";
import { vulVoorbeeld, VOORBEELD_MODULES } from "./ui/voorbeeld";

export type { DatabaseBinaireUitvoer } from "./ui/export";

type Weergave =
  | { soort: "welkom" }
  | { soort: "tabel"; naam: string; modus: "gegevens" | "ontwerp" }
  | { soort: "nieuwe-tabel" }
  | { soort: "query"; naam: string | null; sql?: string; nr: number }
  | { soort: "formulier"; naam: string; metVba: boolean; nr: number }
  | { soort: "formulier-ontwerp"; naam: string | null; bron?: string; nr: number }
  | { soort: "rapport"; naam: string; bron: string; definitie: RapportDefinitie; nr: number }
  | { soort: "rapport-ontwerp"; naam: string | null; bron?: string; nr: number }
  | { soort: "vba"; module: string }
  | { soort: "relaties" }
  | { soort: "compat" }
  | { soort: "opbouw" }
  | { soort: "analyse"; id: string };

interface Objecten {
  tabellen: TabelSchema[];
  querys: OpgeslagenQuery[];
  ontwerpen: Ontwerp[];
  relaties: RelatieSchema[];
}
const LEEG: Objecten = { tabellen: [], querys: [], ontwerpen: [], relaties: [] };

const MEERVOUD: Record<Objectsoort, string> = {
  Tabel: "Tabellen",
  "Gekoppelde tabel": "Gekoppelde tabellen",
  Query: "Query’s",
  Relatie: "Relaties",
  VBA: "VBA-modules",
  Formulier: "Formulieren",
  Rapport: "Rapporten",
  Macro: "Macro’s",
};

const VERSLEUTELD = /versleuteld|wachtwoord|encrypt|password/i;

/** Werkruimte voor Access-databases: werkkopie, query’s, formulieren, rapporten en VBA. */
export function DatabaseStudio(props: {
  bestandsmenu?: () => void;
  inactief?: boolean;
  registreerOpenen?: (openen: (() => void) | null) => void;
  bewaarUitvoer?: DatabaseUitvoer;
  /** Binaire export (SQLite-werkkopie); standaard een browserdownload. */
  bewaarBinair?: DatabaseBinaireUitvoer;
  /** Meldt of de werkkopie niet-opgeslagen wijzigingen heeft (voor sluitbeveiliging van de host). */
  gewijzigd?: (waarde: boolean) => void;
} = {}) {
  const [donker, setDonker] = useState(false);
  return (
    <div className="database-app" data-theme={donker ? "dark" : "light"} inert={props.inactief}>
      <DialoogBron>
        <Werkruimte {...props} donker={donker} setDonker={setDonker} />
      </DialoogBron>
    </div>
  );
}

function Werkruimte({
  bestandsmenu,
  registreerOpenen,
  bewaarUitvoer = downloadDatabaseUitvoer,
  bewaarBinair = downloadBinair,
  gewijzigd: meldGewijzigd,
  donker,
  setDonker,
}: {
  bestandsmenu?: () => void;
  registreerOpenen?: (openen: (() => void) | null) => void;
  bewaarUitvoer?: DatabaseUitvoer;
  bewaarBinair?: DatabaseBinaireUitvoer;
  gewijzigd?: (waarde: boolean) => void;
  donker: boolean;
  setDonker: (d: boolean) => void;
}) {
  const dialogen = useDialogen();
  const [analyse, setAnalyse] = useState<DatabaseSession | null>(null);
  const [sessie, setSessie] = useState<WerkkopieSessie | null>(null);
  const [objecten, setObjecten] = useState<Objecten>(LEEG);
  const [modules, setModules] = useState<VbaModule[]>([]);
  const [weergave, setWeergave] = useState<Weergave>({ soort: "welkom" });
  const [opbouw, setOpbouw] = useState<{ naam: string; voortgang: Voortgang | null; klaar: number; afbreken: AbortController } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState("");
  const [gewijzigd, setGewijzigd] = useState(false);
  const [queryUitvoer, setQueryUitvoer] = useState<QueryUitvoer | null>(null);
  const invoer = useRef<HTMLInputElement>(null);
  const lezer = useRef<DatabaseClient | null>(null);
  const actief = useRef(true);
  const teller = useRef(1);
  const queryUitvoeren = useRef<(() => void) | null>(null);
  const bronBestand = useRef<File | null>(null);
  const werkkopie = sessie?.werkkopie ?? null;
  useEffect(() => {
    meldGewijzigd?.(!!werkkopie && gewijzigd);
  }, [meldGewijzigd, werkkopie, gewijzigd]);
  useEffect(() => () => meldGewijzigd?.(false), [meldGewijzigd]);

  // ---------------------------------------------------------------- VBA
  const toon = (w: Weergave) => setWeergave(w);
  const vba = useVba(werkkopie, modules, dialogen, {
    openFormulier: (naam) => openFormulier(naam, true),
    openRapport: (naam) => void openRapport(naam),
    openQuery: (naam) => {
      const q = objecten.querys.find((x) => x.naam.toLowerCase() === naam.toLowerCase());
      if (!q) throw new Error(`Query ‘${naam}’ bestaat niet.`);
      toon({ soort: "query", naam: q.naam, nr: teller.current++ });
    },
    openTabel: (naam) => {
      const t = objecten.tabellen.find((x) => x.naam.toLowerCase() === naam.toLowerCase());
      if (!t) throw new Error(`Tabel ‘${naam}’ bestaat niet.`);
      toon({ soort: "tabel", naam: t.naam, modus: "gegevens" });
    },
    sluit: (soort, naam) =>
      setWeergave((w) =>
        (w.soort === "formulier" && soort !== "rapport" && (!naam || w.naam.toLowerCase() === naam.toLowerCase())) ||
        (w.soort === "rapport" && soort !== "formulier" && (!naam || w.naam.toLowerCase() === naam.toLowerCase()))
          ? { soort: "welkom" }
          : w,
      ),
  });

  // ---------------------------------------------------------------- levenscyclus
  useEffect(() => {
    actief.current = true;
    return () => {
      actief.current = false;
      lezer.current?.sluit();
    };
  }, []);
  useEffect(() => () => void sessie?.werkkopie.sluit().catch(() => undefined), [sessie]);
  useEffect(() => {
    registreerOpenen?.(bezig || opbouw ? null : () => invoer.current?.click());
    return () => registreerOpenen?.(null);
  }, [registreerOpenen, bezig, opbouw]);

  const vernieuw = useCallback(async () => {
    if (!werkkopie) return setObjecten(LEEG);
    try {
      const [tabellen, querys, ontwerpen, relaties, opgeslagenModules, isGewijzigd] = await Promise.all([
        werkkopie.tabellen(),
        werkkopie.querys(),
        werkkopie.ontwerpen(),
        werkkopie.relaties(),
        werkkopie.modules(),
        werkkopie.gewijzigd(),
      ]);
      if (!actief.current) return;
      setObjecten({ tabellen, querys, ontwerpen, relaties });
      // VBA-modules komen uit de werkkopie (_openaec_modules); gelijke inhoud niet vervangen (geen onnodig herladen).
      const nieuw = opgeslagenModules.map(moduleUitRecord);
      setModules((oud) => (JSON.stringify(oud) === JSON.stringify(nieuw) ? oud : nieuw));
      setGewijzigd(isGewijzigd || sessie?.herkomst === "nieuw");
    } catch (e) {
      if (actief.current) setFout("De objectenlijst kon niet worden gelezen: " + leesbareFout(e));
    }
  }, [werkkopie, sessie?.herkomst]);
  useEffect(() => {
    void vernieuw();
  }, [vernieuw]);

  // ---------------------------------------------------------------- openen en sluiten
  async function magVervangen(): Promise<boolean> {
    if (!werkkopie || !gewijzigd) return true;
    return dialogen.bevestig({
      titel: "Werkkopie niet opgeslagen",
      tekst: "De huidige werkkopie heeft wijzigingen die niet als .sqlite zijn bewaard. Die gaan verloren. Doorgaan?",
      ja: "Doorgaan zonder opslaan",
      nee: "Annuleren",
      gevaarlijk: true,
    });
  }

  function reset() {
    lezer.current?.sluit();
    lezer.current = null;
    setAnalyse(null);
    setSessie(null);
    setObjecten(LEEG);
    setModules([]);
    setWeergave({ soort: "welkom" });
    setFout("");
    setMelding("");
    setGewijzigd(false);
    setQueryUitvoer(null);
    bronBestand.current = null;
  }

  async function sluitDatabase() {
    if (!(await magVervangen())) return;
    reset();
  }

  function modulesUitAnalyse(a: DatabaseSession): VbaModule[] {
    return analyseModules(a.objecten).map((m) => ({ ...m, herkomst: "access" as const, gewijzigd: null }));
  }

  /** Heropent een .sqlite; een SQLite-bestand dat geen werkkopie is alleen na bevestiging. */
  async function laadSqlite(bestand: File) {
    try {
      return await WerkkopieClient.laad(bestand);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith(VREEMDE_SQLITE)) throw e;
      const ja = await dialogen.bevestig({
        titel: "Geen werkkopie van Open Database Studio",
        tekst: `‘${bestand.name}’ is een SQLite-bestand, maar niet door Open Database Studio gemaakt. Toch openen als nieuwe werkkopie? De metatabellen worden dan toegevoegd (pas in het bestand na opslaan); het bestand zelf wordt niet gewijzigd.`,
        ja: "Toch openen",
        standaardNee: true,
      });
      if (!ja) return null;
      return WerkkopieClient.laad(bestand, { vreemdeSqlite: true });
    }
  }

  async function openBestand(bestand: File) {
    if (!(await magVervangen())) return;
    reset();
    setBezig(true);
    try {
      if (/\.(sqlite|sqlite3|db)$/i.test(bestand.name)) {
        const w = await laadSqlite(bestand);
        if (!w) return;
        if (!actief.current) return void w.annuleer();
        setSessie({ werkkopie: w, herkomst: "sqlite", naam: bestand.name });
        setMelding([`Werkkopie ‘${bestand.name}’ heropend (bron: ${w.bron.naam}).`, ...w.meldingen].join(" "));
        if (w.rapport) setWeergave({ soort: "opbouw" });
        return;
      }
      // 1. Alleen-lezen-analyse: objecten, VBA-bron en het compatibiliteitsrapport.
      const client = new DatabaseClient();
      let a: DatabaseSession;
      try {
        a = await client.open(bestand);
      } catch (e) {
        client.sluit();
        if (e instanceof DatabaseFout && e.code === "versleuteld") {
          if (e.rapport)
            setAnalyse({ naam: bestand.name, grootte: bestand.size, voorbeeld: false, objecten: [], rapport: e.rapport, melding: e.message });
          setFout(e.message);
          if (e.rapport) setWeergave({ soort: "compat" });
          return;
        }
        throw e;
      }
      if (!actief.current) return void client.sluit();
      lezer.current = client;
      setAnalyse(a);
      setModules(modulesUitAnalyse(a));
      setBezig(false);
      // 2. Werkkopie opbouwen, met voortgang en annuleren; de VBA-bron uit de analyse gaat mee naar _openaec_modules.
      bronBestand.current = bestand;
      await bouwWerkkopie(bestand, a);
    } catch (e) {
      if (actief.current) setFout(e instanceof Error ? e.message : "Bestand kon niet worden gelezen.");
    } finally {
      if (actief.current) setBezig(false);
    }
  }

  /** Bouwt de werkkopie uit het origineel (ook opnieuw na annuleren). */
  async function bouwWerkkopie(bestand: File, a: DatabaseSession | null = analyse) {
    setFout("");
    const afbreken = new AbortController();
    setOpbouw({ naam: bestand.name, voortgang: null, klaar: 0, afbreken });
    try {
      const w = await WerkkopieClient.open(bestand, {
        modules: a ? analyseModules(a.objecten) : undefined,
        signal: afbreken.signal,
        voortgang: (v) =>
          setOpbouw((o) =>
            o ? { ...o, voortgang: v, klaar: o.klaar + (o.voortgang?.fase === "tabel" && o.voortgang.tabel !== v.tabel ? 1 : 0) } : o,
          ),
      });
      if (!actief.current) return void w.annuleer();
      setSessie({ werkkopie: w, herkomst: "access", naam: bestand.name });
      setWeergave({ soort: "welkom" });
      const overgeslagen = w.rapport?.tabellen.reduce((s, t) => s + t.overgeslagen, 0) ?? 0;
      const fouten = w.rapport?.meldingen.filter((m) => m.ernst !== "info").length ?? 0;
      setMelding(
        `Werkkopie opgebouwd: ${w.rapport?.tabellen.length ?? 0} tabellen, ${w.rapport?.querys.opgeslagen ?? 0} query’s` +
          (overgeslagen || fouten ? ` · ${overgeslagen} rijen overgeslagen, ${fouten} meldingen (zie opbouwrapport)` : "") +
          ".",
      );
    } catch (e) {
      if (!actief.current) return;
      const tekst = leesbareFout(e);
      setFout(
        afbreken.signal.aborted
          ? "De opbouw van de werkkopie is geannuleerd. Je bekijkt de database nu alleen-lezen."
          : VERSLEUTELD.test(tekst)
            ? VERSLEUTELD_MELDING + " Je bekijkt alleen wat zonder ontsleutelen leesbaar is."
            : `De werkkopie kon niet worden opgebouwd: ${tekst} Je bekijkt de database nu alleen-lezen.`,
      );
    } finally {
      if (actief.current) setOpbouw(null);
    }
  }

  async function nieuweDatabase(voorbeeld = false) {
    if (!(await magVervangen())) return;
    let naam = "Voorbeelddatabase";
    if (!voorbeeld) {
      const gekozen = await dialogen.vraag({
        titel: "Nieuwe lege database",
        label: "Naam van de database",
        standaard: "Nieuwe database",
        controleer: (w) => (w.trim() ? null : "Geef een naam."),
      });
      if (!gekozen) return;
      naam = gekozen.trim();
    }
    reset();
    setBezig(true);
    try {
      const w = await WerkkopieClient.nieuw(naam);
      if (voorbeeld) {
        await vulVoorbeeld(w);
        for (const m of VOORBEELD_MODULES) await w.bewaarModule(m);
      }
      if (!actief.current) return void w.annuleer();
      setSessie({ werkkopie: w, herkomst: voorbeeld ? "voorbeeld" : "nieuw", naam });
      if (voorbeeld) {
        setMelding("Demonstratie met ingebouwde voorbeeldgegevens. Dit zijn geen gegevens uit een geopend databasebestand.");
        setWeergave({ soort: "tabel", naam: "Materialen", modus: "gegevens" });
      } else {
        setMelding(`Nieuwe lege database ‘${naam}’. Maak een tabel via Maken › Tabel en bewaar het geheel via Start › Opslaan (.sqlite).`);
        setWeergave({ soort: "nieuwe-tabel" });
      }
    } catch (e) {
      setFout("De database kon niet worden gemaakt: " + leesbareFout(e));
    } finally {
      if (actief.current) setBezig(false);
    }
  }

  // ---------------------------------------------------------------- export
  async function meld<T extends { status: string; pad?: string }>(p: Promise<T>, wat: string) {
    setFout("");
    try {
      const r = await p;
      setMelding(
        r.status === "opgeslagen" ? `${wat} opgeslagen: ${r.pad}` : r.status === "geannuleerd" ? "Exporteren geannuleerd." : `${wat}: download aangevraagd. Controleer je downloads.`,
      );
      return r.status !== "geannuleerd";
    } catch (e) {
      setFout("Exporteren mislukt: " + (e instanceof Error ? e.message : String(e)));
      return false;
    }
  }
  const bewaarTekst = (naam: string, inhoud: string, type: string, wat = "Export") =>
    meld(bewaarUitvoer(veiligeNaam(naam), inhoud, type), wat);
  const exporteerCsv = (naam: string, kolommen: string[], rijen: Waarde[][], soorten: (Veldsoort | null)[] = []) =>
    bewaarTekst(`${naam}.csv`, csvUitWaarden(kolommen, rijen, soorten), "text/csv;charset=utf-8", "CSV");

  async function exporteerTabel(naam: string) {
    if (!werkkopie) return;
    try {
      const t = objecten.tabellen.find((x) => x.naam === naam);
      const r = await werkkopie.query(`SELECT * FROM [${naam}]`, { limiet: 1_000_000 });
      await exporteerCsv(naam, r.kolommen, r.rijen, r.kolommen.map((k) => t?.velden.find((v) => v.naam === k)?.soort ?? null));
    } catch (e) {
      setFout("Exporteren mislukt: " + leesbareFout(e));
    }
  }

  async function bewaarWerkkopie() {
    if (!werkkopie) return;
    try {
      const bytes = await werkkopie.exporteer();
      const basis = (sessie?.naam ?? "werkkopie").replace(/\.(mdb|accdb|sqlite|sqlite3|db)$/i, "");
      if (await meld(bewaarBinair(veiligeNaam(`${basis}.sqlite`), bytes, "application/vnd.sqlite3"), "Werkkopie (SQLite)")) setGewijzigd(false);
    } catch (e) {
      setFout("De werkkopie kon niet worden bewaard: " + leesbareFout(e));
    }
  }

  function exporteerHuidig() {
    if (weergave.soort === "tabel") return void exporteerTabel(weergave.naam);
    if (weergave.soort === "query" && queryUitvoer)
      return void exporteerCsv(queryUitvoer.titel, queryUitvoer.resultaat.kolommen, queryUitvoer.resultaat.rijen, queryUitvoer.resultaat.kolomsoorten ?? []);
  }
  const csvMogelijk = (weergave.soort === "tabel" && !!werkkopie) || (weergave.soort === "query" && !!queryUitvoer);

  function exporteerCompat(soort: "json" | "txt") {
    const r = analyse?.rapport;
    if (!r) return;
    const basis = r.bestand.replace(/\.[^.]+$/, "");
    void bewaarTekst(
      `${basis}-compatibiliteit.${soort}`,
      soort === "json" ? JSON.stringify(r, null, 2) : rapportAlsTekst(r),
      soort === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
      "Compatibiliteitsrapport",
    );
  }
  function exporteerOpbouw() {
    const r = werkkopie?.rapport;
    if (!r) return;
    void bewaarTekst(`${r.bron.replace(/\.[^.]+$/, "")}-opbouwrapport.json`, JSON.stringify(r, null, 2), "application/json;charset=utf-8", "Opbouwrapport");
  }
  function exporteerBron() {
    if (weergave.soort === "vba") {
      const m = modules.find((x) => x.naam === weergave.module);
      if (m) void bewaarTekst(`${m.naam}.bas`, m.bron.replace(/\r?\n/g, "\r\n"), "text/plain;charset=utf-8", "VBA-bron");
    } else if (weergave.soort === "query" && weergave.naam) {
      const q = objecten.querys.find((x) => x.naam === weergave.naam);
      if (q) void bewaarTekst(`${q.naam}.sql`, q.sql, "text/plain;charset=utf-8", "SQL");
    }
  }

  // ---------------------------------------------------------------- formulieren en rapporten
  const formModule = (naam: string) => modules.find((m) => m.naam.toLowerCase() === `form_${naam}`.toLowerCase()) ?? null;

  async function openFormulier(naam: string, vanuitVba = false) {
    const zoek = (lijst: Ontwerp[]) => lijst.find((x) => x.soort === "formulier" && x.naam.toLowerCase() === naam.toLowerCase());
    // Net opgeslagen ontwerpen staan mogelijk nog niet in de (vernieuwde) objectenlijst.
    const o = zoek(objecten.ontwerpen) ?? (werkkopie ? zoek(await werkkopie.ontwerpen()) : undefined);
    if (!o) {
      const access = analyse?.objecten.some((x) => x.soort === "Formulier" && x.naam.toLowerCase() === naam.toLowerCase());
      const tekst = access
        ? `Formulier ‘${naam}’ bestaat in het Access-origineel, maar Access-formulierontwerpen zijn niet leesbaar. Maak een formulier met dezelfde naam via Maken › Formulierontwerp; dan wordt de VBA-module Form_${naam} eraan gekoppeld.`
        : `Formulier ‘${naam}’ bestaat niet in de werkkopie.`;
      if (vanuitVba) throw new Error(tekst);
      setFout(tekst);
      return;
    }
    const module = formModule(o.naam);
    let metVba = false;
    if (module) metVba = vanuitVba || (await vba.vraagToestemming(`Formulier ‘${o.naam}’ heeft VBA-code (module ${module.naam}). Gebeurtenissen zoals Form_Load en knopklikken uitvoeren?`));
    setFout("");
    setWeergave({ soort: "formulier", naam: o.naam, metVba, nr: teller.current++ });
  }

  function openRapport(naam: string) {
    const o = objecten.ontwerpen.find((x) => x.soort === "rapport" && x.naam.toLowerCase() === naam.toLowerCase());
    if (!o) throw new Error(`Rapport ‘${naam}’ bestaat niet in de werkkopie (Access-rapportontwerpen zijn niet leesbaar).`);
    setWeergave({ soort: "rapport", naam: o.naam, bron: o.bron, definitie: leesRapportDefinitie(o.definitie, o.naam), nr: teller.current++ });
  }

  /** Huidige tabel of query, als bron voor Maken › Formulier/Rapport. */
  const huidigeBron =
    weergave.soort === "tabel" ? weergave.naam : weergave.soort === "query" && weergave.naam ? weergave.naam : (objecten.tabellen[0]?.naam ?? "");

  async function automatischFormulierMaken() {
    if (!werkkopie || !huidigeBron) return;
    try {
      const bestaand = new Set(objecten.ontwerpen.filter((o) => o.soort === "formulier").map((o) => o.naam.toLowerCase()));
      let naam = huidigeBron;
      for (let i = 2; bestaand.has(naam.toLowerCase()); i++) naam = `${huidigeBron} ${i}`;
      const kolommen = await kolommenVan(werkkopie, huidigeBron);
      await werkkopie.bewaarOntwerp({ naam, soort: "formulier", bron: huidigeBron, definitie: automatischFormulier(naam, kolommen) });
      await vernieuw();
      setMelding(`Automatisch formulier ‘${naam}’ gemaakt voor ${huidigeBron}.`);
      setWeergave({ soort: "formulier", naam, metVba: false, nr: teller.current++ });
    } catch (e) {
      setFout("Automatisch formulier maken mislukt: " + leesbareFout(e));
    }
  }

  async function nieuweModule() {
    if (!werkkopie) return;
    let vrij = modules.length + 1;
    while (modules.some((m) => m.naam.toLowerCase() === `module${vrij}`)) vrij++;
    const naam = await dialogen.vraag({
      titel: "Nieuwe VBA-module",
      label: "Modulenaam (Form_<formulier> voor een formuliermodule)",
      standaard: `Module${vrij}`,
      controleer: (w) => controleerModulenaam(w, modules.map((m) => m.naam)),
    });
    if (!naam) return;
    const schoon = naam.trim();
    const soort = moduleSoort(schoon);
    try {
      await werkkopie.bewaarModule({ naam: schoon, soort, bron: nieuweModuleBron(schoon, soort) });
      await vernieuw();
      setMelding(`Module ‘${schoon}’ gemaakt in de werkkopie.`);
      setWeergave({ soort: "vba", module: schoon });
    } catch (e) {
      setFout("De module kon niet worden gemaakt: " + leesbareFout(e));
    }
  }

  async function bewaarModule(m: VbaModule, bron: string) {
    if (!werkkopie) return;
    await werkkopie.bewaarModule({ naam: m.naam, soort: m.soort, bron });
    await vernieuw();
    setMelding(`Module ‘${m.naam}’ opgeslagen in de werkkopie.`);
  }

  async function verwijderModule(m: VbaModule) {
    if (!werkkopie) return;
    const ja = await dialogen.bevestig({
      titel: "Module verwijderen",
      tekst: `VBA-module ‘${m.naam}’ uit de werkkopie verwijderen?${m.herkomst === "access" ? " Hij blijft in het Access-origineel staan; na opnieuw opbouwen is hij terug." : ""}`,
      ja: "Verwijderen",
      gevaarlijk: true,
    });
    if (!ja) return;
    try {
      await werkkopie.verwijderModule(m.naam);
      setWeergave({ soort: "welkom" });
      await vernieuw();
      setMelding(`Module ‘${m.naam}’ verwijderd uit de werkkopie.`);
    } catch (e) {
      setFout("De module kon niet worden verwijderd: " + leesbareFout(e));
    }
  }

  /** Na een structuurwijziging (tabelontwerp, relaties): lijst vernieuwen en de uitkomst tonen. */
  async function structuurGewijzigd(tekst: string) {
    await vernieuw();
    setFout("");
    setMelding(tekst);
  }

  // ---------------------------------------------------------------- sneltoetsen
  function toets(e: React.KeyboardEvent) {
    if (e.defaultPrevented || (e.target as HTMLElement).closest("[role='dialog']")) return;
    const n = e.nativeEvent;
    if (weergave.soort === "query" && (past("F5", n) || past("Ctrl+Enter", n))) {
      e.preventDefault();
      queryUitvoeren.current?.();
    } else if (past("Ctrl+S", n) && werkkopie) {
      e.preventDefault();
      void bewaarWerkkopie();
    }
  }
  // Alleen afmelden als de eigen actie nog geregistreerd is (een nieuwe editor kan al aangemeld zijn).
  const registreerQuery = useCallback((a: (() => void) | null, vorige: (() => void) | null) => {
    if (a) queryUitvoeren.current = a;
    else if (queryUitvoeren.current === vorige) queryUitvoeren.current = null;
  }, []);

  // ---------------------------------------------------------------- objectbrowser
  const formulieren = objecten.ontwerpen.filter((o) => o.soort === "formulier");
  const rapporten = objecten.ontwerpen.filter((o) => o.soort === "rapport");
  const accessFormulieren = (analyse?.objecten ?? []).filter(
    (o) => (o.soort === "Formulier" || o.soort === "Rapport" || o.soort === "Macro") && !objecten.ontwerpen.some((x) => x.naam.toLowerCase() === o.naam.toLowerCase()),
  );
  const bronnen = useMemo(() => [...objecten.tabellen.map((t) => t.naam), ...objecten.querys.filter((q) => !["delete", "update", "append", "maketable", "ddl"].includes(q.soort)).map((q) => q.naam)], [objecten]);
  const geselecteerd = (w: Weergave) => JSON.stringify({ ...w, nr: 0, metVba: 0 }) === JSON.stringify({ ...weergave, nr: 0, metVba: 0 });


  const analyseLijst = (soort: Objectsoort) => (analyse?.objecten ?? []).filter((o) => o.soort === soort);

  const objectbrowser = (
    <aside aria-label="Databaseobjecten">
      <h2>Databaseobjecten</h2>
      <p className="bestandsnaam">{sessie?.naam ?? analyse?.naam ?? "Geen database geopend"}</p>
      {werkkopie ? (
        <>
          <Sectie titel="Tabellen" leeg="Nog geen tabellen">
            {objecten.tabellen.map((t) => (
              <ObjectKnop key={t.naam} gekozen={weergave.soort === "tabel" && weergave.naam === t.naam} uit={bezig || !!opbouw} icoon={Table2} naam={t.naam} sub={t.aantal.toLocaleString("nl-NL")} doel={() => toon({ soort: "tabel", naam: t.naam, modus: "gegevens" })} />
            ))}
          </Sectie>
          <Sectie titel="Query’s" leeg="Geen opgeslagen query’s">
            {objecten.querys.filter((q) => !q.naam.startsWith("~")).map((q) => (
              <ObjectKnop key={q.naam} gekozen={weergave.soort === "query" && weergave.naam === q.naam} uit={bezig || !!opbouw} icoon={Braces} naam={q.naam} sub={q.soort === "select" ? undefined : ACTIENAMEN[q.soort]} doel={() => toon({ soort: "query", naam: q.naam, nr: teller.current++ })} />
            ))}
          </Sectie>
          <Sectie titel="Formulieren" leeg="Nog geen formulieren">
            {formulieren.map((f) => (
              <ObjectKnop key={f.naam} gekozen={weergave.soort === "formulier" && weergave.naam === f.naam} uit={bezig || !!opbouw} icoon={LayoutTemplate} naam={f.naam} sub={formModule(f.naam) ? "VBA" : undefined} doel={() => void openFormulier(f.naam)} />
            ))}
            {accessFormulieren
              .filter((o) => o.soort === "Formulier")
              .map((o) => (
                <ObjectKnop key={o.id} gekozen={weergave.soort === "analyse" && weergave.id === o.id} uit={bezig || !!opbouw} icoon={LayoutTemplate} naam={o.naam} sub="Access" doel={() => toon({ soort: "analyse", id: o.id })} />
              ))}
          </Sectie>
          <Sectie titel="Rapporten" leeg="Nog geen rapporten">
            {rapporten.map((r) => (
              <ObjectKnop key={r.naam} gekozen={weergave.soort === "rapport" && weergave.naam === r.naam} uit={bezig || !!opbouw} icoon={FileText} naam={r.naam} doel={() => openRapport(r.naam)} />
            ))}
            {accessFormulieren
              .filter((o) => o.soort === "Rapport")
              .map((o) => (
                <ObjectKnop key={o.id} gekozen={weergave.soort === "analyse" && weergave.id === o.id} uit={bezig || !!opbouw} icoon={FileText} naam={o.naam} sub="Access" doel={() => toon({ soort: "analyse", id: o.id })} />
              ))}
          </Sectie>
          {accessFormulieren.some((o) => o.soort === "Macro") && (
            <Sectie titel="Macro’s">
              {accessFormulieren
                .filter((o) => o.soort === "Macro")
                .map((o) => (
                  <ObjectKnop key={o.id} gekozen={weergave.soort === "analyse" && weergave.id === o.id} uit={bezig || !!opbouw} icoon={ClipboardList} naam={o.naam} sub="niet uitgevoerd" doel={() => toon({ soort: "analyse", id: o.id })} />
                ))}
            </Sectie>
          )}
          <Sectie titel="VBA-modules" leeg={analyse && analyseLijst("VBA").length ? "Geen leesbare VBA-bron" : "Geen modules"}>
            {modules.map((m) => (
              <ObjectKnop key={m.naam} gekozen={geselecteerd({ soort: "vba", module: m.naam })} uit={bezig || !!opbouw} icoon={Code2} naam={m.naam} sub={m.soort === "formulier" ? "formulier" : m.soort === "klasse" ? "klasse" : undefined} doel={() => toon({ soort: "vba", module: m.naam })} />
            ))}
          </Sectie>
          <Sectie titel="Database">
            <ObjectKnop gekozen={geselecteerd({ soort: "relaties" })} uit={bezig || !!opbouw} icoon={Link2} naam={`Relaties (${objecten.relaties.length})`} doel={() => toon({ soort: "relaties" })} />
            {werkkopie.rapport && (
              <ObjectKnop gekozen={geselecteerd({ soort: "opbouw" })} uit={bezig || !!opbouw} icoon={ListTree} naam="Opbouwrapport" doel={() => toon({ soort: "opbouw" })} />
            )}
            {analyse?.rapport && (
              <ObjectKnop gekozen={geselecteerd({ soort: "compat" })} uit={bezig || !!opbouw} icoon={ShieldCheck} naam="Compatibiliteitsrapport" doel={() => toon({ soort: "compat" })} />
            )}
          </Sectie>
        </>
      ) : analyse ? (
        <>
          {(["Tabel", "Gekoppelde tabel", "Query", "Relatie", "VBA", "Formulier", "Rapport", "Macro"] as Objectsoort[]).map((soort) => {
            const lijst = analyseLijst(soort);
            if (!lijst.length) return null;
            return (
              <Sectie key={soort} titel={MEERVOUD[soort]}>
                {lijst.map((o) => (
                  <ObjectKnop key={o.id} gekozen={weergave.soort === "analyse" && weergave.id === o.id} uit={bezig || !!opbouw} icoon={soort === "Tabel" ? Table2 : soort === "Query" ? Braces : soort === "VBA" ? Code2 : FileText} naam={o.naam} doel={() => toon({ soort: "analyse", id: o.id })} />
                ))}
              </Sectie>
            );
          })}
          {analyse.rapport && (
            <Sectie titel="Compatibiliteit">
              <ObjectKnop gekozen={geselecteerd({ soort: "compat" })} uit={bezig || !!opbouw} icoon={ShieldCheck} naam="Rapport" doel={() => toon({ soort: "compat" })} />
            </Sectie>
          )}
        </>
      ) : (
        <p className="muted">Open een database, maak een nieuwe of verken het voorbeeld.</p>
      )}
      <div className="aside-note">
        {werkkopie
          ? "Je werkt in een werkkopie. Het origineel blijft ongewijzigd; bewaar de werkkopie als .sqlite om wijzigingen te houden."
          : "Formulieren, rapporten en macro’s uit Access worden alleen geïnventariseerd. Niets wordt automatisch uitgevoerd."}
      </div>
    </aside>
  );

  // ---------------------------------------------------------------- hoofdvlak
  function hoofdvlak() {
    if (opbouw)
      return (
        <OpbouwVoortgang
          naam={opbouw.naam}
          voortgang={opbouw.voortgang}
          tabellenKlaar={opbouw.klaar}
          onAnnuleer={() => opbouw.afbreken.abort()}
        />
      );
    if (weergave.soort === "compat" && analyse?.rapport) return <CompatibiliteitWeergave rapport={analyse.rapport} onExporteer={exporteerCompat} />;
    if (weergave.soort === "analyse" && analyse) {
      const o: DatabaseObject | undefined = analyse.objecten.find((x) => x.id === weergave.id);
      if (!o) return null;
      return (
        <>
          <div className="object-toolbar">
            <h2>
              {o.naam}
              <small>{o.soort} · uit het Access-origineel</small>
            </h2>
          </div>
          {(o.soort === "Formulier" || o.soort === "Rapport") && (
            <p className="melding">
              Access-{o.soort === "Formulier" ? "formulier" : "rapport"}ontwerpen (indeling, besturingselementen) zijn in het bestand
              opgeslagen in een niet-gedocumenteerde binaire vorm en kunnen niet worden gelezen. Maak in Open Database Studio een eigen{" "}
              {o.soort === "Formulier" ? "formulier" : "rapport"} met dezelfde naam (Maken ›{" "}
              {o.soort === "Formulier" ? "Formulierontwerp" : "Rapport"}){o.soort === "Formulier" ? `; de VBA-module Form_${o.naam} wordt dan gekoppeld.` : "."}
            </p>
          )}
          {(o.soort === "Formulier" || o.soort === "Rapport") && werkkopie && (
            <div className="database-knoppen">
              <button
                className="primary"
                onClick={() =>
                  toon(
                    o.soort === "Formulier"
                      ? { soort: "formulier-ontwerp", naam: o.naam, bron: huidigeBron, nr: teller.current++ }
                      : { soort: "rapport-ontwerp", naam: o.naam, bron: huidigeBron, nr: teller.current++ },
                  )
                }
              >
                <Hammer size={16} /> {o.soort === "Formulier" ? "Formulier" : "Rapport"} ‘{o.naam}’ ontwerpen
              </button>
            </div>
          )}
          {o.soort === "Macro" && <p className="melding">Macro’s worden alleen geïnventariseerd en nooit uitgevoerd.</p>}
          <AlleenLezenObject key={o.id} object={o} lezer={lezer.current} />
        </>
      );
    }
    if (!werkkopie && analyse)
      return (
        <div className="welkom">
          <div className="db-icon">
            <Database size={40} />
          </div>
          <h2>{analyse.naam} · alleen lezen</h2>
          <p>{analyse.melding}</p>
          <p>
            Er is geen werkkopie: bewerken, query’s uitvoeren, formulieren, rapporten en VBA zijn daardoor niet beschikbaar. Kies links een
            object om het alleen-lezen te bekijken.
          </p>
          {bronBestand.current && analyse.objecten.length > 0 && (
            <div className="database-knoppen database-welkomknoppen">
              <button className="primary" disabled={bezig} onClick={() => void bouwWerkkopie(bronBestand.current!)}>
                <RefreshCw size={16} /> Werkkopie alsnog opbouwen
              </button>
            </div>
          )}
        </div>
      );
    if (!werkkopie) return <Welkom bezig={bezig} openen={() => invoer.current?.click()} nieuw={() => void nieuweDatabase()} voorbeeld={() => void nieuweDatabase(true)} />;
    switch (weergave.soort) {
      case "tabel": {
        const schema = objecten.tabellen.find((t) => t.naam === weergave.naam);
        if (!schema) return <p role="status">Tabel laden…</p>;
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {schema.naam}
                <small>Tabel · {schema.herkomst === "access" ? "uit Access" : "in de werkkopie"}</small>
              </h2>
              <div className="database-weergavekeuze" role="group" aria-label="Weergave">
                <button aria-pressed={weergave.modus === "gegevens"} onClick={() => toon({ ...weergave, modus: "gegevens" })}>
                  <Table2 size={16} /> Gegevens
                </button>
                <button aria-pressed={weergave.modus === "ontwerp"} onClick={() => toon({ ...weergave, modus: "ontwerp" })}>
                  <TableProperties size={16} /> Ontwerp
                </button>
              </div>
            </div>
            {weergave.modus === "gegevens" ? (
              <TabelWeergave key={schema.naam} werkkopie={werkkopie} schema={schema} onGewijzigd={() => void vernieuw()} onExporteer={() => void exporteerTabel(schema.naam)} />
            ) : (
              <TabelOntwerp
                werkkopie={werkkopie}
                schema={schema}
                relaties={objecten.relaties}
                onGewijzigd={structuurGewijzigd}
                onVerwijderd={() => {
                  setWeergave({ soort: "welkom" });
                  setMelding(`Tabel ‘${schema.naam}’ verwijderd uit de werkkopie.`);
                  void vernieuw();
                }}
              />
            )}
          </>
        );
      }
      case "nieuwe-tabel":
        return (
          <>
            <div className="object-toolbar">
              <h2>Nieuwe tabel</h2>
            </div>
            <NieuweTabel
              werkkopie={werkkopie}
              onGemaakt={async (naam) => {
                await vernieuw();
                setMelding(`Tabel ‘${naam}’ gemaakt.`);
                toon({ soort: "tabel", naam, modus: "gegevens" });
              }}
            />
          </>
        );
      case "query": {
        const q = weergave.naam ? (objecten.querys.find((x) => x.naam === weergave.naam) ?? null) : null;
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {q?.naam ?? "Nieuwe query"}
                <small>{q ? `${ACTIENAMEN[q.soort]} · opgeslagen query` : "SQL-weergave"}</small>
              </h2>
            </div>
            <QueryEditor
              key={weergave.nr}
              werkkopie={werkkopie}
              opgeslagen={q}
              tabellen={objecten.tabellen}
              beginSql={weergave.sql}
              registreerUitvoeren={registreerQuery}
              onResultaat={setQueryUitvoer}
              onBewaard={async (naam) => {
                await vernieuw();
                setWeergave({ soort: "query", naam, nr: teller.current++ });
              }}
              onGewijzigd={() => void vernieuw()}
              onExporteer={(u) => void exporteerCsv(u.titel, u.resultaat.kolommen, u.resultaat.rijen, u.resultaat.kolomsoorten ?? [])}
            />
          </>
        );
      }
      case "formulier": {
        const o = formulieren.find((x) => x.naam === weergave.naam);
        if (!o) return <p role="status">Formulier laden…</p>;
        return (
          <Formulier
            key={weergave.nr}
            werkkopie={werkkopie}
            naam={o.naam}
            bronnaam={o.bron}
            definitie={leesFormulierDefinitie(o.definitie, o.naam)}
            tabellen={objecten.tabellen}
            vba={vba}
            module={formModule(o.naam)}
            metVba={weergave.metVba}
            onSluit={() => setWeergave((w) => (w.soort === "formulier" && w.nr === weergave.nr ? { soort: "welkom" } : w))}
            onOntwerp={() => toon({ soort: "formulier-ontwerp", naam: o.naam, nr: teller.current++ })}
            onGewijzigd={() => void vernieuw()}
            onExporteer={(k, r, s) => void exporteerCsv(o.naam, k, r, s)}
          />
        );
      }
      case "formulier-ontwerp": {
        const o = weergave.naam ? formulieren.find((x) => x.naam === weergave.naam) : undefined;
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {o ? `Ontwerp van ${o.naam}` : "Nieuw formulier"}
                <small>Formulierontwerp</small>
              </h2>
            </div>
            <FormulierOntwerper
              key={weergave.nr}
              werkkopie={werkkopie}
              bronnen={bronnen}
              naam={o?.naam ?? weergave.naam ?? ""}
              bron={o?.bron ?? weergave.bron ?? ""}
              definitie={o ? leesFormulierDefinitie(o.definitie, o.naam) : null}
              bestaandeNamen={formulieren.map((f) => f.naam)}
              moduleKnoppen={(naam) => {
                const m = formModule(naam);
                return m ? [...m.bron.matchAll(/^\s*(?:Private\s+|Public\s+)?Sub\s+([A-Za-z]\w*)_Click\s*\(/gim)].map((x) => x[1]).filter((k) => !/^form$/i.test(k)) : [];
              }}
              onBewaard={() => void vernieuw()}
              onOpenen={async (naam) => {
                await vernieuw();
                await openFormulier(naam);
              }}
            />
          </>
        );
      }
      case "rapport":
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {weergave.naam}
                <small>Afdrukvoorbeeld · bron {weergave.bron}</small>
              </h2>
            </div>
            <RapportVoorbeeld
              key={weergave.nr}
              werkkopie={werkkopie}
              naam={weergave.naam}
              bron={weergave.bron}
              definitie={weergave.definitie}
              onOntwerp={() => toon({ soort: "rapport-ontwerp", naam: rapporten.some((r) => r.naam === weergave.naam) ? weergave.naam : null, bron: weergave.bron, nr: teller.current++ })}
            />
          </>
        );
      case "rapport-ontwerp": {
        const o = weergave.naam ? rapporten.find((x) => x.naam === weergave.naam) : undefined;
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {o ? `Ontwerp van ${o.naam}` : "Nieuw rapport"}
                <small>Rapportontwerp</small>
              </h2>
            </div>
            <RapportOntwerper
              key={weergave.nr}
              werkkopie={werkkopie}
              bronnen={bronnen}
              naam={o?.naam ?? weergave.naam ?? vrijeNaam("Rapport", rapporten.map((r) => r.naam))}
              nieuw={!o}
              bron={o?.bron ?? weergave.bron ?? ""}
              definitie={o ? leesRapportDefinitie(o.definitie, o.naam) : leegRapport("")}
              bestaandeNamen={rapporten.map((r) => r.naam)}
              onBewaard={() => void vernieuw()}
              onVoorbeeld={(naam, bron, definitie) => toon({ soort: "rapport", naam, bron, definitie, nr: teller.current++ })}
            />
          </>
        );
      }
      case "vba": {
        const m = modules.find((x) => x.naam === weergave.module);
        if (!m) return null;
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {m.naam}
                <small>
                  VBA-{m.soort === "formulier" ? "formuliermodule" : m.soort === "klasse" ? "klassemodule" : "module"} · afgeschermd uitvoeren op de werkkopie
                </small>
              </h2>
            </div>
            <VbaPaneel
              module={m}
              vba={vba}
              modules={modules}
              onWijzig={(bron) => bewaarModule(m, bron)}
              onVerwijder={() => verwijderModule(m)}
            />
          </>
        );
      }
      case "relaties":
        return <RelatieVenster werkkopie={werkkopie} relaties={objecten.relaties} tabellen={objecten.tabellen} onGewijzigd={structuurGewijzigd} />;
      case "opbouw":
        return werkkopie.rapport ? <OpbouwRapportWeergave rapport={werkkopie.rapport} onExporteer={exporteerOpbouw} /> : null;
      default:
        return (
          <div className="welkom">
            <div className="db-icon">
              <Database size={40} />
            </div>
            <h2>{sessie?.naam}</h2>
            <p>
              {objecten.tabellen.length} tabellen · {objecten.querys.length} query’s · {formulieren.length} formulieren · {rapporten.length} rapporten ·{" "}
              {modules.length} VBA-modules
            </p>
            <p>Kies links een object, of gebruik het lint: Maken voor nieuwe tabellen, query’s, formulieren en rapporten.</p>
          </div>
        );
    }
  }

  const statusWerkkopie = werkkopie ? `Werkkopie — het origineel blijft ongewijzigd${gewijzigd ? " · niet-opgeslagen wijzigingen" : ""}` : analyse ? "Alleen lezen" : "";
  const geenWk = !werkkopie || bezig || !!opbouw;

  return (
    <div className="database-werkruimte" onKeyDown={toets}>
      <Ribbon
        bestand={bestandsmenu}
        tabs={[
          {
            id: "start",
            naam: "Start",
            inhoud: (
              <>
                <Groep naam="Database">
                  <Actie icoon={FolderOpen} naam={bezig ? "Bestand lezen…" : "Openen"} groot disabled={bezig || !!opbouw} onClick={() => invoer.current?.click()} title="Database of werkkopie openen (Ctrl+O)" />
                  <Actie icoon={FilePlus2} naam="Nieuw" groot disabled={bezig || !!opbouw} onClick={() => void nieuweDatabase()} title="Nieuwe lege database" />
                  <Actie icoon={Database} naam="Voorbeeld" disabled={bezig || !!opbouw} onClick={() => void nieuweDatabase(true)} title="Voorbeelddatabase verkennen" />
                </Groep>
                <Groep naam="Werkkopie">
                  <Actie icoon={Save} naam="Opslaan" groot disabled={geenWk} onClick={() => void bewaarWerkkopie()} title="Werkkopie bewaren als .sqlite (Ctrl+S)" />
                  <Actie icoon={RefreshCw} naam="Vernieuwen" disabled={geenWk} onClick={() => void vernieuw()} />
                  <Actie icoon={X} naam="Sluiten" disabled={(!werkkopie && !analyse) || bezig || !!opbouw} onClick={() => void sluitDatabase()} />
                </Groep>
                {weergave.soort === "query" && (
                  <Groep naam="Query">
                    <Actie icoon={Play} naam="Uitvoeren" groot onClick={() => queryUitvoeren.current?.()} title="Uitvoeren (F5 of Ctrl+Enter)" />
                  </Groep>
                )}
              </>
            ),
          },
          {
            id: "maken",
            naam: "Maken",
            inhoud: (
              <>
                <Groep naam="Tabellen">
                  <Actie icoon={Table2} naam="Tabel" groot disabled={geenWk} onClick={() => toon({ soort: "nieuwe-tabel" })} />
                </Groep>
                <Groep naam="Query’s">
                  <Actie icoon={Braces} naam="Query" groot disabled={geenWk} onClick={() => toon({ soort: "query", naam: null, sql: huidigeBron ? `SELECT *\nFROM [${huidigeBron}];` : undefined, nr: teller.current++ })} title="Nieuwe query in SQL-weergave" />
                </Groep>
                <Groep naam="Formulieren">
                  <Actie icoon={LayoutTemplate} naam="Formulier" groot disabled={geenWk || !huidigeBron} onClick={() => void automatischFormulierMaken()} title={huidigeBron ? `Automatisch formulier voor ${huidigeBron}` : "Automatisch formulier"} />
                  <Actie icoon={Hammer} naam="Formulierontwerp" disabled={geenWk} onClick={() => toon({ soort: "formulier-ontwerp", naam: null, bron: huidigeBron, nr: teller.current++ })} />
                </Groep>
                <Groep naam="Rapporten">
                  <Actie icoon={FileText} naam="Rapport" groot disabled={geenWk} onClick={() => toon({ soort: "rapport-ontwerp", naam: null, bron: huidigeBron, nr: teller.current++ })} title="Rapportontwerp" />
                </Groep>
                <Groep naam="Code">
                  <Actie icoon={FileCode2} naam="Module" groot disabled={geenWk} onClick={() => void nieuweModule()} title="Nieuwe VBA-module" />
                </Groep>
              </>
            ),
          },
          {
            id: "extern",
            naam: "Externe gegevens",
            inhoud: (
              <>
                <Groep naam="Exporteren">
                  <Actie icoon={Download} naam="CSV" groot disabled={!csvMogelijk || bezig} onClick={exporteerHuidig} title="Huidige tabel of queryresultaat als CSV" />
                  <Actie icoon={Database} naam="SQLite" groot disabled={geenWk} onClick={() => void bewaarWerkkopie()} title="Werkkopie als SQLite-bestand" />
                  <Actie
                    icoon={FileCode2}
                    naam="Bron (.sql/.bas)"
                    disabled={!(weergave.soort === "vba" || (weergave.soort === "query" && !!weergave.naam))}
                    onClick={exporteerBron}
                  />
                </Groep>
                <Groep naam="Rapporten">
                  <Actie icoon={FileJson} naam="Compatibiliteit (JSON)" disabled={!analyse?.rapport} onClick={() => exporteerCompat("json")} />
                  <Actie icoon={FileText} naam="Compatibiliteit (tekst)" disabled={!analyse?.rapport} onClick={() => exporteerCompat("txt")} />
                  <Actie icoon={ListTree} naam="Opbouwrapport (JSON)" disabled={!werkkopie?.rapport} onClick={exporteerOpbouw} />
                </Groep>
              </>
            ),
          },
          {
            id: "hulpmiddelen",
            naam: "Databasehulpmiddelen",
            inhoud: (
              <>
                <Groep naam="Overzicht">
                  <Actie icoon={Link2} naam="Relaties" groot disabled={geenWk} onClick={() => toon({ soort: "relaties" })} />
                  <Actie icoon={ShieldCheck} naam="Compatibiliteit" groot disabled={!analyse?.rapport} actief={weergave.soort === "compat"} onClick={() => toon({ soort: "compat" })} />
                  <Actie icoon={ListTree} naam="Opbouwrapport" groot disabled={!werkkopie?.rapport} actief={weergave.soort === "opbouw"} onClick={() => toon({ soort: "opbouw" })} />
                </Groep>
                <Groep naam="VBA">
                  <Actie icoon={Terminal} naam="Visual Basic" groot disabled={geenWk || !modules.length} onClick={() => modules[0] && toon({ soort: "vba", module: modules[0].naam })} title="VBA-modules en procedures" />
                  <Actie icoon={Square} naam="Stop" disabled={!vba.bezig} onClick={vba.stop} title="Lopende VBA stoppen" />
                </Groep>
              </>
            ),
          },
          {
            id: "beeld",
            naam: "Beeld",
            inhoud: (
              <Groep naam="Weergave">
                <Actie icoon={Sun} naam="Licht" groot actief={!donker} onClick={() => setDonker(false)} />
                <Actie icoon={Moon} naam="Donker" groot actief={donker} onClick={() => setDonker(true)} />
              </Groep>
            ),
          },
        ]}
      />
      <div className="database-documentbalk">
        <Database size={15} aria-hidden />
        <strong>{sessie?.naam ?? analyse?.naam ?? "Geen database geopend"}</strong>
        {werkkopie ? (
          <span className="database-werkkopiestatus" role="status">
            <ShieldCheck size={13} aria-hidden /> Werkkopie — het origineel blijft ongewijzigd
            {gewijzigd && <em> · niet opgeslagen</em>}
          </span>
        ) : (
          <span>{analyse ? "Alleen lezen" : "Lokaal · geen uploads"}</span>
        )}
      </div>
      <input
        ref={invoer}
        hidden
        type="file"
        accept=".mdb,.accdb,.sqlite,.sqlite3,.db"
        aria-label="Database of werkkopie kiezen"
        onChange={(event) => {
          const bestand = event.target.files?.[0];
          event.target.value = "";
          if (bestand) void openBestand(bestand);
        }}
      />
      {fout && (
        <div role="alert" className="melding fout database-balkmelding">
          <span>{fout}</span>
          <button aria-label="Melding sluiten" onClick={() => setFout("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {melding && !fout && (
        <div role="status" className="melding database-balkmelding">
          <span>{melding}</span>
          <button aria-label="Melding sluiten" onClick={() => setMelding("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <main>
        {objectbrowser}
        <article>
          <Foutgrens key={JSON.stringify(weergave)}>{hoofdvlak()}</Foutgrens>
          <VbaUitvoer vba={vba} />
        </article>
      </main>
      <footer>
        <span>Open Database Studio</span>
        <span>{statusWerkkopie || "Klaar om te beginnen"}</span>
        <span>{vba.bezig ? `VBA: ${vba.bezig}` : "Geen uploads · VBA alleen op verzoek"}</span>
      </footer>
    </div>
  );
}

/** Eerste vrije naam “Basis 1”, “Basis 2”, … */
function vrijeNaam(basis: string, bezet: string[]) {
  const set = new Set(bezet.map((n) => n.toLowerCase()));
  let i = 1;
  while (set.has(`${basis} ${i}`.toLowerCase())) i++;
  return `${basis} ${i}`;
}

function ObjectKnop({
  icoon: Icoon,
  naam,
  doel,
  sub,
  uit,
  gekozen,
}: {
  icoon: LucideIcon;
  naam: string;
  doel: () => void;
  sub?: string;
  uit: boolean;
  gekozen: boolean;
}) {
  return (
    <button disabled={uit} onClick={doel} title={sub ? `${naam} · ${sub}` : naam} className={gekozen ? "selected" : ""} aria-current={gekozen ? "page" : undefined}>
      <Icoon size={16} aria-hidden /> <span>{naam}</span>
      {sub && <small className="database-objectsub">{sub}</small>}
    </button>
  );
}

function Sectie({ titel, children, leeg }: { titel: string; children?: React.ReactNode; leeg?: string }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <section>
      <h3>{titel}</h3>
      {items.length ? (
        <ul>
          {items.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">{leeg ?? "Niet aanwezig"}</p>
      )}
    </section>
  );
}

function Welkom({ bezig, openen, nieuw, voorbeeld }: { bezig: boolean; openen: () => void; nieuw: () => void; voorbeeld: () => void }) {
  return (
    <div className="welkom">
      <div className="db-icon">
        <Database size={44} />
      </div>
      <h2>Geef oude databases een nieuwe werkplek</h2>
      <p>
        Open een .mdb- of .accdb-bestand: Open Database Studio bouwt er een bewerkbare werkkopie van. Het origineel blijft ongewijzigd.
      </p>
      <div className="database-knoppen database-welkomknoppen">
        <button className="primary" disabled={bezig} onClick={openen}>
          <FolderOpen size={16} /> Database openen
        </button>
        <button disabled={bezig} onClick={nieuw}>
          <FilePlus2 size={16} /> Nieuwe lege database
        </button>
        <button disabled={bezig} onClick={voorbeeld}>
          <Database size={16} /> Voorbeeld verkennen
        </button>
      </div>
      <div className="kaarten">
        <section>
          <Table2 />
          <h3>Tabellen en query’s</h3>
          <p>Gegevens bewerken met typecontrole, query’s in Access-SQL uitvoeren en resultaten als CSV bewaren.</p>
        </section>
        <section>
          <LayoutTemplate />
          <h3>Formulieren en rapporten</h3>
          <p>Automatische formulieren, een eenvoudige ontwerper en rapporten met groepen en totalen, af te drukken als PDF.</p>
        </section>
        <section>
          <Code2 />
          <h3>VBA</h3>
          <p>VBA-procedures afgeschermd uitvoeren op de werkkopie: alleen op verzoek, zonder bestanden, COM of Shell.</p>
        </section>
      </div>
      <p className="melding">
        Alles gebeurt lokaal. Macro’s, AutoExec en VBA worden nooit automatisch uitgevoerd. Bewaar je werk als .sqlite-werkkopie en heropen
        die later via Openen.
      </p>
    </div>
  );
}
