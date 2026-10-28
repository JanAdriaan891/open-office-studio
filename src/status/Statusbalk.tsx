import { HardDrive, Maximize2, Minus, Plus } from "lucide-react";
import { useInstellingen } from "../instellingen";
import { stap } from "../documentzoom";
import { useModuleStatus, useZoomBediening } from "./statusinfo";
import { getal, schuifNaarZoom, zoomNaarSchuif } from "./berekening";
import { TekstStatusExtra, TekstWeergaveKnoppen, useStatusbalkMenu } from "../tekst/info/StatusbalkItems";
import "./statusbalk.css";

export interface StatusbalkProps {
  /** docx, xlsx, pptx, database, email, notities of null (Start). */
  soort: string | null;
  moduleNaam: string;
  /** Het actieve document, of null in een module of op Start. */
  document: { gereed: boolean; gewijzigd: boolean; zoom: number | null } | null;
  /** Of de werkkopie van Database Studio gewijzigd is; null zonder database. */
  databaseGewijzigd: boolean | null;
  emailOngelezen: number | null;
  aantalGewijzigd: number;
  versieLabel: string;
}

/** "1 teken", "4.613 tekens". */
const aantal = (n: number, enkel: string, meer: string) => `${getal(n)} ${n === 1 ? enkel : meer}`;

function ModuleInfo({ soort }: { soort: string | null }) {
  const info = useModuleStatus();
  const { statusbalk } = useInstellingen();
  if (!info) return null;
  if (info.soort === "tekst" && soort === "docx")
    return (
      <span className="statusbalk-module">
        {statusbalk.tekst && (
        <button type="button" onClick={info.naarPagina} title="Ga naar pagina">
          Pagina {info.pagina}
          {info.paginas ? ` van ${info.paginas}` : ""}
        </button>
        )}
        {statusbalk.tekst && info.woorden !== null && (
          <button type="button" onClick={info.woordenTellen} title="Woorden tellen">
            {info.selectie
              ? `${getal(info.selectie.woorden)} van ${aantal(info.woorden, "woord", "woorden")}`
              : aantal(info.woorden, "woord", "woorden")}
            {info.tekens !== null &&
              `, ${aantal(info.selectie ? info.selectie.tekens : info.tekens, "teken", "tekens")}`}
          </button>
        )}
        <TekstStatusExtra />
      </span>
    );
  if (info.soort === "rekenblad" && soort === "xlsx" && statusbalk.rekenblad) {
    const s = info.statistiek;
    if (!s || s.aantal < 2) return null;
    return (
      <span
        className="statusbalk-module"
        title={
          s.minimum !== null && s.maximum !== null
            ? `Minimum ${getal(s.minimum)} · Maximum ${getal(s.maximum)} · ${getal(s.getallen)} getallen`
            : undefined
        }
      >
        {s.gemiddelde !== null && <span>Gemiddelde: {getal(s.gemiddelde)}</span>}
        <span>Aantal: {getal(s.aantal)}</span>
        {s.getallen > 0 && <span>Som: {getal(s.som)}</span>}
      </span>
    );
  }
  if (info.soort === "presentatie" && soort === "pptx" && statusbalk.presentatie)
    return (
      <span className="statusbalk-module">
        <span>
          Dia {info.dia} van {info.dias}
        </span>
      </span>
    );
  return null;
}

function Zoomschuif({ zoom }: { zoom: number }) {
  const bediening = useZoomBediening();
  if (!bediening) return null;
  const procent = Math.round(zoom * 100);
  return (
    <span className="statusbalk-zoom" role="group" aria-label="Zoom">
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label="Uitzoomen"
        title="Uitzoomen · Ctrl+−"
        onClick={() => bediening.zet(stap(zoom, -1))}
      >
        <Minus size={12} />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={zoomNaarSchuif(zoom)}
        aria-label="Zoom"
        aria-valuetext={`${procent}%`}
        title="Ctrl + scrollwiel of Ctrl + = en Ctrl + − om te zoomen"
        onChange={(event) => bediening.zet(schuifNaarZoom(Number(event.target.value)))}
      />
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label="Inzoomen"
        title="Inzoomen · Ctrl+="
        onClick={() => bediening.zet(stap(zoom, 1))}
      >
        <Plus size={12} />
      </button>
      <button
        type="button"
        className="statusbalk-procent"
        aria-label={`Zoom ${procent}%, terug naar 100%`}
        title="Terug naar 100% · Ctrl+0"
        onClick={() => bediening.zet(1)}
      >
        {procent}%
      </button>
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label="Passend"
        title={bediening.passend ? "Passend in het venster" : "Passend is hier niet beschikbaar"}
        disabled={!bediening.passend}
        onClick={() => bediening.passend?.()}
      >
        <Maximize2 size={12} />
      </button>
    </span>
  );
}

/** De statusbalk onderaan de werkruimte: module-informatie, zoom en status. */
export function Statusbalk({
  soort,
  moduleNaam,
  document,
  databaseGewijzigd,
  emailOngelezen,
  aantalGewijzigd,
  versieLabel,
}: StatusbalkProps) {
  const { statusbalk } = useInstellingen();
  const status = document
    ? !document.gereed
      ? "Laden…"
      : document.gewijzigd
        ? "Niet-opgeslagen wijzigingen"
        : "Gereed"
    : soort === "database" && databaseGewijzigd !== null && statusbalk.database
      ? databaseGewijzigd
        ? "Werkkopie: niet-opgeslagen wijzigingen"
        : "Werkkopie: ongewijzigd"
      : soort === "email" && emailOngelezen
        ? `${emailOngelezen} ongelezen in Postvak IN`
        : aantalGewijzigd
          ? `${aantalGewijzigd} ${aantalGewijzigd === 1 ? "tabblad" : "tabbladen"} met niet-opgeslagen wijzigingen`
          : `Ontwikkelversie ${versieLabel}`;
  // Rechtermuisknop: statusbalk-items aan of uit (src/tekst/info).
  const menu = useStatusbalkMenu();
  return (
    <footer className="office-statusbalk" aria-label="Statusbalk" onContextMenu={menu.onContextMenu}>
      {menu.element}
      <span>
        <HardDrive size={12} aria-hidden="true" />
        <i aria-hidden="true" />
        Lokaal
      </span>
      <span className="statusbalk-naam">{moduleNaam}</span>
      {document?.gereed && <ModuleInfo soort={soort} />}
      <span className="office-statusrechts">
        {soort === "docx" && document?.gereed && <TekstWeergaveKnoppen />}
        {document && document.zoom !== null && statusbalk.zoom && (
          <Zoomschuif zoom={document.zoom} />
        )}
        <span role="status" className="statusbalk-status">
          {status}
        </span>
        {document && <kbd>Ctrl+S</kbd>}
      </span>
    </footer>
  );
}
