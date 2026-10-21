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
} from "lucide-react";
import type { Soort } from "./editors";

export const modules = [
  {
    soort: "docx",
    naam: "Open Writer Studio",
    kort: "Writer",
    nieuw: "Leeg document",
    omschrijving: "Documenten",
    icoon: FileText,
  },
  {
    soort: "xlsx",
    naam: "Open Excel Calc Studio",
    kort: "Calc",
    nieuw: "Leeg rekenblad",
    omschrijving: "Rekenbladen",
    icoon: Sheet,
  },
  {
    soort: "pptx",
    naam: "Open Presentatie Studio",
    kort: "Presentatie",
    nieuw: "Lege presentatie",
    omschrijving: "Presentaties",
    icoon: Presentation,
  },
] as const;

function Voorbeeld({ soort }: { soort: Soort }) {
  return (
    <div className={`start-voorbeeld voorbeeld-${soort}`} aria-hidden="true">
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
  access,
  bewaar,
}: {
  bezig: boolean;
  terug?: () => void;
  open: () => void;
  nieuw: (soort: Soort) => void;
  access: () => void;
  bewaar?: () => void;
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
        </div>
        <div className="start-navgroep">
          <span className="start-label">NIEUW BESTAND</span>
          {modules.map((module) => (
            <button
              key={module.soort}
              disabled={bezig}
              onClick={() => nieuw(module.soort)}
              title={module.naam}
            >
              <module.icoon size={18} />
              <span>{module.kort}</span>
              <Plus size={13} className="nav-plus" />
            </button>
          ))}
        </div>
        <div className="start-navonder">
          <button
            disabled={bezig}
            onClick={access}
            aria-label="Access Studio (experimenteel)"
            title="Access Studio (experimenteel)"
          >
            <Database size={18} />
            <span>
              Access Studio<small>Experimenteel</small>
            </span>
            <ArrowRight size={14} />
          </button>
          <span className="start-openaec">OpenAEC Foundation</span>
        </div>
      </aside>
      <main className="start-inhoud">
        <div className="start-kop">
          <div>
            <span className="start-label">OPENAEC OFFICE STUDIO</span>
            <h1>Je werkruimte.</h1>
            <p>Documenten, rekenbladen en presentaties op je eigen computer.</p>
          </div>
          <button
            className="office-knop office-primair"
            disabled={bezig}
            onClick={open}
          >
            <FolderOpen size={17} />
            Bestand openen
          </button>
        </div>
        <section className="start-nieuw" aria-labelledby="start-nieuw-titel">
          <div className="start-sectiekop">
            <h2 id="start-nieuw-titel">Nieuw bestand</h2>
            <span>Begin met een leeg bestand</span>
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
              <small>Open een document, rekenblad of presentatie.</small>
            </span>
            <span className="bestandsformaten">
              <i>DOCX</i>
              <i>XLSX</i>
              <i>PPTX</i>
            </span>
            <ArrowRight size={19} />
          </button>
        </section>
        <div className="start-onderkant">
          <span>
            <HardDrive size={15} />
            Je bestanden blijven lokaal.
          </span>
          <details>
            <summary>Over deze versie</summary>
            <p>
              Deze ontwikkelversie ondersteunt DOCX, XLSX en PPTX. Controleer
              opgeslagen bestanden voor gebruik. ODF en oudere binaire formaten
              volgen. Access Studio bevat een voorbereidende objectbrowser.
            </p>
          </details>
        </div>
      </main>
    </div>
  );
}
