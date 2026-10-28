import { describe, expect, it } from "vitest";
import { MAX_RECENT, sorteer, voegToe } from "./recent";
import { datumTekst } from "./RecenteBestanden";

describe("recente bestanden (browser: alleen namen)", () => {
  it("nieuwste bovenaan, zonder dubbelen", () => {
    let l = voegToe([], "a.docx", 1);
    l = voegToe(l, "b.xlsx", 2);
    l = voegToe(l, "A.DOCX", 3);
    expect(l.map((i) => i.naam)).toEqual(["A.DOCX", "b.xlsx"]);
  });

  it("hooguit 20; vastgezette blijven bovenaan staan", () => {
    let l: ReturnType<typeof voegToe> = voegToe([], "vast.docx", 0).map(
      (i) => ({ ...i, vast: true }),
    );
    for (let n = 1; n <= 30; n++) l = voegToe(l, `${n}.docx`, n);
    expect(l).toHaveLength(MAX_RECENT);
    expect(l[0]).toMatchObject({ naam: "vast.docx", vast: true });
    expect(l[1].naam).toBe("30.docx");
    l = voegToe(l, "vast.docx", 99);
    expect(l[0].vast).toBe(true);
  });

  it("sorteert vastgezet vóór recent", () => {
    expect(
      sorteer([
        { naam: "a", datum: 5 },
        { naam: "b", datum: 1, vast: true },
      ]).map((i) => i.naam),
    ).toEqual(["b", "a"]);
  });

  it("toont vandaag en gisteren in woorden", () => {
    const nu = new Date(2026, 9, 28, 15, 0).getTime();
    expect(datumTekst(new Date(2026, 9, 28, 9, 5).getTime(), nu)).toMatch(
      /^Vandaag 09[:.]05$/,
    );
    expect(datumTekst(new Date(2026, 9, 27, 23, 0).getTime(), nu)).toMatch(
      /^Gisteren/,
    );
    expect(datumTekst(new Date(2026, 8, 1, 10, 0).getTime(), nu)).toMatch(
      /sep/,
    );
  });
});
