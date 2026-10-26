/** Opbouwvoortgang, opbouwrapport, compatibiliteitsrapport en relatieoverzicht. */
import { FileJson, FileText, X } from "lucide-react";
import type { Compatibiliteitsrapport } from "../model.ts";
import type { RelatieSchema } from "../werkkopie/contract.ts";
import type { OpbouwRapport, Voortgang } from "../werkkopie/opbouw.ts";

const FASEN: Record<Voortgang["fase"], string> = {
  voorbereiden: "Voorbereiden",
  tabel: "Tabellen overnemen",
  indexen: "Indexen aanmaken",
  relaties: "Relaties vastleggen",
  querys: "Query’s overnemen",
  klaar: "Afronden",
};

export function OpbouwVoortgang({
  naam,
  voortgang,
  tabellenKlaar,
  onAnnuleer,
}: {
  naam: string;
  voortgang: Voortgang | null;
  tabellenKlaar: number;
  onAnnuleer: () => void;
}) {
  const fractie = voortgang?.totaal ? Math.min(1, (voortgang.rijen ?? 0) / voortgang.totaal) : undefined;
  return (
    <section className="database-opbouw" aria-labelledby="database-opbouw-titel" aria-busy="true">
      <h2 id="database-opbouw-titel">Werkkopie opbouwen</h2>
      <p>
        {naam} wordt overgenomen in een bewerkbare SQLite-werkkopie. <strong>Het origineel blijft ongewijzigd.</strong>
      </p>
      <p role="status" aria-live="polite">
        {voortgang ? FASEN[voortgang.fase] : "Bestand lezen"}
        {voortgang?.tabel ? ` · ${voortgang.tabel}` : ""}
        {voortgang?.totaal ? ` · ${(voortgang.rijen ?? 0).toLocaleString("nl-NL")} van ${voortgang.totaal.toLocaleString("nl-NL")} rijen` : ""}
        {tabellenKlaar ? ` · ${tabellenKlaar} ${tabellenKlaar === 1 ? "tabel" : "tabellen"} klaar` : ""}
      </p>
      <progress aria-label="Voortgang van de huidige stap" max={1} value={fractie} />
      <button onClick={onAnnuleer}>
        <X size={16} /> Annuleren
      </button>
      <p className="muted">Annuleren stopt de opbouw direct. Je kunt de database daarna alleen-lezen bekijken of opnieuw openen.</p>
    </section>
  );
}

