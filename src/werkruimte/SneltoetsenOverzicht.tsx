import { useMemo, useState, useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import { Dialoog } from "./Dialoog";
import { useInstellingen } from "../instellingen";
import {
  alleSneltoetsen,
  geldtIn,
  inProfiel,
  moduleNamen,
  profielNamen,
  registratieVersie,
  toetsDelen,
  volgRegistraties,
  zoekSneltoetsen,
  type SneltoetsInfo,
  type SneltoetsModule,
} from "../lint/sneltoetsenlijst";

const volgorde: SneltoetsModule[] = [
  "algemeen",
  "tekst",
  "rekenblad",
  "presentatie",
  "database",
  "email",
  "notities",
];

/** Secties voor het overzicht: de actieve module eerst, dan Algemeen, dan de rest. */
export function sneltoetsSecties(
  lijst: readonly SneltoetsInfo[],
  module: SneltoetsModule | null,
) {
  const eerst = module && module !== "algemeen" ? [module, "algemeen" as const] : ["algemeen" as const];
  const modules = [...eerst, ...volgorde.filter((m) => !eerst.includes(m as never))];
  return modules
    .map((m) => ({
      module: m,
      naam: moduleNamen[m],
      toetsen: lijst.filter((info) => info.module === m),
    }))
    .filter((sectie) => sectie.toetsen.length > 0);
}

export function Toets({ toets }: { toets: string }) {
  const delen = toetsDelen(toets);
  return (
    <span className="werkruimte-toets">
      {delen.map((deel, i) => (
        <kbd key={i}>{deel}</kbd>
      ))}
    </span>
  );
}

export function SneltoetsenOverzicht({
  module,
  sluit,
}: {
  module: SneltoetsModule | null;
  sluit: () => void;
}) {
  const [zoek, setZoek] = useState("");
  const versie = useSyncExternalStore(volgRegistraties, registratieVersie);
  // Tekst: alleen het gekozen sneltoetsprofiel (instellingen).
  const profiel = useInstellingen().tekst.sneltoetsprofiel;
  const secties = useMemo(
    () =>
      sneltoetsSecties(
        zoekSneltoetsen(alleSneltoetsen(), zoek).filter((info) => inProfiel(info, profiel)),
        module,
      ),
    [zoek, module, versie, profiel],
  );
  const aantal = secties.reduce((som, s) => som + s.toetsen.length, 0);
  return (
    <Dialoog titel="Sneltoetsen" sluit={sluit} className="werkruimte-sneltoetsen">
      <label className="werkruimte-zoek">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          data-autofocus
          value={zoek}
          onChange={(event) => setZoek(event.target.value)}
          placeholder="Zoek een opdracht of toets"
          aria-label="Sneltoetsen zoeken"
          aria-describedby="sneltoetsen-aantal"
        />
      </label>
      <p id="sneltoetsen-aantal" className="werkruimte-aantal" role="status">
        {aantal === 0
          ? "Geen sneltoetsen gevonden."
          : `${aantal} ${aantal === 1 ? "sneltoets" : "sneltoetsen"}`}
      </p>
      <div className="werkruimte-sneltoetslijst">
        {secties.map((sectie) => (
          <section key={sectie.module} aria-labelledby={`sneltoetsen-${sectie.module}`}>
            <h3 id={`sneltoetsen-${sectie.module}`}>
              {sectie.naam}
              {sectie.module === module && <small> · huidige module</small>}
              {sectie.module === "tekst" && <small> · profiel {profielNamen[profiel]}</small>}
            </h3>
            <table>
              <thead className="werkruimte-verborgen">
                <tr>
                  <th scope="col">Opdracht</th>
                  <th scope="col">Toets</th>
                </tr>
              </thead>
              <tbody>
                {sectie.toetsen.map((info) => (
                  <tr
                    key={`${info.module}-${info.toets}`}
                    data-elders={module && sectie.module === "algemeen" && !geldtIn(info, module) ? "" : undefined}
                  >
                    <td>
                      {info.omschrijving}
                      {info.alleen && (
                        <small> · in {info.alleen.map((m) => moduleNamen[m]).join(", ")}</small>
                      )}
                      {info.behalve && (
                        <small> · niet in {info.behalve.map((m) => moduleNamen[m]).join(", ")}</small>
                      )}
                    </td>
                    <td>
                      <Toets toets={info.toets} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <p className="werkruimte-voetnoot">
        Op macOS gebruik je ⌘ in plaats van Ctrl. Druk op Alt of F10 voor toetstips in het lint.
      </p>
    </Dialoog>
  );
}
