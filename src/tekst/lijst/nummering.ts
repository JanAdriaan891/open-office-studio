/**
 * Lijstdefinities in `word/numbering.xml`. De engine kan alleen bestaande
 * nummeringen aan alinea's hangen (`numPr`); een nieuwe notatie, een eigen
 * opsommingsteken of opnieuw beginnen vraagt een nieuwe `w:abstractNum` of
 * `w:num`. Dat gaat via de pakketroute.
 */
import { Pakket } from "../../grafieken/pakket.ts";
import { attr, attrTekst, elementen, kind, kinderen, leesXml, ontsnap, vervang, type XmlElement } from "../../grafieken/xml.ts";

export type NummerNotatie = "decimal" | "lowerLetter" | "upperLetter" | "lowerRoman" | "upperRoman" | "bullet";

export interface Niveau {
  numFmt: NummerNotatie;
  /** Bijvoorbeeld `%1.` of `%1.%2.` of een opsommingsteken. */
  lvlText: string;
  /** Lettertype voor het teken (opsommingen). */
  font?: string;
}

export interface LijstSjabloon {
  id: string;
  naam: string;
  soort: "opsomming" | "nummering" | "niveaus";
  niveaus: Niveau[];
}

const ROTATIE: NummerNotatie[] = ["decimal", "lowerLetter", "lowerRoman"];

function nummering(eerste: NummerNotatie, scheiding: "." | ")"): Niveau[] {
  const begin = ROTATIE.indexOf(eerste);
  return Array.from({ length: 9 }, (_, i) => {
    const numFmt = i === 0 ? eerste : ROTATIE[((begin < 0 ? 0 : begin) + i) % ROTATIE.length];
    return { numFmt, lvlText: `%${i + 1}${scheiding}` };
  });
}

const TEKENS: Record<string, string> = {
  "•": "Arial",
  "○": "Arial",
  "▪": "Arial",
  "–": "Arial",
  "➢": "Segoe UI Symbol",
  "✓": "Segoe UI Symbol",
  "♦": "Segoe UI Symbol",
  "★": "Segoe UI Symbol",
};
const CYCLUS = ["•", "○", "▪"];

function opsomming(teken: string): Niveau[] {
  return Array.from({ length: 9 }, (_, i) => {
    const t = i === 0 ? teken : CYCLUS[i % CYCLUS.length];
    return { numFmt: "bullet", lvlText: t, font: TEKENS[t] ?? "Arial" };
  });
}

export const opsommingstekens = Object.keys(TEKENS);

export const lijstSjablonen: LijstSjabloon[] = [
  ...opsommingstekens.map((t) => ({ id: `teken:${t}`, naam: `Opsomming ${t}`, soort: "opsomming" as const, niveaus: opsomming(t) })),
  { id: "num:1.", naam: "1. 2. 3.", soort: "nummering", niveaus: nummering("decimal", ".") },
  { id: "num:1)", naam: "1) 2) 3)", soort: "nummering", niveaus: nummering("decimal", ")") },
  { id: "num:a.", naam: "a. b. c.", soort: "nummering", niveaus: nummering("lowerLetter", ".") },
  { id: "num:a)", naam: "a) b) c)", soort: "nummering", niveaus: nummering("lowerLetter", ")") },
  { id: "num:i.", naam: "i. ii. iii.", soort: "nummering", niveaus: nummering("lowerRoman", ".") },
  {
    id: "num:A.",
    naam: "A. B. C.",
    soort: "nummering",
    niveaus: [{ numFmt: "upperLetter", lvlText: "%1." }, ...nummering("decimal", ".").slice(1)],
  },
  {
    id: "num:I.",
    naam: "I. II. III.",
    soort: "nummering",
    niveaus: [{ numFmt: "upperRoman", lvlText: "%1." }, ...nummering("lowerLetter", ".").slice(1)],
  },
  { id: "niv:1.a.i.", naam: "1. a. i.", soort: "niveaus", niveaus: nummering("decimal", ".") },
  {
    id: "niv:1.1.1.",
    naam: "1. 1.1. 1.1.1.",
    soort: "niveaus",
    niveaus: Array.from({ length: 9 }, (_, i) => ({
      numFmt: "decimal" as const,
      lvlText: Array.from({ length: i + 1 }, (_, j) => `%${j + 1}.`).join(""),
    })),
  },
  {
    id: "niv:A.1.a.",
    naam: "A. 1. a.",
    soort: "niveaus",
    niveaus: [
      { numFmt: "upperLetter", lvlText: "%1." },
      { numFmt: "decimal", lvlText: "%2." },
      { numFmt: "lowerLetter", lvlText: "%3)" },
      ...nummering("lowerRoman", ")").slice(3),
    ],
  },
  { id: "niv:•○▪", naam: "• ○ ▪", soort: "niveaus", niveaus: opsomming("•") },
];

export const sjabloon = (id: string) => lijstSjablonen.find((s) => s.id === id);

