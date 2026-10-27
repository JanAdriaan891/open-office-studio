/**
 * Kleine PDF-metadataparser (geen renderer): versie, versleuteld, aantal
 * pagina's en de Info-dictionary. Kijkt ook in objectstromen (PDF 1.5+) met
 * fflate, dat al in de app zit. Bedoeld voor de kaart op platforms waar de
 * webview geen PDF kan tonen; de echte weergave komt via de Rust-route.
 */
import { unzlibSync, inflateSync } from "fflate";

export interface PdfMeta {
  versie: string | null;
  versleuteld: boolean;
  /** null als het aantal niet te bepalen was. */
  paginas: number | null;
  titel?: string;
  auteur?: string;
  onderwerp?: string;
  maker?: string;
  producent?: string;
  aangemaakt?: Date;
  gewijzigd?: Date;
  /** Vermoedelijk beschadigd of afgekapt (geen %%EOF). */
  onvolledig: boolean;
}

const MAX_OBJECTSTROMEN = 200;
const MAX_UITGEPAKT = 64 * 1024 * 1024;

function alsLatijn(b: Uint8Array): string {
  // windows-1252 levert precies één teken per byte, dus posities blijven gelijk.
  return new TextDecoder("windows-1252").decode(b);
}

/** Decodeert een PDF-tekenreeks (bytes al uit de letterlijke of hex-notatie). */
export function pdfTekst(bytes: number[]): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return s;
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes.slice(3)));
  // PDFDocEncoding wijkt maar op een paar plaatsen af van Latin-1; voor titels is dit genoeg.
  return String.fromCharCode(...bytes);
}

/** Leest een letterlijke tekenreeks vanaf `(` op positie `i`; geeft bytes en eindpositie. */
function leesLetterlijk(s: string, i: number): [number[], number] {
  const uit: number[] = [];
  let diepte = 0;
  for (let p = i; p < s.length; p++) {
    const c = s[p];
    if (c === "\\") {
      const n = s[++p];
      const esc: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
      if (n in esc) uit.push(esc[n]);
      else if (n >= "0" && n <= "7") {
        let oct = n;
        while (oct.length < 3 && s[p + 1] >= "0" && s[p + 1] <= "7") oct += s[++p];
        uit.push(parseInt(oct, 8) & 0xff);
      } else if (n === "\r") {
        if (s[p + 1] === "\n") p++;
      } else if (n !== "\n") uit.push(n.charCodeAt(0) & 0xff);
      continue;
    }
    if (c === "(") {
      if (diepte++ === 0) continue;
    } else if (c === ")") {
      if (--diepte === 0) return [uit, p + 1];
    }
    uit.push(c.charCodeAt(0) & 0xff);
  }
  return [uit, s.length];
}

function leesHex(s: string, i: number): [number[], number] {
  const eind = s.indexOf(">", i);
  const hex = s.slice(i + 1, eind < 0 ? s.length : eind).replace(/[^0-9a-f]/gi, "");
  const uit: number[] = [];
  for (let p = 0; p < hex.length; p += 2) uit.push(parseInt((hex[p] + (hex[p + 1] ?? "0")), 16));
  return [uit, eind < 0 ? s.length : eind + 1];
}

/** Haalt `/Sleutel (waarde)` of `/Sleutel <hex>` uit een dictionary-tekst. */
export function dictTekst(dict: string, sleutel: string): string | undefined {
  const re = new RegExp(`/${sleutel}\\s*([(<])`);
  const m = re.exec(dict);
  if (!m) return undefined;
  const start = m.index + m[0].length - 1;
  if (m[1] === "<" && dict[start + 1] === "<") return undefined; // geneste dictionary
  const [bytes] = m[1] === "(" ? leesLetterlijk(dict, start) : leesHex(dict, start);
  const t = pdfTekst(bytes).replace(/\0/g, "").trim();
  return t || undefined;
}

/** Leest een PDF-datum `D:YYYYMMDDHHmmSS+HH'mm'`. */
export function pdfDatum(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?\s*([Zz+-])?\s*(\d{2})?'?(\d{2})?'?/.exec(s.trim());
  if (!m) return undefined;
  const [, j, mo = "01", d = "01", u = "00", mi = "00", se = "00", tz, tu = "00", tm = "00"] = m;
  let ms = Date.UTC(+j, +mo - 1, +d, +u, +mi, +se);
  if (tz === "+" || tz === "-") ms -= (tz === "+" ? 1 : -1) * (+tu * 60 + +tm) * 60_000;
  const datum = new Date(ms);
  return isNaN(datum.getTime()) ? undefined : datum;
}

/** Vindt de tekst van een dictionary die op `start` begint (`<<`), met nesting. */
function dictVanaf(s: string, start: number): string {
  let diepte = 0;
  for (let p = start; p < s.length - 1; p++) {
    const c = s[p];
    if (c === "(") { p = leesLetterlijk(s, p)[1] - 1; continue; }
    if (c === "<" && s[p + 1] === "<") { diepte++; p++; continue; }
    if (c === ">" && s[p + 1] === ">") {
      diepte--; p++;
      if (diepte === 0) return s.slice(start, p + 1);
    }
  }
  return s.slice(start, Math.min(s.length, start + 4096));
}

interface Objectbron {
  /** Tekst van object `nr` (het deel na "nr gen obj"), of undefined. */
  object(nr: number): string | undefined;
  /** Alle doorzoekbare teksten: hoofdbestand + uitgepakte objectstromen. */
  teksten: string[];
}

