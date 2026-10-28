/**
 * Lettertypekeuze per module: welke tekst de voorbeeldregel toont en wat er
 * moet gebeuren voordat een gekozen lettertype wordt toegepast.
 *
 * - Tekst: de layoutengine haalt het lettertype zelf op via de lettertypebron
 *   (provider.ts); niets voor te bereiden.
 * - Rekenblad: tekent met CSS-lettertypen; het lettertype (of de open
 *   vervanger onder de Office-naam) wordt eerst als FontFace geladen.
 * - Presentatie: de engine krijgt de lettertypebestanden via `registerFont`.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { definePptxPlugin, type PptxEditorApi, type PptxPluginSelection } from "@betteroffice/pptx-react";
import { isExtraFamilie, registreerCss } from "./catalogus";
import { opSysteem } from "./systeem";
import { VERVANGINGEN } from "./vervanging";

/** Het woord rond de cursor uit de tekst ervoor en erna. */
export function woordBijCursor(voor: string, na: string): string {
  return `${/[\p{L}\p{N}'’-]*$/u.exec(voor)?.[0] ?? ""}${/^[\p{L}\p{N}'’-]*/u.exec(na)?.[0] ?? ""}`;
}

export function tekstVoorbeeld(ref: DocxEditorRef | null): string {
  const info = ref?.getSelectionInfo();
  if (!info) return "";
  return info.selectedText.trim() || woordBijCursor(info.before, info.after);
}

/** De zichtbare inhoud van de actieve cel. */
export function rekenbladVoorbeeld(): string {
  const host = [...document.querySelectorAll<HTMLElement>(".office-rekenblad")].find(
    (el) => !el.closest("[inert], [hidden]"),
  );
  const invoer = host?.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-testid="xlsx-formula-input"]');
  const waarde = invoer?.value ?? "";
  if (waarde && !waarde.startsWith("=")) return waarde;
  const cel = host?.querySelector('[role="grid"] [role="gridcell"][aria-selected="true"]');
  return cel?.textContent?.split(",").slice(1).join(",").trim() ?? "";
}

let presentatieSelectie: PptxPluginSelection = null;

/** Volgt de tekstselectie van de presentatie-engine (die tekent op canvas, zonder DOM-selectie). */
export const tekstSelectiePlugin = definePptxPlugin<null>({
  id: "oos-tekstselectie",
  createState: () => null,
  onEvent(_context, event) {
    if (event.type === "selection-change") presentatieSelectie = event.selection;
  },
});

/** Tekst uit een verhaal (alinea's gescheiden door \n) tussen twee posities, of het woord bij de cursor. */
export function selectieUitVerhaal(tekst: string, anker: number, focus: number): string {
  const begin = Math.min(anker, focus);
  const eind = Math.max(anker, focus);
  if (eind > begin) return tekst.slice(begin, eind);
  return woordBijCursor(tekst.slice(0, begin), tekst.slice(begin));
}

/** De geselecteerde tekst in de presentatie, of het woord bij de cursor. */
export function presentatieVoorbeeld(api: PptxEditorApi | null): string {
  const doel = presentatieSelectie?.target;
  if (!api || doel?.kind !== "text") return "";
  try {
    const verhaal = api.handle.story(doel.storyId);
    const tekst = verhaal.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
    return selectieUitVerhaal(tekst, doel.anchor, doel.focus);
  } catch {
    return "";
  }
}

export async function voorbereidRekenblad(familie: string) {
  if (opSysteem(familie)) return;
  const regel = VERVANGINGEN[familie.toLowerCase()];
  if (isExtraFamilie(familie) || !regel) await registreerCss(familie);
  else await registreerCss(regel.vervanger, familie);
}

const geregistreerd = new WeakMap<object, Set<string>>();

export async function voorbereidPresentatie(api: PptxEditorApi | null, familie: string) {
  if (!api) return;
  const handle = api.handle;
  const klaar = geregistreerd.get(handle) ?? new Set<string>();
  geregistreerd.set(handle, klaar);
  const sleutel = familie.toLowerCase();
  if (klaar.has(sleutel)) return;
  const { presentatieFaces } = await import("./document");
  const regel = VERVANGINGEN[sleutel];
  let faces = await presentatieFaces(familie);
  if (!faces.length && regel)
    faces = (await presentatieFaces(regel.vervanger)).map((f) => ({ ...f, family: familie }));
  for (const face of faces) handle.registerFont(face);
  klaar.add(sleutel);
}
