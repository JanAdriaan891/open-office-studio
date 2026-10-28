// Praktijkcorpus: no-op- en bewerkingsroundtrip per aangeleverd bestand (D1–D3, R1–R3, P1–P3).
// Zie docs/onderzoek/praktijkcorpus.md. Bestanden en resultaten blijven onder .local/ (genegeerd door Git).
//
//   node scripts/praktijkcorpus.mjs            # draait wat er in .local/corpus/praktijk/ staat
//   node scripts/praktijkcorpus.mjs --proef    # proefrun met docs/voorbeelden (geen praktijkbestanden)
//
// Het rapport bevat hashes, onderdeelnamen en tellingen, nooit documenttekst.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { unzipSync, strFromU8 } from "fflate";

export const CORPUSMAP = ".local/corpus/praktijk";
export const MATRIX = [
  { id: "D1", ext: "docx", kenmerken: "Koppen, briefpapier, kop-/voettekst, paginanummers", bewerking: "Eén zin wijzigen" },
  { id: "D2", ext: "docx", kenmerken: "Tabellen, afbeeldingen, secties en liggende pagina", bewerking: "Eén tabelcel wijzigen" },
  { id: "D3", ext: "docx", kenmerken: "Opmerkingen, revisies, voetnoten, onbekend XML-onderdeel", bewerking: "Eén los tekstfragment wijzigen" },
  { id: "R1", ext: "xlsx", kenmerken: "Meerdere bladen, kruisverwijzingen, formules, getalopmaak", bewerking: "Eén invoercel wijzigen" },
  { id: "R2", ext: "xlsx", kenmerken: "Grafiek, benoemd bereik, verborgen blad, afdrukinstellingen", bewerking: "Eén label wijzigen" },
  { id: "R3", ext: "xlsx", kenmerken: "Validatie, conditionele opmaak, draaitabel, onbekend onderdeel", bewerking: "Eén cel buiten de draaitabel wijzigen" },
  { id: "P1", ext: "pptx", kenmerken: "Diamodel, thema, lettertypen, afbeeldingen", bewerking: "Eén titel wijzigen" },
  { id: "P2", ext: "pptx", kenmerken: "Grafiek, tabel en sprekersnotities", bewerking: "Eén tekstvak wijzigen" },
  { id: "P3", ext: "pptx", kenmerken: "Animatie, overgang en ingebed object", bewerking: "Eén los tekstvak wijzigen" },
];
export const MARKERING = "OpenAEC-proef";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const kortHash = (tekst) => sha256(Buffer.from(tekst, "utf8")).slice(0, 12);

