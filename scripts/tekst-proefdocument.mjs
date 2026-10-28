// Proefdocument voor de Word-functies van Open Tekst Studio (tabel, afbeelding,
// zoeken, wijzigingen): een DOCX op basis van public/templates/nieuw.docx met
// koppen, een tabel, een PNG-afbeelding en bijgehouden wijzigingen van twee
// auteurs. Gebruikt door scripts/test-tekst-word.mjs en de browserproef.
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** Een effen PNG van `breedte`×`hoogte` pixels (RGB). */
export function maakPng(breedte = 40, hoogte = 20, kleur = [200, 60, 30]) {
  const crcTabel = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTabel[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const blok = (soort, data) => {
    const lengte = Buffer.alloc(4);
    lengte.writeUInt32BE(data.length);
    const inhoud = Buffer.concat([Buffer.from(soort, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(inhoud));
    return Buffer.concat([lengte, inhoud, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breedte, 0);
  ihdr.writeUInt32BE(hoogte, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rijen = [];
  for (let y = 0; y < hoogte; y++) {
    rijen.push(0);
    for (let x = 0; x < breedte; x++) rijen.push(...kleur);
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      blok("IHDR", ihdr),
      blok("IDAT", deflateSync(Buffer.from(rijen))),
      blok("IEND", Buffer.alloc(0)),
    ]),
  );
}

const run = (tekst, rpr = "") =>
  `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${tekst}</w:t></w:r>`;
const alinea = (inhoud, ppr = "", id = "") =>
  `<w:p${id ? ` w14:paraId="${id}"` : ""}>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${inhoud}</w:p>`;
const kop = (tekst, niveau, id) => alinea(run(tekst), `<w:pStyle w:val="Heading${niveau}"/>`, id);

function tabel(rijen) {
  const kolommen = rijen[0].length;
  const grid = Array.from({ length: kolommen }, () => `<w:gridCol w:w="2000"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rijen
    .map(
      (rij) =>
        `<w:tr>${rij
          .map((cel) => `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>${alinea(run(cel))}</w:tc>`)
          .join("")}</w:tr>`,
    )
    .join("")}</w:tbl>`;
}

function afbeelding(rId, cx = 1524000, cy = 762000) {
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Proefafbeelding" descr="Oude beschrijving"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="Proefafbeelding"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/**
 * Bouwt het proefdocument. Opties: `tabel` (rijen met celteksten), `wijzigingen`
 * (bijgehouden invoeging/verwijdering), `afbeelding`, `tekst` (extra alinea's).
 */
export function maakProefdocument({
  tabelRijen = [
    ["Naam", "Plaats", "Aantal"],
    ["Bakker", "Delft", "12"],
    ["Aalders", "Utrecht", "3"],
  ],
  wijzigingen = true,
  metAfbeelding = true,
  alineas = ["De kat zit op de mat.", "Een tweede regel met KAT in hoofdletters."],
} = {}) {
  const bestanden = unzipSync(readFileSync(new URL("../public/templates/nieuw.docx", import.meta.url)));
  const document = strFromU8(bestanden["word/document.xml"]);
  const kopTag = document.slice(0, document.indexOf("<w:body>") + "<w:body>".length);
  const sectPr = document.slice(document.indexOf("<w:sectPr"), document.indexOf("</w:body>"));
  const delen = [
    kop("Inleiding", 1, "10000001"),
    ...alineas.map((t, i) => alinea(run(t), "", `1000001${i}`)),
    kop("Tabel", 2, "10000020"),
    tabel(tabelRijen),
    alinea(run("Na de tabel."), "", "10000021"),
  ];
  if (metAfbeelding) delen.push(kop("Afbeelding", 2, "10000030"), alinea(afbeelding("rIdProefPng"), "", "10000031"));
  if (wijzigingen)
    delen.push(
      kop("Wijzigingen", 2, "10000040"),
      alinea(
        run("Begin ") +
          `<w:ins w:id="901" w:author="Anna" w:date="2026-10-01T10:00:00Z">${run("ingevoegd ")}</w:ins>` +
          run("midden ") +
          `<w:del w:id="902" w:author="Bram" w:date="2026-10-02T10:00:00Z"><w:r><w:delText xml:space="preserve">weg </w:delText></w:r></w:del>` +
          run("einde."),
        "",
        "10000041",
      ),
    );
  const nieuwDocument = kopTag + delen.join("") + sectPr + "</w:body></w:document>";
  bestanden["word/document.xml"] = strToU8(nieuwDocument);
  if (metAfbeelding) {
    bestanden["word/media/proef.png"] = maakPng();
    const rels = strFromU8(bestanden["word/_rels/document.xml.rels"]);
    bestanden["word/_rels/document.xml.rels"] = strToU8(
      rels.replace(
        "</Relationships>",
        `<Relationship Id="rIdProefPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/proef.png"/></Relationships>`,
      ),
    );
    const ct = strFromU8(bestanden["[Content_Types].xml"]);
    if (!/Extension="png"/i.test(ct))
      bestanden["[Content_Types].xml"] = strToU8(
        ct.replace("<Default ", `<Default Extension="png" ContentType="image/png"/><Default `),
      );
  }
  return zipSync(bestanden);
}

export { W };
