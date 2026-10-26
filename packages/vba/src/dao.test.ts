import { beforeEach, describe, expect, it } from "vitest";
import { VbaAfbreking } from "./fouten.ts";
import type { FormulierDoel, FormulierHost, HostGebeurtenis, HostWaarde } from "./host.ts";
import { VbaRuntime, type ModuleBron } from "./interpreter.ts";
import { maakNepWerkkopie, rijenVan } from "./nepwerkkopie.ts";

const OPZET = `
CREATE TABLE Klanten (ID INTEGER PRIMARY KEY, Naam TEXT, Plaats TEXT, Saldo CURRENCY, Lid BOOLEAN, Sinds DATE);
INSERT INTO Klanten VALUES (1, 'Jansen', 'Utrecht', 100.5, 1, '2020-01-15');
INSERT INTO Klanten VALUES (2, 'de Vries', 'Delft', 20, 0, '2021-06-01');
INSERT INTO Klanten VALUES (3, 'Bakker', 'Utrecht', 0, 1, '2022-03-10');
INSERT INTO Klanten VALUES (4, 'Visser', 'Zwolle', 75.25, 0, NULL);
CREATE TABLE Log (ID INTEGER PRIMARY KEY, Tekst TEXT);
`;
const QUERYS = [
  { naam: "qryUtrecht", sql: 'SELECT Naam, Saldo FROM Klanten WHERE Plaats = "Utrecht" ORDER BY Naam', soort: "select" as const },
  { naam: "qryPerPlaats", sql: "SELECT Naam FROM Klanten WHERE Plaats = [WelkePlaats] ORDER BY Naam", soort: "select" as const },
  { naam: "qryVerhoog", sql: "UPDATE Klanten SET Saldo = Saldo + [Bedrag] WHERE Plaats = [Stad]", soort: "update" as const },
];

let werkkopie: Awaited<ReturnType<typeof maakNepWerkkopie>>;
beforeEach(async () => {
  werkkopie = await maakNepWerkkopie(OPZET, QUERYS);
});

async function voer(bron: string, opties: Partial<ConstructorParameters<typeof VbaRuntime>[0]> & { extra?: ModuleBron[]; proc?: string } = {}) {
  const rt = new VbaRuntime({ werkkopie, ...opties });
  const fouten = rt.laad([{ naam: "Module1", soort: "module", bron }, ...(opties.extra ?? [])]);
  if (fouten.length) throw fouten[0];
  return (await rt.voerUit("Module1", opties.proc ?? "Test")).uitvoer;
}

