import { describe, expect, it } from "vitest";
import {
  context,
  jokertekensNaarRegex,
  maakPatroon,
  opmaakStukken,
  pastBijOpmaak,
  tekstNaarRegex,
  toonbaar,
  vervangTekst,
  vindAlle,
  ZoekFout,
} from "./logica";
import { leesNummer } from "./ganaar";

const treffers = (tekst: string, zoek: string, opties = {}) => vindAlle(tekst, maakPatroon(zoek, opties)).map((t) => t.tekst);

describe("zoekopties", () => {
  const tekst = "De kat en de Kater.\nEen KAT\tlag op de mat.\n";
  it("is standaard niet hoofdlettergevoelig", () => {
    expect(treffers(tekst, "kat")).toEqual(["kat", "Kat", "KAT"]);
    expect(treffers(tekst, "kat", { hoofdlettergevoelig: true })).toEqual(["kat"]);
  });
  it("vindt alleen hele woorden", () => {
    expect(treffers(tekst, "kat", { heleWoorden: true })).toEqual(["kat", "KAT"]);
  });
  it("kent speciale tekens ^p, ^t, ^# en ^?", () => {
    expect(treffers(tekst, ".^pEen")).toEqual([".\nEen"]);
    expect(treffers(tekst, "KAT^tlag")).toEqual(["KAT\tlag"]);
    expect(treffers("a1b22", "^#")).toEqual(["1", "2", "2"]);
    expect(treffers("ab", "a^?")).toEqual(["ab"]);
    expect(tekstNaarRegex("1+1^^")).toBe("1\\+1\\^");
  });
  it("zet Word-jokertekens om", () => {
    expect(treffers(tekst, "<[A-Z]@>", { jokertekens: true })).toEqual(["KAT"]);
    expect(treffers(tekst, "<[A-Z][a-z]@>", { jokertekens: true })).toEqual(["De", "Kater", "Een"]);
    expect(treffers(tekst, "m?t", { jokertekens: true })).toEqual(["mat"]);
    expect(treffers(tekst, "K*r", { jokertekens: true })).toEqual(["Kater"]);
    expect(treffers("aaa ab", "a{2,3}", { jokertekens: true })).toEqual(["aaa"]);
    expect(treffers("x1 y2", "[!xy][0-9]", { jokertekens: true })).toEqual([]);
    expect(jokertekensNaarRegex("\\*")).toBe("\\*");
    // Jokertekens zijn altijd hoofdlettergevoelig, zoals in Word.
    expect(treffers(tekst, "kat", { jokertekens: true })).toEqual(["kat"]);
  });
  it("ondersteunt reguliere expressies met ^ en $ per alinea", () => {
    expect(treffers(tekst, "^\\w+", { regex: true })).toEqual(["De", "Een"]);
    expect(treffers(tekst, "\\bma.\\.$", { regex: true })).toEqual(["mat."]);
  });
  it("meldt ongeldige of lege zoekopdrachten begrijpelijk", () => {
    expect(() => maakPatroon("(", { regex: true })).toThrow(ZoekFout);
    expect(() => maakPatroon("a*", { regex: true })).toThrow(/lege tekst/);
    expect(() => maakPatroon("[abc", { jokertekens: true })).toThrow(/\[/);
    expect(() => maakPatroon("")).toThrow(ZoekFout);
  });
});

describe("vervangtekst", () => {
  it("zet ^p, ^t en ^& om", () => {
    const m = /kat/.exec("de kat")!;
    expect(vervangTekst("[^&]^t^p", m)).toBe("[kat]\t\n");
  });
  it("gebruikt groepen bij jokertekens (\\1) en regex ($1)", () => {
    const m = /(De) (kat)/.exec("De kat")!;
    expect(vervangTekst("\\2 \\1", m, { jokertekens: true })).toBe("kat De");
    expect(vervangTekst("$2-$1 $$", m, { regex: true })).toBe("kat-De $");
    expect(vervangTekst("$2", m)).toBe("$2");
  });
});

describe("resultaten en opmaak", () => {
  it("toont context met zichtbare speciale tekens", () => {
    const tekst = "Eerste alinea.\nDe kat\tzit hier.\n";
    const c = context(tekst, 18, 21);
    expect(c.treffer).toBe("kat");
    expect(c.voor).toBe("De ");
    expect(c.na).toBe("→zit hier.");
    expect(toonbaar("a\nb\fc")).toBe("a¶b⤓c");
  });
  it("filtert op vet, cursief en stijl", () => {
    const vet = { vet: true, cursief: false, onderstreept: false };
    const gewoon = { vet: false, cursief: false, onderstreept: false };
    expect(pastBijOpmaak({ vet: true }, [vet, vet], ["Heading1"])).toBe(true);
    expect(pastBijOpmaak({ vet: true }, [vet, gewoon], [])).toBe(false);
    expect(pastBijOpmaak({ stijl: "Heading1" }, [gewoon], ["Heading1"])).toBe(true);
    expect(pastBijOpmaak({ stijl: "Heading1" }, [gewoon], [undefined])).toBe(false);
    const stukken = opmaakStukken("ab cd\nef", [vet, vet, gewoon, vet, vet, null, vet, gewoon], () => undefined, { vet: true });
    expect(stukken).toEqual([
      { start: 0, eind: 2 },
      { start: 3, eind: 5 },
      { start: 6, eind: 7 },
    ]);
  });
});

describe("Ga naar", () => {
  it("leest absolute en relatieve nummers", () => {
    expect(leesNummer("3", 1, 10)).toBe(3);
    expect(leesNummer("+2", 4, 10)).toBe(6);
    expect(leesNummer("-1", 4, 10)).toBe(3);
    expect(leesNummer("11", 1, 10)).toBeNull();
    expect(leesNummer("0", 1, 10)).toBeNull();
    expect(leesNummer("twee", 1, 10)).toBeNull();
  });
});
