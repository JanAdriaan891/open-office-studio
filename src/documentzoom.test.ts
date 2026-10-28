import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ankerScroll,
  begrens,
  bewaarZoom,
  leesZoom,
  stap,
  toetsZoom,
  wielZoom,
} from "./documentzoom";

describe("documentzoom", () => {
  it("begrenst tussen 10% en 500%", () => {
    expect(begrens(0.01)).toBe(0.1);
    expect(begrens(9)).toBe(5);
    expect(begrens(1.23456)).toBe(1.235);
  });

  it("zet vaste stappen van 10%, ook vanaf een tussenwaarde", () => {
    expect(stap(1, 1)).toBe(1.1);
    expect(stap(1, -1)).toBe(0.9);
    expect(stap(0.588, 1)).toBe(0.6);
    expect(stap(0.588, -1)).toBe(0.5);
    expect(stap(0.1, -1)).toBe(0.1);
    expect(stap(5, 1)).toBe(5);
  });

  it("zoomt met het muiswiel in stappen en met het touchpad vloeiend", () => {
    expect(wielZoom(1, { deltaY: -100, deltaMode: 0 })).toBe(1.1);
    expect(wielZoom(1, { deltaY: 120, deltaMode: 0 })).toBe(0.9);
    expect(wielZoom(1, { deltaY: -3, deltaMode: 1 })).toBe(1.1);
    const knijp = wielZoom(1, { deltaY: -4.2, deltaMode: 0 });
    expect(knijp).toBeGreaterThan(1);
    expect(knijp).toBeLessThan(1.1);
    expect(wielZoom(1, { deltaY: 0, deltaMode: 0 })).toBe(1);
  });

  it("leidt Ctrl + 0, = en − om naar documentzoom", () => {
    expect(toetsZoom(1.7, { key: "0", code: "Digit0" })).toBe(1);
    expect(toetsZoom(1, { key: "=", code: "Equal" })).toBe(1.1);
    expect(toetsZoom(1, { key: "+", code: "Equal" })).toBe(1.1);
    expect(toetsZoom(1, { key: "-", code: "Minus" })).toBe(0.9);
    expect(toetsZoom(1, { key: "Subtract", code: "NumpadSubtract" })).toBe(0.9);
    expect(toetsZoom(1, { key: "s", code: "KeyS" })).toBeNull();
  });

  it("houdt het punt onder de muis op zijn plek", () => {
    // Inhoudspunt 300 staat op 100 px in beeld; na verdubbeling op 600.
    expect(ankerScroll(200, 100, 1, 2)).toBe(500);
    expect(ankerScroll(500, 100, 2, 1)).toBe(200);
    expect(ankerScroll(0, 100, 1, 0.5)).toBe(0);
  });

  describe("onthouden", () => {
    beforeEach(() => {
      const opslag = new Map<string, string>();
      vi.stubGlobal("localStorage", {
        getItem: (sleutel: string) => opslag.get(sleutel) ?? null,
        setItem: (sleutel: string, waarde: string) =>
          void opslag.set(sleutel, waarde),
      });
    });
    afterEach(() => vi.unstubAllGlobals());

    it("bewaart per document en begrenst de lijst", () => {
      bewaarZoom("docx:a.docx:10", 1.5);
      bewaarZoom("xlsx:b.xlsx:20", 0.8);
      expect(leesZoom("docx:a.docx:10")).toBe(1.5);
      expect(leesZoom("xlsx:b.xlsx:20")).toBe(0.8);
      expect(leesZoom("pptx:c.pptx:30")).toBeNull();
      for (let i = 0; i < 60; i++) bewaarZoom(`d${i}`, 1.2);
      expect(leesZoom("docx:a.docx:10")).toBeNull();
      expect(leesZoom("d59")).toBe(1.2);
    });

    it("negeert beschadigde opslag", () => {
      localStorage.setItem("office-documentzoom", "{kapot");
      expect(leesZoom("x")).toBeNull();
      bewaarZoom("x", 2);
      expect(leesZoom("x")).toBe(2);
    });

    it("blijft werken zonder browseropslag", () => {
      vi.stubGlobal("localStorage", undefined);
      expect(leesZoom("x")).toBeNull();
      expect(() => bewaarZoom("x", 2)).not.toThrow();
    });
  });
});
