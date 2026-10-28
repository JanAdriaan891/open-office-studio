/**
 * Doorgaan zonder ontbrekende onderdelen: in elke modus (stoppen, fout,
 * overslaan) wordt het afgeschermde onderdeel NIET uitgevoerd en blijft de
 * werkkopie ongewijzigd; alleen het gedrag na de weigering verschilt.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { OntbrekendModus } from "./extern-typen.ts";
import { VbaAfbreking } from "./fouten.ts";
import { VbaRuntime } from "./interpreter.ts";
import { maakNepWerkkopie } from "./nepwerkkopie.ts";

/** [naam, regel, foutnummer in modus fout, argumentuitvoer mag in modus overslaan] */
const GEVALLEN: [string, string, number, boolean?][] = [
  ["Shell", 'Shell Pad("calc.exe"), vbNormalFocus', 5],
  ["VBA.Shell", 'x = VBA.Shell(Pad("cmd.exe /c del *.*"))', 5],
  ["Kill", 'Kill Pad("C:\\data\\*.mdb")', 75],
  ["FileCopy", 'FileCopy Pad("a.mdb"), "b.mdb"', 75],
  ["FileLen", 'x = FileLen(Pad("a.mdb"))', 53],
  ["Open … For", 'Open Pad("C:\\x.txt") For Output As #1', 75],
  ["Print #", 'Print #1, Pad("tekst")', 52],
  ["Close #", "Close #1", 52],
  ["Dir", 'x = Dir(Pad("C:\\*.*"))', 75],
  ["MkDir", 'MkDir Pad("C:\\nieuw")', 75],
  ["CreateObject", 'Set o = CreateObject(Pad("Scripting.FileSystemObject"))', 429],
  ["GetObject", 'Set o = GetObject(Pad("winmgmts:"))', 429],
  ["Declare (Win32-API)", "x = GetTickCount()", 453],
  ["SendKeys", 'SendKeys Pad("%{F4}"), True', 70],
  ["Environ", 'x = Environ(Pad("USERNAME"))', 70],
  ["CurrentProject.Path", 'x = CurrentProject.Path & Pad("\\\\export.csv")', 75, true],
  ["Application.FollowHyperlink", 'Application.FollowHyperlink Pad("https://voorbeeld.nl")', 490],
  ["DoCmd.TransferText", 'DoCmd.TransferText acExportDelim, , "Klanten", Pad("C:\\klanten.csv")', 2302],
  ["DoCmd.OutputTo", 'DoCmd.OutputTo acOutputTable, "Klanten", acFormatPDF, Pad("C:\\k.pdf")', 2302],
  ["DoCmd.SendObject", 'DoCmd.SendObject acSendTable, "Klanten", , Pad("a@b.nl")', 2293],
  ["SaveSetting (register)", 'SaveSetting "App", "Sectie", "Sleutel", Pad("x")', 70],
  ["AddressOf", "x = Terugroep(AddressOf Test)", 453],
  ["CurrentDb.Name (pad)", "x = CurrentDb.Name", 75],
  ["OpenDatabase", 'Set o = DBEngine.OpenDatabase(Pad("C:\\ander.mdb"))', 3024],
  ["CurrentProject.Connection (ADO)", "Set o = CurrentProject.Connection", 429],
];

let werkkopie: Awaited<ReturnType<typeof maakNepWerkkopie>>;
beforeEach(async () => {
  werkkopie = await maakNepWerkkopie("CREATE TABLE Klanten (ID INTEGER PRIMARY KEY, Naam TEXT); INSERT INTO Klanten VALUES (1, 'A');");
});

function module(regel: string, metFoutafhandeling: boolean) {
  return `Option Compare Database
Private Declare Function GetTickCount Lib "kernel32" () As Long
Function Pad(s)
  Debug.Print "argument"
  Pad = s
End Function
Function Terugroep(x)
End Function
Sub Test()
  Dim x, o, s
  ${metFoutafhandeling ? "On Error Resume Next" : ""}
  Debug.Print "voor"
  ${regel}
  Debug.Print "na"; Err.Number
End Sub`;
}

async function draai(regel: string, modus: OntbrekendModus, metFoutafhandeling = true) {
  const uitvoer: string[] = [];
  const rt = new VbaRuntime({ werkkopie, host: { debugPrint: (t) => uitvoer.push(t) }, ontbrekend: modus });
  expect(rt.laad([{ naam: "Module1", soort: "module", bron: module(regel, metFoutafhandeling) }])).toEqual([]);
  let fout: unknown;
  try {
    await rt.voerUit("Module1", "Test");
  } catch (e) {
    fout = e;
  }
  return { uitvoer, fout, rt };
}

