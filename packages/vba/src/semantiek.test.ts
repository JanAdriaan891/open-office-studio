import { describe, expect, it } from "vitest";
import { VbaAfbreking, VbaFout } from "./fouten.ts";
import { ENGELS_VS } from "./land.ts";
import { draai, expr, print } from "./testhulp.ts";

describe("waarden en operatoren", () => {
  it("rekent met VBA-typen", async () => {
    expect(await expr("7 \\ 2")).toBe(3);
    expect(await expr("7 Mod 3")).toBe(1);
    expect(await expr("-7 Mod 3")).toBe(-1);
    expect(await expr("2 ^ 10")).toBe(1024);
    expect(await expr("-2 ^ 2")).toBe(-4);
    expect(await expr("10 / 4")).toBe(2.5);
    expect(await expr('"1" + 2')).toBe(3);
    expect(await expr('"1" + "2"')).toBe("12");
    expect(await expr('"a" & 1 & Null')).toBe("a1");
    expect(await expr("Null + 1")).toBe(null);
    expect(await expr("True + 1")).toBe(0);
    expect(await expr("5 And 3")).toBe(1);
    expect(await expr("Not 0")).toBe(-1);
    expect(await expr("Null And False")).toBe(false);
    expect(await expr("Null Or True")).toBe(true);
    expect(await expr('"abc" Like "a*"')).toBe(true);
    expect(await expr('"a1" Like "[a-c]#"')).toBe(true);
    expect(await expr('"x" Like "[!a-c]"')).toBe(true);
  });

  it("geeft fout 6 bij Integer-overloop, maar niet bij Variant", async () => {
    await expect(expr("200 * 200")).rejects.toMatchObject({ nummer: 6 });
    const { resultaat } = await draai("Function Test()\nDim a, b\na = 200: b = 200\nTest = a * b\nEnd Function");
    expect(resultaat).toBe(40000);
    await expect(draai("Sub Test()\nDim i As Integer\ni = 32767\ni = i + 1\nEnd Sub")).rejects.toMatchObject({ nummer: 6 });
  });

  it("geeft fout 11 bij deling door nul en fout 13 bij typen", async () => {
    await expect(expr("1 / 0")).rejects.toMatchObject({ nummer: 11 });
    await expect(expr("5 \\ 0")).rejects.toMatchObject({ nummer: 11 });
    await expect(draai('Sub Test()\nDim i As Integer\ni = "abc"\nEnd Sub')).rejects.toMatchObject({ nummer: 13 });
    await expect(draai("Sub Test()\nDim s As String\ns = Null\nEnd Sub")).rejects.toMatchObject({ nummer: 94 });
  });

  it("vergelijkt tekst volgens Option Compare", async () => {
    expect(await expr('"abc" = "ABC"')).toBe(false);
    const r = await draai('Option Compare Database\nFunction Test()\nTest = ("abc" = "ABC")\nEnd Function');
    expect(r.resultaat).toBe(true);
    expect(await expr('StrComp("a", "B", vbTextCompare)')).toBe(-1);
  });

  it("kent Variant, Empty, Null en Nothing", async () => {
    const uit = await print(`Sub Test()
Dim v, o As Object
Debug.Print TypeName(v); IsEmpty(v)
v = Null
Debug.Print TypeName(v); IsNull(v)
Debug.Print TypeName(o); o Is Nothing
v = 1: Debug.Print TypeName(v)
v = 100000: Debug.Print TypeName(v)
v = 1.5: Debug.Print TypeName(v); VarType(v)
v = "x": Debug.Print TypeName(v)
v = #1/2/2026#: Debug.Print TypeName(v)
Debug.Print TypeName(5@), TypeName(CByte(5))
End Sub`);
    expect(uit).toEqual([
      "EmptyWaar",
      "NullWaar",
      "NothingWaar",
      "Integer",
      "Long",
      "Double 5 ",
      "String",
      "Date",
      "Currency      Byte",
    ]);
  });

  it("zet standaardwaarden per type", async () => {
    const uit = await print(`Sub Test()
Dim i As Integer, s As String, b As Boolean, d As Date, c As Currency, v As Variant, f As String * 3
Debug.Print i; "|"; s; "|"; b; "|"; d; "|"; c; "|"; IsEmpty(v); "|"; Len(f)
End Sub`);
    expect(uit).toEqual([" 0 ||Onwaar|0:00:00| 0 |Waar| 3 "]);
  });
});

