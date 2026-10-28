/** Tekstcodering herkennen en (een begrensd deel van) tekst decoderen. */

export type Codering = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "windows-1252";

export const CODERINGNAAM: Record<Codering, string> = {
  "utf-8": "UTF-8",
  "utf-8-bom": "UTF-8 (met BOM)",
  "utf-16le": "UTF-16 LE",
  "utf-16be": "UTF-16 BE",
  "windows-1252": "Windows-1252",
};

/**
 * Is `b` geldige UTF-8? Met `afgeknipt` (alleen het begin van een groter
 * bestand) telt een onvolledig teken aan het einde als geldig.
 */
export function isGeldigeUtf8(b: Uint8Array, afgeknipt = false): boolean {
  let i = 0;
  const n = b.length;
  while (i < n) {
    const c = b[i];
    if (c < 0x80) { i++; continue; }
    let extra: number;
    let min: number;
    if (c >= 0xc2 && c <= 0xdf) { extra = 1; min = 0x80; }
    else if (c >= 0xe0 && c <= 0xef) { extra = 2; min = 0x800; }
    else if (c >= 0xf0 && c <= 0xf4) { extra = 3; min = 0x10000; }
    else return false;
    if (i + extra >= n) {
      if (!afgeknipt) return false;
      // Afgeknipt aan het einde: controleer alleen de aanwezige vervolgbytes.
      for (let j = i + 1; j < n; j++) if ((b[j] & 0xc0) !== 0x80) return false;
      return true;
    }
    let cp = c & (extra === 1 ? 0x1f : extra === 2 ? 0x0f : 0x07);
    for (let j = 1; j <= extra; j++) {
      const v = b[i + j];
      if ((v & 0xc0) !== 0x80) return false;
      cp = (cp << 6) | (v & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return false;
    i += extra + 1;
  }
  return true;
}

export function detecteerCodering(b: Uint8Array, afgeknipt = false): Codering {
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return "utf-8-bom";
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return "utf-16le";
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return "utf-16be";
  return isGeldigeUtf8(b, afgeknipt) ? "utf-8" : "windows-1252";
}

export interface GedecodeerdeTekst {
  tekst: string;
  codering: Codering;
  /** Is alleen het begin getoond? */
  afgekapt: boolean;
}

/**
 * Decodeert maximaal `maxBytes` bytes. De codering wordt op dat begin bepaald
 * (zodat een gigantisch bestand niet volledig gescand hoeft te worden).
 */
export function decodeerTekst(b: Uint8Array, maxBytes = Infinity): GedecodeerdeTekst {
  const afgekapt = b.length > maxBytes;
  let deel = afgekapt ? b.subarray(0, maxBytes) : b;
  const codering = detecteerCodering(deel, afgekapt);
  if (codering.startsWith("utf-16") && deel.length % 2 === 1) deel = deel.subarray(0, deel.length - 1);
  const label = codering === "utf-8-bom" ? "utf-8" : codering;
  // TextDecoder verwijdert de BOM zelf (ignoreBOM = false).
  let tekst = new TextDecoder(label).decode(deel);
  // Een afgeknipt UTF-8-teken aan het einde levert U+FFFD op; weghalen.
  if (afgekapt) tekst = tekst.replace(/\uFFFD$/, "");
  return { tekst, codering, afgekapt };
}
