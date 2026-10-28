import { describe, expect, it } from "vitest";
import { toonBijSelectie } from "./MiniWerkbalk";

describe("mini-werkbalk bij een muisselectie", () => {
  it("verschijnt bij geselecteerde tekst", () => {
    expect(toonBijSelectie("Alinea boven", false)).toBe(true);
    expect(toonBijSelectie("tekst ￼ tekst", false)).toBe(true);
  });
  it("verschijnt niet bij een geselecteerde afbeelding", () => {
    expect(toonBijSelectie("￼", false)).toBe(false);
    expect(toonBijSelectie("￼", true)).toBe(false);
    expect(toonBijSelectie("tekst", true)).toBe(false);
  });
  it("verschijnt niet zonder tekst", () => {
    expect(toonBijSelectie("  \n", false)).toBe(false);
  });
});
