import { useEffect, useState } from "react";
import { zichtbaarElement } from "./editorApi";
import {
  usePptxCommand,
  ToolbarCommand as DiaControl,
  type PptxCommandArgs,
  type PptxCommandId,
} from "@betteroffice/pptx-react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  Eraser,
  Type,
  Image,
  FilePlus2,
  PaintBucket,
  MonitorPlay,
  MousePointer2,
  Square,
  ArrowUpToLine,
  ArrowDownToLine,
  BringToFront,
  SendToBack,
  Maximize,
  Download,
  Circle,
  RectangleHorizontal,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  StickyNote,
  Play,
  X,
  Printer,
  NotebookText,
} from "lucide-react";
import {
  Actie,
  Ribbon,
  Groep,
  OpdrachtKleur,
  OpdrachtGetal,
  OpdrachtKnop,
} from "../Ribbon";
import { useDocumentZoom, type ZoomKoppeling } from "../useDocumentZoom";
import { P, PK, PL, Geschiedenis, Zoom, scrollvlakVan, type Knop } from "./gedeeld";
import { useDiaActies, DiaKnop, type DiaActies } from "./presentatie-acties";
import { specialeTekens } from "./presentatie-opdrachten";
import {
  DiaGrafiekontwerp,
  GrafiekGroep,
  useIngeslotenGrafieken,
} from "../grafieken/ui/ingesloten";
import { vraagAfdrukvoorbeeld } from "../afdrukken/openen";
import "./presentatie.css";

/** Een engine-opdracht met een sneltoets die het lint zelf afhandelt. */
function PT<K extends PptxCommandId>({
  id,
  args,
  toets,
  ...props
}: Knop & { id: K; args?: PptxCommandArgs[K]; toets: string }) {
  const opdracht = usePptxCommand(id, args);
  return (
    <OpdrachtKnop {...props} opdracht={{ ...opdracht, shortcut: toets }} />
  );
}

