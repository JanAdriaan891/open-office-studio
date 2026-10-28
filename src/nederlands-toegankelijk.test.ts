import { describe, expect, it } from "vitest";
import { en as tekstEn } from "@betteroffice/docx-i18n";
import { en as rekenbladEn } from "@betteroffice/xlsx-i18n";
import { en as diaEn } from "@betteroffice/pptx-i18n";
import {
  diaNlVolledig,
  rekenbladNlVolledig,
  tekstNlVolledig,
  voegSamen,
} from "./nederlands-toegankelijk";

type Boom = Record<string, unknown>;
/** Sleutels voor schermlezers (a11y en aria) die nog Engels zouden zijn. */
function ontbrekend(en: Boom, nl: Boom | undefined, pad = ""): string[] {
  return Object.entries(en).flatMap(([sleutel, waarde]) => {
    const volledig = pad + sleutel;
    if (waarde && typeof waarde === "object")
      return ontbrekend(waarde as Boom, nl?.[sleutel] as Boom | undefined, volledig + ".");
    return /(^|\.)a11y\.|aria/i.test(volledig) && nl?.[sleutel] === undefined ? [volledig] : [];
  });
}

describe("Nederlandse teksten voor schermlezers", () => {
  it.each([
    ["Tekst", tekstEn, tekstNlVolledig],
    ["Rekenblad", rekenbladEn, rekenbladNlVolledig],
    ["Presentatie", diaEn, diaNlVolledig],
  ])("%s heeft alle a11y- en aria-teksten", (_, en, nl) => {
    expect(ontbrekend(en as Boom, nl as Boom)).toEqual([]);
  });

  it("laat bestaande vertalingen staan", () => {
    expect(voegSamen({ a: { b: "x" } }, { a: { b: "y", c: "z" } })).toEqual({
      a: { b: "x", c: "z" },
    });
    expect(rekenbladNlVolledig.editor?.appLabel).toBe("Rekenblad");
  });
});
