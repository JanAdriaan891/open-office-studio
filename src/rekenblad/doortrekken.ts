/**
 * Vulgreep "doortrekken tot cel…" (#376): de selectie doorvoeren tot een
 * opgegeven cel of rij, in plaats van de vulgreep erheen te slepen.
 */
import {
  kolomNummer,
  MAX_KOLOMMEN,
  MAX_RIJEN,
  ontleedAdres,
  type Bereik,
  type Cel,
} from "../lint/rekenblad-logica";

export type DoortrekRichting = "omlaag" | "omhoog" | "rechts" | "links";
export interface Doortrekdoel {
  richting: DoortrekRichting;
  /** Het te vullen bereik, direct naast de bron. */
  doel: Bereik;
  /** Aantal rijen (of kolommen) dat gevuld wordt. */
  aantal: number;
}

/**
 * Leest het doel: een cel ("B500"), een rijnummer ("500") of een kolom ("H").
 * Een rijnummer of kolomletter houdt de andere as van de bron aan.
 */
export function leesDoel(tekst: string, bron: Bereik): Cel | null {
  const schoon = tekst.trim().replace(/\$/g, "");
  if (/^\d{1,7}$/.test(schoon)) {
    const row = Number(schoon) - 1;
    return row >= 0 && row < MAX_RIJEN ? { row, col: bron.right } : null;
  }
  if (/^[A-Za-z]{1,3}$/.test(schoon)) {
    const col = kolomNummer(schoon.toUpperCase());
    return col >= 0 && col < MAX_KOLOMMEN ? { row: bron.bottom, col } : null;
  }
  return ontleedAdres(schoon);
}

/**
 * Richting en doelbereik vanuit de bron naar een cel, zoals slepen met de
 * vulgreep: de as met de grootste afstand wint, bij gelijke afstand verticaal.
 * Null als de cel binnen de bron ligt.
 */
export function doortrekDoel(bron: Bereik, cel: Cel): Doortrekdoel | null {
  const omlaag = cel.row - bron.bottom;
  const omhoog = bron.top - cel.row;
  const rechts = cel.col - bron.right;
  const links = bron.left - cel.col;
  const verticaal = Math.max(omlaag, omhoog);
  const horizontaal = Math.max(rechts, links);
  if (verticaal <= 0 && horizontaal <= 0) return null;
  if (verticaal >= horizontaal)
    return omlaag > 0
      ? { richting: "omlaag", aantal: omlaag, doel: { ...bron, top: bron.bottom + 1, bottom: cel.row } }
      : { richting: "omhoog", aantal: omhoog, doel: { ...bron, top: cel.row, bottom: bron.top - 1 } };
  return rechts > 0
    ? { richting: "rechts", aantal: rechts, doel: { ...bron, left: bron.right + 1, right: cel.col } }
    : { richting: "links", aantal: links, doel: { ...bron, left: cel.col, right: bron.left - 1 } };
}

/** Zoveel cellen vult één opdracht hooguit; meer vraagt te veel geheugen in één stap. */
export const MAX_DOORTREKKEN = 200000;
export const doelCellen = (d: Doortrekdoel) =>
  (d.doel.bottom - d.doel.top + 1) * (d.doel.right - d.doel.left + 1);
