import { describe, expect, it } from "vitest";
import {
  HARTSLAG_GRENS,
  beoordeelSessies,
  herstelInterval,
  kopieNodig,
  nieuweSessie,
} from "./herstel";

describe("automatisch herstel", () => {
  it("interval: standaard 5 minuten, instelbaar tussen 1 en 60", () => {
    expect(herstelInterval(null)).toBe(5 * 60_000);
    expect(herstelInterval("")).toBe(5 * 60_000);
    expect(herstelInterval("onzin")).toBe(5 * 60_000);
    expect(herstelInterval("2")).toBe(2 * 60_000);
    expect(herstelInterval("0")).toBe(60_000);
    expect(herstelInterval("900")).toBe(60 * 60_000);
  });

  it("eerste kopie meteen, daarna pas na het interval en alleen bij wijzigingen", () => {
    const interval = 300_000;
    expect(kopieNodig(undefined, "1:1", 0, interval)).toBe(true);
    const vorige = { versie: "1:1", tijd: 1000 };
    expect(kopieNodig(vorige, "1:1", 1000 + interval * 2, interval)).toBe(false);
    expect(kopieNodig(vorige, "1:2", 1000 + interval - 1, interval)).toBe(false);
    expect(kopieNodig(vorige, "1:2", 1000 + interval, interval)).toBe(true);
  });

  it("browser: gecrashte sessies aanbieden, netjes afgesloten opruimen", () => {
    const nu = 10_000_000;
    const { aanbieden, opruimen } = beoordeelSessies(
      ["eigen", "draait", "crash", "geen-slag", "netjes", "crash"],
      {
        eigen: nu - 999_999,
        draait: nu - 1000,
        crash: nu - HARTSLAG_GRENS - 1,
        netjes: 0,
      },
      "eigen",
      nu,
    );
    expect([...aanbieden].sort()).toEqual(["crash", "geen-slag"]);
    expect([...opruimen]).toEqual(["netjes"]);
  });

  it("sessienamen voldoen aan de regels van Rust", () => {
    const id = nieuweSessie();
    expect(id).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(nieuweSessie()).not.toBe(id);
  });
});