function DiaLettertype() {
  const grootte = usePptxCommand("fontSize"),
    kleur = usePptxCommand("textColor");
  return (
    <Groep naam="Lettertype">
      <div className="ribbon-rij">
        <PL />
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
        <PT
          id="alignment"
          args={{ value: "l" }}
          naam="Links uitlijnen"
          icoon={AlignLeft}
          toets="Ctrl+L"
        />
        <PT
          id="alignment"
          args={{ value: "ctr" }}
          naam="Centreren"
          icoon={AlignCenter}
          toets="Ctrl+E"
        />
        <PT
          id="alignment"
          args={{ value: "r" }}
          naam="Rechts uitlijnen"
          icoon={AlignRight}
          toets="Ctrl+R"
        />
        <PT
          id="alignment"
          args={{ value: "just" }}
          naam="Uitvullen"
          icoon={AlignJustify}
          toets="Ctrl+J"
        />
      </div>
    </Groep>
  );
}
function NieuweDia() {
  return (
    <>
      <PT
        id="insertSlide"
        args={{}}
        naam="Nieuwe dia"
        icoon={FilePlus2}
        toets="Ctrl+M"
        groot
      />
      <PK id="insertSlide" naam="Nieuwe dia met indeling" breed />
    </>
  );
}
function Voorstelling({ acties }: { acties: DiaActies }) {
  return (
    <Groep naam="Diavoorstelling">
      <DiaKnop
        naam="Vanaf eerste dia"
        icoon={MonitorPlay}
        toets="F5"
        groot
        uit={!acties.actief}
        onClick={() => acties.voorstelling(true)}
      />
      <DiaKnop
        naam="Vanaf huidige dia"
        icoon={Play}
        toets="Shift+F5"
        groot
        uit={!acties.actief}
        onClick={() => acties.voorstelling(false)}
      />
    </Groep>
  );
}
function DiaVerwijderen({ acties }: { acties: DiaActies }) {
  return (
    <DiaKnop
      naam="Dia verwijderen"
      icoon={Trash2}
      toets="Delete in het diapaneel"
      uit={!acties.bewerkbaar}
      onClick={acties.diaVerwijderen}
    />
  );
}
function DiaVerplaatsen({ acties }: { acties: DiaActies }) {
  const uit = !acties.bewerkbaar;
  return (
    <Groep naam="Dia verplaatsen">
      <div className="ribbon-stapel">
        <DiaKnop
          naam="Naar begin"
          icoon={ChevronsUp}
          toets="Ctrl+Shift+Home"
          uit={uit}
          onClick={() => acties.verplaatsen("begin")}
        />
        <DiaKnop
          naam="Omhoog"
          icoon={ChevronUp}
          toets="Ctrl+Shift+Page Up"
          uit={uit}
          onClick={() => acties.verplaatsen("omhoog")}
        />
      </div>
      <div className="ribbon-stapel">
        <DiaKnop
          naam="Omlaag"
          icoon={ChevronDown}
          toets="Ctrl+Shift+Page Down"
          uit={uit}
          onClick={() => acties.verplaatsen("omlaag")}
        />
        <DiaKnop
          naam="Naar einde"
          icoon={ChevronsDown}
          toets="Ctrl+Shift+End"
          uit={uit}
          onClick={() => acties.verplaatsen("einde")}
        />
      </div>
    </Groep>
  );
}
function DiaNavigatie({ acties }: { acties: DiaActies }) {
  const uit = !acties.actief;
  return (
    <Groep naam="Navigeren">
      <div className="ribbon-stapel">
        <DiaKnop
          naam="Eerste dia"
          icoon={ChevronFirst}
          toets="Home"
          uit={uit}
          onClick={() => acties.naarDia(() => 0)}
        />
        <DiaKnop
          naam="Vorige dia"
          icoon={ChevronLeft}
          toets="Page Up"
          uit={uit}
          onClick={() => acties.naarDia((i) => i - 1)}
        />
      </div>
      <div className="ribbon-stapel">
        <DiaKnop
          naam="Volgende dia"
          icoon={ChevronRight}
          toets="Page Down"
          uit={uit}
          onClick={() => acties.naarDia((i) => i + 1)}
        />
        <DiaKnop
          naam="Laatste dia"
          icoon={ChevronLast}
          toets="End"
          uit={uit}
          onClick={() => acties.naarDia((_, n) => n - 1)}
        />
      </div>
    </Groep>
  );
}
function Rangschikken() {
  return (
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
  );
}
function ObjectUitlijnen({ acties }: { acties: DiaActies }) {
  const uit = !acties.bewerkbaar;
  const knop = (
    naam: string,
    icoon: Knop["icoon"],
    wijze: Parameters<DiaActies["uitlijnen"]>[0],
  ) => (
    <DiaKnop
      naam={naam}
      icoon={icoon}
      uit={uit}
      onClick={() => acties.uitlijnen(wijze)}
    />
  );
  return (
    <Groep naam="Uitlijnen op dia">
      <div className="ribbon-rij ribbon-iconen">
        {knop("Links uitlijnen op dia", AlignStartVertical, "links")}
        {knop("Horizontaal centreren op dia", AlignCenterVertical, "centreren")}
        {knop("Rechts uitlijnen op dia", AlignEndVertical, "rechts")}
      </div>
      <div className="ribbon-rij ribbon-iconen">
        {knop("Boven uitlijnen op dia", AlignStartHorizontal, "boven")}
        {knop("Verticaal centreren op dia", AlignCenterHorizontal, "midden")}
        {knop("Onder uitlijnen op dia", AlignEndHorizontal, "onder")}
      </div>
    </Groep>
  );
}
function SpeciaalTeken({ acties }: { acties: DiaActies }) {
  return (
    <label className="ribbon-keuze ribbon-keuze-breed" title="Speciaal teken">
      <select
        aria-label="Speciaal teken"
        value=""
        disabled={!acties.bewerkbaar}
        onChange={(event) => {
          if (event.target.value) acties.tekstInvoegen(event.target.value);
        }}
      >
        <option value="">Speciaal teken…</option>
        {specialeTekens.map(({ teken, naam }) => (
          <option key={teken} value={teken}>
            {teken} {naam}
          </option>
        ))}
      </select>
      <ChevronDown size={12} />
    </label>
  );
}

