/// <reference lib="webworker" />
/**
 * Web Worker van de spellingcontrole: laadt de WASM-module en de
 * woordenboeken (public/spelling, public/woordenboeken) en beantwoordt
 * controle- en suggestieverzoeken. Zie motor.ts voor het protocol.
 */
import { DirecteMotor, type Antwoord, type Verzoek } from "./motor";
import { Spellbook } from "./spellbook";
import type { TaalId } from "./talen";

let motor: DirecteMotor | null = null;

async function bytes(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} kon niet worden geladen (${r.status}).`);
  return new Uint8Array(await r.arrayBuffer());
}

function init(wasm: string, woordenboeken: string) {
  const module = (async () => {
    const r = await fetch(wasm);
    if (!r.ok) throw new Error(`De spellingmodule kon niet worden geladen (${r.status}).`);
    return Spellbook.laad(await r.arrayBuffer());
  })();
  const index = bytes(new URL("index.json", woordenboeken).href).then(
    (b) => JSON.parse(new TextDecoder().decode(b)) as { id: TaalId; aff: string; dic: string }[],
  );
  motor = new DirecteMotor(module, async (taal) => {
    const item = (await index).find((w) => w.id === taal);
    if (!item) throw new Error(`Geen woordenboek voor ${taal}.`);
    const [aff, dic] = await Promise.all([
      bytes(new URL(`${taal}.aff?v=${item.aff}`, woordenboeken).href),
      bytes(new URL(`${taal}.dic?v=${item.dic}`, woordenboeken).href),
    ]);
    return { aff, dic };
  });
}

self.addEventListener("message", async (e: MessageEvent<Verzoek>) => {
  const v = e.data;
  const antwoord = (a: Antwoord) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(a);
  try {
    if (v.soort === "init") {
      init(v.wasm, v.woordenboeken);
      return antwoord({ id: v.id, ok: true, waarde: null });
    }
    if (!motor) throw new Error("De spellingcontrole is niet gestart.");
    const waarde =
      v.soort === "controleer"
        ? await motor.controleer(v.taal, v.woorden)
        : v.soort === "suggesties"
          ? await motor.suggesties(v.taal, v.woord)
          : await motor.bereidVoor(v.taal);
    antwoord({ id: v.id, ok: true, waarde: waarde ?? null });
  } catch (fout) {
    antwoord({ id: v.id, ok: false, fout: String((fout as Error)?.message ?? fout) });
  }
});
