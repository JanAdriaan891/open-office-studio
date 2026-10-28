/**
 * Datums als OLE-automatiseringsgetal, zoals VBA ze opslaat: dagen sinds
 * 30-12-1899, met de tijd als fractie. Alle berekeningen in UTC, zodat
 * zomertijd geen invloed heeft.
 */
const DAG = 86_400_000;
const EPOCHE = Date.UTC(1899, 11, 30);

export interface Datumdelen {
  jaar: number;
  maand: number; // 1-12
  dag: number;
  uur: number;
  minuut: number;
  seconde: number;
  /** 1 = zondag … 7 = zaterdag */
  weekdag: number;
}

function utc(jaar: number, maand0: number, dag: number) {
  const d = new Date(Date.UTC(2000, 0, 1));
  d.setUTCFullYear(jaar, maand0, dag);
  return d.getTime();
}

/** Getal van een datum; maand en dag mogen buiten hun bereik vallen (DateSerial). */
export function serieVan(
  jaar: number,
  maand: number,
  dag: number,
  uur = 0,
  minuut = 0,
  seconde = 0,
): number {
  const dagen = Math.round((utc(jaar, maand - 1, dag) - EPOCHE) / DAG);
  const tijd = (uur * 3600 + minuut * 60 + seconde) / 86400;
  return combineer(dagen, tijd);
}

/** VBA-datums vóór 1900 hebben een negatief dagdeel met een positieve tijdfractie. */
export function combineer(dagen: number, tijd: number) {
  // tijd mag buiten 0..1 vallen (TimeSerial(25, 0, 0))
  const extra = Math.floor(tijd);
  dagen += extra;
  tijd -= extra;
  return dagen >= 0 ? dagen + tijd : dagen - tijd;
}

/** Splitst een datumgetal in dagdeel en tijdfractie (0 ≤ tijd < 1). */
export function splits(serie: number): { dagen: number; tijd: number } {
  const dagen = Math.trunc(serie);
  let tijd = Math.abs(serie - dagen);
  // Afronden op hele seconden voorkomt 13:59:59,9999.
  const sec = Math.round(tijd * 86400);
  if (sec >= 86400) return { dagen: dagen + (serie < 0 ? -1 : 1), tijd: 0 };
  tijd = sec / 86400;
  return { dagen, tijd };
}

export function delenVan(serie: number): Datumdelen {
  const { dagen, tijd } = splits(serie);
  const d = new Date(EPOCHE + dagen * DAG);
  let sec = Math.round(tijd * 86400);
  const uur = Math.floor(sec / 3600);
  sec -= uur * 3600;
  const minuut = Math.floor(sec / 60);
  return {
    jaar: d.getUTCFullYear(),
    maand: d.getUTCMonth() + 1,
    dag: d.getUTCDate(),
    uur,
    minuut,
    seconde: sec - minuut * 60,
    weekdag: d.getUTCDay() + 1,
  };
}

export function geldigeDatum(jaar: number, maand: number, dag: number) {
  if (maand < 1 || maand > 12 || dag < 1 || jaar < 100 || jaar > 9999) return false;
  return dag <= dagenInMaand(jaar, maand);
}

export function dagenInMaand(jaar: number, maand: number) {
  return new Date(utc(jaar, maand, 0)).getUTCDate();
}

/** Datumgetal van een lokale JS-datum (Now). */
export function serieVanJs(d: Date): number {
  return serieVan(
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  );
}