/** Notitiepaneel van de engine tonen of verbergen, zoals Beeld › Notities. */
function useNotities() {
  const [zichtbaar, setZichtbaar] = useState(true);
  useEffect(() => {
    const wortel = zichtbaarElement<HTMLElement>(".office-presentatie");
    if (!wortel) return;
    if (zichtbaar) delete wortel.dataset.notities;
    else wortel.dataset.notities = "verborgen";
  }, [zichtbaar]);
  return [zichtbaar, () => setZichtbaar((nu) => !nu)] as const;
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
  const acties = useDiaActies();
  const grafieken = useIngeslotenGrafieken("pptx");
  const [notities, wisselNotities] = useNotities();
  const dia = () =>
    zichtbaarElement<HTMLElement>(
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
    <>
    {grafieken.venster}
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
                <NieuweDia />
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
                <DiaKnop
                  naam="Diavoorstelling"
                  icoon={MonitorPlay}
                  toets="F5"
                  groot
                  uit={!acties.actief}
                  onClick={() => acties.voorstelling(true)}
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
                <NieuweDia />
              </Groep>
              <Groep naam="Illustraties">
                <P id="insertImage" naam="Afbeelding" icoon={Image} groot />
                <div className="ribbon-stapel">
                  <PK id="tool" naam="Vormen en gereedschap" breed />
                </div>
              </Groep>
              <GrafiekGroep g={grafieken} uit={!acties.bewerkbaar} />
              <Groep naam="Tekst">
                <P
                  id="tool"
                  args={{ value: "textBox" }}
                  naam="Tekstvak"
                  icoon={Type}
                  groot
                />
                <div className="ribbon-stapel">
                  <DiaKnop
                    naam="Datum"
                    icoon={CalendarDays}
                    uit={!acties.bewerkbaar}
                    onClick={() => acties.datum("datum")}
                  />
                  <DiaKnop
                    naam="Tijd"
                    icoon={Clock}
                    uit={!acties.bewerkbaar}
                    onClick={() => acties.datum("tijd")}
                  />
                </div>
                <div className="ribbon-stapel">
                  <SpeciaalTeken acties={acties} />
                </div>
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
          id: "dia",
          naam: "Dia",
          inhoud: (
            <>
              <Groep naam="Dia’s">
                <NieuweDia />
                <DiaVerwijderen acties={acties} />
              </Groep>
              <DiaVerplaatsen acties={acties} />
              <DiaNavigatie acties={acties} />
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
              <Groep naam="Vorm aanpassen">
                <DiaControl id="shapeAdjustment" />
              </Groep>
              <DiaLettertype />
              <DiaUitlijning />
            </>
          ),
        },
        {
          id: "schikken",
          naam: "Schikken",
          inhoud: (
            <>
              <Rangschikken />
              <ObjectUitlijnen acties={acties} />
              <Groep naam="Object">
                <DiaKnop
                  naam="Verwijderen"
                  icoon={X}
                  toets="Delete"
                  groot
                  uit={!acties.bewerkbaar}
                  onClick={acties.vormVerwijderen}
                />
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
              <Groep naam="Werkruimte">
                <P
                  id="zoom"
                  args={{ scale: "fit" }}
                  naam="Passend maken"
                  icoon={Maximize}
                  groot
                />
                <DiaKnop
                  naam="Notities"
                  icoon={StickyNote}
                  groot
                  aan={notities}
                  onClick={wisselNotities}
                  uit={!acties.actief}
                />
                <P
                  id="tool"
                  args={{ value: "select" }}
                  naam="Selecteren"
                  icoon={MousePointer2}
                  groot
                />
              </Groep>
              <DiaNavigatie acties={acties} />
              <Groep naam="Uitvoer">
                <P
                  id="exportPng"
                  naam="Dia exporteren"
                  icoon={Download}
                  groot
                />
                <Actie
                  naam="Afdrukken"
                  icoon={Printer}
                  title="Afdrukvoorbeeld: dia’s, hand-outs of notitiepagina’s (Ctrl+P)"
                  groot
                  onClick={() => vraagAfdrukvoorbeeld()}
                />
                <Actie
                  naam="Notitiepagina’s"
                  icoon={NotebookText}
                  title="Notitiepagina’s afdrukken of als PDF bewaren"
                  groot
                  onClick={() => vraagAfdrukvoorbeeld({ indeling: "notities" })}
                />
              </Groep>
            </>
          ),
        },
        {
          id: "diavoorstelling",
          naam: "Diavoorstelling",
          inhoud: (
            <>
              <Voorstelling acties={acties} />
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
        ...(grafieken.geselecteerd
          ? [
              {
                id: "grafiekontwerp",
                naam: "Grafiekontwerp",
                inhoud: (
                  <DiaGrafiekontwerp g={grafieken} uit={!acties.bewerkbaar} />
                ),
              },
            ]
          : []),
      ]}
    />
    </>
  );
}
