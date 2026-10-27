import { describe, expect, it } from "vitest";
import type { VeldSchema } from "../werkkopie/contract.ts";
import {
  bereikVan,
  breidUit,
  celSelectie,
  inBereik,
  klembordTekst,
  kolomBreedte,
  leesTsv,
  maakPlakPlan,
  metKoppenStandaard,
  naarHtml,
  naarTsv,
  scrollVoorRij,
  selecteerAlles,
  selecteerKolom,
  selecteerRij,
  statistiek,
  statistiekTekst,
  zichtbareRijen,
  type PlakKolom,
} from "./raster-logica.ts";

const veld = (naam: string, soort: VeldSchema["soort"], extra: Partial<VeldSchema> = {}): VeldSchema =>
  ({ naam, soort, verplicht: false, primair: false, ...extra }) as VeldSchema;

describe("selectie", () => {
  it("bereik van cellen, in beide richtingen", () => {
    const s = breidUit(celSelectie({ rij: 5, kolom: 3 }), { rij: 2, kolom: 1 });
    expect(bereikVan(s, 100, 10)).toEqual({ r0: 2, r1: 5, c0: 1, c1: 3 });
    expect(inBereik(bereikVan(s, 100, 10), 3, 2)).toBe(true);
    expect(inBereik(bereikVan(s, 100, 10), 6, 2)).toBe(false);
  });
  it("hele kolommen, rijen en alles", () => {
    let s = selecteerKolom(celSelectie({ rij: 4, kolom: 0 }), 2, false);
    expect(bereikVan(s, 50, 6)).toEqual({ r0: 0, r1: 49, c0: 2, c1: 2 });
    s = selecteerKolom(s, 4, true);
    expect(bereikVan(s, 50, 6)).toEqual({ r0: 0, r1: 49, c0: 2, c1: 4 });
    let r = selecteerRij(s, 7, false);
    r = selecteerRij(r, 9, true);
    expect(bereikVan(r, 50, 6)).toEqual({ r0: 7, r1: 9, c0: 0, c1: 5 });
    const a = selecteerAlles(r);
    expect(bereikVan(a, 50, 6)).toEqual({ r0: 0, r1: 49, c0: 0, c1: 5 });
    expect(metKoppenStandaard(a)).toBe(true);
    expect(metKoppenStandaard(celSelectie({ rij: 0, kolom: 0 }))).toBe(false);
  });
  it("Shift na Ctrl+A wordt weer een celbereik", () => {
    const s = breidUit(selecteerAlles(celSelectie({ rij: 3, kolom: 1 })), { rij: 4, kolom: 2 });
    expect(s.modus).toBe("cellen");
  });
});

describe("statistiek", () => {
  it("telt niet-lege cellen en somt numerieke kolommen", () => {
    const s = statistiek(
      [
        [1, "a", 2.5],
        [3, null, 4],
        [null, "b", "x"],
      ],
      ["geheel", "tekst", "getal"],
    );
    expect(s).toEqual({ aantal: 7, getallen: 4, som: 10.5, gemiddelde: 2.625 });
    expect(statistiekTekst(s)).toBe("Aantal: 7 · Som: 10,5 · Gemiddelde: 2,625");
    expect(statistiekTekst(statistiek([["a"]], ["tekst"]))).toBe("Aantal: 1");
  });
});

describe("kopiëren", () => {
  it("TSV met Nederlandse notatie en kolomkoppen", () => {
    const t = naarTsv(["Code", "Prijs", "Datum", "Ok"], [["A1", 1234.5, "2026-10-26T14:30:00", true]], ["tekst", "getal", "datum", "jaNee"]);
    expect(t).toBe("Code\tPrijs\tDatum\tOk\r\nA1\t1234,5\t26-10-2026 14:30\tJa\r\n");
  });
  it("escapet tabs, regeleinden en aanhalingstekens", () => {
    const t = naarTsv(null, [['a\tb', 'regel1\nregel2', 'zei "hoi"', "gewoon"]], ["tekst", "memo", "tekst", "tekst"]);
    expect(t).toBe('"a\tb"\t"regel1\nregel2"\t"zei ""hoi"""\tgewoon\r\n');
    expect(leesTsv(t)).toEqual([["a\tb", "regel1\nregel2", 'zei "hoi"', "gewoon"]]);
  });
  it("beschermt tegen formules in tekst, niet in getallen", () => {
    expect(klembordTekst("=SOM(A1)", "tekst")).toBe("'=SOM(A1)");
    expect(klembordTekst("-abc", "tekst")).toBe("'-abc");
    expect(klembordTekst("-12", "tekst")).toBe("-12");
    expect(klembordTekst(-12.5, "getal")).toBe("-12,5");
    expect(klembordTekst(12.5, "valuta")).toBe("12,50");
  });
  it("HTML-tabel met escapes en rechts uitgelijnde getallen", () => {
    const h = naarHtml(["<Naam>"], [["a & b"], ["x\ny"]], ["tekst"]);
    expect(h).toContain("<th>&lt;Naam&gt;</th>");
    expect(h).toContain("<td>a &amp; b</td>");
    expect(h).toContain("<td>x<br>y</td>");
    expect(naarHtml(null, [[5]], ["geheel"])).toContain('<td style="text-align:right">5</td>');
  });
});

