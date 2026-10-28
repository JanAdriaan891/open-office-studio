/**
 * Lettertypekeuze in het lint (#22): alle beschikbare lettertypen in groepen
 * (in dit document, recent, schreefloos, schreef, monospace, handschrift en
 * display, van deze computer), elke naam in het lettertype zelf, een
 * voorbeeldregel met de geselecteerde tekst, een zoekveld en een korte
 * licentievermelding. Kiezen gaat via de engine-opdracht `fontFamily`, dus
 * ongedaan maken en de editorstatus werken als gewoonlijk.
 */
import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { RibbonFout, type GebondenOpdracht } from "../Ribbon";
import { useOfficeThema } from "../stijl/ThemaKnop";
import { CATALOGUS, familieInfo, type Categorie } from "./catalogus";
import { DocumentLettertypen } from "./context";
import {
  bekendeSysteemLettertypen,
  bijWijziging,
  kanToestemmingVragen,
  laadSysteemLettertypen,
} from "./systeem";
import { OFFICE_NAMEN, VERVANGINGEN } from "./vervanging";
import { keuzeRegel, laadVoorbeeld, vermelding, voorbeeldFamilie, type KeuzeRegel } from "./voorbeeld";
import "./lettertypekeuze.css";

const RECENT_SLEUTEL = "office-recente-lettertypen";
const MAX_RECENT = 8;
export const STANDAARD_VOORBEELD = "Aa Bb Cc 123";

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

export interface Groep {
  naam: string;
  regels: KeuzeRegel[];
}

const GROEP_VAN: Record<Categorie, string> = {
  schreefloos: "Schreefloos",
  schreef: "Schreef",
  monospace: "Monospace",
  handschrift: "Handschrift en display",
  display: "Handschrift en display",
};
export const GROEPEN = [
  "In dit document",
  "Recent gebruikt",
  "Schreefloos",
  "Schreef",
  "Monospace",
  "Handschrift en display",
  "Op deze computer",
] as const;

/**
 * Groepen voor de keuzelijst. In dit document en Recent staan bovenaan; een
 * familie staat daarnaast ook in haar eigen categorie, net als in Word.
 * Office-lettertypen die hier niet staan (Calibri, Arial, …) staan in de
 * categorie van hun open vervanger. Lettertypen van deze computer die de app
 * niet zelf meelevert staan onder "Op deze computer".
 */
export function lettertypeGroepen({
  document = [],
  recent = [],
  engine = [],
  systeem = [],
  zoek = "",
}: {
  document?: readonly string[];
  recent?: readonly string[];
  engine?: readonly string[];
  systeem?: readonly string[];
  zoek?: string;
}): Groep[] {
  const opSysteem = new Set(systeem.map((n) => n.toLowerCase()));
  const indeling = (familie: string): KeuzeRegel => {
    const info = familieInfo(familie);
    if (info) return { familie: info.familie, herkomst: info.herkomst };
    if (opSysteem.has(familie.toLowerCase())) return { familie, herkomst: "systeem" };
    const regel = VERVANGINGEN[familie.toLowerCase()];
    if (regel) return { familie, herkomst: "office", vervanger: regel.vervanger, metrisch: regel.soort === "metrisch" };
    return { familie, herkomst: "onbekend" };
  };
  const filter = zoek.trim().toLowerCase();
  const past = (r: KeuzeRegel) => !filter || r.familie.toLowerCase().includes(filter);
  const groepen = new Map<string, Map<string, KeuzeRegel>>(GROEPEN.map((g) => [g, new Map()]));
  const zet = (groep: string, regel: KeuzeRegel) => {
    const lijst = groepen.get(groep)!;
    const sleutel = regel.familie.toLowerCase();
    if (past(regel) && !lijst.has(sleutel)) lijst.set(sleutel, regel);
  };
  for (const naam of document) zet("In dit document", indeling(naam));
  for (const naam of recent) zet("Recent gebruikt", indeling(naam));
  for (const info of CATALOGUS) zet(GROEP_VAN[info.categorie], indeling(info.familie));
  for (const naam of [...OFFICE_NAMEN, ...engine]) {
    const regel = indeling(naam);
    if (regel.herkomst === "office" && regel.vervanger) {
      const categorie = familieInfo(regel.vervanger)?.categorie ?? "schreefloos";
      zet(GROEP_VAN[categorie], regel);
    } else if (regel.herkomst === "systeem") zet("Op deze computer", regel);
  }
  for (const naam of systeem) {
    const regel = indeling(naam);
    if (regel.herkomst === "systeem") zet("Op deze computer", regel);
  }
  const sorteer = (regels: KeuzeRegel[]) => regels.sort((a, b) => a.familie.localeCompare(b.familie));
  return GROEPEN.map((naam) => {
    const regels = [...groepen.get(naam)!.values()];
    return { naam, regels: naam === "In dit document" || naam === "Recent gebruikt" ? regels : sorteer(regels) };
  }).filter((g) => g.regels.length);
}

