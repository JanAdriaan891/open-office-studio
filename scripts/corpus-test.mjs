import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
const manifest = JSON.parse(
  await readFile(process.argv[2] ?? ".local/corpus/manifest.json", "utf8"),
);
const uitvoerpad = `.local/corpus/resultaten-${process.argv[3] ?? "direct"}.json`;
const resultaten = [];
const tijdslimiet = Number(process.env.CORPUS_LIMIET_MS ?? 15000);
let volgende = 0;
const wacht = (bestand) =>
  new Promise((resolve) => {
    const engine = bestand.engine ?? bestand.extensie;
    if (!["docx", "xlsx", "pptx", "mdb", "accdb"].includes(engine))
      return resolve({ status: "nog-niet-ondersteund" });
    const kind = spawn(
      process.execPath,
      [
        "--max-old-space-size=512",
        "scripts/corpus-bestand.mjs",
        bestand.bestand,
        engine,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let uitvoer = "",
      fouten = "";
    kind.stdout.on("data", (b) => {
      if (uitvoer.length < 20000) uitvoer += b;
    });
    kind.stderr.on("data", (b) => {
      if (fouten.length < 2000) fouten += b;
    });
    let teLang = false;
    const timer = setTimeout(() => {
      teLang = true;
      kind.kill("SIGKILL");
    }, tijdslimiet);
    kind.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: "procesfout", fout: String(error) });
    });
    kind.on("close", (code) => {
      clearTimeout(timer);
      if (teLang)
        return resolve({
          status: "tijdslimiet",
          fout: `Meer dan ${tijdslimiet / 1000} seconden voor één bestand.`,
          fase: [...fouten.matchAll(/CORPUS_FASE=(.+)/g)].at(-1)?.[1],
        });
      try {
        resolve(
          JSON.parse(
            uitvoer.slice(
              uitvoer.lastIndexOf("CORPUS_RESULTAAT=") +
                "CORPUS_RESULTAAT=".length,
            ),
          ),
        );
      } catch {
        resolve({ status: "procesfout", code, fout: fouten.slice(0, 600) });
      }
    });
  });
async function werk() {
  while (volgende < manifest.bestanden.length) {
    const bestand = manifest.bestanden[volgende++];
    if (bestand.status !== "opgehaald") continue;
    const resultaat = {
      id: bestand.id,
      extensie: bestand.extensie,
      bron: bestand.bron,
      pad: bestand.pad,
      ...(await wacht(bestand)),
    };
    resultaten.push(resultaat);
    if (resultaten.length % 50 === 0) {
      console.log(
        `${resultaten.length}/${manifest.bestanden.length} bestanden beproefd.`,
      );
      await writeFile(uitvoerpad, JSON.stringify(resultaten, null, 2));
    }
  }
}
await Promise.all([werk(), werk()]);
await writeFile(uitvoerpad, JSON.stringify(resultaten, null, 2));
const samenvatting = {};
for (const r of resultaten) {
  samenvatting[r.extensie] ??= {};
  samenvatting[r.extensie][r.status] =
    (samenvatting[r.extensie][r.status] ?? 0) + 1;
}
console.log(JSON.stringify(samenvatting, null, 2));
