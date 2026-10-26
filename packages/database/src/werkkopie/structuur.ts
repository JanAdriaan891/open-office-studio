/**
 * Pure hulpfuncties voor structuurwijzigingen van de werkkopie:
 * kolomdefinities, SQL-literalen en de typeconversie bij het herbouwen van
 * een tabel. Geen databasetoegang; zie `werkkopie.ts` voor de procedure.
 */
import { WerkkopieFout, type VeldSchema, type Veldsoort, type Waarde } from "./contract.ts";
import { citeer, typeVoorSoort } from "./access-sql.ts";
import { cstr, isoUitMs, msUitTekst, msUitWaarde, rondAf } from "./functies.ts";

export type SqlCel = number | string | Uint8Array | null;

export const VELDSOORTEN: readonly Veldsoort[] = ["tekst", "memo", "geheel", "getal", "valuta", "datum", "jaNee", "autonummer", "binair", "guid"];

export function sqlLiteraal(w: Waarde): string {
  if (w === null) return "NULL";
  if (typeof w === "boolean") return w ? "1" : "0";
  if (typeof w === "number") {
    if (!Number.isFinite(w)) throw new WerkkopieFout("syntaxis", "Een standaardwaarde moet een eindig getal zijn.");
    return String(w);
  }
  if (w instanceof Uint8Array) return `X'${Array.from(w, (b) => b.toString(16).padStart(2, "0")).join("")}'`;
  return `'${w.replaceAll("'", "''")}'`;
}

export function standaardUit(sql: string): Waarde {
  if (/^'.*'$/s.test(sql)) return sql.slice(1, -1).replaceAll("''", "'");
  if (/^NULL$/i.test(sql)) return null;
  const n = Number(sql);
  return Number.isFinite(n) ? n : sql;
}

