/**
 * Openen van het afdrukvoorbeeld vanuit lint, sneltoetsen en Opslaan als.
 * Een gebeurtenis houdt de aanroepers los van de dialoog zelf.
 */
import type { AfdrukBron } from "./bron";

export const AFDRUK_GEBEURTENIS = "office:afdrukvoorbeeld";

export interface AfdrukVerzoek {
  /** Een eigen bron (bijvoorbeeld een databaserapport); anders de zichtbare editor. */
  bron?: AfdrukBron;
  /** Direct afdrukken in plaats van alleen het voorbeeld (Ctrl+P). */
  afdrukken?: boolean;
  /** De presentatie-indeling waarmee het voorbeeld opent. */
  indeling?: "dias" | "handout" | "notities";
}

export function vraagAfdrukvoorbeeld(verzoek: AfdrukVerzoek = {}) {
  window.dispatchEvent(new CustomEvent(AFDRUK_GEBEURTENIS, { detail: verzoek }));
}
