import { useContext, useEffect, useRef } from "react";
import { RibbonFout, type GebondenOpdracht } from "./Ribbon";
import { useEditorZichtbaar } from "./lint/editorApi";
import {
  ankerScroll,
  bewaarZoom,
  leesZoom,
  toetsZoom,
  wielZoom,
} from "./documentzoom";

export interface ZoomKoppeling {
  /** Per document onthouden; null als het document geen vaste identiteit heeft. */
  sleutel: string | null;
  melden: (zoom: number | null) => void;
}

/**
 * Ctrl + scrollwiel, touchpadknijpen en Ctrl + 0/=/− zoomen het document in
 * plaats van de hele pagina. Alleen boven het documentvlak wordt het wiel
 * afgevangen; de rest van de interface houdt het browsergedrag.
 */
export function useDocumentZoom({
  opdracht,
  vlak,
  bereik,
  koppeling,
  huidig,
  standaard,
}: {
  opdracht: GebondenOpdracht;
  /** Het scrollende documentvlak. */
  vlak: () => HTMLElement | null;
  /** Elementen buiten het scrollvlak die ook bij het document horen, zoals rijkoppen. */
  bereik?: string;
  koppeling?: ZoomKoppeling;
  /** Werkelijke schaal, ook als de editor een stand als ‘passend’ gebruikt. */
  huidig?: () => number | null;
  /** Begininstelling als er voor dit document niets onthouden is. */
  standaard?: unknown;
}) {
  const fout = useContext(RibbonFout);
  const zichtbaar = useEditorZichtbaar();
  const recent = useRef({ opdracht, koppeling, huidig, fout, vlak, zichtbaar });
  recent.current = { opdracht, koppeling, huidig, fout, vlak, zichtbaar };
  const doel = useRef<number | null>(null);
  const anker = useRef<{ x: number; y: number; oud: number } | null>(null);
  const frame = useRef(0);
  const hersteld = useRef(false);

  function schaal() {
    const { opdracht, huidig } = recent.current;
    const waarde = opdracht.state.value;
    if (typeof waarde === "number") return waarde;
    return huidig?.() ?? 1;
  }

  function voerUit(zoom: number, onthouden: boolean) {
    const { opdracht, koppeling, fout } = recent.current;
    return opdracht
      .execute({ scale: zoom } as never)
      .then((resultaat) => {
        if (!resultaat.ok)
          fout(resultaat.failure?.message ?? "Zoomen is mislukt.");
        else {
          // Niet elke editor meldt de nieuwe waarde direct via zijn opdrachtstatus.
          koppeling?.melden(zoom);
          if (onthouden && koppeling?.sleutel)
            bewaarZoom(koppeling.sleutel, zoom);
        }
        return resultaat.ok;
      })
      .catch((error) => {
        fout(error instanceof Error ? error.message : String(error));
        return false;
      });
  }

  function zoomNaar(
    zoom: number,
    scroller: HTMLElement | null,
    x?: number,
    y?: number,
  ) {
    if (!anker.current && scroller) {
      const rand = scroller.getBoundingClientRect();
      anker.current = {
        x: (x ?? rand.left + rand.width / 2) - rand.left,
        y: (y ?? rand.top + rand.height / 2) - rand.top,
        oud: schaal(),
      };
    }
    doel.current = zoom;
    if (frame.current) return;
    // Touchpads leveren tientallen gebeurtenissen per seconde: één opdracht per frame.
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const nieuw = doel.current;
      const vast = anker.current;
      doel.current = null;
      anker.current = null;
      if (nieuw === null) return;
      void voerUit(nieuw, true).then((gelukt) => {
        if (!gelukt || !vast || !scroller) return;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            scroller.scrollLeft = ankerScroll(
              scroller.scrollLeft,
              vast.x,
              vast.oud,
              nieuw,
            );
            scroller.scrollTop = ankerScroll(
              scroller.scrollTop,
              vast.y,
              vast.oud,
              nieuw,
            );
          }),
        );
      });
    });
  }

  useEffect(() => {
    function wiel(e: WheelEvent) {
      if (!recent.current.zichtbaar) return;
      if (!(e.ctrlKey || e.metaKey) || !(e.target instanceof Element)) return;
      const scroller = recent.current.vlak();
      if (
        !scroller ||
        !(scroller.contains(e.target) || (bereik && e.target.closest(bereik)))
      )
        return;
      e.preventDefault();
      if (!recent.current.opdracht.state.enabled) return;
      zoomNaar(
        wielZoom(doel.current ?? schaal(), e),
        scroller,
        e.clientX,
        e.clientY,
      );
    }
    function toets(e: KeyboardEvent) {
      if (!recent.current.zichtbaar) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (
        e.target instanceof Element &&
        e.target.closest(".office-backstage, [role='dialog'], dialog")
      )
        return;
      const zoom = toetsZoom(doel.current ?? schaal(), e);
      if (zoom === null) return;
      e.preventDefault();
      if (!recent.current.opdracht.state.enabled) return;
      zoomNaar(zoom, recent.current.vlak());
    }
    // Zonder passive: false negeert de browser preventDefault() bij het wiel.
    window.addEventListener("wheel", wiel, { passive: false, capture: true });
    window.addEventListener("keydown", toets, { capture: true });
    return () => {
      window.removeEventListener("wheel", wiel, { capture: true });
      window.removeEventListener("keydown", toets, { capture: true });
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [bereik]);

  useEffect(() => {
    if (hersteld.current || !opdracht.state.enabled) return;
    hersteld.current = true;
    const sleutel = recent.current.koppeling?.sleutel;
    const onthouden = sleutel ? leesZoom(sleutel) : null;
    if (onthouden !== null) void voerUit(onthouden, false);
    else if (standaard !== undefined)
      void recent.current.opdracht
        .execute(standaard as never)
        .then((resultaat) => {
          if (!resultaat.ok)
            recent.current.fout(
              resultaat.failure?.message ?? "Zoomen is mislukt.",
            );
        })
        .catch((error) =>
          recent.current.fout(
            error instanceof Error ? error.message : String(error),
          ),
        );
  }, [opdracht.state.enabled]);

  useEffect(() => {
    // ‘Passend’ is pas na de volgende weergave in pixels om te rekenen.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(
        () =>
          recent.current.zichtbaar &&
          recent.current.koppeling?.melden(
            recent.current.opdracht.state.enabled ? schaal() : null,
          ),
      );
    });
    return () => cancelAnimationFrame(id);
  }, [opdracht.state.value, opdracht.state.enabled, zichtbaar]);

  useEffect(
    () => () => {
      if (recent.current.zichtbaar) recent.current.koppeling?.melden(null);
    },
    [],
  );
}
