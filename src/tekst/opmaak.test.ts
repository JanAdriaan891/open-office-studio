import { describe, expect, it } from "vitest";
import {
  achtstenNaarPt,
  cmNaarTwips,
  eersteRegelNaarOoxml,
  eersteRegelUitOoxml,
  getalTekst,
  halvePuntenNaarPt,
  hexKleur,
  leesGetal,
  ptNaarAchtsten,
  ptNaarHalvePunten,
  ptNaarTwips,
  regelafstandNaarOoxml,
  regelafstandUitOoxml,
  twipsNaarCm,
  twipsNaarPt,
} from "./eenheden";
import { alineaAttrs, leesTekens, nieuweDirecteOpmaak, numeriekId, tekenDelta } from "./opmaak";
import { formulierUit, wijzigingUit } from "./alinea/model";

describe("eenheden", () => {
  it("rekent cm en pt om naar twips en terug", () => {
    expect(cmNaarTwips(2.54)).toBe(1440);
    expect(cmNaarTwips(1)).toBe(567);
    expect(cmNaarTwips(1.25)).toBe(709);
    expect(twipsNaarCm(1440)).toBeCloseTo(2.54);
    expect(ptNaarTwips(12)).toBe(240);
    expect(twipsNaarPt(200)).toBe(10);
    expect(ptNaarHalvePunten(10.5)).toBe(21);
    expect(halvePuntenNaarPt(22)).toBe(11);
  });

  it("begrenst randdikte op wat Word toestaat", () => {
    expect(ptNaarAchtsten(0.5)).toBe(4);
    expect(ptNaarAchtsten(0.1)).toBe(2);
    expect(ptNaarAchtsten(20)).toBe(96);
    expect(achtstenNaarPt(12)).toBe(1.5);
  });

  it("leest getallen zoals een Nederlandse gebruiker ze typt", () => {
    expect(leesGetal("1,5")).toBe(1.5);
    expect(leesGetal("1.5 cm")).toBe(1.5);
    expect(leesGetal(" -0,63cm ")).toBe(-0.63);
    expect(leesGetal("12 pt")).toBe(12);
    expect(leesGetal("abc")).toBeNull();
    expect(leesGetal("")).toBeNull();
    expect(getalTekst(1.25)).toBe("1,25");
    expect(getalTekst(2)).toBe("2");
  });

  it("zet regelafstand om naar w:line/w:lineRule en terug", () => {
    expect(regelafstandNaarOoxml({ soort: "enkel" })).toEqual({ lineSpacing: 240, lineSpacingRule: "auto" });
    expect(regelafstandNaarOoxml({ soort: "anderhalf" })).toEqual({ lineSpacing: 360, lineSpacingRule: "auto" });
    expect(regelafstandNaarOoxml({ soort: "dubbel" })).toEqual({ lineSpacing: 480, lineSpacingRule: "auto" });
    expect(regelafstandNaarOoxml({ soort: "meerdere", regels: 1.15 })).toEqual({ lineSpacing: 276, lineSpacingRule: "auto" });
    expect(regelafstandNaarOoxml({ soort: "minimaal", pt: 14 })).toEqual({ lineSpacing: 280, lineSpacingRule: "atLeast" });
    expect(regelafstandNaarOoxml({ soort: "exact", pt: 12.5 })).toEqual({ lineSpacing: 250, lineSpacingRule: "exact" });
    expect(regelafstandUitOoxml(360, "auto")).toEqual({ soort: "anderhalf" });
    expect(regelafstandUitOoxml(276, "auto")).toEqual({ soort: "meerdere", regels: 1.15 });
    expect(regelafstandUitOoxml(280, "atLeast")).toEqual({ soort: "minimaal", pt: 14 });
    expect(regelafstandUitOoxml(250, "exact")).toEqual({ soort: "exact", pt: 12.5 });
    expect(regelafstandUitOoxml(null, null)).toEqual({ soort: "enkel" });
  });

  it("kent eerste regel en verkeerd-om inspringen", () => {
    expect(eersteRegelUitOoxml(709, false)).toEqual({ soort: "eerste", cm: 1.25 });
    expect(eersteRegelUitOoxml(709, true)).toEqual({ soort: "verkeerd", cm: 1.25 });
    expect(eersteRegelUitOoxml(-567, false)).toEqual({ soort: "verkeerd", cm: 1 });
    expect(eersteRegelUitOoxml(0, false).soort).toBe("geen");
    expect(eersteRegelNaarOoxml("verkeerd", 0.63)).toEqual({ indentFirstLine: 357, hangingIndent: true });
    expect(eersteRegelNaarOoxml("geen", 1)).toEqual({ indentFirstLine: null, hangingIndent: false });
  });

  it("normaliseert hexkleuren", () => {
    expect(hexKleur("#ff00aa")).toBe("FF00AA");
    expect(hexKleur("00ff00")).toBe("00FF00");
    expect(hexKleur("rood")).toBeNull();
  });
});

