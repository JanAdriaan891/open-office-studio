import { useEffect, useRef, useState } from "react";
import { DocxEditor, type DocxEditorRef } from "@betteroffice/docx-react";
import { configureDefaultFonts } from "@betteroffice/docx/layout";
import { XlsxEditor, type XlsxEditorApi } from "@betteroffice/xlsx-react";
import { PptxEditor, type PptxEditorApi } from "@betteroffice/pptx-react";
import type { PptxFontFace } from "@betteroffice/pptx";
import * as fonts from "@betteroffice/fonts";
import "@betteroffice/docx-react/styles.css";
configureDefaultFonts({
  fonts,
  baseUrl: new URL("/fonts/", location.href).href,
});
export type Soort = "docx" | "xlsx" | "pptx";
export interface EditorProps {
  soort: Soort;
  bytes: Uint8Array;
  naam: string;
  gewijzigd: () => void;
  fout: (f: Error) => void;
  registreer: (opslaan: (() => Promise<Uint8Array>) | null) => void;
  opgeslagen: (bytes: Uint8Array) => void;
}
export default function OfficeEditor(props: EditorProps) {
  const docx = useRef<DocxEditorRef>(null);
  const exporteren = useRef(false);
  const [fontFaces, setFontFaces] = useState<PptxFontFace[]>([]);
  const recent = useRef(props);
  recent.current = props;
  useEffect(() => {
    if (props.soort !== "docx") return;
    props.registreer(async () => {
      if (!docx.current?.getDocument())
        throw new Error("Het document is nog niet gereed.");
      exporteren.current = true;
      try {
        const bytes = await docx.current.save();
        if (!bytes) throw new Error("Het document kon niet worden opgeslagen.");
        return new Uint8Array(bytes);
      } finally {
        exporteren.current = false;
      }
    });
    return () => props.registreer(null);
  }, []);
  useEffect(() => {
    if (props.soort !== "pptx") return;
    let actief = true;
    Promise.all(
      fonts.BUNDLED_FONTS.filter((f) => f.family === "Carlito").map(
        async (f) => ({
          family: "Calibri",
          bold: f.weight === 700,
          italic: f.style === "italic",
          bytes: new Uint8Array(
            await fonts.loadBundledFontBytes(f, {
              baseUrl: new URL("/fonts/", location.href).href,
            }),
          ),
        }),
      ),
    )
      .then((f) => {
        if (actief) setFontFaces(f);
      })
      .catch((e) => {
        if (actief) recent.current.fout(e);
      });
    return () => {
      actief = false;
    };
  }, []);
  function gereedXlsx(api: XlsxEditorApi) {
    props.registreer(async () => {
      await api.version();
      return api.save();
    });
    return () => props.registreer(null);
  }
  function gereedPptx(api: PptxEditorApi) {
    props.registreer(async () => {
      await api.flushPendingInput();
      return api.save();
    });
  }
  if (props.soort === "docx")
    return (
      <DocxEditor
        ref={docx}
        documentBuffer={props.bytes}
        showFileOpen={false}
        showHelpMenu={false}
        downloadOnSave={false}
        onSave={(b) => {
          if (!exporteren.current) props.opgeslagen(new Uint8Array(b));
        }}
        onChange={props.gewijzigd}
        onError={props.fout}
        rulerUnit="cm"
      />
    );
  if (props.soort === "xlsx")
    return (
      <XlsxEditor
        file={props.bytes}
        fileName={props.naam}
        onReady={gereedXlsx}
        onChange={props.gewijzigd}
        onSave={props.opgeslagen}
      />
    );
  if (!fontFaces.length) return <p role="status">Lettertypen laden…</p>;
  return (
    <PptxEditor
      file={props.bytes}
      fileName={props.naam}
      fonts={fontFaces}
      onReady={gereedPptx}
      onChange={props.gewijzigd}
      onError={props.fout}
      onSave={props.opgeslagen}
    />
  );
}
