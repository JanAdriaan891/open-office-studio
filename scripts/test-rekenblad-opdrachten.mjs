// Voert de ruwe engine-opdrachten en bewerkingen van het rekenbladlint echt
// uit tegen @betteroffice/xlsx en controleert ze na opslaan en heropenen.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import * as xlsx from "@betteroffice/xlsx";
import {
  DATUMNOTATIE,
  bereikA1,
  heeftKoprij,
  serieleDatum,
  sorteerVolgorde,
  verschuifFormule,
  vervangTekst,
} from "../src/lint/rekenblad-logica.ts";

await xlsx.initWasm(
  await readFile("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"),
);
const boek = xlsx.openWorkbook(await readFile("public/templates/nieuw.xlsx"));
const blad = () => boek.sheetInfo().sheetIds[0];
const doel = (a1, sheetId = blad()) => ({ sheetId, range: { kind: "a1", a1 } });
const invoer = (b, a1) => b.rangeCells(0, a1).map((r) => r.map((c) => c.input));
function bewerk(steps, extra = {}) {
  const r = boek.applyEdits({ expectVersion: boek.version(), ...extra, steps });
  assert.ok(r.ok, JSON.stringify(r));
  return r;
}

bewerk([
  {
    op: "setCellInputs",
    target: doel("A1:C5"),
    inputs: [
      ["Naam", "Aantal", "Eenheid"],
      ["Vilt", "18", "stuks"],
      ["Latten", "60", "m"],
      ["Kratten", "10", "stuks"],
      ["Coating", "5", "liter"],
    ],
  },
]);
boek.patchRangeStyle(0, "A3:C3", { bold: true });

// Sorteren: waarden via setCellInputs, rijopmaak via applyRangeFormat.
const lezing = boek.readCells({ ranges: [doel("A1:C5")] });
const waarden = lezing.ranges[0].cells.map((r) => r.map((c) => c.value));
assert.equal(heeftKoprij(waarden), true);
const volgorde = sorteerVolgorde(waarden.slice(1), 1, false);
const oud = invoer(boek, "A1:C5");
const vorm = (r) => boek.captureFormat(0, bereikA1({ top: r, bottom: r, left: 0, right: 2 }));
const vormen = volgorde.map((bron) => vorm(1 + bron));
boek.applyOps(
  vormen.map((format, i) => ({
    type: "applyRangeFormat",
    sheet: 0,
    range: { start: { row: 1 + i, col: 0 }, end: { row: 1 + i, col: 2 } },
    format,
  })),
);
bewerk([
  {
    op: "setCellInputs",
    target: doel("A2:C5"),
    inputs: volgorde.map((bron) => oud[1 + bron]),
  },
]);
assert.deepEqual(
  invoer(boek, "A2:A5").flat(),
  ["Coating", "Kratten", "Vilt", "Latten"],
);
assert.equal(boek.selectionFormatting(0, "A5").bold, true);

// Rijen en kolommen invoegen en verwijderen; formules schuiven mee.
bewerk([{ op: "setFormulas", target: doel("B6"), formulas: [["SUM(B2:B5)"]] }]);
let r = boek.applyOps([{ type: "insertRows", sheet: 0, at: 2, count: 2 }]);
assert.ok(r.applied);
assert.equal(boek.cell(0, 7, 1).input, "=SUM(B2:B7)");
boek.applyOps([{ type: "deleteRows", sheet: 0, at: 2, count: 2 }]);
assert.equal(boek.cell(0, 5, 1).input, "=SUM(B2:B5)");
boek.applyOps([{ type: "insertCols", sheet: 0, at: 1, count: 1 }]);
assert.equal(boek.cell(0, 5, 2).input, "=SUM(C2:C5)");
boek.applyOps([{ type: "deleteCols", sheet: 0, at: 1, count: 1 }]);
assert.equal(boek.cell(0, 5, 1).input, "=SUM(B2:B5)");

// AutoSom en naar beneden doorvoeren.
bewerk([{ op: "setFormulas", target: doel("D2"), formulas: [["B2*2"]] }]);
const bron = boek.rangeCells(0, "D2")[0];
bewerk([
  {
    op: "setCellInputs",
    target: doel("D3:D5"),
    inputs: [1, 2, 3].map((dr) =>
      bron.map((c) => (c.isFormula ? `=${verschuifFormule(c.input.slice(1), dr, 0)}` : c.input)),
    ),
  },
]);
assert.equal(boek.cell(0, 4, 3).input, "=B5*2");

