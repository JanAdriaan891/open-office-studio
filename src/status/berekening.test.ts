import { describe, expect, it } from "vitest";
import { getal, schuifNaarZoom, selectieStatistiek, zoomNaarSchuif } from "./berekening";

describe("statusbalk", () => {
  it("zet de zoomschuif om met 100% in het midden", () => {
    expect(schuifNaarZoom(50)).toBe(1);
    expect(schuifNaarZoom(0)).toBe(0.1);
    expect(schuifNaarZoom(100)).toBe(5);
    expect(schuifNaarZoom(51)).toBe(1); // klikt vast bij 100%
    expect(schuifNaarZoom(75)).toBe(3);
    expect(zoomNaarSchuif(1)).toBe(50);
    expect(zoomNaarSchuif(0.1)).toBe(0);
    expect(zoomNaarSchuif(5)).toBe(100);
    for (const zoom of [0.25, 0.5, 1.5, 2, 4]) expect(schuifNaarZoom(zoomNaarSchuif(zoom))).toBeCloseTo(zoom, 1);
  });

  it("berekent som, gemiddelde en aantal zoals een rekenblad", () => {
    const n = (value: number) => ({ kind: "number", value });
    const leeg = { kind: "empty" };
    const tekst = { kind: "text", value: "a" };
    expect(selectieStatistiek([[n(1), n(2), leeg], [tekst, n(-3), { kind: "error", value: "#DIV/0!" }]])).toEqual({
      aantal: 5,
      getallen: 3,
      som: 0,
      gemiddelde: 0,
      minimum: -3,
      maximum: 2,
    });
    expect(selectieStatistiek([[leeg, tekst]])).toMatchObject({ getallen: 0, gemiddelde: null, minimum: null });
  });

  it("toont getallen in Nederlandse notatie zonder afrondingsruis", () => {
    expect(getal(0.1 + 0.2)).toBe("0,3");
    expect(getal(1234567.5)).toBe("1.234.567,5");
  });
});
