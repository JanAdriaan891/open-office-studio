/**
 * Extra items bovenaan het rechtermuismenu, geleverd door een ander onderdeel
 * (bijvoorbeeld de spellingcontrole: suggesties bij een fout woord). Een bron
 * krijgt het punt van de rechtsklik en geeft meteen items (of null); komt er
 * later meer (suggesties uit een worker), dan roept hij `werkBij` aan.
 *
 *   useEffect(() => meldMenubronAan("spelling", ({ x, y }, werkBij) => …), []);
 */
import { useMemo, useState } from "react";

export interface MenubronItem {
  id: string;
  label: string;
  doe?: () => void;
  /** Vet, zoals spellingsuggesties in Word. */
  nadruk?: boolean;
  uit?: boolean;
  /** Een scheidingslijn vóór dit item. */
  scheiding?: boolean;
  /** Na deze actie de focus niet terug naar het document (een venster opent). */
  houdFocus?: boolean;
}

export type Menubron = (
  punt: { x: number; y: number },
  werkBij: (items: MenubronItem[] | null) => void,
) => MenubronItem[] | null;

const bronnen = new Map<string, Menubron>();

/** Meldt een bron aan; geeft een afmeldfunctie. */
export function meldMenubronAan(id: string, bron: Menubron): () => void {
  bronnen.set(id, bron);
  return () => {
    if (bronnen.get(id) === bron) bronnen.delete(id);
  };
}

/** De items van alle bronnen voor dit punt, per bron één sectie. */
export function useMenubronnen(punt: { x: number; y: number }): MenubronItem[][] {
  const [perBron, setPerBron] = useState<Record<string, MenubronItem[]>>(() => {
    const begin: Record<string, MenubronItem[]> = {};
    for (const [id, bron] of bronnen) {
      try {
        const items = bron(punt, (later) => setPerBron((oud) => ({ ...oud, [id]: later ?? [] })));
        if (items?.length) begin[id] = items;
      } catch {
        // Een kapotte bron mag het menu niet breken.
      }
    }
    return begin;
  });
  return useMemo(() => Object.values(perBron).filter((s) => s.length), [perBron]);
}
