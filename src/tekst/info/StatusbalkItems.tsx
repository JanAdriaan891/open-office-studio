/**
 * Extra statusbalk-items voor Open Tekst Studio (#28): taal (klikbaar, met
 * spellingstatus van pakket W5), wijzigingen bijhouden en de weergaveknoppen,
 * plus het rechtermuisknopmenu om statusbalk-items aan of uit te zetten
 * (gekoppeld aan de instelling statusbalk in src/instellingen.ts).
 */
import { useState, type MouseEvent } from "react";
import { BookOpen, FileText, Languages, PenLine } from "lucide-react";
import { useInstellingen, wijzigInstellingen, type Instellingen } from "../../instellingen";
import { Contextmenu } from "../stijlen/StijlGalerij";
import { useTaalAansluiting, useTekstExtra } from "./winkel";

/** Taal en bijhouden, na pagina en woorden. */
export function TekstStatusExtra() {
  const extra = useTekstExtra();
  const { statusbalk } = useInstellingen();
  const taal = useTaalAansluiting();
  if (!extra) return null;
  const spelling = taal.status?.() ?? null;
  return (
    <>
      {statusbalk.taal && (
        <button
          type="button"
          className="statusbalk-taal"
          onClick={extra.kiesTaal}
          title={`Taal: ${extra.taal?.naam ?? "niet opgegeven"} · klik om de taal te kiezen`}
          aria-label={`Taal: ${extra.taal?.naam ?? "niet opgegeven"}${spelling ? `, ${spelling}` : ""}. Taal kiezen`}
        >
          <Languages size={12} aria-hidden="true" />
          {extra.taal?.naam ?? "Taal onbekend"}
          {spelling && <span className="statusbalk-spelling"> · {spelling}</span>}
        </button>
      )}
      {statusbalk.bijhouden && extra.bijhouden !== null && (
        <button
          type="button"
          aria-pressed={extra.bijhouden}
          className={extra.bijhouden ? "statusbalk-bijhouden is-aan" : "statusbalk-bijhouden"}
          onClick={extra.wisselBijhouden}
          title="Wijzigingen bijhouden aan of uit · Ctrl+Shift+C"
        >
          <PenLine size={12} aria-hidden="true" />
          Wijzigingen bijhouden: {extra.bijhouden ? "aan" : "uit"}
        </button>
      )}
    </>
  );
}

/** Afdrukweergave en leesmodus, links van de zoomschuif. */
export function TekstWeergaveKnoppen() {
  const extra = useTekstExtra();
  const { statusbalk } = useInstellingen();
  if (!extra || !statusbalk.weergave) return null;
  return (
    <span className="statusbalk-weergave" role="group" aria-label="Weergave">
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label="Afdrukweergave"
        aria-pressed={extra.weergave === "afdruk"}
        title="Afdrukweergave"
        onClick={() => extra.zetWeergave("afdruk")}
      >
        <FileText size={13} />
      </button>
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label="Leesmodus"
        aria-pressed={extra.weergave === "lees"}
        title="Leesmodus · rustige, schermvullende weergave"
        onClick={() => extra.zetWeergave("lees")}
      >
        <BookOpen size={13} />
      </button>
    </span>
  );
}

const ITEMS: [keyof Instellingen["statusbalk"], string][] = [
  ["tekst", "Paginanummer en woorden"],
  ["taal", "Taal"],
  ["bijhouden", "Wijzigingen bijhouden"],
  ["weergave", "Weergaveknoppen"],
  ["zoom", "Zoomschuif"],
  ["rekenblad", "Rekenblad: som, gemiddelde, aantal"],
  ["presentatie", "Presentatie: dia x van y"],
  ["database", "Database: werkkopie"],
];

/** Rechtermuisknopmenu van de statusbalk: items aan- of uitzetten. */
export function useStatusbalkMenu() {
  const { statusbalk } = useInstellingen();
  const [plek, setPlek] = useState<{ x: number; y: number } | null>(null);
  return {
    onContextMenu(e: MouseEvent) {
      e.preventDefault();
      setPlek({ x: e.clientX, y: e.clientY || window.innerHeight - 40 });
    },
    element: plek ? (
      <Contextmenu
        x={plek.x}
        y={plek.y}
        label="Statusbalk aanpassen"
        sluit={() => setPlek(null)}
        items={ITEMS.map(([sleutel, naam]) => ({
          naam,
          aan: statusbalk[sleutel],
          uitvoeren: () => wijzigInstellingen({ statusbalk: { [sleutel]: !statusbalk[sleutel] } }),
        }))}
      />
    ) : null,
  };
}
