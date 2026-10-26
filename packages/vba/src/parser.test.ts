import { describe, expect, it } from "vitest";
import type { Expr, Statement } from "./ast.ts";
import { statements } from "./afscherming.ts";
import { VbaParseerFout } from "./fouten.ts";
import { lex } from "./lexer.ts";
import { parseerExpressie, parseerModule } from "./parser.ts";

/** Een standaardmodule zoals Access hem opslaat en exporteert. */
const STANDAARDMODULE = `Attribute VB_Name = "basHulp"
Option Compare Database
Option Explicit

#If VBA7 Then
  Private Declare PtrSafe Function GetTickCount Lib "kernel32" () As Long
#Else
  Private Declare Function GetTickCount Lib "kernel32" () As Long
#End If

Public Const APP_NAAM As String = "Facturatie"
Private Const BTW# = 0.21
Public Enum FactuurStatus
    fsConcept = 0
    fsVerzonden
    fsBetaald = 10
End Enum
Public Type Adres
    Straat As String * 40
    Postcode As String
    Huisnr As Integer
End Type
Global gGebruiker As String
Private mTeller&, mLijst() As Variant

'---------------------------------------------------------------
' Procedure : FactuurTotaal
' Doel      : berekent het totaal inclusief btw
'---------------------------------------------------------------
Public Function FactuurTotaal(ByVal lngFactuurID As Long, _
                              Optional ByVal blnInclBtw As Boolean = True) As Currency
On Error GoTo Err_FactuurTotaal
    Dim db As DAO.Database, rs As DAO.Recordset
    Dim strSQL As String: strSQL = "SELECT Bedrag FROM tblRegels " & _
        "WHERE FactuurID = " & lngFactuurID & " AND Datum >= #1/1/2026#"
    Set db = CurrentDb()
    Set rs = db.OpenRecordset(strSQL, dbOpenSnapshot)
    With rs
        Do Until .EOF
            FactuurTotaal = FactuurTotaal + Nz(!Bedrag, 0)
            .MoveNext
        Loop
        .Close
    End With
    If blnInclBtw Then FactuurTotaal = FactuurTotaal * (1 + BTW) Else Exit Function
Exit_FactuurTotaal:
    Set rs = Nothing: Set db = Nothing
    Exit Function
Err_FactuurTotaal:
    Select Case Err.Number
        Case 3021, 3022: Resume Next
        Case Is > 60000
            MsgBox "Fout " & Err.Number & ": " & Err.Description, vbCritical + vbOKOnly, APP_NAAM
        Case Else
            Resume Exit_FactuurTotaal
    End Select
End Function

Rem Oude stijl met regelnummers
Sub Oud()
10    Dim i%, s$
20    For i = 1 To 10 Step 2: s = s & Chr$(64 + i): Next i
30    If Len(s) > 3 And Not IsNull(s) Or s Like "A*" Then Debug.Print s; Tab(5); i,
40    Debug.Print Format$(Now(), "dd-mm-yyyy"), Erl
End Sub

Public Property Get Teller() As Long
    Teller = mTeller
End Property
Public Property Let Teller(ByVal n As Long)
    mTeller = n
End Property

Private Sub Diversen(ParamArray rest() As Variant)
    Dim x As Variant, k As New Collection
    ReDim Preserve mLijst(0 To UBound(rest))
    x = IIf(rest(0) Is Nothing, 1, 2) Mod 3 \\ 1 ^ 2
    x = &HFF And Not &O17 Or 5 Xor 3 Eqv 1 Imp 0
    Call DoCmd.OpenForm("frmKlant", , , "ID=" & x, acFormEdit, WindowMode:=acDialog)
    DoCmd.OpenForm FormName:="frmKlant", View:=acNormal
    Forms![frmKlant]![txtNaam].SetFocus
    [Forms]!frmKlant.Requery
    x = TypeOf k Is Collection
    While x < 10: x = x + 1: Wend
    Erase mLijst
End Sub
`;

/** Een formuliermodule (klassenmodule achter een formulier). */
const FORMULIERMODULE = `VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_frmKlant"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private WithEvents mKnop As CommandButton
Public Event Opgeslagen(ByVal id As Long)

Private Sub Form_Load()
    Me.Caption = "Klant: " & Nz(Me!Naam, "(nieuw)")
    If Me.NewRecord Then Me.txtPlaats.DefaultValue = """Utrecht"""
End Sub

Private Sub cmdOpslaan_Click()
On Error GoTo Fout
    If IsNull(Me.txtNaam) Then
        MsgBox "Vul een naam in.", vbExclamation
        Me.txtNaam.SetFocus
        Exit Sub
    ElseIf Len(Me.txtNaam & "") > 50 Then
        Err.Raise vbObjectError + 513, "frmKlant", "Naam te lang"
    End If
    If Me.Dirty Then Me.Dirty = False
    RaiseEvent Opgeslagen(Me!ID)
    DoCmd.Close acForm, Me.Name, acSaveNo
    Exit Sub
Fout:
    MsgBox Err.Description: Resume Next
End Sub

Private Sub txtPostcode_AfterUpdate()
    Me!txtPostcode = UCase$(Trim$(Me!txtPostcode))
End Sub
`;

