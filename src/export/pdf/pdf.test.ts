import { describe, expect, it } from "vitest";
import { unzlibSync } from "fflate";
import { schrijfPdf, getal, pdfTekst, veiligeUrl } from "./schrijver";
import { glyphloosLettertype } from "./glyphloos";

const latin1 = (b: Uint8Array) => {
  let s = "";
  for (const c of b) s += String.fromCharCode(c);
  return s;
};

/** Ontleedt de xref-tabel en controleert dat elke positie naar "n 0 obj" wijst. */
function controleerXref(pdf: Uint8Array) {
  const tekst = latin1(pdf);
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(tekst)![1]);
  expect(tekst.slice(start, start + 4)).toBe("xref");
  const [kop, ...regels] = tekst.slice(start).split("\n").slice(1);
  const aantal = Number(kop.split(" ")[1]);
  for (let nr = 1; nr < aantal; nr++) {
    const positie = Number(regels[nr].slice(0, 10));
    expect(tekst.slice(positie, positie + `${nr} 0 obj`.length)).toBe(`${nr} 0 obj`);
  }
  return aantal;
}

describe("PDF-schrijver", () => {
  const pdf = schrijfPdf({
    titel: "Proef één",
    auteur: "OpenAEC",
    datum: new Date(Date.UTC(2026, 9, 28, 12)),
    paginas: [
      {
        breedte: 595,
        hoogte: 842,
        beeld: { soort: "rgb", breedte: 2, hoogte: 2, bytes: new Uint8Array(12).fill(200) },
        tekst: [
          { tekst: "Hallo wereld – café €", x: 72, y: 100, grootte: 12, breedte: 140 },
          { tekst: "日本", x: 72, y: 130, grootte: 12, breedte: 24 },
        ],
        koppelingen: [
          { x: 72, y: 90, breedte: 100, hoogte: 14, url: "https://openaec.org" },
          { x: 0, y: 0, breedte: 10, hoogte: 10, url: "javascript:alert(1)" },
        ],
      },
      { breedte: 842, hoogte: 595 },
    ],
    bladwijzers: [
      { titel: "Begin", pagina: 0 },
      { titel: "Tweede", pagina: 1, y: 40 },
      { titel: "Bestaat niet", pagina: 9 },
    ],
  });
  const tekst = latin1(pdf);

  it("schrijft een geldige structuur met kloppende xref", () => {
    expect(tekst.startsWith("%PDF-1.7\n")).toBe(true);
    expect(tekst.endsWith("%%EOF\n")).toBe(true);
    controleerXref(pdf);
    expect(tekst).toContain("/Count 2");
    expect(/\/ID \[<([0-9A-F]{32})> <\1>\]/.test(tekst)).toBe(true);
  });
  it("is reproduceerbaar met een vaste datum", () => {
    const opnieuw = schrijfPdf({
      titel: "Proef één",
      auteur: "OpenAEC",
      datum: new Date(Date.UTC(2026, 9, 28, 12)),
      paginas: [{ breedte: 100, hoogte: 100 }],
    });
    const nogmaals = schrijfPdf({
      titel: "Proef één",
      auteur: "OpenAEC",
      datum: new Date(Date.UTC(2026, 9, 28, 12)),
      paginas: [{ breedte: 100, hoogte: 100 }],
    });
    expect(latin1(opnieuw)).toBe(latin1(nogmaals));
  });
  it("legt een onzichtbare tekstlaag met ToUnicode", () => {
    expect(tekst).toContain("/Subtype /Type0");
    expect(tekst).toContain("/Encoding /Identity-H");
    expect(tekst).toContain("/FontFile2");
    // De ToUnicode-tabel bevat é (00E9), € (20AC) en 日 (65E5).
    const m = /\/ToUnicode (\d+) 0 R/.exec(tekst)!;
    const obj = new RegExp(`\\n${m[1]} 0 obj\\n<< /Length (\\d+) /Filter /FlateDecode >>\\nstream\\n`).exec(tekst)!;
    const begin = obj.index + obj[0].length;
    const cmap = latin1(unzlibSync(pdf.subarray(begin, begin + Number(obj[1]))));
    for (const code of ["00e9", "20ac", "65e5"]) expect(cmap).toContain(`<${code}>`);
  });
  it("maakt alleen veilige koppelingen klikbaar en houdt bladwijzers binnen het document", () => {
    expect(tekst).toContain("/URI (https://openaec.org)");
    expect(tekst).not.toContain("javascript");
    expect(veiligeUrl("mailto:a@b.nl")).toBe("mailto:a@b.nl");
    expect(veiligeUrl("file:///etc/passwd")).toBeNull();
    expect(tekst).toContain("/Outlines");
    expect(tekst).toContain(pdfTekst("Tweede"));
    expect(tekst).not.toContain(pdfTekst("Bestaat niet"));
  });
  it("zet metadata in Info en XMP", () => {
    expect(tekst).toContain(`/Title ${pdfTekst("Proef één")}`);
    expect(tekst).toContain("<dc:title>");
    expect(tekst).toContain("/Lang");
  });
  it("schrijft getallen zonder exponent", () => {
    expect(getal(1e-9)).toBe("0");
    expect(getal(-0.0001)).toBe("0");
    expect(getal(12.34567)).toBe("12.346");
  });
  it("bouwt een TrueType-lettertype met kloppende controlesom", () => {
    const font = glyphloosLettertype();
    const dv = new DataView(font.buffer, font.byteOffset, font.byteLength);
    expect(dv.getUint32(0)).toBe(0x00010000);
    let som = 0;
    for (let i = 0; i < font.length; i += 4) som = (som + dv.getUint32(i)) >>> 0;
    expect(som).toBe(0xb1b0afba);
  });
});
