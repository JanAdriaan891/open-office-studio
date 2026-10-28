import type { Soort } from "../editors";
import { cellenNaarCsv, codeer, type CsvCel, type CsvOpties } from "./csv";
import { htmlDocument, htmlNaarTekst, markdownNaarHtml, ontsnap } from "./html";
import { editorKoppeling } from "./koppeling";
import { celPositie } from "./csv";

export interface ExportOpties extends CsvOpties {
  /** 0-gebaseerd blad (CSV, TSV, PNG van rekenblad); standaard het actieve blad. */
  blad?: number;
  /** 0-gebaseerde dia (PNG); standaard de huidige dia. */
  dia?: number;
}
export interface ExportResultaat {
  bytes: Uint8Array;
  mime: string;
  toelichting?: string;
}

const MIME: Record<string, string> = {
  md: "text/markdown;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  tsv: "text/tab-separated-values;charset=utf-8",
  txt: "text/plain;charset=utf-8",
  html: "text/html;charset=utf-8",
  png: "image/png",
};
export const mimeVoor = (ext: string) =>
  MIME[ext] ?? "application/octet-stream";

const tekst = (inhoud: string) => new TextEncoder().encode(inhoud);

/** Verwijdert de bronankers van de engine; een bestand heeft die niet nodig. */
function zonderAnkers(markdown: string) {
  return markdown
    .replace(/^<!-- (?:xlsx|pptx|docx)-export:\d+ -->\r?\n?/gm, "")
    .replace(/<!-- (?:xlsx|pptx|docx)-export:\d+ -->/g, "")
    .replace(/^## Slide (\d+)$/gm, "## Dia $1")
    .replace(/^\*\*Notes\*\*$/gm, "**Notities**")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "")
    .concat("\n");
}

function controleerVolledig(resultaat: {
  truncated: boolean;
  diagnostics: readonly { severity: string }[];
}) {
  if (
    resultaat.truncated ||
    resultaat.diagnostics.some((melding) => melding.severity === "error")
  )
    throw new Error(
      "De export kon niet volledig worden gemaakt. Bewaar het document in het eigen formaat.",
    );
}

async function documentMarkdown(bytes: Uint8Array) {
  const { exporteerMarkdown } = await import("../markdown");
  const resultaat = await exporteerMarkdown(bytes);
  return {
    markdown: new TextDecoder().decode(resultaat.bytes),
    waarschuwing: resultaat.waarschuwing,
  };
}

async function presentatieMarkdown(bytes: Uint8Array) {
  const { exportPptxMarkdown } = await import("@betteroffice/pptx");
  const resultaat = await exportPptxMarkdown(bytes, {
    includeNotes: true,
    maxBytes: 8 * 1024 * 1024,
  });
  controleerVolledig(resultaat);
  return zonderAnkers(resultaat.markdown);
}

const ALLE_CELLEN = {
  includeHiddenRows: true,
  includeHiddenColumns: true,
  maxCells: 1_000_000,
  maxBytes: 16 * 1024 * 1024,
} as const;

async function rekenblad(bytes: Uint8Array, blad?: number) {
  const { exportXlsxStructured } = await import("@betteroffice/xlsx");
  const inhoud = await exportXlsxStructured(bytes, {
    ...ALLE_CELLEN,
    includeHiddenSheets: blad !== undefined,
    ...(blad !== undefined ? { scope: [{ sheet: blad }] } : {}),
  });
  controleerVolledig(inhoud);
  return inhoud;
}

/** Standaardblad: het blad dat in de editor actief is. */
function actiefBlad(opties: ExportOpties) {
  return opties.blad ?? editorKoppeling("xlsx")?.bladen?.().actief ?? 0;
}

type Blad = Awaited<ReturnType<typeof rekenblad>>["sheets"][number];

/** Eén blad als HTML-tabel; samengevoegde cellen worden rowspan/colspan. */
export function bladNaarHtml(blad: Pick<Blad, "anchor" | "cells">) {
  const raster = new Map<string, (typeof blad.cells)[number]>();
  const bedekt = new Set<string>();
  let rijen = 0,
    kolommen = 0;
  for (const cel of blad.cells) {
    const a1 = cel.anchor.kind === "cell" ? cel.anchor.a1 : null;
    const positie = a1 ? celPositie(a1) : null;
    if (!positie) continue;
    raster.set(`${positie.rij},${positie.kolom}`, cel);
    if (cel.value.kind !== "empty" || cel.merge?.origin) {
      rijen = Math.max(rijen, positie.rij + 1);
      kolommen = Math.max(kolommen, positie.kolom + 1);
    }
  }
  const regels: string[] = [];
  for (let rij = 0; rij < rijen; rij++) {
    const cellen: string[] = [];
    for (let kolom = 0; kolom < kolommen; kolom++) {
      if (bedekt.has(`${rij},${kolom}`)) continue;
      const cel = raster.get(`${rij},${kolom}`);
      let bereik = "";
      if (cel?.merge?.origin) {
        const [van, tot] = cel.merge.range.split(":").map(celPositie);
        if (van && tot) {
          const hoog = tot.rij - van.rij + 1,
            breed = tot.kolom - van.kolom + 1;
          for (let r = van.rij; r <= tot.rij; r++)
            for (let k = van.kolom; k <= tot.kolom; k++)
              if (r !== rij || k !== kolom) bedekt.add(`${r},${k}`);
          if (hoog > 1) bereik += ` rowspan="${hoog}"`;
          if (breed > 1) bereik += ` colspan="${breed}"`;
        }
      }
      const getal = cel?.value.kind === "number" ? ' class="getal"' : "";
      cellen.push(
        `<td${getal}${bereik}>${ontsnap(cel?.displayText ?? "")}</td>`,
      );
    }
    regels.push(`<tr>${cellen.join("")}</tr>`);
  }
  const naam = blad.anchor.kind === "sheet" ? blad.anchor.sheet.name : "";
  return `<h2>${ontsnap(naam)}</h2>\n<table>\n${regels.join("\n")}\n</table>`;
}