export function OpbouwRapportWeergave({ rapport, onExporteer }: { rapport: OpbouwRapport; onExporteer: () => void }) {
  const overgeslagen = rapport.tabellen.reduce((s, t) => s + t.overgeslagen, 0);
  return (
    <div className="database-overzicht">
      <div className="object-toolbar">
        <h2>
          Opbouwrapport
          <small>
            {rapport.formaat} · {(rapport.duurMs / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} s · SHA-256{" "}
            {rapport.sha256.slice(0, 16)}…
          </small>
        </h2>
        <button onClick={onExporteer}>
          <FileJson size={16} /> JSON
        </button>
      </div>
      <dl className="database-eigenschappen">
        <div>
          <dt>Bron</dt>
          <dd>{rapport.bron}</dd>
        </div>
        <div>
          <dt>Opgebouwd</dt>
          <dd>{new Date(rapport.tijdstip).toLocaleString("nl-NL")}</dd>
        </div>
        <div>
          <dt>Indexen</dt>
          <dd>
            {rapport.indexen.aangemaakt} aangemaakt{rapport.indexen.mislukt ? `, ${rapport.indexen.mislukt} mislukt` : ""}
          </dd>
        </div>
        <div>
          <dt>Relaties</dt>
          <dd>
            {rapport.relaties.totaal} totaal, {rapport.relaties.afgedwongen} afgedwongen
          </dd>
        </div>
        <div>
          <dt>Query’s</dt>
          <dd>
            {rapport.querys.opgeslagen} van {rapport.querys.totaal} overgenomen
          </dd>
        </div>
        <div>
          <dt>Overgeslagen rijen</dt>
          <dd>{overgeslagen.toLocaleString("nl-NL")}</dd>
        </div>
      </dl>
      <h3>Tabellen</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Tabel</th>
              <th scope="col">Rijen in origineel</th>
              <th scope="col">Overgenomen</th>
              <th scope="col">Overgeslagen</th>
              <th scope="col">Kolommen</th>
            </tr>
          </thead>
          <tbody>
            {rapport.tabellen.map((t) => (
              <tr key={t.naam} className={t.overgeslagen ? "is-waarschuwing" : ""}>
                <td>{t.naam}</td>
                <td>{t.rijenBron.toLocaleString("nl-NL")}</td>
                <td>{t.rijenGeladen.toLocaleString("nl-NL")}</td>
                <td>{t.overgeslagen.toLocaleString("nl-NL")}</td>
                <td>{t.kolommen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!!rapport.meldingen.length && (
        <>
          <h3>Meldingen ({rapport.meldingen.length})</h3>
          <ul className="database-meldingen">
            {rapport.meldingen.map((m, i) => (
              <li key={i} className={`ernst-${m.ernst}`}>
                <span className="database-status">{m.ernst === "fout" ? "fout" : m.ernst === "waarschuwing" ? "let op" : "info"}</span>
                <strong>{m.onderdeel}</strong> {m.tekst}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function CompatibiliteitWeergave({
  rapport,
  onExporteer,
}: {
  rapport: Compatibiliteitsrapport;
  onExporteer: (soort: "json" | "txt") => void;
}) {
  return (
    <div className="database-overzicht">
      <div className="object-toolbar">
        <h2>
          Compatibiliteitsrapport
          <small>
            {rapport.formaat} · SHA-256 {rapport.sha256.slice(0, 16)}…
          </small>
        </h2>
        <button onClick={() => onExporteer("json")}>
          <FileJson size={16} /> JSON
        </button>
        <button onClick={() => onExporteer("txt")}>
          <FileText size={16} /> Tekst
        </button>
      </div>
      <div className="table-wrap">
        <table className="database-rapport">
          <thead>
            <tr>
              <th scope="col">Onderdeel</th>
              <th scope="col">Status</th>
              <th scope="col">Aantal</th>
              <th scope="col">Toelichting</th>
            </tr>
          </thead>
          <tbody>
            {rapport.regels.map((regel) => (
              <tr key={regel.onderdeel}>
                <td>{regel.onderdeel}</td>
                <td>
                  <span className={`database-status status-${regel.status.replaceAll(" ", "-")}`}>{regel.status}</span>
                </td>
                <td>{regel.aantal ?? "–"}</td>
                <td>{regel.toelichting}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Gelezen met {rapport.lezer}. Het rapport bevat alleen aantallen, namen en meldingen, geen tabelgegevens. Het beschrijft het
        alleen-lezen-pad; zie het opbouwrapport voor wat in de werkkopie is overgenomen.
      </p>
    </div>
  );
}

export function RelatieWeergave({ relaties }: { relaties: RelatieSchema[] }) {
  return (
    <div className="database-overzicht">
      <h2>Relaties</h2>
      {!relaties.length ? (
        <p>Er zijn geen relaties vastgelegd in de werkkopie.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Naam</th>
                <th scope="col">Van</th>
                <th scope="col">Naar</th>
                <th scope="col">Referentiële integriteit</th>
              </tr>
            </thead>
            <tbody>
              {relaties.map((r) => (
                <tr key={r.naam}>
                  <td>{r.naam}</td>
                  <td>
                    {r.tabel} ({r.velden.join(", ")})
                  </td>
                  <td>
                    {r.naarTabel} ({r.naarVelden.join(", ")})
                  </td>
                  <td>{r.integriteit ? "Afgedwongen" : "Niet afgedwongen"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
