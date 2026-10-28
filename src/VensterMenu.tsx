import { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import type { useTabbladen } from "./useTabbladen";
import { titel } from "./tabbladen";
import "./levenscyclus.css";

const tauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface TabInfo {
  id: number;
  titel: string;
  gewijzigd: boolean;
}
interface VensterInfo {
  label: string;
  hoofd: boolean;
  tabbladen: TabInfo[];
}

async function invoke<T>(opdracht: string, args?: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(opdracht, args);
}

let eigenLabel: string | null = null;
async function label() {
  if (eigenLabel) return eigenLabel;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return (eigenLabel = getCurrentWindow().label);
}

/** Groepeert de vensters voor het menu; het eigen venster heet "Dit venster". */
export function venstergroepen(lijst: VensterInfo[], eigen: string | null) {
  let nummer = 1;
  return lijst
    .filter((v) => v.tabbladen.length)
    .map((v) => ({
      ...v,
      eigen: v.label === eigen,
      naam:
        v.label === eigen
          ? "Dit venster"
          : v.hoofd
            ? "Hoofdvenster"
            : `Venster ${++nummer}`,
    }));
}

interface Opties {
  tabs: ReturnType<typeof useTabbladen>;
  activeer: (id: number) => void;
  /** Sluit alle tabbladen met een vraag per gewijzigd document; waar als alles dicht is. */
  sluitAlles: () => Promise<boolean>;
}

/**
 * Venstermenu (alle open documenten, ook in andere vensters) en het sluiten
 * van een venster met een vraag per gewijzigd document.
 */
export function useVenstermenu({ tabs, activeer, sluitAlles }: Opties) {
  const recent = useRef({ activeer, sluitAlles });
  recent.current = { activeer, sluitAlles };

  // Rust kent de tabbladen van elk venster, voor het menu in andere vensters.
  const lijst = tabs.toestand.tabbladen
    .map((t) => `${t.id}\u0000${titel(t)}\u0000${t.gewijzigd ? 1 : 0}`)
    .join("\u0001");
  useEffect(() => {
    if (!tauri) return;
    const tabbladen = tabs.toestandRef.current.tabbladen.map((t) => ({
      id: t.id,
      titel: titel(t),
      gewijzigd: t.gewijzigd,
    }));
    void invoke("meld_tabbladen", { tabbladen }).catch(() => undefined);
  }, [lijst]);

  useEffect(() => {
    if (!tauri) return;
    let actief = true;
    const stops: (() => void)[] = [];
    let sluitBezig = false;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const a = await listen<number>("office-activeer-tabblad", (e) =>
        recent.current.activeer(e.payload),
      );
      const b = await listen("office-sluitverzoek", async () => {
        await invoke("sluitverzoek_ontvangen").catch(() => undefined);
        if (sluitBezig) return;
        sluitBezig = true;
        try {
          if (await recent.current.sluitAlles())
            await invoke("sluit_venster").catch(() => undefined);
        } finally {
          sluitBezig = false;
        }
      });
      if (actief) stops.push(a, b);
      else (a(), b());
    });
    return () => {
      actief = false;
      stops.forEach((s) => s());
    };
  }, []);
}

/** Knop met een lijst van alle open documenten; kiezen activeert het tabblad. */
export function VensterMenu({
  tabs,
  activeer,
}: {
  tabs: ReturnType<typeof useTabbladen>;
  activeer: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [groepen, setGroepen] = useState<ReturnType<typeof venstergroepen>>(
    [],
  );
  const menu = useRef<HTMLDivElement>(null);
  const knop = useRef<HTMLButtonElement>(null);

  async function toon() {
    const eigen: VensterInfo = {
      label: "eigen",
      hoofd: true,
      tabbladen: tabs.toestandRef.current.tabbladen.map((t) => ({
        id: t.id,
        titel: titel(t),
        gewijzigd: t.gewijzigd,
      })),
    };
    let lijst = [eigen];
    let mijn = "eigen";
    if (tauri) {
      try {
        mijn = await label();
        const alle = await invoke<VensterInfo[]>("open_documenten");
        // Het eigen venster altijd actueel uit de webview zelf.
        lijst = alle.some((v) => v.label === mijn)
          ? alle.map((v) => (v.label === mijn ? { ...eigen, ...v, tabbladen: eigen.tabbladen } : v))
          : [{ ...eigen, label: mijn, hoofd: mijn === "main" }, ...alle];
      } catch {
        // Zonder overzicht alleen dit venster.
      }
    }
    setGroepen(venstergroepen(lijst, mijn));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const weg = (e: PointerEvent) => {
      if (
        !menu.current?.contains(e.target as Node) &&
        !knop.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    window.addEventListener("pointerdown", weg, true);
    return () => window.removeEventListener("pointerdown", weg, true);
  }, [open]);

  function kies(venster: string, eigen: boolean, id: number) {
    setOpen(false);
    if (eigen) activeer(id);
    else void invoke("activeer_tabblad", { venster, id }).catch(() => undefined);
  }

  const aantal = tabs.toestand.tabbladen.length;
  return (
    <div className="office-venstermenu">
      <button
        ref={knop}
        className="office-iconknop"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!aantal && !tauri}
        onClick={() => (open ? setOpen(false) : void toon())}
        title="Open documenten · Ctrl+Tab of Ctrl+F6 om te wisselen"
        aria-label="Open documenten"
      >
        <Layers size={16} />
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          className="office-venstermenu-lijst"
          onKeyDown={(e) => {
            const knoppen = [
              ...(menu.current?.querySelectorAll<HTMLButtonElement>(
                "button",
              ) ?? []),
            ];
            const i = knoppen.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              knop.current?.focus();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const stap = e.key === "ArrowDown" ? 1 : -1;
              knoppen[(i + stap + knoppen.length) % knoppen.length]?.focus();
            }
          }}
        >
          {!groepen.length && <p>Geen open documenten.</p>}
          {groepen.map((v) => (
            <div key={v.label} role="group" aria-label={v.naam}>
              <span className="office-venstermenu-kop">{v.naam}</span>
              {v.tabbladen.map((t) => (
                <button
                  key={t.id}
                  role="menuitem"
                  onClick={() => kies(v.label, v.eigen, t.id)}
                  aria-current={
                    v.eigen && tabs.toestand.actief === t.id ? "true" : undefined
                  }
                >
                  <span>{t.titel}</span>
                  {t.gewijzigd && (
                    <i title="Niet-opgeslagen wijzigingen" aria-label="gewijzigd" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
