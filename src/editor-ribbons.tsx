import {
  useDocxCommand,
  ToolbarCommand as TekstControl,
  type DocxCommandArgs,
  type DocxCommandId,
  type DocxSelectCommandId,
} from "@betteroffice/docx-react";
import {
  useXlsxCommand,
  EditorToolbar as RekenbladToolbar,
  ToolbarCommand as RekenbladControl,
  type XlsxCommandArgs,
  type XlsxCommandId,
  type XlsxSelectCommandId,
} from "@betteroffice/xlsx-react";
import {
  usePptxCommand,
  ToolbarCommand as DiaControl,
  type PptxCommandArgs,
  type PptxCommandId,
  type PptxSelectCommandId,
} from "@betteroffice/pptx-react";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Superscript,
  Subscript,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Eraser,
  Type,
  Highlighter,
  Image,
  Table2,
  Link,
  FilePlus2,
  FileText,
  Pilcrow,
  BookOpen,
  LayoutTemplate,
  Stamp,
  MessageSquare,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Replace,
  Printer,
  Ruler,
  PanelLeft,
  Percent,
  Euro,
  Paintbrush,
  PaintBucket,
  Grid2X2,
  Merge,
  WrapText,
  MonitorPlay,
  MousePointer2,
  Square,
  Layers,
  ArrowUpToLine,
  ArrowDownToLine,
  BringToFront,
  SendToBack,
  Maximize,
  Download,
  Circle,
  ZoomIn,
  Columns2,
  RectangleHorizontal,
  RotateCw,
  RotateCcw,
  FlipHorizontal2,
  FlipVertical2,
  Rows3,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  Ribbon,
  Groep,
  Actie,
  OpdrachtKnop,
  OpdrachtKeuze,
  OpdrachtKleur,
  OpdrachtGetal,
  type GebondenOpdracht,
  type RibbonTab,
} from "./Ribbon";
import { useDocumentZoom, type ZoomKoppeling } from "./useDocumentZoom";

