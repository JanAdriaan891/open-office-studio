import { describe, it, expect } from "vitest";
import {
  pakVbaUit,
  leesVbaDir,
  leesVbaModuleBron,
  ontsleutelProjectwaarde,
  leesProjectBeveiliging,
} from "./ovba";
import { reconstrueerQuery, type QueryRij } from "./access-query";
import { isVersleutelingsfout, vbaUitOpslag } from "./access-analyse";
import {
  leesFormaat,
  leesRijenRuw,
  leesTabeldefinitie,
  leesVersleuteling,
} from "./access-pagina";
import { rapportAlsTekst } from "./model";
import { kleurTokens } from "./syntaxis";

const hex = (tekst: string) =>
  Uint8Array.from(tekst.split(" "), (paar) => parseInt(paar, 16));
const tekst = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
function letterlijk(bytes: Uint8Array) {
  const uit = [0x01];
  for (let start = 0; start < bytes.length; start += 4096) {
    const deel = bytes.subarray(start, start + 4096);
    if (deel.length === 4096) {
      uit.push(0xff, 0x3f, ...deel);
      continue;
    }
    const inhoud: number[] = [];
    for (let i = 0; i < deel.length; i += 8)
      inhoud.push(0, ...deel.subarray(i, i + 8));
    const kop = 0xb000 | (inhoud.length - 1);
    uit.push(kop & 0xff, kop >> 8, ...inhoud);
  }
  return Uint8Array.from(uit);
}
function record(id: number, data: number[] | Uint8Array) {
  const kop = new Uint8Array(6);
  new DataView(kop.buffer).setUint16(0, id, true);
  new DataView(kop.buffer).setUint32(2, data.length, true);
  return [...kop, ...data];
}
const ascii = (waarde: string) => [...new TextEncoder().encode(waarde)];
const u32 = (waarde: number) => [
  waarde & 255,
  (waarde >> 8) & 255,
  (waarde >> 16) & 255,
  waarde >>> 24,
];

describe("MS-OVBA-decompressie", () => {
  it("volgt de voorbeelden uit MS-OVBA 3.2", () => {
    expect(
      tekst(
        pakVbaUit(
          hex(
            "01 19 B0 00 61 62 63 64 65 66 67 68 00 69 6A 6B 6C 6D 6E 6F 70 00 71 72 73 74 75 76 2E",
          ),
        ),
      ),
    ).toBe("abcdefghijklmnopqrstuv.");
    expect(
      tekst(
        pakVbaUit(
          hex(
            "01 2F B0 00 23 61 61 61 62 63 64 65 82 66 00 70 61 67 68 69 6A 01 38 08 61 6B 6C 00 30 6D 6E 6F 70 06 71 02 70 04 10 72 73 74 75 76 10 77 78 79 7A 00 3C",
          ),
        ),
      ),
    ).toBe("#aaabcdefaaaaghijaaaaaklaaamnopqaaaaaaaaaaaarstuvwxyzaaa");
  });
  it("leest meerdere blokken en ongecomprimeerde blokken", () => {
    const invoer = new TextEncoder().encode(
      "Sub Test()\r\nEnd Sub\r\n".repeat(400),
    );
    expect(pakVbaUit(letterlijk(invoer))).toEqual(invoer);
    const ruw = new Uint8Array(4096).fill(0x41);
    expect(pakVbaUit(Uint8Array.from([0x01, 0xff, 0x3f, ...ruw]))).toEqual(ruw);
  });
  it("weigert ongeldige of afgebroken invoer in plaats van te gokken", () => {
    expect(() => pakVbaUit(hex("02 19 B0"))).toThrow("handtekening");
    expect(() => pakVbaUit(hex("01 19 A0 00 61"))).toThrow("blokhandtekening");
    expect(() => pakVbaUit(hex("01 03 B0 01 05 00"))).toThrow(
      "buiten het blok",
    );
  });
});

