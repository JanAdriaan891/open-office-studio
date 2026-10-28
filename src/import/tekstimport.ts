/**
 * Eigen omzetting van TXT, Markdown, HTML en RTF naar DOCX, zonder
 * kantoorruntime. Levert de DOCX-bytes plus de rapportregels.
 */
import { schrijfDocx } from "./docxschrijver";
import { decodeerHtml, htmlNaarModel } from "./htmlbestand";
import { markdownNaarModel } from "./markdownbestand";
import type { Rapportregel } from "./rapport";
import { rtfNaarModel } from "./rtfbestand";
import { leesTekst, regeleindeNaam, tekstNaarModel } from "./tekstbestand";

export const TEKSTFORMATEN = new Set([
  "txt",
  "md",
  "markdown",
  "htm",
  "html",
  "xhtml",
  "rtf",
]);

/** Formaten die we liever via de runtime openen als die er is (hogere trouw). */
export const LIEVER_RUNTIME = new Set(["htm", "html", "xhtml", "rtf"]);

export interface Tekstomzetting {
  bytes: Uint8Array;
  regels: Rapportregel[];
}

const MAX_TEKST = 32 * 1024 * 1024;

export function zetTekstOm(ext: string, bytes: Uint8Array): Tekstomzetting {
  if (bytes.length > MAX_TEKST)
    throw new Error(
      "Dit tekstbestand is te groot om zonder kantoorruntime te openen (maximaal 32 MB).",
    );
  const regels: Rapportregel[] = [];
  if (ext === "txt") {
    const gelezen = leesTekst(bytes);
    regels.push({
      onderdeel: "Codering",
      gevolg: `Herkend als ${gelezen.coderingsnaam}; regeleinden: ${regeleindeNaam(gelezen.regeleinde)}. Elke regel is een alinea geworden.`,
      info: true,
    });
    return { bytes: schrijfDocx(tekstNaarModel(gelezen.tekst)), regels };
  }
  if (ext === "md" || ext === "markdown") {
    const gelezen = leesTekst(bytes);
    const resultaat = markdownNaarModel(gelezen.tekst);
    regels.push({
      onderdeel: "Markdown",
      gevolg: `Koppen, lijsten, koppelingen, tabellen, code en citaten zijn overgenomen (codering ${gelezen.coderingsnaam}).`,
      info: true,
    });
    if (resultaat.nietIngesloten)
      regels.push({
        onderdeel: "Afbeeldingen",
        gevolg: `${resultaat.nietIngesloten} afbeelding(en) met een extern of lokaal pad zijn niet opgehaald en staan als tekst in het document. Alleen ingesloten data-afbeeldingen (PNG, JPEG, GIF) worden overgenomen.`,
      });
    if (resultaat.ruweHtml)
      regels.push({
        onderdeel: "Ingesloten HTML",
        gevolg:
          "Alleen de tekst en eenvoudige opmaak zijn overgenomen; scripts en stijlen niet.",
      });
    if (resultaat.voetnoten)
      regels.push({
        onderdeel: "Voetnoten",
        gevolg:
          "Staan als gewone tekst met een verwijzingsnummer, niet als echte voetnoten.",
      });
    return { bytes: schrijfDocx(resultaat.document), regels };
  }
  if (ext === "htm" || ext === "html" || ext === "xhtml") {
    const { tekst, codering } = decodeerHtml(bytes);
    const resultaat = htmlNaarModel(tekst);
    regels.push({
      onderdeel: "Webpagina",
      gevolg: `Tekst, koppen, opmaak, lijsten, tabellen en koppelingen zijn overgenomen (codering ${codering}). Scripts, stijlbladen, formulieren en externe bronnen zijn niet geladen of uitgevoerd; de pagina-indeling kan afwijken.`,
      info: true,
    });
    if (resultaat.nietIngesloten)
      regels.push({
        onderdeel: "Afbeeldingen",
        gevolg: `${resultaat.nietIngesloten} externe afbeelding(en) zijn niet opgehaald en staan als tekst in het document.`,
      });
    if (resultaat.formulieren)
      regels.push({
        onderdeel: "Formulieren",
        gevolg: "Formuliervelden zijn als tekst overgenomen en werken niet.",
      });
    return { bytes: schrijfDocx(resultaat.document), regels };
  }
  if (ext === "rtf") {
    const resultaat = rtfNaarModel(bytes);
    regels.push({
      onderdeel: "Rich Text Format",
      gevolg:
        "Gelezen met de eenvoudige eigen RTF-lezer: tekst, basisopmaak, koppen, eenvoudige tabellen, koppelingen en PNG/JPEG-afbeeldingen. Lijstnummering staat als tekst.",
      info: true,
    });
    for (const [wat, aantal] of Object.entries(resultaat.overgeslagen))
      regels.push({
        onderdeel: wat.charAt(0).toUpperCase() + wat.slice(1),
        gevolg: `Niet overgenomen (${aantal}×). Open het bestand in de desktopapp met kantoorruntime voor een vollediger omzetting.`,
      });
    return { bytes: schrijfDocx(resultaat.document), regels };
  }
  throw new Error(`Dit formaat (${ext}) kan de app niet zelf omzetten.`);
}
