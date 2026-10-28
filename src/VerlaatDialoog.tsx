import { useEffect, useRef } from "react";
import { FileWarning } from "lucide-react";
import type { VerlaatKeuze } from "./useTabbladen";

export function VerlaatDialoog({
  naam,
  antwoord,
  vorigeFocus,
  kanOpslaan = false,
  overige = 0,
}: {
  naam: string;
  antwoord: (keuze: VerlaatKeuze) => void;
  vorigeFocus: HTMLElement | null;
  /** Toont "Opslaan" naast "Niet opslaan" en "Annuleren". */
  kanOpslaan?: boolean;
  /** Aantal andere tabbladen met wijzigingen in dezelfde sluitopdracht. */
  overige?: number;
}) {
  const dialoog = useRef<HTMLElement>(null);
  const eerste = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    eerste.current?.focus();
    return () => {
      if (vorigeFocus?.isConnected) vorigeFocus.focus();
    };
  }, [vorigeFocus]);
  return (
    <div className="office-dialoogachtergrond">
      <section
        ref={dialoog}
        className="office-dialoog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="verlaat-titel"
        aria-describedby="verlaat-uitleg"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            antwoord("annuleren");
          }
          if (event.key === "Tab") {
            // Houd de focus binnen de dialoog.
            event.preventDefault();
            const knoppen = [
              ...(dialoog.current?.querySelectorAll("button") ?? []),
            ];
            const index = knoppen.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const stap = event.shiftKey ? -1 : 1;
            knoppen[(index + stap + knoppen.length) % knoppen.length]?.focus();
          }
        }}
      >
        <span className="office-dialoogicoon">
          <FileWarning size={25} strokeWidth={1.6} />
        </span>
        <h2 id="verlaat-titel">Niet-opgeslagen wijzigingen</h2>
        <p id="verlaat-uitleg">
          {kanOpslaan ? (
            <>
              Wil je de wijzigingen in <strong>{naam}</strong> opslaan voordat
              je het sluit?
            </>
          ) : (
            <>
              <strong>{naam}</strong> bevat wijzigingen die nog niet zijn
              opgeslagen. Sla het bestand eerst op als je ze wilt behouden.
            </>
          )}
          {overige > 0 && (
            <>
              {" "}
              Daarna {overige === 1 ? "volgt nog" : "volgen nog"} {overige}{" "}
              {overige === 1 ? "ander document" : "andere documenten"} met
              niet-opgeslagen wijzigingen.
            </>
          )}
        </p>
        <div className="office-dialoogacties">
          {kanOpslaan ? (
            <>
              <button ref={eerste} onClick={() => antwoord("annuleren")}>
                Annuleren
              </button>
              <button onClick={() => antwoord("verwerpen")}>Niet opslaan</button>
              <button
                className="office-dialoogdoorgaan"
                onClick={() => antwoord("opslaan")}
              >
                Opslaan
              </button>
            </>
          ) : (
            <>
              <button ref={eerste} onClick={() => antwoord("annuleren")}>
                Annuleren
              </button>
              <button
                className="office-dialoogdoorgaan"
                onClick={() => antwoord("verwerpen")}
              >
                Wijzigingen verwerpen
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
