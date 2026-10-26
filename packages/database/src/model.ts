/** Adaptercontract: onbekende onderdelen worden nooit als lege, gelezen lijsten gepresenteerd. */
export type Objectsoort =
  | "Tabel"
  | "Query"
  | "Relatie"
  | "VBA"
  | "Formulier"
  | "Rapport"
  | "Macro"
  | "Gekoppelde tabel";
export interface DatabaseIndex {
  naam: string;
  kolommen: string[];
  primair: boolean;
  uniek: boolean;
  extern: boolean;
}
export interface DatabaseObject {
  id: string;
  naam: string;
  soort: Objectsoort;
  kolommen?: string[];
  rijen?: string[][];
  bron?: string;
  totaalRijen?: number;
  kolomtypen?: string[];
  indexen?: DatabaseIndex[];
  eigenschappen?: [string, string][];
  beperkingen?: string[];
}
export type Rapportstatus =
  | "gelezen"
  | "gedeeltelijk"
  | "niet gelezen"
  | "niet aanwezig"
  | "niet uitgevoerd";
export interface Rapportregel {
  onderdeel: string;
  status: Rapportstatus;
  aantal: number | null;
  toelichting: string;
}
export interface Compatibiliteitsrapport {
  bestand: string;
  grootte: number;
  sha256: string;
  formaat: string;
  lezer: string;
  datum: string;
  regels: Rapportregel[];
}
/** Melding voor versleutelde of met een wachtwoord beveiligde databases. */
export const VERSLEUTELD_MELDING =
  "Deze database is versleuteld of met een wachtwoord beveiligd; dat wordt nog niet ondersteund.";
export interface DatabaseSession {
  naam: string;
  grootte?: number;
  voorbeeld: boolean;
  objecten: DatabaseObject[];
  melding: string;
  rapport?: Compatibiliteitsrapport;
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
    "﻿" + [kolommen, ...rijen].map((rij) => rij.map(cel).join(";")).join("\r\n")
  );
}
export function rapportAlsTekst(rapport: Compatibiliteitsrapport): string {
  const regels = [
    `Compatibiliteitsrapport Open Database Studio`,
    `Bestand: ${rapport.bestand}`,
    `Grootte: ${rapport.grootte} bytes`,
    `SHA-256: ${rapport.sha256}`,
    `Formaat: ${rapport.formaat}`,
    `Lezer: ${rapport.lezer}`,
    `Datum: ${rapport.datum}`,
    "",
  ];
  for (const regel of rapport.regels)
    regels.push(
      `[${regel.status}] ${regel.onderdeel}${regel.aantal === null ? "" : ` (${regel.aantal})`}: ${regel.toelichting}`,
    );
  return regels.join("\r\n") + "\r\n";
}
