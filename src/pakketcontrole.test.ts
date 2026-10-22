import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { controleerPakket } from "./pakketcontrole";
describe("Pakketcontrole vóór openen", () => {
  it("controleert een gewoon tekstpakket zonder de inhoud al te parsen", () => {
    expect(
      controleerPakket(
        zipSync({ "word/document.xml": strToU8("<document/>") }),
        "docx",
      ),
    ).toMatchObject({ strict: false, macros: false, onderdelen: 1 });
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
});