/** Controleert naam, soort en lengte van een veld; gooit een `WerkkopieFout`. */
export function controleerVeld(v: VeldSchema) {
  if (!v || typeof v.naam !== "string" || !v.naam.trim()) throw new WerkkopieFout("syntaxis", "Elk veld heeft een naam nodig.");
  if (v.naam.length > 64) throw new WerkkopieFout("syntaxis", `Veldnaam ‘${v.naam.slice(0, 20)}…’ is langer dan 64 tekens.`);
  if (/^(_openaec_|sqlite_)/i.test(v.naam) || /[\u0000-\u001f\[\]!`]/.test(v.naam) || /^\s|\s$/.test(v.naam))
    throw new WerkkopieFout("syntaxis", `‘${v.naam}’ is geen geldige veldnaam (geen [ ] ! \` of stuurtekens, niet beginnen of eindigen met een spatie).`);
  if (!VELDSOORTEN.includes(v.soort)) throw new WerkkopieFout("syntaxis", `Onbekende veldsoort ‘${String(v.soort)}’.`);
  if (v.soort === "tekst" && v.lengte !== undefined && (!Number.isInteger(v.lengte) || v.lengte < 1 || v.lengte > 255))
    throw new WerkkopieFout("syntaxis", `De lengte van ‘${v.naam}’ moet een geheel getal van 1 tot en met 255 zijn.`);
  if (v.standaard !== undefined) sqlLiteraal(v.standaard);
}

/** Kolomdefinitie voor CREATE TABLE / ADD COLUMN, gelijk aan `maakTabel`. */
export function kolomDefinitie(v: VeldSchema, enigePrimair: boolean): string {
  const isPk = enigePrimair && v.primair === true;
  let sql = `${citeer(v.naam)} ${typeVoorSoort(v.soort, { lengte: v.lengte, primair: isPk, enigePrimair })}`;
  if (isPk) sql += " PRIMARY KEY";
  if (v.verplicht) sql += " NOT NULL";
  if (v.standaard !== undefined) sql += ` DEFAULT ${sqlLiteraal(v.standaard)}`;
  if (v.soort === "tekst" && v.lengte && v.lengte > 0) sql += ` CHECK (length(${citeer(v.naam)}) <= ${Math.trunc(v.lengte)})`;
  return sql;
}

export type Conversie = { ok: true; waarde: SqlCel } | { ok: false; reden: string };

const SOORTNAAM: Record<Veldsoort, string> = {
  tekst: "Tekst",
  memo: "Memo",
  geheel: "Geheel getal",
  getal: "Getal",
  valuta: "Valuta",
  datum: "Datum/tijd",
  jaNee: "Ja/nee",
  autonummer: "AutoNummer",
  binair: "Binair",
  guid: "GUID",
};
export const soortNaam = (s: Veldsoort) => SOORTNAAM[s] ?? s;

function leesGetal(s: string): number | null {
  const t = s.trim();
  if (/^[+-]?\d+([.,]\d+)?([eE][+-]?\d+)?$/.test(t)) {
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Zet één opgeslagen waarde om naar de soort van het nieuwe veld (zoals
 * Access bij het wijzigen van een gegevenstype). Bij een gelijke soort blijft
 * de waarde ongewijzigd; alleen lengte en verplicht worden gecontroleerd.
 */
export function converteerWaarde(w: SqlCel, van: Veldsoort | null, naar: VeldSchema): Conversie {
  const leeg = (): Conversie =>
    naar.verplicht && naar.soort !== "autonummer" ? { ok: false, reden: "leeg terwijl het veld verplicht is" } : { ok: true, waarde: null };
  if (w === null || w === undefined) return leeg();
  const zelfde = van === naar.soort || (van === "autonummer" && naar.soort === "geheel") || (van === "geheel" && naar.soort === "autonummer");
  if (w instanceof Uint8Array) return naar.soort === "binair" ? { ok: true, waarde: w } : { ok: false, reden: `binaire gegevens zijn niet om te zetten naar ${soortNaam(naar.soort)}` };
  if (naar.soort === "binair") return { ok: false, reden: "tekst of getallen zijn niet om te zetten naar Binair" };
  const isGetal = typeof w === "number";
  switch (naar.soort) {
    case "tekst":
    case "memo": {
      const waarde: SqlCel = zelfde || !isGetal ? w : van === "jaNee" ? (w ? "Waar" : "Onwaar") : cstr(w);
      const max = naar.soort === "tekst" ? (naar.lengte ?? 255) : Infinity;
      if (String(waarde).length > max) return { ok: false, reden: `langer dan ${max} tekens` };
      return { ok: true, waarde };
    }
    case "geheel":
    case "autonummer": {
      if (zelfde) return { ok: true, waarde: w };
      let n: number | null;
      if (isGetal) n = van === "jaNee" ? (w ? -1 : 0) : w;
      else {
        if (!w.trim()) return leeg();
        n = leesGetal(w);
      }
      if (n === null) return { ok: false, reden: `geen geheel getal` };
      const r = rondAf(n);
      if (!Number.isSafeInteger(r)) return { ok: false, reden: "getal buiten het bereik van een geheel getal" };
      return { ok: true, waarde: r };
    }
    case "getal":
    case "valuta": {
      if (zelfde) return { ok: true, waarde: w };
      let n: number | null;
      if (isGetal) n = van === "jaNee" ? (w ? -1 : 0) : w;
      else {
        if (!w.trim()) return leeg();
        n = leesGetal(w);
      }
      if (n === null) return { ok: false, reden: "geen getal" };
      return { ok: true, waarde: naar.soort === "valuta" ? rondAf(n, 4) : n };
    }
    case "jaNee": {
      if (zelfde) return { ok: true, waarde: w };
      if (isGetal) return { ok: true, waarde: w !== 0 ? 1 : 0 };
      const t = w.trim();
      if (!t) return leeg();
      if (/^(waar|ja|yes|true|-1|1|aan|on)$/i.test(t)) return { ok: true, waarde: 1 };
      if (/^(onwaar|nee|no|false|0|uit|off)$/i.test(t)) return { ok: true, waarde: 0 };
      return { ok: false, reden: "geen ja/nee-waarde" };
    }
    case "datum": {
      if (zelfde) return { ok: true, waarde: w };
      if (!isGetal && !w.trim()) return leeg();
      const ms = isGetal ? (van === "jaNee" ? null : msUitWaarde(w)) : msUitTekst(w, "dmj");
      if (ms === null) return { ok: false, reden: "geen datum" };
      return { ok: true, waarde: isoUitMs(ms) };
    }
    case "guid": {
      if (zelfde) return { ok: true, waarde: w };
      const t = String(w).trim();
      if (!t) return leeg();
      if (!/^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i.test(t)) return { ok: false, reden: "geen GUID" };
      return { ok: true, waarde: t.startsWith("{") ? t : `{${t}}` };
    }
  }
  return { ok: false, reden: "onbekende veldsoort" };
}

/** Veldsoorten die in een relatie op elkaar passen (AutoNummer ↔ Geheel getal). */
export function passendeSoort(a: Veldsoort, b: Veldsoort) {
  const n = (s: Veldsoort) => (s === "autonummer" ? "geheel" : s === "memo" ? "tekst" : s);
  return n(a) === n(b);
}

/** Regex die `naam` als losse naam vindt (ook tussen haken), hoofdletterongevoelig. */
export function naamPatroon(naam: string): RegExp {
  const veilig = naam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w])${veilig}(?![\\w])`, "i");
}

/** Rijen samengevat voor een melding: aantal en hoogstens vijf voorbeeld-rowids, nooit inhoud. */
export function voorbeeldRowids(rowids: number[], totaal = rowids.length): string {
  const lijst = rowids.slice(0, 5).join(", ");
  return `${totaal} rij(en)${lijst ? `, bijvoorbeeld rowid ${lijst}` : ""}`;
}