// Datum met Nederlandse notatie in één bewerking.
const datum = serieleDatum(new Date(2026, 9, 26)).datum;
bewerk([
  { op: "setCellInputs", target: doel("E2"), inputs: [[String(datum)]] },
  {
    op: "setNumberFormat",
    target: doel("E2"),
    format: { type: "custom", pattern: DATUMNOTATIE },
  },
]);
assert.equal(boek.readCells({ ranges: [doel("E2")] }).ranges[0].cells[0][0].displayText, "26-10-2026");

// Zoeken en vervangen.
const treffers = boek.searchText("stuks", { caseSensitive: false });
assert.equal(treffers.length, 2);
bewerk(
  treffers.map((t) => ({
    op: "setCellInputs",
    target: doel(t.a1, t.sheetId),
    inputs: [[vervangTekst(boek.cell(t.sheet, t.row, t.col).input, "stuks", "st.", false)]],
  })),
);

// Verbergen, fixeren en bladen.
boek.applyOps([
  { type: "setRowHeight", sheet: 0, row: 9, height: 0 },
  { type: "setColWidth", sheet: 0, col: 6, width: 0 },
  { type: "setFreezePane", sheet: 0, pane: { rows: 1, cols: 1, top_left: { row: 1, col: 1 } } },
  { type: "addSheet", index: 1, name: "Blad 2" },
  { type: "addSheet", index: 2, name: "Weg" },
]);
boek.applyOps([
  { type: "renameSheet", sheet: 1, name: "Overzicht" },
  { type: "removeSheet", index: 2 },
]);
assert.throws(() => boek.applyOps([{ type: "renameSheet", sheet: 1, name: "Blad 1" }]));
const verborgen = boek.exportStructured({ scope: [{ sheet: 0, range: "A1:H12" }], maxCells: 1 });
assert.deepEqual(verborgen.content.sheets[0].hiddenRows, ["10:10"]);
assert.deepEqual(verborgen.content.sheets[0].hiddenColumns, ["G:G"]);

// Wijzigingsmelding zonder geschiedenis: twee omkeerbare stappen.
const diepte = boek.historyState().undoDepth;
bewerk([{ op: "patchStyle", target: doel("A1"), patch: { bold: true } }], { history: "none" });
bewerk([{ op: "patchStyle", target: doel("A1"), patch: { bold: false } }], { history: "none" });
assert.equal(boek.historyState().undoDepth, diepte);

const bytes = boek.save();
const xml = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
assert.match(xml, /<pane xSplit="1" ySplit="1" topLeftCell="B2"[^>]*state="frozen"/);
assert.match(xml, /<row r="10"[^>]*hidden="1"/);
assert.match(xml, /<col min="7" max="7"[^>]*hidden="1"/);

const heropend = xlsx.openWorkbook(bytes);
const info = heropend.sheetInfo();
assert.deepEqual(info.sheetNames, ["Blad 1", "Overzicht"]);
assert.equal(info.frozenRows, 1);
assert.equal(info.frozenCols, 1);
assert.deepEqual(invoer(heropend, "A2:A5").flat(), ["Coating", "Kratten", "Vilt", "Latten"]);
assert.deepEqual(invoer(heropend, "C2:C5").flat(), ["liter", "st.", "st.", "m"]);
assert.equal(heropend.cell(0, 5, 1).input, "=SUM(B2:B5)");
assert.equal(heropend.cell(0, 4, 3).input, "=B5*2");
assert.equal(heropend.selectionFormatting(0, "A5").bold, true);
assert.equal(
  heropend.readCells({ ranges: [{ sheetId: info.sheetIds[0], range: { kind: "a1", a1: "E2" } }] })
    .ranges[0].cells[0][0].displayText,
  "26-10-2026",
);

// Ongedaan maken van een verwijderd blad herstelt de inhoud.
heropend.editCell(1, 0, 0, "inhoud");
heropend.applyOps([{ type: "removeSheet", index: 1 }]);
heropend.undo();
assert.equal(heropend.cell(1, 0, 0).input, "inhoud");

boek.dispose();
heropend.dispose();
console.log(
  "Rekenbladopdrachten (sorteren, rijen/kolommen, doorvoeren, datum, vervangen, verbergen, fixeren, bladen) blijven na opslaan en heropenen behouden.",
);
