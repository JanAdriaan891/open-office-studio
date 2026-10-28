import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { leesDocProps, leesEigenschappen, schrijfEigenschappen, wijzigApp, wijzigKern } from "./docprops";
import { inspecteer, schoonOp } from "./inspectie";
import { leesXml } from "../../grafieken/xml";
import { leesBlokken } from "./Leesmodus";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const kern = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Ruimte voor ideeën</dc:title><dc:subject/><dc:creator>Jan</dc:creator><cp:keywords/><dc:description>oud</dc:description><cp:lastModifiedBy>Piet</cp:lastModifiedBy><cp:revision>3</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">2013-12-23T23:15:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2013-12-23T23:15:00Z</dcterms:modified><cp:category/></cp:coreProperties>`;
const app = `<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Template>Normal.dotm</Template><TotalTime>12</TotalTime><Pages>2</Pages><Words>40</Words><Application>Microsoft Office Word</Application><Company>Bureau X</Company></Properties>`;

function docx(delen: Record<string, string>, metProps = true) {
  const basis: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${metProps ? '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' : ""}<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>${metProps ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' : ""}</Relationships>`,
    ...(metProps ? { "docProps/core.xml": kern, "docProps/app.xml": app } : {}),
    ...delen,
  };
  return zipSync(Object.fromEntries(Object.entries(basis).map(([k, v]) => [k, strToU8(v)])));
}
const lees = (bytes: Uint8Array, pad: string) => {
  const z = unzipSync(bytes);
  return z[pad] ? strFromU8(z[pad]) : null;
};

describe("documenteigenschappen", () => {
  it("leest core.xml en app.xml", () => {
    const e = leesDocProps(kern, app);
    expect(e).toMatchObject({
      titel: "Ruimte voor ideeën",
      auteur: "Jan",
      opmerkingen: "oud",
      laatstGewijzigdDoor: "Piet",
      revisie: 3,
      aangemaakt: "2013-12-23T23:15:00Z",
      paginas: 2,
      woorden: 40,
      bewerkingstijd: 12,
      toepassing: "Microsoft Office Word",
      bedrijf: "Bureau X",
      trefwoorden: "",
      status: "",
    });
  });

  it("schrijft velden op hun plaats en behoudt de rest", () => {
    const uit = wijzigKern(kern, {
      titel: "Nieuwe titel & meer",
      trefwoorden: "beton, hout",
      status: "Concept",
      laatstGewijzigdDoor: "Anna",
      gewijzigd: "2026-10-28T10:00:00.123Z",
      revisieOphogen: true,
    });
    leesXml(uit);
    const e = leesDocProps(uit, null);
    expect(e).toMatchObject({ titel: "Nieuwe titel & meer", trefwoorden: "beton, hout", status: "Concept", laatstGewijzigdDoor: "Anna", revisie: 4, gewijzigd: "2026-10-28T10:00:00Z", auteur: "Jan" });
    expect(uit).toContain("<dc:title>Nieuwe titel &amp; meer</dc:title>");
    expect(uit).toContain('<dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-28T10:00:00Z</dcterms:modified>');
    // contentStatus komt na category.
    expect(uit.indexOf("<cp:category/>")).toBeLessThan(uit.indexOf("<cp:contentStatus>"));
  });

  it("maakt een lege core.xml en app.xml aan", () => {
    const k = wijzigKern(null, { titel: "T", gewijzigd: "2026-01-01T00:00:00Z" });
    expect(leesDocProps(k, null)).toMatchObject({ titel: "T", gewijzigd: "2026-01-01T00:00:00Z" });
    const a = wijzigApp(null, { woorden: 12, paginas: 1, bewerkingstijd: 5.4 });
    expect(leesDocProps(null, a)).toMatchObject({ woorden: 12, paginas: 1, bewerkingstijd: 5 });
    expect(a).toContain("<TotalTime>5</TotalTime><Pages>1</Pages><Words>12</Words>");
  });

  it("schrijft in een pakket en maakt ontbrekende onderdelen met relatie aan", () => {
    const zonder = docx({ "word/document.xml": `<w:document ${W}><w:body/></w:document>` }, false);
    const met = schrijfEigenschappen(zonder, { titel: "Nieuw", woorden: 3 });
    expect(leesEigenschappen(met)).toMatchObject({ titel: "Nieuw", woorden: 3 });
    expect(lees(met, "_rels/.rels")).toContain('Target="docProps/core.xml"');
    expect(lees(met, "[Content_Types].xml")).toContain('PartName="/docProps/app.xml"');
  });
});

