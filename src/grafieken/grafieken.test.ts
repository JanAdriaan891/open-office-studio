import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import {
  controleerModel,
  gegevensUitRaster,
  getalnotatie,
  herkenKoppen,
  leesGetal,
  leesTabgescheiden,
  rasterUitModel,
  SOORTEN,
  standaardModel,
  verwijzing,
  type GrafiekModel,
} from "./model.ts";
import { grafiekXml, leesGrafiekXml, werkGrafiekXmlBij } from "./chartxml.ts";
import {
  bewerkGrafiek,
  lijstGrafieken,
  verwijderGrafiek,
  voegGrafiekToeDocx,
  voegGrafiekToePptx,
  voegGrafiekToeXlsx,
} from "./documenten.ts";
import { leesXml, zoekAlle, attr } from "./xml.ts";
import { GrafiekFout } from "./fouten.ts";
import { bronUitModel } from "./bron.ts";

const lees = (pad: string) => new Uint8Array(readFileSync(pad));
const delen = (bytes: Uint8Array) => {
  const z = unzipSync(bytes);
  return Object.fromEntries(Object.entries(z).map(([n, b]) => [n, strFromU8(b)]));
};

function voorbeeld(soort: GrafiekModel["soort"] = "kolom"): GrafiekModel {
  const raster = [
    ["", "Beton", "Staal"],
    ["2024", "12,5", "8"],
    ["2025", "14", "9,25"],
    ["2026", "15", "11"],
  ];
  return standaardModel({
    soort,
    titel: "Materiaal & kosten <test>",
    ondertitel: "per jaar",
    asTitelX: "Jaar",
    asTitelY: "Ton",
    gegevenslabels: true,
    decimalen: 1,
    ...gegevensUitRaster(raster, herkenKoppen(raster), { blad: "Blad 1", top: 0, left: 0 }),
  });
}

