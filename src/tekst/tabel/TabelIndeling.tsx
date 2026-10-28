/**
 * Lintgroepen voor Tabelopmaak (#48): celgrootte, uitlijning in de cel,
 * celmarges, kopregel herhalen, sorteren, omzetten en splitsen. De bewerkingen
 * staan in ./opdrachten.ts (Yrs-sessie) en ./pakket.ts (splitsen).
 */
import { useMemo, useState } from "react";
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownAZ,
  Columns3,
  Repeat2,
  Rows3,
  Scaling,
  SquareSplitVertical,
  TableProperties,
  WrapText,
  BetweenHorizontalStart,
  Table2,
} from "lucide-react";
import { useDocxCommand, type DocxEditorRef } from "@betteroffice/docx-react";
import { Groep } from "../../Ribbon";
import type { Herladen } from "../../lint/editorApi";
import { openVenster } from "../gedeeld/vensters";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { useEditorApi } from "../../lint/editorApi";
import { Keuzemenu, Maatveld, getalUit, toonGetal, useEditorTik, useUitvoeren } from "../gedeeld/ui";
import { engine } from "../gedeeld/engine";
import {
  celMarges,
  celUitlijning,
  geselecteerdeAlineas,
  kolommenGelijk,
  maakPassend,
  rijenGelijk,
  sorteer,
  tabelNaarTekst,
  tabelStaat,
  tabelTeksten,
  tekstNaarTabel,
  zetRijen,
  type TabelStaat,
} from "./opdrachten";
import { splitsTabel } from "./pakket";
import {
  cmNaarTwips,
  raadScheiding,
  raadSoort,
  tekstNaarCellen,
  twipsNaarCm,
  type Scheiding,
  type Sorteersleutel,
  type Sorteersoort,
} from "./logica";

/** Splitst de tabel boven de rij met de cursor (pakketroute, herladen). */
export async function splitsHuidigeTabel(ref: DocxEditorRef | null, herlaad: Herladen | null | undefined) {
  const e = engine(ref);
  const s = tabelStaat(ref);
  if (!s) throw new Error("Zet de cursor eerst in een tabel.");
  if (e.ref.commands.getState("editingMode").value === "suggesting")
    throw new Error("Zet ‘Wijzigingen bijhouden’ uit om een tabel te splitsen.");
  if (s.plek.tabel.story !== "body") throw new Error("Alleen tabellen in de hoofdtekst kunnen worden gesplitst.");
  if (!herlaad) throw new Error("Het document is nog niet gereed.");
  await e.ref.flushPendingInput();
  const bytes = await herlaad.bytes();
  herlaad.vervang(splitsTabel(bytes, s.plek.tabel.tableIndex, s.plek.rijen[0]));
}

