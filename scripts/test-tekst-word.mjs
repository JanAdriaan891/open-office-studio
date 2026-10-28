// Node-proef voor de Word-functies van Open Tekst Studio (W4):
//   #48 tabelindeling, #49 afbeelding, #29 zoeken en vervangen,
//   #28 wijzigingen, #57 versies vergelijken.
// Per functie: het proefdocument (scripts/tekst-proefdocument.mjs) openen in
// een echte engine-sessie, de bewerking uitvoeren met dezelfde code als de app
// (src/tekst/**), opslaan, de XML controleren, heropenen met de engine en
// (optioneel) met LibreOffice naar PDF renderen ter controle.
//
// Gebruik: node scripts/test-tekst-word.mjs [--zonder-libreoffice] [functie…]
//   functie: tabel, afbeelding, zoeken, wijzigingen, vergelijken (standaard: alle)
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { maakProefdocument, maakPng } from "./tekst-proefdocument.mjs";

const args = process.argv.slice(2);
const metLibreOffice = !args.includes("--zonder-libreoffice") && spawnSync("which", ["soffice"]).status === 0;
const gekozen = args.filter((a) => !a.startsWith("--"));
const doe = (functie) => !gekozen.length || gekozen.includes(functie);
const UIT = ".local/tekst-word";
await rm(UIT, { recursive: true, force: true });
await mkdir(UIT, { recursive: true });

let geslaagd = 0;
const fouten = [];
function controleer(ok, tekst) {
  if (ok) {
    geslaagd++;
    console.log(`  ok   ${tekst}`);
  } else {
    fouten.push(tekst);
    console.log(`  FOUT ${tekst}`);
  }
}

async function sessie(bytes) {
  const s = await createYrsSession();
  s.openDocx(bytes, true);
  s.beginUndoCapture();
  return s;
}

/** Een DocxEditorRef-achtige omhulling om een sessie, zoals de app hem gebruikt. */
function nepRef(s, { modus = "editing", layout = null } = {}) {
  const weergave = {
    getYrsSession: () => s,
    syncYrsInputState: () => true,
    relayout: () => {},
    getLayout: () => layout,
    getSelectionRange: () => null,
  };
  return {
    getEditorRef: () => weergave,
    commands: { getState: (id) => (id === "editingMode" ? { value: modus, enabled: true } : { enabled: true }) },
    flushPendingInput: async () => {},
    getDocument: () => null,
    readParagraphs: async (req) => s.readParagraphs(req),
    findText: async (req) => s.findText(req),
    applyEdits: async (req) => s.applyEdits(req),
  };
}

const documentXml = (bytes) => strFromU8(unzipSync(bytes)["word/document.xml"]);
async function opslaanEnHeropenen(s, naam) {
  const bytes = (await saveYrsDocx(s)).bytes;
  await writeFile(join(UIT, `${naam}.docx`), bytes);
  const terug = await sessie(bytes);
  return { bytes, xml: documentXml(bytes), terug };
}

