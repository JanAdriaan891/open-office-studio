import { describe, it, expect } from "vitest";
import {
  pakVbaUit,
  leesVbaDir,
  leesVbaModuleBron,
  ontsleutelProjectwaarde,
  leesProjectBeveiliging,
} from "./ovba";
import { reconstrueerQuery, type QueryRij } from "./access-query";
import { vbaUitOpslag } from "./access-analyse";
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