export function LettertypeKeuze({
  opdracht,
  naam = "Lettertype",
  voorbeeld,
  voorbereiden,
}: {
  opdracht: GebondenOpdracht;
  naam?: string;
  /** De geselecteerde tekst of het woord bij de cursor, voor de voorbeeldregel. */
  voorbeeld?: () => string;
  /** Maakt een gekozen lettertype bruikbaar voor de engine (vóór het toepassen). */
  voorbereiden?: (familie: string) => Promise<void>;
}) {
  const fout = useContext(RibbonFout);
  const documentNamen = useContext(DocumentLettertypen);
  const { thema } = useOfficeThema();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const [, setVersie] = useState(0);
  const [actief, setActief] = useState(0);
  const [plek, setPlek] = useState({ top: 0, left: 0 });
  const [voorbeeldTekst, setVoorbeeldTekst] = useState(STANDAARD_VOORBEELD);
  const knop = useRef<HTMLButtonElement>(null);
  const zoekveld = useRef<HTMLInputElement>(null);
  const lijst = useRef<HTMLUListElement>(null);
  useEffect(() => bijWijziging(() => setVersie((v) => v + 1)), []);
  useEffect(() => {
    void laadSysteemLettertypen();
  }, []);

  const huidig = typeof opdracht.state.value === "string" ? opdracht.state.value : "";
  const huidigeRegel = useMemo(() => (huidig ? keuzeRegel(huidig) : null), [huidig, bekendeSysteemLettertypen().length]);
  // Ook het gesloten veld toont de naam in het lettertype zelf.
  useEffect(() => {
    if (huidigeRegel) void laadVoorbeeld(huidigeRegel);
  }, [huidigeRegel]);

  const engine = useMemo(
    () =>
      (opdracht.state.options ?? [])
        .map((o) => (o.args as { family?: string } | null)?.family ?? o.label)
        .filter(Boolean),
    [opdracht.state.options],
  );
  const groepen = open
    ? lettertypeGroepen({
        document: [...documentNamen, ...(huidig ? [huidig] : [])],
        recent: recenteLettertypen(),
        engine,
        systeem: bekendeSysteemLettertypen(),
        zoek,
      })
    : [];
  const plat = groepen.flatMap((g) => g.regels);
  const actieveRegel = plat[actief];

  // Voorbeeldregel: de actieve regel ook vet en cursief laden.
  useEffect(() => {
    if (actieveRegel) void laadVoorbeeld(actieveRegel, true);
  }, [actieveRegel?.familie, actieveRegel?.herkomst]);

  // Lazy laden: pas een lettertype ophalen als de regel in beeld komt.
  useLayoutEffect(() => {
    const wortel = lijst.current;
    if (!open || !wortel || typeof IntersectionObserver === "undefined") return;
    const waarnemer = new IntersectionObserver(
      (items) => {
        for (const item of items) {
          if (!item.isIntersecting) continue;
          const index = Number((item.target as HTMLElement).dataset.index);
          const regel = plat[index];
          if (regel) void laadVoorbeeld(regel);
          waarnemer.unobserve(item.target);
        }
      },
      { root: wortel, rootMargin: "120px 0px" },
    );
    wortel.querySelectorAll("[role='option']").forEach((el) => waarnemer.observe(el));
    return () => waarnemer.disconnect();
  });

  async function kies(familie: string) {
    setOpen(false);
    setZoek("");
    onthoudLettertype(familie);
    knop.current?.focus();
    try {
      await voorbereiden?.(familie);
      const r = await opdracht.execute({ family: familie } as never);
      if (!r.ok) fout(r.failure?.message ?? "Het lettertype kon niet worden gekozen.");
    } catch (e) {
      fout(e instanceof Error ? e.message : String(e));
    }
  }

  function openen() {
    const r = knop.current?.getBoundingClientRect();
    if (r) setPlek({ top: r.bottom + 4, left: Math.max(4, Math.min(r.left, window.innerWidth - 308)) });
    let tekst = "";
    try {
      tekst = voorbeeld?.() ?? "";
    } catch {
      // Geen selectie te lezen: het standaardvoorbeeld.
    }
    tekst = tekst.replace(/\s+/g, " ").trim().slice(0, 60);
    setVoorbeeldTekst(tekst || STANDAARD_VOORBEELD);
    setOpen(true);
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
  // Bij openen staat het huidige lettertype actief (in de eerste groep waarin het voorkomt).
  useEffect(() => {
    if (!open) return;
    const index = zoek ? 0 : plat.findIndex((r) => r.familie.toLowerCase() === huidig.toLowerCase());
    setActief(Math.max(0, index));
  }, [zoek, open]);
  useEffect(() => {
    lijst.current?.querySelector<HTMLElement>(`[data-index="${actief}"]`)?.scrollIntoView({ block: "nearest" });
  }, [actief, open]);

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
        title={huidigeRegel ? `${naam}: ${huidig}\n${vermelding(huidigeRegel)}` : naam}
        disabled={!opdracht.state.enabled}
        style={{ fontFamily: huidigeRegel ? voorbeeldFamilie(huidigeRegel) : undefined }}
        onClick={() => (open ? setOpen(false) : openen())}
      >
        <span>{huidig || naam}</span>
      </button>
      <ChevronDown size={12} />
      {open &&
        createPortal(
          <div
            className="lettertypekeuze-paneel"
            role="dialog"
            aria-label={naam}
            data-lettertypekeuze={id}
            data-thema={thema}
            style={{ top: plek.top, left: plek.left }}
          >
            <input
              ref={zoekveld}
              type="search"
              placeholder="Zoeken…"
              aria-label="Lettertype zoeken"
              role="combobox"
              aria-expanded="true"
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
                } else if (e.key === "PageDown" || e.key === "PageUp") {
                  e.preventDefault();
                  const stap = e.key === "PageDown" ? 10 : -10;
                  setActief((a) => Math.max(0, Math.min(plat.length - 1, a + stap)));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const keuze = plat[actief]?.familie ?? zoek.trim();
                  if (keuze) void kies(keuze);
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
                  <span className="lettertypekeuze-groep" aria-hidden="true">
                    {groep.naam}
                  </span>
                  <ul role="group" aria-label={groep.naam}>
                    {groep.regels.map((regel) => {
                      index++;
                      const mijn = index;
                      return (
                        <li
                          key={regel.familie}
                          id={`${id}-${mijn}`}
                          data-index={mijn}
                          role="option"
                          aria-selected={regel.familie.toLowerCase() === huidig.toLowerCase()}
                          className={mijn === actief ? "is-actief" : undefined}
                          title={vermelding(regel)}
                          onPointerEnter={() => setActief(mijn)}
                          onClick={() => void kies(regel.familie)}
                        >
                          <span className="lettertypekeuze-naam" style={{ fontFamily: voorbeeldFamilie(regel) }}>
                            {regel.familie}
                          </span>
                          {regel.vervanger && (
                            <span className="lettertypekeuze-vervanger">→ {regel.vervanger}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
              {!plat.length && <li className="lettertypekeuze-leeg">Geen lettertype gevonden; Enter kiest “{zoek}”.</li>}
            </ul>
            {actieveRegel && (
              <div className="lettertypekeuze-voorbeeld">
                <div className="lettertypekeuze-voorbeeldtekst" style={{ fontFamily: voorbeeldFamilie(actieveRegel) }}>
                  <span>{voorbeeldTekst}</span>
                </div>
                <div className="lettertypekeuze-stijlen" style={{ fontFamily: voorbeeldFamilie(actieveRegel) }} aria-hidden="true">
                  <b>Vet</b> <i>Cursief</i> <b><i>Vet cursief</i></b>
                </div>
                <p className="lettertypekeuze-licentie">
                  <strong>{actieveRegel.familie}</strong> · {vermelding(actieveRegel)}
                </p>
              </div>
            )}
            {kanToestemmingVragen() && (
              <button
                type="button"
                className="lettertypekeuze-toestemming"
                onClick={() => void laadSysteemLettertypen(true)}
              >
                Lettertypen van deze computer tonen…
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
