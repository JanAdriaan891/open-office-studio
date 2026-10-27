import { useEffect, useRef } from "react";

/**
 * Bestanden die het besturingssysteem meegeeft: een dubbelklik in Verkenner,
 * "Openen met" of een tweede start terwijl de app al draait. Rust
 * (`src-tauri/src/systeembestanden.rs`) bewaart de paden en biedt ze met een
 * eenmalig nummer aan het doelvenster aan (het hoofdvenster, of het laatst
 * actieve venster als dat gesloten is). Dit venster haalt de lijst op bij het
 * laden en na elke gebeurtenis `office-systeembestanden`, en opent de
 * bestanden één voor één.
 */
export interface Aangeboden {
  id: number;
  naam: string;
}

export type OpenSysteembestand = (
  naam: string,
  lees: () => Promise<Uint8Array>,
) => Promise<void>;

/** Verwerkt aangeboden bestanden op volgorde; elk nummer hooguit één keer. */
export function maakWachtrij(verwerk: (bestand: Aangeboden) => Promise<void>) {
  const gezien = new Set<number>();
  let keten = Promise.resolve();
  return (lijst: Aangeboden[]) => {
    for (const bestand of lijst) {
      if (gezien.has(bestand.id)) continue;
      gezien.add(bestand.id);
      keten = keten.then(() => verwerk(bestand)).catch(() => undefined);
    }
    return keten;
  };
}

const tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
// Eén wachtrij per venster, ook als React in de ontwikkelstand dubbel mount.
let verwerker: OpenSysteembestand | null = null;
let gestart = false;

async function start() {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const voegToe = maakWachtrij(async ({ id, naam }) => {
    await verwerker?.(
      naam,
      async () =>
        new Uint8Array(
          await invoke<ArrayBuffer>("lees_systeembestand", { id }),
        ),
    );
  });
  const haal = () =>
    invoke<Aangeboden[]>("systeembestanden")
      .then(voegToe)
      .catch(() => undefined);
  await listen("office-systeembestanden", () => void haal());
  await haal();
}

/** Opent bestanden van het besturingssysteem met `open` (alleen in de desktopapp). */
export function useSysteembestanden(open: OpenSysteembestand) {
  const recent = useRef(open);
  recent.current = open;
  useEffect(() => {
    verwerker = (naam, lees) => recent.current(naam, lees);
    if (!tauri || gestart) return;
    gestart = true;
    void start().catch(() => undefined);
  }, []);
}