/** Groepen voor het contexttabblad Tabelopmaak. */
export function TabelIndeling() {
  const tik = useEditorTik();
  const api = useEditorApi();
  const uitvoeren = useUitvoeren();
  const staat = useMemo(() => tabelStaat(api.tekst()), [tik, api]);
  const bewerkbaar = useDocxCommand("insertPageBreak").state.enabled;
  const voorstel = useDocxCommand("editingMode").state.value === "suggesting";
  const uit = !bewerkbaar || !staat || voorstel;
  const reden = voorstel ? "Niet beschikbaar terwijl wijzigingen worden bijgehouden" : undefined;
  const setVenster = (id: "rij" | "marges" | "sorteren" | "naarTekst") => openVenster(api.tekst, `tabel.${id}`);
  const splitsen = () => uitvoeren((ref) => splitsHuidigeTabel(ref, api.herlaad), false);

  return (
    <>
      <Groep naam="Celgrootte">
        <EigenKnop
          naam="Rij…"
          icoon={TableProperties}
          groot
          disabled={uit}
          uitleg={reden ?? "Rijhoogte, kopregel herhalen en afbreken over pagina’s"}
          onClick={() => setVenster("rij")}
        />
        <div className="ribbon-stapel">
          <EigenKnop
            naam="Rijen gelijk verdelen"
            icoon={Rows3}
            disabled={uit}
            uitleg={reden}
            onClick={() => uitvoeren(rijenGelijk)}
          />
          <EigenKnop
            naam="Kolommen gelijk verdelen"
            icoon={Columns3}
            disabled={uit}
            uitleg={reden}
            onClick={() => uitvoeren(kolommenGelijk)}
          />
          <Keuzemenu
            naam="AutoAanpassen"
            icoon={Scaling}
            disabled={uit}
            uitleg={reden}
            items={[
              { naam: "Inhoud automatisch aanpassen", kies: () => uitvoeren((r) => maakPassend(r, "inhoud")) },
              { naam: "Venster automatisch aanpassen", kies: () => uitvoeren((r) => maakPassend(r, "venster")) },
              {
                naam: "Vaste kolombreedte",
                gekozen: staat?.indeling === "fixed",
                kies: () => uitvoeren((r) => maakPassend(r, "vast")),
              },
            ]}
          />
        </div>
      </Groep>
      <Groep naam="Uitlijning in cel">
        <div className="ribbon-stapel">
          <EigenKnop
            naam="Boven"
            icoon={AlignVerticalJustifyStart}
            actief={staat?.verticaal === "top"}
            disabled={uit}
            uitleg={reden ?? "Celinhoud bovenaan uitlijnen"}
            onClick={() => uitvoeren((r) => celUitlijning(r, "top"))}
          />
          <EigenKnop
            naam="Midden"
            icoon={AlignVerticalJustifyCenter}
            actief={staat?.verticaal === "center"}
            disabled={uit}
            uitleg={reden ?? "Celinhoud verticaal centreren"}
            onClick={() => uitvoeren((r) => celUitlijning(r, "center"))}
          />
          <EigenKnop
            naam="Onder"
            icoon={AlignVerticalJustifyEnd}
            actief={staat?.verticaal === "bottom"}
            disabled={uit}
            uitleg={reden ?? "Celinhoud onderaan uitlijnen"}
            onClick={() => uitvoeren((r) => celUitlijning(r, "bottom"))}
          />
        </div>
        <EigenKnop
          naam="Celmarges"
          icoon={BetweenHorizontalStart}
          groot
          disabled={uit}
          uitleg={reden}
          onClick={() => setVenster("marges")}
        />
      </Groep>
      <Groep naam="Gegevens">
        <EigenKnop
          naam="Sorteren"
          icoon={ArrowDownAZ}
          groot
          disabled={uit}
          uitleg={reden ?? "Rijen sorteren op een of meer kolommen"}
          onClick={() => setVenster("sorteren")}
        />
        <div className="ribbon-stapel">
          <EigenKnop
            naam="Kopregels herhalen"
            icoon={Repeat2}
            actief={staat?.kopregel ?? false}
            disabled={uit}
            uitleg={reden ?? "De bovenste rij(en) bovenaan elke pagina herhalen"}
            onClick={() => uitvoeren((r) => zetRijen(r, { kopregel: !staat?.kopregel }))}
          />
          <EigenKnop
            naam="Naar tekst"
            icoon={WrapText}
            disabled={uit}
            uitleg={reden ?? "Tabel converteren naar tekst"}
            onClick={() => setVenster("naarTekst")}
          />
          <EigenKnop
            naam="Tabel splitsen"
            icoon={SquareSplitVertical}
            disabled={uit || (staat?.plek.rijen[0] ?? 0) < 1}
            uitleg={
              reden ??
              "Splitst de tabel boven de rij met de cursor. Het document wordt opnieuw geladen; Ongedaan maken werkt daarna niet voor eerdere stappen."
            }
            onClick={splitsen}
          />
        </div>
      </Groep>
    </>
  );
}

