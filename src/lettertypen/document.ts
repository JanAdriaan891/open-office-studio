/**
 * Lettertypen per geopend document (#22): welke zijn vervangen (voor de
 * melding), en de lettertypebestanden die de presentatie-engine en het
 * rekenblad-canvas nodig hebben onder de oorspronkelijke naam.
 */
import * as fonts from "@betteroffice/fonts";
import type { PptxFontFace } from "@betteroffice/pptx";
import { laadSysteemLettertypen, opSysteem, systeemLettertypeBytes } from "./systeem";
import { lettertypenInDocument, vervangerVoor, type Vervanging } from "./vervanging";
import { ALLE_STIJLEN as STIJLEN, extraFace, isExtraFamilie, laadExtraBytes, lettertypeBasis, registreerCss } from "./catalogus";

const basis = lettertypeBasis;
/** Komt mee met de app onder precies deze naam (meegeleverd of extra). */
export const gebundeldExact = (familie: string) =>
  fonts.BUNDLED_FONTS.some((f) => f.family.toLowerCase() === familie.toLowerCase()) ||
  isExtraFamilie(familie);

export interface DocumentLettertypen {
  namen: string[];
  vervangingen: Vervanging[];
}

/** Lettertypen van het document en de vervangingen voor wat hier ontbreekt. */
export async function documentLettertypen(bytes: Uint8Array): Promise<DocumentLettertypen> {
  const namen = lettertypenInDocument(bytes);
  await laadSysteemLettertypen();
  const vervangingen = namen
    .map((naam) =>
      vervangerVoor(
        naam,
        (f) => opSysteem(f) || gebundeldExact(f),
        (f) => fonts.resolveMetricCompatFamily(f),
      ),
    )
    .filter((v): v is Vervanging => !!v);
  return { namen, vervangingen };
}

async function bundelBytes(familie: string, vet: boolean, cursief: boolean) {
  const extra = extraFace(familie, vet, cursief) ?? extraFace(familie, vet, false) ?? extraFace(familie, false, false);
  if (extra) return new Uint8Array(await laadExtraBytes(extra));
  const face =
    fonts.resolveBundledFamilyFace(familie, vet, cursief) ??
    fonts.resolveBundledFamilyFace(familie, false, false);
  return face ? new Uint8Array(await fonts.loadBundledFontBytes(face, { baseUrl: basis() })) : null;
}

/**
 * Lettertypebestanden voor de presentatie-engine: van deze computer als het
 * lettertype er staat, anders de vervanger onder de oorspronkelijke naam.
 * Calibri (→ Carlito) staat er altijd bij, zoals PowerPoint terugvalt.
 */
export async function presentatieLettertypen(info: DocumentLettertypen): Promise<PptxFontFace[]> {
  const uit: PptxFontFace[] = [];
  const families = new Map<string, string | null>([["calibri", null]]);
  for (const naam of info.namen) families.set(naam.toLowerCase(), null);
  const vervanger = new Map(info.vervangingen.map((v) => [v.origineel.toLowerCase(), v.vervanger]));
  const naamVan = new Map(info.namen.map((n) => [n.toLowerCase(), n]));
  naamVan.set("calibri", naamVan.get("calibri") ?? "Calibri");
  await Promise.all(
    [...families.keys()].slice(0, 24).map(async (sleutel) => {
      const naam = naamVan.get(sleutel)!;
      const systeem = opSysteem(naam) && !gebundeldExact(naam);
      const bron = vervanger.get(sleutel) ?? (gebundeldExact(naam) ? naam : sleutel === "calibri" ? "Carlito" : null);
      for (const [vet, cursief] of STIJLEN) {
        let data: Uint8Array | null = null;
        if (systeem) {
          const b = await systeemLettertypeBytes(naam, vet, cursief);
          data = b ? new Uint8Array(b) : null;
        }
        if (!data && bron) data = await bundelBytes(bron, vet, cursief).catch(() => null);
        if (data) uit.push({ family: naam, bold: vet, italic: cursief, bytes: data });
      }
    }),
  );
  return uit;
}

/**
 * Registreert de vervangers als CSS-lettertype onder de oorspronkelijke naam,
 * zodat canvas-tekst (rekenblad) met de juiste tekenbreedtes wordt getekend.
 */
export async function registreerVervangers(info: DocumentLettertypen) {
  const vervangen = new Set(info.vervangingen.map((v) => v.origineel.toLowerCase()));
  await Promise.all([
    ...info.vervangingen.map((v) => registreerCss(v.vervanger, v.origineel)),
    // Extra lettertypen die het document bij naam noemt.
    ...info.namen
      .filter((n) => !vervangen.has(n.toLowerCase()) && isExtraFamilie(n) && !opSysteem(n))
      .map((n) => registreerCss(n)),
  ]);
}

/**
 * Een lettertype dat de gebruiker kiest bruikbaar maken voor de engine die
 * het niet zelf ophaalt: het rekenblad tekent met CSS-lettertypen, de
 * presentatie-engine krijgt de bestanden via `registerFont`.
 */
export async function presentatieFaces(familie: string): Promise<PptxFontFace[]> {
  const uit: PptxFontFace[] = [];
  const systeem = opSysteem(familie) && !gebundeldExact(familie);
  await Promise.all(
    STIJLEN.map(async ([vet, cursief]) => {
      let data: Uint8Array | null = null;
      if (systeem) {
        const b = await systeemLettertypeBytes(familie, vet, cursief);
        data = b ? new Uint8Array(b) : null;
      } else if (isExtraFamilie(familie) || fonts.resolveBundledFamilyFace(familie, false, false))
        data = await bundelBytes(familie, vet, cursief).catch(() => null);
      if (data) uit.push({ family: familie, bold: vet, italic: cursief, bytes: data });
    }),
  );
  return uit;
}
