import { useContext, useEffect, useReducer, useState } from "react";
import { vraagAfdrukvoorbeeld } from "../afdrukken/openen";
import {
  useXlsxCommand,
  EditorToolbar as RekenbladToolbar,
  ToolbarCommand as RekenbladControl,
  type XlsxCommandArgs,
  type XlsxCommandId,
  type XlsxEditorApi,
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
  Scissors,
  Copy,
  ClipboardPaste,
  Search,
  Compass,
  ArrowUpAZ,
  ArrowDownZA,
  Sigma,
  CalendarDays,
  Clock,
  BetweenHorizontalStart,
  BetweenHorizontalEnd,
  BetweenVerticalStart,
  BetweenVerticalEnd,
  Trash2,
  EyeOff,
  Eye,
  SquarePlus,
  PenLine,
  ChevronLeft,
  ChevronRight,
  Snowflake,
  PanelTop,
  PanelLeft,
  ArrowDownToLine,
  Hash,
  FlaskConical,
  Baseline,
  type LucideIcon,
} from "lucide-react";
import {
  Ribbon,
  Groep,
  Actie,
  OpdrachtKleur,
  OpdrachtGetal,
  OpdrachtKnop,
  RibbonFout,
} from "../Ribbon";
import { useDocumentZoom, type ZoomKoppeling } from "../useDocumentZoom";
import { C, CK, Geschiedenis, Zoom } from "./gedeeld";
import { useEditorApi, zichtbaarElement } from "./editorApi";
import { useSneltoetsen, type Sneltoets } from "./sneltoetsen";
import {
  alleenLezen,
  autoSomInvoegen,
  bewerktTekst,
  bladInvoegen,
  bladVerwijderen,
  datumnotatie,
  datumTijdInvoegen,
  doorvoerenOmlaag,
  fixeren,
  gaNaarBlad,
  klembord,
  kolommenInvoegen,
  kolommenVerwijderen,
  kolommenZichtbaarheid,
  rekenbladHost,
  rijenInvoegen,
  rijenVerwijderen,
  rijenZichtbaarheid,
  sorteren,
} from "./rekenblad-opdrachten";
import { BladHernoemen, GaNaar, ZoekenVervangen } from "./rekenblad-dialogen";
import {
  Grafiekontwerp,
  RekenbladGrafiekGroep,
  useRekenbladGrafieken,
} from "../grafieken/ui/rekenblad";
import "./rekenblad.css";

type Paneel = "zoeken" | "ganaar" | "hernoemen" | null;

function useStand(api: XlsxEditorApi | null) {
  const [, ververs] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!api) return;
    const stopOpdrachten = api.commands.subscribe(ververs);
    const stopWijzigingen = api.handle.onUpdate(() => ververs());
    return () => {
      stopOpdrachten();
      stopWijzigingen();
    };
  }, [api]);
  if (!api) return null;
  const info = api.handle.sheetInfo();
  return {
    bladen: info.sheetNames.length,
    actief: info.activeSheet,
    bevroren: info.frozenRows + info.frozenCols > 0,
    schrijfbaar: !alleenLezen(api),
  };
}

function useUitvoerder() {
  const api = useEditorApi().rekenblad;
  const fout = useContext(RibbonFout);
  return (actie: (api: XlsxEditorApi) => unknown) => {
    if (!api) return;
    Promise.resolve()
      .then(() => actie(api))
      .catch((e) => fout(e instanceof Error ? e.message : String(e)));
  };
}

function A({
  naam,
  icoon,
  toets,
  groot,
  uit,
  doe,
}: {
  naam: string;
  icoon: LucideIcon;
  toets?: string;
  groot?: boolean;
  uit?: boolean;
  doe: (api: XlsxEditorApi) => unknown;
}) {
  const uitvoeren = useUitvoerder();
  const api = useEditorApi().rekenblad;
  return (
    <Actie
      naam={naam}
      icoon={icoon}
      groot={groot}
      disabled={!api || uit}
      title={toets ? `${naam} · ${toets}` : naam}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => uitvoeren(doe)}
    />
  );
}

