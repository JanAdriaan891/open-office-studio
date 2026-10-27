import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { koppelWerkkopie, werkkopieViaPoort, type Poort } from "../../database/src/werkkopie/werkkopie-brug.ts";
import { nieuweWerkkopie } from "../../database/src/werkkopie/werkkopie.ts";
import { analyseerExtern, leesLibid } from "./extern.ts";
import { VbaClient, type WorkerAchtig } from "./vba-client.ts";
import { startVbaWorker, type WorkerPoort } from "./worker-kern.ts";

const HULP = `Option Compare Database
Option Explicit
Private Declare PtrSafe Function GetTickCount Lib "kernel32" () As Long
Private Declare Function GebruikerA Lib "advapi32.dll" Alias "GetUserNameA" (ByVal s As String, n As Long) As Long

Public Function Tik() As Long
  Tik = GetTickCount()
End Function

Public Function Veilig(x As Long) As Long
  Veilig = x * 2
End Function

Public Sub NaarExcel()
  Dim xl As Excel.Application
  Set xl = New Excel.Application
  xl.Workbooks.Add
End Sub

Public Sub Mail()
  Dim o As Object
  Set o = CreateObject("Outlook.Application")
End Sub

Public Sub MetFoutafhandeling()
  On Error Resume Next
  Kill "C:\\x.txt"
  Debug.Print Veilig(2)
End Sub

Public Sub Voorwaardelijk(Optional excel As Boolean)
  If excel Then NaarExcel
  Debug.Print Veilig(3)
End Sub

Public Sub Keten()
  Hulp2
End Sub

Private Sub Hulp2()
  Debug.Print Tik
End Sub

Public Function Puur() As Long
  Puur = Veilig(5) + DCount("*", "Klanten")
End Function

Public Sub Woordenboek()
  Dim d As Object
  Set d = CreateObject("Scripting.Dictionary")
  d("a") = 1
End Sub

Public Sub Ado()
  Dim rs As New ADODB.Recordset
  rs.Open "SELECT 1", CurrentProject.Connection, adOpenStatic
End Sub

Public Sub Gekoppeld()
  Debug.Print DCount("*", "tblExtern")
End Sub

Public Sub Klasse()
  Dim k As New clsTeller
  k.Verhoog
End Sub
`;

const KLASSE = `Option Explicit
Private n As Long
Public Sub Verhoog()
  n = n + 1
  Shell "notepad.exe"
End Sub`;

const MODULES = [
  { naam: "modHulp", soort: "module" as const, bron: HULP },
  { naam: "clsTeller", soort: "klasse" as const, bron: KLASSE },
];