describe("DAO-recordsets", () => {
  it("leest een tabel met EOF/MoveNext, velden op naam en index", async () => {
    const uit = await voer(`Option Compare Database
Option Explicit
Sub Test()
  Dim db As DAO.Database, rs As DAO.Recordset, totaal As Currency
  Set db = CurrentDb
  Set rs = db.OpenRecordset("Klanten", dbOpenDynaset)
  Debug.Print rs.RecordCount; rs.Fields.Count; rs.Fields(1).Name
  Do While Not rs.EOF
    totaal = totaal + rs!Saldo
    rs.MoveNext
  Loop
  Debug.Print totaal
  rs.MoveFirst
  Debug.Print rs("Naam"); "|"; rs.Fields("Plaats").Value; "|"; rs![Lid]; "|"; TypeName(rs!Sinds.Value); "|"; Year(rs!Sinds)
  rs.MoveLast
  Debug.Print rs!Naam; IsNull(rs!Sinds)
  rs.Close
  Set rs = Nothing
End Sub`);
    expect(uit).toEqual([" 4  6 Naam", " 195,75 ", "Jansen|Utrecht|Waar|Date| 2020 ", "VisserWaar"]);
  });

  it("voegt toe, wijzigt en verwijdert via de recordset (rowid)", async () => {
    await voer(`Sub Test()
  Dim rs As Recordset
  Set rs = CurrentDb.OpenRecordset("Klanten")
  rs.AddNew
  rs!ID = 5
  rs!Naam = "Smit"
  rs!Sinds = #2/29/2024#
  rs!Lid = True
  rs.Update
  rs.FindFirst "Naam = 'de Vries'"
  rs.Edit
  rs!Plaats = "Leiden"
  rs.Update
  rs.FindFirst "ID = 4"
  rs.Delete
  rs.Close
End Sub`);
    expect(rijenVan(werkkopie.db, "SELECT ID, Naam, Plaats, Lid, Sinds FROM Klanten ORDER BY ID")).toEqual([
      [1, "Jansen", "Utrecht", 1, "2020-01-15"],
      [2, "de Vries", "Leiden", 0, "2021-06-01"],
      [3, "Bakker", "Utrecht", 1, "2022-03-10"],
      [5, "Smit", null, 1, "2024-02-29"],
    ]);
  });

  it("maakt een eenvoudige SELECT bijwerkbaar en houdt samengestelde SQL alleen-lezen", async () => {
    const uit = await voer(`Sub Test()
  Dim rs As DAO.Recordset
  Set rs = CurrentDb.OpenRecordset("SELECT * FROM Klanten WHERE Plaats = 'Utrecht' ORDER BY Naam")
  Debug.Print rs.RecordCount; rs!Naam; rs.Updatable
  rs.Edit
  rs!Saldo = rs!Saldo + 1
  rs.Update
  Set rs = CurrentDb.OpenRecordset("SELECT Plaats, Count(*) AS N FROM Klanten GROUP BY Plaats")
  Debug.Print rs.Updatable
  On Error Resume Next
  rs.Edit
  Debug.Print Err.Number
End Sub`);
    expect(uit).toEqual([" 2 BakkerWaar", "Onwaar", " 3027 "]);
    expect(rijenVan(werkkopie.db, "SELECT Saldo FROM Klanten WHERE ID = 3")).toEqual([[1]]);
  });

  it("FindFirst/FindNext/NoMatch, Bookmark en fout 3021", async () => {
    const uit = await voer(`Sub Test()
  Dim rs As Recordset, bm
  Set rs = CurrentDb.OpenRecordset("Klanten", dbOpenSnapshot)
  rs.FindFirst "[Plaats] = 'Utrecht' And Saldo > 50"
  Debug.Print rs.NoMatch; rs!Naam
  rs.FindFirst "Plaats Like 'Ut*'"
  rs.FindNext "Plaats Like 'Ut*'"
  Debug.Print rs!Naam
  bm = rs.Bookmark
  rs.FindNext "Plaats = 'Utrecht'"
  Debug.Print rs.NoMatch
  rs.Bookmark = bm
  Debug.Print rs!Naam
  rs.FindFirst "Sinds Is Null"
  Debug.Print rs!Naam
  rs.MoveLast
  rs.MoveNext
  Debug.Print rs.EOF
  On Error GoTo F
  Debug.Print rs!Naam
  Exit Sub
F:
  Debug.Print Err.Number; Err.Description
End Sub`);
    expect(uit).toEqual(["OnwaarJansen", "Bakker", "Waar", "Bakker", "Visser", "Waar", " 3021 Geen huidige record."]);
  });

  it("Execute, RecordsAffected, DoCmd.RunSQL en SetWarnings", async () => {
    const uit = await voer(`Sub Test()
  Dim db As Database
  Set db = CurrentDb
  db.Execute "UPDATE Klanten SET Saldo = 0 WHERE Plaats = 'Utrecht'", dbFailOnError
  Debug.Print db.RecordsAffected
  DoCmd.SetWarnings False
  DoCmd.RunSQL "INSERT INTO Log (Tekst) VALUES ('klaar')"
  DoCmd.SetWarnings True
  Debug.Print DCount("*", "Log")
  On Error Resume Next
  db.Execute "UPDATE Bestaatniet SET x = 1", dbFailOnError
  Debug.Print Err.Number > 0
End Sub`);
    expect(uit).toEqual([" 2 ", " 1 ", "Waar"]);
  });

  it("QueryDefs met parameters, OpenRecordset en Execute; fout 3061 zonder parameter", async () => {
    const uit = await voer(`Sub Test()
  Dim qd As DAO.QueryDef, rs As DAO.Recordset
  Set qd = CurrentDb.QueryDefs("qryPerPlaats")
  Debug.Print qd.Parameters.Count; qd.Parameters(0).Name
  qd.Parameters("WelkePlaats") = "Utrecht"
  Set rs = qd.OpenRecordset()
  Debug.Print rs.RecordCount; rs!Naam
  Set qd = CurrentDb.QueryDefs("qryVerhoog")
  qd!Bedrag = 10
  qd.Parameters("Stad").Value = "Delft"
  qd.Execute dbFailOnError
  Debug.Print qd.RecordsAffected; DLookup("Saldo", "Klanten", "ID = 2")
  Set rs = CurrentDb.OpenRecordset("qryUtrecht")
  Debug.Print rs.RecordCount
  On Error Resume Next
  Set rs = CurrentDb.OpenRecordset("qryPerPlaats")
  Debug.Print Err.Number
End Sub`);
    expect(uit).toEqual([" 1 WelkePlaats", " 2 Bakker", " 1  30 ", " 2 ", " 3061 "]);
  });

  it("TableDefs, For Each over velden en tijdelijke QueryDef", async () => {
    const uit = await voer(`Sub Test()
  Dim td As TableDef, f As Field, s As String, qd As QueryDef
  For Each td In CurrentDb.TableDefs
    s = s & td.Name & "(" & td.Fields.Count & ") "
  Next
  Debug.Print s
  s = ""
  For Each f In CurrentDb.TableDefs("Klanten").Fields
    s = s & f.Name & ":" & f.Type & " "
  Next
  Debug.Print s
  Set qd = CurrentDb.CreateQueryDef("", "SELECT Count(*) AS N FROM Klanten WHERE Saldo > [Grens]")
  qd.Parameters("Grens") = 50
  Debug.Print qd.OpenRecordset()!N
End Sub`);
    expect(uit).toEqual(["Klanten(6) Log(2) ", "ID:4 Naam:10 Plaats:10 Saldo:5 Lid:1 Sinds:8 ", " 2 "]);
  });

  it("domeinfuncties", async () => {
    const uit = await voer(`Sub Test()
  Debug.Print DCount("*", "Klanten"); DCount("Sinds", "Klanten"); DCount("*", "Klanten", "Plaats = 'Utrecht'")
  Debug.Print DSum("Saldo", "Klanten"); DMax("Saldo", "Klanten"); DMin("ID", "Klanten", "Lid = True")
  Debug.Print DLookup("Naam", "Klanten", "ID = 3"); IsNull(DLookup("Naam", "Klanten", "ID = 99"))
  Debug.Print DFirst("Naam", "Klanten"); DLast("Naam", "Klanten"); DAvg("ID", "Klanten")
End Sub`);
    expect(uit).toEqual([" 4  3  2 ", " 195,75  100,5  1 ", "BakkerWaar", "JansenVisser 2,5 "]);
  });

  it("weigert databasetoegang zonder werkkopie met een duidelijke melding", async () => {
    const rt = new VbaRuntime({});
    rt.laad([{ naam: "M", soort: "module", bron: "Sub Test()\nSet db = CurrentDb\nEnd Sub" }]);
    await expect(rt.voerUit("M", "Test")).rejects.toThrow(/geen database gekoppeld/);
  });

  it("transacties: BeginTrans/Rollback draait terug, CommitTrans bevestigt", async () => {
    const uit = await voer(`Sub Test()
  Dim ws As DAO.Workspace
  Set ws = DBEngine.Workspaces(0)
  ws.BeginTrans
  CurrentDb.Execute "DELETE FROM Klanten", dbFailOnError
  Debug.Print DCount("*", "Klanten")
  ws.Rollback
  Debug.Print DCount("*", "Klanten")
  DBEngine.BeginTrans
  CurrentDb.Execute "DELETE FROM Klanten WHERE ID = 4"
  DBEngine.CommitTrans
  Debug.Print DCount("*", "Klanten")
End Sub`);
    expect(uit).toEqual([" 0 ", " 4 ", " 3 "]);
  });

  it("CreateQueryDef met naam en QueryDef.SQL worden blijvend opgeslagen; QueryDefs.Delete verwijdert", async () => {
    const uit = await voer(`Sub Test()
  Dim qd As DAO.QueryDef
  Set qd = CurrentDb.CreateQueryDef("qryNieuw", "SELECT Naam FROM Klanten WHERE Lid = True ORDER BY Naam")
  Debug.Print CurrentDb.OpenRecordset("qryNieuw").RecordCount
  CurrentDb.QueryDefs("qryUtrecht").SQL = "SELECT Naam FROM Klanten WHERE Plaats = 'Zwolle'"
  Debug.Print CurrentDb.OpenRecordset("qryUtrecht")!Naam; CurrentDb.QueryDefs.Count
  CurrentDb.QueryDefs.Delete "qryNieuw"
  Debug.Print CurrentDb.QueryDefs.Count
End Sub`);
    expect(uit).toEqual([" 2 ", "Visser 4 ", " 3 "]);
    expect((await werkkopie.querys()).find((q) => q.naam === "qryUtrecht")?.sql).toMatch(/Zwolle/);
  });

  it("een query met parameters op één tabel is bijwerkbaar via QueryResultaat.bron", async () => {
    await voer(`Sub Test()
  Dim qd As DAO.QueryDef, rs As DAO.Recordset
  Set qd = CurrentDb.QueryDefs("qryPerPlaats")
  qd.Parameters("WelkePlaats") = "Delft"
  Set rs = qd.OpenRecordset(dbOpenDynaset)
  rs.Edit
  rs!Naam = "De Vries"
  rs.Update
End Sub`);
    expect(rijenVan(werkkopie.db, "SELECT Naam FROM Klanten WHERE ID = 2")).toEqual([["De Vries"]]);
  });
});

