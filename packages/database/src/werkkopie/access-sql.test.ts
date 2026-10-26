import { describe, expect, it, beforeAll } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import {
  datumLiteraal,
  ontleedAccessSql,
  parameterNamen,
  tokeniseer,
  vertaalAccessSql,
  type VertaalContext,
} from "./access-sql";
import { WerkkopieFout, type Veldsoort } from "./contract";
import { formatteer, registreerAccessFuncties } from "./functies";
import { JACKCESS } from "./jackcess-verwachting";

const schema: Record<string, [string, Veldsoort][]> = {
  Klant: [
    ["ID", "autonummer"],
    ["Naam", "tekst"],
    ["Plaats", "tekst"],
    ["Geboren", "datum"],
    ["Actief", "jaNee"],
    ["Saldo", "valuta"],
  ],
  Order: [
    ["ID", "autonummer"],
    ["KlantID", "geheel"],
    ["Datum", "datum"],
    ["Bedrag", "valuta"],
  ],
  "01_Lijst": [["1997", "getal"]],
  "Order Details": [
    ["OrderID", "geheel"],
    ["Product", "tekst"],
  ],
  Table1: [
    ["col1", "tekst"],
    ["col2", "tekst"],
    ["col3", "tekst"],
  ],
  Table2: [
    ["col1", "tekst"],
    ["col2", "tekst"],
    ["col3", "tekst"],
  ],
  Table3: [
    ["col1", "tekst"],
    ["col2", "tekst"],
    ["col3", "tekst"],
  ],
};
const querys: Record<string, { sql: string; soort: "select" | "crosstab" | "union" | "update" }> = {
  actieveklanten: { sql: "SELECT * FROM Klant WHERE Actief = True;", soort: "select" },
  klantinplaats: { sql: "PARAMETERS [Welke plaats] Text(50);\nSELECT ID, Naam FROM ActieveKlanten WHERE Plaats = [Welke plaats];", soort: "select" },
  kring1: { sql: "SELECT * FROM Kring2", soort: "select" },
  kring2: { sql: "SELECT * FROM Kring1", soort: "select" },
  bijwerken: { sql: "UPDATE Klant SET Saldo = 0", soort: "update" },
};
const ctx: VertaalContext = {
  tabel: (naam) => {
    const sleutel = Object.keys(schema).find((k) => k.toLowerCase() === naam.toLowerCase());
    return sleutel ? { naam: sleutel, kolommen: schema[sleutel].map(([n, soort]) => ({ naam: n, soort })) } : null;
  },
  query: (naam) => {
    const q = querys[naam.toLowerCase()];
    return q ? { naam: Object.keys(querys).find((k) => k === naam.toLowerCase())!, ...q } : null;
  },
  pivotWaarden: () => ["Amsterdam", "Utrecht", null],
};
const v = (sql: string) => vertaalAccessSql(sql, ctx).sql;
const fout = (sql: string) => {
  try {
    vertaalAccessSql(sql, ctx);
  } catch (e) {
    if (e instanceof WerkkopieFout) return e;
    throw e;
  }
  throw new Error(`Verwachtte een fout voor: ${sql}`);
};

describe("tokenizer", () => {
  it("herkent haken, tekst met dubbele aanhalingstekens, datums en hexadecimaal", () => {
    const t = tokeniseer('SELECT [Naam met spaties], "Zeg ""hoi""", \'x\', #10/26/2026#, &H1F, 1.5E3 FROM T');
    expect(t.map((x) => [x.soort, x.waarde])).toEqual([
      ["naam", "SELECT"],
      ["haak", "Naam met spaties"],
      ["teken", ","],
      ["tekst", 'Zeg "hoi"'],
      ["teken", ","],
      ["tekst", "x"],
      ["teken", ","],
      ["datum", "10/26/2026"],
      ["teken", ","],
      ["getal", "31"],
      ["teken", ","],
      ["getal", "1.5E3"],
      ["naam", "FROM"],
      ["naam", "T"],
      ["eind", ""],
    ]);
  });
  it("geeft een syntaxisfout met positie bij een open haak", () => {
    expect(() => tokeniseer("SELECT [Naam")).toThrow(/Sluitend \] ontbreekt/);
  });
  it("leest &Hoogte niet als hexadecimaal getal", () => {
    expect(tokeniseer("a &Hoogte").map((t) => t.soort)).toEqual(["naam", "teken", "naam", "eind"]);
  });
});