describe("alineaopmaak voor de engine", () => {
  it("houdt de directe opmaak bij die de engine bij opslaan schrijft", () => {
    const uit = nieuweDirecteOpmaak(
      { indentLeft: 720, keepNext: true, spacingExplicit: { before: true } },
      { indentLeft: 1134, keepNext: null, spaceAfter: 120, keepLines: true },
    );
    expect(uit).toEqual({ indentLeft: 1134, spaceAfter: 120, keepLines: true, spacingExplicit: { before: true, after: true } });
  });

  it("stuurt getypte velden getypt en de rest via other", () => {
    const attrs = alineaAttrs(
      { _originalFormatting: { alignment: "center" } },
      { spaceBefore: 240, indentFirstLine: 357, hangingIndent: true, tabs: [{ position: 1134, alignment: "right", leader: "dot" }] },
    );
    expect(attrs.spaceBefore).toBe(240);
    expect(attrs.indentFirstLine).toBe(357);
    expect(attrs).not.toHaveProperty("tabs");
    expect(attrs).not.toHaveProperty("hangingIndent");
    expect(attrs.other).toMatchObject({
      hangingIndent: true,
      tabs: [{ position: 1134, alignment: "right", leader: "dot" }],
      _originalFormatting: {
        alignment: "center",
        spaceBefore: 240,
        indentFirstLine: 357,
        hangingIndent: true,
        spacingExplicit: { before: true },
      },
    });
  });

  it("wist verkeerd-om samen met de eerste regel", () => {
    const attrs = alineaAttrs({ _originalFormatting: { indentFirstLine: 357, hangingIndent: true } }, { indentFirstLine: null });
    expect(attrs.indentFirstLine).toBeNull();
    expect(attrs.other).toMatchObject({ hangingIndent: false, _originalFormatting: {} });
    expect((attrs.other as Record<string, Record<string, unknown>>)._originalFormatting).not.toHaveProperty("hangingIndent");
  });

  it("maakt van een tekst-id een stabiel getal", () => {
    expect(numeriekId("505018653:1")).toBe(numeriekId("505018653:1"));
    expect(numeriekId("505018653:1")).not.toBe(numeriekId("505018653:2"));
    expect(numeriekId("x")).toBeGreaterThan(0);
  });
});

