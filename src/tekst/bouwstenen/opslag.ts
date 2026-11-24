/**
 * Bouwstenen (AutoTekst): opgeslagen stukken tekst met opmaak, per gebruiker
 * bewaard in de app-opslag (localStorage; in de desktopapp het profiel van de
 * webview), met export en import als JSON. De inhoud is een lijst
 * verhaalsegmenten zoals de Yrs-sessie ze geeft (tekst met opmaak en
 * alineagrenzen met alinea-eigenschappen), zonder afbeeldingen en tabellen.
 */
import { useSyncExternalStore } from "react";

export type Segment =
  | { kind: "text"; text: string; attributes: Record<string, unknown> }
  | { kind: "pilcrow"; properties: Record<string, unknown>; attributes: Record<string, unknown> }
  | { kind: "embed"; embedKind: string; payload: Record<string, unknown>; attributes: Record<string, unknown> };

export interface Bouwsteen {
  id: string;
  naam: string;
  categorie: string;
  /** Platte tekst, voor het voorbeeld en als terugval. */
  tekst: string;
  segmenten: Segment[];
  gewijzigd: number;
}

const SLEUTEL = "open-tekst-bouwstenen";
const SOORT = "open-office-studio/bouwstenen";

function geldigSegment(s: unknown): s is Segment {
  if (!s || typeof s !== "object") return false;
  const x = s as Record<string, unknown>;
  const obj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  if (x.kind === "text") return typeof x.text === "string" && obj(x.attributes);
  if (x.kind === "pilcrow") return obj(x.properties) && obj(x.attributes);
  if (x.kind === "embed") return typeof x.embedKind === "string" && obj(x.payload) && obj(x.attributes);
  return false;
}

/** Leest een lijst bouwstenen; ongeldige onderdelen vallen weg. */
export function leesBouwstenen(ruw: unknown): Bouwsteen[] {
  if (!Array.isArray(ruw)) return [];
  const uit: Bouwsteen[] = [];
  for (const b of ruw) {
    if (!b || typeof b !== "object") continue;
    const x = b as Record<string, unknown>;
    if (typeof x.naam !== "string" || !x.naam.trim() || !Array.isArray(x.segmenten)) continue;
    const segmenten = x.segmenten.filter(geldigSegment);
    uit.push({
      id: typeof x.id === "string" && x.id ? x.id : nieuwId(),
      naam: x.naam.trim().slice(0, 80),
      categorie: typeof x.categorie === "string" ? x.categorie.trim().slice(0, 60) : "",
      tekst: typeof x.tekst === "string" ? x.tekst : segmenten.map((s) => (s.kind === "text" ? s.text : s.kind === "pilcrow" ? "\n" : "")).join(""),
      segmenten,
      gewijzigd: typeof x.gewijzigd === "number" ? x.gewijzigd : Date.now(),
    });
  }
  return uit;
}

export const nieuwId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

let huidig: Bouwsteen[] | null = null;
const luisteraars = new Set<() => void>();

export function alleBouwstenen(): Bouwsteen[] {
  if (huidig) return huidig;
  try {
    huidig = leesBouwstenen(JSON.parse(localStorage.getItem(SLEUTEL) ?? "[]"));
  } catch {
    huidig = [];
  }
  return huidig;
}

export function bewaarBouwstenen(lijst: Bouwsteen[]) {
  huidig = [...lijst].sort((a, b) => a.categorie.localeCompare(b.categorie) || a.naam.localeCompare(b.naam));
  try {
    localStorage.setItem(SLEUTEL, JSON.stringify(huidig));
  } catch {
    // Vol of geblokkeerd: de lijst geldt dan alleen deze sessie.
  }
  luisteraars.forEach((l) => l());
}

export function useBouwstenen() {
  return useSyncExternalStore(
    (l) => {
      luisteraars.add(l);
      return () => {
        luisteraars.delete(l);
      };
    },
    alleBouwstenen,
    alleBouwstenen,
  );
}

if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key !== SLEUTEL) return;
    huidig = null;
    luisteraars.forEach((l) => l());
  });

/** Voegt toe of vervangt een bouwsteen met dezelfde naam. */
export function metBouwsteen(lijst: readonly Bouwsteen[], nieuw: Bouwsteen): Bouwsteen[] {
  const zelfde = (b: Bouwsteen) => b.id === nieuw.id || b.naam.toLocaleLowerCase() === nieuw.naam.toLocaleLowerCase();
  return [...lijst.filter((b) => !zelfde(b)), nieuw];
}

/**
 * De bouwsteen bij een getypte naam (F3): exact (zonder hoofdlettergevoeligheid),
 * anders de enige waarvan de naam zo begint.
 */
export function zoekOpNaam(lijst: readonly Bouwsteen[], naam: string): Bouwsteen | null {
  const n = naam.trim().toLocaleLowerCase();
  if (!n) return null;
  const exact = lijst.find((b) => b.naam.toLocaleLowerCase() === n);
  if (exact) return exact;
  const begin = lijst.filter((b) => b.naam.toLocaleLowerCase().startsWith(n));
  return begin.length === 1 ? begin[0] : null;
}

export const exportTekst = (lijst: readonly Bouwsteen[]) => JSON.stringify({ soort: SOORT, versie: 1, bouwstenen: lijst }, null, 2);

/** Leest een export; gooit bij een bestand dat geen bouwstenen bevat. */
export function importTekst(tekst: string): Bouwsteen[] {
  const ruw = JSON.parse(tekst) as { soort?: string; bouwstenen?: unknown };
  if (ruw?.soort !== SOORT) throw new Error("soort");
  return leesBouwstenen(ruw.bouwstenen);
}

/** Alinea-eigenschappen die bij één document horen, niet bij een bouwsteen. */
const ALINEA_WEG = /^(_|paraId$|ooxmlParaId$|sourceParaId$|paraOrigin$|bookmarks$|sectPr$|revision)/;
const OPMAAK_WEG = new Set(["ins", "del", "comment", "comments", "revision", "moveFrom", "moveTo"]);

/** Ontdoet segmenten van document-eigen gegevens (id's, revisies, bladwijzers). */
export function schoonSegmenten(segmenten: readonly Segment[]): Segment[] {
  const opmaak = (a: Record<string, unknown>) => Object.fromEntries(Object.entries(a).filter(([k]) => !OPMAAK_WEG.has(k)));
  const uit: Segment[] = [];
  for (const s of segmenten) {
    if (s.kind === "text") {
      if (!s.text) continue;
      const vorige = uit[uit.length - 1];
      const a = opmaak(s.attributes);
      if (vorige?.kind === "text" && JSON.stringify(vorige.attributes) === JSON.stringify(a)) vorige.text += s.text;
      else uit.push({ kind: "text", text: s.text, attributes: a });
    } else if (s.kind === "pilcrow")
      uit.push({ kind: "pilcrow", properties: Object.fromEntries(Object.entries(s.properties).filter(([k]) => !ALINEA_WEG.test(k))), attributes: opmaak(s.attributes) });
    else if (s.embedKind === "field" || s.embedKind === "tab" || s.embedKind === "hardBreak" || s.embedKind === "break")
      uit.push({ kind: "embed", embedKind: s.embedKind, payload: s.payload, attributes: opmaak(s.attributes) });
  }
  return uit;
}

/** Lengte in verhaaleenheden (tekst in UTF-16, elk embed en elke alineagrens telt 1). */
export const lengteVan = (segmenten: readonly Segment[]) => segmenten.reduce((n, s) => n + (s.kind === "text" ? s.text.length : 1), 0);
