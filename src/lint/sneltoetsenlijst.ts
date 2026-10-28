/**
 * Centraal register van sneltoetsen: de vaste lijst (app, lint en engines)
 * plus wat `useSneltoetsen` op dit moment in een module heeft geregistreerd.
 * Het overzicht (F1 of Ctrl+/) en de botsingentest lezen hieruit.
 */
import { ontleed } from "./sneltoetsen";

export type SneltoetsModule =
  | "algemeen"
  | "tekst"
  | "rekenblad"
  | "presentatie"
  | "database"
  | "email"
  | "notities";

export const moduleNamen: Record<SneltoetsModule, string> = {
  algemeen: "Algemeen",
  tekst: "Tekst",
  rekenblad: "Rekenblad",
  presentatie: "Presentatie",
  database: "Database",
  email: "E-mail",
  notities: "Notities",
};

export interface SneltoetsInfo {
  toets: string;
  omschrijving: string;
  module: SneltoetsModule;
  /** Wie de toets afhandelt: de app, het lint van de module of de engine. */
  bron: "app" | "lint" | "engine";
  /** Alleen voor algemene toetsen: modules waar de toets iets anders doet. */
  behalve?: SneltoetsModule[];
  /** Alleen in deze modules (bijvoorbeeld zoomen in documenten). */
  alleen?: SneltoetsModule[];
}

const documenten: SneltoetsModule[] = ["tekst", "rekenblad", "presentatie"];

const algemeen = (
  toets: string,
  omschrijving: string,
  extra: Partial<SneltoetsInfo> = {},
): SneltoetsInfo => ({ toets, omschrijving, module: "algemeen", bron: "app", ...extra });
const lint = (module: SneltoetsModule) => (toets: string, omschrijving: string): SneltoetsInfo => ({
  toets,
  omschrijving,
  module,
  bron: "lint",
});
const engine = (module: SneltoetsModule) => (toets: string, omschrijving: string): SneltoetsInfo => ({
  toets,
  omschrijving,
  module,
  bron: "engine",
});

const tekst = lint("tekst");
const rekenblad = lint("rekenblad");
const presentatie = lint("presentatie");
const tekstEngine = engine("tekst");
const rekenbladEngine = engine("rekenblad");
const presentatieEngine = engine("presentatie");

/** Klembord en selecteren: in elke editor via de engine en de webview. */
const klembord = (maak: ReturnType<typeof engine>) => [
  maak("Ctrl+X", "Knippen"),
  maak("Ctrl+C", "Kopiëren"),
  maak("Ctrl+V", "Plakken"),
  maak("Ctrl+A", "Alles selecteren"),
];

