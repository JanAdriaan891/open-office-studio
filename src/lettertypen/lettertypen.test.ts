import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as fonts from "@betteroffice/fonts";
import {
  VERVANGINGEN,
  lettertypenInDocument,
  vervangerVoor,
  vervangingsMelding,
} from "./vervanging";
import { maakLettertypeBron } from "./provider";
import { lettertypeGroepen } from "./LettertypeKeuze";

const voorbeeld = (naam: string) => new Uint8Array(readFileSync(`docs/voorbeelden/${naam}`));
const gebundeld = (f: string) => fonts.resolveMetricCompatFamily(f);
const gebundeldExact = (f: string) =>
  fonts.BUNDLED_FONTS.some((b) => b.family.toLowerCase() === f.toLowerCase());

describe("lettertypen in een document", () => {
  it("vindt de lettertypen van tekst, rekenblad en presentatie", () => {
    expect(lettertypenInDocument(voorbeeld("Ontwerpnotitie.docx")).length).toBeGreaterThan(0);
    expect(lettertypenInDocument(voorbeeld("Materiaaloverzicht.xlsx"))).toContain("Calibri");
    expect(lettertypenInDocument(voorbeeld("Ontwerpvisie.pptx")).length).toBeGreaterThan(0);
    expect(lettertypenInDocument(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
  it("slaat themaplaatshouders over", () => {
    const z = unzipSync(voorbeeld("Ontwerpvisie.pptx"));
    const dia = Object.keys(z).find((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))!;
    z[dia] = strToU8(strFromU8(z[dia]).replace("</p:sld>", '<!-- <a:latin typeface="+mn-lt"/> --></p:sld>'));
    expect(lettertypenInDocument(zipSync(z))).not.toContain("+mn-lt");
  });
});

describe("vervanging van ontbrekende lettertypen", () => {
  const nergens = () => false;
  it("kiest metrisch gelijke open lettertypen", () => {
    expect(vervangerVoor("Calibri", nergens, gebundeld)).toEqual({
      origineel: "Calibri",
      vervanger: "Carlito",
      soort: "metrisch",
    });
    expect(vervangerVoor("Cambria", nergens, gebundeld)?.vervanger).toBe("Caladea");
    expect(vervangerVoor("Arial", nergens, gebundeld)?.vervanger).toBe("Liberation Sans");
    expect(vervangerVoor("Times New Roman", nergens, gebundeld)?.vervanger).toBe("Liberation Serif");
    expect(vervangerVoor("Courier New", nergens, gebundeld)?.vervanger).toBe("Liberation Mono");
  });
  it("vervangt niets wat op deze computer of in de app staat", () => {
    expect(vervangerVoor("Calibri", (f) => f === "Calibri", gebundeld)).toBeNull();
    expect(vervangerVoor("Inter", gebundeldExact, gebundeld)).toBeNull();
  });
  it("valt terug op een benadering met of zonder schreef", () => {
    expect(vervangerVoor("Onbekende Grotesk", nergens, gebundeld)).toMatchObject({
      vervanger: "Liberation Sans",
      soort: "benadering",
    });
    expect(vervangerVoor("Minion Pro", nergens, gebundeld)?.vervanger).toBe("Liberation Serif");
  });
  it("noemt alleen vervangers die worden meegeleverd", () => {
    for (const { vervanger } of Object.values(VERVANGINGEN)) expect(gebundeldExact(vervanger)).toBe(true);
  });
  it("meldt wat er is vervangen", () => {
    expect(vervangingsMelding([])).toBeNull();
    const melding = vervangingsMelding([
      { origineel: "Calibri", vervanger: "Carlito", soort: "metrisch" },
      { origineel: "Segoe UI", vervanger: "Open Sans", soort: "benadering" },
    ])!;
    expect(melding).toContain("Calibri → Carlito");
    expect(melding).toContain("Segoe UI → Open Sans (benadering)");
    expect(melding).toContain("oorspronkelijke namen");
  });
});

describe("lettertypebron voor de engines", () => {
  const bron = maakLettertypeBron({ baseUrl: "http://localhost/fonts/" });
  it("geeft meegeleverde en metrisch gelijke lettertypen", () => {
    expect(bron.resolveFamily("Inter", false, false)).toBeTypeOf("function");
    expect(bron.resolve("Calibri", true, false)).toBeTypeOf("function");
  });
  it("gebruikt de eigen vervangingstabel als laatste redmiddel", () => {
    expect(bron.resolveLastResort("Segoe UI", false, false)).toBeTypeOf("function");
    expect(bron.resolveFamily("Niet Aanwezig", false, false)).toBeUndefined();
  });
});

describe("lettertypekeuze", () => {
  it("zet recente lettertypen bovenaan zonder dubbelingen en filtert op zoektekst", () => {
    const groepen = lettertypeGroepen(["Inter"], ["Calibri", "Arial"], ["Inter", "Carlito"], ["DejaVu Sans", "arial"], "");
    expect(groepen.map((g) => g.naam)).toEqual(["Recent gebruikt", "Lettertypen", "Op deze computer"]);
    expect(groepen[0].lettertypen).toEqual(["Inter"]);
    expect(groepen[1].lettertypen).toEqual(["Arial", "Calibri", "Carlito"]);
    expect(groepen[2].lettertypen).toEqual(["DejaVu Sans"]);
    expect(lettertypeGroepen([], ["Calibri"], ["Carlito"], [], "carl").flatMap((g) => g.lettertypen)).toEqual(["Carlito"]);
  });
});
