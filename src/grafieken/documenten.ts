/**
 * Grafieken invoegen, opsommen, bijwerken en verwijderen in XLSX-, DOCX- en
 * PPTX-pakketten. Alle functies zijn puur: bytes erin, bytes eruit.
 */
import { GrafiekFout, LIMIETEN } from "./fouten.ts";
import {
  grafiekXml,
  leesGrafiekXml,
  werkGrafiekXmlBij,
  zetExterneData,
  externeDataId,
  NS_A,
  NS_C,
  NS_R,
  type GelezenGrafiek,
} from "./chartxml.ts";
import { controleerModel, type GrafiekModel, type GrafiekSoort } from "./model.ts";
import { Pakket, REL, TYPE } from "./pakket.ts";
import { ingeslotenWerkboek, metIngeslotenVerwijzingen } from "./werkboek.ts";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  pad,
  rid as ridVan,
  tekstVan,
  vervang,
  voorvoegselVoor,
  zoekAlle,
  type Vervanging,
  type XmlElement,
} from "./xml.ts";

export type Formaat = "xlsx" | "docx" | "pptx";

const NS = {
  xdr: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
  ssml: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  w14: "http://schemas.microsoft.com/office/word/2010/wordml",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
};
const GRAFIEK_URI = "http://schemas.openxmlformats.org/drawingml/2006/chart";

export interface GrafiekVerwijzing {
  formaat: Formaat;
  /** Pad van het grafiekonderdeel, bijvoorbeeld `xl/charts/chart1.xml`. */
  chartPad: string;
  /** Onderdeel dat naar de grafiek verwijst (tekening, document of dia). */
  houderPad: string;
  rid: string;
  /** Naam van het object (cNvPr/docPr). */
  naam: string;
  /** Rekenblad: bladindex en -naam; presentatie: dia-index (0-gebaseerd). */
  blad?: number;
  bladNaam?: string;
  ankerIndex?: number;
  /** Ankerbereik in cellen (0-gebaseerd), alleen bij een twoCellAnchor. */
  anker?: { van: { col: number; row: number }; tot: { col: number; row: number } };
  dia?: number;
  /** cNvPr-id van het grafiekframe op de dia. */
  vormId?: number;
  /** Rangnummer van de grafiek in het document (docx), en de paraId van zijn alinea. */
  volgnummer?: number;
  paraId?: string;
  titel: string;
  soort?: GrafiekSoort;
  bewerkbaar: boolean;
  reden?: string;
}

// ---------------------------------------------------------------------------
// Algemeen

function hoofdDeel(pakket: Pakket) {
  const rel = pakket.relaties("").find((r) => r.type === REL.officeDocument);
  // relaties("") leest "_rels/.rels".
  if (!rel) throw new GrafiekFout("Het document mist zijn hoofdonderdeel.");
  return Pakket.doelPad("", rel.target);
}

const grafiekFragment = (rid: string) =>
  `<a:graphicData uri="${GRAFIEK_URI}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${ontsnap(rid)}"/></a:graphicData>`;

function wortelAttrToevoegen(xml: string, wortel: XmlElement, extra: string): Vervanging | null {
  if (!extra) return null;
  const p = wortel.leeg ? wortel.inhoudStart - 2 : wortel.inhoudStart - 1;
  return { start: p, eind: p, tekst: extra };
}

/** Maakt het grafiekonderdeel (en voor DOCX/PPTX het ingesloten werkboek). */
function maakGrafiekdeel(pakket: Pakket, map: "xl" | "word" | "ppt", model: GrafiekModel) {
  controleerModel(model);
  const aantal = pakket.namen().filter((n) => /\/charts\/chart\d*\.xml$/i.test(n)).length;
  if (aantal >= LIMIETEN.grafiekenPerPakket)
    throw new GrafiekFout(`Dit document bevat al ${aantal} grafieken; meer wordt niet ondersteund.`);
  const chartPad = pakket.vrijPad(`${map}/charts/chart#.xml`);
  if (map === "xl") {
    pakket.schrijf(chartPad, grafiekXml(model));
  } else {
    const ingesloten = metIngeslotenVerwijzingen(model);
    const werkboekPad = pakket.vrijPad(`${map}/embeddings/Microsoft_Excel_Worksheet#.xlsx`);
    pakket.schrijf(werkboekPad, ingeslotenWerkboek(model));
    pakket.voegDefaultToe("xlsx", TYPE.xlsx);
    // De rels moeten bestaan voordat we de id kennen; schrijf de grafiek erna.
    pakket.schrijf(chartPad, "");
    const rid = pakket.voegRelatieToe(chartPad, REL.package, werkboekPad);
    pakket.schrijf(chartPad, grafiekXml(ingesloten, { externeData: rid }));
  }
  pakket.voegOverrideToe(chartPad, TYPE.chart);
  return chartPad;
}

