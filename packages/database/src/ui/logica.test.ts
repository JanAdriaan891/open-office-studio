import { describe, expect, it } from "vitest";
import {
  bewerkTekst,
  csvRijen,
  leesbareFout,
  leesDatum,
  leesGetal,
  leesInvoer,
  parameterWaarde,
  toonWaarde,
} from "./invoer.ts";
import { bouwRapport, leegRapport, leesRapportDefinitie } from "./rapport-logica.ts";
import {
  automatischFormulier,
  controleerDefinitie,
  kan,
  naVerwijderen,
  navigeer,
  positieTekst,
} from "./formulier-logica.ts";
import { isActiequery, querysoortVan } from "./sql.ts";

describe("Nederlandse invoer", () => {
  it("leest getallen met komma en duizendtallen", () => {
    expect(leesGetal("1.234,56")).toBe(1234.56);
    expect(leesGetal("1234,5")).toBe(1234.5);
    expect(leesGetal("-12")).toBe(-12);
    expect(leesGetal("€ 1.000")).toBe(1000);
    expect(leesGetal("12.5")).toBe(12.5);
    expect(leesGetal("1.234.567")).toBe(1234567);
    expect(leesGetal("1,2,3")).toBeNull();
    expect(leesGetal("12.34,5")).toBeNull();
    expect(leesGetal("abc")).toBeNull();
    expect(leesGetal("")).toBeNull();
  });
  it("leest datums en tijden", () => {
    expect(leesDatum("26-10-2026")).toBe("2026-10-26");
    expect(leesDatum("1/2/2026")).toBe("2026-02-01");
    expect(leesDatum("26-10-26")).toBe("2026-10-26");
    expect(leesDatum("2026-10-26")).toBe("2026-10-26");
    expect(leesDatum("26-10-2026 14:30")).toBe("2026-10-26T14:30:00");
    expect(leesDatum("2026-10-26T08:05:09")).toBe("2026-10-26T08:05:09");
    expect(leesDatum("14:30")).toBe("1899-12-30T14:30:00");
    expect(leesDatum("31-02-2026")).toBeNull();
    expect(leesDatum("29-02-2024")).toBe("2024-02-29");
    expect(leesDatum("26-13-2026")).toBeNull();
    expect(leesDatum("26-10-2026 25:00")).toBeNull();
  });
  it("controleert per veldsoort", () => {
    const veld = (soort: Parameters<typeof leesInvoer>[1]["soort"], extra = {}) => ({ naam: "X", soort, ...extra });
    expect(leesInvoer("12", veld("geheel"))).toEqual({ ok: true, waarde: 12 });
    expect(leesInvoer("12,5", veld("geheel")).ok).toBe(false);
    expect(leesInvoer("12,5", veld("getal"))).toEqual({ ok: true, waarde: 12.5 });
    expect(leesInvoer("€ 1.234,56789", veld("valuta"))).toEqual({ ok: true, waarde: 1234.5679 });
    expect(leesInvoer("ja", veld("jaNee"))).toEqual({ ok: true, waarde: true });
    expect(leesInvoer("Onwaar", veld("jaNee"))).toEqual({ ok: true, waarde: false });
    expect(leesInvoer("misschien", veld("jaNee")).ok).toBe(false);
    expect(leesInvoer("", veld("tekst"))).toEqual({ ok: true, waarde: null });
    expect(leesInvoer("", veld("tekst", { verplicht: true })).ok).toBe(false);
    expect(leesInvoer("abcdef", veld("tekst", { lengte: 5 })).ok).toBe(false);
    expect(leesInvoer("1", veld("autonummer")).ok).toBe(false);
    expect(leesInvoer("{0f8fad5b-d9cb-469f-a165-70867728950e}", veld("guid"))).toEqual({
      ok: true,
      waarde: "{0F8FAD5B-D9CB-469F-A165-70867728950E}",
    });
    const fout = leesInvoer("morgen", veld("datum"));
    expect(fout.ok === false && fout.fout).toContain("26-10-2026");
  });
  it("toont en bewerkt waarden in Nederlandse notatie", () => {
    expect(toonWaarde(1234.5, "getal")).toBe("1.234,5");
    expect(toonWaarde(1234.5, "valuta")).toMatch(/€\s?1\.234,50/);
    expect(toonWaarde("2026-10-26T14:30:00", "datum")).toBe("26-10-2026 14:30");
    expect(toonWaarde("2026-10-26", "datum")).toBe("26-10-2026");
    expect(toonWaarde(true, "jaNee")).toBe("Ja");
    expect(toonWaarde(null, "tekst")).toBe("");
    expect(toonWaarde(new Uint8Array(3), "binair")).toContain("3 bytes");
    expect(bewerkTekst(1234.5, "valuta")).toBe("1234,50");
    expect(bewerkTekst(1234.5, "getal")).toBe("1234,5");
    expect(csvRijen([[1.5, "2026-01-02", true]], ["getal", "datum", "jaNee"])).toEqual([["1,5", "02-01-2026", "Ja"]]);
  });
  it("zet parameterinvoer om", () => {
    expect(parameterWaarde("12,5")).toBe(12.5);
    expect(parameterWaarde("26-10-2026")).toBe("2026-10-26");
    expect(parameterWaarde("Utrecht")).toBe("Utrecht");
    expect(parameterWaarde(" ")).toBeNull();
  });
  it("maakt integriteitsfouten begrijpelijk", () => {
    expect(leesbareFout(new Error("Rij toevoegen mislukt: UNIQUE constraint failed: Klanten.Code"))).toContain("‘Code’ in ‘Klanten’");
    expect(leesbareFout("NOT NULL constraint failed: T.Naam")).toContain("verplicht");
    expect(leesbareFout("FOREIGN KEY constraint failed")).toContain("relatie");
    expect(leesbareFout("iets anders")).toBe("iets anders");
  });
});

