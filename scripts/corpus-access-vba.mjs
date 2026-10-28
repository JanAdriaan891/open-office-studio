import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { setTimeout as wacht } from "node:timers/promises";
import { promisify } from "node:util";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

// Testcorpus voor de VBA-extractie van Open Database Studio (issue #8).
// Zoekt openbare GitHub-repositories (geen forks) met Access-databases, legt per repository de
// commit-SHA van de standaardtak vast en haalt .accdb/.mdb op (geen .accde/.mde: alleen gecompileerd).
// Elk bestand wordt uitsluitend met de eigen alleen-lezende analyse onderzocht, in een aparte
// worker met tijdslimiet. Er wordt niets uit de bestanden uitgevoerd, en het manifest bevat alleen
// herkomst, hashes en aantallen: geen databaseinhoud, persoonsgegevens of VBA-broncode.
// De bestanden blijven lokaal onder .local/ en worden niet verspreid.

if (!isMainThread) {
  // Worker: één bestand alleen-lezend analyseren en alleen aantallen teruggeven.
  const { default: MDBReader } = await import("mdb-reader");
  const { analyseerDatabase } = await import(
    "../packages/database/src/access-analyse.ts"
  );
  const buffer = await readFile(workerData.pad);
  const bytes = new Uint8Array(buffer);
  try {
    const db = new MDBReader(buffer);
    const { objecten, rapport } = await analyseerDatabase(db, bytes, {
      naam: workerData.naam,
      grootte: bytes.byteLength,
    });
    const vba = objecten.filter((o) => o.soort === "VBA");
    const regel = rapport.regels.find((r) => r.onderdeel === "VBA-modules");
    const toelichting = regel?.toelichting ?? "";
    parentPort.postMessage({
      formaat: rapport.formaat,
      vbaStatus: regel?.status ?? null,
      vbaProject: /VBA-project ‘/.test(toelichting),
      vbaOpslag: /in (MSysAccess\w+)/.exec(toelichting)?.[1] ?? null,
      access97Modules: /MSysModules2/.test(toelichting),
      vbaNietGelezen: /VBA-project niet gelezen: (.*)$/.exec(toelichting)?.[1] ?? null,
      vergrendeld: /vergrendeld voor weergave/.test(toelichting),
      wachtwoord: /heeft een wachtwoord/.test(toelichting),
      modules: vba.length,
      modulesMetBron: vba.filter((o) => o.bron).length,
      regels: vba.reduce(
        (som, o) => som + (o.bron ? o.bron.split(/\r\n|\r|\n/).length : 0),
        0,
      ),
      alleenGecompileerd: vba.filter((o) =>
        o.beperkingen?.some((b) => /alleen gecompileerde code/.test(b)),
      ).length,
      moduleFouten: [
        ...new Set(
          vba.flatMap((o) =>
            (o.beperkingen ?? [])
              .filter((b) => b.startsWith("Broncode niet teruggewonnen: "))
              .map((b) => b.replace(/^Broncode niet teruggewonnen: /, "")),
          ),
        ),
      ],
      rapportregels: Object.fromEntries(
        rapport.regels.map((r) => [r.onderdeel, r.status]),
      ),
    });
  } catch (fout) {
    parentPort.postMessage({ fout: String(fout?.message ?? fout) });
  }
  process.exit(0);
}

const map = ".local/corpus/access-vba";
const bestandenMap = join(map, "bestanden");
const manifestPad = join(map, "manifest.json");
const kandidatenPad = join(map, "kandidaten.json");
const DOEL = Number(process.env.DOEL ?? 100);
const MAX_GROOTTE = 25 * 1024 * 1024;
const MAX_TOTAAL = 2 * 1024 ** 3;
const MAX_PER_REPO = 3;
await mkdir(bestandenMap, { recursive: true });

