import { GrafiekFout, LIMIETEN } from "./fouten.ts";

export type GrafiekSoort =
  | "kolom"
  | "kolomGestapeld"
  | "kolom100"
  | "staaf"
  | "lijn"
  | "lijnMarkering"
  | "vlak"
  | "taart"
  | "ring"
  | "spreiding"
  | "combinatie";

export const SOORTEN: { soort: GrafiekSoort; naam: string; uitleg: string }[] = [
  { soort: "kolom", naam: "Kolom", uitleg: "Waarden naast elkaar vergelijken" },
  {
    soort: "kolomGestapeld",
    naam: "Gestapelde kolom",
    uitleg: "Delen en totaal per categorie",
  },
  { soort: "kolom100", naam: "100%-kolom", uitleg: "Aandelen per categorie" },
  { soort: "staaf", naam: "Staaf", uitleg: "Horizontaal, voor lange namen" },
  { soort: "lijn", naam: "Lijn", uitleg: "Verloop over de tijd" },
  {
    soort: "lijnMarkering",
    naam: "Lijn met markeringen",
    uitleg: "Verloop met zichtbare meetpunten",
  },
  { soort: "vlak", naam: "Vlak", uitleg: "Verloop met nadruk op omvang" },
  { soort: "taart", naam: "Taart", uitleg: "Verdeling van één reeks" },
  { soort: "ring", naam: "Ring", uitleg: "Verdeling met een open midden" },
  { soort: "spreiding", naam: "Spreiding (XY)", uitleg: "Verband tussen twee getallen" },
  {
    soort: "combinatie",
    naam: "Kolom + lijn",
    uitleg: "Laatste reeks als lijn op een tweede as",
  },
];
export const soortNaam = (soort: GrafiekSoort) =>
  SOORTEN.find((s) => s.soort === soort)?.naam ?? soort;

export type LegendaPositie = "rechts" | "onder" | "boven" | "links" | "geen";

export interface Reeks {
  naam: string;
  waarden: (number | null)[];
  /** Hex zonder #; leeg = uit het palet. */
  kleur?: string;
  /** Celverwijzingen, bijvoorbeeld `'Blad 1'!$B$1`. */
  naamRef?: string;
  waardenRef?: string;
}

export interface GrafiekModel {
  soort: GrafiekSoort;
  titel: string;
  ondertitel: string;
  legenda: LegendaPositie;
  asTitelX: string;
  asTitelY: string;
  /** Titel van de tweede as bij een combinatie. */
  asTitelY2: string;
  rasterlijnen: boolean;
  gegevenslabels: boolean;
  /** Decimalen in labels en op de waardeas (Nederlandse notatie via numFmt). */
  decimalen: number;
  categorieen: string[];
  categorieenRef?: string;
  reeksen: Reeks[];
}

/** OpenAEC-palet: elke kleur heeft minstens 3:1 contrast op wit. */
export const PALET = [
  "D97706",
  "3F62B9",
  "2F7A55",
  "36363E",
  "AE6043",
  "8A5A9E",
  "0E7490",
  "71717A",
];
export const kleurVan = (model: GrafiekModel, i: number) =>
  model.reeksen[i]?.kleur || PALET[i % PALET.length];

export function standaardModel(deel: Partial<GrafiekModel> = {}): GrafiekModel {
  return {
    soort: "kolom",
    titel: "",
    ondertitel: "",
    legenda: "onder",
    asTitelX: "",
    asTitelY: "",
    asTitelY2: "",
    rasterlijnen: true,
    gegevenslabels: false,
    decimalen: 0,
    categorieen: [],
    reeksen: [],
    ...deel,
  };
}

export const isCirkel = (soort: GrafiekSoort) => soort === "taart" || soort === "ring";
export const heeftAssen = (soort: GrafiekSoort) => !isCirkel(soort);

