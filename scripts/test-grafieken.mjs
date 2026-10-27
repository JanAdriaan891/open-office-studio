// Grafieken maken en bewerken in DOCX, XLSX en PPTX, end-to-end getoetst:
//  1. Voor elk formaat en elke grafieksoort een grafiek invoegen in de
//     voorbeelden (docs/voorbeelden) en sjablonen (public/templates).
//  2. De XML met python3 (stdlib) controleren: welgevormd, relaties en
//     inhoudstypen kloppen, unieke relatie-id's.
//  3. Met de echte engines openen, opslaan en heropenen: de grafiek blijft.
//  4. scripts/vergelijk_pakketten.py: alleen verwachte toevoegingen/wijzigingen.
//  5. Onafhankelijk met LibreOffice headless naar PDF en PNG: de grafiek wordt
//     getekend (titel in de PDF-tekst, paletkleuren in de pixels).
//  6. Optioneel het grafiekencorpus (.local/corpus/grafieken/manifest.json):
//     herkennen, een bestaande grafiek bewerken, een nieuwe invoegen, opslaan
//     en heropenen met de engines en renderen met LibreOffice.
//
// Gebruik: node scripts/test-grafieken.mjs [--zonder-libreoffice] [--zonder-corpus] [--corpus=N]
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join, basename, resolve } from "node:path";
import * as xlsx from "@betteroffice/xlsx";
import * as pptx from "@betteroffice/pptx";
import { parseDocx, repackDocx } from "@betteroffice/docx/docx";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import {
  bewerkGrafiek,
  leesGrafiek,
  lijstGrafieken,
  voegGrafiekToeDocx,
  voegGrafiekToePptx,
  voegGrafiekToeXlsx,
} from "../src/grafieken/documenten.ts";
import {
  gegevensUitRaster,
  PALET,
  SOORTEN,
  standaardModel,
} from "../src/grafieken/model.ts";

const args = new Set(process.argv.slice(2));
const metLibreOffice = !args.has("--zonder-libreoffice") && spawnSync("which", ["soffice"]).status === 0;
const corpusMax = Number([...args].find((a) => a.startsWith("--corpus="))?.split("=")[1] ?? Infinity);
const metCorpus = !args.has("--zonder-corpus");
const UIT = ".local/grafieken";
await rm(UIT, { recursive: true, force: true });
for (const map of ["invoer", "engine", "pdf", "corpus", "corpus-pdf"]) await mkdir(join(UIT, map), { recursive: true });

