#!/usr/bin/env node
/**
 * Live proef van het Y-app-opslagcontract (y_next/api/office.py,
 * commit 340c8f84b567d517b4d832a8501ce3d17255a6ce) tegen een TESTSITE.
 *
 * Alle gegevens komen uitsluitend uit omgevingsvariabelen en worden nooit
 * gelogd. Het bewijsrapport bevat alleen stapnamen, statuscodes,
 * serverfoutcodes, duur in ms, SHA-256-hashes van inhoud en ja/nee-uitkomsten:
 * geen URL, sessie, bestands-ID, bestandsnaam of gebruiker.
 *
 *   YAPP_PROEF_URL          oorsprong van de testsite (https://…; http alleen voor localhost/.test)
 *   YAPP_PROEF_SID          waarde van het sid-cookie van een testgebruiker, of
 *   YAPP_PROEF_AUTORISATIE  volledige Authorization-header (bijv. "token sleutel:geheim")
 *   YAPP_PROEF_CSRF         CSRF-token bij gebruik van YAPP_PROEF_SID
 *   YAPP_PROEF_BESTAND      File-ID van een niet-gevoelig DOCX-testbestand met schrijfrecht
 *   YAPP_PROEF_GEWIJZIGD    (optioneel) lokaal pad naar de in de editor gewijzigde DOCX
 *   YAPP_PROEF_ALLEEN_LEZEN (optioneel) File-ID van een DOCX met alleen leesrecht
 *   YAPP_PROEF_RAPPORT      (optioneel) pad voor het JSON-rapport; anders stdout
 *   YAPP_PROEF_BEVESTIG     moet "ja-testsite" zijn; de proef maakt echte kopieën
 *
 * `node scripts/yapp-opslagproef.mjs --zelftest` draait dezelfde stappen tegen
 * een ingebouwde nep-server zonder netwerk.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const CONTRACT = "340c8f84b567d517b4d832a8501ce3d17255a6ce";
const API = "/api/method/y_next.api.office.";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function leesJson(antwoord) {
  try {
    return await antwoord.json();
  } catch {
    return undefined;
  }
}

function foutcode(json) {
  if (!json || typeof json !== "object") return undefined;
  if (typeof json.office_error === "string") return json.office_error;
  const tekst = [json.exception, json.exc_type].filter(Boolean).join(" ");
  return /office_[a-z_]+/.exec(tekst)?.[0] ?? json.exc_type ?? undefined;
}

/** Voert de proef uit met een transport dat de sessie al toevoegt. */
export async function voerProefUit({
  transport,
  csrf,
  bestand,
  gewijzigd,
  alleenLezen,
}) {
  const stappen = [];
  const stap = async (naam, werk) => {
    const begin = performance.now();
    const regel = { stap: naam, geslaagd: false };
    try {
      Object.assign(regel, await werk());
    } catch (fout) {
      // Alleen het fouttype: een melding kan URL of gegevens bevatten.
      regel.fout = fout?.name ?? "Fout";
    }
    regel.ms = Math.round(performance.now() - begin);
    stappen.push(regel);
    return regel;
  };
  const get = (methode, params) =>
    transport(`${API}${methode}?${new URLSearchParams(params)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  const save = (bron, bytes, verwacht, operatieId) => {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: DOCX_MIME }), bron.file_name);
    form.append("source_file", bron.name);
    form.append("expected_sha256", verwacht);
    form.append("operation_id", operatieId);
    const headers = { Accept: "application/json" };
    if (csrf) headers["X-Frappe-CSRF-Token"] = csrf;
    return transport(`${API}save_file`, {
      method: "POST",
      headers,
      body: form,
    });
  };
  const open = async (id) => {
    const meta = await get("open_file", { file_name: id });
    const m = (await leesJson(meta))?.message;
    const inhoud = await get("file_content", { file_name: id });
    const bytes = new Uint8Array(await inhoud.arrayBuffer());
    return { meta, m, inhoud, bytes };
  };

  let bron;
  let origineel;
  const o = await stap("openen", async () => {
    const r = await open(bestand);
    bron = r.m;
    origineel = r.bytes;
    return {
      http: [r.meta.status, r.inhoud.status],
      metadataSha256: r.m?.sha256,
      inhoudSha256: sha(r.bytes),
      kanOpslaan: r.m?.can_save,
      docx: /\.docx$/i.test(r.m?.file_name ?? ""),
      geslaagd: r.meta.ok && r.inhoud.ok && r.m?.sha256 === sha(r.bytes),
    };
  });
  if (!o.geslaagd) return rapport(stappen);

  const nieuw = gewijzigd ?? origineel;
  const operatieA = randomUUID();
  let kopie;
  await stap("kopie-opslaan", async () => {
    const r = await save(bron, nieuw, bron.sha256, operatieA);
    const json = await leesJson(r);
    kopie = json?.message;
    return {
      http: r.status,
      serverCode: foutcode(json),
      invoerSha256: sha(nieuw),
      kopieSha256: kopie?.sha256,
      gewijzigdeInhoud: Boolean(gewijzigd),
      operatieKlopt: kopie?.operation_id === operatieA,
      bronKlopt: kopie?.source_file === bron.name,
      nieuweKopie: Boolean(kopie?.name) && kopie?.name !== bron.name,
      private: String(kopie?.file_url ?? "").startsWith("/private/files/"),
      zelfdeOuder:
        kopie?.attached_to_doctype === bron.attached_to_doctype &&
        kopie?.attached_to_name === bron.attached_to_name,
      geslaagd:
        r.ok &&
        kopie?.sha256 === sha(nieuw) &&
        kopie?.operation_id === operatieA,
    };
  });
  if (!kopie?.name) return rapport(stappen);

  await stap("zelfde-operatie-herhaald", async () => {
    const r = await save(bron, nieuw, bron.sha256, operatieA);
    const m = (await leesJson(r))?.message;
    return {
      http: r.status,
      geslaagd: r.ok && m?.name === kopie.name,
      zelfdeKopie: m?.name === kopie.name,
    };
  });
  await stap("status-bekende-operatie", async () => {
    const r = await get("save_status", { operation_id: operatieA });
    const m = (await leesJson(r))?.message;
    return {
      http: r.status,
      gevonden: m?.found,
      geslaagd:
        r.ok &&
        m?.found === true &&
        m?.file?.name === kopie.name &&
        m?.file?.sha256 === sha(nieuw),
    };
  });
  await stap("status-onbekende-operatie", async () => {
    const r = await get("save_status", { operation_id: randomUUID() });
    const m = (await leesJson(r))?.message;
    return {
      http: r.status,
      gevonden: m?.found,
      geslaagd: r.ok && m?.found === false,
    };
  });
  await stap("bronhashconflict", async () => {
    const operatieB = randomUUID();
    const r = await save(bron, nieuw, "0".repeat(64), operatieB);
    const code = foutcode(await leesJson(r));
    const s = await get("save_status", { operation_id: operatieB });
    const gevonden = (await leesJson(s))?.message?.found;
    return {
      http: r.status,
      serverCode: code,
      statusNaConflict: gevonden,
      geslaagd:
        r.status === 409 &&
        code === "office_source_changed" &&
        gevonden === false,
    };
  });
  await stap("kopie-heropenen", async () => {
    const r = await open(kopie.name);
    return {
      http: [r.meta.status, r.inhoud.status],
      inhoudSha256: sha(r.bytes),
      geslaagd:
        r.meta.ok &&
        r.inhoud.ok &&
        sha(r.bytes) === sha(nieuw) &&
        r.m?.sha256 === sha(nieuw),
    };
  });
  await stap("bron-onveranderd", async () => {
    const r = await open(bestand);
    return {
      http: [r.meta.status, r.inhoud.status],
      inhoudSha256: sha(r.bytes),
      geslaagd: r.inhoud.ok && sha(r.bytes) === sha(origineel),
    };
  });
  if (alleenLezen)
    await stap("alleen-leesrecht", async () => {
      const r = await open(alleenLezen);
      const s = await save(
        r.m,
        r.bytes,
        r.m?.sha256 ?? "0".repeat(64),
        randomUUID(),
      );
      const code = foutcode(await leesJson(s));
      return {
        http: [r.meta.status, s.status],
        kanOpslaan: r.m?.can_save,
        serverCode: code,
        geslaagd: r.m?.can_save === false && s.status === 403,
      };
    });
  return rapport(stappen);
}

function rapport(stappen) {
  return {
    soort: "Y-app-opslagproef",
    contractcommit: CONTRACT,
    tijdstip: new Date().toISOString(),
    node: process.version,
    geslaagd: stappen.length > 1 && stappen.every((s) => s.geslaagd),
    stappen,
  };
}

/* ---------------------------- live transport --------------------------- */

class ConfigFout extends Error {
  name = "ConfigFout";
}

function liveTransport(env) {
  const url = new URL(env.YAPP_PROEF_URL);
  const lokaal = /^(localhost|127\.0\.0\.1|\[::1\])$|\.(localhost|test)$/.test(
    url.hostname,
  );
  if (url.protocol !== "https:" && !(lokaal && url.protocol === "http:"))
    throw new ConfigFout("Gebruik https voor de testsite.");
  const sessie = {};
  if (env.YAPP_PROEF_AUTORISATIE)
    sessie.Authorization = env.YAPP_PROEF_AUTORISATIE;
  else if (env.YAPP_PROEF_SID) sessie.Cookie = `sid=${env.YAPP_PROEF_SID}`;
  else throw new ConfigFout("Geef YAPP_PROEF_SID of YAPP_PROEF_AUTORISATIE.");
  return async (pad, init) => {
    const doel = new URL(pad, url.origin);
    if (doel.origin !== url.origin)
      throw new Error("Andere oorsprong geweigerd.");
    // Geen redirects volgen: de sessie mag nooit naar een andere host.
    const antwoord = await fetch(doel, {
      ...init,
      headers: { ...init.headers, ...sessie },
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    if (antwoord.status >= 300 && antwoord.status < 400)
      throw new Error("Doorverwijzing geweigerd.");
    return antwoord;
  };
}

/* ------------------------------- zelftest ------------------------------ */

function nepTransport() {
  const bestanden = new Map();
  const bonnen = new Map();
  const zet = (name, file_name, bytes, kanOpslaan = true) =>
    bestanden.set(name, {
      name,
      file_name,
      bytes,
      kanOpslaan,
      ouder: ["Project", "P-1"],
    });
  zet("bron", "test.docx", new TextEncoder().encode("PK\u0003\u0004bron"));
  zet(
    "lezen",
    "lezen.docx",
    new TextEncoder().encode("PK\u0003\u0004lezen"),
    false,
  );
  const json = (status, body) => new Response(JSON.stringify(body), { status });
  const meta = (b) => ({
    name: b.name,
    file_name: b.file_name,
    file_url: `/private/files/${b.file_name}`,
    sha256: sha(b.bytes),
    attached_to_doctype: b.ouder[0],
    attached_to_name: b.ouder[1],
    can_save: b.kanOpslaan,
    max_size: 20 * 1024 * 1024,
  });
  const resultaat = (op, bon) => ({
    ...meta(bestanden.get(bon.result)),
    operation_id: op,
    source_file: bon.source,
  });
  let n = 0;
  return async (pad, init) => {
    const [, methode, query] = /office\.(\w+)\??(.*)$/.exec(pad);
    const p = new URLSearchParams(query);
    if (methode === "open_file")
      return json(200, { message: meta(bestanden.get(p.get("file_name"))) });
    if (methode === "file_content")
      return new Response(bestanden.get(p.get("file_name")).bytes);
    if (methode === "save_status") {
      const op = p.get("operation_id");
      const bon = bonnen.get(op);
      return json(200, {
        message: bon
          ? { found: true, operation_id: op, file: resultaat(op, bon) }
          : { found: false, operation_id: op },
      });
    }
    const f = init.body;
    const op = f.get("operation_id");
    const bron = bestanden.get(f.get("source_file"));
    if (!bron.kanOpslaan) return json(403, { exc_type: "PermissionError" });
    const bytes = new Uint8Array(await f.get("file").arrayBuffer());
    if (bonnen.has(op))
      return json(200, { message: resultaat(op, bonnen.get(op)) });
    if (sha(bron.bytes) !== f.get("expected_sha256"))
      return json(409, { office_error: "office_source_changed" });
    const naam = `kopie${++n}`;
    zet(naam, bron.file_name, bytes);
    bonnen.set(op, { source: bron.name, result: naam });
    return json(200, { message: resultaat(op, bonnen.get(op)) });
  };
}

/* --------------------------------- start -------------------------------- */

async function hoofd() {
  const env = process.env;
  let uitkomst;
  if (process.argv.includes("--zelftest")) {
    uitkomst = await voerProefUit({
      transport: nepTransport(),
      bestand: "bron",
      gewijzigd: new TextEncoder().encode("PK\u0003\u0004gewijzigd"),
      alleenLezen: "lezen",
    });
    uitkomst.zelftest = true;
  } else {
    if (env.YAPP_PROEF_BEVESTIG !== "ja-testsite") {
      console.error(
        "Niet uitgevoerd: zet YAPP_PROEF_BEVESTIG=ja-testsite (alleen tegen een testsite) of gebruik --zelftest.",
      );
      process.exitCode = 2;
      return;
    }
    if (!env.YAPP_PROEF_URL || !env.YAPP_PROEF_BESTAND) {
      console.error("YAPP_PROEF_URL en YAPP_PROEF_BESTAND zijn verplicht.");
      process.exitCode = 2;
      return;
    }
    uitkomst = await voerProefUit({
      transport: liveTransport(env),
      csrf: env.YAPP_PROEF_CSRF,
      bestand: env.YAPP_PROEF_BESTAND,
      gewijzigd: env.YAPP_PROEF_GEWIJZIGD
        ? new Uint8Array(await readFile(env.YAPP_PROEF_GEWIJZIGD))
        : undefined,
      alleenLezen: env.YAPP_PROEF_ALLEEN_LEZEN,
    });
  }
  const tekst = `${JSON.stringify(uitkomst, null, 2)}\n`;
  if (env.YAPP_PROEF_RAPPORT) await writeFile(env.YAPP_PROEF_RAPPORT, tekst);
  else process.stdout.write(tekst);
  if (!uitkomst.geslaagd) process.exitCode = 1;
}

hoofd().catch((fout) => {
  // Nooit de melding tonen: die kan URL of sessiegegevens bevatten.
  // Behalve eigen configuratiemeldingen, die geen gegevens bevatten.
  console.error(
    fout instanceof ConfigFout
      ? fout.message
      : `Proef afgebroken (${fout?.name ?? "Fout"}).`,
  );
  process.exitCode = 1;
});
