/**
 * Een minimale, parser-onafhankelijke boom voor de sanitizer. In de browser
 * komt de boom uit `DOMParser` (dezelfde parser die het afgeschermde frame
 * gebruikt); zonder DOM (tests, workers) uit de eenvoudige tokenizer hieronder.
 * De tokenizer is geen volledige HTML5-boombouwer, maar de sanitizer laat
 * alleen een toegestane lijst door en serialiseert zelf, dus afwijkingen in de
 * boomstructuur leveren hooguit andere opmaak op, nooit actieve inhoud.
 */
export type Knoop =
  | { soort: "element"; tag: string; attributen: [string, string][]; kinderen: Knoop[] }
  | { soort: "tekst"; tekst: string };

export const LEGE_ELEMENTEN = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr", "keygen", "frame", "basefont", "bgsound",
]);
const RUWE_TEKST = new Set([
  "script", "style", "textarea", "title", "xmp", "iframe", "noembed",
  "noframes", "noscript", "plaintext",
]);

/** Leest HTML met `DOMParser` als die er is, anders met de eigen tokenizer. */
export function leesHtml(html: string): Knoop[] {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const kinderen: Knoop[] = [];
    // Stijlen in <head> horen bij de opmaak van het bericht; de rest van <head> niet.
    for (const stijl of Array.from(doc.head?.querySelectorAll("style") ?? []))
      kinderen.push(vanDom(stijl)!);
    if (doc.body) kinderen.push(...Array.from(doc.body.childNodes).map(vanDom).filter(isKnoop));
    return kinderen;
  }
  return tokeniseer(html);
}

function isKnoop(knoop: Knoop | null): knoop is Knoop {
  return knoop !== null;
}

function vanDom(knoop: Node): Knoop | null {
  if (knoop.nodeType === 3) return { soort: "tekst", tekst: knoop.nodeValue ?? "" };
  if (knoop.nodeType !== 1) return null;
  const element = knoop as Element;
  const tag = element.localName.toLowerCase();
  // Elementen buiten de HTML-namespace (svg, math) zijn nooit toegestaan.
  const vreemd = element.namespaceURI !== "http://www.w3.org/1999/xhtml";
  const bron = tag === "template" ? (element as HTMLTemplateElement).content : element;
  return {
    soort: "element",
    tag: vreemd ? `#vreemd:${tag}` : tag,
    attributen: Array.from(element.attributes).map((a) => [a.name.toLowerCase(), a.value]),
    kinderen: Array.from(bron.childNodes).map(vanDom).filter(isKnoop),
  };
}

const ENTITEITEN: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", euro: "€", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", middot: "·",
  eacute: "é", egrave: "è", euml: "ë", iuml: "ï", ouml: "ö", uuml: "ü",
  auml: "ä", ccedil: "ç", tab: "\t", newline: "\n", colon: ":",
  lpar: "(", rpar: ")", sol: "/", bsol: "\\", Tab: "\t", NewLine: "\n",
};

export function decodeerEntiteiten(tekst: string) {
  return tekst.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (geheel, code: string) => {
    if (code[0] === "#") {
      const getal = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(getal) || getal <= 0 || getal > 0x10ffff || (getal >= 0xd800 && getal <= 0xdfff))
        return "�";
      return String.fromCodePoint(getal);
    }
    return ENTITEITEN[code] ?? ENTITEITEN[code.toLowerCase()] ?? geheel;
  });
}

/** Eenvoudige HTML-tokenizer met een stapel voor nesting. */
export function tokeniseer(html: string): Knoop[] {
  const wortel: Knoop = { soort: "element", tag: "#wortel", attributen: [], kinderen: [] };
  const stapel: Extract<Knoop, { soort: "element" }>[] = [wortel];
  const top = () => stapel[stapel.length - 1];
  let i = 0;
  const tekst = (t: string) => {
    if (!t) return;
    top().kinderen.push({ soort: "tekst", tekst: decodeerEntiteiten(t) });
  };
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      tekst(html.slice(i));
      break;
    }
    tekst(html.slice(i, lt));
    i = lt;
    if (html.startsWith("<!--", i)) {
      const eind = html.indexOf("-->", i + 4);
      i = eind < 0 ? html.length : eind + 3;
      continue;
    }
    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const eind = html.indexOf(">", i);
      i = eind < 0 ? html.length : eind + 1;
      continue;
    }
    const sluit = html[i + 1] === "/";
    const naamMatch = /^[a-zA-Z][^\s/>\0]*/.exec(html.slice(i + (sluit ? 2 : 1)));
    if (!naamMatch) {
      tekst("<");
      i++;
      continue;
    }
    const tag = naamMatch[0].toLowerCase();
    let j = i + (sluit ? 2 : 1) + naamMatch[0].length;
    const attributen: [string, string][] = [];
    // Attributen lezen tot het einde van de tag.
    while (j < html.length) {
      while (j < html.length && /[\s/]/.test(html[j])) j++;
      if (j >= html.length || html[j] === ">") break;
      const naam = /^[^\s/>=]+/.exec(html.slice(j))?.[0] ?? html[j];
      j += naam.length;
      while (j < html.length && /\s/.test(html[j])) j++;
      let waarde = "";
      if (html[j] === "=") {
        j++;
        while (j < html.length && /\s/.test(html[j])) j++;
        const quote = html[j];
        if (quote === '"' || quote === "'") {
          const eind = html.indexOf(quote, j + 1);
          waarde = html.slice(j + 1, eind < 0 ? html.length : eind);
          j = eind < 0 ? html.length : eind + 1;
        } else {
          const m = /^[^\s>]*/.exec(html.slice(j))![0];
          waarde = m;
          j += m.length;
        }
      }
      if (!attributen.some(([n]) => n === naam.toLowerCase()))
        attributen.push([naam.toLowerCase(), decodeerEntiteiten(waarde)]);
    }
    i = j + 1;
    if (sluit) {
      const index = stapel.map((e) => e.tag).lastIndexOf(tag);
      if (index > 0) stapel.length = index;
      continue;
    }
    const element: Extract<Knoop, { soort: "element" }> = { soort: "element", tag, attributen, kinderen: [] };
    // Een nieuwe <p>, <li>, <tr>, <td> sluit een open gelijksoortig element.
    if (["p", "li", "tr", "td", "th", "option", "dt", "dd"].includes(tag) && top().tag === tag) stapel.pop();
    top().kinderen.push(element);
    if (RUWE_TEKST.has(tag)) {
      const eindTag = new RegExp(`</${tag}[\\s/>]`, "i");
      const rest = html.slice(i);
      const m = eindTag.exec(rest);
      const inhoud = m ? rest.slice(0, m.index) : rest;
      element.kinderen.push({ soort: "tekst", tekst: tag === "textarea" || tag === "title" ? decodeerEntiteiten(inhoud) : inhoud });
      if (m) {
        const sluitEind = html.indexOf(">", i + m.index);
        i = sluitEind < 0 ? html.length : sluitEind + 1;
      } else i = html.length;
      continue;
    }
    if (!LEGE_ELEMENTEN.has(tag) && !html.slice(lt, i).endsWith("/>")) stapel.push(element);
  }
  return (wortel as Extract<Knoop, { soort: "element" }>).kinderen;
}