type Knop = { naam: string; icoon: LucideIcon; groot?: boolean };
function W<K extends DocxCommandId>({
  id,
  args,
  ...props
}: Knop & { id: K; args?: DocxCommandArgs[K] }) {
  return <OpdrachtKnop {...props} opdracht={useDocxCommand(id, args)} />;
}
function C<K extends XlsxCommandId>({
  id,
  args,
  ...props
}: Knop & { id: K; args?: XlsxCommandArgs[K] }) {
  return <OpdrachtKnop {...props} opdracht={useXlsxCommand(id, args)} />;
}
function P<K extends PptxCommandId>({
  id,
  args,
  ...props
}: Knop & { id: K; args?: PptxCommandArgs[K] }) {
  return <OpdrachtKnop {...props} opdracht={usePptxCommand(id, args)} />;
}
function WK({
  id,
  naam,
  breed,
}: {
  id: DocxSelectCommandId;
  naam: string;
  breed?: boolean;
}) {
  return (
    <OpdrachtKeuze opdracht={useDocxCommand(id)} naam={naam} breed={breed} />
  );
}
function CK({
  id,
  naam,
  breed,
}: {
  id: XlsxSelectCommandId;
  naam: string;
  breed?: boolean;
}) {
  return (
    <OpdrachtKeuze opdracht={useXlsxCommand(id)} naam={naam} breed={breed} />
  );
}
function PK({
  id,
  naam,
  breed,
}: {
  id: PptxSelectCommandId;
  naam: string;
  breed?: boolean;
}) {
  return (
    <OpdrachtKeuze opdracht={usePptxCommand(id)} naam={naam} breed={breed} />
  );
}
function TekstLettertype() {
  const grootte = useDocxCommand("fontSize"),
    kleur = useDocxCommand("textColor"),
    markering = useDocxCommand("highlightColor");
  return (
    <Groep naam="Lettertype">
      <div className="ribbon-rij">
        <WK id="fontFamily" naam="Lettertype" breed />
        <OpdrachtGetal
          opdracht={grootte}
          naam="Tekengrootte"
          args={(points) => ({ points })}
        />
      </div>
      <div className="ribbon-rij ribbon-iconen">
        <W id="bold" naam="Vet" icoon={Bold} />
        <W id="italic" naam="Cursief" icoon={Italic} />
        <W id="underline" naam="Onderstrepen" icoon={Underline} />
        <W id="strikethrough" naam="Doorhalen" icoon={Strikethrough} />
        <W id="superscript" naam="Superscript" icoon={Superscript} />
        <W id="subscript" naam="Subscript" icoon={Subscript} />
        <OpdrachtKleur
          opdracht={markering}
          naam="Markeerkleur"
          icoon={Highlighter}
          args={(color) => ({ color })}
        />
        <OpdrachtKleur
          opdracht={kleur}
          naam="Tekstkleur"
          icoon={Type}
          args={(color) => ({ color: { rgb: color.slice(1) } })}
        />
      </div>
    </Groep>
  );
}
function TekstAlinea() {
  return (
    <Groep naam="Alinea">
      <div className="ribbon-rij ribbon-iconen">
        <W id="bulletList" naam="Opsomming" icoon={List} />
        <W id="numberedList" naam="Nummering" icoon={ListOrdered} />
        <W id="outdent" naam="Minder inspringen" icoon={IndentDecrease} />
        <W id="indent" naam="Meer inspringen" icoon={IndentIncrease} />
      </div>
      <div className="ribbon-rij ribbon-iconen">
        <W
          id="alignment"
          args={{ value: "left" }}
          naam="Links uitlijnen"
          icoon={AlignLeft}
        />
        <W
          id="alignment"
          args={{ value: "center" }}
          naam="Centreren"
          icoon={AlignCenter}
        />
        <W
          id="alignment"
          args={{ value: "right" }}
          naam="Rechts uitlijnen"
          icoon={AlignRight}
        />
        <W
          id="alignment"
          args={{ value: "both" }}
          naam="Uitvullen"
          icoon={AlignJustify}
        />
      </div>
    </Groep>
  );
}
function Stijlen() {
  const opdracht = useDocxCommand("paragraphStyle");
  const opties = opdracht.state.options ?? [];
  const voorkeur = ["Normal", "Heading1", "Heading2"]
    .map((id) => opties.find((optie) => optie.args.styleId === id))
    .filter((optie) => optie !== undefined);
  return (
    <Groep naam="Stijlen" className="ribbon-stijlen">
      <div className="ribbon-stijlgalerij">
        {(voorkeur.length ? voorkeur : opties.slice(0, 3)).map(
          (optie, index) => (
            <W
              key={optie.args.styleId}
              id="paragraphStyle"
              args={optie.args}
              naam={optie.label}
              icoon={index ? Type : Pilcrow}
              groot
            />
          ),
        )}
      </div>
      <WK id="paragraphStyle" naam="Alle stijlen" breed />
    </Groep>
  );
}
function Geschiedenis({ soort }: { soort: "tekst" | "rekenblad" | "dia" }) {
  return (
    <Groep naam="Bewerken">
      <div className="ribbon-stapel">
        {soort === "tekst" ? (
          <>
            <W id="undo" naam="Ongedaan" icoon={Undo2} />
            <W id="redo" naam="Opnieuw" icoon={Redo2} />
          </>
        ) : soort === "rekenblad" ? (
          <>
            <C id="undo" naam="Ongedaan" icoon={Undo2} />
            <C id="redo" naam="Opnieuw" icoon={Redo2} />
          </>
        ) : (
          <>
            <P id="undo" naam="Ongedaan" icoon={Undo2} />
            <P id="redo" naam="Opnieuw" icoon={Redo2} />
          </>
        )}
      </div>
    </Groep>
  );
}
function Zoom({ opdracht }: { opdracht: GebondenOpdracht }) {
  return (
    <Groep naam="Zoom">
      <div className="ribbon-stapel">
        <ZoomIn size={24} strokeWidth={1.5} />
        <OpdrachtKeuze opdracht={opdracht} naam="Zoomniveau" />
      </div>
    </Groep>
  );
}
function scrollvlakVan(element: Element | null) {
  for (let vlak = element?.parentElement; vlak; vlak = vlak.parentElement)
    if (/(auto|scroll)/.test(getComputedStyle(vlak).overflow)) return vlak;
  return null;
}
export function TekstRibbon({
  bestand,
  liniaal,
  navigatie,
  wijzigLiniaal,
  wijzigNavigatie,
  zoomKoppeling,
}: {
  bestand: () => void;
  liniaal: boolean;
  navigatie: boolean;
  wijzigLiniaal: () => void;
  wijzigNavigatie: () => void;
  zoomKoppeling?: ZoomKoppeling;
}) {
  const zoom = useDocxCommand("zoom");
  useDocumentZoom({
    opdracht: zoom,
    vlak: () =>
      document.querySelector<HTMLElement>(
        ".office-tekst .docx-editor__scroll-container",
      ),
    koppeling: zoomKoppeling,
  });
  const tabel = useDocxCommand("tableAction");
  const afbeelding = useDocxCommand("imageProperties");
  const contextTabs: RibbonTab[] = [];
  if (tabel.state.value)
    contextTabs.push({
      id: "tabel",
      naam: "Tabelopmaak",
      inhoud: (
        <>
          <Groep naam="Rijen">
            <div className="ribbon-stapel">
              <W
                id="tableAction"
                args="addRowAbove"
                naam="Rij boven invoegen"
                icoon={Rows3}
              />
              <W
                id="tableAction"
                args="addRowBelow"
                naam="Rij onder invoegen"
                icoon={Rows3}
              />
            </div>
          </Groep>
          <Groep naam="Kolommen">
            <div className="ribbon-stapel">
              <W
                id="tableAction"
                args="addColumnLeft"
                naam="Kolom links invoegen"
                icoon={Columns2}
              />
              <W
                id="tableAction"
                args="addColumnRight"
                naam="Kolom rechts invoegen"
                icoon={Columns2}
              />
            </div>
          </Groep>
          <Groep naam="Cellen">
            <W
              id="tableAction"
              args="mergeCells"
              naam="Samenvoegen"
              icoon={Merge}
              groot
            />
            <W
              id="tableAction"
              args="splitCell"
              naam="Cel splitsen"
              icoon={Grid2X2}
              groot
            />
          </Groep>
          <Groep naam="Tabelstijl">
            <div className="ribbon-ingebouwd">
              <TekstControl id="tableAction" />
              <span>Randen en opvulling</span>
            </div>
          </Groep>
          <Groep naam="Indeling">
            <W
              id="tableAction"
              args={{ type: "openTableProperties" }}
              naam="Eigenschappen"
              icoon={Table2}
              groot
            />
          </Groep>
          <Groep naam="Verwijderen">
            <div className="ribbon-stapel">
              <W
                id="tableAction"
                args="deleteRow"
                naam="Rij verwijderen"
                icoon={Trash2}
              />
              <W
                id="tableAction"
                args="deleteColumn"
                naam="Kolom verwijderen"
                icoon={Trash2}
              />
            </div>
            <W
              id="tableAction"
              args="deleteTable"
              naam="Tabel verwijderen"
              icoon={Trash2}
              groot
            />
          </Groep>
        </>
      ),
    });
  if (afbeelding.state.enabled)
    contextTabs.push({
      id: "afbeelding",
      naam: "Afbeeldingsopmaak",
      inhoud: (
        <>
          <Groep naam="Afbeelding">
            <W id="imageProperties" naam="Eigenschappen" icoon={Image} groot />
          </Groep>
          <Groep naam="Tekstterugloop">
            <WK id="imageWrap" naam="Tekstterugloop" breed />
          </Groep>
          <Groep naam="Draaien">
            <W
              id="imageTransform"
              args={{ action: "rotateCW" }}
              naam="Rechtsom draaien"
              icoon={RotateCw}
              groot
            />
            <W
              id="imageTransform"
              args={{ action: "rotateCCW" }}
              naam="Linksom draaien"
              icoon={RotateCcw}
              groot
            />
          </Groep>
          <Groep naam="Spiegelen">
            <W
              id="imageTransform"
              args={{ action: "flipH" }}
              naam="Horizontaal spiegelen"
              icoon={FlipHorizontal2}
              groot
            />
            <W
              id="imageTransform"
              args={{ action: "flipV" }}
              naam="Verticaal spiegelen"
              icoon={FlipVertical2}
              groot
            />
          </Groep>
        </>
      ),
    });
  return (
    <Ribbon
      bestand={bestand}
      tabs={[
        {
          id: "start",
          naam: "Start",
          inhoud: (
            <>
              <Geschiedenis soort="tekst" />
              <TekstLettertype />
              <TekstAlinea />
              <Stijlen />
              <Groep naam="Opmaak">
                <W
                  id="clearFormatting"
                  naam="Opmaak wissen"
                  icoon={Eraser}
                  groot
                />
              </Groep>
              <Groep naam="Zoeken">
                <div className="ribbon-stapel">
                  <W id="find" naam="Zoeken" icoon={Search} />
                  <W id="replace" naam="Vervangen" icoon={Replace} />
                </div>
              </Groep>
            </>
          ),
        },
        {
          id: "invoegen",
          naam: "Invoegen",
          inhoud: (
            <>
              <Groep naam="Pagina’s">
                <W
                  id="insertPageBreak"
                  naam="Pagina-einde"
                  icoon={FilePlus2}
                  groot
                />
              </Groep>
              <Groep naam="Tabellen">
                <div className="ribbon-ingebouwd">
                  <TekstControl id="insertTable" />
                  <span>Tabel</span>
                </div>
              </Groep>
              <Groep naam="Illustraties">
                <W id="insertImage" naam="Afbeelding" icoon={Image} groot />
              </Groep>
              <Groep naam="Verwijzingen">
                <W id="insertLink" naam="Koppeling" icoon={Link} groot />
              </Groep>
            </>
          ),
        },
        {
          id: "indeling",
          naam: "Indeling",
          inhoud: (
            <>
              <Groep naam="Pagina-instelling">
                <W
                  id="pageSetup"
                  naam="Pagina instellen"
                  icoon={LayoutTemplate}
                  groot
                />
                <W id="watermark" naam="Watermerk" icoon={Stamp} groot />
              </Groep>
              <Groep naam="Secties">
                <div className="ribbon-stapel">
                  <W
                    id="insertSectionBreakNextPage"
                    naam="Sectie op nieuwe pagina"
                    icoon={FilePlus2}
                  />
                  <W
                    id="insertSectionBreakContinuous"
                    naam="Doorlopende sectie"
                    icoon={Columns2}
                  />
                </div>
              </Groep>
              <TekstAlinea />
              <Groep naam="Regelafstand">
                <WK id="lineSpacing" naam="Regelafstand" breed />
              </Groep>
              <Groep naam="Tekstrichting">
                <div className="ribbon-stapel">
                  <W
                    id="setLtr"
                    naam="Van links naar rechts"
                    icoon={AlignLeft}
                  />
                  <W
                    id="setRtl"
                    naam="Van rechts naar links"
                    icoon={AlignRight}
                  />
                </div>
              </Groep>
            </>
          ),
        },
        {
          id: "controleren",
          naam: "Controleren",
          inhoud: (
            <>
              <Groep naam="Opmerkingen">
                <W
                  id="commentsSidebar"
                  naam="Opmerkingen"
                  icoon={MessageSquare}
                  groot
                />
              </Groep>
              <Groep naam="Wijzigingen bijhouden">
                <WK id="editingMode" naam="Bewerkingsmodus" breed />
              </Groep>
              <Groep naam="Wijzigingen">
                <W id="reviewAccept" naam="Accepteren" icoon={Check} groot />
                <W id="reviewReject" naam="Weigeren" icoon={X} groot />
                <div className="ribbon-stapel">
                  <W id="reviewPrevious" naam="Vorige" icoon={ChevronLeft} />
                  <W id="reviewNext" naam="Volgende" icoon={ChevronRight} />
                </div>
              </Groep>
              <Groep naam="Zoeken">
                <W id="find" naam="Zoeken" icoon={Search} groot />
                <W id="replace" naam="Vervangen" icoon={Replace} groot />
              </Groep>
            </>
          ),
        },
        {
          id: "beeld",
          naam: "Beeld",
          inhoud: (
            <>
              <Groep naam="Weergeven">
                <Actie
                  icoon={Ruler}
                  naam="Liniaal"
                  groot
                  actief={liniaal}
                  onClick={wijzigLiniaal}
                />
                <Actie
                  icoon={PanelLeft}
                  naam="Navigatie"
                  groot
                  actief={navigatie}
                  onClick={wijzigNavigatie}
                />
              </Groep>
              <Zoom opdracht={zoom} />
              <Groep naam="Afdrukken">
                <W id="print" naam="Afdrukken" icoon={Printer} groot />
              </Groep>
            </>
          ),
        },
        ...contextTabs,
      ]}
    />
  );
}

