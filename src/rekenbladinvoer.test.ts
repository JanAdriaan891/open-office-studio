import { describe, expect, it } from "vitest";
import { datumgetal, leesNederlands } from "./rekenbladinvoer";

describe("Nederlandse rekenbladinvoer", () => {
  it("laat invoer die de kern zelf kent ongemoeid", () => {
    for (const tekst of ["12", "-3", "1.5", "0.25", "", "=SUM(A1:A2)", "abc"])
      expect(leesNederlands(tekst)).toBeNull();
  });

  it("leest decimale komma’s en duizendtalpunten", () => {
    expect(leesNederlands("1,5")).toEqual({ invoer: "1.5" });
    expect(leesNederlands("-0,25")).toEqual({ invoer: "-0.25" });
    expect(leesNederlands("1.234,5")).toEqual({ invoer: "1234.5" });
    expect(leesNederlands("1.234.567")).toEqual({ invoer: "1234567" });
    expect(leesNederlands(" 12,50 ")).toEqual({ invoer: "12.5" });
    expect(leesNederlands("1,2,3")).toBeNull();
    expect(leesNederlands("12.34,5")).toBeNull();
  });

  it("zet procenten om met passende decimalen", () => {
    expect(leesNederlands("12,5%")).toEqual({
      invoer: "0.125",
      notatie: "0.0%",
    });
    expect(leesNederlands("15 %")).toEqual({ invoer: "0.15", notatie: "0%" });
  });

  it("herkent euro’s voor en achter het bedrag", () => {
    const euro = { invoer: "1234.5", notatie: '"€ "#,##0.00' };
    expect(leesNederlands("€ 1.234,50")).toEqual(euro);
    expect(leesNederlands("€1234,5")).toEqual(euro);
    expect(leesNederlands("1.234,50 €")).toEqual(euro);
  });

  it("leest dag-maand-jaar als datum", () => {
    expect(datumgetal(2026, 10, 26)).toBe(46321);
    expect(datumgetal(1900, 3, 1)).toBe(61);
    expect(leesNederlands("26-10-2026")).toEqual({
      invoer: "46321",
      notatie: "d-m-yyyy",
    });
    expect(leesNederlands("26/10/2026")?.invoer).toBe("46321");
    expect(leesNederlands("1-2-26")?.invoer).toBe(
      String(datumgetal(2026, 2, 1)),
    );
    expect(leesNederlands("1-2-95")?.invoer).toBe(
      String(datumgetal(1995, 2, 1)),
    );
    expect(leesNederlands("31-2-2026")).toBeNull();
    expect(leesNederlands("26-13-2026")).toBeNull();
  });

  it("leest tijden", () => {
    expect(leesNederlands("14:30")).toEqual({
      invoer: String(14.5 / 24),
      notatie: "h:mm",
    });
    expect(leesNederlands("8:05:30")?.notatie).toBe("h:mm:ss");
    expect(leesNederlands("24:00")).toBeNull();
  });
});