/** Excel-getalnotatie; Excel en LibreOffice tonen die met Nederlandse scheidingstekens. */
export function getalnotatie(decimalen: number, procent = false) {
  const d = Math.max(0, Math.min(6, Math.round(decimalen)));
  return `#,##0${d ? "." + "0".repeat(d) : ""}${procent ? "%" : ""}`;
}
/** Nederlandse weergave voor de voorvertoning. */
export function nlGetal(waarde: number, decimalen = 0) {
  return waarde.toLocaleString("nl-NL", {
    minimumFractionDigits: decimalen,
    maximumFractionDigits: decimalen,
  });
}

/** Controleert een model en geeft een Nederlandse foutmelding bij een probleem. */
export function controleerModel(model: GrafiekModel) {
  if (!SOORTEN.some((s) => s.soort === model.soort))
    throw new GrafiekFout("Onbekende grafieksoort.");
  if (!model.reeksen.length)
    throw new GrafiekFout("De grafiek heeft minstens één gegevensreeks nodig.");
  if (model.reeksen.length > LIMIETEN.reeksen)
    throw new GrafiekFout(
      `Een grafiek kan hier hoogstens ${LIMIETEN.reeksen} reeksen bevatten.`,
    );
  if (model.categorieen.length > LIMIETEN.categorieen)
    throw new GrafiekFout(
      `Een grafiek kan hier hoogstens ${LIMIETEN.categorieen} categorieën bevatten.`,
    );
  if (!model.categorieen.length)
    throw new GrafiekFout("De grafiek heeft minstens één categorie nodig.");
  for (const r of model.reeksen)
    if (r.waarden.length !== model.categorieen.length)
      throw new GrafiekFout(
        `Reeks ‘${r.naam}’ heeft niet evenveel waarden als er categorieën zijn.`,
      );
  if (!model.reeksen.some((r) => r.waarden.some((w) => w !== null && Number.isFinite(w))))
    throw new GrafiekFout("Er staan geen getallen in de gegevens.");
  if (model.soort === "combinatie" && model.reeksen.length < 2)
    throw new GrafiekFout(
      "Een combinatiegrafiek heeft minstens twee reeksen nodig: kolommen en een lijn.",
    );
  if (model.soort === "spreiding" && model.categorieen.some((c) => leesGetal(c) === null))
    throw new GrafiekFout(
      "Een spreidingsgrafiek heeft getallen als X-waarden nodig in de eerste kolom of rij.",
    );
  for (const t of [model.titel, model.ondertitel, model.asTitelX, model.asTitelY, model.asTitelY2])
    if (t.length > LIMIETEN.titel)
      throw new GrafiekFout(`Titels mogen hoogstens ${LIMIETEN.titel} tekens lang zijn.`);
  for (const r of model.reeksen)
    if (r.kleur && !/^[0-9A-Fa-f]{6}$/.test(r.kleur))
      throw new GrafiekFout(`Kleur ‘${r.kleur}’ is geen geldige kleur.`);
}

/** Leest een getal in Nederlandse of internationale notatie; null als het geen getal is. */
export function leesGetal(tekst: string | number | null | undefined): number | null {
  if (typeof tekst === "number") return Number.isFinite(tekst) ? tekst : null;
  if (tekst === null || tekst === undefined) return null;
  let t = String(tekst).trim().replace(/[\s €]/g, "");
  if (!t) return null;
  const procent = t.endsWith("%");
  if (procent) t = t.slice(0, -1);
  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  else if (/^[-+]?\d*,\d+$/.test(t)) t = t.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return procent ? n / 100 : n;
}

// ---------------------------------------------------------------------------
// Gegevens uit een raster (celbereik of gegevensblad) naar categorieën/reeksen.

export type Cel = string | number | null;
export interface Bereik {
  top: number;
  left: number;
  bottom: number;
  right: number;
}
export interface Gegevensopties {
  reeksenIn: "kolommen" | "rijen";
  koprij: boolean;
  kopkolom: boolean;
}
export interface Gegevensbron extends Gegevensopties {
  /** Bladnaam zoals in het werkboek. */
  blad: string;
  bereik: Bereik;
}

/** In een rekenblad (`strikt`) is tekst nooit een getal; in het gegevensblad wel als die zo leest. */
const isGetal = (c: Cel, strikt = false) =>
  typeof c === "number" || (!strikt && typeof c === "string" && leesGetal(c) !== null);
