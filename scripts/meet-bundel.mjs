// Bundelmeting voor issue #6: productiebuild in een aparte map, bytes per bestand/categorie/route,
// optioneel browserlaadtijd en -geheugen (headless Chromium via CDP), engine-initialisatie in Node
// en de servergebaseerde referentieroute (headless kantoorruntime) inclusief een eerste ODF-proef.
//
//   node scripts/meet-bundel.mjs                         # build + bytes + routes (manifest) + Node-engines
//   node scripts/meet-bundel.mjs --geen-build            # hergebruik .local/bundelmeting/dist
//   node scripts/meet-bundel.mjs --browser=/pad/naar/chrome [--herhaal=3]
//   node scripts/meet-bundel.mjs --server[=/usr/bin/soffice]
//
// Uitvoer: .local/bundelmeting/meting-<datum>.json en tabellen-<datum>.md. Er wordt niets in dist/ geschreven.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
  mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile, copyFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import { extname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { inhoud, tekstbehoud } from "./praktijkcorpus.mjs";

const MAP = ".local/bundelmeting";
const DIST = join(MAP, "dist");
const datum = new Date().toISOString().slice(0, 10);
const arg = (naam) => {
  const a = process.argv.find((x) => x === `--${naam}` || x.startsWith(`--${naam}=`));
  return a == null ? null : a.includes("=") ? a.split("=").slice(1).join("=") : true;
};
const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const kib = (n) => (n / 1024).toLocaleString("nl-NL", { maximumFractionDigits: 1 });
const mib = (n) => (n / 1048576).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mediaan = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

// --- Kindmodus: engine-initialisatie in een eigen proces (heap en RSS per engine) -------------
if (process.argv[2] === "--engine") {
  const soort = process.argv[3];
  const res = { soort, node: process.version };
  const geheugen = () => {
    globalThis.gc?.();
    const m = process.memoryUsage();
    return { rssMiB: +(m.rss / 1048576).toFixed(1), heapMiB: +(m.heapUsed / 1048576).toFixed(1), externMiB: +(m.external / 1048576).toFixed(1), arrayBuffersMiB: +(m.arrayBuffers / 1048576).toFixed(1) };
  };
  res.voor = geheugen();
  const t = (f) => async (...a) => { const s = performance.now(); const r = await f(...a); return [r, +(performance.now() - s).toFixed(1)]; };
  const sjabloon = await readFile(`public/templates/nieuw.${soort}`);
  const voorbeeld = await readFile(`docs/voorbeelden/${{ docx: "Ontwerpnotitie", xlsx: "Materiaaloverzicht", pptx: "Ontwerpvisie" }[soort]}.${soort}`);
  if (soort === "docx") {
    const [mod, laad] = await t(() => import("@betteroffice/docx/docx"))();
    res.moduleLadenMs = laad;
    const [, eerste] = await t(() => mod.parseDocx(sjabloon, { preloadFonts: false }))();
    res.eersteParseMs = eerste; // inclusief het lazy laden/compileren van de parse-WASM
    const [, tweede] = await t(() => mod.parseDocx(sjabloon, { preloadFonts: false }))();
    res.tweedeParseMs = tweede;
    const [doc, vb] = await t(() => mod.parseDocx(voorbeeld, { preloadFonts: false }))();
    res.voorbeeldOpenenMs = vb;
    const [, bew] = await t(async () => mod.repackDocx(doc))();
    res.voorbeeldBewarenMs = bew;
    res.wasm = [];
    for (const deel of ["parse/docx_parse_bg.wasm", "layout/docx_layout_bg.wasm", "edit/docx_edit_bg.wasm", "opc/ooxml_opc_bg.wasm"]) {
      const bytes = await readFile(`node_modules/@betteroffice/docx/dist/generated/${deel}`);
      const [, ms] = await t(() => WebAssembly.compile(bytes))();
      res.wasm.push({ deel, mib: +(bytes.length / 1048576).toFixed(2), compileMs: ms });
    }
  } else {
    const [engine, laad] = await t(() => import(`@betteroffice/${soort}`))();
    res.moduleLadenMs = laad;
    const bytes = await readFile(`node_modules/@betteroffice/${soort}/dist/generated/${soort}_wasm_bg.wasm`);
    const [, comp] = await t(() => WebAssembly.compile(bytes))();
    res.wasm = [{ deel: `${soort}_wasm_bg.wasm`, mib: +(bytes.length / 1048576).toFixed(2), compileMs: comp }];
    const [, init] = await t(() => engine.initWasm(bytes))();
    res.initWasmMs = init; // compileren + instantiëren (los van de compile hierboven)
    res.naInit = geheugen();
    const open = soort === "xlsx" ? engine.openWorkbook : engine.openPresentation;
    const [d1, o1] = await t(async () => open(sjabloon))();
    res.sjabloonOpenenMs = o1;
    d1.dispose?.();
    const [d2, o2] = await t(async () => open(voorbeeld))();
    res.voorbeeldOpenenMs = o2;
    const [, b2] = await t(async () => d2.save())();
    res.voorbeeldBewarenMs = b2;
    d2.dispose?.();
  }
  res.na = geheugen();
  // VmHWM i.p.v. ru_maxrss: Linux neemt ru_maxrss over van het ouderproces vóór execve.
  res.piekRssMiB = +(Number(readFileSync("/proc/self/status", "utf8").match(/VmHWM:\s+(\d+)/)[1]) / 1024).toFixed(1);
  process.stdout.write(JSON.stringify(res));
  process.exit(0);
}

// --- Omgeving ----------------------------------------------------------------------------------
function omgeving() {
  const uit = (c, a) => { try { return execFileSync(c, a, { encoding: "utf8" }).trim(); } catch { return null; } };
  const lscpu = uit("lscpu", []) ?? "";
  const veld = (n) => lscpu.match(new RegExp(`^${n}:\\s*(.+)$`, "m"))?.[1]?.trim();
  return {
    datum: new Date().toISOString(),
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    logischeCpus: os.cpus().length,
    maxMHz: veld("max. CPU-frequentie \\(MHz\\)") ?? veld("CPU max MHz"),
    geheugenGiB: +(os.totalmem() / 1073741824).toFixed(1),
    vrijGeheugenGiB: +(os.freemem() / 1073741824).toFixed(1),
    node: process.version,
    vite: JSON.parse(readFileSync("node_modules/vite/package.json", "utf8")).version,
    git: uit("git", ["rev-parse", "--short", "HEAD"]),
    gitSchoon: uit("git", ["status", "--porcelain"]) === "",
    lockfileSha256: existsSync("pnpm-lock.yaml") ? sha256(readFileSync("pnpm-lock.yaml")) : null,
  };
}

// --- Build -------------------------------------------------------------------------------------
async function bouw() {
  if (!existsSync("public/fonts") || !existsSync("public/voorbeelden"))
    execFileSync(process.execPath, ["scripts/kopieer-assets.mjs"], { stdio: "inherit" });
  const t = performance.now();
  // --manifest via de CLI: vite.config.ts blijft ongewijzigd; aparte uitvoermap, nooit dist/.
  execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--outDir", DIST, "--emptyOutDir", "--manifest", "--logLevel", "warn"], { stdio: "inherit" });
  return +((performance.now() - t) / 1000).toFixed(1);
}

// --- Bytes per bestand ------------------------------------------------------------------------
const categorie = (p) => {
  const e = extname(p).toLowerCase();
  if ([".js", ".mjs"].includes(e)) return "JS";
  if (e === ".css") return "CSS";
  if (e === ".wasm") return "WASM";
  if ([".ttf", ".otf", ".woff", ".woff2"].includes(e)) return "fonts";
  return "overig";
};
async function bestanden(map) {
  const uit = [];
  const loop = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== ".vite") await loop(p); }
      else uit.push(p);
    }
  };
  await loop(map);
  return uit.sort();
}
async function meetBytes(map) {
  const paden = await bestanden(map);
  const res = [];
  // Cache op inhoudshash: ongewijzigde bestanden (fonts, WASM) hoeven niet opnieuw met Brotli-11.
  const cachePad = join(MAP, "compressie-cache.json");
  const cache = existsSync(cachePad) ? JSON.parse(await readFile(cachePad, "utf8")) : {};
  // Per batch parallel in de libuv-threadpool; Brotli kwaliteit 11 (maximum), gzip niveau 9.
  for (let i = 0; i < paden.length; i += 8) {
    res.push(...(await Promise.all(paden.slice(i, i + 8).map(async (p) => {
      const b = await readFile(p);
      const hash = sha256(b);
      if (cache[hash]) return { pad: relative(map, p).split("\\").join("/"), categorie: categorie(p), raw: b.length, ...cache[hash], sha256: hash };
      const [g, br] = await Promise.all([
        gzip(b, { level: 9 }),
        brotli(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } }),
      ]);
      cache[hash] = { gzip: g.length, br: br.length };
      return { pad: relative(map, p).split("\\").join("/"), categorie: categorie(p), raw: b.length, gzip: g.length, br: br.length, sha256: hash };
    }))));
  }
  await writeFile(cachePad, JSON.stringify(cache));
  return res;
}
const som = (lijst) => lijst.reduce((a, f) => ({ n: a.n + 1, raw: a.raw + f.raw, gzip: a.gzip + f.gzip, br: a.br + f.br }), { n: 0, raw: 0, gzip: 0, br: 0 });
function perCategorie(lijst) {
  const uit = {};
  for (const c of ["JS", "CSS", "WASM", "fonts", "overig"]) uit[c] = som(lijst.filter((f) => f.categorie === c));
  uit.totaal = som(lijst);
  return uit;
}

