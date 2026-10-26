/**
 * Contract van de werkkopie: een SQLite-database (sql.js) die bij het openen
 * uit een MDB/ACCDB wordt opgebouwd. Het origineel wordt nooit gewijzigd.
 * Query’s, tabelbewerking, formulieren, rapporten en de VBA-runtime werken
 * uitsluitend via dit contract, zodat de opslag vervangbaar blijft.
 */

/** Celwaarde in de werkkopie. Datums zijn ISO-tekst: `2026-10-26` of `2026-10-26T14:30:00`. */
export type Waarde = null | number | string | boolean | Uint8Array;

export type Veldsoort =
  | "tekst"
  | "memo"
  | "geheel"
  | "getal"
  | "valuta"
  | "datum"
  | "jaNee"
  | "autonummer"
  | "binair"
  | "guid";

export interface VeldSchema {
  naam: string;
  soort: Veldsoort;
  /** Maximale lengte voor tekst. */
  lengte?: number;
  verplicht?: boolean;
  primair?: boolean;
  standaard?: Waarde;
}

export interface TabelSchema {
  naam: string;
  velden: VeldSchema[];
  /** Aantal rijen bij het laatste lezen. */
  aantal: number;
  /** Uit Access overgenomen of in de werkkopie gemaakt. */
  herkomst: "access" | "werkkopie";
}

export interface RelatieSchema {
  naam: string;
  tabel: string;
  velden: string[];
  naarTabel: string;
  naarVelden: string[];
  /** Referentiële integriteit afdwingen (als FOREIGN KEY in SQLite). */
  integriteit: boolean;
}

export interface OpgeslagenQuery {
  naam: string;
  /** SQL zoals Access hem opsloeg (Access-dialect). */
  sql: string;
  soort:
    | "select"
    | "crosstab"
    | "delete"
    | "update"
    | "append"
    | "maketable"
    | "ddl"
    | "union"
    | "passthrough";
}

export interface QueryResultaat {
  kolommen: string[];
  rijen: Waarde[][];
  /** Aantal gewijzigde rijen bij een actiequery. */
  gewijzigd: number;
  /** Afgekapt op `limiet` rijen. */
  afgekapt: boolean;
  /** De SQLite-SQL die werkelijk is uitgevoerd, voor diagnose. */
  uitgevoerd: string;
}

export interface QueryOpties {
  /** Standaard "access": vertalen naar SQLite. */
  dialect?: "access" | "sqlite";
  /** Benoemde of positionele parameters (`[Naam]` of `?`). */
  parameters?: Record<string, Waarde> | Waarde[];
  /** Maximaal aantal teruggegeven rijen, standaard 10.000. */
  limiet?: number;
}

/** Een rij met zijn stabiele SQLite-rowid voor bewerken. */
export interface Rij {
  rowid: number;
  waarden: Record<string, Waarde>;
}

export interface RijenVerzoek {
  start?: number;
  aantal?: number;
  /** Eenvoudig zoeken in alle tekstvelden. */
  zoek?: string;
  sorteer?: { veld: string; aflopend?: boolean };
}

/** Formulier- of rapportdefinitie, opgeslagen in de werkkopie zelf. */
export interface Ontwerp {
  naam: string;
  soort: "formulier" | "rapport";
  /** Tabel- of querynaam, of Access-SQL. */
  bron: string;
  /** JSON-definitie; de vorm wordt door de formulier- en rapportmodule bepaald. */
  definitie: unknown;
}

export interface Werkkopie {
  /** Bestandsnaam van het origineel en SHA-256 van de bronbytes. */
  readonly bron: { naam: string; sha256: string };
  tabellen(): Promise<TabelSchema[]>;
  relaties(): Promise<RelatieSchema[]>;
  querys(): Promise<OpgeslagenQuery[]>;
  /** Voert een SELECT- of actiequery uit; een opgeslagen query is op naam aan te roepen. */
  query(sql: string, opties?: QueryOpties): Promise<QueryResultaat>;
  /** Voert een opgeslagen query uit op naam. */
  voerQueryUit(
    naam: string,
    parameters?: Record<string, Waarde>,
  ): Promise<QueryResultaat>;
  /** Parameters die een opgeslagen of losse query nodig heeft. */
  parametersVan(sqlOfNaam: string): Promise<string[]>;
  rijen(tabel: string, verzoek?: RijenVerzoek): Promise<{
    rijen: Rij[];
    totaal: number;
  }>;
  /** Geeft de rowid van de nieuwe rij. */
  voegToe(tabel: string, waarden: Record<string, Waarde>): Promise<number>;
  wijzig(
    tabel: string,
    rowid: number,
    waarden: Record<string, Waarde>,
  ): Promise<void>;
  verwijder(tabel: string, rowid: number): Promise<void>;
  maakTabel(schema: Omit<TabelSchema, "aantal" | "herkomst">): Promise<void>;
  verwijderTabel(naam: string): Promise<void>;
  ontwerpen(): Promise<Ontwerp[]>;
  bewaarOntwerp(ontwerp: Ontwerp): Promise<void>;
  verwijderOntwerp(soort: Ontwerp["soort"], naam: string): Promise<void>;
  /** Ongedaan maken is niet nodig: de werkkopie kan opnieuw uit het origineel worden opgebouwd. */
  gewijzigd(): Promise<boolean>;
  /** SQLite-bestand van de werkkopie. */
  exporteer(): Promise<Uint8Array>;
  sluit(): Promise<void>;
}

/**
 * Fouten met een vaste code, zodat de interface en de VBA-runtime ze
 * herkenbaar kunnen tonen (VBA: `Err.Number` / `Err.Description`).
 */
export type WerkkopieFoutcode =
  | "syntaxis"
  | "niet-ondersteund"
  | "onbekend-object"
  | "beperking"
  | "parameter-ontbreekt"
  | "alleen-lezen"
  | "intern";

export class WerkkopieFout extends Error {
  constructor(
    readonly code: WerkkopieFoutcode,
    melding: string,
  ) {
    super(melding);
    this.name = "WerkkopieFout";
  }
}
