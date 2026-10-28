/**
 * Persoonlijke woordenlijst (blijvend, voor alle documenten) en de lijst
 * "Alles negeren" (alleen deze sessie). De persoonlijke lijst staat in
 * localStorage; in de desktopapp ook, omdat de webview-opslag daar per
 * gebruiker blijft bestaan.
 */
import { useSyncExternalStore } from "react";
import { normaliseer } from "./woorden";

const SLEUTEL = "openaec-spelling-woordenlijst";

/** Een woordenlijst met abonnees; los te testen zonder browseropslag. */
export class Woordenlijst {
  private woorden = new Set<string>();
  private luisteraars = new Set<() => void>();
  private versie = 0;

  constructor(
    private readonly opslag: { lees(): string[]; bewaar(woorden: string[]): void } | null = null,
  ) {
    if (opslag) for (const w of opslag.lees()) this.woorden.add(normaliseer(w));
  }

  /**
   * Een woord is bekend als het precies zo is toegevoegd, of als het alleen
   * in hoofdletters verschilt aan het zinsbegin ("Kees" ↔ toegevoegd "kees"
   * telt niet, maar toegevoegd "openaec" keurt "Openaec" goed).
   */
  bevat(woord: string): boolean {
    const w = normaliseer(woord);
    if (this.woorden.has(w)) return true;
    const klein = w.charAt(0).toLocaleLowerCase() + w.slice(1);
    return klein !== w && this.woorden.has(klein);
  }

  voegToe(woord: string) {
    const w = normaliseer(woord.trim());
    if (!w || this.woorden.has(w)) return;
    this.woorden.add(w);
    this.gewijzigd();
  }

  verwijder(woord: string) {
    if (this.woorden.delete(normaliseer(woord))) this.gewijzigd();
  }

  alle(): string[] {
    return [...this.woorden].sort((a, b) => a.localeCompare(b, "nl"));
  }

  /** Telt op bij elke wijziging (voor React en caches). */
  get stand() {
    return this.versie;
  }

  volg = (luisteraar: () => void) => {
    this.luisteraars.add(luisteraar);
    return () => {
      this.luisteraars.delete(luisteraar);
    };
  };

  private gewijzigd() {
    this.versie++;
    this.opslag?.bewaar(this.alle());
    this.luisteraars.forEach((l) => l());
  }
}

const lokaleOpslag = {
  lees(): string[] {
    try {
      const ruw = JSON.parse(localStorage.getItem(SLEUTEL) ?? "[]");
      return Array.isArray(ruw) ? ruw.filter((w): w is string => typeof w === "string") : [];
    } catch {
      return [];
    }
  },
  bewaar(woorden: string[]) {
    try {
      localStorage.setItem(SLEUTEL, JSON.stringify(woorden));
    } catch {
      // Zonder browseropslag geldt de lijst alleen voor deze sessie.
    }
  },
};

/** De persoonlijke woordenlijst van de gebruiker. */
export const persoonlijk = new Woordenlijst(typeof window === "undefined" ? null : lokaleOpslag);
/** "Alles negeren": voor deze sessie, in alle documenten. */
export const genegeerd = new Woordenlijst(null);

export function useWoordenlijsten() {
  useSyncExternalStore(persoonlijk.volg, () => persoonlijk.stand);
  useSyncExternalStore(genegeerd.volg, () => genegeerd.stand);
  return { persoonlijk, genegeerd };
}