// --- Routes volgens de Vite-manifest (statische bovengrens) ----------------------------------
async function routesUitManifest(perPad) {
  const m = JSON.parse(await readFile(join(DIST, ".vite/manifest.json"), "utf8"));
  const sluiting = (sleutel, gezien = new Set()) => {
    if (gezien.has(sleutel) || !m[sleutel]) return gezien;
    gezien.add(sleutel);
    for (const i of m[sleutel].imports ?? []) sluiting(i, gezien);
    return gezien;
  };
  const bestandenVan = (sleutels, metAssets) => {
    const s = new Set();
    for (const k of sleutels) {
      s.add(m[k].file);
      for (const c of m[k].css ?? []) s.add(c);
      if (metAssets) for (const a of m[k].assets ?? []) s.add(a);
    }
    return s;
  };
  const entry = Object.keys(m).find((k) => m[k].isEntry);
  const dyn = (patroon) => Object.keys(m).find((k) => m[k].isDynamicEntry && patroon.test(k + " " + m[k].file));
  const eerste = sluiting(entry);
  const eersteBestanden = new Set(["index.html", ...bestandenVan(eerste, false)]);
  // CSS-fonts van de entry (Inter/Space Grotesk, alle subsets): de browser haalt alleen wat hij nodig heeft.
  const eersteFontsMax = [...bestandenVan(eerste, true)].filter((f) => /\.(woff2?)$/.test(f));
  const editorSleutel = Object.keys(m).find((k) => m[k].isDynamicEntry && (m[k].dynamicImports ?? []).some((d) => /docx-react/.test(d)));
  const notitieSleutel = Object.keys(m).find((k) => /NotitiesStudio/.test(k) && m[k].isDynamicEntry);
  const nieuwVan = (sleutel) => [...bestandenVan(sluiting(sleutel), false)].filter((f) => !eersteBestanden.has(f));
  const wasmVan = (patroon) => Object.values(m).map((v) => v.file).filter((f) => f.endsWith(".wasm") && patroon.test(f));
  const worker = Object.keys(perPad).filter((p) => /database-worker-.*\.js$/.test(p));
  // Chunks die de databaseworker importeren (o.a. mdb-reader) worden in de worker geladen.
  for (const p of Object.keys(perPad))
    if (p.endsWith(".js") && /from"\.\/database-worker-/.test(readFileSync(join(DIST, p), "utf8").slice(0, 400))) worker.push(p);
  const routes = {
    eerste: { bestanden: [...eersteBestanden], opmerking: `entry ${m[entry].file} met statische imports en CSS; +${eersteFontsMax.length} woff/woff2-subsets uit de CSS (lazy, per unicode-bereik)`, optioneelFonts: eersteFontsMax },
    tekst: { bestanden: [...nieuwVan(editorSleutel), ...wasmVan(/docx_(edit|layout)/), ...Object.keys(perPad).filter((p) => /^assets\/wasm-[A-Z0-9]+-.*\.js$/.test(p))], opmerking: "gedeelde editorchunk (alle drie editors) + DOCX-WASM edit en layout (zoals in de browser gemeten; parse/opc worden niet opgehaald)" },
    rekenblad: { bestanden: [...nieuwVan(editorSleutel), ...wasmVan(/xlsx_wasm/)], opmerking: "gedeelde editorchunk + XLSX-WASM" },
    presentatie: { bestanden: [...nieuwVan(editorSleutel), ...wasmVan(/pptx_wasm/)], opmerking: "gedeelde editorchunk + PPTX-WASM" },
    notities: { bestanden: nieuwVan(notitieSleutel), opmerking: "NotitiesStudio-chunk met statische imports en CSS" },
    database: { bestanden: worker, opmerking: "DatabaseStudio zit in de entry; bij openen van een bestand komen de databaseworker en de mdb-reader-chunk erbij" },
  };
  for (const r of Object.values(routes)) r.som = som(r.bestanden.map((f) => perPad[f]).filter(Boolean));
  routes.eerste.somMetAlleFontsubsets = som([...routes.eerste.bestanden, ...eersteFontsMax].map((f) => perPad[f]).filter(Boolean));
  return { entry: m[entry].file, editorchunk: m[editorSleutel].file, routes };
}

// --- Browsermeting via Chrome DevTools Protocol (alleen als --browser is opgegeven) ----------
function statischeServer(map, poort = 0) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".docx": "application/octet-stream", ".xlsx": "application/octet-stream", ".pptx": "application/octet-stream", ".txt": "text/plain" };
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const pad = resolve(map, "." + p);
    if (!pad.startsWith(resolve(map))) return res.writeHead(403).end();
    try {
      const b = await readFile(pad);
      // Productieachtig: gehashte assets onveranderlijk cachen; overige bestanden (index.html, /fonts/,
      // /templates/) hervalideren met een ETag, zodat een warme lading 304-antwoorden krijgt.
      const etag = `"${sha256(b).slice(0, 16)}"`;
      if (req.headers["if-none-match"] === etag) return res.writeHead(304, { etag }).end();
      res.writeHead(200, { "content-type": types[extname(pad)] ?? "application/octet-stream", "cache-control": p.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache", etag, "content-length": b.length });
      res.end(b);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((k) => srv.listen(poort, "127.0.0.1", () => k(srv)));
}
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0; this.wacht = new Map(); this.luisteraars = [];
    this.ws.onmessage = (e) => {
      const b = JSON.parse(e.data);
      if (b.id && this.wacht.has(b.id)) { const [k, f] = this.wacht.get(b.id); this.wacht.delete(b.id); b.error ? f(new Error(b.error.message)) : k(b.result); }
      else for (const l of this.luisteraars) l(b);
    };
    this.open = new Promise((k, f) => { this.ws.onopen = k; this.ws.onerror = f; });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((k, f) => this.wacht.set(id, [k, f]));
  }
  on(f) { this.luisteraars.push(f); }
}
function rssBoom(wortel) {
  // Som van RSS over het Chromium-procesboom (browser, renderer, GPU, utility).
  const ouders = new Map();
  for (const d of readdirSync("/proc").filter((x) => /^\d+$/.test(x))) {
    try {
      const st = readFileSync(`/proc/${d}/stat`, "utf8");
      const ppid = Number(st.slice(st.lastIndexOf(")") + 2).split(" ")[1]);
      ouders.set(Number(d), ppid);
    } catch {}
  }
  const boom = new Set([wortel]);
  let groei = true;
  while (groei) { groei = false; for (const [p, pp] of ouders) if (!boom.has(p) && boom.has(pp)) { boom.add(p); groei = true; } }
  return boom;
}
async function rssVan(pids) {
  // PSS (proportionele set): gedeelde pagina's tussen Chromium-processen worden niet dubbel geteld.
  let som = 0;
  for (const p of pids) {
    try { som += Number((await readFile(`/proc/${p}/smaps_rollup`, "utf8")).match(/^Pss:\s+(\d+)/m)[1]) * 1024; } catch {}
  }
  return som;
}
async function browserScenario(chrome, basis, scenario, perPad) {
  const profiel = await mkdtemp(join(os.tmpdir(), "bundelmeting-chrome-"));
  const proces = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profiel}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-default-apps", "--window-size=1440,900", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((k, f) => {
    let buf = "";
    const t = setTimeout(() => f(new Error("Chromium start niet")), 20000);
    proces.stderr.on("data", (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); k(m[1]); } });
    proces.on("exit", (c) => f(new Error(`Chromium stopte (${c}): ${buf.slice(0, 400)}`)));
  });
  const poort = new URL(wsUrl).port;
  const doelen = await (await fetch(`http://127.0.0.1:${poort}/json/list`)).json();
  const cdp = new Cdp(doelen.find((d) => d.type === "page").webSocketDebuggerUrl);
  await cdp.open;
  const verzoeken = new Map();
  let huidigeStap = "start";
  let actief = 0, laatsteActiviteit = performance.now();
  const sessies = new Set();
  cdp.on(async (b) => {
    const p = b.params;
    if (b.method === "Page.javascriptDialogOpening") {
      await cdp.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    } else if (b.method === "Target.attachedToTarget") {
      // Workers (o.a. engine- en databaseworkers) halen zelf WASM op: ook hun netwerk volgen.
      sessies.add(p.sessionId);
      await cdp.send("Network.enable", {}, p.sessionId).catch(() => {});
      await cdp.send("Runtime.runIfWaitingForDebugger", {}, p.sessionId).catch(() => {});
    } else if (b.method === "Network.requestWillBeSent") {
      if (!verzoeken.has(p.requestId)) actief++;
      verzoeken.set(p.requestId, { url: p.request.url, start: performance.now(), stap: huidigeStap });
      laatsteActiviteit = performance.now();
    } else if (b.method === "Network.requestServedFromCache") {
      const v = verzoeken.get(p.requestId); if (v) v.cache = true;
    } else if (b.method === "Network.responseReceived") {
      const v = verzoeken.get(p.requestId); if (v) { v.status = p.response.status; v.cache = p.response.fromDiskCache || p.response.fromMemoryCache || p.response.status === 304; }
    } else if (b.method === "Network.loadingFinished" || b.method === "Network.loadingFailed") {
      const v = verzoeken.get(p.requestId);
      if (v && !v.klaar) { v.klaar = performance.now(); v.bytes = p.encodedDataLength ?? 0; v.mislukt = b.method === "Network.loadingFailed"; actief = Math.max(0, actief - 1); }
      laatsteActiviteit = performance.now();
    }
  });
  await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  await cdp.send("Network.enable");
  await cdp.send("Page.enable");
  await cdp.send("Performance.enable");
  await cdp.send("Runtime.enable");
  const pids = () => rssBoom(proces.pid);
  let piek = 0, boom = pids();
  const basisRss = await rssVan(boom);
  const sampler = setInterval(async () => { piek = Math.max(piek, await rssVan(boom)); }, 100);
  const boomVerversen = setInterval(() => { boom = pids(); }, 1000);
  const evalueer = async (expr) => (await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
  const wachtStil = async (stil = 1500, max = 90000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < max) {
      await new Promise((k) => setTimeout(k, 100));
      const bezig = await evalueer("!!document.querySelector('.office-loading')").catch(() => true);
      if (actief === 0 && !bezig && performance.now() - laatsteActiviteit > stil) return true;
    }
    return false;
  };
  const metingen = [];
  const voerUit = async (stap, actie, fase) => {
    huidigeStap = `${fase}:${stap}`;
    piek = await rssVan(boom);
    const t0 = performance.now();
    await actie();
    const stil = await wachtStil();
    const reqs = [...verzoeken.values()].filter((v) => v.stap === huidigeStap);
    const eind = Math.max(t0, ...reqs.map((v) => v.klaar ?? t0));
    const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    const fout = await evalueer("document.querySelector('.office-editorfout,[role=alert]')?.textContent?.slice(0,200) ?? null").catch(() => null);
    const pad = (v) => decodeURIComponent(new URL(v.url).pathname.slice(1)) || "index.html";
    const eigen = reqs.filter((v) => v.url.startsWith(basis));
    // CDP meldt cache-treffers niet altijd via fromDiskCache: bij de warme lading telt 0 bytes over de
    // lijn, of alleen headers (304) voor een groter bestand, ook als cache. Koud is het profiel leeg.
    if (fase === "warm") for (const v of eigen) if (v.bytes === 0 || ((perPad[pad(v)]?.raw ?? 0) > 4096 && v.bytes < 2048)) v.cache = true;
    const paden = eigen.map(pad);
    const uitCache = eigen.filter((v) => v.cache).length;
    // Bytes over de lijn: alleen wat niet uit de HTTP-cache kwam (warm: meestal alleen index.html).
    const overgedragen = eigen.filter((v) => !v.cache).map(pad);
    const geteld = som(overgedragen.map((p) => perPad[p]).filter(Boolean));
    metingen.push({
      detail: reqs.map((v) => ({ pad: v.url.startsWith(basis) ? pad(v) : v.url.slice(0, 40), status: v.status ?? null, cache: !!v.cache, bytes: v.bytes ?? 0 })),
      stap, fase, stilBereikt: stil, laatsteNetwerkMs: Math.round(eind - t0), verzoeken: eigen.length, uitCache,
      overdrachtBytes: reqs.reduce((a, v) => a + (v.bytes ?? 0), 0), bestanden: geteld,
      perCategorie: perCategorie(overgedragen.map((p) => perPad[p]).filter(Boolean)),
      geladenPerCategorie: perCategorie(paden.map((p) => perPad[p]).filter(Boolean)),
      paden, jsHeapGebruiktMiB: +(metrics.JSHeapUsedSize / 1048576).toFixed(1), jsHeapTotaalMiB: +(metrics.JSHeapTotalSize / 1048576).toFixed(1),
      piekRssMiB: +(piek / 1048576).toFixed(0), fout,
    });
  };
  const navigeer = async () => { await cdp.send("Page.navigate", { url: basis }); };
  for (const fase of ["koud", "warm"]) {
    await voerUit("eerste route", navigeer, fase);
    if (scenario.klik) {
      const sel = JSON.stringify(scenario.klik);
      await voerUit(scenario.naam, async () => {
        const ok = await evalueer(`(()=>{const k=document.querySelector(${sel}); if(!k) return false; k.click(); return true;})()`);
        if (!ok) throw new Error(`Knop ${scenario.klik} niet gevonden`);
        if (scenario.bestand) {
          // Database: bestand via het verborgen invoerveld aanbieden (geen dialoog in headless).
          await new Promise((k) => setTimeout(k, 500));
          const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
          const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type=file][accept=".mdb,.accdb"]' });
          await cdp.send("DOM.setFileInputFiles", { nodeId, files: [resolve(scenario.bestand)] });
        }
      }, fase);
      if (fase === "koud") {
        const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
        await writeFile(join(MAP, `scherm-${scenario.id}.png`), Buffer.from(shot.data, "base64"));
      }
    }
  }
  clearInterval(sampler); clearInterval(boomVerversen);
  proces.kill("SIGTERM");
  await new Promise((k) => proces.on("exit", k));
  await new Promise((k) => setTimeout(k, 500));
  await rm(profiel, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
  return { scenario: scenario.naam, basisRssMiB: +(basisRss / 1048576).toFixed(0), metingen };
}
async function meetBrowser(chrome, perPad, herhaal) {
  const srv = await statischeServer(DIST);
  const basis = `http://127.0.0.1:${srv.address().port}/`;
  const mdb = arg("database-bestand") || (existsSync(".local/corpus/bestanden") ? (await readdir(".local/corpus/bestanden")).filter((n) => n.endsWith(".mdb")).sort().map((n) => join(".local/corpus/bestanden", n))[0] : null);
  const scenario = [
    { id: "start", naam: "eerste route" },
    { id: "tekst", naam: "Tekst (nieuw)", klik: ".start-sjabloon.module-docx" },
    { id: "rekenblad", naam: "Rekenblad (nieuw)", klik: ".start-sjabloon.module-xlsx" },
    { id: "presentatie", naam: "Presentatie (nieuw)", klik: ".start-sjabloon.module-pptx" },
    { id: "tekst-vb", naam: "Tekst (voorbeeld)", klik: ".start-voorbeeldbestand.module-docx" },
    { id: "rekenblad-vb", naam: "Rekenblad (voorbeeld)", klik: ".start-voorbeeldbestand.module-xlsx" },
    { id: "presentatie-vb", naam: "Presentatie (voorbeeld)", klik: ".start-voorbeeldbestand.module-pptx" },
    { id: "notities", naam: "Notities", klik: ".start-notities" },
    { id: "database", naam: "Database (paneel)", klik: 'button[aria-label="Database Studio (experimenteel)"]' },
    ...(mdb ? [{ id: "database-mdb", naam: "Database (MDB openen)", klik: 'button[aria-label="Database Studio (experimenteel)"]', bestand: mdb }] : []),
  ];
  const filter = arg("scenario");
  const gekozen = typeof filter === "string" ? scenario.filter((s) => filter.split(",").includes(s.id)) : scenario;
  const resultaten = [];
  for (let i = 0; i < herhaal; i++)
    for (const s of gekozen) {
      process.stdout.write(`browser ${i + 1}/${herhaal}: ${s.naam}\n`);
      try { resultaten.push({ ronde: i + 1, ...(await browserScenario(chrome, basis, s, perPad)) }); }
      catch (e) { resultaten.push({ ronde: i + 1, scenario: s.naam, fout: String(e) }); }
    }
  srv.close();
  const versie = spawnSync(chrome, ["--version"], { encoding: "utf8" }).stdout.trim();
  return { chrome: versie, pad: chrome, databaseBestand: mdb ? { naam: mdb.split("/").pop(), bytes: (await stat(mdb)).size } : null, herhalingen: herhaal, resultaten };
}