describe("procedures en ByRef", () => {
  it("geeft argumenten standaard ByRef door en ByVal als kopie", async () => {
    const uit = await print(`Sub Verhoog(n As Long)
  n = n + 1
End Sub
Sub VerhoogKopie(ByVal n As Long)
  n = n + 1
End Sub
Sub Test()
  Dim x As Long
  x = 1
  Verhoog x
  Debug.Print x
  VerhoogKopie x
  Debug.Print x
  Verhoog (x)
  Debug.Print x
  Call Verhoog(x)
  Debug.Print x
End Sub`);
    expect(uit).toEqual([" 2 ", " 2 ", " 2 ", " 3 "]);
  });

  it("ondersteunt Optional, standaardwaarden, IsMissing, ParamArray en benoemde argumenten", async () => {
    const uit = await print(`Function Groet(naam As String, Optional titel As String = "heer", Optional extra) As String
  Groet = titel & " " & naam & IIf(IsMissing(extra), "", "!")
End Function
Function Som(ParamArray getallen()) As Long
  Dim g
  For Each g In getallen
    Som = Som + g
  Next
End Function
Sub Test()
  Debug.Print Groet("Jansen")
  Debug.Print Groet("Jansen", "mevrouw", True)
  Debug.Print Groet(titel:="dr.", naam:="Pieters")
  Debug.Print Som(1, 2, 3, 4)
End Sub`);
    expect(uit).toEqual(["heer Jansen", "mevrouw Jansen!", "dr. Pieters", " 10 "]);
  });

  it("ondersteunt recursie en Static", async () => {
    const uit = await print(`Function Fac(n As Long) As Double
  If n <= 1 Then Fac = 1 Else Fac = n * Fac(n - 1)
End Function
Function Teller() As Long
  Static t As Long
  t = t + 1
  Teller = t
End Function
Sub Test()
  Debug.Print Fac(10)
  Call Teller: Teller
  Debug.Print Teller()
End Sub`);
    expect(uit).toEqual([" 3628800 ", " 3 "]);
  });

  it("geeft fout 449 bij een ontbrekend verplicht argument", async () => {
    await expect(draai("Sub A(x)\nEnd Sub\nSub Test()\nA\nEnd Sub")).rejects.toMatchObject({ nummer: 449 });
  });
});

describe("controlestructuren", () => {
  it("Select Case met Is, To en lijsten", async () => {
    const uit = await print(`Function Soort(n)
  Select Case n
    Case 1, 2, 3: Soort = "klein"
    Case 4 To 9
      Soort = "middel"
    Case "x"
      Soort = "tekst"
    Case Is >= 10, -1
      Soort = "groot"
    Case Else
      Soort = "anders"
  End Select
End Function
Sub Test()
  Debug.Print Soort(2); " "; Soort(5); " "; Soort(12); " "; Soort(-1); " "; Soort("x"); " "; Soort(0)
End Sub`);
    expect(uit).toEqual(["klein middel groot groot tekst anders"]);
  });

  it("lussen: For/Step, For Each, Do While/Until, Loop Until, While/Wend, Exit", async () => {
    const uit = await print(`Sub Test()
  Dim i As Integer, s As String, n As Long
  For i = 10 To 1 Step -3: s = s & i & ",": Next i
  Debug.Print s
  n = 0
  Do While n < 5: n = n + 1: Loop
  Debug.Print n
  Do: n = n - 2: Loop Until n < 0
  Debug.Print n
  While n < 3
    n = n + 1
  Wend
  Debug.Print n
  For i = 1 To 100
    If i = 4 Then Exit For
  Next
  Debug.Print i
  Do
    n = n + 1
    If n > 6 Then Exit Do
  Loop
  Debug.Print n
End Sub`);
    expect(uit).toEqual(["10,7,4,1,", " 5 ", "-1 ", " 3 ", " 4 ", " 7 "]);
  });

  it("geneste For met Next i, j en With-blokken op een Type", async () => {
    const uit = await print(`Type Punt
  X As Long
  Y As Long
End Type
Sub Test()
  Dim i As Long, j As Long, t As Long, p As Punt
  For i = 1 To 3
    For j = 1 To 2
      t = t + i * j
  Next j, i
  With p
    .X = t
    .Y = .X * 2
  End With
  Debug.Print p.X; p.Y
End Sub`);
    expect(uit).toEqual([" 18  36 "]);
  });

  it("GoTo, labels en regelnummers", async () => {
    const uit = await print(`Sub Test()
  Dim n As Long
10 n = n + 1
  If n < 3 Then GoTo 10
  GoTo Klaar
  n = 100
Klaar:
  Debug.Print n
End Sub`);
    expect(uit).toEqual([" 3 "]);
  });

  it("stopt een oneindige lus met de stappenlimiet", async () => {
    const p = draai("Sub Test()\nDo\nLoop\nEnd Sub", "Test", { stappenlimiet: 10_000 });
    await expect(p).rejects.toBeInstanceOf(VbaAfbreking);
    await expect(p).rejects.toMatchObject({ reden: "stappenlimiet" });
  });

  it("stopt bij een annuleringssignaal", async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 20);
    await expect(draai("Sub Test()\nDim i As Long\nDo\ni = i + 1\nLoop\nEnd Sub", "Test", { signaal: ac.signal, stappenlimiet: 1e12 })).rejects.toMatchObject({
      reden: "geannuleerd",
    });
  });
});

