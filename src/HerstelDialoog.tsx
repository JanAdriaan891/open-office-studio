import { useEffect, useRef } from "react";
import { LifeBuoy } from "lucide-react";
import type { HerstelItem } from "./herstel";
import { datumTekst } from "./RecenteBestanden";
import "./levenscyclus.css";

const MODULE = { docx: "Tekst", xlsx: "Rekenblad", pptx: "Presentatie" };

/** Na een niet-schone afsluiting: per document herstellen, opslaan als of weggooien. */
export function HerstelDialoog({
  items,
  bezig,
  herstel,
  gooiWeg,
  later,
}: {
  items: HerstelItem[];
  bezig: boolean;
  herstel: (item: HerstelItem, opslaanAls: boolean) => void;
  gooiWeg: (item: HerstelItem) => void;
  later: () => void;
}) {
  const dialoog = useRef<HTMLElement>(null);
  useEffect(() => {
    dialoog.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  return (
    <div className="office-dialoogachtergrond">
      <section
        ref={dialoog}
        className="office-dialoog office-herstel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="herstel-titel"
        aria-describedby="herstel-uitleg"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            later();
          }
          if (event.key === "Tab") {
            event.preventDefault();
            const knoppen = [
              ...(dialoog.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ) ?? []),
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
          <LifeBuoy size={25} strokeWidth={1.6} />
        </span>
        <h2 id="herstel-titel">Documenten herstellen</h2>
        <p id="herstel-uitleg">
          De vorige keer is Open Office Studio niet netjes afgesloten. Van deze
          documenten is een herstelkopie bewaard. Herstellen opent een nieuw,
          niet-opgeslagen tabblad; het oorspronkelijke bestand blijft
          ongewijzigd.
        </p>
        <ul className="office-herstellijst">
          {items.map((item) => (
            <li key={`${item.sessie}/${item.sleutel}`}>
              <span>
                <strong>{item.naam}</strong>
                <small>
                  {MODULE[item.soort] ?? item.soort} · herstelkopie van{" "}
                  {datumTekst(item.datum).toLowerCase()}
                </small>
              </span>
              <span className="office-herstelknoppen">
                <button
                  disabled={bezig}
                  className="office-dialoogdoorgaan"
                  onClick={() => herstel(item, false)}
                >
                  Herstellen
                </button>
                <button disabled={bezig} onClick={() => herstel(item, true)}>
                  Opslaan als…
                </button>
                <button
                  disabled={bezig}
                  onClick={() => gooiWeg(item)}
                  aria-label={`Herstelkopie van ${item.naam} weggooien`}
                >
                  Weggooien
                </button>
              </span>
            </li>
          ))}
        </ul>
        <div className="office-dialoogacties">
          <button onClick={later} title="De kopieën blijven bewaard tot de volgende start">
            Later beslissen
          </button>
        </div>
      </section>
    </div>
  );
}
