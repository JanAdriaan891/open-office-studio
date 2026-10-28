import { describe, expect, it } from "vitest";
import {
  kwastBegin,
  kwastStap,
  omschrijfOpmaak,
  opmaakUitBron,
  positieUitBron,
  type BronOpmaak,
  type GekopieerdeOpmaak,
} from "./kwast";

const bron = (extra: Partial<BronOpmaak> = {}): BronOpmaak => ({
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  superscript: false,
  subscript: false,
  fontFamily: null,
  fontSize: null,
  color: null,
  highlight: null,
  ...extra,
});
const opmaak: GekopieerdeOpmaak = { delta: { bold: true }, positie: "normaal", stijl: null };

describe("opmaakkwast", () => {
  it("klik = één keer, daarna uit", () => {
    let staat = kwastStap(kwastBegin, { soort: "klik", opmaak });
    expect(staat.modus).toBe("eenmalig");
    staat = kwastStap(staat, { soort: "toegepast" });
    expect(staat.modus).toBe("uit");
    expect(staat.opmaak).toBe(opmaak);
  });

  it("dubbelklik = blijvend tot Esc", () => {
    let staat = kwastStap(kwastBegin, { soort: "klik", opmaak });
    staat = kwastStap(staat, { soort: "dubbelklik", opmaak });
    expect(staat.modus).toBe("blijvend");
    staat = kwastStap(staat, { soort: "toegepast" });
    staat = kwastStap(staat, { soort: "toegepast" });
    expect(staat.modus).toBe("blijvend");
    staat = kwastStap(staat, { soort: "stop" });
    expect(staat.modus).toBe("uit");
  });

  it("nog een klik op een actieve kwast zet hem uit", () => {
    const actief = kwastStap(kwastBegin, { soort: "dubbelklik", opmaak });
    expect(kwastStap(actief, { soort: "klik", opmaak }).modus).toBe("uit");
  });

  it("kopiëren (Ctrl+Alt+C) onthoudt zonder te activeren", () => {
    const staat = kwastStap(kwastBegin, { soort: "kopieer", opmaak });
    expect(staat).toEqual({ modus: "uit", opmaak });
  });

  it("neemt de volledige tekenopmaak over en wist wat de bron niet heeft", () => {
    expect(
      opmaakUitBron(
        bron({ bold: true, fontFamily: "Inter", fontSize: 28, color: "c00000", highlight: "yellow" }),
      ),
    ).toEqual({
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      fontFamily: { ascii: "Inter", hAnsi: "Inter" },
      fontSize: 14,
      color: { rgb: "C00000" },
      highlight: "yellow",
    });
    const leeg = opmaakUitBron(bron());
    expect(leeg.color).toBeNull();
    expect(leeg.highlight).toBeNull();
    expect(leeg.fontSize).toBeUndefined();
  });

  it("laat gemengde waarden ongemoeid en kent themakleuren", () => {
    const delta = opmaakUitBron(bron({ bold: "mixed", color: "accent1" }));
    expect("bold" in delta).toBe(false);
    expect(delta.color).toEqual({ themeColor: "accent1" });
  });

  it("bepaalt super- en subscript", () => {
    expect(positieUitBron(bron({ superscript: true }))).toBe("superscript");
    expect(positieUitBron(bron({ subscript: true }))).toBe("subscript");
    expect(positieUitBron(bron())).toBe("normaal");
    expect(positieUitBron(bron({ subscript: "mixed" }))).toBeNull();
  });

  it("omschrijft de opmaak voor de knopuitleg", () => {
    expect(omschrijfOpmaak({ fontFamily: { ascii: "Inter" }, fontSize: 12, bold: true })).toBe(
      "Inter, 12 pt, vet",
    );
    expect(omschrijfOpmaak(null)).toBe("geen opmaak");
  });
});