const gh = promisify(execFile);
// GitHub-API via gh, met pauze bij rate-limits (403/429) en een paar herhalingen bij netwerkfouten.
async function api(pad, soort = "core") {
  for (let poging = 0; ; poging++) {
    try {
      const { stdout } = await gh("gh", ["api", pad], {
        maxBuffer: 256 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch (fout) {
      const tekst = `${fout.stderr ?? ""} ${fout.stdout ?? ""} ${fout.message}`;
      if (/HTTP 40[49]|HTTP 422|HTTP 451|Not Found|Repository access blocked|Git Repository is empty/i.test(tekst))
        return null;
      if (/rate limit|HTTP 403|HTTP 429|secondary/i.test(tekst) && poging < 20) {
        let tot = Date.now() + 60_000;
        try {
          const { stdout } = await gh("gh", ["api", "rate_limit"]);
          const bron = JSON.parse(stdout).resources[soort];
          if (bron.remaining === 0) tot = bron.reset * 1000 + 2000;
        } catch {}
        const seconden = Math.max(5, Math.round((tot - Date.now()) / 1000));
        console.log(`Rate-limit (${soort}); pauze ${seconden} s.`);
        await wacht(seconden * 1000);
        continue;
      }
      if (poging < 3) {
        await wacht(5000 * (poging + 1));
        continue;
      }
      throw new Error(`gh api ${pad}: ${tekst.trim().slice(0, 300)}`);
    }
  }
}

// 1. Kandidaat-repositories zoeken (resultaat wordt bewaard zodat een herstart niet opnieuw zoekt).
const zoekvragen = [
  "msaccess",
  "ms-access vba",
  "accdb",
  "access database vba",
  "northwind access",
  "topic:ms-access",
  "topic:msaccess",
  "topic:access-vba",
  "topic:microsoft-access",
  "topic:access-database",
  "topic:vba-access",
  "topic:accdb",
  "ms access",
  "microsoft access",
  "access vba",
  "access frontend",
  "mdb vba",
  "language:VBA access",
  "language:VBA database",
  "language:VBA form",
];
let kandidaten;
try {
  kandidaten = JSON.parse(await readFile(kandidatenPad, "utf8"));
} catch {
  const gevonden = new Map();
  for (const vraag of zoekvragen) {
    for (const sort of ["", "&sort=updated"]) {
      for (let pagina = 1; pagina <= 10; pagina++) {
        const q = encodeURIComponent(`${vraag} fork:false`);
        const antwoord = await api(
          `search/repositories?q=${q}&per_page=100&page=${pagina}${sort}`,
          "search",
        );
        const items = antwoord?.items ?? [];
        for (const r of items)
          if (!r.fork && !r.private && r.size > 0 && !gevonden.has(r.full_name))
            gevonden.set(r.full_name, {
              repo: r.full_name,
              tak: r.default_branch,
              grootteKB: r.size,
              licentie:
                r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION"
                  ? r.license.spdx_id
                  : null,
              vraag,
            });
        if (items.length < 100) break;
        await wacht(2100); // zoek-API: 30 verzoeken per minuut
      }
    }
    console.log(`Zoekvraag "${vraag}": totaal ${gevonden.size} repositories.`);
  }
  kandidaten = [...gevonden.values()];
  await writeFile(kandidatenPad, JSON.stringify(kandidaten, null, 2));
}

// 2. Bestaand manifest hervatten.
let manifest = { datum: null, bestanden: [], repositories: {} };
try {
  manifest = JSON.parse(await readFile(manifestPad, "utf8"));
  manifest.repositories ??= {};
} catch {}
const bewaar = async () => {
  manifest.datum = new Date().toISOString();
  manifest.samenvatting = {
    kandidaatRepositories: kandidaten.length,
    onderzochteRepositories: Object.keys(manifest.repositories).length,
    kandidaatBestanden: Object.values(manifest.repositories).reduce(
      (s, r) => s + (r.databases ?? 0),
      0,
    ),
    opgehaald: manifest.bestanden.filter((b) => b.status === "opgehaald").length,
    metVbaBron: manifest.bestanden.filter((b) => b.vba?.modulesMetBron > 0).length,
    totaleGrootte: totaal(),
  };
  await writeFile(manifestPad, JSON.stringify(manifest, null, 2));
};
const totaal = () =>
  manifest.bestanden
    .filter((b) => b.status === "opgehaald")
    .reduce((s, b) => s + b.grootte, 0);
const gezien = new Set(manifest.bestanden.map((b) => b.gitSha));
const gezienSha256 = new Set(
  manifest.bestanden.filter((b) => b.sha256).map((b) => b.sha256),
);
const metBron = () =>
  manifest.bestanden.filter((b) => b.vba?.modulesMetBron > 0).length;

const gitHash = (bytes) =>
  createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const kortVan = (repo) =>
  repo.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
const codeer = (pad) => pad.split("/").map(encodeURIComponent).join("/");

async function haal(url) {
  for (let poging = 0; ; poging++) {
    const antwoord = await fetch(url, { signal: AbortSignal.timeout(120_000) }).catch(
      (fout) => ({ ok: false, status: String(fout) }),
    );
    if (antwoord.ok) return Buffer.from(await antwoord.arrayBuffer());
    if ([403, 429].includes(antwoord.status) && poging < 5) {
      console.log(`Download HTTP ${antwoord.status}; pauze 60 s.`);
      await wacht(60_000);
      continue;
    }
    if (poging < 2 && typeof antwoord.status !== "number") {
      await wacht(5000);
      continue;
    }
    throw new Error(`HTTP ${antwoord.status}`);
  }
}

function analyseer(pad, naam) {
  return new Promise((klaar) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { pad, naam },
      resourceLimits: { maxOldGenerationSizeMb: 2048 },
    });
    let antwoord = null;
    const klok = setTimeout(() => {
      antwoord = { fout: "Tijdslimiet (120 s) overschreden.", tijdslimiet: true };
      worker.terminate();
    }, 120_000);
    worker.on("message", (m) => (antwoord ??= m));
    worker.on("error", (fout) => (antwoord ??= { fout: `Worker-crash: ${fout.message}`, crash: true }));
    worker.on("exit", (code) => {
      clearTimeout(klok);
      klaar(antwoord ?? { fout: `Worker beëindigd met code ${code}.`, crash: true });
    });
  });
}