describe("foutafhandeling", () => {
  it("On Error GoTo met Err.Number, Resume Next en Exit Sub", async () => {
    const uit = await print(`Sub Test()
  On Error GoTo Fout
  Dim x As Long
  x = 1 / 0
  Debug.Print "na fout"; x
  Exit Sub
Fout:
  Debug.Print Err.Number; Err.Description
  Resume Next
End Sub`);
    expect(uit).toEqual([" 11 Deling door nul", "na fout 0 "]);
  });

  it("On Error Resume Next en Err.Clear", async () => {
    const uit = await print(`Sub Test()
  On Error Resume Next
  Dim x
  x = CInt("abc")
  Debug.Print Err.Number
  Err.Clear
  Debug.Print Err.Number
  On Error GoTo 0
End Sub`);
    expect(uit).toEqual([" 13 ", " 0 "]);
  });

  it("Resume probeert opnieuw en Resume label springt", async () => {
    const uit = await print(`Sub Test()
  Dim n As Long, d As Long
  On Error GoTo Fout
  n = 10 / d
  Debug.Print n
  Err.Raise 1000, "Test", "Eigen fout"
  Debug.Print "niet bereikt"
Verder:
  Debug.Print "verder"
  Exit Sub
Fout:
  If Err.Number = 11 Then
    d = 2
    Resume
  End If
  Debug.Print Err.Number; Err.Source; Err.Description
  Resume Verder
End Sub`);
    expect(uit).toEqual([" 5 ", " 1000 TestEigen fout", "verder"]);
  });

  it("vangt fouten uit een aangeroepen procedure op in de aanroeper", async () => {
    const uit = await print(`Sub Diep()
  Err.Raise vbObjectError + 1, , "diep"
End Sub
Sub Test()
  On Error GoTo F
  Diep
  Debug.Print "terug"
  Exit Sub
F:
  Debug.Print Err.Number - vbObjectError; Err.Description
  Resume Next
End Sub`);
    expect(uit).toEqual([" 1 diep", "terug"]);
  });

  it("meldt een onafgevangen fout met module, procedure en regel", async () => {
    try {
      await draai("Sub Test()\n  Dim a\n  a = 1\n  a = a / 0\nEnd Sub");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(VbaFout);
      expect((e as VbaFout).positie).toMatchObject({ module: "Module1", procedure: "Test", regel: 4 });
    }
  });

  it("een fout in de handler gaat naar de aanroeper", async () => {
    await expect(draai("Sub Test()\nOn Error GoTo F\nx = 1/0\nExit Sub\nF:\nErr.Raise 5\nEnd Sub")).rejects.toMatchObject({ nummer: 5 });
  });
});