const isLeeg = (c: Cel) => c === null || (typeof c === "string" && !c.trim());

/** Herkent een koprij en kopkolom zoals Excel en LibreOffice dat doen. */
export function herkenKoppen(cellen: Cel[][], strikt = false): Gegevensopties {
  const rijen = cellen.length;
  const kolommen = Math.max(0, ...cellen.map((r) => r.length));
  const cel = (r: number, k: number) => cellen[r]?.[k] ?? null;
  // Koprij: de eerste rij bevat (op de hoek na) tekst terwijl eronder getallen staan.
  const eerstKolom = kolommen > 1 ? 1 : 0;
  let koprij = false;
  if (rijen > 1) {
    const kop = Array.from({ length: kolommen - eerstKolom }, (_, i) => cel(0, i + eerstKolom));
    const onder = Array.from({ length: kolommen - eerstKolom }, (_, i) => cel(1, i + eerstKolom));
    koprij =
      kop.some((c) => !isLeeg(c) && !isGetal(c, strikt)) &&
      onder.some((c) => isGetal(c, strikt));
    if (!koprij && isLeeg(cel(0, 0)) && kop.every((c) => !isLeeg(c)) && kolommen > 1)
      koprij = true;
  }
  let kopkolom = false;
  if (kolommen > 1) {
    const vanaf = koprij ? 1 : 0;
    const links = Array.from({ length: rijen - vanaf }, (_, i) => cel(i + vanaf, 0));
    const rechts = Array.from({ length: rijen - vanaf }, (_, i) => cel(i + vanaf, 1));
    kopkolom =
      links.some((c) => !isLeeg(c) && !isGetal(c, strikt)) && rechts.some((c) => isGetal(c, strikt));
    if (!kopkolom && koprij && isLeeg(cel(0, 0))) kopkolom = true;
  }
  const dataRijen = rijen - (koprij ? 1 : 0);
  const dataKolommen = kolommen - (kopkolom ? 1 : 0);
  // Zoals Excel: meer rijen dan kolommen → reeksen in kolommen.
  return {
    koprij,
    kopkolom,
    reeksenIn: dataRijen >= dataKolommen ? "kolommen" : "rijen",
  };
}

export function kolomLetters(col: number) {
  let letters = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}
const absoluut = (r: number, c: number) => `$${kolomLetters(c)}$${r + 1}`;
export function bladVerwijzing(blad: string) {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(blad) && !/^[A-Za-z]{1,3}\d+$/.test(blad)
    ? blad
    : `'${blad.replace(/'/g, "''")}'`;
}
export function verwijzing(blad: string, r1: number, c1: number, r2 = r1, c2 = c1) {
  const begin = absoluut(r1, c1);
  return `${bladVerwijzing(blad)}!${begin}${r1 === r2 && c1 === c2 ? "" : ":" + absoluut(r2, c2)}`;
}

const tekst = (c: Cel) => (c === null ? "" : typeof c === "number" ? nlGetal(c, c % 1 ? 2 : 0) : c.trim());

/**
 * Zet een raster om in categorieën en reeksen, met celverwijzingen als er een
 * blad en een bereik bekend zijn. Lege rijen/kolommen aan het eind tellen niet mee.
 */
