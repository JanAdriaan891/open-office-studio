import { useEffect, useRef } from "react";

/** Toetscombinatie in leesbare vorm, bijvoorbeeld "Ctrl+Shift+P" of "F5". */
export interface Sneltoets {
  toets: string;
  uitvoeren: () => void;
  /** Optioneel: alleen als de opdracht nu beschikbaar is. */
  beschikbaar?: () => boolean;
}

type Combinatie = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  toets: string;
};

export function ontleed(toets: string): Combinatie {
  const delen = toets.split("+").map((deel) => deel.trim());
  const laatste = delen.pop() ?? "";
  const mods = new Set(delen.map((deel) => deel.toLowerCase()));
  return {
    ctrl: mods.has("ctrl"),
    shift: mods.has("shift"),
    alt: mods.has("alt"),
    toets: laatste.toLowerCase(),
  };
}

/** Toetsnaam los van toetsenbordindeling en Shift: cijfers via `code`. */
function toetsVan(e: Pick<KeyboardEvent, "key" | "code">) {
  const cijfer = /^(Digit|Numpad)(\d)$/.exec(e.code);
  if (cijfer) return cijfer[2];
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter) return letter[1].toLowerCase();
  return e.key.toLowerCase();
}

export function past(
  toets: string,
  e: Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
  >,
) {
  const c = ontleed(toets);
  return (
    c.ctrl === (e.ctrlKey || e.metaKey) &&
    c.shift === e.shiftKey &&
    c.alt === e.altKey &&
    c.toets === toetsVan(e)
  );
}

/**
 * Sneltoetsen zoals in gangbare kantoorsuites, alleen actief als de focus in
 * de editor staat (of nergens) en niet in het bestandsmenu of een dialoog.
 * Registreer hier uitsluitend toetsen die de engine zelf niet afhandelt.
 */
export function useSneltoetsen(
  vlak: () => HTMLElement | null,
  toetsen: Sneltoets[],
) {
  const recent = useRef({ vlak, toetsen });
  recent.current = { vlak, toetsen };
  useEffect(() => {
    function toets(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat) return;
      const actief = document.activeElement;
      const doel = e.target instanceof Element ? e.target : actief;
      if (doel?.closest(".office-backstage, [role='dialog']")) return;
      const editor = recent.current.vlak();
      if (!editor) return;
      if (actief && actief !== document.body && !editor.contains(actief))
        return;
      const gevonden = recent.current.toetsen.find((s) => past(s.toets, e));
      if (!gevonden || gevonden.beschikbaar?.() === false) return;
      e.preventDefault();
      e.stopPropagation();
      gevonden.uitvoeren();
    }
    window.addEventListener("keydown", toets, { capture: true });
    return () =>
      window.removeEventListener("keydown", toets, { capture: true });
  }, []);
}
