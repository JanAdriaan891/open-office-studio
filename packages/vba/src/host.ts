/**
 * Koppelvlakken naar de buitenwereld. De interpreter doet zelf niets met de
 * gebruikersinterface: MsgBox, InputBox, DoCmd.OpenForm en formulierbesturing
 * gaan via deze interfaces (in de worker: via berichten naar de hoofdthread).
 * Alle waarden zijn structureel kloonbaar.
 */

/** Waarde die de host en de VBA-runtime uitwisselen. Datums als ISO-tekst in `{ datum }`. */
export type HostWaarde =
  | null
  | number
  | string
  | boolean
  | { datum: string }
  | { leeg: true }
  | HostWaarde[];

export interface MsgBoxVerzoek {
  tekst: string;
  /** VBA-knoppen en pictogrammen, bv. vbYesNo + vbQuestion = 36. */
  knoppen: number;
  titel: string;
}

export interface InputBoxVerzoek {
  tekst: string;
  titel: string;
  standaard: string;
}

export type HostGebeurtenisSoort =
  | "OpenForm"
  | "OpenReport"
  | "OpenQuery"
  | "OpenTable"
  | "Close"
  | "Requery"
  | "Refresh"
  | "GoToRecord"
  | "GoToControl"
  | "FindRecord"
  | "ApplyFilter"
  | "ShowAllRecords"
  | "Maximize"
  | "Minimize"
  | "Restore"
  | "Beep"
  | "Hourglass"
  | "Echo"
  | "Quit"
  | "RunCommand"
  | "SelectObject"
  | "Save"
  | "CancelEvent"
  | "DoMenuItem"
  | "GoToPage"
  | "SearchForRecord"
  | "NavigateTo"
  | "ShowToolbar"
  | "MoveSize"
  | "RepaintObject"
  | "RefreshRecord"
  | "FindNext";

export interface HostGebeurtenis {
  soort: HostGebeurtenisSoort;
  /** Positionele argumenten zoals in VBA (weggelaten argumenten zijn null). */
  args: HostWaarde[];
}

export interface VbaHost {
  /** Geeft vbOK (1), vbCancel (2), vbAbort (3), vbRetry (4), vbIgnore (5), vbYes (6) of vbNo (7). */
  msgBox?(verzoek: MsgBoxVerzoek): Promise<number>;
  /** null = Annuleren (InputBox geeft dan ""). */
  inputBox?(verzoek: InputBoxVerzoek): Promise<string | null>;
  /** Wordt bij elke Debug.Print aangeroepen (naast de verzamelde uitvoer). */
  debugPrint?(tekst: string): void;
  /**
   * DoCmd-acties die de interface raken. De host beslist; zonder deze functie
   * wordt de actie met een duidelijke melding geweigerd.
   */
  gebeurtenis?(gebeurtenis: HostGebeurtenis): Promise<HostWaarde | void>;
}

/** Een formulier, rapport of besturingselement daarop. */
export interface FormulierDoel {
  soort: "formulier" | "rapport";
  /** Naam van het formulier; subformulieren als pad: `Hoofd/subBesturing`. */
  naam: string;
  /**
   * Besturingselement; ontbreekt voor het formulier zelf. Net als in VBA zijn namen
   * hoofdletterongevoelig: de host moet ze zonder onderscheid in hoofdletters vergelijken.
   */
  besturing?: string;
}

/**
 * Brug naar de formuliermodule: `Me`, `Me!txtNaam`, `Forms!frmKlant!Naam`.
 * De formuliermodule implementeert dit later; zonder host geven deze
 * verwijzingen een duidelijke fout.
 */
export interface FormulierHost {
  /** Is het formulier (of rapport) geopend? */
  isGeopend(doel: FormulierDoel): Promise<boolean>;
  /**
   * Eigenschap lezen. Namen van eigenschappen en methoden komen altijd in kleine
   * letters (VBA is hoofdletterongevoelig); "value" is de standaardwaarde van een
   * besturingselement. Bij `Screen` wordt "activeform"/"activecontrol" gevraagd.
   */
  lees(doel: FormulierDoel, eigenschap: string, args: HostWaarde[]): Promise<HostWaarde>;
  zet(doel: FormulierDoel, eigenschap: string, waarde: HostWaarde): Promise<void>;
  /** Methode aanroepen: Requery, SetFocus, Undo, Refresh, AddItem … */
  roepAan(doel: FormulierDoel, methode: string, args: HostWaarde[]): Promise<HostWaarde>;
  /** Bestaat dit besturingselement? Wordt gebruikt om `Me.X` te onderscheiden van formuliereigenschappen. */
  heeftBesturing?(doel: FormulierDoel, naam: string): Promise<boolean>;
}
