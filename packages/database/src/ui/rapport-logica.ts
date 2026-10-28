/**
 * Rapportdefinitie en de pure berekening van groepen en totalen. De weergave
 * (afdrukvoorbeeld) gebruikt alleen het resultaat van `bouwRapport`.
 */
import type { Waarde } from "../werkkopie/contract.ts";
import { vergelijk } from "./invoer.ts";

export type Totaalfunctie = "som" | "gemiddelde" | "aantal";

export interface RapportDefinitie {
  versie: 1;
  titel: string;
  /** Tekst boven het rapport (kop) en onder elke pagina/het rapport (voet). */
  kop: string;
  voet: string;
  /** Getoonde velden in volgorde; leeg = alle kolommen van de bron. */
  velden: string[];
  groepeer: string | null;
  sorteer: { veld: string; aflopend: boolean }[];
  totalen: { veld: string; functie: Totaalfunctie }[];
  /** Liggend afdrukken. */
  liggend?: boolean;
}

export function leegRapport(titel: string): RapportDefinitie {
  return {
    versie: 1,
    titel,
    kop: "",
    voet: "",
    velden: [],
    groepeer: null,
    sorteer: [],
    totalen: [],
  };
}

/** Leest een opgeslagen definitie robuust in (onbekende of ontbrekende delen krijgen een standaard). */
export function leesRapportDefinitie(def: unknown, titel: string): RapportDefinitie {
  const basis = leegRapport(titel);
  if (!def || typeof def !== "object") return basis;
  const d = def as Partial<RapportDefinitie>;
  return {
    versie: 1,
    titel: typeof d.titel === "string" ? d.titel : titel,
    kop: typeof d.kop === "string" ? d.kop : "",
    voet: typeof d.voet === "string" ? d.voet : "",
    velden: Array.isArray(d.velden) ? d.velden.filter((v) => typeof v === "string") : [],
    groepeer: typeof d.groepeer === "string" && d.groepeer ? d.groepeer : null,
    sorteer: Array.isArray(d.sorteer)
      ? d.sorteer.filter((s) => s && typeof s.veld === "string").map((s) => ({ veld: s.veld, aflopend: !!s.aflopend }))
      : [],
    totalen: Array.isArray(d.totalen)
      ? d.totalen
          .filter((t) => t && typeof t.veld === "string" && ["som", "gemiddelde", "aantal"].includes(t.functie))
          .map((t) => ({ veld: t.veld, functie: t.functie }))
      : [],
    liggend: !!d.liggend,
  };
}

export interface Totaal {
  veld: string;
  functie: Totaalfunctie;
  /** null als er geen getallen waren (som/gemiddelde). */
  waarde: number | null;
}

export interface RapportGroep {
  /** Waarde van het groepeerveld (null = leeg); `undefined` als er niet wordt gegroepeerd. */
  sleutel: Waarde | undefined;
  rijen: Waarde[][];
  totalen: Totaal[];
}

export interface RapportResultaat {
  kolommen: string[];
  /** Index van elke getoonde kolom in de bronrijen. */
  indexen: number[];
  groepen: RapportGroep[];
  eindtotalen: Totaal[];
  aantal: number;
  /** Velden uit de definitie die niet in de bron voorkomen. */
  ontbrekend: string[];
}

function alsGetal(w: Waarde | undefined): number | null {
  if (typeof w === "number" && Number.isFinite(w)) return w;
  if (typeof w === "boolean") return w ? -1 : 0;
  return null;
}

export function bereken(rijen: Waarde[][], index: number, functie: Totaalfunctie): number | null {
  if (functie === "aantal")
    return index < 0 ? rijen.length : rijen.filter((r) => r[index] !== null && r[index] !== undefined).length;
  const getallen = rijen.map((r) => alsGetal(r[index])).filter((n): n is number => n !== null);
  if (!getallen.length) return null;
  const som = getallen.reduce((a, b) => a + b, 0);
  return functie === "som" ? som : som / getallen.length;
}

/** Sorteert, groepeert en berekent totalen per groep en voor het hele rapport. */
export function bouwRapport(kolommen: string[], rijen: Waarde[][], def: RapportDefinitie): RapportResultaat {
  const zoek = (naam: string) => kolommen.findIndex((k) => k.toLowerCase() === naam.toLowerCase());
  const ontbrekend = new Set<string>();
  const gevraagd = def.velden.length ? def.velden : kolommen;
  const indexen: number[] = [];
  for (const v of gevraagd) {
    const i = zoek(v);
    if (i < 0) ontbrekend.add(v);
    else indexen.push(i);
  }
  const groepIndex = def.groepeer ? zoek(def.groepeer) : -1;
  if (def.groepeer && groepIndex < 0) ontbrekend.add(def.groepeer);
  const sortering = def.sorteer
    .map((s) => ({ i: zoek(s.veld), aflopend: s.aflopend, veld: s.veld }))
    .filter((s) => {
      if (s.i < 0) ontbrekend.add(s.veld);
      return s.i >= 0;
    });
  const totalen = def.totalen
    .map((t) => ({ ...t, i: zoek(t.veld) }))
    .filter((t) => {
      if (t.i < 0 && t.functie !== "aantal") ontbrekend.add(t.veld);
      return t.i >= 0 || t.functie === "aantal";
    });
  const gesorteerd = rijen
    .map((rij, volgorde) => ({ rij, volgorde }))
    .sort((a, b) => {
      if (groepIndex >= 0) {
        const c = vergelijk(a.rij[groepIndex], b.rij[groepIndex]);
        if (c) return c;
      }
      for (const s of sortering) {
        const c = vergelijk(a.rij[s.i], b.rij[s.i]);
        if (c) return s.aflopend ? -c : c;
      }
      return a.volgorde - b.volgorde; // stabiel
    })
    .map((x) => x.rij);
  const reken = (lijst: Waarde[][]): Totaal[] =>
    totalen.map((t) => ({ veld: t.veld, functie: t.functie, waarde: bereken(lijst, t.i, t.functie) }));
  const groepen: RapportGroep[] = [];
  if (groepIndex < 0) groepen.push({ sleutel: undefined, rijen: gesorteerd, totalen: [] });
  else
    for (const rij of gesorteerd) {
      const laatste = groepen[groepen.length - 1];
      if (laatste && vergelijk(laatste.sleutel, rij[groepIndex]) === 0) laatste.rijen.push(rij);
      else groepen.push({ sleutel: rij[groepIndex], rijen: [rij], totalen: [] });
    }
  if (groepIndex >= 0) for (const g of groepen) g.totalen = reken(g.rijen);
  return {
    kolommen: indexen.map((i) => kolommen[i]),
    indexen,
    groepen,
    eindtotalen: reken(gesorteerd),
    aantal: rijen.length,
    ontbrekend: [...ontbrekend],
  };
}

export const FUNCTIENAMEN: Record<Totaalfunctie, string> = {
  som: "Som",
  gemiddelde: "Gemiddelde",
  aantal: "Aantal",
};
