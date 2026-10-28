/**
 * Lettergrootte vergroten en verkleinen zoals Word (Ctrl+Shift+> / <):
 * de vaste reeks, daarbuiten in stappen van 10 pt tot 1638 pt en
 * onder 8 pt per punt tot 1 pt. Ctrl+] / [ gaan altijd één punt.
 */
export const WORD_GROOTTES = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72,
] as const;

export const KLEINSTE = 1;
export const GROOTSTE = 1638;

const begrens = (punten: number) =>
  Math.min(GROOTSTE, Math.max(KLEINSTE, punten));

/** Volgende grootte in de Word-reeks; `richting` 1 = groter, -1 = kleiner. */
export function volgendeGrootte(huidig: number, richting: 1 | -1): number {
  if (!Number.isFinite(huidig) || huidig <= 0) return 11;
  const eerste = WORD_GROOTTES[0];
  const laatste = WORD_GROOTTES[WORD_GROOTTES.length - 1];
  if (richting === 1) {
    if (huidig < eerste) return begrens(Math.floor(huidig) + 1);
    const volgende = WORD_GROOTTES.find((g) => g > huidig);
    if (volgende !== undefined) return volgende;
    // Boven 72: naar het volgende tiental.
    return begrens(Math.floor(huidig / 10) * 10 + 10);
  }
  if (huidig > laatste) {
    const lager = Math.ceil(huidig / 10) * 10 - 10;
    return begrens(Math.max(laatste, lager));
  }
  const vorige = [...WORD_GROOTTES].reverse().find((g) => g < huidig);
  if (vorige !== undefined) return vorige;
  return begrens(Math.ceil(huidig) - 1);
}

/** Eén punt groter of kleiner (Ctrl+] / Ctrl+[), halve punten afgerond. */
export function puntStap(huidig: number, richting: 1 | -1): number {
  if (!Number.isFinite(huidig) || huidig <= 0) return 11;
  const heel = richting === 1 ? Math.floor(huidig) : Math.ceil(huidig);
  return begrens(heel + richting);
}
