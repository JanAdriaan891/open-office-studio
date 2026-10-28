/**
 * Wat het afdrukvoorbeeld van een module nodig heeft. Alleen typen en kleine
 * hulpfuncties: de engines worden pas geladen als er pagina's gemaakt worden.
 */
import type { AfdrukDocument, Stand } from "./model";
import type { BladAfdrukInstellingen } from "./rekenbladInstellingen";
import type { RekenbladKeuze } from "./bronRekenblad";
import type { PresentatieInstellingen } from "./indeling";
import type { Indeling } from "./rekenbladIndeling";

export interface TekstBron {
  soort: "docx";
  titel: string;
  maak: () => Promise<AfdrukDocument>;
}

export interface RekenbladBron {
  soort: "xlsx";
  titel: string;
  bladen: string[];
  actief: number;
  /** De huidige selectie als A1-bereik, of null. */
  selectie: string | null;
  leesInstellingen: () => Promise<BladAfdrukInstellingen[]>;
  maak: (keuze: RekenbladKeuze) => Promise<AfdrukDocument>;
  /** Indeling van één blad voor het pagina-eindevoorbeeld. */
  indeling: (
    blad: number,
    keuze: RekenbladKeuze,
  ) => Promise<{
    kolomBreedtes: number[];
    rijHoogtes: number[];
    eersteRij: number;
    eersteKolom: number;
    verdeling: Indeling;
  } | null>;
  /** Schrijft de pagina-indeling in de werkmap; de editor laadt daarna opnieuw. */
  bewaarInstellingen?: (
    wijzigingen: Map<number, BladAfdrukInstellingen>,
  ) => Promise<void>;
}

export interface PresentatieBron {
  soort: "pptx";
  titel: string;
  maak: (instellingen: PresentatieInstellingen) => Promise<AfdrukDocument>;
}

export interface RapportBron {
  soort: "rapport";
  titel: string;
  stand: Stand;
  maak: (stand: Stand) => Promise<AfdrukDocument>;
}

export type AfdrukBron = TekstBron | RekenbladBron | PresentatieBron | RapportBron;
