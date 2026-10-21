import { describe, it, expect } from "vitest";
import { csv, voorbereidendeLezer } from "./model";
describe("Databasevoorbereiding", () => {
  it("weigert verkeerde extensies", async () => {
    await expect(
      voorbereidendeLezer.open(new File(["data"], "test.txt")),
    ).rejects.toThrow("MDB");
  });
  it("weigert lege databases", async () => {
    await expect(
      voorbereidendeLezer.open(new File([], "leeg.mdb")),
    ).rejects.toThrow("leeg");
  });
  it("presenteert willekeurige bytes nooit als ingelezen database", async () => {
    const resultaat = await voorbereidendeLezer.open(
      new File(["geen database"], "oud.ACCDB"),
    );
    expect(resultaat.voorbeeld).toBe(false);
    expect(resultaat.objecten).toEqual([]);
    expect(resultaat.melding).toContain("niet gevalideerd");
  });
});
describe("CSV-export", () => {
  it("beschermt formule-invoer en bewaart quotes en nieuwe regels", () => {
    expect(csv(["Tekst"], [["=1+1"], ['een "quote"\nen regel']])).toBe(
      '\uFEFF"Tekst"\r\n"\'=1+1"\r\n"een ""quote""\nen regel"',
    );
  });
});
