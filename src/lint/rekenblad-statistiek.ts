/**
 * Statistiekgereedschap (Gegevens › Analyse): beschrijvende statistiek,
 * correlatie, lineaire regressie (met voorspelde waarden en residuen),
 * histogram/frequentie en steekproef. De uitvoer gaat naar een nieuw blad of
 * een doelcel; waar de rekenkern de functie kent, als formule naar de
 * brongegevens (AVERAGE, MEDIAN, MODE.SNGL, STDEV.S, VAR.S, SKEW, KURT,
 * CORREL, SLOPE, INTERCEPT, COUNTIFS), anders als waarde. De rekenfuncties
 * hier geven dezelfde uitkomst voor de waarde-uitvoer en de tests.
 */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { XlsxCellValue, XlsxEditStep } from "@betteroffice/xlsx";
import i18next from "../i18n/config";
import { bladVerwijzing } from "../grafieken/model";
import { Melding, voerOpsUit } from "./rekenblad-opdrachten";
import { adres, kolomLetters, MAX_KOLOMMEN, MAX_RIJEN, type Bereik, type Cel } from "./rekenblad-logica";
import { bewerk, doel, lees, schrijfbaar } from "./rekenblad-gegevens";

// ------------------------------------------------------------ rekenen

const som = (x: readonly number[]) => x.reduce((a, b) => a + b, 0);
export const gemiddelde = (x: readonly number[]) => (x.length ? som(x) / x.length : NaN);

export function mediaan(x: readonly number[]) {
  if (!x.length) return NaN;
  const s = [...x].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Modus zoals MODE.SNGL: de eerste waarde die het vaakst voorkomt; NaN als niets dubbel is. */
export function modus(x: readonly number[]) {
  const telling = new Map<number, number>();
  let beste = NaN;
  let max = 1;
  for (const v of x) {
    const n = (telling.get(v) ?? 0) + 1;
    telling.set(v, n);
    if (n > max) {
      max = n;
      beste = v;
    }
  }
  // Gelijke aantallen: de waarde die als eerste voorkomt.
  if (max > 1) for (const v of x) if (telling.get(v) === max) return v;
  return beste;
}

export function variantie(x: readonly number[]) {
  if (x.length < 2) return NaN;
  const g = gemiddelde(x);
  return som(x.map((v) => (v - g) ** 2)) / (x.length - 1);
}
export const standaardafwijking = (x: readonly number[]) => Math.sqrt(variantie(x));

/** Scheefheid zoals SKEW (steekproef). */
export function scheefheid(x: readonly number[]) {
  const n = x.length;
  if (n < 3) return NaN;
  const g = gemiddelde(x);
  const s = standaardafwijking(x);
  if (!s) return NaN;
  return (n / ((n - 1) * (n - 2))) * som(x.map((v) => ((v - g) / s) ** 3));
}

/** Kurtosis zoals KURT (steekproef, overschot). */
export function kurtosis(x: readonly number[]) {
  const n = x.length;
  if (n < 4) return NaN;
  const g = gemiddelde(x);
  const s = standaardafwijking(x);
  if (!s) return NaN;
  const t = som(x.map((v) => ((v - g) / s) ** 4));
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * t - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
}

/** Pearson-correlatie over paren waarin beide waarden getallen zijn. */
export function correlatie(x: readonly (number | null)[], y: readonly (number | null)[]) {
  const p = paren(x, y);
  const gx = gemiddelde(p.map((q) => q[0]));
  const gy = gemiddelde(p.map((q) => q[1]));
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (const [a, b] of p) {
    sxy += (a - gx) * (b - gy);
    sxx += (a - gx) ** 2;
    syy += (b - gy) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

function paren(x: readonly (number | null)[], y: readonly (number | null)[]) {
  const p: [number, number][] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const a = x[i],
      b = y[i];
    if (a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b)) p.push([a, b]);
  }
  return p;
}

/** Lineaire regressie y = helling·x + snijpunt (kleinste kwadraten). */
export function regressie(x: readonly (number | null)[], y: readonly (number | null)[]) {
  const p = paren(x, y);
  const gx = gemiddelde(p.map((q) => q[0]));
  const gy = gemiddelde(p.map((q) => q[1]));
  let sxy = 0,
    sxx = 0;
  for (const [a, b] of p) {
    sxy += (a - gx) * (b - gy);
    sxx += (a - gx) ** 2;
  }
  const helling = sxx ? sxy / sxx : NaN;
  const snijpunt = gy - helling * gx;
  const r = correlatie(x, y);
  return { helling, snijpunt, r, r2: r * r, n: p.length };
}

/** Klassengrenzen (bovengrens per klasse) met gelijke breedte tussen min en max. */
export function automatischeKlassen(x: readonly number[], aantal?: number) {
  if (!x.length) return [];
  const min = Math.min(...x);
  const max = Math.max(...x);
  const k = Math.max(1, Math.min(50, aantal ?? Math.ceil(Math.sqrt(x.length))));
  if (min === max) return [min];
  const w = (max - min) / k;
  // Afgerond op een nette waarde, zonder de laatste klasse te missen.
  return Array.from({ length: k }, (_, i) => (i === k - 1 ? max : Number((min + w * (i + 1)).toPrecision(12))));
}

/** Frequentie per klasse (≤ grens, > vorige grens) plus "meer" (> laatste grens). */
export function frequenties(x: readonly number[], grenzen: readonly number[]) {
  const g = [...grenzen].sort((a, b) => a - b);
  const telling = new Array(g.length + 1).fill(0);
  for (const v of x) {
    let i = g.findIndex((b) => v <= b);
    if (i < 0) i = g.length;
    telling[i]++;
  }
  return telling as number[];
}

/** Steekproef: willekeurig zonder teruglegging of elke k-de waarde. */
export function steekproef<T>(x: readonly T[], methode: "willekeurig" | "periodiek", grootte: number, kans: () => number = Math.random): T[] {
  if (methode === "periodiek") {
    const k = Math.max(1, Math.floor(grootte));
    return x.filter((_, i) => (i + 1) % k === 0);
  }
  const lijst = [...x];
  const n = Math.min(lijst.length, Math.max(0, Math.floor(grootte)));
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(kans() * (lijst.length - i));
    [lijst[i], lijst[j]] = [lijst[j], lijst[i]];
  }
  return lijst.slice(0, n);
}

