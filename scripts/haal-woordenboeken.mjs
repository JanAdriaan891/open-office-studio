#!/usr/bin/env node
/**
 * Hunspell-woordenboeken voor de spellingcontrole (assets/woordenboeken.json,
 * #21) zonder de bestanden zelf in Git. Werkt zoals haal-lettertypen.mjs:
 * elk bestand komt van een vaste commit en wordt met sha256 gecontroleerd.
 * Downloads gaan naar .local/woordenboeken-cache/ (genegeerd door Git; in CI
 * bewaard met actions/cache), van daaruit naar public/woordenboeken/.
 * Licentieteksten gaan naar public/licenses/woordenboeken/.
 *
 * Gebruik:
 *   node scripts/haal-woordenboeken.mjs            downloaden wat ontbreekt en kopiëren
 *   node scripts/haal-woordenboeken.mjs --offline  alleen de cache gebruiken
 * Omgeving: OOS_WOORDENBOEKEN_OFFLINE=1 verbiedt netwerk (zoals --offline).
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST = "assets/woordenboeken.json";
export const CACHE = ".local/woordenboeken-cache";
export const DOEL = "public/woordenboeken";
export const LICENTIES = "public/licenses/woordenboeken";
/** Alleen deze (SPDX-)licenties zijn toegestaan. */
export const TOEGESTAAN = new Set(["BSD-3-Clause OR CC-BY-3.0", "MIT AND BSD"]);
const TOEGESTANE_HOSTS = new Set(["raw.githubusercontent.com", "github.com"]);

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const geldigeHash = (h) => /^[0-9a-f]{64}$/.test(h ?? "");

export async function leesManifest(pad = MANIFEST) {
  const manifest = JSON.parse(await readFile(pad, "utf8"));
  for (const w of manifest.woordenboeken) {
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(w.id)) throw new Error(`Ongeldige woordenboek-id: ${w.id}`);
    if (!TOEGESTAAN.has(w.licentie))
      throw new Error(`${w.id}: licentie ${w.licentie} is niet toegestaan.`);
    for (const deel of ["licentiebestand", "aff", "dic"])
      if (!w[deel]?.url || !geldigeHash(w[deel].sha256))
        throw new Error(`${w.id}: ${deel} heeft geen bron of geldige hash.`);
  }
  return manifest;
}

async function download(url) {
  if (!TOEGESTANE_HOSTS.has(new URL(url).hostname)) throw new Error(`Bron buiten GitHub geweigerd: ${url}`);
  let laatste;
  for (let poging = 0; poging < 3; poging++) {
    try {
      const antwoord = await fetch(url, { redirect: "follow" });
      if (antwoord.ok) return new Uint8Array(await antwoord.arrayBuffer());
      laatste = new Error(`HTTP ${antwoord.status} voor ${url}`);
      if (antwoord.status === 404) break;
    } catch (e) {
      laatste = e;
    }
  }
  throw laatste;
}

async function uitCache(pad, hash) {
  try {
    const data = await readFile(pad);
    return sha256(data) === hash ? data : null;
  } catch {
    return null;
  }
}

/** Cachebestand per hash: twee woordenboeken met hetzelfde .aff delen het. */
const cachePad = (hash) => join(CACHE, hash);

/**
 * Vult de cache (zo nodig met netwerk) en kopieert naar public/.
 * Geeft { ontbrekend, gedownload, bytes }; gooit bij een hash-fout.
 */
export async function haalWoordenboeken({ netwerk = true, kopieer = true, log = console.log } = {}) {
  const manifest = await leesManifest();
  await mkdir(CACHE, { recursive: true });
  const ontbrekend = [];
  let gedownload = 0;
  let bytes = 0;
  for (const w of manifest.woordenboeken)
    for (const deel of ["licentiebestand", "aff", "dic"]) {
      const { url, sha256: hash } = w[deel];
      let data = await uitCache(cachePad(hash), hash);
      if (!data && netwerk) {
        data = await download(url);
        if (sha256(data) !== hash) throw new Error(`Hash klopt niet: ${w.id} ${deel} (${url})`);
        await writeFile(cachePad(hash), data);
        gedownload++;
      }
      if (!data) ontbrekend.push(`${w.id}: ${deel}`);
      else if (deel !== "licentiebestand") bytes += data.length;
    }

  if (kopieer && !ontbrekend.length) {
    await mkdir(DOEL, { recursive: true });
    await mkdir(LICENTIES, { recursive: true });
    const bronnen = [];
    const index = [];
    for (const w of manifest.woordenboeken) {
      await copyFile(cachePad(w.aff.sha256), join(DOEL, `${w.id}.aff`));
      await copyFile(cachePad(w.dic.sha256), join(DOEL, `${w.id}.dic`));
      await copyFile(cachePad(w.licentiebestand.sha256), join(LICENTIES, `${w.id}-LICENSE.txt`));
      bronnen.push(`${w.naam} (${w.id})\n  ${w.versie}\n  Licentie: ${w.licentie}\n  Bron: ${w.bron}`);
      index.push({ id: w.id, naam: w.naam, taalcodes: w.taalcodes, aff: w.aff.sha256.slice(0, 12), dic: w.dic.sha256.slice(0, 12) });
    }
    await writeFile(join(LICENTIES, "BRONNEN.txt"), `Woordenboeken voor de spellingcontrole\n\n${bronnen.join("\n\n")}\n`);
    // De app leest deze index; de hashdelen dienen als cachebuster.
    await writeFile(join(DOEL, "index.json"), JSON.stringify(index, null, 2));
  }
  log(
    ontbrekend.length
      ? `Woordenboeken: ${ontbrekend.length} bestand(en) ontbreken in ${CACHE}.`
      : `Woordenboeken: ${manifest.woordenboeken.length} talen (${(bytes / 1e6).toFixed(1)} MB)${gedownload ? `, ${gedownload} gedownload` : " uit de cache"}.`,
  );
  return { ontbrekend, gedownload, bytes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const offline = process.argv.includes("--offline") || process.env.OOS_WOORDENBOEKEN_OFFLINE === "1";
  const { ontbrekend } = await haalWoordenboeken({ netwerk: !offline });
  if (ontbrekend.length) {
    console.error(`Ontbrekend: ${ontbrekend.join(", ")}`);
    process.exit(1);
  }
}
