import { describe, expect, it } from "vitest";
import { ontleed, past } from "./sneltoetsen";

const druk = (
  key: string,
  code: string,
  mods: Partial<
    Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>
  > = {},
) => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("sneltoetsen", () => {
  it("ontleedt combinaties", () => {
    expect(ontleed("Ctrl+Shift+P")).toEqual({
      ctrl: true,
      shift: true,
      alt: false,
      toets: "p",
    });
    expect(ontleed("F5").toets).toBe("f5");
  });

  it("herkent letters los van Shift en toetsenbordindeling", () => {
    expect(past("Ctrl+E", druk("e", "KeyE", { ctrlKey: true }))).toBe(true);
    expect(past("Ctrl+E", druk("e", "KeyE", { metaKey: true }))).toBe(true);
    expect(
      past(
        "Ctrl+Shift+P",
        druk("P", "KeyP", { ctrlKey: true, shiftKey: true }),
      ),
    ).toBe(true);
    expect(
      past("Ctrl+E", druk("e", "KeyE", { ctrlKey: true, shiftKey: true })),
    ).toBe(false);
    expect(past("Ctrl+E", druk("e", "KeyE"))).toBe(false);
  });

  it("herkent cijfers ook met Shift of op het numerieke blok", () => {
    expect(past("Ctrl+1", druk("1", "Digit1", { ctrlKey: true }))).toBe(true);
    expect(past("Ctrl+1", druk("1", "Numpad1", { ctrlKey: true }))).toBe(true);
    expect(
      past(
        "Ctrl+Shift+1",
        druk("!", "Digit1", { ctrlKey: true, shiftKey: true }),
      ),
    ).toBe(true);
  });

  it("herkent functietoetsen", () => {
    expect(past("F5", druk("F5", "F5"))).toBe(true);
    expect(past("Shift+F5", druk("F5", "F5", { shiftKey: true }))).toBe(true);
    expect(past("F5", druk("F5", "F5", { shiftKey: true }))).toBe(false);
  });

  it("herkent leestekens als teken en op hun plek", () => {
    const shift = { ctrlKey: true, shiftKey: true };
    expect(past("Ctrl+Shift+>", druk(">", "Period", shift))).toBe(true);
    expect(past("Ctrl+Shift+.", druk(">", "Period", shift))).toBe(true);
    // Gesimuleerde toetsen geven soms "." met Shift.
    expect(past("Ctrl+Shift+>", druk(".", "Period", shift))).toBe(true);
    expect(past("Ctrl+Shift+<", druk(",", "Comma", shift))).toBe(true);
    expect(past("Ctrl+Shift+-", druk("_", "Minus", shift))).toBe(true);
    expect(past("Ctrl+Shift++", druk("+", "Equal", shift))).toBe(true);
    expect(past("Ctrl+Shift+=", druk("+", "Equal", shift))).toBe(true);
    expect(past("Ctrl+]", druk("]", "BracketRight", { ctrlKey: true }))).toBe(true);
    expect(past("Ctrl+=", druk("+", "Equal", shift))).toBe(false);
    expect(ontleed("Ctrl+Shift++")).toEqual({ ctrl: true, shift: true, alt: false, toets: "+" });
  });

  it("herkent de spatiebalk", () => {
    expect(past("Ctrl+Space", druk(" ", "Space", { ctrlKey: true }))).toBe(true);
  });
});
