import { describe, expect, it } from "vitest";
import { zichtbaarBereik } from "./Golflijnen";
import { leesAlineatalen, leesStijlen, wijsTalenToe } from "./taal";
import { spellingStatus } from "./useTekstSpelling";
import { naarGeaccepteerd, naarRauw } from "./sessie";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const p = (tekst: string, taal?: string, stijl?: string) =>
  `<w:p>${stijl ? `<w:pPr><w:pStyle w:val="${stijl}"/></w:pPr>` : ""}<w:r>${taal ? `<w:rPr><w:lang w:val="${taal}"/></w:rPr>` : ""}<w:t xml:space="preserve">${tekst}</w:t></w:r></w:p>`;
const stijlen = `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="nl-NL"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Engels"><w:basedOn w:val="Normal"/><w:rPr><w:lang w:val="en-US"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Citaat"><w:basedOn w:val="Engels"/></w:style></w:styles>`;

describe("taal per alinea uit het pakket (w:lang)", () => {
  const doc = `<w:document ${W}><w:body>
    ${p("Een Nederlandse zin.")}
    ${p("An English sentence.", "en-GB")}
    ${p("Quoted text", undefined, "Citaat")}
    <w:tbl><w:tr><w:tc>${p("Cel &amp; tekst")}</w:tc><w:tc>${p("Cell", "en-GB")}</w:tc></w:tr></w:tbl>
    ${p("Na de tabel", "de-DE")}
    <w:p><w:r><w:t>verwijderd</w:t></w:r><w:del><w:r><w:delText>weg</w:delText></w:r></w:del></w:p>
  </w:body></w:document>`;

  it("leest run, stijl (met basedOn), docDefaults, tabelcellen en hun plek", () => {
    const m = leesAlineatalen(doc, stijlen);
    expect(m.standaard).toBe("nl");
    expect(m.talen.get("body")).toEqual([
      { tekst: "Een Nederlandse zin.", taal: null },
      { tekst: "An English sentence.", taal: "en-GB" },
      { tekst: "Quoted text", taal: "en-US" },
      { tekst: "Na de tabel", taal: "geen" },
      { tekst: "verwijderd", taal: null },
    ]);
    expect(m.talen.get("body:t0:r0c0")).toEqual([{ tekst: "Cel & tekst", taal: null }]);
    expect(m.talen.get("body:t0:r0c1")).toEqual([{ tekst: "Cell", taal: "en-GB" }]);
    // De tabel staat na de derde alinea van de hoofdtekst.
    expect(m.plek.get("body:t0:r0c0")).toBe(3);
  });

  it("valt terug op de standaardstijl en docDefaults", () => {
    expect(leesStijlen(stijlen).standaard).toBe("nl");
    expect(leesStijlen(undefined).standaard).toBeNull();
  });

  it("koppelt na bewerkingen op tekst; bewerkte en nieuwe alinea's erven", () => {
    const model = leesAlineatalen(doc, stijlen).talen.get("body")!;
    // Ongewijzigd.
    expect(wijsTalenToe(model.map((m) => m.tekst), model)).toEqual(model.map((m) => m.taal));
    // De Engelse alinea bewerkt: blijft Engels.
    const bewerkt = model.map((m) => m.tekst);
    bewerkt[1] = "An English sentence, edited.";
    expect(wijsTalenToe(bewerkt, model)[1]).toBe("en-GB");
    // Een nieuwe alinea na de Engelse: erft Engels; de rest schuift mee.
    const ingevoegd = [...model.map((m) => m.tekst)];
    ingevoegd.splice(2, 0, "A new line");
    const t = wijsTalenToe(ingevoegd, model);
    expect(t[2]).toBe("en-GB");
    expect(t[3]).toBe("en-US");
    expect(t[4]).toBe("geen");
    // Zonder model: alles erven.
    expect(wijsTalenToe(["a", "b"], undefined)).toEqual([null, null]);
  });
});

describe("golflijnen alleen op zichtbare pagina's", () => {
  const paginas = [
    { boven: -2000, onder: -900, van: 0, tot: 100 },
    { boven: -880, onder: 200, van: 100, tot: 200 },
    { boven: 220, onder: 1300, van: 200, tot: 300 },
    { boven: 1320, onder: 2400, van: 300, tot: 400 },
  ];
  it("neemt de pagina's in beeld plus een marge", () => {
    expect(zichtbaarBereik(paginas, { boven: 0, onder: 900 })).toEqual([100, 300]);
    expect(zichtbaarBereik(paginas, { boven: 5000, onder: 6000 })).toBeNull();
  });
});

describe("spellingstatus in de statusbalk", () => {
  it("telt fouten in het Nederlands", () => {
    expect(spellingStatus({ aan: true, aantal: null, probleem: null })).toBe("spelling controleren…");
    expect(spellingStatus({ aan: true, aantal: 0, probleem: null })).toBe("geen spelfouten");
    expect(spellingStatus({ aan: true, aantal: 1, probleem: null })).toBe("1 spelfout");
    expect(spellingStatus({ aan: true, aantal: 7, probleem: null })).toBe("7 spelfouten");
    expect(spellingStatus({ aan: true, aantal: 7, probleem: "x" })).toBe("spelling niet beschikbaar");
    expect(spellingStatus({ aan: false, aantal: 7, probleem: null })).toBeNull();
  });
});

describe("offsets bij bijgehouden verwijderingen", () => {
  // "en daarna " + verwijderd "oude woorden " + "en het huiz"
  const delen = [
    { kind: "text", text: "en daarna ", attributes: {} },
    { kind: "text", text: "oude woorden ", attributes: { del: { author: "B" } } },
    { kind: "text", text: "en het huiz", attributes: {} },
    { kind: "pilcrow", attributes: {} },
  ];
  it("telt verwijderde tekst mee vóór de fout", () => {
    // "huiz" staat in de geaccepteerde tekst op 17..21.
    expect(naarRauw(delen, 17)).toBe(30);
    expect(naarRauw(delen, 21, true)).toBe(34);
  });
  it("laat een begin direct na de verwijdering erachter en een eind ervoor", () => {
    expect(naarRauw(delen, 10)).toBe(23);
    expect(naarRauw(delen, 10, true)).toBe(10);
  });
  it("rekent terug naar de geaccepteerde tekst (cursor voor de autocorrectie)", () => {
    expect(naarGeaccepteerd(delen, 30)).toBe(17);
    expect(naarGeaccepteerd(delen, 15)).toBe(10); // midden in de verwijdering
    expect(naarGeaccepteerd(delen, 34)).toBe(21);
  });
  it("telt een tabel direct vóór de alinea alleen in de sessie", () => {
    const naTabel = [{ kind: "embed", embedKind: "table" }, { kind: "text", text: "Afbeelding: eigelijk " }];
    expect(naarGeaccepteerd(naTabel, 22)).toBe(21);
    expect(naarRauw(naTabel, 12)).toBe(13);
    expect(naarRauw(naTabel, 0, true)).toBe(1);
  });
  it("verandert niets zonder verwijderingen", () => {
    expect(naarRauw([{ kind: "text", text: "abc" }, { kind: "embed" }, { kind: "text", text: "de" }], 4)).toBe(4);
  });
});
