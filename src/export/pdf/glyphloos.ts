/**
 * Een minimaal, geldig TrueType-lettertype zonder zichtbare tekens.
 *
 * De PDF legt de tekst onzichtbaar (tekenmodus 3) over het paginabeeld, zodat
 * tekst selecteerbaar en doorzoekbaar is. Daarvoor is een ingesloten
 * lettertype nodig; dit lettertype heeft twee lege glyphs en vaste breedtes.
 * Het idee is hetzelfde als het "glyphless font" van Tesseract-PDF's, maar
 * dit bestand wordt hier volledig zelf opgebouwd (geen externe bron).
 */

const UPEM = 1000;
/** Voortgang van elke glyph in eenheden van 1/1000 em. */
export const GLYPH_BREEDTE = 500;

class Schrijver {
  private delen: number[] = [];
  u8(n: number) {
    this.delen.push(n & 0xff);
  }
  u16(n: number) {
    this.u8(n >> 8);
    this.u8(n);
  }
  i16(n: number) {
    this.u16(n < 0 ? n + 0x10000 : n);
  }
  u32(n: number) {
    this.u16(Math.floor(n / 0x10000) & 0xffff);
    this.u16(n & 0xffff);
  }
  i64(n: number) {
    this.u32(Math.floor(n / 2 ** 32));
    this.u32(n >>> 0);
  }
  tekst(s: string) {
    for (const c of s) this.u8(c.charCodeAt(0));
  }
  bytes() {
    return Uint8Array.from(this.delen);
  }
}

function tabel(vul: (w: Schrijver) => void) {
  const w = new Schrijver();
  vul(w);
  return w.bytes();
}

function controlesom(data: Uint8Array) {
  let som = 0;
  const lengte = Math.ceil(data.length / 4) * 4;
  for (let i = 0; i < lengte; i += 4) {
    const v =
      ((data[i] ?? 0) << 24) |
      ((data[i + 1] ?? 0) << 16) |
      ((data[i + 2] ?? 0) << 8) |
      (data[i + 3] ?? 0);
    som = (som + (v >>> 0)) >>> 0;
  }
  return som;
}

let cache: Uint8Array | null = null;

