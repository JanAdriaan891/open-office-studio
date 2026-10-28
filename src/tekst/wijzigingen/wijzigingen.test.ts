import { describe, expect, it } from "vitest";
import { auteurs, getoond, inSelectie, samenvatting, soortNaam, toonDatum, type Revisie } from "./logica";

const rev = (id: string, author: string, kind: string, para: string, van: number, tot: number, eindPara = para): Revisie => ({
  revisionId: id,
  author,
  date: "2026-10-01T10:00:00Z",
  kind,
  story: "body",
  preview: "",
  range: { story: "body", start: { paraId: para, offset: van }, end: { paraId: eindPara, offset: tot } },
});

const lijst = [rev("1", "Anna", "insertion", "a", 6, 16), rev("2", "Bram", "deletion", "a", 23, 27), rev("3", "Anna", "pPrChange", "b", 0, 5)];

describe("wijzigingen", () => {
  it("telt per auteur en per soort", () => {
    expect(auteurs(lijst)).toEqual([
      { naam: "Anna", aantal: 2 },
      { naam: "Bram", aantal: 1 },
    ]);
    expect(samenvatting(lijst)).toEqual({ totaal: 3, ingevoegd: 1, verwijderd: 1, opmaak: 1 });
    expect(soortNaam("trIns")).toBe("Rij ingevoegd");
    expect(soortNaam("iets")).toBe("Gewijzigd");
  });
  it("filtert verborgen auteurs", () => {
    expect(getoond(lijst, new Set(["Anna"])).map((r) => r.revisionId)).toEqual(["2"]);
    expect(getoond(lijst, new Set())).toHaveLength(3);
  });
  it("bepaalt of een wijziging in de selectie ligt, ook over alinea’s", () => {
    const volgorde = (_: string, p: string) => ["a", "b", "c"].indexOf(p);
    const plek = (paraId: string, offset: number) => ({ story: "body", paraId, offset });
    expect(lijst.filter((r) => inSelectie(r, plek("a", 0), plek("a", 20), volgorde)).map((r) => r.revisionId)).toEqual(["1"]);
    expect(lijst.filter((r) => inSelectie(r, plek("a", 20), plek("b", 2), volgorde)).map((r) => r.revisionId)).toEqual(["2", "3"]);
    // Omgekeerde selectie en cursor in een wijziging.
    expect(lijst.filter((r) => inSelectie(r, plek("b", 2), plek("a", 20), volgorde))).toHaveLength(2);
    expect(lijst.filter((r) => inSelectie(r, plek("a", 10), plek("a", 10), volgorde)).map((r) => r.revisionId)).toEqual(["1"]);
  });
  it("toont een Nederlandse datum", () => {
    expect(toonDatum("2026-10-01T10:00:00Z")).toMatch(/1 okt/);
    expect(toonDatum("onzin")).toBe("");
  });
});
