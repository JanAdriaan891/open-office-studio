/**
 * Eigen HTML-sanitizer voor e-mail. Werkt met een toegestane lijst: alles wat
 * hier niet uitdrukkelijk staat, verdwijnt. De uitvoer wordt bovendien alleen
 * getoond in een `<iframe sandbox>` zonder scripts en met een strenge CSP
 * (zie `frameDocument`), zodat een fout hier niet direct tot uitvoering leidt.
 */
import { leesHtml, LEGE_ELEMENTEN, type Knoop } from "./html-boom";

export interface SaneerOpties {
  /** Externe afbeeldingen en achtergronden laden (standaard niet). */
  externeInhoud?: boolean;
  /**
   * Alleen met `externeInhoud`: vervangt elke externe URL door een lokaal
   * opgehaalde blob-URL (desktopapp, waar de CSP geen externe bronnen toestaat).
   * Onbekend (undefined) = geblokkeerd.
   */
  extern?: (url: string) => string | undefined;
  /** Zet `cid:`-verwijzingen om naar een (blob-)URL; onbekend = verwijderen. */
  cid?: (contentId: string) => string | undefined;
  /** `<style>`-blokken behouden (gesaneerd). Uit voor opgestelde berichten. */
  stijlblokken?: boolean;
  /** `class`-attributen behouden; uit wanneer de HTML in de app zelf staat (opstellen). */
  klassen?: boolean;
}

export interface SaneerUitkomst {
  html: string;
  /** Aantal geblokkeerde externe bronnen (afbeeldingen, achtergronden, CSS-url's). */
  geblokkeerd: number;
}

/** Elementen die met hun volledige inhoud verdwijnen. */
const VERWIJDER_MET_INHOUD = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet",
  "noscript", "noembed", "noframes", "template", "svg", "math", "link", "meta",
  "base", "title", "head", "audio", "video", "source", "track", "canvas",
  "portal", "param", "xml", "xmp", "plaintext", "select", "option", "optgroup",
  "textarea", "input", "button", "keygen", "datalist", "output", "dialog",
  "map", "area", "picture", "slot", "bgsound", "marquee", "blink", "layer", "ilayer",
]);

const TOEGESTAAN = new Set([
  "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "big",
  "blockquote", "br", "caption", "center", "cite", "code", "col", "colgroup",
  "dd", "del", "details", "dfn", "div", "dl", "dt", "em", "figcaption",
  "figure", "font", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hr", "i", "img", "ins", "kbd", "li", "main", "mark", "nav", "ol", "p", "pre",
  "q", "rp", "rt", "ruby", "s", "samp", "section", "small", "span", "strike",
  "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th",
  "thead", "time", "tr", "tt", "u", "ul", "var", "wbr", "label", "legend",
  "fieldset",
]);

const ATTRIBUTEN_ALGEMEEN = new Set([
  "align", "valign", "bgcolor", "color", "width", "height", "border",
  "cellpadding", "cellspacing", "colspan", "rowspan", "dir", "lang", "title",
  "style", "class", "face", "size", "datetime", "span", "nowrap", "abbr",
  "headers", "scope", "summary", "hspace", "vspace", "background", "open",
  "start", "reversed", "clear", "frame", "rules", "char", "charoff",
]);
const ATTRIBUTEN_PER_TAG: Record<string, Set<string>> = {
  a: new Set(["href"]),
  img: new Set(["src", "alt"]),
  ol: new Set(["type"]),
  ul: new Set(["type"]),
  li: new Set(["type", "value"]),
  blockquote: new Set(["type"]),
};

