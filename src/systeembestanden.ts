import { useEffect, useRef } from "react";
import type { Werkbestand } from "./werkbestand";

/**
 * Bestanden die het besturingssysteem meegeeft: een dubbelklik in Verkenner,
 * "Openen met" of een tweede start terwijl de app al draait. Rust
 * (`src-tauri/src/systeembestanden.rs`) bewaart de paden en biedt ze met een
 * eenmalig nummer aan het doelvenster aan (het hoofdvenster, of het laatst
 * actieve venster als dat gesloten is). Dit venster haalt de lijst op bij het
 * laden en na elke gebeurtenis `office-systeembestanden`, en opent de
 * bestanden één voor één. Dezelfde route geldt voor de eigen bestandskiezer,
 * recente bestanden en bestanden die op het venster worden gesleept.
 *
 * Elk nummer wordt eenmaal geclaimd (`claim_systeembestand`). Staat het
 * bestand al open, dan komt dat tabblad naar voren (ook in een ander venster);
 * anders krijgt het een pad-token waarmee Ctrl+S later terugschrijft.
 */
export interface Aangeboden {
  id: number;
  naam: string;
}

/**
 * Opent een bestand; geeft waar terug als een tabblad nu het werkbestand
 * vasthoudt. Anders vervalt het token weer.
 */
export type OpenSysteembestand = (
  naam: string,
  lees: () => Promise<Uint8Array>,
  werkbestand: Werkbestand | null,
) => Promise<boolean>;

/** Activeert het tabblad met dit pad-token in dit venster. */
export type ActiveerWerkbestand = (token: string) => void;

type Claim =
  | { status: "nieuw"; token: string; naam: string }
  | { status: "geopend"; token: string }
  | { status: "elders" };

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
let activeerder: ActiveerWerkbestand | null = null;
let gestart = false;

async function start() {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const voegToe = maakWachtrij(async ({ id }) => {
    const claim = await invoke<Claim>("claim_systeembestand", { id });
    if (claim.status === "geopend") activeerder?.(claim.token);
    if (claim.status !== "nieuw") return;
    const { token, naam } = claim;
    let gehouden = false;
    try {
      gehouden =
        (await verwerker?.(
          naam,
          async () =>
            new Uint8Array(
              await invoke<ArrayBuffer>("lees_werkbestand", { token }),
            ),
          { token, naam },
        )) ?? false;
    } finally {
      if (!gehouden)
        await invoke("vergeet_werkbestand", { token }).catch(() => undefined);
    }
  });
  const haal = () =>
    invoke<Aangeboden[]>("systeembestanden")
      .then(voegToe)
      .catch(() => undefined);
  await listen("office-systeembestanden", () => void haal());
  await listen<string>("office-activeer-werkbestand", (e) =>
    activeerder?.(e.payload),
  );
  await haal();
}

/** Opent bestanden van het besturingssysteem met `open` (alleen in de desktopapp). */
export function useSysteembestanden(
  open: OpenSysteembestand,
  activeer: ActiveerWerkbestand,
) {
  const recent = useRef({ open, activeer });
  recent.current = { open, activeer };
  useEffect(() => {
    verwerker = (naam, lees, werkbestand) =>
      recent.current.open(naam, lees, werkbestand);
    activeerder = (token) => recent.current.activeer(token);
    if (!tauri || gestart) return;
    gestart = true;
    void start().catch(() => undefined);
  }, []);
}
