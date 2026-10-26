import type {
  PptxEditRequest,
  PptxEditResult,
  PresentationHandle,
  ShapeRect,
  ShapeSnapshot,
} from "@betteroffice/pptx";

/** Bewerkingen op de presentatie die de engine wel kent, maar niet als lintopdracht. */
export type DiaHandle = Pick<
  PresentationHandle,
  | "snapshot"
  | "version"
  | "addUndoBoundary"
  | "deleteSlide"
  | "moveSlide"
  | "removeShape"
  | "addTextBox"
>;
export type Toepassen = (
  verzoek: PptxEditRequest,
) => PptxEditResult | Promise<PptxEditResult>;

export type Verplaatsing = "begin" | "omhoog" | "omlaag" | "einde";
export type Uitlijning =
  | "links"
  | "centreren"
  | "rechts"
  | "boven"
  | "midden"
  | "onder";

/** Nieuwe positie van de dia op `index`, of null als hij al aan de rand staat. */
export function verplaatsDoel(
  index: number,
  aantal: number,
  richting: Verplaatsing,
): number | null {
  const doel =
    richting === "begin"
      ? 0
      : richting === "einde"
        ? aantal - 1
        : richting === "omhoog"
          ? index - 1
          : index + 1;
  if (index < 0 || index >= aantal || doel < 0 || doel >= aantal) return null;
  return doel === index ? null : doel;
}

/** De rechthoek waarin een vorm getekend wordt, ook als hij die van zijn indeling erft. */
export function kaderVan(vorm: ShapeSnapshot): ShapeRect | null {
  if (vorm.width > 0 && vorm.height > 0)
    return { x: vorm.x, y: vorm.y, width: vorm.width, height: vorm.height };
  const geerfd = vorm.inherited;
  return geerfd && geerfd.width > 0 && geerfd.height > 0
    ? {
        x: geerfd.x,
        y: geerfd.y,
        width: geerfd.width,
        height: geerfd.height,
      }
    : null;
}

/** Een vorm uitlijnen op de dia, zoals ‘Uitlijnen’ bij één geselecteerd object. */
export function uitgelijnd(
  kader: ShapeRect,
  breedte: number,
  hoogte: number,
  wijze: Uitlijning,
): ShapeRect {
  const midden = (ruimte: number, maat: number) =>
    Math.round((ruimte - maat) / 2);
  switch (wijze) {
    case "links":
      return { ...kader, x: 0 };
    case "centreren":
      return { ...kader, x: midden(breedte, kader.width) };
    case "rechts":
      return { ...kader, x: breedte - kader.width };
    case "boven":
      return { ...kader, y: 0 };
    case "midden":
      return { ...kader, y: midden(hoogte, kader.height) };
    case "onder":
      return { ...kader, y: hoogte - kader.height };
  }
}

/** De vorm op het hoogste niveau van de dia waarvan het kader het best past. */
export function vormBijKader(
  vormen: readonly ShapeSnapshot[],
  kader: ShapeRect,
  tolerantie: number,
): ShapeSnapshot | null {
  let beste: ShapeSnapshot | null = null,
    afstand = Infinity;
  for (const vorm of vormen) {
    const eigen = kaderVan(vorm);
    if (!eigen) continue;
    const verschil = Math.max(
      Math.abs(eigen.x - kader.x),
      Math.abs(eigen.y - kader.y),
      Math.abs(eigen.x + eigen.width - kader.x - kader.width),
      Math.abs(eigen.y + eigen.height - kader.y - kader.height),
    );
    if (verschil <= tolerantie && verschil < afstand) {
      beste = vorm;
      afstand = verschil;
    }
  }
  return beste;
}

const twee = (getal: number) => String(getal).padStart(2, "0");
/** Vaste datum- en tijdnotatie zoals de Nederlandse standaard: 26-10-2026 en 14:05. */
export function datumTekst(moment: Date, soort: "datum" | "tijd"): string {
  return soort === "datum"
    ? `${twee(moment.getDate())}-${twee(moment.getMonth() + 1)}-${moment.getFullYear()}`
    : `${twee(moment.getHours())}:${twee(moment.getMinutes())}`;
}

