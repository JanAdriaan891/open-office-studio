/**
 * Doorzoekbare keuzelijst en een bronbereik dat meegroeit (#376).
 *
 * Zoeken: typen filtert de keuzes (hoofdletters en accenten tellen niet mee;
 * meerdere woorden moeten allemaal voorkomen). Treffers aan het begin staan
 * vooraan.
 *
 * Meegroeien: staat de bron in één kolom (of één rij) en staan er direct
 * eronder (of rechts ervan) nieuwe waarden, dan kan de bron tot en met de
 * laatste aaneengesloten waarde worden uitgebreid.
 */
import type { WorkbookHandle } from "@betteroffice/xlsx";
import {
  adres,
  MAX_KOLOMMEN,
  MAX_RIJEN,
  ontleedVerwijzing,
  type Bereik,
} from "../lint/rekenblad-logica";

const kaal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** De keuzes die bij de zoektekst passen, begin-treffers eerst, verder in bronvolgorde. */
export function filterKeuzes<T extends { tekst: string }>(opties: T[], zoek: string): T[] {
  const woorden = kaal(zoek).split(/\s+/).filter(Boolean);
  if (!woorden.length) return opties;
  const begin: T[] = [];
  const rest: T[] = [];
  for (const o of opties) {
    const t = kaal(o.tekst);
    if (!woorden.every((w) => t.includes(w))) continue;
    (t.startsWith(woorden[0]) ? begin : rest).push(o);
  }
  return [...begin, ...rest];
}

/** Zoveel cellen kijkt het meegroeien hooguit vooruit. */
export const MAX_GROEI = 1000;

export interface Brongroei {
  /** Index van het bronblad. */
  blad: number;
  /** Het bereik inclusief de nieuwe waarden. */
  bereik: Bereik;
  /** Aantal waarden dat erbij komt. */
  aantal: number;
  /** De nieuwe bronformule, in dezelfde schrijfwijze (blad, dollartekens). */
  formule: string;
}

const absoluut = (b: Bereik) =>
  `$${adres({ row: b.top, col: b.left }).replace(/(\d+)$/, "$$$1")}:$${adres({ row: b.bottom, col: b.right }).replace(/(\d+)$/, "$$$1")}`;

/**
 * Het aantal aaneengesloten gevulde cellen direct na een bron van één kolom
 * (omlaag) of één rij (naar rechts). `gevuld` leest één cel.
 */
export function groeiAantal(bereik: Bereik, gevuld: (row: number, col: number) => boolean, max = MAX_GROEI): number {
  const kolom = bereik.left === bereik.right;
  const rij = bereik.top === bereik.bottom;
  if (!kolom && !rij) return 0;
  // Eén losse cel groeit omlaag, zoals een lijst die met één waarde begint.
  let n = 0;
  while (n < max) {
    const row = kolom ? bereik.bottom + 1 + n : bereik.top;
    const col = kolom ? bereik.left : bereik.right + 1 + n;
    if (row >= MAX_RIJEN || col >= MAX_KOLOMMEN || !gevuld(row, col)) break;
    n++;
  }
  return n;
}

/**
 * Of de bron van een lijstregel kan meegroeien, en naar welk bereik. Null bij
 * een vaste lijst ("a,b"), een naam, een formule of als er niets bijkomt.
 */
export function bronGroei(h: WorkbookHandle, blad: number, formule: string): Brongroei | null {
  const f = formule.replace(/^=/, "").trim();
  if (!f || f.startsWith('"')) return null;
  const ref = ontleedVerwijzing(f);
  if (!ref) return null;
  const info = h.sheetInfo();
  const index = ref.blad
    ? info.sheetNames.findIndex((n) => n.toLowerCase() === ref.blad!.toLowerCase())
    : blad;
  if (index < 0) return null;
  const aantal = groeiAantal(ref.bereik, (row, col) => h.cell(index, row, col).input !== "");
  if (!aantal) return null;
  const kolom = ref.bereik.left === ref.bereik.right;
  const bereik: Bereik = kolom
    ? { ...ref.bereik, bottom: ref.bereik.bottom + aantal }
    : { ...ref.bereik, right: ref.bereik.right + aantal };
  const voorvoegsel = f.includes("!") ? f.slice(0, f.lastIndexOf("!") + 1) : "";
  return { blad: index, bereik, aantal, formule: voorvoegsel + absoluut(bereik) };
}

const ANKER = /^_OpenAEC_Validation_\d+_(\d+)_formula1$/i;

/**
 * De engine-op die de bron van lijstregel `index` op `blad` uitbreidt. De
 * bron staat in een verborgen ankernaam, zodat de wijziging één
 * ongedaan-maakstap is en bij opslaan in de regel terechtkomt. Null als het
 * anker ontbreekt of niet (meer) bij deze bronformule hoort.
 */
export function groeiOp(
  namen: { name: string; refersTo: string; scope: number | null }[],
  blad: number,
  index: number,
  formule: string,
  groei: Brongroei,
) {
  const gelijk = (a: string, b: string) =>
    a.replace(/^=/, "").replace(/\s/g, "").toLowerCase() === b.replace(/^=/, "").replace(/\s/g, "").toLowerCase();
  const anker = namen.find((n) => n.scope === blad && Number(ANKER.exec(n.name)?.[1] ?? -1) === index);
  if (!anker || !gelijk(anker.refersTo, formule)) return null;
  return {
    type: "setDefinedName" as const,
    name: anker.name,
    refers_to: groei.formule,
    scope: blad,
    hidden: true,
  };
}