// ---------------------------------------------------------------------------
// Rekenblad

interface Blad {
  naam: string;
  pad: string;
  index: number;
}
function bladen(pakket: Pakket): { werkboek: string; bladen: Blad[] } {
  const werkboek = hoofdDeel(pakket);
  const wortel = leesXml(pakket.lees(werkboek));
  const lijst = kinderen(kind(wortel, "sheets"), "sheet");
  return {
    werkboek,
    bladen: lijst.map((s, index) => ({
      naam: attr(s, "name") ?? `Blad${index + 1}`,
      pad: pakket.doel(werkboek, ridVan(s) ?? "") ?? "",
      index,
    })),
  };
}

export function bladnamen(bytes: Uint8Array) {
  return bladen(new Pakket(bytes)).bladen.map((b) => b.naam);
}

function voegBladToe(pakket: Pakket, naam: string): Blad {
  const { werkboek, bladen: lijst } = bladen(pakket);
  const schoon = naam.trim();
  if (!schoon || schoon.length > 31 || /[\\/?*[\]:]/.test(schoon) || /^'|'$/.test(schoon))
    throw new GrafiekFout("Ongeldige bladnaam: hoogstens 31 tekens, zonder \\ / ? * [ ] :");
  if (lijst.some((b) => b.naam.toLowerCase() === schoon.toLowerCase()))
    throw new GrafiekFout(`Er bestaat al een blad met de naam ‘${schoon}’.`);
  const pad = pakket.vrijPad("xl/worksheets/sheet#.xml");
  pakket.schrijf(
    pad,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${NS.ssml}" xmlns:r="${NS_R}"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`,
  );
  pakket.voegOverrideToe(pad, TYPE.worksheet);
  const rid = pakket.voegRelatieToe(werkboek, REL.worksheet, pad);
  const xml = pakket.lees(werkboek);
  const wortel = leesXml(xml);
  const sheets = kind(wortel, "sheets");
  if (!sheets) throw new GrafiekFout("Het werkboek heeft geen bladenlijst.");
  const max = kinderen(sheets, "sheet").reduce((m, s) => Math.max(m, Number(attr(s, "sheetId") ?? 0)), 0);
  const pre = voorvoegselVoor(wortel, NS.ssml);
  const rPre = voorvoegselVoor(wortel, NS_R);
  const w: Vervanging[] = [];
  let rNaam = rPre;
  if (rNaam === null) {
    rNaam = "r";
    w.push(wortelAttrToevoegen(xml, wortel, ` xmlns:r="${NS_R}"`)!);
  }
  const tag = `${pre ? pre + ":" : ""}sheet`;
  w.push({
    start: sheets.inhoudEind,
    eind: sheets.inhoudEind,
    tekst: `<${tag}${attrTekst({ name: schoon, sheetId: max + 1, [`${rNaam}:id`]: rid })}/>`,
  });
  pakket.schrijf(werkboek, vervang(xml, w));
  return { naam: schoon, pad, index: lijst.length };
}