describe("matrices", () => {
  it("Dim, LBound/UBound, Option Base, ReDim Preserve en Erase", async () => {
    const uit = await print(`Option Base 1
Sub Test()
  Dim a(3) As Integer, b() As String, m(1 To 2, 0 To 4) As Long, i
  Debug.Print LBound(a); UBound(a)
  ReDim b(2)
  b(1) = "x": b(2) = "y"
  ReDim Preserve b(4)
  Debug.Print UBound(b); b(2); Len(b(4))
  m(2, 4) = 9
  Debug.Print UBound(m, 2); m(2, 4)
  Erase a
  Debug.Print a(1)
End Sub`);
    expect(uit).toEqual([" 1  3 ", " 4 y 0 ", " 4  9 ", " 0 "]);
  });

  it("fout 9 buiten het bereik; Split/Join/Array; matrices worden gekopieerd", async () => {
    await expect(draai("Sub Test()\nDim a(2)\na(3) = 1\nEnd Sub")).rejects.toMatchObject({ nummer: 9 });
    const uit = await print(`Sub Test()
  Dim d, e, k
  d = Split("a,b,c", ",")
  e = d
  e(0) = "z"
  Debug.Print Join(d, "-"); " "; Join(e, "-"); UBound(Split(""))
  k = Array(1, "twee", 3)
  Debug.Print k(1); UBound(k)
End Sub`);
    expect(uit).toEqual(["a-b-c z-b-c-1 ", "twee 2 "]);
  });

  it("geeft een matrix terug uit een functie (As String())", async () => {
    const uit = await print(`Function Lijst() As String()
  Dim t(1) As String
  t(0) = "a": t(1) = "b"
  Lijst = t
End Function
Sub Test()
  Dim r() As String
  r = Lijst()
  Debug.Print r(1); UBound(r)
End Sub`);
    expect(uit).toEqual(["b 1 "]);
  });
});