/** De tabelvensters, geopend via ../gedeeld/vensters.ts (lint of rechtermuismenu). */
export function TabelVenster({ id, gegevens, sluit }: { id: string; gegevens?: unknown; sluit: () => void }) {
  const api = useEditorApi().tekst;
  const [staat] = useState(() => tabelStaat(api()));
  if (id === "tabel.tekstNaarTabel") return <TekstNaarTabelVenster alineas={(gegevens as string[]) ?? []} sluit={sluit} />;
  if (!staat) return null;
  if (id === "tabel.rij") return <RijVenster staat={staat} sluit={sluit} />;
  if (id === "tabel.marges") return <MargesVenster staat={staat} sluit={sluit} />;
  if (id === "tabel.sorteren") return <SorteerVenster staat={staat} sluit={sluit} />;
  if (id === "tabel.naarTekst") return <NaarTekstVenster sluit={sluit} />;
  return null;
}

function Acties({ ok, sluit, label = "OK", disabled }: { ok: () => void; sluit: () => void; label?: string; disabled?: boolean }) {
  return (
    <>
      <button type="button" className="werkruimte-knop" onClick={sluit}>
        Annuleren
      </button>
      <button type="button" className="werkruimte-knop is-primair" disabled={disabled} onClick={ok}>
        {label}
      </button>
    </>
  );
}

function RijVenster({ staat, sluit }: { staat: TabelStaat; sluit: () => void }) {
  const uitvoeren = useUitvoeren();
  const [regel, setRegel] = useState(staat.hoogte ? staat.regel : "auto");
  const [hoogte, setHoogte] = useState(toonGetal(twipsNaarCm(staat.hoogte ?? 567)));
  const [kopregel, setKopregel] = useState(staat.kopregel);
  const [nietAfbreken, setNietAfbreken] = useState(staat.nietAfbreken);
  const [alle, setAlle] = useState(false);
  const cm = getalUit(hoogte);
  const geldig = regel === "auto" || (cm > 0 && cm <= 55);
  const [van, tot] = staat.plek.rijen;
  function ok() {
    if (!geldig) return;
    sluit();
    uitvoeren((r) =>
      zetRijen(
        r,
        {
          kopregel: kopregel === staat.kopregel ? undefined : kopregel,
          nietAfbreken,
          hoogte: regel === "auto" ? null : cmNaarTwips(cm),
          regel: regel as "auto" | "atLeast" | "exact",
        },
        alle,
      ),
    );
  }
  return (
    <Dialoog titel="Rij-eigenschappen" sluit={sluit} className="tw-venster" acties={<Acties ok={ok} sluit={sluit} disabled={!geldig} />}>
      <p className="werkruimte-uitleg">
        {alle ? "Alle rijen van de tabel." : van === tot ? `Rij ${van + 1}.` : `Rij ${van + 1} tot en met ${tot + 1}.`}
      </p>
      <fieldset>
        <legend>Grootte</legend>
        <label className="werkruimte-veld">
          <span>Rijhoogte</span>
          <select value={regel} onChange={(e) => setRegel(e.target.value as typeof regel)} data-autofocus="">
            <option value="auto">Automatisch (passend bij de inhoud)</option>
            <option value="atLeast">Minimaal</option>
            <option value="exact">Exact</option>
          </select>
        </label>
        <Maatveld label="Hoogte" waarde={hoogte} wijzig={setHoogte} disabled={regel === "auto"} />
      </fieldset>
      <fieldset>
        <legend>Opties</legend>
        <label className="werkruimte-vink">
          <input type="checkbox" checked={!nietAfbreken} onChange={(e) => setNietAfbreken(!e.target.checked)} />
          Rij mag over pagina’s worden afgebroken
        </label>
        <label className="werkruimte-vink">
          <input type="checkbox" checked={kopregel} onChange={(e) => setKopregel(e.target.checked)} />
          Herhalen als kopregel bovenaan elke pagina
        </label>
        <label className="werkruimte-vink">
          <input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} />
          Op alle rijen van de tabel toepassen
        </label>
      </fieldset>
    </Dialoog>
  );
}

