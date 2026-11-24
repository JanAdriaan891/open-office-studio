/**
 * Doelzoeken (Gegevens › Wat-als): zoek de waarde van een invoercel waarbij
 * een formulecel een doelwaarde krijgt. Het rekenen gebeurt in een kopie van
 * het werkboek (zelfde rekenkern), zodat het document pas verandert als de
 * gebruiker "Toepassen" kiest; dat is dan één ongedaan-maakstap.
 *
 * Oplossen: eerst de secantmethode vanaf de huidige waarde; zodra er een
 * tekenwisseling is gevonden, insluiten (Illinois-variant van regula falsi,
 * met bisectie als terugval). Zonder tekenwisseling zoekt het naar buiten met
 * verdubbelende stappen, binnen vaste grenzen.
 */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { WorkbookHandle } from "@betteroffice/xlsx";
import i18next from "../i18n/config";
import { Melding } from "./rekenblad-opdrachten";
import { serieleDatum, type Cel } from "./rekenblad-logica";
import { bewerk, doel, schrijfbaar } from "./rekenblad-gegevens";

export interface Oplossing {
  gevonden: boolean;
  x: number;
  /** De formulewaarde bij x. */
  y: number;
  evaluaties: number;
}

export interface ZoekOpties {
  /** Maximaal aantal evaluaties (standaard 200). */
  maxEvaluaties?: number;
  /** Toegestane afwijking van het doel (standaard 1e-7 × max(1, |doel|)). */
  tolerantie?: number;
  /** Grootste |x| die geprobeerd wordt (standaard 1e15). */
  grens?: number;
}

/** Zoekt x met f(x) = doelwaarde. f geeft null als de formule geen getal oplevert. */
export async function zoekDoel(
  f: (x: number) => Promise<number | null>,
  start: number,
  doelwaarde: number,
  opties: ZoekOpties = {},
): Promise<Oplossing> {
  const max = opties.maxEvaluaties ?? 200;
  const tol = opties.tolerantie ?? 1e-7 * Math.max(1, Math.abs(doelwaarde));
  const grens = opties.grens ?? 1e15;
  let evaluaties = 0;
  let beste: { x: number; y: number; r: number } | null = null;
  const g = async (x: number): Promise<number | null> => {
    if (!Number.isFinite(x) || Math.abs(x) > grens) return null;
    evaluaties++;
    const y = await f(x);
    if (y === null || !Number.isFinite(y)) return null;
    const r = y - doelwaarde;
    if (!beste || Math.abs(r) < Math.abs(beste.r)) beste = { x, y, r };
    return r;
  };
  const klaar = () => beste !== null && Math.abs(beste.r) <= tol;
  const uit = (): Oplossing =>
    beste ? { gevonden: Math.abs(beste.r) <= tol, x: beste.x, y: beste.y, evaluaties } : { gevonden: false, x: start, y: NaN, evaluaties };

  const x0 = Number.isFinite(start) ? start : 0;
  const r0 = await g(x0);
  if (r0 !== null && klaar()) return uit();
  let h = Math.max(Math.abs(x0) * 1e-3, 1e-3);
  let bracket: [number, number, number, number] | null = null; // a, ra, b, rb

  // 1. Secant vanaf de startwaarde.
  if (r0 !== null) {
    let a = x0,
      ra = r0,
      b = x0 + h;
    let rb = await g(b);
    for (let i = 0; i < 40 && rb !== null && evaluaties < max; i++) {
      if (klaar()) return uit();
      if (Math.sign(ra) !== Math.sign(rb)) {
        bracket = [a, ra, b, rb];
        break;
      }
      if (rb === ra) break;
      let c = b - (rb * (b - a)) / (rb - ra);
      // Niet te ver springen in één stap.
      const sprong = Math.max(Math.abs(b - a) * 1e3, Math.abs(b) * 10, 10);
      if (Math.abs(c - b) > sprong) c = b + Math.sign(c - b) * sprong;
      const rc = await g(c);
      if (rc === null) break;
      a = b;
      ra = rb;
      b = c;
      rb = rc;
    }
  }

  // 2. Naar buiten zoeken naar een tekenwisseling.
  if (!bracket && !klaar()) {
    let vorigeL: [number, number] | null = r0 !== null ? [x0, r0] : null;
    let vorigeR: [number, number] | null = vorigeL;
    for (let k = 0; k < 120 && evaluaties < max && !bracket; k++) {
      for (const kant of [1, -1]) {
        const x = x0 + kant * h;
        const r = await g(x);
        if (klaar()) return uit();
        if (r === null) continue;
        const vorige = kant === 1 ? vorigeR : vorigeL;
        if (vorige && Math.sign(vorige[1]) !== Math.sign(r)) {
          bracket = kant === 1 ? [vorige[0], vorige[1], x, r] : [x, r, vorige[0], vorige[1]];
          break;
        }
        if (kant === 1) vorigeR = [x, r];
        else vorigeL = [x, r];
      }
      h *= 2;
      if (x0 + h > grens && x0 - h < -grens) break;
    }
  }

  // 3. Insluiten.
  if (bracket) {
    let [a, ra, b, rb] = bracket;
    let kant = 0;
    while (evaluaties < max && !klaar()) {
      let c = b - (rb * (b - a)) / (rb - ra);
      if (!Number.isFinite(c) || c <= Math.min(a, b) || c >= Math.max(a, b)) c = (a + b) / 2;
      const rc = await g(c);
      if (rc === null) {
        // Geen getal halverwege: halveren.
        const m = (a + b) / 2;
        const rm = await g(m);
        if (rm === null) break;
        if (Math.sign(rm) === Math.sign(ra)) (a = m), (ra = rm);
        else (b = m), (rb = rm);
        continue;
      }
      if (Math.sign(rc) === Math.sign(rb)) {
        b = c;
        rb = rc;
        if (kant === -1) ra /= 2;
        kant = -1;
      } else {
        a = c;
        ra = rc;
        if (kant === 1) rb /= 2;
        kant = 1;
      }
      if (Math.abs(b - a) <= 1e-15 * Math.max(1, Math.abs(a))) break;
    }
  }
  return uit();
}

