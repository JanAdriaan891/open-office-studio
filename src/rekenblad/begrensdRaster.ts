/**
 * Begrensd, meegroeiend raster (#371): een weergavelaag over het onbeperkte
 * raster. Het blad toont het gebruikte gebied plus een marge; daarbuiten geen
 * cellen. Het XLSX-model verandert hierdoor niet: er worden geen rijen of
 * kolommen verborgen. Alleen de weergavekeuze reist mee, als aangepaste
 * documenteigenschap (docProps/custom.xml) die Excel bewaart en negeert.
 *
 * Dit bestand bevat uitsluitend de rekenregels en het lezen en schrijven van
 * die eigenschap; de sessiestand staat in rasterWeergave.ts.
 */
import { Pakket } from "../grafieken/pakket";
import { attr, kinderen, leesXml, ontcijfer, ontsnap, vervang } from "../grafieken/xml";
import { MAX_KOLOMMEN, MAX_RIJEN, type Bereik } from "../lint/rekenblad-logica";

/** Aantal zichtbare rijen en kolommen, geteld vanaf A1. */
export interface Omvang {
  rijen: number;
  kolommen: number;
}
export type RasterMarge = Omvang;
export interface Selectie {
  anchor: { row: number; col: number };
  focus: { row: number; col: number };
}

export const STANDAARD_MARGE: RasterMarge = { rijen: 5, kolommen: 3 };
export const MAX_MARGE: RasterMarge = { rijen: 100, kolommen: 50 };
/** Een leeg blad begint met dit raster. */
export const BEGINRASTER: Omvang = { rijen: 20, kolommen: 8 };
/** Shift-klik op een groeistrook voegt dit aantal toe. */
export const GROTE_STAP: Omvang = { rijen: 10, kolommen: 5 };
const MAXIMUM: Omvang = { rijen: MAX_RIJEN, kolommen: MAX_KOLOMMEN };

const heel = (n: unknown, minimum: number, maximum: number, anders: number) =>
  typeof n === "number" && Number.isFinite(n)
    ? Math.min(maximum, Math.max(minimum, Math.round(n)))
    : anders;

export function normaliseerMarge(ruw: unknown): RasterMarge {
  const r = ruw && typeof ruw === "object" ? (ruw as Record<string, unknown>) : {};
  return {
    rijen: heel(r.rijen, 0, MAX_MARGE.rijen, STANDAARD_MARGE.rijen),
    kolommen: heel(r.kolommen, 0, MAX_MARGE.kolommen, STANDAARD_MARGE.kolommen),
  };
}

export const begrensOmvang = (o: Omvang): Omvang => ({
  rijen: heel(o.rijen, 1, MAXIMUM.rijen, BEGINRASTER.rijen),
  kolommen: heel(o.kolommen, 1, MAXIMUM.kolommen, BEGINRASTER.kolommen),
});

/** Het kleinste bereik dat alle gegeven bereiken omvat. */
export function verenig(bereiken: readonly (Bereik | null | undefined)[]): Bereik | null {
  let uit: Bereik | null = null;
  for (const b of bereiken) {
    if (!b) continue;
    uit = uit
      ? {
          top: Math.min(uit.top, b.top),
          left: Math.min(uit.left, b.left),
          bottom: Math.max(uit.bottom, b.bottom),
          right: Math.max(uit.right, b.right),
        }
      : { ...b };
  }
  return uit;
}

/** Gebruikt bereik plus marge, met het beginraster als ondergrens. */
export function passendeOmvang(
  gebruikt: Bereik | null,
  marge: RasterMarge = STANDAARD_MARGE,
  begin: Omvang = BEGINRASTER,
): Omvang {
  return begrensOmvang({
    rijen: Math.max(begin.rijen, gebruikt ? gebruikt.bottom + 1 + marge.rijen : 0),
    kolommen: Math.max(begin.kolommen, gebruikt ? gebruikt.right + 1 + marge.kolommen : 0),
  });
}

/**
 * De omvang na een wijziging: het raster groeit mee met de inhoud en krimpt
 * nooit vanzelf (alleen via "Raster aanpassen aan inhoud").
 */
export function meegroeien(
  huidig: Omvang | null,
  gebruikt: Bereik | null,
  marge: RasterMarge = STANDAARD_MARGE,
  begin: Omvang = BEGINRASTER,
): Omvang {
  const passend = passendeOmvang(gebruikt, marge, begin);
  if (!huidig) return passend;
  return begrensOmvang({
    rijen: Math.max(huidig.rijen, passend.rijen),
    kolommen: Math.max(huidig.kolommen, passend.kolommen),
  });
}

export const zelfdeOmvang = (a: Omvang | null, b: Omvang | null) =>
  a === b || (!!a && !!b && a.rijen === b.rijen && a.kolommen === b.kolommen);

/** Rijen en kolommen toevoegen via de groeistroken. */
export function vergroot(huidig: Omvang, erbij: Partial<Omvang>): Omvang {
  return begrensOmvang({
    rijen: huidig.rijen + Math.max(0, erbij.rijen ?? 0),
    kolommen: huidig.kolommen + Math.max(0, erbij.kolommen ?? 0),
  });
}