await xlsx.initWasm(await readFile("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
await pptx.initWasm(await readFile("node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm"));
const carlito = new Uint8Array(await readFile("node_modules/@betteroffice/fonts/assets/Carlito-Regular.ttf"));
const lettertypen = { fonts: [{ family: "Calibri", bytes: carlito }], fallbackFonts: [{ family: "Calibri", bytes: carlito }] };

const fouten = [];
const meld = (tekst) => {
  fouten.push(tekst);
  console.log(`FOUT ${tekst}`);
};
const ext = (pad) => pad.split(".").pop();

// ---------------------------------------------------------------------------
// Python-controle van de XML (alleen stdlib).
const PY_XML = String.raw`
import sys, json, zipfile, posixpath
import xml.etree.ElementTree as ET
RELNS = '{http://schemas.openxmlformats.org/package/2006/relationships}'
CTNS = '{http://schemas.openxmlformats.org/package/2006/content-types}'
def controleer(pad):
    f = []
    with zipfile.ZipFile(pad) as z:
        namen = set(n for n in z.namelist() if not n.endswith('/'))
        for n in namen:
            if n.endswith('.xml') or n.endswith('.rels'):
                try:
                    ET.fromstring(z.read(n))
                except ET.ParseError as e:
                    f.append('niet welgevormd: %s (%s)' % (n, e))
        ct = ET.fromstring(z.read('[Content_Types].xml'))
        overrides = {o.get('PartName').lstrip('/').lower() for o in ct.iter(CTNS + 'Override')}
        defaults = {d.get('Extension').lower() for d in ct.iter(CTNS + 'Default')}
        for o in overrides:
            if o not in {x.lower() for x in namen}:
                f.append('override zonder onderdeel: ' + o)
        for n in namen:
            if '/charts/chart' in n and n.endswith('.xml') and n.lower() not in overrides:
                f.append('grafiek zonder inhoudstype: ' + n)
            e = n.rsplit('.', 1)[-1].lower()
            if n.lower() not in overrides and e not in defaults:
                f.append('geen inhoudstype: ' + n)
        for n in namen:
            if not n.endswith('.rels'):
                continue
            map_, bestand = posixpath.split(n)
            bron = posixpath.join(posixpath.dirname(map_), bestand[:-5])
            ids = []
            for r in ET.fromstring(z.read(n)).iter(RELNS + 'Relationship'):
                ids.append(r.get('Id'))
                if r.get('TargetMode') == 'External':
                    continue
                doel = r.get('Target')
                doel = doel.lstrip('/') if doel.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(bron), doel))
                if doel not in namen:
                    f.append('relatie %s in %s wijst naar ontbrekend %s' % (r.get('Id'), n, doel))
            if len(ids) != len(set(ids)):
                f.append('dubbele relatie-id in ' + n)
    return f
uit = {}
for pad in sys.argv[1:]:
    try:
        uit[pad] = controleer(pad)
    except Exception as e:
        uit[pad] = ['onleesbaar: %s' % e]
print(json.dumps(uit))
`;
function pythonXml(paden) {
  const uit = {};
  for (let i = 0; i < paden.length; i += 60) {
    const r = spawnSync("python3", ["-c", PY_XML, ...paden.slice(i, i + 60)], { encoding: "utf8", maxBuffer: 64 << 20 });
    if (r.status !== 0) throw new Error(`python3 XML-controle mislukt: ${r.stderr}`);
    Object.assign(uit, JSON.parse(r.stdout));
  }
  return uit;
}

function vergelijkPakket(bron, resultaat, verwachtGewijzigd, verwachtToegevoegd) {
  const r = spawnSync("python3", ["scripts/vergelijk_pakketten.py", bron, resultaat, ...verwachtGewijzigd.flatMap((v) => ["--verwacht-gewijzigd", v])], { encoding: "utf8" });
  if (r.status === 2) return { ok: false, reden: r.stderr.trim() };
  const rapport = JSON.parse(r.stdout);
  const vreemd = rapport.toegevoegd.filter((n) => !verwachtToegevoegd.some((p) => p.test(n)));
  const ok = !rapport.verwijderd.length && !rapport.onverwacht_gewijzigd.length && !vreemd.length;
  return { ok, rapport, vreemd };
}

// ---------------------------------------------------------------------------
// LibreOffice: PDF, tekst en pixels.
const profiel = resolve(join(UIT, "lo-profiel"));
function naarPdf(bestanden, map) {
  for (let i = 0; i < bestanden.length; i += 12) {
    const r = spawnSync("soffice", [`-env:UserInstallation=file://${profiel}`, "--headless", "--norestore", "--nolockcheck", "--convert-to", "pdf", "--outdir", map, ...bestanden.slice(i, i + 12)], { encoding: "utf8", timeout: 600000 });
    if (r.error) console.log(`LibreOffice: ${r.error.message}`);
  }
}
const pdfVan = (bestand, map) => join(map, basename(bestand).replace(/\.[^.]+$/, ".pdf"));
function pdfTekst(pdf) {
  const r = spawnSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  return r.status === 0 ? r.stdout : "";
}
/** Pagina's van een PDF als RGB-rasters (PPM via pdftoppm, 40 dpi). */
function paginas(pdf) {
  const voorvoegsel = join(UIT, `pix-${process.pid}-${Math.random().toString(36).slice(2)}`);
  if (spawnSync("pdftoppm", ["-r", "40", pdf, voorvoegsel]).status !== 0) return [];
  const uit = [];
  for (let pagina = 1; pagina < 500; pagina++) {
    const pad = [1, 2, 3].map((n) => `${voorvoegsel}-${String(pagina).padStart(n, "0")}.ppm`).find(existsSync);
    if (!pad) break;
    const b = execFileSync("cat", [pad], { maxBuffer: 256 << 20 });
    spawnSync("rm", ["-f", pad]);
    let pos = 0;
    const veld = () => {
      while (b[pos] === 32 || b[pos] === 10 || b[pos] === 13 || b[pos] === 9) pos++;
      let s = "";
      while (!(b[pos] === 32 || b[pos] === 10 || b[pos] === 13 || b[pos] === 9)) s += String.fromCharCode(b[pos++]);
      return s;
    };
    veld();
    const breedte = Number(veld()), hoogte = Number(veld());
    veld();
    pos++;
    uit.push({ breedte, hoogte, data: b.subarray(pos, pos + breedte * hoogte * 3) });
  }
  return uit;
}
const KLEUREN = PALET.slice(0, 7).map((h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)));
const lijktPalet = (d, p) => KLEUREN.some(([r, g, b]) => Math.abs(d[p] - r) < 28 && Math.abs(d[p + 1] - g) < 28 && Math.abs(d[p + 2] - b) < 28);
/** Pixels in paletkleur, en pixels die verschillen van de weergave zonder grafiek. */
function pixelmeting(pdf, basis) {
  const nieuw = paginas(pdf);
  let palet = 0, verschil = 0;
  nieuw.forEach((pg, i) => {
    const oud = basis[i];
    const zelfdeMaat = oud && oud.breedte === pg.breedte && oud.hoogte === pg.hoogte;
    for (let p = 0; p + 2 < pg.data.length; p += 3) {
      if (lijktPalet(pg.data, p) && !(zelfdeMaat && lijktPalet(oud.data, p))) palet++;
      if (!zelfdeMaat || Math.abs(pg.data[p] - oud.data[p]) + Math.abs(pg.data[p + 1] - oud.data[p + 1]) + Math.abs(pg.data[p + 2] - oud.data[p + 2]) > 60) verschil++;
    }
  });
  return { palet, verschil, paginas: nieuw.length };
}

// ---------------------------------------------------------------------------
// Bronnen en modellen.
const BRONNEN = [
  "docs/voorbeelden/Materiaaloverzicht.xlsx",
  "public/templates/nieuw.xlsx",
  "docs/voorbeelden/Ontwerpnotitie.docx",
  "public/templates/nieuw.docx",
  "docs/voorbeelden/Ontwerpvisie.pptx",
  "public/templates/nieuw.pptx",
];
const GEGEVENS = [
  ["", "Beton", "Staal", "Hout"],
  ["2023", "12,5", "8", "4,25"],
  ["2024", "14", "9,25", "5"],
  ["2025", "15,75", "11", "6,5"],
  ["2026", "17", "10,5", "7"],
];
const titelVan = (soort) => `Proef ${soort}`;
function model(soort, data) {
  return standaardModel({
    soort,
    titel: titelVan(soort),
    ondertitel: "OpenAEC grafiekproef",
    asTitelX: soort === "taart" || soort === "ring" ? "" : "Jaar",
    asTitelY: soort === "taart" || soort === "ring" ? "" : "Ton",
    asTitelY2: soort === "combinatie" ? "Hout" : "",
    gegevenslabels: soort === "taart" || soort === "kolom",
    decimalen: 1,
    ...data,
  });
}

/** Zet de proefgegevens in een leeg blad met de engine; geeft bytes en celgegevens. */
function vulRekenblad(bytes) {
  const boek = xlsx.openWorkbook(bytes);
  GEGEVENS.forEach((rij, r) =>
    rij.forEach((w, k) => {
      if (w !== "") boek.editCell(0, r, k, r > 0 ? w.replace(",", ".") : w);
    }),
  );
  const uit = boek.save();
  boek.dispose();
  return uit;
}
/** Leest een bereik met de engine, zoals het lint dat via readCells doet. */
function leesCellen(bytes, blad, top, left, bottom, right) {
  const boek = xlsx.openWorkbook(bytes);
  const info = boek.sheetInfo();
  const lezing = boek.readCells({
    ranges: [{ sheetId: info.sheetIds[blad], range: { kind: "rowCol", start: { row: top, col: left }, end: { row: bottom, col: right } } }],
  });
  boek.dispose();
  if (!lezing.ok) throw new Error(lezing.failure.message);
  const rijen = lezing.ranges[0].cells;
  return {
    naam: info.sheetNames[blad],
    cellen: rijen.map((r) => r.map((c) => (c.value.kind === "number" ? c.value.value : c.value.kind === "text" ? c.value.value : null))),
    weergave: rijen.map((r) => r.map((c) => c.displayText ?? "")),
  };
}

// ---------------------------------------------------------------------------
// Engines: openen, opslaan, heropenen.
function engineXlsx(bytes, blad, titel) {
  const boek = xlsx.openWorkbook(bytes);
  boek.setActiveSheet(blad);
  const regio = (boek.displayList({ x: 0, y: 0, width: 6000, height: 4000 }).charts ?? []).find((c) => c.label.startsWith(titel));
  const opgeslagen = boek.save();
  boek.dispose();
  const terug = xlsx.openWorkbook(opgeslagen);
  terug.setActiveSheet(blad);
  const heropend = (terug.displayList({ x: 0, y: 0, width: 6000, height: 4000 }).charts ?? []).some((c) => c.label.startsWith(titel));
  terug.dispose();
  return { opgeslagen, getoond: !!regio, getekend: !!regio && !regio.placeholder, heropend };
}
function enginePptx(bytes, dia, titel) {
  const deck = pptx.openPresentation(bytes, lettertypen);
  const zoek = (p) => (p.kind === "chart" ? p : (p.primitives ?? []).map(zoek).find(Boolean));
  const grafiekOp = (d) => (d.layoutSlide(dia).primitives ?? []).map(zoek).find((c) => c?.label?.startsWith(titel));
  const getoond = !!grafiekOp(deck);
  const opgeslagen = deck.save();
  const terug = pptx.openPresentation(opgeslagen, lettertypen);
  const heropend = !!grafiekOp(terug);
  return { opgeslagen, getoond, getekend: getoond, heropend };
}
async function engineDocx(bytes) {
  const doc = await parseDocx(bytes, { preloadFonts: false });
  const getoond = JSON.stringify(doc.package.document).includes('"type":"chart"');
  const herverpakt = new Uint8Array(await repackDocx(doc));
  const sessie = await createYrsSession();
  sessie.openDocx(bytes, true);
  const opgeslagen = (await saveYrsDocx(sessie)).bytes;
  sessie.destroy?.();
  const terug = await parseDocx(opgeslagen, { preloadFonts: false });
  const heropend = JSON.stringify(terug.package.document).includes('"type":"chart"');
  return { opgeslagen, herverpakt, getoond, getekend: getoond, heropend };
}

// ---------------------------------------------------------------------------
// Deel 1: invoegen per formaat en soort.
const proeven = [];
const telling = { ingevoegd: 0, xmlOk: 0, engineOk: 0, getekendEngine: 0, behouden: 0, pakketOk: 0, loTitel: 0, loPixels: 0 };
const VERWACHT_TOE = [/^(xl|word|ppt)\/(charts|drawings|embeddings)\//, /^(xl|word|ppt)\/(charts|drawings)\/_rels\//, /^xl\/worksheets\/(_rels\/)?sheet\d+\.xml(\.rels)?$/];

for (const bron of BRONNEN) {
  const formaat = ext(bron);
  let basis = new Uint8Array(await readFile(bron));
  let data;
  let blad = 0;
  if (formaat === "xlsx") {
    if (bron.includes("nieuw")) {
      basis = vulRekenblad(basis);
      const { naam, cellen, weergave } = leesCellen(basis, 0, 0, 0, 4, 3);
      data = () => gegevensUitRaster(cellen, { koprij: true, kopkolom: true, reeksenIn: "kolommen" }, { blad: naam, top: 0, left: 0 }, weergave, true);
    } else {
      // Materiaaloverzicht: prijzen (F) en totalen (G) van rij 6–14; voor XY de prijs als X.
      const { naam, cellen, weergave } = leesCellen(basis, 0, 5, 5, 13, 6);
      data = (soort) =>
        gegevensUitRaster(cellen, { koprij: true, kopkolom: soort === "spreiding", reeksenIn: "kolommen" }, { blad: naam, top: 5, left: 5 }, weergave, true);
    }
  } else data = () => gegevensUitRaster(GEGEVENS, { koprij: true, kopkolom: true, reeksenIn: "kolommen" });
  const basisPad = join(UIT, "invoer", `basis-${basename(bron)}`);
  await writeFile(basisPad, basis);
  for (const { soort } of SOORTEN) {
    const naam = `${basename(bron).replace(/\.[^.]+$/, "")}-${soort}.${formaat}`;
    const m = model(soort, typeof data === "function" ? data(soort) : data);
    let r;
    try {
      if (formaat === "xlsx") r = voegGrafiekToeXlsx(basis, m, { blad, col: 7, row: 1 });
      else if (formaat === "docx") r = voegGrafiekToeDocx(basis, m, {});
      else r = voegGrafiekToePptx(basis, m, { dia: 0 });
    } catch (e) {
      meld(`${naam}: invoegen mislukt: ${e.message}`);
      continue;
    }
    telling.ingevoegd++;
    const pad = join(UIT, "invoer", naam);
    await writeFile(pad, r.bytes);
    const proef = { naam, formaat, soort, pad, basisPad, titel: m.titel };
    // Engine-rondgang.
    try {
      const e = formaat === "xlsx" ? engineXlsx(r.bytes, r.blad ?? 0, m.titel) : formaat === "pptx" ? enginePptx(r.bytes, 0, m.titel) : await engineDocx(r.bytes);
      proef.engine = { getoond: e.getoond, getekend: e.getekend, heropend: e.heropend };
      const na = lijstGrafieken(e.opgeslagen, formaat);
      proef.behouden = na.some((g) => g.titel === m.titel && g.soort === soort);
      if (e.herverpakt) proef.behouden &&= lijstGrafieken(e.herverpakt, formaat).some((g) => g.titel === m.titel && g.soort === soort);
      await writeFile(join(UIT, "engine", naam), e.opgeslagen);
      if (e.getoond && e.heropend) telling.engineOk++;
      else meld(`${naam}: engine toont of heropent de grafiek niet (${JSON.stringify(proef.engine)})`);
      if (e.getekend) telling.getekendEngine++;
      if (proef.behouden) telling.behouden++;
      else meld(`${naam}: grafiek na opslaan met de engine niet meer gevonden`);
    } catch (e) {
      meld(`${naam}: engine-fout: ${e.message}`);
    }
    // Pakketvergelijking.
    const gewijzigd = {
      xlsx: ["[Content_Types].xml", "xl/worksheets/sheet1.xml", "xl/worksheets/_rels/sheet1.xml.rels"],
      docx: ["[Content_Types].xml", "word/document.xml", "word/_rels/document.xml.rels"],
      pptx: ["[Content_Types].xml", "ppt/slides/slide1.xml", "ppt/slides/_rels/slide1.xml.rels"],
    }[formaat];
    const v = vergelijkPakket(basisPad, pad, gewijzigd, VERWACHT_TOE);
    proef.pakket = v.ok ? "alleen verwachte verschillen" : JSON.stringify({ ...v.rapport, vreemd: v.vreemd });
    if (v.ok) telling.pakketOk++;
    else meld(`${naam}: onverwachte pakketverschillen ${proef.pakket}`);
    proeven.push(proef);
  }
}

// XML-controle.
const xmlUitslag = pythonXml(proeven.map((p) => p.pad));
for (const p of proeven) {
  p.xml = xmlUitslag[p.pad];
  if (!p.xml.length) telling.xmlOk++;
  else meld(`${p.naam}: XML: ${p.xml.join("; ")}`);
}

// LibreOffice.
let loVersie = "niet uitgevoerd";
if (metLibreOffice) {
  loVersie = spawnSync("soffice", ["--version"], { encoding: "utf8" }).stdout.trim();
  const pdfMap = join(UIT, "pdf");
  const basissen = [...new Set(proeven.map((p) => p.basisPad))];
  naarPdf([...basissen, ...proeven.map((p) => p.pad)], pdfMap);
  const basisRasters = Object.fromEntries(basissen.map((b) => [b, paginas(pdfVan(b, pdfMap))]));
  for (const p of proeven) {
    const pdf = pdfVan(p.pad, pdfMap);
    if (!existsSync(pdf)) {
      meld(`${p.naam}: LibreOffice maakte geen PDF`);
      continue;
    }
    const tekst = pdfTekst(pdf);
    p.loTitel = tekst.includes(p.titel);
    p.loPixels = pixelmeting(pdf, basisRasters[p.basisPad]);
    if (p.loTitel) telling.loTitel++;
    else meld(`${p.naam}: grafiektitel niet in de PDF-tekst van LibreOffice`);
    // Getekend: duidelijk andere pixels dan zonder grafiek én nieuwe paletkleur (reeksen).
    if (p.loPixels.verschil > 1500 && p.loPixels.palet > 40) telling.loPixels++;
    else meld(`${p.naam}: grafiek niet zichtbaar in de LibreOffice-weergave (${JSON.stringify(p.loPixels)})`);
  }
  // Eén PNG per formaat ter inzage.
  for (const p of proeven.filter((x) => x.soort === "combinatie")) {
    const pdf = pdfVan(p.pad, pdfMap);
    // De pagina met de grafiektitel.
    let pagina = 1;
    for (let n = 1; n < 50; n++) {
      const r = spawnSync("pdftotext", ["-f", String(n), "-l", String(n), pdf, "-"], { encoding: "utf8" });
      if (r.status !== 0) break;
      if (r.stdout.includes(p.titel)) {
        pagina = n;
        break;
      }
    }
    spawnSync("pdftoppm", ["-r", "60", "-png", "-singlefile", "-f", String(pagina), "-l", String(pagina), pdf, join(pdfMap, p.naam.replace(".", "-"))]);
  }
}

// ---------------------------------------------------------------------------
// Deel 2: corpus.
const corpus = { aanwezig: false };
const manifestPad = ".local/corpus/grafieken/manifest.json";
if (metCorpus && existsSync(manifestPad)) {
  const manifest = JSON.parse(await readFile(manifestPad, "utf8"));
  const items = (manifest.bestanden ?? manifest).filter((i) => i.status === "geldig" && existsSync(i.bestand)).slice(0, corpusMax);
  Object.assign(corpus, { aanwezig: true, bestanden: items.length, perFormaat: {}, grafiekenManifest: 0, grafiekenHerkend: 0, bewerkbaar: 0, soorten: {}, weigering: {}, geweigerdeSoorten: {}, loBewerkt: 0, bewerkt: 0, ingevoegd: 0, engineOk: 0, engineBehouden: 0, xmlOk: 0, loPdf: 0, loTitel: 0, problemen: [] });
  const resultaten = [];
  for (const item of items) {
    const formaat = item.formaat;
    corpus.perFormaat[formaat] = (corpus.perFormaat[formaat] ?? 0) + 1;
    corpus.grafiekenManifest += item.klassiek ?? item.grafieken ?? 0;
    const rij = { id: item.id, formaat };
    let bytes = new Uint8Array(await readFile(item.bestand));
    try {
      const lijst = lijstGrafieken(bytes, formaat);
      rij.herkend = lijst.length;
      corpus.grafiekenHerkend += lijst.length;
      for (const g of lijst) {
        if (g.bewerkbaar) {
          corpus.bewerkbaar++;
          corpus.soorten[g.soort] = (corpus.soorten[g.soort] ?? 0) + 1;
        } else {
          const r = (g.reden ?? "onbekend").replace(/\s*\(.*\)/, "").trim();
          corpus.weigering[r] = (corpus.weigering[r] ?? 0) + 1;
          try {
            for (const groep of leesGrafiek(bytes, g.chartPad).groepen.filter((x) => !/^(bar|line|area|pie|doughnut|scatter)Chart$/.test(x)))
              corpus.geweigerdeSoorten[groep] = (corpus.geweigerdeSoorten[groep] ?? 0) + 1;
          } catch {
            corpus.geweigerdeSoorten.onleesbaar = (corpus.geweigerdeSoorten.onleesbaar ?? 0) + 1;
          }
        }
      }
      // Een bestaande grafiek bewerken: titel en (bij gewone kolommen) soort.
      const eerste = lijst.find((g) => g.bewerkbaar);
      let nieuwModel;
      if (eerste) {
        const gelezen = leesGrafiek(bytes, eerste.chartPad);
        const m = { ...gelezen.model, titel: "OpenAEC bewerkt" };
        bytes = bewerkGrafiek(bytes, formaat, eerste.chartPad, m);
        corpus.bewerkt++;
        rij.bewerkt = eerste.chartPad;
        nieuwModel = { ...gelezen.model, soort: gelezen.model.soort === "spreiding" ? "spreiding" : "kolom", titel: "OpenAEC nieuw", ondertitel: "" };
      }
      // Een nieuwe grafiek invoegen.
      const proefModel = model("kolom", gegevensUitRaster(GEGEVENS, { koprij: true, kopkolom: true, reeksenIn: "kolommen" }));
      proefModel.titel = "OpenAEC nieuw";
      let r;
      if (formaat === "xlsx") {
        // Met verwijzingen naar dezelfde cellen als de bewerkte grafiek, onder zijn anker.
        try {
          if (nieuwModel && eerste?.blad !== undefined) r = voegGrafiekToeXlsx(bytes, nieuwModel, { blad: eerste.blad, col: eerste.anker?.van.col ?? 0, row: (eerste.anker?.tot.row ?? 0) + 2 });
          else r = voegGrafiekToeXlsx(bytes, proefModel, { blad: 0, col: 0, row: 0 });
        } catch (e) {
          // Bijvoorbeeld een grafiekblad: dan op een nieuw werkblad, met de gegevens in de grafiek zelf.
          if (!/gewoon werkblad/.test(e.message)) throw e;
          rij.nieuwBlad = true;
          r = voegGrafiekToeXlsx(bytes, proefModel, { blad: { nieuw: "OpenAEC grafiek" }, col: 1, row: 1 });
        }
      } else if (formaat === "docx") r = voegGrafiekToeDocx(bytes, proefModel, {});
      else r = voegGrafiekToePptx(bytes, proefModel, { dia: 0 });
      bytes = r.bytes;
      corpus.ingevoegd++;
      const pad = join(UIT, "corpus", `${item.id}.${formaat}`);
      await writeFile(pad, bytes);
      rij.pad = pad;
      rij.bronPad = item.bestand;
      // Engines.
      const voor = lijstGrafieken(bytes, formaat).length;
      let opgeslagen;
      if (formaat === "xlsx") {
        const boek = xlsx.openWorkbook(bytes);
        opgeslagen = boek.save();
        boek.dispose();
        xlsx.openWorkbook(opgeslagen).dispose();
      } else if (formaat === "pptx") {
        const deck = pptx.openPresentation(bytes, lettertypen);
        deck.layoutSlide(0);
        opgeslagen = deck.save();
        pptx.openPresentation(opgeslagen, lettertypen);
      } else {
        const sessie = await createYrsSession();
        sessie.openDocx(bytes, true);
        opgeslagen = (await saveYrsDocx(sessie)).bytes;
        sessie.destroy?.();
        await parseDocx(opgeslagen, { preloadFonts: false });
      }
      corpus.engineOk++;
      const na = lijstGrafieken(opgeslagen, formaat);
      rij.engineVoor = voor;
      rij.engineNa = na.length;
      if (na.length === voor && na.some((g) => g.titel === "OpenAEC nieuw") && (!eerste || na.some((g) => g.titel === "OpenAEC bewerkt"))) corpus.engineBehouden++;
      else corpus.problemen.push(`${item.id}: na opslaan met de engine ${na.length} van ${voor} grafieken`);
    } catch (e) {
      rij.fout = e.message;
      corpus.problemen.push(`${item.id}: ${e.message}`);
    }
    resultaten.push(rij);
  }
  // XML: alleen nieuwe fouten tellen (sommige bronbestanden zijn zelf al afwijkend).
  const metPad = resultaten.filter((r) => r.pad);
  const xmlNa = pythonXml(metPad.map((r) => r.pad));
  const xmlVoor = pythonXml(metPad.map((r) => r.bronPad));
  for (const r of metPad) {
    const nieuw = xmlNa[r.pad].filter((f) => !xmlVoor[r.bronPad].includes(f));
    r.xmlNieuw = nieuw;
    if (!nieuw.length) corpus.xmlOk++;
    else corpus.problemen.push(`${r.id}: XML ${nieuw.join("; ")}`);
  }
  if (metLibreOffice) {
    const map = join(UIT, "corpus-pdf");
    naarPdf(metPad.map((r) => r.pad), map);
    for (const r of metPad) {
      const pdf = pdfVan(r.pad, map);
      if (!existsSync(pdf)) {
        corpus.problemen.push(`${r.id}: LibreOffice maakte geen PDF`);
        continue;
      }
      corpus.loPdf++;
      const tekst = pdfTekst(pdf);
      // Grafiektekst staat in de PDF vaak verspreid over regels; zoek woorden, niet de exacte titel.
      r.loTitel = /OpenAEC/.test(tekst) && /nieuw/.test(tekst);
      if (r.bewerkt && /bewerkt/.test(tekst)) corpus.loBewerkt++;
      if (r.loTitel) corpus.loTitel++;
      else corpus.problemen.push(`${r.id}: titel van de nieuwe grafiek niet in de PDF-tekst`);
    }
  }
  corpus.resultaten = resultaten;
}

// ---------------------------------------------------------------------------
const verslag = { datum: new Date().toISOString(), libreoffice: loVersie, telling, proeven, corpus, fouten };
await writeFile(join(UIT, "resultaat.json"), JSON.stringify(verslag, null, 2));
console.log(`\nProeven: ${proeven.length} (${SOORTEN.length} soorten × ${BRONNEN.length} bestanden)`);
console.log(JSON.stringify(telling));
if (corpus.aanwezig) {
  const { resultaten, problemen, ...kort } = corpus;
  console.log("Corpus:", JSON.stringify(kort));
  console.log(`Corpusproblemen (${problemen.length}):\n  ${problemen.slice(0, 40).join("\n  ")}`);
}
console.log(`Resultaat: ${join(UIT, "resultaat.json")}`);
process.exitCode = fouten.length ? 1 : 0;