async function geenBijwerking() {
  expect(await werkkopie.gewijzigd()).toBe(false);
  expect((await werkkopie.query("SELECT COUNT(*) FROM Klanten")).rijen[0][0]).toBe(1);
}

describe("ontbrekende onderdelen: afscherming gelijk in elke modus", () => {
  it.each(GEVALLEN)("stoppen: %s stopt zonder bijwerking", async (_n, regel) => {
    const { uitvoer, fout } = await draai(regel, "stoppen");
    expect(fout).toBeInstanceOf(VbaAfbreking);
    expect((fout as VbaAfbreking).reden).toBe("afgeschermd");
    expect(uitvoer).toEqual(["voor"]);
    await geenBijwerking();
  });

  it.each(GEVALLEN)("fout: %s geeft een vangbare VBA-fout zonder bijwerking", async (_n, regel, nummer) => {
    const { uitvoer, fout } = await draai(regel, "fout");
    expect(fout).toBeUndefined();
    expect(uitvoer).toEqual(["voor", `na ${nummer} `]);
    await geenBijwerking();
  });

  it.each(GEVALLEN)("fout: %s zonder On Error stopt met het VBA-foutnummer", async (_n, regel, nummer) => {
    const { uitvoer, fout } = await draai(regel, "fout", false);
    expect(fout).toMatchObject({ nummer });
    expect(uitvoer).toEqual(["voor"]);
    await geenBijwerking();
  });

  it.each(GEVALLEN)("overslaan: %s wordt overgeslagen en geregistreerd zonder bijwerking", async (_n, regel, _nr, argumentMag) => {
    const { uitvoer, fout, rt } = await draai(regel, "overslaan", false);
    expect(fout).toBeUndefined();
    expect(uitvoer).toEqual(argumentMag ? ["voor", "argument", "na 0 "] : ["voor", "na 0 "]);
    expect(rt.overgeslagen.length).toBeGreaterThan(0);
    expect(rt.overgeslagen[0]).toMatchObject({ module: "Module1", procedure: "Test", regel: 13 });
    expect(rt.overgeslagen[0].melding).toMatch(/^overgeslagen: .+, Module1\/13$/);
    await geenBijwerking();
  });
});

describe("modus overslaan", () => {
  it("vervangt een niet te maken object door een plaatsvervanger die alles overslaat", async () => {
    const rt = new VbaRuntime({ ontbrekend: "overslaan" });
    rt.laad([
      {
        naam: "M",
        soort: "module",
        bron: `Sub Test()
  Dim xl As Object, wb As Object, n As Long, s As String
  Set xl = CreateObject("Excel.Application")
  xl.Visible = True
  Set wb = xl.Workbooks.Add
  wb.Sheets(1).Range("A1").Value = 5
  n = wb.Sheets.Count
  s = xl.Name
  For Each x In wb.Sheets
    Debug.Print "nooit"
  Next
  xl.Quit
  Debug.Print "klaar"; n; "[" & s & "]"; TypeName(xl) <> ""
End Sub`,
      },
    ]);
    const u = await rt.voerUit("M", "Test");
    expect(u.uitvoer).toEqual(["klaar 0 []Waar"]);
    expect(u.overgeslagen.map((o) => `${o.categorie}:${o.wat}`)).toContain("com:CreateObject");
    expect(u.overgeslagen.some((o) => o.categorie === "vervolg" && /workbooks/i.test(o.wat))).toBe(true);
  });

  it("New van een onbekende bibliotheek, Dir-lus, Declare en onbekende functies lopen door", async () => {
    const rt = new VbaRuntime({ ontbrekend: "overslaan" });
    rt.laad([
      {
        naam: "M",
        soort: "module",
        bron: `Option Explicit
Private Declare PtrSafe Function GetUserName Lib "advapi32.dll" Alias "GetUserNameA" (ByVal b As String, n As Long) As Long
Sub Test()
  Dim ol As New Outlook.Application, f As String, n As Long, r As Long
  ol.CreateItem(0).Send
  f = Dir("C:\\*.txt")
  Do While f <> ""
    n = n + 1
    f = Dir
  Loop
  r = GetUserName("", 0)
  n = n + 7 + WorksheetFunctie(3)
  Debug.Print n; r; xlUp
End Sub`,
      },
    ]);
    const u = await rt.voerUit("M", "Test");
    expect(u.uitvoer).toEqual([" 7  0 "]);
    const wat = u.overgeslagen.map((o) => o.wat);
    expect(wat).toEqual(expect.arrayContaining(["New Outlook.Application", "Dir", "Declare GetUserName", "WorksheetFunctie", "xlUp"]));
  });

  it("slaat een fout 91 na iets overgeslagens over, maar niet zonder voorafgaande overslag", async () => {
    const bron = `Function Haal() As Object
  Set Haal = Nothing
End Function
Sub Test()
  Dim o As Object, s
  s = Environ("TEMP")
  Set o = Haal()
  o.Doe
  Debug.Print "door"
End Sub
Sub Zonder()
  Dim o As Object
  o.Doe
End Sub`;
    const rt = new VbaRuntime({ ontbrekend: "overslaan" });
    rt.laad([{ naam: "M", soort: "module", bron }]);
    const u = await rt.voerUit("M", "Test");
    expect(u.uitvoer).toEqual(["door"]);
    expect(u.overgeslagen.map((o) => o.categorie)).toEqual(["omgeving", "vervolgfout"]);
    await expect(rt.voerUit("M", "Zonder")).rejects.toMatchObject({ nummer: 91 });
  });

  it("laat een bestaande foutafhandeling van de aanroeper de fout 91 afhandelen", async () => {
    const rt = new VbaRuntime({ ontbrekend: "overslaan" });
    rt.laad([
      {
        naam: "M",
        soort: "module",
        bron: `Sub Binnen()
  Dim o As Object
  x = Environ("A")
  o.Doe
End Sub
Sub Test()
  On Error GoTo F
  Binnen
  Exit Sub
F:
  Debug.Print "afgehandeld"; Err.Number
End Sub`,
      },
    ]);
    expect((await rt.voerUit("M", "Test")).uitvoer).toEqual(["afgehandeld 91 "]);
  });
});

