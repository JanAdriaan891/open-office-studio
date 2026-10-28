import { useState } from "react";
import {
  Database,
  FileQuestion,
  FileText,
  Pin,
  Presentation,
  Sheet,
  X,
} from "lucide-react";
import { kantoorModule } from "../packages/email/src/kantoor";
import { useRecent, type RecentBestand } from "./recent";
import "./levenscyclus.css";

const ICONEN = {
  docx: FileText,
  xlsx: Sheet,
  pptx: Presentation,
  database: Database,
} as const;

const datumNotatie = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function datumTekst(datum: number, nu = Date.now()) {
  const dag = 86_400_000;
  const vandaag = new Date(nu).setHours(0, 0, 0, 0);
  const tijd = new Date(datum).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (datum >= vandaag) return `Vandaag ${tijd}`;
  if (datum >= vandaag - dag) return `Gisteren ${tijd}`;
  return datumNotatie.format(datum);
}

/**
 * Lijst met recente bestanden voor Start (het bestandsmenu). Desktop: openen
 * met één klik, ontbrekende bestanden worden gemeld. Browser: alleen namen;
 * klikken opent de bestandskiezer.
 */
export function RecenteBestanden({
  bezig,
  bladeren,
}: {
  bezig: boolean;
  /** Bestandskiezer (browser, of als een bestand niet meer bestaat). */
  bladeren: () => void;
}) {
  const recent = useRecent();
  const [melding, setMelding] = useState("");
  if (!recent.lijst.length) return null;

  async function open(bestand: RecentBestand) {
    setMelding("");
    if (!recent.desktop) {
      bladeren();
      return;
    }
    try {
      if (!(await recent.open(bestand.id)))
        setMelding(
          `${bestand.naam} is niet meer te vinden in ${bestand.map || "de oorspronkelijke map"}. Haal het uit de lijst met ✕ of open het via Bladeren.`,
        );
    } catch (e) {
      setMelding(String(e));
    }
  }

  return (
    <section className="start-recent" aria-labelledby="start-recent-titel">
      <div className="start-sectiekop">
        <h2 id="start-recent-titel">Recent</h2>
        <span>
          {recent.desktop
            ? "Recent geopende en opgeslagen bestanden"
            : "Deze browser onthoudt alleen namen; kies het bestand opnieuw"}
          <button
            className="start-recent-wis"
            disabled={bezig}
            onClick={() => {
              setMelding("");
              recent.wis();
            }}
            title="Lijst wissen; vastgezette bestanden blijven staan"
          >
            Lijst wissen
          </button>
        </span>
      </div>
      {melding && (
        <p className="start-recent-melding" role="status">
          {melding}
        </p>
      )}
      <ul className="start-recent-lijst">
        {recent.lijst.map((bestand) => {
          const module = kantoorModule(bestand.naam);
          const Icoon = module ? ICONEN[module] : FileQuestion;
          const ontbreekt = recent.desktop && !bestand.bestaat;
          return (
            <li
              key={bestand.id}
              className={`start-recent-item module-${module ?? "onbekend"}${ontbreekt ? " ontbreekt" : ""}`}
            >
              <button
                className="start-recent-open"
                disabled={bezig}
                onClick={() => void open(bestand)}
                title={
                  ontbreekt
                    ? "Niet gevonden"
                    : bestand.map
                      ? `${bestand.map} · openen`
                      : "Bestand kiezen"
                }
              >
                <span className="module-icoon">
                  <Icoon size={17} />
                </span>
                <span className="start-recent-tekst">
                  <strong>{bestand.naam}</strong>
                  <small>
                    {ontbreekt ? "Niet gevonden · " : ""}
                    {bestand.map || "Alleen de naam is bekend"}
                  </small>
                </span>
                <time dateTime={new Date(bestand.datum).toISOString()}>
                  {datumTekst(bestand.datum)}
                </time>
              </button>
              <button
                className={`start-recent-actie${bestand.vast ? " is-vast" : ""}`}
                disabled={bezig}
                onClick={() => recent.vastzetten(bestand.id, !bestand.vast)}
                aria-pressed={bestand.vast}
                aria-label={`${bestand.naam} ${bestand.vast ? "losmaken" : "vastzetten"}`}
                title={bestand.vast ? "Losmaken" : "Bovenaan vastzetten"}
              >
                <Pin size={14} fill={bestand.vast ? "currentColor" : "none"} />
              </button>
              <button
                className="start-recent-actie"
                disabled={bezig}
                onClick={() => recent.verwijder(bestand.id)}
                aria-label={`${bestand.naam} uit de lijst halen`}
                title="Uit de lijst halen (het bestand blijft bestaan)"
              >
                <X size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
