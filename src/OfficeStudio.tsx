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
import { FolderOpen, Save, Home, X, HardDrive } from "lucide-react";
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
import { controleerPakket, risicoBeleid } from "./pakketcontrole";
import versie from "../versie.json";
import openaecSymbool from "./stijl/openaec-symbol.svg";
import { ThemaKnop, useOfficeThema } from "./stijl/ThemaKnop";
import {
  bestandstypen,
  bestandssoort,
  converteer,
  invoerformaten,
  uitvoerformaten,
} from "./formaten";
import { bewaarKopie, opslagMelding } from "./documentOpslaan";
import { useTabbladen } from "./useTabbladen";
import { naamloos, titel, vingerafdruk, type Tabblad } from "./tabbladen";
import { TabBalk, paneelId, tabId, tabbladIcoon } from "./TabBalk";
import { useTabSneltoetsen } from "./useTabSneltoetsen";
import { useVensters } from "./useVensters";
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
    [databaseGereed, setDatabaseGereed] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    bezigRef = useRef(false);
  const databaseOpenen = useRef<(() => void) | null>(null);
  const notitieActies = useRef<NotitieActies | null>(null);
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
  const actieveModule = actief?.type === "module" ? actief.module : null;
  const opStart = actief === null;
  const verlaatvraag = tabs.verlaatvraag !== null;

  const vensters = useVensters({
    tabs,
    openDocument: (document) => tabs.openDocument(document),
    openModule: (module) => tabs.openModule(module),
  });

  const registreerNotities = useCallback((acties: NotitieActies | null) => {
    notitieActies.current = acties;
  }, []);
  const notitiesBewerkt = useCallback(
    (waarde: boolean) => tabs.moduleBewerkt("notities", waarde),
    [tabs.moduleBewerkt],
  );
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

  const aantalGewijzigd = toestand.tabbladen.filter((t) => t.gewijzigd).length;
  useEffect(() => {
    vensters.meldWijzigingen(aantalGewijzigd);
  }, [aantalGewijzigd]);
  useEffect(() => {
    const sluit = (e: BeforeUnloadEvent) => {
      notitieActies.current?.bewaren();
      if (tabs.gewijzigdeTabbladen().length) {
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
      return !tabs.isGewijzigd(tabblad);
    }
    const serialiseer = tabs.serialiseerder(tabblad.id);
    const opslag = tabs.opslag(tabblad.id);
    if (!serialiseer || !opslag || bezigRef.current) return false;
    bezigRef.current = true;
    setBezig(true);
    setOpslaanBezig(true);
    try {
      const resultaat = await opslag.opslaan(serialiseer, (bytes) =>
        bewaarKopie(tabblad, bytes),
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
    const element = actiefId === null ? null : laatsteFocus.current.get(actiefId);
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
        doel.closest(".office-tabbalk, .office-header, .office-dialoogachtergrond")
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
    uit: verlaatvraag,
    actief,
    opStart,
    vorige: toestand.vorige,
    opslaan: () => void opslaan(),
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
    extra: { vingerafdruk?: string; gewijzigd?: boolean; melding?: string } = {},
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
    const ext = file.name.split(".").pop()?.toLowerCase();
    const soort = bestandssoort(ext ?? "");
    if (!ext || !soort) {
      meld("Dit bestandsformaat wordt nog niet ondersteund.");
      return;
    }
    if (!file.size || file.size > 100 * 1024 * 1024) {
      meld("Kies een bestand van maximaal 100 MB dat niet leeg is.");
      return;
    }
    await bezigMet(async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const vinger = await vingerafdruk(file.name, bytes);
        // Hetzelfde bestand opnieuw openen springt naar het bestaande tabblad.
        if (tabs.openBestaand(vinger)) return;
        const controle = ext === soort ? controleerPakket(bytes, soort) : null;
        if (ext === soort && !controle?.strict) {
          openDocument(soort, file.name, bytes, {
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
          file.name.replace(/\.[^.]+$/, "") + "." + soort,
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

  const module = modules.find((item) => item.soort === actiefDocument?.soort);
  const ModuleIcoon = actief && tabbladIcoon(actief);
  const melding = actief?.melding || tabs.melding;
  const vorigeTab = toestand.tabbladen.find((t) => t.id === toestand.vorige);
  const vorigDocument = vorigeTab?.type === "document" ? vorigeTab : null;
  const editorInactief = verlaatvraag || (bezig && !opslaanBezig);

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
        inert={verlaatvraag}
        data-module={
          actiefDocument?.soort ?? actieveModule ?? "start"
        }
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
                {(actiefDocument.soort === "docx" || tauri) && (
                  <select
                    className="office-opslagformaat"
                    aria-label="Opslagformaat"
                    title="Bestandsformaat voor Opslaan als"
                    value={actiefDocument.exportFormaat}
                    disabled={bezig}
                    onChange={(event) =>
                      tabs.werkBij(actiefDocument.id, {
                        exportFormaat: event.target.value,
                      })
                    }
                  >
                    {uitvoerformaten(actiefDocument.soort, tauri).map((ext) => (
                      <option key={ext} value={ext}>
                        {ext === "md" ? "Markdown (.md)" : ext.toUpperCase()}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="office-headerknop office-bewaren"
                  disabled={bezig || !actiefDocument.gereed}
                  onClick={() => void opslaan()}
                  title="Opslaan als · Ctrl+S"
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
          verplaats={(id, naar) => tabs.verwerk({ type: "verplaats", id, naar })}
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
                      inactief={!zichtbaar || verlaatvraag}
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
                    inactief={!zichtbaar || verlaatvraag}
                    registreerOpenen={registreerDatabaseOpenen}
                    bewaarUitvoer={bewaarDatabaseUitvoer}
                    bewaarBinair={bewaarDatabaseBinair}
                    gewijzigd={databaseBewerkt}
                  />,
                );
              return paneel(
                tabblad,
                <p className="office-loading">
                  Deze module is in deze versie nog niet beschikbaar.
                </p>,
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
              terug={
                vorigeTab ? () => wissel(vorigeTab.id, true) : undefined
              }
              open={() => input.current?.click()}
              nieuw={(soort) => void nieuw(soort)}
              voorbeeld={(soort) => void voorbeeld(soort)}
              openNotities={() => tabs.openModule("notities")}
              openDatabase={() => tabs.openModule("database")}
              bewaar={
                vorigDocument?.gereed
                  ? () => void opslaan(vorigDocument.id)
                  : undefined
              }
            />
          </div>
        </div>
        <footer className="office-statusbalk">
          <span>
            <HardDrive size={12} />
            <i />
            Lokaal
          </span>
          <span>
            {module?.naam ??
              (actieveModule === "notities"
                ? "Open Notities Studio"
                : actieveModule === "database"
                  ? "Open Database Studio"
                  : "OpenAEC Office Studio")}
          </span>
          <span className="office-statusrechts">
            {actiefDocument && actiefDocument.zoom !== null && (
              <span
                className="office-statuszoom"
                title="Ctrl + scrollwiel of Ctrl + = en Ctrl + − om te zoomen, Ctrl + 0 voor 100%"
              >
                {Math.round(actiefDocument.zoom * 100)}%
              </span>
            )}
            {actiefDocument
              ? !actiefDocument.gereed
                ? "Laden…"
                : actiefDocument.gewijzigd
                  ? "Niet-opgeslagen wijzigingen"
                  : "Gereed"
              : aantalGewijzigd
                ? `${aantalGewijzigd} ${aantalGewijzigd === 1 ? "tabblad" : "tabbladen"} met niet-opgeslagen wijzigingen`
                : `Ontwikkelversie ${versie.label}`}
            {actiefDocument && <kbd>Ctrl+S</kbd>}
          </span>
        </footer>
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
    </>
  );
}
