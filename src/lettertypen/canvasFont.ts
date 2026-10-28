/**
 * Familienamen met een los getal ("Source Serif 4", "Source Sans 3") zijn in
 * de CSS-fontopgave alleen geldig tussen aanhalingstekens. De tekst- en
 * rekenbladengine zetten `ctx.font` zonder aanhalingstekens; de browser
 * negeert zo'n opgave dan stil en tekent in het vorige lettertype (vaak
 * 10px sans-serif), met de tekens op de breedtes van het juiste lettertype.
 *
 * Deze aanvulling op de `font`-setter van canvas probeert een geweigerde
 * opgave opnieuw met aangehaalde familienamen. Geldige opgaven gaan
 * ongewijzigd door; alleen een geweigerde opgave kost één extra poging.
 */

const GENERIEK = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|emoji|math|fangsong|ui-[a-z-]+|inherit|initial|unset)$/i;
const OPGAVE = /^(.*?(?:\d*\.)?\d+(?:px|pt|pc|em|rem|ex|ch|%|vw|vh|in|cm|mm|q)(?:\s*\/\s*\S+)?\s+)(.+)$/i;

/** De opgave met elke niet-generieke familie tussen aanhalingstekens, of null als er niets te doen is. */
export function citeerFamilies(font: string): string | null {
  const m = OPGAVE.exec(font.trim());
  if (!m) return null;
  const families = m[2].split(",").map((f) => f.trim()).filter(Boolean);
  const geciteerd = families.map((f) =>
    /^["']/.test(f) || GENERIEK.test(f) ? f : `"${f.replace(/["\\]/g, "\\$&")}"`,
  );
  const uit = `${m[1]}${geciteerd.join(", ")}`;
  return uit === font ? null : uit;
}

let geinstalleerd = false;

export function installeerFontCitering() {
  if (geinstalleerd || typeof window === "undefined") return;
  geinstalleerd = true;
  const prototypes = [
    globalThis.CanvasRenderingContext2D?.prototype,
    (globalThis as { OffscreenCanvasRenderingContext2D?: { prototype: object } }).OffscreenCanvasRenderingContext2D?.prototype,
  ].filter(Boolean) as object[];
  for (const proto of prototypes) {
    const d = Object.getOwnPropertyDescriptor(proto, "font");
    if (!d?.get || !d.set) continue;
    const { get, set } = d;
    Object.defineProperty(proto, "font", {
      ...d,
      set(this: CanvasRenderingContext2D, waarde: string) {
        const voor = get.call(this);
        set.call(this, waarde);
        if (typeof waarde !== "string" || get.call(this) !== voor) return;
        const geciteerd = citeerFamilies(waarde);
        if (geciteerd) set.call(this, geciteerd);
      },
    });
  }
}
