/** Syntaxboom van een VBA-module. */

export interface Plek {
  regel: number;
  kolom: number;
}

export interface TypeAanduiding {
  /** Typenaam zoals geschreven, bv. `Integer`, `DAO.Recordset`, `Klant`. */
  naam: string;
  /** `As New X` */
  nieuw?: boolean;
  /** `String * 10` */
  vasteLengte?: Expr;
  /** `As String()` (alleen bij functieresultaten) */
  matrix?: boolean;
}

export interface Grens {
  onder: Expr | null;
  boven: Expr;
}

export interface Variabele extends Plek {
  naam: string;
  type?: TypeAanduiding;
  /** `Dim a()` → []; `Dim a(5, 1 To 3)` → grenzen; geen matrix: undefined */
  matrix?: Grens[];
  withEvents?: boolean;
}

export interface ConstDef extends Plek {
  naam: string;
  type?: TypeAanduiding;
  waarde: Expr;
}

export interface Parameter extends Plek {
  naam: string;
  type?: TypeAanduiding;
  byVal: boolean;
  optioneel: boolean;
  paramArray: boolean;
  matrix: boolean;
  standaard?: Expr;
}

export type ProcedureSoort = "sub" | "function" | "get" | "let" | "set";

export interface Procedure extends Plek {
  naam: string;
  soort: ProcedureSoort;
  zichtbaarheid: "public" | "private" | "friend";
  statisch: boolean;
  parameters: Parameter[];
  type?: TypeAanduiding;
  body: Statement[];
  eindRegel: number;
}

export interface Declare extends Plek {
  naam: string;
  bibliotheek: string;
  isFunctie: boolean;
  /** `Alias "GetUserNameA"` */
  alias?: string;
  /** Resultaattype (`As Long`). */
  type?: string;
}

export interface TypeDef extends Plek {
  naam: string;
  publiek: boolean;
  velden: Variabele[];
}

export interface EnumDef extends Plek {
  naam: string;
  publiek: boolean;
  leden: { naam: string; waarde?: Expr }[];
}

export interface ModuleAst {
  naam: string;
  soort: "module" | "klasse" | "formulier";
  opties: {
    expliciet: boolean;
    vergelijk: "binary" | "text" | "database";
    basis: 0 | 1;
    priveModule: boolean;
  };
  /** Def-instructies (DefInt A-Z): letter → type. */
  defTypen: Record<string, string>;
  variabelen: (Variabele & { publiek: boolean })[];
  constanten: (ConstDef & { publiek: boolean })[];
  procedures: Procedure[];
  declares: Declare[];
  typen: TypeDef[];
  enums: EnumDef[];
  /** Klassen: `Implements`, `Event` — alleen genoteerd. */
  implementeert: string[];
  gebeurtenissen: string[];
}

// ---------- Expressies ----------

export interface Argument {
  waarde: Expr | null; // null = weggelaten argument
  naam?: string; // benoemd argument `naam:=`
}

export type Expr = Plek &
  (
    | { k: "lit"; w: LiteraalWaarde }
    | { k: "id"; naam: string; typeteken?: string }
    | { k: "me" }
    /** obj.naam — obj null = With-object */
    | { k: "lid"; obj: Expr | null; naam: string }
    /** obj!naam — obj null = With-object */
    | { k: "bang"; obj: Expr | null; naam: string }
    | { k: "aanroep"; doel: Expr; args: Argument[] }
    | { k: "bin"; op: string; l: Expr; r: Expr }
    | { k: "un"; op: "-" | "+" | "not"; e: Expr }
    | { k: "haakjes"; e: Expr }
    | { k: "nieuw"; type: string }
    | { k: "typeof"; e: Expr; type: string }
    | { k: "addressof"; naam: string }
  );

export type LiteraalWaarde =
  | { t: "getal"; v: number; type: "Integer" | "Long" | "Single" | "Double" | "Currency" }
  | { t: "tekst"; v: string }
  | { t: "datum"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "null" }
  | { t: "leeg" }
  | { t: "niets" };

// ---------- Statements ----------

export interface CaseTest {
  soort: "is" | "bereik" | "waarde";
  op?: string;
  van: Expr;
  tot?: Expr;
}

export type Statement = Plek &
  (
    | { k: "label"; naam: string }
    | { k: "dim"; statisch: boolean; variabelen: Variabele[] }
    | { k: "const"; constanten: ConstDef[] }
    | { k: "redim"; behoud: boolean; variabelen: { doel: Expr; grenzen: Grens[]; type?: TypeAanduiding }[] }
    | { k: "erase"; doelen: Expr[] }
    | { k: "let"; doel: Expr; waarde: Expr }
    | { k: "set"; doel: Expr; waarde: Expr }
    | { k: "call"; doel: Expr; args: Argument[]; metCall: boolean }
    | { k: "print"; delen: { e: Expr | null; scheiding: ";" | "," | "" }[] }
    | {
        k: "if";
        takken: { voorwaarde: Expr; body: Statement[] }[];
        anders: Statement[] | null;
      }
    | {
        k: "select";
        test: Expr;
        gevallen: { tests: CaseTest[]; body: Statement[] }[];
        anders: Statement[] | null;
      }
    | {
        k: "for";
        teller: Expr;
        van: Expr;
        tot: Expr;
        stap: Expr | null;
        body: Statement[];
      }
    | { k: "foreach"; teller: Expr; reeks: Expr; body: Statement[] }
    | {
        k: "do";
        voorTest: { soort: "while" | "until"; e: Expr } | null;
        naTest: { soort: "while" | "until"; e: Expr } | null;
        body: Statement[];
      }
    | { k: "with"; obj: Expr; body: Statement[] }
    | { k: "exit"; wat: "sub" | "function" | "property" | "for" | "do" }
    | { k: "goto"; label: string }
    | { k: "gosub"; label: string }
    | { k: "return" }
    | { k: "onerror"; soort: "goto" | "volgende" | "uit"; label?: string }
    | { k: "resume"; soort: "opnieuw" | "volgende" | "label"; label?: string }
    | { k: "error"; nummer: Expr }
    | { k: "end" }
    | { k: "stop" }
    | { k: "raiseevent"; naam: string; args: Argument[] }
    /** Bestands-I/O en andere afgeschermde statements: worden bij uitvoering geweigerd. */
    | { k: "geweigerd"; wat: string }
    /** Wel te parsen, (nog) niet uit te voeren. */
    | { k: "nietondersteund"; wat: string }
  );

/** Statement zonder positie (de parser voegt regel en kolom toe). */
export type KaalStatement = Statement extends infer S ? (S extends unknown ? Omit<S, "regel" | "kolom"> : never) : never;
