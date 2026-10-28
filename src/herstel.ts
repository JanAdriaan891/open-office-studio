import type { Soort } from "./editors";

/**
 * Automatisch herstel na een crash of stroomstoring.
 *
 * Elk venster heeft een eigen sessie. Van elk gewijzigd documenttabblad komt
 * periodiek een herstelkopie in de lokale app-map (desktop, via
 * `src-tauri/src/herstel.rs`) of in IndexedDB (browser). Na normaal opslaan of
 * sluiten verdwijnt de kopie; sluit het venster netjes, dan de hele sessie.
 * Kopieën van sessies die niet meer draaien zijn na een crash "wezen"; het
 * hoofdvenster biedt ze bij de volgende start aan. Herstellen opent altijd
 * een nieuw, niet-opgeslagen tabblad en overschrijft nooit het origineel.
 */
export interface HerstelMeta {
  naam: string;
  soort: Soort;
  exportFormaat: string;
  /** Milliseconden sinds 1970. */
  datum: number;
}

export interface HerstelItem extends HerstelMeta {
  sessie: string;
  sleutel: string;
  grootte: number;
}

export interface HerstelOpslag {
  start(): Promise<void>;
  bewaar(sleutel: string, meta: HerstelMeta, bytes: Uint8Array): Promise<void>;
  verwijder(sessie: string, sleutel: string): Promise<void>;
  /** Kopieën uit sessies die niet meer draaien. */
  wezen(): Promise<HerstelItem[]>;
  lees(item: HerstelItem): Promise<Uint8Array>;
}

export const STANDAARD_INTERVAL_MINUTEN = 5;
/** Instelbaar interval in minuten (1–60), bijv. vanuit een instellingenvenster. */
export const INTERVAL_SLEUTEL = "openaec-office-herstelinterval";
/** Browser: hooguit zoveel bytes aan herstelkopieën. */
export const MAX_BROWSER = 200 * 1024 * 1024;
/** Browser: een sessie zonder hartslag sinds zo lang geldt als gestopt. */
export const HARTSLAG_GRENS = 90_000;
const HARTSLAG_SLEUTEL = "openaec-office-herstel-sessies";

export function herstelInterval(waarde?: string | null): number {
  let tekst = waarde;
  if (tekst === undefined)
    try {
      tekst = localStorage.getItem(INTERVAL_SLEUTEL);
    } catch {
      tekst = null;
    }
  const minuten = Number(tekst);
  const geldig =
    tekst != null && tekst !== "" && Number.isFinite(minuten)
      ? Math.min(60, Math.max(1, minuten))
      : STANDAARD_INTERVAL_MINUTEN;
  return geldig * 60_000;
}

/** Moet dit tabblad nu een (nieuwe) kopie krijgen? */
export function kopieNodig(
  vorige: { versie: string; tijd: number } | undefined,
  versie: string,
  nu: number,
  interval: number,
) {
  if (!vorige) return true;
  return vorige.versie !== versie && nu - vorige.tijd >= interval;
}

export function nieuweSessie() {
  try {
    return crypto.randomUUID().toLowerCase();
  } catch {
    return (
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
    );
  }
}

/**
 * Browser: welke sessies zijn gestopt? Een hartslag van 0 betekent netjes
 * afgesloten (opruimen); geen of een oude hartslag betekent gecrasht (aanbieden).
 */
export function beoordeelSessies(
  sessies: string[],
  hartslagen: Record<string, number>,
  eigen: string,
  nu: number,
) {
  const aanbieden = new Set<string>();
  const opruimen = new Set<string>();
  for (const sessie of new Set(sessies)) {
    if (sessie === eigen) continue;
    const slag = hartslagen[sessie];
    if (slag === 0) opruimen.add(sessie);
    else if (slag === undefined || nu - slag > HARTSLAG_GRENS)
      aanbieden.add(sessie);
  }
  return { aanbieden, opruimen };
}

/* ── Desktop ── */

export function desktopOpslag(sessie: string): HerstelOpslag {
  const core = () => import("@tauri-apps/api/core");
  return {
    async start() {
      const { invoke } = await core();
      await invoke("herstel_start", { sessie });
    },
    async bewaar(sleutel, meta, bytes) {
      const { invoke } = await core();
      await invoke("herstel_bewaar", bytes, {
        headers: {
          "x-office-sessie": sessie,
          "x-office-sleutel": sleutel,
          "x-office-meta": encodeURIComponent(JSON.stringify(meta)),
        },
      });
    },
    async verwijder(s, sleutel) {
      const { invoke } = await core();
      await invoke("herstel_verwijder", { sessie: s, sleutel });
    },
    async wezen() {
      const { invoke } = await core();
      return invoke<HerstelItem[]>("herstel_lijst");
    },
    async lees(item) {
      const { invoke } = await core();
      return new Uint8Array(
        await invoke<ArrayBuffer>("herstel_lees", {
          sessie: item.sessie,
          sleutel: item.sleutel,
        }),
      );
    },
  };
}