describe("bibliotheek", () => {
  it("tekstfuncties", async () => {
    expect(await expr('Left("Amsterdam", 3) & Right("Amsterdam", 3) & Mid("Amsterdam", 3, 2)')).toBe("Amsdamst");
    expect(await expr('InStr("Hallo wereld", "w")')).toBe(7);
    expect(await expr('InStr(3, "abcabc", "a")')).toBe(4);
    expect(await expr('InStr(1, "ABC", "b", vbTextCompare)')).toBe(2);
    expect(await expr('InStrRev("a.b.c", ".")')).toBe(4);
    expect(await expr('Replace("aXbXc", "X", "-")')).toBe("a-b-c");
    expect(await expr('Trim("  x  ") & "|" & LTrim(" y") & RTrim("z ")')).toBe("x|yz");
    expect(await expr('UCase("abc") & LCase("DEF")')).toBe("ABCdef");
    expect(await expr('Space(3) & String(3, "x") & String(2, 65)')).toBe("   xxxAA");
    expect(await expr('Chr(65) & Asc("a")')).toBe("A97");
    expect(await expr('StrConv("hallo wereld", vbProperCase)')).toBe("Hallo Wereld");
    expect(await expr("Len(Null)")).toBe(null);
    expect(await expr('Val("12.5abc")')).toBe(12.5);
    expect(await expr("Str(12.5)")).toBe(" 12.5");
    expect(await expr("CStr(12.5)")).toBe("12,5");
    expect(await expr("Hex(255) & Oct(8)")).toBe("FF10");
  });

  it("conversies en typetesten", async () => {
    expect(await expr('CDbl("1,5")')).toBe(1.5);
    expect(await expr("CInt(2.5) + CInt(3.5)")).toBe(6);
    expect(await expr("CLng(-2.5)")).toBe(-2);
    expect(await expr('CBool("Waar")')).toBe(true);
    expect(await expr('IsNumeric("12,5") And Not IsNumeric("abc")')).toBe(true);
    expect(await expr('IsDate("26-10-2026") And Not IsDate("x")')).toBe(true);
    expect(await expr("TypeName(Array())")).toBe("Variant()");
    expect(await expr("VarType(1&)")).toBe(3);
    expect(await expr('CCur("12,345678")')).toBe(12.3457);
    expect(await expr('CDbl("1.5")', { landinstelling: ENGELS_VS })).toBe(1.5);
  });

  it("wiskunde met bankiersafronding", async () => {
    expect(await expr("Round(2.5)")).toBe(2);
    expect(await expr("Round(3.5)")).toBe(4);
    expect(await expr("Round(-2.5)")).toBe(-2);
    expect(await expr("Round(2.345, 2)")).toBe(2.34);
    expect(await expr("Round(2.355, 2)")).toBe(2.36);
    expect(await expr("Round(1.005, 2)")).toBe(1);
    expect(await expr("Int(-2.5) & Fix(-2.5)")).toBe("-3-2");
    expect(await expr("Abs(-3) + Sgn(-5) + Sqr(16)")).toBe(6);
    expect(await expr("Round(Exp(1), 4)")).toBe(2.7183);
    expect(await expr("Round(Log(100) / Log(10), 6)")).toBe(2);
  });

  it("datums", async () => {
    expect(await expr("Year(#3/15/2026#) * 10000 + Month(#3/15/2026#) * 100 + Day(#3/15/2026#)")).toBe(20260315);
    expect(await expr("DateSerial(2026, 13, 1)")).toEqual({ datum: "2027-01-01" });
    expect(await expr("DateSerial(2026, 3, 0)")).toEqual({ datum: "2026-02-28" });
    expect(await expr('DateAdd("m", 1, #1/31/2026#)')).toEqual({ datum: "2026-02-28" });
    expect(await expr('DateAdd("d", -1, #1/1/2026#)')).toEqual({ datum: "2025-12-31" });
    expect(await expr('DateAdd("h", 25, #1/1/2026#)')).toEqual({ datum: "2026-01-02T01:00:00" });
    expect(await expr('DateDiff("d", #1/1/2026#, #3/1/2026#)')).toBe(59);
    expect(await expr('DateDiff("m", #12/31/2025#, #1/1/2026#)')).toBe(1);
    expect(await expr('DateDiff("yyyy", #12/31/2025#, #1/1/2026#)')).toBe(1);
    expect(await expr('DatePart("q", #8/1/2026#)')).toBe(3);
    expect(await expr('DatePart("ww", #1/1/2026#, vbMonday, vbFirstFourDays)')).toBe(1);
    expect(await expr('DatePart("ww", #12/31/2026#, vbMonday, vbFirstFourDays)')).toBe(53);
    expect(await expr("Weekday(#10/26/2026#)")).toBe(2);
    expect(await expr("Weekday(#10/26/2026#, vbMonday)")).toBe(1);
    expect(await expr("MonthName(10) & WeekdayName(2)")).toBe("oktobermaandag");
    expect(await expr("Now()")).toEqual({ datum: "2026-10-26T14:30:15" });
    expect(await expr("Date")).toEqual({ datum: "2026-10-26" });
    expect(await expr("Hour(Time) * 100 + Minute(Time)")).toBe(1430);
    expect(await expr('CDate("26-10-2026")')).toEqual({ datum: "2026-10-26" });
    expect(await expr('DateValue("13-1-2026")')).toEqual({ datum: "2026-01-13" });
    expect(await expr("TimeSerial(14, 30, 0)")).toEqual({ datum: "1899-12-30T14:30:00" });
    expect(await expr("CStr(#10/26/2026 2:30:00 PM#)")).toBe("26-10-2026 14:30:00");
    expect(await expr("#10/26/2026# - #10/20/2026#")).toBe(6);
  });

  it("Format met gangbare notaties", async () => {
    expect(await expr('Format(1234.567, "#,##0.00")')).toBe("1.234,57");
    expect(await expr('Format(0.5, "0%")')).toBe("50%");
    expect(await expr('Format(2.5, "0")')).toBe("3");
    expect(await expr('Format(-3, "0;(0)")')).toBe("(3)");
    expect(await expr('Format(0, "0.0;-0.0;nul")')).toBe("nul");
    expect(await expr('Format(7, "000")')).toBe("007");
    expect(await expr('Format(1234.5, "Currency")')).toBe("€ 1.234,50");
    expect(await expr('Format(1234.5, "Standard")')).toBe("1.234,50");
    expect(await expr('Format(0.256, "Percent")')).toBe("25,60%");
    expect(await expr('Format(12345, "0.00E+00")')).toBe("1,23E+04");
    expect(await expr('Format(#10/26/2026 14:05:09#, "dd-mm-yyyy hh:nn:ss")')).toBe("26-10-2026 14:05:09");
    expect(await expr('Format(#10/26/2026#, "dddd d mmmm yyyy")')).toBe("maandag 26 oktober 2026");
    expect(await expr('Format(#10/26/2026#, "yyyymmdd")')).toBe("20261026");
    expect(await expr('Format(#10/26/2026#, "mm/dd/yyyy")')).toBe("10-26-2026");
    expect(await expr('Format(#10/26/2026#, "Long Date")')).toBe("maandag 26 oktober 2026");
    expect(await expr('Format(#10/26/2026#, "Short Date")')).toBe("26-10-2026");
    expect(await expr('Format(#2:05:00 PM#, "h:mm AM/PM")')).toBe("2:05 PM");
    expect(await expr('Format("abc", ">")')).toBe("ABC");
    expect(await expr('Format("12345", "@@@-@@")')).toBe("123-45");
    expect(await expr('Format(True, "Yes/No")')).toBe("Ja");
    expect(await expr('Format(1234.567, "#,##0.00")', { landinstelling: ENGELS_VS })).toBe("1,234.57");
    expect(await expr('Format(#10/26/2026#, "mm/dd/yyyy")', { landinstelling: ENGELS_VS })).toBe("10/26/2026");
    expect(await expr("Format(Null)")).toBe("");
    expect(await expr('FormatNumber(1234.5, 1)')).toBe("1.234,5");
    expect(await expr('FormatCurrency(-5)')).toBe("€ -5,00");
  });

  it("IIf, Nz, Choose, Switch", async () => {
    expect(await expr('IIf(1 > 2, "ja", "nee")')).toBe("nee");
    expect(await expr('Nz(Null, "leeg")')).toBe("leeg");
    expect(await expr("Nz(Null) & \"\"")).toBe("");
    expect(await expr('Choose(2, "a", "b", "c")')).toBe("b");
    expect(await expr('Switch(1 = 2, "x", 2 = 2, "y")')).toBe("y");
  });

  it("MsgBox zonder host: alleen OK wordt gelogd, keuze wordt geweigerd", async () => {
    const r = await draai('Sub Test()\nMsgBox "Klaar", vbInformation, "Titel"\nEnd Sub');
    expect(r.uitvoer).toEqual(["[MsgBox] Titel: Klaar"]);
    await expect(draai('Sub Test()\nIf MsgBox("Doorgaan?", vbYesNo) = vbYes Then Debug.Print 1\nEnd Sub')).rejects.toBeInstanceOf(VbaAfbreking);
  });

  it("MsgBox en InputBox via de host", async () => {
    const verzoeken: unknown[] = [];
    const r = await draai(
      `Sub Test()
If MsgBox("Verwijderen?", vbYesNo + vbQuestion, "Let op") = vbNo Then Debug.Print "nee"
Debug.Print InputBox("Naam?", , "Piet")
End Sub`,
      "Test",
      {
        host: {
          msgBox: async (v) => (verzoeken.push(v), 7),
          inputBox: async (v) => (verzoeken.push(v), "Klaas"),
        },
      },
    );
    expect(r.uitvoer).toEqual(["nee", "Klaas"]);
    expect(verzoeken[0]).toEqual({ tekst: "Verwijderen?", knoppen: 36, titel: "Let op" });
    expect(verzoeken[1]).toEqual({ tekst: "Naam?", titel: "Microsoft Access", standaard: "Piet" });
  });

  it("Collection en Dictionary", async () => {
    const uit = await print(`Sub Test()
  Dim c As New Collection, d As Scripting.Dictionary, x
  c.Add "een", "a"
  c.Add "twee"
  Debug.Print c.Count; c("a"); c(2)
  For Each x In c: Debug.Print x;: Next
  Debug.Print
  Set d = New Scripting.Dictionary
  d("k") = 1
  d.Add "m", 2
  Debug.Print d.Exists("m"); d.Count; d("k")
End Sub`);
    expect(uit).toEqual([" 2 eentwee", "eentwee", "Waar 2  1 "]);
  });
});