export const vasteSneltoetsen: readonly SneltoetsInfo[] = [
  // Werkruimte (src/useTabSneltoetsen.ts, src/useDocumentZoom.ts, het lint).
  algemeen("Ctrl+S", "Opslaan in het laatst gekozen formaat"),
  algemeen("Ctrl+Shift+S", "Opslaan als", { alleen: documenten }),
  algemeen("F12", "Opslaan als", { alleen: documenten }),
  algemeen("Ctrl+O", "Openen"),
  algemeen("Ctrl+W", "Tabblad sluiten"),
  algemeen("Ctrl+F4", "Tabblad sluiten"),
  algemeen("Ctrl+Tab", "Volgend tabblad"),
  algemeen("Ctrl+Shift+Tab", "Vorig tabblad"),
  algemeen("Ctrl+F6", "Volgend tabblad"),
  algemeen("Ctrl+Shift+F6", "Vorig tabblad"),
  algemeen("Ctrl+PageDown", "Volgend tabblad", { behalve: ["rekenblad"] }),
  algemeen("Ctrl+PageUp", "Vorig tabblad", { behalve: ["rekenblad"] }),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => algemeen(`Alt+${n}`, `Tabblad ${n}`)),
  algemeen("Alt+9", "Laatste tabblad"),
  algemeen("Escape", "Terug van Start naar het vorige tabblad"),
  algemeen("Ctrl+0", "Zoom 100%", { alleen: documenten }),
  algemeen("Ctrl+=", "Inzoomen", { alleen: documenten }),
  algemeen("Ctrl+-", "Uitzoomen", { alleen: documenten }),
  algemeen("F1", "Dit overzicht van sneltoetsen"),
  algemeen("Ctrl+/", "Dit overzicht van sneltoetsen"),
  algemeen("Ctrl+,", "Instellingen"),
  algemeen("F10", "Toetstips in het lint tonen of verbergen (ook: Alt los indrukken)"),
  algemeen("Ctrl+F1", "Lint verbergen of weergeven"),
  algemeen("F6", "Naar het volgende deel van het venster"),
  algemeen("Shift+F6", "Naar het vorige deel van het venster"),

  // Tekst: lint (src/lint/tekst-opdrachten.tsx).
  tekst("Ctrl+1", "Kop 1"),
  tekst("Ctrl+2", "Kop 2"),
  tekst("Ctrl+3", "Kop 3"),
  tekst("Ctrl+Shift+P", "Superscript"),
  tekst("Ctrl+Shift+B", "Subscript"),
  tekst("Ctrl+D", "Dubbel onderstrepen"),
  tekst("Ctrl+M", "Opmaak wissen"),
  tekst("Shift+F3", "Hoofdletters wisselen"),
  tekst("Ctrl+Enter", "Pagina-einde"),
  tekst("Ctrl+F12", "Tabel invoegen"),
  tekst("Ctrl+Alt+C", "Opmerking invoegen"),
  tekst("Ctrl+Shift+C", "Wijzigingen bijhouden aan of uit"),
  tekst("Ctrl+P", "Afdrukken (afdrukvoorbeeld)"),
  tekst("Ctrl+Shift+O", "Afdrukvoorbeeld"),
  tekst("F5", "Navigatievenster"),
  tekst("Ctrl+Shift+R", "Liniaal tonen of verbergen"),
  tekst("F11", "Alle stijlen"),
  tekst("Ctrl+Alt+Shift+S", "Stijlenvenster"),
  // Tekst: engine (@betteroffice/docx-react).
  tekstEngine("Ctrl+B", "Vet"),
  tekstEngine("Ctrl+I", "Cursief"),
  tekstEngine("Ctrl+U", "Onderstrepen"),
  tekstEngine("Ctrl+Z", "Ongedaan maken"),
  tekstEngine("Ctrl+Y", "Opnieuw"),
  tekstEngine("Ctrl+Shift+Z", "Opnieuw"),
  tekstEngine("Ctrl+K", "Koppeling invoegen"),
  tekstEngine("Ctrl+F", "Zoeken"),
  tekstEngine("Ctrl+H", "Zoeken en vervangen"),
  tekstEngine("Ctrl+L", "Links uitlijnen"),
  tekstEngine("Ctrl+E", "Centreren"),
  tekstEngine("Ctrl+R", "Rechts uitlijnen"),
  tekstEngine("Ctrl+J", "Uitvullen"),
  ...klembord(tekstEngine),

  // Rekenblad: lint (src/lint/rekenblad.tsx).
  rekenblad("Ctrl+L", "Links uitlijnen"),
  rekenblad("Ctrl+E", "Centreren"),
  rekenblad("Ctrl+R", "Rechts uitlijnen"),
  rekenblad("Ctrl+Shift+1", "Getalnotatie"),
  rekenblad("Ctrl+Shift+2", "Wetenschappelijke notatie"),
  rekenblad("Ctrl+Shift+3", "Datumnotatie"),
  rekenblad("Ctrl+Shift+4", "Valutanotatie"),
  rekenblad("Ctrl+Shift+5", "Percentage"),
  rekenblad("Ctrl+Shift+6", "Standaardnotatie"),
  rekenblad("Alt+=", "AutoSom"),
  rekenblad("Ctrl+;", "Datum van vandaag"),
  rekenblad("Ctrl+Shift+;", "Huidige tijd"),
  rekenblad("Ctrl+Shift+:", "Huidige tijd"),
  rekenblad("Ctrl+D", "Doorvoeren omlaag"),
  rekenblad("Ctrl+PageUp", "Vorig werkblad"),
  rekenblad("Ctrl+PageDown", "Volgend werkblad"),
  rekenblad("Ctrl+F", "Zoeken"),
  rekenblad("Ctrl+H", "Zoeken en vervangen"),
  rekenblad("F5", "Ga naar"),
  rekenblad("Ctrl+Shift+F5", "Ga naar"),
  rekenblad("Ctrl+P", "Afdrukken (afdrukvoorbeeld en pagina-indeling)"),
  rekenblad("Ctrl+Shift+O", "Afdrukvoorbeeld"),
  rekenblad("Alt+F1", "Grafiek op dit blad"),
  rekenblad("F11", "Grafiek op een nieuw blad"),
  // Rekenblad: engine (@betteroffice/xlsx-react).
  rekenbladEngine("Ctrl+B", "Vet"),
  rekenbladEngine("Ctrl+I", "Cursief"),
  rekenbladEngine("Ctrl+Z", "Ongedaan maken"),
  rekenbladEngine("Ctrl+Y", "Opnieuw"),
  rekenbladEngine("Ctrl+Shift+Z", "Opnieuw"),
  ...klembord(rekenbladEngine),

  // Presentatie: lint (src/lint/presentatie-acties.tsx).
  presentatie("F5", "Diavoorstelling vanaf het begin"),
  presentatie("Shift+F5", "Diavoorstelling vanaf de huidige dia"),
  presentatie("Ctrl+M", "Nieuwe dia"),
  presentatie("Ctrl+L", "Links uitlijnen"),
  presentatie("Ctrl+E", "Centreren"),
  presentatie("Ctrl+R", "Rechts uitlijnen"),
  presentatie("Ctrl+J", "Uitvullen"),
  presentatie("PageUp", "Vorige dia"),
  presentatie("PageDown", "Volgende dia"),
  presentatie("Home", "Eerste dia"),
  presentatie("End", "Laatste dia"),
  presentatie("Ctrl+Shift+PageUp", "Dia omhoog verplaatsen"),
  presentatie("Ctrl+Shift+PageDown", "Dia omlaag verplaatsen"),
  presentatie("Ctrl+Shift+Home", "Dia naar het begin"),
  presentatie("Ctrl+Shift+End", "Dia naar het einde"),
  presentatie("Delete", "Vorm of dia verwijderen"),
  // Presentatie: afdrukvoorbeeld van de app (src/afdrukken/AfdrukvoorbeeldHost.tsx).
  { toets: "Ctrl+P", omschrijving: "Afdrukken: dia's, hand-outs of notitiepagina's", module: "presentatie", bron: "app" },
  { toets: "Ctrl+Shift+O", omschrijving: "Afdrukvoorbeeld", module: "presentatie", bron: "app" },
  // Presentatie: engine (@betteroffice/pptx-react).
  presentatieEngine("Ctrl+B", "Vet"),
  presentatieEngine("Ctrl+I", "Cursief"),
  presentatieEngine("Ctrl+U", "Onderstrepen"),
  presentatieEngine("Ctrl+Z", "Ongedaan maken"),
  presentatieEngine("Ctrl+Shift+Z", "Opnieuw"),
  ...klembord(presentatieEngine),
];