// --- Voorbeeld en weergave -------------------------------------------------

function romeins(n: number) {
  const tabel: [number, string][] = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let uit = "";
  for (const [waarde, teken] of tabel) while (n >= waarde) (uit += teken), (n -= waarde);
  return uit;
}
function letters(n: number) {
  // Word: a..z, dan aa..zz, aaa..
  const herhaal = Math.floor((n - 1) / 26) + 1;
  return String.fromCharCode(97 + ((n - 1) % 26)).repeat(herhaal);
}

/** Een getal in een notatie, zoals Word het toont. */
export function getalIn(notatie: NummerNotatie, n: number): string {
  switch (notatie) {
    case "decimal":
      return String(n);
    case "lowerLetter":
      return letters(n);
    case "upperLetter":
      return letters(n).toUpperCase();
    case "lowerRoman":
      return romeins(n);
    case "upperRoman":
      return romeins(n).toUpperCase();
    case "bullet":
      return "";
  }
}

/** De markering van een lijstitem, gegeven de tellers per niveau. */
export function markering(niveaus: readonly Niveau[], ilvl: number, tellers: readonly number[]): string {
  const niveau = niveaus[ilvl];
  if (!niveau) return "";
  if (niveau.numFmt === "bullet") return niveau.lvlText;
  return niveau.lvlText.replace(/%(\d)/g, (_, d) => {
    const i = Number(d) - 1;
    return getalIn(niveaus[i]?.numFmt === "bullet" ? "decimal" : (niveaus[i]?.numFmt ?? "decimal"), tellers[i] ?? 1);
  });
}

// --- numbering.xml lezen ----------------------------------------------------

export interface GelezenNiveau {
  ilvl: number;
  numFmt: string;
  lvlText: string;
  start: number;
}
export interface GelezenNummering {
  nums: Map<number, { abstractNumId: number; startOverrides: Map<number, number> }>;
  abstracts: Map<number, GelezenNiveau[]>;
}

const getal = (w: string | undefined, standaard = 0) => {
  const n = Number(w);
  return Number.isFinite(n) ? n : standaard;
};

export function leesNummering(xml: string | null): GelezenNummering {
  const uit: GelezenNummering = { nums: new Map(), abstracts: new Map() };
  if (!xml) return uit;
  const wortel = leesXml(xml);
  for (const a of kinderen(wortel, "abstractNum")) {
    uit.abstracts.set(
      getal(attr(a, "abstractNumId")),
      kinderen(a, "lvl").map((l) => ({
        ilvl: getal(attr(l, "ilvl")),
        numFmt: attr(kind(l, "numFmt"), "val") ?? "decimal",
        lvlText: attr(kind(l, "lvlText"), "val") ?? "",
        start: getal(attr(kind(l, "start"), "val"), 1),
      })),
    );
  }
  for (const n of kinderen(wortel, "num")) {
    const overrides = new Map<number, number>();
    for (const o of kinderen(n, "lvlOverride")) {
      const s = kind(o, "startOverride");
      if (s) overrides.set(getal(attr(o, "ilvl")), getal(attr(s, "val"), 1));
    }
    uit.nums.set(getal(attr(n, "numId")), { abstractNumId: getal(attr(kind(n, "abstractNumId"), "val")), startOverrides: overrides });
  }
  return uit;
}

/** Vrije ids voor een nieuwe lijst. */
export function vrijeIds(n: GelezenNummering) {
  return {
    numId: Math.max(0, ...n.nums.keys()) + 1,
    abstractNumId: Math.max(-1, ...n.abstracts.keys()) + 1,
  };
}

// --- numbering.xml schrijven ------------------------------------------------

function lvlXml(niveau: Niveau, ilvl: number, start: number) {
  const tekens = niveau.font
    ? `<w:rPr><w:rFonts${attrTekst({ "w:ascii": niveau.font, "w:hAnsi": niveau.font, "w:hint": "default" })}/></w:rPr>`
    : "";
  return (
    `<w:lvl${attrTekst({ "w:ilvl": ilvl })}>` +
    `<w:start${attrTekst({ "w:val": start })}/>` +
    `<w:numFmt${attrTekst({ "w:val": niveau.numFmt })}/>` +
    `<w:lvlText w:val="${ontsnap(niveau.lvlText)}"/>` +
    `<w:lvlJc w:val="left"/>` +
    `<w:pPr><w:ind${attrTekst({ "w:left": 720 * (ilvl + 1), "w:hanging": 360 })}/></w:pPr>` +
    tekens +
    `</w:lvl>`
  );
}

