import { defineXlsxPlugin, type XlsxPluginSelection } from "@betteroffice/xlsx-react";

/** Het geselecteerde celbereik (0-gebaseerd) op een blad, zoals de engine het meldt. */
export interface CelSelectie {
  blad: number;
  bereik: { top: number; left: number; bottom: number; right: number };
  focus: { row: number; col: number };
}

/**
 * Volgt welke grafiek en welke cellen in het rekenblad geselecteerd zijn. De
 * engine geeft de selectie alleen via zijn plugin-API; deze plugin leest en
 * schrijft niets. De celselectie komt zo rechtstreeks van de engine, ook na
 * navigeren via het naamvak (bijvoorbeeld `B6:D14` + Enter).
 */
export function maakGrafiekSelectie() {
  let huidige: string | null = null;
  let cellen: CelSelectie | null = null;
  const zetCellen = (s: XlsxPluginSelection) => {
    const c = s?.cells;
    cellen =
      s && c
        ? {
            blad: s.sheetIndex,
            bereik: {
              top: Math.min(c.anchor.row, c.focus.row),
              left: Math.min(c.anchor.col, c.focus.col),
              bottom: Math.max(c.anchor.row, c.focus.row),
              right: Math.max(c.anchor.col, c.focus.col),
            },
            focus: { row: c.focus.row, col: c.focus.col },
          }
        : null;
  };
  const luisteraars = new Set<() => void>();
  const zet = (id: string | null) => {
    if (id === huidige) return;
    huidige = id;
    for (const l of luisteraars) l();
  };
  const plugin = defineXlsxPlugin<null>({
    id: "openaec-grafiekselectie",
    createState: () => null,
    initialize(context) {
      zetCellen(context.snapshot.selection);
      zet(context.snapshot.selection?.chartId ?? null);
    },
    onEvent(_, event) {
      if (event.type === "selection-change") {
        zetCellen(event.selection);
        zet(event.selection?.chartId ?? null);
      } else if (event.type === "load") {
        cellen = null;
        zet(null);
      }
    },
  });
  return {
    plugin,
    lees: () => huidige,
    /** De laatst gemelde celselectie, of null. */
    cellen: () => cellen,
    abonneer(luisteraar: () => void) {
      luisteraars.add(luisteraar);
      return () => {
        luisteraars.delete(luisteraar);
      };
    },
  };
}
export type GrafiekSelectieBron = ReturnType<typeof maakGrafiekSelectie>;