/* ── Browser (IndexedDB) ── */

interface Rij extends HerstelItem {
  id: string;
  bytes: Uint8Array;
}

function leesHartslagen(): Record<string, number> {
  try {
    const w = JSON.parse(localStorage.getItem(HARTSLAG_SLEUTEL) ?? "{}");
    return w && typeof w === "object" ? w : {};
  } catch {
    return {};
  }
}

function zetHartslag(sessie: string, waarde: number | null) {
  try {
    const h = leesHartslagen();
    if (waarde === null) delete h[sessie];
    else h[sessie] = waarde;
    localStorage.setItem(HARTSLAG_SLEUTEL, JSON.stringify(h));
  } catch {
    // Zonder localStorage geen hartslag: kopieën gelden dan als gecrasht.
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const verzoek = indexedDB.open("openaec-office-herstel", 1);
    verzoek.onupgradeneeded = () =>
      verzoek.result.createObjectStore("kopieen", { keyPath: "id" });
    verzoek.onsuccess = () => resolve(verzoek.result);
    verzoek.onerror = () => reject(verzoek.error);
  });
}

function wacht<T>(verzoek: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    verzoek.onsuccess = () => resolve(verzoek.result);
    verzoek.onerror = () => reject(verzoek.error);
  });
}

export function browserOpslag(sessie: string): HerstelOpslag {
  let db: Promise<IDBDatabase> | null = null;
  const winkel = async (modus: IDBTransactionMode) => {
    db ??= open();
    return (await db).transaction("kopieen", modus).objectStore("kopieen");
  };
  const alle = async () => wacht((await winkel("readonly")).getAll()) as Promise<Rij[]>;
  return {
    async start() {
      zetHartslag(sessie, Date.now());
      setInterval(() => zetHartslag(sessie, Date.now()), 30_000);
      // Netjes weggaan (de gebruiker koos ervoor): opruimen, ook als dat niet meer lukt.
      window.addEventListener("pagehide", () => {
        zetHartslag(sessie, 0);
        void alle()
          .then(async (rijen) => {
            const w = await winkel("readwrite");
            rijen.filter((r) => r.sessie === sessie).forEach((r) => w.delete(r.id));
          })
          .catch(() => undefined);
      });
      // Terug uit de bfcache: de sessie leeft weer.
      window.addEventListener("pageshow", (e) => {
        if (e.persisted) zetHartslag(sessie, Date.now());
      });
    },
    async bewaar(sleutel, meta, bytes) {
      const id = `${sessie}/${sleutel}`;
      const overig = (await alle())
        .filter((r) => r.id !== id)
        .reduce((som, r) => som + r.grootte, 0);
      if (overig + bytes.byteLength > MAX_BROWSER)
        throw new Error(
          "De ruimte voor herstelkopieën in deze browser is vol. Sla je documenten op.",
        );
      const rij: Rij = {
        id,
        sessie,
        sleutel,
        ...meta,
        grootte: bytes.byteLength,
        bytes,
      };
      await wacht((await winkel("readwrite")).put(rij));
    },
    async verwijder(s, sleutel) {
      await wacht((await winkel("readwrite")).delete(`${s}/${sleutel}`));
    },
    async wezen() {
      const rijen = await alle();
      const hartslagen = leesHartslagen();
      const { aanbieden, opruimen } = beoordeelSessies(
        rijen.map((r) => r.sessie),
        hartslagen,
        sessie,
        Date.now(),
      );
      // Hartslagen van sessies zonder kopieën die niet meer draaien, vervallen.
      const metRijen = new Set(rijen.map((r) => r.sessie));
      for (const [s, slag] of Object.entries(hartslagen))
        if (
          s !== sessie &&
          !metRijen.has(s) &&
          (slag === 0 || Date.now() - slag > HARTSLAG_GRENS)
        )
          zetHartslag(s, null);
      if (opruimen.size) {
        const w = await winkel("readwrite");
        rijen.filter((r) => opruimen.has(r.sessie)).forEach((r) => w.delete(r.id));
        opruimen.forEach((s) => zetHartslag(s, null));
      }
      return rijen
        .filter((r) => aanbieden.has(r.sessie))
        .map(({ bytes: _bytes, id: _id, ...item }) => item)
        .sort((a, b) => b.datum - a.datum);
    },
    async lees(item) {
      const rij = (await wacht(
        (await winkel("readonly")).get(`${item.sessie}/${item.sleutel}`),
      )) as Rij | undefined;
      if (!rij) throw new Error("Deze herstelkopie bestaat niet meer.");
      return rij.bytes;
    },
  };
}
