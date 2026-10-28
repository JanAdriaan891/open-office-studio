// Stijlen (#45) en documenteigenschappen (#23/#28) end-to-end getoetst:
//  1. Een voorbeelddocument via de pakketroute wijzigen (styles.xml, thema,
//     docProps) met dezelfde modules als de app (src/tekst/**).
//  2. De XML met python3 (stdlib) controleren: welgevormd.
//  3. Met de echte engine openen: het model ziet de wijzigingen; opslaan en
//     heropenen houdt ze vast.
//  4. Onafhankelijk met LibreOffice headless naar ODT: LibreOffice leest de
//     nieuwe en gewijzigde stijlen en de eigenschappen.
//
// Gebruik: node scripts/test-stijlen-info.mjs [--zonder-libreoffice]
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { strFromU8, unzipSync, zipSync } from "fflate";
import { parseDocx, repackDocx } from "@betteroffice/docx/docx";
import { bewerkStijlOnderdelen } from "../src/tekst/stijlen/pakket.ts";
import { leesEigenschappen, schrijfEigenschappen } from "../src/tekst/info/docprops.ts";
import { inspecteer, schoonOp } from "../src/tekst/info/inspectie.ts";
import { nieuweStijl, wijzigDocStandaarden, wijzigStijl, wijzigThemaLettertypen } from "../src/tekst/stijlen/stijlenxml.ts";

const args = new Set(process.argv.slice(2));
const metLibreOffice = !args.has("--zonder-libreoffice") && spawnSync("which", ["soffice"]).status === 0;
const UIT = ".local/controledocumenten/stijlen-info";
await rm(UIT, { recursive: true, force: true });
await mkdir(UIT, { recursive: true });

const onderdeel = (bytes, pad) => {
  const z = unzipSync(bytes);
  return z[pad] ? strFromU8(z[pad]) : null;
};
function welgevormd(xml, naam) {
  const r = spawnSync("python3", ["-c", "import sys,xml.dom.minidom;xml.dom.minidom.parseString(sys.stdin.buffer.read())"], { input: xml });
  assert.equal(r.status, 0, `${naam} is geen welgevormde XML: ${r.stderr}`);
}
const geslaagd = [];
const ok = (tekst) => {
  geslaagd.push(tekst);
  console.log(`✓ ${tekst}`);
};

// --- Stijlen -------------------------------------------------------------
const bron = new Uint8Array(await readFile("docs/voorbeelden/Ontwerpnotitie.docx"));
let nieuwId = "";
const gewijzigd = bewerkStijlOnderdelen(bron, (o) => {
  let stijlen = wijzigStijl(o.stijlen, "Heading1", {
    eigenschappen: { kleur: "C00000", cursief: true, grootte: 20, ruimteNa: 6 },
  });
  const nieuw = nieuweStijl(stijlen, {
    naam: "Proefstijl OpenAEC",
    soort: "paragraph",
    gebaseerdOp: "Normal",
    eigenschappen: { cursief: true, ruimteNa: 12, uitlijning: "center", lettertype: "Liberation Serif" },
  });
  nieuwId = nieuw.styleId;
  stijlen = wijzigDocStandaarden(nieuw.xml, { taal: "nl-NL" });
  return {
    stijlen,
    thema: o.thema ? wijzigThemaLettertypen(o.thema, { koppen: "Montserrat", tekst: "Inter" }) : undefined,
  };
});
await writeFile(join(UIT, "stijlen.docx"), gewijzigd);
const stijlenXml = onderdeel(gewijzigd, "word/styles.xml");
welgevormd(stijlenXml, "styles.xml");
welgevormd(onderdeel(gewijzigd, "word/theme/theme1.xml"), "theme1.xml");
// Alleen styles.xml en het thema veranderen; de rest blijft byte-gelijk.
{
  const a = unzipSync(bron);
  const b = unzipSync(gewijzigd);
  assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort());
  const anders = Object.keys(a).filter((k) => Buffer.compare(Buffer.from(a[k]), Buffer.from(b[k])) !== 0);
  assert.deepEqual(anders.sort(), ["word/styles.xml", "word/theme/theme1.xml"]);
}
ok("styles.xml en theme1.xml gewijzigd en welgevormd; andere onderdelen byte-gelijk");

