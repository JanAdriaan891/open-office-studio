import { describe, expect, it } from "vitest";
import { hulpToets } from "./Werkruimtehulp";
import { volgendeInDialoog } from "./Dialoog";
import { sneltoetsSecties } from "./SneltoetsenOverzicht";
import { vasteSneltoetsen } from "../lint/sneltoetsenlijst";

const toets = (key: string, extra: Partial<KeyboardEvent> = {}) => ({
  key,
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});

describe("werkruimte", () => {
  it("opent het overzicht met F1 en Ctrl+/ en de instellingen met Ctrl+,", () => {
    expect(hulpToets(toets("F1"))).toBe("sneltoetsen");
    expect(hulpToets(toets("/", { ctrlKey: true }))).toBe("sneltoetsen");
    expect(hulpToets(toets(":", { ctrlKey: true, shiftKey: true, code: "Slash" } as never))).toBe("sneltoetsen");
    expect(hulpToets(toets(",", { metaKey: true }))).toBe("instellingen");
    expect(hulpToets(toets("F1", { altKey: true }))).toBeNull();
    expect(hulpToets(toets("F1", { ctrlKey: true }))).toBeNull();
  });

  it("houdt de focus rond binnen een dialoog", () => {
    expect(volgendeInDialoog(3, 2, false)).toBe(0);
    expect(volgendeInDialoog(3, 0, true)).toBe(2);
    expect(volgendeInDialoog(3, -1, false)).toBe(0);
    expect(volgendeInDialoog(0, 0, false)).toBe(-1);
  });

  it("zet de huidige module bovenaan in het overzicht", () => {
    const secties = sneltoetsSecties(vasteSneltoetsen, "presentatie");
    expect(secties.map((s) => s.module).slice(0, 3)).toEqual(["presentatie", "algemeen", "tekst"]);
    expect(sneltoetsSecties(vasteSneltoetsen, null)[0].module).toBe("algemeen");
  });
});

import { volgendeRegio } from "./regios";
describe("F6-regio's", () => {
  it("loopt rond, ook achteruit en vanaf buiten elke regio", () => {
    expect(volgendeRegio(5, 4, false)).toBe(0);
    expect(volgendeRegio(5, 0, true)).toBe(4);
    expect(volgendeRegio(5, -1, false)).toBe(0);
    expect(volgendeRegio(5, -1, true)).toBe(4);
    expect(volgendeRegio(0, 0, false)).toBe(-1);
  });
});
