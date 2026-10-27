// Proef voor Opslaan als: elk formaat uit src/formaten.json wordt met de eigen
// voorbeelden echt gemaakt en daarna opnieuw geopend en gecontroleerd.
//
// - Runtimeformaten: `soffice --headless --convert-to ext:filter:opties` met
//   hetzelfde veilige profiel als de desktopapp (src-tauri/src/conversieprofiel.xcu),
//   een nieuw tijdelijk profiel per conversie, en hetzelfde filter uit de catalogus.
//   Bewerkbare formaten worden met de runtime teruggezet naar OOXML en met de
//   eigen engines gelezen; PDF via Poppler; tekst/HTML/EPUB op inhoud.
// - Engineroutes (in de browser zonder runtime): src/export via Vite in Node.
//
// Gebruik: node scripts/test-opslaan-als.mjs [pad-naar-soffice]
// Resultaten: .local/opslaan-als/ (bestanden + resultaten.json).
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import * as xlsx from "@betteroffice/xlsx";
import * as pptx from "@betteroffice/pptx";
import { exportDocxMarkdown } from "@betteroffice/docx";
import { maakGrafiekDocx } from "./maak-grafiekdocx.mjs";

const catalogus = JSON.parse(readFileSync("src/formaten.json", "utf8"));
const profiel = readFileSync("src-tauri/src/conversieprofiel.xcu", "utf8");
const uitmap = ".local/opslaan-als";
rmSync(uitmap, { recursive: true, force: true });
mkdirSync(uitmap, { recursive: true });

