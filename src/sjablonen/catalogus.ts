/**
 * Sjablonen (#27): de meegeleverde galerij (public/sjablonen, gemaakt met
 * scripts/maak-sjablonen-galerij.py) en "Mijn sjablonen" (eigen sjablonen,
 * lokaal bewaard in IndexedDB van deze browser of deze desktopapp).
 */
import type { Soort } from "../editors";

export interface GalerijSjabloon {
  id: string;
  soort: Soort;
  naam: Record<string, string>;
  omschrijving: Record<string, string>;
  miniatuur: boolean;
}

export interface Catalogus {
  versie: number;
  talen: string[];
  sjablonen: GalerijSjabloon[];
}

const basis = () => `${import.meta.env.BASE_URL}sjablonen/`;

/** Taal van de sjablonen: de interfacetaal als die er is, anders Engels. */
export function sjabloonTaal(taal: string, talen: string[]) {
  const kort = taal.toLowerCase().split("-")[0];
  return talen.includes(taal) ? taal : talen.includes(kort) ? kort : "en";
}

let geladen: Promise<Catalogus> | null = null;
export function laadCatalogus(): Promise<Catalogus> {
  geladen ??= fetch(`${basis()}index.json`).then((r) => {
    if (!r.ok) throw new Error(`index.json: ${r.status}`);
    return r.json() as Promise<Catalogus>;
  });
  geladen.catch(() => (geladen = null));
  return geladen;
}

export const sjabloonUrl = (s: GalerijSjabloon, taal: string) => `${basis()}${taal}/${s.id}.${s.soort}`;
export const miniatuurUrl = (s: GalerijSjabloon, taal: string) =>
  s.miniatuur ? `${basis()}miniaturen/${s.id}-${taal}.png` : null;

export async function haalSjabloon(s: GalerijSjabloon, taal: string) {
  const r = await fetch(sjabloonUrl(s, taal));
  if (!r.ok) throw new Error(`${s.id}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// ------------------------------------------------------------- Mijn sjablonen

export interface EigenSjabloon {
  id: string;
  naam: string;
  soort: Soort;
  /** Tijdstip van bewaren (ms). */
  datum: number;
  bytes: Uint8Array;
}

const DB = "open-office-studio-sjablonen";
const WINKEL = "sjablonen";

function open(): Promise<IDBDatabase> {
  return new Promise((ok, fout) => {
    if (typeof indexedDB === "undefined") return fout(new Error("IndexedDB ontbreekt"));
    const verzoek = indexedDB.open(DB, 1);
    verzoek.onupgradeneeded = () => verzoek.result.createObjectStore(WINKEL, { keyPath: "id" });
    verzoek.onsuccess = () => ok(verzoek.result);
    verzoek.onerror = () => fout(verzoek.error);
  });
}

async function metWinkel<T>(modus: IDBTransactionMode, actie: (w: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((ok, fout) => {
      const verzoek = actie(db.transaction(WINKEL, modus).objectStore(WINKEL));
      verzoek.onsuccess = () => ok(verzoek.result);
      verzoek.onerror = () => fout(verzoek.error);
    });
  } finally {
    db.close();
  }
}

const luisteraars = new Set<() => void>();
/** Meldt wijzigingen in Mijn sjablonen (bewaren, verwijderen). */
export function bijWijziging(f: () => void) {
  luisteraars.add(f);
  return () => void luisteraars.delete(f);
}
const meld = () => luisteraars.forEach((f) => f());

export async function eigenSjablonen(): Promise<EigenSjabloon[]> {
  try {
    const lijst = await metWinkel<EigenSjabloon[]>("readonly", (w) => w.getAll());
    return lijst.sort((a, b) => b.datum - a.datum);
  } catch {
    return [];
  }
}

export async function bewaarEigenSjabloon(naam: string, soort: Soort, bytes: Uint8Array) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const item: EigenSjabloon = { id, naam: naam.trim() || id, soort, datum: Date.now(), bytes };
  await metWinkel("readwrite", (w) => w.put(item));
  meld();
  return item;
}

export async function verwijderEigenSjabloon(id: string) {
  await metWinkel("readwrite", (w) => w.delete(id));
  meld();
}
