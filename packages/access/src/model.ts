/** Adaptercontract: onbekende onderdelen worden nooit als lege, gelezen lijsten gepresenteerd. */
export type Objectsoort = "Tabel" | "Query" | "VBA";
export interface DatabaseObject {
  id: string;
  naam: string;
  soort: Objectsoort;
  kolommen?: string[];
  rijen?: string[][];
  bron?: string;
  totaalRijen?: number;
  kolomtypen?: string[];
}
export interface DatabaseSession {
  naam: string;
  grootte?: number;
  voorbeeld: boolean;
  objecten: DatabaseObject[];
  melding: string;
}
export function controleerDatabaseBestand(file: File) {
  if (!/\.(mdb|accdb)$/i.test(file.name))
    throw new Error("Kies een MDB- of ACCDB-bestand.");
  if (!file.size)
    throw new Error("Dit bestand is leeg. Kies een database met inhoud.");
  if (file.size > 100 * 1024 * 1024)
    throw new Error("Kies een database van maximaal 100 MB.");
}
export const voorbeeld: DatabaseSession = {
  naam: "Voorbeelddatabase",
  voorbeeld: true,
  melding:
    "Demonstratie met ingebouwde voorbeeldgegevens. Dit zijn geen gegevens uit een geopend databasebestand.",
  objecten: [
    {
      id: "materialen",
      naam: "Materialen",
      soort: "Tabel",
      kolommen: ["Code", "Omschrijving", "Eenheid"],
      rijen: [
        ["MAT-001", "Hout", "m³"],
        ["MAT-002", "Staal", "kg"],
        ["MAT-003", "Beton", "m³"],
      ],
    },
    {
      id: "selectie",
      naam: "Materialenlijst",
      soort: "Query",
      bron: "SELECT Code, Omschrijving, Eenheid\nFROM Materialen\nORDER BY Code;",
    },
    {
      id: "module",
      naam: "Voorbeeldmodule",
      soort: "VBA",
      bron: 'Option Explicit\n\nPublic Function EenheidLabel() As String\n    EenheidLabel = "m³"\nEnd Function',
    },
  ],
};
export function csv(kolommen: string[], rijen: string[][]): string {
  const cel = (waarde: string) =>
    '"' +
    (/^[=+@\-\t\r\n]/.test(waarde) ? "'" + waarde : waarde).replaceAll(
      '"',
      '""',
    ) +
    '"';
  return (
    "\uFEFF" +
    [kolommen, ...rijen].map((rij) => rij.map(cel).join(";")).join("\r\n")
  );
}
