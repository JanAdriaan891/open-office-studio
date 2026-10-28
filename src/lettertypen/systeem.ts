/**
 * Systeemlettertypen (#22): in de desktopapp via Rust (fontdb), in de browser
 * via `queryLocalFonts` waar de browser dat aanbiedt (met toestemming van de
 * gebruiker). Zonder toegang blijft alleen de meegeleverde set over.
 */
import * as fonts from "@betteroffice/fonts";

const desktop = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface LokaalLettertype {
  family: string;
  fullName: string;
  style: string;
  blob: () => Promise<Blob>;
}
type MetLokaleLettertypen = Window & {
  queryLocalFonts?: () => Promise<LokaalLettertype[]>;
};

let lijst: string[] | null = null;
let laden: Promise<string[]> | null = null;
let lokaal: LokaalLettertype[] | null = null;
const luisteraars = new Set<() => void>();

/** Meegeleverde families (public/fonts). */
export const gebundeldeFamilies = () => [
  ...new Set(fonts.BUNDLED_FONTS.filter((f) => !f.script).map((f) => f.family)),
];

/** Systeemlettertypen die nu bekend zijn (leeg zolang nog niet geladen). */
export const bekendeSysteemLettertypen = () => lijst ?? [];

const kleineLetters = () => new Set((lijst ?? []).map((n) => n.toLowerCase()));
let cacheSet: Set<string> | null = null;
/** Staat dit lettertype op deze computer (voor zover bekend)? */
export function opSysteem(familie: string) {
  if (!lijst) return false;
  cacheSet ??= kleineLetters();
  return cacheSet.has(familie.toLowerCase());
}

export function bijWijziging(f: () => void) {
  luisteraars.add(f);
  return () => {
    luisteraars.delete(f);
  };
}

function zet(nieuw: string[]) {
  lijst = nieuw;
  cacheSet = null;
  luisteraars.forEach((f) => f());
  return nieuw;
}

/**
 * Laadt de lijst met systeemlettertypen. In de browser vraagt dit om
 * toestemming; roep het daar alleen aan na een handeling van de gebruiker
 * (`vraagToestemming`), anders wordt alleen een eerder gegeven toestemming
 * gebruikt.
 */
export function laadSysteemLettertypen(vraagToestemming = false): Promise<string[]> {
  if (lijst) return Promise.resolve(lijst);
  if (laden) return laden;
  laden = (async () => {
    try {
      if (desktop()) {
        const { invoke } = await import("@tauri-apps/api/core");
        return zet(await invoke<string[]>("systeemlettertypen"));
      }
      const w = window as MetLokaleLettertypen;
      if (!w.queryLocalFonts) return zet([]);
      if (!vraagToestemming) {
        const status = await navigator.permissions
          ?.query({ name: "local-fonts" as PermissionName })
          .catch(() => null);
        if (status?.state !== "granted") return [];
      }
      lokaal = await w.queryLocalFonts();
      return zet([...new Set(lokaal.map((f) => f.family))].sort((a, b) => a.localeCompare(b)));
    } catch {
      return [];
    } finally {
      laden = null;
    }
  })();
  return laden;
}

/** Of de browser systeemlettertypen kan aanbieden (en ze nog niet geladen zijn). */
export const kanToestemmingVragen = () =>
  !desktop() && !lijst?.length && typeof (window as MetLokaleLettertypen).queryLocalFonts === "function";

const bytesCache = new Map<string, Promise<ArrayBuffer | null>>();

/** De bytes van een systeemlettertype, of null als het er niet (los) is. */
export function systeemLettertypeBytes(
  familie: string,
  vet: boolean,
  cursief: boolean,
): Promise<ArrayBuffer | null> {
  const sleutel = `${familie.toLowerCase()}|${vet ? 1 : 0}|${cursief ? 1 : 0}`;
  let bestaand = bytesCache.get(sleutel);
  if (bestaand) return bestaand;
  bestaand = (async () => {
    try {
      if (desktop()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const r = await invoke<ArrayBuffer>("systeemlettertype", { familie, vet, cursief });
        return r instanceof ArrayBuffer ? r : new Uint8Array(r as unknown as number[]).buffer;
      }
      const kandidaten = (lokaal ?? []).filter(
        (f) => f.family.toLowerCase() === familie.toLowerCase(),
      );
      if (!kandidaten.length) return null;
      const stijl = (f: LokaalLettertype) => {
        const s = f.style.toLowerCase();
        return (/bold|black|heavy|semibold/.test(s) ? 2 : 0) + (/italic|oblique/.test(s) ? 1 : 0);
      };
      const gewenst = (vet ? 2 : 0) + (cursief ? 1 : 0);
      const keuze =
        kandidaten.find((f) => stijl(f) === gewenst) ??
        kandidaten.find((f) => stijl(f) === 0) ??
        kandidaten[0];
      const blob = await keuze.blob();
      const kop = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      // Alleen losse TrueType/OpenType; geen verzamelingen (ttcf).
      if (String.fromCharCode(...kop) === "ttcf") return null;
      return blob.arrayBuffer();
    } catch {
      return null;
    }
  })();
  bytesCache.set(sleutel, bestaand);
  return bestaand;
}
