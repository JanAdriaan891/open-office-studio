import { beforeEach, describe, expect, it } from "vitest";
import { scanAfscherming } from "./afscherming.ts";
import { VbaAfbreking } from "./fouten.ts";
import { VbaRuntime } from "./interpreter.ts";
import { maakNepWerkkopie } from "./nepwerkkopie.ts";
import { parseerModule } from "./parser.ts";

/**
 * Elke afgeschermde constructie wordt uitgevoerd tussen twee markeringen.
 * Verwacht: de uitvoering stopt met een VbaAfbreking (reden "afgeschermd"),
 * ook met On Error Resume Next; argumenten worden niet geëvalueerd (geen
 * "argument"-uitvoer); de code erna draait niet; de werkkopie is ongewijzigd.
 */
const GEVALLEN: [string, string][] = [
  ["Shell", 'Shell Pad("calc.exe"), vbNormalFocus'],
  ["VBA.Shell", 'x = VBA.Shell(Pad("cmd.exe /c del *.*"))'],
  ["Kill", 'Kill Pad("C:\\data\\*.mdb")'],
  ["FileCopy", 'FileCopy Pad("a.mdb"), "b.mdb"'],
  ["Open … For", 'Open Pad("C:\\x.txt") For Output As #1'],
  ["Print #", 'Print #1, Pad("tekst")'],
  ["Line Input #", "Line Input #1, s"],
  ["Close #", "Close #1"],
  ["Dir", 'x = Dir(Pad("C:\\*.*"))'],
  ["MkDir", 'MkDir Pad("C:\\nieuw")'],
  ["RmDir", 'RmDir Pad("C:\\oud")'],
  ["CreateObject", 'Set o = CreateObject(Pad("Scripting.FileSystemObject"))'],
  ["GetObject", 'Set o = GetObject(Pad("winmgmts:"))'],
  ["Declare (Win32-API)", "x = GetTickCount()"],
  ["SendKeys", 'SendKeys Pad("%{F4}"), True'],
  ["Environ", 'x = Environ(Pad("USERNAME"))'],
  ["CurrentProject.Path", "x = CurrentProject.Path & Pad(\"\\\\export.csv\")"],
  ["Application.FollowHyperlink", 'Application.FollowHyperlink Pad("https://voorbeeld.nl")'],
  ["DoCmd.TransferText", 'DoCmd.TransferText acExportDelim, , "Klanten", Pad("C:\\klanten.csv")'],
  ["DoCmd.TransferSpreadsheet", 'DoCmd.TransferSpreadsheet acExport, acSpreadsheetTypeExcel12Xml, "Klanten", Pad("C:\\k.xlsx")'],
  ["DoCmd.OutputTo", 'DoCmd.OutputTo acOutputTable, "Klanten", acFormatPDF, Pad("C:\\k.pdf")'],
  ["SaveSetting (register)", 'SaveSetting "App", "Sectie", "Sleutel", Pad("x")'],
  ["AddressOf", "x = Terugroep(AddressOf Test)"],
  ["CurrentDb.Name (pad)", "x = CurrentDb.Name"],
];

let werkkopie: Awaited<ReturnType<typeof maakNepWerkkopie>>;
beforeEach(async () => {
  werkkopie = await maakNepWerkkopie("CREATE TABLE Klanten (ID INTEGER PRIMARY KEY, Naam TEXT); INSERT INTO Klanten VALUES (1, 'A');");
});

function module(regel: string) {
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
  On Error Resume Next
  Debug.Print "voor"
  ${regel}
  Debug.Print "na"
  CurrentDb.Execute "DELETE FROM Klanten"
End Sub`;
}

describe("afscherming", () => {
  it.each(GEVALLEN)("weigert %s zonder bijwerking", async (_naam, regel) => {
    const uitvoer: string[] = [];
    const rt = new VbaRuntime({ werkkopie, host: { debugPrint: (t) => uitvoer.push(t) } });
    const fouten = rt.laad([{ naam: "Module1", soort: "module", bron: module(regel) }]);
    expect(fouten).toEqual([]);
    let fout: unknown;
    try {
      await rt.voerUit("Module1", "Test");
    } catch (e) {
      fout = e;
    }
    expect(fout).toBeInstanceOf(VbaAfbreking);
    expect((fout as VbaAfbreking).reden).toBe("afgeschermd");
    expect((fout as VbaAfbreking).message).toMatch(/afgeschermd/);
    expect(uitvoer).toEqual(["voor"]);
    expect(await werkkopie.gewijzigd()).toBe(false);
    expect((await werkkopie.query("SELECT COUNT(*) FROM Klanten")).rijen[0][0]).toBe(1);
  });

  it("de statische scan vindt elke afgeschermde constructie zonder iets uit te voeren", () => {
    for (const [naam, regel] of GEVALLEN) {
      const { module: m, fouten } = parseerModule(module(regel), "Module1");
      expect(fouten).toEqual([]);
      const gevonden = scanAfscherming(m).map((b) => b.naam);
      // "Declare" staat in elke testmodule; daarnaast moet de regel zelf gevonden worden.
      expect(gevonden.filter((n) => n !== "Declare").length, naam).toBeGreaterThan(0);
    }
  });

  it("geeft Nederlandstalige meldingen met de reden", async () => {
    const rt = new VbaRuntime({});
    rt.laad([{ naam: "M", soort: "module", bron: 'Sub Test()\nShell "notepad.exe"\nEnd Sub' }]);
    await expect(rt.voerUit("M", "Test")).rejects.toThrow("Shell is afgeschermd (starten van programma’s)");
  });

  it("een eigen procedure met dezelfde naam gaat voor (geen valse weigering)", async () => {
    const rt = new VbaRuntime({});
    rt.laad([{ naam: "M", soort: "module", bron: 'Function Dir(x)\nDir = "eigen " & x\nEnd Function\nFunction Test()\nTest = Dir("a")\nEnd Function' }]);
    expect((await rt.voerUit("M", "Test")).resultaat).toBe("eigen a");
  });
});