// ------------------------------------------------------------ werkboek

const melding = (sleutel: string, opties?: Record<string, unknown>) =>
  i18next.t(`spreadsheet:dataTools.goalSeek.messages.${sleutel}`, opties) as string;

export interface DoelzoekVraag {
  blad: number;
  sheetId: string;
  formulecel: Cel;
  variabelecel: Cel;
  doelwaarde: number;
}

/** Een kopie van het werkboek om in te rekenen; dispose() na gebruik. */
async function kopie(api: XlsxEditorApi): Promise<WorkbookHandle> {
  const { openWorkbook } = await import("@betteroffice/xlsx");
  return openWorkbook(api.handle.save());
}

const nu = () => {
  const s = serieleDatum(new Date());
  return s.datum + s.tijd;
};

/** Controleert de cellen en lost op in een kopie; het document blijft ongewijzigd. */
export async function doelzoeken(api: XlsxEditorApi, v: DoelzoekVraag): Promise<Oplossing> {
  const formule = api.handle.cell(v.blad, v.formulecel.row, v.formulecel.col);
  if (!formule.isFormula) throw new Melding(melding("needFormula"));
  const variabel = api.handle.cell(v.blad, v.variabelecel.row, v.variabelecel.col);
  if (variabel.isFormula) throw new Melding(melding("needValue"));
  const lezing = await api.readCells({ ranges: [doel(v.sheetId, { top: v.variabelecel.row, bottom: v.variabelecel.row, left: v.variabelecel.col, right: v.variabelecel.col })] });
  const w = lezing.ok ? lezing.ranges[0].cells[0][0].value : null;
  if (w && w.kind !== "number" && w.kind !== "empty") throw new Melding(melding("needValue"));
  const start = w?.kind === "number" ? w.value : 0;

  const klad = await kopie(api);
  try {
    const sheetId = klad.sheetInfo().sheetIds[v.blad];
    const invoer = doel(sheetId, { top: v.variabelecel.row, bottom: v.variabelecel.row, left: v.variabelecel.col, right: v.variabelecel.col });
    const uitvoer = doel(sheetId, { top: v.formulecel.row, bottom: v.formulecel.row, left: v.formulecel.col, right: v.formulecel.col });
    const klok = nu();
    const f = async (x: number) => {
      const r = klad.applyEdits({
        expectVersion: klad.version(),
        history: "none",
        calculation: { nowSerial: klok },
        steps: [{ op: "setCellInputs", target: invoer, inputs: [[String(x)]] }],
      });
      if (!r.ok) return null;
      const l = klad.readCells({ ranges: [uitvoer] });
      const c = l.ok ? l.ranges[0].cells[0][0].value : null;
      return c?.kind === "number" ? c.value : null;
    };
    return await zoekDoel(f, start, v.doelwaarde);
  } finally {
    klad.dispose();
  }
}

/** Zet de gevonden waarde in de variabele cel (één ongedaan-maakstap). */
export async function pasDoelToe(api: XlsxEditorApi, v: Pick<DoelzoekVraag, "sheetId" | "variabelecel">, x: number) {
  schrijfbaar(api);
  const c = v.variabelecel;
  await bewerk(api, [{ op: "setCellInputs", target: doel(v.sheetId, { top: c.row, bottom: c.row, left: c.col, right: c.col }), inputs: [[String(x)]] }]);
}
