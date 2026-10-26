/** Documentzoom los van de browserzoom: 1 is 100%. */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;
export const ZOOM_STAP = 0.1;
const OPSLAG = "office-documentzoom";
const MAX_ONTHOUDEN = 50;

export function begrens(zoom: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 1000) / 1000));
}

/** Volgende vaste stap op het raster van 10%, ook vanaf een tussenwaarde. */
export function stap(zoom: number, richting: 1 | -1) {
  const raster = Math.round(zoom / ZOOM_STAP);
  const opRaster = Math.abs(zoom - raster * ZOOM_STAP) < 0.001;
  const volgende = opRaster
    ? raster + richting
    : richting > 0
      ? Math.ceil(zoom / ZOOM_STAP)
      : Math.floor(zoom / ZOOM_STAP);
  return begrens(volgende * ZOOM_STAP);
}

/**
 * Een muiswiel geeft grote, gelijke stappen; een touchpad (knijpen geeft in
 * Chromium ook `ctrlKey`) kleine pixeldelta’s die vloeiend moeten zoomen.
 */
export function wielZoom(
  zoom: number,
  wiel: { deltaY: number; deltaMode: number },
) {
  if (!wiel.deltaY) return zoom;
  if (wiel.deltaMode === 0 && Math.abs(wiel.deltaY) < 50)
    return begrens(zoom * Math.exp(-wiel.deltaY / 100));
  return stap(zoom, wiel.deltaY < 0 ? 1 : -1);
}

/** Ctrl + 0, Ctrl + = en Ctrl + − naar documentzoom; null voor andere toetsen. */
export function toetsZoom(
  zoom: number,
  toets: { key: string; code: string },
): number | null {
  if (toets.key === "0" || toets.code === "Numpad0") return 1;
  if (["=", "+"].includes(toets.key) || toets.code === "NumpadAdd")
    return stap(zoom, 1);
  if (["-", "_"].includes(toets.key) || toets.code === "NumpadSubtract")
    return stap(zoom, -1);
  return null;
}

/** Scrollpositie waarbij het punt onder de muis na het zoomen op zijn plek blijft. */
export function ankerScroll(
  scroll: number,
  muis: number,
  oud: number,
  nieuw: number,
) {
  return Math.max(0, ((scroll + muis) * nieuw) / oud - muis);
}

function lijst(): [string, number][] {
  try {
    const waarde = JSON.parse(localStorage.getItem(OPSLAG) ?? "[]");
    return Array.isArray(waarde) ? waarde : [];
  } catch {
    return [];
  }
}

export function leesZoom(sleutel: string): number | null {
  const gevonden = lijst().find(([naam]) => naam === sleutel)?.[1];
  return typeof gevonden === "number" && Number.isFinite(gevonden)
    ? begrens(gevonden)
    : null;
}

export function bewaarZoom(sleutel: string, zoom: number) {
  try {
    const rest = lijst().filter(([naam]) => naam !== sleutel);
    localStorage.setItem(
      OPSLAG,
      JSON.stringify(
        [[sleutel, begrens(zoom)], ...rest].slice(0, MAX_ONTHOUDEN),
      ),
    );
  } catch {
    // Zonder browseropslag blijft zoomen werken, alleen niet onthouden.
  }
}