// ------------------------------------------------------------ uitvoer

export type Analyse = "beschrijvend" | "correlatie" | "regressie" | "histogram" | "steekproef";

export interface StatVraag {
  analyse: Analyse;
  blad: number;
  sheetId: string;
  /** Gegevens (bij regressie: de y-waarden). */
  invoer: Bereik;
  /** Variabelen per kolom (anders per rij). */
  perKolom: boolean;
  /** Eerste rij (of kolom) bevat namen. */
  labels: boolean;
  /** Regressie: de x-waarden (zelfde vorm als de y-waarden). */
  x?: Bereik | null;
  /** Histogram: bovengrenzen van de klassen; leeg = automatisch. */
  klassen?: Bereik | null;
  /** Steekproef. */
  methode?: "willekeurig" | "periodiek";
  grootte?: number;
  /** Formules schrijven waar dat kan (anders waarden). */
  formules: boolean;
  /** Uitvoer: nieuw blad (null) of linkerbovencel op het actieve blad. */
  doelcel: Cel | null;
  /** Regressie: spreidingsgrafiek met trendlijn toevoegen. */
  grafiek?: boolean;
}

export interface Variabele {
  naam: string;
  /** Verwijzing naar de getallen (met bladnaam, absoluut). */
  ref: string;
  waarden: (number | null)[];
}

const t = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(`spreadsheet:dataTools.statistics.${sleutel}`, opties) as string;
const getal = (w: XlsxCellValue | undefined) => (w?.kind === "number" ? w.value : null);
const naamVan = (w: XlsxCellValue | undefined, fallback: string) =>
  w && w.kind !== "empty" ? (w.kind === "text" ? w.value : String((w as { value: unknown }).value)) : fallback;
const absoluut = (b: Bereik) =>
  `$${kolomLetters(b.left)}$${b.top + 1}${b.top === b.bottom && b.left === b.right ? "" : `:$${kolomLetters(b.right)}$${b.bottom + 1}`}`;

