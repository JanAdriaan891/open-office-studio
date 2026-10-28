/**
 * Datum en tijd invoegen: Nederlandse notaties als Word-veldafbeelding
 * (`\@ "d MMMM yyyy"`), zodat dezelfde notatie als tekst of als DATE/TIME-veld
 * kan worden ingevoegd.
 */

export interface Notatie {
  /** Word-veldafbeelding, bijvoorbeeld `d MMMM yyyy`. */
  afbeelding: string;
  /** Alleen een tijd: dan een TIME-veld in plaats van DATE. */
  tijd?: boolean;
}

/** Standaard: `d MMMM yyyy` (28 oktober 2026). */
export const STANDAARD_NOTATIE = 2;

export const NOTATIES: readonly Notatie[] = [
  { afbeelding: "dd-MM-yyyy" },
  { afbeelding: "dd-MM-yy" },
  { afbeelding: "d MMMM yyyy" },
  { afbeelding: "dddd d MMMM yyyy" },
  { afbeelding: "d MMM yyyy" },
  { afbeelding: "MMMM yyyy" },
  { afbeelding: "yyyy-MM-dd" },
  { afbeelding: "dd-MM-yyyy HH:mm" },
  { afbeelding: "dd-MM-yyyy HH:mm:ss" },
  { afbeelding: "HH:mm", tijd: true },
  { afbeelding: "HH:mm:ss", tijd: true },
  { afbeelding: "H:mm 'uur'", tijd: true },
];

const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];
const KORT_MAAND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const KORT_DAG = ["zo", "ma", "di", "wo", "do", "vr", "za"];

const twee = (n: number) => String(n).padStart(2, "0");

/**
 * Formatteert een datum volgens een Word-veldafbeelding in het Nederlands.
 * Ondersteund: d dd ddd dddd, M MM MMM MMMM, yy yyyy, H HH h hh, m mm, s ss,
 * AM/PM en tekst tussen enkele aanhalingstekens.
 */
export function formatteerDatum(datum: Date, afbeelding: string): string {
  const tokens = /'[^']*'|dddd|ddd|dd|d|MMMM|MMM|MM|M|yyyy|yy|HH|H|hh|h|mm|m|ss|s|AM\/PM|am\/pm/g;
  return afbeelding.replace(tokens, (t) => {
    const uur = datum.getHours();
    switch (t) {
      case "dddd": return DAGEN[datum.getDay()];
      case "ddd": return KORT_DAG[datum.getDay()];
      case "dd": return twee(datum.getDate());
      case "d": return String(datum.getDate());
      case "MMMM": return MAANDEN[datum.getMonth()];
      case "MMM": return KORT_MAAND[datum.getMonth()];
      case "MM": return twee(datum.getMonth() + 1);
      case "M": return String(datum.getMonth() + 1);
      case "yyyy": return String(datum.getFullYear());
      case "yy": return twee(datum.getFullYear() % 100);
      case "HH": return twee(uur);
      case "H": return String(uur);
      case "hh": return twee(uur % 12 || 12);
      case "h": return String(uur % 12 || 12);
      case "mm": return twee(datum.getMinutes());
      case "m": return String(datum.getMinutes());
      case "ss": return twee(datum.getSeconds());
      case "s": return String(datum.getSeconds());
      case "AM/PM": return uur < 12 ? "AM" : "PM";
      case "am/pm": return uur < 12 ? "am" : "pm";
      default: return t.slice(1, -1);
    }
  });
}

const xml = (tekst: string) =>
  tekst.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Veldcode zoals Word hem schrijft: ` DATE \@ "d MMMM yyyy" `. */
export function veldcode(notatie: Notatie): string {
  return ` ${notatie.tijd ? "TIME" : "DATE"} \\@ "${notatie.afbeelding}" `;
}

/** Een eenvoudig veld (`w:fldSimple`) met de huidige waarde als resultaat. */
export function veldXml(notatie: Notatie, waarde: string, rPr: string): string {
  return (
    `<w:fldSimple w:instr="${xml(veldcode(notatie))}">` +
    `<w:r>${rPr}<w:t xml:space="preserve">${xml(waarde)}</w:t></w:r>` +
    `</w:fldSimple>`
  );
}

/** Tijdelijke markering die we eerst als tekst invoegen en daarna vervangen. */
export function maakMarkering(id = Math.random().toString(36).slice(2, 10)) {
  return `VELD${id}`;
}

/**
 * Vervangt de markering in een WordprocessingML-onderdeel door het veld. De
 * run met de markering wordt in tweeën gesplitst; het veld krijgt dezelfde
 * runopmaak. Geeft null als de markering niet (eenmaal) in één `w:t` staat.
 */
export function vervangMarkering(
  onderdeel: string,
  markering: string,
  maakVeld: (rPr: string) => string,
): string | null {
  const plek = onderdeel.indexOf(markering);
  if (plek < 0 || onderdeel.indexOf(markering, plek + 1) >= 0) return null;
  // Begin van de run: de laatste <w:r> of <w:r …> vóór de markering.
  const runs = [...onderdeel.slice(0, plek).matchAll(/<w:r(?=[\s>])[^>]*>/g)];
  const runOpen = runs.at(-1);
  if (!runOpen || runOpen.index === undefined) return null;
  const runBegin = runOpen.index;
  const runEind = onderdeel.indexOf("</w:r>", plek);
  if (runEind < 0) return null;
  const run = onderdeel.slice(runBegin, runEind + "</w:r>".length);
  const binnen = plek - runBegin;
  // Het w:t-element om de markering.
  const tOpen = [...run.slice(0, binnen).matchAll(/<w:t(?=[\s>])[^>]*>/g)].at(-1);
  if (!tOpen || tOpen.index === undefined) return null;
  const tSluit = run.indexOf("</w:t>", binnen);
  if (tSluit < 0 || run.slice(tOpen.index, binnen).includes("</w:t>")) return null;
  const tekstBegin = tOpen.index + tOpen[0].length;
  const voor = run.slice(tekstBegin, binnen);
  const na = run.slice(binnen + markering.length, tSluit);
  const rPr = /<w:rPr>[\s\S]*?<\/w:rPr>|<w:rPr\/>/.exec(run)?.[0] ?? "";
  const eersteRun =
    run.slice(0, tOpen.index) + `<w:t xml:space="preserve">${voor}</w:t></w:r>`;
  const tweedeRun =
    `${runOpen[0]}${rPr}<w:t xml:space="preserve">${na}</w:t>` +
    run.slice(tSluit + "</w:t>".length);
  return (
    onderdeel.slice(0, runBegin) +
    eersteRun +
    maakVeld(rPr) +
    tweedeRun +
    onderdeel.slice(runEind + "</w:r>".length)
  );
}
