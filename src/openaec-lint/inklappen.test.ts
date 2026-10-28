import { describe, expect, it } from "vitest";
import {
  inklapvolgorde,
  kiesNiveaus,
  scrollKnoppen,
  wielNaarHorizontaal,
  type GroepMaten,
} from "./inklappen";

const groep = (a: number, b: number, c: number, prioriteit?: number) =>
  ({ breedte: [a, b, c], prioriteit }) as GroepMaten;

describe("inklappen", () => {
  const groepen = [groep(200, 150, 60), groep(300, 200, 60), groep(100, 100, 60)];

  it("laat alles volledig als het past", () => {
    expect(kiesNiveaus(groepen, 600)).toEqual({
      niveaus: [0, 0, 0],
      breedte: 600,
      overloop: false,
    });
  });

  it("maakt eerst rechts compact, daarna pas groepen tot één knop", () => {
    // Compact rechts levert bij de laatste groep niets op en wordt overgeslagen.
    expect(kiesNiveaus(groepen, 520).niveaus).toEqual([0, 1, 0]);
    expect(kiesNiveaus(groepen, 450).niveaus).toEqual([1, 1, 0]);
    expect(kiesNiveaus(groepen, 410).niveaus).toEqual([1, 1, 2]);
    expect(kiesNiveaus(groepen, 300).niveaus).toEqual([1, 2, 2]);
  });

  it("meldt overloop als zelfs alles ingeklapt niet past", () => {
    const uitkomst = kiesNiveaus(groepen, 100);
    expect(uitkomst.niveaus).toEqual([2, 2, 2]);
    expect(uitkomst.overloop).toBe(true);
  });

  it("houdt groepen met prioriteit langer volledig", () => {
    expect(inklapvolgorde([groep(1, 1, 1, 5), groep(1, 1, 1), groep(1, 1, 1)])).toEqual([2, 1, 0]);
    const metPrioriteit = [groep(200, 150, 60), groep(300, 200, 60, 1), groep(100, 100, 60)];
    // Eerst wordt alles compact; daarna klapt de groep met prioriteit als laatste in.
    expect(kiesNiveaus(metPrioriteit, 450).niveaus).toEqual([1, 1, 0]);
    expect(kiesNiveaus(metPrioriteit, 400).niveaus).toEqual([2, 1, 2]);
  });

  it("dwingt een minimumniveau af en telt vaste ruimte mee", () => {
    expect(kiesNiveaus(groepen, 2000, { minimum: 1 }).niveaus).toEqual([1, 1, 1]);
    expect(kiesNiveaus(groepen, 600, { vast: 50 }).niveaus).toEqual([0, 1, 0]);
  });

  it("toont scrollknoppen alleen bij echte overloop", () => {
    expect(scrollKnoppen(0, 500, 500.5)).toEqual({ links: false, rechts: false });
    expect(scrollKnoppen(0, 500, 800)).toEqual({ links: false, rechts: true });
    expect(scrollKnoppen(300, 500, 800)).toEqual({ links: true, rechts: false });
  });

  it("zet het muiswiel om naar horizontaal scrollen", () => {
    expect(wielNaarHorizontaal({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe(96);
    expect(wielNaarHorizontaal({ deltaX: 40, deltaY: 5, deltaMode: 0 })).toBe(40);
    expect(wielNaarHorizontaal({ deltaX: 0, deltaY: -1, deltaMode: 2 })).toBe(-400);
  });
});
