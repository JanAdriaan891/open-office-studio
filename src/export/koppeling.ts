import type { Soort } from "../editors";

/**
 * Wat Opslaan als van de geopende editor nodig heeft voor exports die de
 * live weergave gebruiken: het actieve blad, de huidige dia en afdrukken.
 */
export interface EditorKoppeling {
  soort: Soort;
  /** Opent het afdrukvenster van de editor (in de browser: Opslaan als PDF). */
  afdrukken?: () => Promise<void> | void;
  bladen?: () => { namen: string[]; actief: number };
  dias?: () => { aantal: number; huidig: number };
  /** PNG van één dia (0-gebaseerd) via dezelfde tekenroutine als de editor. */
  diaPng?: (index: number, schaal?: number) => Promise<Uint8Array>;
}

let huidig: EditorKoppeling | null = null;

export function registreerKoppeling(koppeling: EditorKoppeling) {
  huidig = koppeling;
  return () => {
    if (huidig === koppeling) huidig = null;
  };
}

export const editorKoppeling = (soort: Soort) =>
  huidig?.soort === soort ? huidig : null;
