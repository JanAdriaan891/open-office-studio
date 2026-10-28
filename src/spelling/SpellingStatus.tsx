/**
 * Knoppen in de statusbalk: de taal van het document (klik = kiezen) en het
 * aantal onbekende woorden (klik = deelvenster Spelling en grammatica, F7).
 */
import { BookCheck, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSpellingStatus } from "./status";
import { TALEN, taalKort, taalNaam, type Taal } from "./talen";
import "./spelling-status.css";

export function SpellingStatusKnoppen() {
  const status = useSpellingStatus();
  const [open, setOpen] = useState(false);
  const houder = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const buiten = (e: Event) => {
      if (!houder.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", buiten, true);
    return () => window.removeEventListener("pointerdown", buiten, true);
  }, [open]);
  if (!status) return null;
  const aantal = status.probleem
    ? "Spelling niet beschikbaar"
    : status.fouten === null
      ? "Spelling controleren…"
      : status.fouten === 0
        ? "Geen spelfouten"
        : `${status.fouten} ${status.fouten === 1 ? "spelfout" : "spelfouten"}`;
  const kies = (taal: Taal | null) => {
    status.kiesTaal(taal);
    setOpen(false);
  };
  return (
    <span className="statusbalk-spelling" ref={houder}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Taal van het document: ${taalNaam(status.taal)}${status.automatisch ? " (uit het document)" : ""}`}
      >
        <Languages size={12} aria-hidden="true" />
        {taalKort(status.taal)}
      </button>
      <button
        type="button"
        onClick={status.openVenster}
        title={status.probleem ?? "Spelling en grammatica · F7"}
        data-fouten={status.fouten ?? undefined}
      >
        <BookCheck size={12} aria-hidden="true" />
        {aantal}
      </button>
      {open && (
        <span className="statusbalk-spelling-menu" role="menu" aria-label="Taal van het document">
          {TALEN.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={!status.automatisch && status.taal === t.id}
              onClick={() => kies(t.id)}
            >
              {t.naam}
            </button>
          ))}
          <button type="button" role="menuitemradio" aria-checked={!status.automatisch && status.taal === "geen"} onClick={() => kies("geen")}>
            Niet controleren
          </button>
          <button type="button" role="menuitemradio" aria-checked={status.automatisch} onClick={() => kies(null)}>
            Uit het document (w:lang)
          </button>
        </span>
      )}
    </span>
  );
}