/** Splitst de cellen van een bereik in variabelen (kolommen of rijen). */
export function variabelen(cellen: readonly (readonly XlsxCellValue[])[], b: Bereik, bladnaam: string, perKolom: boolean, labels: boolean): Variabele[] {
  const uit: Variabele[] = [];
  const aantal = perKolom ? b.right - b.left + 1 : b.bottom - b.top + 1;
  const lengte = perKolom ? b.bottom - b.top + 1 : b.right - b.left + 1;
  const start = labels ? 1 : 0;
  for (let i = 0; i < aantal; i++) {
    const cel = (j: number) => (perKolom ? cellen[j]?.[i] : cellen[i]?.[j]);
    const fallback = perKolom ? t("column", { column: kolomLetters(b.left + i) }) : t("row", { row: b.top + i + 1 });
    const naam = labels ? naamVan(cel(0), fallback) : fallback;
    const deel: Bereik = perKolom
      ? { top: b.top + start, bottom: b.bottom, left: b.left + i, right: b.left + i }
      : { top: b.top + i, bottom: b.top + i, left: b.left + start, right: b.right };
    const waarden = Array.from({ length: Math.max(0, lengte - start) }, (_, j) => getal(cel(j + start)));
    uit.push({ naam, ref: `${bladVerwijzing(bladnaam)}!${absoluut(deel)}`, waarden });
  }
  return uit;
}

const num = (x: number) => (Number.isFinite(x) ? String(x) : "#N/A");
const getallen = (v: Variabele) => v.waarden.filter((w): w is number => w !== null);

/** Rijen celinvoer (zoals een gebruiker typt) voor beschrijvende statistiek. */
export function beschrijvendeUitvoer(vars: readonly Variabele[], formules: boolean): string[][] {
  const regels: [string, string, (x: number[]) => number][] = [
    ["mean", "AVERAGE", gemiddelde],
    ["median", "MEDIAN", mediaan],
    ["mode", "MODE.SNGL", modus],
    ["stdev", "STDEV.S", standaardafwijking],
    ["variance", "VAR.S", variantie],
    ["min", "MIN", (x) => (x.length ? Math.min(...x) : NaN)],
    ["max", "MAX", (x) => (x.length ? Math.max(...x) : NaN)],
    ["range", "", (x) => (x.length ? Math.max(...x) - Math.min(...x) : NaN)],
    ["sum", "SUM", som],
    ["count", "COUNT", (x) => x.length],
    ["skewness", "SKEW", scheefheid],
    ["kurtosis", "KURT", kurtosis],
  ];
  const kop = ["", ...vars.map((v) => `'${v.naam}`)];
  return [
    kop,
    ...regels.map(([sleutel, fn, reken]) => [
      t(`measures.${sleutel}`),
      ...vars.map((v) =>
        formules ? (fn ? `=${fn}(${v.ref})` : `=MAX(${v.ref})-MIN(${v.ref})`) : num(reken(getallen(v))),
      ),
    ]),
  ];
}

export function correlatieUitvoer(vars: readonly Variabele[], formules: boolean): string[][] {
  return [
    ["", ...vars.map((v) => `'${v.naam}`)],
    ...vars.map((a) => [
      `'${a.naam}`,
      ...vars.map((b) => (formules ? `=CORREL(${a.ref},${b.ref})` : num(correlatie(a.waarden, b.waarden)))),
    ]),
  ];
}

