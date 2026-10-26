/**
 * Eén vorm voor alle werkkopieën in de interface: opgebouwd uit een
 * MDB/ACCDB, nieuw en leeg, of heropend uit `.sqlite`. Alle drie lopen via
 * `WerkkopieClient` (databaseworker) met dezelfde tijdslimieten, annuleren en
 * MessagePort voor de VBA-runtime.
 */
import type { Werkkopie } from "../werkkopie/contract.ts";
import type { OpbouwRapport } from "../werkkopie/opbouw.ts";

export interface BedienbareWerkkopie extends Werkkopie {
  /** Opbouwrapport (null bij een nieuwe database). */
  readonly rapport: OpbouwRapport | null;
  /** Nieuwe MessagePort voor de VBA-worker. */
  poort(): Promise<MessagePort>;
  /** Stopt de worker direct. */
  annuleer(reden?: string): void;
}

export type Herkomst = "access" | "nieuw" | "sqlite" | "voorbeeld";

export interface WerkkopieSessie {
  werkkopie: BedienbareWerkkopie;
  herkomst: Herkomst;
  /** Weergavenaam (bestandsnaam of “Nieuwe database”). */
  naam: string;
}
