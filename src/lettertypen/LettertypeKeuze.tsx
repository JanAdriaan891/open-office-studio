/**
 * Lettertypekeuze in het lint (#22): alle beschikbare lettertypen (meegeleverd
 * en van deze computer) met een voorbeeld in het lettertype zelf, recent
 * gebruikte bovenaan en een zoekveld. Kiezen gaat via de engine-opdracht
 * `fontFamily`, dus ongedaan maken en de editorstatus werken als gewoonlijk.
 */
import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { RibbonFout, type GebondenOpdracht } from "../Ribbon";
import {
  bekendeSysteemLettertypen,
  bijWijziging,
  gebundeldeFamilies,
  kanToestemmingVragen,
  laadSysteemLettertypen,
} from "./systeem";
import "./lettertypekeuze.css";

const RECENT_SLEUTEL = "office-recente-lettertypen";
const MAX_RECENT = 8;

export function recenteLettertypen(): string[] {
  try {
    const waarde = JSON.parse(localStorage.getItem(RECENT_SLEUTEL) ?? "[]");
    return Array.isArray(waarde) ? waarde.filter((v) => typeof v === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}
export function onthoudLettertype(familie: string) {
  try {
    const lijst = [familie, ...recenteLettertypen().filter((f) => f.toLowerCase() !== familie.toLowerCase())];
    localStorage.setItem(RECENT_SLEUTEL, JSON.stringify(lijst.slice(0, MAX_RECENT)));
  } catch {
    // Zonder opslag geen recente lijst.
  }
}

/** Groepen voor de keuzelijst: recent, in de engine bekend, meegeleverd, systeem. */
export function lettertypeGroepen(
  recent: string[],
  engine: string[],
  gebundeld: string[],
  systeem: string[],
  zoek: string,
) {
  const gezien = new Set<string>();
  const filter = (lijst: string[]) =>
    lijst.filter((naam) => {
      const sleutel = naam.toLowerCase();
      if (gezien.has(sleutel)) return false;
      if (zoek && !sleutel.includes(zoek.toLowerCase())) return false;
      gezien.add(sleutel);
      return true;
    });
  const sorteer = (lijst: string[]) => [...lijst].sort((a, b) => a.localeCompare(b));
  return [
    { naam: "Recent gebruikt", lettertypen: filter(recent) },
    { naam: "Lettertypen", lettertypen: filter(sorteer([...engine, ...gebundeld])) },
    { naam: "Op deze computer", lettertypen: filter(sorteer(systeem)) },
  ].filter((g) => g.lettertypen.length);
}

export function LettertypeKeuze({
  opdracht,
  naam = "Lettertype",
}: {
  opdracht: GebondenOpdracht;
  naam?: string;
}) {
  const fout = useContext(RibbonFout);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const [, setVersie] = useState(0);
  const [actief, setActief] = useState(0);
  const knop = useRef<HTMLButtonElement>(null);
  const zoekveld = useRef<HTMLInputElement>(null);
  const lijst = useRef<HTMLUListElement>(null);
  useEffect(() => bijWijziging(() => setVersie((v) => v + 1)), []);
  useEffect(() => {
    void laadSysteemLettertypen();
  }, []);

  const huidig = typeof opdracht.state.value === "string" ? opdracht.state.value : "";
  const engine = useMemo(
    () =>
      (opdracht.state.options ?? [])
        .map((o) => (o.args as { family?: string } | null)?.family ?? o.label)
        .filter(Boolean),
    [opdracht.state.options],
  );
  const groepen = open
    ? lettertypeGroepen(recenteLettertypen(), engine, gebundeldeFamilies(), bekendeSysteemLettertypen(), zoek.trim())
    : [];
  const plat = groepen.flatMap((g) => g.lettertypen);

  function kies(familie: string) {
    setOpen(false);
    setZoek("");
    onthoudLettertype(familie);
    void opdracht
      .execute({ family: familie } as never)
      .then((r) => {
        if (!r.ok) fout(r.failure?.message ?? "Het lettertype kon niet worden gekozen.");
      })
      .catch((e) => fout(e instanceof Error ? e.message : String(e)));
    knop.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    zoekveld.current?.focus();
    const weg = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(`[data-lettertypekeuze="${id}"]`)) setOpen(false);
    };
    window.addEventListener("pointerdown", weg, true);
    return () => window.removeEventListener("pointerdown", weg, true);
  }, [open, id]);
  useEffect(() => setActief(0), [zoek, open]);
  useEffect(() => {
    lijst.current?.querySelector<HTMLElement>(`[data-index="${actief}"]`)?.scrollIntoView({ block: "nearest" });
  }, [actief]);

  let index = -1;
  return (
    <div className="lettertypekeuze ribbon-keuze ribbon-keuze-breed" data-lettertypekeuze={id}>
      <button
        ref={knop}
        type="button"
        className="lettertypekeuze-knop"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${naam}: ${huidig || "gemengd"}`}
        title={naam}
        disabled={!opdracht.state.enabled}
        style={{ fontFamily: huidig ? `"${huidig}", Inter, sans-serif` : undefined }}
        onClick={() => setOpen(!open)}
      >
        <span>{huidig || naam}</span>
      </button>
      <ChevronDown size={12} />
      {open && (
        <div className="lettertypekeuze-paneel" role="dialog" aria-label={naam}>
          <input
            ref={zoekveld}
            type="search"
            placeholder="Zoeken…"
            aria-label="Lettertype zoeken"
            aria-controls={`${id}-lijst`}
            aria-activedescendant={plat.length ? `${id}-${actief}` : undefined}
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActief((a) => Math.min(plat.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActief((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const keuze = plat[actief] ?? zoek.trim();
                if (keuze) kies(keuze);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                knop.current?.focus();
              }
            }}
          />
          <ul ref={lijst} id={`${id}-lijst`} role="listbox" aria-label={naam}>
            {groepen.map((groep) => (
              <li key={groep.naam} role="presentation">
                <span className="lettertypekeuze-groep">{groep.naam}</span>
                <ul role="group" aria-label={groep.naam}>
                  {groep.lettertypen.map((familie) => {
                    index++;
                    const mijn = index;
                    return (
                      <li
                        key={familie}
                        id={`${id}-${mijn}`}
                        data-index={mijn}
                        role="option"
                        aria-selected={familie.toLowerCase() === huidig.toLowerCase()}
                        className={mijn === actief ? "is-actief" : undefined}
                        style={{ fontFamily: `"${familie}", Inter, sans-serif` }}
                        onPointerEnter={() => setActief(mijn)}
                        onClick={() => kies(familie)}
                      >
                        {familie}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {!plat.length && <li className="lettertypekeuze-leeg">Geen lettertype gevonden; Enter kiest “{zoek}”.</li>}
          </ul>
          {kanToestemmingVragen() && (
            <button
              type="button"
              className="lettertypekeuze-toestemming"
              onClick={() => void laadSysteemLettertypen(true)}
            >
              Lettertypen van deze computer tonen…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
