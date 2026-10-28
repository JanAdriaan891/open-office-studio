import { zichtbaarElement } from "./editorApi";
import { vraagAfdrukvoorbeeld } from "../afdrukken/openen";
import { GrafiekGroep, useIngeslotenGrafieken } from "../grafieken/ui/ingesloten";
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
  MessageSquarePlus,
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
  Scissors,
  Copy,
  ClipboardPaste,
  Omega,
  CalendarDays,
  Clock,
  CaseUpper,
  CaseLower,
  CaseSensitive,
  LetterText,
  ArrowDownUp,
  RefreshCw,
  Baseline,
  WholeWord,
  ArrowDownToLine,
  Heading1,
  Heading2,
  Heading3,
  Heading,
  Quote,
  PenLine,
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
import { W, WK, WL, Geschiedenis, Zoom } from "./gedeeld";
import {
  EigenKnop,
  TekstDialogen,
  TekstStatus,
  WS,
  useTekstOpdrachten,
} from "./tekst-opdrachten";
import { datumTekst, tijdTekst, type Hoofdlettersoort } from "./tekst-logica";
import { TabelKiezer } from "../tabelvoorbeeld/TabelKiezer";
import {
  AlineaKnop,
  LettertypeKnop,
  LijstKnop,
  PaginaAchtergrondKnoppen,
  RandenKnop,
  TekstOpmaakProvider,
} from "../tekst/TekstOpmaak";
import { AfstandGroep } from "../tekst/alinea/AfstandGroep";
import "./tekst.css";

type Opdrachten = ReturnType<typeof useTekstOpdrachten>;

const hoofdletterKnoppen: {
  soort: Hoofdlettersoort | "rouleren";
  naam: string;
  icoon: typeof Type;
  sneltoets?: string;
}[] = [
  { soort: "hoofdletters", naam: "HOOFDLETTERS", icoon: CaseUpper },
  { soort: "kleine", naam: "kleine letters", icoon: CaseLower },
  { soort: "zin", naam: "Zin beginnen met hoofdletter", icoon: CaseSensitive },
  { soort: "titel", naam: "Elk Woord Met Hoofdletter", icoon: LetterText },
  { soort: "wisselen", naam: "hOOFDLETTERS wISSELEN", icoon: ArrowDownUp },
  {
    soort: "rouleren",
    naam: "Hoofdlettergebruik rouleren",
    icoon: RefreshCw,
    sneltoets: "Shift+F3",
  },
];

