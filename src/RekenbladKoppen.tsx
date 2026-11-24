import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { MAX_KOLOMMEN, MAX_RIJEN } from "./lint/rekenblad-logica";
import { alleenLezen, leesSelectie } from "./lint/rekenblad-opdrachten";
import { formatGetal } from "./i18n/opmaak";
import { breedteTekens, hoogtePunten, hoogteVoor } from "./rekenblad/maten";
import {
  kolomPx,
  optimaleBreedte,
  optimaleHoogte,
  rijPx,
  zetBreedte,
  zetHoogte,
} from "./rekenblad/structuur";
import { openVenster } from "./rekenblad/vensters";
import { kopRand, kopRandBreedte } from "./rekenblad/koprand";
import { volgKopRaster } from "./rekenblad/kopraster";
import { BegrensdRasterLaag, STROOK, type RasterRand } from "./rekenblad/BegrensdRasterLaag";
import {
  abonneerRaster,
  bewaakRasterSelectie,
  rasterBlad,
  registreerRasterEditor,
} from "./rekenblad/rasterWeergave";
import type { RekenbladLaag } from "./lint/rekenblad-laag";
import { volgInstellingen } from "./instellingen";
import { useEditorZichtbaar } from "./lint/editorApi";

type Spoor = { positie: number; grootte: number; nummer: number };
type Koppen = {
  links: number;
  boven: number;
  breedte: number;
  hoogte: number;
  kolommen: Spoor[];
  rijen: Spoor[];
  actief: string;
  zoom: number;
  /** De rand van het begrensde raster (#371), of null bij een onbeperkt raster. */
  rand: RasterRand | null;
};
type Soort = "kolom" | "rij";
/** Een rand die de gebruiker sleept: spoor, beginpunt op het scherm en de huidige verschuiving. */
type Slepen = { soort: Soort; nummer: number; start: number; grootte: number; delta: number };

function kolomnaam(nummer: number) {
  let naam = "";
  for (
    let waarde = nummer + 1;
    waarde > 0;
    waarde = Math.floor((waarde - 1) / 26)
  ) {
    naam = String.fromCharCode(65 + ((waarde - 1) % 26)) + naam;
  }
  return naam;
}

/** Hele kolommen of rijen selecteren zonder dat het blad naar boven springt. */
function selecteerSporen(
  api: XlsxEditorApi,
  scroll: HTMLElement | null,
  soort: Soort,
  van: number,
  tot: number,
) {
  const blad = api.handle.sheetInfo().activeSheet;
  const x = scroll?.scrollLeft ?? 0;
  const y = scroll?.scrollTop ?? 0;
  api.selectCells(
    blad,
    soort === "kolom"
      ? { anchor: { row: MAX_RIJEN - 1, col: tot }, focus: { row: 0, col: van } }
      : { anchor: { row: tot, col: MAX_KOLOMMEN - 1 }, focus: { row: van, col: 0 } },
  );
  if (scroll)
    requestAnimationFrame(() => {
      scroll.scrollLeft = x;
      scroll.scrollTop = y;
    });
  api.focus();
}

/** Of het spoor in een selectie van hele kolommen (of rijen) valt, en welke dat zijn. */
function geselecteerdeSporen(api: XlsxEditorApi, soort: Soort, nummer: number) {
  try {
    const { bereik } = leesSelectie(api);
    const heel =
      soort === "kolom"
        ? bereik.top === 0 && bereik.bottom === MAX_RIJEN - 1
        : bereik.left === 0 && bereik.right === MAX_KOLOMMEN - 1;
    const [van, tot] =
      soort === "kolom" ? [bereik.left, bereik.right] : [bereik.top, bereik.bottom];
    if (heel && nummer >= van && nummer <= tot)
      return Array.from({ length: Math.min(tot - van + 1, 10000) }, (_, i) => van + i);
  } catch {
    // Geen selectie: alleen dit spoor.
  }
  return null;
}