/** Tekening van een blad; maakt er een aan als die ontbreekt. */
function tekeningVan(pakket: Pakket, blad: Blad) {
  const xml = pakket.lees(blad.pad);
  const wortel = leesXml(xml);
  const bestaand = kind(wortel, "drawing");
  if (bestaand) {
    const doel = pakket.doel(blad.pad, ridVan(bestaand) ?? "");
    if (doel && pakket.heeft(doel)) return doel;
    throw new GrafiekFout("De tekening van dit blad ontbreekt of is beschadigd.");
  }
  const tekening = pakket.vrijPad("xl/drawings/drawing#.xml");
  pakket.schrijf(
    tekening,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NS.xdr}" xmlns:a="${NS_A}"></xdr:wsDr>`,
  );
  pakket.voegOverrideToe(tekening, TYPE.drawing);
  const rid = pakket.voegRelatieToe(blad.pad, REL.drawing, tekening);
  const pre = voorvoegselVoor(wortel, NS.ssml);
  let rNaam = voorvoegselVoor(wortel, NS_R);
  const w: Vervanging[] = [];
  if (rNaam === null || rNaam === "") {
    rNaam = "r";
    w.push(wortelAttrToevoegen(xml, wortel, ` xmlns:r="${NS_R}"`)!);
  }
  const na = new Set(["legacyDrawing", "legacyDrawingHF", "drawingHF", "picture", "oleObjects", "controls", "webPublishItems", "tableParts", "extLst"]);
  const volgende = elementen(wortel).find((e) => na.has(e.lokaal));
  const p = volgende ? volgende.start : wortel.inhoudEind;
  w.push({ start: p, eind: p, tekst: `<${pre ? pre + ":" : ""}drawing ${rNaam}:id="${rid}"/>` });
  pakket.schrijf(blad.pad, vervang(xml, w));
  return tekening;
}

function maxId(el: XmlElement, lokaal: string) {
  return zoekAlle(el, lokaal).reduce((m, e) => Math.max(m, Number(attr(e, "id")) || 0), 0);
}

export interface XlsxPlaatsing {
  /** Bladindex, of een nieuw blad met deze naam. */
  blad: number | { nieuw: string };
  /** Linkerbovenhoek (0-gebaseerd) en grootte in kolommen/rijen. */
  col: number;
  row: number;
  kolommen?: number;
  rijen?: number;
}

export function voegGrafiekToeXlsx(bytes: Uint8Array, model: GrafiekModel, plaatsing: XlsxPlaatsing) {
  const pakket = new Pakket(bytes);
  const lijst = bladen(pakket).bladen;
  const blad =
    typeof plaatsing.blad === "number"
      ? lijst[plaatsing.blad]
      : voegBladToe(pakket, plaatsing.blad.nieuw);
  if (!blad || !blad.pad || !pakket.heeft(blad.pad))
    throw new GrafiekFout("Het gekozen blad bestaat niet of is geen werkblad.");
  if (!/^\s*<\?xml[^>]*\?>\s*<(\w+:)?worksheet\b|^\s*<(\w+:)?worksheet\b/.test(pakket.lees(blad.pad)))
    throw new GrafiekFout("Een grafiek kan alleen op een gewoon werkblad worden geplaatst.");
  // Niet in een vastgezet deel ankeren: daar wordt de grafiek afgekapt.
  const paneel = pad(leesXml(pakket.lees(blad.pad)), "sheetViews", "sheetView", "pane");
  const vast = /^frozen/.test(attr(paneel, "state") ?? "");
  const vastRijen = vast ? Math.floor(Number(attr(paneel, "ySplit")) || 0) : 0;
  const vastKolommen = vast ? Math.floor(Number(attr(paneel, "xSplit")) || 0) : 0;
  const chartPad = maakGrafiekdeel(pakket, "xl", model);
  const tekening = tekeningVan(pakket, blad);
  const rid = pakket.voegRelatieToe(tekening, REL.chart, chartPad);
  const xml = pakket.lees(tekening);
  const wortel = leesXml(xml);
  const x = voorvoegselVoor(wortel, NS.xdr);
  if (x === null) throw new GrafiekFout("De tekening van dit blad is beschadigd.");
  const t = (n: string) => (x ? `${x}:${n}` : n);
  const aOk = voorvoegselVoor(wortel, NS_A) === "a";
  const id = maxId(wortel, "cNvPr") + 1;
  const col = Math.max(vastKolommen, Math.floor(plaatsing.col));
  const row = Math.max(vastRijen, Math.floor(plaatsing.row));
  const tot = { col: col + (plaatsing.kolommen ?? 8), row: row + (plaatsing.rijen ?? 16) };
  const punt = (n: string, c: number, r: number) =>
    `<${t(n)}><${t("col")}>${c}</${t("col")}><${t("colOff")}>0</${t("colOff")}><${t("row")}>${r}</${t("row")}><${t("rowOff")}>0</${t("rowOff")}></${t(n)}>`;
  const naam = `Grafiek ${id}`;
  const anker =
    `<${t("twoCellAnchor")} editAs="oneCell"${aOk ? "" : ` xmlns:a="${NS_A}"`}>` +
    punt("from", col, row) +
    punt("to", tot.col, tot.row) +
    `<${t("graphicFrame")} macro=""><${t("nvGraphicFramePr")}><${t("cNvPr")}${attrTekst({ id, name: naam, descr: model.titel || undefined })}/><${t("cNvGraphicFramePr")}/></${t("nvGraphicFramePr")}>` +
    `<${t("xfrm")}><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></${t("xfrm")}>` +
    `<a:graphic>${grafiekFragment(rid)}</a:graphic></${t("graphicFrame")}><${t("clientData")}/></${t("twoCellAnchor")}>`;
  const w: Vervanging[] = [];
  if (wortel.leeg)
    w.push({ start: wortel.start, eind: wortel.eind, tekst: xml.slice(wortel.start, wortel.inhoudStart - 2) + ">" + anker + `</${wortel.naam}>` });
  else w.push({ start: wortel.inhoudEind, eind: wortel.inhoudEind, tekst: anker });
  pakket.schrijf(tekening, vervang(xml, w));
  return { bytes: pakket.inpakken(), blad: blad.index, chartPad, naam, cel: { row, col } };
}

