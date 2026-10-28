import { describe, expect, it } from "vitest";
import {
  NOTATIES,
  STANDAARD_NOTATIE,
  formatteerDatum,
  maakMarkering,
  veldXml,
  veldcode,
  vervangMarkering,
} from "./datum";

describe("datum en tijd", () => {
  const datum = new Date(2026, 9, 28, 9, 5, 7);

  it("formatteert Nederlandse notaties", () => {
    expect(formatteerDatum(datum, "d-M-yyyy")).toBe("28-10-2026");
    expect(formatteerDatum(new Date(2026, 2, 1), "d-M-yyyy")).toBe("1-3-2026");
    expect(formatteerDatum(datum, "dd-MM-yy")).toBe("28-10-26");
    expect(formatteerDatum(datum, "dddd d MMMM yyyy")).toBe("woensdag 28 oktober 2026");
    expect(formatteerDatum(datum, "d MMM yyyy")).toBe("28 okt 2026");
    expect(formatteerDatum(datum, "yyyy-MM-dd")).toBe("2026-10-28");
    expect(formatteerDatum(datum, "HH:mm:ss")).toBe("09:05:07");
    expect(formatteerDatum(datum, "H:mm 'uur'")).toBe("9:05 uur");
  });

  it("heeft unieke notaties met datum- en tijdvelden", () => {
    expect(new Set(NOTATIES.map((n) => n.afbeelding)).size).toBe(NOTATIES.length);
    expect(veldcode(NOTATIES[STANDAARD_NOTATIE])).toBe(' DATE \\@ "d MMMM yyyy" ');
    expect(veldcode({ afbeelding: "HH:mm", tijd: true })).toBe(' TIME \\@ "HH:mm" ');
  });

  it("vervangt de markering door een veld met dezelfde runopmaak", () => {
    const m = maakMarkering("x1");
    const xml = `<w:p><w:r w:rsidR="1"><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Op ${m} getekend</w:t></w:r></w:p>`;
    const nieuw = vervangMarkering(xml, m, (rPr) => veldXml(NOTATIES[STANDAARD_NOTATIE], "28 oktober 2026", rPr));
    expect(nieuw).toBe(
      '<w:p><w:r w:rsidR="1"><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Op </w:t></w:r>' +
        '<w:fldSimple w:instr=" DATE \\@ &quot;d MMMM yyyy&quot; "><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">28 oktober 2026</w:t></w:r></w:fldSimple>' +
        '<w:r w:rsidR="1"><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> getekend</w:t></w:r></w:p>',
    );
  });

  it("weigert als de markering ontbreekt of dubbel is", () => {
    const m = maakMarkering("x2");
    expect(vervangMarkering("<w:r><w:t>niets</w:t></w:r>", m, () => "")).toBeNull();
    expect(vervangMarkering(`<w:r><w:t>${m}${m}</w:t></w:r>`, m, () => "")).toBeNull();
  });
});