describe("datumliteralen", () => {
  it("leest Access-SQL in VS-notatie m/d/jjjj", () => {
    expect(datumLiteraal("10/26/2026")).toBe("2026-10-26");
    expect(datumLiteraal("3/4/2026")).toBe("2026-03-04");
  });
  it("draait een onmogelijke maand om (26-10-2026)", () => {
    expect(datumLiteraal("26-10-2026")).toBe("2026-10-26");
  });
  it("leest ISO, tijden, AM/PM, maandnamen en tweecijferige jaren", () => {
    expect(datumLiteraal("2026-10-26")).toBe("2026-10-26");
    expect(datumLiteraal("10/26/2026 14:30:05")).toBe("2026-10-26T14:30:05");
    expect(datumLiteraal("10/26/2026 2:30 PM")).toBe("2026-10-26T14:30:00");
    expect(datumLiteraal("14:30")).toBe("1899-12-30T14:30:00");
    expect(datumLiteraal("26-Oct-2026")).toBe("2026-10-26");
    expect(datumLiteraal("1/2/29")).toBe("2029-01-02");
    expect(datumLiteraal("1/2/30")).toBe("1930-01-02");
  });
  it("weigert ongeldige datums", () => {
    expect(() => datumLiteraal("2/30/2026")).toThrow(WerkkopieFout);
  });
});

