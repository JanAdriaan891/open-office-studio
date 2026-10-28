import { describe, expect, it } from "vitest";
import {
  bepaalAnker,
  geldigeMaten,
  knipBinnen,
  paginaBij,
  plaats,
  STANDAARD_PAGINA,
} from "./positie";

const pagina100 = { left: 292, top: 288, width: 816, height: 1056 };
const cursor = { left: 458, top: 415, width: 1, height: 18 };

describe("positie van het tabelvoorbeeld", () => {
  it("staat in een lege alinea op de plek van de cursor, vanaf de linkermarge", () => {
    const anker = bepaalAnker({
      cursor,
      pagina: pagina100,
      maten: STANDAARD_PAGINA,
      legeAlinea: true,
    });
    expect(anker).toMatchObject({ x: 96, y: 127, breedte: 624, rijhoogte: 18, paginabreedte: 816 });
    const p = plaats(anker, pagina100, 3);
    expect(p).toMatchObject({ left: 388, top: 415, width: 624, height: 54, rijhoogte: 18, schaal: 1 });
  });

  it("komt onder een alinea met tekst", () => {
    const anker = bepaalAnker({ cursor, pagina: pagina100, maten: null, legeAlinea: false });
    expect(anker.y).toBeCloseTo(127 + 18 + 14.4);
  });

  it("schaalt mee met zoom en scrollt mee met de pagina", () => {
    const pagina150 = { left: 100, top: 50, width: 816 * 1.5, height: 1056 * 1.5 };
    const anker = bepaalAnker({
      cursor: { left: 0, top: 50 + 300, width: 1, height: 27 },
      pagina: pagina150,
      maten: { pageWidth: 11906, marginLeft: 1134, marginRight: 1134 },
      legeAlinea: true,
    });
    // A4 met marges van 2 cm
    expect(anker.paginabreedte).toBeCloseTo(793.73, 1);
    const schaal = pagina150.width / anker.paginabreedte;
    expect(anker.rijhoogte).toBeCloseTo(27 / schaal);
    const gescrold = { ...pagina150, top: pagina150.top - 200 };
    const p = plaats(anker, gescrold, 2);
    expect(p.schaal).toBeCloseTo(schaal);
    expect(p.top).toBeCloseTo(150);
    expect(p.left).toBeCloseTo(100 + 75.6 * schaal);
    // de engine maakt een tabel altijd 9360 twips breed
    expect(p.width).toBeCloseTo((9360 / 15) * schaal);
    expect(p.height).toBeCloseTo(54);
  });

  it("vult onzinnige paginamaten aan", () => {
    expect(geldigeMaten(undefined)).toEqual(STANDAARD_PAGINA);
    const m = geldigeMaten({ pageWidth: 12240, marginLeft: 7000, marginRight: 7000 });
    expect(m.marginLeft + m.marginRight).toBeLessThan(m.pageWidth);
  });

  it("knipt af op het zichtbare documentvlak", () => {
    const vlak = { left: 0, top: 200, width: 1000, height: 600 };
    expect(knipBinnen({ left: 100, top: 150, width: 500, height: 100 }, vlak)).toBe(
      "inset(50px 0px 0px 0px)",
    );
    expect(knipBinnen({ left: 900, top: 750, width: 200, height: 100 }, vlak)).toBe(
      "inset(0px 100px 50px 0px)",
    );
  });

  it("kiest de pagina onder de cursor", () => {
    const paginas = [
      { left: 0, top: 0, width: 800, height: 1000 },
      { left: 0, top: 1016, width: 800, height: 1000 },
    ];
    expect(paginaBij(paginas, 500)).toBe(0);
    expect(paginaBij(paginas, 1500)).toBe(1);
    expect(paginaBij(paginas, 1010)).toBe(1);
    expect(paginaBij([], 10)).toBe(-1);
  });
});
