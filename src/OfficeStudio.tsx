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
import { FolderOpen, Save, Home, X } from "lucide-react";
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
import { VerlaatDialoog } from "./VerlaatDialoog";
import { OpslaanAlsDialoog } from "./OpslaanAlsDialoog";
import {
  bewaarInFormaat,
  voorlaadExport,
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
import { opslagMelding } from "./documentOpslaan";
import { useTabbladen } from "./useTabbladen";
import { naamloos, titel, vingerafdruk, type Tabblad } from "./tabbladen";
import { TabBalk, paneelId, tabId, tabbladIcoon } from "./TabBalk";
import { useTabSneltoetsen } from "./useTabSneltoetsen";
import { useVensters } from "./useVensters";
import { useSysteembestanden } from "./systeembestanden";
import { Werkruimtehulp } from "./werkruimte/Werkruimtehulp";
import { Statusbalk } from "./status/Statusbalk";
import { leesInstellingen } from "./instellingen";
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
  const [bezig, setBezig] = useState(false),
    [opslaanBezig, setOpslaanBezig] = useState(false),
    [databaseGereed, setDatabaseGereed] = useState(false),
    // Tabblad waarvoor het venster Opslaan als openstaat.
    [opslaanAls, setOpslaanAls] = useState<number | null>(null),
    [emailOngelezen, setEmailOngelezen] = useState<number | null>(null),
    [verzending, setVerzending] = useState<{
      naam: string;
      bytes: Uint8Array;
    } | null>(null),
    [verzendingOnverzonden, setVerzendingOnverzonden] = useState(false),
    // Bestand dat Database Studio moet openen (bijlage of bestandskoppeling).
    [databaseStart, setDatabaseStart] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null),
    bezigRef = useRef(false);
  const databaseOpenen = useRef<(() => void) | null>(null);
  const notitieActies = useRef<NotitieActies | null>(null);
  const emailActies = useRef<EmailActies | null>(null);
  const verzendActies = useRef<EmailActies | null>(null);
  const ongelezenGeteld = useRef(0);
  /** Laatste keuze uit Opslaan als, per documenttabblad. */
  const opslaanKeuzes = useRef(new Map<number, OpslaanKeuze>());
  const vorigeFocus = useRef<HTMLElement | null>(null);
  const laatsteFocus = useRef(new Map<number, HTMLElement>());

  const tabs = useTabbladen({
    opslaan: (id) => opslaan(id),
    voorSluiten: (tabblad) => {
      if (tabblad.type === "module" && tabblad.module === "notities")
        notitieActies.current?.bewaren();
    },
  });
  const { toestand, actief, meld } = tabs;
  const actiefDocument = actief?.type === "document" ? actief : null;
  const documentGereed = !!actiefDocument?.gereed;
  useEffect(() => {
    // Opslaan mag niet afhangen van onderdelen die later van de server moeten komen.
    if (documentGereed) voorlaadExport();
  }, [documentGereed]);
  const actieveModule = actief?.type === "module" ? actief.module : null;
  const opStart = actief === null;
  const verlaatvraag = tabs.verlaatvraag !== null;

  const vensters = useVensters({
    tabs,
    voorOverdracht: (tabblad) => {
      if (tabblad.type === "module" && tabblad.module === "notities")
        notitieActies.current?.bewaren();
    },
  });

  const registreerNotities = useCallback((acties: NotitieActies | null) => {
    notitieActies.current = acties;
  }, []);
  const notitiesBewerkt = useCallback(
    (waarde: boolean) => tabs.moduleBewerkt("notities", waarde),
    [tabs.moduleBewerkt],
  );
  const emailBewerkt = useCallback(
    (waarde: boolean) => tabs.moduleBewerkt("email", waarde),
    [tabs.moduleBewerkt],
  );
  const registreerEmail = useCallback((acties: EmailActies | null) => {
    emailActies.current = acties;
  }, []);
  const registreerVerzending = useCallback((acties: EmailActies | null) => {
    verzendActies.current = acties;
  }, []);
  const databaseStartGelezen = useCallback(() => setDatabaseStart(null), []);
  const databaseBewerkt = useCallback(
    (waarde: boolean) => tabs.moduleBewerkt("database", waarde),
    [tabs.moduleBewerkt],
  );
  const registreerDatabaseOpenen = useCallback(
    (openen: (() => void) | null) => {
      databaseOpenen.current = openen;
      setDatabaseGereed(!!openen);
    },
    [],
  );

  const toonStart = () => tabs.verwerk({ type: "toonStart" });

  /** Openen: in een module de eigen invoer, anders het bestandsvenster. */
  function kiesBestand() {
    if (bezigRef.current) return;
    if (actieveModule === "notities") {
      notitieActies.current?.openen();
      return;
    }
    if (actieveModule === "database") {
      databaseOpenen.current?.();
      return;
    }
    input.current?.click();
  }

  // Een onverzonden bericht uit "Verzenden als bijlage" telt mee voor de sluitbeveiliging.
  const aantalGewijzigd =
    toestand.tabbladen.filter((t) => t.gewijzigd).length +
    (verzendingOnverzonden ? 1 : 0);
  const verzendingRef = useRef(verzendingOnverzonden);
  verzendingRef.current = verzendingOnverzonden;
  useEffect(() => {
    vensters.meldWijzigingen(aantalGewijzigd);
  }, [aantalGewijzigd]);
  useEffect(() => {
    const sluit = (e: BeforeUnloadEvent) => {
      notitieActies.current?.bewaren();
      if (tabs.gewijzigdeTabbladen().length || verzendingRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", sluit);
    return () => window.removeEventListener("beforeunload", sluit);
  }, [tabs.gewijzigdeTabbladen]);

  /** Slaat een tabblad op; waar als het daarna gesloten mag worden. */
  async function opslaan(id = actief?.id): Promise<boolean> {
    const tabblad = tabs.toestandRef.current.tabbladen.find((t) => t.id === id);
    if (!tabblad) return false;
    if (tabblad.type === "module") {
      if (tabblad.module === "notities") notitieActies.current?.bewaren();
      // In Email Studio bewaart Opslaan het concept van de open opstelling.
      if (tabblad.module === "email") emailActies.current?.bewaren();
      return !tabs.isGewijzigd(tabblad);
    }
    const keuze = huidigeKeuze(tabblad);
    if (keuze.route === "afdrukken") {
      // PDF zonder kantoorruntime: het afdrukvenster van de zichtbare editor.
      if (tabblad.id === tabs.toestandRef.current.actief)
        await drukAfNaarPdf(tabblad.soort, tabblad.id);
      return false;
    }
    const serialiseer = tabs.serialiseerder(tabblad.id);
    const opslag = tabs.opslag(tabblad.id);
    if (!serialiseer || !opslag || bezigRef.current) return false;
    bezigRef.current = true;
    setBezig(true);
    setOpslaanBezig(true);
    try {
      const resultaat = await opslag.opslaan(serialiseer, (bytes) =>
        bewaarInFormaat(tabblad.soort, bytes, keuze),
      );
      if (resultaat.status === "mislukt") {
        meld("Opslaan mislukt: " + resultaat.fout, tabblad.id);
        return false;
      }
      if (resultaat.status !== "afgerond") return false;
      meld(opslagMelding(resultaat.uitkomst), tabblad.id);
      if (resultaat.schoon) tabs.werkBij(tabblad.id, { gewijzigd: false });
      // In de browser is een aangevraagde download het beste dat we weten.
      return resultaat.schoon || resultaat.uitkomst.status === "download";
    } finally {
      bezigRef.current = false;
      setBezig(false);
      setOpslaanBezig(false);
    }
  }

  /** Laatste keuze uit Opslaan als; zonder keuze het formaat van het tabblad. */
  function huidigeKeuze(tabblad: Extract<Tabblad, { type: "document" }>) {
    return (
      opslaanKeuzes.current.get(tabblad.id) ??
      standaardKeuze(tabblad.soort, tabblad.naam, tabblad.exportFormaat)
    );
  }

  async function drukAfNaarPdf(soort: Soort, id: number) {
    try {
      const { drukAf } = await import("./export");
      await drukAf(soort);
      meld(
        "Kies in het afdrukvenster ‘Opslaan als PDF’ als printer. Het document blijft als gewijzigd gemarkeerd tot je het in het eigen formaat bewaart.",
        id,
      );
    } catch (e) {
      meld("Afdrukken mislukt: " + String(e), id);
    }
  }

  function openOpslaanAls(id = actief?.id) {
    const tabblad = tabs.toestandRef.current.tabbladen.find((t) => t.id === id);
    if (tabblad?.type !== "document" || !tabblad.gereed || bezigRef.current)
      return;
    vorigeFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // De dialoog leest het actieve blad en de huidige dia van de zichtbare editor.
    tabs.verwerk({ type: "activeer", id: tabblad.id });
    setOpslaanAls(tabblad.id);
  }

  /** Ctrl+S: in een opstelling het concept bewaren, anders het actieve tabblad. */
  function opslaanToets() {
    if (verzending) {
      verzendActies.current?.bewaren();
      return;
    }
    void opslaan();
  }

  async function verzendAlsBijlage(id: number) {
    const tabblad = tabs.toestandRef.current.tabbladen.find((t) => t.id === id);
    const serialiseer = tabs.serialiseerder(id);
    if (tabblad?.type !== "document" || !serialiseer || bezigRef.current)
      return;
    await bezigMet(async () => {
      try {
        setVerzending({ naam: tabblad.naam, bytes: await serialiseer() });
      } catch (error) {
        meld("Verzenden als bijlage mislukt: " + String(error), id);
      }
    });
  }

  async function sluit(ids: number[]) {
    if (bezigRef.current) return;
    vorigeFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    await tabs.sluit(ids);
    for (const id of laatsteFocus.current.keys())
      if (!tabs.toestandRef.current.tabbladen.some((t) => t.id === id))
        laatsteFocus.current.delete(id);
  }

  /** Activeert een tabblad en zet de focus terug waar die in dat tabblad was. */
  function wissel(id: number | null, focus = false) {
    tabs.verwerk(
      id === null ? { type: "toonStart" } : { type: "activeer", id },
    );
    if (focus) herstelFocus();
  }
  // Editors renderen hun invoerveld soms buiten het paneel (portal); daarom
  // onthouden we de focus per actief tabblad en halen die bij wisselen weg.
  const actiefId = toestand.actief;
  const actiefRef = useRef(actiefId);
  useEffect(() => {
    const vorige = actiefRef.current;
    actiefRef.current = actiefId;
    if (vorige === actiefId) return;
    const oud = vorige === null ? null : laatsteFocus.current.get(vorige);
    if (oud && document.activeElement === oud) oud.blur();
    if (!focusHerstellen.current) return;
    focusHerstellen.current = false;
    const element =
      actiefId === null ? null : laatsteFocus.current.get(actiefId);
    if (element?.isConnected) element.focus({ preventScroll: true });
    else document.getElementById(tabId(actiefId))?.focus();
  }, [actiefId]);
  useEffect(() => {
    const focus = (event: FocusEvent) => {
      const id = actiefRef.current;
      const doel = event.target;
      if (
        id === null ||
        !(doel instanceof HTMLElement) ||
        doel.closest(
          ".office-tabbalk, .office-header, .office-dialoogachtergrond",
        )
      )
        return;
      laatsteFocus.current.set(id, doel);
    };
    window.addEventListener("focusin", focus, true);
    return () => window.removeEventListener("focusin", focus, true);
  }, []);
  const focusHerstellen = useRef(false);
  function herstelFocus() {
    focusHerstellen.current = true;
  }

  useTabSneltoetsen({
    uit: verlaatvraag || opslaanAls !== null,
    actief,
    opStart,
    vorige: toestand.vorige,
    opslaan: opslaanToets,
    opslaanAls: () => openOpslaanAls(),
    openen: kiesBestand,
    sluit: () => actief && void sluit([actief.id]),
    verwerk: (actie) => {
      tabs.verwerk(actie);
      herstelFocus();
    },
    terug: () => toestand.vorige !== null && wissel(toestand.vorige, true),
  });

  function openDocument(
    soort: Soort,
    naam: string,
    bytes: Uint8Array,
    extra: {
      vingerafdruk?: string;
      gewijzigd?: boolean;
      melding?: string;
      exportFormaat?: string;
    } = {},
  ) {
    return tabs.openDocument({ soort, naam, bytes, ...extra });
  }

  async function bezigMet(taak: () => Promise<void>) {
    if (bezigRef.current) return;
    bezigRef.current = true;
    setBezig(true);
    try {
      await taak();
    } catch (e) {
      meld(String(e));
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  }

  const nieuw = (soort: Soort) =>
    bezigMet(async () => {
      const r = await fetch(`/templates/nieuw.${soort}`);
      if (!r.ok) throw new Error("Sjabloon niet beschikbaar");
      openDocument(
        soort,
        naamloos(tabs.toestandRef.current, soort),
        new Uint8Array(await r.arrayBuffer()),
        // Standaardformaat uit de instellingen (OOXML of ODF).
        { exportFormaat: leesInstellingen().opslagformaat[soort] },
      );
    });

  const voorbeeld = (soort: Soort) =>
    bezigMet(async () => {
      const module = modules.find((module) => module.soort === soort)!;
      const naam = `${module.voorbeeld}.${soort}`;
      const resultaat = await fetch(`/voorbeelden/${naam}`);
      if (!resultaat.ok)
        throw new Error("Het voorbeeld kon niet worden geopend.");
      const bytes = new Uint8Array(await resultaat.arrayBuffer());
      controleerPakket(bytes, soort);
      openDocument(soort, naam, bytes, {
        vingerafdruk: await vingerafdruk(naam, bytes),
      });
    });

  async function openBestand(file: File) {
    if (!file.size || file.size > 100 * 1024 * 1024) {
      meld("Kies een bestand van maximaal 100 MB dat niet leeg is.");
      return;
    }
    await importeer(file.name, new Uint8Array(await file.arrayBuffer()));
  }

  /** Opent bytes in een nieuw tabblad; niet-eigen formaten gaan via conversie. */
  async function importeer(naam: string, bytes: Uint8Array) {
    const ext = naam.split(".").pop()?.toLowerCase();
    const soort = bestandssoort(ext ?? "");
    if (!ext || !soort) {
      meld("Dit bestandsformaat wordt nog niet ondersteund.");
      return;
    }
    await bezigMet(async () => {
      try {
        const vinger = await vingerafdruk(naam, bytes);
        // Hetzelfde bestand opnieuw openen springt naar het bestaande tabblad.
        if (tabs.openBestaand(vinger)) return;
        const controle = ext === soort ? controleerPakket(bytes, soort) : null;
        if (ext === soort && !controle?.strict) {
          openDocument(soort, naam, bytes, {
            vingerafdruk: vinger,
            melding: controle?.macros
              ? "Dit bestand bevat VBA. Macro’s worden niet uitgevoerd; behoud van VBA bij export is niet gegarandeerd. Bewaar het origineel."
              : "",
          });
          return;
        }
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
        const { id } = openDocument(
          soort,
          naam.replace(/\.[^.]+$/, "") + "." + soort,
          omgezet,
          {
            vingerafdruk: vinger,
            gewijzigd: true,
            melding:
              "Geïmporteerd als bewerkbare kopie. Het origineel is behouden. Opmaak kan afwijken; macro’s en actieve inhoud zijn niet uitgevoerd en worden niet overgenomen in deze kopie." +
              (bronRisico ? " " + bronRisico : ""),
          },
        );
        if (Object.hasOwn(bestandstypen[soort].uitvoer, ext))
          tabs.werkBij(id, { exportFormaat: ext });
      } catch (error) {
        meld("Openen mislukt: " + String(error));
      }
    });
  }

  /** Bijlage uit Email Studio openen in een nieuw tabblad van de juiste module. */
  async function openUitEmail(naam: string, bytes: Uint8Array) {
    if (bezigRef.current) return;
    if (!bytes.length) {
      meld("De bijlage is leeg.");
      return;
    }
    if (kantoorModule(naam) === "database") {
      openDatabaseBestand(naam, bytes, "de bijlage");
      return;
    }
    await importeer(naam, bytes);
  }

  /** MDB/ACCDB in het Database-tabblad van dit venster (er is er hooguit één). */
  function openDatabaseBestand(naam: string, bytes: Uint8Array, wat: string) {
    const bestaand = tabs.toestandRef.current.tabbladen.find(
      (t) => t.type === "module" && t.module === "database",
    );
    if (bestaand && tabs.isGewijzigd(bestaand)) {
      tabs.verwerk({ type: "activeer", id: bestaand.id });
      meld(
        `Database Studio heeft een gewijzigde werkkopie. Bewaar of sluit die eerst en open ${wat} daarna opnieuw.`,
        bestaand.id,
      );
      return;
    }
    tabs.openModule("database");
    // Database Studio opent het zodra het paneel klaarstaat (prop startbestand).
    setDatabaseStart(new File([new Uint8Array(bytes)], naam));
  }

  /**
   * Bestand van het besturingssysteem (bestandskoppeling, "Openen met", tweede
   * start): een nieuw tabblad, of het bestaande tabblad als hetzelfde bestand
   * al openstaat; MDB/ACCDB gaan naar het Database-tabblad.
   */
  async function openSysteembestand(
    naam: string,
    lees: () => Promise<Uint8Array>,
  ) {
    // Wacht tot opslaan of een andere opening klaar is; niets valt weg.
    while (bezigRef.current) await new Promise((r) => setTimeout(r, 100));
    let bytes: Uint8Array;
    try {
      bytes = await lees();
    } catch (error) {
      meld(`${naam} openen mislukt: ${String(error)}`);
      return;
    }
    if (kantoorModule(naam) === "database")
      openDatabaseBestand(naam, bytes, "het bestand");
    else await importeer(naam, bytes);
  }
  useSysteembestanden((naam, lees) => openSysteembestand(naam, lees));

  // Ongelezen e-mail voor de vaste ingang op Start (hooguit eens per minuut).
  const emailTabblad = toestand.tabbladen.some(
    (t) => t.type === "module" && t.module === "email",
  );
  useEffect(() => {
    if (!opStart || emailTabblad) return;
    if (Date.now() - ongelezenGeteld.current < 60_000) return;
    ongelezenGeteld.current = Date.now();
    void import("../packages/email/src/backend")
      .then(({ ongelezenInInbox }) => ongelezenInInbox())
      .then(setEmailOngelezen)
      .catch(() => setEmailOngelezen(null));
  }, [opStart, emailTabblad]);

  const module = modules.find((item) => item.soort === actiefDocument?.soort);
  const ModuleIcoon = actief && tabbladIcoon(actief);
  const melding = actief?.melding || tabs.melding;
  const vorigeTab = toestand.tabbladen.find((t) => t.id === toestand.vorige);
  const vorigDocument = vorigeTab?.type === "document" ? vorigeTab : null;
  const dialoogOpen = verlaatvraag || opslaanAls !== null;
  const editorInactief =
    dialoogOpen || !!verzending || (bezig && !opslaanBezig);
  const opslaanTabblad = toestand.tabbladen.find((t) => t.id === opslaanAls);
  const opslaanDocument =
    opslaanTabblad?.type === "document" ? opslaanTabblad : null;

  function paneel(tabblad: Tabblad, inhoud: ReactNode, klasse = "") {
    const zichtbaar = tabblad.id === actief?.id;
    return (
      <div
        key={tabblad.id}
        id={paneelId(tabblad.id)}
        role="tabpanel"
        aria-labelledby={tabId(tabblad.id)}
        className={"office-tabpaneel " + klasse}
        hidden={!zichtbaar}
        inert={!zichtbaar || editorInactief}
      >
        {inhoud}
      </div>
    );
  }

  return (
    <>
      <div
        className="office"
        data-office-thema={thema}
        inert={dialoogOpen}
        data-module={actiefDocument?.soort ?? actieveModule ?? "start"}
      >
        <header className="office-header">
          <button
            className="office-merk"
            onClick={toonStart}
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
          {actief && (
            <>
              <span className="office-header-scheiding" />
              <span className="office-modulenaam">
                {module?.kort ?? titel(actief)}
              </span>
            </>
          )}
          <div className="office-documenttitel">
            {actiefDocument && ModuleIcoon && (
              <>
                <ModuleIcoon size={15} />
                <span>{actiefDocument.naam}</span>
                <i
                  className={actiefDocument.gewijzigd ? "gewijzigd" : ""}
                  role="img"
                  aria-label={
                    actiefDocument.gewijzigd
                      ? "Niet-opgeslagen wijzigingen"
                      : "Ongewijzigd"
                  }
                  title={
                    actiefDocument.gewijzigd
                      ? "Niet-opgeslagen wijzigingen"
                      : "Ongewijzigd"
                  }
                />
              </>
            )}
          </div>
          <div className="office-snelacties">
            <ThemaKnop thema={thema} wissel={wisselThema} />
            {!opStart && (
              <button
                className="office-iconknop"
                onClick={toonStart}
                aria-label="Bestand en Start"
                title="Bestand en Start"
              >
                <Home size={17} />
              </button>
            )}
            <button
              className="office-headerknop"
              disabled={
                bezig || (actieveModule === "database" && !databaseGereed)
              }
              onClick={kiesBestand}
              title={
                actieveModule === "notities"
                  ? "Notitieback-up toevoegen · Ctrl+O"
                  : actieveModule === "database"
                    ? "Database openen · Ctrl+O"
                    : "Bestand openen in een nieuw tabblad · Ctrl+O"
              }
            >
              <FolderOpen size={16} />
              <span>
                {actieveModule === "notities" ? "Back-up toevoegen" : "Openen"}
              </span>
            </button>
            {actiefDocument && (
              <>
                <button
                  className="office-headerknop office-bewaren"
                  disabled={bezig || !actiefDocument.gereed}
                  onClick={() => openOpslaanAls()}
                  title="Opslaan als · Ctrl+Shift+S (Ctrl+S bewaart opnieuw in het laatst gekozen formaat)"
                >
                  <Save size={16} />
                  <span>{opslaanBezig ? "Bezig…" : "Opslaan als"}</span>
                </button>
              </>
            )}
          </div>
        </header>
        <TabBalk
          tabbladen={toestand.tabbladen}
          actief={toestand.actief}
          activeer={(id) => wissel(id)}
          sluit={(ids) => void sluit(ids)}
          verplaats={(id, naar) =>
            tabs.verwerk({ type: "verplaats", id, naar })
          }
          nieuw={toonStart}
          extraMenu={vensters.menu}
          losgesleept={vensters.losgesleept}
        />
        <input
          hidden
          ref={input}
          type="file"
          accept={invoerformaten}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void openBestand(file);
          }}
        />
        {melding && (
          <div role="status" className="office-message">
            <span>{melding}</span>
            <button
              onClick={() =>
                actief?.melding
                  ? tabs.werkBij(actief.id, { melding: "" })
                  : meld("")
              }
              aria-label="Melding sluiten"
            >
              <X size={15} />
            </button>
          </div>
        )}
        {actiefDocument?.soort === "docx" &&
          actiefDocument.exportFormaat === "md" && (
            <div className="office-exportuitleg" role="note">
              Markdown bewaart tekst en structuur. Bewaar ook een DOCX voor
              paginaopmaak, afbeeldingen en revisies.
            </div>
          )}
        <div className="office-werkvlak">
          {/* Vaste volgorde op id: herschikken mag de editors niet verplaatsen in de DOM. */}
          {[...toestand.tabbladen]
            .sort((a, b) => a.id - b.id)
            .map((tabblad) => {
              const zichtbaar = tabblad.id === actief?.id;
              if (tabblad.type === "document") {
                const koppeling = tabs.koppeling(tabblad.id);
                return paneel(
                  tabblad,
                  <EditorGrens>
                    <Suspense
                      fallback={<p className="office-loading">Editor laden…</p>}
                    >
                      <Editor
                        soort={tabblad.soort}
                        bytes={tabblad.bytes}
                        naam={tabblad.naam}
                        gewijzigd={koppeling.gewijzigd}
                        fout={koppeling.fout}
                        registreer={koppeling.registreer}
                        opslaan={() => void opslaan(tabblad.id)}
                        bestandsmenu={toonStart}
                        inactief={!zichtbaar || editorInactief}
                        zichtbaar={zichtbaar}
                        zoom={koppeling.zoom}
                      />
                    </Suspense>
                  </EditorGrens>,
                  "office-editor",
                );
              }
              if (tabblad.module === "notities")
                return paneel(
                  tabblad,
                  <Suspense
                    fallback={<p className="office-loading">Notities laden…</p>}
                  >
                    <NotitiesStudio
                      bestandsmenu={toonStart}
                      inactief={!zichtbaar || dialoogOpen}
                      registreer={registreerNotities}
                      onOnopgeslagen={notitiesBewerkt}
                    />
                  </Suspense>,
                );
              if (tabblad.module === "database")
                return paneel(
                  tabblad,
                  <DatabaseStudio
                    bestandsmenu={toonStart}
                    inactief={!zichtbaar || dialoogOpen}
                    registreerOpenen={registreerDatabaseOpenen}
                    bewaarUitvoer={bewaarDatabaseUitvoer}
                    bewaarBinair={bewaarDatabaseBinair}
                    gewijzigd={databaseBewerkt}
                    startbestand={databaseStart}
                    startbestandGelezen={databaseStartGelezen}
                  />,
                );
              return paneel(
                tabblad,
                <Suspense
                  fallback={
                    <p className="office-loading">Email Studio laden…</p>
                  }
                >
                  <EmailStudio
                    bestandsmenu={toonStart}
                    inactief={!zichtbaar || dialoogOpen || !!verzending}
                    onOnverzonden={emailBewerkt}
                    openInKantoor={(naam, bytes) =>
                      void openUitEmail(naam, bytes)
                    }
                    melding={(tekst) => meld(tekst, tabblad.id)}
                    ongelezen={setEmailOngelezen}
                    registreer={registreerEmail}
                  />
                </Suspense>,
              );
            })}
          <div
            id={paneelId(null)}
            role="tabpanel"
            aria-labelledby={tabId(null)}
            className="office-tabpaneel office-backstage"
            hidden={!opStart}
            inert={!opStart}
          >
            <StartScherm
              bezig={bezig}
              terug={vorigeTab ? () => wissel(vorigeTab.id, true) : undefined}
              open={() => input.current?.click()}
              nieuw={(soort) => void nieuw(soort)}
              voorbeeld={(soort) => void voorbeeld(soort)}
              openNotities={() => tabs.openModule("notities")}
              openDatabase={() => tabs.openModule("database")}
              openEmail={() => tabs.openModule("email")}
              emailOngelezen={emailOngelezen}
              bewaar={
                vorigDocument?.gereed
                  ? () => openOpslaanAls(vorigDocument.id)
                  : undefined
              }
              verzend={
                vorigDocument?.gereed
                  ? () => void verzendAlsBijlage(vorigDocument.id)
                  : undefined
              }
            />
          </div>
        </div>
        <Statusbalk
          soort={actiefDocument?.soort ?? actieveModule}
          moduleNaam={
            module?.naam ??
            (actieveModule === "notities"
              ? "Open Notities Studio"
              : actieveModule === "database"
                ? "Open Database Studio"
                : actieveModule === "email"
                  ? "OpenAEC Email Studio"
                  : "OpenAEC Office Studio")
          }
          document={actiefDocument}
          databaseGewijzigd={actief?.type === "module" && actief.module === "database" ? tabs.isGewijzigd(actief) : null}
          emailOngelezen={emailOngelezen}
          aantalGewijzigd={aantalGewijzigd}
          versieLabel={versie.label}
        />
        {verzending && (
          <Suspense fallback={null}>
            <VerzendAlsBijlage
              naam={verzending.naam}
              bytes={verzending.bytes}
              sluit={() => {
                setVerzending(null);
                setVerzendingOnverzonden(false);
              }}
              melding={(tekst) => meld(tekst)}
              onOnverzonden={setVerzendingOnverzonden}
              registreer={registreerVerzending}
            />
          </Suspense>
        )}
      </div>
      {tabs.verlaatvraag && (
        <VerlaatDialoog
          naam={tabs.verlaatvraag.naam}
          kanOpslaan={tabs.verlaatvraag.kanOpslaan}
          overige={tabs.verlaatvraag.overige}
          antwoord={tabs.beantwoord}
          vorigeFocus={vorigeFocus.current}
        />
      )}
      <Werkruimtehulp soort={actiefDocument?.soort ?? actieveModule} />
      {opslaanDocument && (
        <OpslaanAlsDialoog
          soort={opslaanDocument.soort}
          naam={
            opslaanKeuzes.current.get(opslaanDocument.id)?.naam ??
            opslaanDocument.naam
          }
          formaat={
            opslaanKeuzes.current.get(opslaanDocument.id)?.ext ??
            opslaanDocument.exportFormaat
          }
          verlies={(formaat, route) =>
            verliesmelding(
              opslaanDocument.bytes,
              opslaanDocument.soort,
              formaat,
              route,
            )
          }
          bladen={editorKoppeling(opslaanDocument.soort)?.bladen?.() ?? null}
          dias={editorKoppeling(opslaanDocument.soort)?.dias?.() ?? null}
          vorigeFocus={vorigeFocus.current}
          annuleer={() => setOpslaanAls(null)}
          bevestig={(keuze) => {
            opslaanKeuzes.current.set(opslaanDocument.id, keuze);
            tabs.werkBij(opslaanDocument.id, { exportFormaat: keuze.ext });
            setOpslaanAls(null);
            void opslaan(opslaanDocument.id);
          }}
        />
      )}
    </>
  );
}
