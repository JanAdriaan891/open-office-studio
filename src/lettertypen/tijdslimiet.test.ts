import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";

// De lijst met systeemlettertypen komt in deze tests nooit binnen, zoals bij
// een schijfscan die blijft hangen (#370).
vi.mock("./systeem", () => ({
  laadSysteemLettertypen: () => new Promise<string[]>(() => {}),
  opSysteem: () => false,
  systeemLettertypeBytes: async () => null,
}));

import { binnenTijd, CSS_TIJDSLIMIET, registreerCss } from "./catalogus";
import {
  documentLettertypen,
  registreerVervangers,
  SYSTEEMLIJST_TIJDSLIMIET,
} from "./document";

const rekenblad = () =>
  zipSync({
    "xl/styles.xml": strToU8('<styleSheet><fonts><font><name val="Calibri"/></font></fonts></styleSheet>'),
  });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("tijdslimieten bij lettertypen (#370)", () => {
  it("geeft de uitkomst door als die op tijd is en anders de terugval", async () => {
    await expect(binnenTijd(Promise.resolve("op tijd"), 1000, "te laat")).resolves.toBe("op tijd");
    await expect(binnenTijd(Promise.reject(new Error("stuk")), 1000, "te laat")).rejects.toThrow("stuk");
    const traag = binnenTijd(new Promise<string>(() => {}), 1000, "te laat");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(traag).resolves.toBe("te laat");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("wacht bij het openen begrensd op de systeemlijst en kiest dan de meegeleverde vervanger", async () => {
    let info: Awaited<ReturnType<typeof documentLettertypen>> | undefined;
    void documentLettertypen(rekenblad()).then((i) => (info = i));
    await vi.advanceTimersByTimeAsync(SYSTEEMLIJST_TIJDSLIMIET - 1);
    expect(info).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(info).toEqual({
      namen: ["Calibri"],
      vervangingen: [{ origineel: "Calibri", vervanger: "Carlito", soort: "metrisch" }],
      systeemBekend: false,
    });
  });

  it("laat een lettertype dat niet laadt het registreren niet eindeloos ophouden", async () => {
    let pogingen = 0;
    const toegevoegd: unknown[] = [];
    vi.stubGlobal(
      "FontFace",
      class {
        constructor() {
          pogingen++;
        }
        load() {
          return new Promise(() => {});
        }
      },
    );
    vi.stubGlobal("document", { fonts: { add: (f: unknown) => toegevoegd.push(f) } });
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([0, 1, 0, 0])));

    let klaar = false;
    void registreerVervangers({
      namen: ["Segoe UI"],
      vervangingen: [{ origineel: "Segoe UI", vervanger: "Selawik", soort: "metrisch" }],
    }).then(() => (klaar = true));
    await vi.advanceTimersByTimeAsync(CSS_TIJDSLIMIET - 1);
    expect(klaar).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(klaar).toBe(true);
    expect(pogingen).toBeGreaterThan(0);
    expect(toegevoegd).toEqual([]);

    // Niet onthouden als mislukt: een volgende keer wordt opnieuw geprobeerd.
    const eerder = pogingen;
    const opnieuw = registreerCss("Selawik", "Segoe UI");
    await vi.advanceTimersByTimeAsync(CSS_TIJDSLIMIET);
    await expect(opnieuw).resolves.toBe(false);
    expect(pogingen).toBeGreaterThan(eerder);
  });
});
