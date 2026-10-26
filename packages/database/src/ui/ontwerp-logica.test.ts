import { describe, expect, it } from "vitest";
import type { TabelSchema } from "../werkkopie/contract.ts";
import { conceptNaarVeld, conceptUitVeld, relatieUitConcept, sleutelPlan, sleutelVelden, structuurTekst, veldPlan } from "./ontwerp-logica.ts";
import { controleerModulenaam, moduleUitRecord, nieuweModuleBron } from "./vba-sessie.ts";

const klant: TabelSchema = {
  naam: "Klant",
  aantal: 3,
  herkomst: "werkkopie",
  velden: [
    { naam: "ID", soort: "autonummer", primair: true },
    { naam: "Naam", soort: "tekst", lengte: 50, verplicht: true },
    { naam: "Actief", soort: "jaNee", standaard: 1 },
    { naam: "Saldo", soort: "valuta", standaard: 0 },
  ],
};

describe("tabelontwerp", () => {
  it("ziet geen wijziging in een onaangeroerd concept", () => {
    for (const [i, v] of klant.velden.entries()) expect(veldPlan(v, conceptUitVeld(v, i))).toEqual({ hernoem: null, wijziging: null });
  });

  it("plant hernoemen en wijzigen apart", () => {
    const c = conceptUitVeld(klant.velden[1], 1);
    expect(veldPlan(klant.velden[1], { ...c, naam: "Klantnaam" })).toEqual({ hernoem: "Klantnaam", wijziging: null });
    expect(veldPlan(klant.velden[1], { ...c, lengte: "80", verplicht: false })).toEqual({ hernoem: null, wijziging: { lengte: 80, verplicht: false } });
    expect(veldPlan(klant.velden[1], { ...c, soort: "memo", lengte: "" })).toEqual({ hernoem: null, wijziging: { soort: "memo" } });
    expect(veldPlan(klant.velden[2], { ...conceptUitVeld(klant.velden[2], 2), standaard: "" })).toEqual({ hernoem: null, wijziging: { standaard: null } });
    expect(veldPlan(klant.velden[3], { ...conceptUitVeld(klant.velden[3], 3), standaard: "2,50" })).toEqual({ hernoem: null, wijziging: { standaard: 2.5 } });
    expect(veldPlan(klant.velden[1], { ...c, lengte: "300" })).toEqual({ fout: "Lengte van ‘Naam’ moet tussen 1 en 255 liggen." });
    expect(conceptNaarVeld({ ...c, naam: "a[b" })).toHaveProperty("fout");
  });

  it("plant de primaire sleutel", () => {
    const concepten = klant.velden.map(conceptUitVeld);
    expect(sleutelPlan(klant, concepten)).toBeNull();
    expect(sleutelPlan(klant, concepten.map((c) => ({ ...c, primair: c.naam === "Naam" || c.naam === "ID" })))).toEqual(["ID", "Naam"]);
    expect(sleutelPlan(klant, concepten.map((c) => ({ ...c, primair: false })))).toEqual([]);
  });

  it("noemt de query’s die niet zijn bijgewerkt", () => {
    expect(structuurTekst("Veld ‘A’ hernoemd", { herbouwd: false, querys: ["Q1"], meldingen: ["1 opgeslagen query(’s) noemen ‘A’ en zijn niet bijgewerkt."] })).toBe(
      "Veld ‘A’ hernoemd. Controleer de query ‘Q1’: die noemt dit veld en is niet automatisch bijgewerkt.",
    );
    expect(structuurTekst("Gewijzigd", { herbouwd: true, querys: [], meldingen: ["Index ‘x’ is vervallen."] })).toBe(
      "Gewijzigd (tabel veilig herbouwd). Index ‘x’ is vervallen.",
    );
  });
});

describe("relatievenster", () => {
  it("zet een concept om en controleert de keuzes", () => {
    const basis = { naam: "", tabel: "Order", veld: "KlantID", naarTabel: "Klant", naarVeld: "ID", integriteit: false, trapsBijwerken: true, trapsVerwijderen: true };
    expect(relatieUitConcept(basis)).toEqual({
      tabel: "Order",
      velden: ["KlantID"],
      naarTabel: "Klant",
      naarVelden: ["ID"],
      integriteit: false,
      trapsBijwerken: false,
      trapsVerwijderen: false,
    });
    expect(relatieUitConcept({ ...basis, integriteit: true, naam: " R1 " })).toMatchObject({ naam: "R1", trapsBijwerken: true, trapsVerwijderen: true });
    expect(relatieUitConcept({ ...basis, veld: "" })).toEqual({ fout: "Kies aan beide kanten een veld." });
    expect(relatieUitConcept({ ...basis, tabel: "Klant", veld: "ID" })).toHaveProperty("fout");
    expect(sleutelVelden(klant)).toEqual(["ID"]);
  });
});

describe("VBA-modules in de interface", () => {
  it("controleert namen en zet records om", () => {
    expect(controleerModulenaam("Module1", ["module1"])).toBe("Deze module bestaat al.");
    expect(controleerModulenaam("1x", [])).toMatch(/letter/);
    expect(controleerModulenaam("Goed_2", [])).toBeNull();
    expect(moduleUitRecord({ naam: "M", soort: "module", bron: "x", herkomst: "werkkopie", gewijzigd: "2026-10-26T10:00:00Z" })).toEqual({
      naam: "M",
      soort: "module",
      bron: "x",
      herkomst: "eigen",
      gewijzigd: "2026-10-26T10:00:00Z",
    });
    expect(nieuweModuleBron("Form_Klant", "formulier")).toMatch(/Form_Load/);
    expect(nieuweModuleBron("Hulp", "module")).toMatch(/Hallo vanuit Hulp/);
  });
});
