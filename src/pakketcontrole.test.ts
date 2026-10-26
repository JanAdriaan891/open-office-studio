import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  MATRIXVERLIES,
  controleerPakket,
  risicoBeleid,
} from "./pakketcontrole";
describe("Pakketcontrole vóór openen", () => {
  it("controleert een gewoon tekstpakket zonder de inhoud al te parsen", () => {
    expect(
      controleerPakket(
        zipSync({ "word/document.xml": strToU8("<document/>") }),
        "docx",
      ),
    ).toMatchObject({
      strict: false,
      macros: false,
      onderdelen: 1,
      risicos: [],
    });
  });
  it("weigert een verkeerd of ontbrekend hoofdonderdeel", () => {
    expect(() =>
      controleerPakket(
        zipSync({ "xl/workbook.xml": strToU8("<workbook/>") }),
        "docx",
      ),
    ).toThrow("hoofdonderdeel");
  });
  it("weigert een pad buiten het pakket", () => {
    expect(() =>
      controleerPakket(zipSync({ "../buiten": strToU8("x") }), "docx"),
    ).toThrow("onderdeelpad");
  });
  it("weigert een opgeblazen grootte al in de inhoudsopgave", () => {
    const bytes = zipSync({ "word/document.xml": strToU8("<document/>") });
    for (let i = 0; i < bytes.length - 28; i++)
      if (
        bytes[i] === 0x50 &&
        bytes[i + 1] === 0x4b &&
        bytes[i + 2] === 1 &&
        bytes[i + 3] === 2
      ) {
        new DataView(bytes.buffer).setUint32(i + 24, 257 * 1024 * 1024, true);
        break;
      }
    expect(() => controleerPakket(bytes, "docx")).toThrow("te groot");
  });
  it("herkent een binaire of mogelijk versleutelde container vóór de ZIP-parser", () => {
    expect(() =>
      controleerPakket(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), "docx"),
    ).toThrow("versleuteld");
  });
  it("herkent Strict-rekenbladen die conversie nodig hebben", () => {
    expect(
      controleerPakket(
        zipSync({
          "xl/workbook.xml": strToU8(
            '<workbook xmlns="http://purl.oclc.org/ooxml/spreadsheetml/main"/>',
          ),
        }),
        "xlsx",
      ).strict,
    ).toBe(true);
  });
  it("signaleert VBA zonder het binaire project uit te pakken of uit te voeren", () => {
    expect(
      controleerPakket(
        zipSync({
          "word/document.xml": strToU8("<document/>"),
          "word/vbaProject.bin": new Uint8Array([1, 2, 3]),
        }),
        "docx",
      ).macros,
    ).toBe(true);
  });
  const W =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const REL =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
  const docxD3 = () =>
    zipSync({
      "[Content_Types].xml": strToU8(
        '<Types><Override PartName="/word/openaec-matrix.xml" ContentType="application/vnd.openaec.matrix+xml"/></Types>',
      ),
      "word/document.xml": strToU8(
        `<w:document ${W} xmlns:openaec="urn:openaec:matrix"><w:body><w:p><w:ins w:id="1"><w:r><w:t>a</w:t></w:r></w:ins><w:del w:id="2"/><w:r><w:footnoteReference w:id="1"/></w:r></w:p></w:body></w:document>`,
      ),
      "word/_rels/document.xml.rels": strToU8(
        `<Relationships><Relationship Id="r1" Type="${REL}comments" Target="comments.xml"/><Relationship Id="r2" Type="urn:openaec:relaties/onbekend-onderdeel" Target="openaec-matrix.xml"/></Relationships>`,
      ),
      "word/comments.xml": strToU8("<w:comments/>"),
      "word/footnotes.xml": strToU8("<w:footnotes/>"),
      "word/header1.xml": strToU8("<w:hdr/>"),
      "word/openaec-matrix.xml": strToU8("<x/>"),
      "customXml/item1.xml": strToU8("<x/>"),
    });
  it("herkent de risicovolle DOCX-kenmerken uit D1–D3 zonder de hoofdtekst te bewerken", () => {
    expect(controleerPakket(docxD3(), "docx").risicos).toEqual([
      "custom_xml",
      "kop_voettekst",
      "onbekende_extensies",
      "onbekende_onderdelen",
      "opmerkingen",
      "revisies",
      "voetnoten",
    ]);
  });
  it("herkent notities, animaties, overgangen, grafieken en ingebedde objecten in PPTX", () => {
    const bytes = zipSync({
      "ppt/presentation.xml": strToU8("<p:presentation/>"),
      "ppt/slides/slide1.xml": strToU8(
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:transition><p:fade/></p:transition><p:timing/></p:sld>',
      ),
      "ppt/notesSlides/notesSlide1.xml": strToU8("<p:notes/>"),
      "ppt/charts/chart1.xml": strToU8("<c:chartSpace/>"),
      "ppt/embeddings/Microsoft_Word_Document1.docx": new Uint8Array([1]),
    });
    expect(controleerPakket(bytes, "pptx").risicos).toEqual([
      "animaties",
      "grafieken",
      "ingebedde_objecten",
      "notities",
      "overgangen",
    ]);
  });
  it("telt standaard Office-naamruimten en relaties niet als onbekend", () => {
    const bytes = zipSync({
      "[Content_Types].xml": strToU8(
        '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "word/document.xml": strToU8(
        `<w:document ${W} xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:v="urn:schemas-microsoft-com:vml"><w:body/></w:document>`,
      ),
      "word/_rels/document.xml.rels": strToU8(
        `<Relationships><Relationship Id="r1" Type="${REL}styles" Target="styles.xml"/></Relationships>`,
      ),
    });
    expect(controleerPakket(bytes, "docx").risicos).toEqual([]);
  });
  it("blokkeert opslaan via de engine niet voor kenmerken die de matrix behouden zag", () => {
    const risicos = controleerPakket(docxD3(), "docx").risicos;
    expect(MATRIXVERLIES.docx.engine).toEqual([]);
    expect(MATRIXVERLIES.pptx.engine).toEqual([]);
    expect(risicoBeleid(risicos, "docx", "engine")).toMatchObject({
      verlies: [],
      opslaanGeblokkeerd: false,
      waarschuwing: null,
    });
  });
  it("meldt bij conversie expliciet het in de matrix aangetoonde verlies", () => {
    const beleid = risicoBeleid(
      controleerPakket(docxD3(), "docx").risicos,
      "docx",
      "conversie",
    );
    expect(beleid.verlies).toEqual([
      "onbekende_extensies",
      "onbekende_onderdelen",
    ]);
    expect(beleid.opslaanGeblokkeerd).toBe(false);
    expect(beleid.waarschuwing).toContain("onbekende pakketonderdelen");
    expect(beleid.waarschuwing).toContain("niet verliesvrij");
    expect(
      risicoBeleid(["revisies"], "docx", "conversie").waarschuwing,
    ).toBeNull();
  });
  it("weigert opslaan zodra de matrix engineverlies vastlegt", () => {
    const matrix = {
      ...MATRIXVERLIES,
      docx: { engine: ["revisies"] as const, conversie: [] },
    };
    const beleid = risicoBeleid(
      ["revisies", "opmerkingen"],
      "docx",
      "engine",
      matrix,
    );
    expect(beleid.opslaanGeblokkeerd).toBe(true);
    expect(beleid.waarschuwing).toMatch(/^Opslaan geweigerd: .*revisies/);
  });
  it("legt voor XLSX nog geen matrixregel op", () => {
    expect(
      risicoBeleid(["onbekende_onderdelen"], "xlsx", "conversie").waarschuwing,
    ).toBeNull();
  });
});
