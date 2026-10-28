/** Welke alinea's een lijstopdracht raakt, los van de engine te testen. */

export interface LijstVerwijzing {
  numId: number;
  ilvl: number;
}

type Alinea = { paraId: string; properties: Record<string, unknown> };

/** De lijst waar een alinea bij hoort (`numPr` met een numId groter dan 0). */
export function lijstVan(p: Record<string, unknown> | undefined): LijstVerwijzing | null {
  const numPr = p?.numPr as { numId?: number; ilvl?: number } | null | undefined;
  if (!numPr || !numPr.numId) return null;
  return { numId: numPr.numId, ilvl: numPr.ilvl ?? 0 };
}

/**
 * De geselecteerde alinea's plus de aaneengesloten alinea's van dezelfde lijst
 * eromheen: "deze lijst", zoals een tekstverwerker die bij een nieuwe notatie
 * of opnieuw nummeren bedoelt.
 */
export function lijstBlok(alle: readonly Alinea[], van: number, tot: number): number[] {
  const eerste = alle.slice(van, tot + 1).map((a) => lijstVan(a.properties)).find(Boolean);
  let begin = van;
  let eind = tot;
  if (eerste) {
    while (begin > 0 && lijstVan(alle[begin - 1].properties)?.numId === eerste.numId) begin--;
    while (eind < alle.length - 1 && lijstVan(alle[eind + 1].properties)?.numId === eerste.numId) eind++;
  }
  return Array.from({ length: eind - begin + 1 }, (_, i) => begin + i);
}

/** Vanaf de eerste geselecteerde alinea tot het einde van het lijstblok (opnieuw beginnen). */
export function restVanBlok(alle: readonly Alinea[], van: number, tot: number): number[] {
  return lijstBlok(alle, van, tot).filter((i) => i >= van);
}

/**
 * De dichtstbijzijnde eerdere lijst van dezelfde soort (opsomming of
 * nummering) met een andere numId, om bij aan te sluiten.
 */
export function vorigeLijst(alle: readonly Alinea[], van: number, huidig: LijstVerwijzing | null): number | null {
  const opsomming = (a: Alinea) => a.properties.listIsBullet === true;
  const eigen = alle[van];
  for (let i = van - 1; i >= 0; i--) {
    const l = lijstVan(alle[i].properties);
    if (!l || l.numId === huidig?.numId) continue;
    if (eigen && huidig && opsomming(alle[i]) !== opsomming(eigen)) continue;
    return l.numId;
  }
  return null;
}
