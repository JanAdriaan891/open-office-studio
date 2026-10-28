/**
 * Woordsplitsing voor de spellingcontrole: welke stukken tekst zijn woorden,
 * waar staan ze (UTF-16-offsets in de alinea, zoals de engine ze telt) en
 * welke slaan we over (URL's, e-mailadressen, getallen, afkortingen in
 * hoofdletters).
 *
 * Samenstellingen ("fietsenstallingscapaciteit") blijven één woord: het
 * woordenboek (OpenTaal) kent de samenstellingsregels zelf.
 */

export interface Woord {
  /** Het woord zoals het in de tekst staat. */
  tekst: string;
  start: number;
  eind: number;
  /** Er volgt direct een punt (voor afkortingen als "bijv."). */
  punt: boolean;
}

export interface SplitsOpties {
  /** Woorden die geheel uit hoofdletters bestaan overslaan (zoals Word standaard). */
  hoofdletterwoordenNegeren?: boolean;
  /** Woorden met cijfers overslaan ("A4", "2e", "CO2"). */
  cijferwoordenNegeren?: boolean;
}

const STANDAARD: Required<SplitsOpties> = {
  hoofdletterwoordenNegeren: true,
  cijferwoordenNegeren: true,
};

/** URL's, www-adressen, e-mailadressen en bestandspaden met schuine strepen. */
const OVERSLAAN =
  /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"]+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}|(?:[A-Za-z]:)?(?:[\\/][\w.-]+){2,}/giu;

/**
 * Een woord: letters (met accenten) en cijfers, met daarbinnen een apostrof,
 * koppelteken of punt ("auto's", "e-mail", "d.w.z"). Een losse apostrof aan
 * het begin hoort erbij bij 's, 't, 'n, 'k en 'm ("'s avonds").
 */
const WOORD = /(?:['’](?=[stnkmr]\b))?[\p{L}\p{M}\p{N}]+(?:['’.\-‑][\p{L}\p{M}\p{N}]+)*/gu;

const HEEFT_LETTER = /\p{L}/u;
const HEEFT_CIJFER = /\p{N}/u;

/** Alles in hoofdletters (minstens twee letters), bijvoorbeeld "NEN" of "BTW". */
export function isHoofdletterwoord(woord: string): boolean {
  const letters = woord.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase();
}

/** Normaliseert typografische tekens zodat het woordenboek ze herkent. */
export function normaliseer(woord: string): string {
  return woord.replace(/’/g, "'").replace(/‑/g, "-");
}

/** Bereiken die geheel worden overgeslagen (URL's, e-mail, paden). */
export function overslaanBereiken(tekst: string): [number, number][] {
  const uit: [number, number][] = [];
  for (const m of tekst.matchAll(OVERSLAAN)) {
    let eind = m.index + m[0].length;
    // Afsluitende leestekens horen niet bij de URL.
    while (eind > m.index && /[.,;:!?)\]'"’]/.test(tekst[eind - 1])) eind--;
    uit.push([m.index, eind]);
  }
  return uit;
}

/** Splitst een alinea in te controleren woorden. */
export function splitsWoorden(tekst: string, opties: SplitsOpties = {}): Woord[] {
  const o = { ...STANDAARD, ...opties };
  const overslaan = overslaanBereiken(tekst);
  const uit: Woord[] = [];
  for (const m of tekst.matchAll(WOORD)) {
    const start = m.index;
    const eind = start + m[0].length;
    if (overslaan.some(([a, b]) => start < b && eind > a)) continue;
    const woord = m[0];
    if (!HEEFT_LETTER.test(woord)) continue; // getallen: 2026, 3,5
    if (o.cijferwoordenNegeren && HEEFT_CIJFER.test(woord)) continue;
    if (o.hoofdletterwoordenNegeren && isHoofdletterwoord(woord)) continue;
    uit.push({ tekst: woord, start, eind, punt: tekst[eind] === "." });
  }
  return uit;
}

/**
 * De varianten die het woordenboek mag goedkeuren, in volgorde: het woord
 * zelf, met afsluitende punt (afkortingen), en (bij een koppelteken) de
 * losse delen. Geeft groepen: het woord is goed als één groep geheel goed is.
 */
export function varianten(woord: Woord): string[][] {
  const basis = normaliseer(woord.tekst);
  const groepen: string[][] = [[basis]];
  if (woord.punt) groepen.push([`${basis}.`]);
  if (/-/.test(basis)) {
    const delen = basis.split("-").filter(Boolean);
    if (delen.length > 1) groepen.push(delen);
  }
  return groepen;
}
