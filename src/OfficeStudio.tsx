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
import { AccessStudio } from "../packages/access/src/AccessStudio";
import "./office.css";
import { StartScherm, modules } from "./StartScherm";
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
    [access, setAccess] = useState(false),
    [bestandsmenu, setBestandsmenu] = useState(true),
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
  async function kiesBestand() {
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!bezig) void kiesBestand();
      }
      if (e.key === "Escape" && bestandsmenu && (bestand || access))
        setBestandsmenu(false);
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
    setAccess(false);
    setBestandsmenu(false);
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
  const module = modules.find((item) => item.soort === bestand?.soort);
  const ModuleIcoon = module?.icoon ?? (access ? Database : FileText);
  return (
    <div
      className="office"
      data-module={bestand?.soort ?? (access ? "access" : "start")}
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
        {(bestand || access) && (
          <>
            <span className="office-header-scheiding" />
            <span className="office-modulenaam">
              {module?.kort ?? "Access"}
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
          {(bestand || access) && (
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
            disabled={bezig}
            onClick={() => void kiesBestand()}
            title="Bestand openen · Ctrl+O"
          >
            <FolderOpen size={16} />
            <span>Openen</span>
          </button>
          {bestand && (
            <button
              className="office-headerknop office-bewaren"
              disabled={bezig || !gereed}
              onClick={() => void opslaan()}
              title="Opslaan als · Ctrl+S"
            >
              <Save size={16} />
              <span>{bezig ? "Bezig…" : "Opslaan als"}</span>
            </button>
          )}
        </div>
      </header>
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
          <span>{melding}</span>
          <button onClick={() => setMelding("")} aria-label="Melding sluiten">
            <X size={15} />
          </button>
        </div>
      )}
      {bestand ? (
        <div className="office-editor" inert={bestandsmenu}>
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
                bestandsmenu={() => setBestandsmenu(true)}
                inactief={bestandsmenu}
              />
            </Suspense>
          </EditorGrens>
        </div>
      ) : access ? (
        <AccessStudio
          bestandsmenu={() => setBestandsmenu(true)}
          inactief={bestandsmenu}
        />
      ) : null}
      {(bestandsmenu || (!bestand && !access)) && (
        <div
          className={`office-backstage ${bestand || access ? "is-overlay" : ""}`}
        >
          <StartScherm
            bezig={bezig}
            terug={bestand || access ? () => setBestandsmenu(false) : undefined}
            open={() => void kiesBestand()}
            nieuw={(soort) => void nieuw(soort)}
            bewaar={bestand && gereed ? () => void opslaan() : undefined}
            access={() =>
              void (async () => {
                if (!(await verlaten())) return;
                setBestand(null);
                setAccess(true);
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
            (access ? "Open Access Studio" : "OpenAEC Office Studio")}
        </span>
        <span className="office-statusrechts">
          {bestand
            ? !gereed
              ? "Laden…"
              : gewijzigd
                ? "Niet-opgeslagen wijzigingen"
                : "Gereed"
            : "Ontwikkelversie 0.3"}
          {bestand && <kbd>Ctrl+S</kbd>}
        </span>
      </footer>
    </div>
  );
}
