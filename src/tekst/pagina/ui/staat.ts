/**
 * Toestand die het herladen van de editor moet overleven: het lint wordt bij
 * herladen opnieuw gemount (het hangt in de editor), dus een taak voor na het
 * herladen en een melding voor de gebruiker staan buiten React.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Herladen } from "../../../lint/editorApi";

export type NaHerladen = (editor: DocxEditorRef) => void | Promise<void>;

const taken = new WeakMap<Herladen, { taak: NaHerladen; oud: DocxEditorRef | null }>();

/**
 * Een taak die het opnieuw gemounte lint uitvoert zodra het nieuwe document
 * is ingedeeld. `oud` is de editor van vóór het herladen: die telt niet.
 */
export function planNaHerladen(herlaad: Herladen, taak: NaHerladen, oud: DocxEditorRef | null) {
  taken.set(herlaad, { taak, oud });
}
export function neemTaak(herlaad: Herladen) {
  const taak = taken.get(herlaad);
  taken.delete(herlaad);
  return taak;
}

// ---------------------------------------------------------------------------
// Pakketbewerkingen na elkaar

let rij: Promise<void> = Promise.resolve();
/** Langer dan dit duurt een herlaadronde niet; daarna geeft de beurt zichzelf vrij. */
const MAX_BEURT = 30000;

/**
 * Een beurt voor een bewerking via de pakketroute. Een tweede bewerking die
 * start terwijl de eerste nog opslaat of herlaadt, wacht tot die klaar is en
 * werkt dan op het nieuwe document (anders gaat één van beide verloren).
 * Roep de teruggegeven functie aan als de bewerking klaar is of afbreekt.
 */
export function neemBeurt(): Promise<() => void> {
  let vrijgeven!: () => void;
  const klaar = new Promise<void>((r) => (vrijgeven = r));
  const vorige = rij;
  rij = vorige.then(() => klaar);
  return vorige.then(() => {
    const klok = setTimeout(vrijgeven, MAX_BEURT);
    return () => {
      clearTimeout(klok);
      vrijgeven();
    };
  });
}

// ---------------------------------------------------------------------------
// Meldingen (kort, onderaan in beeld)

export interface Melding {
  id: number;
  tekst: string;
  soort: "info" | "fout";
}
let melding: Melding | null = null;
let teller = 0;
let klok: ReturnType<typeof setTimeout> | null = null;
const luisteraars = new Set<() => void>();
const meld = () => luisteraars.forEach((l) => l());

export function toonMelding(tekst: string, soort: Melding["soort"] = "info", duur = 9000) {
  melding = { id: ++teller, tekst, soort };
  if (klok) clearTimeout(klok);
  klok = setTimeout(() => {
    melding = null;
    meld();
  }, duur);
  meld();
}
export function sluitMelding() {
  melding = null;
  meld();
}
export const volgMelding = (l: () => void) => {
  luisteraars.add(l);
  return () => luisteraars.delete(l);
};
export const leesMelding = () => melding;

// ---------------------------------------------------------------------------
// Eenmalige bevestiging dat ongedaan maken vervalt

const SLEUTEL = "open-tekst-pakketroute-bevestigd";
let bevestigdDezeSessie = false;
export function herladenBevestigd() {
  if (bevestigdDezeSessie) return true;
  try {
    return localStorage.getItem(SLEUTEL) === "1";
  } catch {
    return false;
  }
}
export function onthoudBevestiging(altijd: boolean) {
  bevestigdDezeSessie = true;
  if (!altijd) return;
  try {
    localStorage.setItem(SLEUTEL, "1");
  } catch {
    /* alleen gemak */
  }
}