// ---------------------------------------------------------------------------
// Onafhankelijke inhoudsextractie: alleen fflate en reguliere expressies, geen engine-code.
// Het resultaat is een vlakke map "eenheid" -> tekst/waarde; rapporten tonen alleen sleutels en hashes.
// ---------------------------------------------------------------------------
const ontsnap = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
const attr = (tag, naam) => {
  const m = tag.match(new RegExp(`\\s${naam}="([^"]*)"`));
  return m ? ontsnap(m[1]) : null;
};
function rels(onderdelen, pad) {
  const map = pad.replace(/[^/]*$/, "");
  const relpad = `${map}_rels/${pad.slice(map.length)}.rels`;
  const uit = {};
  if (!onderdelen[relpad]) return uit;
  for (const tag of strFromU8(onderdelen[relpad]).match(/<Relationship\b[^>]*>/g) ?? []) {
    const doel = attr(tag, "Target");
    if (attr(tag, "TargetMode") === "External") continue;
    const absoluut = doel.startsWith("/")
      ? doel.slice(1)
      : normaliseer(map + doel);
    uit[attr(tag, "Id")] = absoluut;
  }
  return uit;
}
function normaliseer(pad) {
  const delen = [];
  for (const d of pad.split("/")) {
    if (d === "..") delen.pop();
    else if (d && d !== ".") delen.push(d);
  }
  return delen.join("/");
}
// Tekst per alinea (w:p of a:p); runs worden samengevoegd.
function alineas(xml, ns) {
  const uit = [];
  const re = new RegExp(`<${ns}:p\\b[^>]*?(?:/>|>([\\s\\S]*?)</${ns}:p>)`, "g");
  for (const m of xml.matchAll(re)) {
    const binnen = m[1] ?? "";
    let tekst = "";
    for (const t of binnen.matchAll(new RegExp(`<${ns}:(t|tab|br)\\b[^>]*?(?:/>|>([\\s\\S]*?)</${ns}:t>)`, "g")))
      tekst += t[1] === "t" ? ontsnap(t[2] ?? "") : t[1] === "tab" ? "\t" : "\n";
    uit.push(tekst);
  }
  return uit;
}
export function inhoud(bytes, ext) {
  const onderdelen = unzipSync(bytes);
  const uit = {};
  const lees = (p) => (onderdelen[p] ? strFromU8(onderdelen[p]) : null);
  if (ext === "docx") {
    const delen = Object.keys(onderdelen)
      .filter((p) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/.test(p))
      .sort();
    for (const p of delen)
      alineas(lees(p), "w").forEach((t, i) => (uit[`${p}#p${i}`] = t));
  } else if (ext === "pptx") {
    const pres = lees("ppt/presentation.xml");
    const r = rels(onderdelen, "ppt/presentation.xml");
    const ids = [...(pres.match(/<p:sldId\b[^>]*>/g) ?? [])].map((t) => attr(t, "r:id"));
    ids.forEach((rid, n) => {
      const dia = r[rid];
      alineas(lees(dia) ?? "", "a").forEach((t, i) => (uit[`dia${n + 1}#p${i}`] = t));
      const notities = Object.values(rels(onderdelen, dia)).find((d) => /notesSlide/.test(d));
      if (notities)
        alineas(lees(notities) ?? "", "a").forEach((t, i) => (uit[`dia${n + 1}/notities#p${i}`] = t));
    });
    uit["#dias"] = String(ids.length);
  } else if (ext === "xlsx") {
    const gedeeld = [];
    const ss = lees("xl/sharedStrings.xml");
    if (ss)
      for (const si of ss.match(/<si\b[\s\S]*?<\/si>/g) ?? [])
        gedeeld.push([...si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => ontsnap(m[1])).join(""));
    const wb = lees("xl/workbook.xml");
    const r = rels(onderdelen, "xl/workbook.xml");
    const bladen = [...(wb.match(/<sheet\b[^>]*>/g) ?? [])];
    bladen.forEach((tag, n) => {
      const xml = lees(r[attr(tag, "r:id")]) ?? "";
      for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const kop = `<c${c[1]}>`;
        const binnen = c[2] ?? "";
        const ref = attr(kop, "r");
        const type = attr(kop, "t");
        const f = binnen.match(/<f\b[^>]*?(?:\/>|>([\s\S]*?)<\/f>)/);
        let v = binnen.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (type === "s" && v != null) v = gedeeld[Number(v)];
        else if (type === "inlineStr") v = [...binnen.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => ontsnap(m[1])).join("");
        else if (v != null) v = ontsnap(v);
        if (v != null && type !== "s" && type !== "str" && type !== "inlineStr" && v !== "" && !Number.isNaN(Number(v)))
          v = String(Number(v));
        if (f) uit[`blad${n + 1}!${ref}#f`] = ontsnap(f[1] ?? "(gedeeld)");
        if (v != null && v !== "") uit[`blad${n + 1}!${ref}${f ? "#v" : ""}`] = v;
      }
    });
    uit["#bladen"] = String(bladen.length);
  } else if (["odt", "ods", "odp"].includes(ext)) {
    const xml = lees("content.xml") ?? "";
    let i = 0;
    for (const m of xml.matchAll(/<text:(p|h)\b[^>]*?(?:\/>|>([\s\S]*?)<\/text:\1>)/g)) {
      const tekst = ontsnap(
        (m[2] ?? "")
          .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n) => " ".repeat(Number(n ?? 1)))
          .replace(/<text:tab\s*\/>/g, "\t")
          .replace(/<text:line-break\s*\/>/g, "\n")
          .replace(/<[^>]+>/g, ""),
      );
      uit[`content.xml#p${i++}`] = tekst;
    }
    let f = 0;
    for (const m of xml.matchAll(/table:formula="([^"]*)"/g)) uit[`content.xml#f${f++}`] = ontsnap(m[1]);
    // Celwaarden (getallen, datums) staan in ODS als attribuut; de zichtbare tekst is opgemaakt.
    let w = 0;
    for (const m of xml.matchAll(/office:value="([^"]*)"/g)) uit[`content.xml#v${w++}`] = String(Number(m[1]));
    if (ext === "odp") uit["#dias"] = String((xml.match(/<draw:page[\s>]/g) ?? []).length);
  } else throw new Error(`Geen inhoudsextractie voor .${ext}`);
  return uit;
}
// Vergelijk twee extracties. Formulewaarden (#v) mogen na herberekening wijzigen en worden apart geteld.
export function vergelijkInhoud(voor, na) {
  const gewijzigd = [], verdwenen = [], nieuw = [], herberekend = [];
  for (const k of Object.keys(voor)) {
    if (!(k in na)) verdwenen.push(k);
    else if (voor[k] !== na[k]) (k.endsWith("#v") ? herberekend : gewijzigd).push(k);
  }
  // Een nieuw opgeslagen formuleresultaat bij een bestaande formule is herberekening, geen nieuwe inhoud.
  for (const k of Object.keys(na))
    if (!(k in voor)) (k.endsWith("#v") && `${k.slice(0, -2)}#f` in voor ? herberekend : nieuw).push(k);
  return { eenheden: Object.keys(voor).length, gewijzigd, verdwenen, nieuw, herberekend };
}
// Multiset-vergelijking van tekstwaarden, los van positie (voor formaatwissels zoals DOCX -> ODT).
export function tekstbehoud(voor, na) {
  const tel = (o) => {
    const m = new Map();
    for (const [k, v] of Object.entries(o))
      if (!k.startsWith("#") && !k.endsWith("#f") && v.trim()) m.set(v.trim(), (m.get(v.trim()) ?? 0) + 1);
    return m;
  };
  const a = tel(voor), b = tel(na);
  let totaal = 0, ontbrekend = 0;
  const ontbrekendeHashes = [];
  for (const [t, n] of a) {
    totaal += n;
    const tekort = Math.max(0, n - (b.get(t) ?? 0));
    ontbrekend += tekort;
    if (tekort) ontbrekendeHashes.push(kortHash(t));
  }
  return { teksten: totaal, ontbrekend, ontbrekendeHashes };
}

