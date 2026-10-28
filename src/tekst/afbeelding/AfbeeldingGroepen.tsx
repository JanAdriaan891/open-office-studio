/**
 * Lintgroepen voor Afbeeldingsopmaak (#49): grootte met vergrendelde
 * verhouding, bijsnijden (interactief met grepen en met getallen), afbeelding
 * wijzigen, opnieuw instellen, alternatieve tekst en positie. De bewerkingen
 * staan in ./opdrachten.ts.
 */
import { useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Crop, ImageUp, Lock, LockOpen, Move, RefreshCcw, TextCursorInput } from "lucide-react";
import { useDocxCommand, type DocxEditorRef } from "@betteroffice/docx-react";
import { Groep, RibbonFout } from "../../Ribbon";
import { openVenster } from "../gedeeld/vensters";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { useEditorApi } from "../../lint/editorApi";
import { Keuzemenu, Maatveld, getalUit, toonGetal, useEditorTik, useUitvoeren } from "../gedeeld/ui";
import { engine, fout } from "../gedeeld/engine";
import {
  afbeeldingStaat,
  bijsnijden,
  natuurlijkeMaat,
  opnieuwInstellen,
  vervangAfbeelding,
  zetAfmeting,
  zetAltTekst,
  zetPositie,
  type BeeldPlek,
} from "./opdrachten";
import {
  EMU_PER_CM,
  ONDERSTEUNDE_BEELDEN,
  ZWEVEND,
  beeldmaat,
  begrensBijsnijding,
  cmNaarPx,
  leesBijsnijding,
  maatNaBijsnijden,
  metVerhouding,
  pxNaarCm,
  sleepGreep,
  type Bijsnijding,
  type Greep,
  type HorizontaalTov,
  type VerticaalTov,
} from "./logica";

const VERGRENDELD = "open-tekst-beeldverhouding";
function leesVergrendeld() {
  try {
    return localStorage.getItem(VERGRENDELD) !== "nee";
  } catch {
    return true;
  }
}