function bouwBron(bytes: Uint8Array, s: string, versleuteld: boolean): Objectbron {
  const teksten = [s];
  const inStroom = new Map<number, string>();
  // Objectstromen uitpakken (alleen FlateDecode, niet bij versleuteling).
  if (!versleuteld) {
    const re = /\/Type\s*\/ObjStm\b/g;
    let m: RegExpExecArray | null;
    let aantal = 0;
    let totaal = 0;
    while ((m = re.exec(s)) && aantal++ < MAX_OBJECTSTROMEN) {
      const objStart = s.lastIndexOf(" obj", m.index);
      if (objStart < 0) continue;
      const dict = dictVanaf(s, s.indexOf("<<", objStart));
      if (!/\/Filter\s*\/FlateDecode\b/.test(dict) && /\/Filter/.test(dict)) continue;
      const sm = /stream\r?\n/.exec(s.slice(objStart, objStart + dict.length + 256));
      if (!sm) continue;
      const dataStart = objStart + sm.index + sm[0].length;
      const lengte = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      let dataEind = lengte ? dataStart + +lengte[1] : s.indexOf("endstream", dataStart);
      if (dataEind < dataStart || dataEind > bytes.length) dataEind = s.indexOf("endstream", dataStart);
      if (dataEind < 0) continue;
      let uit: Uint8Array;
      try {
        const ruw = bytes.subarray(dataStart, dataEind);
        uit = /\/Filter/.test(dict) ? (() => { try { return unzlibSync(ruw); } catch { return inflateSync(ruw.subarray(2)); } })() : ruw;
      } catch {
        continue;
      }
      totaal += uit.length;
      if (totaal > MAX_UITGEPAKT) break;
      const t = alsLatijn(uit);
      teksten.push(t);
      const n = +(/\/N\s+(\d+)/.exec(dict)?.[1] ?? 0);
      const first = +(/\/First\s+(\d+)/.exec(dict)?.[1] ?? 0);
      const kop = t.slice(0, first).trim().split(/\s+/).map(Number);
      for (let i = 0; i + 1 < kop.length && i / 2 < n; i += 2) {
        const begin = first + kop[i + 1];
        const eind = i + 3 < kop.length ? first + kop[i + 3] : t.length;
        inStroom.set(kop[i], t.slice(begin, eind));
      }
    }
  }
  return {
    teksten,
    object(nr) {
      const re = new RegExp(`(?:^|[^0-9])${nr}\\s+\\d+\\s+obj\\b`, "g");
      let laatste: RegExpExecArray | null = null;
      let m: RegExpExecArray | null;
      // De laatste definitie wint (incrementele updates).
      while ((m = re.exec(s))) laatste = m;
      if (laatste) {
        const begin = laatste.index + laatste[0].length;
        const eind = s.indexOf("endobj", begin);
        return s.slice(begin, eind < 0 ? begin + 8192 : eind);
      }
      return inStroom.get(nr);
    },
  };
}

export function leesPdfMeta(bytes: Uint8Array): PdfMeta {
  const s = alsLatijn(bytes);
  const versie = /%PDF-(\d\.\d)/.exec(s.slice(0, 1024))?.[1] ?? null;
  const staart = s.slice(-2048);
  const onvolledig = !staart.includes("%%EOF");
  const versleuteld = /\/Encrypt\s+(\d+\s+\d+\s+R|<<)/.test(s);
  const bron = bouwBron(bytes, s, versleuteld);

  // Pagina's tellen: bladobjecten "/Type /Page" (niet /Pages).
  let bladen = 0;
  let maxCount = 0;
  for (const t of bron.teksten) {
    bladen += (t.match(/\/Type\s*\/Page(?![A-Za-z0-9])/g) ?? []).length;
    const re = /\/Type\s*\/Pages\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const begin = t.lastIndexOf("<<", m.index);
      const dict = dictVanaf(t, begin < 0 ? m.index : begin);
      const c = /\/Count\s+(\d+)/.exec(dict);
      if (c) maxCount = Math.max(maxCount, +c[1]);
    }
  }
  // Incrementele updates kunnen bladobjecten dubbel bevatten; de wortel-/Count is dan betrouwbaarder.
  const paginas = maxCount > 0 ? maxCount : bladen > 0 ? bladen : null;

  const meta: PdfMeta = { versie, versleuteld, paginas, onvolledig };
  if (!versleuteld) {
    const infoRefs = [...s.matchAll(/\/Info\s+(\d+)\s+\d+\s+R/g)];
    let info: string | undefined;
    if (infoRefs.length) info = bron.object(+infoRefs[infoRefs.length - 1][1]);
    else {
      const direct = /\/Info\s*<</.exec(s);
      if (direct) info = dictVanaf(s, direct.index + direct[0].length - 2);
    }
    if (info) {
      meta.titel = dictTekst(info, "Title");
      meta.auteur = dictTekst(info, "Author");
      meta.onderwerp = dictTekst(info, "Subject");
      meta.maker = dictTekst(info, "Creator");
      meta.producent = dictTekst(info, "Producer");
      meta.aangemaakt = pdfDatum(dictTekst(info, "CreationDate"));
      meta.gewijzigd = pdfDatum(dictTekst(info, "ModDate"));
    }
  }
  return meta;
}