async function rekenbladPng(bytes: Uint8Array, blad: number) {
  const xlsx = await import("@betteroffice/xlsx");
  await xlsx.initWasm();
  if (!xlsx.isPngExportAvailable())
    throw new Error("Deze rekenbladengine kan geen PNG maken.");
  const werkmap = xlsx.openWorkbook(bytes);
  try {
    werkmap.setActiveSheet(blad);
    return werkmap.renderRangePng({ scale: 2 });
  } finally {
    werkmap.dispose();
  }
}

/**
 * Maakt een export zonder kantoorruntime, met de engines van de app.
 * Werkt in de browser en in de desktopapp.
 */
export async function maakExport(
  soort: Soort,
  ext: string,
  bytes: Uint8Array,
  titel: string,
  opties: ExportOpties = {},
): Promise<ExportResultaat> {
  const mime = mimeVoor(ext);
  if (ext === soort) return { bytes, mime: "application/octet-stream" };
  if (ext === "md") {
    if (soort === "docx") {
      const { markdown, waarschuwing } = await documentMarkdown(bytes);
      return {
        bytes: tekst(markdown),
        mime,
        toelichting: waarschuwing
          ? "Sommige onderdelen kunnen niet in Markdown worden overgenomen."
          : undefined,
      };
    }
    if (soort === "pptx")
      return { bytes: tekst(await presentatieMarkdown(bytes)), mime };
    const { exportXlsxMarkdown } = await import("@betteroffice/xlsx");
    await rekenblad(bytes); // controleert grenzen en afkapping vooraf
    const resultaat = await exportXlsxMarkdown(bytes, ALLE_CELLEN, {
      maxRows: 5000,
      maxColumns: 200,
      maxCells: 1_000_000,
      maxBytes: 8 * 1024 * 1024,
    });
    controleerVolledig(resultaat);
    return { bytes: tekst(zonderAnkers(resultaat.markdown)), mime };
  }
  if ((ext === "csv" || ext === "tsv") && soort === "xlsx") {
    const blad = actiefBlad(opties);
    const inhoud = await rekenblad(bytes, blad);
    const cellen = (inhoud.sheets[0]?.cells ?? []) as unknown as CsvCel[];
    const csv = cellenNaarCsv(cellen, {
      scheidingsteken: ext === "tsv" ? "tab" : (opties.scheidingsteken ?? ";"),
    });
    const { bytes: uit, vervangen } = codeer(csv, opties.codering);
    return {
      bytes: uit,
      mime,
      toelichting: vervangen
        ? `${vervangen} teken(s) bestaan niet in Windows-1252 en zijn vervangen door '?'.`
        : undefined,
    };
  }
  if (ext === "html" || ext === "txt") {
    let html: string;
    let toelichting: string | undefined;
    if (soort === "docx") {
      const { markdown, waarschuwing } = await documentMarkdown(bytes);
      html = markdownNaarHtml(markdown);
      if (waarschuwing) toelichting = "Afbeeldingen zijn niet overgenomen.";
    } else if (soort === "pptx") {
      html = markdownNaarHtml(await presentatieMarkdown(bytes));
    } else {
      const inhoud = await rekenblad(bytes);
      html = inhoud.sheets.map(bladNaarHtml).join("\n");
    }
    return {
      bytes: tekst(
        ext === "txt" ? htmlNaarTekst(html) : htmlDocument(titel, html),
      ),
      mime,
      toelichting,
    };
  }
  if (ext === "png" && soort === "xlsx")
    return { bytes: await rekenbladPng(bytes, actiefBlad(opties)), mime };
  if (ext === "png" && soort === "pptx") {
    const koppeling = editorKoppeling("pptx");
    if (!koppeling?.diaPng)
      throw new Error(
        "Open de presentatie in de editor om een dia als PNG te bewaren.",
      );
    const dia = opties.dia ?? koppeling.dias?.().huidig ?? 0;
    return { bytes: await koppeling.diaPng(dia, 2), mime };
  }
  throw new Error(`Dit formaat (${ext}) kan de app niet zelf maken.`);
}

/** Opent het afdrukvoorbeeld van de zichtbare editor (afdrukken en PDF). */
export async function drukAf(soort: Soort) {
  const koppeling = editorKoppeling(soort);
  if (!koppeling?.afdrukken)
    throw new Error("Afdrukken is voor dit document nog niet beschikbaar.");
  await koppeling.afdrukken();
}