describe("Access-SQL naar SQLite", () => {
  it("citeert namen met spaties en Tabel.[Veld]", () => {
    expect(v("SELECT [Order Details].[Product] FROM [Order Details]")).toBe(
      'SELECT "Order Details"."Product" FROM "Order Details"',
    );
  });
  it("vertaalt & als tekstkoppeling met Access-null-gedrag en + met tekst", () => {
    expect(v('SELECT Naam & " " & Plaats AS Adres FROM Klant')).toBe(
      `SELECT acc_concat(acc_concat("Naam", ' '), "Plaats") AS "Adres" FROM "Klant"`,
    );
    expect(v('SELECT "a" + Naam FROM Klant')).toContain(`('a' || "Naam")`);
  });
  it("houdt de VBA-operatorvoorrang aan (& zwakker dan +, ^ sterker dan unair min)", () => {
    expect(v("SELECT 1 & 2 + 3")).toBe('SELECT acc_concat(1, (2 + 3)) AS "Expr1000"');
    expect(v("SELECT -2 ^ 2")).toBe('SELECT (-pow(2, 2)) AS "Expr1000"');
    expect(v("SELECT 7 / 2, 7 \\ 2, 7 Mod 2")).toBe(
      'SELECT (CAST(7 AS REAL) / 2) AS "Expr1000", acc_intdiv(7, 2) AS "Expr1001", acc_mod(7, 2) AS "Expr1002"',
    );
  });
  it("vertaalt True/False en ja/nee-vergelijking met -1", () => {
    expect(v("SELECT * FROM Klant WHERE Actief = True AND Actief <> False")).toContain('(("Actief" = 1) AND ("Actief" <> 0))');
    expect(v("SELECT * FROM Klant WHERE Actief = -1")).toContain('("Actief" = 1)');
  });
  it("vertaalt Like met * en ? naar LIKE met escape, # en [..] naar acc_like", () => {
    expect(v('SELECT * FROM Klant WHERE Naam Like "A*b?"')).toContain(`("Naam" LIKE 'A%b_' ESCAPE '\\')`);
    expect(v('SELECT * FROM Klant WHERE Naam Like "100%*"')).toContain(`LIKE '100\\%%' ESCAPE '\\'`);
    expect(v('SELECT * FROM Klant WHERE Naam Like "[*]*"')).toContain(`LIKE '*%'`);
    expect(v('SELECT * FROM Klant WHERE Naam Like "##*"')).toContain(`acc_like("Naam", '##*')`);
    expect(v('SELECT * FROM Klant WHERE Naam Not Like "[!a-c]*"')).toContain(`(NOT acc_like("Naam", '[!a-c]*'))`);
    expect(v("SELECT * FROM Klant WHERE Naam Like [Zoek] & \"*\"")).toContain("acc_like(\"Naam\", acc_concat(?1, '*'))");
  });
  it("vertaalt TOP n, TOP n PERCENT en DISTINCTROW", () => {
    expect(v("SELECT TOP 5 Naam FROM Klant ORDER BY Saldo DESC")).toBe(
      'SELECT "Naam" FROM "Klant" ORDER BY "Saldo" DESC LIMIT 5',
    );
    expect(v("SELECT TOP 10 PERCENT Naam FROM Klant")).toContain('LIMIT (SELECT CAST(ceil(COUNT(*) * 10 / 100.0) AS INTEGER) FROM (SELECT "Naam" FROM "Klant"))');
    expect(v("SELECT DISTINCTROW Naam FROM Klant")).toBe('SELECT "Naam" FROM "Klant"');
  });
  it("vertaalt IIf, Nz, IsNull, Switch en Choose", () => {
    expect(v('SELECT IIf(Saldo > 0, "plus", "min") AS S FROM Klant')).toContain(`(CASE WHEN ("Saldo" > 0) THEN 'plus' ELSE 'min' END)`);
    expect(v("SELECT Nz(Saldo, 0), Nz(Plaats) FROM Klant")).toContain(`COALESCE("Saldo", 0) AS "Expr1000", COALESCE("Plaats", '')`);
    expect(v("SELECT * FROM Klant WHERE IsNull(Plaats)")).toContain('("Plaats" IS NULL)');
    expect(v('SELECT Switch(Saldo < 0, "rood", True, "zwart") FROM Klant')).toContain(`(CASE WHEN ("Saldo" < 0) THEN 'rood' WHEN 1 THEN 'zwart' END)`);
    expect(v('SELECT Choose(2, "a", "b") FROM Klant')).toContain(`(CASE CAST(2 AS INTEGER) WHEN 1 THEN 'a' WHEN 2 THEN 'b' END)`);
  });
  it("vertaalt tekstfuncties", () => {
    const sql = v("SELECT Len(Naam), Left(Naam, 2), Right(Naam, 2), Mid(Naam, 2, 3), Mid(Naam, 2), UCase(Naam), LCase$(Naam), Trim(Naam), InStr(Naam, \"a\"), InStr(3, Naam, \"a\"), Format(Saldo, \"#,##0.00\") FROM Klant");
    for (const deel of [
      'LENGTH("Naam")',
      'SUBSTR("Naam", 1, 2)',
      'acc_right("Naam", 2)',
      'SUBSTR("Naam", 2, 3)',
      'SUBSTR("Naam", 2)',
      'acc_ucase("Naam")',
      'acc_lcase("Naam")',
      'TRIM("Naam")',
      `acc_instr(1, "Naam", 'a', NULL)`,
      `acc_instr(3, "Naam", 'a', NULL)`,
      `acc_format("Saldo", '#,##0.00')`,
    ])
      expect(sql).toContain(deel);
  });
  it("vertaalt datumfuncties en datumrekenen", () => {
    const sql = v('SELECT Date(), Now(), Year(Geboren), Month(Geboren), Day(Geboren), DateAdd("m", 1, Geboren), DateDiff("d", Geboren, Date()), DateSerial(2026, 10, 26), Geboren + 7, Date() - Geboren FROM Klant');
    for (const deel of [
      "acc_vandaag()",
      "acc_nu()",
      `acc_datepart('yyyy', "Geboren", NULL)`,
      `acc_datepart('m', "Geboren", NULL)`,
      `acc_datepart('d', "Geboren", NULL)`,
      `acc_dateadd('m', 1, "Geboren")`,
      `acc_datediff('d', "Geboren", acc_vandaag(), NULL)`,
      "acc_dateserial(2026, 10, 26)",
      'acc_datumplus("Geboren", 7)',
      '(julianday(acc_vandaag()) - julianday("Geboren"))',
    ])
      expect(sql).toContain(deel);
    expect(v("SELECT * FROM [Order] WHERE Datum >= #10/26/2026# AND Datum < #26-10-2027#")).toContain(`("Datum" >= '2026-10-26') AND ("Datum" < '2027-10-26')`);
  });
  it("vertaalt conversie- en getalfuncties", () => {
    const sql = v('SELECT CInt(Saldo), CLng(Saldo), CDbl(Saldo), CStr(Saldo), CDate("26-10-2026"), Int(Saldo), Fix(Saldo), Round(Saldo, 2), Abs(Saldo), Val("12abc") FROM Klant');
    for (const deel of ['acc_cint("Saldo")', 'CAST("Saldo" AS REAL)', 'acc_cstr("Saldo")', "acc_cdate('26-10-2026')", 'acc_int("Saldo")', 'acc_fix("Saldo")', 'acc_round("Saldo", 2)', 'ABS("Saldo")', "acc_val('12abc')"])
      expect(sql).toContain(deel);
  });
  it("vertaalt aggregaten inclusief First/Last/StDev/Var", () => {
    const sql = v("SELECT Plaats, Count(*), Count(Naam), Sum(Saldo), Avg(Saldo), Min(Saldo), Max(Saldo), First(Naam), Last(Naam), StDev(Saldo), Var(Saldo) FROM Klant GROUP BY Plaats HAVING Count(*) > 1");
    for (const deel of ["COUNT(*)", 'COUNT("Naam")', 'SUM("Saldo")', 'AVG("Saldo")', 'MIN("Saldo")', 'MAX("Saldo")', 'acc_first("Naam")', 'acc_last("Naam")', 'acc_stdev("Saldo")', 'acc_var("Saldo")', 'GROUP BY "Plaats" HAVING (COUNT(*) > 1)'])
      expect(sql).toContain(deel);
  });
  it("geeft Access-kolomnamen Expr1000… aan naamloze expressies", () => {
    expect(v("SELECT Naam, Saldo * 2, Saldo * 3 AS Drie FROM Klant")).toBe(
      'SELECT "Naam", ("Saldo" * 2) AS "Expr1000", ("Saldo" * 3) AS "Drie" FROM "Klant"',
    );
  });
  it("breidt een alias uit die elders in de query wordt gebruikt", () => {
    expect(v("SELECT Saldo * 2 AS Dubbel, Dubbel + 1 AS Meer FROM Klant WHERE Dubbel > 10 ORDER BY Dubbel")).toBe(
      'SELECT ("Saldo" * 2) AS "Dubbel", ((("Saldo" * 2)) + 1) AS "Meer" FROM "Klant" WHERE ((("Saldo" * 2)) > 10) ORDER BY "Dubbel"',
    );
  });
  it("vertaalt joins, subquery’s, IN, EXISTS en BETWEEN", () => {
    expect(v("SELECT Klant.Naam, [Order].Bedrag FROM Klant INNER JOIN [Order] ON Klant.ID = [Order].KlantID WHERE [Order].Bedrag Between 10 And 20")).toBe(
      'SELECT "Klant"."Naam", "Order"."Bedrag" FROM "Klant" INNER JOIN "Order" ON ("Klant"."ID" = "Order"."KlantID") WHERE ("Order"."Bedrag" BETWEEN 10 AND 20)',
    );
    expect(v("SELECT * FROM Klant AS k WHERE EXISTS (SELECT * FROM [Order] o WHERE o.KlantID = k.ID) AND k.ID IN (SELECT KlantID FROM [Order])")).toContain(
      '(EXISTS (SELECT * FROM "Order" AS "o" WHERE ("o"."KlantID" = "k"."ID")))',
    );
    expect(v("SELECT x.Naam FROM (SELECT Naam FROM Klant) AS x")).toBe('SELECT "x"."Naam" FROM (SELECT "Naam" FROM "Klant") AS "x"');
    expect(v("SELECT x.Naam FROM [SELECT Naam FROM Klant]. AS x")).toBe('SELECT "x"."Naam" FROM (SELECT "Naam" FROM "Klant") AS "x"');
  });
  it("herkent parameters: [Naam] die geen veld is, Forms!-verwijzingen en ?", () => {
    const vt = vertaalAccessSql("SELECT * FROM Klant WHERE Plaats = [Welke plaats?] AND ID > [Forms]![Start]![txtID] AND Saldo > ? AND Plaats <> [Welke plaats?]", ctx);
    expect(vt.sql).toContain('("Plaats" = ?1)');
    expect(vt.sql).toContain('("ID" > ?2)');
    expect(vt.sql).toContain('("Saldo" > ?3)');
    expect(vt.sql).toContain('("Plaats" <> ?1)');
    expect(vt.parameters.map((p) => p.naam)).toEqual(["Welke plaats?", "Forms!Start!txtID", null]);
  });
  it("leest PARAMETERS-declaraties met types, ook met spaties zonder haken", () => {
    const vt = vertaalAccessSql("PARAMETERS [Begin] DateTime, User Name Text(50), Ongebruikt Long;\nSELECT * FROM [Order] WHERE Datum >= [Begin] AND [User Name] = 'x'", ctx);
    expect(vt.gedeclareerd).toEqual([
      { naam: "Begin", type: "DateTime" },
      { naam: "User Name", type: "Text" },
      { naam: "Ongebruikt", type: "Long" },
    ]);
    expect(vt.parameters[0]).toEqual({ naam: "Begin", type: "DateTime", positie: null });
    expect(parameterNamen(vt)).toEqual(["Begin", "User Name", "Ongebruikt"]);
    expect(parameterNamen(vertaalAccessSql("SELECT * FROM Klant WHERE ID = ? OR Naam = [Wie]", ctx))).toEqual(["?1", "Wie"]);
  });
  it("neemt opgeslagen query’s (ook geneste) op als CTE’s", () => {
    const vt = vertaalAccessSql("SELECT Naam FROM KlantInPlaats ORDER BY Naam", ctx);
    expect(vt.sql).toBe(
      'WITH "actieveklanten" AS (SELECT * FROM "Klant" WHERE ("Actief" = 1)), "klantinplaats" AS (SELECT "ID", "Naam" FROM "actieveklanten" WHERE ("Plaats" = ?1)) SELECT "Naam" FROM "klantinplaats" ORDER BY "Naam"',
    );
    expect(vt.parameters[0]).toMatchObject({ naam: "Welke plaats", type: "Text" });
  });
  it("weigert kringverwijzingen en actiequery’s als bron", () => {
    expect(fout("SELECT * FROM Kring1").message).toMatch(/Kringverwijzing/);
    expect(fout("SELECT * FROM Bijwerken").code).toBe("niet-ondersteund");
  });
  it("vertaalt UNION en UNION ALL met ORDER BY op uitvoerkolommen", () => {
    expect(v("SELECT Naam FROM Klant UNION SELECT Product FROM [Order Details] ORDER BY Naam")).toBe(
      'SELECT "Naam" FROM "Klant" UNION SELECT "Product" FROM "Order Details" ORDER BY 1',
    );
    expect(v("SELECT TOP 1 Naam FROM Klant ORDER BY Naam UNION ALL SELECT Product FROM [Order Details]")).toBe(
      'SELECT * FROM (SELECT "Naam" FROM "Klant" ORDER BY "Naam" LIMIT 1) UNION ALL SELECT "Product" FROM "Order Details"',
    );
  });
  it("vertaalt TRANSFORM … PIVOT naar CASE-kolommen per waarde", () => {
    const vt = vertaalAccessSql("TRANSFORM Sum(Saldo) AS Totaal SELECT Actief FROM Klant GROUP BY Actief PIVOT Plaats", ctx);
    expect(vt.soort).toBe("crosstab");
    expect(vt.sql).toBe(
      `SELECT "Actief", SUM(CASE WHEN "Plaats" = 'Amsterdam' THEN "Saldo" END) AS "Amsterdam", SUM(CASE WHEN "Plaats" = 'Utrecht' THEN "Saldo" END) AS "Utrecht", SUM(CASE WHEN "Plaats" IS NULL THEN "Saldo" END) AS "<>" FROM "Klant" GROUP BY "Actief"`,
    );
    const metIn = vertaalAccessSql('TRANSFORM Count(*) SELECT Actief FROM Klant GROUP BY Actief PIVOT Plaats IN ("Delft", "Gouda")', ctx);
    expect(metIn.sql).toContain(`COUNT(CASE WHEN "Plaats" = 'Delft' THEN 1 END) AS "Delft"`);
  });
  it("verplaatst WHERE-voorwaarden met een aggregaat naar HAVING", () => {
    expect(v("SELECT Plaats, Avg(Saldo) FROM Klant WHERE Actief = True AND Avg(Saldo) > 10 GROUP BY Plaats")).toBe(
      'SELECT "Plaats", AVG("Saldo") AS "Expr1000" FROM "Klant" WHERE ("Actief" = 1) GROUP BY "Plaats" HAVING (AVG("Saldo") > 10)',
    );
  });
  it("vertaalt INSERT INTO … SELECT en VALUES", () => {
    expect(v("INSERT INTO Klant (Naam, Plaats) VALUES ('Jan', 'Delft')")).toBe(`INSERT INTO "Klant" ("Naam", "Plaats") VALUES ('Jan', 'Delft')`);
    expect(v("INSERT INTO Klant ( Naam ) SELECT Product FROM [Order Details]")).toBe('INSERT INTO "Klant" ("Naam") SELECT "Product" FROM "Order Details"');
  });
  it("vertaalt UPDATE, ook met een join", () => {
    expect(v("UPDATE Klant SET Saldo = Saldo * 1.1 WHERE Plaats = 'Delft'")).toBe(
      `UPDATE "Klant" SET "Saldo" = ("Saldo" * 1.1) WHERE ("Plaats" = 'Delft')`,
    );
    expect(v("UPDATE Klant INNER JOIN [Order] ON Klant.ID = [Order].KlantID SET Klant.Saldo = [Order].Bedrag WHERE [Order].Bedrag > 0")).toBe(
      'UPDATE "Klant" SET "Saldo" = "__u"."__w0" FROM (SELECT "Klant".rowid AS "__rij", "Order"."Bedrag" AS "__w0" FROM "Klant" INNER JOIN "Order" ON ("Klant"."ID" = "Order"."KlantID") WHERE ("Order"."Bedrag" > 0)) AS "__u" WHERE "Klant".rowid = "__u"."__rij"',
    );
  });
  it("vertaalt DELETE [tabel.*] FROM, ook met een join", () => {
    expect(v("DELETE * FROM Klant WHERE Saldo < 0")).toBe('DELETE FROM "Klant" WHERE ("Saldo" < 0)');
    expect(v("DELETE Klant.* FROM Klant WHERE Saldo < 0")).toBe('DELETE FROM "Klant" WHERE ("Saldo" < 0)');
    expect(v("DELETE Klant.* FROM Klant LEFT JOIN [Order] ON Klant.ID = [Order].KlantID WHERE [Order].ID Is Null")).toBe(
      'DELETE FROM "Klant" WHERE rowid IN (SELECT "Klant".rowid FROM "Klant" LEFT JOIN "Order" ON ("Klant"."ID" = "Order"."KlantID") WHERE ("Order"."ID" IS NULL))',
    );
  });
  it("vertaalt SELECT … INTO (tabelmaakquery) met vervanging van de doeltabel", () => {
    const vt = vertaalAccessSql("SELECT Naam, Plaats INTO Archief FROM Klant WHERE Actief = False", ctx);
    expect(vt.soort).toBe("maketable");
    expect(vt.voorbereiding).toEqual(['DROP TABLE IF EXISTS "Archief"']);
    expect(vt.sql).toBe('CREATE TABLE "Archief" AS SELECT "Naam", "Plaats" FROM "Klant" WHERE ("Actief" = 0)');
  });
  it("vertaalt eenvoudige DDL", () => {
    expect(v("CREATE TABLE Nieuw (ID COUNTER PRIMARY KEY, Naam TEXT(50) NOT NULL, Prijs CURRENCY, Datum DATETIME, Actief YESNO)")).toBe(
      'CREATE TABLE "Nieuw" ("ID" INTEGER PRIMARY KEY, "Naam" VARCHAR(50) COLLATE NOCASE NOT NULL, "Prijs" CURRENCY REAL, "Datum" DATETIME TEXT, "Actief" YESNO INTEGER)',
    );
    expect(v("CREATE UNIQUE INDEX ixNaam ON Klant (Naam DESC)")).toBe('CREATE UNIQUE INDEX "Klant.ixNaam" ON "Klant" ("Naam" DESC)');
    expect(v("ALTER TABLE Klant ADD COLUMN Notitie MEMO")).toBe('ALTER TABLE "Klant" ADD COLUMN "Notitie" MEMO TEXT COLLATE NOCASE');
    expect(v("ALTER TABLE Klant DROP COLUMN Plaats")).toBe('ALTER TABLE "Klant" DROP COLUMN "Plaats"');
    expect(v("DROP TABLE Klant")).toBe('DROP TABLE "Klant"');
  });
  it("vertaalt domeinfuncties met letterlijke argumenten", () => {
    expect(v('SELECT DLookUp("Naam", "Klant", "ID = 1"), DCount("*", "Order") FROM Klant')).toContain(
      `(SELECT "Naam" FROM "Klant" WHERE ("ID" = 1) LIMIT 1) AS "Expr1000", (SELECT COUNT(*) FROM "Order") AS "Expr1001"`,
    );
  });
  it("geeft concrete beperkingen voor wat niet vertaalbaar is", () => {
    expect(fout("SELECT MijnVbaFunctie(Naam) FROM Klant")).toMatchObject({ code: "niet-ondersteund", message: expect.stringMatching(/MijnVbaFunctie.*VBA/) });
    expect(fout('SELECT DLookup("Naam", "Klant", "ID=" & ID) FROM Klant').code).toBe("niet-ondersteund");
    expect(fout("SELECT * FROM Klant IN 'C:\\andere.mdb'").message).toMatch(/externe database/);
    expect(fout('SELECT Eval("1+1")').code).toBe("niet-ondersteund");
    expect(fout("ALTER TABLE Klant ALTER COLUMN Naam TEXT(10)").code).toBe("niet-ondersteund");
    expect(fout("SELECT Replace(Naam, 'a', 'b', 2) FROM Klant").code).toBe("niet-ondersteund");
    expect(fout("UPDATE Klant SET Klant.Naam = 'x', [Order].Bedrag = 1").code).toBe("niet-ondersteund");
    expect(() => vertaalAccessSql("SELECT 1", ctx, { soort: "passthrough", naam: "Extern" })).toThrow(/pass-through/);
  });
  it("geeft syntaxisfouten met plaatsaanduiding", () => {
    expect(fout("SELECT FROM Klant").code).toBe("syntaxis");
    expect(fout("SELECT * FROM Klant WHERE").message).toMatch(/einde/);
    expect(fout("SELEKT * FROM Klant").code).toBe("syntaxis");
    expect(fout("SELECT * FROM Onbekend").code).toBe("onbekend-object");
  });
  it("is soepel zoals Jet met opgeslagen SQL uit de praktijk", () => {
    // Gereserveerd woord als tabelnaam zonder haken.
    expect(v("SELECT Order.ID FROM Order WHERE Order.Bedrag > 0")).toBe('SELECT "Order"."ID" FROM "Order" WHERE ("Order"."Bedrag" > 0)');
    expect(v("INSERT INTO order (KlantID) VALUES (1)")).toBe('INSERT INTO "Order" ("KlantID") VALUES (1)');
    // IIf zonder onwaar-deel geeft Null.
    expect(v("SELECT IIf(Saldo > 0, 'plus') FROM Klant")).toContain("ELSE NULL END");
    // DELETE met alias in de veldlijst.
    expect(v("DELETE Klant.ID AS Expr1, Klant.Naam FROM Klant WHERE Klant.ID = 1")).toBe('DELETE FROM "Klant" WHERE ("Klant"."ID" = 1)');
    // Puntkomma vóór UNION.
    expect(v("SELECT Naam FROM Klant;\nUNION ALL SELECT Product FROM [Order Details];")).toContain("UNION ALL");
    // Spaties in een tijdliteraal.
    expect(datumLiteraal("12: 00: 00")).toBe("1899-12-30T12:00:00");
    expect(fout("SELECT Name FROM MSysObjects").message).toMatch(/systeemtabel/);
    // Namen die met een cijfer beginnen, en een veld dat Percent heet.
    expect(v("SELECT 01_Lijst.1997, Percent FROM 01_Lijst")).toBe('SELECT "01_Lijst"."1997", ?1 AS "Expr1000" FROM "01_Lijst"');
    expect(tokeniseer("1E3 2e5x").map((t) => t.soort)).toEqual(["getal", "naam", "eind"]);
    // Puntkomma in een subquery en kwantoren.
    expect(v("SELECT * FROM Klant WHERE Saldo = (SELECT Max(Saldo) FROM Klant;)")).toContain("(SELECT MAX(\"Saldo\") AS \"Expr1000\" FROM \"Klant\")");
    expect(v("SELECT * FROM Klant WHERE ID = ANY (SELECT KlantID FROM [Order])")).toContain('("ID" IN (SELECT "KlantID" FROM "Order"))');
    expect(v("SELECT * FROM Klant WHERE ID <> ALL (SELECT KlantID FROM [Order])")).toContain('("ID" NOT IN (SELECT "KlantID" FROM "Order"))');
    expect(fout("SELECT * FROM Klant WHERE Saldo > ALL (SELECT Bedrag FROM [Order])").code).toBe("niet-ondersteund");
  });
  it("ontleedt WITH OWNERACCESS OPTION en puntkomma’s", () => {
    expect(ontleedAccessSql("SELECT 1 WITH OWNERACCESS OPTION;;").stelling.t).toBe("select");
  });
});

