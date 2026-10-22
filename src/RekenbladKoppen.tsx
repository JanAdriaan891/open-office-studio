import { useEffect, useState, type RefObject } from "react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";

type Spoor = { positie: number; grootte: number; nummer: number };
type Koppen = {
  links: number;
  boven: number;
  breedte: number;
  hoogte: number;
  kolommen: Spoor[];
  rijen: Spoor[];
  actief: string;
};

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

export function RekenbladKoppen({
  host,
  api,
}: {
  host: RefObject<HTMLDivElement | null>;
  api: XlsxEditorApi | null;
}) {
  const [koppen, setKoppen] = useState<Koppen | null>(null);
  useEffect(() => {
    const werkruimte = host.current;
    const scroll = werkruimte?.querySelector<HTMLElement>(
      '[data-testid="xlsx-scroll"]',
    );
    if (!werkruimte || !scroll || !api) return;
    let frame = 0;
    let gestopt = false;
    function ververs() {
      frame = 0;
      if (gestopt || !scroll || !werkruimte || !api) return;
      const zoom = api.commands.getState("zoom").value ?? 1;
      const grid = api.handle.displayList({
        x: scroll.scrollLeft / zoom,
        y: scroll.scrollTop / zoom,
        width: scroll.clientWidth / zoom,
        height: scroll.clientHeight / zoom,
      }).grid;
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
      setKoppen({
        links: gebied.left - buiten.left,
        boven: gebied.top - buiten.top,
        breedte: scroll.clientWidth,
        hoogte: scroll.clientHeight,
        kolommen: sporen(grid.colOffsets, grid.startCol, grid.colIndices),
        rijen: sporen(grid.rowOffsets, grid.startRow, grid.rowIndices),
        actief:
          werkruimte.querySelector<HTMLInputElement>(
            '[data-testid="xlsx-name-box"]',
          )?.value ?? "",
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
    plannen();
    return () => {
      gestopt = true;
      cancelAnimationFrame(frame);
      grootte.disconnect();
      scroll.removeEventListener("scroll", plannen);
      stopOpdrachten();
      stopWijzigingen();
    };
  }, [api, host]);
  if (!koppen) return null;
  const actief = /^([A-Z]+)(\d+)/.exec(koppen.actief);
  return (
    <div className="rekenblad-koppen" aria-hidden="true">
      <div
        className="rekenblad-hoek"
        style={{ left: koppen.links - 38, top: koppen.boven - 23 }}
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
            style={{ left: kolom.positie, width: kolom.grootte }}
          >
            {kolomnaam(kolom.nummer)}
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
            style={{ top: rij.positie, height: rij.grootte }}
          >
            {rij.nummer + 1}
          </span>
        ))}
      </div>
    </div>
  );
}
