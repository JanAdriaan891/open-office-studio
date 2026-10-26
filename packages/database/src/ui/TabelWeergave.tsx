/**
 * Gegevensweergave van een tabel in de werkkopie: paginering, sorteren,
 * zoeken, cellen bewerken, rijen toevoegen en verwijderen.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Plus, Search, Trash2, Download, RefreshCw } from "lucide-react";
import type { Rij, TabelSchema, Waarde, Werkkopie } from "../werkkopie/contract.ts";
import { bewerkbaar, leesbareFout, leesInvoer, SOORTNAMEN } from "./invoer.ts";
import { Raster, type RasterKolom } from "./Raster.tsx";
import { useDialogen } from "./Dialoog.tsx";

export const PAGINA = 100;

export function TabelWeergave({
  werkkopie,
  schema,
  onGewijzigd,
  onExporteer,
}: {
  werkkopie: Werkkopie;
  schema: TabelSchema;
  onGewijzigd: () => void;
  onExporteer: () => void;
}) {
  const dialogen = useDialogen();
  const [start, setStart] = useState(0);
  const [zoek, setZoek] = useState("");
  const [zoekterm, setZoekterm] = useState("");
  const [sorteer, setSorteer] = useState<{ kolom: string; aflopend: boolean } | null>(null);
  const [data, setData] = useState<{ rijen: Rij[]; totaal: number } | null>(null);
  const [fout, setFout] = useState("");
  const [laden, setLaden] = useState(false);
  const [cel, setCel] = useState({ rij: 0, kolom: 0 });
  const [nieuw, setNieuw] = useState<Record<string, string> | null>(null);
  const [nieuwFout, setNieuwFout] = useState("");
  const id = useId();

  useEffect(() => {
    const t = setTimeout(() => {
      setZoekterm(zoek.trim());
      setStart(0);
    }, 300);
    return () => clearTimeout(t);
  }, [zoek]);

  const laad = useCallback(async () => {
    setLaden(true);
    try {
      const r = await werkkopie.rijen(schema.naam, {
        start,
        aantal: PAGINA,
        zoek: zoekterm || undefined,
        sorteer: sorteer ? { veld: sorteer.kolom, aflopend: sorteer.aflopend } : undefined,
      });
      setData(r);
      setFout("");
    } catch (e) {
      setFout("De rijen konden niet worden gelezen: " + leesbareFout(e));
    } finally {
      setLaden(false);
    }
  }, [werkkopie, schema.naam, start, zoekterm, sorteer]);

  useEffect(() => {
    void laad();
  }, [laad]);

  const kolommen: RasterKolom[] = schema.velden.map((v) => ({
    naam: v.naam,
    soort: v.soort,
    veld: bewerkbaar(v.soort) ? v : undefined,
    sleutel: v.primair,
  }));
  const rijen = (data?.rijen ?? []).map((r) => ({
    sleutel: r.rowid,
    waarden: schema.velden.map((v) => r.waarden[v.naam] ?? null),
  }));
  const totaal = data?.totaal ?? 0;
  const laatsteStart = Math.max(0, Math.floor((totaal - 1) / PAGINA) * PAGINA);

  async function wijzig(rij: number, kolom: number, waarde: Waarde) {
    const r = data?.rijen[rij];
    if (!r) return;
    const veld = schema.velden[kolom].naam;
    await werkkopie.wijzig(schema.naam, r.rowid, { [veld]: waarde });
    const nieuw = await werkkopie.rij(schema.naam, r.rowid);
    setData((d) => (d && nieuw ? { ...d, rijen: d.rijen.map((x) => (x.rowid === r.rowid ? nieuw : x)) } : d));
    onGewijzigd();
  }

  async function verwijderActief() {
    const r = data?.rijen[cel.rij];
    if (!r) return;
    const omschrijving = schema.velden
      .slice(0, 3)
      .map((v) => `${v.naam}: ${String(r.waarden[v.naam] ?? "")}`)
      .join(", ");
    const ja = await dialogen.bevestig({
      titel: "Rij verwijderen",
      tekst: (
        <>
          <p>Je staat op het punt één rij uit ‘{schema.naam}’ te verwijderen:</p>
          <p className="muted">{omschrijving}</p>
          <p>Dit gebeurt in de werkkopie; het origineel blijft ongewijzigd.</p>
        </>
      ),
      ja: "Verwijderen",
      gevaarlijk: true,
    });
    if (!ja) return;
    try {
      await werkkopie.verwijder(schema.naam, r.rowid);
      setFout("");
      onGewijzigd();
      if (rijen.length === 1 && start > 0) setStart(Math.max(0, start - PAGINA));
      else void laad();
    } catch (e) {
      setFout("Verwijderen mislukt: " + leesbareFout(e));
    }
  }

  async function voegToe() {
    if (!nieuw) return;
    const waarden: Record<string, Waarde> = {};
    for (const v of schema.velden) {
      if (!bewerkbaar(v.soort)) continue;
      const tekst = nieuw[v.naam] ?? "";
      if (!tekst.trim() && v.soort !== "jaNee" && !v.verplicht) continue;
      const r = leesInvoer(v.soort === "jaNee" ? tekst || "Nee" : tekst, v);
      if (!r.ok) return setNieuwFout(r.fout);
      waarden[v.naam] = r.waarde;
    }
    try {
      await werkkopie.voegToe(schema.naam, waarden);
      setNieuw(null);
      setNieuwFout("");
      onGewijzigd();
      setSorteer(null);
      setZoek("");
      setZoekterm("");
      const t = (await werkkopie.rijen(schema.naam, { aantal: 0 })).totaal;
      const doel = Math.max(0, Math.floor((t - 1) / PAGINA) * PAGINA);
      if (doel === start) void laad();
      else setStart(doel);
    } catch (e) {
      setNieuwFout(leesbareFout(e));
    }
  }

  return (
    <div className="database-tabelweergave">
      <div className="database-werkbalk" role="toolbar" aria-label={`Bewerken van ${schema.naam}`}>
        <label className="zoek">
          <Search size={16} aria-hidden />
          <input
            aria-label="Zoeken in tekstvelden"
            placeholder="Zoeken in tekstvelden…"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
          />
        </label>
        <button onClick={() => setNieuw(nieuw ? null : {})} aria-expanded={!!nieuw}>
          <Plus size={16} /> Rij toevoegen
        </button>
        <button onClick={() => void verwijderActief()} disabled={!data?.rijen[cel.rij]}>
          <Trash2 size={16} /> Rij verwijderen
        </button>
        <button onClick={() => void laad()} disabled={laden}>
          <RefreshCw size={16} /> Vernieuwen
        </button>
        <button onClick={onExporteer}>
          <Download size={16} /> CSV
        </button>
      </div>
      {nieuw && (
        <form
          className="database-nieuwe-rij"
          aria-label="Nieuwe rij"
          onSubmit={(e) => {
            e.preventDefault();
            void voegToe();
          }}
        >
          <div className="database-nieuwe-rij-velden">
            {schema.velden.map((v, i) => (
              <label key={v.naam} className="database-veld" htmlFor={`${id}-${i}`}>
                <span>
                  {v.naam}
                  {v.verplicht && !bewerkbaar(v.soort) ? "" : v.verplicht ? " *" : ""}
                  <small>{SOORTNAMEN[v.soort]}</small>
                </span>
                {v.soort === "jaNee" ? (
                  <input
                    id={`${id}-${i}`}
                    type="checkbox"
                    checked={nieuw[v.naam] === "Ja"}
                    onChange={(e) => setNieuw({ ...nieuw, [v.naam]: e.target.checked ? "Ja" : "Nee" })}
                  />
                ) : (
                  <input
                    id={`${id}-${i}`}
                    disabled={!bewerkbaar(v.soort)}
                    placeholder={v.soort === "autonummer" ? "(automatisch)" : v.soort === "datum" ? "dd-mm-jjjj" : ""}
                    value={nieuw[v.naam] ?? ""}
                    onChange={(e) => setNieuw({ ...nieuw, [v.naam]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
          {nieuwFout && (
            <p className="melding fout" role="alert">
              {nieuwFout}
            </p>
          )}
          <div className="database-knoppen">
            <button type="submit" className="primary">
              Rij opslaan
            </button>
            <button type="button" onClick={() => setNieuw(null)}>
              Annuleren
            </button>
          </div>
        </form>
      )}
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      {!data ? (
        <p role="status">Rijen laden…</p>
      ) : (
        <Raster
          label={`Tabel ${schema.naam}`}
          kolommen={kolommen}
          rijen={rijen}
          start={start}
          totaal={totaal}
          sorteer={sorteer}
          onSorteer={(kolom) => {
            setSorteer((s) => (s?.kolom === kolom ? (s.aflopend ? null : { kolom, aflopend: true }) : { kolom, aflopend: false }));
            setStart(0);
          }}
          onWijzig={wijzig}
          actief={cel}
          onActief={setCel}
          leeg={zoekterm ? `Geen rijen gevonden met ‘${zoekterm}’.` : "Deze tabel is leeg. Gebruik ‘Rij toevoegen’."}
        />
      )}
      <nav className="database-paginering" aria-label="Pagina’s">
        <button aria-label="Eerste pagina" disabled={laden || start === 0} onClick={() => setStart(0)}>
          <ChevronFirst size={16} />
        </button>
        <button aria-label="Vorige pagina" disabled={laden || start === 0} onClick={() => setStart(Math.max(0, start - PAGINA))}>
          <ChevronLeft size={16} />
        </button>
        <span role="status">
          {totaal ? `Rij ${(start + 1).toLocaleString("nl-NL")}–${Math.min(start + PAGINA, totaal).toLocaleString("nl-NL")} van ${totaal.toLocaleString("nl-NL")}` : "0 rijen"}
          {zoekterm ? " (gefilterd)" : ""}
        </span>
        <button aria-label="Volgende pagina" disabled={laden || start + PAGINA >= totaal} onClick={() => setStart(start + PAGINA)}>
          <ChevronRight size={16} />
        </button>
        <button aria-label="Laatste pagina" disabled={laden || start >= laatsteStart} onClick={() => setStart(laatsteStart)}>
          <ChevronLast size={16} />
        </button>
      </nav>
    </div>
  );
}
