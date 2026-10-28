import { describe, expect, it } from "vitest";
import {
  leesDocStandaarden,
  leesStijlen,
  leesThemaLettertypen,
  nieuweStijl,
  verwijderStijl,
  wijzigDocStandaarden,
  wijzigStijl,
  wijzigThemaLettertypen,
  StijlFout,
} from "./stijlenxml";
import { leesXml } from "../../grafieken/xml";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const stijlen = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/><w:sz w:val="22"/><w:lang w:val="en-US" w:eastAsia="ja-JP"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="480" w:after="0"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:eastAsia="MS Gothic"/><w:b/><w:color w:val="365F91" w:themeColor="accent1"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/></w:rPr></w:style></w:styles>`;

describe("stijlen lezen", () => {
  it("geeft stijlen met hun directe eigenschappen", () => {
    const lijst = leesStijlen(stijlen);
    expect(lijst.map((s) => s.styleId)).toEqual(["Normal", "Heading1", "Strong"]);
    const kop = lijst[1];
    expect(kop.naam).toBe("heading 1");
    expect(kop.gebaseerdOp).toBe("Normal");
    expect(kop.eigenschappen).toMatchObject({
      vet: true,
      grootte: 14,
      kleur: "365F91",
      ruimteVoor: 24,
      ruimteNa: 0,
      bijVolgende: true,
      overzichtsniveau: 0,
    });
    expect(leesDocStandaarden(stijlen)).toMatchObject({ grootte: 11, taal: "en-US" });
  });
});

describe("stijl wijzigen", () => {
  it("wijzigt alleen de genoemde eigenschappen, in schemavolgorde", () => {
    const uit = wijzigStijl(stijlen, "Heading1", {
      eigenschappen: { lettertype: "Carlito", grootte: 16, cursief: true, kleur: "C00000", uitlijning: "center", ruimteNa: 6 },
    });
    leesXml(uit); // blijft geldige XML
    const kop = leesStijlen(uit)[1];
    expect(kop.eigenschappen).toMatchObject({
      lettertype: "Carlito",
      grootte: 16,
      vet: true,
      cursief: true,
      kleur: "C00000",
      uitlijning: "center",
      ruimteVoor: 24,
      ruimteNa: 6,
    });
    // Themalettertype weg, oost-Aziatisch lettertype behouden.
    expect(uit).toContain('<w:rFonts w:eastAsia="MS Gothic" w:ascii="Carlito" w:hAnsi="Carlito" w:cs="Carlito"/>');
    // rPr-volgorde: rFonts, b, bCs?, i, iCs, color, sz, szCs.
    const rPr = /<w:style [^>]*w:styleId="Heading1">[\s\S]*?<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(uit)![1];
    const namen = [...rPr.matchAll(/<w:(\w+)/g)].map((m) => m[1]);
    expect(namen).toEqual(["rFonts", "b", "i", "iCs", "color", "sz", "szCs"]);
    // pPr-volgorde: keepNext, spacing, jc, outlineLvl.
    const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(uit)![1];
    expect([...pPr.matchAll(/<w:(\w+)/g)].map((m) => m[1])).toEqual(["keepNext", "spacing", "jc", "outlineLvl"]);
    // Andere stijlen ongewijzigd.
    expect(uit).toContain('<w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/></w:rPr></w:style>');
  });

  it("zet uit expliciet en haalt weg met null", () => {
    const uit = wijzigStijl(stijlen, "Heading1", { eigenschappen: { vet: false, kleur: null } });
    expect(uit).toContain('<w:b w:val="0"/><w:bCs w:val="0"/>');
    expect(uit).not.toContain("365F91");
    expect(leesStijlen(uit)[1].eigenschappen.vet).toBe(false);
  });

  it("wijzigt naam, basis en volgende stijl", () => {
    const uit = wijzigStijl(stijlen, "Heading1", { naam: "Kop één", gebaseerdOp: null, volgende: "Heading1" });
    const kop = leesStijlen(uit)[1];
    expect(kop.naam).toBe("Kop één");
    expect(kop.gebaseerdOp).toBeUndefined();
    expect(kop.volgende).toBe("Heading1");
  });

  it("weigert een kring en dubbele namen", () => {
    expect(() => wijzigStijl(stijlen, "Normal", { gebaseerdOp: "Heading1" })).toThrow(StijlFout);
    expect(() => wijzigStijl(stijlen, "Heading1", { naam: "normal" })).toThrow(/al een stijl/);
    expect(() => wijzigStijl(stijlen, "Bestaatniet", { naam: "x" })).toThrow(StijlFout);
  });

  it("maakt een rPr/pPr aan als de stijl die nog niet had", () => {
    const uit = wijzigStijl(stijlen, "Normal", { eigenschappen: { grootte: 12, regelafstand: 1.15 } });
    expect(uit).toContain('<w:qFormat/><w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>');
  });

  it("laat alinea-eigenschappen weg bij een tekenstijl", () => {
    const uit = wijzigStijl(stijlen, "Strong", { eigenschappen: { uitlijning: "center", kleur: "112233" } });
    expect(uit).toContain('<w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/><w:color w:val="112233"/></w:rPr></w:style>');
  });
});

describe("nieuwe stijl", () => {
  it("voegt een eigen alineastijl toe met een vrije id", () => {
    const { xml, styleId } = nieuweStijl(stijlen, {
      naam: "Notitie één",
      soort: "paragraph",
      gebaseerdOp: "Normal",
      eigenschappen: { cursief: true, ruimteNa: 12 },
    });
    expect(styleId).toBe("Notitieeen");
    const s = leesStijlen(xml).find((x) => x.styleId === styleId)!;
    expect(s).toMatchObject({ naam: "Notitie één", gebaseerdOp: "Normal", volgende: styleId, eigen: true, snelleStijl: true });
    expect(s.eigenschappen).toMatchObject({ cursief: true, ruimteNa: 12 });
    expect(nieuweStijl(xml, { naam: "Notitie een", soort: "paragraph" }).styleId).toBe("Notitieeen2");
  });

  it("maakt een tekenstijl zonder volgende stijl", () => {
    const { xml, styleId } = nieuweStijl(stijlen, { naam: "Accent", soort: "character", eigenschappen: { kleur: "AA0000", uitlijning: "center" } });
    expect(xml).toContain(`<w:style w:type="character" w:customStyle="1" w:styleId="${styleId}"><w:name w:val="Accent"/><w:qFormat/><w:rPr><w:color w:val="AA0000"/></w:rPr></w:style>`);
  });

  it("weigert een bestaande naam en verwijdert een eigen stijl", () => {
    expect(() => nieuweStijl(stijlen, { naam: "Heading 1", soort: "paragraph" })).toThrow(StijlFout);
    const { xml, styleId } = nieuweStijl(stijlen, { naam: "Weg", soort: "paragraph" });
    expect(verwijderStijl(xml, styleId)).toBe(stijlen);
  });
});

describe("documentstandaarden en thema", () => {
  it("wijzigt de taal en alinea-afstand van het document", () => {
    const uit = wijzigDocStandaarden(stijlen, { taal: "nl-NL", ruimteNa: 8, regelafstand: 1.08 });
    expect(uit).toContain('<w:lang w:val="nl-NL" w:eastAsia="ja-JP"/>');
    expect(uit).toContain('<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>');
    expect(leesDocStandaarden(uit)).toMatchObject({ taal: "nl-NL", ruimteNa: 8, grootte: 11 });
  });

  it("maakt docDefaults aan als die ontbreekt", () => {
    const kaal = `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
    const uit = wijzigDocStandaarden(kaal, { taal: "de-DE" });
    expect(uit).toContain('<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="de-DE"/></w:rPr></w:rPrDefault></w:docDefaults><w:style');
  });

  it("wisselt de thema-lettertypen", () => {
    const thema = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light" panose="020F0302020204030204"/><a:ea typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri" panose="020F0502020204030204"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;
    const uit = wijzigThemaLettertypen(thema, { koppen: "Source Serif 4", tekst: "Source Sans 3" });
    expect(leesThemaLettertypen(uit)).toEqual({ koppen: "Source Serif 4", tekst: "Source Sans 3" });
    expect(uit).toContain('<a:latin typeface="Source Serif 4"/><a:ea typeface=""/>');
  });
});
