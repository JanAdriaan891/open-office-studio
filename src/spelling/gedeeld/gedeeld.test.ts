import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { autocorrectie } from "../autocorrectie";
import { a1, context, isTekstinvoer, ontleedA1, regelBegin, vervangInvoer, woordX } from "../rekenblad/logica";
import { caretX } from "../presentatie/sessie";
import { documentTaalUitPakket, taalUitDias, taalUitKern } from "./documenttaal";
import { volgendeTreffer, type DialoogTreffer } from "./Dialoog";

const treffer = (positie: number[], sleutel = positie.join(":")): DialoogTreffer => ({
  sleutel,
  positie,
  woord: "x",
  taal: "nl",
  voor: "",
  na: "",
  plek: "",
});

describe("documenttaal", () => {
  it("leest dc:language en de meest gebruikte lang op de dia's", () => {
    expect(taalUitKern("<cp:coreProperties><dc:language>en-GB</dc:language></cp:coreProperties>")).toBe("en-GB");
    expect(taalUitKern("<cp:coreProperties/>")).toBeNull();
    expect(taalUitDias(['<a:rPr lang="nl-NL"/><a:rPr lang="en-US"/><a:endParaRPr lang="nl-NL"/>'])).toBe("nl");
    expect(taalUitDias(['<a:rPr lang="de-DE" b="1"/>'])).toBe("geen");
  });

  it("haalt de taal uit een PPTX- en XLSX-pakket", () => {
    const pptx = zipSync({
      "ppt/slides/slide1.xml": strToU8('<p:sld><a:r><a:rPr lang="en-US"/></a:r></p:sld>'),
      "docProps/core.xml": strToU8("<dc:language>nl-NL</dc:language>"),
    });
    expect(documentTaalUitPakket(pptx, "pptx")).toBe("en-US");
    expect(documentTaalUitPakket(pptx, "xlsx")).toBe("nl");
    expect(documentTaalUitPakket(new Uint8Array([1, 2, 3]), "xlsx")).toBeNull();
  });
});

describe("rekenblad", () => {
  it("controleert geen formules", () => {
    expect(isTekstinvoer("Dit is tekst")).toBe(true);
    expect(isTekstinvoer("=SOM(A1:A3)")).toBe(false);
    expect(isTekstinvoer("+A1")).toBe(false);
    expect(isTekstinvoer("- opsomming")).toBe(true);
  });

  it("vindt teruglopende regels in de celwaarde", () => {
    expect(regelBegin("een lange zin die doorloopt", ["een lange zin", "die doorloopt"])).toEqual([0, 14]);
    expect(regelBegin("abc", ["€ 3"])).toEqual([null]);
  });

  it("meet woorden bij links, rechts en midden uitlijnen", () => {
    const meet = (t: string) => t.length * 10;
    expect(woordX({ x: 5, text: "ab cd", align: "left" }, 3, 5, meet)).toEqual({ x: 35, breedte: 20 });
    expect(woordX({ x: 100, text: "ab cd", align: "right" }, 0, 2, meet)).toEqual({ x: 50, breedte: 20 });
    expect(woordX({ x: 100, text: "ab cd", align: "center" }, 0, 2, meet)).toEqual({ x: 75, breedte: 20 });
  });

  it("vervangt in de invoer, ook met apostrof, en weigert als de cel veranderd is", () => {
    const f = { start: 11, eind: 15, tekst: "huiz" };
    expect(vervangInvoer("Dit is een huiz", "Dit is een huiz", [f], "huis")).toBe("Dit is een huis");
    expect(vervangInvoer("'Dit is een huiz", "Dit is een huiz", [f], "huis")).toBe("'Dit is een huis");
    expect(vervangInvoer("iets anders", "Dit is een huiz", [f], "huis")).toBeNull();
    expect(
      vervangInvoer("teh en teh", "teh en teh", [{ start: 0, eind: 3, tekst: "teh" }, { start: 7, eind: 10, tekst: "teh" }], "the"),
    ).toBe("the en the");
  });

  it("rekent A1-adressen om", () => {
    expect(ontleedA1("AB12")).toEqual({ row: 11, col: 27 });
    expect(a1(11, 27)).toBe("AB12");
    expect(context("a b c huiz d", { start: 6, eind: 10 }, 2)).toEqual({ voor: "…c ", na: " d" });
  });
});

describe("presentatie", () => {
  it("neemt de dichtstbijzijnde caretpositie", () => {
    const regel = { x: 10, caretStops: [{ position: 0, x: 10 }, { position: 3, x: 40 }, { position: 6, x: 70 }] };
    expect(caretX(regel, 3)).toBe(40);
    expect(caretX(regel, 5)).toBe(70);
  });
});

describe("venster", () => {
  const lijst = [treffer([0, 1, 0, 0]), treffer([0, 5, 0, 0]), treffer([1, 2, 0, 0])];
  it("begint bij de selectie en loopt daarna rond tot het begin", () => {
    let uit = volgendeTreffer(lijst, [0, 3, 0, 0], [0, 3, 0, 0], false, new Set());
    expect(uit.treffer?.positie).toEqual([0, 5, 0, 0]);
    uit = volgendeTreffer(lijst, [1, 3, 0, 0], [0, 3, 0, 0], false, new Set());
    expect(uit).toMatchObject({ rond: true, treffer: { positie: [0, 1, 0, 0] } });
    // Na de ronde: niet voorbij waar het venster begon.
    expect(volgendeTreffer(lijst, [0, 2, 0, 0], [0, 3, 0, 0], true, new Set()).treffer).toBeNull();
  });
  it("slaat eenmaal genegeerde plekken over", () => {
    expect(volgendeTreffer(lijst, [0, 5, 0, 0], [0, 0], false, new Set(["0:5:0:0"])).treffer?.positie).toEqual([1, 2, 0, 0]);
  });
});

describe("autocorrectie in een cel", () => {
  it("geeft het celbegin geen hoofdletter, een nieuwe zin wel", () => {
    expect(autocorrectie("ja ", 3, { taal: "nl", beginIsZinsbegin: false })).toBeNull();
    expect(autocorrectie("ja ", 3, { taal: "nl" })?.nieuw).toBe("Ja");
    expect(autocorrectie("klaar. nog ", 11, { taal: "nl", beginIsZinsbegin: false })?.nieuw).toBe("Nog");
  });
});
