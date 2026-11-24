import { describe, expect, it } from "vitest";
import { exportTekst, importTekst, lengteVan, metBouwsteen, schoonSegmenten, zoekOpNaam, type Bouwsteen, type Segment } from "./opslag";
import { invoegOps, segmentenTussen } from "./engine";

const steen = (naam: string, categorie = ""): Bouwsteen => ({
  id: naam,
  naam,
  categorie,
  tekst: naam,
  segmenten: [{ kind: "text", text: naam, attributes: {} }],
  gewijzigd: 0,
});

describe("bouwstenen", () => {
  it("zoekt op naam: exact of een unieke beginletter", () => {
    const lijst = [steen("adres"), steen("aanhef"), steen("groet")];
    expect(zoekOpNaam(lijst, "ADRES")?.naam).toBe("adres");
    expect(zoekOpNaam(lijst, "gr")?.naam).toBe("groet");
    expect(zoekOpNaam(lijst, "a")).toBeNull();
    expect(zoekOpNaam(lijst, "x")).toBeNull();
  });
  it("vervangt een bouwsteen met dezelfde naam en exporteert/importeert", () => {
    const lijst = metBouwsteen([steen("adres")], { ...steen("Adres"), id: "nieuw" });
    expect(lijst).toHaveLength(1);
    expect(importTekst(exportTekst(lijst))[0].naam).toBe("Adres");
    expect(() => importTekst('{"soort":"iets"}')).toThrow();
  });
  it("schoont document-eigen gegevens en voegt gelijke tekst samen", () => {
    const uit = schoonSegmenten([
      { kind: "text", text: "a", attributes: { bold: true, ins: { id: 1 } } },
      { kind: "text", text: "b", attributes: { bold: true } },
      { kind: "pilcrow", properties: { pStyle: "Heading1", _originalFormatting: {}, bookmarks: [] }, attributes: {} },
      { kind: "embed", embedKind: "image", payload: {}, attributes: {} },
    ]);
    expect(uit).toEqual([
      { kind: "text", text: "ab", attributes: { bold: true } },
      { kind: "pilcrow", properties: { pStyle: "Heading1" }, attributes: {} },
    ]);
  });
  it("snijdt een bereik uit verhaalsegmenten en maakt invoegbewerkingen", () => {
    const alle: Segment[] = [
      { kind: "text", text: "Hallo wereld", attributes: { italic: true } },
      { kind: "pilcrow", properties: {}, attributes: {} },
      { kind: "text", text: "Twee", attributes: {} },
    ];
    const { segmenten } = segmentenTussen(alle, 6, 15);
    expect(segmenten.map((s) => (s.kind === "text" ? s.text : "¶")).join("")).toBe("wereld¶Tw");
    expect(lengteVan(segmenten)).toBe(9);
    const ops = invoegOps(segmenten, 3) as { op: string; index: number }[];
    expect(ops.map((o) => [o.op, o.index])).toEqual([
      ["insert", 3],
      ["insertEmbed", 9],
      ["insert", 10],
    ]);
  });
});
