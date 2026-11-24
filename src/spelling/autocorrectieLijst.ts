/**
 * De autocorrectie van de gebruiker: eigen vervangingen per taal (toegevoegd
 * of weggehaald ten opzichte van de standaardlijst), uitzonderingen en
 * opties. Bewaard per gebruiker in de app-opslag (localStorage; in de
 * desktopapp in het profiel van de webview), met export en import als JSON.
 */
import { useSyncExternalStore } from "react";
import { STANDAARD_OPTIES, standaardVervangingen, type AutocorrectieInstellingen } from "./autocorrectie";
import type { TaalId } from "./talen";

export interface AutocorrectieLijst {
  versie: 1;
  opties: AutocorrectieInstellingen;
  /** Per taal: eigen of gewijzigde vervangingen. */
  toegevoegd: Partial<Record<TaalId, Record<string, string>>>;
  /** Per taal: standaardvervangingen die de gebruiker heeft weggehaald. */
  verwijderd: Partial<Record<TaalId, string[]>>;
  /** Afkortingen waarna geen hoofdletter volgt. */
  geenZinsbegin: string[];
  /** Woorden met TWee HOofdletters die zo moeten blijven. */
  tweeHoofdletters: string[];
}

const SLEUTEL = "open-tekst-autocorrectie";
export const LEGE_LIJST: AutocorrectieLijst = {
  versie: 1,
  opties: STANDAARD_OPTIES,
  toegevoegd: {},
  verwijderd: {},
  geenZinsbegin: [],
  tweeHoofdletters: [],
};

const isTekstLijst = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
const isTabel = (x: unknown): x is Record<string, string> =>
  !!x && typeof x === "object" && !Array.isArray(x) && Object.values(x).every((v) => typeof v === "string");

/** Leest een (geïmporteerde) lijst; onbekende of foute onderdelen vallen weg. */
export function leesLijst(ruw: unknown): AutocorrectieLijst {
  if (!ruw || typeof ruw !== "object") return LEGE_LIJST;
  const r = ruw as Partial<Record<keyof AutocorrectieLijst, unknown>>;
  const opties = { ...STANDAARD_OPTIES };
  if (r.opties && typeof r.opties === "object")
    for (const k of Object.keys(STANDAARD_OPTIES) as (keyof AutocorrectieInstellingen)[]) {
      const v = (r.opties as Record<string, unknown>)[k];
      if (typeof v === "boolean") opties[k] = v;
    }
  const perTaal = <T>(x: unknown, past: (y: unknown) => y is T) => {
    const uit: Partial<Record<TaalId, T>> = {};
    if (x && typeof x === "object")
      for (const taal of ["nl", "en-GB", "en-US"] as const) {
        const w = (x as Record<string, unknown>)[taal];
        if (past(w)) uit[taal] = w;
      }
    return uit;
  };
  return {
    versie: 1,
    opties,
    toegevoegd: perTaal(r.toegevoegd, isTabel),
    verwijderd: perTaal(r.verwijderd, isTekstLijst),
    geenZinsbegin: isTekstLijst(r.geenZinsbegin) ? r.geenZinsbegin : [],
    tweeHoofdletters: isTekstLijst(r.tweeHoofdletters) ? r.tweeHoofdletters : [],
  };
}

let huidig: AutocorrectieLijst | null = null;
const luisteraars = new Set<() => void>();

export function leesAutocorrectie(): AutocorrectieLijst {
  if (huidig) return huidig;
  try {
    huidig = leesLijst(JSON.parse(localStorage.getItem(SLEUTEL) ?? "null"));
  } catch {
    huidig = LEGE_LIJST;
  }
  return huidig;
}

export function bewaarAutocorrectie(lijst: AutocorrectieLijst) {
  huidig = lijst;
  try {
    localStorage.setItem(SLEUTEL, JSON.stringify(lijst));
  } catch {
    // Zonder opslag geldt de lijst alleen deze sessie.
  }
  luisteraars.forEach((l) => l());
}

export function volgAutocorrectie(l: () => void) {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}

export function useAutocorrectie() {
  return useSyncExternalStore(volgAutocorrectie, leesAutocorrectie, leesAutocorrectie);
}

// Andere vensters of tabbladen.
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key !== SLEUTEL) return;
    huidig = null;
    luisteraars.forEach((l) => l());
  });

/** De vervangingstabel die geldt voor een taal. */
export function vervangingenVoor(lijst: AutocorrectieLijst, taal: TaalId): Record<string, string> {
  const uit = standaardVervangingen(taal);
  for (const k of lijst.verwijderd[taal] ?? []) delete uit[k];
  return { ...uit, ...lijst.toegevoegd[taal] };
}

/** Zet (of vervangt) een vervanging. */
export function zetVervanging(lijst: AutocorrectieLijst, taal: TaalId, van: string, naar: string): AutocorrectieLijst {
  return {
    ...lijst,
    toegevoegd: { ...lijst.toegevoegd, [taal]: { ...lijst.toegevoegd[taal], [van]: naar } },
    verwijderd: { ...lijst.verwijderd, [taal]: (lijst.verwijderd[taal] ?? []).filter((k) => k !== van) },
  };
}

/** Haalt een vervanging weg (een standaardvervanging wordt als weggehaald onthouden). */
export function verwijderVervanging(lijst: AutocorrectieLijst, taal: TaalId, van: string): AutocorrectieLijst {
  const eigen = { ...lijst.toegevoegd[taal] };
  delete eigen[van];
  const standaard = Object.hasOwn(standaardVervangingen(taal), van);
  const weg = lijst.verwijderd[taal] ?? [];
  return {
    ...lijst,
    toegevoegd: { ...lijst.toegevoegd, [taal]: eigen },
    verwijderd: { ...lijst.verwijderd, [taal]: standaard && !weg.includes(van) ? [...weg, van] : weg },
  };
}

/** Terug naar de standaardlijst van één taal. */
export function herstelTaal(lijst: AutocorrectieLijst, taal: TaalId): AutocorrectieLijst {
  const toegevoegd = { ...lijst.toegevoegd };
  const verwijderd = { ...lijst.verwijderd };
  delete toegevoegd[taal];
  delete verwijderd[taal];
  return { ...lijst, toegevoegd, verwijderd };
}

export const exportTekst = (lijst: AutocorrectieLijst) =>
  JSON.stringify({ soort: "open-office-studio/autocorrectie", ...lijst }, null, 2);

/** Leest een export; gooit bij een bestand dat geen autocorrectielijst is. */
export function importTekst(tekst: string): AutocorrectieLijst {
  const ruw = JSON.parse(tekst) as { soort?: string };
  if (ruw?.soort !== "open-office-studio/autocorrectie") throw new Error("soort");
  return leesLijst(ruw);
}