function RekenbladLettertype() {
  const grootte = useXlsxCommand("fontSize"),
    kleur = useXlsxCommand("textColor"),
    vulling = useXlsxCommand("fillColor");
  return (
    <Groep naam="Lettertype">
      <div className="ribbon-rij">
        <CK id="fontFamily" naam="Lettertype" breed />
        <OpdrachtGetal
          opdracht={grootte}
          naam="Tekengrootte"
          args={(points) => ({ points })}
        />
      </div>
      <div className="ribbon-rij ribbon-iconen">
        <C id="bold" naam="Vet" icoon={Bold} />
        <C id="italic" naam="Cursief" icoon={Italic} />
        <C id="strikethrough" naam="Doorhalen" icoon={Strikethrough} />
        <OpdrachtKleur
          opdracht={vulling}
          naam="Opvulkleur"
          icoon={PaintBucket}
          args={(color) => ({ color })}
        />
        <OpdrachtKleur
          opdracht={kleur}
          naam="Tekstkleur"
          icoon={Type}
          args={(color) => ({ color })}
        />
      </div>
    </Groep>
  );
}
function RekenbladUitlijning() {
  return (
    <Groep naam="Uitlijning">
      <div className="ribbon-rij ribbon-iconen">
        <C
          id="horizontalAlignment"
          args={{ value: "left" }}
          naam="Links uitlijnen"
          icoon={AlignLeft}
        />
        <C
          id="horizontalAlignment"
          args={{ value: "center" }}
          naam="Centreren"
          icoon={AlignCenter}
        />
        <C
          id="horizontalAlignment"
          args={{ value: "right" }}
          naam="Rechts uitlijnen"
          icoon={AlignRight}
        />
        <C
          id="textWrapping"
          args={{ value: "wrap" }}
          naam="Tekstterugloop"
          icoon={WrapText}
        />
      </div>
      <div className="ribbon-rij">
        <CK id="verticalAlignment" naam="Verticaal uitlijnen" />
        <CK id="merge" naam="Samenvoegen" />
      </div>
    </Groep>
  );
}
function RekenbladGetal() {
  return (
    <Groep naam="Getal">
      <CK id="numberFormat" naam="Getalnotatie" breed />
      <div className="ribbon-rij ribbon-iconen">
        <C
          id="numberFormat"
          args={{ value: "currency" }}
          naam="Valuta"
          icoon={Euro}
        />
        <C
          id="numberFormat"
          args={{ value: "percent" }}
          naam="Percentage"
          icoon={Percent}
        />
        <C
          id="decimalPlaces"
          args={{ direction: "decrease" }}
          naam="Minder decimalen"
          icoon={IndentDecrease}
        />
        <C
          id="decimalPlaces"
          args={{ direction: "increase" }}
          naam="Meer decimalen"
          icoon={IndentIncrease}
        />
      </div>
    </Groep>
  );
}
export function RekenbladRibbon({
  bestand,
  zoomKoppeling,
}: {
  bestand: () => void;
  zoomKoppeling?: ZoomKoppeling;
}) {
  const zoom = useXlsxCommand("zoom"),
    randkleur = useXlsxCommand("borderColor");
  useDocumentZoom({
    opdracht: zoom,
    vlak: () =>
      document.querySelector<HTMLElement>(
        '.office-rekenblad-host [data-testid="xlsx-scroll"]',
      ),
    bereik: ".rekenblad-koppen",
    koppeling: zoomKoppeling,
  });
  return (
    <RekenbladToolbar mode="commands" className="editor-chrome">
      <Ribbon
        bestand={bestand}
        tabs={[
          {
            id: "start",
            naam: "Start",
            inhoud: (
              <>
                <Geschiedenis soort="rekenblad" />
                <Groep naam="Opmaak">
                  <C
                    id="paintFormat"
                    naam="Opmaak kopiëren"
                    icoon={Paintbrush}
                    groot
                  />
                </Groep>
                <RekenbladLettertype />
                <RekenbladUitlijning />
                <RekenbladGetal />
                <Groep naam="Celranden">
                  <div className="ribbon-ingebouwd">
                    <RekenbladControl id="borderPreset" />
                    <span>Randen</span>
                  </div>
                </Groep>
              </>
            ),
          },
          {
            id: "celopmaak",
            naam: "Celopmaak",
            inhoud: (
              <>
                <RekenbladLettertype />
                <RekenbladUitlijning />
                <RekenbladGetal />
                <Groep naam="Celranden">
                  <div className="ribbon-stapel">
                    <CK id="borderPreset" naam="Celranden" breed />
                    <CK id="borderStyle" naam="Lijnstijl" breed />
                  </div>
                  <OpdrachtKleur
                    opdracht={randkleur}
                    naam="Randkleur"
                    icoon={Grid2X2}
                    args={(color) => ({ color })}
                  />
                </Groep>
                <Groep naam="Terugloop">
                  <CK id="textWrapping" naam="Tekstterugloop" breed />
                </Groep>
              </>
            ),
          },
          {
            id: "beeld",
            naam: "Beeld",
            inhoud: (
              <>
                <Zoom opdracht={zoom} />
                <Groep naam="Uitvoer">
                  <C id="print" naam="Afdrukken" icoon={Printer} groot />
                  <C
                    id="exportPng"
                    naam="Afbeelding exporteren"
                    icoon={Download}
                    groot
                  />
                </Groep>
                <Geschiedenis soort="rekenblad" />
              </>
            ),
          },
        ]}
      />
      <div className="office-formulebalk">
        <RekenbladToolbar.FormulaBar />
      </div>
    </RekenbladToolbar>
  );
}

