/**
 * Gegevensraster met toetsenbordbediening (pijltjes, Home/End, PageUp/Down,
 * Enter/F2 bewerken, Escape annuleren, Tab naar de volgende cel) en
 * bewerken met typecontrole per Veldsoort. Wordt gebruikt voor tabellen,
 * queryresultaten en de gegevensbladweergave van formulieren.
 */
import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, KeyRound } from "lucide-react";
import type { VeldSchema, Veldsoort, Waarde } from "../werkkopie/contract.ts";
import { bewerkTekst, leesbareFout, leesInvoer, SOORTNAMEN, toonWaarde } from "./invoer.ts";

export interface RasterKolom {
  naam: string;
  soort: Veldsoort | null;
  /** Aanwezig = bewerkbaar met deze veldregels. */
  veld?: VeldSchema;
  sleutel?: boolean;
}
export interface RasterRij {
  sleutel: string | number;
  waarden: Waarde[];
}

export function Raster({
  label,
  kolommen,
  rijen,
  start = 0,
  totaal,
  sorteer,
  onSorteer,
  onWijzig,
  actief,
  onActief,
  leeg = "Geen rijen.",
}: {
  label: string;
  kolommen: RasterKolom[];
  rijen: RasterRij[];
  /** Rijnummer van de eerste rij (paginering), voor aria-rowindex. */
  start?: number;
  totaal?: number;
  sorteer?: { kolom: string; aflopend: boolean } | null;
  onSorteer?: (kolom: string) => void;
  /** Bewaart één cel; gooit een fout als dat mislukt. */
  onWijzig?: (rij: number, kolom: number, waarde: Waarde) => Promise<void>;
  actief?: { rij: number; kolom: number };
  onActief?: (cel: { rij: number; kolom: number }) => void;
  leeg?: string;
}) {
  const [eigenActief, setEigenActief] = useState({ rij: 0, kolom: 0 });
  const cel = actief ?? eigenActief;
  const zetCel = (c: { rij: number; kolom: number }) => {
    const r = Math.max(0, Math.min(c.rij, rijen.length - 1));
    const k = Math.max(0, Math.min(c.kolom, kolommen.length - 1));
    setEigenActief({ rij: r, kolom: k });
    onActief?.({ rij: r, kolom: k });
  };
  const [bewerk, setBewerk] = useState<{ rij: number; kolom: number; tekst: string; selecteer?: boolean } | null>(null);
  const [fout, setFout] = useState<{ rij: number; kolom: number; tekst: string } | null>(null);
  const [bezig, setBezig] = useState(false);
  const tabel = useRef<HTMLTableElement>(null);
  const focusNaRender = useRef(false);
  const id = useId();

  useEffect(() => {
    if (!focusNaRender.current) return;
    focusNaRender.current = false;
    const el = tabel.current?.querySelector<HTMLElement>(bewerk ? "td input[data-bewerk]" : `td[data-cel="${cel.rij}:${cel.kolom}"]`);
    el?.focus();
    if (el instanceof HTMLInputElement && bewerk) {
      if (bewerk.selecteer) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  const kanBewerken = (k: number) => !!onWijzig && !!kolommen[k]?.veld;

  function begin(rij: number, kolom: number, tekst?: string) {
    if (!kanBewerken(kolom) || bezig) return;
    const kol = kolommen[kolom];
    if (kol.soort === "jaNee") {
      void bewaar(rij, kolom, rijen[rij].waarden[kolom] ? "Nee" : "Ja");
      return;
    }
    focusNaRender.current = true;
    setBewerk({ rij, kolom, tekst: tekst ?? bewerkTekst(rijen[rij].waarden[kolom], kol.soort), selecteer: tekst === undefined });
    setFout(null);
  }

  async function bewaar(rij: number, kolom: number, tekst: string): Promise<boolean> {
    const kol = kolommen[kolom];
    if (!kol.veld || !onWijzig) return false;
    const r = leesInvoer(tekst, kol.veld);
    if (!r.ok) {
      setFout({ rij, kolom, tekst: r.fout });
      return false;
    }
    const oud = rijen[rij]?.waarden[kolom];
    if (oud === r.waarde || (oud == null && r.waarde == null)) return true;
    setBezig(true);
    try {
      await onWijzig(rij, kolom, r.waarde);
      setFout(null);
      return true;
    } catch (e) {
      setFout({ rij, kolom, tekst: leesbareFout(e) });
      return false;
    } finally {
      setBezig(false);
    }
  }

  async function sluitBewerken(beweging: { rij: number; kolom: number } | null) {
    if (!bewerk) return;
    const ok = await bewaar(bewerk.rij, bewerk.kolom, bewerk.tekst);
    if (!ok) {
      focusNaRender.current = true;
      return;
    }
    setBewerk(null);
    focusNaRender.current = true;
    if (beweging) zetCel(beweging);
  }

  function toets(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest("thead")) return;
    if (bewerk) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setBewerk(null);
        setFout(null);
        focusNaRender.current = true;
        zetCel(cel);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void sluitBewerken({ rij: bewerk.rij + 1, kolom: bewerk.kolom });
      } else if (e.key === "Tab") {
        e.preventDefault();
        void sluitBewerken({ rij: bewerk.rij, kolom: bewerk.kolom + (e.shiftKey ? -1 : 1) });
      }
      return;
    }
    const { rij, kolom } = cel;
    const per = 10;
    let doel: { rij: number; kolom: number } | null = null;
    switch (e.key) {
      case "ArrowDown":
        doel = { rij: rij + 1, kolom };
        break;
      case "ArrowUp":
        doel = { rij: rij - 1, kolom };
        break;
      case "ArrowRight":
        doel = { rij, kolom: kolom + 1 };
        break;
      case "ArrowLeft":
        doel = { rij, kolom: kolom - 1 };
        break;
      case "Home":
        doel = e.ctrlKey ? { rij: 0, kolom: 0 } : { rij, kolom: 0 };
        break;
      case "End":
        doel = e.ctrlKey ? { rij: rijen.length - 1, kolom: kolommen.length - 1 } : { rij, kolom: kolommen.length - 1 };
        break;
      case "PageDown":
        doel = { rij: rij + per, kolom };
        break;
      case "PageUp":
        doel = { rij: rij - per, kolom };
        break;
      case "Enter":
      case "F2":
        e.preventDefault();
        begin(rij, kolom);
        return;
      case " ":
        if (kolommen[kolom]?.soort === "jaNee") {
          e.preventDefault();
          begin(rij, kolom);
        }
        return;
      case "Delete":
      case "Backspace":
        if (kanBewerken(kolom) && kolommen[kolom].soort !== "jaNee") {
          e.preventDefault();
          begin(rij, kolom, "");
        }
        return;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && kanBewerken(kolom) && kolommen[kolom].soort !== "jaNee") {
          e.preventDefault();
          begin(rij, kolom, e.key);
        }
        return;
    }
    e.preventDefault();
    focusNaRender.current = true;
    zetCel(doel);
  }

  if (!rijen.length)
    return (
      <div className="database-raster-leeg" role="status">
        {leeg}
      </div>
    );

  return (
    <>
      <div className="table-wrap database-raster-wrap">
        <table
          ref={tabel}
          role="grid"
          aria-label={label}
          aria-rowcount={totaal !== undefined ? totaal + 1 : undefined}
          aria-busy={bezig}
          className="database-raster"
          onKeyDown={toets}
        >
          <thead>
            <tr aria-rowindex={1}>
              {kolommen.map((k, kolomIndex) => {
                const richting = sorteer?.kolom === k.naam ? (sorteer.aflopend ? "descending" : "ascending") : "none";
                return (
                  <th key={kolomIndex} scope="col" aria-sort={onSorteer ? richting : undefined}>
                    {onSorteer ? (
                      <button className="database-kolomknop" onClick={() => onSorteer(k.naam)} title={`Sorteren op ${k.naam}`}>
                        {k.sleutel && <KeyRound size={12} aria-label="Primaire sleutel" />}
                        {k.naam}
                        {richting === "ascending" && <ArrowUp size={12} aria-hidden />}
                        {richting === "descending" && <ArrowDown size={12} aria-hidden />}
                      </button>
                    ) : (
                      k.naam
                    )}
                    {k.soort && <small className="database-kolomtype">{SOORTNAMEN[k.soort]}</small>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rijen.map((rij, r) => (
              <tr key={rij.sleutel} aria-rowindex={start + r + 2} className={cel.rij === r ? "is-actief" : ""}>
                {kolommen.map((k, c) => {
                  const isActief = cel.rij === r && cel.kolom === c;
                  const isBewerk = bewerk?.rij === r && bewerk.kolom === c;
                  const heeftFout = fout?.rij === r && fout.kolom === c;
                  const w = rij.waarden[c];
                  return (
                    <td
                      key={c}
                      role="gridcell"
                      data-cel={`${r}:${c}`}
                      tabIndex={isActief && !isBewerk ? 0 : -1}
                      aria-readonly={!kanBewerken(c)}
                      aria-invalid={heeftFout || undefined}
                      aria-describedby={heeftFout ? `${id}-fout` : undefined}
                      className={`${isActief ? "is-cel" : ""} ${heeftFout ? "is-fout" : ""} soort-${k.soort ?? "onbekend"}`}
                      onClick={() => {
                        if (!isBewerk) zetCel({ rij: r, kolom: c });
                      }}
                      onDoubleClick={() => begin(r, c)}
                    >
                      {isBewerk ? (
                        <input
                          data-bewerk
                          aria-label={`${k.naam}, rij ${start + r + 1}`}
                          value={bewerk.tekst}
                          disabled={bezig}
                          onChange={(e) => setBewerk({ ...bewerk, tekst: e.target.value })}
                          onBlur={() => {
                            if (!bezig) void sluitBewerken(null);
                          }}
                        />
                      ) : k.soort === "jaNee" ? (
                        <span className="database-janee" aria-label={toonWaarde(w, "jaNee")}>
                          <input type="checkbox" tabIndex={-1} readOnly checked={!!w} aria-hidden />
                        </span>
                      ) : (
                        toonWaarde(w, k.soort)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fout && (
        <p id={`${id}-fout`} className="melding fout database-rasterfout" role="alert">
          {fout.tekst}
        </p>
      )}
      <p className="muted database-rasterhulp">
        Pijltjestoetsen om te bewegen · Enter of F2 om te bewerken · Escape om te annuleren
        {onSorteer ? " · klik op een kolomkop om te sorteren" : ""}
      </p>
    </>
  );
}
