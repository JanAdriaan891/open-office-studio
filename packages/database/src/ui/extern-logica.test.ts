import { describe, expect, it } from "vitest";
import type { Afhankelijkheid, ProcedureAnalyse, Uitvoering } from "../../../vba/src/extern-typen.ts";
import {
  belangrijksteOorzaken,
  filterProcedures,
  gekoppeldeTabellenUit,
  groepeerAfhankelijkheden,
  ketenTekst,
  losUitvoerbaar,
  oorzaakNaam,
  resultaatAlsCsv,
  resultaatAlsJson,
  telResultaat,
  uitvoeringFoutTekst,
  verdeelKandidaten,
  verkortPad,
  type ResultaatExport,
} from "./extern-logica.ts";

function proc(d: Partial<ProcedureAnalyse> & { module: string; naam: string }): ProcedureAnalyse {
  return {
    sleutel: `${d.module}.${d.naam}`,
    moduleSoort: "module",
    soort: "sub",
    publiek: true,
    zonderVerplichteParameters: true,
    gebeurtenis: false,
    regel: 1,
    status: "uitvoerbaar",
    redenen: [],
    roeptAan: [],
    aangeroepenDoor: [],
    foutafhandeling: false,
    ...d,
  };
}

function afh(d: Partial<Afhankelijkheid> & Pick<Afhankelijkheid, "soort" | "naam">): Afhankelijkheid {
  return { status: "ontbreekt", module: "Module1", procedure: "P", regel: 1, omzeilbaar: false, ...d };
}

describe("verkortPad", () => {
  it("toont alleen de bestandsnaam, ook bij Windows-paden met een gebruikersnaam", () => {
    expect(verkortPad("C:\\Users\\jansen\\AppData\\Local\\Excel.olb")).toEqual({
      kort: "Excel.olb",
      volledig: "C:\\Users\\jansen\\AppData\\Local\\Excel.olb",
    });
    expect(verkortPad("/home/piet/lib/stdole2.tlb")?.kort).toBe("stdole2.tlb");
    expect(verkortPad("stdole2.tlb")?.kort).toBe("stdole2.tlb");
    expect(verkortPad("C:\\Program Files\\Common Files\\")?.kort).toBe("Common Files");
  });
  it("geeft null zonder pad", () => {
    expect(verkortPad(undefined)).toBeNull();
    expect(verkortPad("  ")).toBeNull();
  });
});

describe("ketenTekst", () => {
  it("toont de aanroepketen met de oorzaak, zonder modulenamen", () => {
    expect(ketenTekst({ keten: ["Form_Hoofd.Knop_Click", "Module1.Exporteer"], oorzaak: "CreateObject(Excel.Application)" })).toBe(
      "Knop_Click → Exporteer → CreateObject(Excel.Application)",
    );
  });
  it("kan de modulenamen houden", () => {
    expect(ketenTekst({ keten: ["Module1.A"], oorzaak: "Kill" }, true)).toBe("Module1.A → Kill");
  });
});

