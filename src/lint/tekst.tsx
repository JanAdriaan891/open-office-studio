import {
  useDocxCommand,
  ToolbarCommand as TekstControl,
} from "@betteroffice/docx-react";
import {
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
  Pilcrow,
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
  Grid2X2,
  Merge,
  Columns2,
  RotateCw,
  RotateCcw,
  FlipHorizontal2,
  FlipVertical2,
  Rows3,
  Trash2,
} from "lucide-react";
import {
  Ribbon,
  Groep,
  Actie,
  OpdrachtKleur,
  OpdrachtGetal,
  type RibbonTab,
} from "../Ribbon";
import { useDocumentZoom, type ZoomKoppeling } from "../useDocumentZoom";
import { W, WK, Geschiedenis, Zoom } from "./gedeeld";

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