function alle(body: Statement[]) {
  return [...statements(body)];
}

describe("lexer", () => {
  it("herkent regelvoortzetting, commentaar, datums, typetekens en haakjesnamen", () => {
    const t = lex('x = a _\n  & "b""c" \' commentaar\nd = #1/31/2026# + &HFF& + 1.5E3 + n% + rs![Mijn veld]');
    const soorten = t.map((x) => (x.soort === "naam" ? x.tekst : x.soort === "op" ? x.tekst : x.soort));
    expect(soorten).toEqual(["x", "=", "a", "&", "tekst", "eol", "d", "=", "datum", "+", "getal", "+", "getal", "+", "n", "+", "rs", "!", "Mijn veld", "eol", "eof"]);
    expect(t[4].tekst).toBe('b"c');
    expect(t[10].getal).toBe(255);
    expect(t[10].getalType).toBe("Long");
    expect(t[14].typeteken).toBe("%");
    expect(t[18].haak).toBe(true);
  });

  it("geeft regel en kolom van een lexfout", () => {
    expect(() => lex('x = "open\ny = 1', "M")).toThrow(/M, regel 1, kolom 5/);
  });
});

describe("parser", () => {
  it("parset een realistische standaardmodule zonder fouten", () => {
    const { module: m, fouten } = parseerModule(STANDAARDMODULE, "basHulp");
    expect(fouten.map((f) => f.message)).toEqual([]);
    expect(m.opties).toMatchObject({ expliciet: true, vergelijk: "database" });
    expect(m.declares.map((d) => d.naam)).toEqual(["GetTickCount"]); // alleen de actieve #If-tak
    expect(m.constanten.map((c) => c.naam)).toEqual(["APP_NAAM", "BTW"]);
    expect(m.enums[0].leden.map((l) => l.naam)).toEqual(["fsConcept", "fsVerzonden", "fsBetaald"]);
    expect(m.typen[0].velden.map((v) => v.naam)).toEqual(["Straat", "Postcode", "Huisnr"]);
    expect(m.variabelen.map((v) => [v.naam, v.type?.naam, v.publiek])).toEqual([
      ["gGebruiker", "String", true],
      ["mTeller", "Long", false],
      ["mLijst", "Variant", false],
    ]);
    expect(m.procedures.map((p) => `${p.soort}:${p.naam}`)).toEqual(["function:FactuurTotaal", "sub:Oud", "get:Teller", "let:Teller", "sub:Diversen"]);
    const ft = m.procedures[0];
    expect(ft.parameters.map((p) => [p.naam, p.byVal, p.optioneel])).toEqual([
      ["lngFactuurID", true, false],
      ["blnInclBtw", true, true],
    ]);
    const soorten = alle(ft.body).map((s) => s.k);
    expect(soorten).toContain("onerror");
    expect(soorten).toContain("with");
    expect(soorten).toContain("select");
    expect(soorten).toContain("resume");
    expect(soorten.filter((k) => k === "label")).toHaveLength(2);
    const oud = alle(m.procedures[1].body);
    expect(oud.filter((s) => s.k === "label").map((s) => (s as { naam: string }).naam)).toEqual(["10", "20", "30", "40"]);
    expect(oud.find((s) => s.k === "print")).toBeTruthy();
  });

  it("parset een formuliermodule met klassekop, WithEvents, Event en RaiseEvent", () => {
    const { module: m, fouten } = parseerModule(FORMULIERMODULE, "Form_frmKlant", "formulier");
    expect(fouten.map((f) => f.message)).toEqual([]);
    expect(m.variabelen[0]).toMatchObject({ naam: "mKnop", withEvents: true });
    expect(m.gebeurtenissen).toEqual(["Opgeslagen"]);
    expect(m.procedures.map((p) => p.naam)).toEqual(["Form_Load", "cmdOpslaan_Click", "txtPostcode_AfterUpdate"]);
    expect(alle(m.procedures[1].body).some((s) => s.k === "raiseevent")).toBe(true);
  });

  it("onderscheidt Foo (x) als argument van Foo(x) als aanroep, en benoemde argumenten", () => {
    const { module: m } = parseerModule('Sub T()\n  Foo (x), y\n  z = Bar(1)(2)\n  DoCmd.OpenForm "f", WhereCondition:="a=1"\nEnd Sub', "M");
    const [a, b, c] = m.procedures[0].body as Extract<Statement, { k: "call" | "let" }>[];
    expect(a).toMatchObject({ k: "call", args: [{ waarde: { k: "haakjes" } }, { waarde: { k: "id", naam: "y" } }] });
    expect(b).toMatchObject({ k: "let", waarde: { k: "aanroep", doel: { k: "aanroep" } } });
    expect(c).toMatchObject({ k: "call", args: [{ waarde: { k: "lit" } }, { naam: "WhereCondition" }] });
  });

  it("respecteert de voorrang van operatoren", () => {
    const toon = (e: Expr): string => {
      switch (e.k) {
        case "bin":
          return `(${toon(e.l)} ${e.op} ${toon(e.r)})`;
        case "un":
          return `(${e.op} ${toon(e.e)})`;
        case "lit":
          return "v" in e.w ? String(e.w.v) : e.w.t;
        case "id":
          return e.naam;
        default:
          return e.k;
      }
    };
    expect(toon(parseerExpressie("-2 ^ 2"))).toBe("(- (2 ^ 2))");
    expect(toon(parseerExpressie("a + b * c Mod d \\ e"))).toBe("(a + ((b * c) mod (d \\ e)))");
    expect(toon(parseerExpressie('a & b + c = "x" And Not d Or e'))).toBe("((((a & (b + c)) = x) and (not d)) or e)");
    expect(toon(parseerExpressie("x Is Nothing Or y Like z"))).toBe("((x is niets) or (y like z))");
  });

  it("enkelregelige If met Else, meerdere statements en GoTo naar een regelnummer", () => {
    const { module: m, fouten } = parseerModule("Sub T()\nIf a Then b = 1: c = 2 Else d = 3\nIf x Then 100\n100 End\nEnd Sub", "M");
    expect(fouten).toEqual([]);
    const s = m.procedures[0].body[0] as Extract<Statement, { k: "if" }>;
    expect(s.takken[0].body).toHaveLength(2);
    expect(s.anders).toHaveLength(1);
    expect((m.procedures[0].body[1] as Extract<Statement, { k: "if" }>).takken[0].body[0]).toMatchObject({ k: "goto", label: "100" });
  });

  it("meldt fouten met module, regel en kolom en herstelt op de volgende regel", () => {
    const bron = "Sub A()\n  x = (1 + \n  y = 2\nEnd Sub\nSub B()\n  If z Then\nEnd Sub\nSub C()\nEnd Sub";
    const { module: m, fouten } = parseerModule(bron, "Fouten");
    expect(fouten.length).toBeGreaterThanOrEqual(2);
    expect(fouten[0]).toBeInstanceOf(VbaParseerFout);
    expect(fouten[0].positie).toMatchObject({ module: "Fouten", regel: 2 });
    expect(fouten[0].message).toMatch(/^Fouten, regel 2, kolom \d+: /);
    expect(fouten.some((f) => /End If/.test(f.message))).toBe(true);
    expect(m.procedures.map((p) => p.naam)).toContain("C");
    expect(() => parseerModule(bron, "Fouten", "module", { herstel: false })).toThrow(VbaParseerFout);
  });

  it("parset bestands-I/O, maar markeert die als geweigerd", () => {
    const { module: m, fouten } = parseerModule('Sub T()\nOpen "x" For Input As #1\nLine Input #1, s\nClose #1\nEnd Sub', "M");
    expect(fouten).toEqual([]);
    expect(m.procedures[0].body.map((s) => s.k)).toEqual(["geweigerd", "geweigerd", "geweigerd"]);
  });

  it("voorwaardelijke compilatie met #Const en geneste #If", () => {
    const { module: m, fouten } = parseerModule(
      "#Const DEBUGMODUS = 1\n#If DEBUGMODUS = 1 And Not Mac Then\nSub A()\n#If Win64 Then\n  dit is geen VBA\n#Else\n  x = 1\n#End If\nEnd Sub\n#Else\nSub B()\nEnd Sub\n#End If",
      "M",
    );
    expect(fouten).toEqual([]);
    expect(m.procedures.map((p) => p.naam)).toEqual(["A"]);
  });

  it("functies die een matrix teruggeven en vaste-lengte-constanten", () => {
    const { module: m, fouten } = parseerModule('Function F() As String()\nEnd Function\nSub G()\nConst s As String * 8 = "x"\nEnd Sub', "M");
    expect(fouten).toEqual([]);
    expect(m.procedures[0].type).toMatchObject({ naam: "String", matrix: true });
  });
});
