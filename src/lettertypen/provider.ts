/**
 * Lettertypebron voor de engines (#22): eerst een meegeleverd lettertype met
 * exact deze naam, dan het lettertype van deze computer, dan een metrisch
 * gelijkwaardige vervanger (Calibri → Carlito, Arial → Liberation Sans, …) en
 * pas daarna het laatste redmiddel van de engine.
 */
import * as fonts from "@betteroffice/fonts";
import type { BundledFontSource, FontAssetOptions } from "@betteroffice/fonts";
import { opSysteem, systeemLettertypeBytes } from "./systeem";
import { VERVANGINGEN } from "./vervanging";

export function maakLettertypeBron(opties?: FontAssetOptions): BundledFontSource {
  const bundel = fonts.createFontProvider(opties);
  const vanSysteem = (familie: string, vet: boolean, cursief: boolean) => {
    if (bundel.resolveFamily(familie, vet, cursief) || !opSysteem(familie)) return undefined;
    return async () => {
      const bytes = await systeemLettertypeBytes(familie, vet, cursief);
      if (bytes) return bytes;
      const terugval =
        bundel.resolve(familie, vet, cursief) ?? bundel.resolveLastResort(familie, vet, cursief);
      return terugval();
    };
  };
  return {
    resolve: (familie, vet, cursief) =>
      bundel.resolveFamily(familie, vet, cursief) ??
      vanSysteem(familie, vet, cursief) ??
      bundel.resolve(familie, vet, cursief),
    resolveFamily: (familie, vet, cursief) =>
      bundel.resolveFamily(familie, vet, cursief) ?? vanSysteem(familie, vet, cursief),
    resolveScriptFallback: (script, vet, cursief) =>
      bundel.resolveScriptFallback(script, vet, cursief),
    resolveLastResort: (familie, vet, cursief, office) => {
      const regel = VERVANGINGEN[familie.toLowerCase()];
      const eigen = regel && bundel.resolveFamily(regel.vervanger, vet, cursief);
      return eigen ?? bundel.resolveLastResort(familie, vet, cursief, office);
    },
  };
}

/** Het module-object dat `configureDefaultFonts` verwacht. */
export const lettertypeModule = {
  createFontProvider: (opties?: { baseUrl?: string | URL }) => maakLettertypeBron(opties),
};
