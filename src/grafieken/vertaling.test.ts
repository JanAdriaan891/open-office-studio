import { afterEach, describe, expect, it } from "vitest";
import { zetTaal } from "../i18n/config";
import { controleerModel, gegevensUitRaster, soortNaam, standaardModel } from "./model.ts";

describe("grafieken in de interfacetaal", () => {
  afterEach(async () => {
    await zetTaal("nl");
  });

  it("soortnamen, meldingen en standaardnamen volgen de taal", async () => {
    expect(soortNaam("ring")).toBe("Ring");
    expect(() => controleerModel(standaardModel())).toThrow("De grafiek heeft minstens één gegevensreeks nodig.");
    await zetTaal("en");
    expect(soortNaam("ring")).toBe("Doughnut");
    expect(() => controleerModel(standaardModel())).toThrow("The chart needs at least one data series.");
    const data = gegevensUitRaster([["a", "1"], ["b", "2"]], { koprij: false, kopkolom: true, reeksenIn: "kolommen" });
    expect(data.reeksen[0].naam).toBe("Series 1");
  });
});
