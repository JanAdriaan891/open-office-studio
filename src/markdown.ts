import { exportDocxMarkdown } from "@betteroffice/docx";

/** Exporteert de bewaarde revisie via dezelfde documentkern als Writer. */
export async function exporteerMarkdown(bytes: Uint8Array) {
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
  const tekst = resultaat.markdown
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
      resultaat.diagnostics.some(
        (melding) =>
          melding.severity === "warning" ||
          melding.code === "image-data-omitted",
      ),
  };
}
