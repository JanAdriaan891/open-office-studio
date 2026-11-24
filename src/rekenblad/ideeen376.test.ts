import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { invoegOp, leesAantal, maxInvoegen } from "./aantalInvoegen";
import { doelCellen, doortrekDoel, leesDoel } from "./doortrekken";
import { formuleOpEenRegel, formuleOpRegels } from "./formuleOpmaak";
import { bronGroei, filterKeuzes, groeiAantal, groeiOp } from "./keuzelijst";
import {
  installeerValidatie,
  leesValidaties,
  lijstWaarden,
  nieuweValidatie,
  schrijfValidatie,
  validaties,
} from "./gegevensvalidatie";
import { metValidatieAnkers, namenAlle } from "./validatieAnkers";

const sjabloon = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
const invoer = (h: ReturnType<typeof openWorkbook>, rij: number, kolom: number) => h.cell(0, rij, kolom).input;

describe("aantal rijen of kolommen invoegen (#376)", () => {
  const bereik = { top: 2, bottom: 3, left: 1, right: 4 };
  it("leest alleen hele aantallen binnen het blad", () => {
    expect(leesAantal(" 25 ", "rij")).toBe(25);
    expect(leesAantal("0", "rij")).toBeNull();
    expect(leesAantal("2,5", "rij")).toBeNull();
    expect(leesAantal("-3", "kolom")).toBeNull();
    expect(leesAantal("", "kolom")).toBeNull();
    expect(leesAantal(String(maxInvoegen("kolom")), "kolom")).toBe(16383);
    expect(leesAantal("16384", "kolom")).toBeNull();
    expect(leesAantal("16384", "rij")).toBe(16384);
  });
  it("plaatst voor of na de selectie, los van de grootte van de selectie", () => {
    expect(invoegOp(0, bereik, "rij", "voor", 7)).toEqual({ type: "insertRows", sheet: 0, at: 2, count: 7 });
    expect(invoegOp(0, bereik, "rij", "na", 7)).toEqual({ type: "insertRows", sheet: 0, at: 4, count: 7 });
    expect(invoegOp(1, bereik, "kolom", "voor", 3)).toEqual({ type: "insertCols", sheet: 1, at: 1, count: 3 });
    expect(invoegOp(1, bereik, "kolom", "na", 3)).toEqual({ type: "insertCols", sheet: 1, at: 5, count: 3 });
  });
  it("voegt in de kern N rijen in één ongedaan-maakstap in en schuift formules mee", () => {
    const h = openWorkbook(sjabloon);
    try {
      h.editCells(0, [
        { row: 0, col: 0, input: "1" },
        { row: 1, col: 0, input: "2" },
        { row: 2, col: 0, input: "=SUM(A1:A2)" },
      ]);
      h.applyOps([invoegOp(0, { top: 1, bottom: 1, left: 0, right: 0 }, "rij", "voor", 25)]);
      expect(invoer(h, 1, 0)).toBe("");
      expect(invoer(h, 26, 0)).toBe("2");
      expect(invoer(h, 27, 0)).toBe("=SUM(A1:A27)");
      h.undo();
      expect(invoer(h, 2, 0)).toBe("=SUM(A1:A2)");
      h.applyOps([invoegOp(0, { top: 0, bottom: 0, left: 0, right: 0 }, "kolom", "na", 4)]);
      h.editCell(0, 0, 5, "x");
      h.applyOps([invoegOp(0, { top: 0, bottom: 0, left: 0, right: 0 }, "kolom", "na", 2)]);
      expect(invoer(h, 0, 7)).toBe("x");
    } finally {
      h.dispose();
    }
  });
});

describe("doortrekken tot cel (#376)", () => {
  const bron = { top: 1, bottom: 2, left: 1, right: 2 }; // B2:C3
  it("leest een cel, een rijnummer of een kolomletter", () => {
    expect(leesDoel("b500", bron)).toEqual({ row: 499, col: 1 });
    expect(leesDoel("$B$500", bron)).toEqual({ row: 499, col: 1 });
    expect(leesDoel("500", bron)).toEqual({ row: 499, col: 2 });
    expect(leesDoel("h", bron)).toEqual({ row: 2, col: 7 });
    expect(leesDoel("0", bron)).toBeNull();
    expect(leesDoel("1048577", bron)).toBeNull();
    expect(leesDoel("XFE", bron)).toBeNull();
    expect(leesDoel("B2:C3", bron)).toBeNull();
    expect(leesDoel("iets anders", bron)).toBeNull();
  });
  it("kiest richting en doelbereik zoals slepen met de vulgreep", () => {
    expect(doortrekDoel(bron, { row: 499, col: 1 })).toEqual({
      richting: "omlaag",
      aantal: 497,
      doel: { top: 3, bottom: 499, left: 1, right: 2 },
    });
    expect(doortrekDoel(bron, { row: 0, col: 2 })).toEqual({
      richting: "omhoog",
      aantal: 1,
      doel: { top: 0, bottom: 0, left: 1, right: 2 },
    });
    expect(doortrekDoel(bron, { row: 2, col: 7 })).toEqual({
      richting: "rechts",
      aantal: 5,
      doel: { top: 1, bottom: 2, left: 3, right: 7 },
    });
    expect(doortrekDoel(bron, { row: 1, col: 0 })).toEqual({
      richting: "links",
      aantal: 1,
      doel: { top: 1, bottom: 2, left: 0, right: 0 },
    });
    expect(doortrekDoel(bron, { row: 2, col: 2 })).toBeNull();
    // Gelijke afstand: verticaal wint, net als de vulgreep.
    expect(doortrekDoel(bron, { row: 5, col: 5 })?.richting).toBe("omlaag");
    expect(doelCellen(doortrekDoel(bron, { row: 499, col: 1 })!)).toBe(994);
  });
});

