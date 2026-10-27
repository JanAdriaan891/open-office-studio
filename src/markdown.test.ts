import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { exporteerMarkdown } from "./markdown";
import { uitvoerformaten } from "./formaten";

function document(inhoud: string, afbeelding = false) {
  const delen = unzipSync(readFileSync("public/templates/nieuw.docx"));
  delen["word/document.xml"] = strToU8(
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${inhoud}<w:sectPr/></w:body></w:document>`,
  );
  delen["word/numbering.xml"] = strToU8(
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="98"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:num w:numId="98"><w:abstractNumId w:val="98"/></w:num></w:numbering>',
  );
  delen["word/_rels/document.xml.rels"] = strToU8(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="link" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org/handleiding" TargetMode="External"/><Relationship Id="nummering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>',
  );
  if (afbeelding) {
    delen["word/media/controle.png"] = readFileSync(
      "src-tauri/icons/128x128.png",
    );
    delen["word/_rels/document.xml.rels"] = strToU8(
      strFromU8(delen["word/_rels/document.xml.rels"]).replace(
        "</Relationships>",
        '<Relationship Id="afbeelding" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/controle.png"/></Relationships>',
      ),
    );
    const typen = strFromU8(delen["[Content_Types].xml"]);
    if (!typen.includes('Extension="png"'))
      delen["[Content_Types].xml"] = strToU8(
        typen.replace(
          "</Types>",
          '<Default Extension="png" ContentType="image/png"/></Types>',
        ),
      );
  }
  return zipSync(delen);
}

async function markdown(inhoud: string) {
  return new TextDecoder().decode(
    (await exporteerMarkdown(document(inhoud))).bytes,
  );
}

describe("Tekstdocument als Markdown", () => {
  it("geeft een duidelijke afbeeldingstekst en waarschuwing wanneer beeldgegevens ontbreken", async () => {
    const tekening =
      '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1219200" cy="1219200"/><wp:docPr id="1" name="Controle" descr="Voorbeeld"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="Controle"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="afbeelding"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1219200" cy="1219200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
    const resultaat = await exporteerMarkdown(document(tekening, true));
    expect(new TextDecoder().decode(resultaat.bytes)).toContain(
      "[Afbeelding: Voorbeeld]",
    );
    expect(new TextDecoder().decode(resultaat.bytes)).not.toContain("]()");
    expect(resultaat.waarschuwing).toBe(true);
  });
  it("biedt Markdown ook zonder conversieruntime aan", () => {
    expect(uitvoerformaten("docx", false)).toEqual(
      expect.arrayContaining(["docx", "md"]),
    );
    expect(uitvoerformaten("docx", false)).not.toContain("odt");
    expect(uitvoerformaten("docx", true)).toContain("md");
    expect(uitvoerformaten("xlsx", false)).not.toContain("xls");
  });
  it("bewaart koppen, vet, cursief en Unicode zonder bronankers", async () => {
    const tekst = await markdown(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uitgangspunten</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Samen</w:t></w:r><w:r><w:t xml:space="preserve"> werken aan </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>ideeën</w:t></w:r></w:p>',
    );
    expect(tekst).toMatch(/^# .*Uitgangspunten/m);
    expect(tekst).toContain("**Samen**");
    expect(tekst).toMatch(/[*_]ideeën[*_]/);
    expect(tekst).not.toContain("docx-export:");
    expect(tekst).not.toContain("docx-story:");
  });
  it("bewaart een echte opsomming", async () => {
    const tekst = await markdown(
      '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="98"/></w:numPr></w:pPr><w:r><w:t>Eerste punt</w:t></w:r></w:p>',
    );
    expect(tekst).toMatch(/^[-*] Eerste punt/m);
  });
  it("bewaart de bestemming van een hyperlink", async () => {
    const tekst = await markdown(
      '<w:p><w:hyperlink r:id="link"><w:r><w:t>Handleiding</w:t></w:r></w:hyperlink></w:p>',
    );
    expect(tekst).toContain("[Handleiding](https://example.org/handleiding)");
  });
  it("bewaart een harde regeleinde binnen een alinea", async () => {
    const tekst = await markdown(
      "<w:p><w:r><w:t>Eerste regel</w:t><w:br/><w:t>Tweede regel</w:t></w:r></w:p>",
    );
    expect(tekst).toMatch(/Eerste regel(?: {2}|\\)\nTweede regel/);
  });
  it("bewaart tabelcellen en verwijdert ook bronankers binnen cellen", async () => {
    const tekst = await markdown(
      '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Materiaal</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Aantal</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Hout</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    );
    expect(tekst).toContain("| Materiaal | Aantal |");
    expect(tekst).toContain("| Hout | 12 |");
    expect(tekst).not.toContain("docx-export:");
  });
  it("maakt van een leeg document een geldig leeg tekstbestand", async () => {
    expect(await markdown("<w:p/>")).toBe("\n");
  });
  it("weigert beschadigde invoer voordat er een Markdown-bestand ontstaat", async () => {
    await expect(
      exporteerMarkdown(new Uint8Array([1, 2, 3])),
    ).rejects.toThrow();
  });
  it("biedt afgekapt resultaat nooit als een volledige export aan", async () => {
    const alinea = "<w:p><w:r><w:t>Een controlepunt.</w:t></w:r></w:p>";
    await expect(
      exporteerMarkdown(document(alinea.repeat(10001))),
    ).rejects.toThrow("niet volledig");
  }, 20000);
  it("exporteert de eigen ontwerpnotitie met koppen en tabel", async () => {
    const resultaat = await exporteerMarkdown(
      readFileSync("docs/voorbeelden/Ontwerpnotitie.docx"),
    );
    const tekst = new TextDecoder().decode(resultaat.bytes);
    expect(tekst).toContain("Ruimte voor ideeën.");
    expect(tekst).toMatch(/^# .*Drie uitgangspunten/m);
    expect(tekst).toContain("Maak ruimte");
    expect(tekst).toContain("| --- | --- |");
  });
});
