/**
 * Lettertypen per geopend document (#22): welke zijn vervangen (voor de
 * melding), en de lettertypebestanden die de presentatie-engine en het
 * rekenblad-canvas nodig hebben onder de oorspronkelijke naam.
 */
import * as fonts from "@betteroffice/fonts";
import type { PptxFontFace } from "@betteroffice/pptx";
import { laadSysteemLettertypen, opSysteem, systeemLettertypeBytes } from "./systeem";
import { lettertypenInDocument, vervangerVoor, type Vervanging } from "./vervanging";

const basis = () => new URL("/fonts/", location.href).href;
const gebundeldExact = (familie: string) =>
  fonts.BUNDLED_FONTS.some((f) => f.family.toLowerCase() === familie.toLowerCase());
const STIJLEN = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
] as const;

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
  await Promise.all(
    info.vervangingen.flatMap((v) =>
      STIJLEN.map(async ([vet, cursief]) => {
        const face = fonts.resolveBundledFamilyFace(v.vervanger, vet, cursief);
        if (face) await fonts.registerBundledFontFace(face, v.origineel, { baseUrl: basis() }).catch(() => {});
      }),
    ),
  );
}
