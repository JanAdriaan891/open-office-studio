/**
 * Browserproef van het begrensde raster in Rekenblad (#371): leeg blad,
 * invullen, groeien (typen, stroken, slepen, naamvak), krimpen, bevriezen en
 * zoom, opslaan en heropenen als XLSX, en twee tabbladen.
 *
 * Gebruik: `node scripts/test-rekenblad-begrensd-raster-gui.mjs` na `pnpm build`,
 * of met OFFICE_TEST_URL=http://127.0.0.1:1522/ tegen een draaiende server.
 * OOS_PLAYWRIGHT_MODULE en OOS_CHROMIUM kiezen een eigen Playwright of browser.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { preview } from "vite";

const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright");
const uit = process.env.OFFICE_TEST_UIT ?? ".local/proef-begrensd-raster";
await mkdir(uit, { recursive: true });
const server = process.env.OFFICE_TEST_URL
  ? null
  : await preview({
      configFile: false,
      build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
      preview: { host: "127.0.0.1", port: 0, open: false },
    });
const adres = process.env.OFFICE_TEST_URL ?? `http://127.0.0.1:${server.httpServer.address().port}/`;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const browser = await chromium.launch(process.env.OOS_CHROMIUM ? { executablePath: process.env.OOS_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "nl-NL" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  if (!localStorage.getItem("openaec-office-instellingen"))
    localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "nl" }));
});
await page.goto(adres);
const open = async (bytes, name) => {
  await page.locator(".office input[type=file]").first().setInputFiles({ name, mimeType: XLSX, buffer: Buffer.from(bytes) });
  await page.evaluate(() => {
    window.proefContext = () => {
      const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-rekenblad-host");
      if (!el) return null;
      for (let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]; f; f = f.return) {
        const v = f.memoizedProps?.value;
        if (v?.rekenblad?.handle && v.herlaad) return v;
      }
      return null;
    };
    window.proefApi = () => proefContext()?.rekenblad;
  });
  await page.waitForFunction(() => { try { return !!proefApi()?.handle.sheetInfo().sheetNames.length; } catch { return false; } }, null, { timeout: 60000 });
  await page.waitForTimeout(900);
};
const stand = () => page.evaluate(() => { const s = document.querySelector('.office-tabpaneel:not([hidden]) [data-testid="xlsx-scroll"]'); const host = document.querySelector('.office-tabpaneel:not([hidden]) .office-rekenblad-host');
  return { sw: s.scrollWidth, sh: s.scrollHeight, cw: s.clientWidth, ch: s.clientHeight, st: s.scrollTop, sl: s.scrollLeft, vars: host.getAttribute('style').replace(/--oos[^;]*;/g, ''), naam: host.querySelector('[data-testid="xlsx-name-box"]')?.value, melding: host.querySelector('.rekenblad-rastermelding')?.textContent, koppen: [host.querySelectorAll('.rekenblad-kolomkoppen > span').length, host.querySelectorAll('.rekenblad-rijkoppen > span').length] }; });
const stap = (s) => console.log("•", s);
const sluitMeldingen = () => page.addStyleTag({ content: ".office-meldingen{display:none!important}" });
const bytes = async () => new Uint8Array(await page.evaluate(async () => Array.from(await proefContext().herlaad.bytes())));
const delen = (b) => Object.fromEntries(Object.entries(unzipSync(b)).map(([n, v]) => [n, Buffer.from(v).toString("latin1")]));
const raster = () => page.evaluate(() => { const b = document.querySelector('[data-testid="raster-statusknop"]'); return { aan: b?.getAttribute("aria-pressed"), titel: b?.title }; });
try {
  await open(await readFile("public/templates/nieuw.xlsx"), "Proef.xlsx");
  await sluitMeldingen();
  assert.equal((await raster()).aan, "false", "standaard onbeperkt");
  await page.screenshot({ path: `${uit}/01-onbeperkt-leeg.png` });
  stap("standaard: onbeperkt raster (huidig gedrag)");

  // Begrensd via de statusbalk.
  await page.click('[data-testid="raster-statusknop"]'); await page.waitForTimeout(500);
  let s = await stand();
  assert.deepEqual(s.koppen, [8, 20]);
  assert.match(s.vars, /schuif-x: hidden; --raster-schuif-y: hidden/);
  await page.screenshot({ path: `${uit}/02-begrensd-leeg.png` });
  stap(`leeg blad begrensd: ${s.koppen[1]} rijen × ${s.koppen[0]} kolommen, geen schuifbalken`);

  // Toegankelijke namen.
  const namen = await page.evaluate(() => [...document.querySelectorAll('.rekenblad-rastergrens button')].map((b) => b.getAttribute("aria-label")));
  assert.deepEqual(namen, ["Kolom toevoegen", "Rij toevoegen", "Raster aanpassen aan inhoud"]);

  // Klik buiten het raster selecteert niets.
  await page.mouse.click(1100, 500); await page.waitForTimeout(200);
  assert.equal((await stand()).naam, "A1");

  // Gegevens invullen via het toetsenbord; Tab/Enter.
  await page.evaluate(() => proefApi().focus());
  for (const rij of [["Maand", "Omzet", "Kosten"], ["jan", "1200", "800"], ["feb", "1350", "910"], ["mrt", "1500", "870"]]) {
    for (const c of rij) { await page.keyboard.type(c); await page.keyboard.press("Tab"); }
    await page.keyboard.press("Home"); await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.type("Totaal"); await page.keyboard.press("Tab"); await page.keyboard.type("=SUM(B2:B4)"); await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${uit}/03-begrensd-gevuld.png` });
  stap("gevuld blad binnen het begrensde raster");

  // Ctrl+pijlen en Ctrl+End blijven binnen het raster.
  await page.keyboard.press("Control+Home"); await page.keyboard.press("Control+ArrowDown"); await page.keyboard.press("Control+ArrowDown"); await page.waitForTimeout(300);
  s = await stand(); assert.equal(s.naam, "A20"); assert.match(s.melding, /rij 20 is de laatste rij/);
  await page.keyboard.press("Control+ArrowRight"); await page.waitForTimeout(300);
  assert.equal((await stand()).naam, "H20");
  await page.keyboard.press("Control+End"); await page.waitForTimeout(300);
  assert.equal((await stand()).naam, "C5");
  stap("Ctrl+pijl stopt op de rand (schermlezer meldt de grens); Ctrl+End = laatste gebruikte cel");

  // Groeien: typen in de laatste rij.
  await page.keyboard.press("Control+Home"); await page.keyboard.press("Control+ArrowDown"); await page.keyboard.press("Control+ArrowDown");
  await page.keyboard.type("onderaan"); await page.keyboard.press("Enter"); await page.waitForTimeout(500);
  s = await stand(); assert.equal(s.naam, "A21"); assert.deepEqual(s.koppen, [8, 25]);
  stap("typen in de laatste rij: raster groeit naar 25 rijen, Enter gaat naar A21");

  // Groeistroken: klik, Shift-klik, slepen.
  await page.click('.rekenblad-groeistrook.is-kolom'); await page.waitForTimeout(200);
  assert.deepEqual((await stand()).koppen, [9, 25]);
  await page.click('.rekenblad-groeistrook.is-kolom', { modifiers: ["Shift"] }); await page.waitForTimeout(200);
  assert.deepEqual((await stand()).koppen, [14, 25]);
  const strook = await page.locator('.rekenblad-groeistrook.is-rij').boundingBox();
  await page.mouse.move(strook.x + 300, strook.y + 8); await page.mouse.down(); await page.mouse.move(strook.x + 300, strook.y + 8 + 65, { steps: 5 });
  await page.screenshot({ path: `${uit}/04-slepen.png` });
  await page.mouse.up(); await page.waitForTimeout(300);
  s = await stand(); assert.deepEqual(s.koppen, [14, 29]); assert.match(s.melding, /29 rijen en 14 kolommen/);
  await page.screenshot({ path: `${uit}/05-gegroeid.png` });
  stap("groeistroken: klik +1, Shift-klik +5 kolommen, slepen +4 rijen → 29 × 14");
  // Toetsenbord op de strook.
  await page.focus('.rekenblad-groeistrook.is-rij'); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
  assert.deepEqual((await stand()).koppen, [14, 30]);

  // Naamvak naar een cel buiten het raster breidt uit.
  const nb = page.locator('.rekenblad-naamvak'); await nb.click(); await nb.fill("R60"); await nb.press("Enter"); await page.waitForTimeout(700);
  s = await stand(); assert.equal(s.naam, "R60"); assert.match(s.vars, /schuif-y: auto/); assert.match(s.melding, /65 rijen en 21 kolommen/);
  await page.screenshot({ path: `${uit}/06-naamvak-uitgebreid.png` });
  stap("naamvak R60: raster breidt uit tot 65 × 21, met verticale schuifbalk");
  // Schuiven kan niet voorbij de rand.
  await page.evaluate(() => { const el = document.querySelector('[data-testid="xlsx-scroll"]'); el.scrollTop = 1e7; el.scrollLeft = 1e7; }); await page.waitForTimeout(400);
  s = await stand(); assert.ok(s.st + s.ch <= 65 * 20 + 40, `scroll ${s.st}`); assert.equal(s.sh, Number(/hoogte: (\d+)px/.exec(s.vars)[1]));

  // Krimpen.
  await page.evaluate(() => proefApi().selectCells(0, { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }));
  await page.click('.ribbon [role="tab"]:has-text("Beeld")'); await page.waitForTimeout(300);
  await page.locator('.ribbon button:has-text("Raster aanpassen aan inhoud"):visible').first().click(); await page.waitForTimeout(500);
  s = await stand(); assert.deepEqual(s.koppen, [8, 25]); assert.match(s.melding, /aangepast aan de inhoud: 25 rijen en 8 kolommen/);
  stap("Raster aanpassen aan inhoud: terug naar 25 × 8");

  // Bevriezen + zoom.
  await page.evaluate(() => proefApi().selectCells(0, { anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } }));
  await page.click('.ribbon [role="tab"]:has-text("Beeld")'); await page.waitForTimeout(300);
  await page.screenshot({ path: `${uit}/07-lint-beeld.png` });
  await page.locator('.ribbon button:has-text("Rijen en kolommen fixeren"):visible').first().click(); await page.waitForTimeout(500);
  s = await stand(); assert.deepEqual(s.koppen, [8, 25]);
  const info = await page.evaluate(() => { const i = proefApi().handle.sheetInfo(); return [i.frozenRows, i.frozenCols]; });
  assert.deepEqual(info, [1, 1]);
  await page.evaluate(() => proefApi().commands.execute("zoom", { scale: 1.5 }).catch(() => {})); await page.waitForTimeout(600);
  await page.screenshot({ path: `${uit}/08-bevroren-zoom.png` });
  s = await stand();
  stap(`bevroren rij+kolom en zoom: koppen ${s.koppen}, ${s.vars}`);
  await page.evaluate(() => proefApi().commands.execute("zoom", { scale: 1 }).catch(() => {})); await page.waitForTimeout(400);

  // Opslaan: vergelijk met dezelfde werkmap zonder weergavekeuze.
  const met = await bytes();
  await page.click('[data-testid="raster-statusknop"]'); await page.waitForTimeout(300);
  assert.equal((await raster()).aan, "false");
  const zonderKeuze = await bytes();
  await page.click('[data-testid="raster-statusknop"]'); await page.waitForTimeout(300);
  const a = delen(met), b = delen(zonderKeuze);
  const anders = Object.keys(a).filter((n) => a[n] !== b[n]);
  assert.deepEqual(anders.sort(), ["[Content_Types].xml", "_rels/.rels", "docProps/custom.xml"]);
  assert.ok(!/hidden=/.test(a["xl/worksheets/sheet1.xml"]));
  assert.match(a["docProps/custom.xml"], /OpenOfficeStudio\.BoundedGrid/);
  await writeFile(`${uit}/Proef-begrensd.xlsx`, met);
  await writeFile(`${uit}/Proef-onbeperkt.xlsx`, zonderKeuze);
  stap(`opslaan: alleen ${anders.join(", ")} verschillen; werkbladen byte-gelijk`);

  // Heropenen.
  await page.evaluate(() => localStorage.removeItem("openaec-rekenblad-raster"));
  await open(met, "Heropend.xlsx"); await sluitMeldingen();
  s = await stand(); assert.deepEqual(s.koppen, [8, 25]);
  assert.equal((await raster()).aan, "true");
  const cellen = await page.evaluate(() => { const h = proefApi().handle; return [h.cell(0, 4, 1).input, h.cell(0, 19, 0).input, h.cell(0, 1, 2).input]; });
  assert.deepEqual(cellen, ["=SUM(B2:B4)", "onderaan", "800"]);
  await page.screenshot({ path: `${uit}/09-heropend.png` });
  const opnieuw = delen(await bytes());
  assert.equal(opnieuw["xl/worksheets/sheet1.xml"], a["xl/worksheets/sheet1.xml"]);
  assert.equal(opnieuw["docProps/custom.xml"], a["docProps/custom.xml"]);
  stap("heropenen: begrensd raster 25 × 8 uit het bestand, cellen en werkblad-XML ongewijzigd");

  // App-voorkeur per bestand (zonder eigenschap in het bestand).
  // Plakken van een groter bereik, invoegen, filter en alles selecteren.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => { proefApi().selectCells(0, { anchor: { row: 0, col: 0 }, focus: { row: 4, col: 2 } }); proefApi().focus(); });
  await page.keyboard.press("Control+c"); await page.waitForTimeout(300);
  await page.evaluate(() => { proefApi().selectCells(0, { anchor: { row: 23, col: 6 }, focus: { row: 23, col: 6 } }); proefApi().focus(); });
  await page.keyboard.press("Control+v"); await page.waitForTimeout(700);
  s = await stand();
  assert.equal(await page.evaluate(() => proefApi().handle.cell(0, 27, 7).input), "=SUM(H25:H27)");
  assert.match((await raster()).titel, /33 rijen × 12 kolommen/, "plakken voorbij de rand laat het raster meegroeien");
  stap("plakken van A1:C5 op G24: raster groeit mee naar 33 × 12");
  await page.evaluate(() => proefApi().handle.applyOps([{ type: "insertRows", sheet: 0, at: 0, count: 4 }])); await page.waitForTimeout(500);
  assert.match((await raster()).titel, /37 rijen × 12 kolommen/, "rijen invoegen laat het raster meegroeien");
  stap("4 rijen invoegen: raster groeit mee naar 37 rijen");
  await page.evaluate(() => { proefApi().selectCells(0, { anchor: { row: 4, col: 0 }, focus: { row: 4, col: 0 } }); proefApi().focus(); });
  await page.keyboard.press("Control+Shift+L"); await page.waitForTimeout(500);
  assert.ok(await page.locator(".rekenblad-filterpijl").count() >= 3, "autofilter werkt binnen het raster");
  await page.keyboard.press("Control+Shift+L"); await page.waitForTimeout(300);
  await page.keyboard.press("Control+a"); await page.waitForTimeout(100); await page.keyboard.press("Control+a"); await page.waitForTimeout(400);
  const alles = await page.evaluate(() => document.querySelectorAll('.office-tabpaneel:not([hidden]) [role="grid"] [role="gridcell"][aria-selected="true"]').length);
  assert.ok(alles > 20, "alles selecteren blijft werken");
  stap("autofilter aan/uit en Ctrl+A werken binnen het begrensde raster");

  // Twee tabbladen: de statusbalk volgt het zichtbare document.
  await page.click('[data-testid="raster-statusknop"]'); await page.waitForTimeout(300);
  assert.equal((await raster()).aan, "false");
  await page.locator('[role="tab"]:has-text("Proef.xlsx")').first().click(); await page.waitForTimeout(600);
  assert.equal((await raster()).aan, "true");
  assert.deepEqual((await stand()).koppen, [8, 25]);
  await page.locator('[role="tab"]:has-text("Heropend.xlsx")').first().click(); await page.waitForTimeout(600);
  assert.equal((await raster()).aan, "false");
  stap("twee tabbladen: de rasterknop in de statusbalk volgt het zichtbare document");
  console.log("fouten:", errors);
  assert.deepEqual(errors, []);
} catch (e) {
  await page.screenshot({ path: `${uit}/fout.png` }).catch(() => {});
  console.log("fouten:", errors);
  throw e;
} finally {
  await browser.close();
  await new Promise((klaar) => (server ? server.httpServer.close(klaar) : klaar()));
}
