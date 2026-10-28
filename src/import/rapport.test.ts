import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { uitvoerformaat } from "../formaten";
import { controleerPakket } from "../pakketcontrole";
import { openRapport, opslagRapport, rapportTekst } from "./rapport";
import { bereidOpenen } from "./openen";

const formaat = (soort: "docx" | "xlsx" | "pptx", ext: string) =>
  uitvoerformaat(soort, ext)!;

describe("Rapport bij openen", () => {
  it("geeft geen rapport als alles volledig wordt ondersteund", () => {
    expect(
      openRapport({ soort: "docx", risicos: [], route: "engine", bronformaat: "docx" }),
    ).toBeNull();
  });
  it("noemt ingebedde objecten, grafieken en macro’s bij direct geopende OOXML", () => {
    const rapport = openRapport({
      soort: "docx",
      risicos: ["grafieken", "ingebedde_objecten", "revisies"],
      macros: true,
      route: "engine",
      bronformaat: "docx",
    })!;
    expect(rapport.moment).toBe("openen");
    const onderdelen = rapport.regels.map((r) => r.onderdeel);
    expect(onderdelen).toEqual(["Grafieken", "Ingebedde objecten", "VBA-macro’s"]);
    // Revisies worden gewoon ondersteund en horen niet in het rapport.
    expect(rapport.kop).not.toContain("revisies");
    expect(rapport.regels[2].gevolg).toContain("nooit uitgevoerd");
  });
  it("is eerlijk over ongemeten behoud in rekenbladen", () => {
    const rapport = openRapport({
      soort: "xlsx",
      risicos: ["draaitabellen", "ingebedde_objecten"],
      route: "engine",
      bronformaat: "xlsx",
    })!;
    expect(rapport.regels.find((r) => r.onderdeel === "Ingebedde objecten")!.gevolg).toContain(
      "niet gemeten",
    );
    expect(rapport.regels.map((r) => r.onderdeel)).toContain("Draaitabellen");
  });
  it("meldt bij conversie de omzetting en het aangetoonde verlies", () => {
    const rapport = openRapport({
      soort: "docx",
      risicos: ["onbekende_onderdelen", "opmerkingen"],
      route: "conversie",
      bronformaat: "docm",
      macros: true,
    })!;
    expect(rapport.kop).toContain("bewerkbare kopie");
    expect(rapport.regels[0].onderdeel).toBe("Omzetting");
    expect(rapport.regels[1].onderdeel).toBe("Onbekende pakketonderdelen");
    expect(rapport.regels.at(-1)!.gevolg).toContain("niet overgenomen");
  });
  it("is als platte tekst te kopiëren", () => {
    const rapport = openRapport({
      soort: "pptx",
      risicos: ["ingebedde_objecten"],
      route: "engine",
      bronformaat: "pptx",
    })!;
    const tekst = rapportTekst(rapport, "Dia's.pptx", "2026-W44.1", new Date("2026-10-28T10:00:00Z"));
    expect(tekst).toContain("Bestand: Dia's.pptx");
    expect(tekst).toContain("2026-10-28 10:00:00");
    expect(tekst).toContain("- Ingebedde objecten: ");
  });
});

describe("Rapport vóór opslaan", () => {
  it("is leeg voor het eigen formaat zonder bijzonderheden", () => {
    expect(
      opslagRapport({ soort: "docx", formaat: formaat("docx", "docx"), route: "engine", risicos: ["opmerkingen"] }),
    ).toBeNull();
  });
  it("meldt dat macro’s vervallen bij een formaat zonder macro’s", () => {
    const rapport = opslagRapport({
      soort: "docx",
      formaat: formaat("docx", "docx"),
      route: "engine",
      risicos: [],
      macros: true,
    })!;
    expect(rapport.regels[0].onderdeel).toBe("VBA-macro’s");
  });
  it("meldt aangetoond conversieverlies en ongemeten rekenbladkenmerken", () => {
    const tekst = opslagRapport({
      soort: "docx",
      formaat: formaat("docx", "odt"),
      route: "runtime",
      risicos: ["onbekende_onderdelen"],
    })!;
    expect(tekst.regels[0].gevolg).toContain("verloren");
    const rekenblad = opslagRapport({
      soort: "xlsx",
      formaat: formaat("xlsx", "ods"),
      route: "runtime",
      risicos: ["draaitabellen", "slicers"],
    })!;
    expect(rekenblad.regels[0].gevolg).toContain("niet gemeten");
  });
  it("noemt bij tekstformaten wat niet meekomt", () => {
    const rapport = opslagRapport({
      soort: "docx",
      formaat: formaat("docx", "md"),
      route: "engine",
      risicos: ["opmerkingen", "ingebedde_objecten"],
    })!;
    expect(rapport.regels[0].onderdeel).toBe("Formaat .md");
    expect(rapport.regels[1].onderdeel).toContain("Opmerkingen");
  });
  it("waarschuwt bij onversleuteld opslaan van een versleuteld origineel", () => {
    const rapport = opslagRapport({
      soort: "xlsx",
      formaat: formaat("xlsx", "xlsx"),
      route: "engine",
      risicos: [],
      wordtOnversleuteld: true,
    })!;
    expect(rapport.regels[0].onderdeel).toBe("Wachtwoordbeveiliging");
  });
});

describe("Pakketcontrole voor het rapport", () => {
  it("herkent rekenbladrisico’s, besturingselementen en handtekeningen", () => {
    const pakket = zipSync({
      "xl/workbook.xml": strToU8("<workbook/>"),
      "xl/pivotTables/pivotTable1.xml": strToU8("<x/>"),
      "xl/slicers/slicer1.xml": strToU8("<x/>"),
      "xl/externalLinks/externalLink1.xml": strToU8("<x/>"),
      "xl/connections.xml": strToU8("<x/>"),
      "xl/activeX/activeX1.xml": strToU8("<x/>"),
      "_xmlsignatures/sig1.xml": strToU8("<x/>"),
    });
    expect(controleerPakket(pakket, "xlsx").risicos).toEqual([
      "besturingselementen",
      "draaitabellen",
      "externe_koppelingen",
      "gegevensverbindingen",
      "handtekening",
      "slicers",
    ]);
  });
});

describe("Openroute", () => {
  const niet = async () => {
    throw new Error("geen runtime");
  };
  it("opent het eigen formaat rechtstreeks met rapport", async () => {
    const bytes = zipSync({
      "word/document.xml": strToU8("<document/>"),
      "word/embeddings/oleObject1.bin": new Uint8Array([1]),
    });
    const resultaat = (await bereidOpenen("Brief.docx", bytes, { converteer: niet }))!;
    expect(resultaat.gewijzigd).toBe(false);
    expect(resultaat.bytes).toBe(bytes);
    expect(resultaat.rapport!.regels[0].onderdeel).toBe("Ingebedde objecten");
  });
  it("zet andere formaten om via de runtime en stelt het bronformaat voor", async () => {
    const omgezet = zipSync({ "word/document.xml": strToU8("<document/>") });
    const resultaat = (await bereidOpenen("Oud.doc", new Uint8Array([0xd0, 0xcf]), {
      converteer: async () => omgezet,
    }))!;
    expect(resultaat.naam).toBe("Oud.docx");
    expect(resultaat.gewijzigd).toBe(true);
    expect(resultaat.exportFormaat).toBe("doc");
    expect(resultaat.rapport!.regels[0].onderdeel).toBe("Omzetting");
  });
});
