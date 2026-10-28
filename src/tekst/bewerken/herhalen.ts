/**
 * Herhalen (F4, en Ctrl+Y als er niets opnieuw te doen is): de laatste
 * opmaakopdracht nog eens uitvoeren op de huidige selectie.
 */

/** Engine-opdrachten die als opmaak tellen en dus herhaald kunnen worden. */
export const HERHAALBAAR = new Set([
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "superscript",
  "subscript",
  "clearFormatting",
  "paragraphStyle",
  "fontFamily",
  "fontSize",
  "textColor",
  "highlightColor",
  "alignment",
  "lineSpacing",
  "bulletList",
  "numberedList",
  "indent",
  "outdent",
]);

export interface HerhaalActie {
  /** Voor de knopuitleg, bijvoorbeeld "Vet" of "Lettergrootte 14". */
  naam: string;
  uitvoeren: () => void;
}

/** Onthoudt de laatste herhaalbare actie. */
export class Herhaalgeheugen {
  private laatste: HerhaalActie | null = null;
  private luisteraars = new Set<() => void>();

  onthoud(actie: HerhaalActie) {
    this.laatste = actie;
    this.luisteraars.forEach((l) => l());
  }

  /** Voert de laatste actie uit; onwaar als er nog niets te herhalen is. */
  herhaal(): boolean {
    if (!this.laatste) return false;
    this.laatste.uitvoeren();
    return true;
  }

  get naam() {
    return this.laatste?.naam ?? null;
  }

  volg(luisteraar: () => void) {
    this.luisteraars.add(luisteraar);
    return () => {
      this.luisteraars.delete(luisteraar);
    };
  }
}

const namen: Record<string, string> = {
  bold: "Vet",
  italic: "Cursief",
  underline: "Onderstrepen",
  strikethrough: "Doorhalen",
  superscript: "Superscript",
  subscript: "Subscript",
  clearFormatting: "Opmaak wissen",
  paragraphStyle: "Stijl",
  fontFamily: "Lettertype",
  fontSize: "Lettergrootte",
  textColor: "Tekstkleur",
  highlightColor: "Markeren",
  alignment: "Uitlijning",
  lineSpacing: "Regelafstand",
  bulletList: "Opsomming",
  numberedList: "Nummering",
  indent: "Meer inspringen",
  outdent: "Minder inspringen",
};

/** Leesbare naam van een engine-opdracht met zijn argument. */
export function naamVanOpdracht(id: string, args: unknown): string {
  const naam = namen[id] ?? id;
  if (args && typeof args === "object") {
    const waarde = Object.values(args as Record<string, unknown>)[0];
    if (typeof waarde === "string" || typeof waarde === "number") return `${naam} ${waarde}`;
  }
  return naam;
}
