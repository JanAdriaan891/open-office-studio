#!/usr/bin/env node
/**
 * Proef voor PDF zonder conversieprogramma (#37) met docs/voorbeelden.
 *
 * 1. Altijd: de PDF-schrijver zelf (zonder browser) — structuur, tekstlaag,
 *    metadata — gecontroleerd met pdfinfo en pdftotext.
 * 2. Als er een Chromium te vinden is: de app draait in een eigen Vite-server
 *    (poort PDF_POORT, standaard 1457), opent de drie voorbeeldbestanden, maakt
 *    via dezelfde route als Opslaan als → PDF een PDF en controleert die met
 *    pdfinfo/pdftotext. Is LibreOffice aanwezig, dan volgt een grove
 *    pixelvergelijking van pagina 1 met de PDF van LibreOffice.
 *
 * Uitvoer staat in .local/pdf-proef/. Chromium: CHROME_PAD, of Playwright's
 * Chromium in ~/.cache/ms-playwright. Gebruik: node scripts/test-pdf-zonder-runtime.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const UIT = ".local/pdf-proef";
mkdirSync(UIT, { recursive: true });
const POORT = Number(process.env.PDF_POORT ?? 1457);
const CDP_POORT = POORT + 1000;
const fouten = [];
const meld = (tekst) => console.log(tekst);

function heeft(programma) {
  return spawnSync("sh", ["-c", `command -v ${programma}`]).status === 0;
}
function pdfinfo(pad) {
  const r = spawnSync("pdfinfo", [pad], { encoding: "utf8" });
  assert.equal(r.status, 0, `pdfinfo weigert ${pad}: ${r.stderr}`);
  assert.ok(!/Syntax Error/i.test(r.stderr), `pdfinfo meldt fouten in ${pad}: ${r.stderr}`);
  const veld = (naam) => new RegExp(`^${naam}:\\s+(.*)$`, "m").exec(r.stdout)?.[1];
  return { paginas: Number(veld("Pages")), maat: veld("Page size"), titel: veld("Title") };
}
function pdftotext(pad) {
  const r = spawnSync("pdftotext", ["-layout", pad, "-"], { encoding: "utf8" });
  assert.equal(r.status, 0, `pdftotext weigert ${pad}`);
  assert.ok(!/Syntax Error/i.test(r.stderr), `pdftotext meldt fouten in ${pad}: ${r.stderr}`);
  return r.stdout;
}

// ------------------------------------------------------------ 1. schrijver
{
  const { schrijfPdf } = await import("../src/export/pdf/schrijver.ts");
  const breedte = 64;
  const hoogte = 32;
  const rgb = new Uint8Array(breedte * hoogte * 3).fill(255);
  const pdf = schrijfPdf({
    titel: "Proef zonder runtime",
    auteur: "OpenAEC",
    paginas: [
      {
        breedte: 595,
        hoogte: 842,
        beeld: { soort: "rgb", breedte, hoogte, bytes: rgb },
        tekst: [
          { tekst: "Selecteerbare tekst – café €", x: 72, y: 100, grootte: 12, breedte: 170 },
          { tekst: "Tweede regel", x: 72, y: 120, grootte: 12, breedte: 70 },
        ],
        koppelingen: [{ x: 72, y: 88, breedte: 170, hoogte: 14, url: "https://openaec.org" }],
      },
    ],
    bladwijzers: [{ titel: "Begin", pagina: 0 }],
  });
  const pad = join(UIT, "schrijver.pdf");
  writeFileSync(pad, pdf);
  if (heeft("pdfinfo")) {
    const info = pdfinfo(pad);
    assert.equal(info.paginas, 1);
    assert.equal(info.titel, "Proef zonder runtime");
    const tekst = pdftotext(pad);
    assert.match(tekst, /Selecteerbare tekst – café €/);
    assert.match(tekst, /Tweede regel/);
    const fonts = spawnSync("pdffonts", [pad], { encoding: "utf8" }).stdout;
    assert.match(fonts, /OOSGlyphless\s+CID TrueType\s+Identity-H\s+yes/);
    meld("✓ PDF-schrijver: structuur, tekstlaag, ingesloten lettertype en metadata");
  } else meld("• pdfinfo ontbreekt: alleen de schrijver is uitgevoerd");
}

// ------------------------------------------------------------ 2. app in Chromium
function zoekChrome() {
  if (process.env.CHROME_PAD && existsSync(process.env.CHROME_PAD)) return process.env.CHROME_PAD;
  const basis = join(homedir(), ".cache/ms-playwright");
  if (existsSync(basis))
    for (const map of readdirSync(basis).sort().reverse()) {
      for (const kandidaat of [
        join(basis, map, "chrome-linux64/chrome"),
        join(basis, map, "chrome-headless-shell-linux64/chrome-headless-shell"),
      ])
        if (existsSync(kandidaat)) return kandidaat;
    }
  for (const naam of ["chromium", "chromium-browser", "google-chrome"])
    if (heeft(naam)) return naam;
  return null;
}

const chrome = zoekChrome();
if (!chrome || typeof WebSocket === "undefined") {
  meld("• Geen Chromium (of WebSocket) gevonden: de proef in de app is overgeslagen. Zet CHROME_PAD.");
  process.exit(0);
}

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
async function wachtOp(url, pogingen = 120) {
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

const vite = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(POORT), "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
const profiel = join(tmpdir(), `oos-pdf-proef-${process.pid}`);
const browser = spawn(
  chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_POORT}`,
    `--user-data-dir=${profiel}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1400,900",
    "about:blank",
  ],
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

try {
  await wachtOp(`http://127.0.0.1:${POORT}/`);
  await wachtOp(`http://127.0.0.1:${CDP_POORT}/json/version`);
  const doel = await (
    await fetch(`http://127.0.0.1:${CDP_POORT}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const ws = new WebSocket(doel.webSocketDebuggerUrl);
  await new Promise((r, f) => {
    ws.onopen = r;
    ws.onerror = f;
  });
  let volgnummer = 0;
  const wachtend = new Map();
  ws.onmessage = (e) => {
    const bericht = JSON.parse(e.data);
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
    const r = await cdp("Runtime.evaluate", {
      expression: expressie,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails)
      throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });

  const voorbeelden = [
    { soort: "docx", bestand: "Ontwerpnotitie", tekst: /Ruimte voor ideeën/ },
    { soort: "xlsx", bestand: "Materiaaloverzicht", tekst: /Multiplex berken/ },
    { soort: "pptx", bestand: "Ontwerpvisie", tekst: /Samen ruimte/ },
  ];
  const lo = heeft("soffice");
  for (const v of voorbeelden) {
    await cdp("Page.navigate", { url: `http://127.0.0.1:${POORT}/` });
    await wacht(1500);
    const base64 = await evalueer(`(async () => {
      for (let i = 0; i < 80 && !document.querySelector(".start-voorbeeldbestand.module-${v.soort}"); i++)
        await new Promise((r) => setTimeout(r, 250));
      document.querySelector(".start-voorbeeldbestand.module-${v.soort}").click();
      const { editorKoppeling } = await import("/src/export/koppeling.ts");
      for (let i = 0; i < 240 && !editorKoppeling("${v.soort}")?.afdrukbron; i++)
        await new Promise((r) => setTimeout(r, 250));
      if (!editorKoppeling("${v.soort}")?.afdrukbron) throw new Error("De editor werd niet gereed.");
      const { maakExport } = await import("/src/export/index.ts");
      const bytes = new Uint8Array(await (await fetch("/voorbeelden/${v.bestand}.${v.soort}")).arrayBuffer());
      const r = await maakExport("${v.soort}", "pdf", bytes, "${v.bestand}", { pdf: { kwaliteit: "standaard", omvang: "werkmap", indeling: "dias" } });
      let s = "";
      for (let i = 0; i < r.bytes.length; i += 0x8000) s += String.fromCharCode(...r.bytes.subarray(i, i + 0x8000));
      return btoa(s);
    })()`);
    const pad = join(UIT, `${v.bestand}.pdf`);
    writeFileSync(pad, Buffer.from(base64, "base64"));
    const info = pdfinfo(pad);
    const tekst = pdftotext(pad);
    try {
      assert.ok(info.paginas >= 1, `${v.bestand}: geen pagina's`);
      assert.match(tekst, v.tekst, `${v.bestand}: tekst niet doorzoekbaar`);
      const ruw = readFileSync(pad).toString("latin1");
      assert.ok(/\/Dest \[/.test(ruw), `${v.bestand}: geen bladwijzers (koppen, bladen of dia's)`);
      if (v.soort === "docx") assert.equal(info.titel, "Ruimte voor ideeën", "titel uit de documenteigenschappen");
    } catch (e) {
      fouten.push(e.message);
    }
    let vergelijking = "";
    if (lo) {
      const loMap = join(UIT, "libreoffice");
      mkdirSync(loMap, { recursive: true });
      spawnSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", loMap, `docs/voorbeelden/${v.bestand}.${v.soort}`], {
        stdio: "ignore",
        timeout: 180_000,
      });
      const loPad = join(loMap, `${v.bestand}.pdf`);
      if (existsSync(loPad)) {
        const loInfo = pdfinfo(loPad);
        const verschil = pixelverschil(pad, loPad);
        vergelijking = ` · LibreOffice: ${loInfo.paginas} pagina's (${loInfo.maat}), pixelverschil pagina 1: ${verschil.toFixed(1)}/255`;
        if (verschil > 60) fouten.push(`${v.bestand}: pagina 1 wijkt sterk af van LibreOffice (${verschil.toFixed(1)})`);
      }
    }
    meld(`✓ ${v.bestand}.${v.soort}: ${info.paginas} pagina's (${info.maat})${vergelijking}`);
  }
  ws.close();
} catch (e) {
  fouten.push(String(e?.stack ?? e));
} finally {
  opruimen();
}

/** Gemiddeld absoluut grijswaardeverschil van pagina 1 op 30 dpi (0 = gelijk). */
function pixelverschil(a, b) {
  const lees = (pad, naam) => {
    const basis = join(UIT, naam);
    spawnSync("pdftoppm", ["-f", "1", "-l", "1", "-r", "30", "-gray", "-singlefile", pad, basis]);
    const data = readFileSync(`${basis}.pgm`);
    // P5\n<b> <h>\n255\n<data>
    const kop = data.subarray(0, 64).toString("latin1").split(/\s+/);
    const breedte = Number(kop[1]);
    const hoogte = Number(kop[2]);
    const begin = data.length - breedte * hoogte;
    return { breedte, hoogte, pixels: data.subarray(begin) };
  };
  const x = lees(a, "vergelijk-app");
  const y = lees(b, "vergelijk-lo");
  const breedte = Math.min(x.breedte, y.breedte);
  const hoogte = Math.min(x.hoogte, y.hoogte);
  let som = 0;
  for (let r = 0; r < hoogte; r++)
    for (let k = 0; k < breedte; k++)
      som += Math.abs(x.pixels[r * x.breedte + k] - y.pixels[r * y.breedte + k]);
  return som / (breedte * hoogte);
}

if (fouten.length) {
  console.error(`✗ ${fouten.length} probleem/problemen:\n- ${fouten.join("\n- ")}`);
  process.exit(1);
}
meld(`Klaar; uitvoer in ${UIT}/`);
