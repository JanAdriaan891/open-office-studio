// Uitvoerproef voor de VBA-runtime: kiest deterministisch 10 databases met VBA-bron uit het
// access-vba-corpus (verschillende repositories, veel procedures, werkkopie bouwbaar, niet
// versleuteld), bouwt per database in-proces een SQLite-werkkopie, laadt de modules, maakt de
// analyse van externe afhankelijkheden en voert daarna met `voerUitWatWerkt` (modus `overslaan`)
// alle publieke parameterloze procedures met status `uitvoerbaar` of `deels` uit.
//
// VEILIGHEID: alles draait in de eigen afgeschermde interpreter op de werkkopie, nooit in Access,
// LibreOffice of iets met echte COM/Shell/bestanden. Per procedure een transactie die wordt
// teruggedraaid; het origineel wordt voor en na gehasht.
//
// Het rapport (.local/vba-uitvoerproef.json) bevat geen broncode, geen databaseinhoud en geen
// paden of verbindingsreeksen: alleen namen van modules/procedures, aantallen, foutnummers en
// broncodevrije oorzaken.
//
// Gebruik: node scripts/vba-uitvoerproef.mjs   (start zichzelf met --experimental-transform-types)
//   VBA_PROEF_RAPPORT=pad   ander rapportpad
//   VBA_PROEF_AANTAL=10     aantal databases
import { spawnSync } from "node:child_process";

if (!process.execArgv.includes("--experimental-transform-types")) {
  const r = spawnSync(process.execPath, ["--experimental-transform-types", "--no-warnings", ...process.argv.slice(1)], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

const { createHash } = await import("node:crypto");
const { readFile, writeFile, access } = await import("node:fs/promises");
const { default: MDBReader } = await import("mdb-reader");
const { default: initSqlJs } = await import("sql.js");
const { analyseerDatabase, leesVbaVerwijzingen, herkenVersleuteling } = await import("../packages/database/src/access-analyse.ts");
const { modulesUitAnalyse } = await import("../packages/database/src/werkkopie/modules.ts");
const { openWerkkopie } = await import("../packages/database/src/werkkopie/werkkopie.ts");
const { koppelWerkkopie, werkkopieViaPoort } = await import("../packages/database/src/werkkopie/werkkopie-brug.ts");
const { parseerModule } = await import("../packages/vba/src/parser.ts");
const { VbaClient } = await import("../packages/vba/src/vba-client.ts");
const { startVbaWorker } = await import("../packages/vba/src/worker-kern.ts");
const { FOUTTEKSTEN } = await import("../packages/vba/src/fouten.ts");

const MANIFEST = process.env.VBA_MANIFEST ?? ".local/corpus/access-vba/manifest.json";
const RAPPORT = process.env.VBA_PROEF_RAPPORT ?? ".local/vba-uitvoerproef.json";
const AANTAL = Number(process.env.VBA_PROEF_AANTAL ?? 10);
const TIJDSLIMIET = 10_000;
const STAPPENLIMIET = 250_000;

const bestaat = (p) => access(p).then(() => true, () => false);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (!(await bestaat(MANIFEST))) {
  console.log(`Manifest ontbreekt: ${MANIFEST}`);
  process.exit(1);
}
const SQL = await initSqlJs();
const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));

