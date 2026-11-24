import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { bewerkDuplicaten, reeksen, zoekDuplicaten } from "./rekenblad-duplicaten";
import {
  leesBreekpunten,
  raadBreekpunten,
  splitsOpBreedte,
  splitsOpScheiding,
  STANDAARD_SPLITSEN,
  tekstNaarKolommen,
} from "./rekenblad-tekstkolommen";
import { doelzoeken, pasDoelToe, zoekDoel } from "./rekenblad-doelzoeken";
import { automatischeKlassen, frequenties, kurtosis, modus, regressie, scheefheid, steekproef, voerStatistiekUit } from "./rekenblad-statistiek";

describe("doelzoeken", () => {
  it("lost lineaire, kwadratische en niet-oplosbare vergelijkingen op", async () => {
    const lin = await zoekDoel(async (x) => 3 * x + 2, 0, 20);
    expect(lin.gevonden).toBe(true);
    expect(lin.x).toBeCloseTo(6, 6);
    const kw = await zoekDoel(async (x) => x * x, 1, 2);
    expect(kw.x).toBeCloseTo(Math.SQRT2, 6);
    const stap = await zoekDoel(async (x) => (x < 1000 ? 0 : 1), 0, 0.5);
    expect(stap.gevonden).toBe(false);
    const nooit = await zoekDoel(async (x) => x * x + 1, 3, 0);
    expect(nooit.gevonden).toBe(false);
    // Geen oplossing: het dichtstbijzijnde punt dat bekeken is.
    expect(Math.abs(nooit.x)).toBeLessThan(0.1);
  });
  it("rekent in een kopie en past pas bij toepassen toe", async () => {
    const h = boek([["10", "=A1*A1-50"]]);
    const api = maakApi(h);
    const versie = h.version();
    const r = await doelzoeken(api, { blad: 0, sheetId: sid(h), formulecel: { row: 0, col: 1 }, variabelecel: { row: 0, col: 0 }, doelwaarde: 0 });
    expect(r.gevonden).toBe(true);
    expect(r.x).toBeCloseTo(Math.sqrt(50), 6);
    expect(h.version()).toBe(versie);
    expect(inhoud(h, "A1")).toEqual([["10"]]);
    await pasDoelToe(api, { sheetId: sid(h), variabelecel: { row: 0, col: 0 } }, r.x);
    const l = h.readCells({ ranges: [{ sheetId: sid(h), range: { kind: "a1", a1: "B1" } }] });
    expect(l.ok && l.ranges[0].cells[0][0].value.kind === "number" && Math.abs(l.ranges[0].cells[0][0].value.value)).toBeLessThan(1e-5);
    await expect(
      doelzoeken(api, { blad: 0, sheetId: sid(h), formulecel: { row: 0, col: 0 }, variabelecel: { row: 0, col: 1 }, doelwaarde: 0 }),
    ).rejects.toThrow();
    h.dispose();
  });
});

