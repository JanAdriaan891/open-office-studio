/**
 * Opdrachten achter de sneltoetsen met een `actie` in het centrale register
 * (src/lint/sneltoetsenlijst.ts). De toetsen en omschrijvingen staan daar;
 * hier alleen welke opdrachten bestaan, zodat de registertest kan nagaan dat
 * elke toets iets doet.
 */
export const ACTIES = [
  "groter",
  "kleiner",
  "puntGroter",
  "puntKleiner",
  "plakkenTekst",
  "herhalen",
  "regelafstand1",
  "regelafstand2",
  "regelafstand15",
  "kop1",
  "kop2",
  "kop3",
  "standaardstijl",
  "opmaakWissen",
  "alineaOpmaakWissen",
  "bijhouden",
  "kwastKopieren",
  "kwastPlakken",
  "superscript",
  "subscript",
  "inspringen",
  "minderInspringen",
  "opsomming",
  "opmerking",
  "lettertype",
  "dubbelOnderstrepen",
] as const;

export type ActieId = (typeof ACTIES)[number];

export const isActie = (id: string | undefined): id is ActieId =>
  !!id && (ACTIES as readonly string[]).includes(id);