const JACKCESS_SOORT: Record<string, "select" | "delete" | "append" | "update" | "maketable" | "crosstab" | "union" | "passthrough" | "ddl"> = {
  SelectQuery: "select",
  DeleteQuery: "delete",
  AppendQuery: "append",
  UpdateQuery: "update",
  MakeTableQuery: "maketable",
  CrosstabQuery: "crosstab",
  UnionQuery: "union",
  PassthroughQuery: "passthrough",
  DataDefinitionQuery: "ddl",
};

describe("de 45 verwachte Jackcess-query’s", () => {
  const versies = ["V1997", "V2000", "V2003", "V2007", "V2010"];
  for (const versie of versies)
    for (const [naam, sql] of Object.entries(JACKCESS))
      it(`${versie} ${naam} vertaalt of geeft een concrete beperking`, () => {
        try {
          const vt = vertaalAccessSql(sql, ctx, { soort: JACKCESS_SOORT[naam], naam });
          expect(vt.soort).toBe(JACKCESS_SOORT[naam]);
          expect(vt.sql.length).toBeGreaterThan(0);
        } catch (e) {
          expect(e).toBeInstanceOf(WerkkopieFout);
          expect(["niet-ondersteund", "beperking"]).toContain((e as WerkkopieFout).code);
          expect((e as WerkkopieFout).message.length).toBeGreaterThan(30);
        }
      });
  it("alleen UpdateQuery en PassthroughQuery zijn beperkingen", () => {
    const beperkt = Object.entries(JACKCESS)
      .filter(([naam, sql]) => {
        try {
          vertaalAccessSql(sql, ctx, { soort: JACKCESS_SOORT[naam], naam });
          return false;
        } catch {
          return true;
        }
      })
      .map(([naam]) => naam);
    expect(beperkt).toEqual(["UpdateQuery", "PassthroughQuery"]);
  });
});

