import { useEffect, useRef, useState } from "react";
import { FileDown } from "lucide-react";
import { kantoorModule } from "../packages/email/src/kantoor";
import { bestandssoort } from "./formaten";
import "./levenscyclus.css";

const tauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const AFBEELDINGEN = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "svg",
  "tif",
  "tiff",
]);

/** Kan de app dit bestand openen? Anders een duidelijke melding. */
export function neerzetMelding(naam: string): string | null {
  const ext = /\.([^.]+)$/.exec(naam)?.[1]?.toLowerCase() ?? "";
  if (bestandssoort(ext) || kantoorModule(naam) === "database") return null;
  if (AFBEELDINGEN.has(ext))
    return `${naam} is een afbeelding. Slepen voegt nog geen afbeeldingen in een document in; gebruik Invoegen › Afbeelding.`;
  return `${naam} kan niet worden geopend: .${ext || "?"} wordt niet ondersteund. Open Office Studio opent documenten, rekenbladen, presentaties en Access-databases.`;
}

/** Bevat het slepen bestanden (en niet bijv. tekst uit de editor)? */
function heeftBestanden(e: DragEvent) {
  return !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
}

interface Opties {
  /** Browser: de neergezette bestanden, op volgorde. */
  open: (bestanden: File[]) => void;
  /** Uit terwijl er een dialoog openstaat. */
  uit: boolean;
}

/**
 * Bestanden op het venster slepen opent ze. In de desktopapp vangt Rust de
 * neergezette paden op (`systeembestanden.rs`, zelfde route als een
 * dubbelklik, met pad-token voor Ctrl+S); hier tonen we alleen de zone. In
 * de browser komen de bestanden als File-objecten binnen.
 */
export function useNeerzetten({ open, uit }: Opties) {
  const [zichtbaar, setZichtbaar] = useState(false);
  const recent = useRef({ open, uit });
  recent.current = { open, uit };

  useEffect(() => {
    if (tauri) {
      let stop: (() => void) | undefined;
      let actief = true;
      void import("@tauri-apps/api/webview")
        .then(({ getCurrentWebview }) =>
          getCurrentWebview().onDragDropEvent((e) => {
            const soort = e.payload.type;
            setZichtbaar(
              (soort === "enter" || soort === "over") && !recent.current.uit,
            );
          }),
        )
        .then((s) => (actief ? (stop = s) : s()))
        .catch(() => undefined);
      return () => {
        actief = false;
        stop?.();
      };
    }
    let diepte = 0;
    const binnen = (e: DragEvent) => {
      if (!heeftBestanden(e) || recent.current.uit) return;
      diepte++;
      setZichtbaar(true);
    };
    const boven = (e: DragEvent) => {
      if (!heeftBestanden(e) || recent.current.uit || e.defaultPrevented)
        return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    };
    const weg = (e: DragEvent) => {
      if (!heeftBestanden(e)) return;
      diepte = Math.max(0, diepte - 1);
      if (!diepte) setZichtbaar(false);
    };
    const los = (e: DragEvent) => {
      diepte = 0;
      setZichtbaar(false);
      // Een eigen neerzetplek (bijv. bijlagen in een e-mail) gaat voor.
      if (!heeftBestanden(e) || e.defaultPrevented || recent.current.uit)
        return;
      e.preventDefault();
      const bestanden = [...(e.dataTransfer?.files ?? [])];
      if (bestanden.length) recent.current.open(bestanden);
    };
    window.addEventListener("dragenter", binnen);
    window.addEventListener("dragover", boven);
    window.addEventListener("dragleave", weg);
    window.addEventListener("drop", los);
    return () => {
      window.removeEventListener("dragenter", binnen);
      window.removeEventListener("dragover", boven);
      window.removeEventListener("dragleave", weg);
      window.removeEventListener("drop", los);
    };
  }, []);

  return zichtbaar ? (
    <div className="office-neerzetzone" aria-hidden="true">
      <div>
        <FileDown size={34} strokeWidth={1.5} />
        <strong>Laat los om te openen</strong>
        <span>
          Documenten, rekenbladen en presentaties openen elk in een eigen
          tabblad; MDB en ACCDB in Database Studio.
        </span>
      </div>
    </div>
  ) : null;
}
