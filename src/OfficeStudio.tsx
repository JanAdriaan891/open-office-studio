import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FolderOpen,
  Save,
  Home,
  Database,
  X,
  HardDrive,
  FileText,
} from "lucide-react";
import type { Soort } from "./editors";
import { DatabaseStudio } from "../packages/database/src/DatabaseStudio";
import "./office.css";
import { StartScherm, modules } from "./StartScherm";
import { DocumentOpslag, type BewaarUitkomst } from "./opslag";
import { VerlaatDialoog } from "./VerlaatDialoog";
import { controleerPakket } from "./pakketcontrole";
import { version } from "../package.json";
import {
  bestandstypen,
  bestandssoort,
  converteer,
  invoerformaten,
  uitvoerformaten,
} from "./formaten";
const Editor = lazy(() => import("./editors"));
type Bestand = { id: number; naam: string; soort: Soort; bytes: Uint8Array };
class EditorGrens extends Component<{ children: ReactNode }, { fout: string }> {
  state = { fout: "" };
  static getDerivedStateFromError(e: Error) {
    return { fout: e.message };
  }
  render() {
    return this.state.fout ? (
      <div role="alert" className="office-editorfout">
        De editor kon dit bestand niet openen: {this.state.fout}
      </div>
    ) : (
      this.props.children
    );
  }
}
export function OfficeStudio() {
  const [bestand, setBestand] = useState<Bestand | null>(null),
    [databaseOpen, setDatabaseOpen] = useState(false),
    [bestandsmenu, setBestandsmenu] = useState(true),
    [gewijzigd, setGewijzigd] = useState(false),
    [melding, setMelding] = useState(""),
    [bezig, setBezig] = useState(false),
    [gereed, setGereed] = useState(false),
    [databaseGereed, setDatabaseGereed] = useState(false),
    [verlaatvraag, setVerlaatvraag] = useState(false),
    [exportFormaat, setExportFormaat] = useState("docx");
  const input = useRef<HTMLInputElement>(null),
    serialiseer = useRef<(() => Promise<Uint8Array>) | null>(null),
    bezigRef = useRef(false);
  const verlaatAntwoord = useRef<((doorgaan: boolean) => void) | null>(null);
  const databaseOpenen = useRef<(() => void) | null>(null);
  const registreerDatabaseOpenen = useCallback(
    (openen: (() => void) | null) => {
      databaseOpenen.current = openen;
      setDatabaseGereed(!!openen);
    },
    [],
  );
  const vorigeFocus = useRef<HTMLElement | null>(null);
  const opslag = useRef(new DocumentOpslag()).current;
  const registreer = useCallback(
    (fn: (() => Promise<Uint8Array>) | null) => {
      if (bestand?.id !== opslag.documentId) return;
      serialiseer.current = fn;
      setGereed(!!fn);
    },
    [bestand?.id, opslag],
  );
  function bewerkt(id: number) {
    if (opslag.wijzig(id)) setGewijzigd(true);
  }
  async function verlaten() {
    if (!opslag.gewijzigd) return true;
    if (verlaatAntwoord.current) return false;
    vorigeFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return new Promise<boolean>((resolve) => {
      verlaatAntwoord.current = resolve;
      setVerlaatvraag(true);
    });
  }
  function beantwoordVerlaten(doorgaan: boolean) {
    verlaatAntwoord.current?.(doorgaan);
    verlaatAntwoord.current = null;
    setVerlaatvraag(false);
  }
  async function kiesBestand() {
    if (bezigRef.current) return;
    if (databaseOpen) {
      if (!databaseOpenen.current) return;
      setBestandsmenu(false);
      // Wacht tot het databasepaneel niet meer inert is; de gebruikersactie blijft actief.
      requestAnimationFrame(() => databaseOpenen.current?.());
      return;
    }
    if (await verlaten()) input.current?.click();
  }
  useEffect(() => {
    if ("__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke("wijzigingsstatus", { gewijzigd }))
        .catch((e) =>
          setMelding("Sluitbeveiliging niet beschikbaar: " + String(e)),
        );
    }
  }, [gewijzigd]);
  useEffect(() => {
    const sluit = (e: BeforeUnloadEvent) => {
      if (opslag.gewijzigd) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", sluit);
    return () => window.removeEventListener("beforeunload", sluit);
  }, [opslag]);
  async function bewaarKopie(
    naam: string,
    bytes: Uint8Array,
  ): Promise<BewaarUitkomst> {
    if (!bestand) throw new Error("Er is geen bestand geopend.");
    const markdown = bestand.soort === "docx" && exportFormaat === "md";
    const uitvoernaam = naam.replace(/\.[^.]+$/, "") + "." + exportFormaat;
    let uitvoer = bytes;
    let toelichting: string | undefined;
    if (markdown) {
      const { exporteerMarkdown } = await import("./markdown");
      const resultaat = await exporteerMarkdown(bytes);
      uitvoer = resultaat.bytes;
      if (resultaat.waarschuwing)
        toelichting =
          "Sommige onderdelen kunnen niet in Markdown worden overgenomen. Bewaar ook een DOCX.";
    }
    if ("__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      if (exportFormaat !== bestand.soort && !markdown)
        uitvoer = await converteer(
          bytes,
          bestand.soort,
          exportFormaat,
          bestand.soort,
        );
      const pad = await invoke<string | null>("bewaar_kopie", uitvoer, {
        headers: { "x-office-naam": encodeURIComponent(uitvoernaam) },
      });
      return pad
        ? {
            status: ["pdf", "csv", "txt", "html", "md"].includes(exportFormaat)
              ? "geëxporteerd"
              : "opgeslagen",
            pad,
            toelichting,
          }
        : { status: "geannuleerd" };
    } else {
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(uitvoer)], {
          type: markdown
            ? "text/markdown;charset=utf-8"
            : "application/octet-stream",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = uitvoernaam;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { status: "download", toelichting };
    }
  }
  async function opslaan() {
    const serialiseerDocument = serialiseer.current;
    if (!bestand || !serialiseerDocument || bezigRef.current) return;
    setBestandsmenu(false);
    bezigRef.current = true;
    setBezig(true);
    try {
      const resultaat = await opslag.opslaan(serialiseerDocument, (bytes) =>
        bewaarKopie(bestand.naam, bytes),
      );
      if (resultaat.status === "mislukt" && resultaat.actueel) {
        setMelding("Opslaan mislukt: " + resultaat.fout);
      }
      if (resultaat.status === "afgerond" && resultaat.actueel) {
        const uitkomst = resultaat.uitkomst;
        setMelding(
          (uitkomst.status === "opgeslagen"
            ? "Opgeslagen: " + uitkomst.pad
            : uitkomst.status === "geëxporteerd"
              ? "Geëxporteerd: " +
                uitkomst.pad +
                ". Sla je bewerkbare bestand ook op om de wijzigingen te behouden."
              : uitkomst.status === "geannuleerd"
                ? "Opslaan geannuleerd."
                : "Download aangevraagd. Controleer het bestand in je downloads.") +
            (uitkomst.toelichting ? " " + uitkomst.toelichting : ""),
        );
        if (resultaat.schoon) setGewijzigd(false);
      }
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  }
  useEffect(() => {
    const toetsen = (e: KeyboardEvent) => {
      if (verlaatvraag) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopImmediatePropagation();
        void opslaan();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!bezigRef.current) void kiesBestand();
      }
      if (e.key === "Escape" && bestandsmenu && (bestand || databaseOpen))
        setBestandsmenu(false);
    };
    window.addEventListener("keydown", toetsen, true);
    return () => window.removeEventListener("keydown", toetsen, true);
  });
  function open(soort: Soort, naam: string, bytes: Uint8Array) {
    serialiseer.current = null;
    setGereed(false);
    const id = opslag.wissel();
    setGewijzigd(false);
    setMelding("");
    setDatabaseOpen(false);
    setBestandsmenu(false);
    setBestand({ id, soort, naam, bytes });
    setExportFormaat(soort);
    return id;
  }
  async function nieuw(soort: Soort) {
    if (bezigRef.current) return;
    bezigRef.current = true;
    setBezig(true);
    try {
      if (!(await verlaten())) return;
      const r = await fetch(`/templates/nieuw.${soort}`);
      if (!r.ok) throw new Error("Sjabloon niet beschikbaar");
      open(soort, `Naamloos.${soort}`, new Uint8Array(await r.arrayBuffer()));
    } catch (e) {
      setMelding(String(e));
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  }
  async function voorbeeld(soort: Soort) {
    if (bezigRef.current) return;
    bezigRef.current = true;
    setBezig(true);
    try {
      if (!(await verlaten())) return;
      const module = modules.find((module) => module.soort === soort)!;
      const resultaat = await fetch(
        `/voorbeelden/${module.voorbeeld}.${soort}`,
      );
      if (!resultaat.ok)
        throw new Error("Het voorbeeld kon niet worden geopend.");
      const bytes = new Uint8Array(await resultaat.arrayBuffer());
      controleerPakket(bytes, soort);
      open(soort, `${module.voorbeeld}.${soort}`, bytes);
    } catch (error) {
      setMelding(String(error));
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  }
  const module = modules.find((item) => item.soort === bestand?.soort);
  const ModuleIcoon = module?.icoon ?? (databaseOpen ? Database : FileText);
  return (
    <>
      <div
        className="office"
        inert={verlaatvraag}
        data-module={bestand?.soort ?? (databaseOpen ? "database" : "start")}
      >
        <header className="office-header">
          <button
            className="office-merk"
            onClick={() => setBestandsmenu(true)}
            title="Naar Start"
            aria-label="OpenAEC Office Studio · Start"
          >
            <span className="office-beeldmerk">
              <FileText size={21} strokeWidth={1.6} />
            </span>
            <strong>
              OpenAEC<span>Office Studio</span>
            </strong>
          </button>
          {(bestand || databaseOpen) && (
            <>
              <span className="office-header-scheiding" />
              <span className="office-modulenaam">
                {module?.kort ?? "Database"}
              </span>
            </>
          )}
          <div className="office-documenttitel">
            {bestand && (
              <>
                <ModuleIcoon size={15} />
                <span>{bestand.naam}</span>
                <i
                  className={gewijzigd ? "gewijzigd" : ""}
                  title={
                    gewijzigd ? "Niet-opgeslagen wijzigingen" : "Ongewijzigd"
                  }
                />
              </>
            )}
          </div>
          <div className="office-snelacties">
            {(bestand || databaseOpen) && (
              <button
                className="office-iconknop"
                onClick={() => setBestandsmenu(true)}
                aria-label="Bestand en Start"
                title="Bestand en Start"
              >
                <Home size={17} />
              </button>
            )}
            <button
              className="office-headerknop"
              disabled={bezig || (databaseOpen && !databaseGereed)}
              onClick={() => void kiesBestand()}
              title={
                databaseOpen
                  ? "Database openen · Ctrl+O"
                  : "Bestand openen · Ctrl+O"
              }
            >
              <FolderOpen size={16} />
              <span>Openen</span>
            </button>
            {bestand && (
              <>
                {(bestand.soort === "docx" ||
                  "__TAURI_INTERNALS__" in window) && (
                  <select
                    className="office-opslagformaat"
                    aria-label="Opslagformaat"
                    title="Bestandsformaat voor Opslaan als"
                    value={exportFormaat}
                    disabled={bezig}
                    onChange={(event) => setExportFormaat(event.target.value)}
                  >
                    {uitvoerformaten(
                      bestand.soort,
                      "__TAURI_INTERNALS__" in window,
                    ).map((ext) => (
                      <option key={ext} value={ext}>
                        {ext === "md" ? "Markdown (.md)" : ext.toUpperCase()}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="office-headerknop office-bewaren"
                  disabled={bezig || !gereed}
                  onClick={() => void opslaan()}
                  title="Opslaan als · Ctrl+S"
                >
                  <Save size={16} />
                  <span>{bezig ? "Bezig…" : "Opslaan als"}</span>
                </button>
              </>
            )}
          </div>
        </header>
        <input
          hidden
          ref={input}
          type="file"
          accept={invoerformaten}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (bezigRef.current) return;
            const ext = file.name.split(".").pop()?.toLowerCase();
            const soort = bestandssoort(ext ?? "");
            if (!ext || !soort) {
              setMelding("Dit bestandsformaat wordt nog niet ondersteund.");
              return;
            }
            if (!file.size || file.size > 100 * 1024 * 1024) {
              setMelding(
                "Kies een bestand van maximaal 100 MB dat niet leeg is.",
              );
              return;
            }
            bezigRef.current = true;
            setBezig(true);
            try {
              const bytes = new Uint8Array(await file.arrayBuffer());
              const controle =
                ext === soort ? controleerPakket(bytes, soort) : null;
              if (ext === soort && !controle?.strict) {
                open(soort, file.name, bytes);
                if (controle?.macros)
                  setMelding(
                    "Dit bestand bevat VBA. Macro’s worden niet uitgevoerd; behoud van VBA bij export is niet gegarandeerd. Bewaar het origineel.",
                  );
              } else {
                const omgezet = await converteer(bytes, ext, soort, soort);
                controleerPakket(omgezet, soort);
                const id = open(
                  soort,
                  file.name.replace(/\.[^.]+$/, "") + "." + soort,
                  omgezet,
                );
                if (Object.hasOwn(bestandstypen[soort].uitvoer, ext))
                  setExportFormaat(ext);
                bewerkt(id);
                setMelding(
                  "Geïmporteerd als bewerkbare kopie. Het origineel is behouden. Opmaak kan afwijken; macro’s en actieve inhoud zijn niet uitgevoerd en worden niet overgenomen in deze kopie.",
                );
              }
              setDatabaseOpen(false);
            } catch (error) {
              setMelding("Openen mislukt: " + String(error));
            } finally {
              bezigRef.current = false;
              setBezig(false);
            }
          }}
        />
        {melding && (
          <div role="status" className="office-message">
            <span>{melding}</span>
            <button onClick={() => setMelding("")} aria-label="Melding sluiten">
              <X size={15} />
            </button>
          </div>
        )}
        {bestand?.soort === "docx" && exportFormaat === "md" && (
          <div className="office-exportuitleg" role="note">
            Markdown bewaart tekst en structuur. Bewaar ook een DOCX voor
            paginaopmaak, afbeeldingen en revisies.
          </div>
        )}
        {bestand ? (
          <div
            className="office-editor"
            inert={bestandsmenu || verlaatvraag || (bezig && !opslag.bezig)}
          >
            <EditorGrens key={bestand.id}>
              <Suspense
                fallback={<p className="office-loading">Editor laden…</p>}
              >
                <Editor
                  key={bestand.id}
                  soort={bestand.soort}
                  bytes={bestand.bytes}
                  naam={bestand.naam}
                  gewijzigd={() => bewerkt(bestand.id)}
                  fout={(e) => setMelding(e.message)}
                  registreer={registreer}
                  opslaan={() => void opslaan()}
                  bestandsmenu={() => setBestandsmenu(true)}
                  inactief={
                    bestandsmenu || verlaatvraag || (bezig && !opslag.bezig)
                  }
                />
              </Suspense>
            </EditorGrens>
          </div>
        ) : databaseOpen ? (
          <DatabaseStudio
            bestandsmenu={() => setBestandsmenu(true)}
            inactief={bestandsmenu || verlaatvraag}
            registreerOpenen={registreerDatabaseOpenen}
          />
        ) : null}
        {(bestandsmenu || (!bestand && !databaseOpen)) && (
          <div
            className={`office-backstage ${bestand || databaseOpen ? "is-overlay" : ""}`}
          >
            <StartScherm
              bezig={bezig || (databaseOpen && !databaseGereed)}
              terug={
                bestand || databaseOpen
                  ? () => setBestandsmenu(false)
                  : undefined
              }
              open={() => void kiesBestand()}
              nieuw={(soort) => void nieuw(soort)}
              voorbeeld={(soort) => void voorbeeld(soort)}
              databaseActief={databaseOpen}
              bewaar={bestand && gereed ? () => void opslaan() : undefined}
              openDatabase={() =>
                void (async () => {
                  if (bezigRef.current) return;
                  if (!(await verlaten())) return;
                  opslag.wissel();
                  serialiseer.current = null;
                  setGereed(false);
                  setBestand(null);
                  setDatabaseOpen(true);
                  setBestandsmenu(false);
                  setGewijzigd(false);
                  setMelding("");
                })()
              }
            />
          </div>
        )}
        <footer className="office-statusbalk">
          <span>
            <HardDrive size={12} />
            <i />
            Lokaal
          </span>
          <span>
            {module?.naam ??
              (databaseOpen ? "Open Database Studio" : "OpenAEC Office Studio")}
          </span>
          <span className="office-statusrechts">
            {bestand
              ? !gereed
                ? "Laden…"
                : gewijzigd
                  ? "Niet-opgeslagen wijzigingen"
                  : "Gereed"
              : `Ontwikkelversie ${version}`}
            {bestand && <kbd>Ctrl+S</kbd>}
          </span>
        </footer>
      </div>
      {verlaatvraag && (
        <VerlaatDialoog
          naam={bestand?.naam ?? "Dit bestand"}
          antwoord={beantwoordVerlaten}
          vorigeFocus={vorigeFocus.current}
        />
      )}
    </>
  );
}