/** Leest een gekozen beeldbestand als data-URL met zijn pixelmaat. */
async function leesBeeld(file: File) {
  if (!ONDERSTEUNDE_BEELDEN.includes(file.type)) throw new Error("Kies een PNG-, JPEG-, GIF-, BMP- of WebP-afbeelding.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Kies een afbeelding van maximaal 25 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const natuurlijk = beeldmaat(bytes);
  if (!natuurlijk) throw new Error("Deze afbeelding kan niet worden gelezen.");
  const src = await new Promise<string>((klaar, fout) => {
    const lezer = new FileReader();
    lezer.onload = () => klaar(String(lezer.result));
    lezer.onerror = () => fout(new Error("De afbeelding kon niet worden gelezen."));
    lezer.readAsDataURL(file);
  });
  return { src, natuurlijk };
}

/**
 * ‘Afbeelding wijzigen’: laat een bestand kiezen en vervangt de geselecteerde
 * afbeelding. Werkt vanuit het lint en vanuit het rechtermuismenu.
 */
export function kiesNieuweAfbeelding(api: () => DocxEditorRef | null, meld: (bericht: string) => void) {
  if (!afbeeldingStaat(api())) {
    meld("Selecteer eerst een afbeelding.");
    return;
  }
  const invoer = document.createElement("input");
  invoer.type = "file";
  invoer.accept = ONDERSTEUNDE_BEELDEN.join(",");
  invoer.addEventListener("change", () => {
    const file = invoer.files?.[0];
    if (!file) return;
    void leesBeeld(file)
      .then((nieuw) => {
        vervangAfbeelding(api(), nieuw.src, nieuw.natuurlijk);
        api()?.focus();
      })
      .catch((error) => meld(fout(error)));
  });
  invoer.click();
}

export function AfbeeldingGroepen() {
  const tik = useEditorTik();
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  const uitvoeren = useUitvoeren();
  const bewerkbaar = useDocxCommand("imageProperties").state.enabled;
  const plek = useMemo(() => afbeeldingStaat(api()), [tik, api]);
  const [vergrendeld, setVergrendeld] = useState(leesVergrendeld);
  const uit = !bewerkbaar || !plek;
  const breedte = Number(plek?.attrs.width) || 0,
    hoogte = Number(plek?.attrs.height) || 0;
  const setVenster = (id: "bijsnijden" | "alt" | "positie") => openVenster(api, `afbeelding.${id}`);

  function maat(soort: "breedte" | "hoogte", cm: number) {
    if (!(cm > 0) || !plek) return;
    const px = cmNaarPx(cm);
    const nieuw = vergrendeld
      ? metVerhouding(breedte, hoogte, soort === "breedte" ? { breedte: px } : { hoogte: px })
      : { breedte: soort === "breedte" ? px : breedte, hoogte: soort === "hoogte" ? px : hoogte };
    uitvoeren((r) => zetAfmeting(r, nieuw.breedte, nieuw.hoogte), false);
  }

  function herstel(metGrootte: boolean) {
    uitvoeren(async (r) => {
      const e = engine(r);
      const huidig = afbeeldingStaat(r);
      const natuurlijk = metGrootte ? await natuurlijkeMaat(huidig?.attrs.src) : null;
      const sectie = e.ref.getDocument()?.package.document.finalSectionProperties as
        | { pageWidth?: number; marginLeft?: number; marginRight?: number }
        | undefined;
      const tekstbreedte = sectie?.pageWidth ? (sectie.pageWidth - (sectie.marginLeft ?? 1440) - (sectie.marginRight ?? 1440)) / 15 : 600;
      opnieuwInstellen(r, metGrootte, natuurlijk, tekstbreedte);
    });
  }

  return (
    <>
      <Groep naam="Grootte">
        <div className="ribbon-stapel tw-beeldmaat">
          <MaatInvoer naam="Hoogte" waarde={hoogte} disabled={uit} kies={(cm) => maat("hoogte", cm)} />
          <MaatInvoer naam="Breedte" waarde={breedte} disabled={uit} kies={(cm) => maat("breedte", cm)} />
          <EigenKnop
            naam={vergrendeld ? "Verhouding vergrendeld" : "Verhouding vrij"}
            icoon={vergrendeld ? Lock : LockOpen}
            actief={vergrendeld}
            uitleg="Bij het wijzigen van hoogte of breedte blijft de verhouding gelijk"
            onClick={() => {
              setVergrendeld(!vergrendeld);
              try {
                localStorage.setItem(VERGRENDELD, vergrendeld ? "nee" : "ja");
              } catch {
                // Alleen gemak.
              }
            }}
          />
        </div>
        <EigenKnop naam="Bijsnijden" icoon={Crop} groot disabled={uit} uitleg="Bijsnijden met grepen of in centimeters" onClick={() => setVenster("bijsnijden")} />
      </Groep>
      <Groep naam="Aanpassen">
        <EigenKnop
          naam="Afbeelding wijzigen"
          icoon={ImageUp}
          groot
          disabled={uit}
          uitleg="Vervangt de afbeelding en behoudt grootte, positie en terugloop"
          onClick={() => kiesNieuweAfbeelding(api, meld)}
        />
        <Keuzemenu
          naam="Opnieuw instellen"
          icoon={RefreshCcw}
          groot
          disabled={uit}
          items={[
            { naam: "Afbeelding opnieuw instellen", uitleg: "Bijsnijding, draaiing en spiegeling weg", kies: () => herstel(false) },
            { naam: "Afbeelding en grootte opnieuw instellen", uitleg: "Ook de oorspronkelijke grootte", kies: () => herstel(true) },
          ]}
        />
      </Groep>
      <Groep naam="Toegankelijkheid">
        <EigenKnop naam="Alternatieve tekst" icoon={TextCursorInput} groot disabled={uit} onClick={() => setVenster("alt")} />
      </Groep>
      <Groep naam="Schikken">
        <EigenKnop
          naam="Positie"
          icoon={Move}
          groot
          disabled={uit || !ZWEVEND.has(String(plek?.attrs.wrapType))}
          uitleg={
            plek && !ZWEVEND.has(String(plek.attrs.wrapType))
              ? "Kies eerst een tekstterugloop anders dan ‘In lijn met tekst’"
              : "Positie ten opzichte van pagina, marge of alinea en afstand tot de tekst"
          }
          onClick={() => setVenster("positie")}
        />
      </Groep>
    </>
  );
}

/** De afbeeldingsvensters, geopend via ../gedeeld/vensters.ts (lint of rechtermuismenu). */
export function AfbeeldingVenster({ id, sluit }: { id: string; sluit: () => void }) {
  const api = useEditorApi().tekst;
  // De plek bij het openen: de selectie blijft daarna op het beeld staan.
  const [plek] = useState<BeeldPlek | null>(() => afbeeldingStaat(api()));
  if (!plek) return null;
  if (id === "afbeelding.bijsnijden") return <BijsnijdVenster plek={plek} sluit={sluit} />;
  if (id === "afbeelding.alt") return <AltVenster plek={plek} sluit={sluit} />;
  if (id === "afbeelding.positie") return <PositieVenster plek={plek} sluit={sluit} />;
  return null;
}

function MaatInvoer({ naam, waarde, disabled, kies }: { naam: string; waarde: number; disabled: boolean; kies: (cm: number) => void }) {
  const [tekst, setTekst] = useState(toonGetal(pxNaarCm(waarde)));
  useEffect(() => setTekst(toonGetal(pxNaarCm(waarde))), [waarde]);
  const toepassen = () => {
    const cm = getalUit(tekst);
    if (cm > 0 && Math.abs(cm - pxNaarCm(waarde)) >= 0.01) kies(cm);
    else setTekst(toonGetal(pxNaarCm(waarde)));
  };
  return (
    <label className="tw-lintmaat" title={`${naam} in centimeters`}>
      <span>{naam}</span>
      <input
        type="number"
        min={0.1}
        step={0.1}
        value={tekst}
        disabled={disabled}
        aria-label={`${naam} (cm)`}
        onChange={(e) => setTekst(e.target.value)}
        onBlur={toepassen}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            toepassen();
          }
        }}
      />
      <span>cm</span>
    </label>
  );
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