const profiel = resolve(join(UIT, "lo-profiel"));
function pdfTekst(naam) {
  if (!metLibreOffice) return null;
  const bestand = join(UIT, `${naam}.docx`);
  spawnSync("soffice", [`-env:UserInstallation=file://${profiel}`, "--headless", "--norestore", "--nolockcheck", "--convert-to", "pdf", "--outdir", UIT, bestand], {
    encoding: "utf8",
    timeout: 300000,
  });
  const r = spawnSync("pdftotext", ["-layout", join(UIT, `${naam}.pdf`), "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  return r.status === 0 ? r.stdout : "";
}
const paginaTeksten = (tekst) => (tekst ?? "").split("\f");

/** Tabel 0 selecteren via de celselectie, zoals een klik in de cel. */
function kiesCel(s, rij, kolom, totRij = rij, totKolom = kolom, tabel = 0) {
  const verhaal = `body:t${tabel}:r${rij}c${kolom}`;
  const alinea = s.paragraphs(verhaal)[0];
  s.setSelection({ story: verhaal, paraId: alinea.paraId, offset: 0 });
  s.setCellSelection({
    anchor: { story: "body", tableIndex: tabel, row: rij, column: kolom },
    head: { story: "body", tableIndex: tabel, row: totRij, column: totKolom },
  });
}

// ---------------------------------------------------------------------------
if (doe("tabel")) {
  console.log("#48 Tabelindeling");
  const t = await import("../src/tekst/tabel/opdrachten.ts");
  const { splitsTabel, rijenPerTabel } = await import("../src/tekst/tabel/pakket.ts");
  const rijen = [["Naam", "Plaats", "Aantal"]];
  for (let i = 0; i < 45; i++) rijen.push([`Persoon ${String.fromCharCode(90 - (i % 26))}${i}`, i % 2 ? "Delft" : "Utrecht", String((i * 7) % 23)]);
  const s = await sessie(maakProefdocument({ tabelRijen: rijen }));
  const ref = nepRef(s);

  kiesCel(s, 0, 0);
  t.zetRijen(ref, { kopregel: true });
  kiesCel(s, 3, 0);
  t.zetRijen(ref, { nietAfbreken: true, hoogte: 600, regel: "exact" });
  kiesCel(s, 1, 0, 2, 2);
  t.celUitlijning(ref, "center");
  t.celMarges(ref, { top: 57, bottom: 57, left: 170, right: 170 }, true);
  t.kolommenGelijk(ref);
  kiesCel(s, 1, 2);
  t.sorteer(ref, [{ kolom: 2, soort: "getal", aflopend: true }], 1);
  let { xml, terug } = await opslaanEnHeropenen(s, "tabel-indeling");
  controleer(/<w:tr><w:trPr><w:tblHeader\/><\/w:trPr>/.test(xml), "kopregel herhalen → w:tblHeader in de eerste rij");
  controleer(/<w:cantSplit\/><w:trHeight w:val="600" w:hRule="exact"\/>/.test(xml), "rij niet afbreken + exacte rijhoogte → w:cantSplit, w:trHeight");
  controleer((xml.match(/<w:vAlign w:val="center"\/>/g) ?? []).length === 6, "verticaal centreren in 6 geselecteerde cellen → w:vAlign");
  controleer(/<w:tblCellMar><w:top w:w="57" w:type="dxa"\/><w:left w:w="170"/.test(xml), "standaardcelmarges → w:tblCellMar");
  controleer(/<w:tblLayout w:type="fixed"\/>/.test(xml) && (xml.match(/<w:gridCol w:w="2000"\/>/g) ?? []).length === 3, "kolommen gelijk verdelen → gelijk raster, vaste indeling");
  const aantallen = terug.tablePayload("body", 0).rows.slice(1, 6).map((r) => terug.paragraphs(r.cells[2].story)[0].text);
  controleer(JSON.stringify(aantallen) === JSON.stringify(["22", "22", "21", "21", "20"]), `sorteren aflopend op getal blijft na heropenen staan (${aantallen.join(", ")})`);
  controleer(terug.tablePayload("body", 0).rows[0].trPr.isHeader === true, "kopregel blijft na heropenen");
  const pdf = pdfTekst("tabel-indeling");
  if (pdf !== null) {
    const paginas = paginaTeksten(pdf);
    controleer(paginas.length >= 2 && paginas[1].includes("Naam") && paginas[1].includes("Aantal"), "LibreOffice: de kopregel staat ook bovenaan pagina 2");
  }

  // Passend maken (met een beschikbare breedte via de sectie).
  t.maakPassend(ref, "venster");
  ({ xml } = await opslaanEnHeropenen(s, "tabel-venster"));
  controleer(/<w:tblW w:w="5000" w:type="pct"\/>/.test(xml) && /<w:tblLayout w:type="autofit"\/>/.test(xml), "venster automatisch aanpassen → tblW 5000 pct, autofit");
  t.maakPassend(ref, "inhoud");
  ({ xml } = await opslaanEnHeropenen(s, "tabel-inhoud"));
  controleer(/<w:tblW w:w="0" w:type="auto"\/>/.test(xml) && /<w:tblLayout w:type="autofit"\/>/.test(xml), "inhoud automatisch aanpassen → tblW auto, autofit");

  // Ongedaan maken: één stap per bewerking.
  const voor = JSON.stringify(s.tablePayload("body", 0).grid);
  t.maakPassend(ref, "vast");
  s.undo();
  controleer(JSON.stringify(s.tablePayload("body", 0).grid) === voor && s.tablePayload("body", 0).tblPr.tableLayout === "autofit", "Ctrl+Z draait ‘vaste kolombreedte’ in één stap terug");

  // Tabel naar tekst en terug.
  const s2 = await sessie(maakProefdocument());
  const ref2 = nepRef(s2);
  kiesCel(s2, 1, 1);
  t.tabelNaarTekst(ref2, "tab");
  const regels = s2.paragraphs("body").map((p) => p.text).filter((x) => x.includes("\t"));
  controleer(regels.length === 3 && regels[1] === "Bakker\tDelft\t12" && !s2.storySegments("body").some((g) => g.embedKind === "table"), "tabel naar tekst met tabs");
  s2.undo();
  controleer(s2.storySegments("body").filter((g) => g.embedKind === "table").length === 1, "Ctrl+Z zet de tabel in één stap terug");
  const alineas = s2.paragraphs("body");
  const a = alineas.find((p) => p.text.startsWith("De kat")),
    b = alineas.find((p) => p.text.startsWith("Een tweede"));
  s2.setSelection({ story: "body", paraId: a.paraId, offset: 0 }, { story: "body", paraId: b.paraId, offset: 3 });
  await t.tekstNaarTabel(ref2, "alinea", 1);
  ({ xml, terug } = await opslaanEnHeropenen(s2, "tekst-naar-tabel"));
  controleer(terug.storySegments("body").filter((g) => g.embedKind === "table").length === 2, "tekst naar tabel: tweede tabel in het opgeslagen document");
  controleer(xml.indexOf("De kat zit op de mat.") < xml.indexOf(">Tabel<") && xml.indexOf("<w:tbl>") < xml.indexOf("De kat zit op de mat."), "tekst naar tabel: tabel staat op de plaats van de alinea’s, kop ‘Tabel’ erna");
  s2.undo();
  controleer(s2.storySegments("body").filter((g) => g.embedKind === "table").length === 1 && s2.paragraphs("body").some((p) => p.text.startsWith("De kat")), "Ctrl+Z draait tekst naar tabel in één stap terug");

  // Splitsen (pakketroute) op de gesorteerde tabel.
  const gesplitst = splitsTabel((await saveYrsDocx(s)).bytes, 0, 20);
  await writeFile(join(UIT, "tabel-gesplitst.docx"), gesplitst);
  const s3 = await sessie(gesplitst);
  controleer(JSON.stringify(rijenPerTabel(documentXml(gesplitst))) === "[20,26]", "tabel splitsen vóór rij 21 → 20 + 26 rijen");
  controleer(s3.storySegments("body").filter((g) => g.embedKind === "table").length === 2, "gesplitst document opent in de engine met twee tabellen");
  const pdf3 = pdfTekst("tabel-gesplitst");
  if (pdf3 !== null) controleer(/Persoon/.test(pdf3), "LibreOffice rendert het gesplitste document");
}

// ---------------------------------------------------------------------------
console.log(`\n${geslaagd} controles geslaagd, ${fouten.length} mislukt.`);
if (fouten.length) {
  for (const f of fouten) console.log(`  - ${f}`);
  process.exit(1);
}
export { maakPng };
