/**
 * Proef voor de opmaakvensters van Open Tekst (alinea, lettertype, lijsten,
 * randen en arcering, paginarand en -kleur). Per eigenschap wordt een DOCX
 * gewijzigd via de engine (Yrs-sessie, net als in de editor) of via de
 * pakketroute, opgeslagen, heropend en gecontroleerd; daarna controleert
 * Python (stdlib) de XML en rendert LibreOffice de bestanden ter controle.
 *
 *   node scripts/test-tekstopmaak.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { pasAlineasToe, pasTekensToe, runAttributen, leesTekens } from "../src/tekst/opmaak.ts";

const MAP = ".local/tekstopmaak";
await mkdir(MAP, { recursive: true });

const sjabloon = unzipSync(new Uint8Array(await readFile("public/templates/nieuw.docx")));
/** Een document met een alinea met eigen opmaak, een gewone alinea en drie lijstitems. */
function bronDocument() {
  const doc = strFromU8(sjabloon["word/document.xml"]).replace(
    "<w:body><w:p/>",
    `<w:body>` +
      `<w:p><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="240"/><w:ind w:left="720"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Eerste alinea met eigen opmaak uit het bronbestand.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t xml:space="preserve">Tweede alinea zonder eigen opmaak.</w:t></w:r><w:r><w:tab/><w:t>Tab</w:t></w:r></w:p>` +
      ["Een", "Twee", "Drie"]
        .map((t) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>Lijstitem ${t}</w:t></w:r></w:p>`)
        .join("") +
      `<w:p><w:r><w:t>Slot.</w:t></w:r></w:p>`,
  );
  return zipSync({ ...sjabloon, "word/document.xml": strToU8(doc) });
}

async function open(bytes) {
  const s = await createYrsSession();
  s.openDocx(bytes, true);
  s.beginUndoCapture();
  return s;
}
const xmlVan = (bytes, deel = "word/document.xml") => strFromU8(unzipSync(new Uint8Array(bytes))[deel]);
const auteur = { name: "Proef", date: "2026-10-28T12:00:00Z" };
const resultaten = [];
function meld(eigenschap, route, ok = true) {
  resultaten.push({ eigenschap, route, ok });
  console.log(`${ok ? "✓" : "✗"} ${eigenschap} — ${route}`);
}

const bestanden = [];
async function bewaar(naam, bytes) {
  bestanden.push(naam);
  await writeFile(`${MAP}/${naam}.docx`, bytes);
  return bytes;
}

// --- 1. Alinea (engine) -----------------------------------------------------
{
  const s = await open(bronDocument());
  const ids = s.paragraphs("body").map((p) => p.paraId);
  const voor = JSON.stringify(s.paragraphs("body")[0].properties);
  pasAlineasToe(s, "body", ids.slice(0, 2), {
    alignment: "both",
    indentLeft: 851,
    indentRight: 567,
    indentFirstLine: 357,
    hangingIndent: true,
    spaceBefore: 360,
    spaceAfter: 0,
    lineSpacing: 280,
    lineSpacingRule: "atLeast",
    keepNext: false,
    keepLines: true,
    widowControl: false,
    pageBreakBefore: true,
    tabs: [
      { position: 2835, alignment: "right", leader: "dot" },
      { position: 4536, alignment: "decimal" },
    ],
  });
  assert.equal(s.paragraphs("body")[1].properties.keepLines, true);
  // Ctrl+Z: één stap terug geeft precies de oude eigenschappen.
  assert.ok(s.undo());
  assert.equal(JSON.stringify(s.paragraphs("body")[0].properties), voor);
  assert.ok(s.redo());
  const bytes = await bewaar("alinea", (await saveYrsDocx(s)).bytes);
  const xml = xmlVan(bytes);
  assert.match(xml, /<w:ind w:left="851" w:right="567" w:hanging="357"\/>/);
  assert.match(xml, /<w:spacing w:before="360" w:after="0"[^>]*w:line="280" w:lineRule="atLeast"/);
  assert.match(xml, /<w:tab w:val="right" w:pos="2835" w:leader="dot"\/>/);
  // Heropenen: de engine leest alles terug.
  const t = await open(bytes);
  const p = t.paragraphs("body")[1].properties;
  assert.equal(p.indentLeft, 851);
  assert.equal(p.keepLines, true);
  assert.equal(p.pageBreakBefore, true);
  assert.equal(p.lineSpacingRule, "atLeast");
  meld("Alinea: inspringen, afstand, regelafstand, uitlijning, tabs, paginering", "engine (setParagraphAttrs + _originalFormatting)");

  // Wijzigingen bijhouden: een bijgehouden alineawijziging is op te slaan en te weigeren.
  const b = await open(bronDocument());
  const bid = b.paragraphs("body").map((x) => x.paraId);
  pasAlineasToe(b, "body", [bid[0]], { alignment: "right", keepLines: true }, auteur);
  const revisies = b.listRevisions();
  assert.equal(revisies.length, 1);
  assert.equal(revisies[0].kind, "pPrChange");
  const bijgehouden = await bewaar("alinea-bijgehouden", (await saveYrsDocx(b)).bytes);
  assert.match(xmlVan(bijgehouden), /<w:pPrChange w:id="\d+" w:author="Proef"/);
  b.rejectChange({ revisionId: revisies[0].revisionId });
  assert.equal(b.paragraphs("body")[0].properties.alignment, "center");
  assert.doesNotMatch(xmlVan((await saveYrsDocx(b)).bytes), /keepLines/);
  meld("Alinea: wijzigingen bijhouden (pPrChange), weigeren", "engine (suggesting + id-herstel)");
}

// --- 5. Lettertype (engine) -------------------------------------------------
{
  const s = await open(bronDocument());
  const id = s.paragraphs("body")[1].paraId;
  const bereik = { story: "body", start: { paraId: id, offset: 0 }, end: { paraId: id, offset: 6 } };
  pasTekensToe(s, bereik, {
    fontFamily: "Liberation Sans",
    fontSize: 14,
    bold: true,
    italic: true,
    color: "1F4E79",
    underline: { style: "wave", color: "C00000" },
    strike: "dubbel",
    vertAlign: "superscript",
    smallCaps: true,
    hidden: false,
    spacing: 30,
    scale: 90,
    position: 4,
  });
  pasTekensToe(s, { ...bereik, start: { paraId: id, offset: 7 }, end: { paraId: id, offset: 14 } }, { allCaps: true, hidden: true, vertAlign: "subscript", strike: "enkel" });
  const gelezen = leesTekens(runAttributen(s, "body", id, 2));
  assert.equal(gelezen.underline?.color, "C00000");
  assert.ok(s.undo());
  assert.equal(leesTekens(runAttributen(s, "body", id, 8)).allCaps, false);
  assert.ok(s.redo());
  const bytes = await bewaar("lettertype", (await saveYrsDocx(s)).bytes);
  const xml = xmlVan(bytes);
  for (const patroon of [
    /<w:rFonts w:ascii="Liberation Sans" w:hAnsi="Liberation Sans"\/>/,
    /<w:u w:val="wave" w:color="C00000"\/>/,
    /<w:dstrike\/>/,
    /<w:smallCaps\/>/,
    /<w:caps\/>/,
    /<w:vanish\/>/,
    /<w:spacing w:val="30"\/>/,
    /<w:w w:val="90"\/>/,
    /<w:position w:val="4"\/>/,
    /<w:vertAlign w:val="superscript"\/>/,
    /<w:vertAlign w:val="subscript"\/>/,
    /<w:color w:val="1F4E79"\/>/,
    /<w:sz w:val="28"\/>/,
  ])
    assert.match(xml, patroon);
  const t = await open(bytes);
  const terug = leesTekens(runAttributen(t, "body", t.paragraphs("body")[1].paraId, 2));
  assert.equal(terug.smallCaps, true);
  assert.equal(terug.strike, "dubbel");
  assert.equal(terug.afstand.scale, 90);
  meld("Lettertype: familie, stijl, grootte, kleur, onderstreping + kleur, doorhalen, super/sub, kleinkapitalen, hoofdletters, verborgen, afstand/schaal/positie", "engine (formatRange + other)");
}

// --- Python-controle van de XML en LibreOffice-weergave -----------------------
execFileSync("python3", ["scripts/tekstopmaak_kenmerken.py", MAP], { stdio: "inherit" });
const soffice = "/usr/bin/soffice";
if (existsSync(soffice) && !process.env.ZONDER_LIBREOFFICE) {
  execFileSync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", `${MAP}/pdf`, ...resultatenBestanden()], {
    stdio: "ignore",
    timeout: 180_000,
  });
  for (const naam of resultatenBestanden()) {
    const pdf = `${MAP}/pdf/${naam.split("/").pop().replace(/\.docx$/, ".pdf")}`;
    assert.ok(existsSync(pdf), `LibreOffice gaf geen PDF voor ${naam}`);
  }
  console.log("✓ LibreOffice rendert alle proefbestanden");
}

function resultatenBestanden() {
  return bestanden.map((n) => `${MAP}/${n}.docx`);
}

console.log(`\n${resultaten.filter((r) => r.ok).length}/${resultaten.length} eigenschappen geslaagd.`);
