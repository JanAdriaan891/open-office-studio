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
  FileText,
  Sheet,
  Presentation,
  FolderOpen,
  Save,
  Home,
  Database,
} from "lucide-react";
import type { Soort } from "./editors";
import { AccessStudio } from "../packages/access/src/AccessStudio";
import "./office.css";
const Editor = lazy(() => import("./editors"));
const modules = [
  {
    soort: "docx",
    naam: "Open Writer Studio",
    kort: "Writer",
    tekst: "Documenten schrijven en opmaken.",
    icoon: FileText,
  },
  {
    soort: "xlsx",
    naam: "Open Excel Calc Studio",
    kort: "Calc",
    tekst: "Rekenbladen, formules en tabellen.",
    icoon: Sheet,
  },
  {
    soort: "pptx",
    naam: "Open Presentatie Studio",
    kort: "Presentatie",
    tekst: "Verhalen vormgeven in dia’s.",
    icoon: Presentation,
  },
] as const;
type Bestand = { id: number; naam: string; soort: Soort; bytes: Uint8Array };
class EditorGrens extends Component<{ children: ReactNode }, { fout: string }> {
  state = { fout: "" };
  static getDerivedStateFromError(e: Error) {
    return { fout: e.message };
  }
  render() {
    return this.state.fout ? (
      <div role="alert" className="melding">
        De editor kon dit bestand niet openen: {this.state.fout}
      </div>
    ) : (
      this.props.children
    );
  }
}
export function OfficeStudio() {
  const [bestand, setBestand] = useState<Bestand | null>(null),
    [access, setAccess] = useState(false),
    [gewijzigd, setGewijzigd] = useState(false),
    [melding, setMelding] = useState(""),
    [bezig, setBezig] = useState(false),
    [gereed, setGereed] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    serialiseer = useRef<(() => Promise<Uint8Array>) | null>(null),
    versie = useRef(0),
    bezigRef = useRef(false),
    serialiseerBezig = useRef(false);
  const registreer = useCallback((fn: (() => Promise<Uint8Array>) | null) => {
    serialiseer.current = fn;
    setGereed(!!fn);
  }, []);
  function bewerkt() {
    versie.current++;
    setGewijzigd(true);
  }
  async function verlaten() {
    if (!gewijzigd) return true;
    if ("__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<boolean>("bevestig_verlaten");
    }
    return window.confirm(
      "Er zijn wijzigingen die nog niet zijn opgeslagen. Toch sluiten?",
    );
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
      if (gewijzigd) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", sluit);
    return () => window.removeEventListener("beforeunload", sluit);
  }, [gewijzigd]);
  async function bewaarBytes(bytes: Uint8Array, opslagVersie = versie.current) {
    if (!bestand || bezigRef.current) return;
    bezigRef.current = true;
    setBezig(true);
    const v = opslagVersie;
    try {
      if ("__TAURI_INTERNALS__" in window) {
        const { invoke } = await import("@tauri-apps/api/core");
        const pad = await invoke<string | null>("bewaar_kopie", {
          naam: bestand.naam,
          bytes: Array.from(bytes),
        });
        if (!pad) {
          setMelding("Opslaan geannuleerd.");
          return;
        }
        setMelding("Opgeslagen: " + pad);
        if (versie.current === v) setGewijzigd(false);
      } else {
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], {
            type: "application/octet-stream",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = bestand.naam;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMelding(
          "Download aangevraagd. Controleer het bestand in je downloads.",
        );
      }
    } catch (e) {
      setMelding("Opslaan mislukt: " + String(e));
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  }
  async function opslaan() {
    if (!serialiseer.current || bezigRef.current || serialiseerBezig.current)
      return;
    serialiseerBezig.current = true;
    setBezig(true);
    try {
      const v = versie.current;
      const bytes = await serialiseer.current();
      await bewaarBytes(bytes, v);
    } catch (e) {
      setMelding("Opslaan mislukt: " + String(e));
    } finally {
      serialiseerBezig.current = false;
      setBezig(false);
    }
  }
  useEffect(() => {
    const toetsen = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopImmediatePropagation();
        void opslaan();
      }
    };
    window.addEventListener("keydown", toetsen, true);
    return () => window.removeEventListener("keydown", toetsen, true);
  });
  async function open(soort: Soort, naam: string, bytes: Uint8Array) {
    serialiseer.current = null;
    setGereed(false);
    versie.current = 0;
    setGewijzigd(false);
    setMelding("");
    setBestand({ id: Date.now(), soort, naam, bytes });
  }
  async function nieuw(soort: Soort) {
    if (!(await verlaten())) return;
    setBezig(true);
    try {
      const r = await fetch(`/templates/nieuw.${soort}`);
      if (!r.ok) throw new Error("Sjabloon niet beschikbaar");
      await open(
        soort,
        `Naamloos.${soort}`,
        new Uint8Array(await r.arrayBuffer()),
      );
    } catch (e) {
      setMelding(String(e));
    } finally {
      setBezig(false);
    }
  }
  return (
    <div className="office">
      <header className="office-header">
        <strong>
          OpenAEC <span>OFFICE STUDIO</span>
        </strong>
        <span>Lokale ontwikkelversie</span>
      </header>
      <nav className="office-actions">
        <button
          disabled={bezig}
          onClick={async () => {
            if (await verlaten()) {
              setBestand(null);
              setAccess(false);
              setGewijzigd(false);
              setMelding("");
            }
          }}
        >
          <Home size={18} />
          Start
        </button>
        <button
          disabled={bezig}
          onClick={async () => {
            if (await verlaten()) input.current?.click();
          }}
        >
          <FolderOpen size={18} />
          Openen
        </button>
        {bestand && (
          <button disabled={bezig || !gereed} onClick={() => void opslaan()}>
            <Save size={18} />
            {bezig ? "Bezig…" : "Opslaan als"}
          </button>
        )}
        <span>
          {bestand
            ? `${bestand.naam}${gewijzigd ? " • gewijzigd" : ""}`
            : "Documenten · rekenbladen · presentaties"}
        </span>
      </nav>
      <input
        hidden
        ref={input}
        type="file"
        accept=".docx,.xlsx,.pptx"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const ext = file.name.split(".").pop()?.toLowerCase();
          if (!["docx", "xlsx", "pptx"].includes(ext ?? "")) {
            setMelding("Kies een DOCX-, XLSX- of PPTX-bestand.");
            return;
          }
          if (!file.size || file.size > 100 * 1024 * 1024) {
            setMelding(
              "Kies een bestand van maximaal 100 MB dat niet leeg is.",
            );
            return;
          }
          setBezig(true);
          try {
            await open(
              ext as Soort,
              file.name,
              new Uint8Array(await file.arrayBuffer()),
            );
            setAccess(false);
          } catch (error) {
            setMelding("Openen mislukt: " + String(error));
          } finally {
            setBezig(false);
          }
        }}
      />
      {melding && (
        <div role="status" className="office-message">
          {melding}
        </div>
      )}
      {bestand ? (
        <div className="office-editor">
          <EditorGrens key={bestand.id}>
            <Suspense
              fallback={<p className="office-loading">Editor laden…</p>}
            >
              <Editor
                key={bestand.id}
                soort={bestand.soort}
                bytes={bestand.bytes}
                naam={bestand.naam}
                gewijzigd={bewerkt}
                fout={(e) => setMelding(e.message)}
                registreer={registreer}
                opgeslagen={(b) => void bewaarBytes(b)}
              />
            </Suspense>
          </EditorGrens>
        </div>
      ) : access ? (
        <AccessStudio />
      ) : (
        <main className="office-home">
          <p className="eyebrow">JOUW WERK. JOUW BESTANDEN.</p>
          <h1>Ruimte om te maken.</h1>
          <p>Schrijf, reken en presenteer met OpenAEC Office Studio.</p>
          <div className="office-cards">
            {modules.map((m) => (
              <button
                disabled={bezig}
                key={m.soort}
                onClick={() => void nieuw(m.soort)}
              >
                <m.icoon size={36} />
                <h2>{m.naam}</h2>
                <p>{m.tekst}</p>
                <strong>
                  Nieuw{" "}
                  {m.kort === "Writer"
                    ? "document"
                    : m.kort === "Calc"
                      ? "rekenblad"
                      : "presentatie"}{" "}
                  →
                </strong>
              </button>
            ))}
          </div>
          <p className="office-note">
            De editors zijn in ontwikkeling. Controleer opgeslagen bestanden
            voordat je ze in productie gebruikt. ODF en oude binaire
            kantoorformaten zijn nog niet aangesloten.
          </p>
          <button onClick={() => setAccess(true)}>
            <Database size={16} />
            Open Access Studio · experimentele opzet
          </button>
        </main>
      )}
    </div>
  );
}
