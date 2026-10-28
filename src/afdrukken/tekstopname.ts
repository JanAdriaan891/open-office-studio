/**
 * Neemt de tekst op die de tekenroutines van de engines op een canvas zetten.
 *
 * De engines tekenen tekst met `fillText`. Tijdens een opname onthouden we per
 * canvas welke tekst waar staat (in canvaspixels, na de transformatie), zodat
 * de PDF een onzichtbare, selecteerbare tekstlaag krijgt die precies op het
 * beeld valt. Buiten een opname is er geen enkele vertraging.
 */

export interface OpgenomenTekst {
  tekst: string;
  /** Begin van de basislijn in canvaspixels. */
  x: number;
  y: number;
  /** Lettergrootte in canvaspixels. */
  grootte: number;
  /** Breedte in canvaspixels. */
  breedte: number;
}

type Doel = HTMLCanvasElement | OffscreenCanvas;

let actief = 0;
let opnames = new WeakMap<Doel, OpgenomenTekst[]>();
let origineel: CanvasRenderingContext2D["fillText"] | null = null;

/** Lettergrootte in pixels uit een CSS-fontopgave zoals "bold 14.5px Calibri". */
export function grootteUitFont(font: string) {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  if (m) return Number(m[1]);
  const pt = /(\d+(?:\.\d+)?)pt/.exec(font);
  return pt ? (Number(pt[1]) * 96) / 72 : 10;
}

function neemOp(
  this: CanvasRenderingContext2D,
  tekst: string,
  x: number,
  y: number,
  maxBreedte?: number,
) {
  try {
    const schoon = String(tekst);
    if (schoon.length) {
      const m = this.getTransform();
      const schaalX = Math.hypot(m.a, m.b);
      const schaalY = Math.hypot(m.c, m.d);
      // Alleen ongedraaide tekst; gedraaide tekst laten we in het beeld.
      if (Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6) {
        let breedte = this.measureText(schoon).width;
        if (maxBreedte !== undefined && breedte > maxBreedte)
          breedte = maxBreedte;
        const uitlijning = this.textAlign;
        const rtl = this.direction === "rtl";
        let begin = x;
        if (uitlijning === "center") begin = x - breedte / 2;
        else if (
          uitlijning === "right" ||
          (uitlijning === "end" && !rtl) ||
          (uitlijning === "start" && rtl)
        )
          begin = x - breedte;
        let basis = y;
        const grootte = grootteUitFont(this.font);
        if (this.textBaseline === "top" || this.textBaseline === "hanging")
          basis = y + grootte * 0.8;
        else if (this.textBaseline === "middle") basis = y + grootte * 0.3;
        else if (this.textBaseline === "bottom" || this.textBaseline === "ideographic")
          basis = y - grootte * 0.2;
        const p = m.transformPoint(new DOMPoint(begin, basis));
        const lijst = opnames.get(this.canvas);
        const stuk: OpgenomenTekst = {
          tekst: schoon,
          x: m.a < 0 ? p.x - breedte * schaalX : p.x,
          y: p.y,
          grootte: grootte * schaalY,
          breedte: breedte * schaalX,
        };
        if (lijst) lijst.push(stuk);
        else opnames.set(this.canvas, [stuk]);
      }
    }
  } catch {
    // Opnemen mag het tekenen nooit hinderen.
  }
  return origineel!.call(this, tekst, x, y, maxBreedte as number);
}

function start() {
  if (actief++ > 0) return;
  opnames = new WeakMap();
  origineel = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = neemOp as never;
}

function stop() {
  if (--actief > 0) return;
  if (origineel) CanvasRenderingContext2D.prototype.fillText = origineel;
  origineel = null;
}

/**
 * Voert `werk` uit terwijl tekst wordt opgenomen. `tekstVan(canvas)` geeft
 * daarna de opgenomen tekst van een canvas (ook nadat de opname is gestopt,
 * zolang het resultaat bewaard wordt).
 */
export async function metTekstopname<T>(
  werk: () => Promise<T>,
): Promise<{ resultaat: T; tekstVan: (canvas: Doel) => OpgenomenTekst[] }> {
  if (typeof CanvasRenderingContext2D === "undefined")
    return { resultaat: await werk(), tekstVan: () => [] };
  start();
  const huidige = opnames;
  try {
    const resultaat = await werk();
    return { resultaat, tekstVan: (canvas) => huidige.get(canvas) ?? [] };
  } finally {
    stop();
  }
}

/**
 * Voegt losse tekens op dezelfde basislijn samen tot woorden. Sommige
 * lettertypen tekent de engine teken voor teken (bijvoorbeeld Source Serif 4);
 * zonder samenvoegen zou de tekstlaag elk teken los zetten en vindt zoeken in
 * de PDF het woord niet. Een zichtbaar gat wordt een spatie.
 */
export function voegTekensSamen(lijst: readonly OpgenomenTekst[]): OpgenomenTekst[] {
  const uit: OpgenomenTekst[] = [];
  for (const t of lijst) {
    const vorige = uit[uit.length - 1];
    if (vorige && ([...vorige.tekst].length <= 2 || [...t.tekst].length <= 2) && !/\s$/.test(vorige.tekst)) {
      const eind = vorige.x + vorige.breedte;
      const gat = t.x - eind;
      const zelfdeRegel =
        Math.abs(t.y - vorige.y) < vorige.grootte * 0.08 &&
        Math.abs(t.grootte - vorige.grootte) < vorige.grootte * 0.05;
      if (zelfdeRegel && gat > -vorige.grootte * 0.3 && gat < vorige.grootte * 0.6) {
        uit[uit.length - 1] = {
          ...vorige,
          tekst: vorige.tekst + (gat > vorige.grootte * 0.18 && !/^\s/.test(t.tekst) ? " " : "") + t.tekst,
          breedte: Math.max(eind, t.x + t.breedte) - vorige.x,
        };
        continue;
      }
    }
    uit.push({ ...t });
  }
  return uit;
}

/** Zet opgenomen tekst om naar punten: `factor` punten per canvaspixel, plus een verschuiving in punten. */
export function naarPunten(
  lijst: readonly OpgenomenTekst[],
  factor: number,
  dx = 0,
  dy = 0,
) {
  return voegTekensSamen(lijst).map((t) => ({
    tekst: t.tekst,
    x: dx + t.x * factor,
    y: dy + t.y * factor,
    grootte: t.grootte * factor,
    breedte: t.breedte * factor,
  }));
}
