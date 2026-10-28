import { useEffect, useId, useState } from "react";
import { Dialoog } from "./Dialoog";
import { toonSneltoetsen } from "./gebeurtenissen";
import {
  useInstellingen,
  wijzigInstellingen,
  zetTerug,
  type Instellingen,
} from "../instellingen";
import { herstelInterval, INTERVAL_SLEUTEL } from "../herstel";
import {
  conversieStatus,
  kiesConversieprogramma,
  wisConversieprogramma,
  type ConversieStatus,
} from "../formaten";

/** Dezelfde sleutel als de auteursnaam in Tekst (src/lint/tekst-opdrachten.tsx). */
const AUTEUR = "open-tekst-auteur";
function leesAuteur() {
  try {
    return localStorage.getItem(AUTEUR) ?? "";
  } catch {
    return "";
  }
}

const formaten: {
  soort: keyof Instellingen["opslagformaat"];
  naam: string;
  opties: [string, string][];
}[] = [
  { soort: "docx", naam: "Tekst", opties: [["docx", "Word (.docx)"], ["odt", "OpenDocument (.odt)"]] },
  { soort: "xlsx", naam: "Rekenblad", opties: [["xlsx", "Excel (.xlsx)"], ["ods", "OpenDocument (.ods)"]] },
  {
    soort: "pptx",
    naam: "Presentatie",
    opties: [["pptx", "PowerPoint (.pptx)"], ["odp", "OpenDocument (.odp)"]],
  },
];

const statusItems: [keyof Instellingen["statusbalk"], string][] = [
  ["zoom", "Zoomschuif"],
  ["tekst", "Tekst: pagina, woorden en tekens"],
  ["taal", "Tekst: taal (en spelling)"],
  ["bijhouden", "Tekst: wijzigingen bijhouden"],
  ["weergave", "Tekst: weergaveknoppen (afdrukweergave, leesmodus)"],
  ["rekenblad", "Rekenblad: som, gemiddelde en aantal van de selectie"],
  ["presentatie", "Presentatie: dia x van y"],
  ["database", "Database: status van de werkkopie"],
];

function Conversie() {
  const desktop = "__TAURI_INTERNALS__" in window;
  const [status, setStatus] = useState<ConversieStatus | null>(null);
  const [fout, setFout] = useState("");
  useEffect(() => {
    if (!desktop) return;
    conversieStatus()
      .then(setStatus)
      .catch((e) => setFout(String(e)));
  }, [desktop]);
  if (!desktop)
    return (
      <p className="werkruimte-uitleg">
        Het conversieprogramma (LibreOffice) kies je in de desktopapp. In de browser werken
        alleen de eigen formaten.
      </p>
    );
  return (
    <>
      <p className="werkruimte-uitleg" role="status">
        {status === null
          ? "Status ophalen…"
          : status.gevonden
            ? `Gevonden: ${status.pad ?? "soffice"}${status.versie ? ` (${status.versie})` : ""}${status.bron === "instelling" ? ", zelf gekozen" : ", automatisch gevonden"}.`
            : "Geen conversieprogramma gevonden. Kies soffice van LibreOffice om ODF en oudere formaten te openen en op te slaan."}
      </p>
      {fout && <p className="werkruimte-fout">{fout}</p>}
      <div className="werkruimte-rij">
        <button
          type="button"
          className="werkruimte-knop"
          onClick={() =>
            kiesConversieprogramma()
              .then((nieuw) => nieuw && setStatus(nieuw))
              .catch((e) => setFout(String(e)))
          }
        >
          Programma kiezen…
        </button>
        <button
          type="button"
          className="werkruimte-knop"
          disabled={status?.bron !== "instelling"}
          onClick={() =>
            wisConversieprogramma()
              .then(setStatus)
              .catch((e) => setFout(String(e)))
          }
        >
          Automatisch zoeken
        </button>
      </div>
    </>
  );
}

