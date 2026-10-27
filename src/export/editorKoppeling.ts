import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { Soort } from "../editors";
import { zichtbaarElement } from "../lint/editorApi";
import { registreerKoppeling, type EditorKoppeling } from "./koppeling";
import { drukDiasAf } from "./afdrukken";

/** 0-gebaseerde index van de dia die het diapaneel als huidige toont. */
function huidigeDia() {
  const knoppen = [
    ...(zichtbaarElement<HTMLElement>(
      ".office-presentatie",
    )?.querySelectorAll<HTMLElement>("aside > button") ?? []),
  ];
  return Math.max(
    0,
    knoppen.findIndex((knop) => knop.getAttribute("aria-current") === "page"),
  );
}

async function diaPng(api: PptxEditorApi, index: number, schaal = 2) {
  const { slideToPng, decodePresentationImage } = await import(
    "@betteroffice/pptx"
  );
  await api.flushPendingInput();
  const cache = new Map<string, Promise<CanvasImageSource | null>>();
  const blob = await slideToPng(api.handle.layoutSlide(index), {
    scale: schaal,
    resolveImage: (id) => {
      if (!cache.has(id)) {
        const bytes = api.handle.mediaBytes(id);
        cache.set(
          id,
          bytes
            ? decodePresentationImage(
                bytes,
                "Afbeelding kon niet worden gelezen.",
              )
            : Promise.resolve(null),
        );
      }
      return cache.get(id)!;
    },
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Koppelt de live editor aan Opslaan als; geeft de ontkoppelfunctie terug. */
export function koppelEditor(
  soort: Soort,
  apis: {
    tekst: DocxEditorRef | null;
    rekenblad: XlsxEditorApi | null;
    presentatie: PptxEditorApi | null;
  },
) {
  const koppeling: EditorKoppeling = { soort };
  if (soort === "docx" && apis.tekst) {
    const ref = apis.tekst;
    koppeling.afdrukken = () => ref.print();
  }
  if (soort === "xlsx" && apis.rekenblad) {
    const api = apis.rekenblad;
    koppeling.bladen = () => {
      const info = api.handle.sheetInfo();
      return { namen: info.sheetNames, actief: info.activeSheet };
    };
    koppeling.afdrukken = async () => {
      const resultaat = await api.commands.execute("print", null);
      if (!resultaat.ok) throw new Error(resultaat.failure.message);
    };
  }
  if (soort === "pptx" && apis.presentatie) {
    const api = apis.presentatie;
    koppeling.dias = () => ({
      aantal: api.handle.snapshot().slides.length,
      huidig: huidigeDia(),
    });
    koppeling.diaPng = (index, schaal) => diaPng(api, index, schaal);
    koppeling.afdrukken = async () => {
      const aantal = api.handle.snapshot().slides.length;
      const pngs: Uint8Array[] = [];
      for (let index = 0; index < aantal; index++)
        pngs.push(await diaPng(api, index, 2));
      await drukDiasAf(pngs);
    };
  }
  return registreerKoppeling(koppeling);
}
