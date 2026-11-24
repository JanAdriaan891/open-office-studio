/**
 * Bouwstenen lezen uit en invoegen in de editor via de Yrs-sessie: de
 * selectie als verhaalsegmenten (tekst met opmaak, alineagrenzen met
 * alinea-eigenschappen) en invoegen als één ongedaan-maakstap.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import i18next from "../../i18n/config";
import { begin, engine, klaar, ruw, type Sessie } from "../gedeeld/engine";
import { lengteVan, schoonSegmenten, type Segment } from "./opslag";

interface Plek {
  story: string;
  paraId: string;
  offset: number;
}

const rauw = (s: Sessie, p: Plek) => s.locateParagraph(p.story, p.paraId).start + p.offset;

/** De segmenten tussen twee ruwe posities in een verhaal (tekst wordt bijgesneden). */
export function segmentenTussen(alle: readonly Segment[] | readonly unknown[], van: number, tot: number): { segmenten: Segment[]; overgeslagen: number } {
  const uit: Segment[] = [];
  let positie = 0;
  let overgeslagen = 0;
  for (const d of alle as Segment[]) {
    const lengte = d.kind === "text" ? d.text.length : 1;
    const eind = positie + lengte;
    if (eind > van && positie < tot) {
      if (d.kind === "text") uit.push({ ...d, text: d.text.slice(Math.max(0, van - positie), Math.min(lengte, tot - positie)) });
      else uit.push(d);
    }
    positie = eind;
    if (positie >= tot) break;
  }
  const schoon = schoonSegmenten(uit);
  overgeslagen = uit.filter((s) => s.kind === "embed").length - schoon.filter((s) => s.kind === "embed").length;
  return { segmenten: schoon, overgeslagen };
}

/** De huidige selectie als bouwsteeninhoud; gooit zonder selectie. */
export async function leesSelectie(ref: DocxEditorRef | null) {
  if (!ref) throw new Error(i18next.t("writer:general.documentNotReady"));
  await ref.flushPendingInput();
  const e = engine(ref);
  const sel = e.sessie.selection();
  if (!sel || sel.anchor.story !== sel.head.story) throw new Error(i18next.t("writer:autoText.errors.selectText"));
  const a = rauw(e.sessie, sel.anchor);
  const b = rauw(e.sessie, sel.head);
  if (a === b) throw new Error(i18next.t("writer:autoText.errors.selectText"));
  const uit = segmentenTussen(e.sessie.storySegments(sel.anchor.story) as unknown as Segment[], Math.min(a, b), Math.max(a, b));
  const tekst = uit.segmenten.map((s) => (s.kind === "text" ? s.text : s.kind === "pilcrow" ? "\n" : "")).join("").trim();
  if (!tekst) throw new Error(i18next.t("writer:autoText.errors.selectText"));
  return { ...uit, tekst };
}

/** Ruwe invoegbewerkingen voor segmenten vanaf `index`. */
export function invoegOps(segmenten: readonly Segment[], index: number) {
  const ops: unknown[] = [];
  let i = index;
  for (const s of segmenten) {
    if (s.kind === "text") {
      ops.push({ op: "insert", index: i, text: s.text, attrs: s.attributes });
      i += s.text.length;
    } else {
      ops.push({ op: "insertEmbed", index: i, kind: s.kind === "pilcrow" ? "pilcrow" : s.embedKind, payload: s.kind === "pilcrow" ? s.properties : s.payload, attrs: s.attributes });
      i += 1;
    }
  }
  return ops;
}

/**
 * Voegt segmenten in op de cursor, of vervangt `vervang` eenheden vóór de
 * cursor (de getypte naam bij F3). Eén ongedaan-maakstap; de cursor komt
 * achter de ingevoegde tekst.
 */
export async function voegSegmentenIn(ref: DocxEditorRef | null, segmenten: readonly Segment[], vervang = 0) {
  if (!ref) throw new Error(i18next.t("writer:general.documentNotReady"));
  if (!segmenten.length) return;
  await ref.flushPendingInput();
  const e = engine(ref);
  const sel = e.sessie.selection();
  if (!sel) throw new Error(i18next.t("writer:general.placeCursorFirst"));
  const story = sel.head.story;
  const a = rauw(e.sessie, sel.anchor);
  const b = rauw(e.sessie, sel.head);
  let van = Math.min(a, b);
  const tot = Math.max(a, b);
  const kop = a <= b ? sel.head : sel.anchor;
  van -= Math.min(vervang, kop.offset);
  begin(e);
  const ops: unknown[] = [];
  if (tot > van) ops.push({ op: "delete", index: van, len: tot - van });
  ops.push(...invoegOps(segmenten, van));
  ruw(e.sessie, story, ops);
  // De cursor: achter de laatste ingevoegde eenheid. Die ligt in de alinea van
  // de oorspronkelijke eindplek (de ingevoegde alineagrenzen sluiten eerdere alinea's af).
  const eind = van + lengteVan(segmenten);
  for (const p of e.sessie.paragraphSpans(story)) {
    const span = e.sessie.locateParagraph(story, p.paraId);
    if (eind >= span.start && eind <= span.end) {
      e.sessie.setSelection({ story, paraId: p.paraId, offset: eind - span.start });
      break;
    }
  }
  klaar(e, [story]);
  requestAnimationFrame(() => ref.focus());
}

/** Het woord vlak vóór de cursor (voor F3), of null. */
export async function woordVoorCursor(ref: DocxEditorRef | null): Promise<string | null> {
  if (!ref) return null;
  await ref.flushPendingInput();
  const s = ref.getEditorRef()?.getYrsSession();
  const sel = s?.selection();
  if (!s || !sel || sel.anchor.paraId !== sel.head.paraId || sel.anchor.offset !== sel.head.offset) return null;
  const alinea = s.paragraphs(sel.head.story).find((p) => p.paraId === sel.head.paraId);
  const voor = (alinea?.text ?? "").slice(0, sel.head.offset);
  const m = /[\p{L}\p{N}_-]+$/u.exec(voor);
  return m ? m[0] : null;
}
