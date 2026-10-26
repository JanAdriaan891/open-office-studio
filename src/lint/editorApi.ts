import { createContext, useContext } from "react";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";

/** Directe engine-API voor opdrachten die niet als lintopdracht bestaan. */
export interface EditorApis {
  tekst: () => DocxEditorRef | null;
  rekenblad: XlsxEditorApi | null;
  presentatie: PptxEditorApi | null;
}

export const EditorApi = createContext<EditorApis>({
  tekst: () => null,
  rekenblad: null,
  presentatie: null,
});

export const useEditorApi = () => useContext(EditorApi);
