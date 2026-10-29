/**
 * Desktopbundels volgen de talen uit talen.ts: Linux-startmenu-items (.desktop),
 * macOS-lokalisaties (Info.plist) en de NSIS-installertalen (Windows).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- script zonder typen
import { maakAlle } from "../../scripts/maak-desktopbestanden.mjs";
import { TAALCODES } from "./talen";

const APPS = ["src-tauri", "apps/database-studio/src-tauri"];
const macCode = (taal: string) => (taal === "zh-CN" ? "zh-Hans" : taal === "zh-TW" ? "zh-Hant" : taal);

describe("desktopbundels", () => {
  it("de .desktop-sjablonen zijn actueel (node scripts/maak-desktopbestanden.mjs)", async () => {
    expect(await maakAlle({ controleer: true })).toEqual([]);
  });

  it.each(APPS)("%s/Info.plist noemt elke interfacetaal in CFBundleLocalizations", (app) => {
    const plist = readFileSync(join(app, "Info.plist"), "utf8");
    const lijst = /<key>CFBundleLocalizations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? "";
    const codes = [...lijst.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
    expect(codes.sort()).toEqual(TAALCODES.map(macCode).sort());
  });

  it.each(APPS)("%s: NSIS heeft een taal per interfacetaal en elk eigen taalbestand bestaat", (app) => {
    const conf = JSON.parse(readFileSync(join(app, "tauri.windows.conf.json"), "utf8"));
    const nsis = conf.bundle.windows.nsis;
    expect(nsis.languages).toHaveLength(TAALCODES.length);
    for (const [taal, pad] of Object.entries<string>(nsis.customLanguageFiles ?? {})) {
      expect(nsis.languages).toContain(taal);
      const bestand = join(app, pad);
      expect(existsSync(bestand), bestand).toBe(true);
      expect(readFileSync(bestand, "utf8")).toMatch(/LangString deleteAppData \$\{LANG_/);
    }
  });
});