/** Aantal sporen voor een sleepafstand: één per volledig spoor, minstens één. */
export function sleepAantal(afstandPx: number, spoorPx: number, maximum = 500) {
  if (!(spoorPx > 0) || !(afstandPx > 0)) return 1;
  return Math.min(maximum, 1 + Math.floor(afstandPx / spoorPx));
}

/** Omvang waarbij de cel zichtbaar is, met marge; ongewijzigd als hij er al in valt. */
export function omvangMetCel(
  huidig: Omvang,
  cel: { row: number; col: number },
  marge: RasterMarge = STANDAARD_MARGE,
): Omvang {
  return begrensOmvang({
    rijen: cel.row >= huidig.rijen ? cel.row + 1 + marge.rijen : huidig.rijen,
    kolommen: cel.col >= huidig.kolommen ? cel.col + 1 + marge.kolommen : huidig.kolommen,
  });
}

/** Of een as van de selectie het hele blad beslaat (hele kolommen of rijen, alles selecteren). */
function heleAs(a: number, b: number, maximum: number) {
  return Math.min(a, b) === 0 && Math.max(a, b) === maximum - 1;
}

/** Het deel van een selectie dat voorbij de omvang reikt; hele rijen/kolommen tellen niet mee. */
export function buitenRaster(sel: Selectie, omvang: Omvang): { row: number; col: number } | null {
  const rijenHeel = heleAs(sel.anchor.row, sel.focus.row, MAX_RIJEN);
  const kolommenHeel = heleAs(sel.anchor.col, sel.focus.col, MAX_KOLOMMEN);
  const rij = rijenHeel ? -1 : Math.max(sel.anchor.row, sel.focus.row);
  const kolom = kolommenHeel ? -1 : Math.max(sel.anchor.col, sel.focus.col);
  if (rij < omvang.rijen && kolom < omvang.kolommen) return null;
  return { row: Math.max(rij, 0), col: Math.max(kolom, 0) };
}

/**
 * Houdt een selectie binnen het raster. Hele rijen, hele kolommen en "alles
 * selecteren" blijven wat ze zijn: hun betekenis is het hele blad, ook voor
 * invoegen, verwijderen en breedte of hoogte. Geeft null als er niets verandert.
 */
export function begrensSelectie(sel: Selectie, omvang: Omvang): Selectie | null {
  if (!buitenRaster(sel, omvang)) return null;
  const rijenHeel = heleAs(sel.anchor.row, sel.focus.row, MAX_RIJEN);
  const kolommenHeel = heleAs(sel.anchor.col, sel.focus.col, MAX_KOLOMMEN);
  const cel = (c: { row: number; col: number }) => ({
    row: rijenHeel ? c.row : Math.min(c.row, omvang.rijen - 1),
    col: kolommenHeel ? c.col : Math.min(c.col, omvang.kolommen - 1),
  });
  return { anchor: cel(sel.anchor), focus: cel(sel.focus) };
}

// ------------------------------------------------------------------ opslag

/**
 * De weergavekeuze van één werkmap: de begrensde bladen met hun omvang en de
 * bladen die bewust onbeperkt zijn. Een blad dat nergens staat, volgt de
 * standaardkeuze uit Instellingen.
 */
export interface RasterKeuze {
  bladen: { naam: string; rijen: number; kolommen: number }[];
  onbeperkt: string[];
}

export const EIGENSCHAP = "OpenOfficeStudio.BoundedGrid";
const EIGENSCHAPPEN_PAD = "docProps/custom.xml";
const EIGENSCHAPPEN_TYPE = "application/vnd.openxmlformats-officedocument.custom-properties+xml";
const EIGENSCHAPPEN_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties";
const FMTID = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}";
const MAX_TEKST = 60000;

export function keuzeNaarTekst(keuze: RasterKeuze): string {
  return JSON.stringify({
    v: 1,
    sheets: keuze.bladen.map((b) => ({ name: b.naam, rows: b.rijen, columns: b.kolommen })),
    unlimited: keuze.onbeperkt,
  });
}

/** Leest de keuze; onbekende of beschadigde tekst geeft null (dan geldt de standaard). */
export function keuzeUitTekst(tekst: string | null | undefined): RasterKeuze | null {
  if (!tekst || tekst.length > MAX_TEKST) return null;
  try {
    const ruw = JSON.parse(tekst) as { v?: unknown; sheets?: unknown; unlimited?: unknown };
    if (!ruw || typeof ruw !== "object" || ruw.v !== 1 || !Array.isArray(ruw.sheets)) return null;
    const bladen: RasterKeuze["bladen"] = [];
    for (const b of ruw.sheets as Record<string, unknown>[]) {
      if (!b || typeof b !== "object" || typeof b.name !== "string" || !b.name) continue;
      if (bladen.some((x) => x.naam.toLowerCase() === (b.name as string).toLowerCase())) continue;
      const o = begrensOmvang({
        rijen: typeof b.rows === "number" ? b.rows : BEGINRASTER.rijen,
        kolommen: typeof b.columns === "number" ? b.columns : BEGINRASTER.kolommen,
      });
      bladen.push({ naam: b.name, ...o });
    }
    const begrensd = new Set(bladen.map((b) => b.naam.toLowerCase()));
    const onbeperkt: string[] = [];
    for (const naam of Array.isArray(ruw.unlimited) ? ruw.unlimited : []) {
      if (typeof naam !== "string" || !naam || begrensd.has(naam.toLowerCase())) continue;
      if (!onbeperkt.some((n) => n.toLowerCase() === naam.toLowerCase())) onbeperkt.push(naam);
    }
    return { bladen, onbeperkt };
  } catch {
    return null;
  }
}

