import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { dataRand, invoerVoorBereik, randVanBlok, vulSelectie } from "./rekenblad-toetsen";

let xlsx: typeof import("@betteroffice/xlsx");
beforeAll(async () => {
  xlsx = await import("@betteroffice/xlsx");
  await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
});

function maakApi(handle: WorkbookHandle) {
  return {
    handle,
    commands: { getState: () => ({ enabled: true }) },
    version: async () => handle.version(),
    readCells: async (r: Parameters<WorkbookHandle["readCells"]>[0]) => handle.readCells(r),
    applyEdits: async (r: Parameters<WorkbookHandle["applyEdits"]>[0]) => handle.applyEdits(r),
  } as unknown as XlsxEditorApi;
}

describe("Excel-toetsen", () => {
  it("Ctrl+pijl: rand van het blok of de volgende gevulde cel", () => {
    expect(randVanBlok([true, true, true, false, false], 0)).toBe(2);
    expect(randVanBlok([true, false, false, true, true], 0)).toBe(3);
    expect(randVanBlok([false, false, true], 0)).toBe(2);
    expect(randVanBlok([true, false, false], 0)).toBe(2);
  });

  it("Ctrl+Enter: formules schuiven per cel mee", () => {
    expect(invoerVoorBereik("=A1*2", { top: 0, left: 1, bottom: 1, right: 2 }, { row: 0, col: 1 })).toEqual([
      ["=A1*2", "=B1*2"],
      ["=A2*2", "=B2*2"],
    ]);
    expect(invoerVoorBereik("12,5", { top: 0, left: 0, bottom: 0, right: 1 }, { row: 0, col: 0 })).toEqual([["12.5", "12.5"]]);
  });

  it("vult de selectie in één stap en springt naar de gegevensrand", async () => {
    const h = xlsx.openWorkbook(new Uint8Array(readFileSync("public/templates/nieuw.xlsx")));
    const api = maakApi(h);
    const sid = h.sheetInfo().sheetIds[0];
    const voor = h.historyState().undoDepth;
    await vulSelectie(api, sid, { top: 0, left: 0, bottom: 4, right: 0 }, { row: 0, col: 0 }, "x");
    expect(h.historyState().undoDepth).toBe(voor + 1);
    expect(h.rangeCells(0, "A1:A5").map((r) => r[0].input)).toEqual(["x", "x", "x", "x", "x"]);
    h.editCell(0, 9, 0, "y");
    expect(await dataRand(api, 0, sid, { row: 0, col: 0 }, "omlaag")).toEqual({ row: 4, col: 0 });
    expect(await dataRand(api, 0, sid, { row: 4, col: 0 }, "omlaag")).toEqual({ row: 9, col: 0 });
    expect((await dataRand(api, 0, sid, { row: 9, col: 0 }, "omlaag")).row).toBe(1048575);
    expect(await dataRand(api, 0, sid, { row: 9, col: 0 }, "omhoog")).toEqual({ row: 4, col: 0 });
    h.dispose();
  });
});