describe("VBA-dir-stream en modulebron", () => {
  const bron =
    'Attribute VB_Name = "Rekenen"\r\nPublic Function Twee()\r\n  Twee = 2\r\nEnd Function\r\n';
  const dir = [
    ...record(0x0001, u32(1)),
    ...record(0x0003, [0xe4, 0x04]),
    ...record(0x0004, ascii("Project")),
    ...record(0x0009, [0, 0, 0, 0]),
    0,
    0,
    ...record(0x0016, ascii("stdole")),
    ...record(0x000d, ascii("*\\G{00020430}")),
    ...record(0x000f, [1, 0]),
    ...record(0x0013, [0xff, 0xff]),
    ...record(0x0019, ascii("Rekenen")),
    ...record(0x001a, ascii("Rekenen")),
    ...record(0x0031, u32(3)),
    ...record(0x0021, []),
    ...record(0x002b, []),
    ...record(0x0010, []),
  ];
  it("leest projectnaam, codepagina, verwijzingen en modules", () => {
    const info = leesVbaDir(letterlijk(Uint8Array.from(dir)));
    expect(info).toEqual({
      projectnaam: "Project",
      codepagina: 1252,
      verwijzingen: [{ naam: "stdole", soort: "Geregistreerde bibliotheek" }],
      modules: [
        {
          naam: "Rekenen",
          stroom: "Rekenen",
          offset: 3,
          soort: "Standaardmodule",
        },
      ],
    });
  });
  it("haalt bron op vanaf de offset en meldt alleen-p-code als null", () => {
    const stroom = Uint8Array.from([
      9,
      9,
      9,
      ...letterlijk(new TextEncoder().encode(bron)),
    ]);
    expect(leesVbaModuleBron(stroom, 3, 1252)).toBe(bron);
    expect(leesVbaModuleBron(Uint8Array.from([9, 9, 9]), 3, 1252)).toBeNull();
  });
  it("decodeert de projectbeveiliging zonder wachtwoorden te herstellen", () => {
    expect(Array.from(ontsleutelProjectwaarde("0C0E0814081B091B091B"))).toEqual(
      [0],
    );
    expect(
      leesProjectBeveiliging(
        'CMG="0604020E0E121016101610161016"\r\nDPB="0C0E0814081B091B091B"',
      ),
    ).toEqual({ wachtwoord: false, vergrendeld: false });
    expect(leesProjectBeveiliging('Name="x"')).toEqual({
      wachtwoord: null,
      vergrendeld: null,
    });
  });
  it("bouwt paden uit de MSysAccessStorage-boom", () => {
    const lv = Uint8Array.of(1);
    const opslag = vbaUitOpslag([
      { Id: 1, ParentId: 1, Name: "MSysAccessStorage_ROOT", Type: 1, Lv: null },
      { Id: 8, ParentId: 1, Name: "VBA", Type: 1, Lv: null },
      { Id: 17, ParentId: 8, Name: "VBAProject", Type: 1, Lv: null },
      { Id: 18, ParentId: 17, Name: "VBA", Type: 1, Lv: null },
      { Id: 19, ParentId: 18, Name: "dir", Type: 2, Lv: lv },
    ]);
    expect([...opslag.stromen.keys()]).toEqual(["vba/vbaproject/vba/dir"]);
  });
});

