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
  NotebookPen,
  Mail,
} from "lucide-react";
import type { EmailActies } from "../packages/email/src/ui/EmailStudio";
import { kantoorModule } from "../packages/email/src/kantoor";
import type { NotitieActies } from "./notities/NotitiesStudio";
import type { Soort } from "./editors";
import {
  DatabaseStudio,
  type DatabaseBinaireUitvoer,
} from "../packages/database/src/DatabaseStudio";
import type { DatabaseUitvoer } from "../packages/database/src/uitvoer";
import "./office.css";
import { StartScherm, modules } from "./StartScherm";
import { DocumentOpslag, type BewaarUitkomst } from "./opslag";
import { VerlaatDialoog } from "./VerlaatDialoog";
import { OpslaanAlsDialoog } from "./OpslaanAlsDialoog";
import {
  bewaarInFormaat,
  standaardKeuze,
  verliesmelding,
  type OpslaanKeuze,
} from "./export/bewaar";
import { editorKoppeling } from "./export/koppeling";
import { controleerPakket, risicoBeleid } from "./pakketcontrole";
import versie from "../versie.json";
import openaecSymbool from "./stijl/openaec-symbol.svg";
import { ThemaKnop, useOfficeThema } from "./stijl/ThemaKnop";
import {
  bestandstypen,
  bestandssoort,
  converteer,
  invoerformaten,
} from "./formaten";
const Editor = lazy(() => import("./editors"));
const tauri = "__TAURI_INTERNALS__" in window;
/** Database-export via de native opslagdialoog; Rust staat alleen bekende exporttypen toe. */
async function bewaarDatabaseNatief(naam: string, bytes: Uint8Array) {
  const { invoke } = await import("@tauri-apps/api/core");
  const pad = await invoke<string | null>("bewaar_database_export", bytes, {
    headers: { "x-database-naam": encodeURIComponent(naam) },
  });
  return pad
    ? ({ status: "opgeslagen", pad } as const)
    : ({ status: "geannuleerd" } as const);
}
// In de browser vallen deze terug op de downloads van Database Studio zelf.
const bewaarDatabaseUitvoer: DatabaseUitvoer | undefined = tauri
  ? (naam, inhoud) =>
      bewaarDatabaseNatief(naam, new TextEncoder().encode(inhoud))
  : undefined;
const bewaarDatabaseBinair: DatabaseBinaireUitvoer | undefined = tauri
  ? (naam, inhoud) => bewaarDatabaseNatief(naam, inhoud)
  : undefined;
