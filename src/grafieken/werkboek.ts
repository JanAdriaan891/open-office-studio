/**
 * Minimaal, geldig XLSX-werkboek met de gegevens van een grafiek, om in een
 * DOCX of PPTX in te sluiten (zoals Word en PowerPoint dat doen).
 */
import { strToU8, zipSync } from "fflate";
import { leesGetal, verwijzing, type GrafiekModel } from "./model.ts";
import { ontsnap } from "./xml.ts";
import { kolomLetters } from "./model.ts";

export const INGESLOTEN_BLAD = "Blad1";

/** Het model met verwijzingen naar het ingesloten blad (A1 leeg, reeksen in kolommen). */
export function metIngeslotenVerwijzingen(model: GrafiekModel): GrafiekModel {
  const n = model.categorieen.length;
  return {
    ...model,
    categorieenRef: verwijzing(INGESLOTEN_BLAD, 1, 0, n, 0),
    reeksen: model.reeksen.map((r, i) => ({
      ...r,
      naamRef: verwijzing(INGESLOTEN_BLAD, 0, i + 1),
      waardenRef: verwijzing(INGESLOTEN_BLAD, 1, i + 1, n, i + 1),
    })),
  };
}

export function ingeslotenWerkboek(model: GrafiekModel): Uint8Array {
  const gedeeld: string[] = [];
  const index = new Map<string, number>();
  const s = (t: string) => {
    if (!index.has(t)) {
      index.set(t, gedeeld.length);
      gedeeld.push(t);
    }
    return index.get(t)!;
  };
  const cel = (r: number, c: number, w: string | number | null) => {
    const ref = `${kolomLetters(c)}${r + 1}`;
    if (w === null || w === "") return "";
    if (typeof w === "number") return `<c r="${ref}"><v>${w}</v></c>`;
    return `<c r="${ref}" t="s"><v>${s(w)}</v></c>`;
  };
  const numeriekeCategorie = model.soort === "spreiding";
  const rijen: string[] = [];
  rijen.push(
    `<row r="1">${model.reeksen.map((r, i) => cel(0, i + 1, r.naam)).join("")}</row>`,
  );
  model.categorieen.forEach((c, k) => {
    const cat = numeriekeCategorie ? (leesGetal(c) ?? c) : c;
    rijen.push(
      `<row r="${k + 2}">${cel(k + 1, 0, cat)}${model.reeksen
        .map((r, i) => cel(k + 1, i + 1, r.waarden[k] ?? null))
        .join("")}</row>`,
    );
  });
  const laatste = `${kolomLetters(model.reeksen.length)}${model.categorieen.length + 1}`;
  const blad =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:${laatste}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
    `<cols><col min="1" max="1" width="18" customWidth="1"/></cols>` +
    `<sheetData>${rijen.join("")}</sheetData>` +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  const strings =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${gedeeld.length}" uniqueCount="${gedeeld.length}">` +
    gedeeld.map((t) => `<si><t xml:space="preserve">${ontsnap(t)}</t></si>`).join("") +
    `</sst>`;
  const bestanden: Record<string, string> = {
    "[Content_Types].xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    "_rels/.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${INGESLOTEN_BLAD}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": blad,
    "xl/sharedStrings.xml": strings,
    "xl/styles.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  };
  const z: Record<string, Uint8Array> = {};
  for (const [n, t] of Object.entries(bestanden)) z[n] = strToU8(t);
  return zipSync(z, { level: 6 });
}