const rij = (Attribute: number, velden: Partial<QueryRij> = {}): QueryRij => ({
  Attribute,
  Expression: null,
  Flag: null,
  LvExtra: null,
  Name1: null,
  Name2: null,
  ...velden,
});
describe("Queryreconstructie uit MSysQueries", () => {
  it("bouwt SELECT met TOP, alias, join, WHERE, GROUP BY, HAVING en ORDER BY", () => {
    const resultaat = reconstrueerQuery(
      [
        rij(0),
        rij(1, { Flag: 1 }),
        rij(3, { Flag: 0x30, Name1: "5" }),
        rij(6, { Expression: "A.x" }),
        rij(6, { Expression: "Sum(B.y)", Name1: "Som y" }),
        rij(5, { Name1: "A" }),
        rij(5, { Name1: "Tabel B", Name2: "B" }),
        rij(7, { Name1: "A", Name2: "B", Expression: "A.id = B.id", Flag: 2 }),
        rij(8, { Expression: "A.x > 1" }),
        rij(9, { Expression: "A.x" }),
        rij(10, { Expression: "Sum(B.y) > 2" }),
        rij(11, { Expression: "A.x", Name1: "D" }),
        rij(255),
      ],
      0,
    );
    expect(resultaat.soort).toBe("SELECT");
    expect(resultaat.sql).toBe(
      "SELECT TOP 5 PERCENT A.x, Sum(B.y) AS [Som y]\nFROM A LEFT JOIN [Tabel B] AS B ON A.id = B.id\nWHERE A.x > 1\nGROUP BY A.x\nHAVING Sum(B.y) > 2\nORDER BY A.x DESC;",
    );
  });
  it("verbergt pass-through-verbindingsreeksen", () => {
    const resultaat = reconstrueerQuery(
      [
        rij(1, {
          Flag: 8,
          Name1: "ODBC;DSN=x;PWD=geheim",
          Expression: "SELECT 1\0",
        }),
      ],
      112,
    );
    expect(resultaat.sql).toBe("SELECT 1");
    expect(JSON.stringify(resultaat)).not.toContain("geheim");
    expect(resultaat.beperkingen.join(" ")).toContain("verbindingsreeks");
  });
  it("meldt een beperking in plaats van te gokken", () => {
    const resultaat = reconstrueerQuery(
      [rij(1, { Flag: 1 }), rij(2, { Name1: "p", Flag: 99 }), rij(42)],
      0,
    );
    expect(resultaat.sql).toBeNull();
    expect(resultaat.beperkingen.join(" ")).toMatch(/parametertype 99/);
    expect(resultaat.beperkingen.join(" ")).toMatch(
      /attribuutcodes genegeerd: 42/,
    );
    expect(reconstrueerQuery([], 0xa0).sql).toBeNull();
  });
  it("bouwt UPDATE, APPEND met VALUES en UNION", () => {
    expect(
      reconstrueerQuery(
        [
          rij(1, { Flag: 4 }),
          rij(5, { Name1: "T" }),
          rij(6, { Name2: "T.a", Expression: "1" }),
        ],
        48,
      ).sql,
    ).toBe("UPDATE T\nSET T.a = 1;");
    expect(
      reconstrueerQuery(
        [
          rij(1, { Flag: 3, Name1: "T" }),
          rij(6, { Name2: "a", Expression: "1", Flag: 0x8000 }),
        ],
        64,
      ).sql,
    ).toBe("INSERT INTO T (a)\nVALUES (1);");
    expect(
      reconstrueerQuery(
        [
          rij(1, { Flag: 9 }),
          rij(3, { Flag: 2 }),
          rij(5, { Name2: "X7YZ_____1", Expression: "SELECT a FROM T" }),
          rij(5, { Name2: "X7YZ_____2", Expression: "SELECT a FROM U" }),
        ],
        128,
      ).sql,
    ).toBe("SELECT a FROM T\nUNION SELECT a FROM U;");
  });
});

describe("Compatibiliteitsrapport", () => {
  it("exporteert als tekst zonder databaseinhoud", () => {
    const tekstRapport = rapportAlsTekst({
      bestand: "a.mdb",
      grootte: 10,
      sha256: "ab",
      formaat: "Jet 4",
      lezer: "test",
      datum: "2026-10-26",
      regels: [
        {
          onderdeel: "VBA-modules",
          status: "niet aanwezig",
          aantal: 0,
          toelichting: "Geen.",
        },
      ],
    });
    expect(tekstRapport).toContain("[niet aanwezig] VBA-modules (0): Geen.");
  });
});

describe("Syntaxiskleuring", () => {
  it("herkent VBA-commentaar, tekst en sleutelwoorden zonder tekst te verliezen", () => {
    const bron = 'Dim x As String \' uitleg\r\nx = "it\'s ""ok""" & 42';
    const tokens = kleurTokens(bron, "vba");
    expect(tokens.map((t) => t.tekst).join("")).toBe(bron);
    expect(
      tokens.filter((t) => t.soort === "sleutelwoord").map((t) => t.tekst),
    ).toEqual(["Dim", "As", "String"]);
    expect(tokens.find((t) => t.soort === "commentaar")?.tekst).toBe(
      "' uitleg",
    );
    expect(tokens.find((t) => t.soort === "tekst")?.tekst).toBe(
      '"it\'s ""ok"""',
    );
  });
  it("kleurt SQL met namen tussen haken", () => {
    const tokens = kleurTokens("SELECT [Som y] FROM T WHERE a='x';", "sql");
    expect(
      tokens
        .filter((t) => t.soort !== "gewoon")
        .map((t) => `${t.soort}:${t.tekst}`),
    ).toEqual([
      "sleutelwoord:SELECT",
      "naam:[Som y]",
      "sleutelwoord:FROM",
      "sleutelwoord:WHERE",
      "tekst:'x'",
    ]);
  });
});