const GREPEN: Greep[] = ["nw", "n", "no", "o", "zo", "z", "zw", "w"];

/** Bijsnijden: het volle beeld met een kader en acht grepen, plus getallen in cm. */
function BijsnijdVenster({ plek, sluit }: { plek: BeeldPlek; sluit: () => void }) {
  const uitvoeren = useUitvoeren();
  const start = leesBijsnijding(plek.attrs);
  const [b, setB] = useState<Bijsnijding>(start);
  const vlak = useRef<HTMLDivElement>(null);
  const sleep = useRef<{ greep: Greep; x: number; y: number; van: Bijsnijding } | null>(null);
  // Volle maat (zonder bijsnijding) in cm, voor de getallen.
  const vol = maatNaBijsnijden(Number(plek.attrs.width) || 1, Number(plek.attrs.height) || 1, start, { top: 0, right: 0, bottom: 0, left: 0 });
  const volCm = { breedte: pxNaarCm(vol.breedte), hoogte: pxNaarCm(vol.hoogte) };
  const verhouding = vol.breedte / vol.hoogte;
  const kaderBreedte = Math.min(440, 300 * verhouding);
  const kaderHoogte = kaderBreedte / verhouding;
  const zichtbaar = maatNaBijsnijden(vol.breedte, vol.hoogte, { top: 0, right: 0, bottom: 0, left: 0 }, b);

  function omlaag(greep: Greep, event: ReactPointerEvent) {
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    sleep.current = { greep, x: event.clientX, y: event.clientY, van: b };
  }
  function beweeg(event: ReactPointerEvent) {
    const s = sleep.current;
    if (!s) return;
    const dx = (event.clientX - s.x) / kaderBreedte,
      dy = (event.clientY - s.y) / kaderHoogte;
    setB(sleepGreep(s.van, s.greep, dx, dy));
  }
  const veld = (kant: keyof Bijsnijding, label: string) => {
    const as = kant === "left" || kant === "right" ? volCm.breedte : volCm.hoogte;
    return (
      <Maatveld
        label={label}
        waarde={toonGetal(b[kant] * as)}
        stap={0.05}
        wijzig={(v) => setB(begrensBijsnijding({ ...b, [kant]: Math.max(0, getalUit(v) || 0) / as }))}
      />
    );
  };
  function toetsGreep(greep: Greep, event: React.KeyboardEvent) {
    const stap = event.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-stap, 0], ArrowRight: [stap, 0], ArrowUp: [0, -stap], ArrowDown: [0, stap] }[event.key];
    if (!d) return;
    event.preventDefault();
    setB(sleepGreep(b, greep, d[0], d[1]));
  }
  function ok() {
    sluit();
    uitvoeren((r) => bijsnijden(r, b));
  }
  return (
    <Dialoog titel="Bijsnijden" sluit={sluit} className="tw-venster is-breed" acties={<Acties ok={ok} sluit={sluit} label="Bijsnijden" />}>
      <div
        ref={vlak}
        className="tw-bijsnijden"
        style={{ width: kaderBreedte, height: kaderHoogte }}
        onPointerMove={beweeg}
        onPointerUp={() => (sleep.current = null)}
        onPointerCancel={() => (sleep.current = null)}
      >
        {plek.attrs.src ? <img src={plek.attrs.src} alt="" draggable={false} /> : <div className="tw-bijsnijden-leeg">Geen voorbeeld</div>}
        <div
          className="tw-bijsnijden-kader"
          style={{ left: `${b.left * 100}%`, top: `${b.top * 100}%`, right: `${b.right * 100}%`, bottom: `${b.bottom * 100}%` }}
          onPointerDown={(e) => e.target === e.currentTarget && omlaag("verplaats", e)}
        >
          {plek.attrs.src && (
            <div
              className="tw-bijsnijden-zicht"
              style={{
                backgroundImage: `url("${plek.attrs.src}")`,
                backgroundSize: `${kaderBreedte}px ${kaderHoogte}px`,
                backgroundPosition: `${-b.left * kaderBreedte}px ${-b.top * kaderHoogte}px`,
              }}
            />
          )}
          {GREPEN.map((g) => (
            <button
              key={g}
              type="button"
              className={`tw-greep tw-greep-${g}`}
              aria-label={`Greep ${g.toUpperCase()}: pijltoetsen verschuiven (Shift = grotere stap)`}
              onPointerDown={(e) => omlaag(g, e)}
              onKeyDown={(e) => toetsGreep(g, e)}
            />
          ))}
        </div>
      </div>
      <div className="tw-raster2">
        {veld("top", "Boven")}
        {veld("bottom", "Onder")}
        {veld("left", "Links")}
        {veld("right", "Rechts")}
      </div>
      <p className="werkruimte-uitleg">
        Zichtbaar deel: {toonGetal(pxNaarCm(zichtbaar.breedte))} × {toonGetal(pxNaarCm(zichtbaar.hoogte))} cm (volledig {toonGetal(volCm.breedte)} × {toonGetal(volCm.hoogte)} cm). Het
        weggesneden deel blijft in het bestand; ‘Opnieuw instellen’ haalt het terug.
      </p>
      <button type="button" className="werkruimte-knop" onClick={() => setB({ top: 0, right: 0, bottom: 0, left: 0 })}>
        Bijsnijding wissen
      </button>
    </Dialoog>
  );
}