describe("DoCmd en formulieren via de host", () => {
  it("DoCmd.OpenForm zonder host geeft een concrete melding; met host een gebeurtenis", async () => {
    await expect(voer('Sub Test()\nDoCmd.OpenForm "frmKlant"\nEnd Sub')).rejects.toThrow(/DoCmd.OpenForm ‘frmKlant’.*geen host/);
    const gebeurtenissen: HostGebeurtenis[] = [];
    await voer(`Sub Test()
  DoCmd.OpenForm "frmKlant", acNormal, , "ID = " & 3, acFormEdit, acDialog
  DoCmd.OpenReport "rptOmzet", acViewPreview, WhereCondition:="Jaar = 2026"
  DoCmd.Close acForm, "frmKlant"
  DoCmd.Hourglass True
End Sub`, {
      host: { gebeurtenis: async (g) => void gebeurtenissen.push(g) },
    });
    expect(gebeurtenissen).toEqual([
      { soort: "OpenForm", args: ["frmKlant", 0, null, "ID = 3", 1, 3] },
      { soort: "OpenReport", args: ["rptOmzet", 2, null, "Jaar = 2026"] },
      { soort: "Close", args: [2, "frmKlant"] },
      { soort: "Hourglass", args: [true] },
    ]);
  });

  it("formuliermodule: Me!besturing, kale besturingsnamen, eigenschappen en gebeurtenisprocedures", async () => {
    const waarden = new Map<string, HostWaarde>([
      ["klanten.txtnaam.value", "Piet"],
      ["klanten.recordsource", "Klanten"],
      ["klanten.txtnaam.visible", true],
    ]);
    const aanroepen: string[] = [];
    // VBA is hoofdletterongevoelig: de host vergelijkt namen zonder op hoofdletters te letten.
    const sleutel = (d: FormulierDoel, e: string) => `${d.naam}.${d.besturing ? d.besturing + "." : ""}${e}`.toLowerCase();
    const formulieren: FormulierHost = {
      isGeopend: async (d) => d.naam === "Klanten",
      lees: async (d, e) => waarden.get(sleutel(d, e)) ?? null,
      zet: async (d, e, w) => void waarden.set(sleutel(d, e), w),
      roepAan: async (d, m) => (aanroepen.push(sleutel(d, m)), null),
      heeftBesturing: async (_d, n) => n.startsWith("txt") || n.startsWith("cmd"),
    };
    const formModule = `Option Compare Database
Option Explicit
Private teller As Long
Private Sub Form_Load()
  teller = teller + 1
  Me!txtNaam = UCase(Me!txtNaam) & teller
  Me.Caption = "Klant " & txtNaam
End Sub
Private Sub cmdVerberg_Click()
  txtNaam.Visible = False
  Me.txtNaam.SetFocus
  Requery
  Debug.Print Me.RecordSource; CurrentProject.AllForms("Klanten").IsLoaded; Forms!Klanten!txtNaam
End Sub`;
    const rt = new VbaRuntime({ werkkopie, formulieren });
    const f = rt.laad([{ naam: "Form_Klanten", soort: "formulier", bron: formModule }]);
    expect(f).toEqual([]);
    expect(rt.procedures().filter((p) => p.gebeurtenis).map((p) => p.naam)).toEqual(["Form_Load", "cmdVerberg_Click"]);
    await rt.voerUit("Form_Klanten", "Form_Load");
    const u = await rt.voerUit("Form_Klanten", "cmdVerberg_Click");
    expect(waarden.get("klanten.txtnaam.value")).toBe("PIET1");
    expect(waarden.get("klanten.caption")).toBe("Klant PIET1");
    expect(waarden.get("klanten.txtnaam.visible")).toBe(false);
    expect(aanroepen).toEqual(["klanten.txtnaam.setfocus", "klanten.requery"]);
    expect(u.uitvoer).toEqual(["KlantenWaarPIET1"]);
  });

  it("formuliermodule zonder formulierhost: duidelijke fout", async () => {
    const rt = new VbaRuntime({});
    rt.laad([{ naam: "Form_X", soort: "formulier", bron: "Private Sub Form_Load()\n  Me!txtA = 1\nEnd Sub" }]);
    await expect(rt.voerUit("Form_X", "Form_Load")).rejects.toThrow(/geen formulierhost/);
    await expect(rt.voerUit("Form_X", "Form_Load")).rejects.toBeInstanceOf(VbaAfbreking);
  });
});
