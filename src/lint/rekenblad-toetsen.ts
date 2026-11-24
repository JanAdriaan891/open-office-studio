/**
 * Toetsen zoals Excel in Open Rekenblad Studio (#19, forumklacht over
 * LibreOffice Calc, waar Ctrl+Enter en Alt+Enter precies omgekeerd zijn en
 * Backspace een dialoog opent):
 *
 * - Ctrl+Enter in de celinvoer of formulebalk: de hele selectie krijgt de
 *   invoer (relatieve verwijzingen schuiven per cel mee), één ongedaan-maakstap.
 * - Alt+Enter in de celinvoer: nieuwe regel in de cel. De celinvoer van de
 *   engine is één regel; de tekst gaat met een regeleinde naar de uitgevouwen
 *   formulebalk, waar verder getypt wordt. Vastleggen zet tekstterugloop aan.
 * - Backspace in het raster: de actieve cel leegmaken en bewerken (Esc zet
 *   de oude inhoud terug); Delete wist de selectie (engine), zonder dialoog.
 * - Ctrl+pijl: naar de rand van het gegevensblok; Ctrl+Shift+pijl breidt uit;
 *   Ctrl+End: de laatst gebruikte cel. Ctrl+Spatie/Shift+Spatie: kolom/rij.
 *
 * Beschreven in het register (`sneltoetsenlijst.ts`) en daarmee in F1.
 */
import { useEffect, useRef } from "react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { XlsxEditStep } from "@betteroffice/xlsx";
import { leesNederlands } from "../rekenbladinvoer";
import { alleenLezen, Melding, rekenbladHost } from "./rekenblad-opdrachten";
import { MAX_KOLOMMEN, MAX_RIJEN, verschuifFormule, type Bereik, type Cel } from "./rekenblad-logica";
import { bewerk, doel, lees } from "./rekenblad-gegevens";
import { NIEUWE_REGEL, type NieuweRegel } from "./rekenblad-formulebalk";
import type { RekenbladLaag } from "./rekenblad-laag";

const CELINVOER = '[data-testid="xlsx-cell-editor"]';
const FORMULEINVOER = '[data-testid="xlsx-formula-input"]';

type Sel = { blad: number; sheetId: string; bereik: Bereik; anker: Cel; focus: Cel };

function selectie(api: XlsxEditorApi, laag: RekenbladLaag | null | undefined): Sel | null {
  const s = laag?.selectie();
  if (!s?.cells) return null;
  const { anchor, focus } = s.cells;
  return {
    blad: s.sheetIndex,
    sheetId: api.handle.sheetInfo().sheetIds[s.sheetIndex] ?? s.sheetId,
    bereik: {
      top: Math.min(anchor.row, focus.row),
      left: Math.min(anchor.col, focus.col),
      bottom: Math.max(anchor.row, focus.row),
      right: Math.max(anchor.col, focus.col),
    },
    anker: anchor,
    focus,
  };
}

/** Invoer voor elke cel van het bereik; formules schuiven mee vanaf de actieve cel. */
export function invoerVoorBereik(tekst: string, b: Bereik, actief: Cel): string[][] {
  const formule = tekst.startsWith("=") && tekst.length > 1;
  const nl = formule ? null : leesNederlands(tekst);
  const waarde = nl ? nl.invoer : tekst;
  return Array.from({ length: b.bottom - b.top + 1 }, (_, r) =>
    Array.from({ length: b.right - b.left + 1 }, (_, c) =>
      formule ? `=${verschuifFormule(tekst.slice(1), b.top + r - actief.row, b.left + c - actief.col)}` : waarde,
    ),
  );
}

/** Ctrl+Enter: de selectie vullen met de invoer. */
export async function vulSelectie(api: XlsxEditorApi, sheetId: string, b: Bereik, actief: Cel, tekst: string) {
  if (alleenLezen(api)) throw new Melding("read-only");
  if ((b.bottom - b.top + 1) * (b.right - b.left + 1) > 1_000_000) b = { ...b, bottom: b.top, right: b.left };
  const target = doel(sheetId, b);
  const stappen: XlsxEditStep[] = [{ op: "setCellInputs", target, inputs: invoerVoorBereik(tekst, b, actief) }];
  const nl = tekst.startsWith("=") ? null : leesNederlands(tekst);
  if (nl?.notatie) stappen.push({ op: "setNumberFormat", target, format: { type: "custom", pattern: nl.notatie } });
  await bewerk(api, stappen);
}