describe("Querysoort", () => {
  it("herkent actiequery’s", () => {
    expect(querysoortVan("SELECT * FROM T")).toBe("select");
    expect(querysoortVan("PARAMETERS [x] Long;\nDELETE FROM T WHERE id=[x]")).toBe("delete");
    expect(querysoortVan("update T set a=1")).toBe("update");
    expect(querysoortVan("INSERT INTO T SELECT * FROM U")).toBe("append");
    expect(querysoortVan("SELECT a INTO Nieuw FROM T")).toBe("maketable");
    expect(querysoortVan("SELECT 'INTO' AS x FROM T")).toBe("select");
    expect(querysoortVan("TRANSFORM Sum(a) SELECT b FROM T GROUP BY b PIVOT c")).toBe("crosstab");
    expect(querysoortVan("SELECT a FROM T UNION SELECT a FROM U")).toBe("union");
    expect(querysoortVan("CREATE TABLE X (a TEXT)")).toBe("ddl");
    expect(isActiequery("delete")).toBe(true);
    expect(isActiequery("select")).toBe(false);
  });
});

describe("Rapportgroepering en totalen", () => {
  const kolommen = ["Plaats", "Naam", "Bedrag"];
  const rijen = [
    ["Utrecht", "B", 10],
    ["Delft", "A", 5],
    ["Utrecht", "A", 20],
    [null, "C", null],
    ["Delft", "C", 7],
  ];
  it("groepeert, sorteert en telt per groep en in totaal", () => {
    const def = {
      ...leegRapport("Test"),
      groepeer: "plaats",
      sorteer: [{ veld: "Naam", aflopend: false }],
      totalen: [
        { veld: "Bedrag", functie: "som" as const },
        { veld: "Bedrag", functie: "gemiddelde" as const },
        { veld: "Naam", functie: "aantal" as const },
      ],
    };
    const r = bouwRapport(kolommen, rijen, def);
    expect(r.groepen.map((g) => g.sleutel)).toEqual([null, "Delft", "Utrecht"]);
    expect(r.groepen[1].rijen.map((x) => x[1])).toEqual(["A", "C"]);
    expect(r.groepen[2].rijen.map((x) => x[1])).toEqual(["A", "B"]);
    expect(r.groepen[0].totalen[0].waarde).toBeNull();
    expect(r.groepen[1].totalen.map((t) => t.waarde)).toEqual([12, 6, 2]);
    expect(r.groepen[2].totalen.map((t) => t.waarde)).toEqual([30, 15, 2]);
    expect(r.eindtotalen.map((t) => t.waarde)).toEqual([42, 10.5, 5]);
    expect(r.aantal).toBe(5);
  });
  it("sorteert aflopend zonder groepering en meldt ontbrekende velden", () => {
    const r = bouwRapport(kolommen, rijen, {
      ...leegRapport("T"),
      velden: ["Naam", "Bestaatniet"],
      sorteer: [{ veld: "Bedrag", aflopend: true }],
    });
    expect(r.groepen).toHaveLength(1);
    expect(r.kolommen).toEqual(["Naam"]);
    expect(r.groepen[0].rijen.map((x) => x[2])).toEqual([20, 10, 7, 5, null]);
    expect(r.ontbrekend).toEqual(["Bestaatniet"]);
  });
  it("leest opgeslagen definities robuust", () => {
    const d = leesRapportDefinitie({ titel: "X", totalen: [{ veld: "a", functie: "max" }, { veld: "b", functie: "som" }] }, "Y");
    expect(d.titel).toBe("X");
    expect(d.totalen).toEqual([{ veld: "b", functie: "som" }]);
    expect(leesRapportDefinitie(null, "Y").titel).toBe("Y");
  });
});

