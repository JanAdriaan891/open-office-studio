/**
 * Integratieproef tegen de echte SQLite-werkkopie uit packages/database
 * (Access-SQL-vertaling, opgeslagen query’s, jaNee/valuta/datum-velden).
 */
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nieuweWerkkopie, type SqliteWerkkopie } from "../../database/src/werkkopie/werkkopie.ts";
import { VbaRuntime } from "./interpreter.ts";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

let w: SqliteWerkkopie;
beforeEach(async () => {
  w = nieuweWerkkopie(SQL, "Proef", [
    { naam: "qryDelft", sql: "SELECT Naam, Saldo FROM Klant WHERE Plaats = 'Delft' ORDER BY Naam;", soort: "select" },
    { naam: "qryPlaats", sql: "PARAMETERS [Welke plaats] Text(50);\nSELECT Naam FROM Klant WHERE Plaats = [Welke plaats] ORDER BY Naam;", soort: "select" },
    { naam: "qryVerhoog", sql: "PARAMETERS Factor Double;\nUPDATE Klant SET Saldo = Saldo * [Factor] WHERE Actief;", soort: "update" },
  ]);
  await w.maakTabel({
    naam: "Klant",
    velden: [
      { naam: "ID", soort: "autonummer", primair: true },
      { naam: "Naam", soort: "tekst", lengte: 50 },
      { naam: "Plaats", soort: "tekst", lengte: 50 },
      { naam: "Geboren", soort: "datum" },
      { naam: "Actief", soort: "jaNee" },
      { naam: "Saldo", soort: "valuta" },
    ],
  });
  for (const [Naam, Plaats, Geboren, Actief, Saldo] of [
    ["Anna", "Delft", "1980-05-01", true, 100],
    ["Bert", "Gouda", "1990-12-31", true, 50.5],
    ["Chris", "Delft", "2001-10-26", false, -20],
  ] as const)
    await w.voegToe("Klant", { Naam, Plaats, Geboren, Actief, Saldo });
});

async function voer(bron: string) {
  const rt = new VbaRuntime({ werkkopie: w });
  const f = rt.laad([{ naam: "M", soort: "module", bron }]);
  if (f.length) throw f[0];
  return (await rt.voerUit("M", "Test")).uitvoer;
}

describe("VBA tegen de echte werkkopie", () => {
  it("leest, bewerkt en telt met DAO en domeinfuncties", async () => {
    const uit = await voer(`Sub Test()
  Dim rs As DAO.Recordset, n As Long
  Set rs = CurrentDb.OpenRecordset("Klant")
  Do Until rs.EOF
    If rs!Actief Then n = n + 1
    rs.MoveNext
  Loop
  rs.MoveFirst
  Debug.Print n; rs.RecordCount; TypeName(rs!Geboren.Value)
  rs.Edit
  rs!Saldo = rs!Saldo + 1
  rs.Update
  rs.AddNew
  rs!Naam = "Dirk"
  rs!Geboren = DateSerial(2000, 2, 29)
  rs!Actief = True
  rs.Update
  Debug.Print DCount("*", "Klant"); DLookup("Saldo", "Klant", "Naam = 'Anna'"); Year(DLookup("Geboren", "Klant", "Naam = 'Dirk'"))
  Set rs = CurrentDb.OpenRecordset("SELECT * FROM Klant WHERE Plaats = 'Delft' ORDER BY Naam")
  Debug.Print rs.Updatable; rs!Naam
  rs.Edit
  rs!Plaats = "Leiden"
  rs.Update
  Debug.Print DCount("*", "Klant", "Plaats = 'Leiden'")
End Sub`);
    expect(uit).toEqual([" 2  3 Date", " 4  101  2000 ", "WaarAnna", " 1 "]);
  });

  it("opgeslagen query’s met parameters en actiequery’s", async () => {
    const uit = await voer(`Sub Test()
  Dim qd As DAO.QueryDef, rs As DAO.Recordset
  Set rs = CurrentDb.OpenRecordset("qryDelft")
  Debug.Print rs.RecordCount; rs!Naam
  Set qd = CurrentDb.QueryDefs("qryPlaats")
  qd.Parameters("Welke plaats") = "Gouda"
  Set rs = qd.OpenRecordset
  Debug.Print rs!Naam
  Set qd = CurrentDb.QueryDefs("qryVerhoog")
  qd!Factor = 2
  qd.Execute dbFailOnError
  Debug.Print qd.RecordsAffected; DSum("Saldo", "Klant")
  CurrentDb.Execute "DELETE FROM Klant WHERE Actief = False", dbFailOnError
  Debug.Print CurrentDb.RecordsAffected; DCount("*", "Klant")
End Sub`);
    expect(uit).toEqual([" 2 Anna", "Bert", " 2  281 ", " 1  2 "]);
  });

  it("parameterquery bijwerkbaar, transacties en blijvende querydefs", async () => {
    const uit = await voer(`Sub Test()
  Dim qd As DAO.QueryDef, rs As DAO.Recordset
  Set qd = CurrentDb.QueryDefs("qryPlaats")
  qd.Parameters("Welke plaats") = "Delft"
  Set rs = qd.OpenRecordset
  Debug.Print rs.Updatable; TypeName(rs.Fields(0).Value)
  rs.Edit
  rs!Naam = "Annie"
  rs.Update
  Set rs = CurrentDb.OpenRecordset("SELECT Naam, Geboren FROM Klant ORDER BY Geboren")
  Debug.Print TypeName(rs!Geboren.Value); rs.Updatable
  DBEngine.BeginTrans
  CurrentDb.Execute "DELETE FROM Klant", dbFailOnError
  Debug.Print DCount("*", "Klant")
  DBEngine.Rollback
  Debug.Print DCount("*", "Klant"); DLookup("Naam", "Klant", "Plaats = 'Delft' AND Saldo > 0")
  CurrentDb.CreateQueryDef "qryRijk", "SELECT Naam FROM Klant WHERE Saldo > 60"
  Debug.Print CurrentDb.OpenRecordset("qryRijk")!Naam
  CurrentDb.QueryDefs("qryRijk").SQL = "SELECT Naam FROM Klant WHERE Saldo < 0"
  Debug.Print CurrentDb.OpenRecordset("qryRijk")!Naam
  CurrentDb.QueryDefs.Delete "qryRijk"
End Sub`);
    expect(uit).toEqual(["WaarString", "DateWaar", " 0 ", " 3 Annie", "Annie", "Chris"]);
    expect((await w.querys()).map((q) => q.naam)).not.toContain("qryRijk");
  });
});
