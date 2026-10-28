/**
 * Bijgehouden wijzigingen (#28): soorten, auteurs, filteren en de vraag of
 * een wijziging in de selectie ligt. Los van de engine.
 */

export interface Revisie {
  revisionId: string;
  author: string;
  date: string;
  kind: string;
  story: string;
  preview: string;
  range: { story: string; start: { paraId: string; offset: number }; end: { paraId: string; offset: number } };
}

export const SOORTNAAM: Record<string, string> = {
  insertion: "Ingevoegd",
  deletion: "Verwijderd",
  pPrIns: "Alinea ingevoegd",
  pPrDel: "Alinea verwijderd",
  pPrChange: "Alineaopmaak gewijzigd",
  trIns: "Rij ingevoegd",
  trDel: "Rij verwijderd",
  tableIns: "Tabel ingevoegd",
  tableDel: "Tabel verwijderd",
};
export const soortNaam = (kind: string) => SOORTNAAM[kind] ?? "Gewijzigd";

export type Weergave = "alle" | "eenvoudig" | "geen" | "origineel";
export const WEERGAVEN: { waarde: Weergave; naam: string; uitleg: string }[] = [
  { waarde: "alle", naam: "Alle markeringen", uitleg: "Ingevoegde en verwijderde tekst gemarkeerd in het document" },
  { waarde: "eenvoudig", naam: "Eenvoudige markering", uitleg: "Het eindresultaat met een rode streep in de marge bij gewijzigde regels (alleen-lezen voorbeeld)" },
  { waarde: "geen", naam: "Geen markeringen", uitleg: "Het document alsof alle wijzigingen zijn geaccepteerd (alleen-lezen voorbeeld)" },
  { waarde: "origineel", naam: "Origineel", uitleg: "Het document alsof alle wijzigingen zijn geweigerd (alleen-lezen voorbeeld)" },
];

/** Auteurs met het aantal wijzigingen, op naam gesorteerd. */
export function auteurs(revisies: readonly Revisie[]) {
  const telling = new Map<string, number>();
  for (const r of revisies) telling.set(r.author || "Onbekend", (telling.get(r.author || "Onbekend") ?? 0) + 1);
  return [...telling].sort((a, b) => a[0].localeCompare(b[0], "nl")).map(([naam, aantal]) => ({ naam, aantal }));
}

/** Revisies van de getoonde auteurs (een lege verborgen-set toont iedereen). */
export function getoond(revisies: readonly Revisie[], verborgen: ReadonlySet<string>) {
  return verborgen.size ? revisies.filter((r) => !verborgen.has(r.author || "Onbekend")) : [...revisies];
}

/** Telt per soort, voor de samenvatting in het deelvenster. */
export function samenvatting(revisies: readonly Revisie[]) {
  const ingevoegd = revisies.filter((r) => /ins/i.test(r.kind) || r.kind === "insertion").length;
  const verwijderd = revisies.filter((r) => /del/i.test(r.kind) || r.kind === "deletion").length;
  const opmaak = revisies.length - ingevoegd - verwijderd;
  return { totaal: revisies.length, ingevoegd, verwijderd, opmaak };
}

export interface Plek {
  story: string;
  paraId: string;
  offset: number;
}

/**
 * Ligt (een deel van) een revisie in de selectie? `volgorde` geeft de index
 * van een alinea in zijn verhaal, zodat plekken over alinea's heen te
 * vergelijken zijn.
 */
export function inSelectie(r: Revisie, van: Plek, tot: Plek, volgorde: (story: string, paraId: string) => number) {
  if (r.range.story !== van.story) return false;
  const sleutel = (p: { paraId: string; offset: number }) => volgorde(r.range.story, p.paraId) * 1e6 + p.offset;
  const a = Math.min(sleutel(van), sleutel(tot)),
    b = Math.max(sleutel(van), sleutel(tot));
  const ra = sleutel(r.range.start),
    rb = sleutel(r.range.end);
  // Een lege selectie (cursor) telt als binnen als de cursor in de revisie staat.
  return a === b ? ra <= a && a <= rb : ra < b && rb > a;
}

/** Leesbare datum zoals ‘12 okt. 2026, 14:05’. */
export function toonDatum(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