const doc = await parseDocx(gewijzigd, { preloadFonts: false });
const stijl = (id) => doc.package.styles.styles.find((s) => s.styleId === id);
assert.equal(stijl("Heading1").rPr.italic, true);
assert.equal(stijl("Heading1").rPr.color.rgb, "C00000");
assert.equal(stijl("Heading1").rPr.fontSize, 40);
assert.equal(stijl("Heading1").rPr.bold, true, "bestaande eigenschappen blijven");
assert.equal(stijl(nieuwId).name, "Proefstijl OpenAEC");
assert.equal(stijl(nieuwId).basedOn, "Normal");
assert.equal(stijl(nieuwId).pPr.alignment, "center");
assert.equal(stijl(nieuwId).pPr.spaceAfter, 240);
assert.equal(doc.package.styles.docDefaults.rPr.language.latin, "nl-NL");
assert.equal(doc.package.theme.fontScheme.majorFont.latin, "Montserrat");
assert.equal(doc.package.theme.fontScheme.minorFont.latin, "Inter");
ok("de engine leest de gewijzigde stijl, de nieuwe stijl, de documenttaal en de thema-lettertypen");

const opnieuw = new Uint8Array(await repackDocx(doc));
const doc2 = await parseDocx(opnieuw, { preloadFonts: false });
assert.equal(doc2.package.styles.styles.find((s) => s.styleId === nieuwId)?.name, "Proefstijl OpenAEC");
assert.equal(doc2.package.styles.styles.find((s) => s.styleId === "Heading1").rPr.color.rgb, "C00000");
ok("opslaan met de engine en heropenen behoudt de stijlen");

// --- Documenteigenschappen ------------------------------------------------
const metProps = schrijfEigenschappen(gewijzigd, {
  titel: "Proefdocument stijlen & info",
  onderwerp: "Controle",
  auteur: "Proef Auteur",
  trefwoorden: "beton, hout",
  opmerkingen: "Gemaakt door de Node-proef.",
  categorie: "Test",
  status: "Concept",
  laatstGewijzigdDoor: "Proef Gebruiker",
  gewijzigd: "2026-10-28T12:00:00.000Z",
  revisieOphogen: true,
  woorden: 78,
  tekens: 433,
  tekensMetSpaties: 513,
  paginas: 1,
  bewerkingstijd: 7,
});
await writeFile(join(UIT, "eigenschappen.docx"), metProps);
welgevormd(onderdeel(metProps, "docProps/core.xml"), "core.xml");
welgevormd(onderdeel(metProps, "docProps/app.xml"), "app.xml");
{
  const e = leesEigenschappen(metProps);
  assert.equal(e.titel, "Proefdocument stijlen & info");
  assert.equal(e.status, "Concept");
  assert.equal(e.bewerkingstijd, 7);
  assert.equal(e.revisie, 2);
  // De engine houdt docProps bij opslaan vast (alleen de wijzigdatum mag veranderen).
  const doc3 = await parseDocx(metProps, { preloadFonts: false });
  const bewaard = new Uint8Array(await repackDocx(doc3));
  const e2 = leesEigenschappen(bewaard);
  for (const k of ["titel", "onderwerp", "auteur", "trefwoorden", "opmerkingen", "categorie", "status", "laatstGewijzigdDoor"])
    assert.equal(e2[k], e[k], `${k} na opslaan met de engine`);
  assert.equal(e2.bewerkingstijd, 7);
}
ok("docProps/core.xml en app.xml geschreven, welgevormd en behouden na opslaan met de engine");

