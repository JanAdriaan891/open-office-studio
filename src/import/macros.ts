/**
 * Macro’s in DOCM, XLSM en PPTM behouden zonder ze uit te voeren.
 *
 * Bij openen haalt de app het VBA-project (vbaProject.bin, met vbaData.xml,
 * de digitale handtekening en hun relaties) byte-voor-byte uit het pakket en
 * geeft de editor een gewoon DOCX/XLSX/PPTX. Bij opslaan in hetzelfde soort
 * macroformaat gaan precies die onderdelen terug, met hun relatie en
 * inhoudstype. De bytes van het VBA-project en de handtekening veranderen
 * dus nooit; de handtekening blijft geldig zolang het project ongewijzigd
 * is. Uitvoeren gebeurt nergens.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Soort } from "../editors";

export interface MacroOnderdelen {
  /** Extensie van het origineel, bijv. "docm". */
  bronformaat: string;
  /** Pad van het hoofdonderdeel, bijv. "word/document.xml". */
  hoofdpad: string;
  /** Oorspronkelijk inhoudstype van het hoofdonderdeel. */
  hoofdtype: string;
  /** VBA-onderdelen met hun exacte bytes (inclusief eigen .rels). */
  delen: Record<string, Uint8Array>;
  /** Relaties uit de .rels van het hoofdonderdeel die naar die onderdelen wijzen. */
  relaties: { id: string; type: string; doel: string }[];
  /** Inhoudstypen (Override) van die onderdelen. */
  typen: Record<string, string>;
  /** Modulenamen, voor het rapport (als het project leesbaar is). */
  modules: string[];
  ondertekend: boolean;
  /** Er zit echt een VBA-project in (anders alleen het macro-inhoudstype). */
  heeftVba: boolean;
}

/** Macro-ingeschakelde invoerformaten. */
export const MACRO_INVOER = new Set([
  "docm",
  "dotm",
  "xlsm",
  "xltm",
  "pptm",
  "potm",
  "ppsm",
]);

const HOOFD: Record<Soort, string> = {
  docx: "word/document.xml",
  xlsx: "xl/workbook.xml",
  pptx: "ppt/presentation.xml",
};

/** Gewone (macrovrije) inhoudstypen van het hoofdonderdeel. */
const GEWOON: Record<Soort, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
};

/** Macro-inhoudstypen per doelformaat. */
const MACROTYPE: Record<string, string> = {
  docm: "application/vnd.ms-word.document.macroEnabled.main+xml",
  dotm: "application/vnd.ms-word.template.macroEnabledTemplate.main+xml",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
  xltm: "application/vnd.ms-excel.template.macroEnabled.main+xml",
  pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml",
  potm: "application/vnd.ms-powerpoint.template.macroEnabled.main+xml",
  ppsm: "application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml",
};

/** Macroformaat waarin de app het VBA-project terugzet, per module. */
export const MACROFORMAAT: Record<Soort, string> = {
  docx: "docm",
  xlsx: "xlsm",
  pptx: "pptm",
};

const VBA_TYPE =
  /^application\/vnd\.ms-(office\.vbaProject|word\.vbaData\+xml|office\.vbaProjectSignature)/i;
const VBA_REL =
  /\/relationships\/(vbaProject|wordVbaData|vbaProjectSignature)/i;

function relsPad(pad: string) {
  const i = pad.lastIndexOf("/");
  return `${pad.slice(0, i + 1)}_rels/${pad.slice(i + 1)}.rels`;
}

function oplossen(basis: string, doel: string) {
  if (doel.startsWith("/")) return doel.slice(1);
  const delen = basis.split("/").slice(0, -1);
  for (const stuk of doel.split("/")) {
    if (stuk === "..") delen.pop();
    else if (stuk !== ".") delen.push(stuk);
  }
  return delen.join("/");
}

function attr(element: string, naam: string) {
  return new RegExp(`\\b${naam}="([^"]*)"`).exec(element)?.[1];
}

/** Modulenamen uit vbaProject.bin (alleen lezen, niets uitvoeren). */
async function moduleNamen(bin: Uint8Array) {
  try {
    const { leesCfb } = await import("../../packages/database/src/cfb");
    const { leesVbaDir } = await import("../../packages/database/src/ovba");
    const dir = leesCfb(bin).find((i) => /(^|\/)VBA\/dir$/i.test(i.pad))?.data;
    return dir ? leesVbaDir(dir).modules.map((m) => m.naam) : [];
  } catch {
    return [];
  }
}

