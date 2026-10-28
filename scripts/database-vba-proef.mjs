import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import assert from "node:assert/strict";
import { leesCfb } from "../packages/database/src/cfb.ts";
import {
  leesVbaDir,
  leesVbaModuleBron,
} from "../packages/database/src/ovba.ts";

// Toetst de eigen MS-CFB- en MS-OVBA-lezer op echte VBA-projecten uit Office-macrobestanden.
// Er wordt niets uitgevoerd; alleen de broncode wordt gedecomprimeerd en geteld.
function zipBestand(bytes, gezocht) {
  const z = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && z.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) return undefined;
  let positie = z.getUint32(eocd + 16, true);
  for (let i = 0; i < z.getUint16(eocd + 10, true); i++) {
    const naamLengte = z.getUint16(positie + 28, true);
    const naam = new TextDecoder().decode(
      bytes.subarray(positie + 46, positie + 46 + naamLengte),
    );
    if (naam.toLowerCase() === gezocht) {
      const lokaal = z.getUint32(positie + 42, true);
      const methode = z.getUint16(positie + 10, true);
      const grootte = z.getUint32(positie + 20, true);
      const start =
        lokaal +
        30 +
        z.getUint16(lokaal + 26, true) +
        z.getUint16(lokaal + 28, true);
      const data = bytes.subarray(start, start + grootte);
      return methode === 8 ? new Uint8Array(inflateRawSync(data)) : data;
    }
    positie +=
      46 +
      naamLengte +
      z.getUint16(positie + 30, true) +
      z.getUint16(positie + 32, true);
  }
  return null;
}

const manifest = JSON.parse(
  await readFile(
    process.env.CORPUS_MANIFEST ?? ".local/corpus/manifest.json",
    "utf8",
  ),
);
const kandidaten = manifest.bestanden.filter(
  (b) => /^(docm|xlsm|pptm)$/.test(b.extensie) && b.status === "opgehaald",
);
let projecten = 0;
let modules = 0;
let metBron = 0;
let regels = 0;
const fouten = [];
const geenZip = [];
for (const bestand of kandidaten) {
  try {
    const zip = new Uint8Array(await readFile(bestand.bestand));
    const map = { docm: "word", xlsm: "xl", pptm: "ppt" }[bestand.extensie];
    const project = zipBestand(zip, `${map}/vbaproject.bin`);
    if (project === undefined) {
      geenZip.push(bestand.naam);
      continue;
    }
    if (!project) continue;
    const items = leesCfb(project);
    const stromen = new Map(
      items
        .filter((i) => i.soort === "stroom")
        .map((i) => [i.pad.toLowerCase(), i.data]),
    );
    const dir = stromen.get("vba/dir");
    assert.ok(dir, `${bestand.naam}: VBA/dir ontbreekt.`);
    const info = leesVbaDir(dir);
    projecten++;
    for (const module of info.modules) {
      modules++;
      const stroom = stromen.get(`vba/${module.stroom.toLowerCase()}`);
      assert.ok(stroom, `${bestand.naam}: modulestroom ontbreekt.`);
      const bron = leesVbaModuleBron(stroom, module.offset, info.codepagina);
      if (bron === null) continue;
      assert.match(
        bron,
        /^Attribute VB_Name = "/,
        `${bestand.naam}: bron begint niet met VB_Name.`,
      );
      assert.ok(
        bron.includes(`"${module.naam}"`),
        `${bestand.naam}: modulenaam ontbreekt in bron.`,
      );
      metBron++;
      regels += bron.split("\r\n").length;
    }
  } catch (fout) {
    fouten.push(`${bestand.naam}: ${fout.message}`);
  }
}
console.log(
  `VBA-proef: ${kandidaten.length} macrobestanden, ${projecten} VBA-projecten, ${modules} modules, ${metBron} met teruggewonnen bron (${regels} regels).`,
);
if (geenZip.length)
  console.log(`  overgeslagen (geen ZIP-container): ${geenZip.join(", ")}`);
for (const fout of fouten) console.log(`  fout: ${fout}`);
assert.equal(fouten.length, 0);
assert.ok(projecten > 0, "Geen VBA-projecten gevonden in het corpus.");
