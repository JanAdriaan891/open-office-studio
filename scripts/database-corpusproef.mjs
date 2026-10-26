import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import MDBReader from "mdb-reader";
import {
  analyseerDatabase,
  analyseVersleuteld,
  herkenVersleuteling,
  isVersleutelingsfout,
  maakRijfilter,
} from "../packages/database/src/access-analyse.ts";
import {
  leesFormaat,
  leesTabeldefinitie,
  telRijenRuw,
} from "../packages/database/src/access-pagina.ts";

// Corpusproef voor issue #8: leest alle MDB/ACCDB-bestanden alleen-lezen, vergelijkt aantallen
// onafhankelijk en controleert met SHA-256 dat de originelen ongewijzigd blijven.
// Er worden geen gegevens of persoonsgegevens uitgevoerd; alleen bestandsnamen en aantallen.
const manifestPad =
  process.env.CORPUS_MANIFEST ?? ".local/corpus/manifest.json";
const uitvoer =
  process.env.CORPUS_RAPPORT ?? ".local/database-corpusproef.json";
const manifest = JSON.parse(await readFile(manifestPad, "utf8"));
const bestanden = manifest.bestanden.filter(
  (b) => /^(mdb|accdb)$/.test(b.extensie) && b.status === "opgehaald",
);
const hash = async (pad) =>
  createHash("sha256")
    .update(await readFile(pad))
    .digest("hex");
let mdbTools = null;
try {
  execFileSync("mdb-ver", ["-M"], { stdio: "ignore" });
  mdbTools = true;
} catch {
  mdbTools = false;
}

// Verwachte SQL volgens de openbare Jackcess-proef QueryTest (Apache-2.0) voor de queryTest-databases.
const verwachteQuerys = {
  SelectQuery:
    'SELECT DISTINCT Table1.*, Table2.col1, Table2.col2, Table3.col3\nFROM (Table1 LEFT JOIN Table3 ON Table1.col1 = Table3.col1) INNER JOIN Table2 ON (Table3.col1 = Table2.col2) AND (Table3.col1 = Table2.col1)\nWHERE (((Table2.col2)="foo" Or (Table2.col2) In ("buzz","bazz")))\nORDER BY Table2.col1;',
  DeleteQuery:
    'DELETE Table1.col1, Table1.col2, Table1.col3\nFROM Table1\nWHERE (((Table1.col1)>"blah"));',
  AppendQuery:
    "INSERT INTO Table3 (col2, col2, col3)\nSELECT [Table1].[col2], [Table2].[col2], [Table2].[col3]\nFROM Table3, Table1 INNER JOIN Table2 ON [Table1].[col1]=[Table2].[col1];",
  UpdateQuery:
    'PARAMETERS User Name Text;\nUPDATE Table1\nSET Table1.col1 = "foo", Table1.col2 = [Table2].[col3], [Table2].[col1] = [User Name]\nWHERE ((([Table2].[col1]) Is Not Null));',
  MakeTableQuery:
    'SELECT Max(Table2.col1) AS MaxOfcol1, Table2.col2, Table3.col2 INTO Table4\nFROM (Table2 INNER JOIN Table1 ON Table2.col1 = Table1.col2) RIGHT JOIN Table3 ON Table1.col2 = Table3.col3\nGROUP BY Table2.col2, Table3.col2\nHAVING (((Max(Table2.col1))="buzz") AND ((Table2.col2)<>"blah"));',
  CrosstabQuery:
    'TRANSFORM Count([Table2].[col2]) AS CountOfcol2\nSELECT Table2_1.col1, [Table2].[col3], Avg(Table2_1.col2) AS AvgOfcol2\nFROM (Table1 INNER JOIN Table2 ON [Table1].[col1]=[Table2].[col1]) INNER JOIN Table2 AS Table2_1 ON [Table2].[col1]=Table2_1.col3\nWHERE ((([Table1].[col1])>"10") And ((Table2_1.col1) Is Not Null) And ((Avg(Table2_1.col2))>"10"))\nGROUP BY Table2_1.col1, [Table2].[col3]\nORDER BY [Table2].[col3]\nPIVOT [Table1].[col1];',
  UnionQuery:
    'Select Table1.col1, Table1.col2\nwhere Table1.col1 = "foo"\nUNION\nSelect Table2.col1, Table2.col2\nUNION ALL Select Table3.col1, Table3.col2\nwhere Table3.col3 > "blah";',
  PassthroughQuery: "ALTER TABLE Table4 DROP COLUMN col5;",
  DataDefinitionQuery: "CREATE TABLE Table5 (col1 CHAR, col2 CHAR);",
};