describe("eigen SQL-functies", () => {
  let SQL: SqlJsStatic;
  beforeAll(async () => {
    SQL = await initSqlJs();
  });
  const een = (sql: string) => {
    const db = new SQL.Database();
    registreerAccessFuncties(db);
    try {
      return db.exec(sql)[0].values[0][0];
    } finally {
      db.close();
    }
  };
  it("rekent met datums zoals Access", () => {
    expect(een("SELECT acc_dateadd('m', 1, '2026-01-31')")).toBe("2026-02-28");
    expect(een("SELECT acc_dateadd('yyyy', -1, '2024-02-29')")).toBe("2023-02-28");
    expect(een("SELECT acc_dateadd('h', 3, '2026-10-26T22:00:00')")).toBe("2026-10-27T01:00:00");
    expect(een("SELECT acc_datediff('d', '2026-10-01', '2026-10-26', NULL)")).toBe(25);
    expect(een("SELECT acc_datediff('m', '2026-01-31', '2026-02-01', NULL)")).toBe(1);
    expect(een("SELECT acc_datediff('yyyy', '2025-12-31', '2026-01-01', NULL)")).toBe(1);
    expect(een("SELECT acc_datediff('ww', '2026-10-24', '2026-10-26', NULL)")).toBe(1);
    expect(een("SELECT acc_datepart('w', '2026-10-26', NULL)")).toBe(2);
    expect(een("SELECT acc_datepart('q', '2026-10-26', NULL)")).toBe(4);
    expect(een("SELECT acc_datepart('y', '2026-02-01', NULL)")).toBe(32);
    expect(een("SELECT acc_dateserial(2026, 13, 0)")).toBe("2026-12-31");
    expect(een("SELECT acc_datumplus('2026-10-26', 1.5)")).toBe("2026-10-27T12:00:00");
    expect(een("SELECT acc_cdate('26-10-2026 14:30')")).toBe("2026-10-26T14:30:00");
  });
  it("rondt af zoals VBA (half naar even) en kent Int/Fix/Val/CInt", () => {
    expect(een("SELECT acc_round(2.5, 0)")).toBe(2);
    expect(een("SELECT acc_round(3.5, 0)")).toBe(4);
    expect(een("SELECT acc_round(-2.5, 0)")).toBe(-2);
    expect(een("SELECT acc_round(1.235, 2)")).toBeCloseTo(1.24);
    expect(een("SELECT acc_int(-1.5)")).toBe(-2);
    expect(een("SELECT acc_fix(-1.5)")).toBe(-1);
    expect(een("SELECT acc_val('  12.5abc')")).toBe(12.5);
    expect(een("SELECT acc_val('&HFF')")).toBe(255);
    expect(een("SELECT acc_cint(4.5)")).toBe(4);
    expect(een("SELECT acc_intdiv(7, 2)")).toBe(3);
  });
  it("kent Access-Like-jokers, hoofdletterongevoelig", () => {
    expect(een("SELECT acc_like('A12x', 'a##?')")).toBe(1);
    expect(een("SELECT acc_like('Bert', '[A-C]*')")).toBe(1);
    expect(een("SELECT acc_like('Dirk', '[!A-C]*')")).toBe(1);
    expect(een("SELECT acc_like('Dirk', '[A-C]*')")).toBe(0);
    expect(een("SELECT acc_like('a*b', 'a[*]b')")).toBe(1);
  });
  it("koppelt tekst met & zoals Access (Null wordt leeg, decimale komma)", () => {
    expect(een("SELECT acc_concat('a', NULL)")).toBe("a");
    expect(een("SELECT acc_concat(NULL, NULL)")).toBe(null);
    expect(een("SELECT acc_concat('x', 1.5)")).toBe("x1,5");
    expect(een("SELECT acc_concat('x', 2.0)")).toBe("x2");
  });
  it("tekstfuncties", () => {
    expect(een("SELECT acc_instr(1, 'Hallo', 'L', NULL)")).toBe(3);
    expect(een("SELECT acc_instr(1, 'Hallo', 'L', 0)")).toBe(0);
    expect(een("SELECT acc_right('Hallo', 3)")).toBe("llo");
    expect(een("SELECT acc_ucase('straße é')")).toBe("STRASSE É");
    expect(een("SELECT acc_strcomp('a', 'B', NULL)")).toBe(-1);
  });
  it("aggregaten First, Last, StDev en Var", () => {
    const db = new SQL.Database();
    registreerAccessFuncties(db);
    db.run("CREATE TABLE t (x); INSERT INTO t VALUES (2), (4), (4), (4), (5), (5), (7), (9)");
    expect(db.exec("SELECT acc_first(x), acc_last(x), acc_stdevp(x), acc_varp(x), round(acc_var(x), 4) FROM t")[0].values[0]).toEqual([2, 9, 2, 4, 4.5714]);
    db.close();
  });
});