describe("formule over meerdere regels (#376)", () => {
  const lang = '=IF(A1>10,SUMIFS(B:B,C:C,"a,b;(c)",D:D,">"&E1),VLOOKUP(A1,Blad2!A:C,3,FALSE))';
  it("zet argumenten van geneste of lange aanroepen op eigen regels", () => {
    expect(formuleOpRegels(lang)).toBe(
      [
        "=IF(",
        "  A1>10,",
        '  SUMIFS(B:B,C:C,"a,b;(c)",D:D,">"&E1),',
        "  VLOOKUP(A1,Blad2!A:C,3,FALSE)",
        ")",
      ].join("\n"),
    );
  });
  it("laat korte aanroepen, tekst, bladnamen en matrixconstanten met rust", () => {
    expect(formuleOpRegels("=SUM(A1,B1)")).toBe("=SUM(A1,B1)");
    expect(formuleOpRegels("geen formule (a, b)")).toBe("geen formule (a, b)");
    expect(formuleOpRegels("='Blad (1), a'!A1+SUM({1,2;3,4})")).toBe("='Blad (1), a'!A1+SUM({1,2;3,4})");
    // Een komma tussen cijfers kan een decimaalteken zijn en splitst nooit.
    expect(formuleOpRegels("=ROUND(SUM(A1:A9)*1,21;2)")).toBe("=ROUND(\n  SUM(A1:A9)*1,21;\n  2\n)");
    // Lang maar niet genest: ook dan elk argument op een eigen regel.
    expect(formuleOpRegels('=SUMIFS(Bedrag,Regio,"Noord, Oost",Jaar,2026,Maand,">6")')).toBe(
      '=SUMIFS(\n  Bedrag,\n  Regio,\n  "Noord, Oost",\n  Jaar,\n  2026,\n  Maand,\n  ">6"\n)',
    );
    // Onvolledige formule tijdens het typen: niets kwijtraken.
    expect(formuleOpRegels("=IF(A1,SUM(B1")).toBe("=IF(A1,SUM(B1");
  });
  it("gaat verliesloos terug naar één regel", () => {
    expect(formuleOpEenRegel(formuleOpRegels(lang))).toBe(lang);
    expect(formuleOpEenRegel('=A1&"regel 1\nregel 2"')).toBe('=A1&"regel 1\nregel 2"');
    expect(formuleOpEenRegel("=A1:B2\nB1:C3")).toBe("=A1:B2 B1:C3");
    expect(formuleOpEenRegel("=SUM( A1 , B1 )")).toBe("=SUM( A1 , B1 )");
    expect(formuleOpRegels(formuleOpRegels(lang))).toBe(formuleOpRegels(lang));
  });
  it("de kern rekent met een formule over meerdere regels en bewaart de regeleinden", () => {
    let h = openWorkbook(sjabloon);
    try {
      h.editCells(0, [
        { row: 0, col: 0, input: "12" },
        { row: 0, col: 1, input: "5" },
      ]);
      const formule = formuleOpRegels('=IF(A1>10,SUM(A1,B1,ROUND(B1/2,0)),"klein")');
      expect(formule.split("\n").length).toBeGreaterThan(3);
      h.editCell(0, 0, 3, formule);
      const waarde = () => {
        const r = h.readCells({ ranges: [{ sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1: "D1" } }] });
        if (!r.ok) throw new Error(r.failure.message);
        return r.ranges[0].cells[0][0].value;
      };
      expect(h.cell(0, 0, 3)).toMatchObject({ input: formule, isFormula: true });
      expect(waarde()).toEqual({ kind: "number", value: 20 });
      const bytes = h.save();
      h.dispose();
      h = openWorkbook(bytes);
      expect(h.cell(0, 0, 3)).toMatchObject({ input: formule, isFormula: true });
      expect(waarde()).toEqual({ kind: "number", value: 20 });
    } finally {
      h.dispose();
    }
  });
});

