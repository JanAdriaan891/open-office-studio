/**
 * De spellingitems van het rechtermuismenu, los van de menuweergave.
 *
 * Zolang er geen algemeen rechtermuismenu is, toont de spellingcontrole een
 * eigen menu (SpellingMenu.tsx) als je rechtsklikt op een onderstreept woord.
 * Komt het algemene menu (pakket W3, registry `src/tekst/menu/opdrachten.ts`)
 * binnen, dan koppel je het zo:
 *
 *   import { koppelSpellingMenu } from "../../spelling/tekst/menu";
 *   koppelSpellingMenu((bron) => registreerMenubron("spelling", bron));
 *
 * `bron(x, y)` geeft dan de items voor het punt onder de muis (of null als
 * daar geen fout staat); het eigen menu zet zichzelf uit zolang er een
 * koppeling is. De suggesties komen asynchroon (worker), vandaar de promise.
 */
import { TALEN, type Taal } from "../talen";
import type { SpellingSessie } from "./sessie";

export interface SpellingMenuItem {
  id: string;
  label: string;
  uitvoeren?: () => void;
  /** Suggesties vet, zoals in Word. */
  nadruk?: boolean;
  uitgeschakeld?: boolean;
  /** Een scheidingslijn vóór dit item. */
  scheiding?: boolean;
  /** Een keuze die nu actief is (taal). */
  gekozen?: boolean;
}

export type SpellingMenuBron = (x: number, y: number) => Promise<SpellingMenuItem[] | null>;

/** Sessies van de geopende documenten; het menu kiest de zichtbare. */
const sessies = new Set<{ sessie: SpellingSessie; zichtbaar: () => boolean }>();
let externeKoppelingen = 0;

export function registreerSessie(sessie: SpellingSessie, zichtbaar: () => boolean) {
  const item = { sessie, zichtbaar };
  sessies.add(item);
  return () => {
    sessies.delete(item);
  };
}

/** Of een ander (algemeen) rechtermuismenu de spellingitems toont. */
export const heeftExternMenu = () => externeKoppelingen > 0;

/** De items voor een fout; `suggesties` null = nog bezig. */
export function itemsVoorFout(
  sessie: SpellingSessie,
  doel: NonNullable<ReturnType<SpellingSessie["foutOp"]>>,
  suggesties: string[] | null,
  sluit: () => void = () => {},
): SpellingMenuItem[] {
  const { alinea, fout } = doel;
  const items: SpellingMenuItem[] = [];
  if (suggesties === null) items.push({ id: "spelling-laden", label: "Suggesties zoeken…", uitgeschakeld: true });
  else if (!suggesties.length) items.push({ id: "spelling-geen", label: "(geen suggesties)", uitgeschakeld: true });
  else
    suggesties.forEach((s, i) =>
      items.push({
        id: `spelling-suggestie-${i}`,
        label: s,
        nadruk: true,
        uitvoeren: () => {
          sluit();
          void sessie.vervang([doel], s).then(() => sessie.editor()?.getEditorRef()?.focus());
        },
      }),
    );
  items.push(
    {
      id: "spelling-alles-negeren",
      label: "Alles negeren",
      scheiding: true,
      uitvoeren: () => {
        sluit();
        sessie.negeerAlles(fout.tekst);
      },
    },
    {
      id: "spelling-toevoegen",
      label: "Toevoegen aan woordenlijst",
      uitvoeren: () => {
        sluit();
        sessie.voegToe(fout.tekst);
      },
    },
  );
  const talen: Taal[] = [...TALEN.map((t) => t.id), "geen"];
  talen.forEach((taal, i) =>
    items.push({
      id: `spelling-taal-${taal}`,
      label: taal === "geen" ? "Niet controleren" : (TALEN.find((t) => t.id === taal)?.naam ?? taal),
      scheiding: i === 0,
      gekozen: alinea.taal === taal,
      uitvoeren: () => {
        sluit();
        sessie.kiesAlineaTaal(alinea.paraId, taal);
      },
    }),
  );
  items.push({
    id: "spelling-venster",
    label: "Spelling en grammatica… (F7)",
    scheiding: true,
    uitvoeren: () => {
      sluit();
      sessie.vensterOpen = true;
      sessie.meld();
    },
  });
  return items;
}

/** De bron voor een algemeen rechtermuismenu (zie de uitleg bovenaan). */
export const spellingMenuBron: SpellingMenuBron = async (x, y) => {
  for (const { sessie, zichtbaar } of sessies) {
    if (!zichtbaar()) continue;
    const doel = sessie.foutOnderPunt(x, y);
    if (!doel) return null;
    let suggesties: string[] = [];
    try {
      suggesties = await sessie.controleur().suggesties(doel.fout.tekst, doel.fout.taal, 5);
    } catch {
      // Zonder suggesties blijven de andere items bruikbaar.
    }
    return itemsVoorFout(sessie, doel, suggesties);
  }
  return null;
};

/**
 * Koppelt de spellingitems aan een algemeen rechtermuismenu. `registreer`
 * krijgt de bron en geeft een functie om de koppeling weer op te heffen.
 */
export function koppelSpellingMenu(registreer: (bron: SpellingMenuBron) => () => void): () => void {
  externeKoppelingen++;
  const los = registreer(spellingMenuBron);
  let actief = true;
  return () => {
    if (!actief) return;
    actief = false;
    externeKoppelingen--;
    los();
  };
}
