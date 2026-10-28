import { describe, expect, it } from "vitest";
import { kenToetstips, lettersVan, zoekToetstip } from "./toetstips";

const prefixvrij = (codes: string[]) =>
  codes.every((a, i) =>
    codes.every((b, j) => i === j || !b.startsWith(a)),
  );

describe("toetstips", () => {
  it("haalt letters zonder accenten op", () => {
    expect(lettersVan("Beëindig ’t")).toEqual([..."BEEINDIGT"]);
  });

  it("geeft liefst de beginletter en respecteert vaste codes", () => {
    expect(
      kenToetstips(["Bestand", "Start", "Invoegen", "Indeling", "Beeld"], ["B"]),
    ).toEqual(["B", "S", "I", "N", "E"]);
  });

  it("blijft uniek en prefixvrij bij veel knoppen", () => {
    const namen = Array.from({ length: 80 }, (_, i) => `Knop ${i}`);
    const codes = kenToetstips(namen);
    expect(new Set(codes).size).toBe(80);
    expect(prefixvrij(codes)).toBe(true);
    expect(codes.every((code) => code.length <= 2)).toBe(true);
  });

  it("geeft namen zonder letters toch een code", () => {
    const codes = kenToetstips(["€", "%", "—"]);
    expect(new Set(codes).size).toBe(3);
    expect(prefixvrij(codes)).toBe(true);
  });

  it("zoekt volledige codes en voorvoegsels", () => {
    expect(zoekToetstip(["A", "ZB", "ZC"], "Z")).toBe("verder");
    expect(zoekToetstip(["A", "ZB", "ZC"], "ZC")).toEqual({ index: 2 });
    expect(zoekToetstip(["A", "ZB"], "Q")).toBeNull();
  });
});
