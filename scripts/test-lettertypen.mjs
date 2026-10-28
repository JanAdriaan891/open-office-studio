#!/usr/bin/env node
/**
 * Proef voor de extra lettertypen (assets/lettertypen.json).
 *
 * 1. Altijd: elk bestand in de cache en in public/fonts/extra heeft de sha256
 *    uit het manifest; met fc-scan ook: geldig TrueType/OpenType, statisch
 *    (geen variabel lettertype), en familie, gewicht en stijl kloppen.
 * 2. Als er een Chromium is: de app draait in een eigen Vite-server (poort
 *    LETTERTYPE_POORT, standaard 1462, zonder bestandsbewaking). Per familie
 *    wordt een DOCX en een PPTX gemaakt waarin alle tekst dat lettertype heeft
 *    (afgeleid van docs/voorbeelden), in de app geopend en via de PDF-route van
 *    Opslaan als (engine-rendering) naar PDF gezet. Gecontroleerd: de app
 *    haalde het lettertypebestand op, pdftotext vindt de tekst, pdffonts toont
 *    de tekstlaag, en pagina 1 tekent zichtbaar anders dan dezelfde tekst in
 *    Liberation Sans (dus het lettertype is echt gebruikt).
 *
 * Uitvoer in .local/lettertypen-proef/. Gebruik: node scripts/test-lettertypen.mjs
 * [familie …]   (zonder namen: alle families). CHROME_PAD kiest de browser.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { CACHE, DOEL, leesManifest, slug } from "./haal-lettertypen.mjs";

const UIT = ".local/lettertypen-proef";
mkdirSync(UIT, { recursive: true });
const fouten = [];
const meld = (t) => console.log(t);
const heeft = (p) => spawnSync("sh", ["-c", `command -v ${p}`]).status === 0;
const sha256 = (d) => createHash("sha256").update(d).digest("hex");

const manifest = await leesManifest();
const gevraagd = process.argv.slice(2);
const families = manifest.families.filter((f) => !gevraagd.length || gevraagd.includes(f.familie));

// ------------------------------------------------------------ 1. bestanden
{
  const fc = heeft("fc-scan");
  let aantal = 0;
  let bytes = 0;
  for (const f of families)
    for (const b of f.bestanden) {
      for (const map of [CACHE, DOEL]) {
        const pad = join(map, b.bestand);
        if (!existsSync(pad)) {
          fouten.push(`${pad} ontbreekt (node scripts/haal-lettertypen.mjs)`);
          continue;
        }
        if (sha256(readFileSync(pad)) !== b.sha256) fouten.push(`${pad}: sha256 klopt niet`);
      }
      const pad = join(DOEL, b.bestand);
      if (fc && existsSync(pad)) {
        const r = spawnSync("fc-scan", ["--format", "%{family[0]}|%{weight}|%{slant}|%{fontformat}|%{variable}\n", pad], {
          encoding: "utf8",
        });
        const [familie, gewicht, schuin, formaat, variabel] = r.stdout.trim().split("\n")[0].split("|");
        if (familie !== f.familie) fouten.push(`${b.bestand}: familie "${familie}" ≠ "${f.familie}"`);
        if (!/TrueType|CFF/.test(formaat)) fouten.push(`${b.bestand}: geen TrueType/OpenType (${formaat})`);
        if (variabel === "True") fouten.push(`${b.bestand}: variabel lettertype`);
        if ((Number(gewicht) >= 150) !== (b.gewicht === 700)) fouten.push(`${b.bestand}: gewicht ${gewicht} past niet bij ${b.gewicht}`);
        if ((Number(schuin) > 0) !== (b.stijl === "italic")) fouten.push(`${b.bestand}: stijl past niet bij ${b.stijl}`);
      }
      aantal++;
      bytes += b.grootte;
    }
  meld(`✓ ${aantal} lettertypebestanden van ${families.length} families gecontroleerd (${(bytes / 1048576).toFixed(1)} MB)${fc ? " met fc-scan" : ""}`);
}

// ------------------------------------------------------------ 2. documenten
function docxMet(familie) {
  const z = unzipSync(new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpnotitie.docx")));
  for (const naam of Object.keys(z)) {
    if (!/^word\/(document|styles|numbering|header\d*|footer\d*)\.xml$|^word\/theme\/theme\d+\.xml$/.test(naam)) continue;
    let xml = strFromU8(z[naam]);
    xml = xml
      .replace(/\sw:(ascii|hAnsi|cs|eastAsia)Theme="[^"]*"/g, "")
      .replace(/\sw:(ascii|hAnsi|cs|eastAsia)="[^"]*"/g, ` w:$1="${familie}"`)
      .replace(/<w:rFonts\s*\/>/g, `<w:rFonts w:ascii="${familie}" w:hAnsi="${familie}"/>`)
      .replace(/(<a:(?:major|minor)Font>\s*<a:latin\s+typeface=")[^"]*"/g, `$1${familie}"`);
    z[naam] = strToU8(xml);
  }
  return zipSync(z);
}
function pptxMet(familie) {
  const z = unzipSync(new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx")));
  for (const naam of Object.keys(z)) {
    if (!/^ppt\/(slides\/slide|slideLayouts\/slideLayout|slideMasters\/slideMaster|theme\/theme)\d+\.xml$/.test(naam)) continue;
    z[naam] = strToU8(strFromU8(z[naam]).replace(/(<a:latin\s+typeface=")[^"]*"/g, `$1${familie}"`));
  }
  return zipSync(z);
}

function zoekChrome() {
  if (process.env.CHROME_PAD && existsSync(process.env.CHROME_PAD)) return process.env.CHROME_PAD;
  const basis = join(homedir(), ".cache/ms-playwright");
  if (existsSync(basis))
    for (const map of readdirSync(basis).sort().reverse())
      for (const k of [join(basis, map, "chrome-linux64/chrome"), join(basis, map, "chrome-headless-shell-linux64/chrome-headless-shell")])
        if (existsSync(k)) return k;
  for (const naam of ["chromium", "chromium-browser", "google-chrome"]) if (heeft(naam)) return naam;
  return null;
}

const chrome = zoekChrome();
if (!chrome || typeof WebSocket === "undefined" || !heeft("pdftotext")) {
  meld("• Geen Chromium/WebSocket of pdftotext: de proef in de app is overgeslagen.");
  afsluiten();
}

const POORT = Number(process.env.LETTERTYPE_POORT ?? 1462);
const CDP_POORT = POORT + 1000;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
async function wachtOp(url, pogingen = 240) {
  for (let i = 0; i < pogingen; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
    } catch {
      // nog niet klaar
    }
    await wacht(250);
  }
  throw new Error(`${url} reageert niet`);
}

// Vite zonder bestandsbewaking: grote werkmappen raken anders de inotify-grens.
const configPad = join(UIT, "vite.proef.config.mjs");
writeFileSync(
  configPad,
  `import basis from "../../vite.config.ts";\nexport default { ...basis, root: ${JSON.stringify(process.cwd())}, server: { ...basis.server, watch: null } };\n`,
);
const vite = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--config", configPad, "--host", "127.0.0.1", "--port", String(POORT), "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
const profiel = join(tmpdir(), `oos-lettertypen-proef-${process.pid}`);
const browser = spawn(
  chrome,
  ["--headless=new", `--remote-debugging-port=${CDP_POORT}`, `--user-data-dir=${profiel}`, "--no-first-run", "--window-size=1400,900", "about:blank"],
  { stdio: "ignore" },
);
const opruimen = () => {
  vite.kill();
  browser.kill();
  try {
    rmSync(profiel, { recursive: true, force: true });
  } catch {
    // laat staan
  }
};
process.on("exit", opruimen);

function pagina1(pad, naam) {
  const basis = join(UIT, naam);
  spawnSync("pdftoppm", ["-f", "1", "-l", "1", "-r", "40", "-gray", "-singlefile", pad, basis]);
  const data = readFileSync(`${basis}.pgm`);
  const kop = data.subarray(0, 64).toString("latin1").split(/\s+/);
  const breedte = Number(kop[1]);
  const hoogte = Number(kop[2]);
  return { breedte, hoogte, pixels: data.subarray(data.length - breedte * hoogte) };
}
function verschil(a, b) {
  const breedte = Math.min(a.breedte, b.breedte);
  const hoogte = Math.min(a.hoogte, b.hoogte);
  let som = 0;
  for (let r = 0; r < hoogte; r++)
    for (let k = 0; k < breedte; k++) som += Math.abs(a.pixels[r * a.breedte + k] - b.pixels[r * b.breedte + k]);
  return som / (breedte * hoogte);
}

try {
  await wachtOp(`http://127.0.0.1:${POORT}/`);
  await wachtOp(`http://127.0.0.1:${CDP_POORT}/json/version`);
  const doel = await (await fetch(`http://127.0.0.1:${CDP_POORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(doel.webSocketDebuggerUrl);
  await new Promise((r, f) => {
    ws.onopen = r;
    ws.onerror = f;
  });
  let volgnummer = 0;
  const wachtend = new Map();
  // Opgehaalde lettertypen via het netwerkdomein (de resource-timingbuffer van de dev-server loopt vol).
  let opgehaald = [];
  ws.onmessage = (e) => {
    const bericht = JSON.parse(e.data);
    if (bericht.method === "Network.requestWillBeSent" && bericht.params.request.url.includes("/fonts/extra/"))
      opgehaald.push(bericht.params.request.url.split("/").pop());
    if (bericht.id && wachtend.has(bericht.id)) {
      wachtend.get(bericht.id)(bericht);
      wachtend.delete(bericht.id);
    }
  };
  const cdp = (method, params = {}) =>
    new Promise((r) => {
      const id = ++volgnummer;
      wachtend.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evalueer = async (expressie) => {
    const r = await cdp("Runtime.evaluate", { expression: expressie, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails)
      throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });

  /** Opent bytes in de app, maakt een PDF via Opslaan als en geeft PDF en opgehaalde lettertypen terug. */
  async function naarPdf(soort, naam, bytes, familie = "") {
    await cdp("Page.navigate", { url: `http://127.0.0.1:${POORT}/` });
    await wacht(1200);
    opgehaald = [];
    const uitkomst = await evalueer(`(async () => {
      for (let i = 0; i < 120 && !document.querySelector(".start-voorbeeldbestand"); i++) await new Promise((r) => setTimeout(r, 250));
      const b64 = ${JSON.stringify(Buffer.from(bytes).toString("base64"))};
      const ruw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const invoer = [...document.querySelectorAll('input[type="file"]')].find((i) => (i.accept || "").includes(".${soort}"));
      const dt = new DataTransfer();
      dt.items.add(new File([ruw], ${JSON.stringify(naam)}));
      invoer.files = dt.files;
      invoer.dispatchEvent(new Event("change", { bubbles: true }));
      const { editorKoppeling } = await import("/src/export/koppeling.ts");
      for (let i = 0; i < 240 && !editorKoppeling("${soort}")?.afdrukbron; i++) await new Promise((r) => setTimeout(r, 250));
      if (!editorKoppeling("${soort}")?.afdrukbron) throw new Error("De editor werd niet gereed.");
      await new Promise((r) => setTimeout(r, 800));
      // Tellen hoe vaak de engine echt in dit lettertype tekent (een ongeldige
      // canvas-fontopgave valt stil terug op 10px sans-serif).
      let inFamilie = 0, totaal = 0;
      const fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (...a) {
        totaal++;
        if (${JSON.stringify(familie)} && this.font.includes(${JSON.stringify(familie)})) inFamilie++;
        return fill.apply(this, a);
      };
      const { maakExport } = await import("/src/export/index.ts");
      const r = await maakExport("${soort}", "pdf", ruw, ${JSON.stringify(naam)}, { pdf: { kwaliteit: "klein", omvang: "werkmap", indeling: "dias" } });
      let s = "";
      for (let i = 0; i < r.bytes.length; i += 0x8000) s += String.fromCharCode(...r.bytes.subarray(i, i + 0x8000));
      CanvasRenderingContext2D.prototype.fillText = fill;
      return { pdf: btoa(s), inFamilie, totaal };
    })()`);
    return { pdf: Buffer.from(uitkomst.pdf, "base64"), lettertypen: [...new Set(opgehaald)], inFamilie: uitkomst.inFamilie, totaal: uitkomst.totaal };
  }

  const controle = {};
  for (const soort of ["docx", "pptx"]) {
    const bytes = soort === "docx" ? docxMet("Liberation Sans") : pptxMet("Liberation Sans");
    const { pdf } = await naarPdf(soort, `Controle.${soort}`, bytes);
    const pad = join(UIT, `controle.${soort}.pdf`);
    writeFileSync(pad, pdf);
    controle[soort] = pagina1(pad, `controle-${soort}`);
  }
  const tekstVan = { docx: /Ruimte voor idee/, pptx: /Samen ruimte/ };
  for (const f of families) {
    const regel = [];
    for (const soort of ["docx", "pptx"]) {
      const naam = `${slug(f.familie)}.${soort}`;
      const bytes = soort === "docx" ? docxMet(f.familie) : pptxMet(f.familie);
      writeFileSync(join(UIT, naam), bytes);
      try {
        const { pdf, lettertypen, inFamilie, totaal } = await naarPdf(soort, naam, bytes, f.familie);
        // De tekstengine tekent met fillText: dan moet de canvas-fontopgave het lettertype noemen.
        if (soort === "docx" && totaal > 0 && inFamilie === 0)
          fouten.push(`${naam}: de engine tekent niet in ${f.familie} (${totaal} tekstaanroepen, geen met dit lettertype)`);
        const pad = join(UIT, `${naam}.pdf`);
        writeFileSync(pad, pdf);
        const tekst = spawnSync("pdftotext", ["-layout", pad, "-"], { encoding: "utf8" }).stdout;
        const fonts = spawnSync("pdffonts", [pad], { encoding: "utf8" }).stdout;
        if (!lettertypen.some((l) => f.bestanden.some((b) => b.bestand === l)))
          fouten.push(`${naam}: de app haalde geen bestand van ${f.familie} op (wel: ${lettertypen.join(", ") || "niets"})`);
        if (!tekstVan[soort].test(tekst)) fouten.push(`${naam}: tekst niet doorzoekbaar in de PDF`);
        if (!/OOSGlyphless/.test(fonts)) fouten.push(`${naam}: geen tekstlaag (pdffonts)`);
        const d = verschil(pagina1(pad, `${slug(f.familie)}-${soort}`), controle[soort]);
        if (d < 0.3) fouten.push(`${naam}: tekent niet zichtbaar anders dan Liberation Sans (${d.toFixed(2)})`);
        if (soort === "docx") regel.push(`canvas ${inFamilie}/${totaal}`);
        regel.push(`${soort} ${lettertypen.filter((l) => f.bestanden.some((b) => b.bestand === l)).length}/${f.bestanden.length} stijlen geladen, Δ ${d.toFixed(2)}`);
      } catch (e) {
        fouten.push(`${naam}: ${e.message}`);
      }
    }
    meld(`✓ ${f.familie}: ${regel.join(" · ")}`);
  }
  ws.close();
} catch (e) {
  fouten.push(String(e?.stack ?? e));
} finally {
  opruimen();
}
afsluiten();

function afsluiten() {
  if (fouten.length) {
    console.error(`✗ ${fouten.length} probleem/problemen:\n- ${fouten.join("\n- ")}`);
    process.exit(1);
  }
  meld(`Klaar; uitvoer in ${UIT}/`);
  process.exit(0);
}