describe("groepeerAfhankelijkheden", () => {
  const lijst = [
    afh({ soort: "declare", naam: "kernel32!GetTickCount", bibliotheek: "kernel32", regel: 5 }),
    afh({ soort: "declare", naam: "kernel32!GetTickCount", bibliotheek: "kernel32", procedure: "Q", regel: 2 }),
    afh({ soort: "createobject", naam: "Scripting.Dictionary", status: "deels" }),
    afh({ soort: "createobject", naam: "Excel.Application" }),
    afh({ soort: "bestand", naam: "Kill" }),
    afh({ soort: "pad", naam: "CurrentProject.Path" }),
    afh({ soort: "gekoppelde-tabel", naam: "tblKlant" }),
    afh({ soort: "proces", naam: "Shell" }),
    afh({ soort: "onbekend", naam: "Foo" }),
    afh({ soort: "bibliotheek", naam: "xlUp", bibliotheek: "Excel" }),
  ];
  const g = groepeerAfhankelijkheden(lijst);
  it("deelt in per scherm-tabel", () => {
    expect(g["windows-api"]).toHaveLength(1);
    expect(g.com.map((r) => r.naam)).toEqual(["Excel.Application", "Scripting.Dictionary"]);
    expect(g.bestanden).toHaveLength(2);
    expect(g.gekoppeld[0].naam).toBe("tblKlant");
    expect(g.overig.map((r) => r.soort).sort()).toEqual(["onbekend", "proces"]);
    expect(g.bibliotheek[0].bibliotheek).toBe("Excel");
  });
  it("voegt plekken samen en houdt procedures uniek", () => {
    const r = g["windows-api"][0];
    expect(r.plekken.map((p) => p.regel)).toEqual([2, 5]);
    expect(r.procedures).toEqual(["Module1.P", "Module1.Q"]);
  });
  it("neemt de slechtste status", () => {
    const g2 = groepeerAfhankelijkheden([afh({ soort: "createobject", naam: "X", status: "deels" }), afh({ soort: "createobject", naam: "X", status: "ontbreekt" })]);
    expect(g2.com[0].status).toBe("ontbreekt");
  });
});

describe("overzicht en filters", () => {
  const procs = [
    proc({ module: "Module1", naam: "A" }),
    proc({ module: "Module1", naam: "Export", status: "niet", redenen: [{ oorzaak: "CreateObject(Excel.Application)", soort: "createobject", bibliotheek: "Excel", status: "ontbreekt", omzeilbaar: false, keten: ["Module1.Export"] }] }),
    proc({ module: "Module2", naam: "B", status: "deels" }),
    proc({ module: "Form_X", naam: "Knop_Click", moduleSoort: "formulier", gebeurtenis: true }),
    proc({ module: "Klasse1", naam: "C", moduleSoort: "klasse" }),
    proc({ module: "Module2", naam: "Priv", publiek: false }),
    proc({ module: "Module2", naam: "Param", zonderVerplichteParameters: false }),
    proc({ module: "Module2", naam: "Eig", soort: "get" }),
  ];
  it("filtert op status, module en zoekterm (ook in oorzaken)", () => {
    expect(filterProcedures(procs, { status: "niet", module: "alle", zoek: "" }).map((p) => p.naam)).toEqual(["Export"]);
    expect(filterProcedures(procs, { status: "alle", module: "Module2", zoek: "" })).toHaveLength(4);
    expect(filterProcedures(procs, { status: "alle", module: "alle", zoek: "excel" }).map((p) => p.naam)).toEqual(["Export"]);
    expect(filterProcedures(procs, { status: "alle", module: "alle", zoek: "module1.a" }).map((p) => p.naam)).toEqual(["A"]);
  });
  it("verdeelt kandidaten zoals voerUitWatWerkt, zonder formuliermodules", () => {
    const zonder = verdeelKandidaten(procs, false);
    expect(zonder.kandidaten.map((p) => p.naam)).toEqual(["A"]);
    const met = verdeelKandidaten(procs, true);
    expect(met.kandidaten.map((p) => p.naam)).toEqual(["A", "B"]);
    const reden = (n: string) => met.nietUitgevoerd.find((x) => x.procedure === n)?.reden;
    expect(reden("Export")).toMatch(/niet uitvoerbaar/);
    expect(reden("Knop_Click")).toBe("gebeurtenisprocedure");
    expect(reden("C")).toMatch(/klassenmodule/);
    expect(reden("Priv")).toBe("niet publiek");
    expect(reden("Param")).toMatch(/parameters/);
    expect(reden("Eig")).toBe("eigenschapsprocedure");
  });
  it("losUitvoerbaar alleen voor publieke parameterloze Subs/Functions in standaardmodules", () => {
    expect(procs.filter(losUitvoerbaar).map((p) => p.naam)).toEqual(["A", "Export", "B"]);
  });
  it("sorteert de belangrijkste oorzaken en geeft leesbare namen", () => {
    const o = belangrijksteOorzaken({ samenvatting: { procedures: 3, perStatus: { uitvoerbaar: 1, deels: 1, niet: 1 }, perOorzaak: { bestand: 2, Excel: 5, pad: 0, "gekoppelde-tabel": 2 } } }, 2);
    expect(o).toEqual([
      { oorzaak: "Excel", procedures: 5 },
      { oorzaak: "bestand", procedures: 2 },
    ]);
    expect(oorzaakNaam("gekoppelde-tabel")).toBe("Gekoppelde tabel");
    expect(oorzaakNaam("Excel")).toBe("Excel");
  });
});

