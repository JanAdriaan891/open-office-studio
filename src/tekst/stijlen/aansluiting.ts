/**
 * Aansluitpunt voor de vensters Lettertype… en Alinea… (pakket W1). De
 * stijl-editor hier heeft een eigen, eenvoudige set eigenschappen; zodra W1
 * zijn vensters registreert, verschijnen in de stijl-editor de knoppen
 * ‘Lettertype…’ en ‘Alinea…’ die die vensters openen voor de stijl.
 *
 * Gebruik (W1):
 * ```ts
 * import { registreerOpmaakVensters } from "../tekst/stijlen/aansluiting";
 * useEffect(() => registreerOpmaakVensters({
 *   lettertype: (huidig) => openLettertypeVenster({ stijl: huidig }), // Promise<… | null>
 *   alinea: (huidig) => openAlineaVenster({ stijl: huidig }),
 * }), []);
 * ```
 * Het venster krijgt de huidige (opgeloste) eigenschappen en geeft de
 * gekozen eigenschappen terug, of `null` bij Annuleren. Alleen velden die
 * het teruggeeft worden in de stijl gezet.
 */
import { useSyncExternalStore } from "react";
import type { StijlEigenschappen } from "./stijlenxml";

export interface OpmaakVensters {
  lettertype?: (huidig: StijlEigenschappen) => Promise<StijlEigenschappen | null>;
  alinea?: (huidig: StijlEigenschappen) => Promise<StijlEigenschappen | null>;
}

let huidig: OpmaakVensters = {};
const luisteraars = new Set<() => void>();

export function registreerOpmaakVensters(vensters: OpmaakVensters) {
  huidig = vensters;
  luisteraars.forEach((l) => l());
  return () => {
    if (huidig !== vensters) return;
    huidig = {};
    luisteraars.forEach((l) => l());
  };
}

export function useOpmaakVensters(): OpmaakVensters {
  return useSyncExternalStore(
    (l) => {
      luisteraars.add(l);
      return () => luisteraars.delete(l);
    },
    () => huidig,
    () => huidig,
  );
}
