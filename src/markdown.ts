import { exportDocxMarkdown } from "@betteroffice/docx";
import { strFromU8, unzipSync } from "fflate";

const AFBEELDINGSMIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
};

function base64(bytes: Uint8Array) {
  let binair = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binair += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binair);
}

/**
 * Afbeeldingen uit de hoofdtekst van een DOCX als data-URL’s, in
 * documentvolgorde. Onbekende formaten (EMF, WMF, SVG) worden null.
 */
export function documentAfbeeldingen(bytes: Uint8Array): (string | null)[] {
  const delen = unzipSync(bytes, {
    filter: (b) =>
      b.name === "word/document.xml" ||
      b.name === "word/_rels/document.xml.rels" ||
      b.name.startsWith("word/media/"),
  });
  const document = delen["word/document.xml"];
  const rels = delen["word/_rels/document.xml.rels"];
  if (!document || !rels) return [];
  const doelen = new Map<string, string>();
  for (const m of strFromU8(rels).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const doel = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && doel) doelen.set(id, doel);
  }
  return [
    ...strFromU8(document).matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/g),
  ].map(([, id]) => {
    const doel = doelen.get(id);
    if (!doel) return null;
    const pad = "word/" + doel.replace(/^\.?\//, "");
    const ext = pad.split(".").pop()!.toLowerCase();
    const data = delen[pad];
    return data && AFBEELDINGSMIME[ext]
      ? `data:${AFBEELDINGSMIME[ext]};base64,${base64(data)}`
      : null;
  });
}

/**
 * Exporteert de bewaarde revisie via dezelfde documentkern als de teksteditor.
 * Met `metAfbeeldingen` worden afbeeldingen als data-URL ingevuld (voor HTML),
 * mits hun aantal overeenkomt met wat de kern uitvoert.
 */
export async function exporteerMarkdown(
  bytes: Uint8Array,
  opties: { metAfbeeldingen?: boolean } = {},
) {
  const resultaat = await exportDocxMarkdown(bytes, {
    revisionView: "accepted",
    stories: ["body", "footnotes", "endnotes"],
    includeFormatting: true,
    maxBytes: 8 * 1024 * 1024,
  });
  if (
    resultaat.truncated ||
    resultaat.diagnostics.some((melding) => melding.severity === "error")
  ) {
    throw new Error(
      "De Markdown-export kon niet volledig worden gemaakt. Bewaar het document als DOCX.",
    );
  }
  // De kern levert bronankers voor programmatisch gebruik; een .md heeft die niet nodig.
  const ankers = new Set(resultaat.anchors.map(({ marker }) => marker));
  let ontbrekendeAfbeelding = false;
  let markdown = resultaat.markdown;
  let ingevuld = false;
  if (opties.metAfbeeldingen) {
    const lege = markdown.match(/!\[((?:\\.|[^\]\\])*)\]\(\)/g) ?? [];
    const gevonden = documentAfbeeldingen(bytes);
    if (lege.length && lege.length === gevonden.length) {
      let index = 0;
      ingevuld = gevonden.every(Boolean);
      markdown = markdown.replace(
        /!\[((?:\\.|[^\]\\])*)\]\(\)/g,
        (volledig, beschrijving: string) => {
          const url = gevonden[index++];
          return url ? `![${beschrijving}](${url})` : volledig;
        },
      );
    }
  }
  const tekst = markdown
    .replace(/<!-- (docx-export:\d+) -->/g, (volledig, marker: string) =>
      ankers.has(marker) ? "" : volledig,
    )
    .replace(
      /!\[((?:\\.|[^\]\\])*)\]\(\)/g,
      (_volledig, beschrijving: string) => {
        ontbrekendeAfbeelding = true;
        return beschrijving ? `[Afbeelding: ${beschrijving}]` : "[Afbeelding]";
      },
    )
    .replace(/^<!-- docx-story: [^\r\n]* -->\r?\n/gm, "")
    .replace(/^[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
  return {
    bytes: new TextEncoder().encode(tekst + "\n"),
    waarschuwing:
      ontbrekendeAfbeelding ||
      resultaat.diagnostics.some((melding) =>
        melding.code === "image-data-omitted"
          ? !ingevuld
          : melding.severity === "warning",
      ),
  };
}
