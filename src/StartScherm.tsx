import {
  ArrowLeft,
  ArrowRight,
  Database,
  FileText,
  FolderOpen,
  Home,
  Presentation,
  Sheet,
  HardDrive,
  Plus,
  ArrowUpRight,
  NotebookPen,
  Mail,
  Send,
  Settings,
  Keyboard,
} from "lucide-react";
import type { Soort } from "./editors";
import { toonInstellingen, toonSneltoetsen } from "./werkruimte/gebeurtenissen";
import { RecenteBestanden } from "./RecenteBestanden";
import "../packages/email/src/start.css";

export const modules = [
  {
    soort: "docx",
    naam: "Open Tekst Studio",
    kort: "Tekst",
    nieuw: "Leeg document",
    omschrijving: "Documenten",
    icoon: FileText,
    voorbeeld: "Ontwerpnotitie",
    voorbeeldtekst: "Tekst, stijlen en een tabel",
  },
  {
    soort: "xlsx",
    naam: "Open Rekenblad Studio",
    kort: "Rekenblad",
    nieuw: "Leeg rekenblad",
    omschrijving: "Rekenbladen",
    icoon: Sheet,
    voorbeeld: "Materiaaloverzicht",
    voorbeeldtekst: "Materialen, formules en totalen",
  },
  {
    soort: "pptx",
    naam: "Open Presentatie Studio",
    kort: "Presentatie",
    nieuw: "Lege presentatie",
    omschrijving: "Presentaties",
    icoon: Presentation,
    voorbeeld: "Ontwerpvisie",
    voorbeeldtekst: "Dia’s, vormen en notities",
  },
] as const;

