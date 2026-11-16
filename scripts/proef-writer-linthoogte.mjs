/** Rendered Writer ribbon geometry: no editor bridge or native app control. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { preview } from "vite";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

const outDir = process.argv[2] ?? ".local/ribbon-build";
const label = process.argv[3] ?? "ribbon-height";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const baseline = process.argv.includes("--baseline");
const route = process.env.OFFICE_TEST_BASE ?? "/";
const dir = `.local/${label}`;
fs.mkdirSync(dir, { recursive: true });
const parts = unzipSync(fs.readFileSync("public/templates/nieuw.docx"));
const xml = strFromU8(parts["word/document.xml"]);
const cell = (text) =>
  `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
const table = `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2880"/>'.repeat(3)}</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${["Alpha", "Beta", "Gamma"].map(cell).join("")}</w:tr><w:tr><w:trPr><w:tblHeader/></w:trPr>${["One", "Two", "Three"].map(cell).join("")}</w:tr></w:tbl><w:p/>`;
parts["word/document.xml"] = strToU8(
  xml.replace(/(<w:body>)[\s\S]*?(<w:sectPr)/, `$1${table}$2`),
);
const fixture = Buffer.from(zipSync(parts));
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirty: execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  sourceFiles: Object.fromEntries(
    [
      "src/lint/tekst.tsx",
      "src/stijl/openaec-office.css",
      "scripts/proef-writer-linthoogte.mjs",
    ].map((p) => [
      p,
      createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
    ]),
  ),
  baseline,
  route,
  platform: process.platform,
  browser: null,
  cases: [],
  errors: [],
};
const server = await preview({
  configFile: false,
  base: route,
  build: { outDir },
  preview: { host: "127.0.0.1", port: 0 },
});
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
try {
  for (const theme of ["light", "forge"]) {
    for (const width of [1600, 1280, 800]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      await context.addInitScript(
        (theme) =>
          localStorage.setItem(
            "openaec-office-instellingen",
            JSON.stringify({
              taal: "en",
              thema: theme,
              spelling: { controleren: false, autocorrectie: false },
            }),
          ),
        theme,
      );
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on("pageerror", (e) => report.errors.push(e.message));
      await page.goto(server.resolvedUrls.local[0]);
      await page.locator("input[type=file]").first().setInputFiles({
        name: "ribbon-table.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: fixture,
      });
      await page.locator(".canvas-page canvas").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page
        .locator(".canvas-page canvas")
        .first()
        .click({ position: { x: 150, y: 110 } });
      await page.keyboard.press("Control+Home");
      await page
        .getByRole("tab", { name: "Table Design", exact: true })
        .waitFor();
      for (const tab of ["Insert", "Table Design"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        const groups =
          tab === "Insert" ? ["Text"] : ["Alignment", "Data", "Delete"];
        for (const groupName of groups) {
          const group = page.getByRole("group", {
            name: groupName,
            exact: true,
          });
          await group.waitFor();
          const collapsed = (await group.getAttribute("data-niveau")) === "2";
          const groupButton = group.locator(":scope > .ribbon-groep-knop");
          if (collapsed) {
            await groupButton.focus();
            await groupButton.press("Enter");
          }
          async function measure(phase) {
            const data = await group.evaluate((g) => {
              const content = g.querySelector(":scope > .ribbon-groep-inhoud");
              const bounds = content.getBoundingClientRect();
              const horizontal = content.hasAttribute("data-open")
                ? bounds
                : g.getBoundingClientRect();
              const caption = g
                .querySelector(":scope > .ribbon-groep-naam")
                .getBoundingClientRect();
              const visible = (e) =>
                !!e?.getClientRects().length &&
                getComputedStyle(e).visibility !== "hidden";
              return {
                level: g.dataset.niveau ?? "0",
                content: {
                  top: bounds.top,
                  bottom: bounds.bottom,
                  height: bounds.height,
                  left: horizontal.left,
                  right: horizontal.right,
                },
                caption: { top: caption.top, bottom: caption.bottom },
                buttons: [...content.querySelectorAll("button.ribbon-actie")]
                  .filter(visible)
                  .map((b) => {
                    const r = b.getBoundingClientRect(),
                      css = getComputedStyle(b);
                    const focusVisible = b.matches(":focus-visible"),
                      ring =
                        focusVisible && css.outlineStyle !== "none"
                          ? Math.max(
                              0,
                              parseFloat(css.outlineWidth) +
                                parseFloat(css.outlineOffset),
                            )
                          : 0;
                    return {
                      name: b.getAttribute("aria-label"),
                      top: r.top,
                      bottom: r.bottom,
                      height: r.height,
                      left: r.left,
                      right: r.right,
                      disabled: b.disabled,
                      active: b.getAttribute("aria-pressed") === "true",
                      focusVisible,
                      focusOutside: ring,
                      labelVisible: visible(b.querySelector("span")),
                      clipped:
                        r.top - ring < bounds.top - 0.5 ||
                        r.bottom + ring > bounds.bottom + 0.5 ||
                        r.left - ring < horizontal.left - 0.5 ||
                        r.right + ring > horizontal.right + 0.5,
                    };
                  }),
              };
            });
            report.cases.push({
              theme,
              width,
              tab,
              group: groupName,
              phase,
              ...data,
            });
            if (!baseline)
              assert.deepEqual(
                data.buttons.filter((b) => b.clipped),
                [],
                `${theme}/${width}/${groupName}: controls exceed group content`,
              );
            assert.ok(
              data.buttons.length,
              `${groupName}: all commands must remain reachable`,
            );
            if (!baseline && groupName === "Delete")
              for (const name of ["Delete Row", "Delete Column"])
                assert.equal(
                  data.buttons.find((b) => b.name === name)?.labelVisible,
                  true,
                  `${name}: label must remain visible`,
                );
            return data;
          }
          const normal = await measure("normal");
          const commands = {
            Text: [
              "Special Character",
              "Date",
              "Time",
              "Date & Time",
              "Insert field…",
              "Update fields",
            ],
            Alignment: [
              "Top",
              "Center",
              "Bottom",
              "Cell Margins",
              "Text Direction",
            ],
            Data: [
              "Formula",
              "Sort",
              "Repeat Header Rows",
              "Convert to Text",
              "Split Table",
            ],
            Delete: ["Delete Row", "Delete Column", "Delete Table"],
          }[groupName];
          assert.deepEqual(
            normal.buttons.map((b) => b.name).sort(),
            [...commands].sort(),
            `${groupName}: keep every command reachable`,
          );
          const focusName = {
            Text: "Update fields",
            Alignment: "Bottom",
            Data: "Repeat Header Rows",
            Delete: "Delete Row",
          }[groupName];
          const target = group.getByRole("button", {
            name: focusName,
            exact: true,
          });
          if (groupName === "Alignment" || groupName === "Data") {
            // The real DOCX fixture imports bottom alignment and repeated
            // header rows. Measure their actual active state without changing
            // the selection through unrelated table editing commands.
            await target
              .locator('xpath=self::*[@aria-pressed="true"]')
              .waitFor({ state: "attached" });
            const active = await measure("active");
            assert.equal(
              active.buttons.find((b) => b.name === focusName)?.active,
              true,
            );
          }
          if (!collapsed) await page.keyboard.press("Tab");
          await target.focus();
          const focused = await measure("keyboard-focus");
          assert.equal(
            focused.buttons.find((b) => b.name === focusName)?.focusVisible,
            true,
          );
          assert.equal(
            focused.buttons.find((b) => b.name === focusName)?.focusOutside,
            4,
          );
          await (
            collapsed ? group.locator(":scope > .ribbon-groep-inhoud") : group
          ).screenshot({
            path: `${dir}/${theme}-${width}-${groupName}.png`,
          });
          if (collapsed) {
            await page.keyboard.press("Escape");
            assert.equal(
              await groupButton.evaluate((b) => document.activeElement === b),
              true,
              "Escape returns focus to the collapsed group button",
            );
          }
        }
      }
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []);
} finally {
  fs.writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
console.log(
  JSON.stringify({
    source: report.source,
    cases: report.cases.length,
    clipped: report.cases.reduce(
      (n, c) => n + c.buttons.filter((b) => b.clipped).length,
      0,
    ),
    errors: report.errors,
    report: `${dir}/report.json`,
  }),
);