/** De weergavekeuze uit het bestand, of null als het bestand er geen bevat. */
export function leesRasterKeuze(bytes: Uint8Array | Pakket): RasterKeuze | null {
  try {
    const pakket = bytes instanceof Pakket ? bytes : new Pakket(bytes);
    if (!pakket.heeft(EIGENSCHAPPEN_PAD)) return null;
    const xml = pakket.lees(EIGENSCHAPPEN_PAD);
    const el = kinderen(leesXml(xml), "property").find((p) => attr(p, "name") === EIGENSCHAP);
    if (!el || el.leeg) return null;
    const waarde = /<(?:\w+:)?lpwstr[^>]*>([\s\S]*?)<\/(?:\w+:)?lpwstr>/.exec(
      xml.slice(el.inhoudStart, el.inhoudEind),
    );
    return waarde ? keuzeUitTekst(ontcijfer(waarde[1])) : null;
  } catch {
    return null;
  }
}

/**
 * Schrijft de keuze als aangepaste documenteigenschap, of haalt haar weg bij
 * null.
 * Werkbladen, werkmap en alle andere onderdelen blijven byte-gelijk; een
 * bestand zonder keuze en zonder bestaande eigenschap blijft ongewijzigd.
 */
export function schrijfRasterKeuze(bytes: Uint8Array, keuze: RasterKeuze | null): Uint8Array {
  const pakket = new Pakket(bytes);
  const bestaat = pakket.heeft(EIGENSCHAPPEN_PAD);
  if (!bestaat && !keuze) return bytes;
  const tekst = keuze ? keuzeNaarTekst(keuze) : null;
  if (!bestaat) {
    pakket.schrijf(
      EIGENSCHAPPEN_PAD,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="${FMTID}" pid="2" name="${EIGENSCHAP}"><vt:lpwstr>${ontsnap(tekst!)}</vt:lpwstr></property></Properties>`,
    );
    pakket.voegOverrideToe(EIGENSCHAPPEN_PAD, EIGENSCHAPPEN_TYPE);
    if (!pakket.relaties("").some((r) => r.type === EIGENSCHAPPEN_REL))
      pakket.voegRelatieToe("", EIGENSCHAPPEN_REL, EIGENSCHAPPEN_PAD);
    return pakket.inpakken();
  }
  const xml = pakket.lees(EIGENSCHAPPEN_PAD);
  const wortel = leesXml(xml);
  const lijst = kinderen(wortel, "property");
  const el = lijst.find((p) => attr(p, "name") === EIGENSCHAP);
  if (!el && !tekst) return bytes;
  if (el && tekst && leesRasterKeuze(pakket) && keuzeNaarTekst(leesRasterKeuze(pakket)!) === tekst)
    return bytes;
  // Het voorvoegsel van de variantnaamruimte volgt het bestaande onderdeel.
  const vt = /xmlns:(\w+)="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/docPropsVTypes"/.exec(xml)?.[1];
  const waarde = (t: string) =>
    vt
      ? `<${vt}:lpwstr>${ontsnap(t)}</${vt}:lpwstr>`
      : `<vt:lpwstr xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${ontsnap(t)}</vt:lpwstr>`;
  if (el) {
    pakket.schrijf(
      EIGENSCHAPPEN_PAD,
      vervang(xml, [
        tekst
          ? { start: el.inhoudStart, eind: el.inhoudEind, tekst: waarde(tekst) }
          : { start: el.start, eind: el.eind, tekst: "" },
      ]),
    );
    return pakket.inpakken();
  }
  // pid 0 en 1 zijn gereserveerd; elke eigenschap heeft een eigen nummer.
  const pid = lijst.reduce((m, p) => Math.max(m, Number(attr(p, "pid") ?? 0) || 0), 1) + 1;
  const regel = `<property fmtid="${FMTID}" pid="${pid}" name="${EIGENSCHAP}">${waarde(tekst!)}</property>`;
  pakket.schrijf(
    EIGENSCHAPPEN_PAD,
    wortel.leeg
      ? vervang(xml, [{ start: wortel.start, eind: wortel.eind, tekst: `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">${regel}</Properties>` }])
      : vervang(xml, [{ start: wortel.inhoudEind, eind: wortel.inhoudEind, tekst: regel }]),
  );
  return pakket.inpakken();
}