function DiaLettertype() {
  const grootte = usePptxCommand("fontSize"),
    kleur = usePptxCommand("textColor");
  return (
    <Groep naam="Lettertype">
      <div className="ribbon-rij">
        <PK id="fontFamily" naam="Lettertype" breed />
        <OpdrachtGetal
          opdracht={grootte}
          naam="Tekengrootte"
          args={(points) => ({ points })}
        />
      </div>
      <div className="ribbon-rij ribbon-iconen">
        <P id="bold" naam="Vet" icoon={Bold} />
        <P id="italic" naam="Cursief" icoon={Italic} />
        <P id="underline" naam="Onderstrepen" icoon={Underline} />
        <OpdrachtKleur
          opdracht={kleur}
          naam="Tekstkleur"
          icoon={Type}
          args={(color) => ({ color })}
        />
      </div>
    </Groep>
  );
}
function DiaUitlijning() {
  return (
    <Groep naam="Alinea">
      <div className="ribbon-rij ribbon-iconen">
        <P
          id="alignment"
          args={{ value: "l" }}
          naam="Links uitlijnen"
          icoon={AlignLeft}
        />
        <P
          id="alignment"
          args={{ value: "ctr" }}
          naam="Centreren"
          icoon={AlignCenter}
        />
        <P
          id="alignment"
          args={{ value: "r" }}
          naam="Rechts uitlijnen"
          icoon={AlignRight}
        />
        <P
          id="alignment"
          args={{ value: "just" }}
          naam="Uitvullen"
          icoon={AlignJustify}
        />
      </div>
    </Groep>
  );
}
export function PresentatieRibbon({
  bestand,
  zoomKoppeling,
  diaBreedte,
}: {
  bestand: () => void;
  zoomKoppeling?: ZoomKoppeling;
  /** Diabreedte bij 100%, in CSS-pixels. */
  diaBreedte?: number;
}) {
  const zoom = usePptxCommand("zoom"),
    vulling = usePptxCommand("shapeFill"),
    rand = usePptxCommand("shapeStrokeColor");
  const dia = () =>
    document.querySelector<HTMLElement>(
      '.office-presentatie [data-testid="pptx-slide-canvas"]',
    );
  useDocumentZoom({
    opdracht: zoom,
    vlak: () => scrollvlakVan(dia()),
    koppeling: zoomKoppeling,
    // ‘Passend’ is geen getal: reken de getekende dia terug naar 100%.
    huidig: () => {
      const breedte = dia()?.getBoundingClientRect().width;
      return breedte && diaBreedte ? breedte / diaBreedte : null;
    },
    standaard: { scale: "fit" },
  });
  return (
    <Ribbon
      bestand={bestand}
      tabs={[
        {
          id: "start",
          naam: "Start",
          inhoud: (
            <>
              <Geschiedenis soort="dia" />
              <Groep naam="Dia’s">
                <P
                  id="insertSlide"
                  args={{}}
                  naam="Nieuwe dia"
                  icoon={FilePlus2}
                  groot
                />
                <PK id="insertSlide" naam="Dia-indeling" breed />
              </Groep>
              <DiaLettertype />
              <DiaUitlijning />
              <Groep naam="Tekenen">
                <P
                  id="tool"
                  args={{ value: "select" }}
                  naam="Selecteren"
                  icoon={MousePointer2}
                  groot
                />
                <P
                  id="tool"
                  args={{ value: "textBox" }}
                  naam="Tekstvak"
                  icoon={Type}
                  groot
                />
                <P
                  id="tool"
                  args={{ value: "shape:rect" }}
                  naam="Vorm"
                  icoon={Square}
                  groot
                />
              </Groep>
              <Groep naam="Presenteren">
                <P
                  id="slideshow"
                  naam="Diavoorstelling"
                  icoon={MonitorPlay}
                  groot
                />
              </Groep>
            </>
          ),
        },
        {
          id: "invoegen",
          naam: "Invoegen",
          inhoud: (
            <>
              <Groep naam="Dia’s">
                <P
                  id="insertSlide"
                  args={{}}
                  naam="Nieuwe dia"
                  icoon={FilePlus2}
                  groot
                />
                <PK id="insertSlide" naam="Dia-indeling" breed />
              </Groep>
              <Groep naam="Illustraties">
                <P id="insertImage" naam="Afbeelding" icoon={Image} groot />
                <div className="ribbon-stapel">
                  <PK id="tool" naam="Vormen en gereedschap" breed />
                </div>
              </Groep>
              <Groep naam="Tekst">
                <P
                  id="tool"
                  args={{ value: "textBox" }}
                  naam="Tekstvak"
                  icoon={Type}
                  groot
                />
              </Groep>
              <Groep naam="Basisvormen">
                <P
                  id="tool"
                  args={{ value: "shape:rect" }}
                  naam="Rechthoek"
                  icoon={Square}
                  groot
                />
                <P
                  id="tool"
                  args={{ value: "shape:ellipse" }}
                  naam="Ovaal"
                  icoon={Circle}
                  groot
                />
                <P
                  id="tool"
                  args={{ value: "shape:roundRect" }}
                  naam="Afgeronde vorm"
                  icoon={RectangleHorizontal}
                  groot
                />
              </Groep>
            </>
          ),
        },
        {
          id: "vormopmaak",
          naam: "Vormopmaak",
          inhoud: (
            <>
              <Groep naam="Vormstijl">
                <div className="ribbon-stapel">
                  <OpdrachtKleur
                    opdracht={vulling}
                    naam="Vormopvulling"
                    icoon={PaintBucket}
                    args={(color) => ({ color })}
                  />
                  <OpdrachtKleur
                    opdracht={rand}
                    naam="Vormcontour"
                    icoon={Square}
                    args={(color) => ({ color })}
                  />
                </div>
                <div className="ribbon-stapel">
                  <P
                    id="shapeFill"
                    args={{ color: null }}
                    naam="Geen opvulling"
                    icoon={Eraser}
                  />
                  <P
                    id="shapeStrokeColor"
                    args={{ color: null }}
                    naam="Geen contour"
                    icoon={Square}
                  />
                </div>
              </Groep>
              <Groep naam="Lijndikte">
                <PK id="shapeStrokeWidth" naam="Lijndikte" breed />
              </Groep>
              <Groep naam="Rangschikken">
                <div className="ribbon-stapel">
                  <P
                    id="zOrder"
                    args={{ value: "front" }}
                    naam="Naar voorgrond"
                    icoon={BringToFront}
                  />
                  <P
                    id="zOrder"
                    args={{ value: "back" }}
                    naam="Naar achtergrond"
                    icoon={SendToBack}
                  />
                </div>
                <div className="ribbon-stapel">
                  <P
                    id="zOrder"
                    args={{ value: "forward" }}
                    naam="Naar voren"
                    icoon={ArrowUpToLine}
                  />
                  <P
                    id="zOrder"
                    args={{ value: "backward" }}
                    naam="Naar achteren"
                    icoon={ArrowDownToLine}
                  />
                </div>
              </Groep>
              <Groep naam="Vorm aanpassen">
                <DiaControl id="shapeAdjustment" />
              </Groep>
              <DiaLettertype />
              <DiaUitlijning />
            </>
          ),
        },
        {
          id: "beeld",
          naam: "Beeld",
          inhoud: (
            <>
              <Zoom opdracht={zoom} />
              <Groep naam="Werkruimte">
                <P
                  id="zoom"
                  args={{ scale: "fit" }}
                  naam="Passend maken"
                  icoon={Maximize}
                  groot
                />
                <P
                  id="tool"
                  args={{ value: "select" }}
                  naam="Selecteren"
                  icoon={MousePointer2}
                  groot
                />
              </Groep>
              <Groep naam="Uitvoer">
                <P
                  id="exportPng"
                  naam="Dia exporteren"
                  icoon={Download}
                  groot
                />
              </Groep>
              <Geschiedenis soort="dia" />
            </>
          ),
        },
        {
          id: "diavoorstelling",
          naam: "Diavoorstelling",
          inhoud: (
            <>
              <Groep naam="Presentatie starten">
                <P
                  id="slideshow"
                  naam="Diavoorstelling starten"
                  icoon={MonitorPlay}
                  groot
                />
              </Groep>
              <Groep naam="Voorbereiden">
                <P
                  id="zoom"
                  args={{ scale: "fit" }}
                  naam="Dia passend maken"
                  icoon={Maximize}
                  groot
                />
                <P
                  id="exportPng"
                  naam="Dia exporteren"
                  icoon={Download}
                  groot
                />
              </Groep>
            </>
          ),
        },
      ]}
    />
  );
}
