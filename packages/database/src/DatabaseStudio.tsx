import { useEffect, useRef, useState } from "react";
import {
  Database,
  FolderOpen,
  Table2,
  Code2,
  Search,
  Download,
  Sun,
  Moon,
  ShieldCheck,
  Braces,
  X,
  Link2,
  FileText,
  FileJson,
  ClipboardList,
  LayoutTemplate,
  type LucideIcon,
} from "lucide-react";
import {
  csv,
  rapportAlsTekst,
  voorbeeld,
  type DatabaseObject,
  type DatabaseSession,
  type Objectsoort,
} from "./model";
import { kleurTokens } from "./syntaxis";
import { DatabaseClient } from "./database-client";
import { Ribbon, Groep, Actie } from "../../../src/Ribbon";
import { downloadDatabaseUitvoer, type DatabaseUitvoer } from "./uitvoer";
const soorten: {
  soort: Objectsoort;
  titel: string;
  icoon: LucideIcon;
  rapport: string;
  altijd?: boolean;
}[] = [
  {
    soort: "Tabel",
    titel: "Tabellen",
    icoon: Table2,
    rapport: "Tabellen",
    altijd: true,
  },
  {
    soort: "Gekoppelde tabel",
    titel: "Gekoppelde tabellen",
    icoon: Link2,
    rapport: "Gekoppelde tabellen",
  },
  {
    soort: "Query",
    titel: "Query’s",
    icoon: Braces,
    rapport: "Opgeslagen query’s",
    altijd: true,
  },
  {
    soort: "Relatie",
    titel: "Relaties",
    icoon: Link2,
    rapport: "Relaties",
    altijd: true,
  },
  {
    soort: "VBA",
    titel: "VBA-modules",
    icoon: Code2,
    rapport: "VBA-modules",
    altijd: true,
  },
  {
    soort: "Formulier",
    titel: "Formulieren",
    icoon: LayoutTemplate,
    rapport: "Formulieren",
  },
  {
    soort: "Rapport",
    titel: "Rapporten",
    icoon: FileText,
    rapport: "Rapporten",
  },
  {
    soort: "Macro",
    titel: "Macro’s",
    icoon: ClipboardList,
    rapport: "Macro’s",
  },
];
const RAPPORT = "__rapport";
function Bron({ bron, taal }: { bron: string; taal: "vba" | "sql" }) {
  return (
    <pre className="database-bron">
      <code>
        {kleurTokens(bron, taal).map((token, index) =>
          token.soort === "gewoon" ? (
            token.tekst
          ) : (
            <span key={index} className={`syntax-${token.soort}`}>
              {token.tekst}
            </span>
          ),
        )}
      </code>
    </pre>
  );
}
function Details({ object }: { object: DatabaseObject }) {
  return (
    <>
      {!!object.eigenschappen?.length && (
        <dl className="database-eigenschappen">
          {object.eigenschappen.map(([sleutel, waarde]) => (
            <div key={sleutel}>
              <dt>{sleutel}</dt>
              <dd>{waarde}</dd>
            </div>
          ))}
        </dl>
      )}
      {!!object.beperkingen?.length && (
        <ul className="database-beperkingen" aria-label="Beperkingen">
          {object.beperkingen.map((beperking) => (
            <li key={beperking}>{beperking}</li>
          ))}
        </ul>
      )}
    </>
  );
}
function exportBestand(object: DatabaseObject) {
  if (object.soort === "Tabel") return ".csv";
  if (object.soort === "VBA") return object.bron ? ".bas" : null;
  if (object.soort === "Query") return object.bron ? ".sql" : null;
  return null;
}
export function DatabaseStudio({
  bestandsmenu,
  inactief = false,
  registreerOpenen,
  bewaarUitvoer = downloadDatabaseUitvoer,
}: {
  bestandsmenu?: () => void;
  inactief?: boolean;
  registreerOpenen?: (openen: (() => void) | null) => void;
  bewaarUitvoer?: DatabaseUitvoer;
} = {}) {
  const [sessie, setSessie] = useState<DatabaseSession | null>(null);
  const [selectie, setSelectie] = useState("");
  const [zoeken, setZoeken] = useState("");
  const [fout, setFout] = useState("");
  const [exportmelding, setExportmelding] = useState("");
  const [exportBezig, setExportBezig] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [donker, setDonker] = useState(false);
  const invoer = useRef<HTMLInputElement>(null);
  const lezer = useRef<DatabaseClient | null>(null);
  const inlezen = useRef<DatabaseClient | null>(null);
  const actief = useRef(true);
  const [paginaStart, setPaginaStart] = useState(0);
  useEffect(() => {
    registreerOpenen?.(
      bezig || exportBezig ? null : () => invoer.current?.click(),
    );
    return () => registreerOpenen?.(null);
  }, [registreerOpenen, bezig, exportBezig]);
  useEffect(() => {
    actief.current = true;
    return () => {
      actief.current = false;
      inlezen.current?.sluit();
      lezer.current?.sluit();
      inlezen.current = null;
      lezer.current = null;
    };
  }, []);
  const object = sessie?.objecten.find((item) => item.id === selectie);
  const rijen =
    object?.rijen?.filter((rij) =>
      rij.some((cel) => cel.toLowerCase().includes(zoeken.toLowerCase())),
    ) ?? [];
  function sluit() {
    lezer.current?.sluit();
    lezer.current = null;
    setSessie(null);
    setSelectie("");
    setZoeken("");
    setFout("");
    setExportmelding("");
  }
  const extensie = object ? exportBestand(object) : null;
  const exporteerbaar =
    !!object && !!extensie && !(object.soort === "Tabel" && !object.rijen);
  async function bewaar(naam: string, inhoud: string, type: string) {
    if (bezig || exportBezig) return;
    setExportBezig(true);
    setFout("");
    setExportmelding("");
    try {
      const resultaat = await bewaarUitvoer(naam, inhoud, type);
      if (actief.current)
        setExportmelding(
          resultaat.status === "opgeslagen"
            ? `Opgeslagen: ${resultaat.pad}`
            : resultaat.status === "geannuleerd"
              ? "Exporteren geannuleerd."
              : "Download aangevraagd. Controleer het bestand in je downloads.",
        );
    } catch (error) {
      if (actief.current)
        setFout(
          "Exporteren mislukt: " +
            (error instanceof Error ? error.message : String(error)),
        );
    } finally {
      if (actief.current) setExportBezig(false);
    }
  }
  function exporteer() {
    if (!object || !extensie || !exporteerbaar) return;
    const bestandsnaam = object.naam.replace(/[\\/:*?"<>|~]+/g, "_") + extensie;
    void bewaar(
      bestandsnaam,
      object.soort === "Tabel"
        ? csv(object.kolommen ?? [], rijen)
        : object.soort === "VBA"
          ? object.bron!.replace(/\r?\n/g, "\r\n")
          : object.bron!,
      object.soort === "Tabel"
        ? "text/csv;charset=utf-8"
        : "text/plain;charset=utf-8",
    );
  }
  function exporteerRapport(soort: "json" | "txt") {
    const rapport = sessie?.rapport;
    if (!rapport) return;
    const basis = rapport.bestand.replace(/\.[^.]+$/, "");
    void bewaar(
      `${basis}-compatibiliteit.${soort}`,
      soort === "json"
        ? JSON.stringify(rapport, null, 2)
        : rapportAlsTekst(rapport),
      soort === "json"
        ? "application/json;charset=utf-8"
        : "text/plain;charset=utf-8",
    );
  }
  function openVoorbeeld() {
    lezer.current?.sluit();
    lezer.current = null;
    setSessie(voorbeeld);
    setSelectie("materialen");
    setZoeken("");
    setFout("");
    setPaginaStart(0);
    setExportmelding("");
  }
  async function kiesObject(id: string, start = 0) {
    setSelectie(id);
    setZoeken("");
    setFout("");
    const client = lezer.current;
    const doel = sessie?.objecten.find((item) => item.id === id);
    if (!client || doel?.soort !== "Tabel") {
      setPaginaStart(start);
      return;
    }
    setBezig(true);
    try {
      const tabel = await client.tabel(id, start);
      if (lezer.current === client) {
        setPaginaStart(start);
        setSessie((huidig) =>
          huidig
            ? {
                ...huidig,
                objecten: huidig.objecten.map((item) =>
                  item.id === id ? { ...item, ...tabel } : item,
                ),
              }
            : huidig,
        );
      }
    } catch (error) {
      if (lezer.current === client)
        setFout("Deze tabel kon niet worden gelezen: " + String(error));
    } finally {
      if (lezer.current === client) setBezig(false);
    }
  }
  return (
    <div
      className="database-app"
      data-theme={donker ? "dark" : "light"}
      inert={inactief}
    >
      <Ribbon
        bestand={bestandsmenu}
        tabs={[
          {
            id: "start",
            naam: "Start",
            inhoud: (
              <>
                <Groep naam="Database">
                  <Actie
                    icoon={FolderOpen}
                    naam={bezig ? "Bestand lezen…" : "Database kiezen"}
                    groot
                    disabled={bezig || exportBezig}
                    onClick={() => invoer.current?.click()}
                  />
                  <Actie
                    icoon={Database}
                    naam="Voorbeeld verkennen"
                    groot
                    disabled={bezig || exportBezig}
                    onClick={openVoorbeeld}
                  />
                </Groep>
                <Groep naam="Object">
                  <Actie
                    icoon={Download}
                    naam="Exporteren"
                    groot
                    disabled={!exporteerbaar || bezig || exportBezig}
                    onClick={exporteer}
                  />
                </Groep>
                <Groep naam="Compatibiliteit">
                  <Actie
                    icoon={ShieldCheck}
                    naam="Rapport tonen"
                    groot
                    disabled={!sessie?.rapport || bezig}
                    actief={selectie === RAPPORT}
                    onClick={() => setSelectie(RAPPORT)}
                  />
                  <Actie
                    icoon={FileJson}
                    naam="Rapport als JSON"
                    disabled={!sessie?.rapport || bezig || exportBezig}
                    onClick={() => exporteerRapport("json")}
                  />
                  <Actie
                    icoon={FileText}
                    naam="Rapport als tekst"
                    disabled={!sessie?.rapport || bezig || exportBezig}
                    onClick={() => exporteerRapport("txt")}
                  />
                </Groep>
                <Groep naam="Bestand">
                  <Actie
                    icoon={X}
                    naam="Database sluiten"
                    groot
                    disabled={!sessie || bezig || exportBezig}
                    onClick={sluit}
                  />
                </Groep>
              </>
            ),
          },
          {
            id: "beeld",
            naam: "Beeld",
            inhoud: (
              <Groep naam="Weergave">
                <Actie
                  icoon={Sun}
                  naam="Licht"
                  groot
                  actief={!donker}
                  onClick={() => setDonker(false)}
                />
                <Actie
                  icoon={Moon}
                  naam="Donker"
                  groot
                  actief={donker}
                  onClick={() => setDonker(true)}
                />
              </Groep>
            ),
          },
        ]}
      />
      <div className="database-documentbalk">
        <Database size={15} />
        <strong>{sessie?.naam ?? "Geen database geopend"}</strong>
        <span>Alleen lezen · experimenteel</span>
      </div>
      <input
        ref={invoer}
        hidden
        type="file"
        accept=".mdb,.accdb"
        onChange={async (event) => {
          const bestand = event.target.files?.[0];
          event.target.value = "";
          if (!bestand) return;
          setBezig(true);
          setFout("");
          setExportmelding("");
          let client: DatabaseClient | null = null;
          try {
            client = new DatabaseClient();
            inlezen.current = client;
            const nieuw = await client.open(bestand);
            if (!actief.current) {
              client.sluit();
              return;
            }
            lezer.current?.sluit();
            lezer.current = client;
            setSessie(nieuw);
            setSelectie("");
            setZoeken("");
            setPaginaStart(0);
          } catch (error) {
            client?.sluit();
            if (actief.current)
              setFout(
                error instanceof Error
                  ? error.message
                  : "Bestand kon niet worden gelezen.",
              );
          } finally {
            if (inlezen.current === client) inlezen.current = null;
            if (actief.current) setBezig(false);
          }
        }}
      />
      {fout && (
        <div role="alert" className="melding fout">
          {fout}
        </div>
      )}
      {exportmelding && (
        <div role="status" className="melding">
          {exportmelding}
        </div>
      )}
      <main>
        <aside>
          <h2>Databaseobjecten</h2>
          <p className="bestandsnaam">
            {sessie?.naam ?? "Geen database geselecteerd"}
          </p>
          {soorten.map(({ soort, titel, icoon: Icoon, rapport, altijd }) => {
            const lijst =
              sessie?.objecten.filter((item) => item.soort === soort) ?? [];
            if (!lijst.length && !altijd) return null;
            const status = sessie?.rapport?.regels.find(
              (regel) => regel.onderdeel === rapport,
            )?.status;
            return (
              <section key={soort}>
                <h3>{titel}</h3>
                {lijst.map((item) => (
                  <button
                    disabled={bezig || exportBezig}
                    className={selectie === item.id ? "selected" : ""}
                    key={item.id}
                    onClick={() => void kiesObject(item.id)}
                  >
                    <Icoon size={16} /> {item.naam}
                  </button>
                ))}
                {!lijst.length && (
                  <p className="muted">
                    {!sessie
                      ? "Nog niet uitgelezen"
                      : sessie.voorbeeld
                        ? "Niet in het voorbeeld"
                        : status === "niet gelezen"
                          ? "Niet gelezen · zie rapport"
                          : "Niet aanwezig"}
                  </p>
                )}
              </section>
            );
          })}
          {sessie?.rapport && (
            <section>
              <h3>Compatibiliteit</h3>
              <button
                disabled={bezig || exportBezig}
                className={selectie === RAPPORT ? "selected" : ""}
                onClick={() => setSelectie(RAPPORT)}
              >
                <ShieldCheck size={16} /> Rapport
              </button>
            </section>
          )}
          <div className="aside-note">
            Formulieren, rapporten en macro’s worden alleen geïnventariseerd.
            Niets wordt uitgevoerd.
          </div>
        </aside>
        <article>
          {!sessie ? (
            <div className="welkom">
              <div className="db-icon">
                <Database size={44} />
              </div>
              <h2>Geef oude databases een nieuwe werkplek</h2>
              <p>
                Kies een .mdb- of .accdb-bestand, of verken de objectbrowser met
                voorbeeldgegevens.
              </p>
              <div className="kaarten">
                <section>
                  <Table2 />
                  <h3>Tabellen</h3>
                  <p>
                    Tabellen lokaal bekijken, per pagina doorzoeken en
                    exporteren.
                  </p>
                </section>
                <section>
                  <Braces />
                  <h3>Query’s</h3>
                  <p>
                    Opgeslagen query’s als SQL reconstrueren, bekijken en als
                    .sql bewaren.
                  </p>
                </section>
                <section>
                  <Code2 />
                  <h3>VBA-scripts</h3>
                  <p>
                    Aanwezige VBA-bron tonen en als .bas bewaren. Er wordt niets
                    uitgevoerd.
                  </p>
                </section>
              </div>
              <p className="melding">
                MDB/ACCDB-bestanden worden lokaal en alleen-lezen geopend, met
                een compatibiliteitsrapport per bestand. Macro’s en VBA worden
                nooit uitgevoerd; bewerken volgt later.
              </p>
            </div>
          ) : (
            <>
              <div className="melding" role="status">
                {sessie.melding}
              </div>
              {selectie === RAPPORT && sessie.rapport ? (
                <>
                  <div className="object-toolbar">
                    <h2>
                      Compatibiliteitsrapport
                      <small>
                        {sessie.rapport.formaat} · SHA-256{" "}
                        {sessie.rapport.sha256.slice(0, 16)}…
                      </small>
                    </h2>
                    <button
                      disabled={bezig || exportBezig}
                      onClick={() => exporteerRapport("json")}
                    >
                      <FileJson size={16} /> JSON
                    </button>
                    <button
                      disabled={bezig || exportBezig}
                      onClick={() => exporteerRapport("txt")}
                    >
                      <FileText size={16} /> Tekst
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table className="database-rapport">
                      <thead>
                        <tr>
                          <th>Onderdeel</th>
                          <th>Status</th>
                          <th>Aantal</th>
                          <th>Toelichting</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessie.rapport.regels.map((regel) => (
                          <tr key={regel.onderdeel}>
                            <td>{regel.onderdeel}</td>
                            <td>
                              <span
                                className={`database-status status-${regel.status.replaceAll(" ", "-")}`}
                              >
                                {regel.status}
                              </span>
                            </td>
                            <td>{regel.aantal ?? "–"}</td>
                            <td>{regel.toelichting}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="muted">
                    Gelezen met {sessie.rapport.lezer}. Het rapport bevat alleen
                    aantallen, namen en meldingen, geen tabelgegevens.
                  </p>
                </>
              ) : object ? (
                <>
                  <div className="object-toolbar">
                    <h2>
                      {object.naam}
                      <small>
                        {sessie.voorbeeld ? "Voorbeeld · " : ""}
                        {object.soort}
                      </small>
                    </h2>
                    {extensie && (
                      <button
                        disabled={!exporteerbaar || bezig || exportBezig}
                        onClick={exporteer}
                      >
                        <Download size={16} />
                        {object.soort === "Tabel"
                          ? sessie.voorbeeld
                            ? "CSV exporteren"
                            : "Pagina als CSV"
                          : object.soort === "VBA"
                            ? "Als .bas downloaden"
                            : "Als .sql downloaden"}
                      </button>
                    )}
                  </div>
                  <Details
                    object={
                      object.soort === "Tabel"
                        ? { ...object, eigenschappen: [] }
                        : object
                    }
                  />
                  {object.soort === "Tabel" ? (
                    bezig ? (
                      <p role="status">Tabelpagina laden…</p>
                    ) : !object.rijen ? (
                      <p>
                        Deze tabel is niet uitgelezen. Probeer een andere tabel
                        of open het bestand opnieuw.
                      </p>
                    ) : (
                      <>
                        <label className="zoek">
                          <Search size={17} />
                          <input
                            aria-label="Zoeken in geladen rijen"
                            placeholder="Zoeken in deze pagina…"
                            value={zoeken}
                            onChange={(e) => setZoeken(e.target.value)}
                          />
                        </label>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                {object.kolommen?.map((k, index) => (
                                  <th key={k}>
                                    {k}
                                    {object.kolomtypen?.[index] && (
                                      <small className="database-kolomtype">
                                        {object.kolomtypen[index]}
                                      </small>
                                    )}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rijen.map((rij, i) => (
                                <tr key={i}>
                                  {rij.map((cel, j) => (
                                    <td key={j}>{cel}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="muted">
                          {rijen.length} rijen getoond
                          {object.totaalRijen !== undefined &&
                            ` · pagina vanaf rij ${object.totaalRijen ? paginaStart + 1 : 0} van ${object.totaalRijen}`}
                        </p>
                        {!!object.indexen?.length && (
                          <details className="database-indexen">
                            <summary>
                              Indexen en sleutels ({object.indexen.length})
                            </summary>
                            <table>
                              <thead>
                                <tr>
                                  <th>Naam</th>
                                  <th>Kolommen</th>
                                  <th>Soort</th>
                                </tr>
                              </thead>
                              <tbody>
                                {object.indexen.map((index) => (
                                  <tr key={index.naam}>
                                    <td>{index.naam}</td>
                                    <td>{index.kolommen.join(", ")}</td>
                                    <td>
                                      {[
                                        index.primair && "Primaire sleutel",
                                        !index.primair &&
                                          index.uniek &&
                                          "Uniek",
                                        index.extern && "Relatie-index",
                                      ]
                                        .filter(Boolean)
                                        .join(" · ") || "Index"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </details>
                        )}
                        {!sessie.voorbeeld && (
                          <div className="database-paginering">
                            <button
                              disabled={bezig || paginaStart === 0}
                              onClick={() =>
                                void kiesObject(
                                  object.id,
                                  Math.max(0, paginaStart - 200),
                                )
                              }
                            >
                              Vorige pagina
                            </button>
                            <button
                              disabled={
                                bezig ||
                                paginaStart + 200 >= (object.totaalRijen ?? 0)
                              }
                              onClick={() =>
                                void kiesObject(object.id, paginaStart + 200)
                              }
                            >
                              Volgende pagina
                            </button>
                          </div>
                        )}
                      </>
                    )
                  ) : object.soort === "Query" || object.soort === "VBA" ? (
                    object.bron ? (
                      <>
                        <Bron
                          bron={object.bron}
                          taal={object.soort === "VBA" ? "vba" : "sql"}
                        />
                        <p className="muted">
                          Alleen bronweergave.{" "}
                          {object.soort === "VBA"
                            ? "VBA wordt niet uitgevoerd; uitvoering vereist een afzonderlijk technisch ontwerp."
                            : "Query’s worden niet uitgevoerd."}
                        </p>
                      </>
                    ) : (
                      <p role="status">
                        Er is geen bron beschikbaar. Er is niets teruggewonnen
                        of gegokt; zie de beperking hierboven.
                      </p>
                    )
                  ) : null}
                </>
              ) : (
                <div className="welkom">
                  <Database size={40} />
                  <h2>Selecteer een object</h2>
                  <p>
                    {sessie.naam} · {sessie.grootte?.toLocaleString("nl-NL")}{" "}
                    bytes
                  </p>
                  <p>
                    Kies links een tabel, query, relatie of VBA-module, of open
                    het compatibiliteitsrapport.{" "}
                    {!sessie.objecten.some((o) => o.soort === "Tabel") &&
                      "Er zijn geen gebruikerstabellen gevonden."}
                  </p>
                </div>
              )}
            </>
          )}
        </article>
      </main>
      <footer>
        <span>Open Database Studio</span>
        <span>
          {sessie?.voorbeeld
            ? "Voorbeeldgegevens"
            : sessie
              ? `${sessie.rapport?.formaat ?? "Database"} · alleen lezen`
              : "Klaar om te beginnen"}
        </span>
        <span>Geen uploads · geen wijzigingen aan het origineel</span>
      </footer>
    </div>
  );
}
