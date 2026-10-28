import { describe, expect, it } from "vitest";
import { extensieVan, opslagplan, vertaal } from "./werkbestand";
import {
  beginToestand,
  tabbladReducer,
  zoekWerkbestand,
} from "./tabbladen";

describe("Ctrl+S en het werkbestand", () => {
  it("schrijft het eigen formaat zonder vragen terug", () => {
    expect(
      opslagplan({
        soort: "docx",
        werkbestand: { token: "t", naam: "Verslag.DOCX" },
        heeftKeuze: false,
      }),
    ).toEqual({ route: "terugschrijven", ext: "docx", bevestigen: false });
  });

  it("vraagt eenmalig bij een geïmporteerd formaat", () => {
    const tabblad = {
      soort: "docx" as const,
      werkbestand: { token: "t", naam: "notitie.odt" },
      heeftKeuze: true,
    };
    expect(opslagplan(tabblad)).toEqual({
      route: "terugschrijven",
      ext: "odt",
      bevestigen: true,
    });
    expect(
      opslagplan({
        ...tabblad,
        werkbestand: { ...tabblad.werkbestand, bevestigd: true },
      }),
    ).toMatchObject({ bevestigen: false });
  });

  it("nieuw document: eerst Opslaan als, daarna dezelfde keuze", () => {
    expect(
      opslagplan({ soort: "xlsx", werkbestand: null, heeftKeuze: false }),
    ).toEqual({ route: "opslaanAls" });
    expect(
      opslagplan({ soort: "xlsx", werkbestand: null, heeftKeuze: true }),
    ).toEqual({ route: "keuze" });
  });

  it("alleen-lezen en een ander formaat leiden naar Opslaan als", () => {
    expect(vertaal({ status: "alleen-lezen" }, "a.docx")).toMatchObject({
      status: "opslaan-als",
      toelichting: expect.stringContaining("alleen-lezen"),
    });
    expect(vertaal({ status: "ander-formaat" }, "a.odt").status).toBe(
      "opslaan-als",
    );
    expect(
      vertaal({ status: "opgeslagen", naam: "a.docx", pad: "/x/a.docx" }, ""),
    ).toEqual({ status: "opgeslagen", pad: "/x/a.docx" });
    expect(vertaal({ status: "geannuleerd" }, "a.docx").status).toBe(
      "geannuleerd",
    );
  });

  it("extensie in kleine letters", () => {
    expect(extensieVan("Begroting 2026.XLSX")).toBe("xlsx");
    expect(extensieVan("zonder")).toBe("");
  });

  it("tabblad vindt en onthoudt zijn werkbestand", () => {
    let t = tabbladReducer(beginToestand, {
      type: "openDocument",
      naam: "a.docx",
      soort: "docx",
      bytes: new Uint8Array([1]),
      werkbestand: { token: "abc", naam: "a.docx" },
    });
    expect(zoekWerkbestand(t, "abc")?.id).toBe(1);
    t = tabbladReducer(t, {
      type: "werkBij",
      id: 1,
      wijziging: {
        naam: "b.docx",
        werkbestand: { token: "def", naam: "b.docx" },
      },
    });
    expect(zoekWerkbestand(t, "abc")).toBeUndefined();
    expect(zoekWerkbestand(t, "def")?.naam).toBe("b.docx");
  });
});
