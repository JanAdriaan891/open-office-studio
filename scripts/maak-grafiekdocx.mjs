// Maakt een klein, eigen DOCX met één staafgrafiek (letterlijke waarden, geen
// ingesloten werkmap) voor de conversieproef DOCX-met-grafiek → PDF.
// Uitvoer: src-tauri/tests/grafiek.docx
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export function maakGrafiekDocx() {
  const delen = unzipSync(readFileSync("public/templates/nieuw.docx"));
  const document = strFromU8(delen["word/document.xml"]);
  const tekening = `<w:p><w:r><w:t>Materiaalkosten per categorie</w:t></w:r></w:p><w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="5486400" cy="3200400"/><wp:docPr id="1" name="Grafiek 1"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdGrafiek1"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  delen["word/document.xml"] = strToU8(
    document.replace("<w:body><w:p/>", `<w:body>${tekening}`),
  );
  delen["word/_rels/document.xml.rels"] = strToU8(
    strFromU8(delen["word/_rels/document.xml.rels"]).replace(
      "</Relationships>",
      '<Relationship Id="rIdGrafiek1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml"/></Relationships>',
    ),
  );
  delen["[Content_Types].xml"] = strToU8(
    strFromU8(delen["[Content_Types].xml"]).replace(
      "</Types>",
      '<Override PartName="/word/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>',
    ),
  );
  const categorieen = [
    "Plaatmateriaal",
    "Constructie",
    "Afwerking",
    "Verbindingen",
  ];
  const waarden = [924, 525, 1155.5, 283.5];
  const lijst = (soort, items) =>
    `<c:${soort}><c:ptCount val="${items.length}"/>${items
      .map((w, i) => `<c:pt idx="${i}"><c:v>${w}</c:v></c:pt>`)
      .join("")}</c:${soort}>`;
  delen["word/charts/chart1.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>Kosten</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Totaal</c:v></c:tx><c:cat>${lijst("strLit", categorieen)}</c:cat><c:val>${lijst("numLit", waarden)}</c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`,
  );
  return zipSync(delen);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync("src-tauri/tests", { recursive: true });
  writeFileSync("src-tauri/tests/grafiek.docx", maakGrafiekDocx());
  console.log("src-tauri/tests/grafiek.docx gemaakt.");
}