describe("statistiek", () => {
  it("rekent zoals de rekenbladfuncties", () => {
    expect(modus([3, 1, 1, 3, 2])).toBe(3);
    expect(Number.isNaN(modus([1, 2]))).toBe(true);
    expect(scheefheid([1, 2, 3, 10])).toBeCloseTo(1.763633, 5);
    expect(kurtosis([1, 2, 3, 10])).toBeCloseTo(3.228, 5);
    const r = regressie([1, 2, 3, 4], [3, 5, 7, 9]);
    expect(r.helling).toBeCloseTo(2);
    expect(r.snijpunt).toBeCloseTo(1);
    expect(r.r2).toBeCloseTo(1);
    expect(frequenties([1, 2, 2, 5, 9], [2, 5])).toEqual([3, 1, 1]);
    expect(automatischeKlassen([0, 10, 5, 2])).toEqual([5, 10]);
    expect(steekproef([1, 2, 3, 4, 5, 6], "periodiek", 2)).toEqual([2, 4, 6]);
    expect(new Set(steekproef([1, 2, 3, 4, 5, 6], "willekeurig", 4)).size).toBe(4);
  });

  async function waarden(h: WorkbookHandle, blad: number, a1: string) {
    const l = h.readCells({ ranges: [{ sheetId: h.sheetInfo().sheetIds[blad], range: { kind: "a1", a1 } }] });
    if (!l.ok) throw new Error("lezen");
    return l.ranges[0].cells.map((r) => r.map((c) => (c.value.kind === "number" ? c.value.value : c.displayText)));
  }

  it("schrijft beschrijvende statistiek als formules die de rekenkern uitrekent", async () => {
    const h = boek([["x", "y"], ["1", "3"], ["2", "5"], ["3", "7"], ["10", "9"]]);
    const api = maakApi(h);
    const basis = { blad: 0, sheetId: sid(h), invoer: { top: 0, left: 0, bottom: 4, right: 1 }, perKolom: true, labels: true, formules: true };
    const r = await voerStatistiekUit(api, { ...basis, analyse: "beschrijvend", doelcel: { row: 0, col: 4 } });
    const w = await waarden(h, 0, `E1:G13`);
    expect(r.bereik).toEqual({ top: 0, left: 4, bottom: 12, right: 6 });
    expect(w[0].slice(1)).toEqual(["x", "y"]);
    expect(w[1][1]).toBeCloseTo(4); // gemiddelde
    expect(w[2][1]).toBeCloseTo(2.5); // mediaan
    expect(w[8][2]).toBeCloseTo(6); // bereik
    expect(w[10][1]).toBe(4); // aantal
    expect(w[11][1] as number).toBeCloseTo(1.763633, 4); // scheefheid
    expect(w[12][1] as number).toBeCloseTo(3.228, 4); // kurtosis

    // Regressie op een nieuw blad, met formules naar de bron.
    const g = await voerStatistiekUit(api, {
      ...basis,
      analyse: "regressie",
      invoer: { top: 0, left: 1, bottom: 4, right: 1 },
      x: { top: 0, left: 0, bottom: 4, right: 0 },
      doelcel: null,
    });
    expect(g.blad).toBe(1);
    const reg = await waarden(h, 1, "A1:D12");
    const verwacht = regressie([1, 2, 3, 10], [3, 5, 7, 9]);
    expect(reg[1][1] as number).toBeCloseTo(verwacht.helling, 8);
    expect(reg[2][1] as number).toBeCloseTo(verwacht.snijpunt, 8);
    expect(reg[3][1] as number).toBeCloseTo(verwacht.r2, 8);
    expect(reg[8][2] as number).toBeCloseTo(verwacht.snijpunt + verwacht.helling, 8);

    // Histogram met COUNTIFS.
    const hi = await voerStatistiekUit(api, { ...basis, analyse: "histogram", invoer: { top: 0, left: 0, bottom: 4, right: 0 }, doelcel: { row: 20, col: 0 } });
    const hw = await waarden(h, 0, `A21:C${hi.bereik.bottom + 1}`);
    expect(hw.slice(1).map((r) => r[1])).toEqual(frequenties([1, 2, 3, 10], automatischeKlassen([1, 2, 3, 10])));
    h.dispose();
  });
});

describe("tekst naar kolommen", () => {
  it("splitst op scheidingstekens met afbakening en samenvoegen", () => {
    expect(splitsOpScheiding('a;"b;c";d', new Set([";"]), false, '"')).toEqual(["a", "b;c", "d"]);
    expect(splitsOpScheiding("a  b", new Set([" "]), false, '"')).toEqual(["a", "", "b"]);
    expect(splitsOpScheiding("a  b", new Set([" "]), true, '"')).toEqual(["a", "b"]);
    expect(splitsOpScheiding("a,b;c", new Set([",", ";"]), false, "")).toEqual(["a", "b", "c"]);
  });
  it("splitst op vaste breedte en raadt kolomeinden", () => {
    expect(splitsOpBreedte("Jan   12  x", [6, 10])).toEqual(["Jan", "12", "x"]);
    expect(raadBreekpunten(["Jan   12", "Piet  34"])).toEqual([6]);
    expect(leesBreekpunten("12, 5;5 x")).toEqual([5, 12]);
  });
  it("schrijft getallen, datums en tekst in één ongedaan-maakstap", async () => {
    const h = boek([["1,5;01-02-2026;0123;=x"], ["2;03-04-2026;abc;y"]]);
    const api = maakApi(h);
    const voor = h.historyState().undoDepth;
    await tekstNaarKolommen(api, {
      sheetId: sid(h),
      bron: { top: 0, left: 0, bottom: 1, right: 0 },
      doelcel: { row: 0, col: 0 },
      opties: { ...STANDAARD_SPLITSEN, scheidingen: { ...STANDAARD_SPLITSEN.scheidingen, tab: false, puntkomma: true } },
      kolommen: [
        { type: "standaard", datumvolgorde: "DMJ" },
        { type: "datum", datumvolgorde: "DMJ" },
        { type: "tekst", datumvolgorde: "DMJ" },
        { type: "standaard", datumvolgorde: "DMJ" },
      ],
      getalnotatie: "nl",
    });
    expect(h.historyState().undoDepth).toBe(voor + 1);
    const l = h.readCells({ ranges: [{ sheetId: sid(h), range: { kind: "a1", a1: "A1:D2" } }] });
    if (!l.ok) throw new Error("lezen");
    const c = l.ranges[0].cells;
    expect(c[0][0].value).toEqual({ kind: "number", value: 1.5 });
    expect(c[0][1].displayText).toBe("01-02-2026");
    expect(c[0][2].value).toEqual({ kind: "text", value: "0123" });
    expect(c[0][3].value).toEqual({ kind: "text", value: "=x" });
    expect(c[1][2].value).toEqual({ kind: "text", value: "abc" });
    h.dispose();
  });
});

