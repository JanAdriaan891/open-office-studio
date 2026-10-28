import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  botsingen,
  normaliseer,
  toetsInProfiel,
  vasteSneltoetsen,
  type SneltoetsProfiel,
} from "../../lint/sneltoetsenlijst";
import { ACTIES, isActie } from "./acties";
import { toetsVoorProfiel } from "./profielToets";
import {
  heeftOpdracht,
  meldOpdrachtAan,
  voerOpdrachtUit,
} from "../menu/opdrachten";

const tekst = vasteSneltoetsen.filter((i) => i.module === "tekst");
const inProfiel = (profiel: SneltoetsProfiel) =>
  tekst.filter((i) => !i.profiel || i.profiel === profiel);
const actie = (profiel: SneltoetsProfiel, toets: string) =>
  inProfiel(profiel).find((i) => normaliseer(i.toets) === normaliseer(toets));

describe("sneltoetsprofielen", () => {
  it("heeft per profiel geen botsingen", () => {
    expect(botsingen(vasteSneltoetsen)).toEqual([]);
  });

  it("meldt een botsing binnen één profiel", () => {
    const lijst = [
      ...vasteSneltoetsen,
      {
        toets: "Ctrl+Alt+1",
        omschrijving: "Iets anders",
        module: "tekst" as const,
        bron: "lint" as const,
        profiel: "word" as const,
      },
    ];
    expect(botsingen(lijst)).toEqual([
      { module: "tekst", toets: "ctrl+alt+1", omschrijvingen: ["Kop 1", "Iets anders"], profiel: "word" },
    ]);
  });

  it("koppelt elke registertoets met een actie aan een bestaande opdracht", () => {
    const gebruikt = tekst.filter((i) => i.actie).map((i) => i.actie);
    expect(gebruikt.filter((a) => !isActie(a))).toEqual([]);
    expect(ACTIES.filter((a) => !gebruikt.includes(a))).toEqual([]);
  });

  it("heeft de Word-toetsen uit de opdracht", () => {
    const verwacht: [string, string][] = [
      ["Ctrl+1", "regelafstand1"],
      ["Ctrl+2", "regelafstand2"],
      ["Ctrl+5", "regelafstand15"],
      ["Ctrl+Alt+1", "kop1"],
      ["Ctrl+Alt+2", "kop2"],
      ["Ctrl+Alt+3", "kop3"],
      ["Ctrl+Space", "opmaakWissen"],
      ["Ctrl+Q", "alineaOpmaakWissen"],
      ["Ctrl+Shift+E", "bijhouden"],
      ["Ctrl+Shift+C", "kwastKopieren"],
      ["Ctrl+Alt+C", "kwastKopieren"],
      ["Ctrl+Alt+V", "kwastPlakken"],
      ["Ctrl+Shift+V", "plakkenTekst"],
      ["Ctrl+Shift+N", "standaardstijl"],
      ["F4", "herhalen"],
      ["Ctrl+Shift+>", "groter"],
      ["Ctrl+Shift+<", "kleiner"],
      ["Ctrl+]", "puntGroter"],
      ["Ctrl+[", "puntKleiner"],
      ["Ctrl+D", "lettertype"],
    ];
    for (const [toets, naam] of verwacht) expect(actie("word", toets)?.actie, toets).toBe(naam);
    // De engine handelt deze in beide profielen af.
    for (const toets of ["Ctrl+E", "Ctrl+L", "Ctrl+R", "Ctrl+J", "Ctrl+K", "Ctrl+Y"])
      expect(actie("word", toets)?.bron, toets).toBe("engine");
  });

  it("houdt het standaardprofiel zoals het was", () => {
    expect(actie("standaard", "Ctrl+1")?.omschrijving).toBe("Kop 1");
    expect(actie("standaard", "Ctrl+Shift+C")?.omschrijving).toBe("Wijzigingen bijhouden aan of uit");
    expect(actie("standaard", "Ctrl+Alt+C")?.omschrijving).toBe("Opmerking invoegen");
    expect(actie("standaard", "Ctrl+Alt+1")).toBeUndefined();
  });

  it("schakelt LibreOffice-toetsen uit in het Word-profiel", () => {
    expect(toetsInProfiel("tekst", "Ctrl+1", "standaard")).toBe(true);
    expect(toetsInProfiel("tekst", "Ctrl+M", "word")).toBe(true); // Word: inspringen
    expect(toetsInProfiel("tekst", "Ctrl+Shift+P", "word")).toBe(false);
    expect(toetsInProfiel("tekst", "Ctrl+Shift+B", "word")).toBe(false);
    expect(toetsInProfiel("tekst", "Shift+F3", "word")).toBe(true);
    // Onbekend in het register: niet uitschakelen.
    expect(toetsInProfiel("tekst", "Ctrl+Alt+Shift+X", "word")).toBe(true);
  });

  it("vertaalt de knopuitleg naar het actieve profiel", () => {
    expect(toetsVoorProfiel("Ctrl+1", "word")).toBe("Ctrl+Alt+1");
    expect(toetsVoorProfiel("Ctrl+1", "standaard")).toBe("Ctrl+1");
    expect(toetsVoorProfiel("Ctrl+Shift+P", "word")).toBe("Ctrl+Shift++");
    expect(toetsVoorProfiel("Ctrl+M", "word")).toBe("Ctrl+Space");
    expect(toetsVoorProfiel("Ctrl+Alt+C", "word")).toBe("Ctrl+Alt+M");
    expect(toetsVoorProfiel("Ctrl+Shift+C", "word")).toBe("Ctrl+Shift+E");
    expect(toetsVoorProfiel("Ctrl+Enter", "word")).toBe("Ctrl+Enter");
    expect(toetsVoorProfiel("Ctrl+X", "word")).toBe("Ctrl+X");
    // Lettertype… heeft alleen in het Word-profiel een toets.
    expect(toetsVoorProfiel("Ctrl+Shift+F", "word")).toBe("Ctrl+Shift+F");
    expect(toetsVoorProfiel("Ctrl+Shift+F", "standaard")).toBeUndefined();
  });

  it("beschrijft elke toets uit src/tekst/bewerken in het register", () => {
    const bron = readFileSync(new URL("./TekstBewerken.tsx", import.meta.url), "utf8");
    const letterlijk = [...bron.matchAll(/toets:\s*"([^"]+)"/g)].map((m) => m[1]);
    const bekend = new Set(tekst.map((i) => normaliseer(i.toets)));
    expect(letterlijk.filter((t) => !bekend.has(normaliseer(t)))).toEqual([]);
  });
});

describe("menu-opdrachten (registry voor Lettertype…/Alinea…)", () => {
  it("gebruikt de terugval zolang niemand zich aanmeldt", () => {
    const log: string[] = [];
    expect(heeftOpdracht("lettertype")).toBe(false);
    expect(voerOpdrachtUit("lettertype", {}, () => log.push("terugval"))).toBe(false);
    const weg = meldOpdrachtAan("lettertype", ({ punt }) => log.push(`venster ${punt?.x}`));
    expect(heeftOpdracht("lettertype")).toBe(true);
    expect(voerOpdrachtUit("lettertype", { punt: { x: 3, y: 4 } }, () => log.push("terugval"))).toBe(true);
    weg();
    expect(heeftOpdracht("lettertype")).toBe(false);
    expect(log).toEqual(["terugval", "venster 3"]);
  });

  it("laat de laatst aangemelde winnen en herstelt de vorige bij afmelden", () => {
    const log: string[] = [];
    const a = meldOpdrachtAan("alinea", () => log.push("a"));
    const b = meldOpdrachtAan("alinea", () => log.push("b"));
    voerOpdrachtUit("alinea");
    b();
    voerOpdrachtUit("alinea");
    a();
    expect(log).toEqual(["b", "a"]);
  });
});