/** De rand van het begrensde raster binnen de getekende sporen. */
function rasterRand(
  api: XlsxEditorApi,
  kolommen: Spoor[],
  rijen: Spoor[],
): { rand: RasterRand; kolommen: Spoor[]; rijen: Spoor[] } | null {
  const blad = api.handle.sheetInfo().activeSheet;
  const raster = rasterBlad(api.handle, blad);
  if (!raster?.begrensd) return null;
  const { omvang } = raster;
  const binnen = (sporen: Spoor[], aantal: number) => {
    const eerste = sporen.findIndex((s) => s.nummer >= aantal);
    if (eerste < 0) return { sporen, rand: null as number | null };
    return { sporen: sporen.slice(0, eerste), rand: sporen[eerste].positie };
  };
  const k = binnen(kolommen, omvang.kolommen);
  const r = binnen(rijen, omvang.rijen);
  return {
    kolommen: k.sporen,
    rijen: r.sporen,
    rand: {
      omvang,
      x: k.rand,
      y: r.rand,
      kolomPx: k.sporen.at(-1)?.grootte ?? 64,
      rijPx: r.sporen.at(-1)?.grootte ?? 20,
    },
  };
}

/** De schuifruimte volgt het begrensde raster: tot de rand plus de groeistrook. */
function begrensSchuifruimte(
  werkruimte: HTMLElement,
  scroll: HTMLElement,
  api: XlsxEditorApi,
  zoom: number,
) {
  const blad = api.handle.sheetInfo().activeSheet;
  const raster = rasterBlad(api.handle, blad);
  const zet = (naam: string, waarde: string) => {
    if (werkruimte.style.getPropertyValue(naam) !== waarde) werkruimte.style.setProperty(naam, waarde);
  };
  if (!raster?.begrensd) {
    if (werkruimte.dataset.rasterBegrensd) {
      delete werkruimte.dataset.rasterBegrensd;
      for (const naam of ["--raster-breedte", "--raster-hoogte", "--raster-schuif-x", "--raster-schuif-y"])
        werkruimte.style.removeProperty(naam);
    }
    return;
  }
  const { rijen, kolommen } = raster.omvang;
  const breedte =
    kolommen < MAX_KOLOMMEN ? Math.ceil(api.handle.cellRect(blad, 0, kolommen).x * zoom) + STROOK + 2 : Infinity;
  const hoogte =
    rijen < MAX_RIJEN ? Math.ceil(api.handle.cellRect(blad, rijen, 0).y * zoom) + STROOK + 2 : Infinity;
  // Past het raster in het venster, dan is er op die as niets te schuiven. De
  // engine maakt zijn canvas even groot als het venster; zonder deze regel
  // zou dat canvas zelf een paar pixels schuifruimte en twee balken opleveren.
  const balk = 16;
  let schuifX = breedte > scroll.offsetWidth;
  let schuifY = hoogte > scroll.offsetHeight;
  if (schuifX && !schuifY) schuifY = hoogte > scroll.offsetHeight - balk;
  if (schuifY && !schuifX) schuifX = breedte > scroll.offsetWidth - balk;
  zet("--raster-breedte", Number.isFinite(breedte) ? `${breedte}px` : "");
  zet("--raster-hoogte", Number.isFinite(hoogte) ? `${hoogte}px` : "");
  zet("--raster-schuif-x", schuifX ? "auto" : "hidden");
  zet("--raster-schuif-y", schuifY ? "auto" : "hidden");
  werkruimte.dataset.rasterBegrensd = "true";
  if (!schuifX && scroll.scrollLeft) scroll.scrollLeft = 0;
  if (!schuifY && scroll.scrollTop) scroll.scrollTop = 0;
}

