import { describe, expect, it } from "vitest";
import { neerzetMelding } from "./Neerzetzone";

describe("bestanden slepen", () => {
  it("opent kantoorbestanden en databases zonder melding", () => {
    for (const naam of ["a.docx", "B.XLSX", "c.pptx", "d.odt", "e.mdb", "f.accdb"])
      expect(neerzetMelding(naam)).toBeNull();
  });

  it("geeft een duidelijke melding bij afbeeldingen en onbekende formaten", () => {
    expect(neerzetMelding("foto.JPG")).toMatch(/afbeelding/);
    expect(neerzetMelding("setup.exe")).toMatch(/\.exe wordt niet ondersteund/);
    expect(neerzetMelding("LEESMIJ")).toMatch(/niet ondersteund/);
  });
});