describe("plakken", () => {
  const kolommen: PlakKolom[] = [
    { naam: "ID", soort: "autonummer" },
    { naam: "Naam", soort: "tekst", veld: veld("Naam", "tekst", { lengte: 5 }) },
    { naam: "Aantal", soort: "geheel", veld: veld("Aantal", "geheel") },
    { naam: "Datum", soort: "datum", veld: veld("Datum", "datum") },
  ];
  it("leest TSV uit een rekenblad (CRLF, laatste lege regel)", () => {
    expect(leesTsv("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(leesTsv("x")).toEqual([["x"]]);
  });
  it("controleert het type per cel en meldt de plek", () => {
    const p = maakPlakPlan(leesTsv("Jan\t3\t26-10-2026\r\nPietje\tveel\t31-02-2026\r\n"), { rij: 0, kolom: 1 }, kolommen, 10, { kanToevoegen: false });
    expect(p.wijzigingen).toEqual([
      { rij: 0, kolom: 1, waarde: "Jan" },
      { rij: 0, kolom: 2, waarde: 3 },
      { rij: 0, kolom: 3, waarde: "2026-10-26" },
    ]);
    expect(p.fouten.map((f) => [f.rij, f.kolomnaam])).toEqual([
      [1, "Naam"],
      [1, "Aantal"],
      [1, "Datum"],
    ]);
  });
  it("slaat niet-bewerkbare kolommen over en voegt rijen onderaan toe", () => {
    const p = maakPlakPlan(leesTsv("7\tAnna\t1\r\n8\tBob\t2\r\n"), { rij: 1, kolom: 0 }, kolommen, 2, { kanToevoegen: true });
    expect(p.wijzigingen).toEqual([
      { rij: 1, kolom: 1, waarde: "Anna" },
      { rij: 1, kolom: 2, waarde: 1 },
    ]);
    expect(p.nieuweRijen).toEqual([{ Naam: "Bob", Aantal: 2 }]);
    expect(p.waarschuwingen[0]).toMatch(/ID/);
  });
  it("weigert rijen buiten een resultaat waar niets bij kan", () => {
    const p = maakPlakPlan([["a"], ["b"]], { rij: 1, kolom: 1 }, kolommen, 2, { kanToevoegen: false });
    expect(p.wijzigingen).toHaveLength(1);
    expect(p.waarschuwingen.join(" ")).toMatch(/onder het einde/);
  });
  it("Delete over een bereik maakt de bewerkbare cellen leeg", () => {
    const p = maakPlakPlan([[""]], { rij: 0, kolom: 0 }, kolommen, 10, { kanToevoegen: false, doel: { r0: 1, r1: 2, c0: 0, c1: 2 } });
    expect(p.wijzigingen).toEqual([
      { rij: 1, kolom: 1, waarde: null },
      { rij: 1, kolom: 2, waarde: null },
      { rij: 2, kolom: 1, waarde: null },
      { rij: 2, kolom: 2, waarde: null },
    ]);
  });
  it("vult een geselecteerd bereik met één waarde", () => {
    const p = maakPlakPlan([["4"]], { rij: 0, kolom: 2 }, kolommen, 10, { kanToevoegen: false, doel: { r0: 2, r1: 4, c0: 2, c1: 2 } });
    expect(p.wijzigingen.map((w) => w.rij)).toEqual([2, 3, 4]);
    expect(p.wijzigingen.every((w) => w.waarde === 4)).toBe(true);
  });
});

describe("virtualisatie", () => {
  it("rendert alleen het zichtbare deel met buffer", () => {
    expect(zichtbareRijen({ scrollTop: 0, hoogte: 300, rijhoogte: 30, totaal: 8106, kop: 40, buffer: 5 })).toEqual({ van: 0, tot: 15 });
    expect(zichtbareRijen({ scrollTop: 30_040, hoogte: 300, rijhoogte: 30, totaal: 8106, kop: 40, buffer: 5 })).toEqual({ van: 995, tot: 1015 });
    expect(zichtbareRijen({ scrollTop: 10_000_000, hoogte: 300, rijhoogte: 30, totaal: 100, buffer: 5 })).toEqual({ van: 100, tot: 100 });
    expect(zichtbareRijen({ scrollTop: 0, hoogte: 300, rijhoogte: 30, totaal: 3 })).toEqual({ van: 0, tot: 3 });
  });
  it("scrolt alleen als de rij buiten beeld is", () => {
    expect(scrollVoorRij({ rij: 2, scrollTop: 0, hoogte: 340, rijhoogte: 30, kop: 40 })).toBeNull();
    expect(scrollVoorRij({ rij: 20, scrollTop: 0, hoogte: 340, rijhoogte: 30, kop: 40 })).toBe(330);
    expect(scrollVoorRij({ rij: 1, scrollTop: 300, hoogte: 340, rijhoogte: 30, kop: 40 })).toBe(30);
  });
  it("kolombreedte tussen grenzen", () => {
    expect(kolomBreedte("ID", "geheel", [1, 2])).toBeGreaterThanOrEqual(72);
    expect(kolomBreedte("Omschrijving", "memo", ["x".repeat(500)])).toBe(360);
  });
});
