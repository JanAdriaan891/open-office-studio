/**
 * Bewaart bytes als bestand: in Office Studio desktop via de opslagdialoog
 * (geeft het pad, of null bij annuleren), anders als download (geeft "").
 * Zonder zware afhankelijkheden, zodat ook Database Studio dit kan gebruiken.
 */
export async function bewaarBytes(
  uitvoer: Uint8Array,
  bestandsnaam: string,
  mime: string,
  opties: { terugvalDownload?: boolean } = {},
): Promise<string | null> {
  if ("__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const pad = await invoke<string | null>("bewaar_kopie", uitvoer, {
        headers: { "x-office-naam": encodeURIComponent(bestandsnaam) },
      });
      return pad || null;
    } catch (fout) {
      if (!opties.terugvalDownload) throw fout;
    }
  }
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(uitvoer)], { type: mime }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = bestandsnaam;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "";
}
