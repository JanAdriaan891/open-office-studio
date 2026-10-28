import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import { strFromU8, unzipSync, zipSync } from "fflate";
import * as xlsx from "@betteroffice/xlsx";
import { exemplaren, ontleedBereik, papierMaat, papierUitXlsx } from "./model";
import { handoutIndeling, notitieIndeling, verdeelRegels } from "./indeling";
import { indeling, paginaVolgorde, verdeel } from "./rekenbladIndeling";
import {
  kopVoetCode,
  leesAfdrukInstellingen,
  ontleedKopVoet,
  schrijfAfdrukInstellingen,
  vulVelden,
  bladVerwijzing,
  ontleedBereikA1,
} from "./rekenbladInstellingen";

const voorbeeld = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Materiaaloverzicht.xlsx"));

describe("paginabereik en exemplaren", () => {
  it("ontleedt bereiken zoals in het afdrukvenster", () => {
    expect(ontleedBereik("", 3)).toEqual([0, 1, 2]);
    expect(ontleedBereik("1-3, 5", 10)).toEqual([0, 1, 2, 4]);
    expect(ontleedBereik("4-", 6)).toEqual([3, 4, 5]);
    expect(ontleedBereik("2;2", 5)).toEqual([1]);
    expect(ontleedBereik("8-9", 5)).toEqual([]);
    expect(ontleedBereik("a", 5)).toBeNull();
    expect(ontleedBereik("3-1", 5)).toBeNull();
  });
  it("herhaalt pagina's gesorteerd of per pagina", () => {
    expect(exemplaren([0, 1], 2, true)).toEqual([0, 1, 0, 1]);
    expect(exemplaren([0, 1], 2, false)).toEqual([0, 0, 1, 1]);
    expect(exemplaren([0], 0, true)).toEqual([0]);
  });
  it("kent de papierformaten", () => {
    const a4 = papierMaat("A4", "staand");
    expect(Math.round(a4.breedte)).toBe(595);
    expect(Math.round(a4.hoogte)).toBe(842);
    expect(Math.round(papierMaat("A4", "liggend").breedte)).toBe(842);
    expect(papierUitXlsx(9)).toBe("A4");
    expect(papierUitXlsx(1)).toBe("Letter");
    expect(papierUitXlsx(999)).toBe("A4");
  });
});

describe("hand-outs en notitiepagina's", () => {
  const { breedte, hoogte } = papierMaat("A4", "staand");
  it("plaatst 1, 2, 3, 4, 6 en 9 dia's binnen de pagina zonder overlap", () => {
    for (const n of [1, 2, 3, 4, 6, 9] as const) {
      const vakken = handoutIndeling(n, breedte, hoogte, 16 / 9);
      expect(vakken).toHaveLength(n);
      for (const v of vakken) {
        expect(v.dia.x).toBeGreaterThanOrEqual(0);
        expect(v.dia.x + v.dia.breedte).toBeLessThanOrEqual(breedte);
        expect(v.dia.y + v.dia.hoogte).toBeLessThanOrEqual(hoogte);
        expect(v.dia.breedte / v.dia.hoogte).toBeCloseTo(16 / 9, 3);
      }
      for (let i = 1; i < vakken.length; i++)
        expect(
          vakken[i].dia.y >= vakken[i - 1].dia.y + vakken[i - 1].dia.hoogte - 0.01 ||
            vakken[i].dia.x >= vakken[i - 1].dia.x + vakken[i - 1].dia.breedte - 0.01,
        ).toBe(true);
    }
    expect(handoutIndeling(3, breedte, hoogte, 4 / 3).every((v) => v.regels)).toBe(true);
  });
  it("zet de dia boven en de notities eronder", () => {
    const n = notitieIndeling(breedte, hoogte, 16 / 9);
    expect(n.notities.y).toBeGreaterThan(n.dia.y + n.dia.hoogte);
    expect(n.notities.hoogte).toBeGreaterThan(200);
  });
  it("verdeelt lange notities over vervolgpagina's", () => {
    const regels = Array.from({ length: 25 }, (_, i) => `regel ${i}`);
    const delen = verdeelRegels(regels, 10, 8);
    expect(delen.map((d) => d.length)).toEqual([10, 8, 7]);
    expect(verdeelRegels([], 10, 8)).toEqual([[]]);
  });
});