function grafiekenXlsx(pakket: Pakket): GrafiekVerwijzing[] {
  const uit: GrafiekVerwijzing[] = [];
  for (const blad of bladen(pakket).bladen) {
    if (!blad.pad || !pakket.heeft(blad.pad)) continue;
    let wortel: XmlElement;
    try {
      wortel = leesXml(pakket.lees(blad.pad));
    } catch {
      continue;
    }
    const tekeningEl = kind(wortel, "drawing");
    const tekening = tekeningEl ? pakket.doel(blad.pad, ridVan(tekeningEl) ?? "") : null;
    if (!tekening || !pakket.heeft(tekening)) continue;
    const tw = leesXml(pakket.lees(tekening));
    elementen(tw).forEach((anker, ankerIndex) => {
      for (const c of zoekAlle(anker, "chart")) {
        const rid = ridVan(c);
        const chartPad = rid ? pakket.doel(tekening, rid) : null;
        if (!rid || !chartPad || !pakket.heeft(chartPad)) continue;
        const cNvPr = zoekAlle(anker, "cNvPr")[0];
        const van = kind(anker, "from"), tot = kind(anker, "to");
        const getal = (el: XmlElement | null, n: string) => Number(kind(el, n)?.kinderen.map((k) => (k.soort === "tekst" ? k.tekst : "")).join("") ?? NaN);
        uit.push({
          formaat: "xlsx",
          chartPad,
          houderPad: tekening,
          rid,
          naam: attr(cNvPr, "name") ?? "Grafiek",
          blad: blad.index,
          bladNaam: blad.naam,
          ankerIndex,
          anker: van && tot ? { van: { col: getal(van, "col"), row: getal(van, "row") }, tot: { col: getal(tot, "col"), row: getal(tot, "row") } } : undefined,
          ...samenvatting(pakket, chartPad),
        });
      }
    });
  }
  return uit;
}

// ---------------------------------------------------------------------------
// Tekst

export interface DocxPlaatsing {
  /** w14:paraId van de alinea waarna (of waarin, als die leeg is) de grafiek komt. */
  paraId?: string | null;
  /** Als de paraId niet (meer) bestaat: de eerste alinea met precies deze tekst. */
  alineaTekst?: string;
  /** Breedte in EMU; standaard de tekstbreedte, hoogstens 16 cm. */
  breedte?: number;
  hoogte?: number;
}

function docPrMax(pakket: Pakket) {
  let max = 0;
  for (const n of pakket.namen())
    if (/^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/.test(n))
      for (const m of pakket.lees(n).matchAll(/<(?:\w+:)?docPr\b[^>]*?\sid="(\d+)"/g)) max = Math.max(max, Number(m[1]));
  return max;
}
function nieuweParaId() {
  return Math.floor(Math.random() * 0x7ffffffe + 1).toString(16).toUpperCase().padStart(8, "0");
}

