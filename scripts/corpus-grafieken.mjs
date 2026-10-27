import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

// Grafiekencorpus voor de grafiekfunctie (tonen, behouden, invoegen, bewerken in DOCX/XLSX/PPTX).
//
//   node scripts/corpus-grafieken.mjs verzamel   kandidaten zoeken, ophalen, kenmerken, 100 kiezen
//   node scripts/corpus-grafieken.mjs proef      rondgang met de echte engines + LibreOffice-referentie
//   node scripts/corpus-grafieken.mjs            beide
//
// Bronnen: eerst het bestaande corpus (.local/corpus/manifest.json), daarna openbare
// GitHub-repositories (geen forks) met testdata van Office-bibliotheken, telkens op een vaste
// commit. Alles blijft lokaal onder .local/corpus/grafieken/ (door Git genegeerd); het manifest
// en de proefuitkomst bevatten alleen herkomst, hashes, onderdeelnamen, aantallen en soorten.
// Er wordt niets uit de bestanden uitgevoerd; LibreOffice draait alleen headless als
// PDF-referentie, met een tijdelijk profiel waarin macro's volledig uitgeschakeld zijn.

const MAP = ".local/corpus/grafieken";
const CACHE = join(MAP, "kandidaten");
const BESTANDEN = join(MAP, "bestanden");
const MANIFEST = join(MAP, "manifest.json");
const PROEF = join(MAP, "proef.json");
const MAX_GROOTTE = 20 * 1024 * 1024;
const MAX_PER_REPO = Number(process.env.MAX_PER_REPO ?? 10);
const KANDIDATEN_PER_GROEP = Number(process.env.KANDIDATEN ?? 40);
const DOEL = { docx: 30, pptx: 35, xlsx: 35 };
const FORMATEN = Object.keys(DOEL);
const NAAMHINT = /chart|cht|graph|grafiek|diagram|plot|pie|bar|line|scatter|area|doughnut|radar|bubble|stock|combo|waterfall|funnel|sunburst|treemap|histogram|pareto|box/i;

