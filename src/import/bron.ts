import type { Soort } from "../editors";

/** Kenmerken van het geopende bronbestand die bij opslaan meetellen. */
export interface Bronkenmerken {
  /** Het origineel was met een wachtwoord versleuteld (het wachtwoord zelf wordt niet bewaard). */
  versleuteling?: "agile" | "standard";
}

/** OOXML-formaten die de app zelf schrijft en dus kan versleutelen. */
export const VERSLEUTELBAAR = new Set([
  "docx",
  "xlsx",
  "pptx",
  "docm",
  "xlsm",
  "pptm",
]);

/**
 * De laatste stap vóór het wegschrijven van een OOXML-pakket in het eigen
 * (of macro-)formaat: eventueel met wachtwoord versleutelen. Het wachtwoord
 * komt alleen uit het geheugen van deze sessie en wordt niet bewaard.
 */
export async function bereidOpslag(opties: {
  bytes: Uint8Array;
  soort: Soort;
  ext: string;
  bron?: Bronkenmerken | null;
  wachtwoord?: string;
}): Promise<{ bytes: Uint8Array; toelichting?: string }> {
  let { bytes } = opties;
  if (opties.wachtwoord && VERSLEUTELBAAR.has(opties.ext)) {
    const { versleutel } = await import("./versleuteling");
    bytes = await versleutel(bytes, opties.wachtwoord);
    return {
      bytes,
      toelichting:
        "Bewaard met een wachtwoord (ECMA-376 Agile, AES-256). Zonder het wachtwoord is het bestand niet te openen.",
    };
  }
  return { bytes };
}
