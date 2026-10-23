import { spawn, execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  stat,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

// Alleen een conversieproef: dit belooft nog geen beschikbaarheid van deze formaten in de app.
if (process.platform !== "linux")
  throw new Error("Deze afgeschermde corpusproef vereist Linux en bubblewrap.");
// Het conversieprogramma en zijn beveiligingsprofiel komen uit de omgeving, net als in de desktopapp.
const programma = process.env.OPENAEC_CONVERSIE_PROGRAMMA;
if (!programma)
  throw new Error(
    "Zet OPENAEC_CONVERSIE_PROGRAMMA op het pad van het conversieprogramma.",
  );
const profielbron = process.env.OPENAEC_CONVERSIE_PROFIEL;
execFileSync("bwrap", [
  "--unshare-net",
  "--ro-bind",
  "/",
  "/",
  "/usr/bin/true",
]);
const manifest = JSON.parse(
  await readFile(".local/corpus/manifest.json", "utf8"),
);
const modules = [
  {
    engine: "docx",
    doel: "docx",
    extensies: ["doc", "dot", "docm", "dotx", "dotm", "odt", "rtf"],
  },
  {
    engine: "xlsx",
    doel: "xlsx",
    extensies: ["xls", "xlt", "xlsm", "xlsb", "xltx", "xltm", "ods", "csv"],
  },
  {
    engine: "pptx",
    doel: "pptx",
    extensies: ["ppt", "pps", "pot", "pptm", "potx", "potm", "ppsx", "odp"],
  },
];
const map = resolve(".local/corpus/conversie");
await mkdir(map, { recursive: true });
const taken = [];
for (const module of modules) {
  const bestanden = manifest.bestanden.filter(
    (b) => b.status === "opgehaald" && module.extensies.includes(b.extensie),
  );
  for (let i = 0; i < bestanden.length; i += 20)
    taken.push({ ...module, bestanden: bestanden.slice(i, i + 20) });
}
const resultaten = [],
  omgezet = [];
let volgende = 0;
async function werk() {
  while (volgende < taken.length) {
    const taak = taken[volgende++];
    const werkmap = await mkdtemp(join(map, "groep-"));
    const profiel = join(werkmap, "profiel");
    const uit = join(werkmap, "uit");
    await mkdir(join(profiel, "user"), { recursive: true });
    await mkdir(uit);
    if (profielbron)
      await copyFile(
        profielbron,
        join(profiel, "user", "registrymodifications.xcu"),
      );
    const args = [
      "--unshare-net",
      "--die-with-parent",
      "--ro-bind",
      "/",
      "/",
      "--bind",
      werkmap,
      werkmap,
      "--tmpfs",
      "/tmp",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      programma,
      `-env:UserInstallation=${pathToFileURL(profiel).href}`,
      "--headless",
      "--nologo",
      "--nodefault",
      "--norestore",
      "--convert-to",
      taak.doel,
      "--outdir",
      uit,
      ...taak.bestanden.map((b) => resolve(b.bestand)),
    ];
    const start = performance.now();
    const afloop = await new Promise((klaar) => {
      const kind = spawn("bwrap", args, {
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      let fouten = "",
        uitvoer = "",
        teLang = false;
      kind.stdout.on("data", (b) => {
        if (uitvoer.length < 20000) uitvoer += b;
      });
      kind.stderr.on("data", (b) => {
        if (fouten.length < 4000) fouten += b;
      });
      const timer = setTimeout(() => {
        teLang = true;
        try {
          process.kill(-kind.pid, "SIGKILL");
        } catch {}
      }, 60000);
      kind.on("error", (e) => {
        clearTimeout(timer);
        klaar({ fout: String(e), code: -1 });
      });
      kind.on("close", (code) => {
        clearTimeout(timer);
        klaar({ code, teLang, fout: fouten, uitvoer });
      });
    });
    for (const bestand of taak.bestanden) {
      const doel = join(uit, `${bestand.id}.${taak.engine}`);
      let grootte = 0;
      try {
        grootte = (await stat(doel)).size;
      } catch {}
      resultaten.push({
        id: bestand.id,
        extensie: bestand.extensie,
        pad: bestand.pad,
        status: grootte
          ? "geconverteerd"
          : afloop.teLang
            ? "tijdslimiet"
            : "geweigerd-of-fout",
        uitvoerBytes: grootte,
        batchMs: performance.now() - start,
        fout: grootte ? undefined : afloop.fout.slice(0, 500),
      });
      if (grootte)
        omgezet.push({ ...bestand, bestand: doel, engine: taak.engine });
    }
    console.log(
      `${resultaten.length} conversies geprobeerd; ${omgezet.length} bestanden ontvangen.`,
    );
    await writeFile(
      join(map, "resultaten.json"),
      JSON.stringify(resultaten, null, 2),
    );
    await writeFile(
      join(map, "manifest.json"),
      JSON.stringify({ bestanden: omgezet }, null, 2),
    );
  }
}
await Promise.all([werk(), werk()]);
console.log(
  JSON.stringify({
    geprobeerd: resultaten.length,
    geconverteerd: omgezet.length,
  }),
);