const CSS_EIGENSCHAPPEN = new Set([
  "color", "background", "background-color", "background-image",
  "background-repeat", "background-position", "background-size", "font",
  "font-family", "font-size", "font-style", "font-variant", "font-weight",
  "text-align", "text-decoration", "text-decoration-line", "text-indent",
  "text-transform", "line-height", "letter-spacing", "word-spacing",
  "white-space", "word-break", "word-wrap", "overflow-wrap", "vertical-align",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-color", "border-style", "border-width", "border-radius",
  "border-top-color", "border-right-color", "border-bottom-color",
  "border-left-color", "border-top-style", "border-right-style",
  "border-bottom-style", "border-left-style", "border-top-width",
  "border-right-width", "border-bottom-width", "border-left-width",
  "border-collapse", "border-spacing", "width", "height", "max-width",
  "min-width", "max-height", "min-height", "display", "float", "clear",
  "list-style", "list-style-type", "list-style-position", "table-layout",
  "direction", "unicode-bidi", "text-overflow", "overflow", "overflow-x",
  "overflow-y", "caption-side", "empty-cells", "opacity", "box-sizing",
  "mso-line-height-rule", "outline", "visibility",
]);
const DISPLAY = new Set([
  "block", "inline", "inline-block", "none", "table", "table-row",
  "table-cell", "table-row-group", "table-header-group", "table-footer-group",
  "table-column", "table-column-group", "table-caption", "list-item", "flex",
  "inline-flex", "inline-table",
]);

const ONZICHTBAAR = new RegExp(
  "[" +
    [[0x00, 0x20], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x2029], [0xfeff, 0xfeff]]
      .map(([van, tot]) => `${String.fromCharCode(van)}-${String.fromCharCode(tot)}`)
      .join("") +
    "]",
  "g",
);
const NBSP = new RegExp(String.fromCharCode(0xa0), "g");
/** Verwijdert onzichtbare en controletekens zoals browsers dat doen bij URL's. */
function schoonUrl(waarde: string) {
  return waarde.replace(ONZICHTBAAR, "");
}

/** Toegestane linkdoelen: http(s), mailto en tel. */
export function veiligeLink(href: string): string | null {
  const ruw = href.trim();
  const schoon = schoonUrl(ruw);
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(schoon)?.[1]?.toLowerCase();
  if (!schema) return null;
  if (!["http", "https", "mailto", "tel"].includes(schema)) return null;
  if (schema === "http" || schema === "https") {
    try {
      return new URL(ruw).href;
    } catch {
      return null;
    }
  }
  return ruw;
}

type Bron = { url: string } | { geblokkeerd: true } | null;

function bronUrl(waarde: string, opties: SaneerOpties, afbeelding: boolean): Bron {
  const schoon = schoonUrl(waarde);
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(schoon)?.[1]?.toLowerCase();
  if (schema === "cid") {
    const id = decodeURIComponent(schoon.slice(4)).replace(/^<|>$/g, "");
    const url = opties.cid?.(id);
    return url && /^(blob|data):/i.test(url) ? { url } : null;
  }
  if (schema === "data") {
    return afbeelding && /^data:image\/(png|gif|jpe?g|webp|bmp);base64,[a-z0-9+/=\s]*$/i.test(schoon)
      ? { url: schoon }
      : null;
  }
  if (schema === "http" || schema === "https" || schoon.startsWith("//")) {
    if (!opties.externeInhoud) return { geblokkeerd: true };
    let url: string;
    try {
      url = new URL(schoon.startsWith("//") ? "https:" + schoon : waarde.trim()).href;
    } catch {
      return null;
    }
    if (!opties.extern) return { url };
    // Via de host opgehaald (desktopapp): alleen een blob-/data-URL komt in het frame.
    const vervangen = opties.extern(url);
    return vervangen && /^(blob|data):/i.test(vervangen) ? { url: vervangen } : { geblokkeerd: true };
  }
  return null;
}

/** Saneert één CSS-declaratielijst (`a: b; c: d`). */
export function saneerCss(css: string, opties: SaneerOpties, teller: { geblokkeerd: number }) {
  const uit: string[] = [];
  for (const declaratie of splitsDeclaraties(css)) {
    const dubbelepunt = declaratie.indexOf(":");
    if (dubbelepunt < 0) continue;
    const eigenschap = declaratie.slice(0, dubbelepunt).trim().toLowerCase();
    let waarde = declaratie.slice(dubbelepunt + 1).trim();
    if (!CSS_EIGENSCHAPPEN.has(eigenschap)) continue;
    // Escapes, commentaar en tags kunnen filters omzeilen; zulke waarden vervallen.
    if (/[\\<>{}]|\/\*|expression|javascript:|vbscript:|-moz-binding|behaviou?r|@import/i.test(waarde)) continue;
    if (eigenschap === "display" && !DISPLAY.has(waarde.replace(/\s*!important$/i, "").toLowerCase())) continue;
    let ongeldig = false;
    waarde = waarde.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_, __, adres: string) => {
      const bron = bronUrl(adres, opties, true);
      if (bron && "url" in bron) return `url("${bron.url.replace(/["\\\n\r]/g, "")}")`;
      if (bron) teller.geblokkeerd++;
      ongeldig = true;
      return "";
    });
    if (ongeldig || /url\(|image-set|src\(/i.test(waarde)) continue;
    if (!waarde) continue;
    uit.push(`${eigenschap}: ${waarde}`);
  }
  return uit.join("; ");
}

