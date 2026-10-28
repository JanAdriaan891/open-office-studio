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

/** Een nieuw tekstdocument in een eigen tabblad, bijvoorbeeld het resultaat van Versies vergelijken. */
export interface NieuwDocument {
  naam: string;
  bytes: Uint8Array;
}
const NIEUW_DOCUMENT = "openaec-office-nieuw-document";
export function openNieuwDocument(document: NieuwDocument) {
  window.dispatchEvent(new CustomEvent<NieuwDocument>(NIEUW_DOCUMENT, { detail: document }));
}
export function bijNieuwDocument(doe: (document: NieuwDocument) => void) {
  const luister = (e: Event) => {
    const detail = (e as CustomEvent<NieuwDocument>).detail;
    if (detail?.bytes?.length) doe(detail);
  };
  window.addEventListener(NIEUW_DOCUMENT, luister);
  return () => window.removeEventListener(NIEUW_DOCUMENT, luister);
}
