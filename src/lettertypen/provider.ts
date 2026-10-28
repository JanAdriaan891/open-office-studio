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
import { extraFace, isExtraFamilie, laadExtraBytes, lettertypeBasis } from "./catalogus";

type Lader = () => Promise<ArrayBuffer>;

/**
 * Een extra lettertype (public/fonts/extra). `exact`: alleen de gevraagde
 * stijl; anders valt een ontbrekende stijl terug op vet of regulier.
 */
function vanExtra(familie: string, vet: boolean, cursief: boolean, exact: boolean, basis: string): Lader | undefined {
  const face =
    extraFace(familie, vet, cursief) ??
    (exact ? undefined : (extraFace(familie, vet, false) ?? extraFace(familie, false, false)));
  return face ? () => laadExtraBytes(face, basis) : undefined;
}

export function maakLettertypeBron(opties?: FontAssetOptions): BundledFontSource {
  const bundel = fonts.createFontProvider(opties);
  const basis = opties?.baseUrl ? new URL(opties.baseUrl, lettertypeBasis()).href : lettertypeBasis();
  /** Metrisch gelijke vervanger uit de eigen tabel die als extra lettertype meekomt (Segoe UI → Selawik). */
  const extraVervanger = (familie: string, vet: boolean, cursief: boolean, alleenMetrisch: boolean) => {
    const regel = VERVANGINGEN[familie.toLowerCase()];
    if (!regel || (alleenMetrisch && regel.soort !== "metrisch")) return undefined;
    return vanExtra(regel.vervanger, vet, cursief, false, basis);
  };
  const vanSysteem = (familie: string, vet: boolean, cursief: boolean) => {
    if (bundel.resolveFamily(familie, vet, cursief) || isExtraFamilie(familie) || !opSysteem(familie)) return undefined;
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
      vanExtra(familie, vet, cursief, false, basis) ??
      vanSysteem(familie, vet, cursief) ??
      bundel.resolve(familie, vet, cursief) ??
      extraVervanger(familie, vet, cursief, true),
    resolveFamily: (familie, vet, cursief) =>
      bundel.resolveFamily(familie, vet, cursief) ??
      vanExtra(familie, vet, cursief, true, basis) ??
      vanSysteem(familie, vet, cursief),
    resolveScriptFallback: (script, vet, cursief) =>
      bundel.resolveScriptFallback(script, vet, cursief),
    resolveLastResort: (familie, vet, cursief, office) => {
      const regel = VERVANGINGEN[familie.toLowerCase()];
      const eigen =
        regel &&
        (bundel.resolveFamily(regel.vervanger, vet, cursief) ?? extraVervanger(familie, vet, cursief, false));
      return eigen ?? bundel.resolveLastResort(familie, vet, cursief, office);
    },
  };
}

/** Het module-object dat `configureDefaultFonts` verwacht. */
export const lettertypeModule = {
  createFontProvider: (opties?: { baseUrl?: string | URL }) => maakLettertypeBron(opties),
};