describe("gekoppelde tabellen", () => {
  it("neemt alleen naam en soort bron over", () => {
    const uit = gekoppeldeTabellenUit(
      [
        { id: "gekoppeld:tblA", naam: "tblA", soort: "Gekoppelde tabel", eigenschappen: [["Soort", "ODBC-koppeling"]] },
        { id: "tblB", naam: "tblB", soort: "Tabel" },
      ],
      ["TBLA"],
    );
    expect(uit).toEqual([{ naam: "tblA", bron: "ODBC-koppeling", inWerkkopie: true }]);
  });
});

describe("resultaat", () => {
  const fout: Uitvoering = {
    module: "Module1",
    procedure: "Export",
    status: "fout",
    overgeslagen: [{ wat: "CreateObject", categorie: "com", module: "Module1", procedure: "Export", regel: 4, aantal: 2, melding: "overgeslagen: CreateObject, Module1/4" }],
    fout: { soort: "runtime", nummer: 429, omschrijving: "ActiveX-onderdeel kan geen object maken ", module: "Module1", procedure: "Export", regel: 4 },
    uitvoer: ["=cmd"],
    hostgebeurtenissen: [{ soort: "gebeurtenis", naam: "OpenForm", doel: "frmX" }],
    duurMs: 12,
  };
  const ok: Uitvoering = { module: "Module1", procedure: "A", status: "geslaagd", overgeslagen: [], uitvoer: [], hostgebeurtenissen: [], stappen: 10, duurMs: 3 };
  const data: ResultaatExport = {
    database: "test.accdb",
    datum: "2026-10-27T10:00:00.000Z",
    opties: { ontbrekend: "overslaan", metDeels: true, terugdraaien: true, dialogenAutomatisch: true },
    teruggedraaid: true,
    regels: [
      { module: "Module1", procedure: "Export", status: "fout", uitvoering: fout },
      { module: "Module1", procedure: "A", status: "geslaagd", uitvoering: ok },
      { module: "Klasse1", procedure: "C", status: "niet-uitgevoerd", reden: "klassenmodule" },
    ],
  };
  it("telt per status", () => {
    expect(telResultaat(data.regels)).toEqual({ geslaagd: 1, fout: 1, tijdslimiet: 0, gestopt: 0, nietUitgevoerd: 1, metOvergeslagen: 1 });
  });
  it("maakt een fouttekst met nummer en plek", () => {
    expect(uitvoeringFoutTekst(fout)).toBe("Fout 429: ActiveX-onderdeel kan geen object maken (Module1, regel 4)");
  });
  it("exporteert JSON zonder broncode, met overgeslagen onderdelen", () => {
    const j = JSON.parse(resultaatAlsJson(data));
    expect(j.totalen.geslaagd).toBe(1);
    expect(j.procedures[0].fout.nummer).toBe(429);
    expect(j.procedures[0].overgeslagen[0].melding).toContain("CreateObject");
    expect(j.procedures[2].reden).toBe("klassenmodule");
  });
  it("exporteert CSV met puntkomma’s en beschermt tegen formules", () => {
    const c = resultaatAlsCsv(data);
    const regels = c.replace(/^\uFEFF/, "").split("\r\n");
    expect(regels).toHaveLength(4);
    expect(regels[1]).toContain('"429"');
    expect(regels[1]).toContain(`"'=cmd"`);
    expect(regels[1]).toContain("DoCmd.OpenForm (frmX)");
    expect(regels[3]).toContain("Niet uitgevoerd");
  });
});
