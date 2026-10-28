/**
 * Paginering van een rekenblad zoals Excel en Calc dat doen: kolommen en rijen
 * gaan heel op een pagina, handmatige pagina-einden gaan voor, herhaalrijen en
 * -kolommen komen op elke volgende pagina, en "passend op N × M pagina's"
 * verkleint de schaal tot het past (niet groter dan 100%).
 */

export type Groep = [begin: number, eind: number]; // eind exclusief

/**
 * Verdeelt opeenvolgende maten (px) over pagina's. `ruimte(begin)` geeft de
 * beschikbare ruimte voor een pagina die bij `begin` start; `einden` zijn
 * indexen waar een nieuwe pagina moet beginnen.
 */
export function verdeel(
  maten: readonly number[],
  ruimte: (begin: number) => number,
  einden: ReadonlySet<number> = new Set(),
): Groep[] {
  const groepen: Groep[] = [];
  let begin = 0;
  while (begin < maten.length) {
    const beschikbaar = ruimte(begin);
    let som = 0;
    let eind = begin;
    while (eind < maten.length) {
      if (eind > begin && einden.has(eind)) break;
      if (eind > begin && som + maten[eind] > beschikbaar + 0.01) break;
      som += maten[eind];
      eind++;
    }
    groepen.push([begin, eind]);
    begin = eind;
  }
  return groepen;
}

export interface IndelingInvoer {
  kolomBreedtes: readonly number[];
  rijHoogtes: readonly number[];
  /** Herhaalkolommen/-rijen, relatief aan het bereik: tot en met deze index staan ze al op de pagina. */
  titelKolommen: { breedte: number; tot: number } | null;
  titelRijen: { hoogte: number; tot: number } | null;
  /** Rij- en kolomkoppen (px), of 0. */
  kopBreedte: number;
  kopHoogte: number;
  /** Bedrukbaar vlak bij 100% in px. */
  breedte: number;
  hoogte: number;
  /** Schaal als fractie (1 = 100%) of passend op N × M pagina's (0 = vrij). */
  schaal: number | { breed: number; hoog: number };
  rijEinden?: ReadonlySet<number>;
  kolomEinden?: ReadonlySet<number>;
}

export interface Indeling {
  schaal: number;
  kolommen: Groep[];
  rijen: Groep[];
}

function deel(invoer: IndelingInvoer, schaal: number): Indeling {
  const b = invoer.breedte / schaal - invoer.kopBreedte;
  const h = invoer.hoogte / schaal - invoer.kopHoogte;
  const tk = invoer.titelKolommen;
  const tr = invoer.titelRijen;
  return {
    schaal,
    kolommen: verdeel(
      invoer.kolomBreedtes,
      (begin) => (tk && begin > tk.tot ? b - tk.breedte : b),
      invoer.kolomEinden,
    ),
    rijen: verdeel(
      invoer.rijHoogtes,
      (begin) => (tr && begin > tr.tot ? h - tr.hoogte : h),
      invoer.rijEinden,
    ),
  };
}

export function indeling(invoer: IndelingInvoer): Indeling {
  if (typeof invoer.schaal === "number")
    return deel(invoer, Math.min(4, Math.max(0.1, invoer.schaal)));
  const { breed, hoog } = invoer.schaal;
  const totaalB =
    invoer.kolomBreedtes.reduce((a, b) => a + b, 0) + invoer.kopBreedte;
  const totaalH =
    invoer.rijHoogtes.reduce((a, b) => a + b, 0) + invoer.kopHoogte;
  let schaal = 1;
  if (breed > 0) schaal = Math.min(schaal, (invoer.breedte * breed) / totaalB);
  if (hoog > 0) schaal = Math.min(schaal, (invoer.hoogte * hoog) / totaalH);
  schaal = Math.max(0.1, schaal);
  // Hele kolommen en rijen per pagina: zo nodig iets verder verkleinen.
  for (let poging = 0; poging < 60; poging++) {
    const resultaat = deel(invoer, schaal);
    const past =
      (breed <= 0 || resultaat.kolommen.length <= breed) &&
      (hoog <= 0 || resultaat.rijen.length <= hoog);
    if (past || schaal <= 0.1) return resultaat;
    schaal = Math.max(0.1, schaal * 0.97);
  }
  return deel(invoer, schaal);
}

/** Paginavolgorde: eerst omlaag (standaard) of eerst over. */
export function paginaVolgorde(
  indeling: Indeling,
  volgorde: "omlaag" | "over",
): { kolom: Groep; rij: Groep }[] {
  const uit: { kolom: Groep; rij: Groep }[] = [];
  if (volgorde === "omlaag") {
    for (const kolom of indeling.kolommen)
      for (const rij of indeling.rijen) uit.push({ kolom, rij });
  } else {
    for (const rij of indeling.rijen)
      for (const kolom of indeling.kolommen) uit.push({ kolom, rij });
  }
  return uit;
}

/** Maten uit cumulatieve offsets (lengte n+1). */
export function maten(offsets: readonly number[], aantal: number) {
  const uit: number[] = [];
  for (let i = 0; i < aantal; i++)
    uit.push(Math.max(0, (offsets[i + 1] ?? offsets[i] ?? 0) - (offsets[i] ?? 0)));
  return uit;
}
