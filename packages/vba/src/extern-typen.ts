/**
 * Typen voor de analyse van externe afhankelijkheden en voor het uitvoeren
 * zonder ontbrekende onderdelen. Alleen typen (geen code), zodat de interface
 * ze kan importeren zonder de interpreter mee te laden.
 *
 * Niets in deze typen bevat broncode, databaseinhoud of verbindingsreeksen;
 * wel namen van modules, procedures, bibliotheken, DLL’s en ProgID’s.
 */

// ---------- uitvoeren ----------

/**
 * Wat de runtime doet met een onderdeel dat ontbreekt of is afgeschermd
 * (CreateObject, Declare, bestanden, Shell, onbekende bibliotheek …).
 *
 * - `stoppen` (standaard): de uitvoering stopt met een niet-vangbare afbreking.
 * - `fout`: een gewone, vangbare VBA-fout met het nummer dat VBA zelf zou geven
 *   (429, 453, 75, 53, 5 …), zodat `On Error` in de code werkt.
 * - `overslaan`: de instructie wordt overgeslagen; een functie of eigenschap
 *   levert de standaardwaarde (Empty, of een plaatsvervangend object dat elke
 *   verdere aanroep ook overslaat). Alles wordt geregistreerd.
 *
 * In alle modi blijft de afscherming gelijk: er wordt nooit een proces,
 * bestand, COM-object of DLL aangesproken.
 */
export type OntbrekendModus = "stoppen" | "fout" | "overslaan";

export type OvergeslagenCategorie =
  | "proces"
  | "bestand"
  | "com"
  | "windows-api"
  | "toetsenbord"
  | "omgeving"
  | "register"
  | "hyperlink"
  | "export"
  | "project"
  /** Lid van een plaatsvervangend object (na een overgeslagen CreateObject e.d.). */
  | "vervolg"
  /** Functie, variabele of objecttype dat niet in het project en niet in de bibliotheek staat. */
  | "onbekend"
  /** Fout 91/424 die volgt uit een eerder overgeslagen onderdeel. */
  | "vervolgfout";

/** Eén overgeslagen onderdeel (samengevoegd per plek). Geen broncode. */
export interface OvergeslagenOnderdeel {
  /** Wat er overgeslagen is, bv. `CreateObject`, `Declare GetTickCount`, `Kill`, `Excel.Application.Workbooks`. */
  wat: string;
  categorie: OvergeslagenCategorie;
  module: string;
  procedure?: string;
  regel: number;
  /** Hoe vaak op deze plek (bv. in een lus). */
  aantal: number;
  /** Leesbare regel: `overgeslagen: CreateObject, Module1/12`. */
  melding: string;
}

export type UitvoeringStatus = "geslaagd" | "fout" | "tijdslimiet" | "gestopt";

export interface UitvoeringFout {
  soort: "runtime" | "afbreking" | "parseer" | "intern";
  /** VBA-foutnummer bij een runtimefout. */
  nummer?: number;
  omschrijving: string;
  /** Bij een afbreking: stappenlimiet, tijdslimiet, afgeschermd, niet-ondersteund, gestopt … */
  reden?: string;
  module?: string;
  procedure?: string;
  regel?: number;
}

/** Een verzoek aan de host tijdens de uitvoering (MsgBox, InputBox, DoCmd.OpenForm …). */
export interface Hostgebeurtenis {
  soort: "msgBox" | "inputBox" | "gebeurtenis" | "formulier";
  /** Bij `gebeurtenis`: OpenForm, OpenReport, Close …; bij `formulier`: de actie. */
  naam?: string;
  /** Formulier- of rapportnaam als die bekend is. */
  doel?: string;
}

/** Vastgelegd resultaat van één uitvoering. */
export interface Uitvoering {
  module: string;
  procedure: string;
  status: UitvoeringStatus;
  overgeslagen: OvergeslagenOnderdeel[];
  fout?: UitvoeringFout;
  /** Debug.Print-regels. */
  uitvoer: string[];
  hostgebeurtenissen: Hostgebeurtenis[];
  stappen?: number;
  duurMs: number;
}

export interface UitvoerOpties {
  ontbrekend?: OntbrekendModus;
  /** Tijdslimiet in ms voor deze aanroep (anders die van de client). */
  tijdslimiet?: number;
  /** Stappenlimiet voor deze aanroep (anders die van de client/worker). */
  stappenlimiet?: number;
}

export interface WatWerktOpties extends UitvoerOpties {
  /** Ook procedures met status `deels` uitvoeren (standaard false). */
  metDeels?: boolean;
  /** Extra filter op de kandidaten (module- en procedurenaam). */
  filter?: (p: ProcedureAnalyse) => boolean;
  /**
   * Per procedure een transactie op de werkkopie die daarna wordt teruggedraaid,
   * zodat de proef de werkkopie niet vervuilt (standaard true).
   */
  terugdraaien?: boolean;
  /** Bestaande analyse (anders wordt hij opnieuw gemaakt). */
  analyse?: ExterneAnalyse;
  /** Wordt na elke procedure aangeroepen (voortgang in de interface). */
  bijVoortgang?: (u: Uitvoering, index: number, totaal: number) => void;
}

export interface WatWerktSamenvatting {
  kandidaten: number;
  uitgevoerd: number;
  geslaagd: number;
  fout: number;
  tijdslimiet: number;
  gestopt: number;
  /** Uitvoeringen waarin iets is overgeslagen. */
  metOvergeslagen: number;
  /** Kon de werkkopie na elke procedure worden teruggedraaid? */
  teruggedraaid: boolean;
  uitvoeringen: Uitvoering[];
  /** Procedures die niet zijn uitgevoerd, met reden (status `niet`, parameters, klassenmodule …). */
  nietUitgevoerd: { module: string; procedure: string; reden: string }[];
}

