/**
 * Een gekozen aantal rijen of kolommen in één keer invoegen (#376).
 * Eén engine-op, dus één ongedaan-maakstap; formules en bereiken schuiven mee.
 */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { MAX_KOLOMMEN, MAX_RIJEN, type Bereik } from "../lint/rekenblad-logica";
import { leesSelectie, voerOpsUit, type RuweOp } from "../lint/rekenblad-opdrachten";

export type InvoegAs = "rij" | "kolom";
/** `voor`: boven of links van de selectie; `na`: eronder of rechts ervan. */
export type InvoegPlek = "voor" | "na";

export const maxInvoegen = (as: InvoegAs) => (as === "rij" ? MAX_RIJEN : MAX_KOLOMMEN) - 1;

/** Een heel aantal van 1 tot het maximum van het blad; anders null. */
export function leesAantal(tekst: string, as: InvoegAs): number | null {
  const schoon = tekst.trim();
  if (!/^\d{1,7}$/.test(schoon)) return null;
  const n = Number(schoon);
  return n >= 1 && n <= maxInvoegen(as) ? n : null;
}

/** De engine-op die `aantal` rijen of kolommen bij de selectie invoegt. */
export function invoegOp(blad: number, bereik: Bereik, as: InvoegAs, plek: InvoegPlek, aantal: number): RuweOp {
  const at =
    as === "rij"
      ? plek === "na" ? bereik.bottom + 1 : bereik.top
      : plek === "na" ? bereik.right + 1 : bereik.left;
  return { type: as === "rij" ? "insertRows" : "insertCols", sheet: blad, at, count: aantal };
}

export async function voegAantalIn(api: XlsxEditorApi, as: InvoegAs, plek: InvoegPlek, aantal: number) {
  const { blad, bereik } = leesSelectie(api);
  await voerOpsUit(api, [invoegOp(blad, bereik, as, plek, aantal)]);
}
