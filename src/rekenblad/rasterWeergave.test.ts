import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Pakket } from "../grafieken/pakket";
import { wijzigInstellingen, zetTerug } from "../instellingen";
import { werkboekBytes } from "../lint/rekenblad-filter";
import { MAX_RIJEN } from "../lint/rekenblad-logica";
import { BEGINRASTER, leesRasterKeuze } from "./begrensdRaster";
import {
  abonneerRasterMeldingen,
  bereidRasterWeergave,
  bewaakRasterSelectie,
  gebruiktBereik,
  groeiRaster,
  pasRasterAan,
  rasterBlad,
  zetBegrensd,
  type RasterMelding,
} from "./rasterWeergave";

const bron = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));

function editor(bytes: Uint8Array = bron, naam = "") {
  const h = openWorkbook(bytes);
  const gekozen: unknown[] = [];
  const api = {
    handle: h,
    save: () => h.save(),
    selectCells: (blad: number, sel: unknown) => {
      gekozen.push([blad, sel]);
      return true;
    },
  } as unknown as XlsxEditorApi;
  bereidRasterWeergave(api, bytes, naam);
  const meldingen: RasterMelding[] = [];
  abonneerRasterMeldingen(h, (m) => meldingen.push(m));
  return { h, api, gekozen, meldingen, bewaar: () => werkboekBytes({ handle: h, save: () => h.save() }) };
}
const selectie = (h: WorkbookHandle, anchor: [number, number], focus: [number, number]) => ({
  sheetId: h.sheetInfo().sheetIds[0],
  sheetIndex: 0,
  chartId: null,
  cells: { anchor: { row: anchor[0], col: anchor[1] }, focus: { row: focus[0], col: focus[1] } },
});
const bladXml = (bytes: Uint8Array) => {
  const p = new Pakket(bytes);
  return p.namen().filter((n) => /^xl\//.test(n)).sort().map((n) => [n, p.lees(n)]);
};

afterEach(() => zetTerug());

describe("begrensd raster per blad", () => {
  it("is standaard onbeperkt en laat het bestand dan ongemoeid", () => {
    const { h, bewaar } = editor();
    expect(rasterBlad(h, 0)).toEqual({ begrensd: false, omvang: { rijen: MAX_RIJEN, kolommen: 16384 } });
    const p = new Pakket(bewaar());
    expect(p.heeft("docProps/custom.xml")).toBe(false);
    h.dispose();
  });

  it("volgt de standaardkeuze uit Instellingen zonder die in het bestand te zetten", () => {
    wijzigInstellingen({ rekenblad: { raster: "begrensd" } });
    const { h, bewaar } = editor();
    expect(rasterBlad(h, 0)).toEqual({ begrensd: true, omvang: BEGINRASTER });
    expect(new Pakket(bewaar()).heeft("docProps/custom.xml")).toBe(false);
    wijzigInstellingen({ rekenblad: { raster: "onbeperkt" } });
    expect(rasterBlad(h, 0)?.begrensd).toBe(false);
    h.dispose();
  });

  it("groeit mee met de inhoud en krimpt alleen via aanpassen aan inhoud", () => {
    const { h, meldingen } = editor();
    zetBegrensd(h, 0, true);
    expect(rasterBlad(h, 0)?.omvang).toEqual(BEGINRASTER);
    // Typen in de laatste rij en kolom van het raster.
    h.editCell(0, 19, 7, "rand");
    expect(gebruiktBereik(h, 0)).toMatchObject({ bottom: 19, right: 7 });
    expect(rasterBlad(h, 0)?.omvang).toEqual({ rijen: 25, kolommen: 11 });
    // Plakken of doorvoeren van een groter bereik.
    h.editCell(0, 59, 1, "ver");
    expect(rasterBlad(h, 0)?.omvang).toEqual({ rijen: 65, kolommen: 11 });
    h.editCell(0, 59, 1, "");
    h.editCell(0, 19, 7, "");
    expect(rasterBlad(h, 0)?.omvang).toEqual({ rijen: 65, kolommen: 11 });
    groeiRaster(h, 0, { rijen: 10 });
    expect(rasterBlad(h, 0)?.omvang).toEqual({ rijen: 75, kolommen: 11 });
    pasRasterAan(h, 0);
    expect(rasterBlad(h, 0)?.omvang).toEqual(BEGINRASTER);
    expect(meldingen.map((m) => m.soort)).toEqual(["uitgebreid", "aangepast"]);
    h.dispose();
  });

  it("leest het gebruikte bereik goedkoop en gelijk aan de rekenkern", () => {
    const { h } = editor();
    const kern = () => h.selectionData(0, 0, 0, "usedRange").usedRange;
    const zelfde = () => {
      const [a, b] = [gebruiktBereik(h, 0), kern()];
      expect(a ? { bottom: a.bottom, right: a.right } : null).toEqual(b ? { bottom: b.bottom, right: b.right } : null);
    };
    zelfde();
    for (const [rij, kolom] of [[0, 0], [30, 8], [48, 24], [49, 25], [50, 26], [199, 3], [1200, 40]]) {
      h.editCell(0, rij, kolom, "x");
      zelfde();
    }
    // Andere rijhoogten, kolombreedten en verborgen sporen verschuiven de pixels, niet het bereik.
    h.applyOps([
      { type: "setRowHeight", sheet: 0, row: 3, height: 60 },
      { type: "setRowHeight", sheet: 0, row: 1200, height: 7.5 },
      { type: "setColWidth", sheet: 0, col: 1, width: 40 },
      { type: "setColWidth", sheet: 0, col: 40, width: 2 },
    ]);
    zelfde();
    // Een verborgen laatste rij of de rij erna verkleint het bereik niet.
    h.applyOps([
      { type: "setRowVisibility", sheet: 0, row: 1200, hidden: true },
      { type: "setRowVisibility", sheet: 0, row: 1201, hidden: true },
      { type: "setColVisibility", sheet: 0, col: 41, hidden: true },
    ]);
    expect(gebruiktBereik(h, 0)!.bottom).toBeGreaterThanOrEqual(1200);
    expect(gebruiktBereik(h, 0)!.right).toBeGreaterThanOrEqual(40);
    h.applyOps([
      { type: "setRowVisibility", sheet: 0, row: 1200, hidden: false },
      { type: "setRowVisibility", sheet: 0, row: 1201, hidden: false },
      { type: "setColVisibility", sheet: 0, col: 41, hidden: false },
    ]);
    zelfde();
    h.editCell(0, 1200, 40, "");
    zelfde();
    h.editCell(0, 199, 3, "");
    h.editCell(0, 50, 26, "");
    zelfde();
    h.dispose();
  });

  it("gebruikt de marge uit Instellingen", () => {
    wijzigInstellingen({ rekenblad: { rastermarge: { rijen: 2, kolommen: 1 } } });
    const { h } = editor();
    zetBegrensd(h, 0, true);
    h.editCell(0, 29, 9, "x");
    expect(rasterBlad(h, 0)?.omvang).toEqual({ rijen: 32, kolommen: 11 });
    h.dispose();
  });

  it("breidt uit voor Ga naar en het naamvak, en houdt toetsen binnen het raster", async () => {
    const { h, api, gekozen, meldingen } = editor();
    zetBegrensd(h, 0, true);
    // Navigatie via de API (naamvak, Ga naar, zoeken).
    api.selectCells(0, { anchor: { row: 299, col: 51 }, focus: { row: 299, col: 51 } });
    expect(rasterBlad(h, 0)?.omvang).toEqual({ rijen: 305, kolommen: 55 });
    expect(gekozen).toHaveLength(1);
    // Hele kolommen breiden het raster niet uit.
    api.selectCells(0, { anchor: { row: MAX_RIJEN - 1, col: 3 }, focus: { row: 0, col: 3 } });
    expect(rasterBlad(h, 0)?.omvang).toEqual({ rijen: 305, kolommen: 55 });
    pasRasterAan(h, 0);
    // Ctrl+pijl-omlaag binnen de engine: terug naar de laatste rij.
    bewaakRasterSelectie(api, selectie(h, [MAX_RIJEN - 1, 2], [MAX_RIJEN - 1, 2]));
    await Promise.resolve();
    expect(gekozen.at(-1)).toEqual([0, { anchor: { row: 19, col: 2 }, focus: { row: 19, col: 2 } }]);
    expect(rasterBlad(h, 0)?.omvang).toEqual(BEGINRASTER);
    expect(meldingen.at(-1)).toEqual({ soort: "grens", rij: true, kolom: false, omvang: BEGINRASTER });
    // Binnen het raster gebeurt niets.
    const aantal = gekozen.length;
    bewaakRasterSelectie(api, selectie(h, [3, 3], [5, 5]));
    await Promise.resolve();
    expect(gekozen).toHaveLength(aantal);
    h.dispose();
  });

  it("bewaart de keuze als documenteigenschap en laat werkmap en werkbladen gelijk", () => {
    const { h, bewaar } = editor();
    h.editCell(0, 2, 1, "42");
    h.editCell(0, 3, 1, "=B3*2");
    const zonder = bewaar();
    zetBegrensd(h, 0, true);
    groeiRaster(h, 0, { rijen: 3, kolommen: 2 });
    const met = bewaar();
    expect(leesRasterKeuze(met)).toEqual({
      bladen: [{ naam: h.sheetInfo().sheetNames[0], rijen: 23, kolommen: 10 }],
      onbeperkt: [],
    });
    expect(bladXml(met)).toEqual(bladXml(zonder));
    expect(new Pakket(met).lees("xl/worksheets/sheet1.xml")).not.toMatch(/hidden=/);
    h.dispose();

    // Heropenen: het raster is weer begrensd, met dezelfde omvang en dezelfde cellen.
    const opnieuw = editor(met);
    expect(rasterBlad(opnieuw.h, 0)).toEqual({ begrensd: true, omvang: { rijen: 23, kolommen: 10 } });
    expect(opnieuw.h.cell(0, 3, 1).input).toBe("=B3*2");
    expect(leesRasterKeuze(opnieuw.bewaar())).toEqual(leesRasterKeuze(met));
    // Terug naar onbeperkt: de eigenschap verdwijnt, de inhoud blijft.
    zetBegrensd(opnieuw.h, 0, false);
    const terug = opnieuw.bewaar();
    expect(leesRasterKeuze(terug)).toBeNull();
    expect(bladXml(terug)).toEqual(bladXml(zonder));
    opnieuw.h.dispose();
  });

  it("onthoudt een onbeperkt blad als de standaard begrensd is", () => {
    wijzigInstellingen({ rekenblad: { raster: "begrensd" } });
    const { h, bewaar } = editor();
    zetBegrensd(h, 0, false);
    const bytes = bewaar();
    expect(leesRasterKeuze(bytes)).toEqual({ bladen: [], onbeperkt: [h.sheetInfo().sheetNames[0]] });
    h.dispose();
    const opnieuw = editor(bytes);
    expect(rasterBlad(opnieuw.h, 0)?.begrensd).toBe(false);
    opnieuw.h.dispose();
  });
});