describe("Format", () => {
  it("benoemde datumnotaties (Nederlands)", () => {
    expect(formatteer("2026-10-26", "Short Date")).toBe("26-10-2026");
    expect(formatteer("2026-10-26", "Long Date")).toBe("maandag 26 oktober 2026");
    expect(formatteer("2026-10-26T14:05:09", "Short Time")).toBe("14:05");
    expect(formatteer("2026-10-26T14:05:09", "Long Time")).toBe("14:05:09");
    expect(formatteer("2026-10-26T14:05:09", "General Date")).toBe("26-10-2026 14:05:09");
  });
  it("eigen datumnotaties", () => {
    expect(formatteer("2026-10-26", "dd-mm-yyyy")).toBe("26-10-2026");
    expect(formatteer("2026-10-26", "yyyy-mm-dd")).toBe("2026-10-26");
    expect(formatteer("2026-10-26", "d mmmm yyyy")).toBe("26 oktober 2026");
    expect(formatteer("2026-10-26", "ddd d mmm yy")).toBe("ma 26 okt 26");
    expect(formatteer("2026-10-26T09:07:00", "hh:nn")).toBe("09:07");
    expect(formatteer("2026-10-26T09:07:00", "h:mm")).toBe("9:07");
    expect(formatteer("2026-10-26T15:07:00", "hh:nn AM/PM")).toBe("03:07 PM");
    expect(formatteer("2026-10-26", "q")).toBe("4");
    expect(formatteer("2026-10-26", "yyyy\\-mm")).toBe("2026-10");
  });
  it("getalnotaties", () => {
    expect(formatteer(1234.5, "#,##0.00")).toBe("1.234,50");
    expect(formatteer(1234.5, "0")).toBe("1234");
    expect(formatteer(0.125, "0.0%")).toBe("12,5%");
    expect(formatteer(1234.5, "Currency")).toBe("€ 1.234,50");
    expect(formatteer(-1234.5, "Currency")).toBe("€ -1.234,50");
    expect(formatteer(1234.5, "Fixed")).toBe("1234,50");
    expect(formatteer(1234.5, "Standard")).toBe("1.234,50");
    expect(formatteer(0.5, "Percent")).toBe("50,00%");
    expect(formatteer(5, "000")).toBe("005");
    expect(formatteer(-5, "0;(0)")).toBe("(5)");
    expect(formatteer(0, '0;-0;"nul"')).toBe("nul");
    expect(formatteer(12345, "0.00E+00")).toBe("1,23E+04");
    expect(formatteer(1, "Yes/No")).toBe("Ja");
    expect(formatteer(0, "True/False")).toBe("Onwaar");
  });
  it("tekstnotaties", () => {
    expect(formatteer("abc", ">")).toBe("ABC");
    expect(formatteer("ABC", "<")).toBe("abc");
    expect(formatteer(null, "0.00")).toBe("");
  });
});
