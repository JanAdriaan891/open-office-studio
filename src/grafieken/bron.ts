/** Celverwijzingen in grafieken ontleden en terugrekenen naar een gegevensbereik. */
import type { Bereik, Gegevensbron, GrafiekModel } from "./model.ts";

function kolomNummer(letters: string) {
  let n = 0;
  for (const t of letters.toUpperCase()) n = n * 26 + t.charCodeAt(0) - 64;
  return n - 1;
}

/** `'Blad 1'!$B$2:$B$4` → blad en bereik (0-gebaseerd); null voor iets anders. */
export function ontleedVerwijzing(ref: string | undefined): { blad: string; bereik: Bereik } | null {
  if (!ref) return null;
  const m = /^(?:'((?:[^']|'')+)'|([^!'\s()]+))!\$?([A-Za-z]{1,3})\$?(\d{1,7})(?::\$?([A-Za-z]{1,3})\$?(\d{1,7}))?$/.exec(ref.trim());
  if (!m) return null;
  const blad = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2];
  const c1 = kolomNummer(m[3]), r1 = Number(m[4]) - 1;
  const c2 = m[5] ? kolomNummer(m[5]) : c1, r2 = m[6] ? Number(m[6]) - 1 : r1;
  return {
    blad,
    bereik: { top: Math.min(r1, r2), left: Math.min(c1, c2), bottom: Math.max(r1, r2), right: Math.max(c1, c2) },
  };
}

/**
 * Het rechthoekige bereik waaruit de grafiek zijn gegevens haalt, als de
 * verwijzingen samen zo'n bereik vormen; anders null. Reeksen mogen kolommen
 * (of rijen) overslaan, bijvoorbeeld een tekstkolom zonder getallen: die
 * staan dan in `overslaan`.
 */
export function bronUitModel(model: GrafiekModel): Gegevensbron | null {
  const waarden = model.reeksen.map((r) => ontleedVerwijzing(r.waardenRef));
  if (!waarden.length || waarden.some((w) => !w)) return null;
  const blad = waarden[0]!.blad;
  const namen = model.reeksen.map((r) => ontleedVerwijzing(r.naamRef));
  const cat = ontleedVerwijzing(model.categorieenRef);
  const alle = [...waarden, ...namen, cat].filter((x): x is NonNullable<typeof x> => !!x);
  if (alle.some((x) => x.blad !== blad)) return null;
  const eerste = waarden[0]!.bereik;
  const inKolommen =
    eerste.left === eerste.right && (eerste.top !== eerste.bottom || waarden.length === 1 || waarden[1]!.bereik.left !== eerste.left);
  const koprijOfKolom = namen.every(Boolean);
  if (!koprijOfKolom && namen.some(Boolean)) return null;
  // Reeksen moeten oplopen, even lang zijn en op dezelfde hoogte (of breedte) staan.
  const posities: number[] = [];
  for (let i = 0; i < waarden.length; i++) {
    const b = waarden[i]!.bereik;
    const n = namen[i]?.bereik;
    if (inKolommen) {
      if (b.right !== b.left || b.top !== eerste.top || b.bottom !== eerste.bottom) return null;
      if (n && (n.left !== b.left || n.top !== b.top - 1 || n.bottom !== n.top)) return null;
      posities.push(b.left);
    } else {
      if (b.bottom !== b.top || b.left !== eerste.left || b.right !== eerste.right) return null;
      if (n && (n.top !== b.top || n.left !== b.left - 1 || n.right !== n.left)) return null;
      posities.push(b.top);
    }
    if (i > 0 && posities[i] <= posities[i - 1]) return null;
  }
  let begin = posities[0];
  if (cat) {
    const c = cat.bereik;
    if (inKolommen && (c.left >= eerste.left || c.right !== c.left || c.top !== eerste.top || c.bottom !== eerste.bottom)) return null;
    if (!inKolommen && (c.top >= eerste.top || c.bottom !== c.top || c.left !== eerste.left || c.right !== eerste.right)) return null;
    begin = (inKolommen ? c.left : c.top) + 1;
  }
  const gebruikt = new Set(posities);
  const overslaan: number[] = [];
  for (let p = begin; p <= posities[posities.length - 1]; p++) if (!gebruikt.has(p)) overslaan.push(p - begin);
  const laatste = waarden[waarden.length - 1]!.bereik;
  const bereik = {
    top: Math.min(...alle.map((x) => x.bereik.top)),
    left: Math.min(...alle.map((x) => x.bereik.left)),
    bottom: laatste.bottom,
    right: laatste.right,
  };
  return {
    blad,
    bereik,
    reeksenIn: inKolommen ? "kolommen" : "rijen",
    koprij: inKolommen ? koprijOfKolom : !!cat,
    kopkolom: inKolommen ? !!cat : koprijOfKolom,
    ...(overslaan.length ? { overslaan } : {}),
  };
}
