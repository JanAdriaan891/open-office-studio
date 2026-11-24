/**
 * Autocorrectie tijdens het typen: na een spatie of leesteken wordt het
 * zojuist getypte woord bekeken, zoals in Word en LibreOffice:
 * - TWee HOofdletters aan het woordbegin → Twee Hoofdletters ("IJsland" niet);
 * - eerste letter van een zin → hoofdletter (niet na "bijv.", "o.a.", …);
 * - de vervangingstabel per taal: typefouten en tekens als (c) → ©, --> → →;
 * - slimme aanhalingstekens per taal („…” of “…”), streepjes (– en —),
 *   1e/2e als superscript (keuze) en URL-herkenning (koppeling).
 * Uitzonderingen, eigen vervangingen en opties komen uit de gebruikerslijst
 * (autocorrectieLijst.ts). Los van de editor: de koppeling
 * (tekst/sessie.ts) leest de alinea en past de correctie toe als één
 * ongedaan-maakstap; Ctrl+Z direct erna zet de correctie terug.
 */
import type { Taal } from "./talen";

export interface Correctie {
  /** UTF-16-offsets in de alinea; de tekst ertussen wordt vervangen. */
  start: number;
  eind: number;
  /** Wat er nu staat (bewaking: alleen vervangen als dat nog klopt). */
  oud: string;
  nieuw: string;
  regel: "twee-hoofdletters" | "zinsbegin" | "typefout" | "vervanging" | "aanhalingsteken" | "streepje" | "rangtelwoord" | "url";
  /** Alleen opmaak, de tekst blijft (`nieuw === oud`): superscript of een koppeling. */
  opmaak?: { soort: "superscript" } | { soort: "koppeling"; href: string };
}

/** Tekens die een woord afsluiten en de autocorrectie starten. */
export const SCHEIDING = /[\s.,;:!?)\]"”’']/u;

const TYPEFOUTEN_NL: Record<string, string> = {
  eigelijk: "eigenlijk",
  namenlijk: "namelijk",
  onmiddelijk: "onmiddellijk",
  geinteresseerd: "geïnteresseerd",
  geintereseerd: "geïnteresseerd",
  beinvloeden: "beïnvloeden",
  efficient: "efficiënt",
  ideeen: "ideeën",
  categorieen: "categorieën",
  zowiezo: "sowieso",
  zoiezo: "sowieso",
  uberhaupt: "überhaupt",
  nogsteeds: "nog steeds",
  alsjeblief: "alsjeblieft",
  accomodatie: "accommodatie",
  paralel: "parallel",
  sucses: "succes",
  bijvoorbeel: "bijvoorbeeld",
  opzich: "op zich",
  perse: "per se",
  vanplan: "van plan",
  dmv: "d.m.v.",
  tegenwoordg: "tegenwoordig",
  enigzins: "enigszins",
  eventuel: "eventueel",
  kanidaat: "kandidaat",
};

const TYPEFOUTEN_EN: Record<string, string> = {
  teh: "the",
  adn: "and",
  recieve: "receive",
  beleive: "believe",
  seperate: "separate",
  definately: "definitely",
  occured: "occurred",
  untill: "until",
  wich: "which",
  becuase: "because",
  thier: "their",
  accomodate: "accommodate",
  tommorow: "tomorrow",
  alot: "a lot",
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  isnt: "isn't",
  wasnt: "wasn't",
  im: "I'm",
  ive: "I've",
  i: "I",
  acheive: "achieve",
  goverment: "government",
  neccessary: "necessary",
  occassion: "occasion",
  wierd: "weird",
};

/** Tekens en symbolen, voor elke taal. */
export const SYMBOLEN: Record<string, string> = {
  "(c)": "©",
  "(r)": "®",
  "(tm)": "™",
  "(e)": "€",
  "-->": "→",
  "<--": "←",
  "<->": "↔",
  "==>": "⇒",
  "<==": "⇐",
  "<=>": "⇔",
  "...": "…",
  "+-": "±",
  "1/2": "½",
  "1/4": "¼",
  "3/4": "¾",
  "!=": "≠",
  "<=": "≤",
  ">=": "≥",
  ":-)": "☺",
  ":-(": "☹",
};