function MargesVenster({ staat, sluit }: { staat: TabelStaat; sluit: () => void }) {
  const uitvoeren = useUitvoeren();
  const [heel, setHeel] = useState(true);
  const vanBron = (bron: TabelStaat["marges"]) => ({
    top: toonGetal(twipsNaarCm(bron.top ?? 0)),
    bottom: toonGetal(twipsNaarCm(bron.bottom ?? 0)),
    left: toonGetal(twipsNaarCm(bron.left ?? 108)),
    right: toonGetal(twipsNaarCm(bron.right ?? 108)),
  });
  const [waarden, setWaarden] = useState(() => vanBron(staat.tabelMarges));
  const kies = (tabel: boolean) => {
    setHeel(tabel);
    setWaarden(vanBron(tabel ? staat.tabelMarges : staat.marges));
  };
  const getallen = Object.fromEntries(Object.entries(waarden).map(([k, v]) => [k, getalUit(v)])) as Record<keyof typeof waarden, number>;
  const geldig = Object.values(getallen).every((n) => n >= 0 && n <= 10);
  const veld = (k: keyof typeof waarden, label: string) => (
    <Maatveld label={label} waarde={waarden[k]} wijzig={(v) => setWaarden({ ...waarden, [k]: v })} autoFocus={k === "top"} />
  );
  function ok() {
    if (!geldig) return;
    sluit();
    uitvoeren((r) =>
      celMarges(
        r,
        {
          top: cmNaarTwips(getallen.top),
          bottom: cmNaarTwips(getallen.bottom),
          left: cmNaarTwips(getallen.left),
          right: cmNaarTwips(getallen.right),
        },
        heel,
      ),
    );
  }
  return (
    <Dialoog titel="Celmarges" sluit={sluit} className="tw-venster" acties={<Acties ok={ok} sluit={sluit} disabled={!geldig} />}>
      <div className="werkruimte-keuzes" role="radiogroup" aria-label="Toepassen op">
        <label>
          <input type="radio" checked={heel} onChange={() => kies(true)} /> Standaardmarges van de hele tabel
        </label>
        <label>
          <input type="radio" checked={!heel} onChange={() => kies(false)} /> Alleen de geselecteerde cellen
        </label>
      </div>
      <div className="tw-raster2">
        {veld("top", "Boven")}
        {veld("bottom", "Onder")}
        {veld("left", "Links")}
        {veld("right", "Rechts")}
      </div>
    </Dialoog>
  );
}

const SOORTNAMEN: Record<Sorteersoort, string> = { tekst: "Tekst", getal: "Getal", datum: "Datum" };

