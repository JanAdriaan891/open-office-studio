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
  48: "Fout bij het laden van de DLL",
  52: "Ongeldige bestandsnaam of ongeldig bestandsnummer",
  53: "Bestand niet gevonden",
  68: "Apparaat niet beschikbaar",
  70: "Toegang geweigerd",
  75: "Fout bij toegang tot pad/bestand",
  76: "Pad niet gevonden",
  91: "Objectvariabele of With-blokvariabele is niet ingesteld",
  92: "For-lus is niet geïnitialiseerd",
  94: "Ongeldig gebruik van Null",
  424: "Object vereist",
  429: "ActiveX-onderdeel kan geen object maken",
  438: "Deze eigenschap of methode wordt niet ondersteund door dit object",
  440: "Automatiseringsfout",
  449: "Argument is niet optioneel",
  453: "Kan het opgegeven DLL-ingangspunt niet vinden",
  490: "Kan het opgegeven bestand niet openen",
  450: "Onjuist aantal argumenten of ongeldige eigenschapstoewijzing",
  457: "Deze sleutel is al gekoppeld aan een element van deze verzameling",
  2293: "Het e-mailbericht kan niet worden verzonden.",
  2302: "De uitvoergegevens kunnen niet in het bestand worden opgeslagen.",
  2450: "Access kan het formulier niet vinden.",
  2451: "Access kan het rapport niet vinden.",
  2456: "Het nummer dat u hebt opgegeven voor het formulier is ongeldig.",
  2501: "De bewerking is geannuleerd.",
  3010: "De tabel bestaat al.",
  3020: "Update of CancelUpdate zonder AddNew of Edit.",
  3021: "Geen huidige record.",
  3024: "Kan het bestand niet vinden.",
  3061: "Te weinig parameters.",
  3075: "Syntaxisfout in de query-expressie.",
  3078: "De tabel of query is niet gevonden.",
  3251: "De bewerking wordt niet ondersteund voor dit type object.",
  3265: "Item is niet gevonden in deze verzameling.",
  3270: "Eigenschap niet gevonden.",
  3367: "Kan niet toevoegen. Er bestaat al een object met die naam in de verzameling.",
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
  /** Bij reden "afgeschermd": wat er geweigerd is (voor de modi `fout`/`overslaan`). */
  afscherming?: { naam: string; categorie: string; nummer: number; object?: boolean };
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
