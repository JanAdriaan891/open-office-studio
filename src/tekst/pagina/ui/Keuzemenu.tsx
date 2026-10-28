/**
 * Lintknop met een uitklapmenu (zoals Marges, Formaat of Paginanummer in
 * Word): pijltjestoetsen, Enter, Esc en klikken buiten het menu sluit.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { Actie } from "../../../Ribbon";

export type Menuregel =
  | {
      naam: string;
      uitleg?: string;
      icoon?: LucideIcon;
      voorbeeld?: ReactNode;
      actief?: boolean;
      uit?: boolean;
      sneltoets?: string;
      kies: () => void;
    }
  | { kop: string }
  | { scheiding: true };

export function Keuzemenu({
  naam,
  icoon,
  groot,
  uit,
  uitleg,
  regels,
  voet,
}: {
  naam: string;
  icoon: LucideIcon;
  groot?: boolean;
  uit?: boolean;
  uitleg?: string;
  regels: Menuregel[] | (() => Menuregel[]);
  /** Kleine tekst onderaan het menu (bijvoorbeeld over herladen). */
  voet?: string;
}) {
  const knop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div ref={knop} className="pagina-keuzemenu">
      <Actie
        naam={naam}
        icoon={icoon}
        groot={groot}
        disabled={uit}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={[naam, uitleg].filter(Boolean).join(" · ")}
        className="pagina-keuzeknop"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      />
      <ChevronDown className="pagina-keuzepijl" size={10} aria-hidden="true" />
      {open && (
        <Menu
          id={id}
          naam={naam}
          anker={knop.current}
          regels={typeof regels === "function" ? regels() : regels}
          voet={voet}
          sluit={(terug) => {
            setOpen(false);
            if (terug) knop.current?.querySelector<HTMLButtonElement>("button")?.focus();
          }}
        />
      )}
    </div>
  );
}

function Menu({
  id,
  naam,
  anker,
  regels,
  voet,
  sluit,
}: {
  id: string;
  naam: string;
  anker: HTMLElement | null;
  regels: Menuregel[];
  voet?: string;
  sluit: (focusTerug: boolean) => void;
}) {
  const paneel = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const r = anker?.getBoundingClientRect();
    const breedte = paneel.current?.offsetWidth ?? 240;
    const hoogte = paneel.current?.offsetHeight ?? 300;
    if (r)
      setPlek({
        left: Math.max(8, Math.min(r.left, window.innerWidth - breedte - 8)),
        top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - hoogte - 8)),
      });
    paneel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [anker]);
  useEffect(() => {
    const buiten = (e: PointerEvent) => {
      const doel = e.target as Node;
      if (!paneel.current?.contains(doel) && !anker?.contains(doel)) sluit(false);
    };
    const weg = () => sluit(false);
    document.addEventListener("pointerdown", buiten, true);
    window.addEventListener("blur", weg);
    window.addEventListener("resize", weg);
    return () => {
      document.removeEventListener("pointerdown", buiten, true);
      window.removeEventListener("blur", weg);
      window.removeEventListener("resize", weg);
    };
  }, [anker, sluit]);

  return createPortal(
    <div
      ref={paneel}
      id={id}
      className="pagina-menu"
      role="menu"
      aria-label={naam}
      style={{ left: plek.left, top: plek.top }}
      onKeyDown={(e) => {
        const knoppen = [...(paneel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const i = knoppen.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          sluit(true);
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          const n = knoppen.length;
          knoppen[(i + (e.key === "ArrowDown" ? 1 : -1) + n) % n]?.focus();
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          knoppen[e.key === "Home" ? 0 : knoppen.length - 1]?.focus();
        }
      }}
    >
      {regels.map((r, i) => {
        if ("kop" in r)
          return (
            <div key={i} className="pagina-menukop" role="presentation">
              {r.kop}
            </div>
          );
        if ("scheiding" in r) return <div key={i} className="pagina-menuscheiding" role="separator" />;
        const Icoon = r.icoon;
        return (
          <button
            key={i}
            type="button"
            role={r.actief === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={r.actief === undefined ? undefined : r.actief}
            className="pagina-menuregel"
            disabled={r.uit}
            title={r.sneltoets ? `${r.naam} · ${r.sneltoets}` : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              sluit(false);
              r.kies();
            }}
          >
            <span className="pagina-menuicoon" aria-hidden="true">
              {r.actief ? <Check size={14} /> : Icoon ? <Icoon size={16} strokeWidth={1.7} /> : null}
            </span>
            <span className="pagina-menutekst">
              <span className="pagina-menunaam">{r.naam}</span>
              {r.uitleg && <span className="pagina-menuuitleg">{r.uitleg}</span>}
            </span>
            {r.voorbeeld && <span className="pagina-menuvoorbeeld" aria-hidden="true">{r.voorbeeld}</span>}
            {r.sneltoets && <span className="pagina-menutoets">{r.sneltoets}</span>}
          </button>
        );
      })}
      {voet && <div className="pagina-menuvoet">{voet}</div>}
    </div>,
    document.body,
  );
}