/** Afkortingen met een punt waarna geen nieuwe zin begint. */
const AFKORTINGEN = new Set(
  [
    "bijv", "bv", "o.a", "d.w.z", "m.a.w", "enz", "etc", "e.d", "i.p.v", "m.b.t", "t.a.v", "t.o.v", "z.g.a.n",
    "ca", "mr", "dr", "ir", "ing", "drs", "prof", "mevr", "dhr", "nr", "blz", "art", "jl", "a.s", "vgl", "zgn",
    "e.g", "i.e", "vs", "mrs", "ms", "st", "no", "fig", "approx", "incl", "excl", "resp", "evt", "max", "min",
  ].map((a) => a.toLowerCase()),
);

export function typefouten(taal: Taal): Record<string, string> {
  if (taal === "nl") return TYPEFOUTEN_NL;
  if (taal === "en-GB" || taal === "en-US") return TYPEFOUTEN_EN;
  return {};
}

/** De standaard vervangingstabel van een taal (symbolen en typefouten). */
export function standaardVervangingen(taal: Taal): Record<string, string> {
  const uit: Record<string, string> = { ...SYMBOLEN };
  for (const [k, v] of Object.entries(typefouten(taal))) if (k !== v) uit[k] = v;
  return uit;
}

const LETTER = /\p{L}/u;
const isHoofd = (c: string) => LETTER.test(c) && c === c.toLocaleUpperCase() && c !== c.toLocaleLowerCase();
const isKlein = (c: string) => LETTER.test(c) && c === c.toLocaleLowerCase() && c !== c.toLocaleUpperCase();

/** Volgt hoofdletters van het getypte woord ("Teh" → "The", "TEH" → "THE"). */
function zelfdeHoofdletter(getypt: string, vervanging: string) {
  if (getypt === getypt.toLocaleUpperCase()) return vervanging.toLocaleUpperCase();
  return isHoofd(getypt[0]) && !isHoofd(vervanging[0])
    ? vervanging[0].toLocaleUpperCase() + vervanging.slice(1)
    : vervanging;
}

/**
 * Begint op `start` een nieuwe zin? `extra`: eigen afkortingen (kleine letters, zonder slotpunt).
 * `beginTelt` onwaar: het begin van de tekst zelf telt niet als zinsbegin (rekenbladcellen, zoals Excel).
 */