/** Regressie: kerngetallen, daarna per waarneming x, y, voorspelde y en residu. */
export function regressieUitvoer(y: Variabele, x: Variabele, formules: boolean, links: Cel): string[][] {
  const r = regressie(x.waarden, y.waarden);
  const cel = (rij: number, kolom: number) => `$${kolomLetters(links.col + kolom)}$${links.row + rij + 1}`;
  const helling = cel(1, 1);
  const snijpunt = cel(2, 1);
  const uit: string[][] = [
    [t("regression.title"), `'${y.naam} ~ ${x.naam}`],
    [t("regression.slope"), formules ? `=SLOPE(${y.ref},${x.ref})` : num(r.helling)],
    [t("regression.intercept"), formules ? `=INTERCEPT(${y.ref},${x.ref})` : num(r.snijpunt)],
    [t("regression.r2"), formules ? `=CORREL(${y.ref},${x.ref})^2` : num(r.r2)],
    [t("regression.r"), formules ? `=CORREL(${y.ref},${x.ref})` : num(r.r)],
    [t("regression.observations"), formules ? `=COUNT(${y.ref})` : String(r.n)],
    [],
    [`'${x.naam}`, `'${y.naam}`, t("regression.predicted"), t("regression.residual")],
  ];
  const n = Math.max(x.waarden.length, y.waarden.length);
  for (let i = 0; i < n; i++) {
    const xi = x.waarden[i] ?? null;
    const yi = y.waarden[i] ?? null;
    const rij = uit.length;
    if (formules) {
      const xc = cel(rij, 0);
      const yc = cel(rij, 1);
      uit.push([
        xi === null ? "" : String(xi),
        yi === null ? "" : String(yi),
        xi === null ? "" : `=${snijpunt}+${helling}*${xc}`,
        xi === null || yi === null ? "" : `=${yc}-${cel(rij, 2)}`,
      ]);
    } else {
      const p = xi === null ? NaN : r.snijpunt + r.helling * xi;
      uit.push([xi === null ? "" : String(xi), yi === null ? "" : String(yi), xi === null ? "" : num(p), xi === null || yi === null ? "" : num(yi - p)]);
    }
  }
  return uit;
}

/** Histogram: klasse (bovengrens), frequentie en cumulatief percentage. */
export function histogramUitvoer(v: Variabele, grenzen: readonly number[], formules: boolean, links: Cel): string[][] {
  const g = [...grenzen].sort((a, b) => a - b);
  const x = getallen(v);
  const freq = frequenties(x, g);
  const cel = (rij: number, kolom: number) => `${kolomLetters(links.col + kolom)}${links.row + rij + 1}`;
  const uit: string[][] = [[t("histogram.bin"), t("histogram.frequency"), t("histogram.cumulative")]];
  let cum = 0;
  for (let i = 0; i <= g.length; i++) {
    const rij = i + 1;
    const grens = i < g.length ? String(g[i]) : t("histogram.more");
    const b = cel(rij, 0);
    const vorige = cel(rij - 1, 0);
    const f = !formules
      ? String(freq[i])
      : i === 0
        ? `=COUNTIFS(${v.ref},"<="&${b})`
        : i < g.length
          ? `=COUNTIFS(${v.ref},">"&${vorige},${v.ref},"<="&${b})`
          : `=COUNTIFS(${v.ref},">"&${vorige})`;
    cum += freq[i];
    const eerste = `$${kolomLetters(links.col + 1)}$${links.row + 2}`;
    const c = formules ? `=IF(COUNT(${v.ref})=0,0,SUM(${eerste}:${cel(rij, 1)})/COUNT(${v.ref}))` : String(x.length ? cum / x.length : 0);
    uit.push([i < g.length ? grens : `'${grens}`, f, c]);
  }
  return uit;
}

// ------------------------------------------------------------ werkboek

export interface StatResultaat {
  blad: number;
  bereik: Bereik;
  /** Voor de grafiek bij regressie: x-, y- en voorspelde kolom en hun waarden. */
  regressie?: { x: Variabele; y: Variabele; voorspeld: (number | null)[]; links: Cel; rijen: number; bladnaam: string };
}

const melding = (sleutel: string) => t(`messages.${sleutel}`);