describe("analyse van externe afhankelijkheden", () => {
  const a = analyseerExtern(MODULES, {
    verwijzingen: [
      { naam: "stdole", soort: "Geregistreerde bibliotheek", libid: "*\\G{00020430-0000-0000-C000-000000000046}#2.0#0#C:\\Windows\\System32\\stdole2.tlb#OLE Automation" },
      { naam: "DAO", soort: "Geregistreerde bibliotheek", libid: "*\\G{4AC9E1DA-5BAD-4AC7-86E3-24F4CDCECA28}#c.0#0#C:\\x\\ACEDAO.DLL#Microsoft Office 14.0 Access database engine Object Library" },
      { naam: "Excel", soort: "Geregistreerde bibliotheek", libid: "*\\G{00020813-0000-0000-C000-000000000046}#1.7#0#C:\\x\\EXCEL.EXE#Microsoft Excel 16.0 Object Library" },
      { naam: "Scripting", soort: "Geregistreerde bibliotheek", libid: "*\\G{420B2830-E718-11CF-893D-00A0C9054228}#1.0#0#C:\\x\\scrrun.dll#Microsoft Scripting Runtime" },
      { naam: "ADODB", soort: "Geregistreerde bibliotheek", guid: "{00000201-0000-0010-8000-00AA006D2EA4}" },
      { naam: "MijnBieb", soort: "Projectverwijzing", libid: "*\\CC:\\x\\bieb.mda" },
    ],
    gekoppeldeTabellen: [{ naam: "tblExtern", bron: "ODBC-koppeling" }],
  });
  const p = (naam: string) => a.procedures.find((x) => x.naam === naam)!;

  it("herkent verwijzingen met GUID, versie en status", () => {
    const v = Object.fromEntries(a.verwijzingen.map((x) => [x.naam, x]));
    expect(v.stdole).toMatchObject({ status: "ingebouwd", versie: "2.0", guid: "00020430-0000-0000-c000-000000000046" });
    expect(v.DAO).toMatchObject({ status: "ingebouwd", bibliotheek: "DAO" });
    expect(v.Excel).toMatchObject({ status: "ontbreekt", gebruiktDoor: ["modHulp.NaarExcel"] });
    expect(v.Scripting.status).toBe("deels");
    expect(v.ADODB).toMatchObject({ status: "ontbreekt", gebruiktDoor: ["modHulp.Ado"] });
    expect(v.MijnBieb).toMatchObject({ status: "ontbreekt", soort: "Projectverwijzing", pad: "C:\\x\\bieb.mda" });
    expect(leesLibid("*\\G{00020813-0000-0000-C000-000000000046}#1.7#0#C:\\x\\EXCEL.EXE#Excel")).toMatchObject({ versie: "1.7", omschrijving: "Excel" });
  });

  it("geeft per procedure een status met redenen en aanroepketen", () => {
    expect(p("Veilig").status).toBe("uitvoerbaar");
    expect(p("Puur").status).toBe("uitvoerbaar");
    expect(p("Woordenboek").status).toBe("uitvoerbaar");
    expect(p("Tik")).toMatchObject({ status: "niet", redenen: [{ soort: "declare", oorzaak: "Declare kernel32!GetTickCount" }] });
    expect(p("NaarExcel").status).toBe("niet");
    expect(p("NaarExcel").redenen.map((r) => r.bibliotheek)).toContain("Excel");
    expect(p("Mail").redenen[0]).toMatchObject({ soort: "createobject", bibliotheek: "Outlook", oorzaak: 'CreateObject("Outlook.Application")' });
    expect(p("MetFoutafhandeling")).toMatchObject({ status: "deels", foutafhandeling: true });
    expect(p("Voorwaardelijk").status).toBe("deels");
    expect(p("Keten")).toMatchObject({ status: "niet", roeptAan: ["modHulp.Hulp2"] });
    expect(p("Keten").redenen[0].keten).toEqual(["modHulp.Keten", "modHulp.Hulp2", "modHulp.Tik"]);
    expect(p("Ado").status).toBe("niet");
    expect(p("Gekoppeld").redenen[0]).toMatchObject({ soort: "gekoppelde-tabel", oorzaak: "gekoppelde tabel tblExtern" });
    expect(p("Klasse")).toMatchObject({ status: "niet", roeptAan: ["clsTeller.Verhoog"] });
    expect(p("Veilig").aangeroepenDoor).toEqual(expect.arrayContaining(["modHulp.MetFoutafhandeling", "modHulp.Voorwaardelijk", "modHulp.Puur"]));
    expect(a.gekoppeldeTabellen[0]).toMatchObject({ naam: "tblExtern", status: "ontbreekt", gebruiktDoor: ["modHulp.Gekoppeld"] });
    // Tik direct, Hulp2 en Keten via de aanroepgraaf
    expect(a.samenvatting.perOorzaak["Declare (Windows-API)"]).toBe(3);
  });

  it("bevat geen broncode of paden buiten de verwijzingen", () => {
    const tekst = JSON.stringify({ ...a, verwijzingen: [] });
    expect(tekst).not.toMatch(/notepad|C:\\\\x|SELECT 1/);
  });

  it("markeert modules met een syntaxisfout", () => {
    const b = analyseerExtern([{ naam: "Kapot", soort: "module", bron: "Sub X(\nEnd Sub" }]);
    expect(b.modulesMetParseerfout).toEqual(["Kapot"]);
  });
});

function nepWorker(): WorkerAchtig {
  const kanaal = new MessageChannel();
  const afbreken = new AbortController();
  startVbaWorker(
    kanaal.port2 as unknown as WorkerPoort,
    async (p) => {
      p.start();
      return werkkopieViaPoort(p as unknown as Poort);
    },
    { signaal: afbreken.signal },
  );
  kanaal.port2.start();
  kanaal.port1.start();
  return {
    postMessage: (m: unknown, t?: Transferable[]) => kanaal.port1.postMessage(m, t ?? []),
    addEventListener: ((type: string, f: (e: MessageEvent) => void) => {
      if (type === "message") kanaal.port1.addEventListener("message", f);
    }) as WorkerAchtig["addEventListener"],
    terminate: () => {
      afbreken.abort();
      kanaal.port1.close();
      kanaal.port2.close();
    },
  };
}

