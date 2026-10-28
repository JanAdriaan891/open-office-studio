/**
 * Enginevensters van @betteroffice/docx-react (Cel splitsen, Tabel- en
 * Afbeeldingseigenschappen, Koppeling invoegen) zetten bij het openen de focus
 * niet in het venster. Esc en Tab werken dan niet: de toetsen komen bij de
 * lintknop aan. Dit hulpje zet de focus op het eerste bedieningselement van
 * een nieuw venster in de editor.
 */

const BEDIENING =
  "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])";

/** Zet de focus in het venster als die er nog niet staat; true als dat gebeurde. */
export function focusInVenster(venster: Element, actief: Element | null = document.activeElement) {
  if (actief && venster.contains(actief)) return false;
  const doel = venster.querySelector<HTMLElement>(BEDIENING);
  if (!doel) return false;
  doel.focus();
  return true;
}

/**
 * Volgt vensters (role=dialog) die direct in de editorwortel verschijnen,
 * zoals de engine ze plaatst. Geeft een opruimfunctie terug.
 */
export function volgEngineVensters(wortel: HTMLElement) {
  const gezien = new WeakSet<Element>();
  const kijk = () => {
    for (const venster of wortel.querySelectorAll(":scope > * > [role=dialog], :scope > [role=dialog]")) {
      if (gezien.has(venster)) continue;
      gezien.add(venster);
      focusInVenster(venster);
    }
  };
  const waarnemer = new MutationObserver(kijk);
  waarnemer.observe(wortel, { childList: true });
  return () => waarnemer.disconnect();
}