const resultaten = [];
let queryVergelijkingen = 0;
let queryGelijk = 0;
for (const bestand of bestanden) {
  const voor = await hash(bestand.bestand);
  assert.equal(
    voor,
    bestand.sha256,
    `${bestand.naam}: SHA-256 wijkt af van het manifest.`,
  );
  const resultaat = {
    id: bestand.id,
    bron: bestand.bron,
    pad: bestand.pad,
    extensie: bestand.extensie,
    geopend: false,
  };
  resultaten.push(resultaat);
  try {
    const buffer = await readFile(bestand.bestand);
    const bytes = new Uint8Array(buffer);
    // Versleuteling: herkend in de kop vóór het openen, of aan de fout van mdb-reader.
    let versleuteling = herkenVersleuteling(bytes);
    let db = null;
    if (!versleuteling)
      try {
        db = new MDBReader(buffer);
      } catch (fout) {
        if (!isVersleutelingsfout(fout)) throw fout;
        versleuteling = `alleen aan de fout herkend (${fout.message})`;
      }
    if (!db) {
      const { rapport } = await analyseVersleuteld(
        bytes,
        { naam: bestand.naam, grootte: bytes.byteLength },
        versleuteling,
      );
      assert.equal(rapport.sha256, voor, "Rapporthash wijkt af.");
      resultaat.versleuteld = versleuteling;
      resultaat.rapportregels = Object.fromEntries(
        rapport.regels.map((r) => [r.onderdeel, r.status]),
      );
      resultaat.ongewijzigd = (await hash(bestand.bestand)) === voor;
      assert.ok(resultaat.ongewijzigd, `${bestand.naam}: bestand gewijzigd!`);
      continue;
    }
    const { objecten, rapport } = await analyseerDatabase(db, bytes, {
      naam: bestand.naam,
      grootte: bytes.byteLength,
    });
    assert.equal(rapport.sha256, voor, "Rapporthash wijkt af.");
    resultaat.geopend = true;
    resultaat.formaat = rapport.formaat;
    const tel = (soort) => objecten.filter((o) => o.soort === soort).length;
    resultaat.tabellen = tel("Tabel");
    resultaat.gekoppeld = tel("Gekoppelde tabel");
    resultaat.querys = tel("Query");
    resultaat.querysMetSql = objecten.filter(
      (o) => o.soort === "Query" && o.bron,
    ).length;
    resultaat.relaties = tel("Relatie");
    resultaat.indexen = objecten.reduce(
      (som, o) => som + (o.indexen?.length ?? 0),
      0,
    );
    resultaat.modules = tel("VBA");
    resultaat.modulesMetBron = objecten.filter(
      (o) => o.soort === "VBA" && o.bron,
    ).length;
    resultaat.formulieren = tel("Formulier");
    resultaat.rapporten = tel("Rapport");
    resultaat.macros = tel("Macro");
    resultaat.rapportregels = Object.fromEntries(
      rapport.regels.map((r) => [r.onderdeel, r.status]),
    );
    resultaat.vbaToelichting =
      rapport.regels.find((r) => r.onderdeel === "VBA-modules")?.toelichting ??
      "";

    // Onafhankelijke controle: eigen tabeldefinitielezer en paginascan tegenover mdb-reader.
    const formaat = leesFormaat(bytes);
    const tellingen = telRijenRuw(bytes, formaat);
    const ids = new Map(
      db
        .getTable("MSysObjects")
        .getData()
        .filter((o) => o.Type === 1)
        .map((o) => [o.Name, o.Id & 0xffffff]),
    );
    resultaat.rijenMdbReader = 0;
    resultaat.rijenGelezen = 0;
    resultaat.rijenAlleenLezen = 0;
    resultaat.rijenEigenScan = 0;
    resultaat.tabellenGecorrigeerd = 0;
    const rijfilter = maakRijfilter(db, bytes);
    resultaat.afwijkingen = [];
    for (const naam of db.getTableNames()) {
      const pagina = ids.get(naam);
      try {
        const tabel = db.getTable(naam);
        const definitie = leesTabeldefinitie(bytes, formaat, pagina);
        const eigenKolommen = new Set(definitie.kolommen.map((k) => k.naam));
        const kolommen = tabel.getColumnNames();
        if (
          kolommen.length !== eigenKolommen.size ||
          !kolommen.every((k) => eigenKolommen.has(k))
        )
          resultaat.afwijkingen.push(`${naam}: kolommen`);
        let gelezen = null;
        try {
          gelezen = tabel.getData().length;
        } catch (fout) {
          resultaat.afwijkingen.push(
            `${naam}: rijen niet leesbaar via mdb-reader (${fout.message})`,
          );
        }
        // Alleen-lezen-tabelpad (zelfde rijcorrectie als de werkkopie).
        let alleenLezen = null;
        if (gelezen !== null) {
          const levend = rijfilter.levend(naam);
          if (levend) resultaat.tabellenGecorrigeerd++;
          alleenLezen = rijfilter.lees(naam, 0, gelezen + 1).rijen.length;
        }
        const eigen = tellingen.get(pagina) ?? 0;
        resultaat.rijenMdbReader += tabel.rowCount;
        resultaat.rijenGelezen += gelezen ?? 0;
        resultaat.rijenAlleenLezen += alleenLezen ?? 0;
        resultaat.rijenEigenScan += eigen;
        if (
          eigen !== tabel.rowCount ||
          (alleenLezen !== null && alleenLezen !== eigen)
        )
          resultaat.afwijkingen.push(
            `${naam}: tabeldefinitie ${tabel.rowCount}, mdb-reader gelezen ${gelezen}, alleen-lezen-pad ${alleenLezen}, eigen scan ${eigen}`,
          );
      } catch (fout) {
        resultaat.afwijkingen.push(`${naam}: ${fout.message}`);
      }
    }
    if (/queryTest|query/i.test(bestand.pad) && resultaat.querys) {
      for (const object of objecten.filter((o) => o.soort === "Query")) {
        if (!(object.naam in verwachteQuerys)) continue;
        queryVergelijkingen++;
        if (object.bron === verwachteQuerys[object.naam]) queryGelijk++;
        else
          resultaat.afwijkingen.push(
            `query ${object.naam} wijkt af van de Jackcess-verwachting`,
          );
      }
    }
  } catch (fout) {
    resultaat.fout = fout.message;
  }
  resultaat.ongewijzigd = (await hash(bestand.bestand)) === voor;
  assert.ok(resultaat.ongewijzigd, `${bestand.naam}: bestand gewijzigd!`);
}

