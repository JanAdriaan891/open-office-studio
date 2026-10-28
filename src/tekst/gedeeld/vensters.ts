/**
 * Welk venster van de Word-functies (tabel, afbeelding) open staat, per
 * tekst-editor. Het venster hangt in een host die altijd gemonteerd is
 * (src/tekst/WordVensters.tsx), zodat het ook vanuit het rechtermuismenu of
 * een ander linttabblad kan worden geopend.
 */
import { useSyncExternalStore } from "react";

export type VensterId =
  | "tabel.rij"
  | "tabel.marges"
  | "tabel.sorteren"
  | "tabel.naarTekst"
  | "tabel.tekstNaarTabel"
  | "afbeelding.bijsnijden"
  | "afbeelding.alt"
  | "afbeelding.positie";

export interface OpenVenster {
  id: VensterId;
  /** Extra gegevens, zoals de alinea's voor ‘Tekst naar tabel’. */
  gegevens?: unknown;
}

const staten = new WeakMap<object, OpenVenster | null>();
const luisteraars = new Set<() => void>();

export function openVenster(sleutel: object, id: VensterId, gegevens?: unknown) {
  staten.set(sleutel, { id, gegevens });
  luisteraars.forEach((l) => l());
}
export function sluitVenster(sleutel: object) {
  staten.set(sleutel, null);
  luisteraars.forEach((l) => l());
}
export function useOpenVenster(sleutel: object) {
  const lees = () => staten.get(sleutel) ?? null;
  return useSyncExternalStore(
    (l) => {
      luisteraars.add(l);
      return () => {
        luisteraars.delete(l);
      };
    },
    lees,
    lees,
  );
}
