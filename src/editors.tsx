import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocxEditor, type DocxEditorRef } from "@betteroffice/docx-react";
import { configureDefaultFonts } from "@betteroffice/docx/layout";
import { XlsxEditor, type XlsxEditorApi } from "@betteroffice/xlsx-react";
import { PptxEditor, type PptxEditorApi } from "@betteroffice/pptx-react";
import type { PptxFontFace } from "@betteroffice/pptx";
import * as fonts from "@betteroffice/fonts";
import "@betteroffice/docx-react/styles.css";
import {
  TekstRibbon,
  RekenbladRibbon,
  PresentatieRibbon,
} from "./editor-ribbons";
import { RibbonFout } from "./Ribbon";
import { tekstNl, rekenbladNl, diaNl } from "./nederlands";
import { RekenbladKoppen } from "./RekenbladKoppen";
import { EditorApi } from "./lint/editorApi";
import { useNederlandseInvoer } from "./useNederlandseInvoer";
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
  opslaan: () => void;
  bestandsmenu: () => void;
  inactief: boolean;
  /** Actuele documentzoom voor de statusbalk; null zolang onbekend. */
  zoom: (zoom: number | null) => void;
}
export default function OfficeEditor(props: EditorProps) {
  const docx = useRef<DocxEditorRef>(null);
  const exporteren = useRef(false);
  const [fontFaces, setFontFaces] = useState<PptxFontFace[]>([]);
  const [liniaal, setLiniaal] = useState(true);
  const [navigatie, setNavigatie] = useState(false);
  const [documentGereed, setDocumentGereed] = useState(false);
  const rekenbladHost = useRef<HTMLDivElement>(null);
  const [rekenbladApi, setRekenbladApi] = useState<XlsxEditorApi | null>(null);
  const [diaBreedte, setDiaBreedte] = useState<number>();
  const [presentatieApi, setPresentatieApi] = useState<PptxEditorApi | null>(
    null,
  );
  const recent = useRef(props);
  recent.current = props;
  const apis = useMemo(
    () => ({
      tekst: () => docx.current,
      rekenblad: rekenbladApi,
      presentatie: presentatieApi,
    }),
    [rekenbladApi, presentatieApi],
  );
  useNederlandseInvoer(rekenbladHost, rekenbladApi);
  const zoomKoppeling = useMemo(
    () => ({
      sleutel: `${props.soort}:${props.naam}:${props.bytes.byteLength}`,
      melden: (zoom: number | null) => recent.current.zoom(zoom),
    }),
    [props.soort, props.naam, props.bytes],
  );
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
      setRekenbladApi(api);
      // De engine rekent stil opnieuw en laat onbekende functies op hun oude
      // uitkomst staan; meld dat vóór de eerste bewerking.
      void import("./rekenbladcontrole")
        .then(
          ({
            inventariseerRekenblad,
            vergelijkCache,
            leesUitWerkboek,
            rekenbladMelding,
          }) => {
            const controle = inventariseerRekenblad(recent.current.bytes);
            const melding = rekenbladMelding(
              controle,
              vergelijkCache(controle, leesUitWerkboek(api.handle, controle)),
            );
            if (melding?.ernst === "waarschuwing")
              recent.current.fout(
                new Error(`${melding.titel}. ${melding.regels.join(" ")}`),
              );
          },
        )
        .catch(() => {
          // Een mislukte controle mag het openen niet blokkeren.
        });
      props.registreer(async () => {
        await api.version();
        return api.save();
      });
      return () => {
        setRekenbladApi(null);
        props.registreer(null);
      };
    },
    [props.registreer],
  );
  const gereedPptx = useCallback(
    (api: PptxEditorApi) => {
      // EMU naar CSS-pixels bij 96 dpi.
      setDiaBreedte(api.handle.snapshot().widthEmu / 9525);
      setPresentatieApi(api);
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
        <EditorApi.Provider value={apis}>
          <DocxEditor
            ref={docx}
            documentBuffer={props.bytes}
            showFileOpen={false}
            showHelpMenu={false}
            downloadOnSave={false}
            onSave={() => {
              if (!exporteren.current) props.opslaan();
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
            i18n={tekstNl}
            className="office-tekst"
            readOnly={props.inactief}
            toolbar={
              <TekstRibbon
                bestand={props.bestandsmenu}
                liniaal={liniaal}
                navigatie={navigatie}
                wijzigLiniaal={() => setLiniaal(!liniaal)}
                wijzigNavigatie={() => setNavigatie(!navigatie)}
                zoomKoppeling={zoomKoppeling}
              />
            }
          />
        </EditorApi.Provider>
      </RibbonFout.Provider>
    );
  if (props.soort === "xlsx")
    return (
      <RibbonFout.Provider value={(bericht) => props.fout(new Error(bericht))}>
        <EditorApi.Provider value={apis}>
          <div className="office-rekenblad-host" ref={rekenbladHost}>
            <XlsxEditor
              file={props.bytes}
              fileName={props.naam}
              onReady={gereedXlsx}
              onChange={props.gewijzigd}
              onSave={props.opslaan}
              i18n={rekenbladNl}
              className="office-rekenblad"
              readOnly={props.inactief}
              toolbar={
                <RekenbladRibbon
                  bestand={props.bestandsmenu}
                  zoomKoppeling={zoomKoppeling}
                />
              }
            />
            <RekenbladKoppen host={rekenbladHost} api={rekenbladApi} />
          </div>
        </EditorApi.Provider>
      </RibbonFout.Provider>
    );
  if (!fontFaces.length) return <p role="status">Lettertypen laden…</p>;
  return (
    <RibbonFout.Provider value={(bericht) => props.fout(new Error(bericht))}>
      <EditorApi.Provider value={apis}>
        <PptxEditor
          file={props.bytes}
          fileName={props.naam}
          fonts={fontFaces}
          onReady={gereedPptx}
          onChange={props.gewijzigd}
          onError={props.fout}
          onSave={props.opslaan}
          i18n={diaNl}
          className="office-presentatie"
          readOnly={props.inactief}
          toolbar={
            <PresentatieRibbon
              bestand={props.bestandsmenu}
              zoomKoppeling={zoomKoppeling}
              diaBreedte={diaBreedte}
            />
          }
        />
      </EditorApi.Provider>
    </RibbonFout.Provider>
  );
}