describe("Formuliernavigatie", () => {
  it("navigeert zoals Access, inclusief het nieuwe record", () => {
    let n = { index: 0, totaal: 3 };
    expect(kan(n, "vorige")).toBe(false);
    n = navigeer(n, "volgende");
    expect(n.index).toBe(1);
    n = navigeer(n, "laatste");
    expect(n.index).toBe(2);
    expect(kan(n, "laatste")).toBe(false);
    n = navigeer(n, "volgende");
    expect(n.index).toBe(3);
    expect(positieTekst(n)).toContain("Nieuw record");
    expect(kan(n, "verwijderen")).toBe(false);
    expect(kan(n, "nieuw")).toBe(false);
    n = navigeer(n, "vorige");
    expect(n.index).toBe(2);
    n = navigeer(n, "eerste");
    expect(n.index).toBe(0);
    expect(navigeer(n, { naar: 99 }).index).toBe(3);
    expect(positieTekst({ index: 0, totaal: 3 })).toBe("Record 1 van 3");
  });
  it("blijft binnen grenzen na verwijderen", () => {
    expect(naVerwijderen({ index: 2, totaal: 3 })).toEqual({ index: 1, totaal: 2 });
    expect(naVerwijderen({ index: 0, totaal: 1 })).toEqual({ index: 0, totaal: 0 });
    expect(navigeer({ index: 0, totaal: 0 }, "volgende").index).toBe(0);
  });
  it("maakt en controleert definities", () => {
    const d = automatischFormulier("Klanten", [{ naam: "Id", soort: "autonummer" }, { naam: "Foto", soort: "binair" }, { naam: "Naam", soort: "tekst" }]);
    expect(d.velden.map((v) => v.veld)).toEqual(["Id", "Naam"]);
    expect(controleerDefinitie(d)).toEqual([]);
    expect(controleerDefinitie({ ...d, knoppen: [{ naam: "1knop", label: "x" }] })[0]).toContain("letter");
    expect(controleerDefinitie({ ...d, knoppen: [{ naam: "Naam", label: "x" }] })[0]).toContain("meer dan één keer");
  });
});