// --- Serverroute (headless kantoorruntime) en ODF-proef ----------------------------------------
function tijdEnGeheugen(cmd, args) {
  const r = spawnSync("/usr/bin/time", ["-f", "TIJD=%e RSS=%M", cmd, ...args], { encoding: "utf8", timeout: 180000 });
  const m = r.stderr.match(/TIJD=([\d.]+) RSS=(\d+)/);
  return { code: r.status, s: m ? Number(m[1]) : null, maxRssMiB: m ? Math.round(Number(m[2]) / 1024) : null, fout: r.status ? r.stderr.slice(-300) : undefined };
}
async function meetServer(soffice) {
  const werk = resolve(MAP, "server");
  await rm(werk, { recursive: true, force: true });
  await mkdir(werk, { recursive: true });
  const profiel = (n) => `-env:UserInstallation=file://${join(werk, "profiel-" + n)}`;
  const converteer = (prof, doel, bron, uit) => tijdEnGeheugen(soffice, [prof, "--headless", "--norestore", "--nolockcheck", "--convert-to", doel, "--outdir", uit, bron]);
  const versie = spawnSync(soffice, ["--version"], { encoding: "utf8" }).stdout.trim();
  const voorbeelden = [
    { naam: "Ontwerpnotitie", ext: "docx", odf: "odt" },
    { naam: "Materiaaloverzicht", ext: "xlsx", odf: "ods" },
    { naam: "Ontwerpvisie", ext: "pptx", odf: "odp" },
  ];
  const res = { versie, programma: soffice, metingen: [], odf: [] };
  // Koude start: nieuw profiel per meting (inclusief profielaanmaak). Warm: hetzelfde profiel, mediaan van 3.
  for (const v of voorbeelden) {
    const bron = resolve("docs/voorbeelden", `${v.naam}.${v.ext}`);
    for (const [doel, label] of [[v.odf, `${v.ext}→${v.odf}`], ["pdf", `${v.ext}→pdf`]]) {
      const uit = join(werk, "uit");
      await mkdir(uit, { recursive: true });
      const koud = converteer(profiel(`koud-${v.naam}-${doel}`), doel, bron, uit);
      converteer(profiel("warm"), doel, bron, uit);
      const warm = [0, 1, 2].map(() => converteer(profiel("warm"), doel, bron, uit));
      res.metingen.push({ conversie: label, koudS: koud.s, koudMaxRssMiB: koud.maxRssMiB, warmMediaanS: mediaan(warm.map((w) => w.s)), warmMaxRssMiB: Math.max(...warm.map((w) => w.maxRssMiB ?? 0)), fouten: [koud, ...warm].filter((w) => w.code).length });
    }
  }
  // ODF-proef: OOXML -> ODF (export zoals "Opslaan als ODT/ODS/ODP"), ODF -> OOXML (import zoals de desktopapp),
  // daarna de geïmporteerde kopie openen/bewaren/heropenen met de echte engine van de app.
  for (const v of voorbeelden) {
    const bron = resolve("docs/voorbeelden", `${v.naam}.${v.ext}`);
    const map = join(werk, "odf", v.odf);
    await mkdir(join(map, "terug"), { recursive: true });
    const heen = converteer(profiel("warm"), v.odf, bron, map);
    const odfPad = join(map, `${v.naam}.${v.odf}`);
    const terug = converteer(profiel("warm"), v.ext, odfPad, join(map, "terug"));
    const terugPad = join(map, "terug", `${v.naam}.${v.ext}`);
    const r = { formaat: v.odf.toUpperCase(), bron: `${v.naam}.${v.ext}`, exportS: heen.s, importS: terug.s };
    try {
      const bronInhoud = inhoud(new Uint8Array(await readFile(bron)), v.ext);
      const odfBytes = new Uint8Array(await readFile(odfPad));
      r.odfBytes = odfBytes.length;
      r.odfMimetype = Buffer.from(odfBytes.slice(38, 38 + 60)).toString("latin1").match(/application\/vnd\.oasis\.opendocument\.[a-z]+/)?.[0] ?? null;
      r.tekstNaarOdf = tekstbehoud(bronInhoud, inhoud(odfBytes, v.odf));
      const terugInhoud = inhoud(new Uint8Array(await readFile(terugPad)), v.ext);
      r.tekstNaRoundtrip = tekstbehoud(bronInhoud, terugInhoud);
      if (v.ext === "xlsx") {
        const f = (x) => Object.entries(x).filter(([k]) => k.endsWith("#f")).map(([k, w]) => `${k}=${w}`).sort();
        const fb = f(bronInhoud), ft = f(terugInhoud);
        r.formules = { bron: fb.length, naRoundtrip: ft.length, gelijk: fb.filter((x) => ft.includes(x)).length };
        r.g17Waarde = terugInhoud["blad1!G17#v"] ?? null;
      }
      if (v.ext === "pptx") r.dias = { bron: bronInhoud["#dias"], odf: inhoud(odfBytes, "odp")["#dias"], naRoundtrip: terugInhoud["#dias"] };
      const pk = spawnSync("python3", ["scripts/vergelijk_pakketten.py", bron, terugPad], { encoding: "utf8" });
      try { const p = JSON.parse(pk.stdout); r.pakket = { exitcode: pk.status, gewijzigd: p.gewijzigd.length, verwijderd: p.verwijderd.length, toegevoegd: p.toegevoegd.length }; } catch { r.pakket = { exitcode: pk.status }; }
      // Engine-proef op de geïmporteerde kopie (zelfde kindproces als het praktijkcorpus).
      const kind = spawnSync(process.execPath, ["scripts/praktijkcorpus.mjs", "--kind", terugPad, v.ext, map, "odf"], { encoding: "utf8", timeout: 120000 });
      const i = kind.stdout.lastIndexOf("PRAKTIJK_RESULTAAT=");
      r.engine = i >= 0 ? { status: "ok", ...JSON.parse(kind.stdout.slice(i + 19)) } : { status: "fout", fout: kind.stderr.split("\n").find((x) => /Error/.test(x))?.slice(0, 200) };
      // En de door de engine bewerkte kopie opnieuw naar ODF (exportroute na bewerking).
      if (r.engine.status === "ok") {
        const naOdf = converteer(profiel("warm"), v.odf, join(map, `odf-bewerkt.${v.ext}`), join(map, "terug"));
        const odf2 = new Uint8Array(await readFile(join(map, "terug", `odf-bewerkt.${v.odf}`)));
        const t2 = inhoud(odf2, v.odf);
        r.bewerktNaarOdf = {
          s: naOdf.s,
          // Tekst/dia: markering terug te vinden; rekenblad: de nieuwe celwaarde staat als office:value in de ODS.
          bewerkingInOdf: r.engine.nieuweWaarde ? Object.entries(t2).some(([k, t]) => k.includes("#v") && t === r.engine.nieuweWaarde) : Object.values(t2).some((t) => t.includes("OpenAEC-proef")),
          tekst: tekstbehoud(bronInhoud, t2),
        };
      }
    } catch (e) { r.fout = String(e).slice(0, 300); }
    res.odf.push(r);
  }
  return res;
}

