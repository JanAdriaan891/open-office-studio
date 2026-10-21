import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import * as xlsx from "@betteroffice/xlsx";
import * as pptx from "@betteroffice/pptx";
import { parseDocx, repackDocx } from "@betteroffice/docx/docx";
await mkdir(".local/controledocumenten", { recursive: true });
await xlsx.initWasm(
  await readFile(
    "node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm",
  ),
);
const boek = xlsx.openWorkbook(await readFile("public/templates/nieuw.xlsx"));
boek.editCell(0, 0, 0, "12");
boek.editCell(0, 1, 0, "30");
boek.editCell(0, 2, 0, "=SUM(A1:A2)");
assert.equal(boek.cell(0, 2, 0).input, "=SUM(A1:A2)");
const werkblad = boek.save();
const xml = strFromU8(unzipSync(werkblad)["xl/worksheets/sheet1.xml"]);
assert.match(
  xml,
  /<c\b[^>]*r="A3"[^>]*>[\s\S]*?<f>SUM\(A1:A2\)<\/f>[\s\S]*?<v>42<\/v>/,
);
await writeFile(".local/controledocumenten/rekenproef.xlsx", werkblad);
const opnieuw = xlsx.openWorkbook(werkblad);
assert.equal(opnieuw.cell(0, 2, 0).input, "=SUM(A1:A2)");
boek.dispose();
opnieuw.dispose();
await pptx.initWasm(
  await readFile(
    "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
  ),
);
const deck = pptx.openPresentation(
  await readFile("public/templates/nieuw.pptx"),
);
const snapshot = deck.snapshot();
assert.equal(snapshot.slides.length, 1);
const verhaal = snapshot.slides[0].shapes[0].textStories[0];
deck.insertText(verhaal.id, 0, "Getest: ");
const bewaard = deck.save();
const heropend = pptx.openPresentation(bewaard);
assert.equal(
  heropend
    .snapshot()
    .slides[0].shapes[0].textStories[0].paragraphs[0].runs.map((r) => r.text)
    .join(""),
  "Getest: Titel van de presentatie",
);
await writeFile(".local/controledocumenten/presentatieproef.pptx", deck.save());
console.log(
  "Calc-formule en gewijzigde presentatietekst zijn na opslaan en heropenen behouden.",
);

const document = await parseDocx(
  await readFile("public/templates/nieuw.docx"),
  { preloadFonts: false },
);
const alinea = {
  type: "paragraph",
  content: [
    {
      type: "run",
      formatting: { bold: true },
      content: [{ type: "text", text: "OpenAEC Writer controle." }],
    },
  ],
};
document.package.document.content = [alinea];
document.package.document.sections[0].content = [alinea];
const docxBytes = new Uint8Array(await repackDocx(document));
await writeFile(".local/controledocumenten/documentproef.docx", docxBytes);
const documentOpnieuw = await parseDocx(docxBytes, { preloadFonts: false });
assert.equal(
  documentOpnieuw.package.document.content[0].content[0].content[0].text,
  "OpenAEC Writer controle.",
);
assert.equal(
  documentOpnieuw.package.document.content[0].content[0].formatting.bold,
  true,
);
console.log("Writer-tekst en vetopmaak zijn na opslaan en heropenen behouden.");