function SorteerVenster({ staat, sluit }: { staat: TabelStaat; sluit: () => void }) {
  const api = useEditorApi().tekst;
  const uitvoeren = useUitvoeren();
  const teksten = useMemo(() => {
    try {
      return tabelTeksten(engine(api()).sessie, staat.plek.tabel);
    } catch {
      return [] as string[][];
    }
  }, [api, staat]);
  // Zoals Word: een kopregel als die als kop herhaalt, of als de eerste rij
  // tekst is waar de rest van een kolom getallen of datums bevat.
  const [kop, setKop] = useState(
    () =>
      staat.kopregel ||
      (teksten.length > 2 &&
        teksten[0].some((c, k) => raadSoort([c]) === "tekst" && c.trim() !== "" && raadSoort(teksten.slice(1).map((r) => r[k] ?? "")) !== "tekst")),
  );
  const kolomNaam = (k: number) => (kop ? teksten[0]?.[k]?.trim() || `Kolom ${k + 1}` : `Kolom ${k + 1}`);
  const soortVan = (k: number) => raadSoort(teksten.slice(kop ? 1 : 0).map((r) => r[k] ?? ""));
  const [sleutels, setSleutels] = useState<(Sorteersleutel | null)[]>(() => [
    { kolom: staat.plek.kolommen[0], soort: soortVan(staat.plek.kolommen[0]), aflopend: false },
    null,
    null,
  ]);
  const zet = (i: number, s: Sorteersleutel | null) => setSleutels(sleutels.map((o, j) => (j === i ? s : o)));
  function ok() {
    const gekozen = sleutels.filter((s): s is Sorteersleutel => s !== null);
    if (!gekozen.length) return;
    sluit();
    // Kopregels die als kop herhalen blijven altijd bovenaan.
    const kopregels = kop ? Math.max(1, aantalKoppen(teksten.length, staat)) : 0;
    uitvoeren((r) => sorteer(r, gekozen, kopregels));
  }
  return (
    <Dialoog titel="Sorteren" sluit={sluit} className="tw-venster is-breed" acties={<Acties ok={ok} sluit={sluit} label="Sorteren" />}>
      {sleutels.map((s, i) => (
        <fieldset key={i}>
          <legend>{i === 0 ? "Sorteren op" : "Daarna op"}</legend>
          <div className="werkruimte-rij">
            <select
              aria-label="Kolom"
              value={s?.kolom ?? ""}
              data-autofocus={i === 0 ? "" : undefined}
              onChange={(e) =>
                zet(i, e.target.value === "" ? null : { kolom: +e.target.value, soort: soortVan(+e.target.value), aflopend: s?.aflopend ?? false })
              }
            >
              {i > 0 && <option value="">(geen)</option>}
              {Array.from({ length: staat.kolommen }, (_, k) => (
                <option key={k} value={k}>
                  {kolomNaam(k)}
                </option>
              ))}
            </select>
            <select aria-label="Type" value={s?.soort ?? "tekst"} disabled={!s} onChange={(e) => s && zet(i, { ...s, soort: e.target.value as Sorteersoort })}>
              {Object.entries(SOORTNAMEN).map(([w, n]) => (
                <option key={w} value={w}>
                  {n}
                </option>
              ))}
            </select>
            <label className="werkruimte-vink">
              <input type="radio" name={`richting${i}`} checked={!s?.aflopend} disabled={!s} onChange={() => s && zet(i, { ...s, aflopend: false })} />
              Oplopend
            </label>
            <label className="werkruimte-vink">
              <input type="radio" name={`richting${i}`} checked={!!s?.aflopend} disabled={!s} onChange={() => s && zet(i, { ...s, aflopend: true })} />
              Aflopend
            </label>
          </div>
        </fieldset>
      ))}
      <label className="werkruimte-vink">
        <input type="checkbox" checked={kop} onChange={(e) => setKop(e.target.checked)} />
        Mijn lijst heeft een kopregel
      </label>
      <p className="werkruimte-uitleg">De celopmaak verhuist met de rijen mee. Ongedaan maken (Ctrl+Z) zet de oude volgorde terug.</p>
    </Dialoog>
  );
}

function aantalKoppen(rijen: number, staat: TabelStaat) {
  return staat.kopregel ? Math.min(rijen - 1, 1) : 1;
}

const SCHEIDINGEN: { waarde: Exclude<Scheiding, { teken: string }>; naam: string }[] = [
  { waarde: "tab", naam: "Tabs" },
  { waarde: "puntkomma", naam: "Puntkomma’s" },
  { waarde: "komma", naam: "Komma’s" },
  { waarde: "alinea", naam: "Alineamarkeringen" },
];

function ScheidingKeuze({
  scheiding,
  setScheiding,
  anders,
  setAnders,
}: {
  scheiding: Scheiding;
  setScheiding: (s: Scheiding) => void;
  anders: string;
  setAnders: (s: string) => void;
}) {
  return (
    <fieldset>
      <legend>Tekst scheiden bij</legend>
      <div className="werkruimte-keuzes">
        {SCHEIDINGEN.map((s) => (
          <label key={s.waarde}>
            <input type="radio" name="scheiding" checked={scheiding === s.waarde} onChange={() => setScheiding(s.waarde)} /> {s.naam}
          </label>
        ))}
        <label>
          <input type="radio" name="scheiding" checked={typeof scheiding === "object"} onChange={() => setScheiding({ teken: anders || "-" })} /> Anders:
          <input
            type="text"
            maxLength={1}
            size={2}
            value={anders}
            aria-label="Ander scheidingsteken"
            onChange={(e) => {
              setAnders(e.target.value);
              setScheiding({ teken: e.target.value || "-" });
            }}
          />
        </label>
      </div>
    </fieldset>
  );
}