// ---------- analyse ----------

/** `ingebouwd`: door Open Office Studio nagebootst; `deels`: een deel ervan; `ontbreekt`: niet beschikbaar. */
export type Beschikbaarheid = "ingebouwd" | "deels" | "ontbreekt";

/** Invoer: een verwijzing uit het VBA-project (dir-stroom). Alle velden behalve naam zijn optioneel. */
export interface VerwijzingInvoer {
  naam: string;
  soort?: "Geregistreerde bibliotheek" | "ActiveX-besturingselement" | "Projectverwijzing" | "Onbekend";
  /** Volledige libid (`*\G{GUID}#versie#lcid#pad#omschrijving`). */
  libid?: string;
  guid?: string;
  versie?: string;
  pad?: string;
  omschrijving?: string;
}

export interface VerwijzingAnalyse {
  naam: string;
  soort: NonNullable<VerwijzingInvoer["soort"]>;
  guid?: string;
  versie?: string;
  /** Pad van de typebibliotheek zoals in het project vastgelegd (kan een gebruikersnaam bevatten). */
  pad?: string;
  omschrijving?: string;
  /** Herkende bibliotheek (`Excel`, `ADODB`, `Scripting` …) of de naam zelf. */
  bibliotheek: string;
  status: Beschikbaarheid;
  toelichting: string;
  /** Procedures die deze bibliotheek werkelijk gebruiken (`Module.Procedure`). */
  gebruiktDoor: string[];
}

export type AfhankelijkheidSoort =
  /** Objecttype, `New`, enum/constante of ProgID uit een (ontbrekende) bibliotheek. */
  | "bibliotheek"
  | "declare"
  | "createobject"
  | "bestand"
  | "proces"
  | "toetsenbord"
  | "omgeving"
  | "register"
  | "pad"
  | "gekoppelde-tabel"
  | "externe-database"
  | "hyperlink"
  | "export"
  /** Functie of naam die nergens gedefinieerd is (mogelijk uit een ontbrekende verwijzing). */
  | "onbekend"
  /** De module bevat een syntaxisfout. */
  | "syntaxis";

export interface Afhankelijkheid {
  soort: AfhankelijkheidSoort;
  /** Bv. `Excel.Application`, `kernel32!GetTickCount`, `Scripting.FileSystemObject`, `Kill`, `tblKlant`. */
  naam: string;
  /** Bibliotheek of DLL. */
  bibliotheek?: string;
  status: Beschikbaarheid;
  module: string;
  procedure?: string;
  regel: number;
  /** Binnen een foutafhandeling (On Error) of een voorwaarde: het pad is te omzeilen. */
  omzeilbaar: boolean;
  /** Foutnummer in de modus `fout`. */
  foutnummer?: number;
}

export type ProcedureStatus = "uitvoerbaar" | "deels" | "niet";

export interface ProcedureReden {
  /** Korte omschrijving: `CreateObject("Excel.Application")`, `Declare kernel32!GetTickCount` … */
  oorzaak: string;
  soort: AfhankelijkheidSoort;
  /** Bibliotheek of DLL, als bekend. */
  bibliotheek?: string;
  status: Beschikbaarheid;
  omzeilbaar: boolean;
  /** Aanroepketen van deze procedure naar de procedure met de directe oorzaak (`Module.Proc`), inclusief beide. */
  keten: string[];
}

export interface ProcedureAnalyse {
  /** `Module.Procedure` */
  sleutel: string;
  module: string;
  moduleSoort: "module" | "klasse" | "formulier";
  naam: string;
  soort: "sub" | "function" | "get" | "let" | "set";
  publiek: boolean;
  zonderVerplichteParameters: boolean;
  /** Gebeurtenisprocedure van een formulier of rapport. */
  gebeurtenis: boolean;
  regel: number;
  status: ProcedureStatus;
  redenen: ProcedureReden[];
  /** Directe aanroepen naar andere procedures in het project (`Module.Proc`). */
  roeptAan: string[];
  aangeroepenDoor: string[];
  /** Heeft een eigen foutafhandeling (On Error GoTo/Resume Next). */
  foutafhandeling: boolean;
}

export interface GekoppeldeTabelInvoer {
  naam: string;
  /** Bv. "ODBC-koppeling" of "Gekoppelde Access-tabel". Nooit een verbindingsreeks. */
  bron?: string;
  /** Staat de tabel (met gegevens) in de werkkopie? */
  inWerkkopie?: boolean;
}

export interface GekoppeldeTabelAnalyse {
  naam: string;
  bron: string;
  status: Beschikbaarheid;
  gebruiktDoor: string[];
}

export interface ExterneAnalyse {
  verwijzingen: VerwijzingAnalyse[];
  procedures: ProcedureAnalyse[];
  afhankelijkheden: Afhankelijkheid[];
  gekoppeldeTabellen: GekoppeldeTabelAnalyse[];
  /** Modules met een syntaxisfout: hun procedures zijn `niet` uitvoerbaar. */
  modulesMetParseerfout: string[];
  samenvatting: {
    procedures: number;
    perStatus: Record<ProcedureStatus, number>;
    /** Aantal procedures (direct of indirect) per oorzaak, bv. `Excel`, `Declare`, `bestand`. */
    perOorzaak: Record<string, number>;
  };
}