describe("modus fout", () => {
  it("bestaande On Error-afhandeling vangt CreateObject (429) en Declare (453)", async () => {
    const rt = new VbaRuntime({ ontbrekend: "fout" });
    rt.laad([
      {
        naam: "M",
        soort: "module",
        bron: `Private Declare Function GetTickCount Lib "kernel32" () As Long
Function Test()
  On Error GoTo Geen
  Dim xl As Object
  Set xl = CreateObject("Excel.Application")
  Test = "excel"
  Exit Function
Geen:
  Test = "geen excel: " & Err.Number & " / " & Tik()
End Function
Function Tik()
  On Error Resume Next
  Tik = GetTickCount()
  Tik = Err.Number
End Function`,
      },
    ]);
    expect((await rt.voerUit("M", "Test")).resultaat).toBe("geen excel: 429 / 453");
  });

  it("de modus per uitvoering gaat voor de standaardmodus", async () => {
    const rt = new VbaRuntime({ ontbrekend: "stoppen" });
    rt.laad([{ naam: "M", soort: "module", bron: 'Sub Test()\nKill "x"\nDebug.Print "na"\nEnd Sub' }]);
    await expect(rt.voerUit("M", "Test")).rejects.toBeInstanceOf(VbaAfbreking);
    expect((await rt.voerUit("M", "Test", [], { ontbrekend: "overslaan" })).uitvoer).toEqual(["na"]);
    await expect(rt.voerUit("M", "Test", [], { ontbrekend: "fout" })).rejects.toMatchObject({ nummer: 75 });
  });
});

describe("CreateObject(\"Scripting.Dictionary\")", () => {
  it("wordt in-proces nagebootst in elke modus; een dynamische ProgID blijft afgeschermd", async () => {
    const bron = `Function Test()
  Dim d As Object
  Set d = CreateObject("Scripting.Dictionary")
  d("a") = 1
  d.Add "b", 2
  Test = d.Count & "/" & TypeName(d)
End Function
Function Dynamisch()
  Set d = CreateObject("Scripting." & "Dictionary")
End Function`;
    for (const modus of ["stoppen", "fout", "overslaan"] as const) {
      const rt = new VbaRuntime({ ontbrekend: modus });
      rt.laad([{ naam: "M", soort: "module", bron }]);
      expect((await rt.voerUit("M", "Test")).resultaat).toBe("2/Dictionary");
    }
    const rt = new VbaRuntime({});
    rt.laad([{ naam: "M", soort: "module", bron }]);
    await expect(rt.voerUit("M", "Dynamisch")).rejects.toMatchObject({ reden: "afgeschermd" });
  });
});

