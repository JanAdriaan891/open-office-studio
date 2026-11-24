import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Pakket } from "../grafieken/pakket";
import { MAX_KOLOMMEN, MAX_RIJEN } from "../lint/rekenblad-logica";
import {
  BEGINRASTER,
  EIGENSCHAP,
  begrensSelectie,
  buitenRaster,
  keuzeNaarTekst,
  keuzeUitTekst,
  leesRasterKeuze,
  meegroeien,
  normaliseerMarge,
  omvangMetCel,
  passendeOmvang,
  schrijfRasterKeuze,
  sleepAantal,
  verenig,
  vergroot,
} from "./begrensdRaster";

const bron = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
const cel = (row: number, col: number) => ({ row, col });
const sel = (a: [number, number], f: [number, number]) => ({ anchor: cel(...a), focus: cel(...f) });

describe("omvang van het begrensde raster", () => {
  it("geeft een leeg blad het beginraster", () => {
    expect(passendeOmvang(null)).toEqual(BEGINRASTER);
  });
  it("telt de marge bij het gebruikte bereik en houdt het beginraster als ondergrens", () => {
    expect(passendeOmvang({ top: 0, left: 0, bottom: 39, right: 11 })).toEqual({ rijen: 45, kolommen: 15 });
    expect(passendeOmvang({ top: 2, left: 1, bottom: 2, right: 1 })).toEqual(BEGINRASTER);
    expect(passendeOmvang({ top: 0, left: 0, bottom: 39, right: 11 }, { rijen: 0, kolommen: 0 })).toEqual({
      rijen: 40,
      kolommen: 12,
    });
  });
  it("blijft binnen de grenzen van het XLSX-blad", () => {
    expect(passendeOmvang({ top: 0, left: 0, bottom: MAX_RIJEN - 1, right: MAX_KOLOMMEN - 1 })).toEqual({
      rijen: MAX_RIJEN,
      kolommen: MAX_KOLOMMEN,
    });
  });
  it("groeit mee met typen in de laatste rij of kolom en krimpt nooit vanzelf", () => {
    const begin = meegroeien(null, null);
    const naTypen = meegroeien(begin, { top: 19, left: 7, bottom: 19, right: 7 });
    expect(naTypen).toEqual({ rijen: 25, kolommen: 11 });
    expect(meegroeien(naTypen, null)).toEqual(naTypen);
    expect(meegroeien(naTypen, { top: 0, left: 0, bottom: 3, right: 3 })).toEqual(naTypen);
  });
  it("voegt rijen en kolommen toe via de groeistroken", () => {
    expect(vergroot(BEGINRASTER, { rijen: 1 })).toEqual({ rijen: 21, kolommen: 8 });
    expect(vergroot(BEGINRASTER, { kolommen: 5 })).toEqual({ rijen: 20, kolommen: 13 });
    expect(vergroot({ rijen: MAX_RIJEN, kolommen: 8 }, { rijen: 10 }).rijen).toBe(MAX_RIJEN);
    expect(vergroot(BEGINRASTER, { rijen: -4 })).toEqual(BEGINRASTER);
  });
  it("rekent een sleepafstand om naar een aantal sporen", () => {
    expect(sleepAantal(0, 20)).toBe(1);
    expect(sleepAantal(19, 20)).toBe(1);
    expect(sleepAantal(20, 20)).toBe(2);
    expect(sleepAantal(105, 20)).toBe(6);
    expect(sleepAantal(-50, 20)).toBe(1);
    expect(sleepAantal(1e9, 20)).toBe(500);
  });
  it("breidt uit tot een cel waar Ga naar of het naamvak heen wil", () => {
    expect(omvangMetCel(BEGINRASTER, cel(3, 3))).toEqual(BEGINRASTER);
    expect(omvangMetCel(BEGINRASTER, cel(299, 51))).toEqual({ rijen: 305, kolommen: 55 });
    expect(omvangMetCel(BEGINRASTER, cel(299, 2))).toEqual({ rijen: 305, kolommen: 8 });
  });
  it("verenigt bereiken van gegevens, objecten en afdrukbereik", () => {
    expect(verenig([null, undefined])).toBeNull();
    expect(
      verenig([{ top: 2, left: 2, bottom: 5, right: 4 }, null, { top: 0, left: 3, bottom: 3, right: 9 }]),
    ).toEqual({ top: 0, left: 2, bottom: 5, right: 9 });
  });
  it("normaliseert de marge uit de instellingen", () => {
    expect(normaliseerMarge(undefined)).toEqual({ rijen: 5, kolommen: 3 });
    expect(normaliseerMarge({ rijen: -3, kolommen: 900 })).toEqual({ rijen: 0, kolommen: 50 });
    expect(normaliseerMarge({ rijen: "x", kolommen: 2.4 })).toEqual({ rijen: 5, kolommen: 2 });
  });
});