/** Een complete lijstdefinitie met negen niveaus. */
export function abstractNumXml(s: LijstSjabloon, abstractNumId: number, beginBij = 1) {
  const nsid = ((abstractNumId * 2654435761) >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return (
    `<w:abstractNum${attrTekst({ "w:abstractNumId": abstractNumId })}>` +
    `<w:nsid${attrTekst({ "w:val": nsid })}/>` +
    `<w:multiLevelType w:val="${s.soort === "niveaus" ? "multilevel" : "hybridMultilevel"}"/>` +
    s.niveaus.map((n, i) => lvlXml(n, i, i === 0 ? beginBij : 1)).join("") +
    `</w:abstractNum>`
  );
}

export function numXml(numId: number, abstractNumId: number, startOverride?: { ilvl: number; start: number }) {
  return (
    `<w:num${attrTekst({ "w:numId": numId })}><w:abstractNumId${attrTekst({ "w:val": abstractNumId })}/>` +
    (startOverride
      ? `<w:lvlOverride${attrTekst({ "w:ilvl": startOverride.ilvl })}><w:startOverride${attrTekst({ "w:val": startOverride.start })}/></w:lvlOverride>`
      : "") +
    `</w:num>`
  );
}

export const LEGE_NUMMERING =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>';

/**
 * Voegt een `w:abstractNum` (optioneel) en een `w:num` toe op de plaats die het
 * schema vraagt: lijstdefinities vóór de nummeringen, en beide vóór
 * `w:numIdMacAtCleanup`.
 */
export function voegToe(xml: string, toevoeging: { abstractNum?: string; num: string }) {
  const wortel = leesXml(xml);
  const kids = elementen(wortel);
  const laatsteAbstract = [...kids].reverse().find((k) => k.lokaal === "abstractNum");
  const eersteNum = kids.find((k) => k.lokaal === "num");
  const opruimen = kids.find((k) => k.lokaal === "numIdMacAtCleanup");
  const plek = (el: XmlElement | undefined, achter: boolean) => (el ? (achter ? el.eind : el.start) : null);
  const vervangingen = [];
  if (wortel.leeg) {
    return vervang(xml, [
      {
        start: wortel.inhoudStart - 2,
        eind: wortel.eind,
        tekst: `>${toevoeging.abstractNum ?? ""}${toevoeging.num}</${wortel.naam}>`,
      },
    ]);
  }
  const abstractPlek = plek(laatsteAbstract, true) ?? plek(eersteNum, false) ?? plek(opruimen, false) ?? wortel.inhoudEind;
  const numPlek = plek(opruimen, false) ?? wortel.inhoudEind;
  if (toevoeging.abstractNum) vervangingen.push({ start: abstractPlek, eind: abstractPlek, tekst: toevoeging.abstractNum });
  if (abstractPlek === numPlek && toevoeging.abstractNum)
    vervangingen[0].tekst += toevoeging.num;
  else vervangingen.push({ start: numPlek, eind: numPlek, tekst: toevoeging.num });
  return vervang(xml, vervangingen);
}

const NUMMERING_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml";
const NUMMERING_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering";

/** Pad van numbering.xml via de relatie van document.xml; maakt het onderdeel aan als het ontbreekt. */
function nummeringPad(pakket: Pakket, aanmaken: boolean) {
  const rel = pakket.relaties("word/document.xml").find((r) => r.type === NUMMERING_REL && !r.extern);
  if (rel) return Pakket.doelPad("word/document.xml", rel.target);
  if (!aanmaken) return null;
  const pad = "word/numbering.xml";
  pakket.schrijf(pad, LEGE_NUMMERING);
  pakket.voegRelatieToe("word/document.xml", NUMMERING_REL, pad);
  pakket.voegOverrideToe(pad, NUMMERING_TYPE);
  return pad;
}

export function leesNummeringUitPakket(bytes: Uint8Array): GelezenNummering {
  const pakket = new Pakket(bytes);
  const pad = nummeringPad(pakket, false);
  return leesNummering(pad && pakket.heeft(pad) ? pakket.lees(pad) : null);
}

export type NummeringWijziging =
  /** Nieuwe lijst volgens een sjabloon, met deze ids. */
  | { soort: "sjabloon"; sjabloon: LijstSjabloon; numId: number; abstractNumId: number; beginBij?: number }
  /** Nieuwe nummering op een bestaande definitie, die opnieuw begint. */
  | { soort: "opnieuw"; numId: number; abstractNumId: number; ilvl: number; beginBij: number };

/** Voegt de definitie toe aan DOCX-bytes (de alinea's verwijzen er al naar). */
export function pasNummeringToe(bytes: Uint8Array, w: NummeringWijziging): Uint8Array {
  const pakket = new Pakket(bytes);
  const pad = nummeringPad(pakket, true)!;
  const xml = pakket.heeft(pad) ? pakket.lees(pad) : LEGE_NUMMERING;
  const nieuw =
    w.soort === "sjabloon"
      ? voegToe(xml, { abstractNum: abstractNumXml(w.sjabloon, w.abstractNumId, w.beginBij ?? 1), num: numXml(w.numId, w.abstractNumId) })
      : voegToe(xml, { num: numXml(w.numId, w.abstractNumId, { ilvl: w.ilvl, start: w.beginBij }) });
  pakket.schrijf(pad, nieuw);
  return pakket.inpakken();
}
