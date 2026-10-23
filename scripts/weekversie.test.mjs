import { describe, expect, it } from "vitest";
import { weekgegevens } from "./weekversie.mjs";
describe("ISO-weekversies", () => {
  it.each([
    ["2026-10-23", 2026, 43],
    ["2021-01-01", 2020, 53],
    ["2024-12-30", 2025, 1],
    ["2026-12-31", 2026, 53],
    ["2027-01-01", 2026, 53],
  ])("bepaalt voor %s het juiste weekjaar", (datum, jaar, week) => {
    expect(weekgegevens(datum)).toEqual({ jaar, week });
  });
  it.each(["2026-02-30", "2026-13-01", "geen datum"])("weigert %s", (datum) => {
    expect(() => weekgegevens(datum)).toThrow();
  });
});