/** Maakt de uitvoer en schrijft hem naar een nieuw blad of de doelcel. */
export async function voerStatistiekUit(api: XlsxEditorApi, v: StatVraag): Promise<StatResultaat> {
  schrijfbaar(api);
  const info = api.handle.sheetInfo();
  const bladnaam = info.sheetNames[v.blad];
  const cellen = (await lees(api, v.sheetId, v.invoer)).map((r) => r.map((c) => c.value));
  const vars = variabelen(cellen, v.invoer, bladnaam, v.perKolom, v.labels);
  if (!vars.length || vars.every((x) => !getallen(x).length)) throw new Melding(melding("noNumbers"));
  const links: Cel = v.doelcel ?? { row: 0, col: 0 };
  let uit: string[][];
  let regressieInfo: StatResultaat["regressie"];
  const percentKolom: number[] = [];
  switch (v.analyse) {
    case "beschrijvend":
      uit = beschrijvendeUitvoer(vars, v.formules);
      break;
    case "correlatie":
      if (vars.length < 2) throw new Melding(melding("needTwoVariables"));
      uit = correlatieUitvoer(vars, v.formules);
      break;
    case "regressie": {
      if (!v.x) throw new Melding(melding("needX"));
      const xc = (await lees(api, v.sheetId, v.x)).map((r) => r.map((c) => c.value));
      const xs = variabelen(xc, v.x, bladnaam, v.perKolom, v.labels);
      if (vars.length !== 1 || xs.length !== 1) throw new Melding(melding("oneVariable"));
      if (xs[0].waarden.length !== vars[0].waarden.length) throw new Melding(melding("sameLength"));
      uit = regressieUitvoer(vars[0], xs[0], v.formules, links);
      const r = regressie(xs[0].waarden, vars[0].waarden);
      regressieInfo = {
        x: xs[0],
        y: vars[0],
        voorspeld: xs[0].waarden.map((x) => (x === null ? null : r.snijpunt + r.helling * x)),
        links,
        rijen: uit.length,
        bladnaam: "",
      };
      break;
    }
    case "histogram": {
      if (vars.length !== 1) throw new Melding(melding("oneVariable"));
      let grenzen: number[];
      if (v.klassen) {
        const k = (await lees(api, v.sheetId, v.klassen)).flat().map((c) => getal(c.value));
        grenzen = k.filter((w): w is number => w !== null);
        if (!grenzen.length) throw new Melding(melding("noBins"));
      } else grenzen = automatischeKlassen(getallen(vars[0]));
      uit = histogramUitvoer(vars[0], grenzen, v.formules, links);
      percentKolom.push(2);
      break;
    }
    case "steekproef": {
      if (vars.length !== 1) throw new Melding(melding("oneVariable"));
      const keuze = steekproef(getallen(vars[0]), v.methode ?? "willekeurig", v.grootte ?? 10);
      if (!keuze.length) throw new Melding(melding("emptySample"));
      uit = [[`'${vars[0].naam}`], ...keuze.map((x) => [String(x)])];
      break;
    }
  }
  const breedte = Math.max(...uit.map((r) => r.length));
  const rechthoek = uit.map((r) => Array.from({ length: breedte }, (_, i) => r[i] ?? ""));
  const bereik: Bereik = { top: links.row, left: links.col, bottom: links.row + rechthoek.length - 1, right: links.col + breedte - 1 };
  if (bereik.bottom >= MAX_RIJEN || bereik.right >= MAX_KOLOMMEN) throw new Melding(i18next.t("spreadsheet:data.messages.outOfSheet"));

  let blad = v.blad;
  if (!v.doelcel) {
    const bezet = new Set(info.sheetNames.map((n) => n.toLowerCase()));
    let n = 1;
    while (bezet.has(t("sheetName", { number: n }).toLowerCase())) n++;
    const naam = t("sheetName", { number: n });
    blad = v.blad + 1;
    await voerOpsUit(api, [{ type: "addSheet", index: blad, name: naam }]);
  }
  const doelId = api.handle.sheetInfo().sheetIds[blad];
  const stappen: XlsxEditStep[] = [{ op: "setCellInputs", target: doel(doelId, bereik), inputs: rechthoek }];
  for (const k of percentKolom)
    stappen.push({
      op: "setNumberFormat",
      target: doel(doelId, { top: bereik.top + 1, bottom: bereik.bottom, left: bereik.left + k, right: bereik.left + k }),
      format: { type: "custom", pattern: "0.00%" },
    });
  stappen.push({ op: "patchStyle", target: doel(doelId, { ...bereik, bottom: bereik.top }), patch: { bold: true } });
  await bewerk(api, stappen);
  if (regressieInfo) regressieInfo.bladnaam = api.handle.sheetInfo().sheetNames[blad];
  return { blad, bereik, regressie: regressieInfo };
}

/** Adres van de linkerbovencel als tekst (voor meldingen). */
export const uitvoerAdres = (r: StatResultaat) => adres({ row: r.bereik.top, col: r.bereik.left });
