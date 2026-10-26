/**
 * SQL-weergave van een query: Access-SQL bewerken met syntaxiskleuring,
 * uitvoeren (F5 of Ctrl+Enter), parameters vragen, actiequery’s bevestigen,
 * resultaat tonen en als CSV bewaren, en bewaren als opgeslagen query.
 */
import { useEffect, useRef, useState } from "react";
import { Download, Play, Save } from "lucide-react";
import type { OpgeslagenQuery, QueryResultaat, TabelSchema, Waarde, Werkkopie } from "../werkkopie/contract.ts";
import { kleurTokens } from "../syntaxis.ts";
import { past } from "../../../../src/lint/sneltoetsen.ts";
import { bewerkbaar, leesbareFout } from "./invoer.ts";
import { ACTIENAMEN, isActiequery, querysoortVan } from "./sql.ts";
import { Raster, type RasterKolom } from "./Raster.tsx";
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

export function QueryEditor({
  werkkopie,
  opgeslagen,
  tabellen,
  beginSql,
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
  const soort = opgeslagen && sql === opgeslagen.sql ? opgeslagen.soort : querysoortVan(sql);

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
      } else
        setMelding(
          `${r.rijen.length.toLocaleString("nl-NL")} ${r.rijen.length === 1 ? "rij" : "rijen"}${r.afgekapt ? " (afgekapt op 10.000; verfijn de query)" : ""}.`,
        );
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

  async function wijzig(rij: number, kolom: number, waarde: Waarde) {
    if (!resultaat?.bron || !basis) return;
    const rowid = resultaat.bron.rowids[rij];
    const veld = kolommen[kolom].veld!;
    await werkkopie.wijzig(basis.naam, rowid, { [veld.naam]: waarde });
    const nieuw = await werkkopie.rij(basis.naam, rowid);
    setResultaat((r) =>
      r ? { ...r, rijen: r.rijen.map((x, i) => (i === rij ? x.map((w, j) => (j === kolom ? (nieuw?.waarden[veld.naam] ?? waarde) : w)) : x)) } : r,
    );
    onGewijzigd();
  }

  return (
    <div className="database-queryeditor">
      <div className="database-werkbalk" role="toolbar" aria-label="Query">
        <button className="primary" onClick={() => void uitvoeren()} disabled={bezig} title="Uitvoeren (F5 of Ctrl+Enter)">
          <Play size={16} /> {bezig ? "Bezig…" : "Uitvoeren"}
        </button>
        <button onClick={() => void bewaarAlsQuery()} disabled={bezig}>
          <Save size={16} /> {opgeslagen ? "Opslaan" : "Opslaan als query"}
        </button>
        <button
          disabled={!resultaat || !resultaat.kolommen.length}
          onClick={() => resultaat && onExporteer({ titel: opgeslagen?.naam ?? "Queryresultaat", resultaat })}
        >
          <Download size={16} /> Resultaat als CSV
        </button>
        <span className="database-querysoort">{ACTIENAMEN[soort]}</span>
      </div>
      <SqlInvoer waarde={sql} onWijzig={setSql} onUitvoeren={() => void uitvoeren()} label="Access-SQL" />
      <p className="muted">Access-SQL (Jet-dialect) · F5 of Ctrl+Enter om uit te voeren · de query draait op de werkkopie.</p>
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
      {resultaat && resultaat.kolommen.length > 0 && (
        <>
          <Raster
            label="Queryresultaat"
            kolommen={kolommen}
            rijen={resultaat.rijen.map((w, i) => ({ sleutel: resultaat.bron?.rowids[i] ?? i, waarden: w }))}
            totaal={resultaat.rijen.length}
            onWijzig={basis ? wijzig : undefined}
            leeg="De query gaf geen rijen."
          />
          {basis && <p className="muted">Resultaat uit één tabel (‘{basis.naam}’): cellen zijn bewerkbaar.</p>}
        </>
      )}
      {resultaat && (
        <details className="database-diagnose">
          <summary>Uitgevoerde SQLite-SQL (diagnose)</summary>
          <pre>{resultaat.uitgevoerd}</pre>
        </details>
      )}
    </div>
  );
}
