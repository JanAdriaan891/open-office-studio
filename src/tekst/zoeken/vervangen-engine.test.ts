import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { bouwIndex, vervang, zoekIn } from "./zoeken";

const cel = (inhoud: string) => `<w:tc><w:tcPr/><w:p>${inhoud}</w:p></w:tc>`;
const regel = '<w:r><w:rPr><w:b/></w:rPr><w:t>hard</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>line</w:t></w:r>';

/** Hoofdtekst met een regeleinde, daarna een tabel met hetzelfde in rij 2, kolom 1. */
function bron() {
  const delen = unzipSync(readFileSync("public/templates/nieuw.docx"));
  delen["word/document.xml"] = strToU8(strFromU8(delen["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/,
    `<w:body><w:p><w:r><w:t xml:space="preserve">Voor </w:t></w:r>${regel}<w:r><w:t xml:space="preserve"> na</w:t></w:r></w:p>` +
    '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>' +
    `<w:tr>${cel("<w:r><w:t>kop</w:t></w:r>")}${cel("<w:r><w:t>hard line</w:t></w:r>")}</w:tr>` +
    `<w:tr>${cel(regel)}${cel("<w:r><w:t>ongemoeid</w:t></w:r>")}</w:tr></w:tbl><w:sectPr`));
  return zipSync(delen);
}

/** De editor-API voor zover zoeken en vervangen die gebruiken, direct op de sessie. */
function ref(s: YrsSession, modus = "editing") {
  return {
    flushPendingInput: async () => {},
    readParagraphs: async (r: Parameters<YrsSession["readParagraphs"]>[0]) => s.readParagraphs(r),
    applyEdits: async (r: Parameters<YrsSession["applyEdits"]>[0]) => s.applyEdits(r),
    commands: { getState: () => ({ value: modus }) },
    getEditorRef: () => ({ getYrsSession: () => s, syncYrsInputState: vi.fn(), relayout: vi.fn() }),
  } as unknown as DocxEditorRef;
}

const teksten = async (s: YrsSession) => {
  const index = await bouwIndex(ref(s));
  return Object.fromEntries(index.verhalen.map((v) => [v.story, v.tekst]));
};
const opties = {};

async function open() {
  const s = await createYrsSession();
  s.openDocx(bron(), true);
  return s;
}

describe("vervangen over een handmatig regeleinde (#388)", () => {
  it("Alles vervangen zet hard^lline om in hard^tline, in de tabelcel en erbuiten", async () => {
    const s = await open(), terug = await createYrsSession();
    try {
      const api = ref(s);
      const index = await bouwIndex(api);
      const treffers = zoekIn(index, { zoek: "hard^lline", opties });
      expect(treffers.map((t) => t.story)).toEqual(["body", "body:t0:r1c0"]);
      await expect(vervang(api, index, treffers, "hard^tline", opties)).resolves.toMatchObject({ aantal: 2 });
      expect(await teksten(s)).toEqual({
        body: "Voor hard\tline na\n\n",
        "body:t0:r0c0": "kop\n",
        "body:t0:r0c1": "hard line\n",
        "body:t0:r1c0": "hard\tline\n",
        "body:t0:r1c1": "ongemoeid\n",
      });
      // Eén stap terug herstelt beide regeleinden, opnieuw geeft weer de tabs.
      expect(s.undo()).toBe(true);
      expect((await teksten(s))["body:t0:r1c0"]).toBe("hard\vline\n");
      expect((await teksten(s)).body).toBe("Voor hard\vline na\n\n");
      expect(s.canUndo()).toBe(false);
      expect(s.redo()).toBe(true);
      expect((await teksten(s))["body:t0:r1c0"]).toBe("hard\tline\n");
      // Opslaan en heropenen: de tab staat in het bestand, het regeleinde niet meer.
      const bytes = (await saveYrsDocx(s)).bytes;
      const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
      expect(xml).not.toContain("<w:br");
      expect(xml.match(/<w:tab\/>/g)).toHaveLength(2);
      terug.openDocx(bytes, true);
      expect(await teksten(terug)).toEqual(await teksten(s));
    } finally { s.destroy(); terug.destroy(); }
  });
  it("Vervangen van één treffer laat de andere en de opmaak eromheen ongemoeid", async () => {
    const s = await open(), terug = await createYrsSession();
    try {
      const api = ref(s);
      const index = await bouwIndex(api);
      const [, inCel] = zoekIn(index, { zoek: "hard^lline", opties });
      await expect(vervang(api, index, [inCel], "zacht", opties)).resolves.toEqual({ aantal: 1, route: "sessie" });
      const na = await teksten(s);
      expect(na.body).toBe("Voor hard\vline na\n\n");
      expect(na["body:t0:r1c0"]).toBe("zacht\n");
      expect(na["body:t0:r1c1"]).toBe("ongemoeid\n");
      // Het vette ‘hard’ in de hoofdtekst is niet aangeraakt.
      const vet = s.storySegments("body").filter((d) => d.kind === "text" && (d.attributes as { bold?: boolean }).bold);
      expect(vet.map((d) => (d as { text: string }).text).join("")).toBe("hard");
      terug.openDocx((await saveYrsDocx(s)).bytes, true);
      expect(await teksten(terug)).toEqual(na);
    } finally { s.destroy(); terug.destroy(); }
  });
  it("alleen het regeleinde vervangen (^l door een spatie of ^p) werkt ook", async () => {
    const s = await open();
    try {
      const api = ref(s);
      let index = await bouwIndex(api);
      await vervang(api, index, zoekIn(index, { zoek: "^l", opties }).slice(0, 1), " ", opties);
      expect((await teksten(s)).body).toBe("Voor hard line na\n\n");
      index = await bouwIndex(api);
      await vervang(api, index, zoekIn(index, { zoek: "^l", opties }), "^p", opties);
      expect((await teksten(s))["body:t0:r1c0"]).toBe("hard\nline\n");
    } finally { s.destroy(); }
  });
  it("legt de vervanging bij Wijzigingen bijhouden vast als voorstel", async () => {
    const s = await open();
    try {
      const api = ref(s, "suggesting");
      const index = await bouwIndex(api);
      await vervang(api, index, zoekIn(index, { zoek: "hard^lline", opties }), "hard^tline", opties);
      expect((await teksten(s))["body:t0:r1c0"]).toBe("hard\tline\n");
      const origineel = await api.readParagraphs({ view: "original", story: "body:t0:r1c0" });
      expect(origineel.ok && origineel.paragraphs[0].atoms.map((a) => a.kind)).toEqual(["lineBreak"]);
    } finally { s.destroy(); }
  });
  it("treffers zonder regeleinde blijven via applyEdits lopen", async () => {
    const s = await open();
    try {
      const api = ref(s);
      const index = await bouwIndex(api);
      await expect(vervang(api, index, zoekIn(index, { zoek: "hard line", opties }), "hard^tline", opties)).resolves.toEqual({ aantal: 1, route: "bewerkingen" });
      expect((await teksten(s))["body:t0:r0c1"]).toBe("hard\tline\n");
    } finally { s.destroy(); }
  });
});
