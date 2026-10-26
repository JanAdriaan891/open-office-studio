/**
 * Ingebouwde voorbeelddatabase als echte (nieuwe) werkkopie, zodat tabellen,
 * query’s, formulieren, rapporten en VBA zonder eigen bestand te verkennen zijn.
 * Dit zijn demonstratiegegevens, geen gegevens uit een geopend bestand.
 */
import type { Werkkopie } from "../werkkopie/contract.ts";
import type { VbaModule } from "./vba-sessie.ts";

export async function vulVoorbeeld(werkkopie: Werkkopie) {
  await werkkopie.maakTabel({
    naam: "Materialen",
    velden: [
      { naam: "Code", soort: "tekst", lengte: 10, primair: true, verplicht: true },
      { naam: "Omschrijving", soort: "tekst", lengte: 100, verplicht: true },
      { naam: "Eenheid", soort: "tekst", lengte: 10 },
      { naam: "Prijs", soort: "valuta" },
      { naam: "Voorraad", soort: "geheel", standaard: 0 },
      { naam: "Duurzaam", soort: "jaNee", standaard: false },
      { naam: "Gecontroleerd", soort: "datum" },
    ],
  });
  const rijen: [string, string, string, number, number, boolean, string][] = [
    ["MAT-001", "Vuren balk 45×70", "m", 4.85, 320, true, "2026-09-14"],
    ["MAT-002", "Staal HEA 200", "kg", 1.92, 1450, false, "2026-10-02"],
    ["MAT-003", "Beton C30/37", "m³", 118.5, 36, false, "2026-10-12"],
    ["MAT-004", "Kalkzandsteen 100 mm", "m²", 21.4, 210, true, "2026-08-30"],
    ["MAT-005", "Glaswol 140 mm", "m²", 9.75, 480, true, "2026-10-20"],
    ["MAT-006", "Eiken plank 22 mm", "m", 12.3, 95, true, "2026-07-11"],
  ];
  for (const [Code, Omschrijving, Eenheid, Prijs, Voorraad, Duurzaam, Gecontroleerd] of rijen)
    await werkkopie.voegToe("Materialen", { Code, Omschrijving, Eenheid, Prijs, Voorraad, Duurzaam, Gecontroleerd });
  await werkkopie.bewaarQuery({
    naam: "Materialenlijst",
    soort: "select",
    sql: "SELECT Code, Omschrijving, Eenheid, Prijs\nFROM Materialen\nORDER BY Code;",
  });
  await werkkopie.bewaarQuery({
    naam: "Materiaal vanaf prijs",
    soort: "select",
    sql: "PARAMETERS [Minimale prijs] Currency;\nSELECT Code, Omschrijving, Prijs\nFROM Materialen\nWHERE Prijs >= [Minimale prijs]\nORDER BY Prijs DESC;",
  });
  await werkkopie.bewaarQuery({
    naam: "Prijzen met 5% verhogen",
    soort: "update",
    sql: "UPDATE Materialen SET Prijs = Round(Prijs * 1.05, 2);",
  });
  await werkkopie.bewaarOntwerp({
    naam: "Materialen",
    soort: "formulier",
    bron: "Materialen",
    definitie: {
      versie: 1,
      titel: "Materialen",
      velden: [
        { veld: "Code", label: "Code", besturing: "txtCode" },
        { veld: "Omschrijving", label: "Omschrijving", besturing: "txtOmschrijving" },
        { veld: "Eenheid", label: "Eenheid", besturing: "txtEenheid" },
        { veld: "Prijs", label: "Prijs", besturing: "txtPrijs" },
        { veld: "Voorraad", label: "Voorraad", besturing: "txtVoorraad" },
        { veld: "Duurzaam", label: "Duurzaam", besturing: "chkDuurzaam" },
        { veld: "Gecontroleerd", label: "Laatst gecontroleerd", besturing: "txtGecontroleerd" },
      ],
      knoppen: [
        { naam: "cmdWaarde", label: "Voorraadwaarde" },
        { naam: "cmdVandaag", label: "Vandaag gecontroleerd" },
      ],
    },
  });
  await werkkopie.bewaarOntwerp({
    naam: "Voorraad per eenheid",
    soort: "rapport",
    bron: "Materialen",
    definitie: {
      versie: 1,
      titel: "Voorraad per eenheid",
      kop: "Overzicht van de materiaalvoorraad, gegroepeerd per eenheid.",
      voet: "Voorbeeldgegevens · Open Database Studio",
      velden: ["Code", "Omschrijving", "Prijs", "Voorraad"],
      groepeer: "Eenheid",
      sorteer: [{ veld: "Code", aflopend: false }],
      totalen: [
        { veld: "Voorraad", functie: "som" },
        { veld: "Prijs", functie: "gemiddelde" },
        { veld: "Code", functie: "aantal" },
      ],
    },
  });
}

export const VOORBEELD_MODULES: VbaModule[] = [
  {
    naam: "Voorbeeldmodule",
    soort: "module",
    herkomst: "eigen",
    bron: `Option Compare Database
Option Explicit

' Telt de materialen en schrijft een overzicht naar het directvenster.
Public Sub Overzicht()
    Dim rs As DAO.Recordset
    Set rs = CurrentDb.OpenRecordset("SELECT Code, Omschrijving, Voorraad FROM Materialen ORDER BY Code")
    Do Until rs.EOF
        Debug.Print rs!Code, rs!Omschrijving, rs!Voorraad
        rs.MoveNext
    Loop
    rs.Close
    Debug.Print "Aantal materialen: " & DCount("*", "Materialen")
End Sub

Public Sub Begroeting()
    Dim naam As String
    naam = InputBox("Wat is je naam?", "Begroeting", "collega")
    If Len(naam) > 0 Then MsgBox "Hallo " & naam & "! Het is " & Format(Date, "dddd d mmmm yyyy") & ".", vbInformation, "Begroeting"
End Sub

Public Function Voorraadwaarde() As Currency
    Voorraadwaarde = Nz(DSum("Prijs * Voorraad", "Materialen"), 0)
    Debug.Print "Totale voorraadwaarde: " & Format(Voorraadwaarde, "Currency")
End Function
`,
  },
  {
    naam: "Form_Materialen",
    soort: "formulier",
    herkomst: "eigen",
    bron: `Option Compare Database
Option Explicit

Private Sub Form_Load()
    Me.Caption = "Materialen (" & DCount("*", "Materialen") & ")"
End Sub

Private Sub Form_Current()
    If Not Me.NewRecord Then Debug.Print "Huidig record: " & Me!txtCode
End Sub

Private Sub cmdWaarde_Click()
    MsgBox "Voorraadwaarde van " & Me!txtOmschrijving & ": " & Format(Nz(Me!txtPrijs, 0) * Nz(Me!txtVoorraad, 0), "Currency"), vbInformation
End Sub

Private Sub cmdVandaag_Click()
    Me!txtGecontroleerd = Date
    Me.Dirty = False
End Sub
`,
  },
];