export function RekenbladKoppen({
  host,
  api,
  laag,
}: {
  host: RefObject<HTMLDivElement | null>;
  api: XlsxEditorApi | null;
  laag?: RekenbladLaag | null;
}) {
  const { t } = useTranslation("spreadsheet");
  const [koppen, setKoppen] = useState<Koppen | null>(null);
  const [slepen, setSlepen] = useState<Slepen | null>(null);
  const anker = useRef<{ soort: Soort; nummer: number } | null>(null);
  const randNu = useRef<RasterRand | null>(null);
  randNu.current = koppen?.rand ?? null;
  // Begrensd raster (#371): toetsen en de muis blijven binnen het raster.
  useEffect(() => {
    if (!api || !laag) return;
    const bewaak = () => bewaakRasterSelectie(api, laag.selectie());
    const stop = [laag.abonneer(bewaak), abonneerRaster(api.handle, bewaak)];
    return () => stop.forEach((s) => s());
  }, [api, laag]);
  // Alleen de editor in het zichtbare tabblad bedient de statusbalk.
  const zichtbaar = useEditorZichtbaar();
  useEffect(() => (api && zichtbaar ? registreerRasterEditor(api) : undefined), [api, zichtbaar]);
  useEffect(() => {
    const scroll = host.current?.querySelector<HTMLElement>('[data-testid="xlsx-scroll"]');
    if (!scroll || !api) return;
    // Buiten het raster zijn geen cellen: de engine mag daar niets selecteren.
    const buiten = (e: MouseEvent) => {
      const rand = randNu.current;
      if (!rand) return false;
      const r = scroll.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      // De schuifbalken liggen buiten het canvas en blijven bruikbaar.
      if (x > scroll.clientWidth || y > scroll.clientHeight) return false;
      return (rand.x !== null && x >= rand.x) || (rand.y !== null && y >= rand.y);
    };
    const blokkeer = (e: MouseEvent) => {
      if (!buiten(e)) return;
      e.stopPropagation();
      if (e.type === "mousemove") scroll.style.cursor = "default";
      else if (e.type !== "mouseup") e.preventDefault();
    };
    const soorten = ["mousedown", "click", "dblclick", "contextmenu", "mousemove"] as const;
    soorten.forEach((s) => scroll.addEventListener(s, blokkeer, true));
    return () => soorten.forEach((s) => scroll.removeEventListener(s, blokkeer, true));
  }, [api, host]);
  useEffect(() => {
    const werkruimte = host.current;
    const scroll = werkruimte?.querySelector<HTMLElement>(
      '[data-testid="xlsx-scroll"]',
    );
    if (!werkruimte || !scroll || !api) return;
    const raster = volgKopRaster(api.handle, () => plannen());
    let heeftGemeten = false;
    let frame = 0;
    let gestopt = false;
    function ververs() {
      frame = 0;
      if (gestopt || !scroll || !werkruimte || !api) return;
      const zoom = api.commands.getState("zoom").value ?? 1;
      const venster = {
        x: scroll.scrollLeft / zoom,
        y: scroll.scrollTop / zoom,
        width: scroll.clientWidth / zoom,
        height: scroll.clientHeight / zoom,
      };
      // Na openen mag één eerste lezing. Daarna volgen de koppen het echt
      // getekende venster in plaats van het raster vóór de engine te bouwen.
      if (heeftGemeten && !raster.beschikbaar(venster)) return;
      const grid = raster.lees(venster);
      heeftGemeten = true;
      if (!grid) {
        setKoppen(null);
        return;
      }
      const gebied = scroll.getBoundingClientRect();
      const buiten = werkruimte.getBoundingClientRect();
      const sporen = (
        offsets: number[],
        start: number,
        indices?: number[],
      ): Spoor[] =>
        offsets.slice(0, -1).map((positie, index) => ({
          positie: positie * zoom,
          grootte: (offsets[index + 1] - positie) * zoom,
          nummer: indices?.[index] ?? start + index,
        }));
      const alleKolommen = sporen(grid.colOffsets, grid.startCol, grid.colIndices);
      const alleRijen = sporen(grid.rowOffsets, grid.startRow, grid.rowIndices);
      const begrensd = rasterRand(api, alleKolommen, alleRijen);
      begrensSchuifruimte(werkruimte, scroll, api, zoom);
      setKoppen({
        links: gebied.left - buiten.left,
        boven: gebied.top - buiten.top,
        breedte: scroll.clientWidth,
        hoogte: scroll.clientHeight,
        kolommen: begrensd?.kolommen ?? alleKolommen,
        rijen: begrensd?.rijen ?? alleRijen,
        rand: begrensd?.rand ?? null,
        actief:
          werkruimte.querySelector<HTMLInputElement>(
            '[data-testid="xlsx-name-box"]',
          )?.value ?? "",
        zoom,
      });
    }
    const plannen = () => {
      if (!frame) frame = requestAnimationFrame(ververs);
    };
    const grootte = new ResizeObserver(plannen);
    grootte.observe(scroll);
    scroll.addEventListener("scroll", plannen, { passive: true });
    const stopOpdrachten = api.commands.subscribe(plannen);
    const stopWijzigingen = api.handle.onUpdate(plannen);
    // Een andere rasterkeuze of marge tekent de engine niet opnieuw: lees zelf.
    const opnieuw = () => {
      heeftGemeten = false;
      plannen();
    };
    const stopRaster = abonneerRaster(api.handle, opnieuw);
    const stopInstellingen = volgInstellingen(opnieuw);
    plannen();
    return () => {
      gestopt = true;
      stopRaster();
      stopInstellingen();
      delete werkruimte.dataset.rasterBegrensd;
      for (const naam of ["--raster-breedte", "--raster-hoogte", "--raster-schuif-x", "--raster-schuif-y"])
        werkruimte.style.removeProperty(naam);
      cancelAnimationFrame(frame);
      grootte.disconnect();
      scroll.removeEventListener("scroll", plannen);
      stopOpdrachten();
      stopWijzigingen();
      raster.stop();
    };
  }, [api, host]);

  // Een rand slepen: hulplijn tonen, bij loslaten breedte of hoogte zetten.
  useEffect(() => {
    if (!slepen || !api) return;
    const verplaats = (e: MouseEvent) => {
      const delta = (slepen.soort === "kolom" ? e.clientX : e.clientY) - slepen.start;
      setSlepen((s) => (s ? { ...s, delta: Math.max(delta, -s.grootte) } : s));
    };
    const los = () => {
      setSlepen(null);
      const zoom = koppen?.zoom ?? 1;
      if (Math.abs(slepen.delta) < 1) return;
      const px = Math.max(0, (slepen.grootte + slepen.delta) / zoom);
      const sporen = geselecteerdeSporen(api, slepen.soort, slepen.nummer) ?? [slepen.nummer];
      const klaar =
        slepen.soort === "kolom"
          ? zetBreedte(api, breedteTekens(px), sporen)
          : zetHoogte(api, px <= 0.5 ? 0 : hoogteVoor(px), sporen);
      void klaar.catch(() => {});
    };
    window.addEventListener("mousemove", verplaats);
    window.addEventListener("mouseup", los, { once: true });
    return () => {
      window.removeEventListener("mousemove", verplaats);
      window.removeEventListener("mouseup", los);
    };
  }, [slepen, api, koppen?.zoom]);

  if (!koppen || !api) return null;
  const actief = /^([A-Z]+)(\d+)/.exec(koppen.actief);
  const scroll = () =>
    host.current?.querySelector<HTMLElement>('[data-testid="xlsx-scroll"]') ?? null;
  const schrijfbaar = !alleenLezen(api);

  /** De rand onder de muis: van het spoor zelf (rechts/onder) of van het vorige spoor. */
  function randBij(soort: Soort, e: React.MouseEvent, spoor: Spoor, lijst: Spoor[]) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = soort === "kolom" ? e.clientX - r.left : e.clientY - r.top;
    const kant = kopRand(spoor.grootte, pos);
    if (kant === "huidige") return spoor;
    if (kant === "vorige") {
      const i = lijst.indexOf(spoor);
      return i > 0 ? lijst[i - 1] : null;
    }
    return null;
  }

  function omlaag(soort: Soort, spoor: Spoor, lijst: Spoor[], e: React.MouseEvent) {
    if (!api || e.button !== 0) return;
    e.preventDefault();
    const rand = randBij(soort, e, spoor, lijst);
    if (rand && schrijfbaar && e.detail < 2) {
      setSlepen({
        soort,
        nummer: rand.nummer,
        start: soort === "kolom" ? e.clientX : e.clientY,
        grootte: rand.grootte,
        delta: 0,
      });
      return;
    }
    if (rand) return;
    const vorige = anker.current;
    const van =
      e.shiftKey && vorige?.soort === soort ? Math.min(vorige.nummer, spoor.nummer) : spoor.nummer;
    const tot =
      e.shiftKey && vorige?.soort === soort ? Math.max(vorige.nummer, spoor.nummer) : spoor.nummer;
    if (!e.shiftKey || vorige?.soort !== soort) anker.current = { soort, nummer: spoor.nummer };
    selecteerSporen(api, scroll(), soort, van, tot);
    // Slepen over de koppen breidt de selectie uit.
    const begin = anker.current!.nummer;
    const verder = (m: MouseEvent) => {
      const doel = document
        .elementsFromPoint(m.clientX, m.clientY)
        .find((el) => el instanceof HTMLElement && el.dataset.spoor && el.dataset.soort === soort);
      const nummer = doel instanceof HTMLElement ? Number(doel.dataset.spoor) : null;
      if (nummer === null) return;
      selecteerSporen(api, scroll(), soort, Math.min(begin, nummer), Math.max(begin, nummer));
    };
    window.addEventListener("mousemove", verder);
    window.addEventListener("mouseup", () => window.removeEventListener("mousemove", verder), {
      once: true,
    });
  }

  function dubbel(soort: Soort, spoor: Spoor, lijst: Spoor[], e: React.MouseEvent) {
    if (!api || !schrijfbaar) return;
    const rand = randBij(soort, e, spoor, lijst);
    if (!rand) return;
    e.preventDefault();
    const sporen = geselecteerdeSporen(api, soort, rand.nummer) ?? [rand.nummer];
    void (soort === "kolom" ? optimaleBreedte(api, sporen) : optimaleHoogte(api, sporen)).catch(
      () => {},
    );
  }

  function menu(soort: Soort, spoor: Spoor, e: React.MouseEvent) {
    if (!api) return;
    e.preventDefault();
    if (!geselecteerdeSporen(api, soort, spoor.nummer)) {
      anker.current = { soort, nummer: spoor.nummer };
      selecteerSporen(api, scroll(), soort, spoor.nummer, spoor.nummer);
    }
    openVenster(host.current, { soort: "menu", menu: soort, x: e.clientX, y: e.clientY });
  }

  const titel = (soort: Soort, spoor: Spoor) => {
    const blad = api.handle.sheetInfo().activeSheet;
    return soort === "kolom"
      ? t("structure.columnTip", {
          name: kolomnaam(spoor.nummer),
          width: formatGetal(breedteTekens(kolomPx(api, blad, spoor.nummer)), {
            maximumFractionDigits: 2,
          }),
        })
      : t("structure.rowTip", {
          name: spoor.nummer + 1,
          height: formatGetal(hoogtePunten(rijPx(api, blad, spoor.nummer)), {
            maximumFractionDigits: 2,
          }),
        });
  };

  const hulplijn =
    slepen &&
    (slepen.soort === "kolom"
      ? koppen.kolommen.find((k) => k.nummer === slepen.nummer)
      : koppen.rijen.find((r) => r.nummer === slepen.nummer));

  return (
    <>
    <div className="rekenblad-koppen" aria-hidden="true">
      <div
        className="rekenblad-hoek"
        style={{ left: koppen.links - 38, top: koppen.boven - 23 }}
        title={t("structure.selectAll")}
        onMouseDown={(e) => {
          e.preventDefault();
          const blad = api.handle.sheetInfo().activeSheet;
          api.selectCells(blad, {
            anchor: { row: MAX_RIJEN - 1, col: MAX_KOLOMMEN - 1 },
            focus: { row: 0, col: 0 },
          });
          api.focus();
        }}
      />
      <div
        className="rekenblad-kolomkoppen"
        style={{
          left: koppen.links,
          top: koppen.boven - 23,
          width: koppen.breedte,
        }}
      >
        {koppen.kolommen.map((kolom) => (
          <span
            key={kolom.nummer}
            data-actief={kolomnaam(kolom.nummer) === actief?.[1]}
            data-spoor={kolom.nummer}
            data-soort="kolom"
            style={{ left: kolom.positie, width: kolom.grootte, "--koprand": `${kopRandBreedte(kolom.grootte)}px` } as CSSProperties}
            onMouseDown={(e) => omlaag("kolom", kolom, koppen.kolommen, e)}
            onDoubleClick={(e) => dubbel("kolom", kolom, koppen.kolommen, e)}
            onContextMenu={(e) => menu("kolom", kolom, e)}
            onMouseEnter={(e) => {
              e.currentTarget.title = titel("kolom", kolom);
            }}
          >
            <span className="rekenblad-koptekst" style={{ visibility: kolom.grootte < 12 ? "hidden" : undefined }}>
              {kolomnaam(kolom.nummer)}
            </span>
          </span>
        ))}
      </div>
      <div
        className="rekenblad-rijkoppen"
        style={{
          left: koppen.links - 38,
          top: koppen.boven,
          height: koppen.hoogte,
        }}
      >
        {koppen.rijen.map((rij) => (
          <span
            key={rij.nummer}
            data-actief={rij.nummer + 1 === Number(actief?.[2])}
            data-spoor={rij.nummer}
            data-soort="rij"
            style={{ top: rij.positie, height: rij.grootte, "--koprand": `${kopRandBreedte(rij.grootte)}px` } as CSSProperties}
            onMouseDown={(e) => omlaag("rij", rij, koppen.rijen, e)}
            onDoubleClick={(e) => dubbel("rij", rij, koppen.rijen, e)}
            onContextMenu={(e) => menu("rij", rij, e)}
            onMouseEnter={(e) => {
              e.currentTarget.title = titel("rij", rij);
            }}
          >
            <span className="rekenblad-koptekst" style={{ visibility: rij.grootte < 10 ? "hidden" : undefined }}>
              {rij.nummer + 1}
            </span>
          </span>
        ))}
      </div>
      {slepen && hulplijn && (
        <div
          className={`rekenblad-hulplijn is-${slepen.soort}`}
          style={
            slepen.soort === "kolom"
              ? {
                  left: koppen.links + hulplijn.positie + slepen.grootte + slepen.delta,
                  top: koppen.boven - 23,
                  height: koppen.hoogte + 23,
                }
              : {
                  top: koppen.boven + hulplijn.positie + slepen.grootte + slepen.delta,
                  left: koppen.links - 38,
                  width: koppen.breedte + 38,
                }
          }
        />
      )}
    </div>
    {koppen.rand && (
      <BegrensdRasterLaag
        api={api}
        rand={koppen.rand}
        links={koppen.links}
        boven={koppen.boven}
        breedte={koppen.breedte}
        hoogte={koppen.hoogte}
      />
    )}
    </>
  );
}
