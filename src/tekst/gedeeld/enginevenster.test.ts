import { describe, expect, it, vi } from "vitest";
import { focusInVenster } from "./enginevenster";

function venster(veld: { focus: () => void } | null, bevat = false) {
  return {
    contains: () => bevat,
    querySelector: () => veld,
  } as unknown as Element;
}

describe("focusInVenster", () => {
  it("zet de focus op het eerste bedieningselement van een nieuw enginevenster", () => {
    const veld = { focus: vi.fn() };
    expect(focusInVenster(venster(veld), {} as Element)).toBe(true);
    expect(veld.focus).toHaveBeenCalledOnce();
  });

  it("laat de focus staan als die al in het venster staat", () => {
    const veld = { focus: vi.fn() };
    expect(focusInVenster(venster(veld, true), {} as Element)).toBe(false);
    expect(veld.focus).not.toHaveBeenCalled();
  });

  it("doet niets in een venster zonder bediening", () => {
    expect(focusInVenster(venster(null), null)).toBe(false);
  });
});