const gh = promisify(execFile);
async function api(pad) {
  for (let poging = 0; ; poging++) {
    try {
      const { stdout } = await gh("gh", ["api", pad], {
        maxBuffer: 256 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch (fout) {
      const tekst = `${fout.stderr ?? ""} ${fout.message}`;
      if (/HTTP 404|HTTP 451|Repository access blocked/i.test(tekst)) return null;
      if (poging < 4) {
        await new Promise((k) => setTimeout(k, 10000 * (poging + 1)));
        continue;
      }
      throw new Error(`gh api ${pad}: ${tekst.trim().slice(0, 300)}`);
    }
  }
}
const gitHash = (bytes) =>
  createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rawUrl = (repo, revisie, pad, host = "raw.githubusercontent.com") =>
  `https://${host}/${host.startsWith("media") ? "media/" : ""}${repo}/${revisie}/${pad.split("/").map(encodeURIComponent).join("/")}`;

// Python-hulpscript voor kenmerken en vergelijking (alleen stdlib, alleen lezen).
function python(modus, invoer) {
  const uit = execFileSync(
    "python3",
    ["scripts/grafieken_kenmerken.py", modus],
    { input: JSON.stringify(invoer), maxBuffer: 512 * 1024 * 1024 },
  );
  return JSON.parse(uit.toString());
}

// GitHub-bronnen. `paden` beperkt de boom tot testdatamappen; bij zeer grote repositories
// (LibreOffice) wordt alleen de submap opgevraagd omdat de volledige boom afgekapt wordt.
const BRONNEN = [
  { repo: "scanny/python-pptx", kort: "python-pptx", paden: [""] },
  { repo: "python-openxml/python-docx", kort: "python-docx", paden: [""] },
  { repo: "LibreOffice/core", kort: "libreoffice", subbomen: ["chart2/qa/extras/data/docx", "chart2/qa/extras/data/xlsx", "chart2/qa/extras/data/pptx"] },
  { repo: "dotnet/Open-XML-SDK", kort: "openxml-sdk", paden: ["test/"] },
  { repo: "plutext/docx4j", kort: "docx4j", paden: [""] },
  { repo: "aspose-words/Aspose.Words-for-.NET", kort: "aspose-words", paden: [""] },
  { repo: "aspose-slides/Aspose.Slides-for-.NET", kort: "aspose-slides", paden: [""] },
  { repo: "aspose-cells/Aspose.Cells-for-.NET", kort: "aspose-cells", paden: [""] },
  { repo: "PHPOffice/PHPWord", kort: "phpword", paden: [""] },
  { repo: "PHPOffice/PHPPresentation", kort: "phppresentation", paden: [""] },
  { repo: "PHPOffice/PhpSpreadsheet", kort: "phpspreadsheet", paden: ["samples/", "tests/"] },
  { repo: "jmcnamara/XlsxWriter", kort: "xlsxwriter", paden: ["xlsxwriter/test/comparison/xlsx_files/"] },
  { repo: "jmcnamara/rust_xlsxwriter", kort: "rust-xlsxwriter", paden: ["tests/input/"] },
  { repo: "ClosedXML/ClosedXML", kort: "closedxml", paden: [""] },
  { repo: "ShapeCrawler/ShapeCrawler", kort: "shapecrawler", paden: [""] },
  { repo: "apache/tika", kort: "tika", paden: [""] },
  { repo: "exceljs/exceljs", kort: "exceljs", paden: [""] },
  { repo: "EPPlusSoftware/EPPlus", kort: "epplus", paden: [""] },
  { repo: "SyncfusionExamples/DocIO-Examples", kort: "syncfusion-docio", paden: [""] },
  { repo: "SyncfusionExamples/XlsIO-Examples", kort: "syncfusion-xlsio", paden: [""] },
  { repo: "SyncfusionExamples/PowerPoint-Examples", kort: "syncfusion-pptx", paden: [""] },
  { repo: "xceedsoftware/DocX", kort: "xceed-docx", paden: [""] },
  { repo: "nissl-lab/npoi", kort: "npoi", paden: [""] },
  { repo: "OpenXmlDev/Open-Xml-PowerTools", kort: "openxml-powertools", paden: [""] },
  { repo: "jgm/pandoc", kort: "pandoc", paden: [""] },
  { repo: "ONLYOFFICE/document-builder-samples", kort: "onlyoffice-builder", paden: [""] },
  { repo: "ONLYOFFICE/document-templates", kort: "onlyoffice-sjablonen", paden: [""] },
];

async function boomVan(bron, revisie) {
  if (!bron.subbomen) {
    const boom = await api(`repos/${bron.repo}/git/trees/${revisie}?recursive=1`);
    if (boom.truncated) throw new Error(`De boom van ${bron.repo} is afgekapt.`);
    return boom.tree.filter(
      (i) => i.type === "blob" && bron.paden.some((p) => i.path.startsWith(p)),
    );
  }
  const items = [];
  for (const sub of bron.subbomen) {
    // Loop vanaf de wortel naar de submap; elke stap is een niet-recursieve boom.
    let sha = revisie;
    for (const deel of sub.split("/")) {
      const boom = await api(`repos/${bron.repo}/git/trees/${sha}`);
      sha = boom.tree.find((i) => i.path === deel && i.type === "tree")?.sha;
      if (!sha) break;
    }
    if (!sha) continue;
    const boom = await api(`repos/${bron.repo}/git/trees/${sha}?recursive=1`);
    for (const i of boom.tree)
      if (i.type === "blob") items.push({ ...i, path: `${sub}/${i.path}` });
  }
  return items;
}

/** Gespreide, vaste steekproef: eerst bestanden met een grafiekachtige naam. */
function steekproef(items, n) {
  const kies = (lijst, k) =>
    lijst.length <= k
      ? lijst
      : Array.from({ length: k }, (_, i) => lijst[Math.floor((i * lijst.length) / k)]);
  const sorteer = (l) => [...l].sort((a, b) => a.path.localeCompare(b.path));
  const hint = sorteer(items.filter((i) => NAAMHINT.test(basename(i.path))));
  const rest = sorteer(items.filter((i) => !NAAMHINT.test(basename(i.path))));
  const a = kies(hint, n);
  return [...a, ...kies(rest, Math.max(0, n - a.length))];
}

async function haalOp(kandidaat) {
  let bytes;
  try {
    bytes = await readFile(kandidaat.cache);
    if (gitHash(bytes) === kandidaat.gitSha) return bytes;
  } catch {}
  const antwoord = await fetch(kandidaat.url, { signal: AbortSignal.timeout(60000) });
  if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status}`);
  bytes = Buffer.from(await antwoord.arrayBuffer());
  if (gitHash(bytes) !== kandidaat.gitSha)
    throw new Error("De download wijkt af van de vastgelegde bronrevisie.");
  const lfs = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize (\d+)/.exec(
    bytes.subarray(0, 300).toString(),
  );
  if (lfs) {
    // Git LFS-pointer: echte inhoud via media.githubusercontent.com, gecontroleerd op de SHA-256 uit de pointer.
    if (Number(lfs[2]) > MAX_GROOTTE) throw new Error("LFS-object groter dan 20 MB.");
    const media = await fetch(rawUrl(kandidaat.bron, kandidaat.revisie, kandidaat.pad, "media.githubusercontent.com"), {
      signal: AbortSignal.timeout(60000),
    });
    if (!media.ok) throw new Error(`LFS HTTP ${media.status}`);
    const echt = Buffer.from(await media.arrayBuffer());
    if (sha256(echt) !== lfs[1]) throw new Error("LFS-inhoud wijkt af van de pointer.");
    kandidaat.lfs = { oid: lfs[1], url: media.url };
    bytes = echt;
  }
  await writeFile(kandidaat.cache, bytes);
  return bytes;
}

const makerfamilie = (m) => {
  if (!m) return "onbekend";
  if (/LibreOffice|OpenOffice|NeoOffice/i.test(m)) return "LibreOffice";
  if (/Google/i.test(m)) return "Google";
  if (/ONLYOFFICE/i.test(m)) return "ONLYOFFICE";
  if (/WPS|Kingsoft/i.test(m)) return "WPS";
  if (/Microsoft|Excel|Word|PowerPoint/i.test(m)) return "Microsoft";
  if (/Apache POI/i.test(m)) return "Apache POI";
  return m.split(/[\s/]/)[0];
};

async function verzamel() {
  await mkdir(CACHE, { recursive: true });
  await mkdir(BESTANDEN, { recursive: true });
  const licenties = {};
  const licentie = async (repo) => {
    if (!(repo in licenties)) {
      const info = await api(`repos/${repo}`);
      if (info?.fork) throw new Error(`${repo} is een fork.`);
      const spdx = info?.license?.spdx_id;
      licenties[repo] = spdx && spdx !== "NOASSERTION" ? spdx : null;
    }
    return licenties[repo];
  };
  const kandidaten = [];

  // 1. Bestaand corpus (Apache POI, LibreOffice-steekproef, Jackcess).
  try {
    const oud = JSON.parse(await readFile(".local/corpus/manifest.json", "utf8"));
    for (const b of oud.bestanden)
      if (b.status === "opgehaald" && FORMATEN.includes(b.extensie) && b.grootte <= MAX_GROOTTE)
        kandidaten.push({
          bron: b.bron,
          kort: b.id.split("-")[0],
          revisie: b.revisie,
          pad: b.pad,
          extensie: b.extensie,
          grootte: b.grootte,
          gitSha: b.gitSha,
          url: b.url,
          cache: b.bestand,
          herkomst: "bestaand corpus",
        });
  } catch {
    console.log("Geen bestaand corpus gevonden; alleen GitHub-bronnen.");
  }

  // 2. GitHub-bronnen op een vaste commit van de standaardtak.
  for (const bron of BRONNEN) {
    const info = await api(`repos/${bron.repo}`);
    if (!info || info.fork) {
      console.log(`Overgeslagen: ${bron.repo} (niet bereikbaar of fork).`);
      continue;
    }
    const revisie = (await api(`repos/${bron.repo}/commits/${info.default_branch}`)).sha;
    const items = (await boomVan(bron, revisie)).filter(
      (i) => FORMATEN.includes(extname(i.path).slice(1).toLowerCase()) && i.size <= MAX_GROOTTE && i.size > 0,
    );
    for (const ext of FORMATEN) {
      const groep = items.filter((i) => extname(i.path).slice(1).toLowerCase() === ext);
      for (const i of steekproef(groep, KANDIDATEN_PER_GROEP))
        kandidaten.push({
          bron: bron.repo,
          kort: bron.kort,
          revisie,
          pad: i.path,
          extensie: ext,
          grootte: i.size,
          gitSha: i.sha,
          url: rawUrl(bron.repo, revisie, i.path),
          cache: join(CACHE, `${bron.kort}-${i.sha}.${ext}`),
          herkomst: "github",
        });
    }
    console.log(`${bron.repo}@${revisie.slice(0, 10)}: ${items.length} OOXML-bestanden in de testmappen.`);
  }
  // Dezelfde blob één keer.
  const uniek = [...new Map(kandidaten.map((k) => [k.gitSha, k])).values()];
  console.log(`${uniek.length} kandidaten; ophalen…`);

  let volgende = 0;
  async function werk() {
    while (volgende < uniek.length) {
      const k = uniek[volgende++];
      try {
        const bytes = await haalOp(k);
        k.grootte = bytes.length;
        k.sha256 = sha256(bytes);
        k.status = "opgehaald";
      } catch (fout) {
        k.status = "downloadfout";
        k.fout = String(fout?.message ?? fout).slice(0, 200);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, werk));

  // 3. Kenmerken (geldig pakket, versleuteld, aantal en soort grafieken) per kandidaat.
  const opgehaald = uniek.filter((k) => k.status === "opgehaald");
  const kenmerken = python("kenmerken", opgehaald.map((k) => k.cache));
  opgehaald.forEach((k, i) => (k.kenmerken = kenmerken[i]));
  const statistiek = {
    kandidaten: uniek.length,
    downloadfouten: uniek.filter((k) => k.status === "downloadfout").length,
    ongeldig: opgehaald.filter((k) => !k.kenmerken.geldig).length,
    versleuteld: opgehaald.filter((k) => k.kenmerken.versleuteld).length,
    zonderGrafiek: opgehaald.filter((k) => k.kenmerken.geldig && !k.kenmerken.grafieken).length,
    onleesbareGrafiek: opgehaald.filter((k) => k.kenmerken.onleesbareGrafieken?.length).length,
  };
  // Alleen geldige pakketten met minstens één leesbare grafiek, waarvan het formaat de extensie volgt.
  const geschikt = [
    ...new Map(
      opgehaald
        .filter(
          (k) =>
            k.kenmerken.geldig &&
            k.kenmerken.grafieken > 0 &&
            !k.kenmerken.onleesbareGrafieken.length &&
            k.kenmerken.formaat === k.extensie,
        )
        .map((k) => [k.sha256, k]),
    ).values(),
  ];
  statistiek.geschiktUniek = geschikt.length;

  // 4. Keuze: per formaat gretig op nieuwe grafieksoorten, makers en bronnen, max. MAX_PER_REPO per repository.
  // Om de beurt één bestand per formaat, zodat de repositorylimiet over de formaten verdeeld wordt.
  // Tellers per formaat: zeldzame soorten en makers wegen zwaarder dan al vaak gekozen.
  const perRepo = {};
  const gekozen = [];
  const staat = Object.fromEntries(
    FORMATEN.map((ext) => [ext, { soorten: new Map(), makers: new Map(), repos: new Map(), n: 0, klaar: false,
      pool: geschikt.filter((k) => k.extensie === ext) }]),
  );
  const plus = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  while (FORMATEN.some((ext) => !staat[ext].klaar)) {
    for (const ext of ["docx", "pptx", "xlsx"]) {
      const st = staat[ext];
      if (st.klaar) continue;
      let beste = null,
        score = -Infinity;
      for (const k of st.pool) {
        if (k.gekozen || (perRepo[k.bron] ?? 0) >= MAX_PER_REPO) continue;
        const km = k.kenmerken;
        const s =
          km.soorten.reduce((som, x) => som + 10 / (1 + (st.soorten.get(x) ?? 0)), 0) +
          12 / (1 + (st.makers.get(makerfamilie(km.maker)) ?? 0)) +
          (st.repos.has(k.bron) ? -2 * st.repos.get(k.bron) : 4) +
          (km.chartex ? 3 : 0) +
          (km.ingeslotenWerkboeken ? 1 : 0) +
          Math.min(km.grafieken, 4) * 0.1 -
          k.grootte / MAX_GROOTTE;
        if (s > score || (s === score && k.gitSha < beste.gitSha)) {
          beste = k;
          score = s;
        }
      }
      if (!beste) {
        st.klaar = true;
        continue;
      }
      beste.gekozen = true;
      gekozen.push(beste);
      perRepo[beste.bron] = (perRepo[beste.bron] ?? 0) + 1;
      plus(st.repos, beste.bron);
      beste.kenmerken.soorten.forEach((x) => plus(st.soorten, x));
      plus(st.makers, makerfamilie(beste.kenmerken.maker));
      if (++st.n >= DOEL[ext]) st.klaar = true;
    }
  }

  const bestanden = [];
  for (const k of gekozen) {
    const id = `${k.kort}-${k.gitSha.slice(0, 12)}`;
    const bestand = join(BESTANDEN, `${id}.${k.extensie}`);
    await copyFile(k.cache, bestand);
    const km = k.kenmerken;
    bestanden.push({
      id,
      bron: k.bron,
      revisie: k.revisie,
      pad: k.pad,
      naam: basename(k.pad),
      formaat: k.extensie,
      bestand,
      grootte: k.grootte,
      gitSha: k.gitSha,
      sha256: k.sha256,
      url: k.url,
      ...(k.lfs ? { lfs: k.lfs } : {}),
      licentie: await licentie(k.bron),
      licentieBron: `https://github.com/${k.bron}/tree/${k.revisie}`,
      herkomst: k.herkomst,
      maker: km.maker,
      makerfamilie: makerfamilie(km.maker),
      grafieken: km.grafieken,
      klassiek: km.klassiek,
      chartex: km.chartex,
      grafiekonderdelen: km.grafiekonderdelen,
      soorten: km.soorten,
      grafiekelementen: km.details,
      externalData: km.externalData,
      ingeslotenWerkboeken: km.ingeslotenWerkboeken,
      externGekoppeld: km.externGekoppeld,
      status: "geldig",
    });
  }
  bestanden.sort((a, b) => a.formaat.localeCompare(b.formaat) || a.id.localeCompare(b.id));
  // Oude bestanden die niet meer gekozen zijn, opruimen.
  const houden = new Set(bestanden.map((b) => basename(b.bestand)));
  for (const n of await readdir(BESTANDEN)) if (!houden.has(n)) await rm(join(BESTANDEN, n));

  const tel = (f) => Object.fromEntries(Object.entries(Object.groupBy(bestanden, f)).map(([k, v]) => [k, v.length]).sort());
  const manifest = {
    datum: new Date().toISOString(),
    beschrijving:
      "Grafiekencorpus (DrawingML c:chartSpace en cx:chartSpace) voor DOCX/XLSX/PPTX. Gebruik: per item `bestand` (pad vanaf de repositorywortel), `formaat` (docx|xlsx|pptx), `grafieken`, `grafiekonderdelen` en `soorten`.",
    soortenlegenda: {
      kolom: "c:barChart/c:bar3DChart met barDir=col",
      staaf: "c:barChart/c:bar3DChart met barDir=bar",
      lijn: "c:lineChart/c:line3DChart",
      taart: "c:pieChart/c:pie3DChart/c:ofPieChart",
      ring: "c:doughnutChart",
      vlak: "c:areaChart/c:area3DChart",
      spreiding: "c:scatterChart",
      bel: "c:bubbleChart",
      radar: "c:radarChart",
      koers: "c:stockChart",
      oppervlak: "c:surfaceChart/c:surface3DChart",
      "3d": "een *3DChart-element",
      gestapeld: "grouping=stacked",
      "gestapeld-100": "grouping=percentStacked",
      combinatie: "meer dan één grafiektype in één plotArea",
      draaigrafiek: "c:pivotSource aanwezig",
      chartex: "cx:chartSpace (Office 2016-grafiek); chartex:<layoutId> geeft de soort",
    },
    selectie: { doel: DOEL, maxPerRepo: MAX_PER_REPO, kandidatenPerGroep: KANDIDATEN_PER_GROEP, ...statistiek },
    aantallen: {
      formaat: tel((b) => b.formaat),
      bron: tel((b) => b.bron),
      maker: tel((b) => b.makerfamilie),
    },
    bestanden,
  };
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ ...manifest.selectie, ...manifest.aantallen }, null, 2));
}