function splitsDeclaraties(css: string) {
  const delen: string[] = [];
  let huidig = "";
  let haakjes = 0;
  let quote = "";
  for (const teken of css) {
    if (quote) {
      if (teken === quote) quote = "";
    } else if (teken === '"' || teken === "'") quote = teken;
    else if (teken === "(") haakjes++;
    else if (teken === ")") haakjes = Math.max(0, haakjes - 1);
    else if (teken === ";" && haakjes === 0) {
      delen.push(huidig);
      huidig = "";
      continue;
    }
    huidig += teken;
  }
  delen.push(huidig);
  return delen;
}

/** Saneert een `<style>`-blok: alleen regels met eenvoudige selectoren en `@media`. */
export function saneerStijlblok(css: string, opties: SaneerOpties, teller: { geblokkeerd: number }): string {
  const zonderCommentaar = css.replace(/\/\*[\s\S]*?(\*\/|$)/g, " ").replace(/<!--|-->/g, " ");
  const uit: string[] = [];
  let i = 0;
  while (i < zonderCommentaar.length) {
    const open = zonderCommentaar.indexOf("{", i);
    if (open < 0) break;
    // Statements zoals `@import …;` vóór een regel horen niet bij de selector.
    const voor = zonderCommentaar.slice(i, open);
    const selector = voor.slice(voor.lastIndexOf(";") + 1).trim();
    // Zoek de bijbehorende sluitaccolade.
    let diepte = 1;
    let j = open + 1;
    while (j < zonderCommentaar.length && diepte > 0) {
      if (zonderCommentaar[j] === "{") diepte++;
      else if (zonderCommentaar[j] === "}") diepte--;
      j++;
    }
    const blok = zonderCommentaar.slice(open + 1, j - 1);
    i = j;
    if (/^@media\b/i.test(selector)) {
      if (/[<>\\{};]|url\(|expression/i.test(selector.slice(6))) continue;
      const binnen = saneerStijlblok(blok, opties, teller);
      if (binnen) uit.push(`${selector.replace(/\s+/g, " ")} { ${binnen} }`);
      continue;
    }
    if (selector.startsWith("@")) continue; // @import, @font-face, @charset, @keyframes, …
    if (!selector || /[<\\{}@]|expression|javascript:|url\(/i.test(selector)) continue;
    const declaraties = saneerCss(blok, opties, teller);
    if (declaraties) uit.push(`${selector} { ${declaraties} }`);
  }
  return uit.join("\n");
}

export function escapeTekst(tekst: string) {
  return tekst.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(NBSP, "&nbsp;");
}
export function escapeAttribuut(tekst: string) {
  return escapeTekst(tekst).replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/`/g, "&#96;");
}

/** Saneert e-mail-HTML tot een veilige, zelf geserialiseerde HTML-tekst. */
export function saneerHtml(html: string, opties: SaneerOpties = {}): SaneerUitkomst {
  const teller = { geblokkeerd: 0 };
  const stijlen: string[] = [];
  const delen: string[] = [];
  const schrijf = (knopen: Knoop[], diepte: number) => {
    for (const knoop of knopen) {
      if (knoop.soort === "tekst") {
        delen.push(escapeTekst(knoop.tekst));
        continue;
      }
      const tag = knoop.tag;
      if (tag === "style") {
        if (opties.stijlblokken !== false) {
          const css = knoop.kinderen.map((k) => (k.soort === "tekst" ? k.tekst : "")).join("");
          const schoon = saneerStijlblok(css, opties, teller);
          if (schoon) stijlen.push(schoon);
        }
        continue;
      }
      if (VERWIJDER_MET_INHOUD.has(tag) || tag.startsWith("#vreemd:")) continue;
      if (!TOEGESTAAN.has(tag) || diepte > 200) {
        // Onbekend (ook html/body/form): de inhoud blijft, het element niet.
        schrijf(knoop.kinderen, diepte + 1);
        continue;
      }
      const attributen = saneerAttributen(tag, knoop.attributen, opties, teller);
      if (tag === "img" && !attributen.some(([n]) => n === "src")) {
        const alt = knoop.attributen.find(([n]) => n === "alt")?.[1];
        const geblokkeerd = attributen.some(([n]) => n === "data-geblokkeerd");
        delen.push(
          `<span class="email-afbeelding-geblokkeerd"${geblokkeerd ? ' data-geblokkeerd="1"' : ""}>${escapeTekst(alt ? `[${alt}]` : "")}</span>`,
        );
        continue;
      }
      delen.push(`<${tag}${attributen.map(([n, w]) => ` ${n}="${escapeAttribuut(w)}"`).join("")}>`);
      if (LEGE_ELEMENTEN.has(tag)) continue;
      schrijf(knoop.kinderen, diepte + 1);
      delen.push(`</${tag}>`);
    }
  };
  schrijf(leesHtml(html), 0);
  const stijl = stijlen.length ? `<style>${stijlen.join("\n").replace(/</g, "")}</style>` : "";
  return { html: stijl + delen.join(""), geblokkeerd: teller.geblokkeerd };
}

function saneerAttributen(
  tag: string,
  attributen: [string, string][],
  opties: SaneerOpties,
  teller: { geblokkeerd: number },
): [string, string][] {
  const uit: [string, string][] = [];
  for (const [naam, waarde] of attributen) {
    if (naam.startsWith("on")) continue;
    if (!ATTRIBUTEN_ALGEMEEN.has(naam) && !ATTRIBUTEN_PER_TAG[tag]?.has(naam)) continue;
    if (naam === "style") {
      const css = saneerCss(waarde, opties, teller);
      if (css) uit.push(["style", css]);
      continue;
    }
    if (naam === "href") {
      const link = veiligeLink(waarde);
      if (link) uit.push(["href", link]);
      continue;
    }
    if (naam === "src" || naam === "background") {
      const bron = bronUrl(waarde, opties, true);
      if (bron && "url" in bron) uit.push([naam, bron.url]);
      else if (bron) {
        teller.geblokkeerd++;
        if (naam === "src") uit.push(["data-geblokkeerd", "1"]);
      }
      continue;
    }
    if (naam === "class") {
      if (opties.klassen === false) continue;
      const klassen = waarde.split(/\s+/).filter((k) => /^[a-z0-9_-]{1,64}$/i.test(k) && !k.startsWith("email-"));
      if (klassen.length) uit.push(["class", klassen.join(" ")]);
      continue;
    }
    if (/[<>]/.test(waarde) && naam !== "title" && naam !== "alt") continue;
    uit.push([naam, waarde]);
  }
  if (tag === "a" && uit.some(([n]) => n === "href")) uit.push(["rel", "noopener noreferrer"]);
  return uit;
}

/** Platte tekst naar veilige HTML met klikbare (gecontroleerde) links. */
export function tekstNaarHtml(tekst: string) {
  const delen: string[] = [];
  const link = /\b(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]|mailto:[^\s<>"']+)/gi;
  let laatste = 0;
  for (const m of tekst.matchAll(link)) {
    delen.push(escapeTekst(tekst.slice(laatste, m.index)));
    const href = veiligeLink(m[0]);
    delen.push(href ? `<a href="${escapeAttribuut(href)}" rel="noopener noreferrer">${escapeTekst(m[0])}</a>` : escapeTekst(m[0]));
    laatste = m.index! + m[0].length;
  }
  delen.push(escapeTekst(tekst.slice(laatste)));
  return `<div class="email-platte-tekst">${delen.join("")}</div>`;
}

/** HTML (al gesaneerd of van de eigen editor) naar leesbare platte tekst; citaten krijgen "> ". */
export function htmlNaarTekst(html: string): string {
  const alinea = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "table", "ul", "ol"]);
  const blok = new Set(["div", "li", "tr", "hr", "section", "article", "header", "footer", "dl", "dt", "dd", "address", "center", "figure"]);
  const normaliseer = (tekst: string) =>
    tekst
      .split("\n")
      .map((regel) => regel.replace(/^[ \t]+|[ \t]+$/g, "").replace(NBSP, " "))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const tekstVan = (knopen: Knoop[], lijst: { soort: "ul" | "ol"; nr: number } | null, pre: boolean): string => {
    const uit: string[] = [];
    const nieuweRegel = () => {
      if (uit.length && !uit[uit.length - 1].endsWith("\n")) uit.push("\n");
    };
    for (const knoop of knopen) {
      if (knoop.soort === "tekst") {
        uit.push(pre ? knoop.tekst : knoop.tekst.replace(/\s+/g, " "));
        continue;
      }
      const tag = knoop.tag;
      if (VERWIJDER_MET_INHOUD.has(tag) || tag.startsWith("#vreemd:")) continue;
      if (tag === "br") uit.push("\n");
      else if (tag === "li") {
        nieuweRegel();
        uit.push((lijst?.soort === "ol" ? `${++lijst.nr}. ` : "- ") + tekstVan(knoop.kinderen, null, pre).trim() + "\n");
      } else if (tag === "ul" || tag === "ol") {
        nieuweRegel();
        uit.push(tekstVan(knoop.kinderen, { soort: tag, nr: 0 }, pre) + "\n\n");
      } else if (tag === "blockquote") {
        nieuweRegel();
        const binnen = normaliseer(tekstVan(knoop.kinderen, null, pre));
        uit.push(binnen.split("\n").map((r) => (r.startsWith(">") ? ">" + r : r ? "> " + r : ">")).join("\n") + "\n");
      } else if (tag === "a") {
        const href = knoop.attributen.find(([n]) => n === "href")?.[1];
        const zichtbaar = tekstVan(knoop.kinderen, lijst, pre);
        uit.push(zichtbaar);
        if (href && !/^(mailto|tel):/i.test(href) && zichtbaar.trim() !== href) uit.push(` <${href}>`);
      } else if (alinea.has(tag) || blok.has(tag)) {
        nieuweRegel();
        uit.push(tekstVan(knoop.kinderen, lijst, pre || tag === "pre"));
        uit.push(alinea.has(tag) ? "\n\n" : "\n");
      } else uit.push(tekstVan(knoop.kinderen, lijst, pre));
    }
    return uit.join("");
  };
  return normaliseer(tekstVan(leesHtml(html), null, false));
}

/**
 * Volledig document voor het afgeschermde leesframe. De CSP staat alleen
 * inline-stijlen en afbeeldingen uit data:/blob: toe; externe bronnen alleen
 * na toestemming. Geen scripts, formulieren, frames of basis-URL's.
 */
export function frameDocument(schoneHtml: string, opties: { externeInhoud?: boolean; donker?: boolean } = {}) {
  // Met externeInhoud laadt het frame zelf http(s) (browser); in de desktopapp
  // komen externe afbeeldingen als blob-URL binnen en blijft dit uit.
  const img = opties.externeInhoud ? "data: blob: https: http:" : "data: blob:";
  const csp = [
    "default-src 'none'",
    `img-src ${img}`,
    "style-src 'unsafe-inline'",
    "font-src data:",
    "script-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><style>
html{color-scheme:light}
body{margin:0;padding:18px 22px;font:14px/1.55 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#2d3541;background:#fff;overflow-wrap:anywhere}
img{max-width:100%;height:auto}
a{color:#a75c06}
blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #e7c58f;color:#57534e}
pre,.email-platte-tekst{white-space:pre-wrap;font:13px/1.55 "JetBrains Mono",Consolas,Menlo,monospace;margin:0}
.email-afbeelding-geblokkeerd[data-geblokkeerd]{display:inline-block;min-width:16px;min-height:16px;padding:1px 4px;border:1px dashed #d6d3d1;color:#a1a1aa;font-size:11px}
table{max-width:100%}
</style></head><body>${schoneHtml}</body></html>`;
}

/** Alle externe afbeeldings-URL's (img, background, CSS-url) in een bericht. */
export function externeUrls(html: string): string[] {
  const urls = new Set<string>();
  saneerHtml(html, {
    externeInhoud: true,
    extern: (url) => {
      urls.add(url);
      return undefined;
    },
  });
  return [...urls];
}
