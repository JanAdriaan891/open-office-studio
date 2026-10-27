import type { BewaarUitkomst } from "./opslag";
import type { Soort } from "./editors";
import { controleerPakket, risicoBeleid } from "./pakketcontrole";
import { converteer } from "./formaten";

/** Bewaart een kopie van het document in het gekozen formaat (Opslaan als). */
export async function bewaarKopie(
  document: { naam: string; soort: Soort; exportFormaat: string },
  bytes: Uint8Array,
): Promise<BewaarUitkomst> {
  const { soort, exportFormaat } = document;
  const markdown = soort === "docx" && exportFormaat === "md";
  const uitvoernaam =
    document.naam.replace(/\.[^.]+$/, "") + "." + exportFormaat;
  let uitvoer = bytes;
  let toelichting: string | undefined;
  if (!markdown) {
    // Bewaking op basis van de testmatrix: aangetoond verlies blokkeert
    // opslaan via de engine en wordt bij een conversie expliciet gemeld.
    const conversie = exportFormaat !== soort;
    const beleid = risicoBeleid(
      controleerPakket(bytes, soort).risicos,
      soort,
      conversie ? "conversie" : "engine",
    );
    if (beleid.opslaanGeblokkeerd) throw new Error(beleid.waarschuwing!);
    if (conversie && !["pdf", "txt", "csv", "html"].includes(exportFormaat))
      toelichting = beleid.waarschuwing ?? undefined;
  }
  if (markdown) {
    const { exporteerMarkdown } = await import("./markdown");
    const resultaat = await exporteerMarkdown(bytes);
    uitvoer = resultaat.bytes;
    if (resultaat.waarschuwing)
      toelichting =
        "Sommige onderdelen kunnen niet in Markdown worden overgenomen. Bewaar ook een DOCX.";
  }
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    if (exportFormaat !== soort && !markdown)
      uitvoer = await converteer(bytes, soort, exportFormaat, soort);
    const pad = await invoke<string | null>("bewaar_kopie", uitvoer, {
      headers: { "x-office-naam": encodeURIComponent(uitvoernaam) },
    });
    return pad
      ? {
          status: ["pdf", "csv", "txt", "html", "md"].includes(exportFormaat)
            ? "geëxporteerd"
            : "opgeslagen",
          pad,
          toelichting,
        }
      : { status: "geannuleerd" };
  }
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(uitvoer)], {
      type: markdown ? "text/markdown;charset=utf-8" : "application/octet-stream",
    }),
  );
  const a = window.document.createElement("a");
  a.href = url;
  a.download = uitvoernaam;
  window.document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { status: "download", toelichting };
}

export function opslagMelding(uitkomst: BewaarUitkomst) {
  return (
    (uitkomst.status === "opgeslagen"
      ? "Opgeslagen: " + uitkomst.pad
      : uitkomst.status === "geëxporteerd"
        ? "Geëxporteerd: " +
          uitkomst.pad +
          ". Sla je bewerkbare bestand ook op om de wijzigingen te behouden."
        : uitkomst.status === "geannuleerd"
          ? "Opslaan geannuleerd."
          : "Download aangevraagd. Controleer het bestand in je downloads.") +
    (uitkomst.toelichting ? " " + uitkomst.toelichting : "")
  );
}
