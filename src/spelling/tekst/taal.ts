/**
 * De taal van elke alinea (`w:lang`), rechtstreeks uit het DOCX-pakket.
 *
 * Het documentmodel dat de engine bij directe invoer teruggeeft
 * (`getDocument()`) laat `w:lang` op runs weg; daarom lezen we
 * word/document.xml en word/styles.xml zelf, eenmalig bij het laden.
 * Volgorde per alinea: de taal van de eerste tekstrun, dan de alineastijl
 * (met `basedOn`), dan de standaardstijl en `w:docDefaults`.
 *
 * Per "story" zoals de engine ze noemt: `body` voor de hoofdtekst en
 * `body:t0:r1c2` voor de cel in rij 1, kolom 2 van de eerste tabel (genest:
 * `body:t0:r0c0:t0:r0c0`). Daarnaast de plek van elke tabel in de hoofdtekst,
 * zodat het deelvenster de fouten in documentvolgorde langsloopt.
 *
 * Na bewerkingen kloppen de alinea-indexen niet meer; `wijsTalenToe` koppelt
 * daarom op tekst, en een nieuwe of gewijzigde alinea erft de taal van de
 * alinea ervoor (zoals in Word).
 */
import { strFromU8, unzipSync } from "fflate";
import { taalUitCode, type Taal } from "../talen";

export interface ModelAlinea {
  tekst: string;
  taal: Taal | null;
}

export interface Alineatalen {
  talen: Map<string, ModelAlinea[]>;
  /** Taal uit de standaardstijl of w:docDefaults, of null. */
  standaard: Taal | null;
  /** Per tabelcel-story: na hoeveel alinea's van de hoofdtekst de tabel staat. */
  plek: Map<string, number>;
}

export const leegModel = (): Alineatalen => ({ talen: new Map(), standaard: null, plek: new Map() });

const TAG = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const attr = (attrs: string, naam: string) => new RegExp(`\\b${naam}\\s*=\\s*"([^"]*)"`).exec(attrs)?.[1];

const ontsnap = (t: string) =>
  t.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e === "lt" ? "<" : e === "gt" ? ">" : e === "amp" ? "&" : e === "quot" ? '"' : e === "apos" ? "'" :
      String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)),
  );

interface Stijlen {
  standaard: Taal | null;
  vanStijl: (id: string | undefined) => Taal | null;
}

export function leesStijlen(xml: string | undefined): Stijlen {
  const stijlen = new Map<string, { id: string; basedOn?: string; taal: Taal | null; standaard: boolean; soort?: string }>();
  let docDefault: Taal | null = null;
  let huidig: { id: string; basedOn?: string; taal: Taal | null; standaard: boolean; soort?: string } | null = null;
  let inDefaults = false;
  let inRPr = false;
  for (const m of (xml ?? "").matchAll(TAG)) {
    const [, sluit, naam, attrs = "", leeg] = m;
    if (!naam) continue;
    if (naam === "w:rPrDefault") inDefaults = !sluit && !leeg;
    else if (naam === "w:style") {
      if (sluit) {
        if (huidig) stijlen.set(huidig.id, huidig);
        huidig = null;
      } else
        huidig = {
          id: attr(attrs, "w:styleId") ?? "",
          taal: null,
          standaard: /^(1|true|on)$/.test(attr(attrs, "w:default") ?? ""),
          soort: attr(attrs, "w:type"),
        };
    } else if (naam === "w:basedOn" && huidig) huidig.basedOn = attr(attrs, "w:val");
    else if (naam === "w:rPr") inRPr = !sluit && !leeg;
    else if (naam === "w:lang" && inRPr) {
      const t = taalUitCode(attr(attrs, "w:val"));
      if (huidig) huidig.taal = t;
      else if (inDefaults) docDefault = t;
    }
  }
  const cache = new Map<string, Taal | null>();
  const vanStijl = (id: string | undefined, diepte = 0): Taal | null => {
    if (!id || diepte > 20) return null;
    if (cache.has(id)) return cache.get(id)!;
    const s = stijlen.get(id);
    const t = s ? (s.taal ?? vanStijl(s.basedOn, diepte + 1)) : null;
    cache.set(id, t);
    return t;
  };
  const std = [...stijlen.values()].find((s) => s.soort === "paragraph" && s.standaard);
  return { standaard: vanStijl(std?.id) ?? docDefault, vanStijl };
}

