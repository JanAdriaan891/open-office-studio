// Voert de dia-opdrachten van het presentatielint echt uit tegen de engine en
// controleert het resultaat na opslaan en heropenen.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import * as pptx from "@betteroffice/pptx";
import {
  verwijderDia,
  verplaatsDia,
  verwijderVorm,
  voegTekstvakToe,
  lijnVormUit,
  kaderVan,
} from "../src/lint/presentatie-opdrachten.ts";

await pptx.initWasm(
  await readFile(
    "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
  ),
);

const tekstVan = (dia) =>
  dia.shapes
    .flatMap((vorm) => vorm.textStories)
    .flatMap((story) => story.paragraphs)
    .map((alinea) => alinea.runs.map((run) => run.text).join(""))
    .join("\n");
const inhoud = (deck) =>
  deck.snapshot().slides.map((dia) => ({
    tekst: tekstVan(dia),
    notities: dia.notes ?? "",
    vormen: dia.shapes.length,
  }));
const heropend = (deck) => pptx.openPresentation(deck.save());

let geslaagd = 0;
async function proef(naam, bestand, werk) {
  const deck = pptx.openPresentation(await readFile(bestand));
  const toepassen = (verzoek) => deck.applyEdits(verzoek);
  await werk(deck, toepassen);
  geslaagd++;
  console.log(`ok  ${bestand.split("/").at(-1)}: ${naam}`);
}

for (const bestand of [
  "public/templates/nieuw.pptx",
  "docs/voorbeelden/Ontwerpvisie.pptx",
]) {
  const origineel = inhoud(pptx.openPresentation(await readFile(bestand)));

  await proef(
    "enige dia niet verwijderen / dia verwijderen",
    bestand,
    async (deck, toepassen) => {
      if (origineel.length < 2) {
        await assert.rejects(verwijderDia(deck, toepassen, 0));
        assert.deepEqual(inhoud(heropend(deck)), origineel);
        return;
      }
      assert.equal(await verwijderDia(deck, toepassen, 1), true);
      const verwacht = origineel.filter((_, i) => i !== 1);
      assert.deepEqual(inhoud(deck), verwacht);
      assert.deepEqual(inhoud(heropend(deck)), verwacht);
      assert.equal(deck.undo().applied, true);
      assert.deepEqual(inhoud(deck), origineel);
      assert.deepEqual(inhoud(heropend(deck)), origineel);
    },
  );

  await proef("dia verplaatsen", bestand, async (deck, toepassen) => {
    const n = origineel.length;
    assert.equal(await verplaatsDia(deck, toepassen, 0, "omhoog"), null);
    assert.equal(await verplaatsDia(deck, toepassen, n - 1, "omlaag"), null);
    if (n < 2) return assert.deepEqual(inhoud(heropend(deck)), origineel);
    assert.equal(await verplaatsDia(deck, toepassen, 0, "omlaag"), 1);
    let verwacht = [origineel[1], origineel[0], ...origineel.slice(2)];
    assert.deepEqual(inhoud(heropend(deck)), verwacht);
    assert.equal(await verplaatsDia(deck, toepassen, 1, "omhoog"), 0);
    assert.deepEqual(inhoud(heropend(deck)), origineel);
    assert.equal(await verplaatsDia(deck, toepassen, 0, "einde"), n - 1);
    verwacht = [...origineel.slice(1), origineel[0]];
    assert.deepEqual(inhoud(heropend(deck)), verwacht);
    assert.equal(await verplaatsDia(deck, toepassen, n - 1, "begin"), 0);
    assert.deepEqual(inhoud(heropend(deck)), origineel);
    deck.undo();
    assert.deepEqual(inhoud(deck), verwacht);
  });

  await proef("vorm verwijderen", bestand, async (deck, toepassen) => {
    const dia = deck.snapshot().slides[0];
    if (!dia.shapes.length) return;
    await verwijderVorm(deck, toepassen, dia.id, dia.shapes[0].id);
    const na = inhoud(heropend(deck));
    assert.equal(na[0].vormen, origineel[0].vormen - 1);
    assert.equal(na[0].notities, origineel[0].notities);
    deck.undo();
    assert.deepEqual(inhoud(heropend(deck)), origineel);
  });

  await proef("datum als tekstvak", bestand, async (deck, toepassen) => {
    await voegTekstvakToe(deck, toepassen, 0, "26-10-2026");
    const na = inhoud(heropend(deck));
    assert.equal(na[0].vormen, origineel[0].vormen + 1);
    assert.match(na[0].tekst, /26-10-2026/);
    deck.undo();
    assert.deepEqual(inhoud(heropend(deck)), origineel);
  });

  await proef("vorm uitlijnen op de dia", bestand, async (deck, toepassen) => {
    const { widthEmu, heightEmu, slides } = deck.snapshot();
    const vorm = slides[0].shapes.find((v) => kaderVan(v));
    if (!vorm) return;
    const kader = kaderVan(vorm);
    for (const [wijze, x, y] of [
      ["rechts", widthEmu - kader.width, null],
      ["onder", null, heightEmu - kader.height],
      ["links", 0, null],
      ["boven", null, 0],
    ]) {
      const huidig = kaderVan(
        deck.snapshot().slides[0].shapes.find((v) => v.id === vorm.id),
      );
      const nu = deck.snapshot().slides[0].shapes.find((v) => v.id === vorm.id);
      await lijnVormUit(deck, toepassen, slides[0].id, nu, wijze);
      const na = kaderVan(
        heropend(deck)
          .snapshot()
          .slides[0].shapes.find((v) => v.name === vorm.name),
      );
      assert.equal(na.x, x ?? huidig.x, wijze);
      assert.equal(na.y, y ?? huidig.y, wijze);
      assert.equal(na.width, kader.width);
    }
    assert.deepEqual(inhoud(heropend(deck)), origineel);
  });
}
console.log(`${geslaagd} proeven geslaagd`);
