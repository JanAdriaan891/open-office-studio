import { describe, expect, it } from "vitest";
import { kiesSpiegeldeel } from "./meten";

describe("cursorregel uit de spiegel", () => {
  const delen = [
    { element: "anker", start: 10, eind: 10 },
    { element: "run1", start: 10, eind: 15 },
    { element: "run2", start: 15, eind: 20 },
  ];
  it("neemt het tekstdeel waarin de positie valt", () => {
    expect(kiesSpiegeldeel(delen, 12)).toBe("run1");
    expect(kiesSpiegeldeel(delen, 15)).toBe("run2");
  });
  it("neemt aan het eind van de alinea het laatste deel", () => {
    expect(kiesSpiegeldeel(delen, 20)).toBe("run2");
  });
  it("valt in een lege alinea terug op het lege anker", () => {
    expect(kiesSpiegeldeel([{ element: "leeg", start: 30, eind: 30 }], 30)).toBe("leeg");
    expect(kiesSpiegeldeel(delen, 40)).toBeNull();
  });
});