/** Leest de alinea's met hun taal uit word/document.xml. */
export function leesAlineatalen(documentXml: string, stijlenXml?: string): Alineatalen {
  const stijlen = leesStijlen(stijlenXml);
  const talen = new Map<string, ModelAlinea[]>();
  const plek = new Map<string, number>();
  const lijst = (story: string) => {
    let l = talen.get(story);
    if (!l) talen.set(story, (l = []));
    return l;
  };
  lijst("body");
  // Stapel van stories; per story een tabelteller.
  const stories: string[] = ["body"];
  const tabellen = new Map<string, number>();
  const tabelStapel: { story: string; index: number; rij: number; kolom: number }[] = [];
  let overslaan = 0; // binnen tekstvakken, Fallback en verwijderde tekst
  let alinea: { tekst: string; stijl?: string; runTaal: Taal | null | undefined } | null = null;
  let inRun = false;
  let runTaal: Taal | null = null;
  let runTekst = false;
  let inT = false;
  for (const m of documentXml.matchAll(TAG)) {
    const [, sluit, naam, attrs = "", leeg, tekst] = m;
    if (tekst !== undefined) {
      if (inT && alinea && !overslaan) {
        const t = ontsnap(tekst);
        alinea.tekst += t;
        if (t.trim()) runTekst = true;
      }
      continue;
    }
    if (naam === "w:txbxContent" || naam === "mc:Fallback" || naam === "w:del" || naam === "w:moveFrom") {
      if (!leeg) overslaan += sluit ? -1 : 1;
      continue;
    }
    if (overslaan) continue;
    const story = stories[stories.length - 1];
    switch (naam) {
      case "w:tbl":
        if (sluit) tabelStapel.pop();
        else {
          const index = tabellen.get(story) ?? 0;
          tabellen.set(story, index + 1);
          tabelStapel.push({ story, index, rij: -1, kolom: -1 });
        }
        break;
      case "w:tr":
        if (!sluit && tabelStapel.length) {
          const t = tabelStapel[tabelStapel.length - 1];
          t.rij++;
          t.kolom = -1;
        }
        break;
      case "w:tc":
        if (sluit) stories.pop();
        else if (tabelStapel.length) {
          const t = tabelStapel[tabelStapel.length - 1];
          t.kolom++;
          const cel = `${t.story}:t${t.index}:r${t.rij}c${t.kolom}`;
          plek.set(cel, t.story === "body" ? lijst("body").length : (plek.get(t.story) ?? 0));
          lijst(cel);
          stories.push(cel);
        }
        break;
      case "w:p":
        if (leeg) lijst(story).push({ tekst: "", taal: stijlen.standaard });
        else if (!sluit) alinea = { tekst: "", runTaal: undefined };
        else if (alinea) {
          lijst(story).push({ tekst: alinea.tekst, taal: alinea.runTaal ?? stijlen.vanStijl(alinea.stijl) ?? null });
          alinea = null;
        }
        break;
      case "w:pStyle":
        if (alinea) alinea.stijl = attr(attrs, "w:val");
        break;
      case "w:r":
        if (leeg) break;
        inRun = !sluit;
        if (!sluit) {
          runTaal = null;
          runTekst = false;
        } else if (alinea && runTekst && alinea.runTaal === undefined) alinea.runTaal = runTaal;
        break;
      case "w:lang":
        if (inRun) runTaal = taalUitCode(attr(attrs, "w:val"));
        break;
      case "w:t":
        inT = !sluit && !leeg;
        break;
      case "w:tab":
        if (inRun && alinea) alinea.tekst += "\t";
        break;
    }
  }
  return { talen, standaard: stijlen.standaard, plek };
}

/** Leest de talen uit de bytes van een DOCX; een leeg model bij een fout. */
export function alineatalenUitDocx(bytes: Uint8Array | null | undefined): Alineatalen {
  if (!bytes?.length) return leegModel();
  try {
    const delen = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" || f.name === "word/styles.xml" });
    const doc = delen["word/document.xml"];
    if (!doc) return leegModel();
    return leesAlineatalen(strFromU8(doc), delen["word/styles.xml"] ? strFromU8(delen["word/styles.xml"]) : undefined);
  } catch {
    return leegModel();
  }
}

const vergelijkbaar = (t: string) => t.replace(/[￼\s]+/g, " ").trim();

/**
 * Koppelt de gelezen alinea's van een story aan het model, op tekst en in
 * volgorde. Een alinea zonder gelijke tekst (nieuw of gewijzigd) krijgt de
 * taal van de alinea ervoor; aan het begin die van de eerste modelalinea.
 */
export function wijsTalenToe(gelezen: readonly string[], model: readonly ModelAlinea[] | undefined): (Taal | null)[] {
  if (!model?.length) return gelezen.map(() => null);
  const modelTekst = model.map((m) => vergelijkbaar(m.tekst));
  const uit: (Taal | null)[] = [];
  let j = 0;
  for (let i = 0; i < gelezen.length; i++) {
    const t = vergelijkbaar(gelezen[i]);
    let gevonden = -1;
    // Vooruitkijken: verwijderde of ingevoegde alinea's overbruggen.
    for (let k = j; k < Math.min(model.length, j + 50); k++)
      if (modelTekst[k] === t) {
        gevonden = k;
        break;
      }
    const volgende = i + 1 < gelezen.length ? vergelijkbaar(gelezen[i + 1]) : null;
    if (gevonden >= 0) {
      uit.push(model[gevonden].taal);
      j = gevonden + 1;
    } else if (j < model.length && (volgende === null ? j === model.length - 1 : modelTekst[j + 1] === volgende)) {
      // Dezelfde plek, andere tekst: deze alinea is bewerkt.
      uit.push(model[j].taal);
      j++;
    } else uit.push(i > 0 ? uit[i - 1] : (model[Math.min(j, model.length - 1)]?.taal ?? null));
  }
  return uit;
}
