import { useRef } from "react";
import { Columns3, Rows3, Trash2, ClipboardPaste, Table2 } from "lucide-react";
import { leesTabgescheiden } from "../model.ts";
import { LIMIETEN } from "../fouten.ts";

const kolomNaam = (i: number) => (i === 0 ? "Categorie" : `Reeks ${i}`);

/**
 * Klein rekenblad om categorieën (eerste kolom), reeksnamen (eerste rij) en
 * waarden in te voeren. Plakken van tabgescheiden tekst vult vanaf de cel.
 */
export function Gegevensblad({
  raster,
  wijzig,
  uitTabel,
  meld,
}: {
  raster: string[][];
  wijzig: (raster: string[][]) => void;
  /** Haalt gegevens uit de tabel waar de cursor staat; ontbreekt als dat niet kan. */
  uitTabel?: () => void;
  meld: (tekst: string) => void;
}) {
  const vak = useRef<HTMLTableElement>(null);
  const rijen = raster.length;
  const kolommen = raster[0]?.length ?? 0;
  const zet = (r: number, k: number, w: string) =>
    wijzig(raster.map((rij, i) => (i === r ? rij.map((c, j) => (j === k ? w : c)) : rij)));
  function plak(r: number, k: number, tekst: string) {
    let blok: string[][];
    try {
      blok = leesTabgescheiden(tekst);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e));
      return;
    }
    const hoogte = Math.max(rijen, r + blok.length);
    const breedte = Math.max(kolommen, k + Math.max(...blok.map((b) => b.length)));
    if (hoogte * breedte > LIMIETEN.cellen) {
      meld("De geplakte gegevens zijn te groot voor een grafiek.");
      return;
    }
    const nieuw = Array.from({ length: hoogte }, (_, i) =>
      Array.from({ length: breedte }, (_, j) => raster[i]?.[j] ?? ""),
    );
    blok.forEach((rij, i) => rij.forEach((c, j) => (nieuw[r + i][k + j] = c.trim())));
    wijzig(nieuw);
  }
  function plakKlembord() {
    if (!navigator.clipboard?.readText) {
      meld("Plakken via de knop is hier niet toegestaan. Klik in een cel en gebruik Ctrl+V.");
      return;
    }
    navigator.clipboard
      .readText()
      .then((t) => t && plak(0, 0, t))
      .catch(() => meld("Plakken via de knop is hier niet toegestaan. Klik in een cel en gebruik Ctrl+V."));
  }
  const focus = (r: number, k: number) =>
    requestAnimationFrame(() =>
      vak.current?.querySelector<HTMLInputElement>(`input[data-cel="${r}:${k}"]`)?.focus(),
    );
  return (
    <div className="grafiek-gegevensblad">
      <div className="grafiek-gegevensblad-knoppen">
        <button type="button" onClick={() => wijzig([...raster, Array(kolommen).fill("")])} disabled={rijen >= LIMIETEN.categorieen + 1}>
          <Rows3 size={14} /> Rij
        </button>
        <button type="button" onClick={() => wijzig(raster.map((r, i) => [...r, i === 0 ? kolomNaam(kolommen) : ""]))} disabled={kolommen > LIMIETEN.reeksen}>
          <Columns3 size={14} /> Reeks
        </button>
        <button type="button" onClick={() => rijen > 2 && wijzig(raster.slice(0, -1))} disabled={rijen <= 2} title="Laatste rij verwijderen">
          <Trash2 size={14} /> Rij
        </button>
        <button type="button" onClick={() => kolommen > 2 && wijzig(raster.map((r) => r.slice(0, -1)))} disabled={kolommen <= 2} title="Laatste reeks verwijderen">
          <Trash2 size={14} /> Reeks
        </button>
        <button type="button" onClick={plakKlembord} title="Tabgescheiden tekst uit het klembord plakken, bijvoorbeeld gekopieerd uit een rekenblad">
          <ClipboardPaste size={14} /> Plakken
        </button>
        {uitTabel && (
          <button type="button" onClick={uitTabel} title="Neemt de tabel over waarin de cursor staat">
            <Table2 size={14} /> Uit geselecteerde tabel
          </button>
        )}
      </div>
      <div className="grafiek-gegevensblad-raster">
        <table ref={vak}>
          <tbody>
            {raster.map((rij, r) => (
              <tr key={r}>
                {rij.map((cel, k) => (
                  <td key={k} className={r === 0 || k === 0 ? "grafiek-kopcel" : undefined}>
                    <input
                      data-cel={`${r}:${k}`}
                      value={cel}
                      aria-label={
                        r === 0 && k === 0
                          ? "Hoekcel"
                          : r === 0
                            ? `Naam van reeks ${k}`
                            : k === 0
                              ? `Categorie ${r}`
                              : `Waarde rij ${r}, reeks ${k}`
                      }
                      placeholder={r === 0 && k > 0 ? kolomNaam(k) : ""}
                      inputMode={r > 0 && k > 0 ? "decimal" : undefined}
                      onChange={(e) => zet(r, k, e.target.value)}
                      onPaste={(e) => {
                        const t = e.clipboardData.getData("text/plain");
                        if (t.includes("\t") || t.includes("\n")) {
                          e.preventDefault();
                          plak(r, k, t);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (r + 1 >= rijen) wijzig([...raster, Array(kolommen).fill("")]);
                          focus(r + 1, k);
                        }
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
