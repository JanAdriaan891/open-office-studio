/**
 * Foutsoorten van de VBA-module.
 *
 * - `VbaParseerFout`: de bron is geen geldige (of geen ondersteunde) VBA.
 * - `VbaFout`: een runtimefout met een VBA-foutnummer (`Err.Number`), die met
 *   `On Error` af te vangen is.
 * - `VbaAfbreking`: stappenlimiet, annulering, afscherming of `End`; nooit af te vangen.
 */

export interface Positie {
  module: string;
  regel: number;
  kolom: number;
}

export class VbaParseerFout extends Error {
  constructor(
    melding: string,
    readonly positie: Positie,
    /** Korte, broncodevrije omschrijving van de constructie, voor statistieken. */
    readonly constructie: string = "syntaxis",
  ) {
    super(
      `${positie.module}, regel ${positie.regel}, kolom ${positie.kolom}: ${melding}`,
    );
    this.name = "VbaParseerFout";
  }
  get kaleMelding() {
    return this.message.replace(/^[^:]*: /, "");
  }
}

/** Standaardbeschrijvingen zoals een Nederlandstalige Access ze toont. */
export const FOUTTEKSTEN: Record<number, string> = {
  3: "Return zonder GoSub",
  5: "Ongeldige procedureaanroep of ongeldig argument",
  6: "Overloop",
  9: "Subscript valt buiten het bereik",
  10: "Deze matrix is vast of tijdelijk vergrendeld",
  11: "Deling door nul",
  13: "Typen komen niet overeen",
  20: "Resume zonder fout",
  28: "Onvoldoende stackruimte",
  35: "Sub of Function is niet gedefinieerd",
  91: "Objectvariabele of With-blokvariabele is niet ingesteld",
  92: "For-lus is niet geïnitialiseerd",
  94: "Ongeldig gebruik van Null",
  424: "Object vereist",
  438: "Deze eigenschap of methode wordt niet ondersteund door dit object",
  440: "Automatiseringsfout",
  449: "Argument is niet optioneel",
  450: "Onjuist aantal argumenten of ongeldige eigenschapstoewijzing",
  457: "Deze sleutel is al gekoppeld aan een element van deze verzameling",
  2501: "De bewerking is geannuleerd.",
  3020: "Update of CancelUpdate zonder AddNew of Edit.",
  3021: "Geen huidige record.",
  3061: "Te weinig parameters.",
  3078: "De tabel of query is niet gevonden.",
  3265: "Item is niet gevonden in deze verzameling.",
  3420: "Object is ongeldig of niet meer ingesteld.",
};

export class VbaFout extends Error {
  /** Waar de fout optrad; wordt gevuld zodra de interpreter hem ziet. */
  positie?: Positie & { procedure?: string };
  constructor(
    readonly nummer: number,
    beschrijving?: string,
    readonly bron: string = "",
  ) {
    super(beschrijving ?? FOUTTEKSTEN[nummer] ?? `Toepassingsfout ${nummer}`);
    this.name = "VbaFout";
  }
  get beschrijving() {
    return this.message;
  }
}

export type AfbrekingReden =
  | "stappenlimiet"
  | "geannuleerd"
  | "afgeschermd"
  | "niet-ondersteund"
  | "end"
  | "stop"
  | "intern";

export class VbaAfbreking extends Error {
  positie?: Positie & { procedure?: string };
  constructor(
    readonly reden: AfbrekingReden,
    melding: string,
  ) {
    super(melding);
    this.name = "VbaAfbreking";
  }
}

export const fout = (nummer: number, beschrijving?: string) =>
  new VbaFout(nummer, beschrijving);

/** Een constructie die de interpreter (nog) niet kent; stopt de uitvoering. */
export const nietOndersteund = (wat: string) =>
  new VbaAfbreking(
    "niet-ondersteund",
    `${wat} wordt door de VBA-runtime van Open Office Studio niet ondersteund.`,
  );
