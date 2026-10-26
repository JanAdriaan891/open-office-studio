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
} from "lucide-react";
import {
  csv,
  voorbeeld,
  type DatabaseSession,
  type Objectsoort,
} from "./model";
import { DatabaseClient } from "./database-client";
import { Ribbon, Groep, Actie } from "../../../src/Ribbon";
function downloaden(naam: string, inhoud: string, type: string) {
  const url = URL.createObjectURL(new Blob([inhoud], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = naam;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const soorten: Objectsoort[] = ["Tabel", "Query", "VBA"];
export function DatabaseStudio({
  startbestand,
  bestandsmenu,
  inactief = false,
  registreerOpenen,
}: {
  startbestand?: File | null;
  bestandsmenu?: () => void;
  inactief?: boolean;
  registreerOpenen?: (openen: (() => void) | null) => void;
} = {}) {
  const [sessie, setSessie] = useState<DatabaseSession | null>(null);
  const [selectie, setSelectie] = useState("");
  const [zoeken, setZoeken] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [donker, setDonker] = useState(false);
  const invoer = useRef<HTMLInputElement>(null);
  const lezer = useRef<DatabaseClient | null>(null);
  const inlezen = useRef<DatabaseClient | null>(null);
  const actief = useRef(true);
  const [paginaStart, setPaginaStart] = useState(0);
  useEffect(() => {
    registreerOpenen?.(bezig ? null : () => invoer.current?.click());
    return () => registreerOpenen?.(null);
  }, [registreerOpenen, bezig]);
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
  useEffect(() => {
    if (startbestand) void lees(startbestand);
  }, [startbestand]);
  async function lees(bestand: File) {
    setBezig(true);
    setFout("");
    let client: DatabaseClient | null = null;
    // Alleen de laatst gestarte leesopdracht werkt de weergave bij.
    const actueel = () => actief.current && inlezen.current === client;
    try {
      client = new DatabaseClient();
      inlezen.current = client;
      const nieuw = await client.open(bestand);
      if (!actueel()) {
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
      if (actueel())
        setFout(
          error instanceof Error
            ? error.message
            : "Bestand kon niet worden gelezen.",
        );
    } finally {
      if (actueel() || client === null) {
        inlezen.current = null;
        if (actief.current) setBezig(false);
      }
    }
  }
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
  }
  function exporteer() {
    if (!object || (object.soort === "Tabel" && !object.rijen)) return;
    downloaden(
      object.naam +
        (object.soort === "Tabel"
          ? ".csv"
          : object.soort === "VBA"
            ? ".bas"
            : ".sql"),
      object.soort === "Tabel"
        ? csv(object.kolommen ?? [], rijen)
        : (object.bron ?? ""),
      "text/plain;charset=utf-8",
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
  }
  async function kiesObject(id: string, start = 0) {
    setSelectie(id);
    setZoeken("");
    setFout("");
    const client = lezer.current;
    if (!client) {
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
                  item.id === id ? tabel : item,
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
                    disabled={bezig}
                    onClick={() => invoer.current?.click()}
                  />
                  <Actie
                    icoon={Database}
                    naam="Voorbeeld verkennen"
                    groot
                    disabled={bezig}
                    onClick={openVoorbeeld}
                  />
                </Groep>
                <Groep naam="Object">
                  <Actie
                    icoon={Download}
                    naam="Exporteren"
                    groot
                    disabled={
                      !object ||
                      bezig ||
                      (object.soort === "Tabel" && !object.rijen)
                    }
                    onClick={exporteer}
                  />
                </Groep>
                <Groep naam="Bestand">
                  <Actie
                    icoon={X}
                    naam="Database sluiten"
                    groot
                    disabled={!sessie || bezig}
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
        onChange={(event) => {
          const bestand = event.target.files?.[0];
          event.target.value = "";
          if (bestand) void lees(bestand);
        }}
      />
      {fout && (
        <div role="alert" className="melding fout">
          {fout}
        </div>
      )}
      <main>
        <aside>
          <h2>Databaseobjecten</h2>
          <p className="bestandsnaam">
            {sessie?.naam ?? "Geen database geselecteerd"}
          </p>
          {soorten.map((soort) => (
            <section key={soort}>
              <h3>
                {soort === "Tabel"
                  ? "Tabellen"
                  : soort === "Query"
                    ? "Query’s"
                    : "VBA-modules"}
              </h3>
              {sessie?.objecten
                .filter((item) => item.soort === soort)
                .map((item) => (
                  <button
                    disabled={bezig}
                    className={selectie === item.id ? "selected" : ""}
                    key={item.id}
                    onClick={() => void kiesObject(item.id)}
                  >
                    {soort === "Tabel" ? (
                      <Table2 size={16} />
                    ) : soort === "VBA" ? (
                      <Code2 size={16} />
                    ) : (
                      <Braces size={16} />
                    )}{" "}
                    {item.naam}
                  </button>
                ))}
              {!sessie?.objecten.some((item) => item.soort === soort) && (
                <p className="muted">Nog niet uitgelezen</p>
              )}
            </section>
          ))}
          <div className="aside-note">
            Formulieren, rapporten en relaties volgen in de database-integratie.
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
                  <p>SQL-bron bekijken en downloaden.</p>
                </section>
                <section>
                  <Code2 />
                  <h3>VBA-scripts</h3>
                  <p>Voorbeeldbron bekijken en als .bas bewaren.</p>
                </section>
              </div>
              <p className="melding">
                MDB/ACCDB-tabellen worden lokaal gelezen. Query’s, VBA-extractie
                en bewerking volgen. Scripts worden niet uitgevoerd.
              </p>
            </div>
          ) : (
            <>
              <div className="melding" role="status">
                {sessie.melding}
              </div>
              {object ? (
                <>
                  <div className="object-toolbar">
                    <h2>
                      {object.naam}
                      <small>
                        {sessie.voorbeeld ? "Voorbeeld · " : ""}
                        {object.soort}
                      </small>
                    </h2>
                    <button
                      disabled={
                        bezig || (object.soort === "Tabel" && !object.rijen)
                      }
                      onClick={exporteer}
                    >
                      <Download size={16} />
                      {object.soort === "Tabel"
                        ? sessie.voorbeeld
                          ? "CSV exporteren"
                          : "Pagina als CSV"
                        : "Bron downloaden"}
                    </button>
                  </div>
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
                  ) : (
                    <>
                      <pre>
                        <code>{object.bron}</code>
                      </pre>
                      <p className="muted">
                        Alleen bronweergave.{" "}
                        {object.soort === "VBA"
                          ? "VBA-uitvoering"
                          : "Query-uitvoering"}{" "}
                        is nog niet beschikbaar.
                      </p>
                    </>
                  )}
                </>
              ) : (
                <div className="welkom">
                  <Database size={40} />
                  <h2>Selecteer een tabel</h2>
                  <p>
                    {sessie.naam} · {sessie.grootte?.toLocaleString("nl-NL")}{" "}
                    bytes
                  </p>
                  <p>
                    Kies links een gebruikerstabel om de kolommen en gegevens te
                    lezen.{" "}
                    {sessie.objecten.length === 0 &&
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
              ? "Tabellen · alleen lezen"
              : "Klaar om te beginnen"}
        </span>
        <span>Geen uploads · geen wijzigingen aan het origineel</span>
      </footer>
    </div>
  );
}
