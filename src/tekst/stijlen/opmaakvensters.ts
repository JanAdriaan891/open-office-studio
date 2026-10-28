/**
 * Koppeling tussen de stijl-editor en de vensters Lettertype… en Alinea…
 * van pakket W1 (src/tekst/lettertype, src/tekst/alinea): beginwaarden uit
 * de (opgeloste) stijl, en hun wijziging terug als stijleigenschappen.
 */
import type { ParagraphFormatting, TextFormatting } from "@betteroffice/docx/types/document";
import { formulierUit as alineaFormulier, type AlineaFormulier } from "../alinea/model";
import { formulierUit as lettertypeFormulier, type LettertypeFormulier } from "../lettertype/model";
import type { AlineaOpmaak, GelezenTekens, TekenOpmaak } from "../opmaak";
import type { StijlEigenschappen } from "./stijlenxml";

const rond = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const TWIP_PER_CM = 1440 / 2.54;

/** Beginwaarden voor het lettertypevenster uit opgeloste tekenopmaak plus de formulierwaarden. */
export function lettertypeBegin(r: TextFormatting, e: StijlEigenschappen, lettertype?: string): LettertypeFormulier {
  const gelezen: GelezenTekens = {
    fontFamily: e.lettertype ?? lettertype ?? r.fontFamily?.ascii ?? null,
    fontSize: e.grootte ?? (r.fontSize ? r.fontSize / 2 : null),
    bold: e.vet ?? !!r.bold,
    italic: e.cursief ?? !!r.italic,
    color: e.kleur ?? (r.color?.rgb && /^[0-9a-f]{6}$/i.test(r.color.rgb) ? r.color.rgb.toUpperCase() : null),
    underline:
      e.onderstreping !== undefined
        ? e.onderstreping
          ? { style: e.onderstreping, color: e.onderstrepingKleur ?? null }
          : null
        : e.onderstreept !== undefined
          ? e.onderstreept
            ? { style: "single", color: null }
            : null
          : r.underline && r.underline.style !== "none"
            ? { style: r.underline.style, color: r.underline.color?.rgb ?? null }
            : null,
    strike: (e.dubbelDoorgehaald ?? r.doubleStrike) ? "dubbel" : (e.doorgehaald ?? r.strike) ? "enkel" : null,
    vertAlign:
      (e.verticaal ?? r.vertAlign) === "superscript" ? "superscript" : (e.verticaal ?? r.vertAlign) === "subscript" ? "subscript" : null,
    smallCaps: e.kleineHoofdletters ?? !!r.smallCaps,
    allCaps: e.hoofdletters ?? !!r.allCaps,
    hidden: e.verborgen ?? !!r.hidden,
    afstand: {
      spacing: e.tekenafstand ?? r.spacing,
      scale: e.schaal ?? r.scale,
      position: e.positie ?? r.position,
      kerning: e.spatiering ?? r.kerning,
    },
  };
  return lettertypeFormulier(gelezen);
}

/** De wijziging uit het lettertypevenster als stijleigenschappen. */
export function vanTekenOpmaak(w: TekenOpmaak): StijlEigenschappen {
  const e: StijlEigenschappen = {};
  if (w.fontFamily !== undefined) e.lettertype = w.fontFamily;
  if (w.fontSize !== undefined) e.grootte = w.fontSize;
  if (w.bold !== undefined) e.vet = w.bold;
  if (w.italic !== undefined) e.cursief = w.italic;
  if (w.color !== undefined) e.kleur = w.color;
  if (w.underline !== undefined) {
    e.onderstreping = w.underline ? w.underline.style : "none";
    e.onderstrepingKleur = w.underline?.color ?? null;
  }
  if (w.strike !== undefined) {
    e.doorgehaald = w.strike === "enkel";
    e.dubbelDoorgehaald = w.strike === "dubbel";
  }
  if (w.vertAlign !== undefined) e.verticaal = w.vertAlign ?? "baseline";
  if (w.smallCaps !== undefined) e.kleineHoofdletters = w.smallCaps;
  if (w.allCaps !== undefined) e.hoofdletters = w.allCaps;
  if (w.hidden !== undefined) e.verborgen = w.hidden;
  if (w.spacing !== undefined) e.tekenafstand = w.spacing || null;
  if (w.scale !== undefined) e.schaal = w.scale === 100 ? null : w.scale;
  if (w.position !== undefined) e.positie = w.position || null;
  if (w.kerning !== undefined) e.spatiering = w.kerning;
  return e;
}

