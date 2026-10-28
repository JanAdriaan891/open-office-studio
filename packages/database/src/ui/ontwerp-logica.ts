/**
 * Pure logica voor het tabelontwerp en het relatievenster: concepten uit de
 * invoervelden omzetten naar contractaanroepen (veld toevoegen, hernoemen,
 * wijzigen, sleutel instellen, relatie maken) en uitkomsten als tekst.
 */
import type { NieuweRelatie, StructuurResultaat, TabelSchema, VeldSchema, VeldWijziging, Veldsoort, Waarde } from "../werkkopie/contract.ts";
import { bewerkTekst, leesInvoer } from "./invoer.ts";

export interface ConceptVeld {
  sleutel: number;
  naam: string;
  soort: Veldsoort;
  lengte: string;
  verplicht: boolean;
  primair: boolean;
  standaard: string;
}

export const ONTWERPSOORTEN: Veldsoort[] = ["autonummer", "tekst", "memo", "geheel", "getal", "valuta", "datum", "jaNee", "guid", "binair"];

export function conceptUitVeld(v: VeldSchema, sleutel: number): ConceptVeld {
  return {
    sleutel,
    naam: v.naam,
    soort: v.soort,
    lengte: v.soort === "tekst" ? String(v.lengte ?? 255) : "",
    verplicht: !!v.verplicht,
    primair: !!v.primair,
    standaard: v.standaard === undefined || v.standaard === null ? "" : bewerkTekst(v.standaard, v.soort),
  };
}

/** Eén conceptveld naar een `VeldSchema`, of de eerste fout. */
export function conceptNaarVeld(v: ConceptVeld): { veld: VeldSchema } | { fout: string } {
  const naam = v.naam.trim();
  if (!naam) return { fout: "Elk veld heeft een naam nodig." };
  if (/[[\]!`.]/.test(naam)) return { fout: `‘${naam}’: een veldnaam mag geen [ ] ! \` of . bevatten.` };
  const veld: VeldSchema = { naam, soort: v.soort };
  if (v.soort === "tekst") {
    const n = Number(v.lengte || 255);
    if (!Number.isInteger(n) || n < 1 || n > 255) return { fout: `Lengte van ‘${naam}’ moet tussen 1 en 255 liggen.` };
    veld.lengte = n;
  }
  if (v.verplicht) veld.verplicht = true;
  if (v.primair) veld.primair = true;
  if (v.standaard.trim() && v.soort !== "autonummer" && v.soort !== "binair") {
    const r = leesInvoer(v.standaard, { ...veld, verplicht: false });
    if (!r.ok) return { fout: `Standaardwaarde van ‘${naam}’: ${r.fout}` };
    if (r.waarde !== null) veld.standaard = r.waarde;
  }
  return { veld };
}

const vergelijkbaar = (w: Waarde | undefined): string | number | null =>
  w === undefined || w === null ? null : typeof w === "boolean" ? (w ? 1 : 0) : w instanceof Uint8Array ? `bin:${w.byteLength}` : w;

export interface VeldPlan {
  /** Nieuwe naam, of null als de naam gelijk blijft. */
  hernoem: string | null;
  /** Wijziging van type/lengte/verplicht/standaard, of null. */
  wijziging: VeldWijziging | null;
}

/** Wat er voor een bestaand veld moet gebeuren om het concept te bereiken (sleutel apart). */
export function veldPlan(oud: VeldSchema, concept: ConceptVeld): VeldPlan | { fout: string } {
  const r = conceptNaarVeld({ ...concept, primair: false });
  if ("fout" in r) return r;
  const nieuw = r.veld;
  const wijziging: VeldWijziging = {};
  if (nieuw.soort !== oud.soort) wijziging.soort = nieuw.soort;
  if (nieuw.soort === "tekst" && (nieuw.lengte ?? 255) !== (oud.soort === "tekst" ? (oud.lengte ?? 255) : -1)) wijziging.lengte = nieuw.lengte;
  if (!!nieuw.verplicht !== !!oud.verplicht) wijziging.verplicht = !!nieuw.verplicht;
  if (vergelijkbaar(nieuw.standaard) !== vergelijkbaar(oud.standaard)) wijziging.standaard = nieuw.standaard ?? null;
  return { hernoem: nieuw.naam !== oud.naam ? nieuw.naam : null, wijziging: Object.keys(wijziging).length ? wijziging : null };
}

/** Nieuwe sleutelvelden (in tabelvolgorde), of null als de sleutel gelijk blijft. */
export function sleutelPlan(schema: TabelSchema, concepten: { naam: string; primair: boolean }[]): string[] | null {
  const oud = schema.velden.filter((v) => v.primair).map((v) => v.naam.toLowerCase());
  const nieuw = concepten.filter((c) => c.primair).map((c) => c.naam);
  if (oud.length === nieuw.length && nieuw.every((n) => oud.includes(n.toLowerCase()))) return null;
  return nieuw;
}

/** Leesbare uitkomst van een structuurwijziging, met query’s die het veld noemen. */
export function structuurTekst(wat: string, r: StructuurResultaat): string {
  const delen = [`${wat}${r.herbouwd ? " (tabel veilig herbouwd)" : ""}.`, ...r.meldingen.filter((m) => !/opgeslagen query/.test(m))];
  if (r.querys.length)
    delen.push(`Controleer ${r.querys.length === 1 ? "de query" : "de query’s"} ${r.querys.map((q) => `‘${q}’`).join(", ")}: ${r.querys.length === 1 ? "die noemt" : "die noemen"} dit veld en ${r.querys.length === 1 ? "is" : "zijn"} niet automatisch bijgewerkt.`);
  return delen.join(" ");
}

export interface RelatieConcept {
  naam: string;
  tabel: string;
  veld: string;
  naarTabel: string;
  naarVeld: string;
  integriteit: boolean;
  trapsBijwerken: boolean;
  trapsVerwijderen: boolean;
}

/** Relatieconcept (één veldpaar, zoals het venster het vraagt) naar `NieuweRelatie`. */
export function relatieUitConcept(c: RelatieConcept): NieuweRelatie | { fout: string } {
  if (!c.tabel || !c.naarTabel) return { fout: "Kies beide tabellen." };
  if (!c.veld || !c.naarVeld) return { fout: "Kies aan beide kanten een veld." };
  if (c.tabel === c.naarTabel && c.veld === c.naarVeld) return { fout: "Een veld kan niet naar zichzelf verwijzen." };
  const relatie: NieuweRelatie = {
    tabel: c.tabel,
    velden: [c.veld],
    naarTabel: c.naarTabel,
    naarVelden: [c.naarVeld],
    integriteit: c.integriteit,
    trapsBijwerken: c.integriteit && c.trapsBijwerken,
    trapsVerwijderen: c.integriteit && c.trapsVerwijderen,
  };
  if (c.naam.trim()) relatie.naam = c.naam.trim();
  return relatie;
}

/** Velden van de doeltabel die als doel van een relatie met integriteit in aanmerking komen (enkelvoudige sleutel). */
export function sleutelVelden(t: TabelSchema | undefined): string[] {
  if (!t) return [];
  const primair = t.velden.filter((v) => v.primair);
  return primair.length === 1 ? [primair[0].naam] : [];
}
