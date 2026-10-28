/** Focusbeheer voor het lint: welke bedieningselementen nu bereikbaar zijn. */

const FOCUSBAAR =
  'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Zichtbare, bruikbare bedieningselementen binnen `wortel`, in DOM-volgorde. */
export function focusbare(wortel: HTMLElement): HTMLElement[] {
  return [...wortel.querySelectorAll<HTMLElement>(FOCUSBAAR)].filter(
    (element) =>
      !element.matches(":disabled") &&
      element.tabIndex >= 0 &&
      element.getClientRects().length > 0 &&
      !element.closest("[inert], [aria-hidden='true']"),
  );
}

/** Invoervelden houden hun eigen pijltjestoetsen. */
export function houdtPijltjes(element: Element) {
  return element.matches(
    'select, textarea, [contenteditable="true"], input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="color"])',
  );
}

/** Volgende index bij pijltjes, Home en End; null voor andere toetsen. */
export function volgendeIndex(
  toets: string,
  huidig: number,
  aantal: number,
): number | null {
  if (!aantal) return null;
  switch (toets) {
    case "ArrowRight":
      return huidig < 0 ? 0 : (huidig + 1) % aantal;
    case "ArrowLeft":
      return huidig < 0 ? aantal - 1 : (huidig + aantal - 1) % aantal;
    case "Home":
      return 0;
    case "End":
      return aantal - 1;
    default:
      return null;
  }
}

/** Een naam voor een element, voor toetstips en meldingen. */
export function naamVan(element: Element) {
  return (
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.textContent ||
    ""
  ).trim();
}
