/**
 * Schrijft het eigen tekstmodel als een klein, geldig DOCX-pakket (A4,
 * Nederlandse taal, stijlen Kop 1–6, lijsten, tabellen, koppelingen en
 * afbeeldingen). Geen runtime nodig; het resultaat opent in de teksteditor.
 */
import { strToU8, zipSync } from "fflate";
import {
  afbeeldingsmaat,
  type Blok,
  type Inline,
  type Tekstdocument,
  type Uitlijning,
} from "./tekstmodel";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function xmlTekst(tekst: string) {
  return tekst
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const UITLIJNING: Record<Uitlijning, string> = {
  links: "left",
  midden: "center",
  rechts: "right",
  uitvullen: "both",
};

/** Bruikbare tekstbreedte op A4 met 2,5 cm marges, in EMU. */
const TEKSTBREEDTE_EMU = Math.round(((11906 - 2 * 1418) / 1440) * 914400);

class Schrijver {
  relaties: string[] = [];
  media: Record<string, Uint8Array> = {};
  mediatypen = new Set<string>();
  nummeringen: { geordend: boolean; start: number }[] = [];
  private volgendRel = 10;
  private volgendeAfbeelding = 1;
  private koppelingen = new Map<string, string>();

  rel(type: string, doel: string, extern = false) {
    const id = `rId${this.volgendRel++}`;
    this.relaties.push(
      `<Relationship Id="${id}" Type="${REL}/${type}" Target="${xmlTekst(doel)}"${extern ? ' TargetMode="External"' : ""}/>`,
    );
    return id;
  }

  koppeling(url: string) {
    let id = this.koppelingen.get(url);
    if (!id) {
      id = this.rel("hyperlink", url, true);
      this.koppelingen.set(url, id);
    }
    return id;
  }

  run(inline: Inline): string {
    if (inline.soort === "regeleinde") return "<w:r><w:br/></w:r>";
    if (inline.soort === "tab") return "<w:r><w:tab/></w:r>";
    if (inline.soort === "afbeelding") return this.afbeelding(inline);
    const eigenschappen: string[] = [];
    if (inline.code) eigenschappen.push('<w:rStyle w:val="CodeTeken"/>');
    else if (inline.link) eigenschappen.push('<w:rStyle w:val="Hyperlink"/>');
    if (inline.lettertype)
      eigenschappen.push(
        `<w:rFonts w:ascii="${xmlTekst(inline.lettertype)}" w:hAnsi="${xmlTekst(inline.lettertype)}" w:cs="${xmlTekst(inline.lettertype)}"/>`,
      );
    if (inline.vet) eigenschappen.push("<w:b/><w:bCs/>");
    if (inline.cursief) eigenschappen.push("<w:i/><w:iCs/>");
    if (inline.doorgehaald) eigenschappen.push("<w:strike/>");
    if (inline.kleur && /^[0-9A-Fa-f]{6}$/.test(inline.kleur))
      eigenschappen.push(`<w:color w:val="${inline.kleur.toUpperCase()}"/>`);
    if (inline.grootte && inline.grootte >= 1 && inline.grootte <= 1638)
      eigenschappen.push(
        `<w:sz w:val="${Math.round(inline.grootte * 2)}"/><w:szCs w:val="${Math.round(inline.grootte * 2)}"/>`,
      );
    if (inline.onderstreept) eigenschappen.push('<w:u w:val="single"/>');
    if (inline.superschrift)
      eigenschappen.push('<w:vertAlign w:val="superscript"/>');
    else if (inline.subschrift)
      eigenschappen.push('<w:vertAlign w:val="subscript"/>');
    const rPr = eigenschappen.length
      ? `<w:rPr>${eigenschappen.join("")}</w:rPr>`
      : "";
    // Tabs en regeleinden in tekst worden echte tabs en regeleinden.
    const delen = inline.tekst.split(/(\t|\r\n|\n|\r)/);
    const inhoud = delen
      .map((deel) =>
        deel === "\t"
          ? "<w:tab/>"
          : /^(\r\n|\n|\r)$/.test(deel)
            ? "<w:br/>"
            : deel
              ? `<w:t xml:space="preserve">${xmlTekst(deel)}</w:t>`
              : "",
      )
      .join("");
    if (!inhoud) return "";
    const run = `<w:r>${rPr}${inhoud}</w:r>`;
    return inline.link
      ? `<w:hyperlink r:id="${this.koppeling(inline.link)}" w:history="1">${run}</w:hyperlink>`
      : run;
  }

  afbeelding(inline: Extract<Inline, { soort: "afbeelding" }>) {
    const nummer = this.volgendeAfbeelding++;
    const ext = inline.type === "jpeg" ? "jpeg" : inline.type;
    const naam = `image${nummer}.${ext}`;
    this.media[`word/media/${naam}`] = inline.data;
    this.mediatypen.add(ext);
    const id = this.rel("image", `media/${naam}`);
    const maat = afbeeldingsmaat(inline.data);
    let breedte = inline.breedte ?? maat?.breedte ?? 320;
    let hoogte =
      inline.hoogte ??
      (maat && inline.breedte
        ? (maat.hoogte * inline.breedte) / maat.breedte
        : maat?.hoogte) ??
      240;
    let cx = Math.round(breedte * 9525);
    let cy = Math.round(hoogte * 9525);
    if (cx > TEKSTBREEDTE_EMU) {
      cy = Math.round((cy * TEKSTBREEDTE_EMU) / cx);
      cx = TEKSTBREEDTE_EMU;
    }
    breedte = cx;
    hoogte = cy;
    const alt = xmlTekst(inline.alt ?? "");
    return (
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${breedte}" cy="${hoogte}"/><wp:docPr id="${nummer}" name="Afbeelding ${nummer}" descr="${alt}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic><pic:nvPicPr><pic:cNvPr id="${nummer}" name="${naam}" descr="${alt}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${breedte}" cy="${hoogte}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    );
  }

  alinea(inhoud: Inline[], pPr: string[] = []) {
    const eigenschappen = pPr.length ? `<w:pPr>${pPr.join("")}</w:pPr>` : "";
    return `<w:p>${eigenschappen}${inhoud.map((i) => this.run(i)).join("")}</w:p>`;
  }

  blokken(
    blokken: Blok[],
    context: { stijl?: string; inspringing?: number } = {},
  ): string {
    return blokken.map((blok) => this.blok(blok, context)).join("");
  }

  private stijl(
    context: { stijl?: string; inspringing?: number },
    eigen?: string,
  ) {
    const pPr: string[] = [];
    const stijl = eigen ?? context.stijl;
    if (stijl) pPr.push(`<w:pStyle w:val="${stijl}"/>`);
    if (context.inspringing)
      pPr.push(`<w:ind w:left="${context.inspringing}"/>`);
    return pPr;
  }

  blok(
    blok: Blok,
    context: { stijl?: string; inspringing?: number },
    lijstniveau = 0,
  ): string {
    switch (blok.soort) {
      case "alinea": {
        const pPr = this.stijl(context);
        if (blok.uitlijning && blok.uitlijning !== "links")
          pPr.push(`<w:jc w:val="${UITLIJNING[blok.uitlijning]}"/>`);
        return this.alinea(blok.inhoud, pPr);
      }
      case "kop":
        return this.alinea(blok.inhoud, [
          `<w:pStyle w:val="Kop${blok.niveau}"/>`,
        ]);
      case "code":
        return blok.tekst
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .map((regel) =>
            this.alinea(
              regel ? [{ soort: "tekst", tekst: regel }] : [],
              this.stijl(context, "Code"),
            ),
          )
          .join("");
      case "citaat":
        return this.blokken(blok.blokken, { ...context, stijl: "Citaat" });
      case "lijn":
        return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="A0A0A0"/></w:pBdr></w:pPr></w:p>';
      case "pagina-einde":
        return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      case "lijst":
        return this.lijst(blok, context, lijstniveau);
      case "tabel":
        return this.tabel(blok);
    }
  }

  lijst(
    blok: Extract<Blok, { soort: "lijst" }>,
    context: { stijl?: string; inspringing?: number },
    niveau: number,
  ): string {
    this.nummeringen.push({ geordend: blok.geordend, start: blok.start ?? 1 });
    const numId = this.nummeringen.length;
    const ilvl = Math.min(niveau, 8);
    let uit = "";
    for (const item of blok.items) {
      let eerste = true;
      for (const deel of item) {
        if (deel.soort === "lijst") {
          uit += this.lijst(deel, context, niveau + 1);
          continue;
        }
        if (eerste && (deel.soort === "alinea" || deel.soort === "kop")) {
          uit += this.alinea(deel.inhoud, [
            '<w:pStyle w:val="Lijstalinea"/>',
            `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`,
          ]);
        } else if (deel.soort === "alinea") {
          uit += this.alinea(deel.inhoud, [
            '<w:pStyle w:val="Lijstalinea"/>',
            `<w:ind w:left="${720 * (ilvl + 1)}"/>`,
          ]);
        } else {
          uit += this.blok(deel, { ...context, inspringing: 720 * (ilvl + 1) });
        }
        eerste = false;
      }
      if (eerste)
        uit += this.alinea(
          [],
          [
            '<w:pStyle w:val="Lijstalinea"/>',
            `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`,
          ],
        );
    }
    return uit;
  }

  tabel(blok: Extract<Blok, { soort: "tabel" }>) {
    const kolommen = Math.max(1, ...blok.rijen.map((r) => r.length));
    const breedte = Math.floor((11906 - 2 * 1418) / kolommen);
    const raster = `<w:tblGrid>${Array.from(
      { length: kolommen },
      () => `<w:gridCol w:w="${breedte}"/>`,
    ).join("")}</w:tblGrid>`;
    const rijen = blok.rijen
      .map((rij, index) => {
        const kop = blok.kop && index === 0;
        const cellen = Array.from({ length: kolommen }, (_, k) => {
          const inhoud = rij[k] ?? [];
          let xml = this.blokken(kop ? inhoud.map(vetBlok) : inhoud);
          // Een cel moet met een alinea eindigen.
          if (!xml.endsWith("</w:p>")) xml += "<w:p/>";
          return `<w:tc><w:tcPr><w:tcW w:w="${breedte}" w:type="dxa"/></w:tcPr>${xml}</w:tc>`;
        }).join("");
        return `<w:tr>${kop ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cellen}</w:tr>`;
      })
      .join("");
    return (
      `<w:tbl><w:tblPr><w:tblStyle w:val="Tabelraster"/><w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
      raster +
      rijen +
      "</w:tbl><w:p/>"
    );
  }
}

/** Maakt alle tekst in een blok vet (kopregel van een tabel). */
function vetBlok(blok: Blok): Blok {
  const vet = (inhoud: Inline[]) =>
    inhoud.map((i) => (i.soort === "tekst" ? { ...i, vet: true } : i));
  if (blok.soort === "alinea" || blok.soort === "kop")
    return { ...blok, inhoud: vet(blok.inhoud) };
  return blok;
}

const KOPGROOTTE = [0, 16, 13, 12, 11, 11, 11];

function stijlen() {
  const kop = (n: number) =>
    `<w:style w:type="paragraph" w:styleId="Kop${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Standaard"/><w:next w:val="Standaard"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${n === 1 ? 360 : 240}" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:bCs/>${n >= 4 ? "<w:i/>" : ""}<w:color w:val="1F3864"/><w:sz w:val="${KOPGROOTTE[n] * 2}"/><w:szCs w:val="${KOPGROOTTE[n] * 2}"/></w:rPr></w:style>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="${W}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="nl-NL" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Standaard"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    `<w:style w:type="character" w:default="1" w:styleId="Standaardalinea-lettertype"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>` +
    `<w:style w:type="table" w:default="1" w:styleId="Standaardtabel"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    `<w:style w:type="numbering" w:default="1" w:styleId="Geenlijst"><w:name w:val="No List"/><w:semiHidden/></w:style>` +
    [1, 2, 3, 4, 5, 6].map(kop).join("") +
    `<w:style w:type="paragraph" w:styleId="Titel"><w:name w:val="Title"/><w:basedOn w:val="Standaard"/><w:next w:val="Standaard"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Lijstalinea"><w:name w:val="List Paragraph"/><w:basedOn w:val="Standaard"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Citaat"><w:name w:val="Quote"/><w:basedOn w:val="Standaard"/><w:next w:val="Standaard"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="BFBFBF"/></w:pBdr><w:ind w:left="567"/></w:pPr><w:rPr><w:i/><w:color w:val="404040"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Standaard"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="CodeTeken"><w:name w:val="Code Char"/><w:basedOn w:val="Standaardalinea-lettertype"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="Standaardalinea-lettertype"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>` +
    `<w:style w:type="table" w:styleId="Tabelraster"><w:name w:val="Table Grid"/><w:basedOn w:val="Standaardtabel"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map(
        (k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`,
      )
      .join("") +
    `</w:tblBorders></w:tblPr></w:style></w:styles>`
  );
}

function nummering(lijsten: { geordend: boolean; start: number }[]) {
  const abstract = (id: number, geordend: boolean) =>
    `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>` +
    Array.from({ length: 9 }, (_, n) => {
      const opmaak = geordend
        ? ["decimal", "lowerLetter", "lowerRoman"][n % 3]
        : "bullet";
      const tekst = geordend ? `%${n + 1}.` : ["•", "◦", "▪"][n % 3];
      return (
        `<w:lvl w:ilvl="${n}"><w:start w:val="1"/><w:numFmt w:val="${opmaak}"/><w:lvlText w:val="${tekst}"/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${720 * (n + 1)}" w:hanging="360"/></w:pPr>` +
        (geordend
          ? ""
          : '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>') +
        "</w:lvl>"
      );
    }).join("") +
    "</w:abstractNum>";
  const nums = lijsten
    .map(
      (lijst, index) =>
        `<w:num w:numId="${index + 1}"><w:abstractNumId w:val="${lijst.geordend ? 1 : 0}"/>` +
        (lijst.geordend
          ? `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${Math.max(0, Math.floor(lijst.start))}"/></w:lvlOverride>`
          : "") +
        "</w:num>",
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="${W}">${abstract(0, false)}${abstract(1, true)}${nums}</w:numbering>`;
}

/** Zet het tekstmodel om naar DOCX-bytes. */
export function schrijfDocx(document: Tekstdocument): Uint8Array {
  const schrijver = new Schrijver();
  let lichaam = schrijver.blokken(document.blokken);
  if (!lichaam) lichaam = "<w:p/>";
  const sectie =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>';
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W}" xmlns:r="${R}" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<w:body>${lichaam}${sectie}</w:body></w:document>`;
  const relaties =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/>` +
    `<Relationship Id="rId3" Type="${REL}/settings" Target="settings.xml"/>` +
    schrijver.relaties.join("") +
    "</Relationships>";
  const mime: Record<string, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    gif: "image/gif",
  };
  const typen =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    [...schrijver.mediatypen]
      .map((ext) => `<Default Extension="${ext}" ContentType="${mime[ext]}"/>`)
      .join("") +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
    `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    "</Types>";
  const titel = document.titel
    ? `<dc:title>${xmlTekst(document.titel)}</dc:title>`
    : "";
  const kern =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `${titel}<dc:language>nl-NL</dc:language></cp:coreProperties>`;
  return zipSync(
    {
      "[Content_Types].xml": strToU8(typen),
      "_rels/.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
          "</Relationships>",
      ),
      "docProps/core.xml": strToU8(kern),
      "word/document.xml": strToU8(documentXml),
      "word/styles.xml": strToU8(stijlen()),
      "word/numbering.xml": strToU8(nummering(schrijver.nummeringen)),
      "word/settings.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`,
      ),
      "word/_rels/document.xml.rels": strToU8(relaties),
      ...schrijver.media,
    },
    { level: 6 },
  );
}
