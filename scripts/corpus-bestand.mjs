import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { unzipSync } from "fflate";

// Eén proces per bestand begrenst vastlopers en voorkomt dat een parserfout de hele proef beëindigt.
const [pad, extensie] = process.argv.slice(2);
const bytes = await readFile(pad);
const start = performance.now();
const fase = (naam) => process.stderr.write(`CORPUS_FASE=${naam}\n`);
fase("pakketcontrole");
let openen, bewaren, opnieuw, informatie;
const rapporteer = (resultaat) =>
  process.stdout.write("\nCORPUS_RESULTAAT=" + JSON.stringify(resultaat));
try {
  if (["docx", "xlsx", "pptx"].includes(extensie)) {
    let omvang = 0,
      aantal = 0;
    unzipSync(bytes, {
      filter: (item) => {
        omvang += item.originalSize;
        if (++aantal > 10000 || omvang > 256 * 1024 * 1024)
          throw new Error(
            "Pakket overschrijdt de corpuslimiet van 256 MB of 10.000 onderdelen.",
          );
        return false;
      },
    });
  }
  if (extensie === "docx") {
    fase("engine-laden");
    const { parseDocx, repackDocx } = await import("@betteroffice/docx/docx");
    fase("openen");
    const t = performance.now();
    const document = await parseDocx(bytes, { preloadFonts: false });
    openen = performance.now() - t;
    fase("bewaren");
    const s = performance.now();
    const bewaard = new Uint8Array(await repackDocx(document));
    bewaren = performance.now() - s;
    fase("heropenen");
    const r = performance.now();
    await parseDocx(bewaard, { preloadFonts: false });
    opnieuw = performance.now() - r;
    informatie = {
      alineaObjecten: document.package.document.content.length,
      uitvoerBytes: bewaard.length,
    };
  } else if (extensie === "xlsx" || extensie === "pptx") {
    fase("engine-laden");
    const engine = await import(`@betteroffice/${extensie}`);
    await engine.initWasm(
      await readFile(
        `node_modules/@betteroffice/${extensie}/dist/generated/${extensie}_wasm_bg.wasm`,
      ),
    );
    const open =
      extensie === "xlsx" ? engine.openWorkbook : engine.openPresentation;
    const t = performance.now();
    fase("openen");
    const document = open(bytes);
    openen = performance.now() - t;
    fase("bewaren");
    const s = performance.now();
    const bewaard = document.save();
    bewaren = performance.now() - s;
    fase("heropenen");
    const r = performance.now();
    const heropend = open(bewaard);
    opnieuw = performance.now() - r;
    informatie = { uitvoerBytes: bewaard.length };
    document.dispose?.();
    heropend.dispose?.();
  } else if (["mdb", "accdb"].includes(extensie)) {
    const { default: MDBReader } = await import("mdb-reader");
    const t = performance.now();
    const database = new MDBReader(bytes);
    const tabellen = database.getTableNames();
    let rijen = 0,
      kolommen = 0;
    for (const naam of tabellen) {
      const tabel = database.getTable(naam);
      kolommen += tabel.getColumnNames().length;
      rijen += tabel.getData({ rowLimit: 100 }).length;
    }
    rapporteer({
      status: "database-gelezen",
      openenMs: performance.now() - t,
      tabellen: tabellen.length,
      kolommen,
      gelezenRijen: rijen,
    });
    process.exit(0);
  } else {
    rapporteer({ status: "nog-niet-ondersteund", extensie });
    process.exit(0);
  }
  rapporteer({
    status: "geopend-bewaard-heropend",
    openenMs: openen,
    bewarenMs: bewaren,
    heropenenMs: opnieuw,
    totaalMs: performance.now() - start,
    ...informatie,
  });
} catch (error) {
  process.exitCode = 1;
  rapporteer({
    status: "geweigerd-of-fout",
    fout: String(error),
    totaalMs: performance.now() - start,
  });
}
