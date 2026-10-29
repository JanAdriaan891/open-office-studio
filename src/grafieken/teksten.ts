/**
 * Teksten van de grafiekmodules buiten React (foutmeldingen, standaardnamen)
 * via i18next, namespace `charts`. Altijd op het moment van gebruik aanroepen,
 * niet bij het laden van een module.
 *
 * De pure modules (model, documenten, pakket, xml) worden ook door Node-scripts
 * gebruikt zonder de app-i18n (`src/i18n/config.ts` gebruikt Vite-functies).
 * Is de gedeelde i18next-instantie niet gestart, dan valt dit terug op een
 * eigen instantie met alleen de Nederlandse bronteksten.
 */
import i18next, { type i18n } from "i18next";
import nl from "../i18n/locales/nl/charts.json" with { type: "json" };

let reserve: i18n | null = null;

function instantie(): i18n {
  if (i18next.isInitialized) return i18next;
  if (!reserve) {
    reserve = i18next.createInstance();
    void reserve.init({
      lng: "nl",
      resources: { nl: { charts: nl } },
      interpolation: { escapeValue: false },
      initAsync: false,
    });
  }
  return reserve;
}

/** Vertaalt `charts:<sleutel>` in de huidige interfacetaal. */
export function vertaal(sleutel: string, opties?: Record<string, unknown>): string {
  return String(instantie().t(`charts:${sleutel}`, opties));
}