// ---------- Proef ----------

// Macro's: hoogste beveiligingsniveau en uitvoering uitgeschakeld; geen netwerk (bwrap --unshare-net).
// DisableActiveContent staat hier bewust NIET aan: met die instelling breekt LibreOffice
// (gemeten met LibreOffice 24.2.7 op deze machine) de PDF-export van DOCX-bestanden met grafieken af met
// SIGABRT (exitcode 134), omdat grafieken in Writer als ingesloten objecten worden geladen.
const PROFIEL_XCU = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="SecureURL" oor:op="fuse"><value/></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>1</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Setup/Office"><prop oor:name="ooSetupInstCompleted" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="FirstRun" oor:op="fuse"><value>false</value></prop></item>
<item oor:path="/org.openoffice.Office.Recovery/RecoveryInfo"><prop oor:name="Enabled" oor:op="fuse"><value>false</value></prop></item>
</oor:items>
`;

/** Telt objecten met kind === "chart" in een gestructureerde export, zonder inhoud te bewaren. */
function telGrafiekobjecten(x) {
  let n = 0;
  const loop = (v) => {
    if (Array.isArray(v)) return v.forEach(loop);
    if (!v || typeof v !== "object") return;
    if (v.kind === "chart") n++;
    for (const w of Object.values(v)) if (w && typeof w === "object") loop(w);
  };
  loop(x);
  return n;
}

/** Telt grafiekknopen (type === "chart", niet genest) in het DOCX-documentmodel. */
function telModelgrafieken(x) {
  let n = 0;
  const loop = (v) => {
    if (Array.isArray(v)) return v.forEach(loop);
    if (!v || typeof v !== "object") return;
    if (v.type === "chart") return void n++;
    for (const w of Object.values(v)) if (w && typeof w === "object") loop(w);
  };
  loop(x);
  return n;
}

/** Kindproces: één bestand via alle engineroutes van dat formaat openen, opslaan en heropenen. */
async function rondgang(formaat, bron, uitPrefix) {
  const { readFile: lees } = await import("node:fs/promises");
  const bytes = new Uint8Array(await lees(bron));
  const routes = [];
  const meet = async (route, engine, f) => {
    const r = { route, engine, stap: "openen" };
    const t = performance.now();
    try {
      await f(r);
    } catch (fout) {
      r.fout = String(fout?.message ?? fout).slice(0, 300);
    }
    r.ms = Math.round(performance.now() - t);
    routes.push(r);
  };
  const versie = async (p) =>
    JSON.parse(await lees(`node_modules/@betteroffice/${p}/package.json`, "utf8")).version;
  if (formaat === "xlsx") {
    const xlsx = await import("@betteroffice/xlsx");
    await xlsx.initWasm(await lees("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
    await meet("xlsx-werkboek (openWorkbook/save)", `@betteroffice/xlsx ${await versie("xlsx")} (wasm ${xlsx.wasmVersion()})`, async (r) => {
      const boek = xlsx.openWorkbook(bytes);
      r.geopend = true;
      r.stap = "opslaan";
      const uit = boek.save();
      boek.dispose();
      r.opgeslagen = true;
      await writeFile(`${uitPrefix}.xlsx`, uit);
      r.uitvoer = `${uitPrefix}.xlsx`;
      r.stap = "heropenen";
      xlsx.openWorkbook(uit).dispose();
      r.heropend = true;
      r.stap = undefined;
      try {
        r.engineGrafiekenVoor = telGrafiekobjecten(await xlsx.exportXlsxStructured(bytes));
        r.engineGrafiekenNa = telGrafiekobjecten(await xlsx.exportXlsxStructured(uit));
      } catch (fout) {
        r.exportFout = String(fout?.message ?? fout).slice(0, 200);
      }
    });
  } else if (formaat === "pptx") {
    const pptx = await import("@betteroffice/pptx");
    await pptx.initWasm(await lees("node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm"));
    await meet("pptx-editor (openPresentation/save)", `@betteroffice/pptx ${await versie("pptx")} (wasm ${pptx.wasmVersion()})`, async (r) => {
      const deck = pptx.openPresentation(bytes);
      r.dias = deck.snapshot().slides.length;
      r.geopend = true;
      r.stap = "opslaan";
      const uit = deck.save();
      deck.dispose();
      r.opgeslagen = true;
      await writeFile(`${uitPrefix}.pptx`, uit);
      r.uitvoer = `${uitPrefix}.pptx`;
      r.stap = "heropenen";
      const terug = pptx.openPresentation(uit);
      r.heropend = terug.snapshot().slides.length === r.dias;
      terug.dispose();
      r.stap = undefined;
      try {
        r.engineGrafiekenVoor = telGrafiekobjecten(await pptx.exportPptxStructured(bytes));
        r.engineGrafiekenNa = telGrafiekobjecten(await pptx.exportPptxStructured(uit));
      } catch (fout) {
        r.exportFout = String(fout?.message ?? fout).slice(0, 200);
      }
    });
  } else {
    const { parseDocx, repackDocx } = await import("@betteroffice/docx/docx");
    const { createYrsSession, saveYrsDocx } = await import("@betteroffice/docx/yrs");
    const v = await versie("docx");
    await meet("docx-model (parseDocx/repackDocx)", `@betteroffice/docx ${v}`, async (r) => {
      const doc = await parseDocx(bytes, { preloadFonts: false });
      r.geopend = true;
      r.engineGrafiekenVoor = telModelgrafieken(doc.package.document.content);
      r.stap = "opslaan";
      const uit = new Uint8Array(await repackDocx(doc));
      r.opgeslagen = true;
      await writeFile(`${uitPrefix}-model.docx`, uit);
      r.uitvoer = `${uitPrefix}-model.docx`;
      r.stap = "heropenen";
      const terug = await parseDocx(uit, { preloadFonts: false });
      r.heropend = true;
      r.engineGrafiekenNa = telModelgrafieken(terug.package.document.content);
      r.stap = undefined;
    });
    await meet("docx-editor (YrsSession/saveYrsDocx)", `@betteroffice/docx ${v} (opslagkern van @betteroffice/docx-react)`, async (r) => {
      const sessie = await createYrsSession();
      sessie.openDocx(bytes, true);
      r.geopend = true;
      r.stap = "opslaan";
      const uit = (await saveYrsDocx(sessie)).bytes;
      sessie.destroy?.();
      r.opgeslagen = true;
      await writeFile(`${uitPrefix}-editor.docx`, uit);
      r.uitvoer = `${uitPrefix}-editor.docx`;
      r.stap = "heropenen";
      const terug = await createYrsSession();
      terug.openDocx(uit, true);
      terug.destroy?.();
      r.heropend = true;
      r.stap = undefined;
    });
  }
  return routes;
}

function voerUit(programma, args, timeoutMs, opties = {}) {
  return new Promise((klaar) => {
    const kind = spawn(programma, args, { stdio: ["ignore", "pipe", "pipe"], detached: true, ...opties });
    let uit = "",
      fout = "",
      teLang = false;
    kind.stdout.on("data", (b) => {
      if (uit.length < 1e6) uit += b;
    });
    kind.stderr.on("data", (b) => {
      if (fout.length < 4000) fout += b;
    });
    const timer = setTimeout(() => {
      teLang = true;
      try {
        process.kill(-kind.pid, "SIGKILL");
      } catch {}
    }, timeoutMs);
    kind.on("close", (code, signaal) => {
      clearTimeout(timer);
      klaar({ code, signaal, uit, fout, teLang });
    });
  });
}

async function proef() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const uitMap = join(MAP, "uitvoer");
  await rm(uitMap, { recursive: true, force: true });
  await mkdir(uitMap, { recursive: true });
  const resultaten = [];
  let volgende = 0;
  async function werk() {
    while (volgende < manifest.bestanden.length) {
      const b = manifest.bestanden[volgende++];
      const r = await voerUit(
        process.execPath,
        ["scripts/corpus-grafieken.mjs", "__rondgang", b.formaat, b.bestand, join(uitMap, b.id)],
        180000,
      );
      let routes;
      try {
        routes = JSON.parse(r.uit.trim().split("\n").at(-1));
      } catch {
        routes = [{ route: "kindproces", fout: r.teLang ? "tijdslimiet (180 s)" : `afgebroken (code ${r.code}, ${r.signaal ?? ""}) ${r.fout.slice(-200)}` }];
      }
      resultaten.push({ id: b.id, formaat: b.formaat, bestand: b.bestand, sha256: b.sha256, grafieken: b.grafieken, soorten: b.soorten, routes });
    }
  }
  await Promise.all(Array.from({ length: 4 }, werk));
  resultaten.sort((a, b) => a.id.localeCompare(b.id));

  // Pakketvergelijking: blijven grafiekonderdelen, hun relaties en externalData/ingesloten werkboeken behouden?
  const paren = [];
  for (const r of resultaten)
    for (const route of r.routes) if (route.uitvoer) paren.push([r.bestand, route.uitvoer, route]);
  const vergelijking = python("vergelijk", paren.map(([a, b]) => [a, b]));
  paren.forEach(([, , route], i) => (route.vergelijking = vergelijking[i]));

  // LibreOffice-referentie: origineel naar PDF, alleen om te tellen of het leesbaar is.
  const lo = await libreofficeReferentie(manifest.bestanden);
  for (const r of resultaten) r.libreoffice = lo[r.id];

  // Samenvatting per formaat en route.
  const samenvatting = {};
  for (const r of resultaten) {
    const s = (samenvatting[r.formaat] ??= { bestanden: 0, grafieken: 0, libreofficeLeesbaar: 0, routes: {} });
    s.bestanden++;
    s.grafieken += r.grafieken;
    if (r.libreoffice?.paginas > 0) s.libreofficeLeesbaar++;
    for (const route of r.routes) {
      const t = (s.routes[route.route] ??= {
        geopend: 0, opgeslagen: 0, heropend: 0, grafiekenBehouden: 0, byteIdentiek: 0,
        bestandenMetVerlies: 0, verlorenOnderdelen: 0, gewijzigdeOnderdelen: 0,
        grafiekenVoor: 0, grafiekenNa: 0, externalDataVoor: 0, externalDataNa: 0,
        ingeslotenVoor: 0, ingeslotenNa: 0, engineFouten: 0, engineGrafiekenVoor: 0, engineGrafiekenNa: 0,
        fouten: {},
      });
      t.geopend += !!route.geopend;
      t.opgeslagen += !!route.opgeslagen;
      t.heropend += !!route.heropend;
      if (route.fout) {
        t.engineFouten++;
        const sleutel = `${route.stap ?? "?"}: ${route.fout.replace(/\d+/g, "#").slice(0, 120)}`;
        t.fouten[sleutel] = (t.fouten[sleutel] ?? 0) + 1;
      }
      t.engineGrafiekenVoor += route.engineGrafiekenVoor ?? 0;
      t.engineGrafiekenNa += route.engineGrafiekenNa ?? 0;
      const v = route.vergelijking;
      if (v && !v.fout) {
        t.grafiekenBehouden += !!v.behouden;
        t.byteIdentiek += !!v.byteIdentiek;
        t.bestandenMetVerlies += !v.behouden;
        t.verlorenOnderdelen += Math.max(v.verloren.length, Object.values(v.tekortPerRol).reduce((a, b) => a + b, 0));
        t.gewijzigdeOnderdelen += v.gewijzigd.length;
        t.grafiekenVoor += v.grafiekenVoor;
        t.grafiekenNa += v.grafiekenNa;
        t.externalDataVoor += v.externalDataVoor;
        t.externalDataNa += v.externalDataNa;
        t.ingeslotenVoor += v.ingeslotenVoor;
        t.ingeslotenNa += v.ingeslotenNa;
      }
    }
  }
  const versies = {};
  for (const p of ["docx", "docx-react", "pptx", "pptx-react", "xlsx", "xlsx-react"])
    versies[`@betteroffice/${p}`] = JSON.parse(await readFile(`node_modules/@betteroffice/${p}/package.json`, "utf8")).version;
  let soffice = null;
  try {
    soffice = execFileSync("soffice", ["--version"], { timeout: 60000 }).toString().trim();
  } catch {}
  const uitkomst = { datum: new Date().toISOString(), versies, libreoffice: soffice, samenvatting, resultaten };
  await writeFile(PROEF, JSON.stringify(uitkomst, null, 2) + "\n");
  console.log(JSON.stringify(samenvatting, null, 2));
}

async function libreofficeReferentie(bestanden) {
  const uit = {};
  let bwrap = false;
  try {
    execFileSync("which", ["bwrap"], { stdio: "ignore" });
    bwrap = true;
  } catch {}
  const werkbasis = resolve(MAP, "libreoffice");
  await rm(werkbasis, { recursive: true, force: true });
  await mkdir(werkbasis, { recursive: true });
  const groepen = [];
  for (let i = 0; i < bestanden.length; i += 10) groepen.push(bestanden.slice(i, i + 10));
  // Eerst in groepen van tien; wat daarin geen PDF oplevert (bijv. omdat één bestand het proces
  // laat vastlopen of afbreken), wordt daarna per bestand opnieuw geprobeerd.
  const converteer = async (groep, timeoutMs) => {
    const werkmap = await mkdtemp(join(werkbasis, "groep-"));
    const profiel = join(werkmap, "profiel");
    const pdf = join(werkmap, "pdf");
    await mkdir(join(profiel, "user"), { recursive: true });
    await mkdir(pdf);
    await writeFile(join(profiel, "user", "registrymodifications.xcu"), PROFIEL_XCU);
    const lo = [
      `-env:UserInstallation=${pathToFileURL(profiel).href}`,
      "--headless", "--nologo", "--nodefault", "--norestore", "--nolockcheck",
      "--convert-to", "pdf", "--outdir", pdf,
      ...groep.map((b) => resolve(b.bestand)),
    ];
    const args = bwrap
      ? ["--unshare-net", "--die-with-parent", "--ro-bind", "/", "/", "--bind", werkmap, werkmap, "--tmpfs", "/tmp", "--dev", "/dev", "--proc", "/proc", "/usr/bin/soffice", ...lo]
      : lo;
    const r = await voerUit(bwrap ? "bwrap" : "/usr/bin/soffice", args, timeoutMs);
    for (const b of groep) {
      const pad = join(pdf, `${b.id}.pdf`);
      try {
        const tekst = (await readFile(pad)).toString("latin1");
        uit[b.id] = { paginas: (tekst.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length, pdfBytes: (await stat(pad)).size, sandbox: bwrap, groep: groep.length };
      } catch {
        uit[b.id] = {
          paginas: 0,
          fout: r.teLang ? "tijdslimiet" : `geen PDF (exitcode ${r.code}${r.signaal ? ", " + r.signaal : ""})`,
          sandbox: bwrap,
          groep: groep.length,
        };
      }
    }
  };
  for (const groep of groepen) await converteer(groep, 600000);
  for (const b of bestanden) if (!(uit[b.id]?.paginas > 0)) await converteer([b], 180000);
  return uit;
}

const opdracht = process.argv[2] ?? "alles";
if (opdracht === "__rondgang") {
  const [, , , formaat, bron, uitPrefix] = process.argv;
  const routes = await rondgang(formaat, bron, uitPrefix);
  process.stdout.write("\n" + JSON.stringify(routes) + "\n");
  process.exit(0);
}
if (opdracht === "verzamel" || opdracht === "alles") await verzamel();
if (opdracht === "proef" || opdracht === "alles") await proef();