// ---------------------------------------------------------------------------
// Kindproces: engine-roundtrip voor één bestand (geïsoleerd, met tijdslimiet in de ouder).
// ---------------------------------------------------------------------------
async function kind(pad, ext, uitmap, id) {
  const bytes = new Uint8Array(await readFile(pad));
  const res = { fasen: {} };
  const meet = async (naam, f) => {
    const t = performance.now();
    const r = await f();
    res.fasen[naam] = Math.round(performance.now() - t);
    return r;
  };
  let noop, bewerkt, verwacht = [], doel;
  if (ext === "docx") {
    const { parseDocx, repackDocx } = await import("@betteroffice/docx/docx");
    const doc = await meet("openen", () => parseDocx(bytes, { preloadFonts: false }));
    noop = await meet("noop-bewaren", async () => new Uint8Array(await repackDocx(doc)));
    // Eerste niet-lege tekstknoop in de hoofdtekst: markering aan het eind toevoegen.
    const doc2 = await parseDocx(bytes, { preloadFonts: false });
    let gevonden = null;
    const zoek = (n) => {
      if (gevonden || !n || typeof n !== "object") return;
      if (n.type === "text" && typeof n.text === "string" && n.text.trim()) return (gevonden = n);
      for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(zoek); else if (v && typeof v === "object") zoek(v);
    };
    doc2.package.document.content.forEach(zoek);
    if (!gevonden) throw new Error("Geen tekstknoop gevonden voor de bewerking.");
    const oud = gevonden.text;
    gevonden.text = `${oud} ${MARKERING}`;
    // Sommige modellen houden sectie-inhoud apart bij; wijzig daar dezelfde knoop als die niet gedeeld is.
    for (const s of doc2.package.document.sections ?? []) {
      let g2 = null;
      const zoek2 = (n) => {
        if (g2 || !n || typeof n !== "object") return;
        if (n.type === "text" && n.text === oud) return (g2 = n);
        for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(zoek2); else if (v && typeof v === "object") zoek2(v);
      };
      (s.content ?? []).forEach(zoek2);
      if (g2 && g2 !== gevonden) g2.text = gevonden.text;
    }
    bewerkt = await meet("bewerken-bewaren", async () => new Uint8Array(await repackDocx(doc2)));
    await meet("heropenen", () => parseDocx(bewerkt, { preloadFonts: false }));
    verwacht = ["word/document.xml"];
    doel = "eerste niet-lege tekstknoop in word/document.xml";
  } else {
    const engine = await import(`@betteroffice/${ext}`);
    await meet("wasm-init", async () =>
      engine.initWasm(await readFile(`node_modules/@betteroffice/${ext}/dist/generated/${ext}_wasm_bg.wasm`)),
    );
    const open = ext === "xlsx" ? engine.openWorkbook : engine.openPresentation;
    const d1 = await meet("openen", () => open(bytes));
    noop = await meet("noop-bewaren", () => d1.save());
    d1.dispose?.();
    const d2 = open(bytes);
    if (ext === "xlsx") {
      // Eerste constante getalcel (zonder formule) op blad 1 met 1 verhogen; anders eerste tekstcel.
      const x = inhoud(bytes, "xlsx");
      const kandidaten = Object.keys(x).filter((k) => /^blad1![A-Z]+\d+$/.test(k) && !(`${k}#f` in x));
      const getal = kandidaten.find((k) => x[k] !== "" && !Number.isNaN(Number(x[k])));
      const sleutel = getal ?? kandidaten[0];
      if (!sleutel) throw new Error("Geen invoercel op blad 1 gevonden.");
      const ref = sleutel.split("!")[1];
      const kolom = [...ref.match(/^[A-Z]+/)[0]].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
      const rij = Number(ref.match(/\d+$/)[0]) - 1;
      d2.editCell(0, rij, kolom, getal ? String(Number(x[sleutel]) + 1) : `${x[sleutel]} ${MARKERING}`);
      res.bewerkteEenheid = sleutel;
      res.nieuweWaarde = getal ? String(Number(x[sleutel]) + 1) : null;
      verwacht = ["xl/worksheets/sheet1.xml", "xl/sharedStrings.xml", "xl/calcChain.xml"];
      doel = getal ? "eerste constante getalcel op blad 1 (+1)" : "eerste tekstcel op blad 1 (+markering)";
    } else {
      const snap = d2.snapshot();
      const verhaal = snap.slides.flatMap((s) => s.shapes.flatMap((v) => v.textStories ?? []))[0];
      if (!verhaal) throw new Error("Geen tekstvak gevonden.");
      d2.insertText(verhaal.id, 0, `${MARKERING}: `);
      verwacht = snap.slides.map((_, i) => `ppt/slides/slide${i + 1}.xml`);
      doel = "eerste tekstvak met tekst (markering vooraan)";
    }
    bewerkt = await meet("bewerken-bewaren", () => d2.save());
    await meet("heropenen", () => open(bewerkt).dispose?.());
    d2.dispose?.();
  }
  await writeFile(join(uitmap, `${id}-noop.${ext}`), noop);
  await writeFile(join(uitmap, `${id}-bewerkt.${ext}`), bewerkt);
  res.verwacht = verwacht;
  res.doel = doel;
  // VmHWM (Linux) i.p.v. ru_maxrss, dat na execve de piek van het ouderproces kan bevatten.
  const hwm = existsSync("/proc/self/status") ? readFileSync("/proc/self/status", "utf8").match(/VmHWM:\s+(\d+)/) : null;
  res.maxRssMiB = Math.round((hwm ? Number(hwm[1]) : process.resourceUsage().maxRSS) / 1024);
  process.stdout.write("\nPRAKTIJK_RESULTAAT=" + JSON.stringify(res));
}

