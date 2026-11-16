/** Actual hosted EPUB input/edit/save/reopen; no native bridge or editor mocks. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { preview } from "vite";
import { chromium } from "playwright";
import { unzipSync, strFromU8 } from "fflate";

const output = ".local/epub356-hosted";
await mkdir(output, { recursive: true });
const sourcePath = "docs/tests/epub356/leesvolgorde.epub";
const source = await readFile(sourcePath);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const originalHash = hash(source);
const expectedImage = unzipSync(source)["Boek/media/beeld een.png"];
const server = await preview({
  configFile: false,
  base: "/office/",
  cacheDir: ".local/epub356-preview-cache",
  build: { outDir: "dist-hosted" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "nl-NL",
  viewport: { width: 1400, height: 1100 },
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [],
  externalRequests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (request) => {
  if (
    /^https?:/.test(request.url()) &&
    new URL(request.url()).hostname !== "127.0.0.1"
  )
    externalRequests.push(request.url());
});
try {
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "nl", spelling: { controleren: false } }),
    ),
  );
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/office/`,
  );
  assert(new URL(page.url()).pathname.startsWith("/office/"));
  assert.equal(
    await page.evaluate(() => typeof window.__TAURI_INTERNALS__),
    "undefined",
  );
  await page.locator(".office > input[type=file]").setInputFiles({
    name: "leesvolgorde.epub",
    mimeType: "application/epub+zip",
    buffer: source,
  });
  const input = page.locator('[data-testid="yrs-input"]:visible');
  await input.waitFor();
  await page.waitForFunction(() => {
    const b = document.querySelector(".office-snelknop:has(.lucide-save-all)");
    return b && !b.disabled;
  });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${output}/imported.png` });
  await context.setOffline(true);
  await input.focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("EPUB356 EDIT ");
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const dialog = page.getByRole("dialog", { name: "Opslaan als", exact: true });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  const saved = await readFile(await (await download).path());
  await writeFile(`${output}/saved.docx`, saved);
  const parts = unzipSync(saved),
    xml = strFromU8(parts["word/document.xml"]);
  for (const text of [
    "EPUB356 EDIT",
    "EPUB EERSTE HOOFDSTUK",
    "EPUB TWEEDE HOOFDSTUK",
    "Hout",
    "42",
  ])
    assert(xml.includes(text), text);
  assert(xml.indexOf("EPUB EERSTE") < xml.indexOf("EPUB TWEEDE"));
  assert(
    Object.entries(parts).some(
      ([name, bytes]) =>
        name.startsWith("word/media/") && hash(bytes) === hash(expectedImage),
    ),
  );
  await context.setOffline(false);
  await page.locator(".office > input[type=file]").setInputFiles({
    name: "EPUB-heropend.docx",
    mimeType: "application/octet-stream",
    buffer: saved,
  });
  await page.getByRole("tab", { name: /EPUB-heropend\.docx/ }).waitFor();
  await input.waitFor();
  const tabs = await page.locator(".office-tabnaam").allTextContents();
  await page.locator(".office > input[type=file]").setInputFiles({
    name: "Ongeldig.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from("not a book"),
  });
  await page
    .locator('.office-melding[data-toon="fout"]')
    .filter({ hasText: "EPUB" })
    .waitFor();
  assert.deepEqual(
    await page.locator(".office-tabnaam").allTextContents(),
    tabs,
  );
  assert.equal(hash(await readFile(sourcePath)), originalHash);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  await page.screenshot({ path: `${output}/reopened-invalid-preserved.png` });
  const report = {
    status: "passed",
    applicationCommit: process.env.OOS_RUNTIME_APPLICATION_COMMIT,
    harnessCommit: process.env.OOS_RUNTIME_HARNESS_COMMIT,
    route: "/office/",
    nativeBridge: false,
    importedEpub: true,
    offlineEditAndSave: true,
    readingOrder: true,
    tableContent: true,
    embeddedImageSha256: hash(expectedImage),
    reopenedDocx: true,
    invalidInputPreservesTabs: true,
    originalSha256: originalHash,
    originalUnchanged: true,
    errors,
    externalRequests,
  };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await writeFile(
    `${output}/failure.json`,
    JSON.stringify({ error: String(error), errors, externalRequests }, null, 2),
  );
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
