/**
 * Contract van het voorvertoningsraamwerk voor bijlagen (en later andere
 * bestanden in de kantooromgeving). Het raamwerk kent drie delen:
 *
 * 1. een {@link VoorbeeldBron}: naam, type, grootte en een luie `bytes()`;
 * 2. herkenning van de {@link Voorbeeldsoort} (zie `herkenning.ts`);
 * 3. een register van {@link Weergever}s. Per soort wint de weergever met de
 *    hoogste prioriteit waarvan `kan(bron)` waar is. De huidige weergevers
 *    hebben prioriteit 0; de Rust-viewers (Tauri-opdracht of WASM) melden zich
 *    later met een hogere prioriteit aan zonder dat de rest hoeft te wijzigen.
 *    Zie README.md voor het aansluitpunt.
 */
import type { ComponentType } from "react";
import type { Herkenning } from "./herkenning";

export interface VoorbeeldBron {
  bestandsnaam: string;
  /** MIME-type zoals de afzender het opgaf; niet vertrouwen. */
  inhoudstype: string;
  /** Grootte in bytes (zoals opgegeven; kan afwijken van de echte inhoud). */
  grootte: number;
  /** Laadt de inhoud. Mag vaker aangeroepen worden; gebruik `maakBron` voor caching. */
  bytes(): Promise<Uint8Array>;
}

export type Voorbeeldsoort =
  | "pdf"
  | "dwg"
  | "dxf"
  | "ifc"
  | "markdown"
  | "tekst"
  | "afbeelding"
  | "office"
  | "onbekend";

/** Modules van de kantooromgeving waarin een bijlage als kopie kan openen. */
export type Kantoorsoort = "tekst" | "rekenblad" | "presentatie" | "database";

export interface VoorbeeldActies {
  /** Bijlage opslaan op deze computer. */
  opslaan?: (bron: VoorbeeldBron) => void | Promise<void>;
  /** Bijlage openen met het standaardprogramma van het besturingssysteem. */
  openExtern?: (bron: VoorbeeldBron) => void | Promise<void>;
  /** Bijlage als bewerkbare kopie openen in een module van Office Studio. */
  openInModule?: (soort: Kantoorsoort, naam: string, bytes: Uint8Array) => void | Promise<void>;
  /** Externe link openen (na bevestiging door de gebruiker in de weergever). */
  openLink?: (url: string) => void | Promise<void>;
}

export interface WeergeverProps {
  bron: VoorbeeldBron;
  soort: Voorbeeldsoort;
  /** Volledige herkenning (subtype, waarschuwing bij misleidende naam). */
  herkenning: Herkenning;
  acties: VoorbeeldActies;
  /**
   * Laat de weergever toetsen afhandelen (bijv. +/− voor zoom). De handler geeft
   * `true` terug als de toets verwerkt is. Geeft een afmeldfunctie terug.
   */
  registreerToetsen: (handler: (e: KeyboardEvent) => boolean) => () => void;
}

export interface Weergever {
  /** Unieke naam, handig voor diagnose ("afbeelding-js", "dwg-rust"). */
  naam: string;
  soort: Voorbeeldsoort;
  /** Hoger wint. Ingebouwde JS-weergevers: 0. Rust-weergevers: bijv. 100. */
  prioriteit: number;
  /** Kan deze weergever de bron tonen (bijv. alleen in Tauri, of tot een maximale grootte)? */
  kan(bron: VoorbeeldBron, herkenning?: Herkenning): boolean;
  Component: ComponentType<WeergeverProps>;
}

/** Limieten voor de ingebouwde weergevers. */
export const LIMIETEN = {
  afbeeldingBytes: 40 * 1024 * 1024,
  afbeeldingPixels: 100_000_000,
  tekstBytes: 2 * 1024 * 1024,
  markdownBytes: 2 * 1024 * 1024,
  dxfBytes: 64 * 1024 * 1024,
  pdfMetaBytes: 200 * 1024 * 1024,
  ifcBytes: 200 * 1024 * 1024,
} as const;

const register: Weergever[] = [];

/** Meldt een weergever aan; geeft een afmeldfunctie terug. */
export function registreerWeergever(w: Weergever): () => void {
  register.push(w);
  return () => {
    const i = register.indexOf(w);
    if (i >= 0) register.splice(i, 1);
  };
}

/** Alle weergevers voor een soort, hoogste prioriteit eerst. */
export function weergeversVoor(soort: Voorbeeldsoort): Weergever[] {
  return register
    .map((w, volgorde) => ({ w, volgorde }))
    .filter((x) => x.w.soort === soort)
    // Bij gelijke prioriteit wint de laatst aangemelde.
    .sort((a, b) => b.w.prioriteit - a.w.prioriteit || b.volgorde - a.volgorde)
    .map((x) => x.w);
}

/** Kiest de weergever voor een bron; valt terug op de soort "onbekend". */
export function kiesWeergever(soort: Voorbeeldsoort, bron: VoorbeeldBron, herkenning?: Herkenning): Weergever | null {
  for (const w of weergeversVoor(soort)) {
    try {
      if (w.kan(bron, herkenning)) return w;
    } catch {
      // Een kapotte kan() mag de rest niet blokkeren.
    }
  }
  if (soort !== "onbekend") return kiesWeergever("onbekend", bron, herkenning);
  return null;
}

/**
 * Maakt een bron met gecachete `bytes()`. Bruikbaar met `BijlageInfo` uit het
 * mailcontract: `maakBron(info, () => backend.bijlage(account, map, uid, info.index))`.
 */
export function maakBron(
  info: { bestandsnaam: string; inhoudstype: string; grootte: number },
  laad: () => Promise<Uint8Array>,
): VoorbeeldBron {
  let belofte: Promise<Uint8Array> | null = null;
  return {
    bestandsnaam: info.bestandsnaam,
    inhoudstype: info.inhoudstype,
    grootte: info.grootte,
    bytes() {
      if (!belofte) {
        belofte = laad();
        // Bij een fout mag een volgende poging opnieuw laden.
        belofte.catch(() => (belofte = null));
      }
      return belofte;
    },
  };
}