function draaiKind(pad, ext, uitmap, id, limiet = 120000) {
  return new Promise((klaar) => {
    const p = spawn(process.execPath, ["--max-old-space-size=2048", "scripts/praktijkcorpus.mjs", "--kind", pad, ext, uitmap, id], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let uit = "", fout = "";
    p.stdout.on("data", (b) => (uit += b));
    p.stderr.on("data", (b) => fout.length < 4000 && (fout += b));
    const timer = setTimeout(() => p.kill("SIGKILL"), limiet);
    p.on("close", (code, signaal) => {
      clearTimeout(timer);
      const i = uit.lastIndexOf("PRAKTIJK_RESULTAAT=");
      if (i >= 0) return klaar({ status: "ok", ...JSON.parse(uit.slice(i + 19)) });
      // Geen documenttekst: alleen de eerste regel van de foutmelding.
      klaar({ status: signaal ? "tijdslimiet" : "enginefout", code, fout: fout.split("\n").find((r) => /Error/.test(r))?.slice(0, 300) ?? fout.slice(0, 300) });
    });
  });
}
function pakketcontrole(bron, resultaat, verwacht = []) {
  const args = ["scripts/vergelijk_pakketten.py", bron, resultaat, ...verwacht.flatMap((v) => ["--verwacht-gewijzigd", v])];
  const r = spawnSync("python3", args, { encoding: "utf8" });
  let rapport = null;
  try { rapport = JSON.parse(r.stdout); } catch {}
  return { exitcode: r.status, rapport: rapport ?? { fout: r.stderr.slice(0, 300) } };
}
const versies = async () => {
  const v = {};
  for (const p of ["docx", "xlsx", "pptx"])
    v[p] = JSON.parse(await readFile(`node_modules/@betteroffice/${p}/package.json`, "utf8")).version;
  return v;
};

async function hoofd() {
  const proef = process.argv.includes("--proef");
  const datum = new Date().toISOString().slice(0, 10);
  const basis = proef ? ".local/bundelmeting/praktijkproef" : CORPUSMAP;
  const uitmap = join(basis, "resultaten", datum);
  await mkdir(uitmap, { recursive: true });
  let register = {};
  if (existsSync(join(basis, "register.json")))
    for (const r of JSON.parse(await readFile(join(basis, "register.json"), "utf8")).bestanden ?? []) register[r.id] = r;
  if (proef) {
    // Pijplijnproef met eigen voorbeelden; dit zijn uitdrukkelijk geen praktijkbestanden.
    const kaart = { D1: "Ontwerpnotitie.docx", R1: "Materiaaloverzicht.xlsx", P1: "Ontwerpvisie.pptx" };
    for (const [id, naam] of Object.entries(kaart)) await copyFile(`docs/voorbeelden/${naam}`, join(basis, `${id}.${naam.split(".").pop()}`));
  }
  const rapport = {
    datum,
    soort: proef ? "pijplijnproef met docs/voorbeelden (geen praktijkcorpus)" : "praktijkcorpus",
    node: process.version,
    engines: await versies(),
    bestanden: [],
  };
  for (const item of MATRIX) {
    const pad = join(basis, `${item.id}.${item.ext}`);
    const reg = register[item.id] ?? null;
    if (!existsSync(pad)) {
      rapport.bestanden.push({ id: item.id, formaat: item.ext, status: "niet aangeleverd" });
      continue;
    }
    if (!proef && (!reg || reg.toestemming !== true || reg.geanonimiseerd !== true)) {
      rapport.bestanden.push({ id: item.id, formaat: item.ext, status: "geblokkeerd: registratie (toestemming/anonimisering) ontbreekt", bronSha256: sha256(await readFile(pad)) });
      continue;
    }
    const bron = new Uint8Array(await readFile(pad));
    const r = { id: item.id, formaat: item.ext, bronBytes: bron.length, bronSha256: sha256(bron), registratie: reg ? { bron: reg.bron, datum: reg.datum, kenmerkenAanwezig: reg.kenmerken } : null };
    const engine = await draaiKind(resolve(pad), item.ext, resolve(uitmap), item.id);
    Object.assign(r, { engine: { status: engine.status, fasenMs: engine.fasen, maxRssMiB: engine.maxRssMiB, fout: engine.fout, bewerking: engine.doel } });
    if (engine.status !== "ok") {
      r.status = engine.status;
      rapport.bestanden.push(r);
      continue;
    }
    const noopPad = join(uitmap, `${item.id}-noop.${item.ext}`);
    const bewPad = join(uitmap, `${item.id}-bewerkt.${item.ext}`);
    const noop = new Uint8Array(await readFile(noopPad));
    const bew = new Uint8Array(await readFile(bewPad));
    r.noopSha256 = sha256(noop);
    r.bewerktSha256 = sha256(bew);
    // Pakketcontrole (bestaand script) en onafhankelijke inhoudscontrole naast elkaar.
    r.noopPakket = pakketcontrole(pad, noopPad);
    r.bewerktPakket = pakketcontrole(pad, bewPad, engine.verwacht);
    const iBron = inhoud(bron, item.ext);
    const iNoop = vergelijkInhoud(iBron, inhoud(noop, item.ext));
    const iBewMap = inhoud(bew, item.ext);
    const iBew = vergelijkInhoud(iBron, iBewMap);
    const markeringen = Object.values(iBewMap).filter((t) => t.includes(MARKERING)).length;
    const samenvat = (v) => ({ eenheden: v.eenheden, gewijzigd: v.gewijzigd.length, verdwenen: v.verdwenen.length, nieuw: v.nieuw.length, herberekend: v.herberekend.length, sleutels: [...v.gewijzigd, ...v.verdwenen, ...v.nieuw].slice(0, 20) });
    r.noopInhoud = samenvat(iNoop);
    r.bewerktInhoud = { ...samenvat(iBew), markeringen, bewerkteEenheid: engine.bewerkteEenheid };
    const noopSchoon = iNoop.gewijzigd.length + iNoop.verdwenen.length + iNoop.nieuw.length === 0;
    const bewSchoon =
      iBew.verdwenen.length + iBew.nieuw.length === 0 &&
      iBew.gewijzigd.length === 1 &&
      (item.ext === "xlsx" ? iBew.gewijzigd[0] === engine.bewerkteEenheid : markeringen === 1);
    r.status = noopSchoon && bewSchoon ? "inhoud behouden; visuele controle nog nodig" : "afwijking: beoordelen";
    rapport.bestanden.push(r);
  }
  await writeFile(join(uitmap, "rapport.json"), JSON.stringify(rapport, null, 2));
  console.log(`${rapport.soort} — ${datum}`);
  console.log("| ID | Status | Pakket no-op | Pakket bewerkt | Inhoud no-op (gew./weg/nieuw) | Inhoud bewerkt (gew./weg/nieuw, markering) |");
  console.log("|---|---|---|---|---|---|");
  for (const b of rapport.bestanden) {
    if (!b.noopInhoud) {
      console.log(`| ${b.id} | ${b.status} | – | – | – | – |`);
      continue;
    }
    const p = (x) => `${x.exitcode} (${x.rapport.pakketcontrole ?? "fout"}; ${(x.rapport.gewijzigd ?? []).length} gew.)`;
    const n = b.noopInhoud, w = b.bewerktInhoud;
    console.log(`| ${b.id} | ${b.status} | ${p(b.noopPakket)} | ${p(b.bewerktPakket)} | ${n.gewijzigd}/${n.verdwenen}/${n.nieuw} van ${n.eenheden} | ${w.gewijzigd}/${w.verdwenen}/${w.nieuw}, ${b.formaat === "xlsx" ? "cel " + (w.bewerkteEenheid ?? "?") : w.markeringen + "×"} |`);
  }
  console.log(`\nRapport: ${join(uitmap, "rapport.json")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "--kind") await kind(...process.argv.slice(3, 7));
  else await hoofd();
}