const leeg = (c: { value: { kind: string; value?: unknown } }) => c.value.kind === "empty" || (c.value.kind === "text" && c.value.value === "");

/** Het gebruikte bereik van een blad (null bij een leeg blad). */
export function gebruiktBereik(api: XlsxEditorApi, blad: number): Bereik | null {
  try {
    const r = api.handle.exportStructured({ scope: [{ sheet: blad }], maxCells: 1, includeDefinedNames: false });
    const ref = r.ok ? r.content.sheets[0]?.usedRange : null;
    if (!ref) return null;
    const delen = ref.replace(/\$/g, "").split(":");
    const cel = (s: string) => {
      const m = /^([A-Z]+)(\d+)$/i.exec(s);
      if (!m) return null;
      let col = 0;
      for (const ch of m[1].toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
      return { row: Number(m[2]) - 1, col: col - 1 };
    };
    const a = cel(delen[0]);
    const b = cel(delen[1] ?? delen[0]);
    return a && b ? { top: a.row, left: a.col, bottom: b.row, right: b.col } : null;
  } catch {
    return null;
  }
}

/**
 * Doel van Ctrl+pijl zoals Excel: vanaf een gevulde cel met een gevulde buur
 * naar de laatste gevulde cel van het blok; anders naar de eerstvolgende
 * gevulde cel, of de rand van het blad.
 */
export function randVanBlok(gevuld: readonly boolean[], start: number): number {
  const n = gevuld.length;
  const stap = (i: number) => i + 1;
  if (start >= n - 1) return n - 1;
  if (gevuld[start] && gevuld[stap(start)]) {
    let i = start;
    while (i + 1 < n && gevuld[i + 1]) i++;
    return i;
  }
  let i = start + 1;
  while (i < n && !gevuld[i]) i++;
  return i < n ? i : n - 1;
}

export type Richting = "omhoog" | "omlaag" | "links" | "rechts";

/** De cel waar Ctrl+pijl naartoe gaat. */
export async function dataRand(api: XlsxEditorApi, blad: number, sheetId: string, cel: Cel, richting: Richting): Promise<Cel> {
  const grens = gebruiktBereik(api, blad);
  const verticaal = richting === "omhoog" || richting === "omlaag";
  const vooruit = richting === "omlaag" || richting === "rechts";
  const max = verticaal ? MAX_RIJEN - 1 : MAX_KOLOMMEN - 1;
  const pos = verticaal ? cel.row : cel.col;
  const rand = vooruit ? max : 0;
  const zet = (p: number): Cel => (verticaal ? { row: p, col: cel.col } : { row: cel.row, col: p });
  if (!grens) return zet(rand);
  // Alleen het stuk binnen het gebruikte bereik lezen; daarbuiten is alles leeg.
  const van = verticaal ? grens.top : grens.left;
  const tot = verticaal ? grens.bottom : grens.right;
  const buitenLijn = verticaal ? cel.col < grens.left || cel.col > grens.right : cel.row < grens.top || cel.row > grens.bottom;
  if (buitenLijn) return zet(rand);
  const lijn: Bereik = verticaal ? { top: van, bottom: tot, left: cel.col, right: cel.col } : { top: cel.row, bottom: cel.row, left: van, right: tot };
  const cellen = (await lees(api, sheetId, lijn)).flat();
  const gevuldOp = (p: number) => p >= van && p <= tot && !leeg(cellen[p - van]);
  // Als lijst in de looprichting, vanaf de huidige cel tot de rand.
  const lengte = vooruit ? max - pos + 1 : pos + 1;
  const index = (i: number) => (vooruit ? pos + i : pos - i);
  const laatsteRelevant = vooruit ? Math.max(0, tot - pos + 1) : Math.max(0, pos - van + 1);
  const lijst: boolean[] = [];
  for (let i = 0; i < Math.min(lengte, laatsteRelevant + 2); i++) lijst.push(gevuldOp(index(i)));
  const doelIndex = randVanBlok(lijst, 0);
  // Voorbij de gegevens: de rand van het blad.
  const voorbij = doelIndex === lijst.length - 1 && !lijst[doelIndex];
  return zet(voorbij ? rand : index(doelIndex));
}

/** Toetsen die met tekst in de celinvoer of formulebalk werken (Ctrl+Enter, Alt+Enter). */
export function useExcelInvoertoetsen(
  api: XlsxEditorApi | null,
  laag: RekenbladLaag | null | undefined,
  fout: (tekst: string) => void,
) {
  const recent = useRef({ api, laag, fout });
  recent.current = { api, laag, fout };
  useEffect(() => {
    let volgnummer = 0;
    const toets = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.defaultPrevented) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl === e.altKey) return;
      const veld = e.target;
      if (!(veld instanceof HTMLInputElement) || !veld.matches(`${CELINVOER}, ${FORMULEINVOER}`)) return;
      const { api: a, laag: l, fout: f } = recent.current;
      if (!a || !rekenbladHost()?.contains(veld)) return;
      const s = selectie(a, l);
      if (!s) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const tekst = veld.value;
      const cursor = veld.selectionStart ?? tekst.length;
      const eind = veld.selectionEnd ?? cursor;
      // De bewerking van de engine afbreken; wij schrijven zelf.
      veld.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      if (e.altKey) {
        const detail: NieuweRegel = { id: ++volgnummer, tekst: `${tekst.slice(0, cursor)}\n${tekst.slice(eind)}`, cursor: cursor + 1 };
        // Na het afbreken, zodat de uitgevouwen formulebalk de focus houdt.
        requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(NIEUWE_REGEL, { detail })));
        return;
      }
      void vulSelectie(a, s.sheetId, s.bereik, s.anker, tekst)
        .then(() => {
          a.selectCells(s.blad, { anchor: s.anker, focus: s.focus });
          a.focus();
        })
        .catch((fout2) => f(fout2 instanceof Error ? fout2.message : String(fout2)));
    };
    window.addEventListener("keydown", toets, true);
    return () => window.removeEventListener("keydown", toets, true);
  }, []);
}