// 3. Repositories doorlopen tot het doel bereikt is of de kandidaten op zijn.
for (const kandidaat of kandidaten) {
  if (metBron() >= DOEL) break;
  if (totaal() >= MAX_TOTAAL) {
    console.log("Groottegrens van ~2 GB bereikt.");
    break;
  }
  if (manifest.repositories[kandidaat.repo]) continue;
  const tak = await api(
    `repos/${kandidaat.repo}/branches/${encodeURIComponent(kandidaat.tak)}`,
  );
  const revisie = tak?.commit?.sha;
  const boom = revisie
    ? await api(`repos/${kandidaat.repo}/git/trees/${revisie}?recursive=1`)
    : null;
  const databases = (boom?.tree ?? []).filter(
    (item) =>
      item.type === "blob" && /\.(accdb|mdb)$/i.test(item.path),
  );
  manifest.repositories[kandidaat.repo] = {
    revisie: revisie ?? null,
    afgekapt: Boolean(boom?.truncated),
    databases: databases.length,
  };
  let genomen = 0;
  for (const item of databases) {
    if (genomen >= MAX_PER_REPO || metBron() >= DOEL) break;
    const extensie = extname(item.path).slice(1).toLowerCase();
    const id = `${kortVan(kandidaat.repo)}-${item.sha}`;
    const record = {
      id,
      bron: kandidaat.repo,
      revisie,
      pad: item.path,
      naam: basename(item.path),
      extensie,
      grootte: item.size,
      gitSha: item.sha,
      sha256: null,
      bestand: join(bestandenMap, `${id}.${extensie}`),
      url: `https://raw.githubusercontent.com/${kandidaat.repo}/${revisie}/${codeer(item.path)}`,
      licentie: kandidaat.licentie,
      status: null,
    };
    if (gezien.has(item.sha)) continue; // identieke blob al elders verwerkt
    gezien.add(item.sha);
    if (item.size > MAX_GROOTTE) {
      record.status = "te-groot";
      manifest.bestanden.push(record);
      continue;
    }
    try {
      let bytes = await haal(record.url);
      const begin = bytes.subarray(0, 200).toString("latin1");
      if (begin.startsWith("version https://git-lfs")) {
        const oid = /oid sha256:([0-9a-f]{64})/.exec(begin)?.[1];
        const lfsGrootte = Number(/size (\d+)/.exec(begin)?.[1] ?? 0);
        record.lfs = true;
        if (lfsGrootte > MAX_GROOTTE) {
          record.grootte = lfsGrootte;
          throw Object.assign(new Error("LFS-object te groot."), { status: "te-groot" });
        }
        record.url = `https://media.githubusercontent.com/media/${kandidaat.repo}/${revisie}/${codeer(item.path)}`;
        bytes = await haal(record.url);
        if (createHash("sha256").update(bytes).digest("hex") !== oid)
          throw new Error("LFS-download wijkt af van de pointer.");
      } else if (gitHash(bytes) !== item.sha) {
        throw new Error("De download wijkt af van de vastgelegde bronrevisie.");
      }
      record.grootte = bytes.length;
      const handtekening = bytes.subarray(4, 19).toString("latin1");
      if (!/^Standard (Jet|ACE) DB$/.test(handtekening))
        throw Object.assign(new Error("Geen Jet/ACE-handtekening."), {
          status: "geen-database",
        });
      record.sha256 = createHash("sha256").update(bytes).digest("hex");
      if (gezienSha256.has(record.sha256))
        throw Object.assign(new Error("Inhoud identiek aan een eerder bestand."), {
          status: "dubbel",
        });
      gezienSha256.add(record.sha256);
      await writeFile(record.bestand, bytes);
      const uitslag = await analyseer(record.bestand, record.naam);
      // Hash na de analyse: het origineel moet ongewijzigd zijn.
      const na = createHash("sha256").update(await readFile(record.bestand)).digest("hex");
      if (na !== record.sha256) throw new Error("Bestand gewijzigd tijdens analyse!");
      record.status = "opgehaald";
      record.vba = uitslag;
      genomen++;
    } catch (fout) {
      record.status = fout.status ?? "downloadfout";
      record.fout = fout.message;
      await rm(record.bestand, { force: true });
    }
    manifest.bestanden.push(record);
    console.log(
      `${metBron()}/${DOEL} met VBA-bron · ${record.status} · ${record.bron}/${record.pad}` +
        (record.vba ? ` · modules ${record.vba.modulesMetBron}/${record.vba.modules}` : "") +
        (record.vba?.fout ? ` · analysefout: ${record.vba.fout}` : ""),
    );
  }
  await bewaar();
}
await bewaar();
console.log(JSON.stringify(manifest.samenvatting, null, 2));
