/** Inline objecten (afbeeldingen, velden, notenverwijzingen) in geprojecteerde tekst. */
const OBJECT = "\uFFFC";

export interface Telling {
  woorden: number;
  tekens: number;
  tekensZonderSpaties: number;
  alineas: number;
}

export function telTekst(alineas: readonly string[]): Telling {
  const telling: Telling = {
    woorden: 0,
    tekens: 0,
    tekensZonderSpaties: 0,
    alineas: 0,
  };
  for (const alinea of alineas) {
    const tekst = alinea.replaceAll(OBJECT, "");
    const tekens = [...tekst];
    telling.tekens += tekens.length;
    telling.tekensZonderSpaties += tekens.filter((t) => !/\s/u.test(t)).length;
    telling.woorden += tekst
      .split(/[\s\u00a0]+/u)
      .filter((woord) => /[\p{L}\p{N}]/u.test(woord)).length;
    if (tekst.trim()) telling.alineas++;
  }
  return telling;
}

export type Hoofdlettersoort =
  | "hoofdletters"
  | "kleine"
  | "zin"
  | "titel"
  | "wisselen";

function hoofdletterBegin(tekst: string) {
  // Nederlandse digraaf: ijsbeer → IJsbeer.
  return tekst.replace(/^ij/u, "IJ").replace(/^./u, (t) => t.toUpperCase());
}