function AltVenster({ plek, sluit }: { plek: BeeldPlek; sluit: () => void }) {
  const uitvoeren = useUitvoeren();
  const [tekst, setTekst] = useState(String(plek.attrs.alt ?? ""));
  const [decoratief, setDecoratief] = useState(plek.attrs.decorative === true);
  function ok() {
    sluit();
    uitvoeren((r) => zetAltTekst(r, tekst, decoratief));
  }
  return (
    <Dialoog titel="Alternatieve tekst" sluit={sluit} className="tw-venster" acties={<Acties ok={ok} sluit={sluit} />}>
      <p className="werkruimte-uitleg">Beschrijf in een of twee zinnen wat er op de afbeelding staat, voor mensen die haar niet kunnen zien.</p>
      <label className="werkruimte-veld tw-alt">
        <span>Beschrijving</span>
        <textarea rows={4} value={tekst} disabled={decoratief} data-autofocus="" onChange={(e) => setTekst(e.target.value)} />
      </label>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={decoratief} onChange={(e) => setDecoratief(e.target.checked)} />
        Markeren als decoratief (schermlezers slaan de afbeelding over)
      </label>
      {decoratief && (
        <p className="werkruimte-uitleg">Het bestand krijgt dan een lege beschrijving; het aparte Word-kenmerk ‘decoratief’ wordt (nog) niet opgeslagen.</p>
      )}
    </Dialoog>
  );
}

const HORIZONTAAL: { waarde: HorizontaalTov; naam: string }[] = [
  { waarde: "margin", naam: "Marge" },
  { waarde: "page", naam: "Pagina" },
  { waarde: "column", naam: "Kolom" },
  { waarde: "character", naam: "Teken" },
];
const VERTICAAL: { waarde: VerticaalTov; naam: string }[] = [
  { waarde: "margin", naam: "Marge" },
  { waarde: "page", naam: "Pagina" },
  { waarde: "paragraph", naam: "Alinea" },
  { waarde: "line", naam: "Regel" },
];

