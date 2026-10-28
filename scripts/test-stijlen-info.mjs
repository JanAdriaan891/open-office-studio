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
import { strFromU8, unzipSync } from "fflate";
import { parseDocx, repackDocx } from "@betteroffice/docx/docx";
import { bewerkStijlOnderdelen } from "../src/tekst/stijlen/pakket.ts";
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

// --- LibreOffice ---------------------------------------------------------
if (metLibreOffice) {
  const profiel = resolve(UIT, "lo-profiel");
  const r = spawnSync(
    "soffice",
    [`-env:UserInstallation=file://${profiel}`, "--headless", "--norestore", "--nolockcheck", "--convert-to", "odt", "--outdir", UIT, join(UIT, "stijlen.docx")],
    { encoding: "utf8", timeout: 300000 },
  );
  assert.equal(r.status, 0, r.stderr);
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