/** Backspace in het raster: de actieve cel leeg bewerken; Esc zet de inhoud terug. */
export function leegBewerken() {
  const host = rekenbladHost();
  const raster = document.activeElement;
  if (!host || !(raster instanceof HTMLElement) || !host.contains(raster)) return;
  // F2 begint de bewerking met de huidige inhoud; daarna maken we het veld leeg.
  raster.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", code: "F2", bubbles: true, cancelable: true }));
  requestAnimationFrame(() => {
    const veld = host.querySelector<HTMLInputElement>(CELINVOER);
    if (!veld) return;
    const proto = HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(veld, "");
    veld.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Selecteert hele kolommen (Ctrl+Spatie) of rijen (Shift+Spatie) van de selectie. */
export function selecteerHeel(api: XlsxEditorApi, laag: RekenbladLaag | null | undefined, soort: "kolom" | "rij") {
  const s = selectie(api, laag);
  if (!s) return;
  const b = s.bereik;
  if (soort === "kolom")
    api.selectCells(s.blad, { anchor: { row: 0, col: b.left }, focus: { row: MAX_RIJEN - 1, col: b.right } });
  else api.selectCells(s.blad, { anchor: { row: b.top, col: 0 }, focus: { row: b.bottom, col: MAX_KOLOMMEN - 1 } });
}

/** Ctrl+pijl en Ctrl+Shift+pijl. */
export async function springNaarRand(api: XlsxEditorApi, laag: RekenbladLaag | null | undefined, richting: Richting, uitbreiden: boolean) {
  const s = selectie(api, laag);
  if (!s) return;
  const doelcel = await dataRand(api, s.blad, s.sheetId, s.focus, richting);
  api.selectCells(s.blad, uitbreiden ? { anchor: s.anker, focus: doelcel } : { anchor: doelcel, focus: doelcel });
}

/** Ctrl+End: de laatst gebruikte cel. */
export function naarLaatsteCel(api: XlsxEditorApi, laag: RekenbladLaag | null | undefined, uitbreiden: boolean) {
  const s = selectie(api, laag);
  if (!s) return;
  const g = gebruiktBereik(api, s.blad);
  const cel = g ? { row: g.bottom, col: g.right } : { row: 0, col: 0 };
  api.selectCells(s.blad, uitbreiden ? { anchor: s.anker, focus: cel } : { anchor: cel, focus: cel });
}