describe("alineavenster", () => {
  const p = {
    alignment: "both",
    indentLeft: 567,
    indentFirstLine: 357,
    hangingIndent: true,
    spaceBefore: 120,
    spaceAfter: 200,
    lineSpacing: 276,
    lineSpacingRule: "auto",
    keepNext: true,
    tabs: [
      { position: 2835, alignment: "right", leader: "dot" },
      { pos: 1134, val: "center" },
    ],
  };

  it("leest de eigenschappen van de engine", () => {
    const f = formulierUit(p);
    expect(f).toMatchObject({
      uitlijning: "both",
      links: 1,
      speciaal: "verkeerd",
      speciaalCm: 0.63,
      voor: 6,
      na: 10,
      regel: { soort: "meerdere", regels: 1.15 },
      volgende: true,
      zwevend: true,
    });
    expect(f.tabs).toEqual([
      { cm: 2, uitlijning: "center", opvul: "none" },
      { cm: 5, uitlijning: "right", opvul: "dot" },
    ]);
  });

  it("geeft alleen gewijzigde velden door", () => {
    const f = formulierUit(p);
    expect(wijzigingUit(f, f)).toEqual({});
    expect(wijzigingUit(f, { ...f, na: 0, regel: { soort: "exact", pt: 12 }, bijeen: true })).toEqual({
      spaceAfter: 0,
      lineSpacing: 240,
      lineSpacingRule: "exact",
      keepLines: true,
    });
    expect(wijzigingUit(f, { ...f, speciaal: "geen" })).toEqual({ indentFirstLine: null, hangingIndent: null });
    expect(wijzigingUit(f, { ...f, tabs: [] })).toEqual({ tabs: null });
    expect(wijzigingUit(f, { ...f, links: 0 })).toEqual({ indentLeft: null });
  });
});

describe("tekenopmaak voor de engine", () => {
  it("bouwt een delta voor formatRange", () => {
    expect(
      tekenDelta({
        fontFamily: "Arial",
        fontSize: 14,
        color: "112233",
        underline: { style: "wave", color: "FF0000" },
        strike: "dubbel",
        vertAlign: "superscript",
        smallCaps: true,
        allCaps: false,
        spacing: 20,
      }),
    ).toEqual({
      fontFamily: { ascii: "Arial", hAnsi: "Arial" },
      fontSize: 14,
      color: { rgb: "112233" },
      strike: { double: true },
      other: {
        underline: { style: "wave", color: { rgb: "FF0000" } },
        superscript: true,
        subscript: null,
        smallCaps: true,
        allCaps: null,
        characterSpacing: { spacing: 20 },
      },
    });
    expect(tekenDelta({ underline: null, strike: null })).toEqual({ underline: null, strike: null });
    expect(tekenDelta({ scale: 100 }, { spacing: 10 })).toEqual({ other: { characterSpacing: { spacing: 10 } } });
    expect(tekenDelta({ spacing: 0 })).toEqual({ other: { characterSpacing: null } });
  });

  it("leest run-attributen met de alineastandaard als terugval", () => {
    const t = leesTekens(
      { underline: { style: "dotted", color: "00AA00" }, strike: { double: true }, smallCaps: true, characterSpacing: { spacing: 30 } },
      { fontFamily: { ascii: "Cambria" }, fontSize: 22 },
    );
    expect(t).toMatchObject({
      fontFamily: "Cambria",
      fontSize: 11,
      underline: { style: "dotted", color: "00AA00" },
      strike: "dubbel",
      smallCaps: true,
      afstand: { spacing: 30 },
    });
  });
});

describe("sneltoetsen van de opmaakvensters", () => {
  it("staan allemaal in het register", async () => {
    const { readFileSync } = await import("node:fs");
    const { vasteSneltoetsen, normaliseer, botsingen } = await import("../lint/sneltoetsenlijst");
    const bron = readFileSync(new URL("./TekstOpmaak.tsx", import.meta.url), "utf8");
    const toetsen = [...bron.matchAll(/toets:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(toetsen.length).toBeGreaterThan(1);
    const bekend = new Set(vasteSneltoetsen.filter((i) => i.module === "tekst").map((i) => normaliseer(i.toets)));
    expect(toetsen.filter((t) => !bekend.has(normaliseer(t)))).toEqual([]);
    expect(botsingen(vasteSneltoetsen)).toEqual([]);
  });
});
