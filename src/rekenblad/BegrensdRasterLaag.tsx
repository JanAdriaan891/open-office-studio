/**
 * Het rustige vlak buiten het begrensde raster (#371) met de groeistroken
 * "+ kolom" en "+ rij" en de knop "Raster aanpassen aan inhoud". De laag ligt
 * boven het canvas van de engine; daaronder blijft het onbeperkte raster
 * gewoon bestaan.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Shrink } from "lucide-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { kolomLetters } from "../lint/rekenblad-logica";
import { GROTE_STAP, sleepAantal, type Omvang } from "./begrensdRaster";
import { abonneerRasterMeldingen, groeiRaster, pasRasterAan, type RasterMelding } from "./rasterWeergave";

/** Dikte van een groeistrook in schermpixels. */
export const STROOK = 22;

export interface RasterRand {
  omvang: Omvang;
  /** Rechterrand van de laatste kolom binnen het zichtbare canvas, of null als die buiten beeld ligt. */
  x: number | null;
  /** Onderrand van de laatste rij, of null als die buiten beeld ligt. */
  y: number | null;
  /** Grootte van het laatste spoor: de maat voor slepen. */
  kolomPx: number;
  rijPx: number;
}

type As = "rij" | "kolom";

function Groeistrook({
  as,
  api,
  spoorPx,
  stijl,
}: {
  as: As;
  api: XlsxEditorApi;
  spoorPx: number;
  stijl: React.CSSProperties;
}) {
  const { t } = useTranslation("spreadsheet");
  const [aantal, setAantal] = useState<number | null>(null);
  const sleep = useRef<{ start: number; aantal: number } | null>(null);
  const voegToe = (n: number) => {
    const blad = api.handle.sheetInfo().activeSheet;
    groeiRaster(api.handle, blad, as === "rij" ? { rijen: n } : { kolommen: n });
  };
  const positie = (e: ReactPointerEvent) => (as === "rij" ? e.clientY : e.clientX);
  const naam = t(as === "rij" ? "boundedGrid.addRow" : "boundedGrid.addColumn");
  const groot = as === "rij" ? GROTE_STAP.rijen : GROTE_STAP.kolommen;
  return (
    <button
      type="button"
      className={`rekenblad-groeistrook is-${as}`}
      style={stijl}
      aria-label={naam}
      title={t(as === "rij" ? "boundedGrid.addRowHint" : "boundedGrid.addColumnHint", { amount: groot })}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        gesleept.current = false;
        sleep.current = { start: positie(e), aantal: 1 };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!sleep.current) return;
        const n = sleepAantal(positie(e) - sleep.current.start, spoorPx);
        sleep.current.aantal = n;
        setAantal(n > 1 ? n : null);
      }}
      onPointerUp={(e) => {
        const s = sleep.current;
        sleep.current = null;
        setAantal(null);
        if (!s) return;
        // Een gewone klik (ook via het toetsenbord) loopt via onClick.
        if (s.aantal > 1) {
          e.preventDefault();
          gesleept.current = true;
          voegToe(s.aantal);
        }
      }}
      onPointerCancel={() => {
        sleep.current = null;
        setAantal(null);
      }}
      onClick={(e) => {
        if (gesleept.current) {
          gesleept.current = false;
          return;
        }
        voegToe(e.shiftKey ? groot : 1);
      }}
    >
      <Plus size={12} aria-hidden="true" />
      <span aria-hidden="true">
        {aantal
          ? t(as === "rij" ? "boundedGrid.addRows" : "boundedGrid.addColumns", { amount: aantal })
          : t(as === "rij" ? "boundedGrid.row" : "boundedGrid.column")}
      </span>
    </button>
  );
}
/** Onderdrukt de klik die de browser na het loslaten van een sleep nog stuurt. */
const gesleept = { current: false };

function meldingTekst(t: (sleutel: string, opties?: Record<string, unknown>) => string, m: RasterMelding) {
  const laatste = { row: m.omvang.rijen, column: kolomLetters(m.omvang.kolommen - 1) };
  if (m.soort === "grens")
    return t(m.rij && m.kolom ? "boundedGrid.edgeBoth" : m.rij ? "boundedGrid.edgeRow" : "boundedGrid.edgeColumn", laatste);
  return t(m.soort === "aangepast" ? "boundedGrid.fitted" : "boundedGrid.grown", {
    rows: m.omvang.rijen,
    columns: m.omvang.kolommen,
  });
}

export function BegrensdRasterLaag({
  api,
  rand,
  links,
  boven,
  breedte,
  hoogte,
}: {
  api: XlsxEditorApi;
  rand: RasterRand;
  /** Het zichtbare canvas binnen de host. */
  links: number;
  boven: number;
  breedte: number;
  hoogte: number;
}) {
  const { t } = useTranslation("spreadsheet");
  const [melding, setMelding] = useState("");
  useEffect(
    () =>
      abonneerRasterMeldingen(api.handle, (m) =>
        // Dezelfde tekst twee keer achter elkaar wordt anders niet opnieuw voorgelezen.
        setMelding((oud) => {
          const tekst = meldingTekst(t, m);
          return oud === tekst ? `${tekst} ` : tekst;
        }),
      ),
    [api, t],
  );
  const { x, y } = rand;
  const KOP_B = 38;
  const KOP_H = 23;
  // Binnen het raster: tot de rand, of het hele canvas als de rand buiten beeld ligt.
  const binnenB = x ?? breedte;
  const binnenH = y ?? hoogte;
  return (
    <div className="rekenblad-rastergrens" data-testid="rekenblad-rastergrens">
      {x !== null && (
        <div
          className="rekenblad-rastervlak"
          aria-hidden="true"
          style={{ left: links + x, top: boven - KOP_H, width: Math.max(0, breedte - x), height: hoogte + KOP_H }}
        />
      )}
      {y !== null && (
        <div
          className="rekenblad-rastervlak"
          aria-hidden="true"
          style={{ left: links - KOP_B, top: boven + y, width: binnenB + KOP_B, height: Math.max(0, hoogte - y) }}
        />
      )}
      {x !== null && breedte - x >= 8 && (
        <Groeistrook
          as="kolom"
          api={api}
          spoorPx={rand.kolomPx}
          stijl={{ left: links + x, top: boven - KOP_H, width: Math.min(STROOK, breedte - x), height: binnenH + KOP_H }}
        />
      )}
      {y !== null && hoogte - y >= 8 && (
        <Groeistrook
          as="rij"
          api={api}
          spoorPx={rand.rijPx}
          stijl={{ left: links - KOP_B, top: boven + y, width: binnenB + KOP_B, height: Math.min(STROOK, hoogte - y) }}
        />
      )}
      {x !== null && y !== null && breedte - x >= STROOK && hoogte - y >= STROOK && (
        <button
          type="button"
          className="rekenblad-rasterpassend"
          style={{ left: links + x, top: boven + y, width: STROOK, height: STROOK }}
          aria-label={t("boundedGrid.fit")}
          title={t("boundedGrid.fitHint")}
          onClick={() => pasRasterAan(api.handle, api.handle.sheetInfo().activeSheet)}
        >
          <Shrink size={12} aria-hidden="true" />
        </button>
      )}
      <span className="rekenblad-rastermelding" role="status" aria-live="polite">
        {melding}
      </span>
    </div>
  );
}