export function voegGrafiekToeDocx(bytes: Uint8Array, model: GrafiekModel, plaatsing: DocxPlaatsing = {}) {
  const pakket = new Pakket(bytes);
  const doc = hoofdDeel(pakket);
  const xml = pakket.lees(doc);
  const wortel = leesXml(xml);
  if (voorvoegselVoor(wortel, NS.w) !== "w")
    throw new GrafiekFout("Dit document gebruikt een afwijkende XML-schrijfwijze; de grafiek kan niet veilig worden ingevoegd.");
  const body = kind(wortel, "body");
  if (!body) throw new GrafiekFout("Het document heeft geen hoofdtekst.");
  // Tekstbreedte uit de laatste sectie.
  const sect = zoekAlle(body, "sectPr").pop();
  const twips = (el: XmlElement | null, n: string) => Number(attr(el, n)) || 0;
  const pagina = twips(kind(sect, "pgSz"), "w") || 11906;
  const marge = twips(kind(sect, "pgMar"), "left") + twips(kind(sect, "pgMar"), "right") || 2880;
  const tekstbreedte = Math.max(1440, pagina - marge) * 635;
  const cx = Math.round(plaatsing.breedte ?? Math.min(tekstbreedte, 5760000));
  const cy = Math.round(plaatsing.hoogte ?? cx * 0.6);

  const chartPad = maakGrafiekdeel(pakket, "word", model);
  const rid = pakket.voegRelatieToe(doc, REL.chart, chartPad);
  const id = docPrMax(pakket) + 1;
  const naam = `Grafiek ${id}`;
  const wpOk = voorvoegselVoor(wortel, NS.wp) === "wp";
  const aOk = voorvoegselVoor(wortel, NS_A) === "a";
  const tekening =
    `<w:drawing${wpOk ? "" : ` xmlns:wp="${NS.wp}"`}><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr${attrTekst({ id, name: naam, descr: model.titel || undefined })}/><wp:cNvGraphicFramePr/>` +
    `<a:graphic${aOk ? "" : ` xmlns:a="${NS_A}"`}>${grafiekFragment(rid)}</a:graphic></wp:inline></w:drawing>`;
  const run = `<w:r>${tekening}</w:r>`;
  const w14 = voorvoegselVoor(wortel, NS.w14);
  const paraId = nieuweParaId();
  const paraAttr = w14 ? ` ${w14}:paraId="${paraId}" ${w14}:textId="77777777"` : "";
  const alinea = `<w:p${paraAttr}><w:pPr><w:jc w:val="center"/></w:pPr>${run}</w:p>`;

  const w: Vervanging[] = [];
  const alineas = zoekAlle(body, "p").filter((p) => p.voorvoegsel === "w");
  const alineaTekst = (p: XmlElement) => zoekAlle(p, "t").filter((t) => t.voorvoegsel === "w").map(tekstVan).join("");
  const doelAlinea =
    (plaatsing.paraId
      ? alineas.find((p) => attr(p, "paraId")?.toUpperCase() === plaatsing.paraId!.toUpperCase())
      : undefined) ??
    (plaatsing.alineaTekst?.trim()
      ? alineas.find((p) => alineaTekst(p) === plaatsing.alineaTekst)
      : undefined);
  let gebruiktParaId: string | undefined = w14 ? paraId : undefined;
  if (doelAlinea) {
    const leeg = !elementen(doelAlinea).some((e) => e.lokaal !== "pPr");
    if (leeg) {
      gebruiktParaId = attr(doelAlinea, "paraId");
      if (doelAlinea.leeg)
        w.push({ start: doelAlinea.start, eind: doelAlinea.eind, tekst: xml.slice(doelAlinea.start, doelAlinea.inhoudStart - 2) + ">" + run + "</w:p>" });
      else w.push({ start: doelAlinea.inhoudEind, eind: doelAlinea.inhoudEind, tekst: run });
    } else w.push({ start: doelAlinea.eind, eind: doelAlinea.eind, tekst: alinea });
  } else {
    const slot = elementen(body).filter((e) => e.lokaal === "sectPr").pop();
    const p = slot ? slot.start : body.inhoudEind;
    w.push({ start: p, eind: p, tekst: alinea });
  }
  pakket.schrijf(doc, vervang(xml, w));
  return { bytes: pakket.inpakken(), chartPad, naam, paraId: gebruiktParaId };
}