// --- Markdown-tabellen ------------------------------------------------------------------------
function tabellen(m) {
  const regels = [];
  const rij = (naam, s) => `| ${naam} | ${s.n} | ${kib(s.raw)} | ${kib(s.gzip)} | ${kib(s.br)} |`;
  regels.push("### Per categorie (hele build)", "", "| Categorie | Bestanden | Ruw (KiB) | gzip-9 (KiB) | Brotli-11 (KiB) |", "|---|---:|---:|---:|---:|");
  for (const [c, s] of Object.entries(m.categorieen)) regels.push(rij(c, s));
  regels.push("", "### Grootste bestanden", "", "| Bestand | Categorie | Ruw (KiB) | gzip-9 (KiB) | Brotli-11 (KiB) |", "|---|---|---:|---:|---:|");
  for (const f of [...m.bestanden].filter((f) => f.categorie !== "fonts").sort((a, b) => b.raw - a.raw).slice(0, 14)) regels.push(`| ${f.pad} | ${f.categorie} | ${kib(f.raw)} | ${kib(f.gzip)} | ${kib(f.br)} |`);
  regels.push("", "### Routes volgens manifest (statisch)", "", "| Route | Bestanden | Ruw (KiB) | gzip-9 (KiB) | Brotli-11 (KiB) | Toelichting |", "|---|---:|---:|---:|---:|---|");
  for (const [n, r] of Object.entries(m.routes.routes)) regels.push(`${rij(n, r.som)} ${r.opmerking} |`);
  if (m.browser) {
    regels.push("", `### Browser (${m.browser.chrome}, headless, lokale server, geen netwerkvertraging)`, "", "Bytes zijn de gemeten opgevraagde bestanden, opgezocht in de bestandstabel (de server comprimeert niet).", "", "| Scenario | Stap | Fase | Verzoeken | Ruw (KiB) | gzip-9 (KiB) | Brotli-11 (KiB) | WASM ruw (KiB) | Fonts ruw (KiB) | Uit cache | Tot laatste netwerk (ms) | JS-heap (MiB) | Piek-PSS (MiB) |", "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    const groepen = new Map();
    for (const r of m.browser.resultaten.filter((r) => r.metingen))
      for (const x of r.metingen) {
        const k = `${r.scenario}|${x.stap}|${x.fase}`;
        if (!groepen.has(k)) groepen.set(k, []);
        groepen.get(k).push(x);
      }
    for (const [k, xs] of groepen) {
      const [sc, stap, fase] = k.split("|");
      if (stap === "eerste route" && sc !== "eerste route") continue;
      const x = xs[0];
      regels.push(`| ${sc} | ${stap} | ${fase} | ${x.verzoeken} | ${kib(x.bestanden.raw)} | ${kib(x.bestanden.gzip)} | ${kib(x.bestanden.br)} | ${kib(x.perCategorie.WASM.raw)} | ${kib(x.perCategorie.fonts.raw)} | ${x.uitCache} | ${mediaan(xs.map((y) => y.laatsteNetwerkMs))} | ${mediaan(xs.map((y) => y.jsHeapGebruiktMiB))} | ${mediaan(xs.map((y) => y.piekRssMiB))} |`);
    }
  }
  if (m.engines) {
    regels.push("", "### Engines in Node", "", "| Engine | WASM (MiB) | compile (ms) | init/eerste parse (ms) | sjabloon openen (ms) | voorbeeld openen (ms) | piek-RSS (MiB) |", "|---|---|---|---:|---:|---:|---:|");
    for (const e of m.engines) regels.push(`| ${e.soort} | ${e.wasm?.map((w) => w.mib).join(" + ")} | ${e.wasm?.map((w) => w.compileMs).join(" + ")} | ${e.initWasmMs ?? e.eersteParseMs} | ${e.sjabloonOpenenMs ?? e.tweedeParseMs ?? "–"} | ${e.voorbeeldOpenenMs} | ${e.piekRssMiB} |`);
  }
  if (m.server) {
    regels.push("", `### Serverroute (${m.server.versie})`, "", "| Conversie | Koud (s) | Koud piek-RSS (MiB) | Warm mediaan (s) | Warm piek-RSS (MiB) | Fouten |", "|---|---:|---:|---:|---:|---:|");
    for (const s of m.server.metingen) regels.push(`| ${s.conversie} | ${s.koudS} | ${s.koudMaxRssMiB} | ${s.warmMediaanS} | ${s.warmMaxRssMiB} | ${s.fouten} |`);
  }
  return regels.join("\n");
}

// --- Hoofdprogramma -------------------------------------------------------------------------
await mkdir(MAP, { recursive: true });
const meting = { omgeving: omgeving() };
if (!arg("geen-build")) meting.buildS = await bouw();
meting.bestanden = await meetBytes(DIST);
const perPad = Object.fromEntries(meting.bestanden.map((f) => [f.pad, f]));
meting.categorieen = perCategorie(meting.bestanden);
const dubbel = new Map();
for (const f of meting.bestanden) dubbel.set(f.sha256, [...(dubbel.get(f.sha256) ?? []), f]);
meting.dubbeleInhoud = [...dubbel.values()].filter((l) => l.length > 1).map((l) => ({ paden: l.map((f) => f.pad), raw: l[0].raw }));
meting.dubbeleInhoudRaw = meting.dubbeleInhoud.reduce((a, d) => a + d.raw * (d.paden.length - 1), 0);
meting.routes = await routesUitManifest(perPad);
if (!arg("geen-engines")) {
  meting.engines = [];
  for (const soort of ["docx", "xlsx", "pptx"]) {
    const r = spawnSync(process.execPath, ["--expose-gc", "scripts/meet-bundel.mjs", "--engine", soort], { encoding: "utf8", timeout: 120000 });
    meting.engines.push(r.status === 0 ? JSON.parse(r.stdout) : { soort, fout: r.stderr.slice(0, 400) });
  }
}
const chrome = arg("browser");
if (chrome) meting.browser = await meetBrowser(chrome, perPad, Number(arg("herhaal") ?? 1));
const server = arg("server");
if (server) {
  const pad = server === true ? spawnSync("which", ["soffice"], { encoding: "utf8" }).stdout.trim() : server;
  meting.server = pad ? await meetServer(pad) : { status: "onbekend: geen headless kantoorruntime gevonden" };
}
await writeFile(join(MAP, `meting-${datum}.json`), JSON.stringify(meting, null, 2));
await writeFile(join(MAP, `tabellen-${datum}.md`), tabellen(meting));
console.log(tabellen(meting));
console.log(`\nJSON: ${join(MAP, `meting-${datum}.json`)}`);
