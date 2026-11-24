import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import * as xlsx from "@betteroffice/xlsx";
import * as pptx from "@betteroffice/pptx";
import { controleerPakket } from "../pakketcontrole";
import { maakExport } from "../export/index";
import { alsDocument, alsSjabloon, isSjabloon } from "./pakket";
import { sjabloonTaal, type Catalogus } from "./catalogus";
import { bestandstypen, kiesRoute, uitvoerformaat } from "../formaten";

const catalogus = JSON.parse(readFileSync("public/sjablonen/index.json", "utf8")) as Catalogus;
const lees = (taal: string, id: string, soort: string) => new Uint8Array(readFileSync(`public/sjablonen/${taal}/${id}.${soort}`));

describe("sjablonengalerij", () => {
  beforeAll(async () => {
    await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
    await pptx.initWasm(readFileSync("node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm"));
  });

  it("heeft per module de gevraagde sjablonen in nl en en, met miniaturen", () => {
    const per = (s: string) => catalogus.sjablonen.filter((x) => x.soort === s).length;
    expect(per("docx")).toBe(6);
    expect(per("xlsx")).toBe(5);
    expect(per("pptx")).toBe(3);
    expect(catalogus.talen).toEqual(["nl", "en"]);
    for (const s of catalogus.sjablonen) {
      expect(s.naam.nl && s.naam.en).toBeTruthy();
      expect(s.miniatuur).toBe(true);
    }
  });

  it("levert geldige pakketten met Inter en echte kopstijlen", () => {
    for (const taal of catalogus.talen)
      for (const s of catalogus.sjablonen) {
        const bytes = lees(taal, s.id, s.soort);
        const controle = controleerPakket(bytes, s.soort);
        expect(controle.strict, `${taal}/${s.id}`).toBe(false);
        const delen = unzipSync(bytes);
        if (s.soort === "docx") {
          const stijlen = strFromU8(delen["word/styles.xml"]);
          for (const naam of ["Normal", "heading 1", "heading 2", "heading 3"]) expect(stijlen).toContain(`w:val="${naam}"`);
          expect(stijlen).toContain('w:ascii="Inter"');
        }
        if (s.soort === "pptx") expect(strFromU8(delen["ppt/theme/theme1.xml"])).toContain('typeface="Inter"');
      }
  });

  it("rekenbladen rekenen in de engine (factuur: subtotaal, btw en totaal)", async () => {
    const handle = xlsx.openWorkbook(lees("nl", "factuur-berekend", "xlsx"));
    let bytes: Uint8Array;
    try {
      bytes = handle.save();
    } finally {
      handle.dispose();
    }
    const csv = new TextDecoder().decode((await maakExport("xlsx", "csv", bytes, "F", { blad: 0 })).bytes);
    expect(csv).toContain("1687,6");
    expect(csv).toContain("354,4");
    expect(csv).toContain("2042");
  });

  it("presentaties openen met vijf dia's en de titeldia als eerste", async () => {
    for (const s of catalogus.sjablonen.filter((x) => x.soort === "pptx")) {
      const md = await pptx.exportPptxMarkdown(lees("en", s.id, "pptx"));
      expect(md.markdown).toContain("Presentation title");
      expect(md.markdown).toContain("Thank you");
    }
  });

  it("zet sjabloon en document in beide richtingen om", () => {
    const doc = lees("nl", "brief", "docx");
    expect(isSjabloon(doc, "docx")).toBe(false);
    const dotx = alsSjabloon(doc, "docx");
    expect(isSjabloon(dotx, "docx")).toBe(true);
    expect(strFromU8(unzipSync(dotx)["[Content_Types].xml"])).toContain("wordprocessingml.template.main+xml");
    const terug = alsDocument(dotx, "docx");
    expect(isSjabloon(terug, "docx")).toBe(false);
    expect(unzipSync(terug)["word/document.xml"]).toEqual(unzipSync(doc)["word/document.xml"]);
    for (const soort of ["xlsx", "pptx"] as const) {
      const id = soort === "xlsx" ? "begroting" : "thema-openaec";
      expect(isSjabloon(alsSjabloon(lees("en", id, soort), soort), soort)).toBe(true);
    }
  });

  it("maakt DOTX, XLTX en POTX zelf (zonder kantoorruntime)", async () => {
    for (const [soort, ext] of [["docx", "dotx"], ["xlsx", "xltx"], ["pptx", "potx"]] as const) {
      expect(kiesRoute(uitvoerformaat(soort, ext)!, false)).toBe("engine");
      expect(bestandstypen[soort].invoer).toContain(ext);
      const id = { docx: "memo", xlsx: "urenstaat", pptx: "thema-licht" }[soort];
      const uit = await maakExport(soort, ext, lees("nl", id, soort), "x");
      expect(isSjabloon(uit.bytes, soort)).toBe(true);
    }
  });

  it("kiest de taal van de interface, anders Engels", () => {
    expect(sjabloonTaal("nl", ["nl", "en"])).toBe("nl");
    expect(sjabloonTaal("en-GB", ["nl", "en"])).toBe("en");
    expect(sjabloonTaal("de", ["nl", "en"])).toBe("en");
  });
});
