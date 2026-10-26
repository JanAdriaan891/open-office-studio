import {
  usePptxCommand,
  ToolbarCommand as DiaControl,
} from "@betteroffice/pptx-react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
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
} from "lucide-react";
import { Ribbon, Groep, OpdrachtKleur, OpdrachtGetal } from "../Ribbon";
import { useDocumentZoom, type ZoomKoppeling } from "../useDocumentZoom";
import { P, PK, Geschiedenis, Zoom, scrollvlakVan } from "./gedeeld";

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