const som = (veld) => resultaten.reduce((t, r) => t + (r[veld] ?? 0), 0);
const samenvatting = {
  datum: new Date().toISOString(),
  bestanden: resultaten.length,
  geopend: resultaten.filter((r) => r.geopend).length,
  fouten: resultaten.filter((r) => r.fout).length,
  versleuteld: resultaten.filter((r) => r.versleuteld).length,
  ongewijzigd: resultaten.filter((r) => r.ongewijzigd).length,
  mdbTools,
  tabellen: som("tabellen"),
  gekoppeld: som("gekoppeld"),
  querys: som("querys"),
  querysMetSql: som("querysMetSql"),
  queryVergelijkingen,
  queryGelijk,
  relaties: som("relaties"),
  indexen: som("indexen"),
  modules: som("modules"),
  modulesMetBron: som("modulesMetBron"),
  vbaProjecten: resultaten.filter((r) =>
    /VBA-project ‘/.test(r.vbaToelichting ?? ""),
  ).length,
  formulieren: som("formulieren"),
  rapporten: som("rapporten"),
  macros: som("macros"),
  rijenMdbReader: som("rijenMdbReader"),
  rijenGelezen: som("rijenGelezen"),
  rijenAlleenLezen: som("rijenAlleenLezen"),
  tabellenGecorrigeerd: som("tabellenGecorrigeerd"),
  vbaRuweRoute: resultaten.filter((r) =>
    /met de eigen rijlezer gelezen/.test(r.vbaToelichting ?? ""),
  ).length,
  rijenEigenScan: som("rijenEigenScan"),
  bestandenMetAfwijking: resultaten.filter((r) => r.afwijkingen?.length).length,
};
await mkdir(uitvoer.replace(/\/[^/]+$/, ""), { recursive: true });
await writeFile(uitvoer, JSON.stringify({ samenvatting, resultaten }, null, 2));
console.log(JSON.stringify(samenvatting, null, 2));
for (const r of resultaten)
  if (r.fout || r.versleuteld || r.afwijkingen?.length)
    console.log(
      `- ${r.pad}: ${r.fout ?? (r.versleuteld ? `versleuteld: ${r.versleuteld}` : r.afwijkingen.join("; "))}`,
    );
assert.equal(samenvatting.ongewijzigd, resultaten.length);
assert.equal(
  queryGelijk,
  queryVergelijkingen,
  "Query-reconstructie wijkt af van Jackcess.",
);
