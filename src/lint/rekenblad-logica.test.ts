import { describe, expect, it } from "vitest";
import type { XlsxCellValue } from "@betteroffice/xlsx";
import {
  autoSom,
  bereikA1,
  bladnaamFout,
  heeftKoprij,
  kolomLetters,
  kolomNummer,
  nieuweBladnaam,
  ontleedBereik,
  ontleedVerwijzing,
  selectieRond,
  serieleDatum,
  sorteerVolgorde,
  verborgenIndices,
  verschuifFormule,
  vervangTekst,
} from "./rekenblad-logica";

const g = (value: number): XlsxCellValue => ({ kind: "number", value });
const t = (value: string): XlsxCellValue => ({ kind: "text", value });
const leeg: XlsxCellValue = { kind: "empty" };

describe("adressen", () => {
  it("zet kolommen om in letters en terug", () => {
    expect([0, 25, 26, 701, 702, 16383].map(kolomLetters)).toEqual([
      "A",
      "Z",
      "AA",
      "ZZ",
      "AAA",
      "XFD",
    ]);
    expect(kolomNummer("XFD")).toBe(16383);
  });
  it("ontleedt bereiken en verwijzingen met bladnaam", () => {
    expect(ontleedBereik("$C$5:a1")).toEqual({ top: 0, left: 0, bottom: 4, right: 2 });
    expect(bereikA1({ top: 2, left: 1, bottom: 2, right: 1 })).toBe("B3");
    expect(ontleedVerwijzing("'Blad 1'!$A$1:$B$2")).toEqual({
      blad: "Blad 1",
      bereik: { top: 0, left: 0, bottom: 1, right: 1 },
    });
    expect(ontleedVerwijzing("Gegevens!D4")?.blad).toBe("Gegevens");
    expect(ontleedVerwijzing("B4")?.blad).toBeNull();
    expect(ontleedVerwijzing("geen adres")).toBeNull();
    expect(ontleedBereik("XFE1")).toBeNull();
  });
});

describe("selectie", () => {
  it("leidt de richting af uit de zichtbaar geselecteerde cellen", () => {
    const focus = { row: 7, col: 2 };
    expect(selectieRond(focus, { rows: 3, columns: 2 }, [focus, { row: 9, col: 3 }])).toEqual(
      { top: 7, left: 2, bottom: 9, right: 3 },
    );
    expect(selectieRond(focus, { rows: 3, columns: 2 }, [focus, { row: 5, col: 1 }])).toEqual(
      { top: 5, left: 1, bottom: 7, right: 2 },
    );
  });
});

describe("sorteren", () => {
  it("zet getallen voor tekst en lege cellen altijd onderaan", () => {
    const rijen = [[t("b")], [leeg], [g(10)], [t("A")], [g(2)]];
    expect(sorteerVolgorde(rijen, 0)).toEqual([4, 2, 3, 0, 1]);
    expect(sorteerVolgorde(rijen, 0, true)).toEqual([0, 3, 2, 4, 1]);
  });
  it("sorteert stabiel en zonder hoofdlettergevoeligheid", () => {
    expect(sorteerVolgorde([[t("appel")], [t("Appel")], [t("aardbei")]], 0)).toEqual([
      2, 0, 1,
    ]);
  });
  it("herkent een koprij", () => {
    expect(heeftKoprij([[t("Naam"), t("Aantal")], [t("x"), g(3)]])).toBe(true);
    expect(heeftKoprij([[t("b")], [t("a")]])).toBe(false);
  });
});

describe("formules doorvoeren", () => {
  it("verschuift relatieve verwijzingen en laat absolute en tekst staan", () => {
    expect(verschuifFormule("D7*F7", 2, 0)).toBe("D9*F9");
    expect(verschuifFormule("SUM($A$1:A3)+B$2", 1, 1)).toBe("SUM($A$1:B4)+C$2");
    expect(verschuifFormule('IF(A1="B2";LOG10(A1))', 1, 0)).toBe('IF(A2="B2";LOG10(A2))');
    expect(verschuifFormule("'Blad 2'!C3", 1, 0)).toBe("'Blad 2'!C4");
    expect(verschuifFormule("A1", -1, 0)).toBe("#REF!");
  });
});

describe("AutoSom", () => {
  const raster: Record<string, XlsxCellValue> = {
    "0:0": t("Aantal"),
    "1:0": g(4),
    "2:0": g(6),
    "4:1": g(1),
    "4:2": g(2),
  };
  const waarde = ({ row, col }: { row: number; col: number }) =>
    raster[`${row}:${col}`] ?? leeg;
  it("telt de getallen boven de cel op", () => {
    expect(autoSom({ top: 3, left: 0, bottom: 3, right: 0 }, waarde)).toEqual({
      soort: "cel",
      doel: { row: 3, col: 0 },
      bron: { top: 1, left: 0, bottom: 2, right: 0 },
    });
  });
  it("valt terug op de getallen links van de cel", () => {
    expect(autoSom({ top: 4, left: 3, bottom: 4, right: 3 }, waarde)).toMatchObject({
      bron: { top: 4, left: 1, bottom: 4, right: 2 },
    });
    expect(autoSom({ top: 8, left: 5, bottom: 8, right: 5 }, waarde)).toBeNull();
  });
  it("zet bij een bereik de sommen in de lege laatste rij", () => {
    expect(autoSom({ top: 1, left: 0, bottom: 3, right: 0 }, waarde)).toEqual({
      soort: "kolommen",
      rij: 3,
      vanaf: 1,
      tot: 2,
      links: 0,
      rechts: 0,
    });
    expect(autoSom({ top: 1, left: 0, bottom: 2, right: 0 }, waarde)).toMatchObject({
      rij: 3,
      tot: 2,
    });
  });
});

describe("hulpfuncties", () => {
  it("rekent datums om naar seriële getallen", () => {
    expect(serieleDatum(new Date(2026, 9, 26, 12, 0, 0))).toEqual({ datum: 46321, tijd: 0.5 });
    expect(serieleDatum(new Date(1900, 2, 1)).datum).toBe(61);
  });
  it("controleert bladnamen zoals Calc", () => {
    expect(nieuweBladnaam(["Blad 1", "Blad 2"])).toBe("Blad 3");
    expect(nieuweBladnaam(["Materialen"])).toBe("Blad 2");
    expect(bladnaamFout("blad 1", ["Blad 1", "Blad 2"], 1)).toMatch(/al een blad/);
    expect(bladnaamFout("Blad 1", ["Blad 1"], 0)).toBeNull();
    expect(bladnaamFout("a/b", [])).toMatch(/tekens/);
    expect(bladnaamFout("x".repeat(32), [])).toMatch(/31/);
  });
  it("vervangt letterlijk, met of zonder hoofdletters", () => {
    expect(vervangTekst("Stuks en stuks", "stuks", "st.", false)).toBe("st. en st.");
    expect(vervangTekst("Stuks", "stuks", "st.", true)).toBeNull();
    expect(vervangTekst("a.b", ".", "$&", false)).toBe("a$&b");
  });
  it("leest verborgen spans", () => {
    expect(verborgenIndices(["4:6", "9:9"], false)).toEqual([3, 4, 5, 8]);
    expect(verborgenIndices(["C:D"], true)).toEqual([2, 3]);
  });
});