/** Engine-opdracht met een sneltoets die wij registreren. */
function CS<K extends XlsxCommandId>({
  id,
  args,
  toets,
  ...props
}: {
  id: K;
  args?: XlsxCommandArgs[K];
  toets: string;
  naam: string;
  icoon: LucideIcon;
  groot?: boolean;
}) {
  const opdracht = useXlsxCommand(id, args);
  return (
    <OpdrachtKnop {...props} opdracht={{ ...opdracht, shortcut: toets }} />
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
        <CS
          id="horizontalAlignment"
          args={{ value: "left" }}
          naam="Links uitlijnen"
          icoon={AlignLeft}
          toets="Ctrl+L"
        />
        <CS
          id="horizontalAlignment"
          args={{ value: "center" }}
          naam="Centreren"
          icoon={AlignCenter}
          toets="Ctrl+E"
        />
        <CS
          id="horizontalAlignment"
          args={{ value: "right" }}
          naam="Rechts uitlijnen"
          icoon={AlignRight}
          toets="Ctrl+R"
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
function RekenbladGetal({ uitgebreid }: { uitgebreid?: boolean }) {
  return (
    <Groep naam="Getal">
      <CK id="numberFormat" naam="Getalnotatie" breed />
      <div className="ribbon-rij ribbon-iconen">
        {uitgebreid && (
          <>
            <CS
              id="numberFormat"
              args={{ value: "number" }}
              naam="Getal"
              icoon={Hash}
              toets="Ctrl+Shift+1"
            />
            <CS
              id="numberFormat"
              args={{ value: "scientific" }}
              naam="Wetenschappelijk"
              icoon={FlaskConical}
              toets="Ctrl+Shift+2"
            />
            <A
              naam="Datum"
              icoon={CalendarDays}
              toets="Ctrl+Shift+3"
              doe={datumnotatie}
            />
          </>
        )}
        <CS
          id="numberFormat"
          args={{ value: "currency" }}
          naam="Valuta"
          icoon={Euro}
          toets="Ctrl+Shift+4"
        />
        <CS
          id="numberFormat"
          args={{ value: "percent" }}
          naam="Percentage"
          icoon={Percent}
          toets="Ctrl+Shift+5"
        />
        {uitgebreid && (
          <CS
            id="numberFormat"
            args={{ value: "automatic" }}
            naam="Standaard"
            icoon={Baseline}
            toets="Ctrl+Shift+6"
          />
        )}
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
function Klembord() {
  return (
    <Groep naam="Klembord">
      <A
        naam="Plakken"
        icoon={ClipboardPaste}
        toets="Ctrl+V"
        groot
        doe={(api) => klembord(api, "v")}
      />
      <div className="ribbon-stapel">
        <A
          naam="Knippen"
          icoon={Scissors}
          toets="Ctrl+X"
          doe={(api) => klembord(api, "x")}
        />
        <A
          naam="Kopiëren"
          icoon={Copy}
          toets="Ctrl+C"
          doe={(api) => klembord(api, "c")}
        />
      </div>
      <C id="paintFormat" naam="Opmaak kopiëren" icoon={Paintbrush} groot />
    </Groep>
  );
}
function Cellen({ uit }: { uit: boolean }) {
  return (
    <>
      <Groep naam="Rijen">
        <div className="ribbon-stapel">
          <A
            naam="Rijen boven invoegen"
            icoon={BetweenHorizontalStart}
            uit={uit}
            doe={(api) => rijenInvoegen(api, false)}
          />
          <A
            naam="Rijen onder invoegen"
            icoon={BetweenHorizontalEnd}
            uit={uit}
            doe={(api) => rijenInvoegen(api, true)}
          />
        </div>
      </Groep>
      <Groep naam="Kolommen">
        <div className="ribbon-stapel">
          <A
            naam="Kolommen links invoegen"
            icoon={BetweenVerticalStart}
            uit={uit}
            doe={(api) => kolommenInvoegen(api, false)}
          />
          <A
            naam="Kolommen rechts invoegen"
            icoon={BetweenVerticalEnd}
            uit={uit}
            doe={(api) => kolommenInvoegen(api, true)}
          />
        </div>
      </Groep>
    </>
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
      zichtbaarElement<HTMLElement>(
        '.office-rekenblad-host [data-testid="xlsx-scroll"]',
      ),
    bereik: ".rekenblad-koppen",
    koppeling: zoomKoppeling,
  });
  const api = useEditorApi().rekenblad;
  const stand = useStand(api);
  const uitvoeren = useUitvoerder();
  const fout = useContext(RibbonFout);
  const [paneel, setPaneel] = useState<Paneel>(null);
  const uit = !stand?.schrijfbaar;
  const grafieken = useRekenbladGrafieken();
  const sluiten = () => {
    setPaneel(null);
    api?.focus();
  };

  const opdracht =
    <K extends XlsxCommandId>(id: K, args: XlsxCommandArgs[K]) =>
    () =>
      uitvoeren(async (api) => {
        const r = await api.commands.execute(id, args);
        if (!r.ok) fout(r.failure.message);
      });
  const geenTekst = () => !bewerktTekst();
  const sneltoetsen: Sneltoets[] = [
    ["Ctrl+L", "left"],
    ["Ctrl+E", "center"],
    ["Ctrl+R", "right"],
  ].map(([toets, value]) => ({
    toets,
    beschikbaar: geenTekst,
    uitvoeren: opdracht("horizontalAlignment", {
      value: value as "left" | "center" | "right",
    }),
  }));
  (
    [
      ["1", "number"],
      ["2", "scientific"],
      ["4", "currency"],
      ["5", "percent"],
      ["6", "automatic"],
    ] as const
  ).forEach(([cijfer, value]) =>
    sneltoetsen.push({
      toets: `Ctrl+Shift+${cijfer}`,
      beschikbaar: geenTekst,
      uitvoeren: opdracht("numberFormat", { value }),
    }),
  );
  sneltoetsen.push(
    {
      toets: "Ctrl+Shift+3",
      beschikbaar: geenTekst,
      uitvoeren: () => uitvoeren(datumnotatie),
    },
    {
      toets: "Alt+=",
      beschikbaar: geenTekst,
      uitvoeren: () => uitvoeren(autoSomInvoegen),
    },
    {
      toets: "Ctrl+;",
      uitvoeren: () => uitvoeren((a) => datumTijdInvoegen(a, false)),
    },
    {
      toets: "Ctrl+Shift+;",
      uitvoeren: () => uitvoeren((a) => datumTijdInvoegen(a, true)),
    },
    {
      toets: "Ctrl+Shift+:",
      uitvoeren: () => uitvoeren((a) => datumTijdInvoegen(a, true)),
    },
    {
      toets: "Ctrl+D",
      beschikbaar: geenTekst,
      uitvoeren: () => uitvoeren(doorvoerenOmlaag),
    },
    {
      toets: "Ctrl+PageUp",
      beschikbaar: geenTekst,
      uitvoeren: () =>
        uitvoeren((a) => gaNaarBlad(a, a.handle.sheetInfo().activeSheet - 1)),
    },
    {
      toets: "Ctrl+PageDown",
      beschikbaar: geenTekst,
      uitvoeren: () =>
        uitvoeren((a) => gaNaarBlad(a, a.handle.sheetInfo().activeSheet + 1)),
    },
    { toets: "Ctrl+H", uitvoeren: () => setPaneel("zoeken") },
    { toets: "Ctrl+F", uitvoeren: () => setPaneel("zoeken") },
    { toets: "F5", uitvoeren: () => setPaneel("ganaar") },
    { toets: "Ctrl+Shift+F5", uitvoeren: () => setPaneel("ganaar") },
    { toets: "Ctrl+P", uitvoeren: () => vraagAfdrukvoorbeeld() },
    { toets: "Ctrl+Shift+O", uitvoeren: () => vraagAfdrukvoorbeeld() },
    // Zoals Excel: Alt+F1 op dit blad, F11 op een nieuw blad.
    {
      toets: "Alt+F1",
      beschikbaar: () => !uit,
      uitvoeren: () => grafieken.invoegen(),
    },
    {
      toets: "F11",
      beschikbaar: () => !uit,
      uitvoeren: () => grafieken.invoegen(true),
    },
  );
  useSneltoetsen(rekenbladHost, api ? sneltoetsen : []);

  const zoeken = (
    <Groep naam="Zoeken">
      <Actie
        naam="Zoeken en vervangen"
        icoon={Search}
        groot
        disabled={!api}
        title="Zoeken en vervangen · Ctrl+H"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setPaneel("zoeken")}
      />
    </Groep>
  );
  const navigator = (
    <Groep naam="Navigator">
      <Actie
        naam="Navigator"
        icoon={Compass}
        groot
        disabled={!api}
        title="Navigator: ga naar cel of benoemd bereik · F5"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setPaneel("ganaar")}
      />
    </Groep>
  );
  const functies = (
    <Groep naam="Functie">
      <A
        naam="AutoSom"
        icoon={Sigma}
        toets="Alt+="
        groot
        uit={uit}
        doe={autoSomInvoegen}
      />
      <div className="ribbon-stapel">
        <A
          naam="Datum"
          icoon={CalendarDays}
          toets="Ctrl+;"
          uit={uit}
          doe={(a) => datumTijdInvoegen(a, false)}
        />
        <A
          naam="Tijd"
          icoon={Clock}
          toets="Ctrl+Shift+;"
          uit={uit}
          doe={(a) => datumTijdInvoegen(a, true)}
        />
      </div>
    </Groep>
  );
  const bladen = (
    <Groep naam="Blad">
      <A
        naam="Blad invoegen"
        icoon={SquarePlus}
        groot
        uit={uit}
        doe={bladInvoegen}
      />
      <div className="ribbon-stapel">
        <A
          naam="Blad hernoemen"
          icoon={PenLine}
          uit={uit}
          doe={() => setPaneel("hernoemen")}
        />
        <A
          naam="Blad verwijderen"
          icoon={Trash2}
          uit={uit || (stand?.bladen ?? 0) < 2}
          doe={bladVerwijderen}
        />
      </div>
    </Groep>
  );

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
                <Klembord />
                <RekenbladLettertype />
                <RekenbladUitlijning />
                <RekenbladGetal />
                <Groep naam="Celranden">
                  <div className="ribbon-ingebouwd">
                    <RekenbladControl id="borderPreset" />
                    <span>Randen</span>
                  </div>
                </Groep>
                {zoeken}
              </>
            ),
          },
          {
            id: "invoegen",
            naam: "Invoegen",
            inhoud: (
              <>
                <Cellen uit={uit} />
                {bladen}
                {functies}
                <RekenbladGrafiekGroep g={grafieken} uit={uit} />
              </>
            ),
          },
          {
            id: "opmaak",
            naam: "Opmaak",
            inhoud: (
              <>
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
                <RekenbladGetal uitgebreid />
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
            id: "blad",
            naam: "Blad",
            inhoud: (
              <>
                <Cellen uit={uit} />
                <Groep naam="Verwijderen">
                  <div className="ribbon-stapel">
                    <A
                      naam="Rijen verwijderen"
                      icoon={Trash2}
                      uit={uit}
                      doe={rijenVerwijderen}
                    />
                    <A
                      naam="Kolommen verwijderen"
                      icoon={Trash2}
                      uit={uit}
                      doe={kolommenVerwijderen}
                    />
                  </div>
                </Groep>
                <Groep naam="Verbergen">
                  <div className="ribbon-stapel">
                    <A
                      naam="Rijen verbergen"
                      icoon={EyeOff}
                      uit={uit}
                      doe={(a) => rijenZichtbaarheid(a, true)}
                    />
                    <A
                      naam="Rijen tonen"
                      icoon={Eye}
                      uit={uit}
                      doe={(a) => rijenZichtbaarheid(a, false)}
                    />
                  </div>
                  <div className="ribbon-stapel">
                    <A
                      naam="Kolommen verbergen"
                      icoon={EyeOff}
                      uit={uit}
                      doe={(a) => kolommenZichtbaarheid(a, true)}
                    />
                    <A
                      naam="Kolommen tonen"
                      icoon={Eye}
                      uit={uit}
                      doe={(a) => kolommenZichtbaarheid(a, false)}
                    />
                  </div>
                </Groep>
                {bladen}
                <Groep naam="Navigeren">
                  <div className="ribbon-stapel">
                    <A
                      naam="Vorig blad"
                      icoon={ChevronLeft}
                      toets="Ctrl+Page Up"
                      uit={!stand || stand.actief === 0}
                      doe={(a) =>
                        gaNaarBlad(a, a.handle.sheetInfo().activeSheet - 1)
                      }
                    />
                    <A
                      naam="Volgend blad"
                      icoon={ChevronRight}
                      toets="Ctrl+Page Down"
                      uit={!stand || stand.actief >= stand.bladen - 1}
                      doe={(a) =>
                        gaNaarBlad(a, a.handle.sheetInfo().activeSheet + 1)
                      }
                    />
                  </div>
                </Groep>
              </>
            ),
          },
          {
            id: "gegevens",
            naam: "Gegevens",
            inhoud: (
              <>
                <Groep naam="Sorteren">
                  <A
                    naam="Oplopend sorteren"
                    icoon={ArrowUpAZ}
                    groot
                    uit={uit}
                    doe={(a) => sorteren(a, false)}
                  />
                  <A
                    naam="Aflopend sorteren"
                    icoon={ArrowDownZA}
                    groot
                    uit={uit}
                    doe={(a) => sorteren(a, true)}
                  />
                </Groep>
                <Groep naam="Doorvoeren">
                  <A
                    naam="Naar beneden"
                    icoon={ArrowDownToLine}
                    toets="Ctrl+D"
                    groot
                    uit={uit}
                    doe={doorvoerenOmlaag}
                  />
                </Groep>
                {functies}
              </>
            ),
          },
          {
            id: "beeld",
            naam: "Beeld",
            inhoud: (
              <>
                <Zoom opdracht={zoom} />
                <Groep naam="Vensters fixeren">
                  <A
                    naam={
                      stand?.bevroren
                        ? "Fixeren opheffen"
                        : "Rijen en kolommen fixeren"
                    }
                    icoon={Snowflake}
                    groot
                    uit={uit}
                    doe={(a) =>
                      fixeren(a, stand?.bevroren ? "opheffen" : "cel")
                    }
                  />
                  <div className="ribbon-stapel">
                    <A
                      naam="Eerste rij fixeren"
                      icoon={PanelTop}
                      uit={uit}
                      doe={(a) => fixeren(a, "rij")}
                    />
                    <A
                      naam="Eerste kolom fixeren"
                      icoon={PanelLeft}
                      uit={uit}
                      doe={(a) => fixeren(a, "kolom")}
                    />
                  </div>
                </Groep>
                {navigator}
                <Groep naam="Uitvoer">
                  <Actie
                    naam="Afdrukken"
                    icoon={Printer}
                    title="Afdrukvoorbeeld en afdrukken (Ctrl+P)"
                    groot
                    onClick={() => vraagAfdrukvoorbeeld()}
                  />
                  <C
                    id="exportPng"
                    naam="Afbeelding exporteren"
                    icoon={Download}
                    groot
                  />
                </Groep>
              </>
            ),
          },
          {
            id: "extra",
            naam: "Extra",
            inhoud: (
              <>
                {zoeken}
                {navigator}
              </>
            ),
          },
          ...(grafieken.geselecteerd
            ? [
                {
                  id: "grafiekontwerp",
                  naam: "Grafiekontwerp",
                  inhoud: <Grafiekontwerp g={grafieken} uit={uit} />,
                },
              ]
            : []),
        ]}
      />
      <div className="office-formulebalk">
        <RekenbladToolbar.FormulaBar />
      </div>
      {api && paneel === "zoeken" && (
        <ZoekenVervangen api={api} sluiten={sluiten} />
      )}
      {api && paneel === "ganaar" && <GaNaar api={api} sluiten={sluiten} />}
      {api && paneel === "hernoemen" && (
        <BladHernoemen api={api} sluiten={sluiten} />
      )}
      {grafieken.venster}
    </RekenbladToolbar>
  );
}
