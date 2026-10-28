/**
 * Minimale schrijver voor Compound File Binary (MS-CFB, versie 3, sectoren
 * van 512 bytes). Genoeg voor versleutelde OOXML-pakketten: een wortel met
 * stromen en (geneste) opslagen. Kleine stromen (< 4096 bytes) gaan in de
 * ministroom; grotere in gewone sectoren. Meer dan 109 FAT-sectoren worden
 * via DIFAT-sectoren gekoppeld.
 */

export interface CfbInvoer {
  /** Pad met "/" als scheiding, bijvoorbeeld "\u0006DataSpaces/Version". */
  pad: string;
  data: Uint8Array;
}

const SECTOR = 512;
const MINI = 64;
const GRENS = 4096;
const EINDE = 0xfffffffe;
const VRIJ = 0xffffffff;
const FATSECT = 0xfffffffd;
const DIFSECT = 0xfffffffc;
const GEEN = 0xffffffff;

interface Knoop {
  naam: string;
  type: 1 | 2 | 5;
  data?: Uint8Array;
  kinderen: Knoop[];
  index?: number;
  links: number;
  rechts: number;
  kind: number;
  start: number;
  grootte: number;
}

/** Volgorde volgens MS-CFB: eerst lengte, dan hoofdletterongevoelig. */
function vergelijk(a: string, b: string) {
  if (a.length !== b.length) return a.length - b.length;
  const x = a.toUpperCase(),
    y = b.toUpperCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

export function schrijfCfb(invoer: CfbInvoer[]): Uint8Array {
  const wortel: Knoop = {
    naam: "Root Entry",
    type: 5,
    kinderen: [],
    links: GEEN,
    rechts: GEEN,
    kind: GEEN,
    start: EINDE,
    grootte: 0,
  };
  for (const { pad, data } of invoer) {
    const delen = pad.split("/");
    let ouder = wortel;
    delen.forEach((naam, i) => {
      if (naam.length > 31) throw new Error("CFB-naam te lang.");
      const laatste = i === delen.length - 1;
      let knoop = ouder.kinderen.find((k) => k.naam === naam);
      if (!knoop) {
        knoop = {
          naam,
          type: laatste ? 2 : 1,
          kinderen: [],
          links: GEEN,
          rechts: GEEN,
          kind: GEEN,
          start: laatste ? EINDE : 0,
          grootte: 0,
        };
        ouder.kinderen.push(knoop);
      }
      if (laatste) knoop.data = data;
      ouder = knoop;
    });
  }
  // Mapitems in volgorde nummeren.
  const items: Knoop[] = [];
  const nummer = (k: Knoop) => {
    k.index = items.length;
    items.push(k);
    k.kinderen.forEach(nummer);
  };
  nummer(wortel);
  // Kinderen als gebalanceerde binaire boom (alle knopen zwart).
  const boom = (kinderen: Knoop[]): number => {
    if (!kinderen.length) return GEEN;
    const gesorteerd = [...kinderen].sort((a, b) => vergelijk(a.naam, b.naam));
    const bouw = (van: number, tot: number): number => {
      if (van > tot) return GEEN;
      const midden = (van + tot) >> 1;
      const k = gesorteerd[midden];
      k.links = bouw(van, midden - 1);
      k.rechts = bouw(midden + 1, tot);
      return k.index!;
    };
    return bouw(0, gesorteerd.length - 1);
  };
  for (const k of items) if (k.type !== 2) k.kind = boom(k.kinderen);

  // Ministroom
  const ministromen = items.filter(
    (k) => k.type === 2 && k.data!.length < GRENS,
  );
  const grote = items.filter((k) => k.type === 2 && k.data!.length >= GRENS);
  const miniFat: number[] = [];
  const miniDelen: Uint8Array[] = [];
  let miniSectoren = 0;
  for (const k of ministromen) {
    const data = k.data!;
    k.grootte = data.length;
    if (!data.length) {
      k.start = EINDE;
      continue;
    }
    const aantal = Math.ceil(data.length / MINI);
    k.start = miniSectoren;
    for (let i = 0; i < aantal; i++)
      miniFat.push(i === aantal - 1 ? EINDE : miniSectoren + i + 1);
    miniSectoren += aantal;
    const blok = new Uint8Array(aantal * MINI);
    blok.set(data);
    miniDelen.push(blok);
  }
  const ministroom = samen(miniDelen);

  // Indeling van gewone sectoren: [map][minifat][ministroom][grote stromen][fat][difat]
  const sectorenVoor = (n: number) => Math.ceil(n / SECTOR);
  const mapSectoren = sectorenVoor(items.length * 128);
  const miniFatSectoren = sectorenVoor(miniFat.length * 4);
  const ministroomSectoren = sectorenVoor(ministroom.length);
  const grootSectoren = grote.map((k) => sectorenVoor(k.data!.length));
  const inhoud =
    mapSectoren +
    miniFatSectoren +
    ministroomSectoren +
    grootSectoren.reduce((a, b) => a + b, 0);
  // FAT- en DIFAT-sectoren tellen zichzelf mee.
  let fatSectoren = 0,
    difatSectoren = 0;
  for (;;) {
    const totaal = inhoud + fatSectoren + difatSectoren;
    const nodigFat = Math.ceil(totaal / (SECTOR / 4));
    const nodigDifat =
      nodigFat > 109 ? Math.ceil((nodigFat - 109) / (SECTOR / 4 - 1)) : 0;
    if (nodigFat === fatSectoren && nodigDifat === difatSectoren) break;
    fatSectoren = nodigFat;
    difatSectoren = nodigDifat;
  }
  const totaalSectoren = inhoud + fatSectoren + difatSectoren;
  const fat = new Uint32Array(fatSectoren * (SECTOR / 4)).fill(VRIJ);
  let volgende = 0;
  const keten = (aantal: number) => {
    if (!aantal) return EINDE;
    const start = volgende;
    for (let i = 0; i < aantal; i++)
      fat[start + i] = i === aantal - 1 ? EINDE : start + i + 1;
    volgende += aantal;
    return start;
  };
  const mapStart = keten(mapSectoren);
  const miniFatStart = keten(miniFatSectoren);
  wortel.start = ministroom.length ? keten(ministroomSectoren) : EINDE;
  wortel.grootte = ministroom.length;
  grote.forEach((k, i) => {
    k.start = keten(grootSectoren[i]);
    k.grootte = k.data!.length;
  });
  const fatStart = volgende;
  for (let i = 0; i < fatSectoren; i++) fat[volgende++] = FATSECT;
  const difatStart = volgende;
  for (let i = 0; i < difatSectoren; i++) fat[volgende++] = DIFSECT;
  if (volgende !== totaalSectoren) throw new Error("CFB-indeling klopt niet.");

  const uit = new Uint8Array(SECTOR * (1 + totaalSectoren));
  const z = new DataView(uit.buffer);
  const sector = (n: number) => SECTOR * (n + 1);
  // Kop
  uit.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  z.setUint16(24, 0x003e, true);
  z.setUint16(26, 3, true);
  z.setUint16(28, 0xfffe, true);
  z.setUint16(30, 9, true);
  z.setUint16(32, 6, true);
  z.setUint32(44, fatSectoren, true);
  z.setUint32(48, mapStart, true);
  z.setUint32(56, GRENS, true);
  z.setUint32(60, miniFat.length ? miniFatStart : EINDE, true);
  z.setUint32(64, miniFatSectoren, true);
  z.setUint32(68, difatSectoren ? difatStart : EINDE, true);
  z.setUint32(72, difatSectoren, true);
  for (let i = 0; i < 109; i++)
    z.setUint32(76 + i * 4, i < fatSectoren ? fatStart + i : VRIJ, true);
  // DIFAT-sectoren
  for (let d = 0; d < difatSectoren; d++) {
    const basis = sector(difatStart + d);
    for (let i = 0; i < SECTOR / 4 - 1; i++) {
      const f = 109 + d * (SECTOR / 4 - 1) + i;
      z.setUint32(basis + i * 4, f < fatSectoren ? fatStart + f : VRIJ, true);
    }
    z.setUint32(
      basis + SECTOR - 4,
      d === difatSectoren - 1 ? EINDE : difatStart + d + 1,
      true,
    );
  }
  // FAT
  for (let i = 0; i < fat.length; i++)
    z.setUint32(sector(fatStart) + i * 4, fat[i], true);
  // Map
  const mapBasis = sector(mapStart);
  for (let i = 0; i < mapSectoren * (SECTOR / 128); i++) {
    const p = mapBasis + i * 128;
    const k = items[i];
    if (!k) {
      z.setUint32(p + 68, GEEN, true);
      z.setUint32(p + 72, GEEN, true);
      z.setUint32(p + 76, GEEN, true);
      continue;
    }
    for (let c = 0; c < k.naam.length; c++)
      z.setUint16(p + c * 2, k.naam.charCodeAt(c), true);
    z.setUint16(p + 64, (k.naam.length + 1) * 2, true);
    uit[p + 66] = k.type;
    uit[p + 67] = 1; // zwart
    z.setUint32(p + 68, k.links, true);
    z.setUint32(p + 72, k.rechts, true);
    z.setUint32(p + 76, k.kind, true);
    if (k.type !== 1) {
      z.setUint32(p + 116, k.start, true);
      z.setUint32(p + 120, k.grootte, true);
    }
  }
  // MiniFAT
  const miniFatBasis = sector(miniFatStart);
  for (let i = 0; i < miniFatSectoren * (SECTOR / 4); i++)
    z.setUint32(
      miniFatBasis + i * 4,
      i < miniFat.length ? miniFat[i] : VRIJ,
      true,
    );
  // Ministroom en grote stromen
  if (ministroom.length) uit.set(ministroom, sector(wortel.start));
  for (const k of grote) uit.set(k.data!, sector(k.start));
  return uit;
}

function samen(delen: Uint8Array[]) {
  const uit = new Uint8Array(delen.reduce((n, d) => n + d.length, 0));
  let p = 0;
  for (const d of delen) {
    uit.set(d, p);
    p += d.length;
  }
  return uit;
}
