import { describe, expect, it } from "vitest";
import { abstractNumXml, getalIn, leesNummering, markering, numXml, sjabloon, voegToe, vrijeIds, LEGE_NUMMERING } from "./nummering";
import { lijstBlok, restVanBlok, vorigeLijst } from "./model";
import { planLijst } from "./plan";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const NUMMERING = `<w:numbering ${W}><w:abstractNum w:abstractNumId="3"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="2"><w:abstractNumId w:val="3"/></w:num><w:numIdMacAtCleanup w:val="2"/></w:numbering>`;

describe("nummernotaties", () => {
  it("telt in elke notatie", () => {
    expect([1, 4, 9, 14, 40].map((n) => getalIn("lowerRoman", n))).toEqual(["i", "iv", "ix", "xiv", "xl"]);
    expect(getalIn("upperRoman", 1999)).toBe("MCMXCIX");
    expect([1, 26, 27, 53].map((n) => getalIn("lowerLetter", n))).toEqual(["a", "z", "aa", "aaa"]);
    expect(getalIn("upperLetter", 3)).toBe("C");
    expect(getalIn("decimal", 12)).toBe("12");
  });

  it("maakt markeringen op meerdere niveaus", () => {
    const hier = sjabloon("niv:1.1.1.")!.niveaus;
    expect(markering(hier, 2, [3, 1, 2])).toBe("3.1.2.");
    const gemengd = sjabloon("niv:1.a.i.")!.niveaus;
    expect([0, 1, 2, 3].map((i) => markering(gemengd, i, [2, 2, 2, 2]))).toEqual(["2.", "b.", "ii.", "2."]);
    expect(markering(sjabloon("num:a)")!.niveaus, 0, [5])).toBe("e)");
    expect(markering(sjabloon("teken:✓")!.niveaus, 0, [1])).toBe("✓");
  });
});

describe("numbering.xml", () => {
  it("leest definities en vindt vrije ids", () => {
    const n = leesNummering(NUMMERING);
    expect(n.nums.get(2)).toEqual({ abstractNumId: 3, startOverrides: new Map() });
    expect(n.abstracts.get(3)).toEqual([{ ilvl: 0, numFmt: "decimal", lvlText: "%1.", start: 1 }]);
    expect(vrijeIds(n)).toEqual({ numId: 3, abstractNumId: 4 });
    expect(vrijeIds(leesNummering(null))).toEqual({ numId: 1, abstractNumId: 0 });
  });

  it("voegt definities in schemavolgorde toe", () => {
    const uit = voegToe(NUMMERING, { abstractNum: abstractNumXml(sjabloon("num:a)")!, 4, 3), num: numXml(3, 4) });
    const volgorde = [...uit.matchAll(/<w:(abstractNum|num|numIdMacAtCleanup) /g)].map((m) => m[1]);
    expect(volgorde).toEqual(["abstractNum", "abstractNum", "num", "num", "numIdMacAtCleanup"]);
    const n = leesNummering(uit);
    expect(n.abstracts.get(4)?.slice(0, 2)).toEqual([
      { ilvl: 0, numFmt: "lowerLetter", lvlText: "%1)", start: 3 },
      { ilvl: 1, numFmt: "lowerRoman", lvlText: "%2)", start: 1 },
    ]);
    expect(n.abstracts.get(4)).toHaveLength(9);
  });

  it("maakt een herstart met startOverride", () => {
    const uit = voegToe(NUMMERING, { num: numXml(3, 3, { ilvl: 0, start: 5 }) });
    expect(leesNummering(uit).nums.get(3)).toEqual({ abstractNumId: 3, startOverrides: new Map([[0, 5]]) });
  });

  it("vult een lege nummering", () => {
    const uit = voegToe(LEGE_NUMMERING, { abstractNum: abstractNumXml(sjabloon("teken:•")!, 0), num: numXml(1, 0) });
    const n = leesNummering(uit);
    expect(n.abstracts.get(0)?.[0]).toMatchObject({ numFmt: "bullet", lvlText: "•" });
    expect(n.nums.get(1)?.abstractNumId).toBe(0);
  });
});

const alinea = (id: string, numId?: number, ilvl = 0, bullet = false) => ({
  paraId: id,
  properties: numId ? { numPr: { numId, ilvl }, listIsBullet: bullet } : {},
});

describe("welke alinea's een lijstopdracht raakt", () => {
  const alle = [alinea("a"), alinea("b", 2), alinea("c", 2, 1), alinea("d", 2), alinea("e"), alinea("f", 2), alinea("g", 1, 0, true)];

  it("neemt het aaneengesloten lijstblok", () => {
    expect(lijstBlok(alle, 2, 2)).toEqual([1, 2, 3]);
    expect(restVanBlok(alle, 2, 2)).toEqual([2, 3]);
    expect(lijstBlok(alle, 0, 0)).toEqual([0]);
  });

  it("vindt de vorige lijst om bij aan te sluiten", () => {
    expect(vorigeLijst(alle, 4, null)).toBe(2);
    expect(vorigeLijst([alinea("x", 5), ...alle], 6, { numId: 2, ilvl: 0 })).toBe(5);
    expect(vorigeLijst(alle, 1, { numId: 2, ilvl: 0 })).toBeNull();
  });

  it("plant engine-stappen en een pakketwijziging", () => {
    const nummering = leesNummering(NUMMERING);
    const nieuw = planLijst(alle, 2, 2, { sjabloon: "num:a." }, nummering);
    expect(nieuw.engine.map((e) => [e.paraId, e.numPr.numId, e.numPr.ilvl])).toEqual([
      ["b", 3, 0],
      ["c", 3, 1],
      ["d", 3, 0],
    ]);
    expect(nieuw.pakket).toMatchObject({ soort: "sjabloon", numId: 3, abstractNumId: 4, beginBij: 1 });

    const niveau = planLijst(alle, 1, 1, { niveau: 2 }, nummering);
    expect(niveau).toEqual({ engine: [{ paraId: "b", numPr: { numId: 2, ilvl: 2 }, wisInspringen: true }], pakket: null });

    const opnieuw = planLijst(alle, 2, 2, { nummering: { beginBij: 7 } }, nummering);
    expect(opnieuw.engine.map((e) => e.paraId)).toEqual(["c", "d"]);
    expect(opnieuw.pakket).toEqual({ soort: "opnieuw", numId: 3, abstractNumId: 3, ilvl: 1, beginBij: 7 });

    const doorgaan = planLijst(alle, 5, 5, { nummering: "doorgaan" }, nummering);
    expect(doorgaan.engine).toEqual([]);
    expect(() => planLijst(alle, 0, 0, { nummering: "doorgaan" }, nummering)).toThrow(/geen eerdere lijst/);
    expect(() => planLijst(alle, 0, 0, { nummering: { beginBij: 1 } }, nummering)).toThrow(/in een lijst/);
  });
});
