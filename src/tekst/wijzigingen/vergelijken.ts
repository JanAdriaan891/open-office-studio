/**
 * Versies vergelijken (#57) met `compareDocx` van de engine: het origineel
 * met de verschillen in de lopende tekst als bijgehouden wijzigingen van één
 * auteur. De engine weigert documenten die al wijzigingen bevatten; die kunnen
 * we voor de vergelijking eerst laten accepteren (in een kopie).
 */
import type { DocxCompareDiagnostic, DocxComparedChange } from "@betteroffice/docx";
import { strFromU8, unzipSync } from "fflate";
import { voorbeeld } from "./opdrachten.ts";

export interface VergelijkOpties {
  auteur: string;
  korrel: "word" | "char";
  /** Bestaande wijzigingen in beide documenten eerst accepteren (alleen in de kopie). */
  eerstAccepteren: boolean;
  datum?: Date;
}

export type Vergelijking =
  | { ok: true; bytes: Uint8Array; wijzigingen: DocxComparedChange[]; meldingen: DocxCompareDiagnostic[]; verschillen: number }
  | { ok: false; meldingen: DocxCompareDiagnostic[] };

/** Of het hoofddocument van een DOCX bijgehouden wijzigingen bevat. */
export function heeftWijzigingen(bytes: Uint8Array) {
  try {
    const pakket = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
    const xml = pakket["word/document.xml"];
    return !!xml && /<w:(ins|del|moveFrom|moveTo)\b/.test(strFromU8(xml));
  } catch {
    return false;
  }
}

export async function vergelijk(origineel: Uint8Array, gewijzigd: Uint8Array, opties: VergelijkOpties): Promise<Vergelijking> {
  let a = origineel,
    b = gewijzigd;
  if (opties.eerstAccepteren) {
    if (heeftWijzigingen(a)) a = (await voorbeeld(a, "accepteren")).bytes;
    if (heeftWijzigingen(b)) b = (await voorbeeld(b, "accepteren")).bytes;
  }
  const auteur = opties.auteur.trim().replace(/[\u0000-\u001f]/g, "") || "Vergelijking";
  // Pas bij gebruik laden: de vergelijking hoort niet in de opstartbundel.
  const { compareDocx } = await import("@betteroffice/docx");
  const uit = await compareDocx(a, b, {
    author: auteur,
    date: (opties.datum ?? new Date()).toISOString(),
    granularity: opties.korrel,
    unsupported: "report",
  });
  if (!uit.ok) return { ok: false, meldingen: uit.diagnostics };
  return { ok: true, bytes: uit.docx, wijzigingen: uit.changes, meldingen: uit.diagnostics, verschillen: uit.changes.length };
}

const UITLEG: Partial<Record<DocxCompareDiagnostic["code"], string>> = {
  "invalid-options": "De instellingen voor de vergelijking zijn ongeldig.",
  "invalid-docx": "Een van de bestanden is geen geldig Word-document.",
  "existing-revisions": "Een document bevat al bijgehouden wijzigingen. Vink ‘Bestaande wijzigingen eerst accepteren’ aan, of accepteer of weiger ze eerst.",
  "paragraph-insertion": "Er zijn alinea’s toegevoegd. De engine vergelijkt nu alleen tekst binnen alinea’s die in beide versies voorkomen.",
  "paragraph-deletion": "Er zijn alinea’s verwijderd. De engine vergelijkt nu alleen tekst binnen alinea’s die in beide versies voorkomen.",
  "paragraph-move": "Alinea’s zijn verplaatst; dat kan de vergelijking nog niet weergeven.",
  "ambiguous-alignment": "Het is niet eenduidig welke alinea’s bij elkaar horen.",
  "table-change": "Tabellen verschillen; tabelwijzigingen kan de vergelijking nog niet weergeven.",
  "structure-change": "De opbouw van het document verschilt (secties, tabellen of blokken).",
  "field-change": "Velden verschillen; die worden niet als wijziging getoond.",
  "object-change": "Afbeeldingen of objecten verschillen; die worden niet als wijziging getoond.",
  "content-control-change": "Inhoudsbesturingselementen verschillen.",
  "formatting-change": "De opmaak verschilt; opmaakwijzigingen worden niet als wijziging getoond.",
  "unsupported-content": "Het document bevat inhoud die de vergelijking niet ondersteunt.",
  "unsupported-formatting": "Het document bevat opmaak die de vergelijking niet ondersteunt.",
  "out-of-scope-change": "Er zijn verschillen buiten de hoofdtekst (kop- en voetteksten, noten); die worden niet vergeleken.",
  "opaque-part-change": "Andere onderdelen van het pakket verschillen; die worden niet vergeleken.",
  "metadata-difference": "Documenteigenschappen verschillen; die worden niet vergeleken.",
  "limit-exceeded": "Het document is te groot of te verschillend voor de vergelijking.",
  "diagnostics-truncated": "Er zijn meer meldingen dan getoond.",
  "batch-refused": "De verschillen konden niet als wijzigingen worden vastgelegd.",
  "serialization-failed": "Het resultaat kon niet worden opgeslagen.",
  "roundtrip-mismatch": "Het resultaat kwam niet overeen met de gewijzigde versie.",
};

/** Nederlandse uitleg bij een melding van de engine, met het aantal keer. */
export function meldingen(lijst: readonly DocxCompareDiagnostic[]) {
  const per = new Map<string, { tekst: string; ernst: DocxCompareDiagnostic["severity"]; aantal: number }>();
  for (const d of lijst) {
    const tekst = UITLEG[d.code] ?? d.message;
    const oud = per.get(d.code);
    if (oud) oud.aantal++;
    else per.set(d.code, { tekst, ernst: d.severity, aantal: 1 });
  }
  const volgorde = { error: 0, warning: 1, info: 2 };
  return [...per.values()].sort((a, b) => volgorde[a.ernst] - volgorde[b.ernst]);
}

/** Korte omschrijving van één verschil: ‘oud’ → ‘nieuw’. */
export function verschilTekst(w: DocxComparedChange) {
  if (w.kind === "insertion") return { soort: "Ingevoegd", oud: "", nieuw: w.revised.text };
  if (w.kind === "deletion") return { soort: "Verwijderd", oud: w.original.text, nieuw: "" };
  return { soort: "Vervangen", oud: w.original.text, nieuw: w.revised.text };
}

/** Naam voor het resultaattabblad. */
export function resultaatNaam(origineel: string, gewijzigd: string) {
  const kaal = (n: string) => n.replace(/\.(docx|docm|dotx)$/i, "");
  return `Vergelijking ${kaal(origineel)} – ${kaal(gewijzigd)}.docx`.replace(/[\\/:*?"<>|]/g, "-");
}
