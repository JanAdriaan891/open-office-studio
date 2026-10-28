/**
 * Kleine hulpfuncties om een OOXML-element opnieuw op te bouwen met
 * gewijzigde kinderen of attributen. Ongewijzigde kinderen houden hun
 * brontekst; nieuwe kinderen komen op de plaats die het schema voorschrijft.
 */
import {
  attrTekst,
  elementen,
  type XmlElement,
} from "../../grafieken/xml.ts";

/** Volgorde van `w:rPr`-kinderen volgens ECMA-376 (CT_RPr). */
export const RPR_VOLGORDE = [
  "rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike",
  "dstrike", "outline", "shadow", "emboss", "imprint", "noProof", "snapToGrid",
  "vanish", "webHidden", "color", "spacing", "w", "kern", "position", "sz",
  "szCs", "highlight", "u", "effect", "bdr", "shd", "fitText", "vertAlign",
  "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath",
];
/** Volgorde van `w:pPr`-kinderen (CT_PPr). */
export const PPR_VOLGORDE = [
  "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr",
  "widowControl", "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs",
  "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct",
  "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd",
  "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents",
  "suppressOverlap", "jc", "textDirection", "textAlignment",
  "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr",
  "pPrChange",
];
/** Volgorde van `w:style`-kinderen (CT_Style). */
export const STIJL_VOLGORDE = [
  "name", "aliases", "basedOn", "next", "link", "autoRedefine", "hidden",
  "uiPriority", "semiHidden", "unhideWhenUsed", "qFormat", "locked",
  "personal", "personalCompose", "personalReply", "rsid", "pPr", "rPr",
  "tblPr", "trPr", "tcPr", "tblStylePr",
];
/** Volgorde in `w:docDefaults`. */
export const DOCDEFAULTS_VOLGORDE = ["rPrDefault", "pPrDefault"];

/** Een kind om te plaatsen: tekst, of null om het te verwijderen. */
export type KindWijziging = Map<string, string | null>;

/** Brontekst van een element. */
export const bron = (xml: string, el: XmlElement) => xml.slice(el.start, el.eind);

/**
 * Bouwt `el` opnieuw op met de gewijzigde kinderen (op lokale naam). Kinderen
 * die niet genoemd worden blijven staan, in hun oorspronkelijke volgorde.
 * Een element zonder kinderen na de wijziging blijft als leeg element staan.
 */
export function herbouw(
  xml: string,
  el: XmlElement,
  wijzigingen: KindWijziging,
  volgorde: string[],
): string {
  const rang = (lokaal: string) => {
    const i = volgorde.indexOf(lokaal);
    return i < 0 ? volgorde.length : i;
  };
  const delen: { rang: number; tekst: string; index: number }[] = [];
  const gedaan = new Set<string>();
  elementen(el).forEach((kind, index) => {
    if (!wijzigingen.has(kind.lokaal)) {
      delen.push({ rang: rang(kind.lokaal), tekst: bron(xml, kind), index });
      return;
    }
    // Dubbele kinderen: alleen het eerste vervangen, de rest weg.
    if (gedaan.has(kind.lokaal)) return;
    gedaan.add(kind.lokaal);
    const nieuw = wijzigingen.get(kind.lokaal);
    if (nieuw) delen.push({ rang: rang(kind.lokaal), tekst: nieuw, index });
  });
  let extra = 10000;
  for (const [lokaal, tekst] of wijzigingen)
    if (!gedaan.has(lokaal) && tekst)
      delen.push({ rang: rang(lokaal), tekst, index: extra++ });
  // Bekende kinderen op schemavolgorde; onbekende houden hun plek ten opzichte
  // van hun voorganger (stabiel sorteren op rang, dan op bronvolgorde).
  const gesorteerd = [...delen].sort((a, b) =>
    a.rang === b.rang ? a.index - b.index : a.rang - b.rang,
  );
  const inhoud = gesorteerd.map((d) => d.tekst).join("");
  const begin = xml.slice(el.start, el.leeg ? el.inhoudStart - 2 : el.inhoudStart - 1);
  return inhoud ? `${begin}>${inhoud}</${el.naam}>` : `${begin}/>`;
}

/**
 * Een (leeg) element met gewijzigde attributen. `null` verwijdert een
 * attribuut. Bestaande attributen houden hun volgorde.
 */
export function metAttributen(
  xml: string,
  el: XmlElement | null,
  naam: string,
  wijzigingen: Record<string, string | null | undefined>,
): string | null {
  const attrs: Record<string, string> = el ? { ...el.attrs } : {};
  for (const [sleutel, waarde] of Object.entries(wijzigingen)) {
    if (waarde === undefined) continue;
    if (waarde === null) delete attrs[sleutel];
    else attrs[sleutel] = waarde;
  }
  const echte = Object.keys(attrs).filter((a) => !a.startsWith("xmlns"));
  if (!echte.length && (!el || el.leeg)) return null;
  const kop = `<${el?.naam ?? naam}${attrTekst(attrs)}`;
  if (!el || el.leeg) return `${kop}/>`;
  return `${kop}>${xml.slice(el.inhoudStart, el.inhoudEind)}</${el.naam}>`;
}