// ---------- kiezen (deterministisch) ----------
const kandidaten = [];
for (const b of [...manifest.bestanden].sort((a, b) => a.id.localeCompare(b.id))) {
  if (b.status !== "opgehaald" || !/^(mdb|accdb)$/i.test(b.extensie ?? "") || !(b.vba?.modulesMetBron > 0)) continue;
  try {
    const bytes = new Uint8Array(await readFile(b.bestand));
    if (herkenVersleuteling(bytes)) continue;
    const reader = new MDBReader(Buffer.from(bytes));
    const { objecten } = await analyseerDatabase(reader, bytes, { naam: b.naam, grootte: bytes.byteLength });
    // "Veel procedures": vooral procedures die voerUitWatWerkt kan aanroepen
    // (publiek, Sub/Function zonder verplichte parameters, in een standaardmodule).
    let procedures = 0;
    let aanroepbaar = 0;
    for (const m of modulesUitAnalyse(objecten)) {
      const ast = parseerModule(m.bron, m.naam, m.soort).module;
      procedures += ast.procedures.length;
      if (m.soort === "module")
        aanroepbaar += ast.procedures.filter(
          (p) => (p.soort === "sub" || p.soort === "function") && p.zichtbaarheid !== "private" && p.parameters.every((x) => x.optioneel || x.paramArray),
        ).length;
    }
    kandidaten.push({ b, procedures, aanroepbaar });
  } catch {
    // niet te openen: geen kandidaat
  }
}
const perRepo = new Map();
for (const k of kandidaten) perRepo.set(k.b.bron, [...(perRepo.get(k.b.bron) ?? []), k]);
const repoVolgorde = [...perRepo.values()]
  .map((lijst) => lijst.sort((a, b) => b.aanroepbaar - a.aanroepbaar || b.procedures - a.procedures || a.b.id.localeCompare(b.b.id)))
  .sort((a, b) => b[0].aanroepbaar - a[0].aanroepbaar || b[0].procedures - a[0].procedures || a[0].b.id.localeCompare(b[0].b.id));
console.log(`${kandidaten.length} kandidaten uit ${perRepo.size} repositories.`);

// ---------- worker in hetzelfde proces ----------
function inProcesWorker() {
  const kanaal = new MessageChannel();
  const afbreken = new AbortController();
  startVbaWorker(
    kanaal.port2,
    async (p) => {
      p.start();
      return werkkopieViaPoort(p);
    },
    { signaal: afbreken.signal },
  );
  kanaal.port2.start();
  kanaal.port1.start();
  return {
    postMessage: (m, t) => kanaal.port1.postMessage(m, t ?? []),
    addEventListener: (type, f) => {
      if (type === "message") kanaal.port1.addEventListener("message", f);
    },
    terminate: () => {
      afbreken.abort();
      kanaal.port1.close();
      kanaal.port2.close();
    },
  };
}

/** Automatische antwoorden: eerste knop / vbOK, lege InputBox, DoCmd-gebeurtenissen alleen registreren. */
const EERSTE_KNOP = { 0: 1, 1: 1, 2: 3, 3: 6, 4: 6, 5: 4 };
const host = {
  msgBox: async ({ knoppen }) => EERSTE_KNOP[knoppen & 7] ?? 1,
  inputBox: async () => "",
  gebeurtenis: async () => undefined,
};

// ---------- broncodevrije oorzaken ----------
/** Maakt een melding broncode- en inhoudsvrij: aangehaalde namen, getallen en SQL eruit. */
function kaal(tekst) {
  return String(tekst)
    .replace(/‘[^’]*’/g, "‘…’")
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .replace(/\[[^\]]*\]/g, "[…]")
    .replace(/\d[\d.,]*/g, "n")
    .slice(0, 160);
}

function oorzaakVanFout(u) {
  const f = u.fout;
  if (!f) return null;
  if (f.soort === "runtime") {
    const n = f.nummer ?? 0;
    // Eigen fouten van de code (Err.Raise met eigen nummer) en de standaardtekst; nooit de eigen omschrijving.
    const label = FOUTTEKSTEN[n] ?? (n >= 3000 && n < 4000 ? "DAO-fout" : n >= 2000 && n < 3000 ? "Access-fout" : "eigen fout van de code");
    return { soort: "runtime", sleutel: `fout ${n} (${label})`, detail: kaal(f.omschrijving) };
  }
  if (f.soort === "afbreking") return { soort: f.reden ?? "afbreking", sleutel: `${f.reden}: ${kaal(f.omschrijving)}` };
  return { soort: f.soort, sleutel: `${f.soort}: ${kaal(f.omschrijving)}` };
}

/** Wijst een fout op een gebrek in ONZE runtime (en niet op een externe afhankelijkheid of de code zelf)? */
function isInterpreterGebrek(u) {
  const f = u.fout;
  if (!f) return false;
  if (f.soort === "intern" || f.soort === "parseer") return true;
  if (f.soort === "afbreking") return f.reden === "niet-ondersteund" || f.reden === "intern";
  // Runtimefouten die op een ontbrekend lid of een vertaalfout wijzen
  return [438, 3251, 3000, 3075].includes(f.nummer ?? -1);
}