describe("selectie binnen het begrensde raster", () => {
  const omvang = { rijen: 20, kolommen: 8 };
  it("laat een selectie binnen het raster met rust", () => {
    expect(begrensSelectie(sel([0, 0], [19, 7]), omvang)).toBeNull();
    expect(buitenRaster(sel([3, 3], [3, 3]), omvang)).toBeNull();
  });
  it("zet Ctrl+pijl en Shift+Ctrl+pijl terug op de rand", () => {
    expect(begrensSelectie(sel([MAX_RIJEN - 1, 2], [MAX_RIJEN - 1, 2]), omvang)).toEqual(sel([19, 2], [19, 2]));
    expect(begrensSelectie(sel([4, 2], [MAX_RIJEN - 1, 2]), omvang)).toEqual(sel([4, 2], [19, 2]));
    expect(begrensSelectie(sel([4, 2], [4, MAX_KOLOMMEN - 1]), omvang)).toEqual(sel([4, 2], [4, 7]));
    expect(begrensSelectie(sel([20, 8], [20, 8]), omvang)).toEqual(sel([19, 7], [19, 7]));
  });
  it("behoudt hele kolommen, hele rijen en alles selecteren", () => {
    expect(begrensSelectie(sel([MAX_RIJEN - 1, 3], [0, 2]), omvang)).toBeNull();
    expect(begrensSelectie(sel([4, MAX_KOLOMMEN - 1], [2, 0]), omvang)).toBeNull();
    expect(begrensSelectie(sel([MAX_RIJEN - 1, MAX_KOLOMMEN - 1], [0, 0]), omvang)).toBeNull();
    // Een hele kolom buiten het raster schuift wel terug, en blijft een hele kolom.
    expect(begrensSelectie(sel([MAX_RIJEN - 1, 30], [0, 30]), omvang)).toEqual(sel([MAX_RIJEN - 1, 7], [0, 7]));
  });
});

describe("weergavekeuze in het bestand", () => {
  const keuze = { bladen: [{ naam: "Blad 1", rijen: 25, kolommen: 11 }], onbeperkt: ["Blad 2"] };
  it("leest terug wat is geschreven en negeert beschadigde tekst", () => {
    expect(keuzeUitTekst(keuzeNaarTekst(keuze))).toEqual(keuze);
    expect(keuzeUitTekst(keuzeNaarTekst({ bladen: [], onbeperkt: [] }))).toEqual({ bladen: [], onbeperkt: [] });
    expect(keuzeUitTekst("")).toBeNull();
    expect(keuzeUitTekst("{")).toBeNull();
    expect(keuzeUitTekst('{"v":2,"sheets":[]}')).toBeNull();
    expect(keuzeUitTekst('{"v":1,"sheets":[{"name":"A","rows":-5,"columns":1e9},{"name":"a"},{"rows":3}]}')).toEqual({
      bladen: [{ naam: "A", rijen: 1, kolommen: MAX_KOLOMMEN }],
      onbeperkt: [],
    });
    // Een blad staat in één lijst; begrensd gaat voor.
    expect(keuzeUitTekst('{"v":1,"sheets":[{"name":"A","rows":20,"columns":8}],"unlimited":["a","B","b",7]}')).toEqual({
      bladen: [{ naam: "A", rijen: 20, kolommen: 8 }],
      onbeperkt: ["B"],
    });
  });
  it("laat een bestand zonder keuze byte-gelijk", () => {
    expect(schrijfRasterKeuze(bron, null)).toBe(bron);
    // Een keuze zonder begrensde bladen is wel een keuze: bewust onbeperkt.
    const onbeperkt = { bladen: [], onbeperkt: ["Blad 1"] };
    expect(leesRasterKeuze(schrijfRasterKeuze(bron, onbeperkt))).toEqual(onbeperkt);
    expect(leesRasterKeuze(bron)).toBeNull();
  });
  it("schrijft alleen een documenteigenschap en raakt geen werkblad aan", () => {
    const uit = schrijfRasterKeuze(bron, keuze);
    expect(leesRasterKeuze(uit)).toEqual(keuze);
    const voor = new Pakket(bron);
    const na = new Pakket(uit);
    const gewijzigd = na
      .namen()
      .filter((n) => !voor.heeft(n) || Buffer.compare(Buffer.from(voor.bytes(n)!), Buffer.from(na.bytes(n)!)) !== 0);
    expect(gewijzigd.sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "docProps/custom.xml"]);
    expect(voor.namen().every((n) => na.heeft(n))).toBe(true);
    expect(na.lees("[Content_Types].xml")).toContain("custom-properties+xml");
    expect(na.relaties("").some((r) => r.target === "docProps/custom.xml")).toBe(true);
    expect(na.lees("docProps/custom.xml")).toContain(`name="${EIGENSCHAP}"`);
    // Een tweede keer dezelfde keuze verandert niets meer.
    expect(schrijfRasterKeuze(uit, keuze)).toBe(uit);
  });
  it("werkt een bestaande keuze bij en haalt haar weg", () => {
    const eerst = schrijfRasterKeuze(bron, keuze);
    const groter = { bladen: [{ naam: "Blad <1> & 'co'", rijen: 40, kolommen: 12 }], onbeperkt: [] };
    const bijgewerkt = schrijfRasterKeuze(eerst, groter);
    expect(leesRasterKeuze(bijgewerkt)).toEqual(groter);
    const weg = schrijfRasterKeuze(bijgewerkt, null);
    expect(leesRasterKeuze(weg)).toBeNull();
    expect(new Pakket(weg).lees("docProps/custom.xml")).not.toContain(EIGENSCHAP);
  });
  it("behoudt andere aangepaste eigenschappen en kiest een vrij nummer", () => {
    const p = new Pakket(schrijfRasterKeuze(bron, keuze));
    p.schrijf(
      "docProps/custom.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Klant"><vt:lpwstr>ACME</vt:lpwstr></property><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="7" name="Dossier"><vt:i4>12</vt:i4></property></Properties>`,
    );
    const uit = new Pakket(schrijfRasterKeuze(p.inpakken(), keuze));
    const xml = uit.lees("docProps/custom.xml");
    expect(xml).toContain('name="Klant"><vt:lpwstr>ACME</vt:lpwstr>');
    expect(xml).toContain('pid="7" name="Dossier"');
    expect(xml).toContain(`pid="8" name="${EIGENSCHAP}"`);
    expect(leesRasterKeuze(uit)).toEqual(keuze);
  });
});