/** Vaste vorm van een combinatie: modifiers op volgorde, toets in kleine letters. */
export function normaliseer(toets: string) {
  const c = ontleed(toets);
  return [c.ctrl && "ctrl", c.alt && "alt", c.shift && "shift", c.toets]
    .filter(Boolean)
    .join("+");
}

const isMac = () =>
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ?? navigator.platform,
  );

/** Leesbare toetsen; op macOS met Cmd en Option. */
export function toetsDelen(toets: string, mac = isMac()): string[] {
  const namen: Record<string, string> = mac
    ? { Ctrl: "⌘", Alt: "⌥", Shift: "⇧" }
    : {};
  const vertaling: Record<string, string> = {
    Escape: "Esc",
    PageUp: "Page Up",
    PageDown: "Page Down",
    Delete: "Delete",
  };
  return toets
    .split("+")
    .map((deel, i, alle) =>
      i < alle.length - 1 ? (namen[deel] ?? deel) : (vertaling[deel] ?? deel),
    )
    .map((deel) => (deel === "" ? "+" : deel));
}

/** Of een toets in een module geldt (algemene toetsen tellen mee). */
export function geldtIn(info: SneltoetsInfo, module: SneltoetsModule) {
  if (info.module !== "algemeen") return info.module === module;
  if (info.behalve?.includes(module)) return false;
  return !info.alleen || info.alleen.includes(module);
}