export function wijzigHoofdletters(tekst: string, soort: Hoofdlettersoort) {
  switch (soort) {
    case "hoofdletters":
      return tekst.toLocaleUpperCase("nl");
    case "kleine":
      return tekst.toLocaleLowerCase("nl");
    case "wisselen":
      return [...tekst]
        .map((t) =>
          t === t.toLocaleUpperCase("nl")
            ? t.toLocaleLowerCase("nl")
            : t.toLocaleUpperCase("nl"),
        )
        .join("");
    case "titel":
      return tekst
        .toLocaleLowerCase("nl")
        .replace(
          /(^|[^\p{L}\p{N}'’])([\p{L}\p{N}][\p{L}\p{N}'’]*)/gu,
          (_, voor: string, woord: string) => voor + hoofdletterBegin(woord),
        );
    case "zin":
      return tekst
        .toLocaleLowerCase("nl")
        .replace(
          /(^\s*|[.!?]\s+)([\p{L}\p{N}][\p{L}\p{N}'’]*)/gu,
          (_, voor: string, woord: string) => voor + hoofdletterBegin(woord),
        );
  }
}

const rotatie: Hoofdlettersoort[] = ["titel", "zin", "hoofdletters", "kleine"];

/** Hoofdlettergebruik rouleren zoals Shift+F3: de volgende vorm die iets verandert. */
export function volgendeHoofdletters(tekst: string) {
  const huidig = rotatie.findIndex(
    (s) => wijzigHoofdletters(tekst, s) === tekst,
  );
  for (let stap = 1; stap <= rotatie.length; stap++) {
    const soort = rotatie[(huidig + stap) % rotatie.length];
    const nieuw = wijzigHoofdletters(tekst, soort);
    if (nieuw !== tekst) return nieuw;
  }
  return tekst;
}

export function datumTekst(datum: Date, lang = false) {
  return lang
    ? datum.toLocaleDateString("nl-NL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : datum.toLocaleDateString("nl-NL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

export function tijdTekst(datum: Date) {
  return datum.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface Teken {
  teken: string;
  naam: string;
}

export const specialeTekens: { groep: string; tekens: Teken[] }[] = [
  {
    groep: "Leestekens",
    tekens: [
      { teken: "–", naam: "Kastlijn (en-streepje)" },
      { teken: "—", naam: "Gedachtestreep (em-streepje)" },
      { teken: "…", naam: "Weglatingsteken" },
      { teken: "‘", naam: "Enkel aanhalingsteken openen" },
      { teken: "’", naam: "Enkel aanhalingsteken sluiten" },
      { teken: "“", naam: "Dubbel aanhalingsteken openen" },
      { teken: "”", naam: "Dubbel aanhalingsteken sluiten" },
      { teken: "„", naam: "Laag aanhalingsteken" },
      { teken: "«", naam: "Guillemet links" },
      { teken: "»", naam: "Guillemet rechts" },
      { teken: "•", naam: "Opsommingsteken" },
      { teken: "·", naam: "Middelpunt" },
      { teken: "§", naam: "Paragraafteken" },
      { teken: "¶", naam: "Alineateken" },
      { teken: "†", naam: "Kruis" },
      { teken: "\u00a0", naam: "Vaste spatie" },
      { teken: "\u2011", naam: "Vast afbreekstreepje" },
      { teken: "\u00ad", naam: "Zacht afbreekstreepje" },
    ],
  },
  {
    groep: "Valuta en symbolen",
    tekens: [
      { teken: "€", naam: "Euroteken" },
      { teken: "£", naam: "Pondteken" },
      { teken: "$", naam: "Dollarteken" },
      { teken: "¥", naam: "Yenteken" },
      { teken: "©", naam: "Copyright" },
      { teken: "®", naam: "Gedeponeerd handelsmerk" },
      { teken: "™", naam: "Handelsmerk" },
      { teken: "°", naam: "Graden" },
      { teken: "‰", naam: "Promille" },
      { teken: "✓", naam: "Vinkje" },
      { teken: "✗", naam: "Kruisje" },
      { teken: "★", naam: "Ster" },
    ],
  },
  {
    groep: "Wiskunde",
    tekens: [
      { teken: "±", naam: "Plus-min" },
      { teken: "×", naam: "Maal" },
      { teken: "÷", naam: "Gedeeld door" },
      { teken: "−", naam: "Minteken" },
      { teken: "≈", naam: "Ongeveer gelijk" },
      { teken: "≠", naam: "Niet gelijk" },
      { teken: "≤", naam: "Kleiner dan of gelijk" },
      { teken: "≥", naam: "Groter dan of gelijk" },
      { teken: "∞", naam: "Oneindig" },
      { teken: "√", naam: "Wortel" },
      { teken: "∑", naam: "Som" },
      { teken: "∅", naam: "Lege verzameling / diameter" },
      { teken: "²", naam: "Superscript twee" },
      { teken: "³", naam: "Superscript drie" },
      { teken: "½", naam: "Een half" },
      { teken: "¼", naam: "Een kwart" },
      { teken: "¾", naam: "Drie kwart" },
      { teken: "µ", naam: "Micro" },
    ],
  },
  {
    groep: "Grieks en pijlen",
    tekens: [
      { teken: "α", naam: "Alfa" },
      { teken: "β", naam: "Bèta" },
      { teken: "γ", naam: "Gamma" },
      { teken: "δ", naam: "Delta" },
      { teken: "Δ", naam: "Hoofdletter delta" },
      { teken: "λ", naam: "Lambda" },
      { teken: "π", naam: "Pi" },
      { teken: "σ", naam: "Sigma" },
      { teken: "Ω", naam: "Omega" },
      { teken: "→", naam: "Pijl naar rechts" },
      { teken: "←", naam: "Pijl naar links" },
      { teken: "↑", naam: "Pijl omhoog" },
      { teken: "↓", naam: "Pijl omlaag" },
      { teken: "↔", naam: "Pijl links-rechts" },
      { teken: "⇒", naam: "Dubbele pijl naar rechts" },
    ],
  },
];

export interface Vervanging {
  begin: number;
  eind: number;
  tekst: string;
}

/**
 * Per gewijzigd teken een vervanging (UTF-16-posities vanaf `begin`), zodat
 * de opmaak van elk teken behouden blijft.
 */
export function tekenVervangingen(
  oud: string,
  nieuw: string,
  begin = 0,
): Vervanging[] | null {
  const a = [...oud],
    b = [...nieuw];
  if (a.length !== b.length) return null;
  const uit: Vervanging[] = [];
  let positie = begin;
  a.forEach((teken, i) => {
    if (teken !== b[i])
      uit.push({ begin: positie, eind: positie + teken.length, tekst: b[i] });
    positie += teken.length;
  });
  return uit;
}

/** Waar de selectie in de alinea begint, of null als dat niet eenduidig is. */
export function selectieBegin(
  alinea: string,
  selectie: string,
  ervoor?: string,
): number | null {
  if (!selectie) return null;
  if (ervoor !== undefined && alinea.startsWith(ervoor + selectie, 0))
    return ervoor.length;
  if (ervoor && alinea.indexOf(ervoor + selectie) >= 0) {
    const eerste = alinea.indexOf(ervoor + selectie);
    if (alinea.indexOf(ervoor + selectie, eerste + 1) < 0)
      return eerste + ervoor.length;
  }
  const eerste = alinea.indexOf(selectie);
  if (eerste < 0 || alinea.indexOf(selectie, eerste + 1) >= 0) return null;
  return eerste;
}
