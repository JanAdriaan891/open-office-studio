import { describe, expect, it } from "vitest";
import { GROOTSTE, WORD_GROOTTES, puntStap, volgendeGrootte } from "./groottereeks";

describe("lettergrootte volgens de Word-reeks", () => {
  it("volgt de reeks 8 … 72", () => {
    expect(WORD_GROOTTES).toEqual([8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]);
    const omhoog = [8];
    while (omhoog.at(-1)! < 72) omhoog.push(volgendeGrootte(omhoog.at(-1)!, 1));
    expect(omhoog).toEqual([...WORD_GROOTTES]);
    const omlaag = [72];
    while (omlaag.at(-1)! > 8) omlaag.push(volgendeGrootte(omlaag.at(-1)!, -1));
    expect(omlaag).toEqual([...WORD_GROOTTES].reverse());
  });

  it("springt van tussenwaarden naar de volgende in de reeks", () => {
    expect(volgendeGrootte(11.5, 1)).toBe(12);
    expect(volgendeGrootte(11.5, -1)).toBe(11);
    expect(volgendeGrootte(30, 1)).toBe(36);
    expect(volgendeGrootte(30, -1)).toBe(28);
  });

  it("gaat boven 72 per tien en onder 8 per punt", () => {
    expect(volgendeGrootte(72, 1)).toBe(80);
    expect(volgendeGrootte(80, 1)).toBe(90);
    expect(volgendeGrootte(80, -1)).toBe(72);
    expect(volgendeGrootte(75, -1)).toBe(72);
    expect(volgendeGrootte(8, -1)).toBe(7);
    expect(volgendeGrootte(2, -1)).toBe(1);
    expect(volgendeGrootte(1, -1)).toBe(1);
    expect(volgendeGrootte(7, 1)).toBe(8);
    expect(volgendeGrootte(GROOTSTE, 1)).toBe(GROOTSTE);
  });

  it("stapt met Ctrl+] en Ctrl+[ één punt", () => {
    expect(puntStap(11, 1)).toBe(12);
    expect(puntStap(11, -1)).toBe(10);
    expect(puntStap(10.5, 1)).toBe(11);
    expect(puntStap(10.5, -1)).toBe(10);
    expect(puntStap(1, -1)).toBe(1);
  });

  it("valt terug op 11 pt zonder geldige grootte", () => {
    expect(volgendeGrootte(Number.NaN, 1)).toBe(11);
    expect(puntStap(0, 1)).toBe(11);
  });
});