describe("reparaties uit de uitvoerproef", () => {
  it("Database.Properties en CreateProperty (in het geheugen), met fout 3270 voor een onbekende eigenschap", async () => {
    const w = await maakNepWerkkopie("CREATE TABLE T (ID INTEGER PRIMARY KEY);");
    const rt = new VbaRuntime({ werkkopie: w });
    rt.laad([
      {
        naam: "M",
        soort: "module",
        bron: `Function Test()
  Dim db As DAO.Database, prp As DAO.Property
  Set db = CurrentDb
  On Error GoTo Maak
  db.Properties("AllowBypassKey") = False
  Test = db.Properties("AllowBypassKey").Value & "/" & db.Properties.Count
  Exit Function
Maak:
  If Err.Number = 3270 Then
    Set prp = db.CreateProperty("AllowBypassKey", dbBoolean, True)
    db.Properties.Append prp
    Resume
  End If
  Test = "fout " & Err.Number
End Function`,
      },
    ]);
    expect((await rt.voerUit("M", "Test")).resultaat).toBe("Onwaar/1");
  });

  it("zonder formulierhost: Forms!x geeft fout 2450 buiten formuliermodules; Forms/AllForms zijn leeg te doorlopen", async () => {
    const w = await maakNepWerkkopie("CREATE TABLE T (ID INTEGER PRIMARY KEY);");
    const rt = new VbaRuntime({ werkkopie: w });
    rt.laad([
      {
        naam: "M",
        soort: "module",
        bron: `Function Test()
  Dim f, n As Long, s As String
  On Error Resume Next
  s = Forms!frmStart!txtNaam
  n = Err.Number
  On Error GoTo 0
  For Each f In Forms
    n = n + 1000
  Next
  For Each f In CurrentProject.AllForms
    n = n + 1000
  Next
  Test = n & "/" & Forms.Count & "/" & CurrentProject.AllForms.Count & "/" & SysCmd(acSysCmdRuntime)
  Application.SetOption "Confirm Action Queries", False
End Function`,
      },
    ]);
    expect((await rt.voerUit("M", "Test")).resultaat).toBe("2450/0/0/Onwaar");
  });

  it("VBE, Application.References en Application.FileDialog zijn afgeschermd en in de modus overslaan te omzeilen", async () => {
    const rt = new VbaRuntime({ ontbrekend: "overslaan" });
    rt.laad([
      {
        naam: "M",
        soort: "module",
        bron: `Function Test()
  Dim r, fd As Object
  Test = "[" & VBE.ActiveCodePane.CodeModule.Name & "]"
  For Each r In Application.References
    Test = Test & "x"
  Next
  Set fd = Application.FileDialog(3)
  If fd.Show Then Test = Test & "gekozen"
  Test = Test & SysCmd(acSysCmdAccessDir)
End Function`,
      },
    ]);
    const u = await rt.voerUit("M", "Test");
    expect(u.resultaat).toBe("[]");
    expect(u.overgeslagen.map((o) => o.wat)).toEqual(expect.arrayContaining(["Application.VBE", "Application.References", "Application.FileDialog", "SysCmd.AccessDir"]));
    const stop = new VbaRuntime({});
    stop.laad([{ naam: "M", soort: "module", bron: "Sub Test()\nDebug.Print VBE.ActiveCodePane.CodeModule.Name\nEnd Sub" }]);
    await expect(stop.voerUit("M", "Test")).rejects.toMatchObject({ reden: "afgeschermd" });
  });
});

describe("publieke Enums in klassenmodules", () => {
  it("zijn overal zichtbaar, ook als standaardwaarde van een parameter", async () => {
    const rt = new VbaRuntime({});
    rt.laad([
      { naam: "clsVerbinding", soort: "klasse", bron: "Option Explicit\nPublic Enum VerbindingSoort\n  Lokaal = 1\n  Server = 2\nEnd Enum\n" },
      {
        naam: "M",
        soort: "module",
        bron: `Function Kies(Optional s As VerbindingSoort = VerbindingSoort.Server) As Long
  Kies = s
End Function
Function Test()
  Test = Kies() & "/" & Kies(Lokaal)
End Function`,
      },
    ]);
    expect((await rt.voerUit("M", "Test")).resultaat).toBe("2/1");
  });
});

describe("DAO-foutnummers", () => {
  it("CREATE TABLE op een bestaande tabel geeft fout 3010", async () => {
    const { default: initSqlJs } = await import("sql.js");
    const { nieuweWerkkopie } = await import("../../database/src/werkkopie/werkkopie.ts");
    const w = nieuweWerkkopie(await initSqlJs(), "Proef");
    await w.maakTabel({ naam: "T", velden: [{ naam: "ID", soort: "geheel" }] });
    const rt = new VbaRuntime({ werkkopie: w });
    rt.laad([{ naam: "M", soort: "module", bron: 'Function Test()\nOn Error Resume Next\nCurrentDb.Execute "CREATE TABLE T (ID LONG)"\nTest = CStr(Err.Number)\nEnd Function' }]);
    expect((await rt.voerUit("M", "Test")).resultaat).toBe("3010");
  });
});