describe("paginering van rekenbladen", () => {
  it("houdt kolommen heel en respecteert handmatige einden", () => {
    expect(verdeel([100, 100, 100, 100], () => 250)).toEqual([
      [0, 2],
      [2, 4],
    ]);
    expect(verdeel([100, 100, 100], () => 1000, new Set([1]))).toEqual([
      [0, 1],
      [1, 3],
    ]);
    // Een kolom breder dan de pagina komt alleen op een pagina.
    expect(verdeel([500, 50], () => 300)).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
  it("verkleint tot passend op één pagina breed", () => {
    const resultaat = indeling({
      kolomBreedtes: Array(10).fill(100),
      rijHoogtes: Array(100).fill(20),
      titelKolommen: null,
      titelRijen: null,
      kopBreedte: 0,
      kopHoogte: 0,
      breedte: 600,
      hoogte: 900,
      schaal: { breed: 1, hoog: 0 },
    });
    expect(resultaat.kolommen).toHaveLength(1);
    expect(resultaat.schaal).toBeLessThanOrEqual(0.6);
    expect(resultaat.rijen.length).toBeGreaterThan(1);
  });
  it("laat ruimte voor herhaalrijen op vervolgpagina's", () => {
    const zonder = indeling({
      kolomBreedtes: [100],
      rijHoogtes: Array(30).fill(20),
      titelKolommen: null,
      titelRijen: null,
      kopBreedte: 0,
      kopHoogte: 0,
      breedte: 600,
      hoogte: 200,
      schaal: 1,
    });
    const met = indeling({
      kolomBreedtes: [100],
      rijHoogtes: Array(30).fill(20),
      titelKolommen: null,
      titelRijen: { hoogte: 40, tot: 1 },
      kopBreedte: 0,
      kopHoogte: 0,
      breedte: 600,
      hoogte: 200,
      schaal: 1,
    });
    expect(zonder.rijen[1]).toEqual([10, 20]);
    expect(met.rijen[1]).toEqual([10, 18]);
  });
  it("kiest de paginavolgorde", () => {
    const i = { schaal: 1, kolommen: [[0, 1], [1, 2]] as [number, number][], rijen: [[0, 5], [5, 9]] as [number, number][] };
    expect(paginaVolgorde(i, "omlaag").map((p) => `${p.kolom[0]}${p.rij[0]}`)).toEqual(["00", "05", "10", "15"]);
    expect(paginaVolgorde(i, "over").map((p) => `${p.kolom[0]}${p.rij[0]}`)).toEqual(["00", "10", "05", "15"]);
  });
});

describe("kop- en voetteksten", () => {
  it("leest velden en laat opmaakcodes weg", () => {
    expect(ontleedKopVoet('&L&"Arial,Bold"&12Links&CPagina &P van &N&R&D')).toEqual({
      links: "Links",
      midden: "Pagina &[Pagina] van &[Pagina's]",
      rechts: "&[Datum]",
    });
    expect(ontleedKopVoet("&CA && B &A")).toEqual({ links: "", midden: "A & B &[Blad]", rechts: "" });
  });
  it("schrijft ze terug en vult ze in", () => {
    const kv = { links: "&[Bestand]", midden: "Blad &[Blad]", rechts: "R&D" };
    expect(kopVoetCode(kv)).toBe("&L&F&CBlad &A&RR&&D");
    expect(ontleedKopVoet(kopVoetCode(kv))).toEqual(kv);
    expect(
      vulVelden("&[Pagina] / &[Pagina's] – &[Blad]", {
        pagina: 2,
        paginas: 5,
        datum: "1-1-2026",
        tijd: "12:00",
        bestand: "a.xlsx",
        blad: "Materialen",
      }),
    ).toBe("2 / 5 – Materialen");
  });
  it("citeert bladnamen alleen waar nodig", () => {
    expect(bladVerwijzing("Materialen")).toBe("Materialen");
    expect(bladVerwijzing("Blad 1")).toBe("'Blad 1'");
    expect(bladVerwijzing("O'Brien")).toBe("'O''Brien'");
    expect(bladVerwijzing("A1")).toBe("'A1'");
    expect(ontleedBereikA1("$B$3:$A$1")).toEqual({ rij1: 0, kol1: 0, rij2: 2, kol2: 1 });
  });
});

describe("pagina-indeling in het XLSX-pakket", () => {
  beforeAll(async () => {
    await xlsx.initWasm(
      readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"),
    );
  });
  it("leest standaardwaarden van een blad zonder instellingen", () => {
    const [inst] = leesAfdrukInstellingen(voorbeeld());
    expect(inst.papier).toBe("A4");
    expect(inst.afdrukbereik).toBeNull();
  });
  it("schrijft en leest alle instellingen terug, en het pakket blijft geldig", () => {
    const bytes = voorbeeld();
    const [oud] = leesAfdrukInstellingen(bytes);
    const nieuw = {
      ...oud,
      papier: "A3" as const,
      stand: "liggend" as const,
      marges: { links: 0.5, rechts: 0.5, boven: 1, onder: 1, kop: 0.4, voet: 0.4 },
      passend: true,
      passendBreed: 1,
      passendHoog: 0,
      rasterlijnen: true,
      koppen: true,
      horizontaalCentreren: true,
      volgorde: "over" as const,
      afdrukbereik: "A1:H20",
      herhaalRijen: "6:6",
      herhaalKolommen: "A:B",
      kop: { links: "", midden: "&[Blad]", rechts: "" },
      voet: { links: "&[Bestand]", midden: "", rechts: "Pagina &[Pagina] van &[Pagina's]" },
      rijEinden: [12],
      kolomEinden: [4],
    };
    const uit = schrijfAfdrukInstellingen(bytes, new Map([[0, nieuw]]));
    const [terug] = leesAfdrukInstellingen(uit);
    expect(terug).toEqual(nieuw);
    const delen = unzipSync(uit);
    const blad = strFromU8(delen["xl/worksheets/sheet1.xml"]);
    // Volgorde volgens het schema: printOptions, pageMargins, pageSetup, headerFooter, rowBreaks, colBreaks.
    const posities = ["<printOptions", "<pageMargins", "<pageSetup", "<headerFooter", "<rowBreaks", "<colBreaks"].map((t) =>
      blad.indexOf(t),
    );
    expect(posities.every((p) => p > 0)).toBe(true);
    expect([...posities].sort((a, b) => a - b)).toEqual(posities);
    expect(blad.indexOf("<sheetPr")).toBeLessThan(blad.indexOf("<sheetData"));
    const werkboek = strFromU8(delen["xl/workbook.xml"]);
    expect(werkboek).toContain(`<definedName name="_xlnm.Print_Area" localSheetId="0">Materialen!$A$1:$H$20</definedName>`);
    expect(werkboek).toContain("Materialen!$A:$B,Materialen!$6:$6");
    expect(werkboek).toContain("_xlnm._FilterDatabase");
    // De engine opent het resultaat en behoudt de instellingen bij opslaan.
    const boek = xlsx.openWorkbook(uit);
    const opnieuw = boek.save();
    boek.dispose();
    const [behouden] = leesAfdrukInstellingen(opnieuw);
    expect(behouden.afdrukbereik).toBe("A1:H20");
    expect(behouden.papier).toBe("A3");
  });
  it("laat ongewijzigde onderdelen en kop/voet-opmaak staan", () => {
    const bytes = voorbeeld();
    const [oud] = leesAfdrukInstellingen(bytes);
    const eerste = schrijfAfdrukInstellingen(
      bytes,
      new Map([[0, { ...oud, voet: { links: "", midden: "x", rechts: "" } }]]),
    );
    const blad1 = strFromU8(unzipSync(eerste)["xl/worksheets/sheet1.xml"]).replace(
      "<oddFooter>&amp;Cx</oddFooter>",
      '<oddFooter>&amp;C&amp;"Arial,Bold"x</oddFooter>',
    );
    const z = unzipSync(eerste);
    z["xl/worksheets/sheet1.xml"] = new TextEncoder().encode(blad1);
    const metOpmaak = zipSync(z);
    const [inst] = leesAfdrukInstellingen(metOpmaak);
    const tweede = schrijfAfdrukInstellingen(metOpmaak, new Map([[0, { ...inst, rasterlijnen: true }]]));
    const blad2 = strFromU8(unzipSync(tweede)["xl/worksheets/sheet1.xml"]);
    expect(blad2).toContain('&amp;"Arial,Bold"x');
    expect(strFromU8(unzipSync(tweede)["xl/styles.xml"])).toBe(strFromU8(unzipSync(bytes)["xl/styles.xml"]));
  });
  it("wist het afdrukbereik weer", () => {
    const bytes = voorbeeld();
    const [oud] = leesAfdrukInstellingen(bytes);
    const met = schrijfAfdrukInstellingen(bytes, new Map([[0, { ...oud, afdrukbereik: "B2:C3" }]]));
    const zonder = schrijfAfdrukInstellingen(met, new Map([[0, { ...oud, afdrukbereik: null }]]));
    expect(leesAfdrukInstellingen(zonder)[0].afdrukbereik).toBeNull();
    expect(strFromU8(unzipSync(zonder)["xl/workbook.xml"])).not.toContain("Print_Area");
  });
});

describe("tekstlaag: losse tekens samenvoegen", () => {
  it("maakt woorden van teken-voor-teken getekende tekst en houdt spaties", async () => {
    const { voegTekensSamen } = await import("./tekstopname");
    const teken = (tekst: string, x: number, y = 100) => ({ tekst, x, y, grootte: 20, breedte: 10 });
    const uit = voegTekensSamen([
      teken("R", 0),
      teken("u", 10),
      teken("i", 20.5),
      teken("m", 30),
      teken("t", 50), // gat van een spatie
      teken("e", 60),
      teken("Volgende regel", 0, 130),
    ]);
    expect(uit.map((t) => t.tekst)).toEqual(["Ruim te", "Volgende regel"]);
    expect(uit[0].breedte).toBe(70);
  });
  it("laat gewone tekststukken met rust", async () => {
    const { voegTekensSamen } = await import("./tekstopname");
    const stuk = (tekst: string, x: number) => ({ tekst, x, y: 50, grootte: 12, breedte: 60 });
    expect(voegTekensSamen([stuk("Eerste stuk", 0), stuk("tweede stuk", 64)]).length).toBe(2);
  });
});