function NaarTekstVenster({ sluit }: { sluit: () => void }) {
  const uitvoeren = useUitvoeren();
  const [scheiding, setScheiding] = useState<Scheiding>("tab");
  const [anders, setAnders] = useState("-");
  function ok() {
    sluit();
    uitvoeren((r) => tabelNaarTekst(r, scheiding));
  }
  return (
    <Dialoog titel="Tabel converteren naar tekst" sluit={sluit} className="tw-venster" acties={<Acties ok={ok} sluit={sluit} label="Converteren" />}>
      <ScheidingKeuze scheiding={scheiding} setScheiding={setScheiding} anders={anders} setAnders={setAnders} />
      <p className="werkruimte-uitleg">Elke rij wordt een alinea; bij ‘Alineamarkeringen’ wordt elke cel een alinea.</p>
    </Dialoog>
  );
}

/** Invoegen › Tabellen: geselecteerde tekst omzetten naar een tabel. */
export function TekstNaarTabelKnop() {
  const api = useEditorApi().tekst;
  const uitvoeren = useUitvoeren();
  const bewerkbaar = useDocxCommand("insertTable").state.enabled;
  return (
    <EigenKnop
      naam="Tekst naar tabel"
      icoon={Table2}
      disabled={!bewerkbaar}
      uitleg="Geselecteerde alinea’s omzetten naar een tabel"
      onClick={() => uitvoeren((ref) => openTekstNaarTabel(ref, api), false)}
    />
  );
}

/** Opent ‘Tekst converteren naar tabel’ voor de geselecteerde alinea’s. */
export async function openTekstNaarTabel(ref: DocxEditorRef | null, sleutel: object) {
  const e = engine(ref);
  await e.ref.flushPendingInput();
  const alineas = geselecteerdeAlineas(e).map((a) => a.text);
  if (!alineas.some((a) => a.trim())) throw new Error("Selecteer eerst de alinea’s die een tabel moeten worden.");
  openVenster(sleutel, "tabel.tekstNaarTabel", alineas);
}

function TekstNaarTabelVenster({ alineas, sluit }: { alineas: string[]; sluit: () => void }) {
  const uitvoeren = useUitvoeren();
  const [scheiding, setScheiding] = useState<Scheiding>(() => raadScheiding(alineas));
  const [anders, setAnders] = useState("-");
  const [kolommen, setKolommen] = useState(() => String(tekstNaarCellen(alineas, raadScheiding(alineas))[0]?.length ?? 1));
  const n = Math.max(1, Math.min(63, Math.round(getalUit(kolommen)) || 1));
  const cellen = tekstNaarCellen(alineas, scheiding, scheiding === "alinea" ? n : undefined);
  const breed = cellen[0]?.length ?? 1;
  function ok() {
    sluit();
    uitvoeren((r) => tekstNaarTabel(r, scheiding, scheiding === "alinea" ? n : undefined));
  }
  return (
    <Dialoog titel="Tekst converteren naar tabel" sluit={sluit} className="tw-venster is-breed" acties={<Acties ok={ok} sluit={sluit} label="Converteren" />}>
      <Maatveld label="Aantal kolommen" waarde={scheiding === "alinea" ? kolommen : String(breed)} wijzig={setKolommen} eenheid="" stap={1} min={1} max={63} disabled={scheiding !== "alinea"} />
      <p className="werkruimte-uitleg">
        {cellen.length} {cellen.length === 1 ? "rij" : "rijen"} × {breed} {breed === 1 ? "kolom" : "kolommen"}
      </p>
      <ScheidingKeuze scheiding={scheiding} setScheiding={setScheiding} anders={anders} setAnders={setAnders} />
      <table className="tw-tabelvoorbeeld" aria-label="Voorbeeld">
        <tbody>
          {cellen.slice(0, 5).map((rij, i) => (
            <tr key={i}>
              {rij.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {cellen.length > 5 && <p className="werkruimte-uitleg">… en nog {cellen.length - 5} rijen.</p>}
    </Dialoog>
  );
}

