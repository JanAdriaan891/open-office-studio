/**
 * Query zoals in Access: een selectiequery opent in Gegevensbladweergave
 * (resultaat, na de parameterdialoog), met een schakelaar naar SQL-weergave.
 * In SQL-weergave staan editor en resultaat in een verstelbare splitsing;
 * uitvoeren (F5 of Ctrl+Enter) zet de focus op het resultaat. Actiequery’s
 * openen in SQL-weergave en worden pas na bevestiging uitgevoerd.
 */
import { useEffect, useRef, useState } from "react";
import { Code2, Download, FileSearch, Play, RefreshCw, Save, Table2 } from "lucide-react";
import type { OpgeslagenQuery, QueryResultaat, TabelSchema, Waarde, Werkkopie } from "../werkkopie/contract.ts";
import { kleurTokens } from "../syntaxis.ts";
import { past } from "../../../../src/lint/sneltoetsen.ts";
import { bewerkbaar, leesbareFout } from "./invoer.ts";
import { ACTIENAMEN, isActiequery, querysoortVan } from "./sql.ts";
import { Raster, useVulHoogte, type RasterKolom } from "./Raster.tsx";
import type { PlakPlan } from "./raster-logica.ts";
import { useDialogen } from "./Dialoog.tsx";
import { vraagParameters } from "./bron.ts";

export interface QueryUitvoer {
  titel: string;
  resultaat: QueryResultaat;
}

