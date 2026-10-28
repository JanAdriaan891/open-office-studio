/**
 * Open/dicht-toestand van het zoekvenster en Ga naar, per tekst-editor (de
 * sleutel is de `tekst`-functie uit de EditorApi van die editor). Zo kunnen
 * lintknoppen, sneltoetsen en het deelvenster elkaar vinden zonder props.
 */
import { useSyncExternalStore } from "react";

export interface PaneelStaat {
  zoeken: false | "zoeken" | "vervangen";
  gaNaar: boolean;
  /** Telt op bij elk openverzoek, zodat het veld opnieuw de focus krijgt. */
  verzoek: number;
}
const LEEG: PaneelStaat = { zoeken: false, gaNaar: false, verzoek: 0 };
const staten = new WeakMap<object, PaneelStaat>();
const luisteraars = new Set<() => void>();

export function paneelStaat(sleutel: object) {
  return staten.get(sleutel) ?? LEEG;
}
export function zetPaneel(sleutel: object, wijziging: Partial<PaneelStaat>) {
  const oud = paneelStaat(sleutel);
  staten.set(sleutel, { ...oud, ...wijziging, verzoek: oud.verzoek + 1 });
  luisteraars.forEach((l) => l());
}
export function usePaneelStaat(sleutel: object) {
  return useSyncExternalStore(
    (l) => {
      luisteraars.add(l);
      return () => {
        luisteraars.delete(l);
      };
    },
    () => paneelStaat(sleutel),
    () => paneelStaat(sleutel),
  );
}