/**
 * Haalt het VBA-project uit een macrobestand. Zonder VBA-project blijven
 * alleen het oorspronkelijke inhoudstype en het formaat bewaard.
 */
export async function scheidMacros(
  bytes: Uint8Array,
  soort: Soort,
  bronformaat: string,
): Promise<{ bytes: Uint8Array; macros: MacroOnderdelen }> {
  const pakket = unzipSync(bytes);
  const hoofdpad = HOOFD[soort];
  const typenXml = strFromU8(pakket["[Content_Types].xml"] ?? new Uint8Array());
  const hoofdOverride = new RegExp(
    `<Override\\b[^>]*PartName="/${hoofdpad.replace(/[.]/g, "\\.")}"[^>]*/?>`,
  ).exec(typenXml)?.[0];
  const hoofdtype = hoofdOverride
    ? (attr(hoofdOverride, "ContentType") ?? GEWOON[soort])
    : GEWOON[soort];

  // VBA-onderdelen: via de relaties van het hoofdonderdeel en hun eigen relaties.
  const hoofdRels = relsPad(hoofdpad);
  const relsXml = pakket[hoofdRels] ? strFromU8(pakket[hoofdRels]) : "";
  const relaties: MacroOnderdelen["relaties"] = [];
  const delen: Record<string, Uint8Array> = {};
  const verzamel = (pad: string) => {
    if (!pakket[pad] || delen[pad]) return;
    delen[pad] = pakket[pad];
    const eigenRels = relsPad(pad);
    if (pakket[eigenRels]) {
      delen[eigenRels] = pakket[eigenRels];
      for (const [el] of strFromU8(pakket[eigenRels]).matchAll(
        /<Relationship\b[^>]*>/g,
      )) {
        const doel = attr(el, "Target");
        if (doel && attr(el, "TargetMode") !== "External")
          verzamel(oplossen(pad, doel));
      }
    }
  };
  for (const [el] of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const type = attr(el, "Type") ?? "";
    const doel = attr(el, "Target") ?? "";
    if (!VBA_REL.test(type)) continue;
    relaties.push({ id: attr(el, "Id") ?? "", type, doel });
    verzamel(oplossen(hoofdpad, doel));
  }
  // Losse VBA-onderdelen die alleen via een inhoudstype te vinden zijn.
  for (const [el] of typenXml.matchAll(/<Override\b[^>]*>/g)) {
    const pad = (attr(el, "PartName") ?? "").replace(/^\//, "");
    if (VBA_TYPE.test(attr(el, "ContentType") ?? "") && pakket[pad])
      verzamel(pad);
  }
  const typen: Record<string, string> = {};
  for (const pad of Object.keys(delen)) {
    if (pad.endsWith(".rels")) continue;
    const override = new RegExp(
      `<Override\\b[^>]*PartName="/${pad.replace(/[.]/g, "\\.")}"[^>]*/?>`,
    ).exec(typenXml)?.[0];
    const ext = pad.split(".").pop()!.toLowerCase();
    const standaard = new RegExp(
      `<Default\\b[^>]*Extension="${ext}"[^>]*/?>`,
      "i",
    ).exec(typenXml)?.[0];
    const type = attr(override ?? standaard ?? "", "ContentType");
    if (type) typen[pad] = type;
  }

  // Het pakket voor de editor: zonder VBA en met het gewone inhoudstype.
  let nieuweTypen = hoofdOverride
    ? typenXml.replace(
        hoofdOverride,
        hoofdOverride.replace(
          /ContentType="[^"]*"/,
          `ContentType="${GEWOON[soort]}"`,
        ),
      )
    : typenXml;
  for (const pad of Object.keys(delen))
    nieuweTypen = nieuweTypen.replace(
      new RegExp(
        `<Override\\b[^>]*PartName="/${pad.replace(/[.]/g, "\\.")}"[^>]*/>`,
      ),
      "",
    );
  const uit: Record<string, Uint8Array> = {};
  for (const [pad, data] of Object.entries(pakket)) {
    if (delen[pad]) continue;
    if (pad === "[Content_Types].xml") uit[pad] = strToU8(nieuweTypen);
    else if (pad === hoofdRels)
      uit[pad] = strToU8(
        relsXml.replace(/<Relationship\b[^>]*>/g, (el) =>
          VBA_REL.test(attr(el, "Type") ?? "") ? "" : el,
        ),
      );
    else uit[pad] = data;
  }
  const bin = Object.entries(delen).find(([p]) =>
    /vbaProject\.bin$/i.test(p),
  )?.[1];
  const macros: MacroOnderdelen = {
    bronformaat,
    hoofdpad,
    hoofdtype,
    delen,
    relaties,
    typen,
    modules: bin ? await moduleNamen(bin) : [],
    ondertekend: Object.keys(delen).some((p) => /vbaProjectSignature/i.test(p)),
    heeftVba: !!bin,
  };
  return { bytes: zipSync(volgorde(uit), { level: 6 }), macros };
}

