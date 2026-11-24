/**
 * Sjabloon ↔ document (#27). Een OOXML-sjabloon (DOTX, XLTX, POTX) is
 * hetzelfde pakket als een document, alleen met een ander inhoudstype van
 * het hoofdonderdeel. Openen zet dat om naar het documenttype (de editor
 * opent het als naamloos nieuw document); opslaan als sjabloon andersom.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Soort } from "../editors";

export const SJABLOONFORMAAT: Record<Soort, string> = { docx: "dotx", xlsx: "xltx", pptx: "potx" };

/** Sjabloonextensies die de app zelf opent (zonder kantoorruntime). */
export const SJABLOON_INVOER = new Set(["dotx", "xltx", "potx"]);

const HOOFD: Record<Soort, string> = {
  docx: "word/document.xml",
  xlsx: "xl/workbook.xml",
  pptx: "ppt/presentation.xml",
};

const DOCUMENTTYPE: Record<Soort, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
};

const SJABLOONTYPE: Record<Soort, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml",
};

/** Zet het inhoudstype van het hoofdonderdeel; de overige onderdelen blijven byte-gelijk. */
function zetHoofdtype(bytes: Uint8Array, soort: Soort, type: string) {
  const pakket = unzipSync(bytes);
  const typen = pakket["[Content_Types].xml"];
  if (!typen || !pakket[HOOFD[soort]]) throw new Error("Geen geldig Office-pakket.");
  const xml = strFromU8(typen);
  const pad = `/${HOOFD[soort]}`.replace(/[.]/g, "\\.");
  const override = new RegExp(`<Override\\b[^>]*PartName="${pad}"[^>]*/>`).exec(xml)?.[0];
  const nieuw = override
    ? xml.replace(override, override.replace(/ContentType="[^"]*"/, `ContentType="${type}"`))
    : xml.replace("</Types>", `<Override PartName="/${HOOFD[soort]}" ContentType="${type}"/></Types>`);
  if (nieuw === xml) return bytes;
  // [Content_Types].xml vooraan, zoals Office het schrijft.
  const uit: Record<string, Uint8Array> = { "[Content_Types].xml": strToU8(nieuw) };
  for (const [naam, data] of Object.entries(pakket)) if (naam !== "[Content_Types].xml") uit[naam] = data;
  return zipSync(uit, { level: 6 });
}

/** Sjabloon (of document) → document voor de editor. */
export const alsDocument = (bytes: Uint8Array, soort: Soort) => zetHoofdtype(bytes, soort, DOCUMENTTYPE[soort]);

/** Document → sjabloon (DOTX, XLTX, POTX). */
export const alsSjabloon = (bytes: Uint8Array, soort: Soort) => zetHoofdtype(bytes, soort, SJABLOONTYPE[soort]);

/** Is dit pakket een sjabloon? */
export function isSjabloon(bytes: Uint8Array, soort: Soort) {
  try {
    const typen = unzipSync(bytes, { filter: (f) => f.name === "[Content_Types].xml" })["[Content_Types].xml"];
    return !!typen && strFromU8(typen).includes(SJABLOONTYPE[soort]);
  } catch {
    return false;
  }
}
