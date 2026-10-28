/**
 * Adaptief inklappen van lintgroepen, los van React en de DOM.
 *
 * Niveau 0: volledig. Niveau 1: compact, de tekstlabels naast kleine knoppen
 * vallen weg. Niveau 2: de groep wordt één knop met een uitklappaneel.
 * Groepen klappen van rechts naar links in, zoals in Word en LibreOffice;
 * een hogere `prioriteit` houdt een groep langer volledig.
 */
export type Niveau = 0 | 1 | 2;

export interface GroepMaten {
  /** Breedte in pixels per niveau (inclusief marges). */
  breedte: readonly [number, number, number];
  /** Hoger = blijft langer volledig. Standaard 0. */
  prioriteit?: number;
}

export interface Indeling {
  niveaus: Niveau[];
  /** Totale breedte van de groepen bij deze niveaus, plus `vast`. */
  breedte: number;
  /** Waar als het lint zelfs volledig ingeklapt niet past. */
  overloop: boolean;
}

/** Volgorde waarin groepen inklappen: lage prioriteit en rechts eerst. */
export function inklapvolgorde(groepen: readonly GroepMaten[]): number[] {
  return groepen
    .map((groep, index) => ({ index, prioriteit: groep.prioriteit ?? 0 }))
    .sort((a, b) => a.prioriteit - b.prioriteit || b.index - a.index)
    .map((groep) => groep.index);
}

/**
 * Kiest per groep het niveau zodat alles binnen `beschikbaar` past.
 * Eerst worden alle groepen compact (rechts eerst), pas daarna klappen ze
 * één voor één in. `minimum` dwingt een niveau af (instelling ‘compact lint’).
 */
export function kiesNiveaus(
  groepen: readonly GroepMaten[],
  beschikbaar: number,
  { vast = 0, minimum = 0 }: { vast?: number; minimum?: Niveau } = {},
): Indeling {
  const niveaus = groepen.map(() => minimum) as Niveau[];
  const totaal = () =>
    vast +
    groepen.reduce((som, groep, i) => som + groep.breedte[niveaus[i]], 0);
  let breedte = totaal();
  const volgorde = inklapvolgorde(groepen);
  for (const doel of [1, 2] as const) {
    for (const index of volgorde) {
      if (breedte <= beschikbaar) break;
      if (niveaus[index] >= doel) continue;
      const winst =
        groepen[index].breedte[niveaus[index]] - groepen[index].breedte[doel];
      // Een niveau dat niets oplevert slaan we over: dat maakt alleen onrustig.
      if (winst <= 0) continue;
      niveaus[index] = doel;
      breedte -= winst;
    }
  }
  return { niveaus, breedte, overloop: breedte > beschikbaar };
}

/** Of de scrollknoppen links en rechts zichtbaar moeten zijn. */
export function scrollKnoppen(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): { links: boolean; rechts: boolean } {
  // Halve pixels door zoom of schaal tellen niet als overloop.
  const marge = 1;
  return {
    links: scrollLeft > marge,
    rechts: scrollLeft + clientWidth < scrollWidth - marge,
  };
}

/** Horizontale verschuiving voor een muiswiel boven een overlopend lint. */
export function wielNaarHorizontaal(wiel: {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}): number {
  // Een touchpad schuift zelf al horizontaal; het verticale deel telt mee.
  const delta =
    Math.abs(wiel.deltaX) > Math.abs(wiel.deltaY) ? wiel.deltaX : wiel.deltaY;
  // deltaMode 1 = regels, 2 = pagina's.
  return wiel.deltaMode === 1
    ? delta * 32
    : wiel.deltaMode === 2
      ? delta * 400
      : delta;
}