// ---------------------------------------------------------------- synthetisch ACE-bestand
function rc4(sleutel: number[], data: Uint8Array) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + sleutel[i % sleutel.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const uit = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    uit[n] = data[n] ^ s[(s[i] + s[j]) & 255];
  }
  return uit;
}
const P = 4096;
function aceBestand(paginas: number, sleutel = [0, 0, 0, 0]) {
  const bytes = new Uint8Array(paginas * P);
  bytes[1] = 1;
  bytes[0x14] = 2; // ACE 12
  const kop = new Uint8Array(128);
  kop.set(sleutel, 0x3e - 0x18);
  bytes.set(rc4([0xc7, 0xda, 0x39, 0x6b], kop), 0x18);
  return bytes;
}
const u16 = (w: number) => [w & 255, (w >> 8) & 255];
const naamBytes = (naam: string) => {
  const utf = [...naam].flatMap((c) => u16(c.charCodeAt(0)));
  return [...u16(utf.length), ...utf];
};
/** Tabeldefinitie op pagina 1: Id (Long), Naam (tekst), Lv (OLE) met drie logische indexen. */
function schrijfTabeldefinitie(bytes: Uint8Array) {
  const d: number[] = new Array(63).fill(0);
  d[0] = 0x02;
  d[1] = 0x01;
  d.splice(16, 4, ...u32(2));
  d.splice(45, 2, ...u16(3));
  d.splice(47, 4, ...u32(3));
  d.splice(51, 4, ...u32(2));
  d.push(...new Array(2 * 12).fill(0));
  const kolom = (type: number, nummer: number, varIdx: number, vast: boolean, lengte: number) => {
    const k = new Array(25).fill(0);
    k[0] = type;
    k.splice(5, 2, ...u16(nummer));
    k.splice(7, 2, ...u16(varIdx));
    k[15] = vast ? 1 : 0;
    k.splice(23, 2, ...u16(lengte));
    return k;
  };
  d.push(...kolom(4, 0, 0, true, 4), ...kolom(10, 1, 0, false, 100), ...kolom(11, 2, 1, false, 0));
  d.push(...naamBytes("Id"), ...naamBytes("Naam"), ...naamBytes("Lv"));
  const echt = (kolomNr: number, vlagOud: number, vlag: number) => {
    const e = new Array(52).fill(0);
    for (let k = 0; k < 10; k++) e.splice(4 + k * 3, 3, 0xff, 0xff, 0);
    e.splice(4, 3, ...u16(kolomNr), 1);
    e[4 + 38] = vlagOud; // laatste byte van de eerste indexpagina (de oude, foute plek)
    e[4 + 42] = vlag;
    return e;
  };
  // Echte index 0: niet uniek, maar met een 0x01 op de oude plek. Echte index 1: uniek (0x89).
  d.push(...echt(1, 0x01, 0x80), ...echt(0, 0x00, 0x89));
  const logisch = (nummer: number, echtNr: number, type: number) => {
    const l = new Array(28).fill(0);
    l.splice(4, 4, ...u32(nummer));
    l.splice(8, 4, ...u32(echtNr));
    l[4 + 19] = type;
    return l;
  };
  d.push(...logisch(0, 1, 1), ...logisch(1, 0, 0), ...logisch(2, 1, 2));
  d.push(...naamBytes("PrimaryKey"), ...naamBytes("Naam"), ...naamBytes("Verwijzing"));
  bytes.set(d, P);
}
function dataRij(id: number, naam: number[], lv: number[]) {
  const vast = u32(id);
  const off0 = 2 + vast.length;
  const off1 = off0 + naam.length;
  const eod = off1 + lv.length;
  return [...u16(3), ...vast, ...naam, ...lv, ...u16(eod), ...u16(off1), ...u16(off0), ...u16(2), 0b111];
}
function schrijfDatapagina(bytes: Uint8Array, nummer: number, eigenaar: number, rijen: { inhoud: number[]; vlag?: number }[]) {
  const basis = nummer * P;
  bytes[basis] = 0x01;
  bytes.set(u32(eigenaar), basis + 4);
  bytes.set(u16(rijen.length), basis + 12);
  let einde = P;
  rijen.forEach((r, i) => {
    const start = einde - r.inhoud.length;
    bytes.set(r.inhoud, basis + start);
    bytes.set(u16(start | (r.vlag ?? 0)), basis + 14 + i * 2);
    einde = start;
  });
}

