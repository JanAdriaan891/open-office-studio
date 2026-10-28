import { describe, expect, it } from "vitest";
import { arceringNaarModel, arceringUit, metInstelling, metZijde, randenNaarModel, randFormulierUit } from "./model";
import { leesPagina, zetAchtergrondWeergave, zetPaginakleur, zetPaginarand } from "./pagina";
import { randenWijziging, type RandenBegin } from "./RandenVenster";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const document = (sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>') =>
  `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:pPr>${'<w:sectPr><w:pgSz w:w="11906"/></w:sectPr>'}</w:pPr></w:p><w:p/>${sect}</w:body></w:document>`;

describe("alinearanden", () => {
  it("maakt een kader en herkent het weer", () => {
    const f = metInstelling(randFormulierUit(null), "kader");
    const model = randenNaarModel({ ...f, dikte: 1.5, kleur: "C00000", afstand: 4 });
    expect(model).toEqual({
      top: { style: "single", size: 12, space: 4, color: { rgb: "C00000" } },
      bottom: { style: "single", size: 12, space: 4, color: { rgb: "C00000" } },
      left: { style: "single", size: 12, space: 4, color: { rgb: "C00000" } },
      right: { style: "single", size: 12, space: 4, color: { rgb: "C00000" } },
    });
    expect(randFormulierUit(model as never)).toMatchObject({ instelling: "kader", dikte: 1.5, kleur: "C00000", afstand: 4 });
  });

  it("wisselt zijden en valt terug op geen", () => {
    let f = randFormulierUit(null);
    f = metZijde(f, "bottom");
    expect(f.instelling).toBe("aangepast");
    expect(Object.keys(randenNaarModel(f)!)).toEqual(["bottom"]);
    f = metZijde(f, "bottom");
    expect(f.instelling).toBe("geen");
    expect(randenNaarModel(f)).toBeNull();
  });

  it("zet arcering om", () => {
    expect(arceringNaarModel({ opvulling: "FFF2CC", patroon: "clear", patroonKleur: null })).toEqual({ pattern: "clear", fill: { rgb: "FFF2CC" } });
    expect(arceringNaarModel({ opvulling: null, patroon: "clear", patroonKleur: null })).toBeNull();
    expect(arceringUit({ fill: { rgb: "fff2cc" }, pattern: "pct10", color: { rgb: "000000" } })).toEqual({
      opvulling: "FFF2CC",
      patroon: "pct10",
      patroonKleur: "000000",
    });
  });

  it("splitst wijzigingen in alinea (engine) en pagina (pakket)", () => {
    const begin: RandenBegin = {
      alinea: randFormulierUit(null),
      arcering: arceringUit(null),
      pagina: randFormulierUit(null, 24),
      paginaWeergave: "allPages",
      paginakleur: null,
    };
    expect(randenWijziging(begin, begin)).toEqual({ alinea: {}, pagina: undefined });
    const w = randenWijziging(begin, { ...begin, alinea: metInstelling(begin.alinea, "kader"), paginakleur: "EAF1DD" });
    expect(Object.keys(w.alinea)).toEqual(["borders"]);
    expect(w.pagina).toEqual({ kleur: "EAF1DD" });
  });
});

describe("paginarand en paginakleur (pakketroute)", () => {
  const rand = {
    top: { style: "double", size: 12, space: 24, color: { rgb: "1F4E79" } },
    left: { style: "double", size: 12, space: 24, color: { rgb: "1F4E79" } },
    bottom: { style: "double", size: 12, space: 24, color: { rgb: "1F4E79" } },
    right: { style: "double", size: 12, space: 24, color: { rgb: "1F4E79" } },
    display: "firstPage" as const,
  };

  it("zet pgBorders in elke sectie op de juiste plaats", () => {
    const uit = zetPaginarand(document(), rand);
    expect(uit.match(/<w:pgBorders/g)).toHaveLength(2);
    expect(uit).toContain('<w:pgMar w:top="1440"/><w:pgBorders w:offsetFrom="page" w:display="firstPage"><w:top w:val="double"');
    expect(uit).toContain('<w:pgSz w:w="11906"/><w:pgBorders');
    expect(leesPagina(uit).rand).toMatchObject({ display: "firstPage", top: { style: "double", size: 12, color: { rgb: "1F4E79" } } });
    // Opnieuw zetten vervangt, wissen haalt weg.
    expect(zetPaginarand(uit, rand).match(/<w:pgBorders/g)).toHaveLength(2);
    expect(zetPaginarand(uit, null)).toBe(document());
  });

  it("werkt ook met een lege sectPr", () => {
    const uit = zetPaginarand(document("<w:sectPr/>"), rand);
    expect(uit).toMatch(/<w:sectPr><w:pgBorders[^]*<\/w:pgBorders><\/w:sectPr><\/w:body>/);
  });

  it("zet en wist de paginakleur", () => {
    const uit = zetPaginakleur(document(), "EAF1DD");
    expect(uit).toContain('<w:background w:color="EAF1DD"/><w:body>');
    expect(leesPagina(uit).kleur).toBe("EAF1DD");
    expect(zetPaginakleur(zetPaginakleur(uit, "FF0000"), null)).toBe(document());
  });

  it("schakelt de achtergrondweergave in de instellingen", () => {
    const instellingen = `<w:settings ${W}><w:zoom w:percent="100"/><w:defaultTabStop w:val="708"/></w:settings>`;
    const aan = zetAchtergrondWeergave(instellingen, true);
    expect(aan).toContain('<w:zoom w:percent="100"/><w:displayBackgroundShape/><w:defaultTabStop');
    expect(zetAchtergrondWeergave(aan, true)).toBe(aan);
    expect(zetAchtergrondWeergave(aan, false)).toBe(instellingen);
  });
});