export function SqlInvoer({
  waarde,
  onWijzig,
  onUitvoeren,
  label,
  rijen = 8,
}: {
  waarde: string;
  onWijzig: (w: string) => void;
  onUitvoeren?: () => void;
  label: string;
  rijen?: number;
}) {
  const kleur = useRef<HTMLPreElement>(null);
  return (
    <div className="database-sqlinvoer">
      <pre ref={kleur} aria-hidden className="database-sqlkleur">
        <code>
          {kleurTokens(waarde, "sql").map((t, i) =>
            t.soort === "gewoon" ? t.tekst : (
              <span key={i} className={`syntax-${t.soort}`}>
                {t.tekst}
              </span>
            ),
          )}
          {"\n"}
        </code>
      </pre>
      <textarea
        aria-label={label}
        spellCheck={false}
        rows={rijen}
        value={waarde}
        onChange={(e) => onWijzig(e.target.value)}
        onScroll={(e) => {
          if (kleur.current) {
            kleur.current.scrollTop = e.currentTarget.scrollTop;
            kleur.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
        onKeyDown={(e) => {
          if (onUitvoeren && (past("F5", e.nativeEvent) || past("Ctrl+Enter", e.nativeEvent))) {
            e.preventDefault();
            e.stopPropagation();
            onUitvoeren();
          }
        }}
      />
    </div>
  );
}

export type QueryModus = "gegevensblad" | "sql";

export function QueryEditor({
  werkkopie,
  opgeslagen,
  tabellen,
  beginSql,
  beginModus,
  onBewaard,
  onGewijzigd,
  onExporteer,
  registreerUitvoeren,
  onResultaat,
}: {
  werkkopie: Werkkopie;
  opgeslagen: OpgeslagenQuery | null;
  tabellen: TabelSchema[];
  beginSql?: string;
  /** Standaard: gegevensblad voor een opgeslagen selectiequery, anders SQL. */
  beginModus?: QueryModus;
  onBewaard: (naam: string) => void;
  onGewijzigd: () => void;
  onExporteer: (uitvoer: QueryUitvoer) => void;
  /** Geeft de lint/sneltoets de actie “Uitvoeren”. */
  registreerUitvoeren?: (actie: (() => void) | null, vorige: (() => void) | null) => void;
  /** Meldt het laatste resultaat (voor CSV-export via het lint). */
  onResultaat?: (uitvoer: QueryUitvoer | null) => void;
}) {
  const dialogen = useDialogen();
  const [sql, setSql] = useState(opgeslagen?.sql ?? beginSql ?? "SELECT *\nFROM ");
  const [resultaat, setResultaat] = useState<QueryResultaat | null>(null);
  const [melding, setMelding] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [focus, setFocus] = useState(0);
  const soort = opgeslagen && sql === opgeslagen.sql ? opgeslagen.soort : querysoortVan(sql);
  const [modus, setModus] = useState<QueryModus>(beginModus ?? (opgeslagen && !isActiequery(opgeslagen.soort) ? "gegevensblad" : "sql"));
  const [editorHoogte, setEditorHoogte] = useState(170);
  const vlak = useVulHoogte<HTMLDivElement>(modus === "sql" ? editorHoogte + 340 : 380);

  async function uitvoeren() {
    if (bezig || !sql.trim()) return;
    setFout("");
    setMelding("");
    const ongewijzigd = !!opgeslagen && sql === opgeslagen.sql;
    const doel = ongewijzigd ? opgeslagen!.naam : sql;
    try {
      setBezig(true);
      const parameters = await vraagParameters(werkkopie, doel, dialogen, `Parameters voor ${opgeslagen?.naam ?? "de query"}`);
      if (!parameters) {
        setMelding("Uitvoeren geannuleerd.");
        return;
      }
      if (isActiequery(soort)) {
        const ja = await dialogen.bevestig({
          titel: `${ACTIENAMEN[soort]} uitvoeren`,
          tekst: (
            <>
              <p>
                Deze {ACTIENAMEN[soort].toLowerCase()} wijzigt {soort === "ddl" ? "de structuur van" : "gegevens in"} de werkkopie.
                Dit kan niet ongedaan worden gemaakt, maar het origineel blijft ongewijzigd.
              </p>
              <p>Doorgaan?</p>
            </>
          ),
          ja: "Uitvoeren",
          gevaarlijk: true,
        });
        if (!ja) {
          setMelding("Uitvoeren geannuleerd.");
          return;
        }
      }
      const r = ongewijzigd ? await werkkopie.voerQueryUit(opgeslagen!.naam, parameters) : await werkkopie.query(sql, { parameters });
      setResultaat(r);
      if (isActiequery(soort)) {
        setMelding(`${r.gewijzigd.toLocaleString("nl-NL")} ${r.gewijzigd === 1 ? "rij" : "rijen"} gewijzigd.`);
        onGewijzigd();
      } else {
        setMelding(r.afgekapt ? "Het resultaat is afgekapt op 10.000 rijen; verfijn de query voor de rest." : "");
        // Focus naar het resultaat, zodat het meteen in beeld en met het toetsenbord te gebruiken is.
        setFocus((f) => f + 1);
      }
    } catch (e) {
      setFout(leesbareFout(e));
    } finally {
      setBezig(false);
    }
  }
  useEffect(() => {
    onResultaat?.(resultaat && resultaat.kolommen.length ? { titel: opgeslagen?.naam ?? "Queryresultaat", resultaat } : null);
  }, [resultaat, opgeslagen, onResultaat]);
  const actie = useRef(uitvoeren);
  actie.current = uitvoeren;
  useEffect(() => {
    const eigen = () => void actie.current();
    registreerUitvoeren?.(eigen, null);
    return () => registreerUitvoeren?.(null, eigen);
  }, [registreerUitvoeren]);
  // Een selectiequery in Gegevensbladweergave toont direct het resultaat (na eventuele parameters).
  useEffect(() => {
    if (modus === "gegevensblad" && !isActiequery(soort)) void actie.current();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function bewaarAlsQuery() {
    const bestaand = await werkkopie.querys();
    const naam = await dialogen.vraag({
      titel: "Query opslaan",
      label: "Naam van de query",
      standaard: opgeslagen?.naam ?? `Query${bestaand.length + 1}`,
      controleer: (w) => (!w.trim() ? "Geef een naam." : tabellen.some((t) => t.naam.toLowerCase() === w.trim().toLowerCase()) ? "Er is al een tabel met deze naam." : null),
    });
    if (!naam) return;
    const schoon = naam.trim();
    if (schoon.toLowerCase() !== opgeslagen?.naam.toLowerCase() && bestaand.some((q) => q.naam.toLowerCase() === schoon.toLowerCase())) {
      const ja = await dialogen.bevestig({ titel: "Query vervangen", tekst: `Er bestaat al een query ‘${schoon}’. Vervangen?`, ja: "Vervangen", gevaarlijk: true });
      if (!ja) return;
    }
    try {
      await werkkopie.bewaarQuery({ naam: schoon, sql, soort: querysoortVan(sql) });
      setMelding(`Opgeslagen als query ‘${schoon}’ in de werkkopie.`);
      onBewaard(schoon);
    } catch (e) {
      setFout("Opslaan mislukt: " + leesbareFout(e));
    }
  }

  // Resultaten van een SELECT op één tabel zijn bewerkbaar (rowid bekend).
  const basis = resultaat?.bron ? tabellen.find((t) => t.naam.toLowerCase() === resultaat.bron!.tabel.toLowerCase()) : undefined;
  const kolommen: RasterKolom[] = (resultaat?.kolommen ?? []).map((k, i) => {
    const veld = basis?.velden.find((v) => v.naam.toLowerCase() === k.toLowerCase());
    return { naam: k, soort: veld?.soort ?? resultaat?.kolomsoorten?.[i] ?? null, veld: veld && bewerkbaar(veld.soort) ? veld : undefined };
  });

  async function herlees(rijen: number[]) {
    if (!resultaat?.bron || !basis) return;
    const nieuw = new Map<number, Waarde[]>();
    for (const i of rijen) {
      const r = await werkkopie.rij(basis.naam, resultaat.bron.rowids[i]);
      if (r) nieuw.set(i, kolommen.map((k, j) => (k.veld ? (r.waarden[k.veld.naam] ?? null) : resultaat.rijen[i][j])));
    }
    setResultaat((x) => (x ? { ...x, rijen: x.rijen.map((w, i) => nieuw.get(i) ?? w) } : x));
  }

  async function wijzig(rij: number, kolom: number, waarde: Waarde) {
    if (!resultaat?.bron || !basis) return;
    const rowid = resultaat.bron.rowids[rij];
    const veld = kolommen[kolom].veld!;
    await werkkopie.wijzig(basis.naam, rowid, { [veld.naam]: waarde });
    await herlees([rij]);
    onGewijzigd();
  }

  async function plak(plan: PlakPlan) {
    if (!resultaat?.bron || !basis) return;
    const perRij = new Map<number, Record<string, Waarde>>();
    for (const w of plan.wijzigingen) perRij.set(w.rij, { ...(perRij.get(w.rij) ?? {}), [kolommen[w.kolom].veld!.naam]: w.waarde });
    await werkkopie.begin();
    try {
      for (const [rij, waarden] of perRij) await werkkopie.wijzig(basis.naam, resultaat.bron.rowids[rij], waarden);
      await werkkopie.bevestig();
    } catch (e) {
      await werkkopie.terugdraaien().catch(() => undefined);
      throw e;
    }
    await herlees([...perRij.keys()]);
    onGewijzigd();
  }

  function splitsToets(e: React.KeyboardEvent) {
    const stap = e.shiftKey ? 80 : 24;
    if (e.key === "ArrowUp") setEditorHoogte((h) => Math.max(80, h - stap));
    else if (e.key === "ArrowDown") setEditorHoogte((h) => Math.min(900, h + stap));
    else return;
    e.preventDefault();
  }

  const heeftRijen = !!resultaat && resultaat.kolommen.length > 0;
  const actieq = isActiequery(soort);

  return (
    <div ref={vlak} className={`database-queryeditor is-${modus}`}>
      <div className="database-werkbalk" role="toolbar" aria-label="Query">
        <div className="database-weergavekeuze" role="group" aria-label="Weergave">
          <button
            aria-pressed={modus === "gegevensblad"}
            disabled={actieq}
            title={actieq ? "Een actiequery heeft geen gegevensblad" : "Gegevensbladweergave"}
            onClick={() => {
              setModus("gegevensblad");
              if (!resultaat?.kolommen.length) void uitvoeren();
            }}
          >
            <Table2 size={16} /> Gegevensblad
          </button>
          <button aria-pressed={modus === "sql"} onClick={() => setModus("sql")}>
            <Code2 size={16} /> SQL-weergave
          </button>
        </div>
        <button className="primary" onClick={() => void uitvoeren()} disabled={bezig} title={modus === "sql" ? "Uitvoeren (F5 of Ctrl+Enter)" : "Opnieuw uitvoeren (F5)"}>
          {modus === "sql" ? <Play size={16} /> : <RefreshCw size={16} />} {bezig ? "Bezig…" : modus === "sql" ? "Uitvoeren" : "Vernieuwen"}
        </button>
        {modus === "sql" && (
          <button onClick={() => void bewaarAlsQuery()} disabled={bezig}>
            <Save size={16} /> {opgeslagen ? "Opslaan" : "Opslaan als query"}
          </button>
        )}
        <button disabled={!heeftRijen} onClick={() => resultaat && onExporteer({ titel: opgeslagen?.naam ?? "Queryresultaat", resultaat })}>
          <Download size={16} /> CSV
        </button>
        {modus === "sql" && resultaat && (
          <button
            onClick={() =>
              void dialogen.melding(
                "Uitgevoerde SQLite-SQL",
                <pre className="database-diagnose-sql">{resultaat.uitgevoerd}</pre>,
              )
            }
            title="De SQL zoals die op de SQLite-werkkopie is uitgevoerd (diagnose)"
          >
            <FileSearch size={16} /> SQLite-SQL
          </button>
        )}
        <span className="database-querysoort">{ACTIENAMEN[soort]}</span>
      </div>
      {modus === "sql" && (
        <>
          <div className="database-query-editorvlak" style={{ height: editorHoogte }}>
            <SqlInvoer waarde={sql} onWijzig={setSql} onUitvoeren={() => void uitvoeren()} label="Access-SQL" />
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Hoogte van de SQL-editor (pijltjes omhoog/omlaag)"
            aria-valuemin={80}
            aria-valuemax={900}
            aria-valuenow={editorHoogte}
            tabIndex={0}
            className="database-splitser"
            onKeyDown={splitsToets}
            onPointerDown={(e) => {
              const startY = e.clientY;
              const startH = editorHoogte;
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              const beweeg = (ev: PointerEvent) => setEditorHoogte(Math.max(80, Math.min(900, startH + ev.clientY - startY)));
              const los = () => {
                el.removeEventListener("pointermove", beweeg);
                el.removeEventListener("pointerup", los);
              };
              el.addEventListener("pointermove", beweeg);
              el.addEventListener("pointerup", los);
            }}
          />
        </>
      )}
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      {melding && (
        <p className="melding" role="status">
          {melding}
        </p>
      )}
      <section className="database-query-resultaat" aria-label="Resultaat" aria-busy={bezig}>
        {heeftRijen ? (
          <Raster
            label={`Resultaat van ${opgeslagen?.naam ?? "de query"}`}
            kolommen={kolommen}
            rijen={resultaat!.rijen.map((w, i) => ({ sleutel: resultaat!.bron?.rowids[i] ?? i, waarden: w }))}
            onWijzig={basis ? wijzig : undefined}
            onPlak={basis ? plak : undefined}
            vul
            focusSignaal={focus}
            leeg="De query gaf geen rijen."
            voet={
              <span className="muted">
                {resultaat!.rijen.length.toLocaleString("nl-NL")} {resultaat!.rijen.length === 1 ? "rij" : "rijen"}
                {resultaat!.afgekapt ? " (afgekapt)" : ""}
                {basis ? ` · bewerkbaar (‘${basis.naam}’)` : " · alleen-lezen"}
              </span>
            }
          />
        ) : bezig ? (
          <p role="status" className="muted">
            Query uitvoeren…
          </p>
        ) : modus === "sql" ? (
          <p className="muted">Access-SQL (Jet-dialect) · F5 of Ctrl+Enter om uit te voeren · de query draait op de werkkopie. Het resultaat verschijnt hier.</p>
        ) : actieq ? null : (
          <div className="database-knoppen">
            <button onClick={() => void uitvoeren()}>
              <Play size={16} /> Gegevens tonen
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
