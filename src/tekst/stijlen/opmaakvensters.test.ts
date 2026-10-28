import { describe, expect, it } from "vitest";
import { alineaBegin, lettertypeBegin, vanAlineaOpmaak, vanTekenOpmaak } from "./opmaakvensters";
import { leesStijlen, wijzigStijl } from "./stijlenxml";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const stijlen = `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

describe("koppeling met de vensters Lettertype… en Alinea…", () => {
  it("vult het lettertypevenster uit de stijl en neemt de wijziging over", () => {
    const begin = lettertypeBegin({ fontSize: 28, bold: true, color: { rgb: "365F91" } }, { cursief: true }, "Carlito");
    expect(begin).toMatchObject({ familie: "Carlito", grootte: 14, stijl: "vetcursief", kleur: "365F91" });
    const e = vanTekenOpmaak({ underline: { style: "double", color: "FF0000" }, smallCaps: true, spacing: 20, scale: 100, vertAlign: null });
    expect(e).toEqual({ onderstreping: "double", onderstrepingKleur: "FF0000", kleineHoofdletters: true, tekenafstand: 20, schaal: null, verticaal: "baseline" });
    const xml = wijzigStijl(stijlen, "Normal", { eigenschappen: e });
    expect(xml).toContain('<w:rPr><w:smallCaps/><w:spacing w:val="20"/><w:u w:val="double" w:color="FF0000"/><w:vertAlign w:val="baseline"/></w:rPr>');
  });

  it("vult het alineavenster uit de stijl en neemt de wijziging over", () => {
    const begin = alineaBegin({ spaceAfter: 160, lineSpacing: 259, lineSpacingRule: "auto" }, { uitlijning: "center", eersteRegel: -0.5 });
    expect(begin).toMatchObject({ uitlijning: "center", na: 8, speciaal: "verkeerd" });
    const e = vanAlineaOpmaak({ lineSpacing: 360, lineSpacingRule: "exact", widowControl: false, contextualSpacing: true, indentFirstLine: 567, hangingIndent: false });
    expect(e).toEqual({ regelafstandPt: { pt: 18, regel: "exact" }, zwevendeRegels: false, contextueel: true, eersteRegel: 1 });
    const xml = wijzigStijl(stijlen, "Normal", { eigenschappen: e });
    expect(xml).toContain('<w:pPr><w:widowControl w:val="0"/><w:spacing w:line="360" w:lineRule="exact"/><w:ind w:firstLine="567"/><w:contextualSpacing/></w:pPr>');
    expect(leesStijlen(xml)[0].eigenschappen.eersteRegel).toBe(1);
  });
});
