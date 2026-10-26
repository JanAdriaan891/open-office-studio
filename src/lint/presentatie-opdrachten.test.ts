import { describe, expect, it, vi } from "vitest";
import type { ShapeSnapshot } from "@betteroffice/pptx";
import {
  datumTekst,
  kaderVan,
  uitgelijnd,
  verplaatsDia,
  verplaatsDoel,
  verwijderDia,
  vormBijKader,
  type DiaHandle,
} from "./presentatie-opdrachten";

const vorm = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
) => ({ id, x, y, width, height, inherited: null }) as ShapeSnapshot;

describe("verplaatsDoel", () => {
  it("verplaatst binnen de presentatie", () => {
    expect(verplaatsDoel(1, 4, "omhoog")).toBe(0);
    expect(verplaatsDoel(1, 4, "omlaag")).toBe(2);
    expect(verplaatsDoel(2, 4, "begin")).toBe(0);
    expect(verplaatsDoel(1, 4, "einde")).toBe(3);
  });
  it("doet niets aan de rand", () => {
    expect(verplaatsDoel(0, 4, "omhoog")).toBeNull();
    expect(verplaatsDoel(0, 4, "begin")).toBeNull();
    expect(verplaatsDoel(3, 4, "omlaag")).toBeNull();
    expect(verplaatsDoel(3, 4, "einde")).toBeNull();
    expect(verplaatsDoel(0, 1, "omlaag")).toBeNull();
  });
});

describe("uitgelijnd", () => {
  const kader = { x: 10, y: 20, width: 100, height: 50 };
  it("lijnt uit op de dia", () => {
    expect(uitgelijnd(kader, 1000, 500, "links")).toEqual({ ...kader, x: 0 });
    expect(uitgelijnd(kader, 1000, 500, "centreren").x).toBe(450);
    expect(uitgelijnd(kader, 1000, 500, "rechts").x).toBe(900);
    expect(uitgelijnd(kader, 1000, 500, "boven").y).toBe(0);
    expect(uitgelijnd(kader, 1000, 500, "midden").y).toBe(225);
    expect(uitgelijnd(kader, 1000, 500, "onder")).toEqual({ ...kader, y: 450 });
  });
});

describe("vorm bij selectiekader", () => {
  it("gebruikt het geërfde kader van een tijdelijke aanduiding", () => {
    const aanduiding = {
      ...vorm("t", 0, 0, 0, 0),
      inherited: {
        x: 5,
        y: 6,
        width: 7,
        height: 8,
        rotationDeg: 0,
        flipH: false,
        flipV: false,
      },
    } as ShapeSnapshot;
    expect(kaderVan(aanduiding)).toEqual({ x: 5, y: 6, width: 7, height: 8 });
    expect(kaderVan(vorm("leeg", 0, 0, 0, 0))).toBeNull();
  });
  it("kiest de best passende vorm binnen de tolerantie", () => {
    const vormen = [vorm("a", 0, 0, 100, 100), vorm("b", 2, 1, 98, 99)];
    expect(
      vormBijKader(vormen, { x: 2, y: 1, width: 98, height: 99 }, 5)?.id,
    ).toBe("b");
    expect(
      vormBijKader(vormen, { x: 50, y: 50, width: 10, height: 10 }, 5),
    ).toBeNull();
  });
});

it("schrijft datum en tijd in Nederlandse notatie", () => {
  const moment = new Date(2026, 9, 6, 9, 5);
  expect(datumTekst(moment, "datum")).toBe("06-10-2026");
  expect(datumTekst(moment, "tijd")).toBe("09:05");
});

function nepHandle(aantal: number) {
  let dias = Array.from({ length: aantal }, (_, i) => ({
    id: `d${i}`,
    shapes: [],
  }));
  const handle = {
    snapshot: () => ({ widthEmu: 100, heightEmu: 50, slides: dias }),
    version: () => "v",
    addUndoBoundary: vi.fn(),
    deleteSlide: vi.fn((id: string) => {
      dias = dias.filter((dia) => dia.id !== id);
    }),
    moveSlide: vi.fn((id: string, naar: number) => {
      const dia = dias.find((d) => d.id === id)!;
      dias = dias.filter((d) => d !== dia);
      dias.splice(naar, 0, dia);
    }),
  } as unknown as DiaHandle;
  const toepassen = vi.fn(() => ({ ok: true, applied: true }) as never);
  return { handle, toepassen, dias: () => dias.map((d) => d.id) };
}

describe("diabewerkingen", () => {
  it("weigert de enige dia te verwijderen", async () => {
    const { handle, toepassen } = nepHandle(1);
    await expect(verwijderDia(handle, toepassen, 0)).rejects.toThrow();
    expect(handle.deleteSlide).not.toHaveBeenCalled();
  });
  it("verwijdert als eigen ongedaan-maakstap en meldt de wijziging", async () => {
    const { handle, toepassen, dias } = nepHandle(3);
    await verwijderDia(handle, toepassen, 1);
    expect(dias()).toEqual(["d0", "d2"]);
    expect(handle.addUndoBoundary).toHaveBeenCalledTimes(2);
    expect(toepassen).toHaveBeenCalledTimes(2);
    expect(toepassen).toHaveBeenCalledWith(
      expect.objectContaining({ history: "none" }),
    );
  });
  it("verplaatst en geeft de nieuwe positie", async () => {
    const { handle, toepassen, dias } = nepHandle(3);
    expect(await verplaatsDia(handle, toepassen, 0, "einde")).toBe(2);
    expect(dias()).toEqual(["d1", "d2", "d0"]);
    expect(await verplaatsDia(handle, toepassen, 2, "omlaag")).toBeNull();
  });
});
