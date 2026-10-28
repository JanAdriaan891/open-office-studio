/** Waar een nieuwe grafiek op een werkblad komt: naast of onder de gegevens, nooit eroverheen. */
import type { Bereik } from "./model.ts";

/** Wat de plaatsing van een blad moet weten (0-gebaseerd). */
export interface Bladmodel {
  /** Gevulde cellen, samengevoegde gebieden en bestaande grafieken. */
  bezet: Bereik[];
  /** Vastgezette rijen en kolommen bovenaan en links. */
  vastRijen: number;
  vastKolommen: number;
}

export interface Grafiekmaat {
  kolommen: number;
  rijen: number;
}
export const GRAFIEKMAAT: Grafiekmaat = { kolommen: 8, rijen: 16 };
/** Zou de grafiek in of voorbij deze kolom (0-gebaseerd, AE) beginnen, dan valt hij doorgaans buiten beeld: dan eronder. */
export const MAX_KOLOM_RECHTS = 30;

/** Het gebruikte bereik van het blad: de omhullende van alles wat bezet is. */
export function gebruiktBereik(blad: Pick<Bladmodel, "bezet">): Bereik | null {
  if (!blad.bezet.length) return null;
  return {
    top: Math.min(...blad.bezet.map((b) => b.top)),
    left: Math.min(...blad.bezet.map((b) => b.left)),
    bottom: Math.max(...blad.bezet.map((b) => b.bottom)),
    right: Math.max(...blad.bezet.map((b) => b.right)),
  };
}

const overlapt = (a: Bereik, b: Bereik) =>
  a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;

/**
 * Linkerbovenhoek (0-gebaseerd) voor een nieuwe grafiek bij `selectie`:
 * rechts naast het gebruikte bereik (één lege kolom marge), uitgelijnd met de
 * bovenkant van de selectie; begint dat voorbij `MAX_KOLOM_RECHTS` kolommen, dan onder
 * het gebruikte bereik (één lege rij marge), uitgelijnd met de linkerkant van
 * de selectie. Nooit in vastgezette rijen of kolommen en nooit over bezette
 * cellen: bij overlap schuift de grafiek omlaag tot hij vrij staat.
 */
export function plekVoorGrafiek(
  blad: Bladmodel,
  selectie: Bereik | null,
  maat: Grafiekmaat = GRAFIEKMAAT,
): { row: number; col: number } {
  const gebruikt = gebruiktBereik(blad);
  const sel = selectie ?? gebruikt;
  let row: number, col: number;
  if (!gebruikt) {
    row = sel?.top ?? 0;
    col = sel ? sel.right + 2 : 0;
  } else if (gebruikt.right + 2 < MAX_KOLOM_RECHTS) {
    col = gebruikt.right + 2;
    row = sel?.top ?? gebruikt.top;
  } else {
    row = gebruikt.bottom + 2;
    col = sel?.left ?? gebruikt.left;
  }
  row = Math.max(row, blad.vastRijen);
  col = Math.max(col, blad.vastKolommen);
  // Vangnet: zou de grafiek toch iets bedekken, dan eronder.
  for (let poging = 0; poging < 1000; poging++) {
    const vlak = { top: row, left: col, bottom: row + maat.rijen - 1, right: col + maat.kolommen - 1 };
    const raak = blad.bezet.filter((b) => overlapt(vlak, b));
    if (!raak.length) break;
    row = Math.max(...raak.map((b) => b.bottom)) + 2;
  }
  return { row, col };
}