/** ISO-tekst voor de werkkopie: `2026-10-26` of `2026-10-26T14:30:00`. */
export function naarIso(serie: number): string {
  const d = delenVan(serie);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  const datum = `${p(d.jaar, 4)}-${p(d.maand)}-${p(d.dag)}`;
  if (!d.uur && !d.minuut && !d.seconde) return datum;
  return `${datum}T${p(d.uur)}:${p(d.minuut)}:${p(d.seconde)}`;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
export function vanIso(tekst: string): number | null {
  const m = ISO.exec(tekst);
  if (!m) return null;
  const [j, ma, d] = [+m[1], +m[2], +m[3]];
  if (!geldigeDatum(j, ma, d)) return null;
  return serieVan(j, ma, d, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

const MAANDEN_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MAANDEN_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function maandUitNaam(naam: string): number | null {
  const k = naam.toLowerCase().slice(0, 3);
  let i = MAANDEN_EN.indexOf(k);
  if (i < 0) i = MAANDEN_NL.indexOf(k);
  if (i < 0 && k === "maa") i = 2;
  return i < 0 ? null : i + 1;
}

function jaarVan(tekst: string) {
  const j = +tekst;
  if (tekst.length <= 2) return j < 30 ? 2000 + j : 1900 + j;
  return j;
}

/**
 * Leest een datum/tijd uit tekst. `volgorde` bepaalt hoe 1-2-2026 gelezen wordt;
 * bij een ongeldige datum probeert VBA de andere volgorde (13-1 → 13 januari).
 */
export function leesDatum(tekst: string, volgorde: "dmy" | "mdy" | "ymd"): number | null {
  let t = tekst.trim();
  if (!t) return null;
  const iso = vanIso(t);
  if (iso !== null) return iso;
  // Tijddeel
  let uur = 0,
    minuut = 0,
    seconde = 0,
    heeftTijd = false;
  const tijd = /(?:^|\s)(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?\s*([AaPp][Mm])?$|(?:^|\s)(\d{1,2})\s*([AaPp][Mm])$/.exec(t);
  if (tijd) {
    heeftTijd = true;
    uur = +(tijd[1] ?? tijd[5]);
    minuut = +(tijd[2] ?? 0);
    seconde = +(tijd[3] ?? 0);
    const ampm = (tijd[4] ?? tijd[6])?.toLowerCase();
    if (ampm === "pm" && uur < 12) uur += 12;
    if (ampm === "am" && uur === 12) uur = 0;
    if (uur > 23 || minuut > 59 || seconde > 59) return null;
    t = t.slice(0, tijd.index).trim();
  }
  const tijdFractie = (uur * 3600 + minuut * 60 + seconde) / 86400;
  if (!t) return heeftTijd ? tijdFractie : null;
  // Datumdeel met cijfers
  let m = /^(\d{1,4})[-/. ](\d{1,2})(?:[-/. ](\d{1,4}))?$/.exec(t);
  if (m) {
    const a = m[1],
      b = m[2],
      c = m[3];
    const pogingen: [number, number, number][] = [];
    const nu = new Date().getFullYear();
    if (a.length >= 3) pogingen.push([+a, +b, c ? +c : 1]);
    else if (!c) {
      // twee delen: dag en maand van het huidige jaar
      if (volgorde === "mdy") pogingen.push([nu, +a, +b], [nu, +b, +a]);
      else pogingen.push([nu, +b, +a], [nu, +a, +b]);
    } else {
      const j = jaarVan(c);
      if (volgorde === "mdy") pogingen.push([j, +a, +b], [j, +b, +a]);
      else if (volgorde === "ymd") pogingen.push([jaarVan(a), +b, +c], [j, +b, +a]);
      else pogingen.push([j, +b, +a], [j, +a, +b]);
    }
    for (const [j, mm, d] of pogingen)
      if (geldigeDatum(j, mm, d)) return combineer(serieVan(j, mm, d), tijdFractie);
    return null;
  }
  // Datum met maandnaam: "26 oktober 2026", "Oct 26, 2026", "26-okt-2026"
  m = /^(\d{1,2})[\s\-/.]+([A-Za-zÀ-ɏ]+)\.?[\s\-/.,]+(\d{2,4})$/.exec(t);
  if (m) {
    const mm = maandUitNaam(m[2]);
    const j = jaarVan(m[3]);
    if (mm && geldigeDatum(j, mm, +m[1])) return combineer(serieVan(j, mm, +m[1]), tijdFractie);
    return null;
  }
  m = /^([A-Za-zÀ-ɏ]+)\.?[\s\-/.]+(\d{1,2}),?[\s\-/.]+(\d{2,4})$/.exec(t);
  if (m) {
    const mm = maandUitNaam(m[1]);
    const j = jaarVan(m[3]);
    if (mm && geldigeDatum(j, mm, +m[2])) return combineer(serieVan(j, mm, +m[2]), tijdFractie);
  }
  return null;
}