describe("doorzoekbare keuzelijst met meegroeiende bron (#376)", () => {
  const opties = ["Amsterdam", "Rotterdam", "Den Haag", "Édam", "Zaandam", ""].map((tekst) => ({ tekst }));
  const namen = (zoek: string) => filterKeuzes(opties, zoek).map((o) => o.tekst);
  it("filtert zonder op hoofdletters of accenten te letten, begin-treffers eerst", () => {
    expect(namen("")).toEqual(opties.map((o) => o.tekst));
    expect(namen("dam")).toEqual(["Amsterdam", "Rotterdam", "Édam", "Zaandam"]);
    expect(namen("eda")).toEqual(["Édam"]);
    expect(namen("DEN ha")).toEqual(["Den Haag"]);
    expect(namen("a")).toEqual(["Amsterdam", "Rotterdam", "Den Haag", "Édam", "Zaandam"]);
    expect(namen("r dam")).toEqual(["Rotterdam", "Amsterdam"]);
    expect(namen("xyz")).toEqual([]);
  });
  it("telt aaneengesloten waarden na een bron van één kolom of één rij", () => {
    const gevuld = (rijen: number[]) => (row: number, col: number) => col === 0 && rijen.includes(row);
    expect(groeiAantal({ top: 0, bottom: 2, left: 0, right: 0 }, gevuld([3, 4, 6]))).toBe(2);
    expect(groeiAantal({ top: 0, bottom: 2, left: 0, right: 0 }, gevuld([4]))).toBe(0);
    expect(groeiAantal({ top: 0, bottom: 2, left: 0, right: 1 }, () => true)).toBe(0);
    expect(groeiAantal({ top: 0, bottom: 0, left: 0, right: 2 }, (r, c) => r === 0 && c <= 4)).toBe(2);
    expect(groeiAantal({ top: 0, bottom: 2, left: 0, right: 0 }, () => true, 50)).toBe(50);
  });
  function boek(formule1: string) {
    const bytes = schrijfValidatie(sjabloon, 0, null, { ...nieuweValidatie("C1:C9"), type: "list", formule1 });
    const h = openWorkbook(metValidatieAnkers(bytes));
    installeerValidatie(h, bytes);
    return h;
  }
  it("breidt de bron uit via het anker: één ongedaan-maakstap, bewaard in het bestand", () => {
    const h = boek("$A$1:$A$3");
    try {
      h.editCells(0, ["rood", "groen", "blauw"].map((input, row) => ({ row, col: 0, input })));
      const regel = validaties(h)[0][0];
      expect(bronGroei(h, 0, regel.formule1)).toBeNull();
      h.editCells(0, [
        { row: 3, col: 0, input: "geel" },
        { row: 4, col: 0, input: "paars" },
        { row: 6, col: 0, input: "los" },
      ]);
      const groei = bronGroei(h, 0, regel.formule1)!;
      expect(groei).toMatchObject({ blad: 0, aantal: 2, formule: "$A$1:$A$5" });
      const op = groeiOp(namenAlle(h), 0, 0, regel.formule1, groei)!;
      expect(op).toMatchObject({ type: "setDefinedName", refers_to: "$A$1:$A$5", scope: 0, hidden: true });
      h.applyOps([op]);
      expect(leesValidaties(h.save())[0][0].formule1).toBe("$A$1:$A$5");
      expect(lijstWaarden(h, 0, "$A$1:$A$5")).toEqual(["rood", "groen", "blauw", "geel", "paars"]);
      expect(bronGroei(h, 0, "$A$1:$A$5")).toBeNull();
      h.undo();
      expect(leesValidaties(h.save())[0][0].formule1).toBe("$A$1:$A$3");
      expect(validaties(h)[0][0].formule1).toBe("$A$1:$A$3");
    } finally {
      h.dispose();
    }
  });
  it("groeit niet bij een vaste lijst, een naam of een anker dat niet bij de bron hoort", () => {
    const h = boek('"ja,nee"');
    try {
      h.editCell(0, 0, 0, "x");
      expect(bronGroei(h, 0, '"ja,nee"')).toBeNull();
      expect(bronGroei(h, 0, "Kleuren")).toBeNull();
      expect(bronGroei(h, 0, "Onbekend!$A$1:$A$3")).toBeNull();
      const groei = { blad: 0, bereik: { top: 0, bottom: 4, left: 0, right: 0 }, aantal: 2, formule: "$A$1:$A$5" };
      expect(groeiOp(namenAlle(h), 0, 0, "$A$1:$A$3", groei)).toBeNull();
      expect(groeiOp(namenAlle(h), 0, 3, '"ja,nee"', groei)).toBeNull();
    } finally {
      h.dispose();
    }
  });
  it("behoudt de bladnaam in de uitgebreide bron", () => {
    const h = openWorkbook(sjabloon);
    try {
      const naam = h.sheetInfo().sheetNames[0];
      h.editCells(0, [
        { row: 0, col: 4, input: "a" },
        { row: 1, col: 4, input: "b" },
      ]);
      expect(bronGroei(h, 0, `'${naam}'!$E$1`)?.formule).toBe(`'${naam}'!$E$1:$E$2`);
    } finally {
      h.dispose();
    }
  });
});