/** Combinaties die in één module twee keer iets anders doen. */
export function botsingen(lijst: readonly SneltoetsInfo[]) {
  const modules = Object.keys(moduleNamen).filter(
    (m) => m !== "algemeen",
  ) as SneltoetsModule[];
  const gevonden: { module: SneltoetsModule; toets: string; omschrijvingen: string[] }[] = [];
  for (const module of modules) {
    const per = new Map<string, SneltoetsInfo[]>();
    for (const info of lijst)
      if (geldtIn(info, module)) {
        const sleutel = normaliseer(info.toets);
        per.set(sleutel, [...(per.get(sleutel) ?? []), info]);
      }
    for (const [toets, infos] of per)
      if (infos.length > 1)
        gevonden.push({ module, toets, omschrijvingen: infos.map((i) => i.omschrijving) });
  }
  return gevonden;
}

// Actieve registraties uit useSneltoetsen, voor het overzicht.
type Registratie = { module: SneltoetsModule; toetsen: { toets: string; omschrijving?: string }[] };
const registraties = new Set<Registratie>();
const luisteraars = new Set<() => void>();
let versie = 0;

export function registreerSneltoetsen(
  module: SneltoetsModule,
  toetsen: { toets: string; omschrijving?: string }[],
) {
  const registratie = { module, toetsen };
  registraties.add(registratie);
  versie++;
  luisteraars.forEach((l) => l());
  return () => {
    registraties.delete(registratie);
    versie++;
    luisteraars.forEach((l) => l());
  };
}

export function volgRegistraties(luisteraar: () => void) {
  luisteraars.add(luisteraar);
  return () => luisteraars.delete(luisteraar);
}
export const registratieVersie = () => versie;

/** De vaste lijst plus geregistreerde toetsen die daar (nog) niet in staan. */
export function alleSneltoetsen(): SneltoetsInfo[] {
  const lijst = [...vasteSneltoetsen];
  const bekend = new Set(lijst.map((i) => `${i.module}:${normaliseer(i.toets)}`));
  for (const { module, toetsen } of registraties)
    for (const { toets, omschrijving } of toetsen) {
      const sleutel = `${module}:${normaliseer(toets)}`;
      if (bekend.has(sleutel)) continue;
      bekend.add(sleutel);
      lijst.push({ toets, module, bron: "lint", omschrijving: omschrijving ?? toets });
    }
  return lijst;
}

/** Filtert op een zoekterm in omschrijving of toets. */
export function zoekSneltoetsen(lijst: readonly SneltoetsInfo[], zoek: string) {
  const term = zoek.trim().toLowerCase();
  if (!term) return [...lijst];
  return lijst.filter(
    (info) =>
      info.omschrijving.toLowerCase().includes(term) ||
      info.toets.toLowerCase().includes(term) ||
      normaliseer(info.toets).includes(term.replace(/\s+/g, "")),
  );
}
