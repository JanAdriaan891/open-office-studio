import { describe, expect, it } from "vitest";
import { cursorDoel } from "./engine.ts";
import { neemBeurt } from "./staat.ts";

describe("cursor over het herladen heen", () => {
  const plek = { index: 4, aantal: 10, vanBegin: 7, totEind: 3 };
  it("telt vanaf het eind als er op of vóór de cursor iets is ingevoegd", () => {
    // Twee alinea's erbij (bijvoorbeeld een inhoudsopgave op de cursor): dezelfde alinea is nu index 6.
    expect(cursorDoel(plek, 12, "eind")).toEqual({ index: 6, totEind: 3 });
  });
  it("telt vanaf het begin als de hoofdtekst vóór de cursor gelijk bleef", () => {
    expect(cursorDoel(plek, 11, "begin")).toEqual({ index: 4, vanBegin: 7 });
  });
  it("blijft binnen het document", () => {
    expect(cursorDoel(plek, 2, "eind").index).toBe(0);
    expect(cursorDoel({ ...plek, index: 9 }, 3, "begin").index).toBe(2);
  });
});

describe("pakketbewerkingen na elkaar", () => {
  it("laat een tweede bewerking wachten tot de eerste klaar is", async () => {
    const volgorde: string[] = [];
    const eerste = await neemBeurt();
    const tweede = neemBeurt().then((vrij) => {
      volgorde.push("tweede");
      vrij();
    });
    await new Promise((klaar) => setTimeout(klaar, 10));
    volgorde.push("eerste klaar");
    eerste();
    await tweede;
    expect(volgorde).toEqual(["eerste klaar", "tweede"]);
  });
});