// ---------- proef ----------
const resultaten = [];
const tel = (map, k, n = 1) => map.set(k, (map.get(k) ?? 0) + n);
for (const lijst of repoVolgorde) {
  if (resultaten.length >= AANTAL) break;
  let gekozen = null;
  for (const k of lijst) {
    const bytes = new Uint8Array(await readFile(k.b.bestand));
    const voor = sha(bytes);
    let werkkopie;
    let objecten;
    try {
      ({ objecten } = await analyseerDatabase(new MDBReader(Buffer.from(bytes)), bytes, { naam: k.b.naam, grootte: bytes.byteLength }));
      werkkopie = await openWerkkopie(SQL, new MDBReader(Buffer.from(bytes)), bytes, k.b.naam, { modules: modulesUitAnalyse(objecten) });
    } catch {
      continue;
    }
    gekozen = { k, bytes, voor, werkkopie, objecten };
    break;
  }
  if (!gekozen) continue;
  const { k, bytes, voor, werkkopie, objecten } = gekozen;
  const b = k.b;
  const begin = Date.now();
  const r = { id: b.id, repository: b.bron, procedures: k.procedures, aanroepbaar: k.aanroepbaar };
  console.log(`\n== ${b.id} (${k.procedures} procedures, ${k.aanroepbaar} aanroepbaar)`);
  try {
    const reader = new MDBReader(Buffer.from(bytes));
    const verwijzingen = leesVbaVerwijzingen(reader);
    const tabellen = new Set((await werkkopie.tabellen()).map((t) => t.naam.toLowerCase()));
    const gekoppeldeTabellen = objecten
      .filter((o) => o.soort === "Gekoppelde tabel")
      .map((o) => ({ naam: o.naam, bron: o.eigenschappen?.find(([e]) => e === "Soort")?.[1] ?? "gekoppeld", inWerkkopie: tabellen.has(o.naam.toLowerCase()) }));
    const modules = (await werkkopie.modules()).map((m) => ({ naam: m.naam, bron: m.bron, soort: m.soort }));
    r.modules = modules.length;

    const client = new VbaClient({
      maakWorker: inProcesWorker,
      werkkopiePoort: () => {
        const kn = new MessageChannel();
        kn.port1.start();
        koppelWerkkopie(werkkopie, kn.port1);
        return kn.port2;
      },
      tijdslimiet: TIJDSLIMIET,
      stappenlimiet: STAPPENLIMIET,
      host,
    });
    const laad = await client.laad(modules);
    r.parseerfouten = laad.fouten.length;
    const analyse = await client.analyseerExtern(verwijzingen, { gekoppeldeTabellen });
    r.analyse = {
      perStatus: analyse.samenvatting.perStatus,
      perOorzaak: analyse.samenvatting.perOorzaak,
      verwijzingen: analyse.verwijzingen.map((v) => ({ naam: v.naam, bibliotheek: v.bibliotheek, soort: v.soort, status: v.status, gebruiktDoor: v.gebruiktDoor.length })),
      gekoppeldeTabellen: analyse.gekoppeldeTabellen.length,
      afhankelijkheden: Object.fromEntries(
        [...analyse.afhankelijkheden.reduce((m, a) => tel(m, a.soort) && m, new Map())].sort((a, b) => b[1] - a[1]),
      ),
    };
    const samenvatting = await client.voerUitWatWerkt({ ontbrekend: "overslaan", metDeels: true, analyse, tijdslimiet: TIJDSLIMIET, stappenlimiet: STAPPENLIMIET });
    client.sluit();
    const statusPerProc = new Map(analyse.procedures.map((p) => [`${p.module}.${p.naam}`, p.status]));
    r.uitvoering = {
      kandidaten: samenvatting.kandidaten,
      geslaagd: samenvatting.geslaagd,
      fout: samenvatting.fout,
      tijdslimiet: samenvatting.tijdslimiet,
      gestopt: samenvatting.gestopt,
      metOvergeslagen: samenvatting.metOvergeslagen,
      teruggedraaid: samenvatting.teruggedraaid,
      perAnalyseStatus: {},
      nietUitgevoerd: Object.fromEntries(
        [...samenvatting.nietUitgevoerd.reduce((m, x) => tel(m, x.reden.replace(/^status /, "status ")) && m, new Map())],
      ),
    };
    for (const u of samenvatting.uitvoeringen) {
      const s = statusPerProc.get(`${u.module}.${u.procedure}`) ?? "?";
      const x = (r.uitvoering.perAnalyseStatus[s] ??= { geslaagd: 0, fout: 0, tijdslimiet: 0, gestopt: 0 });
      x[u.status]++;
    }
    r.details = samenvatting.uitvoeringen.map((u) => ({
      module: u.module,
      procedure: u.procedure,
      analyse: statusPerProc.get(`${u.module}.${u.procedure}`),
      status: u.status,
      stappen: u.stappen,
      duurMs: u.duurMs,
      overgeslagen: u.overgeslagen.map((o) => ({ wat: o.wat.replace(/["'].*$/, ""), categorie: o.categorie, regel: o.regel, aantal: o.aantal })),
      hostgebeurtenissen: u.hostgebeurtenissen.map((h) => h.naam ?? h.soort),
      uitvoerRegels: u.uitvoer.length,
      ...(u.fout ? { fout: { ...oorzaakVanFout(u), regel: u.fout.regel, module: u.fout.module, procedure: u.fout.procedure }, interpreterGebrek: isInterpreterGebrek(u) } : {}),
    }));
    r.ongewijzigdWerkkopie = !(await werkkopie.gewijzigd());
  } catch (e) {
    r.fout = kaal(e?.message ?? e);
  }
  await werkkopie.sluit();
  r.duurMs = Date.now() - begin;
  const na = sha(new Uint8Array(await readFile(b.bestand)));
  r.origineelOngewijzigd = na === voor && (!b.sha256 || b.sha256 === voor);
  if (!r.origineelOngewijzigd) throw new Error(`${b.id}: origineel gewijzigd!`);
  resultaten.push(r);
  console.log(JSON.stringify({ analyse: r.analyse?.perStatus, uitvoering: r.uitvoering && { ...r.uitvoering, nietUitgevoerd: undefined } }));
}

// ---------- samenvatting ----------
const totaal = { databases: resultaten.length, procedures: 0, perStatus: { uitvoerbaar: 0, deels: 0, niet: 0 }, kandidaten: 0, geslaagd: 0, fout: 0, tijdslimiet: 0, gestopt: 0, metOvergeslagen: 0 };
const oorzaken = new Map();
const verwijzingen = new Map();
const foutOorzaken = new Map();
const interpreter = new Map();
const overgeslagen = new Map();
for (const r of resultaten) {
  totaal.procedures += r.procedures;
  for (const s of ["uitvoerbaar", "deels", "niet"]) totaal.perStatus[s] += r.analyse?.perStatus[s] ?? 0;
  for (const s of ["kandidaten", "geslaagd", "fout", "tijdslimiet", "gestopt", "metOvergeslagen"]) totaal[s] += r.uitvoering?.[s] ?? 0;
  for (const [k, n] of Object.entries(r.analyse?.perOorzaak ?? {})) tel(oorzaken, k, n);
  for (const v of r.analyse?.verwijzingen ?? []) tel(verwijzingen, `${v.bibliotheek} (${v.status})`);
  for (const d of r.details ?? []) {
    for (const o of d.overgeslagen) tel(overgeslagen, `${o.categorie}: ${o.categorie === "onbekend" ? "(naam)" : o.wat}`);
    if (!d.fout) continue;
    tel(foutOorzaken, d.fout.sleutel);
    if (d.interpreterGebrek) tel(interpreter, d.fout.sleutel);
  }
}
const sorteer = (m, n = 40) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).slice(0, n));
const samenvatting = {
  datum: new Date().toISOString(),
  instellingen: { modus: "overslaan", metDeels: true, tijdslimietMs: TIJDSLIMIET, stappenlimiet: STAPPENLIMIET, terugdraaien: true },
  ...totaal,
  oorzakenAnalyse: sorteer(oorzaken),
  verwijzingen: sorteer(verwijzingen),
  foutoorzaken: sorteer(foutOorzaken),
  interpreterGebreken: sorteer(interpreter),
  overgeslagen: sorteer(overgeslagen),
};
await writeFile(RAPPORT, JSON.stringify({ samenvatting, databases: resultaten }, null, 2));
console.log(JSON.stringify(samenvatting, null, 2));
console.log(`Rapport: ${RAPPORT}`);
