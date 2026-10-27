import { defineXlsxPlugin } from "@betteroffice/xlsx-react";

/**
 * Volgt welke grafiek in het rekenblad geselecteerd is. De engine geeft de
 * selectie alleen via zijn plugin-API; deze plugin leest en schrijft niets.
 */
export function maakGrafiekSelectie() {
  let huidige: string | null = null;
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
      zet(context.snapshot.selection?.chartId ?? null);
    },
    onEvent(_, event) {
      if (event.type === "selection-change") zet(event.selection?.chartId ?? null);
      else if (event.type === "load") zet(null);
    },
  });
  return {
    plugin,
    lees: () => huidige,
    abonneer(luisteraar: () => void) {
      luisteraars.add(luisteraar);
      return () => {
        luisteraars.delete(luisteraar);
      };
    },
  };
}
export type GrafiekSelectieBron = ReturnType<typeof maakGrafiekSelectie>;
