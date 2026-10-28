import { describe, expect, it } from "vitest";
import { Herhaalgeheugen, naamVanOpdracht } from "./herhalen";

describe("herhalen", () => {
  it("voert de laatste actie opnieuw uit", () => {
    const geheugen = new Herhaalgeheugen();
    expect(geheugen.herhaal()).toBe(false);
    const log: string[] = [];
    geheugen.onthoud({ naam: "Vet", uitvoeren: () => log.push("vet") });
    geheugen.onthoud({ naam: "Cursief", uitvoeren: () => log.push("cursief") });
    expect(geheugen.herhaal()).toBe(true);
    expect(geheugen.herhaal()).toBe(true);
    expect(log).toEqual(["cursief", "cursief"]);
    expect(geheugen.naam).toBe("Cursief");
  });

  it("geeft opdrachten een leesbare naam", () => {
    expect(naamVanOpdracht("fontSize", { points: 14 })).toBe("Lettergrootte 14");
    expect(naamVanOpdracht("bold", null)).toBe("Vet");
  });
});
