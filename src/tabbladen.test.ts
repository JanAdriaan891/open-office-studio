import { describe, expect, it } from "vitest";
import {
  aantalGewijzigd,
  actiefTabblad,
  behalve,
  beginToestand,
  naamloos,
  rechtsVan,
  tabbladReducer,
  vingerafdruk,
  type TabbladActie,
  type TabbladToestand,
} from "./tabbladen";

const bytes = new Uint8Array([1, 2, 3]);
const doe = (toestand: TabbladToestand, ...acties: TabbladActie[]) =>
  acties.reduce(tabbladReducer, toestand);
const open = (naam: string, vinger?: string): TabbladActie => ({
  type: "openDocument",
  naam,
  soort: "docx",
  bytes,
  vingerafdruk: vinger,
});
const namen = (t: TabbladToestand) =>
  t.tabbladen.map((x) => (x.type === "document" ? x.naam : x.module));

describe("tabbladen", () => {
  it("opent elk document in een nieuw, actief tabblad", () => {
    const t = doe(beginToestand, open("a.docx", "a"), open("b.docx", "b"));
    expect(namen(t)).toEqual(["a.docx", "b.docx"]);
    expect(actiefTabblad(t)?.id).toBe(2);
    const eerste = t.tabbladen[0];
    expect(eerste.type === "document" && eerste.exportFormaat).toBe("docx");
  });

  it("springt bij hetzelfde bestand naar het bestaande tabblad", () => {
    const t = doe(
      beginToestand,
      open("a.docx", "a"),
      open("b.docx", "b"),
      open("a.docx", "a"),
    );
    expect(t.tabbladen).toHaveLength(2);
    expect(t.actief).toBe(1);
  });

  it("opent nieuwe documenten zonder vingerafdruk altijd apart", () => {
    const t = doe(beginToestand, open("Naamloos 1.docx"), open("Naamloos 2.docx"));
    expect(t.tabbladen).toHaveLength(2);
  });

  it("nummert naamloze documenten met het laagste vrije nummer", () => {
    let t = doe(beginToestand, open(naamloos(beginToestand, "docx")));
    expect(namen(t)).toEqual(["Naamloos 1.docx"]);
    t = doe(t, open(naamloos(t, "docx")), open(naamloos(t, "xlsx")));
    // De tweede `naamloos(t, …)` is vóór het tweede openen berekend.
    expect(namen(t)).toEqual(["Naamloos 1.docx", "Naamloos 2.docx", "Naamloos 2.xlsx"]);
    t = doe(t, { type: "sluit", id: 1 });
    expect(naamloos(t, "pptx")).toBe("Naamloos 1.pptx");
  });

  it("sluit en activeert de rechterbuur, anders de linkerbuur", () => {
    let t = doe(beginToestand, open("a"), open("b"), open("c"), {
      type: "activeer",
      id: 2,
    });
    t = doe(t, { type: "sluit", id: 2 });
    expect(namen(t)).toEqual(["a", "c"]);
    expect(t.actief).toBe(3);
    t = doe(t, { type: "sluit", id: 3 });
    expect(t.actief).toBe(1);
    t = doe(t, { type: "sluit", id: 1 });
    expect(t.actief).toBeNull();
    expect(t.tabbladen).toEqual([]);
  });

  it("laat het actieve tabblad staan bij het sluiten van een ander", () => {
    const t = doe(beginToestand, open("a"), open("b"), { type: "sluit", id: 1 });
    expect(t.actief).toBe(2);
  });

  it("houdt de wijzigingsstatus per tabblad bij", () => {
    const t = doe(
      beginToestand,
      open("a"),
      open("b"),
      { type: "werkBij", id: 1, wijziging: { gewijzigd: true } },
    );
    expect(aantalGewijzigd(t)).toBe(1);
    expect(t.tabbladen[1].gewijzigd).toBe(false);
    // Zonder werkelijke verandering blijft de toestand dezelfde referentie.
    expect(doe(t, { type: "werkBij", id: 1, wijziging: { gewijzigd: true } })).toBe(t);
    expect(doe(t, { type: "werkBij", id: 99, wijziging: { gewijzigd: true } })).toBe(t);
  });

  it("herschikt tabbladen", () => {
    const t = doe(beginToestand, open("a"), open("b"), open("c"), {
      type: "verplaats",
      id: 3,
      naar: 0,
    });
    expect(namen(t)).toEqual(["c", "a", "b"]);
    expect(namen(doe(t, { type: "verplaats", id: 3, naar: 9 }))).toEqual(["a", "b", "c"]);
  });

  it("wisselt rondgaand naar het volgende en vorige tabblad", () => {
    let t = doe(beginToestand, open("a"), open("b"), open("c"));
    // Start (null) is de eerste positie in de rondgang.
    t = doe(t, { type: "volgende" });
    expect(t.actief).toBeNull();
    t = doe(t, { type: "volgende" });
    expect(t.actief).toBe(1);
    t = doe(t, { type: "vorige" }, { type: "vorige" });
    expect(t.actief).toBe(3);
    t = doe(t, { type: "vorige" }, { type: "vorige" });
    expect(t.actief).toBe(1);
    expect(doe(beginToestand, { type: "volgende" })).toBe(beginToestand);
  });

  it("kiest een tabblad op positie; te hoog kiest het laatste", () => {
    const t = doe(beginToestand, open("a"), open("b"), open("c"));
    expect(doe(t, { type: "activeerIndex", index: 0 }).actief).toBeNull();
    expect(doe(t, { type: "activeerIndex", index: 1 }).actief).toBe(1);
    expect(doe(t, { type: "activeerIndex", index: 8 }).actief).toBe(3);
  });

  it("onthoudt het vorige tabblad bij Start", () => {
    let t = doe(beginToestand, open("a"), open("b"), { type: "toonStart" });
    expect(t.actief).toBeNull();
    expect(t.vorige).toBe(2);
    t = doe(t, { type: "sluit", id: 2 });
    expect(t.vorige).toBeNull();
    expect(t.actief).toBeNull();
  });

  it("opent een module hooguit één keer", () => {
    let t = doe(beginToestand, { type: "openModule", module: "notities" }, open("a"));
    t = doe(t, { type: "openModule", module: "notities" });
    expect(namen(t)).toEqual(["notities", "a"]);
    expect(t.actief).toBe(1);
    t = doe(t, { type: "openModule", module: "database" });
    expect(namen(t)).toEqual(["notities", "a", "database"]);
    t = doe(t, {
      type: "werkBij",
      id: 3,
      wijziging: { gewijzigd: true, zoom: 2 },
    });
    expect(t.tabbladen[2]).not.toHaveProperty("zoom");
    expect(t.tabbladen[2].gewijzigd).toBe(true);
  });

  it("geeft de tabbladen voor Andere sluiten en Rechts sluiten", () => {
    const t = doe(beginToestand, open("a"), open("b"), open("c"));
    expect(behalve(t, 2)).toEqual([1, 3]);
    expect(rechtsVan(t, 1)).toEqual([2, 3]);
    expect(rechtsVan(t, 3)).toEqual([]);
  });

  it("maakt een vingerafdruk uit naam, grootte en inhoud", async () => {
    const a = await vingerafdruk("A.docx", bytes);
    expect(a).toBe(await vingerafdruk("a.docx", new Uint8Array([1, 2, 3])));
    expect(a).not.toBe(await vingerafdruk("a.docx", new Uint8Array([1, 2, 4])));
    expect(a.startsWith("a.docx|3|")).toBe(true);
  });
});
