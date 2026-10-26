import {
  useXlsxCommand,
  EditorToolbar as RekenbladToolbar,
  ToolbarCommand as RekenbladControl,
} from "@betteroffice/xlsx-react";
import {
  Bold,
  Italic,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  IndentIncrease,
  IndentDecrease,
  Type,
  Printer,
  Percent,
  Euro,
  Paintbrush,
  PaintBucket,
  Grid2X2,
  WrapText,
  Download,
} from "lucide-react";
import { Ribbon, Groep, OpdrachtKleur, OpdrachtGetal } from "../Ribbon";
import { useDocumentZoom, type ZoomKoppeling } from "../useDocumentZoom";
import { C, CK, Geschiedenis, Zoom } from "./gedeeld";

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
