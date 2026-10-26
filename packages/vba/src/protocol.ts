/**
 * Berichtprotocol tussen VbaClient (hoofdthread) en de VBA-worker. Verzoeken
 * van de client en verzoeken van de worker aan de host hebben elk hun eigen
 * reeks id’s. Alle berichten zijn structureel kloonbaar.
 */
import type { Bevinding } from "./afscherming.ts";
import type { FormulierDoel, HostGebeurtenis, HostWaarde, InputBoxVerzoek, MsgBoxVerzoek } from "./host.ts";
import type { ModuleBron } from "./interpreter.ts";

export interface WorkerOpties {
  stappenlimiet?: number;
  landinstelling?: "nl" | "en-us";
  /** Welke hostfuncties de client aanbiedt; de rest geeft in de worker een duidelijke melding. */
  host: { msgBox: boolean; inputBox: boolean; gebeurtenis: boolean; formulieren: boolean };
}

export interface ProcedureInfo {
  module: string;
  soort: ModuleBron["soort"];
  naam: string;
  type: "sub" | "function";
  publiek: boolean;
  parameters: { naam: string; optioneel: boolean; type: string }[];
  zonderVerplichteParameters: boolean;
  /** Gebeurtenisprocedure van een formulier/rapport (Form_Load, cmdOk_Click …). */
  gebeurtenis: boolean;
}

export interface VbaFoutInfo {
  soort: "runtime" | "afbreking" | "parseer" | "intern";
  /** VBA-foutnummer (Err.Number) bij een runtimefout. */
  nummer?: number;
  beschrijving: string;
  /** Bij een afbreking: stappenlimiet, geannuleerd, afgeschermd, niet-ondersteund, tijdslimiet, gestopt … */
  reden?: string;
  module?: string;
  procedure?: string;
  regel?: number;
  kolom?: number;
}

export interface LaadResultaat {
  /** Syntaxisfouten per module (die modules kunnen niet worden uitgevoerd). */
  fouten: VbaFoutInfo[];
  /** Statisch gevonden afgeschermde constructies. */
  afscherming: Bevinding[];
  procedures: ProcedureInfo[];
}

export type VoerUitResultaat =
  | { ok: true; resultaat: HostWaarde; argumenten: HostWaarde[]; uitvoer: string[]; stappen: number }
  | { ok: false; fout: VbaFoutInfo; uitvoer: string[] };

export type HostVerzoek =
  | { soort: "msgBox"; verzoek: MsgBoxVerzoek }
  | { soort: "inputBox"; verzoek: InputBoxVerzoek }
  | { soort: "gebeurtenis"; gebeurtenis: HostGebeurtenis }
  | { soort: "formulier"; actie: "isGeopend"; doel: FormulierDoel }
  | { soort: "formulier"; actie: "lees"; doel: FormulierDoel; eigenschap: string; args: HostWaarde[] }
  | { soort: "formulier"; actie: "zet"; doel: FormulierDoel; eigenschap: string; waarde: HostWaarde }
  | { soort: "formulier"; actie: "roepAan"; doel: FormulierDoel; methode: string; args: HostWaarde[] }
  | { soort: "formulier"; actie: "heeftBesturing"; doel: FormulierDoel; naam: string };

export type NaarWorker =
  | { soort: "start"; id: number; opties: WorkerOpties; metWerkkopie: boolean }
  | { soort: "laad"; id: number; modules: ModuleBron[] }
  | { soort: "procedures"; id: number }
  | { soort: "voerUit"; id: number; module: string; procedure: string; argumenten: HostWaarde[] }
  | { soort: "hostAntwoord"; id: number; ok: true; waarde: HostWaarde | null }
  | { soort: "hostAntwoord"; id: number; ok: false; melding: string };

export type VanWorker =
  | { soort: "antwoord"; id: number; ok: true; resultaat: unknown }
  | { soort: "antwoord"; id: number; ok: false; fout: VbaFoutInfo }
  | { soort: "hostVerzoek"; id: number; verzoek: HostVerzoek }
  | { soort: "debug"; tekst: string };