export function isZinsbegin(
  tekst: string,
  start: number,
  extra: ReadonlySet<string> = new Set(),
  beginTelt = true,
): boolean {
  let i = start - 1;
  while (i >= 0 && /[\s"“‘„(\[]/u.test(tekst[i])) i--;
  if (i < 0) return beginTelt; // begin van de alinea
  if (!/[.!?]/.test(tekst[i])) return false;
  if (i === start - 1) return false; // geen spatie na de punt ("bijv.nl")
  if (tekst[i] !== ".") return true;
  // Het woord vóór de punt: een afkorting of één letter ("J. de Vries")?
  let j = i;
  while (j > 0 && /[\p{L}.]/u.test(tekst[j - 1])) j--;
  const vorig = tekst.slice(j, i).toLowerCase();
  if (!vorig) return true;
  if (/^\p{L}$/u.test(vorig)) return false;
  if (vorig.includes(".") && !vorig.endsWith(".")) return false; // o.a. d.w.z.
  return !AFKORTINGEN.has(vorig) && !extra.has(vorig);
}

export interface AutocorrectieInstellingen {
  tweeHoofdletters: boolean;
  zinsbegin: boolean;
  /** De vervangingstabel toepassen. */
  vervangen: boolean;
  aanhalingstekens: boolean;
  streepjes: boolean;
  /** 1e, 2e, 1st … als superscript (standaard uit). */
  rangtelwoorden: boolean;
  urls: boolean;
}

export const STANDAARD_OPTIES: AutocorrectieInstellingen = {
  tweeHoofdletters: true,
  zinsbegin: true,
  vervangen: true,
  aanhalingstekens: true,
  streepjes: true,
  rangtelwoorden: false,
  urls: true,
};

export interface AutocorrectieOpties {
  taal: Taal;
  /** Woorden die nooit gecorrigeerd worden (persoonlijke woordenlijst). */
  uitzondering?: (woord: string) => boolean;
  /**
   * Of het begin van de tekst een zinsbegin is (standaard ja). In een
   * rekenbladcel niet: "ja", "nee" en codes blijven klein, zoals in Excel.
   */
  beginIsZinsbegin?: boolean;
  instellingen?: Partial<AutocorrectieInstellingen>;
  /** De vervangingstabel; zonder: de standaardtabel van de taal. */
  vervangingen?: Readonly<Record<string, string>>;
  /** Afkortingen waarna geen hoofdletter volgt (naast de vaste lijst). */
  geenZinsbegin?: readonly string[];
  /** Woorden met twee hoofdletters die zo blijven. */
  tweeHoofdlettersToegestaan?: readonly string[];
}

/** Aanhalingstekens per taal: [openen, sluiten, enkel openen, enkel sluiten]. */
export function aanhalingstekens(taal: Taal): [string, string, string, string] {
  if (taal === "nl") return ["„", "”", "‘", "’"];
  return ["“", "”", "‘", "’"];
}

const WOORD = /^[\p{L}\p{M}'’-]+$/u;
const URL_PATROON = /^(?:(?:https?|ftp):\/\/[^\s<>"]+\.[^\s<>"]+|www\.[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:[/?#][^\s<>"]*)?)$/iu;
const EMAIL = /^[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+$/u;
const SLOTLEESTEKENS = /[.,;:!?)\]}"”’']+$/u;

/** Een getypt adres als koppeling (www. krijgt https://, een e-mailadres mailto:). */
export function adresVan(token: string): string | null {
  const schoon = token.replace(SLOTLEESTEKENS, "");
  if (URL_PATROON.test(schoon)) return /^www\./i.test(schoon) ? `https://${schoon}` : schoon;
  if (EMAIL.test(schoon)) return `mailto:${schoon}`;
  return null;
}

const RANGTELWOORD: Partial<Record<Taal, RegExp>> = {
  nl: /^(\d+)(e|ste|de)$/,
  "en-GB": /^(\d+)(st|nd|rd|th)$/,
  "en-US": /^(\d+)(st|nd|rd|th)$/,
};

/** Splitst een tabel in woordvervangingen (alleen letters) en tekenreeksen. */
function splitsTabel(tabel: Readonly<Record<string, string>>) {
  const woorden: Record<string, string> = {};
  const reeksen: Record<string, string> = {};
  for (const [k, v] of Object.entries(tabel)) {
    if (!k) continue;
    if (WOORD.test(k)) woorden[k.toLocaleLowerCase()] = v;
    else reeksen[k] = v;
  }
  return { woorden, reeksen };
}

/**
 * Alle correcties voor het teken op `cursor - 1` (een scheidingsteken), van
 * rechts naar links en zonder overlap: een aanhalingsteken, het woord ervoor
 * en opmaak. Leeg als er niets te doen is.
 */
export function autocorrecties(tekst: string, cursor: number, opties: AutocorrectieOpties): Correctie[] {
  const inst = { ...STANDAARD_OPTIES, ...opties.instellingen };
  const scheiding = cursor - 1;
  const teken = tekst[scheiding] ?? "";
  if (scheiding < 0 || !SCHEIDING.test(teken)) return [];
  const uit: Correctie[] = [];
  // Slimme aanhalingstekens: het getypte teken zelf.
  // Een apostrof midden in een woord (auto's): niets doen.
  if (/['’]/.test(teken) && LETTER.test(tekst[cursor] ?? "")) return [];
  if (inst.aanhalingstekens && (teken === '"' || teken === "'")) {
    const [open, dicht, enkelOpen, enkelDicht] = aanhalingstekens(opties.taal);
    const voor = tekst[scheiding - 1] ?? "";
    const opent = !voor || /[\s([{—–„“‘«-]/u.test(voor);
    const nieuw = teken === '"' ? (opent ? open : dicht) : opent ? enkelOpen : enkelDicht;
    uit.push({ start: scheiding, eind: cursor, oud: teken, nieuw, regel: "aanhalingsteken" });
    // Openen, of een apostrof die bij het woord kan horen (auto’s): verder niets.
    if (opent || (teken === "'" && LETTER.test(voor))) return uit;
  }
  if (scheiding < 1) return uit;
  const tabel = splitsTabel(opties.vervangingen ?? standaardVervangingen(opties.taal));
  const witruimte = /\s/u.test(teken);
  // Het "token": alles sinds de vorige witruimte.
  let tokenStart = scheiding;
  while (tokenStart > 0 && !/\s/u.test(tekst[tokenStart - 1])) tokenStart--;
  const token = tekst.slice(tokenStart, scheiding);
  if (token && opties.uitzondering?.(token)) return uit;
  // URL-herkenning bij een spatie of Enter.
  if (inst.urls && witruimte && token) {
    const href = adresVan(token);
    if (href) {
      const schoon = token.replace(SLOTLEESTEKENS, "");
      uit.push({ start: tokenStart, eind: tokenStart + schoon.length, oud: schoon, nieuw: schoon, regel: "url", opmaak: { soort: "koppeling", href } });
      return uit;
    }
  }
  // Tekenreeksen uit de tabel: met het scheidingsteken erbij ("(c)") of zonder ("--> ").
  if (inst.vervangen) {
    const metTeken = witruimte || uit.length ? null : tekst.slice(tokenStart, cursor);
    for (const kandidaat of [metTeken, token]) {
      if (!kandidaat || !Object.hasOwn(tabel.reeksen, kandidaat)) continue;
      uit.push({ start: tokenStart, eind: tokenStart + kandidaat.length, oud: kandidaat, nieuw: tabel.reeksen[kandidaat], regel: "vervanging" });
      return uit.sort((a, b) => b.start - a.start);
    }
  }
  // Streepjes: "a - b " → "a – b", "a--b " → "a—b".
  if (inst.streepjes) {
    const voor = tekst.slice(0, scheiding);
    const half = /(\S)( --? )([^\s-]\S*)$/u.exec(voor);
    const heel = /([\p{L}\p{N}])--([\p{L}\p{N}]\S*)$/u.exec(voor);
    if (half) {
      const start = half.index + 1;
      uit.push({ start, eind: start + half[2].length, oud: half[2], nieuw: " – ", regel: "streepje" });
    } else if (heel) {
      const start = heel.index + 1;
      uit.push({ start, eind: start + 2, oud: "--", nieuw: "—", regel: "streepje" });
    }
  }
  // Rangtelwoorden als superscript.
  const rang = RANGTELWOORD[opties.taal];
  const m = inst.rangtelwoorden && rang ? rang.exec(token) : null;
  if (m) {
    uit.push({ start: tokenStart + m[1].length, eind: tokenStart + token.length, oud: m[2], nieuw: m[2], regel: "rangtelwoord", opmaak: { soort: "superscript" } });
    return uit.sort((a, b) => b.start - a.start);
  }
  const woord = woordCorrectie(tekst, cursor, opties, inst, tabel.woorden);
  if (woord && !uit.some((c) => c.start < woord.eind && woord.start < c.eind)) uit.push(woord);
  return uit.sort((a, b) => b.start - a.start);
}

/** De eerste correctie die de tekst verandert (voor eenvoudige aanroepen en tests). */
export function autocorrectie(tekst: string, cursor: number, opties: AutocorrectieOpties): Correctie | null {
  return autocorrecties(tekst, cursor, opties).find((c) => c.nieuw !== c.oud) ?? null;
}

/** De correctie voor het woord dat eindigt vlak vóór het scheidingsteken op `cursor - 1`. */
function woordCorrectie(
  tekst: string,
  cursor: number,
  opties: AutocorrectieOpties,
  inst: AutocorrectieInstellingen,
  lijst: Record<string, string>,
): Correctie | null {
  const scheiding = cursor - 1;
  const eind = scheiding;
  // Een apostrof als scheiding hoort soms bij het woord (auto's): dan niets doen.
  if (/['’]/.test(tekst[scheiding]) && LETTER.test(tekst[scheiding + 1] ?? "")) return null;
  let start = eind;
  while (start > 0 && /[\p{L}\p{M}'’-]/u.test(tekst[start - 1])) start--;
  // Een apostrof aan het begin ("'s") hoort niet bij een te corrigeren woord.
  while (start < eind && /['’-]/.test(tekst[start])) start++;
  if (start >= eind) return null;
  // Deel van een URL, e-mailadres, pad of getal: niet aankomen.
  const voor = tekst[start - 1] ?? "";
  if (/[\p{N}@/\\_.]/u.test(voor) && !(voor === "." && /\s/u.test(tekst[start - 2] ?? " "))) return null;
  if (/[@/\\]/.test(tekst[scheiding]) || /\p{N}/u.test(tekst.slice(start, eind))) return null;
  const woord = tekst.slice(start, eind);
  if (opties.uitzondering?.(woord)) return null;
  const begin = opties.beginIsZinsbegin ?? true;
  const extra = new Set((opties.geenZinsbegin ?? []).map((a) => a.toLowerCase().replace(/\.$/, "")));
  const zinsbegin = (i: number) => inst.zinsbegin && isZinsbegin(tekst, i, extra, begin);

  const klein = woord.toLocaleLowerCase();
  if (inst.vervangen && Object.hasOwn(lijst, klein) && !(woord === "I" && klein === "i")) {
    let nieuw = zelfdeHoofdletter(woord, lijst[klein]);
    if (zinsbegin(start)) nieuw = nieuw[0].toLocaleUpperCase() + nieuw.slice(1);
    if (nieuw !== woord) return { start, eind, oud: woord, nieuw, regel: "typefout" };
  }

  // TWee HOofdletters: twee hoofdletters, daarna minstens één kleine letter en
  // verder alleen kleine letters. "IJ" is in het Nederlands één letter; ook in
  // een Engelse alinea laten we "IJssel" staan.
  if (
    inst.tweeHoofdletters &&
    woord.length >= 3 &&
    isHoofd(woord[0]) &&
    isHoofd(woord[1]) &&
    [...woord.slice(2)].every(isKlein) &&
    !woord.startsWith("IJ") &&
    !(opties.tweeHoofdlettersToegestaan ?? []).includes(woord)
  )
    return { start, eind, oud: woord, nieuw: woord[0] + woord.slice(1).toLocaleLowerCase(), regel: "twee-hoofdletters" };

  if (isKlein(woord[0]) && zinsbegin(start) && ![...woord.slice(1)].some(isHoofd)) {
    // Alleen corrigeren als de zin echt al een woord verder is: de scheiding
    // mag geen punt zijn die een afkorting afsluit ("bijv.").
    if (tekst[scheiding] === "." && (AFKORTINGEN.has(klein) || extra.has(klein))) return null;
    return { start, eind, oud: woord, nieuw: woord[0].toLocaleUpperCase() + woord.slice(1), regel: "zinsbegin" };
  }
  return null;
}