describe("Eigen paginalezer", () => {
  it("leest de unieke vlag van Jet 4/ACE-indexen op de juiste plek", () => {
    const bytes = aceBestand(2);
    schrijfTabeldefinitie(bytes);
    const { indexen } = leesTabeldefinitie(bytes, leesFormaat(bytes), 1);
    expect(indexen.map((i) => [i.naam, i.primair, i.uniek, i.extern])).toEqual([
      ["PrimaryKey", true, true, false],
      ["Naam", false, false, false],
      // Deelt de fysieke index van de primaire sleutel en is daardoor uniek.
      ["Verwijzing", false, true, true],
    ]);
  });
  it("leest tekst, OLE in de rij en via LVAL, slaat verwijderde en onbereikbare rijen over", () => {
    const bytes = aceBestand(4);
    schrijfTabeldefinitie(bytes);
    const gecomprimeerd = [0xff, 0xfe, ...ascii("Alfa")];
    const inline = [...u32(3 | 0x80000000), ...new Array(8).fill(0), 7, 8, 9];
    const lval = [...u32(5 | 0x40000000), 0, ...u16(3), 0, ...u32(0)];
    schrijfDatapagina(bytes, 2, 1, [
      { inhoud: dataRij(1, gecomprimeerd, inline) },
      { inhoud: dataRij(2, [...u16(0x42), ...u16(0x20ac)], lval) },
      { inhoud: dataRij(3, [], []), vlag: 0x8000 },
      // Overloopverwijzing naar pagina 99, buiten het bestand.
      { inhoud: [0, 99, 0, 0], vlag: 0x4000 },
    ]);
    bytes[3 * P] = 0x01;
    bytes.set(ascii("LVAL"), 3 * P + 4);
    bytes.set(u16(1), 3 * P + 12);
    bytes.set(u16(P - 5), 3 * P + 14);
    bytes.set([1, 2, 3, 4, 5], 3 * P + P - 5);
    const meldingen: string[] = [];
    const rijen = leesRijenRuw(bytes, leesFormaat(bytes), 1, {
      overgeslagen: (reden) => meldingen.push(reden),
    });
    expect(rijen).toEqual([
      { Id: 1, Naam: "Alfa", Lv: Uint8Array.of(7, 8, 9) },
      { Id: 2, Naam: "B€", Lv: Uint8Array.of(1, 2, 3, 4, 5) },
    ]);
    expect(meldingen).toEqual(["pagina 2, rij 3: Pagina 99 ligt buiten het bestand."]);
  });
});

describe("Versleutelde databases", () => {
  it("herkent Office-versleuteling in de kop en laat onversleutelde bestanden door", () => {
    expect(leesVersleuteling(aceBestand(1))).toBeNull();
    const versleuteld = aceBestand(1, [1, 2, 3, 4]);
    versleuteld.set([...u16(8), ...u16(4), ...u16(4)], 0x299);
    expect(leesVersleuteling(versleuteld)).toBe("Office-agileversleuteling (wachtwoord)");
    versleuteld.set([...u16(2), ...u16(2), ...u32(0x24)], 0x29b);
    expect(leesVersleuteling(versleuteld)).toBe("Office-standaardversleuteling (AES, wachtwoord)");
  });
  it("herkent de foutsoort van mdb-reader, ook als oorzaak", () => {
    expect(isVersleutelingsfout(new Error("Wrong password"))).toBe(true);
    expect(
      isVersleutelingsfout(new Error("Onleesbaar", { cause: new Error("Not implemented yet") })),
    ).toBe(true);
    expect(isVersleutelingsfout(new Error("Wrong page type."))).toBe(false);
  });
});
