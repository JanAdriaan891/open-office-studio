/**
 * Welke lettertypen een document gebruikt en welke vervanger de app kiest
 * als een lettertype niet op deze computer staat (#22). Het document zelf
 * verandert niet: de oorspronkelijke naam blijft in het bestand staan.
 */
import { strFromU8, unzipSync } from "fflate";

export type Vervangingssoort = "metrisch" | "benadering";

export interface Vervanging {
  origineel: string;
  vervanger: string;
  soort: Vervangingssoort;
}

/**
 * Open vervangers met gelijke tekenbreedtes (metrisch) en, waar die niet
 * bestaan, een gangbare benadering. Sleutels in kleine letters. De
 * meegeleverde lettertypen staan in public/fonts.
 */
export const VERVANGINGEN: Record<string, { vervanger: string; soort: Vervangingssoort }> = {
  calibri: { vervanger: "Carlito", soort: "metrisch" },
  "calibri light": { vervanger: "Carlito", soort: "benadering" },
  cambria: { vervanger: "Caladea", soort: "metrisch" },
  "cambria math": { vervanger: "Caladea", soort: "benadering" },
  arial: { vervanger: "Liberation Sans", soort: "metrisch" },
  helvetica: { vervanger: "Liberation Sans", soort: "metrisch" },
  "helvetica neue": { vervanger: "Liberation Sans", soort: "benadering" },
  "arial narrow": { vervanger: "Liberation Sans", soort: "benadering" },
  "times new roman": { vervanger: "Liberation Serif", soort: "metrisch" },
  times: { vervanger: "Liberation Serif", soort: "metrisch" },
  "courier new": { vervanger: "Liberation Mono", soort: "metrisch" },
  courier: { vervanger: "Liberation Mono", soort: "metrisch" },
  georgia: { vervanger: "Gelasio", soort: "metrisch" },
  "comic sans ms": { vervanger: "Comic Relief", soort: "metrisch" },
  "segoe ui": { vervanger: "Open Sans", soort: "benadering" },
  tahoma: { vervanger: "Liberation Sans", soort: "benadering" },
  verdana: { vervanger: "Liberation Sans", soort: "benadering" },
  "trebuchet ms": { vervanger: "Source Sans 3", soort: "benadering" },
  aptos: { vervanger: "Inter", soort: "benadering" },
  "aptos display": { vervanger: "Inter", soort: "benadering" },
  consolas: { vervanger: "Liberation Mono", soort: "benadering" },
  "lucida console": { vervanger: "Liberation Mono", soort: "benadering" },
  "book antiqua": { vervanger: "Liberation Serif", soort: "benadering" },
  garamond: { vervanger: "Liberation Serif", soort: "benadering" },
  "century gothic": { vervanger: "Montserrat", soort: "benadering" },
};

/** Thema- en plaatshoudernamen die geen echt lettertype zijn. */
const GEEN_LETTERTYPE = /^(\+m[jn]-(lt|ea|cs)|\+[a-z]{2}-|minor|major)/i;

function voegToe(set: Map<string, string>, naam: string | undefined | null) {
  const n = (naam ?? "").trim();
  if (!n || n.length > 100 || GEEN_LETTERTYPE.test(n)) return;
  const sleutel = n.toLowerCase();
  if (!set.has(sleutel)) set.set(sleutel, n);
}

const ATTRIBUUT = (naam: string) =>
  new RegExp(`\\b${naam}="([^"]{1,100})"`, "g");

/** Alle lettertypenamen die een DOCX-, XLSX- of PPTX-pakket noemt. */
export function lettertypenInDocument(bytes: Uint8Array): string[] {
  const namen = new Map<string, string>();
  let delen: Record<string, Uint8Array>;
  try {
    delen = unzipSync(bytes, {
      filter: (f) =>
        /^(word\/(document|styles|fontTable|header\d*|footer\d*)\.xml|xl\/styles\.xml|ppt\/(slides\/slide|slideLayouts\/slideLayout|slideMasters\/slideMaster)\d+\.xml|(word|xl|ppt)\/theme\/theme\d+\.xml)$/.test(
          f.name,
        ) && f.originalSize < 32 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  for (const [pad, inhoud] of Object.entries(delen)) {
    const xml = strFromU8(inhoud);
    if (pad === "word/fontTable.xml") continue; // noemt ook ongebruikte lettertypen
    if (pad.startsWith("word/")) {
      for (const attr of ["w:ascii", "w:hAnsi"])
        for (const m of xml.matchAll(ATTRIBUUT(attr))) voegToe(namen, m[1]);
    }
    if (pad === "xl/styles.xml")
      for (const m of xml.matchAll(/<(?:\w+:)?name\s+val="([^"]{1,100})"/g)) voegToe(namen, m[1]);
    if (pad.includes("/theme/")) {
      // Alleen de Latijnse hoofd- en tekstlettertypen van het thema.
      for (const m of xml.matchAll(/<a:(?:major|minor)Font>\s*<a:latin\s+typeface="([^"]{1,100})"/g))
        voegToe(namen, m[1]);
    }
    if (pad.startsWith("ppt/"))
      for (const m of xml.matchAll(/<a:latin\s+typeface="([^"]{1,100})"/g)) voegToe(namen, m[1]);
  }
  return [...namen.values()].sort((a, b) => a.localeCompare(b));
}

/** De vervanger voor een lettertype dat niet beschikbaar is, of null als het er wel is. */
export function vervangerVoor(
  naam: string,
  beschikbaar: (familie: string) => boolean,
  gebundeld: (familie: string) => string | undefined,
): Vervanging | null {
  if (beschikbaar(naam)) return null;
  const regel = VERVANGINGEN[naam.toLowerCase()];
  if (regel) return { origineel: naam, vervanger: regel.vervanger, soort: regel.soort };
  const bundel = gebundeld(naam);
  if (bundel && bundel.toLowerCase() !== naam.toLowerCase())
    return { origineel: naam, vervanger: bundel, soort: "metrisch" };
  if (bundel) return null; // meegeleverd onder dezelfde naam
  // Laatste redmiddel, zoals Word: schreefloos of met schreef naar de naam.
  const schreef = /serif|roman|times|garamond|book|georgia|antiqua|minion|baskerville/i.test(naam) && !/sans/i.test(naam);
  return {
    origineel: naam,
    vervanger: schreef ? "Liberation Serif" : "Liberation Sans",
    soort: "benadering",
  };
}

/** Eén zin voor de melding bij het openen, of null als er niets is vervangen. */
export function vervangingsMelding(vervangingen: Vervanging[]) {
  if (!vervangingen.length) return null;
  const delen = vervangingen.map(
    (v) =>
      `${v.origineel} → ${v.vervanger}${v.soort === "metrisch" ? "" : " (benadering)"}`,
  );
  return `Lettertypen vervangen omdat ze niet op deze computer staan: ${delen.join(", ")}. In het bestand blijven de oorspronkelijke namen staan.`;
}
