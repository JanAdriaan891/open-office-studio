/**
 * Scherm “Externe verwijzingen”: statische analyse van wat de VBA-code buiten
 * Access nodig heeft (typebibliotheken, Windows-API, COM, bestanden,
 * gekoppelde tabellen …) en “Uitvoeren wat werkt”. Openen voert niets uit;
 * uitvoeren gebeurt alleen na een expliciete keuze, afgeschermd en standaard
 * in proefmodus (elke procedure in een transactie die wordt teruggedraaid).
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FileJson, FileText, PlayCircle, Play, Square, SkipForward } from "lucide-react";
import type {
  Beschikbaarheid,
  ExterneAnalyse,
  GekoppeldeTabelInvoer,
  OntbrekendModus,
  ProcedureAnalyse,
  ProcedureStatus,
} from "../../../vba/src/extern-typen.ts";
import { naarUitvoering } from "../../../vba/src/vba-client.ts";
import type { VbaVerwijzingDetail } from "../access-analyse.ts";
import { Dialoog, useDialogen } from "./Dialoog.tsx";
import {
  belangrijksteOorzaken,
  duurTekst,
  filterProcedures,
  groepeerAfhankelijkheden,
  hostgebeurtenisTekst,
  ketenTekst,
  losUitvoerbaar,
  MODI,
  oorzaakNaam,
  resultaatAlsCsv,
  resultaatAlsJson,
  SOORT_NAAM,
  STATUS_BESCHIKBAAR,
  STATUS_PROCEDURE,
  STATUS_UITVOERING,
  telResultaat,
  uitvoeringFoutTekst,
  verdeelKandidaten,
  verkortPad,
  type AfhankelijkheidRij,
  type ProcedureFilter,
  type Resultaatregel,
  type ResultaatExport,
} from "./extern-logica.ts";
import type { VbaBediening } from "./useVba.tsx";
import type { VbaModule } from "./vba-sessie.ts";

/** Grenzen per procedure in een reeks. */
const TIJDSLIMIET = 10_000;
const STAPPENLIMIET = 1_000_000;
const PAGINA = 150;

type Tab = "verwijzingen" | "windows-api" | "com" | "bestanden" | "gekoppeld" | "overig" | "procedures" | "resultaat";

interface Resultaat {
  datum: string;
  opties: ResultaatExport["opties"] | null;
  teruggedraaid: boolean;
  regels: Resultaatregel[];
}

/**
 * Toestand van het scherm die een wissel naar het VBA-paneel (en terug) moet
 * overleven, ook terwijl een reeks nog loopt. Hoort in de ouder; leeg per werkkopie.
 */
export interface ExterneStaat {
  tab: Tab;
  filter: ProcedureFilter;
  resultaat: Resultaat | null;
  voortgang: { klaar: number; totaal: number; huidig: string } | null;
}
type Zetter<T> = (w: T | ((oud: T) => T)) => void;

export function useExterneStaat(sleutel: unknown) {
  const [tab, setTab] = useState<Tab>("verwijzingen");
  const [filter, setFilter] = useState<ProcedureFilter>({ status: "alle", module: "alle", zoek: "" });
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);
  const [voortgang, setVoortgang] = useState<ExterneStaat["voortgang"]>(null);
  useEffect(() => {
    setTab("verwijzingen");
    setFilter({ status: "alle", module: "alle", zoek: "" });
    setResultaat(null);
    setVoortgang(null);
  }, [sleutel]);
  return { tab, setTab, filter, setFilter, resultaat, setResultaat, voortgang, setVoortgang } as ExterneStaat & {
    setTab: Zetter<Tab>;
    setFilter: Zetter<ProcedureFilter>;
    setResultaat: Zetter<Resultaat | null>;
    setVoortgang: Zetter<ExterneStaat["voortgang"]>;
  };
}

interface ReeksOpties {
  ontbrekend: OntbrekendModus;
  metDeels: boolean;
  automatisch: boolean;
  terugdraaien: boolean;
}

