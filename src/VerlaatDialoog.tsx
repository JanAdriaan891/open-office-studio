import { useEffect, useRef } from "react";
import { FileWarning } from "lucide-react";

export function VerlaatDialoog({
  naam,
  antwoord,
  vorigeFocus,
}: {
  naam: string;
  antwoord: (doorgaan: boolean) => void;
  vorigeFocus: HTMLElement | null;
}) {
  const annuleren = useRef<HTMLButtonElement>(null);
  const doorgaan = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    annuleren.current?.focus();
    return () => {
      if (vorigeFocus?.isConnected) vorigeFocus.focus();
    };
  }, [vorigeFocus]);
  return (
    <div className="office-dialoogachtergrond">
      <section
        className="office-dialoog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="verlaat-titel"
        aria-describedby="verlaat-uitleg"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            antwoord(false);
          }
          if (event.key === "Tab") {
            event.preventDefault();
            (document.activeElement === annuleren.current
              ? doorgaan
              : annuleren
            ).current?.focus();
          }
        }}
      >
        <span className="office-dialoogicoon">
          <FileWarning size={25} strokeWidth={1.6} />
        </span>
        <h2 id="verlaat-titel">Niet-opgeslagen wijzigingen</h2>
        <p id="verlaat-uitleg">
          <strong>{naam}</strong> bevat wijzigingen die nog niet zijn
          opgeslagen. Sla het bestand eerst op als je ze wilt behouden.
        </p>
        <div className="office-dialoogacties">
          <button ref={annuleren} onClick={() => antwoord(false)}>
            Annuleren
          </button>
          <button
            ref={doorgaan}
            className="office-dialoogdoorgaan"
            onClick={() => antwoord(true)}
          >
            Wijzigingen verwerpen
          </button>
        </div>
      </section>
    </div>
  );
}
