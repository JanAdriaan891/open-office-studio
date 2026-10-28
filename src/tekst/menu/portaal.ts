import { zichtbaarElement } from "../../lint/editorApi";

/**
 * Waar zwevende menu's en werkbalken heen gaan: in de app-wortel (`.office`)
 * van het zichtbare document, zodat de lintstijlen en het thema gelden.
 */
export function portaalDoel(): HTMLElement {
  return (
    zichtbaarElement<HTMLElement>(".office-tekst")?.closest<HTMLElement>(".office") ??
    document.body
  );
}