function Voorbeeld({ soort }: { soort: Soort }) {
  return (
    <div className={`start-voorbeeld voorbeeld-${soort}`} aria-hidden="true">
      <span className="voorbeeld-app">
        {modules.find((module) => module.soort === soort)?.kort}
      </span>
      {soort === "docx" ? (
        <div className="voorbeeld-papier">
          <div />
          <i />
          <i />
          <i />
          <i />
          <span />
        </div>
      ) : soort === "xlsx" ? (
        <div className="voorbeeld-rekenblad">
          <div className="voorbeeld-kolommen">
            A<span>B</span>
            <span>C</span>
            <span>D</span>
          </div>
          <div className="voorbeeld-cellen">
            {Array.from({ length: 24 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
        </div>
      ) : (
        <div className="voorbeeld-dia">
          <div />
          <i />
          <span />
        </div>
      )}
      <span className="voorbeeld-plus">
        <Plus size={18} />
      </span>
    </div>
  );
}

export function StartScherm({
  bezig,
  terug,
  open,
  nieuw,
  openDatabase,
  openNotities,
  openEmail,
  bewaar,
  verzend,
  voorbeeld,
  databaseActief = false,
  notitiesActief = false,
  emailActief = false,
  emailOngelezen = null,
}: {
  bezig: boolean;
  terug?: () => void;
  open: () => void;
  nieuw: (soort: Soort) => void;
  openDatabase: () => void;
  openNotities: () => void;
  openEmail: () => void;
  bewaar?: () => void;
  /** "Verzenden als bijlage" voor het open document. */
  verzend?: () => void;
  voorbeeld: (soort: Soort) => void;
  databaseActief?: boolean;
  notitiesActief?: boolean;
  emailActief?: boolean;
  /** Ongelezen in de inbox; null = geen e-mailaccount ingesteld. */
  emailOngelezen?: number | null;
}) {
  return (
    <div className="office-start">
      <aside className="start-navigatie">
        {terug && (
          <button className="start-terug" onClick={terug} autoFocus>
            <ArrowLeft size={18} />
            Terug naar werkruimte
          </button>
        )}
        <div className="start-navgroep">
          <span className="start-label">WERKRUIMTE</span>
          <button className="geselecteerd" aria-current="page">
            <Home size={18} />
            Start
          </button>
          <button disabled={bezig} onClick={open}>
            <FolderOpen size={18} />
            Openen
          </button>
          {bewaar && (
            <button disabled={bezig} onClick={bewaar}>
              <HardDrive size={18} />
              Opslaan als
            </button>
          )}
          {verzend && (
            <button
              disabled={bezig}
              onClick={verzend}
              title="Het huidige document als bijlage in een nieuw e-mailbericht zetten"
            >
              <Send size={18} />
              Verzenden als bijlage
            </button>
          )}
          <button
            className={`start-email-ingang ${emailActief ? "geselecteerd" : ""}`}
            disabled={bezig}
            onClick={openEmail}
            title="OpenAEC Email Studio"
            aria-label={
              emailOngelezen ? `E-mail, ${emailOngelezen} ongelezen` : "E-mail"
            }
          >
            <Mail size={18} />
            <span>E-mail</span>
            {!!emailOngelezen && (
              <b className="start-email-teller">
                {emailOngelezen > 999 ? "999+" : emailOngelezen}
              </b>
            )}
          </button>
        </div>
        <div className="start-navgroep">
          <span className="start-label">NIEUW BESTAND</span>
          {modules.map((module) => (
            <button
              key={module.soort}
              className={`start-module module-${module.soort}`}
              disabled={bezig}
              onClick={() => nieuw(module.soort)}
              title={module.naam}
            >
              <module.icoon size={18} />
              <span>{module.kort}</span>
              <Plus size={13} className="nav-plus" />
            </button>
          ))}
          <button
            disabled={bezig}
            onClick={openNotities}
            title="Open Notities Studio"
          >
            <NotebookPen size={18} />
            <span>Notities</span>
            <Plus size={13} className="nav-plus" />
          </button>
        </div>
        <div className="start-navonder">
          <button
            disabled={bezig}
            onClick={openDatabase}
            aria-label="Database Studio"
            title="Database Studio · Access-database als bewerkbare werkkopie"
          >
            <Database size={18} />
            <span>
              Database Studio<small>Werkkopie · bewerken, query’s, VBA</small>
            </span>
            <ArrowRight size={14} />
          </button>
          <div className="start-hulp">
            <button onClick={toonInstellingen} title="Instellingen · Ctrl+,">
              <Settings size={16} />
              <span>Instellingen</span>
            </button>
            <button onClick={toonSneltoetsen} title="Sneltoetsen · F1">
              <Keyboard size={16} />
              <span>Sneltoetsen</span>
            </button>
          </div>
          <span className="start-openaec">OpenAEC Foundation</span>
        </div>
      </aside>
      <main className="start-inhoud">
        <div className="start-kop">
          <div>
            <span className="start-welkom">
              <span /> Jouw lokale kantoor
            </span>
            <h1>{terug ? "Bestand" : "Je werkruimte."}</h1>
            <p>Schrijven, rekenen, presenteren en ideeën vastleggen.</p>
          </div>
          <button
            className="office-knop office-primair"
            disabled={bezig}
            onClick={open}
          >
            <FolderOpen size={17} />
            {notitiesActief
              ? "Notitieback-up toevoegen"
              : databaseActief
                ? "Database openen"
                : "Bestand openen"}
            <kbd>Ctrl O</kbd>
          </button>
        </div>
        {!notitiesActief && !databaseActief && (
          <RecenteBestanden bezig={bezig} bladeren={open} />
        )}
        <section className="start-nieuw" aria-labelledby="start-nieuw-titel">
          <div className="start-sectiekop">
            <h2 id="start-nieuw-titel">Nieuw bestand</h2>
            <span>Kies je gereedschap, begin met een leeg bestand</span>
          </div>
          <div className="start-sjablonen">
            {modules.map((module) => (
              <button
                key={module.soort}
                className={`start-sjabloon module-${module.soort}`}
                disabled={bezig}
                onClick={() => nieuw(module.soort)}
                title={module.naam}
              >
                <Voorbeeld soort={module.soort} />
                <div className="sjabloon-details">
                  <span className="module-icoon">
                    <module.icoon size={19} />
                  </span>
                  <div>
                    <strong>{module.nieuw}</strong>
                    <span>{module.kort}</span>
                  </div>
                  <ArrowRight size={16} />
                </div>
              </button>
            ))}
          </div>
        </section>
        <button
          className="start-notities"
          disabled={bezig}
          onClick={openNotities}
        >
          <span className="start-notities-icoon">
            <NotebookPen size={27} strokeWidth={1.5} />
          </span>
          <span>
            <strong>Een plek voor je ideeën.</strong>
            <small>
              Notitieboeken, secties en pagina’s. Automatisch lokaal bewaard.
            </small>
          </span>
          <span className="start-notities-open">
            Open Notities <ArrowRight size={15} />
          </span>
        </button>
        <button
          className="start-notities start-email"
          disabled={bezig}
          onClick={openEmail}
        >
          <span className="start-notities-icoon">
            <Mail size={27} strokeWidth={1.5} />
          </span>
          <span>
            <strong>OpenAEC Email Studio</strong>
            <small>
              Je eigen e-mail via IMAP en SMTP. Bijlagen openen direct in Tekst,
              Rekenblad, Presentatie of Database.
            </small>
          </span>
          <span className="start-notities-open">
            {emailOngelezen ? `${emailOngelezen} ongelezen` : "Open E-mail"}{" "}
            <ArrowRight size={15} />
          </span>
        </button>
        <section
          className="start-voorbeelden"
          aria-labelledby="start-voorbeelden-titel"
        >
          <div className="start-sectiekop">
            <h2 id="start-voorbeelden-titel">Ontdek wat je kunt maken</h2>
            <span>Voorbeeldbestanden</span>
          </div>
          <div className="start-voorbeeldlijst">
            {modules.map((module) => (
              <button
                key={module.soort}
                className={`start-voorbeeldbestand module-${module.soort}`}
                disabled={bezig}
                onClick={() => voorbeeld(module.soort)}
              >
                <span className="module-icoon">
                  <module.icoon size={20} />
                </span>
                <span>
                  <strong>{module.voorbeeld}</strong>
                  <small>{module.voorbeeldtekst}</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        </section>
        <section className="start-openen" aria-labelledby="start-openen-titel">
          <div className="start-sectiekop">
            <h2 id="start-openen-titel">Bestaand bestand</h2>
          </div>
          <button
            className="start-bestand-openen"
            disabled={bezig}
            onClick={open}
          >
            <span className="openen-icoon">
              <FolderOpen size={26} strokeWidth={1.4} />
            </span>
            <span>
              <strong>Bladeren op deze computer</strong>
              <small>
                {notitiesActief
                  ? "Voeg een OpenAEC-notitieback-up toe."
                  : databaseActief
                    ? "Open een MDB- of ACCDB-database of een SQLite-werkkopie."
                    : "Open een document, rekenblad of presentatie."}
              </small>
            </span>
            <span className="bestandsformaten">
              {(notitiesActief
                ? ["NOTITIES"]
                : databaseActief
                  ? ["MDB", "ACCDB", "SQLITE"]
                  : ["DOCX", "XLSX", "PPTX"]
              ).map((formaat) => (
                <i key={formaat}>{formaat}</i>
              ))}
            </span>
            <ArrowRight size={19} />
          </button>
        </section>
        <div className="start-onderkant">
          <span>
            <HardDrive size={15} />
            Je bestanden blijven op jouw computer.
          </span>
          <details>
            <summary>Over deze versie</summary>
            <p>
              DOCX, XLSX en PPTX werken rechtstreeks. De desktopversie kan met
              een ingesteld conversieprogramma ook ODF en oudere formaten
              omzetten. Opmaak kan daarbij afwijken. Database Studio maakt van
              een MDB- of ACCDB-bestand een bewerkbare SQLite-werkkopie met
              tabellen, query’s, formulieren, rapporten en VBA; het origineel
              blijft ongewijzigd. De afzonderlijke app is te installeren als
              Open Database Studio.
            </p>
          </details>
        </div>
      </main>
    </div>
  );
}
