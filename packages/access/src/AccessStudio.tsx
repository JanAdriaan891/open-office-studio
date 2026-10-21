import { useRef, useState } from "react";
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
  voorbereidendeLezer,
  voorbeeld,
  type DatabaseSession,
  type Objectsoort,
} from "./model";
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
export function AccessStudio({
  bestandsmenu,
  inactief = false,
}: { bestandsmenu?: () => void; inactief?: boolean } = {}) {
  const [sessie, setSessie] = useState<DatabaseSession | null>(null);
  const [selectie, setSelectie] = useState("");
  const [zoeken, setZoeken] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [donker, setDonker] = useState(false);
  const invoer = useRef<HTMLInputElement>(null);
  const object = sessie?.objecten.find((item) => item.id === selectie);
  const rijen =
    object?.rijen?.filter((rij) =>
      rij.some((cel) => cel.toLowerCase().includes(zoeken.toLowerCase())),
    ) ?? [];
  function sluit() {
    setSessie(null);
    setSelectie("");
    setZoeken("");
    setFout("");
  }
  function exporteer() {
    if (!object) return;
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
    setSessie(voorbeeld);
    setSelectie("materialen");
    setZoeken("");
    setFout("");
  }
  return (
    <div
      className="access-app"
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
                    disabled={!object || bezig}
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
      <div className="access-documentbalk">
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
          try {
            const nieuw = await voorbereidendeLezer.open(bestand);
            setSessie(nieuw);
            setSelectie("");
            setZoeken("");
          } catch (error) {
            setFout(
              error instanceof Error
                ? error.message
                : "Bestand kon niet worden gelezen.",
            );
          } finally {
            setBezig(false);
          }
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
                    className={selectie === item.id ? "selected" : ""}
                    key={item.id}
                    onClick={() => {
                      setSelectie(item.id);
                      setZoeken("");
                    }}
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
                  <p>Voorbeeld bekijken, doorzoeken en exporteren.</p>
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
                De echte databaselezer en VBA-extractie volgen. Scripts worden
                niet uitgevoerd.
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
                    <button onClick={exporteer}>
                      <Download size={16} />
                      {object.soort === "Tabel"
                        ? "CSV exporteren"
                        : "Bron downloaden"}
                    </button>
                  </div>
                  {object.soort === "Tabel" ? (
                    <>
                      <label className="zoek">
                        <Search size={17} />
                        <input
                          aria-label="Zoeken in tabel"
                          placeholder="Zoeken in deze tabel…"
                          value={zoeken}
                          onChange={(e) => setZoeken(e.target.value)}
                        />
                      </label>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              {object.kolommen?.map((k) => (
                                <th key={k}>{k}</th>
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
                      <p className="muted">{rijen.length} rijen getoond</p>
                    </>
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
                  <h2>Bestand gereed voor de volgende stap</h2>
                  <p>
                    {sessie.naam} · {sessie.grootte?.toLocaleString("nl-NL")}{" "}
                    bytes
                  </p>
                  <p>
                    De bestandskiezer werkt. Een volgende versie koppelt deze
                    werkplek aan een databaselezer.
                  </p>
                </div>
              )}
            </>
          )}
        </article>
      </main>
      <footer>
        <span>Open Access Studio</span>
        <span>
          {sessie?.voorbeeld
            ? "Voorbeeldgegevens"
            : sessie
              ? "Inhoud niet uitgelezen"
              : "Klaar om te beginnen"}
        </span>
        <span>Geen uploads · geen wijzigingen aan het origineel</span>
      </footer>
    </div>
  );
}