/**
 * De tabel waarin de alinea met deze paraId staat, als raster van celteksten
 * (samengevoegde cellen worden herhaald als lege cellen). Null zonder tabel.
 */
export function tabelBijAlinea(bytes: Uint8Array, paraId: string, alineaTekst?: string): string[][] | null {
  const pakket = new Pakket(bytes);
  const wortel = leesXml(pakket.lees(hoofdDeel(pakket)));
  const alineas = zoekAlle(wortel, "p").filter((p) => p.voorvoegsel === "w");
  const tekst = (el: XmlElement) => zoekAlle(el, "t").filter((t) => t.voorvoegsel === "w").map(tekstVan).join("");
  const p =
    alineas.find((x) => attr(x, "paraId")?.toUpperCase() === paraId.toUpperCase()) ??
    (alineaTekst?.trim() ? alineas.find((x) => tekst(x) === alineaTekst) : undefined);
  let tabel: XmlElement | null = p?.ouder ?? null;
  while (tabel && tabel.lokaal !== "tbl") tabel = tabel.ouder;
  if (!tabel) return null;
  const raster = kinderen(tabel, "tr").map((tr) =>
    kinderen(tr, "tc").flatMap((tc) => {
      const span = Number(attr(pad(tc, "tcPr", "gridSpan"), "val")) || 1;
      const t = kinderen(tc, "p").map(tekst).join(" ").trim();
      return [t, ...Array(Math.max(0, Math.min(span, 50) - 1)).fill("")];
    }),
  );
  const breedte = Math.max(0, ...raster.map((r) => r.length));
  if (!raster.length || breedte < 2) return null;
  if (raster.length * breedte > LIMIETEN.cellen) throw new GrafiekFout("De tabel is te groot voor een grafiek.");
  return raster.map((r) => [...r, ...Array(breedte - r.length).fill("")]);
}

function grafiekenDocx(pakket: Pakket): GrafiekVerwijzing[] {
  const doc = hoofdDeel(pakket);
  const wortel = leesXml(pakket.lees(doc));
  const uit: GrafiekVerwijzing[] = [];
  zoekAlle(wortel, "chart").forEach((c) => {
    const rid = ridVan(c);
    const chartPad = rid ? pakket.doel(doc, rid) : null;
    if (!rid || !chartPad || !pakket.heeft(chartPad)) return;
    // In mc:AlternateContent staat de grafiek alleen in de Choice; Fallback heeft een afbeelding.
    let alinea: XmlElement | null = c.ouder;
    let houder: XmlElement | null = null;
    while (alinea && !(alinea.lokaal === "p" && alinea.voorvoegsel === "w")) {
      if (alinea.lokaal === "inline" || alinea.lokaal === "anchor") houder = alinea;
      alinea = alinea.ouder;
    }
    const docPr = kind(houder, "docPr");
    uit.push({
      formaat: "docx",
      chartPad,
      houderPad: doc,
      rid,
      naam: attr(docPr, "name") ?? `Grafiek ${uit.length + 1}`,
      volgnummer: uit.length,
      paraId: attr(alinea, "paraId"),
      ...samenvatting(pakket, chartPad),
    });
  });
  return uit;
}

// ---------------------------------------------------------------------------
// Presentatie

function dias(pakket: Pakket) {
  const pres = hoofdDeel(pakket);
  const wortel = leesXml(pakket.lees(pres));
  const ids = kinderen(kind(wortel, "sldIdLst"), "sldId");
  const sz = kind(wortel, "sldSz");
  return {
    pres,
    breedte: Number(attr(sz, "cx")) || 12192000,
    hoogte: Number(attr(sz, "cy")) || 6858000,
    dias: ids.map((s) => pakket.doel(pres, ridVan(s) ?? "") ?? ""),
  };
}

export interface PptxPlaatsing {
  dia: number;
  /** EMU; standaard gecentreerd. */
  x?: number;
  y?: number;
  breedte?: number;
  hoogte?: number;
}

