/**
 * Positieberekening voor het tabelvoorbeeld. Alles wat de engine op het scherm
 * tekent wordt gemeten in schermpixels; het anker bewaart de plek in
 * paginapixels bij 100 %, zodat het voorbeeld meeschaalt met zoomen en
 * meescrollt met de pagina.
 */

export interface Rechthoek {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Paginamaten in twips (1/20 punt), zoals in w:sectPr. */
export interface Paginamaten {
  pageWidth: number;
  marginLeft: number;
  marginRight: number;
}

/** Letter met marges van 2,54 cm: de standaard van een leeg document. */
export const STANDAARD_PAGINA: Paginamaten = {
  pageWidth: 12240,
  marginLeft: 1440,
  marginRight: 1440,
};

/**
 * Breedte die de engine een nieuwe tabel geeft (insert_table): altijd 6,5 inch
 * (9360 twips) vanaf de linkermarge, verdeeld over gelijke kolommen, ongeacht
 * paginaformaat of marges. Het voorbeeld toont precies wat er ingevoegd wordt.
 */
export const TABELBREEDTE = 9360;

/** 1 inch = 1440 twips = 96 CSS-pixels. */
export const twipsNaarPx = (twips: number) => twips / 15;

export interface Anker {
  /** Linkermarge in paginapixels bij 100 %. */
  x: number;
  /** Bovenkant van de tabel ten opzichte van de pagina, bij 100 %. */
  y: number;
  /** Tabelbreedte bij 100 %. */
  breedte: number;
  /** Rijhoogte bij 100 %: één regel tekst. */
  rijhoogte: number;
  /** Paginabreedte bij 100 %; de verhouding met de getekende breedte is de zoom. */
  paginabreedte: number;
}

/** Vult ontbrekende of onzinnige paginamaten aan met de standaard. */
export function geldigeMaten(maten: Partial<Paginamaten> | null | undefined): Paginamaten {
  const pageWidth =
    maten?.pageWidth && maten.pageWidth > 0 ? maten.pageWidth : STANDAARD_PAGINA.pageWidth;
  const marge = (waarde: number | undefined, standaard: number) =>
    waarde !== undefined && waarde >= 0 ? waarde : standaard;
  let marginLeft = marge(maten?.marginLeft, STANDAARD_PAGINA.marginLeft);
  let marginRight = marge(maten?.marginRight, STANDAARD_PAGINA.marginRight);
  if (marginLeft + marginRight >= pageWidth - 288) {
    marginLeft = STANDAARD_PAGINA.marginLeft * (pageWidth / STANDAARD_PAGINA.pageWidth);
    marginRight = marginLeft;
  }
  return { pageWidth, marginLeft, marginRight };
}

/**
 * Bepaalt het anker van het voorbeeld uit de cursor en de pagina waarop die
 * staat. In een lege alinea komt de tabel op de plek van de alinea; anders
 * eronder, met ongeveer de alinea-afstand ertussen (zoals de engine invoegt).
 */
export function bepaalAnker({
  cursor,
  pagina,
  maten,
  legeAlinea,
}: {
  cursor: Rechthoek;
  pagina: Rechthoek;
  maten: Partial<Paginamaten> | null | undefined;
  legeAlinea: boolean;
}): Anker {
  const m = geldigeMaten(maten);
  const paginabreedte = twipsNaarPx(m.pageWidth);
  const schaal = pagina.width > 0 ? pagina.width / paginabreedte : 1;
  const regel = Math.max(cursor.height, 4) / schaal;
  const cursorTop = (cursor.top - pagina.top) / schaal;
  const y = legeAlinea ? cursorTop : cursorTop + regel + regel * 0.8;
  return {
    x: twipsNaarPx(m.marginLeft),
    y: Math.max(0, y),
    breedte: twipsNaarPx(TABELBREEDTE),
    rijhoogte: regel,
    paginabreedte,
  };
}

export interface Plaatsing extends Rechthoek {
  rijhoogte: number;
  schaal: number;
}

/** Schermrechthoek van een tabel met `rijen` rijen bij de huidige paginapositie. */
export function plaats(anker: Anker, pagina: Rechthoek, rijen: number): Plaatsing {
  const schaal = pagina.width > 0 ? pagina.width / anker.paginabreedte : 1;
  const rijhoogte = anker.rijhoogte * schaal;
  return {
    left: pagina.left + anker.x * schaal,
    top: pagina.top + anker.y * schaal,
    width: anker.breedte * schaal,
    height: rijhoogte * Math.max(1, rijen),
    rijhoogte,
    schaal,
  };
}

/**
 * CSS-clip-path dat het voorbeeld beperkt tot het zichtbare documentvlak,
 * zodat het bij scrollen niet over het lint of de statusbalk valt.
 */
export function knipBinnen(voorbeeld: Rechthoek, vlak: Rechthoek) {
  const boven = Math.max(0, vlak.top - voorbeeld.top);
  const links = Math.max(0, vlak.left - voorbeeld.left);
  const onder = Math.max(0, voorbeeld.top + voorbeeld.height - (vlak.top + vlak.height));
  const rechts = Math.max(0, voorbeeld.left + voorbeeld.width - (vlak.left + vlak.width));
  return `inset(${boven}px ${rechts}px ${onder}px ${links}px)`;
}

/** Kiest de pagina waarop een verticale schermpositie valt (of de dichtstbijzijnde). */
export function paginaBij(paginas: readonly Rechthoek[], y: number): number {
  let beste = -1;
  let afstand = Infinity;
  paginas.forEach((p, index) => {
    const d = y < p.top ? p.top - y : y > p.top + p.height ? y - (p.top + p.height) : 0;
    if (d < afstand) {
      afstand = d;
      beste = index;
    }
  });
  return beste;
}
