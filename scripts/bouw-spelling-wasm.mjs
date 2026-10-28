#!/usr/bin/env node
/**
 * Bouwt de spellingmodule (src/spelling/rust: spellbook als WASM, #21) en
 * zet hem in public/spelling/. De uitkomst komt in .local/spelling-wasm/<hash>/
 * (hash over Cargo.toml, Cargo.lock en de bron), zodat een volgende build
 * zonder cargo of zonder wasm32-doel de bewaarde module gebruikt. De
 * licentieteksten van de Rust-afhankelijkheden gaan mee naar
 * public/licenses/spelling/.
 *
 * Vereist voor een nieuwe build: cargo en `rustup target add wasm32-unknown-unknown`.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const voerUit = promisify(execFile);
export const BRON = "src/spelling/rust";
export const CACHE = ".local/spelling-wasm";
export const DOEL = "public/spelling";
export const LICENTIES = "public/licenses/spelling";
const DOELTRIPEL = "wasm32-unknown-unknown";
const WASM = "oos_spelling.wasm";

async function bronbestanden(map) {
  const uit = [];
  for (const item of await readdir(map, { withFileTypes: true })) {
    const pad = join(map, item.name);
    if (item.isDirectory()) uit.push(...(await bronbestanden(pad)));
    else uit.push(pad);
  }
  return uit.sort();
}

export async function bronHash() {
  const hash = createHash("sha256");
  for (const pad of [join(BRON, "Cargo.toml"), join(BRON, "Cargo.lock"), ...(await bronbestanden(join(BRON, "src")))]) {
    hash.update(pad.replaceAll("\\", "/"));
    hash.update(await readFile(pad));
  }
  return hash.digest("hex").slice(0, 16);
}

async function bestaat(pad) {
  try {
    await readFile(pad);
    return true;
  } catch {
    return false;
  }
}

/** Licentiebestanden van de crates die in de WASM-module zitten. */
async function verzamelLicenties(map) {
  const { stdout } = await voerUit(
    "cargo",
    ["metadata", "--locked", "--format-version", "1", "--filter-platform", DOELTRIPEL, "--manifest-path", join(BRON, "Cargo.toml")],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  const metadata = JSON.parse(stdout);
  const knopen = new Map(metadata.resolve.nodes.map((n) => [n.id, n]));
  const nodig = new Set();
  const loop = (id) => {
    if (nodig.has(id)) return;
    nodig.add(id);
    for (const dep of knopen.get(id)?.deps ?? [])
      if (dep.dep_kinds.some((k) => k.kind === null)) loop(dep.pkg);
  };
  loop(metadata.resolve.root);
  const regels = [];
  for (const pakket of metadata.packages) {
    if (!nodig.has(pakket.id) || pakket.source === null) continue;
    const pakketmap = dirname(pakket.manifest_path);
    const teksten = [];
    for (const naam of (await readdir(pakketmap)).sort())
      if (/^(licen[cs]e|copying|notice)/i.test(naam)) {
        const doel = `${pakket.name}-${pakket.version}-${naam}`;
        await copyFile(join(pakketmap, naam), join(map, doel));
        teksten.push(doel);
      }
    if (!teksten.length) throw new Error(`Licentietekst ontbreekt voor ${pakket.name} ${pakket.version}`);
    regels.push(`${pakket.name} ${pakket.version} (${pakket.license}): ${teksten.join(", ")}`);
  }
  await writeFile(
    join(map, "BRONNEN.txt"),
    `Rust-crates in de spellingmodule (public/spelling/${WASM})\n\n${regels.join("\n")}\n`,
  );
}

/**
 * Zorgt dat public/spelling/oos_spelling.wasm bij de huidige bron hoort.
 * Geeft { gebouwd, uitCache } of gooit met een uitleg.
 */
export async function bouwSpellingWasm({ log = console.log } = {}) {
  const hash = await bronHash();
  const map = join(CACHE, hash);
  let gebouwd = false;
  if (!(await bestaat(join(map, WASM)))) {
    const doelmap = join(".local", "spelling-target");
    try {
      await voerUit(
        "cargo",
        ["build", "--release", "--locked", "--lib", "--target", DOELTRIPEL, "--manifest-path", join(BRON, "Cargo.toml")],
        { env: { ...process.env, CARGO_TARGET_DIR: doelmap }, maxBuffer: 32 * 1024 * 1024 },
      );
    } catch (e) {
      throw new Error(
        `De spellingmodule kon niet worden gebouwd (cargo met doel ${DOELTRIPEL} nodig: "rustup target add ${DOELTRIPEL}"). ${String(e?.stderr ?? e?.message ?? e).trim().split("\n").slice(-3).join(" ")}`,
      );
    }
    await rm(map, { recursive: true, force: true });
    await mkdir(join(map, "licenties"), { recursive: true });
    await verzamelLicenties(join(map, "licenties"));
    await copyFile(join(doelmap, DOELTRIPEL, "release", WASM), join(map, WASM));
    gebouwd = true;
  }
  await mkdir(DOEL, { recursive: true });
  await mkdir(LICENTIES, { recursive: true });
  await copyFile(join(map, WASM), join(DOEL, WASM));
  for (const naam of await readdir(join(map, "licenties")))
    await copyFile(join(map, "licenties", naam), join(LICENTIES, naam));
  await writeFile(join(DOEL, "versie.json"), JSON.stringify({ hash }));
  log(`Spellingmodule: ${gebouwd ? "gebouwd" : "uit de cache"} (${hash}).`);
  return { gebouwd, hash };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await bouwSpellingWasm();