export function voegGrafiekToePptx(bytes: Uint8Array, model: GrafiekModel, plaatsing: PptxPlaatsing) {
  const pakket = new Pakket(bytes);
  const info = dias(pakket);
  const dia = info.dias[plaatsing.dia];
  if (!dia || !pakket.heeft(dia)) throw new GrafiekFout("De gekozen dia bestaat niet.");
  const xml = pakket.lees(dia);
  const wortel = leesXml(xml);
  if (voorvoegselVoor(wortel, NS.p) !== "p")
    throw new GrafiekFout("Deze dia gebruikt een afwijkende XML-schrijfwijze; de grafiek kan niet veilig worden ingevoegd.");
  const boom = pad(wortel, "cSld", "spTree");
  if (!boom) throw new GrafiekFout("De dia heeft geen vormenlijst.");
  const cx = Math.round(plaatsing.breedte ?? Math.min(info.breedte * 0.7, 8229600));
  const cy = Math.round(plaatsing.hoogte ?? Math.min(cx * 0.6, info.hoogte * 0.75));
  const x = Math.round(plaatsing.x ?? (info.breedte - cx) / 2);
  const y = Math.round(plaatsing.y ?? (info.hoogte - cy) / 2);
  const chartPad = maakGrafiekdeel(pakket, "ppt", model);
  const rid = pakket.voegRelatieToe(dia, REL.chart, chartPad);
  const id = maxId(wortel, "cNvPr") + 1;
  const naam = `Grafiek ${id}`;
  const aOk = voorvoegselVoor(wortel, NS_A) === "a";
  const frame =
    `<p:graphicFrame${aOk ? "" : ` xmlns:a="${NS_A}"`}><p:nvGraphicFramePr><p:cNvPr${attrTekst({ id, name: naam, descr: model.titel || undefined })}/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm><a:graphic>${grafiekFragment(rid)}</a:graphic></p:graphicFrame>`;
  const ext = kind(boom, "extLst");
  const p = ext ? ext.start : boom.inhoudEind;
  pakket.schrijf(dia, vervang(xml, [{ start: p, eind: p, tekst: frame }]));
  return { bytes: pakket.inpakken(), chartPad, naam, vormId: id, dia: plaatsing.dia };
}

function grafiekenPptx(pakket: Pakket): GrafiekVerwijzing[] {
  const uit: GrafiekVerwijzing[] = [];
  dias(pakket).dias.forEach((dia, index) => {
    if (!dia || !pakket.heeft(dia)) return;
    const wortel = leesXml(pakket.lees(dia));
    for (const frame of zoekAlle(wortel, "graphicFrame")) {
      const c = zoekAlle(frame, "chart")[0];
      const rid = ridVan(c);
      const chartPad = rid ? pakket.doel(dia, rid) : null;
      if (!rid || !chartPad || !pakket.heeft(chartPad)) continue;
      const cNvPr = zoekAlle(frame, "cNvPr")[0];
      uit.push({
        formaat: "pptx",
        chartPad,
        houderPad: dia,
        rid,
        naam: attr(cNvPr, "name") ?? "Grafiek",
        dia: index,
        vormId: Number(attr(cNvPr, "id")),
        ...samenvatting(pakket, chartPad),
      });
    }
  });
  return uit;
}

// ---------------------------------------------------------------------------
// Opsommen, lezen, bijwerken, verwijderen

function samenvatting(pakket: Pakket, chartPad: string) {
  try {
    const g = leesGrafiekXml(pakket.lees(chartPad));
    return { titel: g.model.titel, soort: g.model.soort, bewerkbaar: g.bewerkbaar, reden: g.reden };
  } catch (e) {
    return { titel: "", bewerkbaar: false, reden: e instanceof Error ? e.message : String(e) };
  }
}

export function lijstGrafieken(bytes: Uint8Array, formaat: Formaat): GrafiekVerwijzing[] {
  const pakket = new Pakket(bytes);
  if (formaat === "xlsx") return grafiekenXlsx(pakket);
  if (formaat === "docx") return grafiekenDocx(pakket);
  return grafiekenPptx(pakket);
}

export function leesGrafiek(bytes: Uint8Array, chartPad: string): GelezenGrafiek {
  const pakket = new Pakket(bytes);
  return leesGrafiekXml(pakket.lees(chartPad));
}

/**
 * Werkt een bestaande grafiek bij. Voor DOCX/PPTX wordt het ingesloten
 * werkboek vervangen door de nieuwe gegevens; in XLSX moeten de verwijzingen
 * in het model naar de cellen van het werkboek wijzen.
 */