/** Beginwaarden voor het alineavenster uit opgeloste alinea-opmaak plus de formulierwaarden. */
export function alineaBegin(p: ParagraphFormatting, e: StijlEigenschappen): AlineaFormulier {
  const eerste = e.eersteRegel;
  const vast = e.regelafstandPt;
  return alineaFormulier({
    ...(p as unknown as Record<string, unknown>),
    ...(e.uitlijning ? { alignment: e.uitlijning } : {}),
    ...(e.ruimteVoor !== undefined && e.ruimteVoor !== null ? { spaceBefore: e.ruimteVoor * 20 } : {}),
    ...(e.ruimteNa !== undefined && e.ruimteNa !== null ? { spaceAfter: e.ruimteNa * 20 } : {}),
    ...(vast
      ? { lineSpacing: vast.pt * 20, lineSpacingRule: vast.regel }
      : e.regelafstand !== undefined && e.regelafstand !== null
        ? { lineSpacing: e.regelafstand * 240, lineSpacingRule: "auto" }
        : {}),
    ...(e.inspringLinks !== undefined && e.inspringLinks !== null ? { indentLeft: e.inspringLinks * TWIP_PER_CM } : {}),
    ...(e.inspringRechts !== undefined && e.inspringRechts !== null ? { indentRight: e.inspringRechts * TWIP_PER_CM } : {}),
    ...(eerste !== undefined && eerste !== null
      ? { indentFirstLine: Math.abs(eerste) * TWIP_PER_CM, hangingIndent: eerste < 0 }
      : {}),
    ...(e.bijVolgende !== undefined ? { keepNext: e.bijVolgende } : {}),
    ...(e.regelsBijElkaar !== undefined ? { keepLines: e.regelsBijElkaar } : {}),
    ...(e.paginaEindeVoor !== undefined ? { pageBreakBefore: e.paginaEindeVoor } : {}),
    ...(e.zwevendeRegels !== undefined ? { widowControl: e.zwevendeRegels } : {}),
    ...(e.contextueel !== undefined ? { contextualSpacing: e.contextueel } : {}),
  });
}

/** De wijziging uit het alineavenster als stijleigenschappen (tabstops horen niet in deze editor). */
export function vanAlineaOpmaak(w: AlineaOpmaak): StijlEigenschappen {
  const e: StijlEigenschappen = {};
  if (w.alignment !== undefined)
    e.uitlijning = w.alignment === "center" || w.alignment === "right" || w.alignment === "both" ? w.alignment : w.alignment ? "left" : null;
  if (w.spaceBefore !== undefined) e.ruimteVoor = w.spaceBefore === null ? null : rond(w.spaceBefore / 20, 1);
  if (w.spaceAfter !== undefined) e.ruimteNa = w.spaceAfter === null ? null : rond(w.spaceAfter / 20, 1);
  if (w.lineSpacing !== undefined) {
    if (w.lineSpacing === null) e.regelafstand = null;
    else if (w.lineSpacingRule === "exact" || w.lineSpacingRule === "atLeast")
      e.regelafstandPt = { pt: rond(w.lineSpacing / 20, 1), regel: w.lineSpacingRule };
    else e.regelafstand = rond(w.lineSpacing / 240);
  }
  if (w.indentLeft !== undefined) e.inspringLinks = w.indentLeft === null ? 0 : rond(w.indentLeft / TWIP_PER_CM);
  if (w.indentRight !== undefined) e.inspringRechts = w.indentRight === null ? 0 : rond(w.indentRight / TWIP_PER_CM);
  if (w.indentFirstLine !== undefined)
    e.eersteRegel = w.indentFirstLine === null ? 0 : (w.hangingIndent ? -1 : 1) * rond(w.indentFirstLine / TWIP_PER_CM);
  if (w.keepNext !== undefined) e.bijVolgende = w.keepNext;
  if (w.keepLines !== undefined) e.regelsBijElkaar = w.keepLines;
  if (w.pageBreakBefore !== undefined) e.paginaEindeVoor = w.pageBreakBefore;
  if (w.widowControl !== undefined) e.zwevendeRegels = w.widowControl;
  if (w.contextualSpacing !== undefined) e.contextueel = w.contextualSpacing;
  return e;
}