/** [Content_Types].xml en _rels/.rels vooraan, zoals Office ze schrijft. */
function volgorde(delen: Record<string, Uint8Array>) {
  const uit: Record<string, Uint8Array> = {};
  for (const voor of ["[Content_Types].xml", "_rels/.rels"])
    if (delen[voor]) uit[voor] = delen[voor];
  for (const [pad, data] of Object.entries(delen))
    if (!(pad in uit)) uit[pad] = data;
  return uit;
}

/**
 * Zet het VBA-project terug in een door de editor geschreven pakket, voor
 * opslaan als `doelformaat` (docm, xlsm, pptm, …). De VBA-bytes blijven
 * identiek aan het origineel.
 */
export function voegMacrosToe(
  bytes: Uint8Array,
  macros: MacroOnderdelen,
  doelformaat: string,
): Uint8Array {
  const pakket = unzipSync(bytes);
  const hoofdpad = macros.hoofdpad;
  const doeltype =
    doelformaat === macros.bronformaat
      ? macros.hoofdtype
      : (MACROTYPE[doelformaat] ?? macros.hoofdtype);
  // Inhoudstypen: hoofdonderdeel als macrodocument, VBA-onderdelen erbij.
  let typen = strFromU8(pakket["[Content_Types].xml"]);
  const hoofdPatroon = new RegExp(
    `<Override\\b[^>]*PartName="/${hoofdpad.replace(/[.]/g, "\\.")}"[^>]*/>`,
  );
  const hoofd = hoofdPatroon.exec(typen)?.[0];
  if (hoofd)
    typen = typen.replace(
      hoofd,
      hoofd.replace(/ContentType="[^"]*"/, `ContentType="${doeltype}"`),
    );
  else
    typen = typen.replace(
      "</Types>",
      `<Override PartName="/${hoofdpad}" ContentType="${doeltype}"/></Types>`,
    );
  for (const [pad, type] of Object.entries(macros.typen)) {
    typen = typen.replace(
      new RegExp(
        `<Override\\b[^>]*PartName="/${pad.replace(/[.]/g, "\\.")}"[^>]*/>`,
      ),
      "",
    );
    typen = typen.replace(
      "</Types>",
      `<Override PartName="/${pad}" ContentType="${type}"/></Types>`,
    );
  }
  pakket["[Content_Types].xml"] = strToU8(typen);
  // Relaties van het hoofdonderdeel, met unieke Id’s.
  const relsPadHoofd = relsPad(hoofdpad);
  let rels = pakket[relsPadHoofd]
    ? strFromU8(pakket[relsPadHoofd])
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  rels = rels.replace(/<Relationship\b[^>]*>/g, (el) =>
    VBA_REL.test(attr(el, "Type") ?? "") ? "" : el,
  );
  const bezet = new Set([...rels.matchAll(/\bId="([^"]*)"/g)].map((m) => m[1]));
  for (const rel of macros.relaties) {
    let id = rel.id || "rIdVba";
    for (let n = 1; bezet.has(id); n++) id = `rIdVba${n}`;
    bezet.add(id);
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="${id}" Type="${rel.type}" Target="${rel.doel}"/></Relationships>`,
    );
  }
  pakket[relsPadHoofd] = strToU8(rels);
  const uit: Record<string, Uint8Array> = { ...pakket };
  for (const [pad, data] of Object.entries(macros.delen)) uit[pad] = data;
  return zipSync(volgorde(uit), { level: 6 });
}

/** Is dit een macroformaat dat bij deze module hoort? */
export function isMacroformaatVan(ext: string, soort: Soort) {
  return ext === MACROFORMAAT[soort];
}
