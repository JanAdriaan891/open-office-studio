#!/usr/bin/env node
/**
 * Prestatieproef van de spellingmodule (public/spelling/oos_spelling.wasm)
 * met de echte woordenboeken: laden, controle per 1000 woorden en suggesties.
 * Eerst `node scripts/kopieer-assets.mjs` (of de twee spellingscripts).
 *
 * Gebruik: node scripts/spelling-prestatieproef.mjs [--json]
 */
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const codeer = new TextEncoder();
const decodeer = new TextDecoder();

async function module() {
  const { instance } = await WebAssembly.instantiate(await readFile("public/spelling/oos_spelling.wasm"), {});
  const x = instance.exports;
  const schrijf = (bytes) => {
    const p = x.buffer(bytes.length);
    new Uint8Array(x.memory.buffer, p, bytes.length).set(bytes);
    return bytes.length;
  };
  const uitvoer = () => new Uint8Array(x.memory.buffer, x.uitvoer_ptr(), x.uitvoer_len());
  return {
    laad(aff, dic) {
      const samen = new Uint8Array(aff.length + 1 + dic.length);
      samen.set(aff);
      samen.set(dic, aff.length + 1);
      const id = x.laad(schrijf(samen));
      if (!id) throw new Error(decodeer.decode(uitvoer()));
      return id;
    },
    lijst(id, woorden) {
      x.controleer_lijst(id, schrijf(codeer.encode(woorden.join("\n"))));
      return Array.from(uitvoer(), (b) => b === 1);
    },
    suggesties(id, woord) {
      const n = x.suggesties(id, schrijf(codeer.encode(woord)));
      return n > 0 ? decodeer.decode(uitvoer()).split("\n") : [];
    },
    geheugen: () => x.memory.buffer.byteLength,
  };
}

const NL = `De gemeenteraad besprak gisteravond het bestemmingsplan voor de nieuwe woonwijk aan de rand
van de stad. Volgens de wethouder van ruimtelijke ordening is er dringend behoefte aan betaalbare
huurwoningen, vooral voor starters en ouderen. De bouwvergunning wordt naar verwachting in het voorjaar
verleend, waarna de aannemer met het grondwerk kan beginnen. Omwonenden maken zich zorgen over de
verkeersveiligheid en de parkeerdruk in de straten rondom het bouwterrein. De constructeur rekent de
draagconstructie door met gewapend beton en houtskeletbouw voor de bovenverdiepingen. Auto's moeten
buiten de wijk geparkeerd worden, en de kinderopvang komt naast de basisschool. Een opvallend detail is
dat de gevels deels worden bekleed met hergebruikte bakstenen uit een gesloopt schoolgebouw. De
fietsenstallingscapaciteit en de zonnepaneleninstallatie zijn samenstellingen die niet letterlijk in het
woordenboek staan.`;
const EN = `The structural engineer reviewed the foundation drawings and recommended additional reinforcement
for the basement walls. Because the groundwater level is high, the contractor will install a temporary
dewatering system before excavation begins. The architect's colour scheme was approved by the planning
committee, although some residents objected to the height of the apartment buildings.`;

const woorden = (t) => t.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);

const m = await module();
const uitkomst = {};
for (const [id, tekst, fouten] of [
  ["nl", NL, ["gemeenteraadd", "bestemingsplan", "wonig", "huiz", "constructuer"]],
  ["en-GB", EN, ["recieve", "foundaton", "enginer", "basment", "comittee"]],
]) {
  const aff = await readFile(`public/woordenboeken/${id}.aff`);
  const dic = await readFile(`public/woordenboeken/${id}.dic`);
  let t = performance.now();
  const wb = m.laad(aff, dic);
  const laden = performance.now() - t;
  // 10.000 woorden: de tekst herhaald, zonder cache.
  const basis = woorden(tekst);
  const lijst = Array.from({ length: 10000 }, (_, i) => basis[i % basis.length]);
  m.lijst(wb, lijst.slice(0, 200)); // opwarmen
  t = performance.now();
  const goed = m.lijst(wb, lijst);
  const controle = ((performance.now() - t) / lijst.length) * 1000;
  const onbekend = [...new Set(lijst.filter((_, i) => !goed[i]))];
  const suggesties = {};
  let totaal = 0;
  for (const fout of fouten) {
    t = performance.now();
    const s = m.suggesties(wb, fout).slice(0, 5);
    const duur = performance.now() - t;
    totaal += duur;
    suggesties[fout] = { suggesties: s, ms: Math.round(duur) };
  }
  uitkomst[id] = {
    ladenMs: Math.round(laden),
    controleMsPer1000: Number(controle.toFixed(2)),
    onbekend,
    suggestieGemiddeldMs: Math.round(totaal / fouten.length),
    suggesties,
  };
}
uitkomst.geheugenMB = Number((m.geheugen() / 1e6).toFixed(1));
if (process.argv.includes("--json")) console.log(JSON.stringify(uitkomst, null, 2));
else
  for (const [id, r] of Object.entries(uitkomst))
    if (typeof r === "object")
      console.log(
        `${id}: laden ${r.ladenMs} ms · controle ${r.controleMsPer1000} ms/1000 woorden · suggesties gem. ${r.suggestieGemiddeldMs} ms · onbekend: ${r.onbekend.join(", ") || "geen"}\n  ${Object.entries(r.suggesties).map(([w, s]) => `${w} → ${s.suggesties.join(", ")} (${s.ms} ms)`).join("\n  ")}`,
      );
    else console.log(`${id}: ${r}`);