export function ExterneVerwijzingen({
  vba,
  modules,
  databasenaam,
  verwijzingen,
  gekoppeldeTabellen,
  onSpring,
  onGewijzigd,
  onExporteer,
  staat,
}: {
  staat: ReturnType<typeof useExterneStaat>;
  vba: VbaBediening;
  modules: VbaModule[];
  databasenaam: string;
  /** Verwijzingen uit het VBA-project; null als ze onbekend zijn (geen Access-origineel). */
  verwijzingen: VbaVerwijzingDetail[] | null;
  gekoppeldeTabellen: GekoppeldeTabelInvoer[];
  /** Opent de module in het VBA-paneel, eventueel met een gemarkeerde regel. */
  onSpring: (module: string, regel?: number) => void;
  /** Na een uitvoering die de werkkopie kan hebben gewijzigd. */
  onGewijzigd: () => void;
  onExporteer: (naam: string, inhoud: string, type: string, wat: string) => void;
}) {
  const dialogen = useDialogen();
  const [analyse, setAnalyse] = useState<ExterneAnalyse | null>(null);
  const [fout, setFout] = useState("");
  const { tab, setTab, filter, setFilter, resultaat, setResultaat, voortgang, setVoortgang } = staat;
  const [keuze, setKeuze] = useState<ReeksOpties | null>(null);
  const sessie = vba.sessie;

  useEffect(() => {
    let actief = true;
    setAnalyse(null);
    setFout("");
    if (!sessie) return;
    // Alleen statische analyse: er wordt hier niets uitgevoerd.
    sessie.analyseerExtern(modules, verwijzingen ?? undefined, gekoppeldeTabellen).then(
      (a) => actief && setAnalyse(a),
      (e) => actief && setFout(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      actief = false;
    };
  }, [sessie, modules, verwijzingen, gekoppeldeTabellen]);

  const groepen = useMemo(() => groepeerAfhankelijkheden(analyse?.afhankelijkheden ?? []), [analyse]);
  const perSleutel = useMemo(() => new Map((analyse?.procedures ?? []).map((p) => [p.sleutel, p])), [analyse]);
  const spring = (sleutel: string, regel?: number) => {
    const p = perSleutel.get(sleutel);
    const module = p?.module ?? sleutel.split(".")[0];
    onSpring(module, regel ?? p?.regel);
  };

  // ------------------------------------------------------------ uitvoeren
  function voegRegels(nieuw: Resultaatregel[], basis?: Partial<Resultaat>) {
    setResultaat((r) => ({
      datum: basis?.datum ?? r?.datum ?? new Date().toISOString(),
      opties: basis && "opties" in basis ? (basis.opties ?? null) : (r?.opties ?? null),
      teruggedraaid: basis?.teruggedraaid ?? r?.teruggedraaid ?? true,
      regels: [...(basis?.regels ?? r?.regels ?? []), ...nieuw],
    }));
  }

  async function voerReeksUit(o: ReeksOpties) {
    if (!analyse) return;
    setKeuze(null);
    if (
      !o.terugdraaien &&
      !(await dialogen.bevestig({
        titel: "Wijzigingen bewaren in de werkkopie?",
        tekst: (
          <>
            <p>
              Je hebt de proefmodus uitgezet. Wat de procedures aan gegevens wijzigen, toevoegen of verwijderen blijft dan in de werkkopie staan.
              Het Access-origineel blijft altijd ongewijzigd.
            </p>
            <p>Weet je het zeker? Met de proefmodus aan wordt elke procedure na afloop teruggedraaid.</p>
          </>
        ),
        ja: "Ja, wijzigingen bewaren",
        nee: "Annuleren",
        gevaarlijk: true,
      }))
    )
      return;
    if (!(await vba.vraagToestemming("“Uitvoeren wat werkt” voert VBA-procedures uit deze database na elkaar uit."))) return;
    vba.setOntbrekend(o.ontbrekend);
    const { kandidaten, nietUitgevoerd } = verdeelKandidaten(analyse.procedures, o.metDeels);
    const datum = new Date().toISOString();
    setTab("resultaat");
    setResultaat({ datum, opties: { ontbrekend: o.ontbrekend, metDeels: o.metDeels, terugdraaien: o.terugdraaien, dialogenAutomatisch: o.automatisch }, teruggedraaid: true, regels: [] });
    const stopBij = vba.stopnummer();
    let teruggedraaid = true;
    await vba.reeks("Uitvoeren wat werkt", { automatisch: o.automatisch, stil: true }, async (s) => {
      for (const [i, p] of kandidaten.entries()) {
        if (vba.stopnummer() !== stopBij) {
          voegRegels([{ module: p.module, procedure: p.naam, status: "niet-uitgevoerd", reden: "gestopt door de gebruiker" }]);
          continue;
        }
        setVoortgang({ klaar: i, totaal: kandidaten.length, huidig: p.sleutel });
        try {
          // Eén procedure per aanroep, zodat Stop tussen procedures de reeks beëindigt.
          const sv = await s.voerUitWatWerkt(modules, {
            analyse,
            metDeels: o.metDeels,
            ontbrekend: o.ontbrekend,
            terugdraaien: o.terugdraaien,
            tijdslimiet: TIJDSLIMIET,
            stappenlimiet: STAPPENLIMIET,
            filter: (q) => q.sleutel === p.sleutel,
          });
          if (o.terugdraaien && !sv.teruggedraaid) teruggedraaid = false;
          const u = sv.uitvoeringen[0];
          voegRegels([
            u
              ? { module: p.module, procedure: p.naam, status: u.status, uitvoering: u, ontbrekend: o.ontbrekend, teruggedraaid: o.terugdraaien && sv.teruggedraaid }
              : {
                  module: p.module,
                  procedure: p.naam,
                  status: "niet-uitgevoerd",
                  reden: sv.nietUitgevoerd.find((n) => n.module === p.module && n.procedure === p.naam)?.reden ?? "niet als kandidaat herkend",
                },
          ]);
        } catch (e) {
          voegRegels([{ module: p.module, procedure: p.naam, status: "niet-uitgevoerd", reden: e instanceof Error ? e.message : String(e) }]);
        }
      }
    });
    setVoortgang(null);
    voegRegels(
      nietUitgevoerd.map((n) => ({ module: n.module, procedure: n.procedure, status: "niet-uitgevoerd" as const, reden: n.reden })),
      { teruggedraaid },
    );
    onGewijzigd();
  }

  async function losUitvoeren(p: ProcedureAnalyse, modus: OntbrekendModus) {
    if (modus === "overslaan") {
      const ja = await dialogen.bevestig({
        titel: `${p.naam} toch uitvoeren?`,
        tekst: (
          <>
            <p>
              Deze procedure is {STATUS_PROCEDURE[p.status].tekst.toLowerCase()}. Ontbrekende onderdelen (zoals {p.redenen[0]?.oorzaak ?? "externe functies"})
              worden <strong>overgeslagen en vastgelegd</strong>; ze worden nooit echt uitgevoerd.
            </p>
            <p>De procedure draait op de werkkopie; wijzigingen blijven daarin staan (dit is geen proefmodus). MsgBox- en InputBox-dialogen kunnen verschijnen.</p>
          </>
        ),
        ja: "Toch uitvoeren",
        nee: "Annuleren",
        standaardNee: true,
      });
      if (!ja) return;
    }
    const begin = performance.now();
    const r = await vba.voerUit(p.module, p.naam, [], { ontbrekend: modus });
    if (!r) return;
    const u = naarUitvoering(p.module, p.naam, r, Math.round(performance.now() - begin));
    voegRegels([{ module: p.module, procedure: p.naam, status: u.status, uitvoering: u, ontbrekend: modus, teruggedraaid: false }]);
    setTab("resultaat");
    onGewijzigd();
  }

  function exporteer(soort: "json" | "csv") {
    if (!resultaat) return;
    const data: ResultaatExport = {
      database: databasenaam,
      datum: resultaat.datum,
      opties: resultaat.opties ?? { ontbrekend: vba.ontbrekend, metDeels: false, terugdraaien: false, dialogenAutomatisch: false },
      teruggedraaid: resultaat.teruggedraaid,
      regels: resultaat.regels,
    };
    const basis = databasenaam.replace(/\.[^.]+$/, "") + "-uitvoeren-wat-werkt";
    if (soort === "json") onExporteer(`${basis}.json`, resultaatAlsJson(data), "application/json;charset=utf-8", "Resultaat (JSON)");
    else onExporteer(`${basis}.csv`, resultaatAlsCsv(data), "text/csv;charset=utf-8", "Resultaat (CSV)");
  }

  // ------------------------------------------------------------ weergave
  const bezig = !!vba.bezig;
  const tabs: { id: Tab; naam: string; aantal?: number }[] = [
    { id: "verwijzingen", naam: "Verwijzingen", aantal: analyse?.verwijzingen.length },
    { id: "windows-api", naam: "Windows-API", aantal: groepen["windows-api"].length },
    { id: "com", naam: "COM-objecten", aantal: groepen.com.length },
    { id: "bestanden", naam: "Bestanden en paden", aantal: groepen.bestanden.length },
    { id: "gekoppeld", naam: "Gekoppelde tabellen", aantal: analyse?.gekoppeldeTabellen.length },
    { id: "overig", naam: "Overige", aantal: groepen.overig.length },
    { id: "procedures", naam: "Procedures", aantal: analyse?.procedures.length },
    { id: "resultaat", naam: "Resultaat", aantal: resultaat?.regels.length },
  ];

  return (
    <div className="database-extern">
      <div className="object-toolbar">
        <h2>
          Externe verwijzingen
          <small>Analyse van de VBA-code · openen voert niets uit</small>
        </h2>
        <div className="database-knoppen">
          {bezig ? (
            <button className="is-gevaar" onClick={vba.stop}>
              <Square size={14} /> Stop
            </button>
          ) : null}
          <button
            className="primary"
            disabled={!analyse || bezig}
            onClick={() => setKeuze({ ontbrekend: vba.ontbrekend, metDeels: false, automatisch: true, terugdraaien: true })}
          >
            <PlayCircle size={16} /> Uitvoeren wat werkt…
          </button>
        </div>
      </div>

      <Uitleg />

      {!sessie && <p className="muted">Open eerst een werkkopie; de analyse gebruikt de VBA-modules uit de werkkopie.</p>}
      {sessie && !analyse && !fout && <p role="status">VBA-code analyseren…</p>}
      {fout && (
        <p className="melding fout" role="alert">
          De analyse is mislukt: {fout}
        </p>
      )}

      {analyse && (
        <>
          <Overzicht analyse={analyse} />
          {voortgang && (
            <div className="database-extern-voortgang" role="status" aria-live="polite">
              <label>
                Uitvoeren wat werkt: {voortgang.klaar} van {voortgang.totaal} · bezig met {voortgang.huidig}
                <progress max={voortgang.totaal} value={voortgang.klaar} />
              </label>
              <button className="is-gevaar" onClick={vba.stop}>
                <Square size={14} /> Stop
              </button>
            </div>
          )}
          <Tabs tabs={tabs} actief={tab} onKies={setTab}>
            {tab === "verwijzingen" && <VerwijzingenTab analyse={analyse} bekend={verwijzingen !== null} rijen={groepen.bibliotheek} spring={spring} />}
            {tab === "windows-api" && (
              <AfhankelijkheidTabel
                titel="Windows-API (Declare)"
                uitleg="Functies uit Windows-DLL’s. OpenAEC roept nooit een DLL aan; in de modus ‘Fout teruggeven’ geeft een aanroep fout 453."
                rijen={groepen["windows-api"]}
                kolom="DLL"
                spring={spring}
              />
            )}
            {tab === "com" && (
              <AfhankelijkheidTabel
                titel="COM-objecten (CreateObject/GetObject)"
                uitleg="Objecten van andere programma’s via een ProgID. Alleen Scripting.Dictionary wordt nagebootst; de rest ontbreekt (fout 429)."
                rijen={groepen.com}
                kolom="Bibliotheek"
                spring={spring}
              />
            )}
            {tab === "bestanden" && (
              <AfhankelijkheidTabel
                titel="Bestanden en paden"
                uitleg="Lezen, schrijven of verwijderen van bestanden en mappen, en paden zoals CurrentProject.Path. OpenAEC raakt geen bestanden aan."
                rijen={groepen.bestanden}
                metSoort
                spring={spring}
              />
            )}
            {tab === "gekoppeld" && <GekoppeldTab analyse={analyse} rijen={groepen.gekoppeld} spring={spring} />}
            {tab === "overig" && (
              <AfhankelijkheidTabel
                titel="Overige"
                uitleg="Shell, SendKeys, Environ, register, hyperlinks, export (TransferSpreadsheet, OutputTo …), OpenDatabase, namen die nergens gedefinieerd zijn en syntaxisfouten."
                rijen={groepen.overig}
                metSoort
                spring={spring}
              />
            )}
            {tab === "procedures" && (
              <ProceduresTab
                analyse={analyse}
                filter={filter}
                setFilter={setFilter}
                bezig={bezig}
                modus={vba.ontbrekend}
                spring={spring}
                onUitvoeren={(p, m) => void losUitvoeren(p, m)}
              />
            )}
            {tab === "resultaat" && <ResultaatTab resultaat={resultaat} bezig={bezig} spring={spring} onExporteer={exporteer} />}
          </Tabs>
        </>
      )}

      {keuze && analyse && (
        <ReeksDialoog
          opties={keuze}
          setOpties={setKeuze}
          analyse={analyse}
          onAnnuleer={() => setKeuze(null)}
          onStart={(o) => void voerReeksUit(o)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- onderdelen

function Status({ status }: { status: Beschikbaarheid }) {
  const s = STATUS_BESCHIKBAAR[status];
  return (
    <span className={`database-extern-status status-${status}`}>
      <span aria-hidden>{s.teken}</span> {s.tekst}
    </span>
  );
}

function ProcStatus({ status }: { status: ProcedureStatus | keyof typeof STATUS_UITVOERING }) {
  const s = status in STATUS_PROCEDURE ? STATUS_PROCEDURE[status as ProcedureStatus] : STATUS_UITVOERING[status as keyof typeof STATUS_UITVOERING];
  return (
    <span className={`database-extern-status status-${status}`}>
      <span aria-hidden>{s.teken}</span> {s.tekst}
    </span>
  );
}

function Uitleg() {
  return (
    <details className="database-extern-uitleg">
      <summary>Wat betekent ‘Ontbreekt’, en wat doen de modi?</summary>
      <p>
        VBA-code in Access leunt vaak op onderdelen buiten Access: Excel of Outlook via COM, functies uit Windows-DLL’s (Declare), bestanden en
        mappen, Shell, het register of gekoppelde tabellen op een server. <strong>OpenAEC voert die nooit uit.</strong> De code draait afgeschermd
        op de werkkopie; er wordt geen bestand, programma, COM-object of DLL aangesproken. Zo’n onderdeel heet hier <em>Ontbreekt</em>.{" "}
        <em>Ingebouwd</em> betekent dat OpenAEC het zelf nabootst (VBA, Access, DAO), <em>Deels nagebootst</em> dat alleen een deel werkt (bij
        Scripting alleen Dictionary).
      </p>
      <p>Een procedure is uitvoerbaar als ze (ook via aangeroepen procedures) niets nodig heeft dat ontbreekt; deels als het ontbrekende alleen achter een foutafhandeling of voorwaarde zit.</p>
      <p>Wat er gebeurt als de code toch bij een ontbrekend onderdeel komt, kies je zelf:</p>
      <dl>
        {MODI.map((m) => (
          <div key={m.waarde}>
            <dt>{m.naam}</dt>
            <dd>{m.uitleg}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Overzicht({ analyse }: { analyse: ExterneAnalyse }) {
  const s = analyse.samenvatting;
  const oorzaken = belangrijksteOorzaken(analyse);
  return (
    <section className="database-extern-overzicht" aria-label="Overzicht">
      <ul className="database-extern-tegels">
        {(["uitvoerbaar", "deels", "niet"] as ProcedureStatus[]).map((st) => (
          <li key={st} className={`tegel-${st}`}>
            <strong>{s.perStatus[st].toLocaleString("nl-NL")}</strong>
            <ProcStatus status={st} />
          </li>
        ))}
        <li>
          <strong>{s.procedures.toLocaleString("nl-NL")}</strong>
          <span>procedures in {new Set(analyse.procedures.map((p) => p.module)).size} modules</span>
        </li>
      </ul>
      <div>
        <h3>Belangrijkste oorzaken</h3>
        {oorzaken.length ? (
          <ol className="database-extern-oorzaken">
            {oorzaken.map((o) => (
              <li key={o.oorzaak}>
                <span>{oorzaakNaam(o.oorzaak)}</span> <small>{o.procedures.toLocaleString("nl-NL")} procedures</small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Geen: alle procedures kunnen zonder externe onderdelen.</p>
        )}
        {!!analyse.modulesMetParseerfout.length && (
          <p className="melding fout">Syntaxisfout in: {analyse.modulesMetParseerfout.join(", ")}. Procedures daarin zijn niet uitvoerbaar.</p>
        )}
      </div>
    </section>
  );
}

function Tabs({ tabs, actief, onKies, children }: { tabs: { id: Tab; naam: string; aantal?: number }[]; actief: Tab; onKies: (t: Tab) => void; children: ReactNode }) {
  const basis = useId();
  const knoppen = useRef<(HTMLButtonElement | null)[]>([]);
  function toets(e: KeyboardEvent, i: number) {
    const n = tabs.length;
    const doel = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (doel < 0) return;
    e.preventDefault();
    onKies(tabs[doel].id);
    knoppen.current[doel]?.focus();
  }
  return (
    <>
      <div role="tablist" aria-label="Onderdelen" className="database-extern-tabs">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              knoppen.current[i] = el;
            }}
            role="tab"
            id={`${basis}-${t.id}`}
            aria-selected={actief === t.id}
            aria-controls={`${basis}-paneel`}
            tabIndex={actief === t.id ? 0 : -1}
            onClick={() => onKies(t.id)}
            onKeyDown={(e) => toets(e, i)}
          >
            {t.naam}
            {t.aantal !== undefined && <span className="database-extern-aantal">{t.aantal}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${basis}-paneel`} aria-labelledby={`${basis}-${actief}`} className="database-extern-paneel">
        {children}
      </div>
    </>
  );
}

/** Lijst van plekken (module/regel), elk een knop die naar de procedure springt. */
function Plekken({ rij, spring }: { rij: AfhankelijkheidRij; spring: (sleutel: string, regel?: number) => void }) {
  const tekst = `${rij.procedures.length} ${rij.procedures.length === 1 ? "procedure" : "procedures"}${rij.plekken.length > rij.procedures.length ? ` · ${rij.plekken.length} plekken` : ""}`;
  const lijst = (
    <ul className="database-extern-plekken">
      {rij.plekken.map((p, i) => {
        const sleutel = p.procedure ? `${p.module}.${p.procedure}` : p.module;
        return (
          <li key={i}>
            <button className="database-link" onClick={() => spring(sleutel, p.regel)}>
              {sleutel} · regel {p.regel}
            </button>
            {p.omzeilbaar && <small> (achter foutafhandeling of voorwaarde)</small>}
            {p.foutnummer !== undefined && <small> · fout {p.foutnummer}</small>}
          </li>
        );
      })}
    </ul>
  );
  if (rij.plekken.length <= 2) return lijst;
  return (
    <details>
      <summary>Gebruikt door {tekst}</summary>
      {lijst}
    </details>
  );
}

function AfhankelijkheidTabel({
  titel,
  uitleg,
  rijen,
  kolom,
  metSoort,
  spring,
}: {
  titel: string;
  uitleg: string;
  rijen: AfhankelijkheidRij[];
  kolom?: string;
  metSoort?: boolean;
  spring: (sleutel: string, regel?: number) => void;
}) {
  return (
    <section>
      <h3>{titel}</h3>
      <p className="muted">{uitleg}</p>
      {rijen.length ? (
        <div className="table-wrap">
          <table className="database-extern-tabel">
            <caption className="sr-only">{titel}</caption>
            <thead>
              <tr>
                <th scope="col">Naam</th>
                {metSoort && <th scope="col">Soort</th>}
                {kolom && <th scope="col">{kolom}</th>}
                <th scope="col">Status</th>
                <th scope="col">Gebruikt in</th>
              </tr>
            </thead>
            <tbody>
              {rijen.map((r) => (
                <tr key={r.sleutel}>
                  <th scope="row">
                    <code>{r.naam}</code>
                  </th>
                  {metSoort && <td>{SOORT_NAAM[r.soort]}</td>}
                  {kolom && <td>{r.bibliotheek ?? "—"}</td>}
                  <td>
                    <Status status={r.status} />
                  </td>
                  <td>
                    <Plekken rij={r} spring={spring} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Niets gevonden.</p>
      )}
    </section>
  );
}

function GebruiktDoor({ sleutels, spring }: { sleutels: string[]; spring: (sleutel: string) => void }) {
  if (!sleutels.length) return <span className="muted">Niet gebruikt in de code</span>;
  return (
    <details>
      <summary>
        Gebruikt door {sleutels.length} {sleutels.length === 1 ? "procedure" : "procedures"}
      </summary>
      <ul className="database-extern-plekken">
        {sleutels.map((s) => (
          <li key={s}>
            <button className="database-link" onClick={() => spring(s)}>
              {s}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function VerwijzingenTab({
  analyse,
  bekend,
  rijen,
  spring,
}: {
  analyse: ExterneAnalyse;
  bekend: boolean;
  rijen: AfhankelijkheidRij[];
  spring: (sleutel: string, regel?: number) => void;
}) {
  return (
    <>
      <section>
        <h3>Verwijzingen (typebibliotheken)</h3>
        <p className="muted">
          Uit het VBA-project (Extra › Verwijzingen in Access). VBA en Access zelf staan daar niet in; die zijn altijd ingebouwd. Paden zijn
          ingekort tot de bestandsnaam; het volledige pad staat in de tooltip.
        </p>
        {!bekend && (
          <p className="melding">
            De verwijzingen zijn alleen bekend als de database uit het Access-origineel (.mdb/.accdb) is geopend. Gebruik van bibliotheken in de
            code staat hieronder wel.
          </p>
        )}
        {analyse.verwijzingen.length ? (
          <div className="table-wrap">
            <table className="database-extern-tabel">
              <caption className="sr-only">Verwijzingen</caption>
              <thead>
                <tr>
                  <th scope="col">Naam</th>
                  <th scope="col">Versie</th>
                  <th scope="col">GUID / pad</th>
                  <th scope="col">Status</th>
                  <th scope="col">Gebruik</th>
                </tr>
              </thead>
              <tbody>
                {analyse.verwijzingen.map((v, i) => {
                  const pad = verkortPad(v.pad);
                  return (
                    <tr key={`${v.naam}-${i}`}>
                      <th scope="row">
                        {v.naam}
                        <small>
                          {v.soort}
                          {v.bibliotheek && v.bibliotheek !== v.naam ? ` · ${v.bibliotheek}` : ""}
                        </small>
                      </th>
                      <td>{v.versie ?? "—"}</td>
                      <td>
                        {v.guid && <code className="database-extern-guid">{`{${v.guid}}`}</code>}
                        {pad && (
                          <span className="database-extern-pad" title={pad.volledig} tabIndex={0} aria-label={`Bestand ${pad.kort}`}>
                            {pad.kort}
                          </span>
                        )}
                        {!v.guid && !pad && "—"}
                      </td>
                      <td>
                        <Status status={v.status} />
                        <small>{v.toelichting}</small>
                      </td>
                      <td>
                        <GebruiktDoor sleutels={v.gebruiktDoor} spring={spring} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          bekend && <p className="muted">Het VBA-project vermeldt geen verwijzingen.</p>
        )}
      </section>
      <AfhankelijkheidTabel
        titel="Gebruik van bibliotheken in de code"
        uitleg="Objecttypen, New, constanten (zoals xlUp) en ProgID’s uit bibliotheken, ook als de verwijzing zelf ontbreekt (late binding)."
        rijen={rijen}
        kolom="Bibliotheek"
        spring={spring}
      />
    </>
  );
}

function GekoppeldTab({ analyse, rijen, spring }: { analyse: ExterneAnalyse; rijen: AfhankelijkheidRij[]; spring: (sleutel: string, regel?: number) => void }) {
  return (
    <section>
      <h3>Gekoppelde tabellen</h3>
      <p className="muted">
        Tabellen die in een andere database of op een server staan. Alleen de naam en de soort bron worden getoond; de verbindingsreeks wordt
        nooit gelezen of getoond, en de externe bron wordt niet geopend.
      </p>
      {analyse.gekoppeldeTabellen.length ? (
        <div className="table-wrap">
          <table className="database-extern-tabel">
            <caption className="sr-only">Gekoppelde tabellen</caption>
            <thead>
              <tr>
                <th scope="col">Tabel</th>
                <th scope="col">Bron</th>
                <th scope="col">Status</th>
                <th scope="col">Gebruikt in</th>
              </tr>
            </thead>
            <tbody>
              {analyse.gekoppeldeTabellen.map((g) => {
                const rij = rijen.find((r) => r.naam.toLowerCase() === g.naam.toLowerCase());
                return (
                  <tr key={g.naam}>
                    <th scope="row">{g.naam}</th>
                    <td>{g.bron}</td>
                    <td>
                      <Status status={g.status} />
                    </td>
                    <td>{rij ? <Plekken rij={rij} spring={spring} /> : <GebruiktDoor sleutels={g.gebruiktDoor} spring={spring} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Deze database heeft geen gekoppelde tabellen.</p>
      )}
    </section>
  );
}

function ProceduresTab({
  analyse,
  filter,
  setFilter,
  bezig,
  modus,
  spring,
  onUitvoeren,
}: {
  analyse: ExterneAnalyse;
  filter: ProcedureFilter;
  setFilter: (f: ProcedureFilter) => void;
  bezig: boolean;
  modus: OntbrekendModus;
  spring: (sleutel: string, regel?: number) => void;
  onUitvoeren: (p: ProcedureAnalyse, modus: OntbrekendModus) => void;
}) {
  const [aantal, setAantal] = useState(PAGINA);
  const lijst = filterProcedures(analyse.procedures, filter);
  const modulesLijst = [...new Set(analyse.procedures.map((p) => p.module))].sort((a, b) => a.localeCompare(b, "nl"));
  return (
    <section>
      <h3>Procedures</h3>
      <div className="database-extern-filters" role="search">
        <label>
          Status
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as ProcedureFilter["status"] })}>
            <option value="alle">Alle</option>
            <option value="uitvoerbaar">Uitvoerbaar</option>
            <option value="deels">Deels uitvoerbaar</option>
            <option value="niet">Niet uitvoerbaar</option>
          </select>
        </label>
        <label>
          Module
          <select value={filter.module} onChange={(e) => setFilter({ ...filter, module: e.target.value })}>
            <option value="alle">Alle modules</option>
            {modulesLijst.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Zoeken
          <input type="search" value={filter.zoek} placeholder="Procedure of oorzaak" onChange={(e) => setFilter({ ...filter, zoek: e.target.value })} />
        </label>
        <span role="status" className="muted">
          {lijst.length} van {analyse.procedures.length}
        </span>
      </div>
      <div className="table-wrap">
        <table className="database-extern-tabel">
          <caption className="sr-only">Procedures met status en redenen</caption>
          <thead>
            <tr>
              <th scope="col">Procedure</th>
              <th scope="col">Status</th>
              <th scope="col">Redenen en aanroepketen</th>
              <th scope="col">Uitvoeren</th>
            </tr>
          </thead>
          <tbody>
            {lijst.slice(0, aantal).map((p) => {
              const los = losUitvoerbaar(p);
              const redenen = p.redenen.filter((r) => r.status !== "ingebouwd");
              return (
                <tr key={p.sleutel}>
                  <th scope="row">
                    <button className="database-link" onClick={() => spring(p.sleutel, p.regel)}>
                      {p.sleutel}
                    </button>
                    <small>
                      {p.soort === "function" ? "Function" : p.soort === "sub" ? "Sub" : `Property ${p.soort[0].toUpperCase()}${p.soort.slice(1)}`}
                      {p.publiek ? "" : " · privé"}
                      {p.gebeurtenis ? " · gebeurtenis" : ""}
                      {p.zonderVerplichteParameters ? "" : " · met parameters"}
                      {p.foutafhandeling ? " · eigen foutafhandeling" : ""}
                    </small>
                  </th>
                  <td>
                    <ProcStatus status={p.status} />
                  </td>
                  <td>
                    {redenen.length ? (
                      <Redenen redenen={redenen} />
                    ) : (
                      <span className="muted">Geen externe onderdelen</span>
                    )}
                  </td>
                  <td>
                    {!los ? (
                      <small className="muted">
                        {p.moduleSoort === "klasse"
                          ? "Klassenmodule"
                          : p.moduleSoort === "formulier"
                            ? "Via het formulier"
                            : p.gebeurtenis
                              ? "Gebeurtenis"
                              : !p.publiek
                                ? "Privé"
                                : !p.zonderVerplichteParameters
                                  ? "Vraagt parameters"
                                  : "—"}
                      </small>
                    ) : p.status === "uitvoerbaar" ? (
                      <button disabled={bezig} onClick={() => onUitvoeren(p, modus)} aria-label={`${p.sleutel} uitvoeren`}>
                        <Play size={14} /> Uitvoeren
                      </button>
                    ) : (
                      <button disabled={bezig} onClick={() => onUitvoeren(p, "overslaan")} aria-label={`${p.sleutel} toch uitvoeren met overslaan`}>
                        <SkipForward size={14} /> Toch uitvoeren met overslaan
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lijst.length > aantal && (
        <button onClick={() => setAantal((a) => a + PAGINA)}>
          Meer tonen ({lijst.length - aantal} over)
        </button>
      )}
    </section>
  );
}

function Redenen({ redenen }: { redenen: ProcedureAnalyse["redenen"] }) {
  const eerst = redenen.slice(0, 3);
  const rest = redenen.slice(3);
  const item = (r: ProcedureAnalyse["redenen"][number], i: number) => (
    <li key={i}>
      <Status status={r.status} /> <span className="database-extern-keten">{ketenTekst(r)}</span>
      {r.omzeilbaar && <small> (achter foutafhandeling of voorwaarde)</small>}
    </li>
  );
  return (
    <>
      <ul className="database-extern-redenen">{eerst.map(item)}</ul>
      {!!rest.length && (
        <details>
          <summary>en nog {rest.length}</summary>
          <ul className="database-extern-redenen">{rest.map((r, i) => item(r, i + 3))}</ul>
        </details>
      )}
    </>
  );
}

function ResultaatTab({
  resultaat,
  bezig,
  spring,
  onExporteer,
}: {
  resultaat: Resultaat | null;
  bezig: boolean;
  spring: (sleutel: string, regel?: number) => void;
  onExporteer: (soort: "json" | "csv") => void;
}) {
  const [nietTonen, setNietTonen] = useState(false);
  if (!resultaat)
    return (
      <p className="muted">
        Nog niets uitgevoerd. Kies <strong>Uitvoeren wat werkt…</strong> of voer bij Procedures één procedure uit.
      </p>
    );
  const t = telResultaat(resultaat.regels);
  const uitgevoerd = resultaat.regels.filter((r) => r.status !== "niet-uitgevoerd");
  const niet = resultaat.regels.filter((r) => r.status === "niet-uitgevoerd");
  const o = resultaat.opties;
  return (
    <section>
      <div className="database-werkbalk">
        <h3>Resultaat</h3>
        <button disabled={bezig} onClick={() => onExporteer("json")}>
          <FileJson size={14} /> JSON
        </button>
        <button disabled={bezig} onClick={() => onExporteer("csv")}>
          <FileText size={14} /> CSV
        </button>
      </div>
      <p>
        {t.geslaagd} geslaagd · {t.fout} fout · {t.tijdslimiet} tijdslimiet · {t.gestopt} gestopt · {t.nietUitgevoerd} niet uitgevoerd
        {t.metOvergeslagen ? ` · ${t.metOvergeslagen} met overgeslagen onderdelen` : ""}
      </p>
      {o && (
        <p className="muted">
          Modus: {MODI.find((m) => m.waarde === o.ontbrekend)?.naam} · {o.metDeels ? "met" : "zonder"} deels uitvoerbare procedures · dialogen{" "}
          {o.dialogenAutomatisch ? "automatisch beantwoord" : "aan de gebruiker gevraagd"} ·{" "}
          {o.terugdraaien
            ? resultaat.teruggedraaid
              ? "proefmodus: alle wijzigingen zijn teruggedraaid"
              : "proefmodus: niet alle wijzigingen konden worden teruggedraaid"
            : "wijzigingen zijn in de werkkopie gebleven"}
          . Export bevat geen broncode.
        </p>
      )}
      {!!uitgevoerd.length && (
        <div className="table-wrap">
          <table className="database-extern-tabel">
            <caption className="sr-only">Uitgevoerde procedures</caption>
            <thead>
              <tr>
                <th scope="col">Procedure</th>
                <th scope="col">Status</th>
                <th scope="col">Details</th>
                <th scope="col">Duur</th>
                <th scope="col">Overgeslagen</th>
                <th scope="col">Uitvoer</th>
              </tr>
            </thead>
            <tbody>
              {uitgevoerd.map((r, i) => {
                const u = r.uitvoering!;
                const overgeslagen = u.overgeslagen.reduce((s, x) => s + x.aantal, 0);
                return (
                  <tr key={i}>
                    <th scope="row">
                      <button className="database-link" onClick={() => spring(`${r.module}.${r.procedure}`)}>
                        {r.module}.{r.procedure}
                      </button>
                      {r.ontbrekend && r.ontbrekend !== o?.ontbrekend && <small>modus: {MODI.find((m) => m.waarde === r.ontbrekend)?.naam}</small>}
                    </th>
                    <td>
                      <ProcStatus status={r.status} />
                    </td>
                    <td>
                      {u.fout ? (
                        u.fout.module && u.fout.regel ? (
                          <button className="database-link" onClick={() => spring(`${u.fout!.module}.${u.fout!.procedure ?? ""}`, u.fout!.regel)}>
                            {uitvoeringFoutTekst(u)}
                          </button>
                        ) : (
                          uitvoeringFoutTekst(u)
                        )
                      ) : u.stappen !== undefined ? (
                        <span className="muted">{u.stappen.toLocaleString("nl-NL")} stappen</span>
                      ) : null}
                    </td>
                    <td>{duurTekst(u.duurMs)}</td>
                    <td>
                      {overgeslagen ? (
                        <details>
                          <summary>{overgeslagen} overgeslagen</summary>
                          <ul className="database-extern-plekken">
                            {u.overgeslagen.map((x, j) => (
                              <li key={j}>
                                <button className="database-link" onClick={() => spring(`${x.module}.${x.procedure ?? ""}`, x.regel)}>
                                  {x.wat} · {x.module}, regel {x.regel}
                                </button>
                                {x.aantal > 1 && <small> ({x.aantal}×)</small>}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td>
                      {u.uitvoer.length || u.hostgebeurtenissen.length ? (
                        <details>
                          <summary>
                            {u.uitvoer.length} {u.uitvoer.length === 1 ? "regel" : "regels"}
                            {u.hostgebeurtenissen.length ? ` · ${u.hostgebeurtenissen.length} ${u.hostgebeurtenissen.length === 1 ? "hostgebeurtenis" : "hostgebeurtenissen"}` : ""}
                          </summary>
                          {!!u.uitvoer.length && <pre className="database-extern-uitvoer">{u.uitvoer.join("\n")}</pre>}
                          {!!u.hostgebeurtenissen.length && (
                            <ul className="database-extern-plekken">
                              {u.hostgebeurtenissen.map((h, j) => (
                                <li key={j}>{hostgebeurtenisTekst(h)}</li>
                              ))}
                            </ul>
                          )}
                        </details>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!!niet.length && (
        <details open={nietTonen} onToggle={(e) => setNietTonen((e.target as HTMLDetailsElement).open)}>
          <summary>{niet.length} procedures niet uitgevoerd</summary>
          <div className="table-wrap">
            <table className="database-extern-tabel">
              <caption className="sr-only">Niet uitgevoerde procedures</caption>
              <thead>
                <tr>
                  <th scope="col">Procedure</th>
                  <th scope="col">Reden</th>
                </tr>
              </thead>
              <tbody>
                {niet.map((r, i) => (
                  <tr key={i}>
                    <th scope="row">
                      <button className="database-link" onClick={() => spring(`${r.module}.${r.procedure}`)}>
                        {r.module}.{r.procedure}
                      </button>
                    </th>
                    <td>{r.reden}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function ReeksDialoog({
  opties,
  setOpties,
  analyse,
  onAnnuleer,
  onStart,
}: {
  opties: ReeksOpties;
  setOpties: (o: ReeksOpties) => void;
  analyse: ExterneAnalyse;
  onAnnuleer: () => void;
  onStart: (o: ReeksOpties) => void;
}) {
  const naam = useId();
  const { kandidaten } = verdeelKandidaten(analyse.procedures, opties.metDeels);
  const zet = (d: Partial<ReeksOpties>) => setOpties({ ...opties, ...d });
  return (
    <Dialoog
      titel="Uitvoeren wat werkt"
      breed
      onSluit={onAnnuleer}
      acties={
        <>
          <button onClick={onAnnuleer}>Annuleren</button>
          <button className="primary" disabled={!kandidaten.length} onClick={() => onStart(opties)} data-autofocus>
            <PlayCircle size={14} /> {kandidaten.length} {kandidaten.length === 1 ? "procedure" : "procedures"} uitvoeren
          </button>
        </>
      }
    >
      <p>
        Voert alle publieke Subs en Functions zonder parameters uit standaardmodules na elkaar uit: {kandidaten.length}{" "}
        {kandidaten.length === 1 ? "procedure" : "procedures"}. Elke procedure heeft een tijdslimiet van {TIJDSLIMIET / 1000} seconden; de
        reeks is met Stop af te breken. Alles draait afgeschermd op de werkkopie; het origineel blijft ongewijzigd.
      </p>
      <fieldset className="database-extern-modi">
        <legend>Bij ontbrekende onderdelen</legend>
        {MODI.map((m) => (
          <label key={m.waarde}>
            <input type="radio" name={naam} value={m.waarde} checked={opties.ontbrekend === m.waarde} onChange={() => zet({ ontbrekend: m.waarde })} />
            <span>
              <strong>{m.naam}</strong>
              <small>{m.uitleg}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="database-vink">
        <input type="checkbox" checked={opties.metDeels} onChange={(e) => zet({ metDeels: e.target.checked })} />
        Ook deels uitvoerbare procedures ({analyse.samenvatting.perStatus.deels} in totaal)
      </label>
      <label className="database-vink">
        <input type="checkbox" checked={opties.automatisch} onChange={(e) => zet({ automatisch: e.target.checked })} />
        Dialogen automatisch beantwoorden (droge proef: MsgBox kiest de eerste knop, InputBox de standaardwaarde)
      </label>
      {!opties.automatisch && (
        <p className="melding">MsgBox- en InputBox-dialogen uit de code verschijnen dan gewoon en wachten op jouw antwoord.</p>
      )}
      <label className="database-vink">
        <input type="checkbox" checked={opties.terugdraaien} onChange={(e) => zet({ terugdraaien: e.target.checked })} />
        Wijzigingen terugdraaien (proefmodus)
      </label>
      {!opties.terugdraaien && (
        <p className="melding fout">Zonder proefmodus blijven wijzigingen van de procedures in de werkkopie staan. Je wordt nog om bevestiging gevraagd.</p>
      )}
      <p className="muted">DoCmd-acties (OpenForm, OpenReport …) worden in deze reeks alleen vastgelegd, niet uitgevoerd.</p>
    </Dialoog>
  );
}