let xlsx: typeof import("@betteroffice/xlsx");
beforeAll(async () => {
  xlsx = await import("@betteroffice/xlsx");
  await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
});

/** Een minimale editor-API rond een werkboek, zoals XlsxEditor die geeft. */
function maakApi(handle: WorkbookHandle) {
  const api = {
    handle,
    commands: { getState: () => ({ enabled: true }) },
    version: async () => handle.version(),
    readCells: async (r: Parameters<WorkbookHandle["readCells"]>[0]) => handle.readCells(r),
    validateEdits: async (r: Parameters<WorkbookHandle["validateEdits"]>[0]) => handle.validateEdits(r),
    applyEdits: async (r: Parameters<WorkbookHandle["applyEdits"]>[0]) => handle.applyEdits(r),
    selectCells: () => true,
  };
  return api as unknown as XlsxEditorApi;
}

export function boek(rijen: string[][]) {
  const handle = xlsx.openWorkbook(new Uint8Array(readFileSync("public/templates/nieuw.xlsx")));
  handle.editCells(
    0,
    rijen.flatMap((rij, r) => rij.map((input, c) => ({ row: r, col: c, input }))).filter((e) => e.input !== ""),
  );
  return handle;
}
const inhoud = (h: WorkbookHandle, a1: string) => h.rangeCells(0, a1).map((r) => r.map((c) => c.input));
const sid = (h: WorkbookHandle) => h.sheetInfo().sheetIds[0];

describe("duplicaten zoeken", () => {
  it("vergelijkt de gekozen kolommen op weergegeven tekst, standaard zonder hoofdletters", () => {
    const t = [
      ["Jan", "1"],
      ["jan", "2"],
      ["Piet", "1"],
      ["JAN", "1"],
    ];
    const a = zoekDuplicaten(t, [0], false);
    expect(a.uniek).toEqual([0, 2]);
    expect(a.dubbel).toEqual([1, 3]);
    expect(a.meervoudig).toEqual([0, 1, 3]);
    expect(a.enkel).toEqual([2]);
    expect(zoekDuplicaten(t, [0], true).dubbel).toEqual([]);
    expect(zoekDuplicaten(t, [0, 1], false).dubbel).toEqual([3]);
  });
  it("vat rijen samen tot aaneengesloten reeksen", () => {
    expect(reeksen([1, 2, 3, 6, 8, 9])).toEqual([
      [1, 3],
      [6, 6],
      [8, 9],
    ]);
  });
});

describe("duplicaten bewerken", () => {
  it("verwijdert dubbele rijen in één ongedaan-maakstap en houdt formules juist", async () => {
    const h = boek([
      ["Naam", "Getal", "Dubbel"],
      ["a", "1", "=B2*2"],
      ["b", "2", "=B3*2"],
      ["A", "1", "=B4*2"],
      ["c", "3", "=B5*2"],
      ["x", "", ""],
    ]);
    const api = maakApi(h);
    const voor = h.historyState().undoDepth;
    const r = await bewerkDuplicaten(api, {
      blad: 0,
      sheetId: sid(h),
      bereik: { top: 0, left: 0, bottom: 4, right: 2 },
      kop: true,
      kolommen: [0, 1],
      hoofdlettergevoelig: false,
      actie: "verwijderen",
    });
    expect(r).toEqual({ aantal: 1, over: 3 });
    expect(h.historyState().undoDepth).toBe(voor + 1);
    expect(inhoud(h, "A1:C6")).toEqual([
      ["Naam", "Getal", "Dubbel"],
      ["a", "1", "=B2*2"],
      ["b", "2", "=B3*2"],
      ["c", "3", "=B4*2"],
      ["", "", ""],
      ["x", "", ""],
    ]);
    h.undo();
    expect(inhoud(h, "A4:C4")).toEqual([["A", "1", "=B4*2"]]);
    h.dispose();
  });

  it("markeert dubbele rijen en verbergt herhalingen bij filteren", async () => {
    const h = boek([["k"], ["1"], ["2"], ["1"], ["3"], ["2"]]);
    const api = maakApi(h);
    const basis = { blad: 0, sheetId: sid(h), bereik: { top: 0, left: 0, bottom: 5, right: 0 }, kop: true, kolommen: [0], hoofdlettergevoelig: false };
    const m = await bewerkDuplicaten(api, { ...basis, actie: "markerenDubbel" });
    expect(m).toEqual({ aantal: 4, over: 5 });
    const f = h.selectionFormatting(0, "A2");
    expect(f.fillColor?.toUpperCase()).toBe("#FFC7CE");
    expect(h.selectionFormatting(0, "A5").fillColor ?? null).not.toBe("#FFC7CE");
    const u = await bewerkDuplicaten(api, { ...basis, actie: "markerenUniek" });
    expect(u.aantal).toBe(1);
    h.dispose();
  });
});
