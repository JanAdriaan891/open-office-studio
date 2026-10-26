import { useEffect, type RefObject } from "react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { leesNederlands } from "./rekenbladinvoer";

const INVOERVELDEN =
  '[data-testid="xlsx-cell-editor"], [data-testid="xlsx-formula-input"]';
const POGINGEN = 10;

/**
 * Zet na Enter of Tab Nederlandse getallen, procenten, bedragen, datums en
 * tijden om. De kern legt de invoer eerst als tekst vast; daarna wordt de cel
 * alleen vervangen als die nog precies die tekst bevat.
 */
export function useNederlandseInvoer(
  host: RefObject<HTMLElement | null>,
  api: XlsxEditorApi | null,
) {
  useEffect(() => {
    const element = host.current;
    if (!element || !api) return;
    let gestopt = false;

    async function zetOm(
      sheetId: string,
      a1: string,
      tekst: string,
      invoer: string,
      notatie: string | undefined,
      poging = 0,
    ) {
      if (gestopt || !api) return;
      const target = { sheetId, range: { kind: "a1" as const, a1 } };
      const resultaat = await api.applyEdits({
        expectVersion: await api.version(),
        // De invoer van de gebruiker is al één ongedaan-maakstap.
        history: "none",
        steps: [
          {
            op: "setCellInputs",
            target,
            inputs: [[invoer]],
            expect: { cells: [[{ value: { kind: "text", value: tekst } }]] },
          },
        ],
      });
      if (!resultaat.ok) {
        // De kern kan de tekst nog niet hebben vastgelegd: kort opnieuw.
        if (
          poging < POGINGEN &&
          ["content-mismatch", "stale-version"].includes(resultaat.failure.code)
        )
          setTimeout(
            () => void zetOm(sheetId, a1, tekst, invoer, notatie, poging + 1),
            50,
          );
        return;
      }
      if (notatie)
        await api.applyEdits({
          expectVersion: await api.version(),
          history: "none",
          steps: [
            {
              op: "setNumberFormat",
              target,
              format: { type: "custom", pattern: notatie },
            },
          ],
        });
    }

    function toets(e: KeyboardEvent) {
      if (!api || (e.key !== "Enter" && e.key !== "Tab")) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const veld = e.target;
      if (
        !(
          veld instanceof HTMLInputElement ||
          veld instanceof HTMLTextAreaElement
        ) ||
        !veld.matches(INVOERVELDEN)
      )
        return;
      const tekst = veld.value.trim();
      const omgezet = leesNederlands(tekst);
      const a1 = element
        ?.querySelector<HTMLInputElement>('[data-testid="xlsx-name-box"]')
        ?.value.trim();
      if (!omgezet || !a1 || !/^\$?[A-Z]{1,3}\$?\d+$/i.test(a1)) return;
      const info = api.handle.sheetInfo();
      const sheetId = info.sheetIds[info.activeSheet];
      if (!sheetId) return;
      setTimeout(
        () =>
          void zetOm(sheetId, a1, tekst, omgezet.invoer, omgezet.notatie).catch(
            () => {
              // Lukt omzetten niet, dan blijft de invoer gewoon tekst.
            },
          ),
      );
    }
    element.addEventListener("keydown", toets, { capture: true });
    return () => {
      gestopt = true;
      element.removeEventListener("keydown", toets, { capture: true });
    };
  }, [host, api]);
}