function vindSoffice() {
  const kandidaten = [
    process.argv[2],
    process.env.OPENAEC_CONVERSIE_PROGRAMMA,
    "/usr/bin/soffice",
    "/usr/lib/libreoffice/program/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  ].filter(Boolean);
  const pad = kandidaten.find((p) => existsSync(p));
  if (!pad)
    throw new Error(
      "Geen kantoorruntime gevonden; geef het pad naar soffice mee.",
    );
  return pad;
}
const soffice = vindSoffice();
const versie = execFileSync(soffice, ["--version"], {
  encoding: "utf8",
}).trim();

await xlsx.initWasm(
  readFileSync(
    "node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm",
  ),
);
await pptx.initWasm(
  readFileSync(
    "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
  ),
);

/** Eén conversie zoals de Rust-route: nieuw tijdelijk profiel met het veilige profiel. */
function converteer(bytes, bron, spec, doel) {
  const map = mkdtempSync(join(tmpdir(), "opslaan-als-"));
  try {
    mkdirSync(join(map, "profiel/user"), { recursive: true });
    writeFileSync(join(map, "profiel/user/registrymodifications.xcu"), profiel);
    mkdirSync(join(map, "uit"));
    const invoer = join(map, `invoer.${bron}`);
    writeFileSync(invoer, bytes);
    const start = Date.now();
    const r = spawnSync(
      soffice,
      [
        `-env:UserInstallation=${pathToFileURL(join(map, "profiel")).href}`,
        "--headless",
        "--nologo",
        "--nodefault",
        "--norestore",
        "--nolockcheck",
        "--convert-to",
        spec,
        "--outdir",
        join(map, "uit"),
        invoer,
      ],
      { timeout: 45_000, encoding: "utf8" },
    );
    const ms = Date.now() - start;
    const uit = readdirSync(join(map, "uit")).filter((n) =>
      n.toLowerCase().endsWith(`.${doel}`),
    );
    if (r.status !== 0 || uit.length !== 1)
      throw new Error(
        `conversie mislukt (status ${r.status}, ${uit.length} bestanden) ${r.stderr ?? ""}`.trim(),
      );
    return { bytes: readFileSync(join(map, "uit", uit[0])), ms };
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}
const spec = (ext, f) =>
  f.filter ? `${ext}:${f.filter}${f.opties ? ":" + f.opties : ""}` : ext;

const bronnen = {
  docx: {
    naam: "Ontwerpnotitie",
    bytes: readFileSync("docs/voorbeelden/Ontwerpnotitie.docx"),
  },
  // Zoals de app: de bytes die de engine bewaart (met berekende uitkomsten).
  xlsx: {
    naam: "Materiaaloverzicht",
    bytes: (() => {
      const h = xlsx.openWorkbook(
        readFileSync("docs/voorbeelden/Materiaaloverzicht.xlsx"),
      );
      const b = h.save();
      h.dispose();
      return b;
    })(),
  },
  pptx: {
    naam: "Ontwerpvisie",
    bytes: readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"),
  },
};
const aantalDias = (await pptx.exportPptxStructured(bronnen.pptx.bytes)).slides
  .length;
const TEKST = {
  docx: [
    "Ruimte voor ideeën",
    "Drie uitgangspunten",
    "Maak ruimte",
    "Denk vooruit",
  ],
  xlsx: [
    "Materiaaloverzicht",
    "Multiplex berken",
    "Herbruikbare kratten",
    "3068",
  ],
  pptx: ["Samen ruimte", "Drie uitgangspunten", "Samenwerking"],
};
const bevatAlles = (tekst, soort) => {
  // Bedragen mogen als "€ 3.068,00" of "€ 3,068.00" zijn weergegeven.
  const genormaliseerd = tekst
    .replace(/\s+/g, " ")
    .replace(/3[.,\u00a0]068/g, "3068");
  const ontbreekt = TEKST[soort].filter((t) => !genormaliseerd.includes(t));
  if (ontbreekt.length)
    throw new Error(`tekst ontbreekt: ${ontbreekt.join(", ")}`);
};

/** Kenmerken van een OOXML-bestand met de eigen engines. */
async function kenmerkenOoxml(soort, bytes) {
  if (soort === "docx") {
    const md = (
      await exportDocxMarkdown(bytes, {
        revisionView: "accepted",
        includeFormatting: false,
      })
    ).markdown;
    bevatAlles(md, "docx");
    const tabellen = (
      strFromU8(unzipSync(bytes)["word/document.xml"]).match(/<w:tbl>/g) ?? []
    ).length;
    if (tabellen < 1) throw new Error("tabel ontbreekt");
    return `tekst en ${tabellen} tabel behouden`;
  }
  if (soort === "xlsx") {
    const s = await xlsx.exportXlsxStructured(bytes);
    const cellen = s.sheets[0].cells;
    const totaal = cellen.find((c) => c.anchor.a1 === "G17");
    if (totaal?.formula !== "SUM(G7:G14)")
      throw new Error(`formule G17: ${totaal?.formula}`);
    if (totaal.value.kind !== "number" || totaal.value.value !== 3068)
      throw new Error(`totaal G17: ${JSON.stringify(totaal.value)}`);
    const formules = cellen.filter((c) => c.formula).length;
    return `${s.sheets.length} blad, ${formules} formules, totaal 3068 behouden`;
  }
  const s = await pptx.exportPptxStructured(bytes);
  if (s.slides.length !== aantalDias)
    throw new Error(`${s.slides.length} dia's in plaats van ${aantalDias}`);
  bevatAlles((await pptx.exportPptxMarkdown(bytes)).markdown, "pptx");
  return `${s.slides.length} dia's en diatekst behouden`;
}
function pdfKenmerken(bytes, soort) {
  const pad = join(uitmap, `tmp-${soort}.pdf`);
  writeFileSync(pad, bytes);
  const info = execFileSync("pdfinfo", [pad], { encoding: "utf8" });
  const paginas = Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
  bevatAlles(
    execFileSync("pdftotext", [pad, "-"], { encoding: "utf8" }),
    soort,
  );
  if (soort === "pptx" && paginas !== aantalDias)
    throw new Error(`${paginas} pagina's`);
  rmSync(pad);
  return `${paginas} pagina('s), leesbare tekst`;
}
function pngKenmerken(bytes) {
  const b = Buffer.from(bytes);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error("geen PNG");
  return `PNG ${b.readUInt32BE(16)}×${b.readUInt32BE(20)}`;
}
const OOXML_FILTER = {
  docx: "MS Word 2007 XML",
  xlsx: "Calc MS Excel 2007 XML",
  pptx: "Impress MS PowerPoint 2007 XML",
};

async function controleer(soort, ext, formaat, bytes) {
  const tekst = () => Buffer.from(bytes).toString("utf8");
  if (ext === "pdf") return pdfKenmerken(bytes, soort);
  if (ext === "png") return pngKenmerken(bytes);
  if (ext === "epub") {
    const delen = unzipSync(bytes);
    const html = Object.entries(delen)
      .filter(([n]) => /\.x?html$/.test(n))
      .map(([, d]) => strFromU8(d))
      .join(" ");
    bevatAlles(html.replace(/<[^>]+>/g, " "), soort);
    return `EPUB met ${Object.keys(delen).length} onderdelen, tekst aanwezig`;
  }
  if (["txt", "html", "xhtml", "md"].includes(ext)) {
    const t = tekst();
    if (/<script/i.test(t)) throw new Error("bevat script");
    bevatAlles(t.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&"), soort);
    return "tekst aanwezig, geen script";
  }
  if (["csv", "tsv"].includes(ext)) {
    const t = tekst();
    const sep = ext === "tsv" ? "\t" : ";";
    if (
      !t.includes(
        `${sep}Totaal materiaal${sep}${sep}${sep}${sep}${sep}3068${sep}`,
      )
    )
      throw new Error("totaalregel ontbreekt");
    return `totaalregel 3068, ${t.trim().split(/\r?\n/).length} regels${bytes[0] === 0xef ? ", BOM" : ""}`;
  }
  // Bewerkbaar (en RTF/DIF/SYLK): terugzetten naar OOXML en met de engines lezen.
  const terug = converteer(
    bytes,
    ext,
    `${soort}:${OOXML_FILTER[soort]}`,
    soort,
  ).bytes;
  writeFileSync(
    join(uitmap, `${bronnen[soort].naam}-via-${ext}.${soort}`),
    terug,
  );
  if (ext === "dif") {
    const s = await xlsx.exportXlsxStructured(terug);
    const g17 = s.sheets[0].cells.find((c) => c.anchor.a1 === "G17");
    if (g17?.value.value !== 3068) throw new Error("waarde 3068 ontbreekt");
    return `heropend: waarde 3068 behouden, formules ${s.sheets[0].cells.some((c) => c.formula) ? "behouden" : "vervallen"}`;
  }
  return "heropend: " + (await kenmerkenOoxml(soort, terug));
}

const resultaten = [];
for (const [soort, module] of Object.entries(catalogus)) {
  const bron = bronnen[soort];
  for (const [ext, formaat] of Object.entries(module.uitvoer)) {
    // Alleen formaten met een runtimefilter; de engineroutes volgen hieronder.
    if (!formaat.filter) continue;
    const regel = {
      module: soort,
      ext,
      route: "runtime",
      filter: spec(ext, formaat),
    };
    try {
      const { bytes, ms } = converteer(
        bron.bytes,
        soort,
        spec(ext, formaat),
        ext,
      );
      writeFileSync(join(uitmap, `${bron.naam}.${ext}`), bytes);
      regel.ms = ms;
      regel.bytes = bytes.length;
      regel.kenmerken = await controleer(soort, ext, formaat, bytes);
      regel.geslaagd = true;
    } catch (e) {
      regel.geslaagd = false;
      regel.fout = String(e.message ?? e).slice(0, 300);
    }
    resultaten.push(regel);
    console.log(
      `${regel.geslaagd ? "✓" : "✗"} ${soort} → ${ext} (runtime) ${regel.kenmerken ?? regel.fout}`,
    );
  }
}

// PDF-opties zoals de app ze doorgeeft (PDF/A-2b, bereik, bladwijzers).
{
  const regel = {
    module: "pptx",
    ext: "pdf (PDF/A-2b, dia 1-2)",
    route: "runtime",
  };
  try {
    const opties = JSON.stringify({
      SelectPdfVersion: { type: "long", value: "2" },
      PageRange: { type: "string", value: "1-2" },
    });
    const { bytes } = converteer(
      bronnen.pptx.bytes,
      "pptx",
      `pdf:impress_pdf_Export:${opties}`,
      "pdf",
    );
    const pad = join(uitmap, "Ontwerpvisie-pdfa.pdf");
    writeFileSync(pad, bytes);
    const paginas = Number(
      /Pages:\s+(\d+)/.exec(
        execFileSync("pdfinfo", [pad], { encoding: "utf8" }),
      )?.[1],
    );
    if (paginas !== 2) throw new Error(`${paginas} pagina's`);
    if (!Buffer.from(bytes).toString("latin1").includes("pdfaid:part"))
      throw new Error("PDF/A-kenmerk ontbreekt");
    regel.kenmerken = "2 pagina's, PDF/A-kenmerk aanwezig";
    regel.geslaagd = true;
  } catch (e) {
    regel.geslaagd = false;
    regel.fout = String(e.message ?? e);
  }
  resultaten.push(regel);
  console.log(
    `${regel.geslaagd ? "✓" : "✗"} pptx → pdf PDF/A ${regel.kenmerken ?? regel.fout}`,
  );
}

// DOCX met grafiek → PDF: crashte met DisableActiveContent in het profiel (SIGABRT).
{
  const regel = {
    module: "docx",
    ext: "pdf (DOCX met grafiek)",
    route: "runtime",
  };
  try {
    const { bytes, ms } = converteer(
      maakGrafiekDocx(),
      "docx",
      "pdf:writer_pdf_Export",
      "pdf",
    );
    const pad = join(uitmap, "Grafiek.pdf");
    writeFileSync(pad, bytes);
    const t = execFileSync("pdftotext", [pad, "-"], { encoding: "utf8" });
    if (!t.includes("Kosten") || !t.includes("Plaatmateriaal"))
      throw new Error("grafiektekst ontbreekt in de PDF");
    regel.ms = ms;
    regel.kenmerken = "PDF met grafiektitel en categorieën";
    regel.geslaagd = true;
  } catch (e) {
    regel.geslaagd = false;
    regel.fout = String(e.message ?? e).slice(0, 300);
  }
  resultaten.push(regel);
  console.log(
    `${regel.geslaagd ? "✓" : "✗"} docx met grafiek → pdf ${regel.kenmerken ?? regel.fout}`,
  );
}

// Engineroutes: dezelfde code als in de browser, via Vite in Node geladen.
const { createServer } = await import("vite");
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});
try {
  const { maakExport } = await server.ssrLoadModule("/src/export/index.ts");
  const motor = [
    ["docx", "md"],
    ["docx", "txt"],
    ["docx", "html"],
    ["xlsx", "csv"],
    ["xlsx", "tsv"],
    ["xlsx", "md"],
    ["xlsx", "html"],
    ["xlsx", "png"],
    ["pptx", "md"],
    ["pptx", "html"],
  ];
  for (const [soort, ext] of motor) {
    const bron = bronnen[soort];
    const regel = { module: soort, ext, route: "engine" };
    try {
      const start = Date.now();
      const uit = await maakExport(
        soort,
        ext,
        bron.bytes,
        bron.naam,
        soort === "xlsx" ? { blad: 0 } : {},
      );
      regel.ms = Date.now() - start;
      regel.bytes = uit.bytes.length;
      writeFileSync(join(uitmap, `${bron.naam}-engine.${ext}`), uit.bytes);
      const t = Buffer.from(uit.bytes).toString("utf8");
      if (ext === "png") regel.kenmerken = pngKenmerken(uit.bytes);
      else if (ext === "csv" || ext === "tsv")
        regel.kenmerken = await controleer(soort, ext, {}, uit.bytes);
      else {
        if (/<script/i.test(t)) throw new Error("bevat script");
        bevatAlles(t.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&"), soort);
        regel.kenmerken = "tekst aanwezig, geen script";
      }
      // Een HTML-export moet ook door de runtime als document te openen zijn.
      if (ext === "html" && soort === "docx") {
        const terug = converteer(
          uit.bytes,
          "html",
          "docx:MS Word 2007 XML",
          "docx",
        ).bytes;
        regel.kenmerken +=
          "; heropend: " + (await kenmerkenOoxml("docx", terug));
      }
      regel.geslaagd = true;
    } catch (e) {
      regel.geslaagd = false;
      regel.fout = String(e.message ?? e).slice(0, 300);
    }
    resultaten.push(regel);
    console.log(
      `${regel.geslaagd ? "✓" : "✗"} ${soort} → ${ext} (engine) ${regel.kenmerken ?? regel.fout}`,
    );
  }
} finally {
  await server.close();
}

writeFileSync(
  join(uitmap, "resultaten.json"),
  JSON.stringify({ runtime: versie, soffice, resultaten }, null, 2),
);
const mislukt = resultaten.filter((r) => !r.geslaagd);
console.log(
  `\n${versie}\n${resultaten.length - mislukt.length}/${resultaten.length} geslaagd.`,
);
process.exit(mislukt.length ? 1 : 0);