describe("klassen", () => {
  it("klassenmodule met Property Get/Let, Class_Initialize en Me", async () => {
    const klasse = `VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Rekening"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Option Explicit
Private mSaldo As Currency
Public Eigenaar As String
Private Sub Class_Initialize()
  mSaldo = 10
End Sub
Public Property Get Saldo() As Currency
  Saldo = mSaldo
End Property
Public Property Let Saldo(ByVal waarde As Currency)
  If waarde < 0 Then Err.Raise vbObjectError + 1, "Rekening", "Negatief saldo"
  mSaldo = waarde
End Property
Public Sub Stort(bedrag As Currency)
  Me.Saldo = Me.Saldo + bedrag
End Sub`;
    const uit = await print(
      `Sub Test()
  Dim r As Rekening
  Set r = New Rekening
  r.Eigenaar = "Ans"
  r.Stort 5.5
  Debug.Print r.Eigenaar; r.Saldo; TypeName(r); TypeOf r Is Rekening
  On Error Resume Next
  r.Saldo = -1
  Debug.Print Err.Description
End Sub`,
      { extra: [{ naam: "Rekening", bron: klasse, soort: "klasse" }] },
    );
    expect(uit).toEqual(["Ans 15,5 RekeningWaar", "Negatief saldo"]);
  });

  it("Enum en Const op moduleniveau, ook uit een andere module", async () => {
    const uit = await print(`Sub Test()
  Debug.Print Groen; Kleur.Blauw; MAX_AANTAL; Module2.Dubbel(4)
End Sub`, {
      extra: [
        {
          naam: "Module2",
          soort: "module",
          bron: `Public Enum Kleur
  Rood = 1
  Groen
  Blauw = 10
End Enum
Public Const MAX_AANTAL As Long = 2 * 50
Public Function Dubbel(x) : Dubbel = x * 2 : End Function`,
        },
      ],
    });
    expect(uit).toEqual([" 2  10  100  8 "]);
  });
});

