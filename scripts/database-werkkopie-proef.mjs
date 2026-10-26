import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import MDBReader from "mdb-reader";
import {
  laadWerkkopie,
  openWerkkopie,
} from "../packages/database/src/werkkopie/werkkopie.ts";

// Werkkopieproef: bouwt voor elk MDB/ACCDB-bestand uit het lokale corpus een SQLite-werkkopie,
// vergelijkt rijaantallen met mdb-reader, voert alle opgeslagen query’s uit en controleert met
// SHA-256 dat het origineel ongewijzigd blijft. De uitvoer bevat alleen bestandsnamen,
// querynamen, aantallen en foutcodes; geen databaseinhoud.
const manifestPad = process.env.CORPUS_MANIFEST ?? ".local/corpus/manifest.json";
const uitvoer = process.env.WERKKOPIE_RAPPORT ?? ".local/database-werkkopie-proef.json";
const manifest = JSON.parse(await readFile(manifestPad, "utf8"));
const bestanden = manifest.bestanden.filter(
  (b) => /^(mdb|accdb)$/.test(b.extensie) && b.status === "opgehaald",
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const SQL = await initSqlJs();

const BEPERKING = new Set(["niet-ondersteund", "beperking"]);
const categorieen = {};
const foutcodes = {};
const tel = (soort, uitkomst) => {
  categorieen[soort] ??= { geslaagd: 0, beperking: 0, fout: 0 };
  categorieen[soort][uitkomst]++;
};
// Actiequery’s wijzigen de werkkopie; eerst lezen, dan wijzigen, DDL als laatste.
const volgorde = ["select", "union", "crosstab", "append", "update", "delete", "maketable", "ddl", "passthrough"];

const resultaten = [];
for (const bestand of bestanden) {
  const bytes = new Uint8Array(await readFile(bestand.bestand));
  const voor = hash(bytes);
  assert.equal(voor, bestand.sha256, `${bestand.naam}: SHA-256 wijkt af van het manifest.`);
  const resultaat = { id: bestand.id, pad: bestand.pad, opgebouwd: false };
  resultaten.push(resultaat);
  let werkkopie = null;
  try {
    const reader = new MDBReader(Buffer.from(bytes));
    const begin = performance.now();
    werkkopie = await openWerkkopie(SQL, reader, bytes, bestand.naam);
    resultaat.opbouwMs = Math.round(performance.now() - begin);
    resultaat.opgebouwd = true;
    const rapport = werkkopie.opbouwrapport;
    resultaat.meldingen = {
      info: rapport.meldingen.filter((m) => m.ernst === "info").length,
      waarschuwing: rapport.meldingen.filter((m) => m.ernst === "waarschuwing").length,
      fout: rapport.meldingen.filter((m) => m.ernst === "fout").length,
    };
    resultaat.meldingOnderdelen = [...new Set(rapport.meldingen.filter((m) => m.ernst !== "info").map((m) => m.onderdeel))];
    assert.equal(werkkopie.bron.sha256, voor, "Bronhash in de werkkopie wijkt af.");

    // Rijaantallen: werkkopie tegenover de tabeldefinitie en de gelezen rijen van mdb-reader.
    const tabellen = await werkkopie.tabellen();
    resultaat.tabellen = tabellen.length;
    resultaat.rijenWerkkopie = 0;
    resultaat.rijenMdbReader = 0;
    resultaat.afwijkingen = [];
    resultaat.definitieAfwijkingen = [];
    for (const naam of reader.getTableNames()) {
      const tabel = reader.getTable(naam);
      const t = tabellen.find((x) => x.naam === naam);
      // Vergelijk met de rijen die mdb-reader werkelijk leest; de teller in de tabeldefinitie kan verouderd zijn.
      let gelezen = tabel.rowCount;
      try {
        gelezen = tabel.getData().length;
      } catch {
        // Onleesbare kolommen (bijv. samengestelde velden): val terug op de tabeldefinitie.
      }
      if (gelezen !== tabel.rowCount) resultaat.definitieAfwijkingen.push(`${naam}: tabeldefinitie ${tabel.rowCount}, mdb-reader gelezen ${gelezen}`);
      resultaat.rijenMdbReader += gelezen;
      resultaat.rijenWerkkopie += t?.aantal ?? 0;
      if (!t) resultaat.afwijkingen.push(`${naam}: ontbreekt in de werkkopie (zie opbouwrapport)`);
      // Gelijk aan de tabeldefinitie terwijl mdb-reader meer leest: verwijderde rijversies uitgefilterd.
      else if (t.aantal === tabel.rowCount && gelezen !== tabel.rowCount) resultaat.gecorrigeerd = (resultaat.gecorrigeerd ?? 0) + 1;
      else if (t.aantal !== gelezen) resultaat.afwijkingen.push(`${naam}: tabeldefinitie ${tabel.rowCount}, mdb-reader ${gelezen}, werkkopie ${t.aantal}`);
    }
    resultaat.indexen = rapport.indexen;
    resultaat.relaties = rapport.relaties;

    // Opgeslagen query’s uitvoeren; ontbrekende parameters worden met Null gevuld.
    const querys = (await werkkopie.querys()).sort(
      (a, b) => volgorde.indexOf(a.soort) - volgorde.indexOf(b.soort) || a.naam.localeCompare(b.naam),
    );
    resultaat.querys = { totaal: querys.length, geslaagd: 0, beperking: 0, fout: 0, details: [] };
    for (const q of querys) {
      let uitkomst = "geslaagd";
      let code = null;
      let melding = null;
      try {
        let parameters = {};
        try {
          parameters = Object.fromEntries((await werkkopie.parametersVan(q.naam)).map((p) => [p, null]));
        } catch {
          // De fout komt hieronder bij het uitvoeren terug.
        }
        await werkkopie.voerQueryUit(q.naam, parameters);
      } catch (fout) {
        code = fout?.code ?? "intern";
        uitkomst = BEPERKING.has(code) ? "beperking" : "fout";
        melding = String(fout?.message ?? fout).slice(0, 300);
      }
      tel(q.soort, uitkomst);
      resultaat.querys[uitkomst]++;
      if (code) foutcodes[code] = (foutcodes[code] ?? 0) + 1;
      if (uitkomst !== "geslaagd") resultaat.querys.details.push({ naam: q.naam, soort: q.soort, uitkomst, code, melding });
    }

    // Export en opnieuw laden.
    const export_ = await werkkopie.exporteer();
    const terug = laadWerkkopie(SQL, export_);
    assert.equal((await terug.tabellen()).length, (await werkkopie.tabellen()).length, "Geëxporteerde werkkopie mist tabellen.");
    await terug.sluit();
    resultaat.exportBytes = export_.byteLength;
  } catch (fout) {
    resultaat.fout = `${fout?.code ? `[${fout.code}] ` : ""}${fout?.message ?? fout}`;
  } finally {
    await werkkopie?.sluit();
  }
  resultaat.ongewijzigd = hash(await readFile(bestand.bestand)) === voor;
  assert.ok(resultaat.ongewijzigd, `${bestand.naam}: origineel gewijzigd!`);
}

const som = (veld) => resultaten.reduce((t, r) => t + (r[veld] ?? 0), 0);
const samenvatting = {
  datum: new Date().toISOString(),
  bestanden: resultaten.length,
  opgebouwd: resultaten.filter((r) => r.opgebouwd).length,
  opbouwFouten: resultaten.filter((r) => r.fout).length,
  ongewijzigd: resultaten.filter((r) => r.ongewijzigd).length,
  tabellen: som("tabellen"),
  rijenMdbReader: som("rijenMdbReader"),
  rijenWerkkopie: som("rijenWerkkopie"),
  bestandenMetRijafwijking: resultaten.filter((r) => r.afwijkingen?.length).length,
  tabellenMetVerwijderdeRijenGecorrigeerd: som("gecorrigeerd"),
  bestandenMetMeldingen: resultaten.filter((r) => r.meldingen && (r.meldingen.waarschuwing || r.meldingen.fout)).length,
  opbouwMeldingen: {
    waarschuwing: resultaten.reduce((t, r) => t + (r.meldingen?.waarschuwing ?? 0), 0),
    fout: resultaten.reduce((t, r) => t + (r.meldingen?.fout ?? 0), 0),
  },
  indexen: resultaten.reduce((t, r) => t + (r.indexen?.aangemaakt ?? 0), 0),
  indexenMislukt: resultaten.reduce((t, r) => t + (r.indexen?.mislukt ?? 0), 0),
  relaties: resultaten.reduce((t, r) => t + (r.relaties?.totaal ?? 0), 0),
  relatiesAfgedwongen: resultaten.reduce((t, r) => t + (r.relaties?.afgedwongen ?? 0), 0),
  querys: resultaten.reduce((t, r) => t + (r.querys?.totaal ?? 0), 0),
  querysGeslaagd: resultaten.reduce((t, r) => t + (r.querys?.geslaagd ?? 0), 0),
  querysBeperking: resultaten.reduce((t, r) => t + (r.querys?.beperking ?? 0), 0),
  querysFout: resultaten.reduce((t, r) => t + (r.querys?.fout ?? 0), 0),
  perQuerysoort: categorieen,
  foutcodes,
  langsteOpbouwMs: Math.max(0, ...resultaten.map((r) => r.opbouwMs ?? 0)),
};
await mkdir(uitvoer.replace(/\/[^/]+$/, ""), { recursive: true });
await writeFile(uitvoer, JSON.stringify({ samenvatting, resultaten }, null, 2));
console.log(JSON.stringify(samenvatting, null, 2));
for (const r of resultaten) {
  if (r.fout) console.log(`- ${r.pad}: opbouw mislukt ${r.fout}`);
  if (r.afwijkingen?.length) console.log(`- ${r.pad}: ${r.afwijkingen.join("; ")}`);
  if (r.definitieAfwijkingen?.length) console.log(`- ${r.pad}: (bron) ${r.definitieAfwijkingen.join("; ")}`);
  for (const d of r.querys?.details ?? []) console.log(`- ${r.pad}: query ${d.naam} (${d.soort}) ${d.uitkomst} [${d.code}]`);
}
console.log(`Volledig rapport: ${uitvoer}`);
assert.equal(samenvatting.ongewijzigd, resultaten.length);
