import { describe, expect, it } from "vitest";
import { auteurs, getoond, inSelectie, samenvatting, soortNaam, toonDatum, type Revisie } from "./logica";
import { meldingen, resultaatNaam, verschilTekst } from "./vergelijken";

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
  it("vertaalt en groepeert meldingen van de vergelijking", () => {
    const d = (code: string, severity: "error" | "warning" | "info") => ({ code, severity, message: "engine", locations: [] }) as never;
    const uit = meldingen([d("formatting-change", "warning"), d("paragraph-insertion", "error"), d("paragraph-insertion", "error"), d("iets-nieuws", "info")]);
    expect(uit[0]).toMatchObject({ ernst: "error", aantal: 2 });
    expect(uit[0].tekst).toMatch(/alinea’s toegevoegd/);
    expect(uit.at(-1)?.tekst).toBe("engine");
  });
  it("beschrijft verschillen en noemt het resultaat", () => {
    const span = (text: string) => ({ part: "word/document.xml", partSha256: "", path: [], start: 0, end: text.length, text });
    expect(verschilTekst({ id: "c", kind: "replacement", original: span("kat"), revised: span("hond") })).toEqual({ soort: "Vervangen", oud: "kat", nieuw: "hond" });
    expect(verschilTekst({ id: "c", kind: "insertion", original: span(""), revised: span("ja") }).soort).toBe("Ingevoegd");
    expect(resultaatNaam("Plan v1.docx", "Plan: v2.docx")).toBe("Vergelijking Plan v1 – Plan- v2.docx");
  });
  it("toont een Nederlandse datum", () => {
    expect(toonDatum("2026-10-01T10:00:00Z")).toMatch(/1 okt/);
    expect(toonDatum("onzin")).toBe("");
  });
});
