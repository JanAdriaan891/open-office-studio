// Parseerproef voor de VBA-module: haalt VBA-modules uit de databases in .local/corpus/
// (en .local/corpus/access-vba/manifest.json) via analyseerDatabase en PARSET ze alleen.
// Er wordt niets uitgevoerd. Het rapport bevat geen broncode, geen modulenamen en geen
// databaseinhoud: alleen aantallen en broncodevrije constructienamen.
//
// Gebruik: node --experimental-transform-types scripts/vba-proef.mjs
// (het script start zichzelf zo nodig opnieuw met die vlag).
import { spawnSync } from "node:child_process";

if (!process.execArgv.includes("--experimental-transform-types")) {
  const r = spawnSync(process.execPath, ["--experimental-transform-types", "--no-warnings", ...process.argv.slice(1)], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

const { createHash } = await import("node:crypto");
const { readFile, writeFile, access } = await import("node:fs/promises");
const { default: MDBReader } = await import("mdb-reader");
const { analyseerDatabase } = await import("../packages/database/src/access-analyse.ts");
const { parseerModule } = await import("../packages/vba/src/parser.ts");
const { scanAfscherming, statements, expressiesVan } = await import("../packages/vba/src/afscherming.ts");
const { VbaRuntime } = await import("../packages/vba/src/interpreter.ts");
const { DOCMD_ONDERSTEUND, isFormulierLid } = await import("../packages/vba/src/access.ts");
const { GEWEIGERDE_LEDEN } = await import("../packages/vba/src/afscherming.ts");

const manifesten = [
  process.env.CORPUS_MANIFEST ?? ".local/corpus/manifest.json",
  process.env.VBA_MANIFEST ?? ".local/corpus/access-vba/manifest.json",
];
const uitvoer = process.env.VBA_RAPPORT ?? ".local/vba-proef.json";
const bestaat = (p) => access(p).then(() => true, () => false);
const hash = async (pad) => createHash("sha256").update(await readFile(pad)).digest("hex");

const bestanden = [];
const gezien = new Set();
for (const pad of manifesten) {
  if (!(await bestaat(pad))) {
    console.log(`Manifest ontbreekt (overgeslagen): ${pad}`);
    continue;
  }
  const m = JSON.parse(await readFile(pad, "utf8"));
  for (const b of m.bestanden ?? []) {
    if (!/^(mdb|accdb)$/i.test(b.extensie ?? "") || b.status !== "opgehaald") continue;
    if (gezien.has(b.sha256 ?? b.id)) continue;
    gezien.add(b.sha256 ?? b.id);
    bestanden.push({ ...b, manifest: pad });
  }
}

// De bibliotheek van de runtime: om aanroepen van onbekende functies te tellen.
const rt = new VbaRuntime({});
const bekend = (naam) => !!rt.ingebouwd(naam) || rt.globalen.has(naam.toLowerCase());

const telling = {
  databases: bestanden.length,
  databasesGeopend: 0,
  databasesMetVba: 0,
  databasesZonderParseerfout: 0,
  modules: 0,
  modulesPerSoort: { module: 0, klasse: 0, formulier: 0 },
  regels: 0,
  modulesZonderFout: 0,
  regelsInFoutloze: 0,
  parseerfouten: 0,
  procedures: 0,
  // Procedures zonder bekende blokkade: geen afgeschermde constructie, geen niet-ondersteund
  // statement en geen aanroep van een functie die niet in project of bibliotheek staat.
  // (Statisch; zegt niets over DoCmd-acties die een host nodig hebben.)
  proceduresZonderBekendeBlokkade: 0,
};
const docmdLeden = new Map();
const eersteFout = new Map();
const alleFouten = new Map();
const afscherming = new Map();
const afschermingDatabases = new Map();
const nietOndersteund = new Map();
const onbekendeAanroepen = new Map(); // naam → Set(database)
const perDatabase = [];
const tel = (map, k, n = 1) => map.set(k, (map.get(k) ?? 0) + n);

const isDefinitie = (ast) => {
  const namen = new Set();
  for (const p of ast.procedures) {
    namen.add(p.naam.toLowerCase());
    for (const x of p.parameters) namen.add(x.naam.toLowerCase());
    for (const s of statements(p.body)) {
      if (s.k === "dim") for (const v of s.variabelen) namen.add(v.naam.toLowerCase());
      if (s.k === "const") for (const c of s.constanten) namen.add(c.naam.toLowerCase());
      if (s.k === "redim") for (const v of s.variabelen) if (v.doel.k === "id") namen.add(v.doel.naam.toLowerCase());
    }
  }
  for (const v of ast.variabelen) namen.add(v.naam.toLowerCase());
  for (const c of ast.constanten) namen.add(c.naam.toLowerCase());
  for (const d of ast.declares) namen.add(d.naam.toLowerCase());
  for (const e of ast.enums) for (const l of e.leden) namen.add(l.naam.toLowerCase());
  return namen;
};

for (const bestand of bestanden) {
  const voor = await hash(bestand.bestand);
  if (bestand.sha256 && voor !== bestand.sha256) throw new Error(`${bestand.id}: SHA-256 wijkt af van het manifest.`);
  const resultaat = { id: bestand.id, modules: 0, regels: 0, modulesZonderFout: 0, fouten: 0 };
  try {
    const buffer = await readFile(bestand.bestand);
    const bytes = new Uint8Array(buffer);
    const db = new MDBReader(buffer);
    const { objecten } = await analyseerDatabase(db, bytes, { naam: bestand.naam, grootte: bytes.byteLength });
    telling.databasesGeopend++;
    const modules = objecten.filter((o) => o.soort === "VBA" && typeof o.bron === "string");
    if (modules.length) telling.databasesMetVba++;
    const geparst = [];
    for (const o of modules) {
      const type = (o.eigenschappen ?? []).find(([k]) => k === "Moduletype")?.[1] ?? "";
      const soort = /standaard/i.test(type) ? "module" : /^(form|report)_/i.test(o.naam) ? "formulier" : "klasse";
      const { module, fouten, regels } = parseerModule(o.bron, o.naam, soort);
      geparst.push(module);
      telling.modules++;
      telling.modulesPerSoort[soort]++;
      telling.regels += regels;
      telling.procedures += module.procedures.length;
      resultaat.modules++;
      resultaat.regels += regels;
      if (!fouten.length) {
        telling.modulesZonderFout++;
        telling.regelsInFoutloze += regels;
        resultaat.modulesZonderFout++;
      } else {
        tel(eersteFout, fouten[0].constructie);
        for (const f of fouten) tel(alleFouten, f.constructie);
        telling.parseerfouten += fouten.length;
        resultaat.fouten += fouten.length;
      }
      for (const b of scanAfscherming(module)) {
        tel(afscherming, b.naam);
        if (!afschermingDatabases.has(b.naam)) afschermingDatabases.set(b.naam, new Set());
        afschermingDatabases.get(b.naam).add(bestand.id);
      }
      for (const p of module.procedures)
        for (const s of statements(p.body)) if (s.k === "nietondersteund") tel(nietOndersteund, s.wat);
    }
    // Aanroepen van functies die niet in het project staan en niet in de bibliotheek.
    const gedefinieerd = new Set();
    for (const m of geparst) {
      gedefinieerd.add(m.naam.toLowerCase());
      for (const n of isDefinitie(m)) gedefinieerd.add(n);
    }
    for (const m of geparst) {
      const bevindingen = scanAfscherming(m);
      for (const p of m.procedures) {
        let geblokkeerd = bevindingen.some((b) => b.regel >= p.regel && b.regel <= p.eindRegel);
        for (const s of statements(p.body)) {
          if (s.k === "nietondersteund") geblokkeerd = true;
          const kandidaten = [];
          if (s.k === "call" && s.doel.k === "id") kandidaten.push(s.doel.naam);
          for (const e of expressiesVan(s)) {
            if (e.k === "aanroep" && e.doel.k === "id") kandidaten.push(e.doel.naam);
            if (e.k === "lid" && e.obj?.k === "id" && e.obj.naam.toLowerCase() === "docmd") {
              const k = e.naam.toLowerCase();
              const x = docmdLeden.get(k) ?? { naam: e.naam, aantal: 0, ondersteund: DOCMD_ONDERSTEUND.has(k) ? "ja" : GEWEIGERDE_LEDEN.has(`docmd.${k}`) ? "afgeschermd" : "nee" };
              x.aantal++;
              docmdLeden.set(k, x);
            }
          }
          for (const naam of kandidaten) {
            const k = naam.toLowerCase();
            if (gedefinieerd.has(k) || bekend(k) || (m.soort === "formulier" && isFormulierLid(k))) continue;
            geblokkeerd = true;
            if (!onbekendeAanroepen.has(k)) onbekendeAanroepen.set(k, { naam, databases: new Set(), aantal: 0 });
            const x = onbekendeAanroepen.get(k);
            x.databases.add(bestand.id);
            x.aantal++;
          }
        }
        if (!geblokkeerd) telling.proceduresZonderBekendeBlokkade++;
      }
    }
    if (resultaat.modules && resultaat.modulesZonderFout === resultaat.modules) telling.databasesZonderParseerfout++;
  } catch (e) {
    resultaat.fout = String(e?.message ?? e).slice(0, 200);
  }
  const na = await hash(bestand.bestand);
  if (na !== voor) throw new Error(`${bestand.id}: bestand gewijzigd!`);
  if (resultaat.modules || resultaat.fout) perDatabase.push(resultaat);
}

const sorteer = (map, n = 25) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n);
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "–");
const samenvatting = {
  datum: new Date().toISOString(),
  ...telling,
  percentageModules: pct(telling.modulesZonderFout, telling.modules),
  percentageRegels: pct(telling.regelsInFoutloze, telling.regels),
  percentageProceduresZonderBekendeBlokkade: pct(telling.proceduresZonderBekendeBlokkade, telling.procedures),
  docmdLeden: Object.fromEntries([...docmdLeden.values()].sort((a, b) => b.aantal - a.aantal).map((x) => [x.naam, { aantal: x.aantal, ondersteund: x.ondersteund }])),
  eersteFoutPerModule: Object.fromEntries(sorteer(eersteFout)),
  alleParseerfouten: Object.fromEntries(sorteer(alleFouten)),
  nietUitvoerbareStatements: Object.fromEntries(sorteer(nietOndersteund)),
  afgeschermd: Object.fromEntries(sorteer(afscherming).map(([k, v]) => [k, { aantal: v, databases: afschermingDatabases.get(k).size }])),
  // Alleen namen die in minstens 3 verschillende databases voorkomen (bibliotheekfuncties, geen projectnamen).
  onbekendeFunctiesMinstens3Databases: Object.fromEntries(
    [...onbekendeAanroepen.values()]
      .filter((x) => x.databases.size >= 3)
      .sort((a, b) => b.databases.size - a.databases.size || b.aantal - a.aantal)
      .slice(0, 40)
      .map((x) => [x.naam, { aantal: x.aantal, databases: x.databases.size }]),
  ),
};
await writeFile(uitvoer, JSON.stringify({ samenvatting, perDatabase }, null, 2));
console.log(JSON.stringify(samenvatting, null, 2));
console.log(`Rapport: ${uitvoer}`);
