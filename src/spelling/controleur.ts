/**
 * Spellingcontrole van alinea's, los van een editor: woorden splitsen,
 * persoonlijke woordenlijst en "Alles negeren" toepassen, de motor alleen
 * vragen naar woorden die nog niet in de cache staan, en suggesties
 * opschonen. Bruikbaar voor Tekst, en later Notities, E-mail en Presentatie.
 */
import type { Motor } from "./motor";
import type { Taal, TaalId } from "./talen";
import { splitsWoorden, varianten, type SplitsOpties, type Woord } from "./woorden";
import { genegeerd as standaardGenegeerd, persoonlijk as standaardPersoonlijk, type Woordenlijst } from "./woordenlijst";

export interface Fout extends Woord {
  taal: TaalId;
}

/** Gegevens om een fout te herkennen na een wijziging elders in de tekst. */
export const foutSleutel = (f: Pick<Fout, "tekst" | "taal">) => `${f.taal}\u0000${f.tekst}`;

export class Controleur {
  /** Per taal: woord (genormaliseerde variant) → bekend. */
  private cache = new Map<TaalId, Map<string, boolean>>();

  constructor(
    private readonly motor: Motor,
    private readonly lijsten: { persoonlijk: Woordenlijst; genegeerd: Woordenlijst } = {
      persoonlijk: standaardPersoonlijk,
      genegeerd: standaardGenegeerd,
    },
    private readonly opties: SplitsOpties = {},
  ) {}

  bereidVoor(taal: TaalId) {
    return this.motor.bereidVoor(taal);
  }

  private cacheVoor(taal: TaalId) {
    let c = this.cache.get(taal);
    if (!c) this.cache.set(taal, (c = new Map()));
    return c;
  }

  private eigenLijst(woord: string) {
    return this.lijsten.persoonlijk.bevat(woord) || this.lijsten.genegeerd.bevat(woord);
  }

  /**
   * Controleert alinea's (elk met een eigen taal) en geeft per alinea de
   * onbekende woorden. Eén verzoek aan de motor per taal.
   */
  async controleer(
    alineas: readonly { tekst: string; taal: Taal }[],
    opties: SplitsOpties = this.opties,
  ): Promise<Fout[][]> {
    const gesplitst = alineas.map((a) =>
      a.taal === "geen" ? [] : splitsWoorden(a.tekst, opties).filter((w) => !this.eigenLijst(w.tekst)),
    );
    const teVragen = new Map<TaalId, Set<string>>();
    alineas.forEach((a, i) => {
      if (a.taal === "geen") return;
      const cache = this.cacheVoor(a.taal);
      for (const w of gesplitst[i])
        for (const groep of varianten(w))
          for (const v of groep)
            if (!cache.has(v)) {
              let s = teVragen.get(a.taal);
              if (!s) teVragen.set(a.taal, (s = new Set()));
              s.add(v);
            }
    });
    for (const [taal, woorden] of teVragen) {
      const lijst = [...woorden];
      const uitkomst = await this.motor.controleer(taal, lijst);
      const cache = this.cacheVoor(taal);
      lijst.forEach((w, i) => cache.set(w, uitkomst[i]));
    }
    return alineas.map((a, i) => {
      if (a.taal === "geen") return [];
      const taal = a.taal;
      const cache = this.cacheVoor(taal);
      return gesplitst[i]
        .filter((w) => !varianten(w).some((groep) => groep.every((v) => cache.get(v) === true)))
        .map((w) => ({ ...w, taal }));
    });
  }

  /** Synchrone controle uit de cache: true/false, of null als onbekend. */
  uitCache(woord: Woord, taal: TaalId): boolean | null {
    if (this.eigenLijst(woord.tekst)) return true;
    const cache = this.cacheVoor(taal);
    let onbekend = false;
    for (const groep of varianten(woord)) {
      const r = groep.map((v) => cache.get(v));
      if (r.every((x) => x === true)) return true;
      if (r.some((x) => x === undefined)) onbekend = true;
    }
    return onbekend ? null : false;
  }

  async suggesties(woord: string, taal: TaalId, max = 5): Promise<string[]> {
    // Met hoofdletter aan het zinsbegin ("Huiz") geeft het woordenboek vooral
    // namen ("Hui", "Huib"); eerst de suggesties voor de kleine letter.
    const eerste = woord.charAt(0);
    const zinsbegin =
      eerste !== eerste.toLocaleLowerCase() && woord.slice(1) === woord.slice(1).toLocaleLowerCase() && woord.length > 1;
    const klein = zinsbegin ? await this.motor.suggesties(taal, eerste.toLocaleLowerCase() + woord.slice(1)) : [];
    return schoonSuggesties(woord, [...klein, ...(await this.motor.suggesties(taal, woord))], max);
  }
}

/** Past de hoofdletters van een suggestie aan het oorspronkelijke woord aan. */
export function volgHoofdletters(origineel: string, suggestie: string): string {
  const letters = origineel.replace(/[^\p{L}]/gu, "");
  if (letters.length > 1 && letters === letters.toLocaleUpperCase()) return suggestie.toLocaleUpperCase();
  const eerste = origineel.charAt(0);
  if (eerste !== eerste.toLocaleLowerCase() && suggestie.charAt(0) === suggestie.charAt(0).toLocaleLowerCase())
    return suggestie.charAt(0).toLocaleUpperCase() + suggestie.slice(1);
  return suggestie;
}

/**
 * Ontdubbelen, hoofdletters volgen, en splitsingen met een losse letter
 * ("gemeenteraad d") weglaten: die zijn in de praktijk nooit bedoeld.
 */
export function schoonSuggesties(woord: string, ruw: readonly string[], max = 5): string[] {
  const uit: string[] = [];
  for (const s of ruw) {
    if (/\s\S$|^\S\s/u.test(s)) continue;
    const v = volgHoofdletters(woord, s);
    if (v === woord || uit.includes(v)) continue;
    uit.push(v);
    if (uit.length >= max) break;
  }
  return uit;
}