function TekstLettertype() {
  const grootte = useDocxCommand("fontSize"),
    kleur = useDocxCommand("textColor"),
    markering = useDocxCommand("highlightColor");
  return (
    <Groep naam="Lettertype">
      <div className="ribbon-rij">
        <WL />
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
        <WS
          id="superscript"
          naam="Superscript"
          icoon={Superscript}
          sneltoets="Ctrl+Shift+P"
        />
        <WS
          id="subscript"
          naam="Subscript"
          icoon={Subscript}
          sneltoets="Ctrl+Shift+B"
        />
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
        <LettertypeKnop />
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
        <LijstKnop />
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
        <AlineaKnop />
        <RandenKnop />
      </div>
    </Groep>
  );
}
const stijlSneltoetsen: Record<string, string> = {
  Heading1: "Ctrl+1",
  Heading2: "Ctrl+2",
  Heading3: "Ctrl+3",
};
const stijlIconen: Record<string, typeof Type> = {
  Normal: Pilcrow,
  Title: Heading,
  Subtitle: Type,
  Heading1: Heading1,
  Heading2: Heading2,
  Heading3: Heading3,
  Quote: Quote,
};
function Stijlen({ uitgebreid }: { uitgebreid?: boolean }) {
  const opdracht = useDocxCommand("paragraphStyle");
  const opties = opdracht.state.options ?? [];
  const voorkeur = (
    uitgebreid
      ? [
          "Normal",
          "Title",
          "Subtitle",
          "Heading1",
          "Heading2",
          "Heading3",
          "Quote",
        ]
      : ["Normal", "Heading1", "Heading2"]
  )
    .map((id) => opties.find((optie) => optie.args.styleId === id))
    .filter((optie) => optie !== undefined);
  return (
    <Groep naam="Stijlen" className="ribbon-stijlen">
      <div className="ribbon-stijlgalerij">
        {(voorkeur.length ? voorkeur : opties.slice(0, 3)).map(
          (optie, index) => (
            <WS
              key={optie.args.styleId}
              id="paragraphStyle"
              args={optie.args}
              naam={optie.label}
              icoon={
                stijlIconen[optie.args.styleId] ?? (index ? Type : Pilcrow)
              }
              sneltoets={stijlSneltoetsen[optie.args.styleId]}
              groot
            />
          ),
        )}
      </div>
      <WK id="paragraphStyle" naam="Alle stijlen" breed />
    </Groep>
  );
}
function Klembord({ opdrachten }: { opdrachten: Opdrachten }) {
  return (
    <Groep naam="Klembord">
      <EigenKnop
        naam="Plakken"
        icoon={ClipboardPaste}
        groot
        disabled={!opdrachten.bewerkbaar}
        uitleg="als ongeopmaakte tekst; Ctrl+V plakt met opmaak"
        onClick={opdrachten.plakken}
      />
      <div className="ribbon-stapel">
        <EigenKnop
          naam="Knippen"
          icoon={Scissors}
          sneltoets="Ctrl+X"
          disabled={!opdrachten.bewerkbaar}
          onClick={() => opdrachten.klembord("cut")}
        />
        <EigenKnop
          naam="Kopiëren"
          icoon={Copy}
          sneltoets="Ctrl+C"
          onClick={() => opdrachten.klembord("copy")}
        />
      </div>
    </Groep>
  );
}
function OpmaakWissen() {
  return (
    <Groep naam="Opmaak">
      <WS
        id="clearFormatting"
        naam="Opmaak wissen"
        icoon={Eraser}
        sneltoets="Ctrl+M"
        groot
      />
    </Groep>
  );
}
function Zoeken({ groot }: { groot?: boolean }) {
  const knoppen = (
    <>
      <W id="find" naam="Zoeken" icoon={Search} groot={groot} />
      <W
        id="replace"
        naam="Zoeken en vervangen"
        icoon={Replace}
        groot={groot}
      />
    </>
  );
  return (
    <Groep naam="Zoeken">
      {groot ? knoppen : <div className="ribbon-stapel">{knoppen}</div>}
    </Groep>
  );
}
function WoordenTellen({ opdrachten }: { opdrachten: Opdrachten }) {
  return (
    <EigenKnop
      naam="Woorden tellen"
      icoon={WholeWord}
      groot
      onClick={() => opdrachten.setDialoog("woorden")}
    />
  );
}
function Opmerking({ opdrachten }: { opdrachten: Opdrachten }) {
  return (
    <EigenKnop
      naam="Opmerking"
      icoon={MessageSquarePlus}
      groot
      sneltoets="Ctrl+Alt+C"
      disabled={!opdrachten.bewerkbaar}
      onClick={() => opdrachten.setDialoog("opmerking")}
    />
  );
}
function Afdrukken() {
  return (
    <Groep naam="Afdrukken">
      <Actie
        naam="Afdrukken"
        icoon={Printer}
        title="Afdrukvoorbeeld en afdrukken (Ctrl+P)"
        groot
        onClick={() => vraagAfdrukvoorbeeld()}
      />
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
      zichtbaarElement<HTMLElement>(
        ".office-tekst .docx-editor__scroll-container",
      ),
    koppeling: zoomKoppeling,
    // ‘Passend’: de paginabreedte vult het venster.
    pasBreedte: () =>
      zichtbaarElement<HTMLElement>(".office-tekst .canvas-page")?.getBoundingClientRect()
        .width ?? null,
  });
  const opdrachten = useTekstOpdrachten({ wijzigLiniaal, wijzigNavigatie });
  const grafieken = useIngeslotenGrafieken("docx");
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
          <Groep naam="Selecteren">
            <div className="ribbon-stapel">
              <W
                id="tableAction"
                args="selectRow"
                naam="Rij selecteren"
                icoon={Rows3}
              />
              <W
                id="tableAction"
                args="selectColumn"
                naam="Kolom selecteren"
                icoon={Columns2}
              />
              <W
                id="tableAction"
                args="selectTable"
                naam="Tabel selecteren"
                icoon={Table2}
              />
            </div>
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
    <TekstOpmaakProvider>
      <Ribbon
        bestand={bestand}
        tabs={[
          {
            id: "start",
            naam: "Start",
            inhoud: (
              <>
                <Geschiedenis soort="tekst" />
                <Klembord opdrachten={opdrachten} />
                <TekstLettertype />
                <TekstAlinea />
                <Stijlen />
                <OpmaakWissen />
                <Zoeken />
              </>
            ),
          },
          {
            id: "invoegen",
            naam: "Invoegen",
            inhoud: (
              <>
                <Groep naam="Pagina’s">
                  <WS
                    id="insertPageBreak"
                    naam="Pagina-einde"
                    icoon={FilePlus2}
                    sneltoets="Ctrl+Enter"
                    groot
                  />
                </Groep>
                <Groep naam="Tabellen">
                  <TabelKiezer />
                </Groep>
                <Groep naam="Illustraties">
                  <W id="insertImage" naam="Afbeelding" icoon={Image} groot />
                </Groep>
                <GrafiekGroep g={grafieken} uit={!opdrachten.bewerkbaar} />
                <Groep naam="Koppelingen">
                  <W id="insertLink" naam="Hyperlink" icoon={Link} groot />
                </Groep>
                <Groep naam="Opmerkingen">
                  <Opmerking opdrachten={opdrachten} />
                </Groep>
                <Groep naam="Tekst">
                  <EigenKnop
                    naam="Speciaal teken"
                    icoon={Omega}
                    groot
                    disabled={!opdrachten.bewerkbaar}
                    onClick={() => opdrachten.setDialoog("teken")}
                  />
                  <div className="ribbon-stapel">
                    <EigenKnop
                      naam="Datum"
                      icoon={CalendarDays}
                      uitleg="Voegt de datum van vandaag in als tekst"
                      disabled={!opdrachten.bewerkbaar}
                      onClick={() => opdrachten.voegIn(datumTekst(new Date()))}
                    />
                    <EigenKnop
                      naam="Tijd"
                      icoon={Clock}
                      uitleg="Voegt de huidige tijd in als tekst"
                      disabled={!opdrachten.bewerkbaar}
                      onClick={() => opdrachten.voegIn(tijdTekst(new Date()))}
                    />
                  </div>
                </Groep>
              </>
            ),
          },
          {
            id: "opmaak",
            naam: "Opmaak",
            inhoud: (
              <>
                <Groep naam="Tekenopmaak">
                  <div className="ribbon-rij ribbon-iconen">
                    <W id="bold" naam="Vet" icoon={Bold} />
                    <W id="italic" naam="Cursief" icoon={Italic} />
                    <W id="underline" naam="Onderstrepen" icoon={Underline} />
                    <EigenKnop
                      naam="Dubbel onderstrepen"
                      icoon={Baseline}
                      sneltoets="Ctrl+D"
                      disabled={!opdrachten.bewerkbaar}
                      onClick={() => void opdrachten.dubbelOnderstrepen()}
                    />
                  </div>
                  <div className="ribbon-rij ribbon-iconen">
                    <W
                      id="strikethrough"
                      naam="Doorhalen"
                      icoon={Strikethrough}
                    />
                    <WS
                      id="superscript"
                      naam="Superscript"
                      icoon={Superscript}
                      sneltoets="Ctrl+Shift+P"
                    />
                    <WS
                      id="subscript"
                      naam="Subscript"
                      icoon={Subscript}
                      sneltoets="Ctrl+Shift+B"
                    />
                  </div>
                </Groep>
                <Groep naam="Hoofdletters">
                  <div className="ribbon-rij ribbon-iconen">
                    {hoofdletterKnoppen
                      .slice(0, 3)
                      .map(({ soort, ...knop }) => (
                        <EigenKnop
                          key={soort}
                          {...knop}
                          disabled={!opdrachten.bewerkbaar}
                          onClick={() => void opdrachten.hoofdletters(soort)}
                        />
                      ))}
                  </div>
                  <div className="ribbon-rij ribbon-iconen">
                    {hoofdletterKnoppen.slice(3).map(({ soort, ...knop }) => (
                      <EigenKnop
                        key={soort}
                        {...knop}
                        disabled={!opdrachten.bewerkbaar}
                        onClick={() => void opdrachten.hoofdletters(soort)}
                      />
                    ))}
                  </div>
                </Groep>
                <OpmaakWissen />
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
            id: "stijlen",
            naam: "Stijlen",
            inhoud: (
              <>
                <Stijlen uitgebreid />
                <OpmaakWissen />
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
                    naam="Pagina-opmaak"
                    icoon={LayoutTemplate}
                    groot
                  />
                  <W id="watermark" naam="Watermerk" icoon={Stamp} groot />
                </Groep>
                <Groep naam="Pagina-achtergrond">
                  <PaginaAchtergrondKnoppen />
                </Groep>
                <Groep naam="Eindes">
                  <WS
                    id="insertPageBreak"
                    naam="Pagina-einde"
                    icoon={FilePlus2}
                    sneltoets="Ctrl+Enter"
                    groot
                  />
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
                <AfstandGroep />
                <Groep naam="Regelafstand">
                  <WK id="lineSpacing" naam="Regelafstand" breed />
                </Groep>
              </>
            ),
          },
          {
            id: "controleren",
            naam: "Controleren",
            inhoud: (
              <>
                <Groep naam="Taal">
                  <WoordenTellen opdrachten={opdrachten} />
                </Groep>
                <Groep naam="Opmerkingen">
                  <Opmerking opdrachten={opdrachten} />
                  <W
                    id="commentsSidebar"
                    naam="Opmerkingen tonen"
                    icoon={MessageSquare}
                    groot
                  />
                </Groep>
                <Groep naam="Wijzigingen bijhouden">
                  <EigenKnop
                    naam="Opnemen"
                    icoon={PenLine}
                    groot
                    actief={opdrachten.opnemen}
                    uitleg="Wijzigingen bijhouden"
                    sneltoets="Ctrl+Shift+C"
                    onClick={opdrachten.wisselOpnemen}
                  />
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
                <Zoeken groot />
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
                    title="Liniaal · Ctrl+Shift+R"
                    onClick={wijzigLiniaal}
                  />
                  <Actie
                    icoon={PanelLeft}
                    naam="Navigator"
                    groot
                    actief={navigatie}
                    title="Navigator · F5"
                    onClick={wijzigNavigatie}
                  />
                </Groep>
                <Groep naam="Navigeren">
                  <EigenKnop
                    naam="Ga naar pagina"
                    icoon={ArrowDownToLine}
                    groot
                    onClick={() => opdrachten.setDialoog("pagina")}
                  />
                </Groep>
                <Zoom opdracht={zoom} />
                <Afdrukken />
              </>
            ),
          },
          {
            id: "extra",
            naam: "Extra",
            inhoud: (
              <>
                <Groep naam="Extra">
                  <WoordenTellen opdrachten={opdrachten} />
                </Groep>
                <Groep naam="Tekens">
                  <EigenKnop
                    naam="Speciaal teken"
                    icoon={Omega}
                    groot
                    disabled={!opdrachten.bewerkbaar}
                    onClick={() => opdrachten.setDialoog("teken")}
                  />
                </Groep>
              </>
            ),
          },
          ...contextTabs,
        ]}
      />
      <TekstDialogen opdrachten={opdrachten} />
      <TekstStatus opdrachten={opdrachten} />
      {grafieken.venster}
    </TekstOpmaakProvider>
  );
}
