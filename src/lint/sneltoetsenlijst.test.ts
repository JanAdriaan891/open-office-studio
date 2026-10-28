import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  alleSneltoetsen,
  botsingen,
  geldtIn,
  normaliseer,
  registreerSneltoetsen,
  toetsDelen,
  vasteSneltoetsen,
  zoekSneltoetsen,
  type SneltoetsModule,
} from "./sneltoetsenlijst";

/** Letterlijke toetsen uit de broncode van een module (ook `Ctrl+Shift+${cijfer}`). */
function toetsenInBron(bestand: string): string[] {
  const bron = readFileSync(new URL(bestand, import.meta.url), "utf8");
  const letterlijk = [...bron.matchAll(/toets:\s*"([^"]+)"/g)].map((m) => m[1]);
  const paren = [...bron.matchAll(/\[\s*"((?:Ctrl|Alt|Shift)\+[^"]+|F\d+)",\s*"[^"]*"\s*\]/g)].map(
    (m) => m[1],
  );
  const sjablonen = [...bron.matchAll(/toets:\s*`([^`$]+)\$\{cijfer\}`/g)].flatMap((m) => {
    const lijst = bron.slice(0, m.index).match(/\["(\d)",[^\]]*\]/g) ?? [];
    return lijst.map((paar) => m[1] + paar.match(/\d/)![0]);
  });
  return [...new Set([...letterlijk, ...paren, ...sjablonen])];
}

describe("sneltoetsenregister", () => {
  it("heeft geen dubbele combinaties binnen een module", () => {
    expect(botsingen(vasteSneltoetsen)).toEqual([]);
  });

  it("vindt botsingen als ze er wel zijn", () => {
    const lijst = [
      ...vasteSneltoetsen,
      { toets: "Ctrl+S", omschrijving: "Iets anders", module: "tekst" as const, bron: "lint" as const },
    ];
    expect(botsingen(lijst)).toEqual([
      { module: "tekst", toets: "ctrl+s", omschrijvingen: ["Opslaan in het laatst gekozen formaat", "Iets anders"] },
    ]);
  });

  it.each([
    ["tekst", "./tekst-opdrachten.tsx"],
    ["rekenblad", "./rekenblad.tsx"],
    ["presentatie", "./presentatie-acties.tsx"],
  ] as [SneltoetsModule, string][])(
    "beschrijft elke sneltoets uit de %s-module",
    (module, bestand) => {
      const bekend = new Set(
        vasteSneltoetsen.filter((i) => i.module === module).map((i) => normaliseer(i.toets)),
      );
      expect(toetsenInBron(bestand).length).toBeGreaterThan(10);
      const ontbrekend = toetsenInBron(bestand).filter((t) => !bekend.has(normaliseer(t)));
      expect(ontbrekend).toEqual([]);
    },
  );

  it("past algemene uitzonderingen per module toe", () => {
    const volgend = vasteSneltoetsen.find(
      (i) => i.module === "algemeen" && i.toets === "Ctrl+PageDown",
    )!;
    expect(geldtIn(volgend, "tekst")).toBe(true);
    expect(geldtIn(volgend, "rekenblad")).toBe(false);
    const zoom = vasteSneltoetsen.find((i) => i.toets === "Ctrl+0")!;
    expect(geldtIn(zoom, "email")).toBe(false);
  });

  it("normaliseert de volgorde van modifiers", () => {
    expect(normaliseer("Shift+Ctrl+P")).toBe(normaliseer("Ctrl+Shift+P"));
  });

  it("toont Cmd en Option op macOS", () => {
    expect(toetsDelen("Ctrl+Shift+S", true)).toEqual(["⌘", "⇧", "S"]);
    expect(toetsDelen("Ctrl+Shift+S", false)).toEqual(["Ctrl", "Shift", "S"]);
    expect(toetsDelen("PageDown", false)).toEqual(["Page Down"]);
  });

  it("neemt geregistreerde toetsen buiten de vaste lijst op", () => {
    const weg = registreerSneltoetsen("notities", [{ toets: "Ctrl+Alt+N", omschrijving: "Nieuwe pagina" }]);
    expect(alleSneltoetsen().some((i) => i.module === "notities" && i.toets === "Ctrl+Alt+N")).toBe(true);
    weg();
    expect(alleSneltoetsen().some((i) => i.toets === "Ctrl+Alt+N")).toBe(false);
  });

  it("zoekt in omschrijving en toets", () => {
    expect(zoekSneltoetsen(vasteSneltoetsen, "autosom").map((i) => i.toets)).toEqual(["Alt+="]);
    expect(zoekSneltoetsen(vasteSneltoetsen, "ctrl+shift+s").some((i) => i.toets === "Ctrl+Shift+S")).toBe(true);
  });
});