const document = `<w:document ${W}><w:body><w:p><w:r><w:t>Zichtbaar</w:t></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:t>Geheim</w:t></w:r></w:p><w:p><w:commentRangeStart w:id="0"/><w:ins w:id="1" w:author="Klaas" w:date="2026-01-01T00:00:00Z"><w:r><w:t>Nieuw</w:t></w:r></w:ins><w:del w:id="2" w:author="Klaas"><w:r><w:delText>Oud</w:delText></w:r></w:del><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p></w:body></w:document>`;
const opmerkingen = `<w:comments ${W}><w:comment w:id="0" w:author="Marie" w:initials="M"><w:p><w:r><w:t>Klopt dit?</w:t></w:r></w:p></w:comment></w:comments>`;
const docRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>`;

describe("document inspecteren", () => {
  const bytes = docx({ "word/document.xml": document, "word/comments.xml": opmerkingen, "word/_rels/document.xml.rels": docRels });

  it("vindt verborgen tekst, opmerkingen, revisies en personen", () => {
    const u = inspecteer(bytes);
    expect(u).toMatchObject({ verborgenTekst: 1, opmerkingen: 1, revisies: 2 });
    expect(u.personen).toEqual(["Jan", "Klaas", "Marie", "Piet"]);
    expect(u.eigenschappen.bedrijf).toBe("Bureau X");
  });

  it("verwijdert alles op verzoek", () => {
    const schoon = schoonOp(bytes, { verborgenTekst: true, opmerkingen: true, revisies: true, persoonlijk: true });
    const doc = lees(schoon, "word/document.xml")!;
    expect(doc).toBe(`<w:document ${W}><w:body><w:p><w:r><w:t>Zichtbaar</w:t></w:r></w:p><w:p><w:r><w:t>Nieuw</w:t></w:r></w:p></w:body></w:document>`);
    expect(lees(schoon, "word/comments.xml")).toBeNull();
    expect(lees(schoon, "word/_rels/document.xml.rels")).not.toContain("comments");
    expect(lees(schoon, "[Content_Types].xml")).not.toContain("comments");
    const u = inspecteer(schoon);
    expect(u).toMatchObject({ verborgenTekst: 0, opmerkingen: 0, revisies: 0, personen: [] });
    expect(u.eigenschappen).toEqual({ auteur: "", laatstGewijzigdDoor: "", bedrijf: "", manager: "" });
  });

  it("vervangt alleen namen bij persoonlijke gegevens", () => {
    const schoon = schoonOp(bytes, { persoonlijk: true });
    expect(lees(schoon, "word/document.xml")).toContain('<w:ins w:id="1" w:author="Auteur" w:date="2026-01-01T00:00:00Z">');
    expect(lees(schoon, "word/comments.xml")).toContain('<w:comment w:id="0" w:author="Auteur">');
    expect(inspecteer(schoon).personen).toEqual(["Auteur"]);
  });
});

describe("leesmodus", () => {
  it("houdt het nummer van genummerde lijsten en een stip bij opsommingen", () => {
    const alinea = (tekst: string, listRendering?: object) => ({
      type: "paragraph",
      formatting: listRendering ? { numPr: { numId: 1, ilvl: 0 } } : {},
      listRendering,
      content: [{ type: "run", content: [{ type: "text", text: tekst }] }],
    });
    const document = {
      package: {
        styles: { styles: [] },
        document: {
          content: [
            alinea("Eerste", { marker: "1.", isBullet: false, level: 0, numId: 1 }),
            alinea("Sub", { marker: "a)", isBullet: false, level: 1, numId: 1 }),
            alinea("Stip", { marker: "•", isBullet: true, level: 0, numId: 2 }),
            alinea("Gewoon"),
          ],
        },
      },
    };
    const blokken = leesBlokken(document as never);
    expect(blokken.map((b) => (b.soort === "alinea" ? [b.lijst, b.nummer, b.lijstniveau] : null))).toEqual([
      [true, "1.", 0],
      [true, "a)", 1],
      [true, undefined, 0],
      [false, undefined, 0],
    ]);
  });

  it("telt nummers uit numbering.xml als het model geen listRendering heeft", () => {
    const alinea = (tekst: string, numId?: number, ilvl = 0) => ({
      type: "paragraph",
      formatting: numId ? { numPr: { numId, ilvl } } : {},
      content: [{ type: "run", content: [{ type: "text", text: tekst }] }],
    });
    const document = {
      package: {
        styles: { styles: [] },
        numbering: {
          abstractNums: [
            {
              abstractNumId: 0,
              levels: [
                { ilvl: 0, start: 1, numFmt: "decimal", lvlText: "%1." },
                { ilvl: 1, start: 1, numFmt: "lowerLetter", lvlText: "%2)" },
              ],
            },
            { abstractNumId: 1, levels: [{ ilvl: 0, numFmt: "bullet", lvlText: "•" }] },
          ],
          nums: [
            { numId: 1, abstractNumId: 0 },
            { numId: 2, abstractNumId: 1 },
          ],
        },
        document: { content: [alinea("Een", 1), alinea("Sub", 1, 1), alinea("Sub2", 1, 1), alinea("Twee", 1), alinea("Stip", 2), alinea("Los")] },
      },
    };
    const blokken = leesBlokken(document as never);
    expect(blokken.map((b) => (b.soort === "alinea" ? (b.lijst ? (b.nummer ?? "•") : "-") : null))).toEqual(["1.", "a)", "b)", "2.", "•", "-"]);
  });
});