function PositieVenster({ plek, sluit }: { plek: BeeldPlek; sluit: () => void }) {
  const uitvoeren = useUitvoeren();
  const pos = plek.attrs.position;
  const [hSoort, setHSoort] = useState<"align" | "offset">(pos?.horizontal?.align ? "align" : "offset");
  const [hAlign, setHAlign] = useState(pos?.horizontal?.align ?? "center");
  const [hOffset, setHOffset] = useState(toonGetal((pos?.horizontal?.posOffset ?? 0) / EMU_PER_CM));
  const [hTov, setHTov] = useState<HorizontaalTov>((pos?.horizontal?.relativeTo as HorizontaalTov) ?? "column");
  const [vSoort, setVSoort] = useState<"align" | "offset">(pos?.vertical?.align ? "align" : "offset");
  const [vAlign, setVAlign] = useState(pos?.vertical?.align ?? "top");
  const [vOffset, setVOffset] = useState(toonGetal((pos?.vertical?.posOffset ?? 0) / EMU_PER_CM));
  const [vTov, setVTov] = useState<VerticaalTov>((pos?.vertical?.relativeTo as VerticaalTov) ?? "paragraph");
  const afstand = (k: "distTop" | "distBottom" | "distLeft" | "distRight") => toonGetal(pxNaarCm(Number(plek.attrs[k]) || 0));
  const [afst, setAfst] = useState({ distTop: afstand("distTop"), distBottom: afstand("distBottom"), distLeft: afstand("distLeft"), distRight: afstand("distRight") });
  function ok() {
    sluit();
    const cm = (t: string) => Math.round((getalUit(t) || 0) * EMU_PER_CM);
    uitvoeren((r) =>
      zetPositie(r, {
        position: {
          horizontal: hSoort === "align" ? { relativeTo: hTov, align: hAlign } : { relativeTo: hTov, posOffset: cm(hOffset) },
          vertical: vSoort === "align" ? { relativeTo: vTov, align: vAlign } : { relativeTo: vTov, posOffset: cm(vOffset) },
        },
        distTop: cmNaarPx(getalUit(afst.distTop) || 0),
        distBottom: cmNaarPx(getalUit(afst.distBottom) || 0),
        distLeft: cmNaarPx(getalUit(afst.distLeft) || 0),
        distRight: cmNaarPx(getalUit(afst.distRight) || 0),
      }),
    );
  }
  const as = (
    titel: string,
    soort: "align" | "offset",
    setSoort: (s: "align" | "offset") => void,
    align: string,
    setAlign: (s: string) => void,
    uitlijningen: [string, string][],
    offset: string,
    setOffset: (s: string) => void,
    tov: string,
    setTov: (s: never) => void,
    opties: { waarde: string; naam: string }[],
  ) => (
    <fieldset>
      <legend>{titel}</legend>
      <div className="werkruimte-keuzes">
        <label>
          <input type="radio" checked={soort === "align"} onChange={() => setSoort("align")} /> Uitlijning
        </label>
        <select aria-label={`${titel}: uitlijning`} value={align} disabled={soort !== "align"} onChange={(e) => setAlign(e.target.value)}>
          {uitlijningen.map(([w, n]) => (
            <option key={w} value={w}>
              {n}
            </option>
          ))}
        </select>
        <label>
          <input type="radio" checked={soort === "offset"} onChange={() => setSoort("offset")} /> Absolute positie
        </label>
        <span className="werkruimte-eenheid">
          <input type="number" step={0.1} aria-label={`${titel}: positie in cm`} value={offset} disabled={soort !== "offset"} onChange={(e) => setOffset(e.target.value)} />
          cm
        </span>
      </div>
      <label className="werkruimte-veld">
        <span>ten opzichte van</span>
        <select value={tov} onChange={(e) => setTov(e.target.value as never)}>
          {opties.map((o) => (
            <option key={o.waarde} value={o.waarde}>
              {o.naam}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
  return (
    <Dialoog titel="Positie" sluit={sluit} className="tw-venster is-breed" acties={<Acties ok={ok} sluit={sluit} />}>
      {as("Horizontaal", hSoort, setHSoort, hAlign, setHAlign, [["left", "Links"], ["center", "Gecentreerd"], ["right", "Rechts"]], hOffset, setHOffset, hTov, setHTov as (s: never) => void, HORIZONTAAL)}
      {as("Verticaal", vSoort, setVSoort, vAlign, setVAlign, [["top", "Boven"], ["center", "Gecentreerd"], ["bottom", "Onder"]], vOffset, setVOffset, vTov, setVTov as (s: never) => void, VERTICAAL)}
      <fieldset>
        <legend>Afstand tot de tekst</legend>
        <div className="tw-raster2">
          {(
            [
              ["distTop", "Boven"],
              ["distBottom", "Onder"],
              ["distLeft", "Links"],
              ["distRight", "Rechts"],
            ] as const
          ).map(([k, n]) => (
            <Maatveld key={k} label={n} waarde={afst[k]} wijzig={(v) => setAfst({ ...afst, [k]: v })} />
          ))}
        </div>
      </fieldset>
    </Dialoog>
  );
}
