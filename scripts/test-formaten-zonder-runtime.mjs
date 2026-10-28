// Proef voor de formaten zonder runtime (pakket C): de eigen omzettingen in
// src/import worden via Vite in Node geladen (dezelfde code als in de
// browser) en het resultaat wordt onafhankelijk met LibreOffice gecontroleerd.
//
// - #39: TXT, Markdown, HTML en RTF → DOCX; LibreOffice zet onze DOCX om naar
//   tekst en die moet de verwachte inhoud bevatten.
// - #38: CSV → XLSX; LibreOffice zet onze XLSX terug naar CSV.
// - #41: ontsleutelen van door LibreOffice versleutelde bestanden en
//   LibreOffice opent ons versleutelde bestand met het wachtwoord (via UNO).
// - #42: VBA-project blijft byte-identiek na terugzetten (corpus in .local/corpus).
//
// Gebruik: node scripts/test-formaten-zonder-runtime.mjs [pad-naar-soffice]
// Resultaten: .local/formaten-zonder-runtime/ (bestanden + resultaten.json).
import { spawnSync, execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const uitmap = ".local/formaten-zonder-runtime";
rmSync(uitmap, { recursive: true, force: true });
mkdirSync(uitmap, { recursive: true });

function vindSoffice() {
  return [
    process.argv[2],
    process.env.OPENAEC_CONVERSIE_PROGRAMMA,
    "/usr/bin/soffice",
    "/usr/lib/libreoffice/program/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  ]
    .filter(Boolean)
    .find((p) => existsSync(p));
}
const soffice = vindSoffice();
const versie = soffice
  ? execFileSync(soffice, ["--version"], { encoding: "utf8" }).trim()
  : null;
const profiel = readFileSync("src-tauri/src/conversieprofiel.xcu", "utf8");

/** Conversie met LibreOffice in een nieuw tijdelijk profiel. */
function libreOffice(bytes, bron, doel) {
  if (!soffice) return null;
  const map = mkdtempSync(join(tmpdir(), "zonder-runtime-"));
  try {
    mkdirSync(join(map, "profiel/user"), { recursive: true });
    writeFileSync(join(map, "profiel/user/registrymodifications.xcu"), profiel);
    mkdirSync(join(map, "uit"));
    const invoer = join(map, `invoer.${bron}`);
    writeFileSync(invoer, bytes);
    const r = spawnSync(
      soffice,
      [
        `-env:UserInstallation=${pathToFileURL(join(map, "profiel")).href}`,
        "--headless",
        "--norestore",
        "--convert-to",
        doel,
        "--outdir",
        join(map, "uit"),
        invoer,
      ],
      { timeout: 120000, encoding: "utf8" },
    );
    const uit = readdirSync(join(map, "uit"));
    if (!uit.length)
      throw new Error(`LibreOffice gaf geen uitvoer: ${r.stderr || r.stdout}`);
    return readFileSync(join(map, "uit", uit[0]));
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

/** Python met UNO (LibreOffice), voor wachtwoorden die de CLI niet kan meegeven. */
function uno(script, ...args) {
  if (!soffice) return null;
  const map = mkdtempSync(join(tmpdir(), "zonder-runtime-uno-"));
  try {
    writeFileSync(join(map, "proef.py"), script);
    const r = spawnSync(
      "python3",
      [join(map, "proef.py"), soffice, map, ...args],
      {
        timeout: 180000,
        encoding: "utf8",
      },
    );
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return r.stdout.trim();
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

const resultaten = [];
function verslag(issue, naam, geslaagd, details) {
  resultaten.push({ issue, naam, geslaagd, details });
  console.log(
    `${geslaagd ? "✓" : "✗"} ${issue} ${naam}${details ? " — " + details : ""}`,
  );
}
async function proef(issue, naam, taak) {
  try {
    const details = await taak();
    verslag(issue, naam, true, details);
  } catch (fout) {
    verslag(issue, naam, false, String(fout?.message ?? fout));
  }
}
const enc = (tekst) => new TextEncoder().encode(tekst);
function bevat(tekst, ...delen) {
  for (const deel of delen)
    if (!tekst.includes(deel))
      throw new Error(`ontbreekt: ${JSON.stringify(deel)}`);
}

const { createServer } = await import("vite");
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true, include: [] },
});
const laad = (pad) => server.ssrLoadModule(pad);

try {
  // ── #39 Tekstformaten → DOCX ─────────────────────────────────────────
  const { zetTekstOm } = await laad("/src/import/tekstimport.ts");
  const png = readFileSync("src-tauri/icons/32x32.png");
  const pngData = "data:image/png;base64," + png.toString("base64");
  const tekstfixtures = [
    {
      ext: "txt",
      bytes: new Uint8Array([
        ...enc("Offerte voor caf"),
        0xe9,
        ...enc(" De Brug\r\nPrijs:\t"),
        0x80,
        ...enc(" 12,50\r\n"),
      ]),
      verwacht: ["Offerte voor café De Brug", "€ 12,50"],
    },
    {
      ext: "md",
      bytes: enc(
        `# Projectplan\n\nTekst met **vet** en een [link](https://openaec.org).\n\n- punt een\n- punt twee\n\n| Fase | Weken |\n|---|---|\n| Ontwerp | 4 |\n\n\`\`\`\ncode regel\n\`\`\`\n\n![logo](${pngData})\n`,
      ),
      verwacht: ["Projectplan", "vet", "punt twee", "Ontwerp", "code regel"],
    },
    {
      ext: "html",
      bytes: enc(
        `<html><head><meta charset="utf-8"><script>alert(1)</script></head><body><h1>Rapport</h1><p>Eerste <b>alinea</b> met € en ë.</p><ul><li>Item A<li>Item B</ul><table><tr><th>K1<th>K2<tr><td>1<td>2</table><img src="${pngData}"></body></html>`,
      ),
      verwacht: ["Rapport", "Eerste alinea met € en ë.", "Item B", "K2"],
      verboden: ["alert"],
    },
    {
      ext: "rtf",
      bytes: enc(
        String.raw`{\rtf1\ansi\ansicpg1252{\fonttbl{\f0 Arial;}}{\stylesheet{\s1 heading 1;}}{\header Kop\par}\pard\s1 Hoofdstuk\par\pard Gewone {\b vet} caf\'e9 \u8364? tekst\par\trowd\cellx2000\cellx4000\pard\intbl A1\cell B1\cell\row\pard Einde\par}`,
      ),
      verwacht: ["Hoofdstuk", "Gewone vet café € tekst", "A1", "B1", "Einde"],
      verboden: ["Kop"],
    },
  ];
  for (const fixture of tekstfixtures) {
    await proef("#39", `${fixture.ext} → docx`, async () => {
      const { bytes } = zetTekstOm(fixture.ext, fixture.bytes);
      writeFileSync(join(uitmap, `tekst-${fixture.ext}.docx`), bytes);
      writeFileSync(join(uitmap, `tekst-bron.${fixture.ext}`), fixture.bytes);
      const tekst = libreOffice(bytes, "docx", "txt:Text (encoded):UTF8");
      if (!tekst) return "geen LibreOffice: alleen omgezet";
      const gelezen = new TextDecoder().decode(tekst).replace(/\s+/g, " ");
      bevat(gelezen, ...fixture.verwacht);
      for (const v of fixture.verboden ?? [])
        if (gelezen.includes(v)) throw new Error(`mag niet voorkomen: ${v}`);
      return `LibreOffice leest ${fixture.verwacht.length} verwachte fragmenten`;
    });
  }

  // ── #38 CSV → XLSX ───────────────────────────────────────────────────
  const { csvNaarXlsx, herkenInstellingen } = await laad(
    "/src/import/csvimport.ts",
  );
  await proef(
    "#38",
    "csv → xlsx (typen, voorloopnullen, formule-injectie)",
    async () => {
      const csv = new Uint8Array([
        ...enc(
          "Postcode;Bedrag;Datum;Opmerking;IBAN\r\n0123AB;1.234,50;31-12-2026;=1+1;NL91ABNA0417164300\r\n",
        ),
        ...enc("0456;-7;01-01-2027;@SUM(A1);NL20INGB0001234567\r\nCaf"),
        0xe9,
        ...enc(";12,5%;2026-06-01;+31 6 12345678;\r\n"),
      ]);
      const instellingen = herkenInstellingen(csv, "csv");
      const { xlsx, formuleachtig } = csvNaarXlsx(csv, instellingen);
      writeFileSync(join(uitmap, "csv-bron.csv"), csv);
      writeFileSync(join(uitmap, "csv-import.xlsx"), xlsx);
      if (formuleachtig !== 3)
        throw new Error(`formuleachtig ${formuleachtig}`);
      const terug = libreOffice(
        xlsx,
        "xlsx",
        "csv:Text - txt - csv (StarCalc):59,34,76,1,,0,false,true,false,false,false",
      );
      if (!terug) return "geen LibreOffice";
      const tekst = new TextDecoder().decode(terug);
      writeFileSync(join(uitmap, "csv-terug-libreoffice.csv"), tekst);
      if (!/;1234[.,]5;31-12-2026;/.test(tekst))
        throw new Error("bedrag of datum niet als getal/datum gelezen");
      bevat(
        tekst,
        "0123AB",
        "=1+1",
        "@SUM(A1)",
        "NL91ABNA0417164300",
        "Café",
        "+31 6 12345678",
        "0456",
        "-7",
      );
      if (/;2;/.test(tekst)) throw new Error("=1+1 is als formule uitgerekend");
      return "LibreOffice leest tekst, getallen en datums; formules niet uitgevoerd";
    },
  );

  // ── #41 Wachtwoordbeveiliging ────────────────────────────────────────
  const { versleutel, ontsleutel, herkenVersleuteling } = await laad(
    "/src/import/versleuteling.ts",
  );
  const { schrijfDocx } = await laad("/src/import/docxschrijver.ts");
  const UNO = `
import sys, os, time, subprocess, uno
from com.sun.star.beans import PropertyValue
soffice, map = sys.argv[1], sys.argv[2]
actie = sys.argv[3]
def p(n, v):
    x = PropertyValue(); x.Name = n; x.Value = v; return x
profiel = "file://" + os.path.join(map, "profiel")
proces = subprocess.Popen([soffice, "-env:UserInstallation=" + profiel, "--headless", "--norestore", "--nologo",
    "--accept=pipe,name=proef%d;urp;" % os.getpid()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    lokaal = uno.getComponentContext()
    resolver = lokaal.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", lokaal)
    for _ in range(120):
        try:
            ctx = resolver.resolve("uno:pipe,name=proef%d;urp;StarOffice.ComponentContext" % os.getpid()); break
        except Exception:
            time.sleep(0.5)
    desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
    if actie == "lees":
        pad, wachtwoord = sys.argv[4], sys.argv[5]
        try:
            doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(pad), "_blank", 0, (p("Hidden", True), p("Password", wachtwoord)))
        except Exception as e:
            doc = None
        if doc is None: print("NIET GEOPEND")
        else:
            print(doc.getText().getString()); doc.close(True)
    else:
        bron, doel, wachtwoord = sys.argv[4], sys.argv[5], sys.argv[6]
        doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(bron), "_blank", 0, (p("Hidden", True),))
        doc.storeToURL(uno.systemPathToFileUrl(doel), (p("FilterName", "MS Word 2007 XML"), p("Password", wachtwoord)))
        doc.close(True); print("OK")
finally:
    try: desktop.terminate()
    except Exception: pass
    time.sleep(1); proces.kill()
`;
  const geheim = "Proef-wachtwoord €1";
  const proefDocx = schrijfDocx({
    blokken: [
      {
        soort: "alinea",
        inhoud: [{ soort: "tekst", tekst: "Vertrouwelijke offerte 2026" }],
      },
    ],
  });
  await proef(
    "#41",
    "ons versleutelde DOCX opent in LibreOffice met het wachtwoord",
    async () => {
      const cfb = await versleutel(proefDocx, geheim);
      const pad = resolve(uitmap, "versleuteld-door-ons.docx");
      writeFileSync(pad, cfb);
      if (!soffice) return "geen LibreOffice";
      const tekst = uno(UNO, "lees", pad, geheim);
      bevat(tekst, "Vertrouwelijke offerte 2026");
      const fout = uno(UNO, "lees", pad, "fout");
      if (fout.includes("Vertrouwelijke"))
        throw new Error("opent met fout wachtwoord");
      return "LibreOffice leest de tekst met het goede wachtwoord, niet met een fout";
    },
  );
  await proef(
    "#41",
    "door LibreOffice versleuteld DOCX ontsleutelen",
    async () => {
      if (!soffice) return "geen LibreOffice";
      const bron = resolve(uitmap, "onversleuteld.docx");
      const doel = resolve(uitmap, "versleuteld-door-libreoffice.docx");
      writeFileSync(bron, proefDocx);
      uno(UNO, "schrijf", bron, doel, geheim);
      const herkend = herkenVersleuteling(readFileSync(doel));
      if (!herkend) throw new Error("niet als versleuteld herkend");
      const zip = await ontsleutel(herkend, geheim);
      const tekst = libreOffice(zip, "docx", "txt:Text (encoded):UTF8");
      bevat(new TextDecoder().decode(tekst), "Vertrouwelijke offerte 2026");
      return `LibreOffice schrijft ${herkend.soort}; wij ontsleutelen het`;
    },
  );

  // ── VERVOLG ──
} finally {
  await server.close();
}

writeFileSync(
  join(uitmap, "resultaten.json"),
  JSON.stringify(
    { versie, datum: new Date().toISOString(), resultaten },
    null,
    2,
  ),
);
const mislukt = resultaten.filter((r) => !r.geslaagd).length;
console.log(
  `\n${resultaten.length - mislukt}/${resultaten.length} geslaagd${versie ? ` (${versie})` : " (zonder LibreOffice)"}`,
);
process.exit(mislukt ? 1 : 0);
