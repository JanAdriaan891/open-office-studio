import { useMemo, useRef, useState } from "react";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { HerlaadDoel, Herladen } from "../../lint/editorApi";
import { maakGrafiekSelectie } from "./xlsxSelectie";

/**
 * Laat een editor zijn document vervangen door nieuwe bytes: de editor wordt
 * met een nieuwe sleutel opnieuw gemount. Daarna gaat hij naar het doel (blad,
 * cel, dia of alinea) en wordt het document als gewijzigd gemeld.
 */
export function useHerladen({
  bytes,
  serialiseer,
  gewijzigd,
  voorVervangen,
}: {
  bytes: Uint8Array;
  serialiseer: () => Promise<Uint8Array>;
  gewijzigd: () => void;
  voorVervangen?: () => void;
}) {
  const [vervanging, setVervanging] = useState<{
    bron: Uint8Array;
    bytes: Uint8Array;
    sleutel: number;
    doel?: HerlaadDoel;
  } | null>(null);
  const recent = useRef({ serialiseer, gewijzigd, voorVervangen });
  recent.current = { serialiseer, gewijzigd, voorVervangen };
  // Een ander document van buitenaf heft de vervanging op.
  const actief = vervanging && vervanging.bron === bytes ? vervanging : null;
  const grafiekSelectie = useMemo(maakGrafiekSelectie, []);
  const plugins = useMemo(() => [grafiekSelectie.plugin], [grafiekSelectie]);
  const api = useMemo<Herladen>(
    () => ({
      bytes: () => recent.current.serialiseer(),
      vervang(nieuw, doel) {
        // Eerst de oude engine-API overal loslaten (eigen weergave), pas daarna
        // de editor vervangen: zo leest niemand meer een opgeruimde handle.
        recent.current.voorVervangen?.();
        setTimeout(() => {
          setVervanging((oud) => ({
            bron: bytes,
            bytes: nieuw,
            sleutel: (oud?.sleutel ?? 0) + 1,
            doel,
          }));
          recent.current.gewijzigd();
        }, 0);
      },
    }),
    [bytes],
  );
  const doel = actief?.doel;
  return {
    bytes: actief?.bytes ?? bytes,
    sleutel: actief?.sleutel ?? 0,
    doel,
    api,
    grafiekSelectie,
    plugins,
    /** Na het openen van een rekenblad: naar het blad en de cel van het doel. */
    naXlsx(editor: XlsxEditorApi) {
      if (!doel || doel.blad === undefined) return;
      const cel = doel.cel ?? { row: 0, col: 0 };
      // Na de eerste weergave, zodat de editor het blad echt toont.
      requestAnimationFrame(() => {
        try {
          if (!editor.selectCells(doel.blad!, { anchor: cel, focus: cel }))
            editor.handle.setActiveSheet(doel.blad!);
        } catch {
          // Navigeren is een gemak; mislukken mag het openen niet hinderen.
        }
      });
    },
    /** Na de eerste getekende pagina van een tekstdocument: naar de alinea. */
    naDocx(editor: DocxEditorRef | null) {
      if (!editor || !doel?.paraId) return;
      const paraId = doel.paraId;
      const probeer = (n: number) => {
        if (editor.scrollToParaId(paraId) || n <= 0) return;
        setTimeout(() => probeer(n - 1), 250);
      };
      void editor
        .whenLayoutComplete({ timeoutMs: 20000 })
        .catch(() => 0)
        .then(() => probeer(8));
    },
    /** 1-gebaseerde dia voor `initialSlide`. */
    dia: doel?.dia !== undefined ? doel.dia + 1 : undefined,
  };
}