export function gegevensUitRaster(
  cellen: Cel[][],
  opties: Gegevensopties,
  plaats?: { blad: string; top: number; left: number },
  /** Weergavetekst per cel (zoals het rekenblad die toont), voor namen en categorieën. */
  weergave?: string[][],
  /** Rekenblad: tekstcellen tellen als lege waarden, zoals in Excel. */
  strikt = false,
): Pick<GrafiekModel, "categorieen" | "categorieenRef" | "reeksen"> {
  const rijen = cellen.length;
  const kolommen = Math.max(0, ...cellen.map((r) => r.length));
  if (rijen * kolommen > LIMIETEN.cellen)
    throw new GrafiekFout(
      `Het bereik is te groot: hoogstens ${LIMIETEN.cellen.toLocaleString("nl-NL")} cellen.`,
    );
  const cel = (r: number, k: number) => cellen[r]?.[k] ?? null;
  const label = (r: number, k: number) => {
    const w = weergave?.[r]?.[k];
    return w !== undefined && w.trim() !== "" ? w.trim() : tekst(cel(r, k));
  };
  const dr = opties.koprij ? 1 : 0;
  const dk = opties.kopkolom ? 1 : 0;
  const inKolommen = opties.reeksenIn === "kolommen";
  // In ‘kolommen’-stand loopt de categorie langs de rijen.
  const aantalCat = inKolommen ? rijen - dr : kolommen - dk;
  const aantalReeks = inKolommen ? kolommen - dk : rijen - dr;
  if (aantalCat < 1 || aantalReeks < 1)
    throw new GrafiekFout("Het bereik bevat geen gegevens naast de kopteksten.");
  const waardeCel = (s: number, c: number) =>
    inKolommen ? [c + dr, s + dk] : [s + dr, c + dk];
  const abs = (r: number, k: number) => [r + (plaats?.top ?? 0), k + (plaats?.left ?? 0)];
  const ref = (r1: number, k1: number, r2 = r1, k2 = k1) => {
    if (!plaats) return undefined;
    const [a, b] = abs(r1, k1);
    const [c, d] = abs(r2, k2);
    return verwijzing(plaats.blad, a, b, c, d);
  };
  const categorieen: string[] = [];
  for (let c = 0; c < aantalCat; c++) {
    const kop = inKolommen
      ? opties.kopkolom
        ? label(c + dr, 0)
        : ""
      : opties.koprij
        ? label(0, c + dk)
        : "";
    categorieen.push(kop === "" ? String(c + 1) : kop);
  }
  const heeftCatKop = inKolommen ? opties.kopkolom : opties.koprij;
  const categorieenRef = heeftCatKop
    ? inKolommen
      ? ref(dr, 0, rijen - 1, 0)
      : ref(0, dk, 0, kolommen - 1)
    : undefined;
  const reeksen: Reeks[] = [];
  for (let s = 0; s < aantalReeks; s++) {
    const kop = inKolommen
      ? opties.koprij
        ? label(0, s + dk)
        : ""
      : opties.kopkolom
        ? label(s + dr, 0)
        : "";
    const heeftKop = inKolommen ? opties.koprij : opties.kopkolom;
    const waarden: (number | null)[] = [];
    for (let c = 0; c < aantalCat; c++) {
      const [r, k] = waardeCel(s, c);
      const w = cel(r, k);
      waarden.push(strikt && typeof w === "string" ? null : leesGetal(w));
    }
    const [r1, k1] = waardeCel(s, 0);
    const [r2, k2] = waardeCel(s, aantalCat - 1);
    reeksen.push({
      naam: kop || `Reeks ${s + 1}`,
      waarden,
      naamRef: heeftKop
        ? inKolommen
          ? ref(0, s + dk)
          : ref(s + dr, 0)
        : undefined,
      waardenRef: ref(r1, k1, r2, k2),
    });
  }
  return { categorieen, categorieenRef, reeksen };
}

/** Bouwt het gegevensblad (koprij + kopkolom) terug uit een model. */
export function rasterUitModel(model: GrafiekModel): string[][] {
  const kop = ["", ...model.reeksen.map((r) => r.naam)];
  const rijen = model.categorieen.map((c, i) => [
    c,
    ...model.reeksen.map((r) => {
      const w = r.waarden[i];
      return w === null || w === undefined ? "" : nlGetal(w, Number.isInteger(w) ? 0 : Math.min(6, String(w).split(".")[1]?.length ?? 0));
    }),
  ]);
  return [kop, ...rijen];
}

/** Leest tabgescheiden tekst (zoals uit een rekenblad gekopieerd) als raster. */
export function leesTabgescheiden(tekst: string): string[][] {
  const regels = tekst.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const raster = regels.map((r) => r.split("\t"));
  const breedte = Math.max(0, ...raster.map((r) => r.length));
  if (raster.length * breedte > LIMIETEN.cellen)
    throw new GrafiekFout("De geplakte gegevens zijn te groot voor een grafiek.");
  return raster.map((r) => [...r, ...Array(breedte - r.length).fill("")]);
}
