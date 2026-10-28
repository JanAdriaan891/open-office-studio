import { existsSync, readFileSync, readdirSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { controleerPakket } from "../pakketcontrole";
import { bereidOpslag } from "./bron";
import { scheidMacros, voegMacrosToe } from "./macros";
import { bereidOpenen } from "./openen";
import { opslagRapport } from "./rapport";
import { uitvoerformaat } from "../formaten";

const VBA = new Uint8Array(3000).map((_, i) => (i * 7) & 0xff);
const HANDTEKENING = new Uint8Array(500).map((_, i) => (i * 13) & 0xff);

/** Een kleine DOCM met VBA-project, vbaData.xml en handtekening. */
function maakDocm() {
  const sjabloon = unzipSync(readFileSync("public/templates/nieuw.docx"));
  sjabloon["[Content_Types].xml"] = strToU8(
    strFromU8(sjabloon["[Content_Types].xml"])
      .replace(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
        "application/vnd.ms-word.document.macroEnabled.main+xml",
      )
      .replace(
        "</Types>",
        '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>' +
          '<Override PartName="/word/vbaData.xml" ContentType="application/vnd.ms-word.vbaData+xml"/>' +
          '<Override PartName="/word/vbaProjectSignature.bin" ContentType="application/vnd.ms-office.vbaProjectSignature"/></Types>',
      ),
  );
  sjabloon["word/_rels/document.xml.rels"] = strToU8(
    strFromU8(sjabloon["word/_rels/document.xml.rels"]).replace(
      "</Relationships>",
      `<Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>`,
    ),
  );
  sjabloon["word/vbaProject.bin"] = VBA;
  sjabloon["word/vbaData.xml"] = strToU8(
    '<wne:vbaSuppData xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"/>',
  );
  sjabloon["word/vbaProjectSignature.bin"] = HANDTEKENING;
  sjabloon["word/_rels/vbaProject.bin.rels"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2006/relationships/wordVbaData" Target="vbaData.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProjectSignature" Target="vbaProjectSignature.bin"/></Relationships>',
  );
  return zipSync(sjabloon);
}

describe("VBA-project scheiden en terugzetten", () => {
  it("geeft de editor een gewoon DOCX zonder VBA", async () => {
    const { bytes, macros } = await scheidMacros(maakDocm(), "docx", "docm");
    const pakket = unzipSync(bytes);
    expect(Object.keys(pakket).some((p) => /vba/i.test(p))).toBe(false);
    const typen = strFromU8(pakket["[Content_Types].xml"]);
    expect(typen).toContain("wordprocessingml.document.main+xml");
    expect(typen).not.toContain("macroEnabled");
    expect(strFromU8(pakket["word/_rels/document.xml.rels"])).not.toContain(
      "vbaProject",
    );
    expect(controleerPakket(bytes, "docx").macros).toBe(false);
    expect(macros).toMatchObject({
      heeftVba: true,
      ondertekend: true,
      bronformaat: "docm",
    });
    expect(Object.keys(macros.delen).sort()).toEqual([
      "word/_rels/vbaProject.bin.rels",
      "word/vbaData.xml",
      "word/vbaProject.bin",
      "word/vbaProjectSignature.bin",
    ]);
  });

  it("zet na de editor-opslagkern het project byte-identiek terug", async () => {
    const origineel = unzipSync(maakDocm());
    const { bytes, macros } = await scheidMacros(maakDocm(), "docx", "docm");
    const { createYrsSession, saveYrsDocx } = await import(
      "@betteroffice/docx/yrs"
    );
    const sessie = await createYrsSession();
    sessie.openDocx(bytes, true);
    const opgeslagen = (await saveYrsDocx(sessie)).bytes;
    const docm = voegMacrosToe(opgeslagen, macros, "docm");
    const pakket = unzipSync(docm);
    for (const pad of Object.keys(macros.delen))
      expect(pakket[pad]).toEqual(origineel[pad]);
    const typen = strFromU8(pakket["[Content_Types].xml"]);
    expect(typen).toContain(
      "application/vnd.ms-word.document.macroEnabled.main+xml",
    );
    expect(typen).toContain(
      'PartName="/word/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"',
    );
    expect(Object.keys(pakket)[0]).toBe("[Content_Types].xml");
    const rels = strFromU8(pakket["word/_rels/document.xml.rels"]);
    expect(rels.match(/vbaProject"/g)).toHaveLength(1);
    const ids = [...rels.matchAll(/\bId="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(controleerPakket(docm, "docx").macros).toBe(true);
  }, 30000);

  it("bereidOpslag zet terug voor DOCM en weigert DOCM zonder macrobron", async () => {
    const { bytes, macros } = await scheidMacros(maakDocm(), "docx", "docm");
    const klaar = await bereidOpslag({
      bytes,
      soort: "docx",
      ext: "docm",
      bron: { macro: macros },
    });
    expect(unzipSync(klaar.bytes)["word/vbaProject.bin"]).toEqual(VBA);
    expect(klaar.toelichting).toContain("VBA-project");
    await expect(
      bereidOpslag({ bytes, soort: "docx", ext: "docm" }),
    ).rejects.toThrow("macrobestand");
    // Opslaan als DOCX laat het project weg.
    const docx = await bereidOpslag({
      bytes,
      soort: "docx",
      ext: "docx",
      bron: { macro: macros },
    });
    expect(docx.bytes).toBe(bytes);
  });

  it("opent via de openroute met rapport en stelt DOCM voor", async () => {
    const resultaat = (await bereidOpenen("Macro.docm", maakDocm(), {
      converteer: async () => {
        throw new Error("geen runtime nodig");
      },
    }))!;
    expect(resultaat).toMatchObject({
      naam: "Macro.docm",
      gewijzigd: false,
      exportFormaat: "docm",
    });
    expect(resultaat.bron?.macro?.heeftVba).toBe(true);
    const regel = resultaat.rapport!.regels.find(
      (r) => r.onderdeel === "VBA-macro’s",
    )!;
    expect(regel.gevolg).toContain("nooit uitgevoerd");
    expect(regel.gevolg).toContain("handtekening");
  });

  it("waarschuwt bij opslaan als DOCX dat de macro’s vervallen", () => {
    const rapport = opslagRapport({
      soort: "docx",
      formaat: uitvoerformaat("docx", "docx")!,
      route: "engine",
      risicos: [],
      macros: true,
    })!;
    expect(rapport.regels[0].gevolg).toContain("niet bewaard");
    expect(
      opslagRapport({
        soort: "docx",
        formaat: uitvoerformaat("docx", "docm")!,
        route: "engine",
        risicos: [],
        macros: true,
      }),
    ).toBeNull();
  });
});

// Macrobestanden uit het Apache POI-corpus (alleen lokaal aanwezig).
const map = "../../../.local/corpus/bestanden/";
const corpus = existsSync(map)
  ? readdirSync(map).filter((n) => /\.(docm|xlsm|pptm)$/.test(n))
  : [];
describe.skipIf(!corpus.length)(
  "Corpus: VBA blijft byte-identiek na de engine",
  () => {
    for (const naam of corpus) {
      const ext = naam.split(".").pop()!;
      const soort = ext === "docm" ? "docx" : ext === "xlsm" ? "xlsx" : "pptx";
      it(
        naam.slice(4, 12) + "." + ext,
        async () => {
          const bron = readFileSync(map + naam);
          if (bron[0] !== 0x50) return; // geen ZIP (bijv. een binair .doc met verkeerde extensie)
          const origineel = unzipSync(bron);
          const { bytes, macros } = await scheidMacros(bron, soort, ext);
          let opgeslagen: Uint8Array;
          if (soort === "docx") {
            const { createYrsSession, saveYrsDocx } = await import(
              "@betteroffice/docx/yrs"
            );
            const sessie = await createYrsSession();
            sessie.openDocx(bytes, true);
            opgeslagen = (await saveYrsDocx(sessie)).bytes;
          } else if (soort === "xlsx") {
            const xlsx = await import("@betteroffice/xlsx");
            await xlsx.initWasm(
              readFileSync(
                "node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm",
              ),
            );
            const boek = xlsx.openWorkbook(bytes);
            opgeslagen = boek.save();
            boek.dispose();
          } else {
            const pptx = await import("@betteroffice/pptx");
            await pptx.initWasm(
              readFileSync(
                "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
              ),
            );
            const deck = pptx.openPresentation(bytes);
            opgeslagen = deck.save();
          }
          const terug = unzipSync(voegMacrosToe(opgeslagen, macros, ext));
          for (const pad of Object.keys(macros.delen))
            expect(terug[pad], pad).toEqual(origineel[pad]);
          expect(strFromU8(terug["[Content_Types].xml"])).toContain(
            "macroEnabled",
          );
        },
        60000,
      );
    }
  },
);
