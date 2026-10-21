import catalogus from "./formaten.json";
import type { Soort } from "./editors";

export const bestandstypen = catalogus;
export const invoerformaten = Object.values(catalogus)
  .flatMap((module) => module.invoer)
  .map((ext) => `.${ext}`)
  .join(",");
export function bestandssoort(extensie: string): Soort | null {
  return (
    (Object.entries(catalogus).find(([, module]) =>
      module.invoer.includes(extensie),
    )?.[0] as Soort | undefined) ?? null
  );
}
export async function converteer(
  bytes: Uint8Array,
  van: string,
  naar: string,
  soort: Soort,
): Promise<Uint8Array> {
  if (!("__TAURI_INTERNALS__" in window))
    throw new Error(
      "Dit formaat vereist de desktopversie met een lokaal geïnstalleerde LibreOffice-runtime.",
    );
  const { invoke } = await import("@tauri-apps/api/core");
  const resultaat = await invoke<ArrayBuffer>("converteer_document", bytes, {
    headers: {
      "x-office-bron": van,
      "x-office-doel": naar,
      "x-office-module": soort,
    },
  });
  return new Uint8Array(resultaat);
}