/** De bytes van het glyphloze TrueType-lettertype (twee lege glyphs). */
export function glyphloosLettertype(): Uint8Array {
  if (cache) return cache;
  const aantalGlyphs = 2;
  // Mac-epoch (1904) tot 2024-01-01, vast zodat de uitvoer reproduceerbaar is.
  const datum = 3786825600;
  const head = tabel((w) => {
    w.u32(0x00010000); // versie
    w.u32(0x00010000); // fontRevision
    w.u32(0); // checkSumAdjustment (later)
    w.u32(0x5f0f3cf5); // magic
    w.u16(0x000b); // flags
    w.u16(UPEM);
    w.i64(datum);
    w.i64(datum);
    w.i16(0);
    w.i16(-200);
    w.i16(GLYPH_BREEDTE);
    w.i16(800);
    w.u16(0); // macStyle
    w.u16(8); // lowestRecPPEM
    w.i16(2); // fontDirectionHint
    w.i16(0); // indexToLocFormat: kort
    w.i16(0); // glyphDataFormat
  });
  const hhea = tabel((w) => {
    w.u32(0x00010000);
    w.i16(800); // ascender
    w.i16(-200); // descender
    w.i16(0); // lineGap
    w.u16(GLYPH_BREEDTE); // advanceWidthMax
    w.i16(0);
    w.i16(0);
    w.i16(GLYPH_BREEDTE);
    w.i16(1);
    w.i16(0);
    w.i16(0);
    for (let i = 0; i < 4; i++) w.i16(0);
    w.i16(0); // metricDataFormat
    w.u16(aantalGlyphs); // numberOfHMetrics
  });
  const maxp = tabel((w) => {
    w.u32(0x00010000);
    w.u16(aantalGlyphs);
    w.u16(0); // maxPoints
    w.u16(0); // maxContours
    w.u16(0);
    w.u16(0);
    w.u16(1); // maxZones
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
  });
  // Glyph 1: geen contouren (12 bytes); glyph 0 leeg.
  const glyf = tabel((w) => {
    w.i16(0); // numberOfContours
    w.i16(0);
    w.i16(0);
    w.i16(0);
    w.i16(0);
    w.u16(0); // instructionLength
  });
  const loca = tabel((w) => {
    w.u16(0);
    w.u16(0);
    w.u16(glyf.length / 2);
  });
  const hmtx = tabel((w) => {
    for (let i = 0; i < aantalGlyphs; i++) {
      w.u16(GLYPH_BREEDTE);
      w.i16(0);
    }
  });
  // cmap: formaat 4 met de spatie op glyph 1 (de PDF gebruikt CIDToGIDMap).
  const cmap = tabel((w) => {
    w.u16(0);
    w.u16(1);
    w.u16(3);
    w.u16(1);
    w.u32(12);
    const segmenten = 2;
    w.u16(4);
    w.u16(16 + segmenten * 8);
    w.u16(0);
    w.u16(segmenten * 2); // segCountX2
    w.u16(4); // searchRange
    w.u16(1); // entrySelector
    w.u16(0); // rangeShift
    w.u16(0x0020); // endCode
    w.u16(0xffff);
    w.u16(0); // reservedPad
    w.u16(0x0020); // startCode
    w.u16(0xffff);
    w.i16(1 - 0x20); // idDelta
    w.i16(1);
    w.u16(0); // idRangeOffset
    w.u16(0);
  });
  const naam = "OOSGlyphless";
  const nameT = tabel((w) => {
    const records = [1, 2, 4, 6];
    const waarden = [naam, "Regular", naam, naam];
    w.u16(0);
    w.u16(records.length);
    w.u16(6 + records.length * 12);
    let positie = 0;
    records.forEach((id, i) => {
      w.u16(3);
      w.u16(1);
      w.u16(0x0409);
      w.u16(id);
      w.u16(waarden[i].length * 2);
      w.u16(positie);
      positie += waarden[i].length * 2;
    });
    for (const waarde of waarden)
      for (const c of waarde) w.u16(c.charCodeAt(0));
  });
  const os2 = tabel((w) => {
    w.u16(4);
    w.i16(GLYPH_BREEDTE);
    w.u16(400);
    w.u16(5);
    w.u16(0); // fsType: insluiten toegestaan
    for (let i = 0; i < 10; i++) w.i16(0);
    w.i16(0); // sFamilyClass
    for (let i = 0; i < 10; i++) w.u8(0); // panose
    for (let i = 0; i < 4; i++) w.u32(0);
    w.tekst("NONE");
    w.u16(0x40); // fsSelection: regular
    w.u16(0x20);
    w.u16(0xfffd);
    w.i16(800);
    w.i16(-200);
    w.i16(0);
    w.u16(800);
    w.u16(200);
    w.u32(1);
    w.u32(0);
    w.i16(500);
    w.i16(700);
    w.u16(0);
    w.u16(0x20);
    w.u16(1);
  });
  const post = tabel((w) => {
    w.u32(0x00030000);
    w.u32(0);
    w.i16(-100);
    w.i16(50);
    w.u32(1); // isFixedPitch
    w.u32(0);
    w.u32(0);
    w.u32(0);
    w.u32(0);
  });
  const tabellen: [string, Uint8Array][] = [
    ["OS/2", os2],
    ["cmap", cmap],
    ["glyf", glyf],
    ["head", head],
    ["hhea", hhea],
    ["hmtx", hmtx],
    ["loca", loca],
    ["maxp", maxp],
    ["name", nameT],
    ["post", post],
  ];
  const n = tabellen.length;
  let macht = 1;
  let log = 0;
  while (macht * 2 <= n) {
    macht *= 2;
    log++;
  }
  const kop = new Schrijver();
  kop.u32(0x00010000);
  kop.u16(n);
  kop.u16(macht * 16);
  kop.u16(log);
  kop.u16(n * 16 - macht * 16);
  let positie = 12 + n * 16;
  const opgevuld = tabellen.map(([, data]) => {
    const p = new Uint8Array(Math.ceil(data.length / 4) * 4);
    p.set(data);
    return p;
  });
  tabellen.forEach(([tag, data], i) => {
    kop.tekst(tag);
    kop.u32(controlesom(data));
    kop.u32(positie);
    kop.u32(data.length);
    positie += opgevuld[i].length;
  });
  const kopBytes = kop.bytes();
  const uit = new Uint8Array(positie);
  uit.set(kopBytes, 0);
  let p = kopBytes.length;
  const headPositie: number[] = [];
  tabellen.forEach(([tag], i) => {
    if (tag === "head") headPositie.push(p);
    uit.set(opgevuld[i], p);
    p += opgevuld[i].length;
  });
  const aanpassing = (0xb1b0afba - controlesom(uit)) >>> 0;
  const h = headPositie[0] + 8;
  uit[h] = aanpassing >>> 24;
  uit[h + 1] = (aanpassing >>> 16) & 0xff;
  uit[h + 2] = (aanpassing >>> 8) & 0xff;
  uit[h + 3] = aanpassing & 0xff;
  cache = uit;
  return uit;
}