// --- Document inspecteren ---------------------------------------------------
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const metSporen = (() => {
  const z = unzipSync(metProps);
  let doc = strFromU8(z["word/document.xml"]);
  const p = `<w:p><w:r><w:t xml:space="preserve">Zichtbaar </w:t></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:t>Geheimtekst</w:t></w:r><w:commentRangeStart w:id="7"/><w:ins w:id="81" w:author="Klaas Revisor" w:date="2026-01-01T00:00:00Z"><w:r><w:t xml:space="preserve">Ingevoegd </w:t></w:r></w:ins><w:del w:id="82" w:author="Klaas Revisor" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>Verwijderdtekst</w:delText></w:r></w:del><w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:r></w:p>`;
  doc = doc.replace(/<w:sectPr/, `${p}<w:sectPr`);
  z["word/document.xml"] = new TextEncoder().encode(doc);
  z["word/comments.xml"] = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W_NS}"><w:comment w:id="7" w:author="Marie Opmerker" w:initials="MO"><w:p><w:r><w:t>Klopt dit wel?</w:t></w:r></w:p></w:comment></w:comments>`);
  const rels = strFromU8(z["word/_rels/document.xml.rels"]).replace("</Relationships>", `<Relationship Id="rIdProef1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>`);
  z["word/_rels/document.xml.rels"] = new TextEncoder().encode(rels);
  const typen = strFromU8(z["[Content_Types].xml"]).replace("</Types>", `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>`);
  z["[Content_Types].xml"] = new TextEncoder().encode(typen);
  return zipSync(z);
})();
await writeFile(join(UIT, "sporen.docx"), metSporen);
const voor = inspecteer(metSporen);
assert.equal(voor.verborgenTekst, 1);
assert.equal(voor.opmerkingen, 1);
assert.equal(voor.revisies, 2);
assert.ok(voor.personen.includes("Klaas Revisor") && voor.personen.includes("Marie Opmerker") && voor.personen.includes("Proef Auteur"));
const schoon = schoonOp(metSporen, { verborgenTekst: true, opmerkingen: true, revisies: true, persoonlijk: true });
await writeFile(join(UIT, "schoon.docx"), schoon);
welgevormd(onderdeel(schoon, "word/document.xml"), "document.xml (schoon)");
const na = inspecteer(schoon);
assert.deepEqual([na.verborgenTekst, na.opmerkingen, na.revisies, na.personen.length], [0, 0, 0, 0]);
{
  const doc4 = await parseDocx(schoon, { preloadFonts: false });
  const tekst = JSON.stringify(doc4.package.document.content);
  assert.ok(tekst.includes("Ingevoegd") && tekst.includes("Zichtbaar"));
  assert.ok(!tekst.includes("Verwijderdtekst") && !tekst.includes("Geheimtekst"));
}
ok("document inspecteren vindt en verwijdert verborgen tekst, opmerkingen, revisies en namen; de engine opent het resultaat");

// --- LibreOffice ---------------------------------------------------------
if (metLibreOffice) {
  const profiel = resolve(UIT, "lo-profiel");
  const r = spawnSync(
    "soffice",
    [`-env:UserInstallation=file://${profiel}`, "--headless", "--norestore", "--nolockcheck", "--convert-to", "odt", "--outdir", UIT, join(UIT, "stijlen.docx"), join(UIT, "eigenschappen.docx"), join(UIT, "schoon.docx")],
    { encoding: "utf8", timeout: 300000 },
  );
  assert.equal(r.status, 0, r.stderr);
  const meta = onderdeel(new Uint8Array(await readFile(join(UIT, "eigenschappen.odt"))), "meta.xml");
  assert.match(meta, /<dc:title>Proefdocument stijlen &amp; info<\/dc:title>/);
  assert.match(meta, /<meta:initial-creator>Proef Auteur<\/meta:initial-creator>/);
  assert.match(meta, /<meta:keyword>beton, hout<\/meta:keyword>|<meta:keyword>beton<\/meta:keyword>/);
  ok("LibreOffice leest titel, auteur en trefwoorden uit docProps");
  const inhoud = onderdeel(new Uint8Array(await readFile(join(UIT, "schoon.odt"))), "content.xml");
  assert.ok(!inhoud.includes("Verwijderdtekst") && !inhoud.includes("Geheimtekst") && !inhoud.includes("office:annotation"));
  assert.ok(inhoud.includes("Ingevoegd"));
  ok("LibreOffice ziet in het opgeschoonde document geen verborgen tekst, opmerkingen of revisies meer");
  const odt = new Uint8Array(await readFile(join(UIT, "stijlen.odt")));
  const odtStijlen = onderdeel(odt, "styles.xml");
  assert.match(odtStijlen, /style:display-name="Proefstijl OpenAEC"/);
  const kop = /<style:style[^>]*style:name="Heading_20_1"[\s\S]*?<\/style:style>/.exec(odtStijlen)?.[0] ?? "";
  assert.match(kop, /fo:color="#c00000"/i);
  assert.match(kop, /fo:font-style="italic"/);
  assert.match(kop, /fo:font-size="20pt"/);
  const proef = /<style:style[^>]*style:display-name="Proefstijl OpenAEC"[\s\S]*?<\/style:style>/.exec(odtStijlen)?.[0] ?? "";
  assert.match(proef, /fo:text-align="center"/);
  ok("LibreOffice leest de gewijzigde Kop 1 (kleur, cursief, 20 pt) en de nieuwe stijl");
} else console.log("- LibreOffice overgeslagen");

await writeFile(join(UIT, "verslag.json"), JSON.stringify({ datum: new Date().toISOString(), geslaagd }, null, 2));
console.log(`\n${geslaagd.length} controles geslaagd. Uitvoer: ${UIT}`);
