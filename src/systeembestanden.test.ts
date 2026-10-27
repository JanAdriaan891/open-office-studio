import { describe, expect, it } from "vitest";
import { maakWachtrij } from "./systeembestanden";

describe("wachtrij voor bestanden van het besturingssysteem", () => {
  it("opent elk bestand één keer en op volgorde", async () => {
    const geopend: string[] = [];
    let vrijgeven: () => void = () => undefined;
    const eerste = new Promise<void>((klaar) => (vrijgeven = klaar));
    const voegToe = maakWachtrij(async ({ naam }) => {
      if (naam === "a.docx") await eerste;
      geopend.push(naam);
    });
    void voegToe([{ id: 1, naam: "a.docx" }]);
    // Een tweede melding herhaalt het eerste bestand en voegt er een toe.
    const klaar = voegToe([
      { id: 1, naam: "a.docx" },
      { id: 2, naam: "b.xlsx" },
    ]);
    expect(geopend).toEqual([]);
    vrijgeven();
    await klaar;
    expect(geopend).toEqual(["a.docx", "b.xlsx"]);
  });

  it("een mislukt bestand houdt de rest niet tegen", async () => {
    const geopend: string[] = [];
    const voegToe = maakWachtrij(async ({ naam }) => {
      if (naam === "kapot.pptx") throw new Error("kapot");
      geopend.push(naam);
    });
    await voegToe([
      { id: 1, naam: "kapot.pptx" },
      { id: 2, naam: "goed.odt" },
    ]);
    expect(geopend).toEqual(["goed.odt"]);
  });
});
