/** PDF uit de afdrukpagina's (browser en desktop, zonder conversieprogramma). */
import type { AfdrukDocument } from "../../afdrukken/model";
import { canvasNaarBlob, opWit } from "../../afdrukken/afdrukframe";
import { schrijfPdf, type PdfBeeld, type PdfPagina } from "./schrijver.ts";

export type PdfKwaliteit = "klein" | "standaard" | "hoog";

export const KWALITEITEN: Record<
  PdfKwaliteit,
  { naam: string; dpi: number; jpeg: number | null }
> = {
  klein: { naam: "Klein bestand (150 dpi)", dpi: 150, jpeg: 0.8 },
  standaard: { naam: "Standaard (200 dpi)", dpi: 200, jpeg: 0.92 },
  hoog: { naam: "Hoog, verliesvrij (300 dpi)", dpi: 300, jpeg: null },
};

export interface PdfOpties {
  /** 0-gebaseerde pagina's; standaard alle. */
  indexen?: number[];
  kwaliteit?: PdfKwaliteit;
  auteur?: string;
  onderwerp?: string;
  trefwoorden?: string;
  voortgang?: (klaar: number, totaal: number) => void;
}

async function beeldVan(
  canvas: HTMLCanvasElement,
  jpeg: number | null,
): Promise<PdfBeeld> {
  const wit = opWit(canvas);
  if (jpeg !== null) {
    const blob = await canvasNaarBlob(wit, "image/jpeg", jpeg);
    return {
      soort: "jpeg",
      breedte: wit.width,
      hoogte: wit.height,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    };
  }
  const data = wit.getContext("2d")!.getImageData(0, 0, wit.width, wit.height).data;
  const rgb = new Uint8Array(wit.width * wit.height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return { soort: "rgb", breedte: wit.width, hoogte: wit.height, bytes: rgb };
}

export async function maakPdf(
  doc: AfdrukDocument,
  opties: PdfOpties = {},
): Promise<Uint8Array> {
  const indexen = opties.indexen ?? doc.paginas.map((_, i) => i);
  if (!indexen.length) throw new Error("Er zijn geen pagina's gekozen.");
  const kwaliteit = KWALITEITEN[opties.kwaliteit ?? "standaard"];
  const paginas: PdfPagina[] = [];
  for (let n = 0; n < indexen.length; n++) {
    const pagina = doc.paginas[indexen[n]];
    const tekening = await pagina.teken(kwaliteit.dpi);
    paginas.push({
      breedte: pagina.breedte,
      hoogte: pagina.hoogte,
      beeld: await beeldVan(tekening.canvas, kwaliteit.jpeg),
      tekst: tekening.tekst,
      koppelingen: tekening.koppelingen,
    });
    opties.voortgang?.(n + 1, indexen.length);
  }
  const positie = new Map(indexen.map((index, n) => [index, n]));
  const bladwijzers = (doc.bladwijzers ?? [])
    .filter((b) => positie.has(b.pagina))
    .map((b) => ({ titel: b.titel, pagina: positie.get(b.pagina)!, y: b.y }));
  return schrijfPdf({
    titel: doc.titel,
    auteur: opties.auteur,
    onderwerp: opties.onderwerp,
    trefwoorden: opties.trefwoorden,
    paginas,
    bladwijzers,
  });
}
