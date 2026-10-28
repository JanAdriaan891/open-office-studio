import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { huidigePagina, type Meting } from "./meten";
import { knipBinnen, plaats } from "./positie";
import type { Tabelgrootte } from "./raster";
import "./tabelvoorbeeld.css";

/**
 * Tekent een voorbeeldtabel boven het documentvlak op de plek van de cursor.
 * Het document zelf verandert niet: dit is alleen een laag erboven, die elke
 * frame de pagina volgt (scrollen, zoomen, venstergrootte).
 */
export function TabelVoorbeeld({
  grootte,
  meting,
}: {
  grootte: Tabelgrootte;
  meting: Meting;
}) {
  const laag = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const werkBij = () => {
      const element = laag.current;
      const nu = huidigePagina(meting);
      if (element) {
        if (!nu) element.style.display = "none";
        else {
          const p = plaats(meting.anker, nu.pagina, grootte.rijen);
          element.style.display = "";
          element.style.left = `${p.left}px`;
          element.style.top = `${p.top}px`;
          element.style.width = `${p.width}px`;
          element.style.height = `${p.height}px`;
          element.style.setProperty("--tabelvoorbeeld-rij", `${p.rijhoogte}px`);
          element.style.clipPath = knipBinnen(p, nu.vlak);
        }
      }
      frame = requestAnimationFrame(werkBij);
    };
    werkBij();
    return () => cancelAnimationFrame(frame);
  }, [meting, grootte.rijen]);
  const cellen = [];
  for (let rij = 0; rij < grootte.rijen; rij++)
    for (let kolom = 0; kolom < grootte.kolommen; kolom++)
      cellen.push(
        <div
          key={`${rij}-${kolom}`}
          className={rij === 0 ? "tabelvoorbeeld-cel tabelvoorbeeld-kop" : "tabelvoorbeeld-cel"}
        />,
      );
  return createPortal(
    <div
      ref={laag}
      className="tabelvoorbeeld"
      aria-hidden="true"
      data-rijen={grootte.rijen}
      data-kolommen={grootte.kolommen}
      style={{ gridTemplateColumns: `repeat(${grootte.kolommen}, minmax(0, 1fr))` }}
    >
      {cellen}
    </div>,
    document.body,
  );
}
