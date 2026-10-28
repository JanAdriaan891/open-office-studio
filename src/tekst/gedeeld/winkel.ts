/** Kleine toestand per tekst-editor (sleutel: de `tekst`-functie uit de EditorApi). */
import { useSyncExternalStore } from "react";

export function maakWinkel<T extends object>(begin: T) {
  const staten = new WeakMap<object, T>();
  const luisteraars = new Set<() => void>();
  const lees = (sleutel: object) => staten.get(sleutel) ?? begin;
  return {
    lees,
    zet(sleutel: object, wijziging: Partial<T> | ((oud: T) => Partial<T>)) {
      const oud = lees(sleutel);
      staten.set(sleutel, { ...oud, ...(typeof wijziging === "function" ? wijziging(oud) : wijziging) });
      luisteraars.forEach((l) => l());
    },
    gebruik(sleutel: object) {
      return useSyncExternalStore(
        (l) => {
          luisteraars.add(l);
          return () => {
            luisteraars.delete(l);
          };
        },
        () => lees(sleutel),
        () => lees(sleutel),
      );
    },
  };
}