export function InstellingenVenster({ sluit }: { sluit: () => void }) {
  const instellingen = useInstellingen();
  const id = useId();
  const [auteur, setAuteur] = useState(leesAuteur);
  // Het herstelinterval hoort bij automatisch herstel (src/herstel.ts, 1–60 min).
  const [interval, setHerstel] = useState(() => String(herstelInterval() / 60_000));
  const [terugzetten, setTerugzetten] = useState(false);
  const [melding, setMelding] = useState("");
  const wijzig: typeof wijzigInstellingen = (wijziging) => {
    wijzigInstellingen(wijziging);
    setMelding("Opgeslagen.");
  };

  return (
    <Dialoog
      titel="Instellingen"
      sluit={sluit}
      className="werkruimte-instellingen"
      acties={
        <>
          <span className="werkruimte-melding" role="status">
            {melding}
          </span>
          {terugzetten ? (
            <>
              <button type="button" className="werkruimte-knop" onClick={() => setTerugzetten(false)}>
                Annuleren
              </button>
              <button
                type="button"
                className="werkruimte-knop is-primair"
                onClick={() => {
                  zetTerug();
                  setTerugzetten(false);
                  setMelding("Standaardinstellingen hersteld.");
                }}
              >
                Ja, standaard herstellen
              </button>
            </>
          ) : (
            <button type="button" className="werkruimte-knop" onClick={() => setTerugzetten(true)}>
              Standaard herstellen…
            </button>
          )}
          <button type="button" className="werkruimte-knop is-primair" onClick={sluit}>
            Klaar
          </button>
        </>
      }
    >
      <fieldset className="werkruimte-groep">
        <legend>Weergave</legend>
        <div className="werkruimte-keuzes" role="radiogroup" aria-labelledby={`${id}-thema`}>
          <span id={`${id}-thema`} className="werkruimte-label">
            Thema
          </span>
          {(
            [
              ["light", "Licht"],
              ["forge", "Forge (donker)"],
              ["systeem", "Zoals het systeem"],
            ] as const
          ).map(([waarde, naam]) => (
            <label key={waarde}>
              <input
                type="radio"
                name={`${id}-thema`}
                checked={instellingen.thema === waarde}
                onChange={() => wijzig({ thema: waarde })}
                data-autofocus={instellingen.thema === waarde ? "" : undefined}
              />
              {naam}
            </label>
          ))}
        </div>
        <label className="werkruimte-vink">
          <input
            type="checkbox"
            checked={instellingen.lint.compact}
            onChange={(e) => wijzig({ lint: { compact: e.target.checked } })}
          />
          Compact lint: alleen iconen bij kleine knoppen
        </label>
        <label className="werkruimte-vink">
          <input
            type="checkbox"
            checked={instellingen.lint.ingeklapt}
            onChange={(e) => wijzig({ lint: { ingeklapt: e.target.checked } })}
          />
          Lint standaard ingeklapt (alleen de tabs; Ctrl+F1 wisselt)
        </label>
      </fieldset>

      <fieldset className="werkruimte-groep">
        <legend>Statusbalk</legend>
        {statusItems.map(([sleutel, naam]) => (
          <label key={sleutel} className="werkruimte-vink">
            <input
              type="checkbox"
              checked={instellingen.statusbalk[sleutel]}
              onChange={(e) => wijzig({ statusbalk: { [sleutel]: e.target.checked } })}
            />
            {naam}
          </label>
        ))}
      </fieldset>

      <fieldset className="werkruimte-groep">
        <legend>Opslaan</legend>
        <p className="werkruimte-uitleg">
          Standaardformaat voor nieuwe documenten. ODF vraagt het conversieprogramma
          (desktopapp); Opslaan als laat je altijd een ander formaat kiezen.
        </p>
        {formaten.map(({ soort, naam, opties }) => (
          <label key={soort} className="werkruimte-veld">
            <span>{naam}</span>
            <select
              value={instellingen.opslagformaat[soort]}
              onChange={(e) =>
                wijzig({ opslagformaat: { [soort]: e.target.value } as Partial<Instellingen["opslagformaat"]> })
              }
            >
              {opties.map(([waarde, label]) => (
                <option key={waarde} value={waarde}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="werkruimte-veld">
          <span>Herstelpunt elke</span>
          <span className="werkruimte-eenheid">
            <input
              type="number"
              min={1}
              max={60}
              step={1}
              value={interval}
              aria-describedby={`${id}-herstel`}
              onChange={(e) => {
                setHerstel(e.target.value);
                const minuten = Number(e.target.value);
                if (e.target.value === "" || !Number.isFinite(minuten)) return;
                try {
                  localStorage.setItem(
                    INTERVAL_SLEUTEL,
                    String(Math.min(60, Math.max(1, Math.round(minuten)))),
                  );
                  setMelding("Opgeslagen.");
                } catch {
                  setMelding("Het interval kon niet worden bewaard.");
                }
              }}
            />
            minuten
          </span>
        </label>
        <p id={`${id}-herstel`} className="werkruimte-uitleg">
          Hoe vaak een herstelkopie van gewijzigde documenten wordt gemaakt (1 tot 60 minuten),
          voor herstel na een onverwacht afsluiten.
        </p>
        <label className="werkruimte-veld">
          <span>Naam bij opmerkingen</span>
          <input
            type="text"
            value={auteur}
            autoComplete="name"
            onChange={(e) => {
              setAuteur(e.target.value);
              try {
                localStorage.setItem(AUTEUR, e.target.value);
                setMelding("Opgeslagen.");
              } catch {
                setMelding("De naam kon niet worden bewaard.");
              }
            }}
          />
        </label>
      </fieldset>

      <fieldset className="werkruimte-groep">
        <legend>Conversieprogramma</legend>
        <Conversie />
      </fieldset>

      <fieldset className="werkruimte-groep">
        <legend>Privacy</legend>
        <div className="werkruimte-keuzes" role="radiogroup" aria-labelledby={`${id}-extern`}>
          <span id={`${id}-extern`} className="werkruimte-label">
            Externe afbeeldingen in e-mail
          </span>
          <label>
            <input
              type="radio"
              name={`${id}-extern`}
              checked={instellingen.emailExterneInhoud === "account"}
              onChange={() => wijzig({ emailExterneInhoud: "account" })}
            />
            Volgens de instelling per account
          </label>
          <label>
            <input
              type="radio"
              name={`${id}-extern`}
              checked={instellingen.emailExterneInhoud === "nooit"}
              onChange={() => wijzig({ emailExterneInhoud: "nooit" })}
            />
            Nooit automatisch laden (per bericht toestaan blijft mogelijk)
          </label>
        </div>
      </fieldset>

      <fieldset className="werkruimte-groep">
        <legend>Toetsenbord</legend>
        <button type="button" className="werkruimte-knop" onClick={toonSneltoetsen}>
          Sneltoetsen bekijken · F1
        </button>
      </fieldset>
    </Dialoog>
  );
}
