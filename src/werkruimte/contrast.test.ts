import { describe, expect, it } from "vitest";
import { contrast, leesKleur } from "./contrast";

/** Kleurparen uit openaec-shell.css, toegankelijkheid.css en werkruimte.css. */
const tekst: [string, string, string][] = [
  ["licht · tekst op lint", "#36363e", "#fafaf9"],
  ["licht · secundair op lint (gecorrigeerd)", "rgba(54, 54, 62, 0.74)", "#fafaf9"],
  ["licht · secundair op wit", "rgba(54, 54, 62, 0.74)", "#ffffff"],
  ["forge · tekst op lint", "#fafaf9", "#36363e"],
  ["forge · secundair op lint", "rgba(250, 250, 249, 0.6)", "#36363e"],
  ["statusbalk", "#d6d3d1", "#36363e"],
  ["toetstip", "#ffffff", "#36363e"],
  ["venster licht · zachte tekst", "#5e636d", "#ffffff"],
  ["venster forge · zachte tekst", "#c3c3c8", "#2a2a31"],
  ["venster forge · primaire knop", "#1c1c20", "#f59e0b"],
  ["venster licht · primaire knop", "#ffffff", "#a95606"],
];
const randen: [string, string, string][] = [
  ["licht · focusrand", "#bc6a15", "#fafaf9"],
  ["forge · focusrand", "#f5b13d", "#36363e"],
  ["venster licht · focusrand", "#a95606", "#ffffff"],
  ["venster forge · focusrand", "#f5b13d", "#2a2a31"],
];

describe("contrast", () => {
  it("leest hex en rgba", () => {
    expect(leesKleur("#fff")).toEqual([255, 255, 255, 1]);
    expect(leesKleur("rgba(1, 2, 3, 0.5)")).toEqual([1, 2, 3, 0.5]);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it.each(tekst)("%s haalt 4,5:1", (_, voor, achter) => {
    expect(contrast(voor, achter)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(randen)("%s haalt 3:1", (_, voor, achter) => {
    expect(contrast(voor, achter)).toBeGreaterThanOrEqual(3);
  });

  it("de oorspronkelijke waarden haalden het niet (reden voor de correctie)", () => {
    expect(contrast("rgba(54, 54, 62, 0.65)", "#fafaf9")).toBeLessThan(4.5);
    expect(contrast("#bc6a15", "#36363e")).toBeLessThan(3);
  });
});