describe("diversen", () => {
  it("GoSub/Return, ByRef op matrixelementen, Erl en Print met ; en Tab", async () => {
    const uit = await print(`Sub Wissel(a, b)
  Dim t: t = a: a = b: b = t
End Sub
Sub Test()
  Dim m(1) As String, n As Long
  m(0) = "x": m(1) = "y"
  Wissel m(0), m(1)
  Debug.Print m(0); m(1);
  Debug.Print Tab(6); "|"
  GoSub Erbij
  GoSub Erbij
  Debug.Print n
  On Error GoTo F
10 n = n / 0
  Exit Sub
Erbij:
  n = n + 5
  Return
F:
  Debug.Print "regel"; Erl
End Sub`);
    expect(uit).toEqual(["yx   |", " 10 ", "regel 10 "]);
  });

  it("Option Compare Text in Select Case en Like; Is op objecten; Exit Function in de handler wist Err", async () => {
    const uit = await print(`Option Compare Text
Function Probeer() As Long
  On Error GoTo F
  Probeer = 1 / 0
  Exit Function
F:
  Probeer = -1
  Exit Function
End Function
Sub Test()
  Dim a As Collection, b As Collection
  Set a = New Collection: Set b = a
  Select Case "ABC"
    Case "abc": Debug.Print "gelijk"; "ABC" Like "a*"; a Is b; a Is Nothing
  End Select
  Debug.Print Probeer(); Err.Number
End Sub`);
    expect(uit).toEqual(["gelijkWaarWaarOnwaar", "-1  0 "]);
  });

  it("Mid als toewijzing en LSet worden duidelijk als niet ondersteund gemeld", async () => {
    await expect(draai('Sub Test()\nDim s As String\ns = "abc"\nMid(s, 1, 1) = "x"\nEnd Sub')).rejects.toThrow(/Mid-instructie/);
    await expect(draai('Sub Test()\nDim s As String\nLSet s = "x"\nEnd Sub')).rejects.toThrow(/LSet/);
  });
});

describe("Option Explicit en compileerfouten", () => {
  it("meldt een niet-gedeclareerde variabele met Option Explicit", async () => {
    await expect(draai("Option Explicit\nSub Test()\nx = 1\nEnd Sub")).rejects.toThrow(/niet gedefinieerd/);
  });
  it("maakt impliciete variabelen zonder Option Explicit", async () => {
    expect((await draai("Function Test()\nx = 41\nTest = x + 1\nEnd Function")).resultaat).toBe(42);
  });
  it("weigert uitvoeren van een module met een syntaxisfout", async () => {
    const { VbaRuntime } = await import("./interpreter.ts");
    const rt = new VbaRuntime();
    const fouten = rt.laad([{ naam: "M", soort: "module", bron: "Sub Test()\nIf x Then\nEnd Sub" }]);
    expect(fouten.length).toBeGreaterThan(0);
    await expect(rt.voerUit("M", "Test")).rejects.toThrow(/syntaxisfouten/);
  });
});