describe("model", () => {
  it("leest Nederlandse en internationale getallen", () => {
    expect(leesGetal("1.234,5")).toBe(1234.5);
    expect(leesGetal("1,234.5")).toBe(1234.5);
    expect(leesGetal("12,5")).toBe(12.5);
    expect(leesGetal("7%")).toBe(0.07);
    expect(leesGetal("€ 3")).toBe(3);
    expect(leesGetal("abc")).toBeNull();
    expect(leesGetal("")).toBeNull();
  });
  it("herkent koprij, kopkolom en richting", () => {
    const raster = [
      ["", "A", "B"],
      ["x", 1, 2],
      ["y", 3, 4],
      ["z", 5, 6],
    ];
    expect(herkenKoppen(raster)).toEqual({ koprij: true, kopkolom: true, reeksenIn: "kolommen" });
    expect(herkenKoppen([[1, 2, 3, 4]])).toMatchObject({ koprij: false, kopkolom: false, reeksenIn: "rijen" });
  });
  it("maakt reeksen en verwijzingen uit een bereik", () => {
    const m = voorbeeld();
    expect(m.categorieen).toEqual(["2024", "2025", "2026"]);
    expect(m.reeksen.map((r) => r.naam)).toEqual(["Beton", "Staal"]);
    expect(m.reeksen[1].waarden).toEqual([8, 9.25, 11]);
    expect(m.categorieenRef).toBe("'Blad 1'!$A$2:$A$4");
    expect(m.reeksen[0].naamRef).toBe("'Blad 1'!$B$1");
    expect(m.reeksen[0].waardenRef).toBe("'Blad 1'!$B$2:$B$4");
    const rijen = gegevensUitRaster(
      [["", "q1", "q2"], ["Noord", 1, 2]],
      { koprij: true, kopkolom: true, reeksenIn: "rijen" },
      { blad: "Data", top: 4, left: 2 },
    );
    expect(rijen.categorieen).toEqual(["q1", "q2"]);
    expect(rijen.reeksen[0]).toMatchObject({ naam: "Noord", waardenRef: "Data!$D$6:$E$6", naamRef: "Data!$C$6" });
  });
  it("citeert bladnamen alleen waar nodig", () => {
    expect(verwijzing("Blad1", 0, 0)).toBe("Blad1!$A$1");
    expect(verwijzing("A1", 0, 0)).toBe("'A1'!$A$1");
    expect(verwijzing("Jan's", 0, 0, 1, 1)).toBe("'Jan''s'!$A$1:$B$2");
  });
  it("weigert ongeldige modellen met een Nederlandse melding", () => {
    expect(() => controleerModel(standaardModel())).toThrow(/minstens één gegevensreeks/);
    const m = voorbeeld("spreiding");
    m.categorieen = ["a", "b", "c"];
    expect(() => controleerModel(m)).toThrow(GrafiekFout);
    expect(() => controleerModel({ ...voorbeeld(), soort: "combinatie", reeksen: [voorbeeld().reeksen[0]] })).toThrow(/combinatie/i);
  });
  it("getalnotatie en tabgescheiden plakken", () => {
    expect(getalnotatie(0)).toBe("#,##0");
    expect(getalnotatie(2)).toBe("#,##0.00");
    expect(leesTabgescheiden("a\tb\r\n1\t2\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(rasterUitModel(voorbeeld())[1]).toEqual(["2024", "12,5", "8"]);
  });
});

describe("grafiek-XML", () => {
  for (const { soort } of SOORTEN) {
    it(`schrijft en leest ${soort}`, () => {
      const m = voorbeeld(soort);
      const xml = grafiekXml(m);
      const wortel = leesXml(xml);
      expect(wortel.naam).toBe("c:chartSpace");
      const gelezen = leesGrafiekXml(xml);
      expect(gelezen.bewerkbaar).toBe(true);
      expect(gelezen.model.soort).toBe(soort);
      expect(gelezen.model.titel).toBe(m.titel);
      expect(gelezen.model.ondertitel).toBe("per jaar");
      expect(gelezen.model.decimalen).toBe(1);
      expect(gelezen.model.gegevenslabels).toBe(true);
      const n = soort === "taart" ? 1 : 2;
      expect(gelezen.model.reeksen.length).toBe(n);
      expect(gelezen.model.reeksen[0].waarden).toEqual([12.5, 14, 15]);
      expect(gelezen.model.reeksen[0].waardenRef).toBe("'Blad 1'!$B$2:$B$4");
      expect(gelezen.model.categorieen).toEqual(["2024", "2025", "2026"]);
      if (soort !== "taart" && soort !== "ring") {
        expect(gelezen.model.asTitelX).toBe("Jaar");
        expect(gelezen.model.asTitelY).toBe("Ton");
      }
      // Elke as verwijst naar een bestaande as.
      const ids = zoekAlle(wortel, "axId").filter((a) => /Ax$/.test(a.ouder!.lokaal)).map((a) => attr(a, "val"));
      for (const k of zoekAlle(wortel, "crossAx")) expect(ids).toContain(attr(k, "val"));
      expect(new Set(ids).size).toBe(ids.length);
    });
  }
  it("werkt alleen titel, tekengebied en legenda bij en behoudt de rest", () => {
    const bron = grafiekXml(voorbeeld()).replace(
      "</c:chartSpace>",
      "<c:extLst><c:ext uri=\"{test}\"><x:iets xmlns:x=\"urn:x\"/></c:ext></c:extLst></c:chartSpace>",
    );
    const nieuw = werkGrafiekXmlBij(bron, { ...voorbeeld("lijn"), titel: "Nieuw", legenda: "geen" });
    expect(nieuw).toContain('<c:ext uri="{test}"><x:iets xmlns:x="urn:x"/></c:ext>');
    const g = leesGrafiekXml(nieuw);
    expect(g.model.soort).toBe("lijn");
    expect(g.model.titel).toBe("Nieuw");
    expect(g.model.legenda).toBe("geen");
  });
  it("weigert grafieksoorten buiten het model", () => {
    const xml = grafiekXml(voorbeeld()).replace(/barChart/g, "bar3DChart");
    const g = leesGrafiekXml(xml);
    expect(g.bewerkbaar).toBe(false);
    expect(g.reden).toMatch(/bar3DChart/);
    expect(() => werkGrafiekXmlBij(xml, voorbeeld())).toThrow(GrafiekFout);
  });
});

describe("pakketten", () => {
  it("voegt een grafiek in XLSX toe met tekening, rels en inhoudstypen", () => {
    const voor = lees("docs/voorbeelden/Materiaaloverzicht.xlsx");
    const een = voegGrafiekToeXlsx(voor, voorbeeld(), { blad: 0, col: 6, row: 1 });
    const twee = voegGrafiekToeXlsx(een.bytes, voorbeeld("taart"), { blad: 0, col: 6, row: 20 });
    const d = delen(twee.bytes);
    expect(Object.keys(d)).toEqual(expect.arrayContaining(["xl/charts/chart1.xml", "xl/charts/chart2.xml", "xl/drawings/drawing1.xml", "xl/drawings/_rels/drawing1.xml.rels"]));
    expect(d["[Content_Types].xml"]).toContain('PartName="/xl/charts/chart2.xml"');
    expect(d["[Content_Types].xml"]).toContain('PartName="/xl/drawings/drawing1.xml"');
    expect(d["xl/worksheets/sheet1.xml"].match(/<drawing /g)?.length).toBe(1);
    const rels = leesXml(d["xl/drawings/_rels/drawing1.xml.rels"]);
    const ids = zoekAlle(rels, "Relationship").map((r) => attr(r, "Id"));
    expect(new Set(ids).size).toBe(2);
    const cNvPr = zoekAlle(leesXml(d["xl/drawings/drawing1.xml"]), "cNvPr").map((c) => attr(c, "id"));
    expect(new Set(cNvPr).size).toBe(2);
    // Ongewijzigde onderdelen blijven gelijk.
    const oud = delen(voor);
    expect(d["xl/styles.xml"]).toBe(oud["xl/styles.xml"]);
    const lijst = lijstGrafieken(twee.bytes, "xlsx");
    expect(lijst.map((g) => g.soort)).toEqual(["kolom", "taart"]);
    // Materiaaloverzicht heeft 6 vastgezette rijen: de grafiek komt eronder.
    expect(lijst[0]).toMatchObject({ blad: 0, anker: { van: { col: 6, row: 6 } } });
  });
  it("voegt een grafiek op een nieuw blad toe", () => {
    const r = voegGrafiekToeXlsx(lees("public/templates/nieuw.xlsx"), voorbeeld(), { blad: { nieuw: "Grafiek" }, col: 0, row: 0 });
    const d = delen(r.bytes);
    expect(r.blad).toBe(1);
    expect(d["xl/workbook.xml"]).toContain('name="Grafiek"');
    expect(() => voegGrafiekToeXlsx(r.bytes, voorbeeld(), { blad: { nieuw: "grafiek" }, col: 0, row: 0 })).toThrow(/bestaat al/);
  });
  it("voegt een inline grafiek met ingesloten werkboek in DOCX toe", () => {
    const voor = lees("docs/voorbeelden/Ontwerpnotitie.docx");
    const r = voegGrafiekToeDocx(voor, voorbeeld("combinatie"));
    const d = delen(r.bytes);
    expect(d["word/document.xml"]).toContain("<wp:inline");
    expect(d["word/charts/chart1.xml"]).toContain("<c:externalData r:id=");
    expect(d["word/charts/_rels/chart1.xml.rels"]).toContain("../embeddings/Microsoft_Excel_Worksheet1.xlsx");
    expect(d["[Content_Types].xml"]).toMatch(/Extension="xlsx"/);
    const ingesloten = unzipSync(unzipSync(r.bytes)["word/embeddings/Microsoft_Excel_Worksheet1.xlsx"]);
    expect(strFromU8(ingesloten["xl/sharedStrings.xml"])).toContain("Beton");
    const g = lijstGrafieken(r.bytes, "docx");
    expect(g).toHaveLength(1);
    expect(g[0].soort).toBe("combinatie");
    // Bewerken vervangt het werkboek en de grafiek.
    const m = voorbeeld("vlak");
    m.reeksen[0].waarden = [1, 2, 3];
    const bewerkt = bewerkGrafiek(r.bytes, "docx", g[0].chartPad, m);
    const opnieuw = lijstGrafieken(bewerkt, "docx")[0];
    expect(opnieuw.soort).toBe("vlak");
    const ingesloten2 = strFromU8(unzipSync(unzipSync(bewerkt)["word/embeddings/Microsoft_Excel_Worksheet1.xlsx"])["xl/worksheets/sheet1.xml"]);
    expect(ingesloten2).toContain("<v>3</v>");
    // Verwijderen ruimt de onderdelen op.
    const weg = delen(verwijderGrafiek(bewerkt, "docx", g[0]));
    expect(weg["word/charts/chart1.xml"]).toBeUndefined();
    expect(weg["word/embeddings/Microsoft_Excel_Worksheet1.xlsx"]).toBeUndefined();
    expect(weg["[Content_Types].xml"]).not.toContain("chart1.xml");
    expect(weg["word/document.xml"]).not.toContain("c:chart");
  });
  it("plaatst een DOCX-grafiek na de gekozen alinea", () => {
    const voor = lees("docs/voorbeelden/Ontwerpnotitie.docx");
    const doc = delen(voor)["word/document.xml"];
    const ids = [...doc.matchAll(/w14:paraId="([0-9A-F]+)"/g)].map((m) => m[1]);
    if (!ids.length) return;
    const r = voegGrafiekToeDocx(voor, voorbeeld(), { paraId: ids[1] });
    const na = delen(r.bytes)["word/document.xml"];
    const pos = na.indexOf(`w14:paraId="${ids[1]}"`);
    const grafiek = na.indexOf("<w:drawing");
    expect(grafiek).toBeGreaterThan(pos);
    if (ids[2]) expect(grafiek).toBeLessThan(na.indexOf(`w14:paraId="${ids[2]}"`));
  });
  it("voegt een grafiekframe op een dia in PPTX toe", () => {
    const voor = lees("docs/voorbeelden/Ontwerpvisie.pptx");
    const r = voegGrafiekToePptx(voor, voorbeeld("ring"), { dia: 1 });
    const d = delen(r.bytes);
    expect(d["ppt/slides/slide2.xml"]).toContain("<p:graphicFrame>");
    expect(d["ppt/charts/chart1.xml"]).toContain("doughnutChart");
    const ids = zoekAlle(leesXml(d["ppt/slides/slide2.xml"]), "cNvPr").map((c) => attr(c, "id"));
    expect(new Set(ids).size).toBe(ids.length);
    const lijst = lijstGrafieken(r.bytes, "pptx");
    expect(lijst[0]).toMatchObject({ dia: 1, soort: "ring", vormId: r.vormId });
  });
  it("leidt het bronbereik af uit de verwijzingen", () => {
    expect(bronUitModel(voorbeeld())).toEqual({
      blad: "Blad 1",
      bereik: { top: 0, left: 0, bottom: 3, right: 2 },
      reeksenIn: "kolommen",
      koprij: true,
      kopkolom: true,
    });
  });
});

describe("kleuren bij het lezen", () => {
  it("neemt de witte rand van taartpunten niet over als reekskleur", () => {
    const g = leesGrafiekXml(grafiekXml(voorbeeld("ring")));
    expect(g.model.reeksen.every((r) => r.kleur === undefined)).toBe(true);
    const k = leesGrafiekXml(grafiekXml({ ...voorbeeld("kolom"), reeksen: voorbeeld().reeksen.map((r, i) => ({ ...r, kleur: i ? "112233" : "AA5500" })) }));
    expect(k.model.reeksen.map((r) => r.kleur)).toEqual(["AA5500", "112233"]);
  });
});

describe("round-trip met de echte engines", () => {
  it("XLSX: invoegen → engine openen, tonen en opslaan → grafiek nog aanwezig", async () => {
    const xlsx = await import("@betteroffice/xlsx");
    await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
    const r = voegGrafiekToeXlsx(lees("public/templates/nieuw.xlsx"), voorbeeld("lijn"), { blad: 0, col: 4, row: 1 });
    const boek = xlsx.openWorkbook(r.bytes);
    const regio = boek.displayList({ x: 0, y: 0, width: 3000, height: 2000 }).charts?.[0];
    expect(regio?.label).toMatch(/^Materiaal & kosten <test>.*line chart/);
    expect(regio?.id).toBe("xl/drawings/drawing1.xml#0");
    const opgeslagen = boek.save();
    boek.dispose();
    const lijst = lijstGrafieken(opgeslagen, "xlsx");
    expect(lijst).toHaveLength(1);
    expect(`${lijst[0].houderPad}#${lijst[0].ankerIndex}`).toBe(regio?.id);
    expect(lijst[0]).toMatchObject({ soort: "lijn", titel: "Materiaal & kosten <test>" });
    // Bewerken na de engine-rondgang.
    const bewerkt = bewerkGrafiek(opgeslagen, "xlsx", lijst[0].chartPad, { ...voorbeeld("vlak"), titel: "Nieuw" });
    expect(lijstGrafieken(bewerkt, "xlsx")[0]).toMatchObject({ soort: "vlak", titel: "Nieuw" });
  });
  it("PPTX: invoegen → engine openen en opslaan → grafiekframe behouden", async () => {
    const pptx = await import("@betteroffice/pptx");
    await pptx.initWasm(readFileSync("node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm"));
    const r = voegGrafiekToePptx(lees("docs/voorbeelden/Ontwerpvisie.pptx"), voorbeeld("combinatie"), { dia: 2 });
    const deck = pptx.openPresentation(r.bytes);
    const frame = deck.snapshot().slides[2].shapes.find((s) => s.sourceId === r.vormId);
    expect(frame?.kind).toBe("graphicFrame");
    expect(frame?.graphic).toMatchObject({ type: "chart", partPath: r.chartPad });
    const lijst = lijstGrafieken(deck.save(), "pptx");
    expect(lijst).toEqual([expect.objectContaining({ dia: 2, vormId: r.vormId, soort: "combinatie" })]);
  });
  it("DOCX: invoegen → editor-opslagkern (Yrs) → grafiek en ingesloten werkboek behouden", async () => {
    const { createYrsSession, saveYrsDocx } = await import("@betteroffice/docx/yrs");
    const r = voegGrafiekToeDocx(lees("docs/voorbeelden/Ontwerpnotitie.docx"), voorbeeld("taart"));
    const sessie = await createYrsSession();
    sessie.openDocx(r.bytes, true);
    const opgeslagen = (await saveYrsDocx(sessie)).bytes;
    const lijst = lijstGrafieken(opgeslagen, "docx");
    expect(lijst).toEqual([expect.objectContaining({ soort: "taart", titel: "Materiaal & kosten <test>" })]);
    const d = delen(opgeslagen);
    expect(Object.keys(d).some((n) => /^word\/embeddings\/.+\.xlsx$/.test(n))).toBe(true);
  }, 30000);
});

describe("gegevens uit een tabel in de tekst", () => {
  it("neemt de tabel rond de alinea over (op paraId of op alineatekst)", async () => {
    const { tabelBijAlinea } = await import("./documenten.ts");
    const bytes = lees("docs/voorbeelden/Ontwerpnotitie.docx");
    const raster = tabelBijAlinea(bytes, "00000000", "01");
    expect(raster?.length).toBe(3);
    expect(raster?.[0][0]).toBe("01");
    expect(tabelBijAlinea(bytes, "00000000", "Ruimte voor ideeën.")).toBeNull();
  });
});