export const specialeTekens: readonly { teken: string; naam: string }[] = [
  { teken: "€", naam: "Euroteken" },
  { teken: "©", naam: "Copyright" },
  { teken: "®", naam: "Gedeponeerd" },
  { teken: "™", naam: "Handelsmerk" },
  { teken: "°", naam: "Graden" },
  { teken: "±", naam: "Plus-min" },
  { teken: "×", naam: "Maal" },
  { teken: "÷", naam: "Gedeeld door" },
  { teken: "≈", naam: "Ongeveer gelijk" },
  { teken: "≤", naam: "Kleiner dan of gelijk" },
  { teken: "≥", naam: "Groter dan of gelijk" },
  { teken: "²", naam: "Kwadraat" },
  { teken: "³", naam: "Derde macht" },
  { teken: "½", naam: "Half" },
  { teken: "µ", naam: "Micro" },
  { teken: "Ø", naam: "Diameter" },
  { teken: "–", naam: "Gedachtestreepje" },
  { teken: "—", naam: "Lang streepje" },
  { teken: "…", naam: "Weglatingsteken" },
  { teken: "•", naam: "Opsommingsteken" },
  { teken: "«", naam: "Aanhalingsteken links" },
  { teken: "»", naam: "Aanhalingsteken rechts" },
  { teken: "§", naam: "Paragraaf" },
  { teken: "→", naam: "Pijl naar rechts" },
  { teken: "←", naam: "Pijl naar links" },
  { teken: "✓", naam: "Vinkje" },
];

/** Voert directe bewerkingen uit als één eigen ongedaan-maakstap. */
export async function alsStap<T>(
  handle: DiaHandle,
  toepassen: Toepassen,
  bewerking: () => T,
): Promise<T> {
  handle.addUndoBoundary();
  const uitkomst = bewerking();
  handle.addUndoBoundary();
  return uitkomst;
}

export async function verwijderDia(
  handle: DiaHandle,
  toepassen: Toepassen,
  index: number,
) {
  const dias = handle.snapshot().slides;
  if (dias.length < 2)
    throw new Error("De enige dia kan niet worden verwijderd.");
  const dia = dias[index];
  if (!dia) return false;
  await alsStap(handle, toepassen, () => handle.deleteSlide(dia.id));
  return true;
}

/** Verplaatst de dia; geeft de nieuwe index terug, of null als er niets veranderde. */
export async function verplaatsDia(
  handle: DiaHandle,
  toepassen: Toepassen,
  index: number,
  richting: Verplaatsing,
) {
  const dias = handle.snapshot().slides;
  const doel = verplaatsDoel(index, dias.length, richting);
  if (doel === null) return null;
  await alsStap(handle, toepassen, () =>
    handle.moveSlide(dias[index].id, doel),
  );
  return doel;
}

export async function verwijderVorm(
  handle: DiaHandle,
  toepassen: Toepassen,
  slideId: string,
  shapeId: string,
) {
  await alsStap(handle, toepassen, () => handle.removeShape(slideId, shapeId));
}

/** Een tekstvak midden op de dia, voor datum of tijd zonder tekstcursor. */
export async function voegTekstvakToe(
  handle: DiaHandle,
  toepassen: Toepassen,
  index: number,
  tekst: string,
) {
  const deck = handle.snapshot(),
    dia = deck.slides[index];
  if (!dia) return null;
  const width = Math.round(deck.widthEmu / 4),
    height = Math.round(deck.heightEmu / 12);
  const rect = {
    x: Math.round((deck.widthEmu - width) / 2),
    y: Math.round((deck.heightEmu - height) / 2),
    width,
    height,
  };
  return alsStap(handle, toepassen, () =>
    handle.addTextBox(dia.id, { name: "Datum", rect, text: tekst, style: {} }),
  );
}

/** Lijnt een vorm uit via de editor-API: één ongedaan-maakstap en een wijzigingsmelding. */
export async function lijnVormUit(
  handle: DiaHandle,
  toepassen: Toepassen,
  slideId: string,
  vorm: ShapeSnapshot,
  wijze: Uitlijning,
) {
  const deck = handle.snapshot(),
    kader = kaderVan(vorm);
  if (!kader) return false;
  const rect = uitgelijnd(kader, deck.widthEmu, deck.heightEmu, wijze);
  if (rect.x === kader.x && rect.y === kader.y) return false;
  const resultaat = await toepassen({
    expectVersion: handle.version(),
    steps: [
      { op: "setShapeRect", target: { slideId, shapeId: vorm.id }, rect },
    ],
  });
  if (!resultaat.ok) throw new Error(resultaat.failure.message);
  return resultaat.applied;
}