const NotitiesStudio = lazy(() => import("./notities/NotitiesStudio"));
const EmailStudio = lazy(() => import("../packages/email/src/ui/EmailStudio"));
const VerzendAlsBijlage = lazy(
  () => import("../packages/email/src/ui/VerzendAlsBijlage"),
);
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
  const { thema, wisselThema } = useOfficeThema();
  const [bestand, setBestand] = useState<Bestand | null>(null),
    [databaseOpen, setDatabaseOpen] = useState(false),
    [notitiesOpen, setNotitiesOpen] = useState(false),
    [emailOpen, setEmailOpen] = useState(false),
    [emailOngelezen, setEmailOngelezen] = useState<number | null>(null),
    [verzending, setVerzending] = useState<{
      naam: string;
      bytes: Uint8Array;
    } | null>(null),
    [bestandsmenu, setBestandsmenu] = useState(true),
    [gewijzigd, setGewijzigd] = useState(false),
    [melding, setMelding] = useState(""),
    [bezig, setBezig] = useState(false),
    [gereed, setGereed] = useState(false),
    [databaseGereed, setDatabaseGereed] = useState(false),
    [verlaatvraag, setVerlaatvraag] = useState(false),
    [exportFormaat, setExportFormaat] = useState("docx"),
    [opslaanAls, setOpslaanAls] = useState(false),
    [documentZoom, setDocumentZoom] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null),
    serialiseer = useRef<(() => Promise<Uint8Array>) | null>(null),
    bezigRef = useRef(false);
  const opslaanKeuze = useRef<OpslaanKeuze | null>(null);
  const verlaatAntwoord = useRef<((doorgaan: boolean) => void) | null>(null);
  const databaseOpenen = useRef<(() => void) | null>(null);
  const notitieActies = useRef<NotitieActies | null>(null);
  const notitieGewijzigd = useRef(false);
  const databaseGewijzigd = useRef(false);
  const emailGewijzigd = useRef(false);
  const emailActies = useRef<EmailActies | null>(null);
  const ongelezenGeteld = useRef(0);
  const databaseBewerkt = useCallback((waarde: boolean) => {
    // Na het verlaten van de database meldt het afsluitende paneel nog 'false';
    // dat mag de status van een intussen geopend document niet overschrijven.
    if (databaseGewijzigd.current === waarde) return;
    databaseGewijzigd.current = waarde;
    setGewijzigd(waarde);
  }, []);
  const registreerNotities = useCallback((acties: NotitieActies | null) => {
    notitieActies.current = acties;
  }, []);
  const notitiesBewerkt = useCallback((waarde: boolean) => {
    notitieGewijzigd.current = waarde;
    setGewijzigd(waarde);
  }, []);
  const emailBewerkt = useCallback(
    (waarde: boolean) => {
      // Een onverzonden opstelling telt mee voor verlaat- en sluitbeveiliging,
      // zonder de status van een open document te wissen.
      emailGewijzigd.current = waarde;
      setGewijzigd(waarde || opslag.gewijzigd);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const registreerEmail = useCallback((acties: EmailActies | null) => {
    emailActies.current = acties;
  }, []);
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
    if (notitieGewijzigd.current) notitieActies.current?.bewaren();
    if (
      !opslag.gewijzigd &&
      !notitieGewijzigd.current &&
      !databaseGewijzigd.current &&
      !emailGewijzigd.current
    )
      return true;
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
    if (notitiesOpen) {
      setBestandsmenu(false);
      requestAnimationFrame(() => notitieActies.current?.openen());
      return;
    }
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
      if (notitieGewijzigd.current) notitieActies.current?.bewaren();
      if (
        opslag.gewijzigd ||
        notitieGewijzigd.current ||
        databaseGewijzigd.current ||
        emailGewijzigd.current
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", sluit);
    return () => window.removeEventListener("beforeunload", sluit);
  }, [opslag]);
  /** Laatste keuze uit Opslaan als; zonder keuze het formaat uit de opslagstatus. */
  function huidigeKeuze(soort: Soort, naam: string) {
    return opslaanKeuze.current ?? standaardKeuze(soort, naam, exportFormaat);
  }
  async function bewaarKopie(
    naam: string,
    bytes: Uint8Array,
  ): Promise<BewaarUitkomst> {
    if (!bestand) throw new Error("Er is geen bestand geopend.");
    return bewaarInFormaat(
      bestand.soort,
      bytes,
      huidigeKeuze(bestand.soort, naam),
    );
  }
  /** PDF zonder kantoorruntime: het afdrukvenster van de editor. */
  async function drukAfNaarPdf(soort: Soort) {
    try {
      const { drukAf } = await import("./export");
      await drukAf(soort);
      setMelding(
        "Kies in het afdrukvenster ‘Opslaan als PDF’ als printer. Het document blijft als gewijzigd gemarkeerd tot je het in het eigen formaat bewaart.",
      );
    } catch (e) {
      setMelding("Afdrukken mislukt: " + String(e));
    }
  }
  function openOpslaanAls() {
    if (!bestand || !gereed || bezigRef.current) return;
    vorigeFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setBestandsmenu(false);
    setOpslaanAls(true);
  }
  async function opslaan() {
    if (notitiesOpen) {
      notitieActies.current?.bewaren();
      return;
    }
    if (emailOpen || verzending) {
      // In Email Studio bewaart Ctrl+S het concept van de open opstelling.
      emailActies.current?.bewaren();
      return;
    }
    if (
      bestand &&
      huidigeKeuze(bestand.soort, bestand.naam).route === "afdrukken"
    ) {
      void drukAfNaarPdf(bestand.soort);
      return;
    }
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
      if (verlaatvraag || opslaanAls) return;
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "s" &&
        bestand
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openOpslaanAls();
        return;
      }
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
      if (
        e.key === "Escape" &&
        bestandsmenu &&
        (bestand || databaseOpen || notitiesOpen || emailOpen)
      )
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
    setNotitiesOpen(false);
    setEmailOpen(false);
    notitieGewijzigd.current = false;
    databaseGewijzigd.current = false;
    emailGewijzigd.current = false;
    setBestandsmenu(false);
    setBestand({ id, soort, naam, bytes });
    setExportFormaat(soort);
    opslaanKeuze.current = null;
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
  /** Opent bytes als bewerkbaar bestand; niet-eigen formaten gaan via conversie. */
  async function importeer(naam: string, bytes: Uint8Array) {
    const ext = naam.split(".").pop()?.toLowerCase() ?? "";
    const soort = bestandssoort(ext);
    if (!soort) {
      setMelding("Dit bestandsformaat wordt nog niet ondersteund.");
      return;
    }
    bezigRef.current = true;
    setBezig(true);
    try {
      const controle = ext === soort ? controleerPakket(bytes, soort) : null;
      if (ext === soort && !controle?.strict) {
        open(soort, naam, bytes);
        if (controle?.macros)
          setMelding(
            "Dit bestand bevat VBA. Macro’s worden niet uitgevoerd; behoud van VBA bij export is niet gegarandeerd. Bewaar het origineel.",
          );
      } else {
        let bronRisico: string | null = null;
        try {
          // OOXML-varianten (zoals .docm, .dotx, .pptm) gaan via conversie.
          bronRisico = risicoBeleid(
            controleerPakket(bytes, soort).risicos,
            soort,
            "conversie",
          ).waarschuwing;
        } catch {
          bronRisico = null;
        }
        const omgezet = await converteer(bytes, ext, soort, soort);
        controleerPakket(omgezet, soort);
        const id = open(
          soort,
          naam.replace(/\.[^.]+$/, "") + "." + soort,
          omgezet,
        );
        if (Object.hasOwn(bestandstypen[soort].uitvoer, ext))
          setExportFormaat(ext);
        bewerkt(id);
        setMelding(
          "Geïmporteerd als bewerkbare kopie. Het origineel is behouden. Opmaak kan afwijken; macro’s en actieve inhoud zijn niet uitgevoerd en worden niet overgenomen in deze kopie." +
            (bronRisico ? " " + bronRisico : ""),
        );
      }
      setDatabaseOpen(false);
    } catch (error) {
      setMelding("Openen mislukt: " + String(error));
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  }
  /** Wisselt naar een module zonder document (Notities, Database of E-mail). */
  async function wisselModule(module: "notities" | "database" | "email") {
    if (bezigRef.current) return false;
    const actief =
      module === "notities"
        ? notitiesOpen
        : module === "database"
          ? databaseOpen
          : emailOpen;
    if (actief) {
      setBestandsmenu(false);
      return true;
    }
    if (!(await verlaten())) return false;
    opslag.wissel();
    serialiseer.current = null;
    setGereed(false);
    setBestand(null);
    setNotitiesOpen(module === "notities");
    setDatabaseOpen(module === "database");
    setEmailOpen(module === "email");
    if (module !== "notities") notitieGewijzigd.current = false;
    if (module !== "database") databaseGewijzigd.current = false;
    emailGewijzigd.current = false;
    setBestandsmenu(false);
    setGewijzigd(false);
    setMelding("");
    return true;
  }
  /** Bijlage uit Email Studio openen als bewerkbare kopie in de juiste module. */
  async function openUitEmail(naam: string, bytes: Uint8Array) {
    if (bezigRef.current) return;
    if (!bytes.length) {
      setMelding("De bijlage is leeg.");
      return;
    }
    if (kantoorModule(naam) === "database") {
      if (!(await wisselModule("database"))) return;
      // Database Studio leest bestanden via zijn eigen bestandskiezer; geef de
      // bijlage daaraan door zodra het paneel klaarstaat.
      let pogingen = 0;
      const geefDoor = () => {
        const kiezer = document.querySelector<HTMLInputElement>(
          '.database-app input[type="file"]',
        );
        if (!kiezer) {
          if (++pogingen < 120) requestAnimationFrame(geefDoor);
          else setMelding("Database Studio kon de bijlage niet ontvangen.");
          return;
        }
        const overdracht = new DataTransfer();
        overdracht.items.add(new File([new Uint8Array(bytes)], naam));
        kiezer.files = overdracht.files;
        kiezer.dispatchEvent(new Event("change", { bubbles: true }));
      };
      requestAnimationFrame(geefDoor);
      return;
    }
    if (!(await verlaten())) return;
    emailGewijzigd.current = false;
    await importeer(naam, bytes);
  }
  async function verzendAlsBijlage() {
    const serialiseerDocument = serialiseer.current;
    if (!bestand || !serialiseerDocument || bezigRef.current) return;
    setBestandsmenu(false);
    bezigRef.current = true;
    setBezig(true);
    try {
      const bytes = await serialiseerDocument();
      setVerzending({ naam: bestand.naam, bytes });
    } catch (error) {
      setMelding("Verzenden als bijlage mislukt: " + String(error));
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  }
  // Ongelezen e-mail voor de vaste ingang op het startscherm (hooguit eens per minuut).
  const startZichtbaar =
    bestandsmenu || (!bestand && !databaseOpen && !notitiesOpen && !emailOpen);
  useEffect(() => {
    if (!startZichtbaar || emailOpen) return;
    if (Date.now() - ongelezenGeteld.current < 60_000) return;
    ongelezenGeteld.current = Date.now();
    // Bewust niet afbreken bij een nieuwe render: de telling is goedkoop en
    // de beperking tot eens per minuut zou een afgebroken telling laten hangen.
    void import("../packages/email/src/backend")
      .then(({ ongelezenInInbox }) => ongelezenInInbox())
      .then(setEmailOngelezen)
      .catch(() => setEmailOngelezen(null));
  }, [startZichtbaar, emailOpen]);
  const module = modules.find((item) => item.soort === bestand?.soort);
  const ModuleIcoon =
    module?.icoon ??
    (notitiesOpen
      ? NotebookPen
      : databaseOpen
        ? Database
        : emailOpen
          ? Mail
          : FileText);
  return (
    <>
      <div
        className="office"
        data-office-thema={thema}
        inert={verlaatvraag || opslaanAls}
        data-module={
          bestand?.soort ??
          (notitiesOpen
            ? "notities"
            : databaseOpen
              ? "database"
              : emailOpen
                ? "email"
                : "start")
        }
      >
        <header className="office-header">
          <button
            className="office-merk"
            onClick={() => setBestandsmenu(true)}
            title="Naar Start"
            aria-label="OpenAEC Office Studio · Start"
          >
            <span className="office-beeldmerk">
              <img src={openaecSymbool} alt="" />
            </span>
            <strong>
              OpenAEC<span>Office Studio</span>
            </strong>
          </button>
          <span className="office-weekversie" title={`Versie ${versie.versie}`}>
            {versie.label}
          </span>
          {(bestand || databaseOpen || notitiesOpen || emailOpen) && (
            <>
              <span className="office-header-scheiding" />
              <span className="office-modulenaam">
                {module?.kort ??
                  (notitiesOpen
                    ? "Notities"
                    : emailOpen
                      ? "E-mail"
                      : "Database")}
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
            <ThemaKnop thema={thema} wissel={wisselThema} />
            {(bestand || databaseOpen || notitiesOpen || emailOpen) && (
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
                notitiesOpen
                  ? "Notitieback-up toevoegen · Ctrl+O"
                  : databaseOpen
                    ? "Database openen · Ctrl+O"
                    : "Bestand openen · Ctrl+O"
              }
            >
              <FolderOpen size={16} />
              <span>{notitiesOpen ? "Back-up toevoegen" : "Openen"}</span>
            </button>
            {bestand && (
              <>
                <button
                  className="office-headerknop office-bewaren"
                  disabled={bezig || !gereed}
                  onClick={openOpslaanAls}
                  title="Opslaan als · Ctrl+Shift+S (Ctrl+S bewaart opnieuw in het laatst gekozen formaat)"
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
            if (!ext || !bestandssoort(ext)) {
              setMelding("Dit bestandsformaat wordt nog niet ondersteund.");
              return;
            }
            if (!file.size || file.size > 100 * 1024 * 1024) {
              setMelding(
                "Kies een bestand van maximaal 100 MB dat niet leeg is.",
              );
              return;
            }
            await importeer(
              file.name,
              new Uint8Array(await file.arrayBuffer()),
            );
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
            inert={
              bestandsmenu ||
              verlaatvraag ||
              !!verzending ||
              (bezig && !opslag.bezig)
            }
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
                    bestandsmenu ||
                    verlaatvraag ||
                    !!verzending ||
                    (bezig && !opslag.bezig)
                  }
                  zoom={setDocumentZoom}
                />
              </Suspense>
            </EditorGrens>
          </div>
        ) : notitiesOpen ? (
          <Suspense
            fallback={<p className="office-loading">Notities laden…</p>}
          >
            <NotitiesStudio
              bestandsmenu={() => setBestandsmenu(true)}
              inactief={bestandsmenu || verlaatvraag}
              registreer={registreerNotities}
              onOnopgeslagen={notitiesBewerkt}
            />
          </Suspense>
        ) : emailOpen ? (
          <Suspense
            fallback={<p className="office-loading">Email Studio laden…</p>}
          >
            <EmailStudio
              bestandsmenu={() => setBestandsmenu(true)}
              inactief={bestandsmenu || verlaatvraag}
              onOnverzonden={emailBewerkt}
              openInKantoor={(naam, bytes) => void openUitEmail(naam, bytes)}
              melding={setMelding}
              ongelezen={setEmailOngelezen}
              registreer={registreerEmail}
            />
          </Suspense>
        ) : databaseOpen ? (
          <DatabaseStudio
            bestandsmenu={() => setBestandsmenu(true)}
            inactief={bestandsmenu || verlaatvraag}
            registreerOpenen={registreerDatabaseOpenen}
            bewaarUitvoer={bewaarDatabaseUitvoer}
            bewaarBinair={bewaarDatabaseBinair}
            gewijzigd={databaseBewerkt}
          />
        ) : null}
        {startZichtbaar && (
          <div
            className={`office-backstage ${bestand || databaseOpen || notitiesOpen || emailOpen ? "is-overlay" : ""}`}
          >
            <StartScherm
              bezig={bezig || (databaseOpen && !databaseGereed)}
              terug={
                bestand || databaseOpen || notitiesOpen || emailOpen
                  ? () => setBestandsmenu(false)
                  : undefined
              }
              open={() => void kiesBestand()}
              nieuw={(soort) => void nieuw(soort)}
              voorbeeld={(soort) => void voorbeeld(soort)}
              databaseActief={databaseOpen}
              notitiesActief={notitiesOpen}
              openNotities={() => void wisselModule("notities")}
              emailActief={emailOpen}
              emailOngelezen={emailOngelezen}
              openEmail={() => void wisselModule("email")}
              verzend={
                bestand && gereed ? () => void verzendAlsBijlage() : undefined
              }
              bewaar={bestand && gereed ? () => void opslaan() : undefined}
              openDatabase={() => void wisselModule("database")}
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
              (notitiesOpen
                ? "Open Notities Studio"
                : databaseOpen
                  ? "Open Database Studio"
                  : emailOpen
                    ? "OpenAEC Email Studio"
                    : "OpenAEC Office Studio")}
          </span>
          <span className="office-statusrechts">
            {bestand && documentZoom !== null && (
              <span
                className="office-statuszoom"
                title="Ctrl + scrollwiel of Ctrl + = en Ctrl + − om te zoomen, Ctrl + 0 voor 100%"
              >
                {Math.round(documentZoom * 100)}%
              </span>
            )}
            {bestand
              ? !gereed
                ? "Laden…"
                : gewijzigd
                  ? "Niet-opgeslagen wijzigingen"
                  : "Gereed"
              : emailOpen
                ? emailOngelezen
                  ? `${emailOngelezen} ongelezen in Postvak IN`
                  : "Gereed"
                : `Ontwikkelversie ${versie.label}`}
            {bestand && <kbd>Ctrl+S</kbd>}
          </span>
        </footer>
        {verzending && (
          <Suspense fallback={null}>
            <VerzendAlsBijlage
              naam={verzending.naam}
              bytes={verzending.bytes}
              sluit={() => {
                setVerzending(null);
                emailBewerkt(false);
              }}
              melding={setMelding}
              onOnverzonden={emailBewerkt}
              registreer={registreerEmail}
            />
          </Suspense>
        )}
      </div>
      {verlaatvraag && (
        <VerlaatDialoog
          naam={
            bestand?.naam ??
            (notitiesOpen
              ? "Je notities"
              : databaseOpen
                ? "De databasewerkkopie"
                : emailOpen
                  ? "Je onverzonden bericht"
                  : "Dit bestand")
          }
          antwoord={beantwoordVerlaten}
          vorigeFocus={vorigeFocus.current}
        />
      )}
      {opslaanAls && bestand && (
        <OpslaanAlsDialoog
          soort={bestand.soort}
          naam={opslaanKeuze.current?.naam ?? bestand.naam}
          formaat={opslaanKeuze.current?.ext ?? exportFormaat}
          verlies={(formaat, route) =>
            verliesmelding(bestand.bytes, bestand.soort, formaat, route)
          }
          bladen={editorKoppeling(bestand.soort)?.bladen?.() ?? null}
          dias={editorKoppeling(bestand.soort)?.dias?.() ?? null}
          vorigeFocus={vorigeFocus.current}
          annuleer={() => setOpslaanAls(false)}
          bevestig={(keuze) => {
            opslaanKeuze.current = keuze;
            setExportFormaat(keuze.ext);
            setOpslaanAls(false);
            void opslaan();
          }}
        />
      )}
    </>
  );
}
