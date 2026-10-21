import { strFromU8, unzipSync } from "fflate";
import type { Soort } from "./editors";

/** Snelle pakketcontrole vóór een engine geheugen voor documentinhoud reserveert. */
export function controleerPakket(bytes: Uint8Array, soort: Soort) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error(
      "Dit is geen leesbaar OOXML-pakket. Het bestand kan versleuteld zijn of een andere extensie nodig hebben.",
    );
  const namen = new Set<string>();
  let totaal = 0;
  const bestanden = unzipSync(bytes, {
    filter: (bestand) => {
      const naam = bestand.name;
      if (namen.has(naam))
        throw new Error("Het pakket bevat dubbele onderdelen.");
      if (
        naam.startsWith("/") ||
        naam.includes("\\") ||
        naam.split("/").includes("..")
      )
        throw new Error("Het pakket bevat een ongeldig onderdeelpad.");
      namen.add(naam);
      totaal += bestand.originalSize;
      if (
        namen.size > 10000 ||
        totaal > 256 * 1024 * 1024 ||
        bestand.originalSize > 64 * 1024 * 1024
      )
        throw new Error(
          "Dit pakket is te groot om veilig te openen: maximaal 256 MB uitgepakt, 64 MB per onderdeel en 10.000 onderdelen.",
        );
      return soort === "xlsx" && naam === "xl/workbook.xml";
    },
  });
  const hoofd = {
    docx: "word/document.xml",
    xlsx: "xl/workbook.xml",
    pptx: "ppt/presentation.xml",
  }[soort];
  if (!namen.has(hoofd))
    throw new Error(
      "Het hoofdonderdeel ontbreekt of het bestandstype past niet bij de extensie.",
    );
  return {
    strict:
      soort === "xlsx" &&
      strFromU8(bestanden["xl/workbook.xml"]).includes("purl.oclc.org/ooxml"),
    macros: [...namen].some((naam) => /(^|\/)vbaProject\.bin$/i.test(naam)),
    onderdelen: namen.size,
    uitgepakt: totaal,
  };
}
