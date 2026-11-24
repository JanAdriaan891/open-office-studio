type ConceptToets = Pick<
  KeyboardEvent,
  | "key"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
  | "shiftKey"
  | "repeat"
  | "defaultPrevented"
  | "preventDefault"
> & {
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
};

/** De opstelling bezit haar eigen Opslaan-toets; de host slaat modals over. */
export function conceptOpslaanToets(
  event: ConceptToets,
  bezig: boolean,
  bewaarConcept: () => unknown,
): boolean {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.nativeEvent?.isComposing ||
    event.keyCode === 229 ||
    event.nativeEvent?.keyCode === 229 ||
    event.ctrlKey === event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== "s"
  )
    return false;

  // Ook tijdens bewaren/verzenden of toetsherhaling nooit de browserpagina opslaan.
  event.preventDefault();
  if (!event.repeat && !bezig) void bewaarConcept();
  return true;
}

type Doel = { closest(selector: string): unknown } | null;

/**
 * Buiten het venster zelf (focus op body of de achtergrond, bijvoorbeeld nadat
 * het berichtveld tijdens bewaren even niet bewerkbaar was) bereikt een toets
 * de eigen onKeyDown van de opstelling niet. Alleen dan neemt de
 * documentluisteraar het over; een ander venster of menu houdt zijn toetsen.
 */
export function toetsBuitenOpstelling(doel: Doel, venster: unknown): boolean {
  if (!venster) return false;
  if (!doel) return true;
  if (doel.closest("[role='dialog'], [role='alertdialog'], dialog, [role='menu']"))
    return false;
  return true;
}
