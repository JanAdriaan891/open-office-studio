/** Vensters van de werkruimte openen vanuit elke plek, zonder props door te geven. */
const SNELTOETSEN = "openaec-office-sneltoetsen";
const INSTELLINGEN = "openaec-office-instellingen";

export function toonSneltoetsen() {
  window.dispatchEvent(new Event(SNELTOETSEN));
}
export function toonInstellingen() {
  window.dispatchEvent(new Event(INSTELLINGEN));
}
export function bijVerzoek(soort: "sneltoetsen" | "instellingen", doe: () => void) {
  const naam = soort === "sneltoetsen" ? SNELTOETSEN : INSTELLINGEN;
  window.addEventListener(naam, doe);
  return () => window.removeEventListener(naam, doe);
}
