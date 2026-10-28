/**
 * Wat de zichtbare editor over de spelling aan de statusbalk meldt (taal en
 * aantal fouten), los van React-props, zoals src/status/statusinfo.ts.
 */
import { useSyncExternalStore } from "react";
import type { Taal } from "./talen";

export interface SpellingStatus {
  /** De taal waarin nu wordt gecontroleerd (bij de cursor of van het document). */
  taal: Taal;
  /** Of de taal uit het document komt (w:lang) of door de gebruiker gekozen is. */
  automatisch: boolean;
  /** Aantal onbekende woorden; null zolang de eerste controle loopt. */
  fouten: number | null;
  /** Melding als de spellingcontrole niet beschikbaar is. */
  probleem: string | null;
  openVenster(): void;
  /** Kiest de taal van het document; null = weer uit het document. */
  kiesTaal(taal: Taal | null): void;
}

let huidig: { eigenaar: object; status: SpellingStatus } | null = null;
const luisteraars = new Set<() => void>();
const meld = () => luisteraars.forEach((l) => l());

export function publiceerSpelling(eigenaar: object, status: SpellingStatus | null) {
  if (status === null) {
    if (huidig?.eigenaar !== eigenaar) return;
    huidig = null;
  } else huidig = { eigenaar, status };
  meld();
}

const lees = () => huidig?.status ?? null;
const volg = (l: () => void) => {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
};

export const useSpellingStatus = () => useSyncExternalStore(volg, lees, lees);
