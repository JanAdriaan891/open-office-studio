import { useCallback, useEffect, useRef, useState } from "react";
import { DocxEditor, type DocxEditorRef } from "@betteroffice/docx-react";
import { configureDefaultFonts } from "@betteroffice/docx/layout";
import { XlsxEditor, type XlsxEditorApi } from "@betteroffice/xlsx-react";
import { PptxEditor, type PptxEditorApi } from "@betteroffice/pptx-react";
import type { PptxFontFace } from "@betteroffice/pptx";
import * as fonts from "@betteroffice/fonts";
import "@betteroffice/docx-react/styles.css";
import { WriterRibbon, CalcRibbon, PresentatieRibbon } from "./editor-ribbons";
import { RibbonFout } from "./Ribbon";
import { writerNl, calcNl, diaNl } from "./nederlands";
import { CalcKoppen } from "./CalcKoppen";
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
  bestandsmenu: () => void;
  inactief: boolean;
}
export default function OfficeEditor(props: EditorProps) {
  const docx = useRef<DocxEditorRef>(null);
  const exporteren = useRef(false);
  const [fontFaces, setFontFaces] = useState<PptxFontFace[]>([]);
  const [liniaal, setLiniaal] = useState(true);
  const [navigatie, setNavigatie] = useState(false);
  const [documentGereed, setDocumentGereed] = useState(false);
  const calcHost = useRef<HTMLDivElement>(null);
  const [calcApi, setCalcApi] = useState<XlsxEditorApi | null>(null);
  const recent = useRef(props);
  recent.current = props;
  useEffect(() => {
    if (props.soort !== "docx" || !documentGereed) return;
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
  }, [documentGereed]);
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
  const gereedXlsx = useCallback(
    (api: XlsxEditorApi) => {
      setCalcApi(api);
      props.registreer(async () => {
        await api.version();
        return api.save();
      });
      return () => {
        setCalcApi(null);
        props.registreer(null);
      };
    },
    [props.registreer],
  );
  const gereedPptx = useCallback(
    (api: PptxEditorApi) => {
      props.registreer(async () => {
        await api.flushPendingInput();
        return api.save();
      });
    },
    [props.registreer],
  );
  if (props.soort === "docx")
    return (
      <RibbonFout.Provider value={(bericht) => props.fout(new Error(bericht))}>
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
          onFirstPagePainted={() => setDocumentGereed(true)}
          loadingIndicator={<p className="office-loading">Document laden…</p>}
          showRuler={liniaal}
          showOutline={navigatie}
          showOutlineButton={false}
          colorMode="light"
          i18n={writerNl}
          className="office-writer"
          readOnly={props.inactief}
          toolbar={
            <WriterRibbon
              bestand={props.bestandsmenu}
              liniaal={liniaal}
              navigatie={navigatie}
              wijzigLiniaal={() => setLiniaal(!liniaal)}
              wijzigNavigatie={() => setNavigatie(!navigatie)}
            />
          }
        />
      </RibbonFout.Provider>
    );
  if (props.soort === "xlsx")
    return (
      <RibbonFout.Provider value={(bericht) => props.fout(new Error(bericht))}>
        <div className="office-calc-host" ref={calcHost}>
          <XlsxEditor
            file={props.bytes}
            fileName={props.naam}
            onReady={gereedXlsx}
            onChange={props.gewijzigd}
            onSave={props.opgeslagen}
            i18n={calcNl}
            className="office-calc"
            readOnly={props.inactief}
            toolbar={<CalcRibbon bestand={props.bestandsmenu} />}
          />
          <CalcKoppen host={calcHost} api={calcApi} />
        </div>
      </RibbonFout.Provider>
    );
  if (!fontFaces.length) return <p role="status">Lettertypen laden…</p>;
  return (
    <RibbonFout.Provider value={(bericht) => props.fout(new Error(bericht))}>
      <PptxEditor
        file={props.bytes}
        fileName={props.naam}
        fonts={fontFaces}
        onReady={gereedPptx}
        onChange={props.gewijzigd}
        onError={props.fout}
        onSave={props.opgeslagen}
        i18n={diaNl}
        className="office-presentatie"
        readOnly={props.inactief}
        toolbar={<PresentatieRibbon bestand={props.bestandsmenu} />}
      />
    </RibbonFout.Provider>
  );
}
