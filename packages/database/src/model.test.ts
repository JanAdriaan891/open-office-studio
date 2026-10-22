import { describe, it, expect } from "vitest";
import { csv, controleerDatabaseBestand } from "./model";
import { openDatabase } from "./database-parser";
describe("Databasevoorbereiding", () => {
  it("weigert verkeerde extensies", async () => {
    expect(() =>
      controleerDatabaseBestand(new File(["data"], "test.txt")),
    ).toThrow("MDB");
  });
  it("weigert lege databases", async () => {
    expect(() => controleerDatabaseBestand(new File([], "leeg.mdb"))).toThrow(
      "leeg",
    );
  });
  it("presenteert willekeurige bytes nooit als ingelezen database", async () => {
    await expect(
      openDatabase(new TextEncoder().encode("geen database").buffer),
    ).rejects.toThrow("geen leesbare MDB- of ACCDB-database");
  });
});
describe("CSV-export", () => {
  it("beschermt formule-invoer en bewaart quotes en nieuwe regels", () => {
    expect(csv(["Tekst"], [["=1+1"], ['een "quote"\nen regel']])).toBe(
      '\uFEFF"Tekst"\r\n"\'=1+1"\r\n"een ""quote""\nen regel"',
    );
  });
});
