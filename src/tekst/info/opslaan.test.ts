import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import type { Document } from "@betteroffice/docx/types/document";
import { leesEigenschappen } from "./docprops";
import { noteerActiviteit, sessieMinuten, wachtendeEigenschappen, werkEigenschappenBij, zetEigenschappen } from "./opslaan";
import { taalNaam, taalOpCursor } from "./taal";
import { leesBlokken } from "./Leesmodus";

const leeg = () =>
  zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`),
  });

describe("eigenschappen bij opslaan", () => {
  it("zet wachtende eigenschappen, revisie, datum en bewerkingstijd", async () => {
    const handle = {};
    zetEigenschappen(handle, { titel: "Plan", trefwoorden: "a, b" });
    expect(wachtendeEigenschappen(handle)).toEqual({ titel: "Plan", trefwoorden: "a, b" });
    noteerActiviteit(handle, 0);
    noteerActiviteit(handle, 2 * 60000);
    noteerActiviteit(handle, 2 * 60000 + 60 * 60000); // lange pauze telt maximaal 5 min
    expect(sessieMinuten(handle)).toBe(7);
    const tussen = await werkEigenschappenBij(handle, null, leeg(), false);
    expect(leesEigenschappen(tussen)).toMatchObject({ titel: "Plan", revisie: null, bewerkingstijd: null });
    const uit = await werkEigenschappenBij(handle, null, tussen, true);
    const e = leesEigenschappen(uit);
    expect(e).toMatchObject({ titel: "Plan", trefwoorden: "a, b", revisie: 1, bewerkingstijd: 7 });
    expect(e.gewijzigd).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(sessieMinuten(handle)).toBe(0);
  });

  it("geeft de bytes ongewijzigd terug zonder wachtende eigenschappen", async () => {
    const bytes = leeg();
    expect(await werkEigenschappenBij({}, null, bytes, false)).toBe(bytes);
    // Geen geldig pakket: opslaan gaat toch door.
    const kapot = new Uint8Array([1, 2, 3]);
    expect(await werkEigenschappenBij({}, null, kapot, true)).toBe(kapot);
  });
});

const doc = {
  package: {
    styles: {
      docDefaults: { rPr: { language: { latin: "en-US" } } },
      styles: [
        { styleId: "Normal", type: "paragraph", default: true },
        { styleId: "Heading1", type: "paragraph", basedOn: "Normal", pPr: { outlineLevel: 0 }, rPr: { language: { latin: "nl-NL" } } },
      ],
    },
    document: {
      content: [
        { type: "paragraph", formatting: { styleId: "Heading1" }, content: [{ type: "run", content: [{ type: "text", text: "Kop" }] }] },
        {
          type: "paragraph",
          content: [
            { type: "run", formatting: { bold: true }, content: [{ type: "text", text: "Vet " }] },
            { type: "run", formatting: { language: { latin: "de-DE" } }, content: [{ type: "text", text: "Deutsch" }] },
            { type: "deletion", content: [{ type: "run", content: [{ type: "text", text: "weg" }] }] },
          ],
        },
        { type: "table", rows: [{ cells: [{ content: [{ type: "paragraph", content: [{ type: "run", content: [{ type: "text", text: "cel" }] }] }] }] }] },
      ],
    },
  },
} as unknown as Document;

describe("taal en leesmodus", () => {
  it("vindt de taal via run, stijl en documentstandaard", () => {
    expect(taalOpCursor(doc, "body:p0", 0)).toBe("nl-NL");
    expect(taalOpCursor(doc, "body:p1", 1)).toBe("en-US");
    expect(taalOpCursor(doc, "body:p1", 6)).toBe("de-DE");
    expect(taalNaam("nl-NL")).toBe("Nederlands (Nederland)");
    expect(taalNaam("nl-BE")).toBe("Nederlands (België)");
  });

  it("maakt eenvoudige leesblokken zonder verwijderde tekst", () => {
    const blokken = leesBlokken(doc);
    expect(blokken[0]).toMatchObject({ soort: "alinea", niveau: 1 });
    expect(blokken[1]).toMatchObject({ soort: "alinea", niveau: 0, stukken: [{ tekst: "Vet ", vet: true }, { tekst: "Deutsch" }] });
    expect(blokken[2]).toMatchObject({ soort: "tabel" });
  });
});