describe("VbaClient: analyseerExtern en voerUitWatWerkt", () => {
  it("voert uit wat werkt, legt elke uitvoering vast en draait de werkkopie terug", async () => {
    const SQL = await initSqlJs();
    const w = nieuweWerkkopie(SQL, "Proef");
    await w.maakTabel({ naam: "Klanten", velden: [{ naam: "ID", soort: "autonummer", primair: true }, { naam: "Naam", soort: "tekst" }] });
    await w.voegToe("Klanten", { Naam: "A" });
    const gebeurtenissen: string[] = [];
    const client = new VbaClient({
      maakWorker: nepWorker,
      werkkopiePoort: () => {
        const k = new MessageChannel();
        k.port1.start();
        koppelWerkkopie(w, k.port1 as unknown as Poort);
        return k.port2;
      },
      tijdslimiet: 300,
      stappenlimiet: 1_000_000,
      host: { msgBox: async () => 1, gebeurtenis: async (g) => void gebeurtenissen.push(g.soort) },
    });
    await client.laad([
      {
        naam: "modProef",
        soort: "module",
        bron: `Option Compare Database
Public Sub Leeg()
  CurrentDb.Execute "DELETE FROM Klanten"
  Debug.Print DCount("*", "Klanten")
End Sub
Public Function Tel() As Long
  Tel = DCount("*", "Klanten")
  DoCmd.OpenForm "frmKlant"
End Function
Public Sub Eindeloos()
  Do: DoEvents: Loop
End Sub
Public Sub Na()
  CurrentDb.Execute "INSERT INTO Klanten (Naam) VALUES ('B')"
  Debug.Print DCount("*", "Klanten")
End Sub
Public Sub Excel()
  Dim xl As Object
  On Error Resume Next
  Set xl = CreateObject("Excel.Application")
  xl.Visible = True
  Debug.Print "door"
End Sub
Public Sub MetParameter(x As Long)
End Sub
Private Sub Prive()
End Sub`,
      },
    ]);
    const analyse = await client.analyseerExtern();
    expect(analyse.procedures.find((p) => p.naam === "Excel")?.status).toBe("deels");
    const s = await client.voerUitWatWerkt({ ontbrekend: "overslaan", metDeels: true, analyse });
    const per = Object.fromEntries(s.uitvoeringen.map((u) => [u.procedure, u]));
    expect(s.kandidaten).toBe(5);
    expect(per.Leeg).toMatchObject({ status: "geslaagd", uitvoer: [" 0 "] });
    expect(per.Tel).toMatchObject({ status: "geslaagd", hostgebeurtenissen: [{ soort: "gebeurtenis", naam: "OpenForm", doel: "frmKlant" }] });
    expect(per.Eindeloos).toMatchObject({ status: "tijdslimiet", fout: { reden: "tijdslimiet" } });
    // Na de tijdslimiet: transactie opgeruimd, Leeg teruggedraaid → weer 1 + 1 = 2
    expect(per.Na).toMatchObject({ status: "geslaagd", uitvoer: [" 2 "] });
    expect(per.Excel).toMatchObject({ status: "geslaagd", uitvoer: ["door"] });
    expect(per.Excel.overgeslagen[0]).toMatchObject({ wat: "CreateObject", categorie: "com", module: "modProef", procedure: "Excel" });
    expect(s).toMatchObject({ geslaagd: 4, tijdslimiet: 1, teruggedraaid: true, metOvergeslagen: 1 });
    expect(s.nietUitgevoerd).toEqual(
      expect.arrayContaining([
        { module: "modProef", procedure: "MetParameter", reden: "heeft verplichte parameters" },
        { module: "modProef", procedure: "Prive", reden: "niet publiek" },
      ]),
    );
    expect(gebeurtenissen).toEqual(["OpenForm"]);
    expect((await w.query("SELECT COUNT(*) FROM Klanten")).rijen[0][0]).toBe(1);
    expect((await w.query("SELECT Naam FROM Klanten")).rijen).toEqual([["A"]]);
    client.sluit();
  });
});