export function bewerkGrafiek(bytes: Uint8Array, formaat: Formaat, chartPad: string, model: GrafiekModel) {
  const pakket = new Pakket(bytes);
  if (!pakket.heeft(chartPad)) throw new GrafiekFout("De grafiek bestaat niet meer in het document.");
  const oud = pakket.lees(chartPad);
  if (formaat === "xlsx") {
    pakket.schrijf(chartPad, werkGrafiekXmlBij(oud, model));
    return pakket.inpakken();
  }
  const ingesloten = metIngeslotenVerwijzingen(model);
  let xml = werkGrafiekXmlBij(oud, ingesloten);
  const rid = externeDataId(xml);
  const doel = rid ? pakket.doel(chartPad, rid) : null;
  if (doel && /\.xlsx$/i.test(doel) && pakket.heeft(doel)) {
    pakket.schrijf(doel, ingeslotenWerkboek(model));
  } else {
    const map = chartPad.split("/")[0];
    const werkboekPad = pakket.vrijPad(`${map}/embeddings/Microsoft_Excel_Worksheet#.xlsx`);
    pakket.schrijf(werkboekPad, ingeslotenWerkboek(model));
    pakket.voegDefaultToe("xlsx", TYPE.xlsx);
    if (rid) pakket.verwijderRelatie(chartPad, rid);
    const nieuw = pakket.voegRelatieToe(chartPad, REL.package, werkboekPad);
    xml = zetExterneData(xml, nieuw);
  }
  pakket.schrijf(chartPad, xml);
  return pakket.inpakken();
}

/** Verwijdert een grafiekobject en, als niets er meer naar verwijst, zijn onderdelen. */
export function verwijderGrafiek(bytes: Uint8Array, formaat: Formaat, verwijzing: Pick<GrafiekVerwijzing, "houderPad" | "rid" | "chartPad">) {
  const pakket = new Pakket(bytes);
  const xml = pakket.lees(verwijzing.houderPad);
  const wortel = leesXml(xml);
  const c = zoekAlle(wortel, "chart").find((e) => ridVan(e) === verwijzing.rid);
  if (!c) throw new GrafiekFout("De grafiek is niet gevonden.");
  let weg: XmlElement | null = null;
  for (let e: XmlElement | null = c; e; e = e.ouder) {
    if (formaat === "xlsx" && e.ouder === wortel) weg = e;
    if (formaat === "pptx" && e.lokaal === "graphicFrame") weg = e;
    if (formaat === "docx" && e.lokaal === "r" && e.voorvoegsel === "w") weg = e;
    if (formaat === "docx" && e.lokaal === "AlternateContent") weg = e;
    if (weg && (formaat !== "docx" || e.lokaal === "r")) break;
  }
  if (!weg) throw new GrafiekFout("Het grafiekobject kan niet worden verwijderd.");
  pakket.schrijf(verwijzing.houderPad, vervang(xml, [{ start: weg.start, eind: weg.eind, tekst: "" }]));
  // Alleen opruimen als geen ander element dezelfde relatie gebruikt.
  const nogGebruikt = zoekAlle(leesXml(pakket.lees(verwijzing.houderPad)), "chart").some((e) => ridVan(e) === verwijzing.rid);
  if (!nogGebruikt) pakket.verwijderRelatie(verwijzing.houderPad, verwijzing.rid);
  if (!pakket.verwijzingenNaar(verwijzing.chartPad).length) {
    for (const r of pakket.relaties(verwijzing.chartPad)) {
      if (r.extern) continue;
      const doel = Pakket.doelPad(verwijzing.chartPad, r.target);
      const anderen = pakket.verwijzingenNaar(doel).filter((x) => x.deel !== verwijzing.chartPad);
      if (!anderen.length) {
        pakket.verwijder(doel);
        pakket.verwijderOverride(doel);
      }
    }
    pakket.verwijder(Pakket.relsPad(verwijzing.chartPad));
    pakket.verwijderOverride(Pakket.relsPad(verwijzing.chartPad));
    pakket.verwijder(verwijzing.chartPad);
    pakket.verwijderOverride(verwijzing.chartPad);
  }
  return pakket.inpakken();
}
