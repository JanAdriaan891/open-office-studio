# VBA-runtime (`packages/vba`)

Eigen interpreter voor VBA uit Access-databases, met een DAO-subset bovenop de
werkkopie. Losse module: de interpreter praat met de database **uitsluitend** via
het contract `Werkkopie` (`packages/database/src/werkkopie/contract.ts`) en met de
interface uitsluitend via de hostinterfaces in `host.ts`. Er wordt geen Access,
geen COM en geen Windows gebruikt.

## Opbouw

| Bestand | Inhoud |
| --- | --- |
| `lexer.ts` | Tokens met regel en kolom: regelvoortzetting ` _`, `'`/`Rem`, `"…""…"`, `#datum#`, `&H…`/`&O…`, typetekens (`%&!#@$`), `[naam met spaties]`. |
| `voorbewerking.ts` | Voorwaardelijke compilatie: `#If/#ElseIf/#Else/#End If`, `#Const`. De runtime gedraagt zich als 32-bits VBA7 op Windows (`VBA7`, `Win32` waar; `Win64`, `Mac` onwaar). |
| `parser.ts`, `ast.ts` | Modules, klassen- en formuliermodules (incl. `VERSION/BEGIN…END` en `Attribute`), met foutherstel per regel. Fouten als `VbaParseerFout` met module, regel, kolom en een broncodevrije constructienaam. |
| `waarden.ts`, `operatoren.ts`, `datum.ts`, `land.ts` | Waardemodel en VBA-semantiek (zie hieronder). |
| `interpreter.ts` | Asynchrone tree-walking interpreter (`VbaRuntime`). |
| `bibliotheek.ts`, `format.ts`, `objecten.ts` | VBA-functies, constanten, `Format`, `Err`, `Debug`, `Collection`, `Scripting.Dictionary` (alleen via `New`). |
| `dao.ts` | DAO-subset en domeinfuncties op het werkkopiecontract. |
| `access.ts` | `DoCmd`, `Application`, `Forms`/`Reports`, `Me` en besturingselementen, `Screen`, `CurrentProject`, `SysCmd`. |
| `afscherming.ts` | Wat geweigerd wordt, de weigering zelf (met het VBA-foutnummer voor de modus `fout`) en een statische scan. |
| `extern.ts`, `extern-typen.ts` | Statische analyse van externe afhankelijkheden (verwijzingen, Declare, CreateObject, bestanden, gekoppelde tabellen …), aanroepgraaf en status per procedure; alle typen voor de interface. |
| `ontbrekend.ts` | Gedrag na een weigering per modus (`stoppen`/`fout`/`overslaan`) en het plaatsvervangende object. |
| `host.ts`, `conversie.ts` | `VbaHost` (MsgBox, InputBox, Debug.Print, DoCmd-gebeurtenissen) en `FormulierHost`; kloonbare `HostWaarde`. |
| `protocol.ts`, `worker-kern.ts`, `vba-worker.ts`, `vba-client.ts` | Dedicated Worker en `VbaClient`. |
| `nepwerkkopie.ts`, `testhulp.ts`, `*.test.ts` | Alleen voor tests. |

## Gebruik

```ts
import { VbaClient } from "../packages/vba/src/vba-client.ts";
import { koppelWerkkopie } from "../packages/database/src/werkkopie/werkkopie-brug.ts";

const client = new VbaClient({
  // per (her)start een verse poort naar de werkkopie; de andere kant koppelt de databaseworker
  werkkopiePoort: () => {
    const kanaal = new MessageChannel();
    databaseWorker.postMessage({ soort: "koppelWerkkopie" }, [kanaal.port1]); // eigen afspraak met die worker
    return kanaal.port2;
  },
  tijdslimiet: 30_000,
  host: {
    msgBox: async ({ tekst, knoppen, titel }) => 6, // vbYes
    inputBox: async ({ tekst, standaard }) => standaard,
    debugPrint: (regel) => console.log(regel),
    gebeurtenis: async ({ soort, args }) => { /* OpenForm, Close, Requery … */ },
  },
  formulieren: mijnFormulierHost, // optioneel: Me, Me!txtNaam, Forms!frm!ctl
});
const { fouten, afscherming, procedures } = await client.laad([{ naam: "Module1", bron, soort: "module" }]);
const r = await client.voerUit("Module1", "Herbereken");
// r = { ok: true, resultaat, argumenten, uitvoer, stappen } of { ok: false, fout: { soort, nummer, beschrijving, module, procedure, regel, kolom }, uitvoer }
client.stop(); // beëindigt de worker direct
```

`procedures()` geeft publieke Subs/Functions zonder verplichte parameters, plus de
gebeurtenisprocedures (`Form_Load`, `cmdOk_Click`, …) van formulier- en
rapportmodules. Modulevariabelen blijven bewaard tussen aanroepen, totdat de worker
stopt (tijdslimiet of `stop()`); daarna laadt de client de modules opnieuw.
ByRef-argumenten komen terug in `argumenten`, zodat de formuliermodule bv. `Cancel`
van `Form_BeforeUpdate(Cancel As Integer)` kan lezen.

Zonder worker (bijv. in tests of in een eigen worker) kan `VbaRuntime` direct:

```ts
const rt = new VbaRuntime({ werkkopie, host, formulieren, stappenlimiet: 5_000_000, signaal });
rt.laad(modules);
const { resultaat, uitvoer } = await rt.voerUit("Module1", "Test");
```

## Externe afhankelijkheden en ontbrekende onderdelen

```ts
import type { ExterneAnalyse, Uitvoering, WatWerktSamenvatting } from "@/packages/vba/src/extern-typen.ts";
// verwijzingen: leesVbaVerwijzingen(mdbReader) uit packages/database/src/access-analyse.ts
const analyse = await client.analyseerExtern(verwijzingen, { gekoppeldeTabellen });
// analyse.verwijzingen: naam, GUID, versie, pad, status (ingebouwd/deels/ontbreekt), gebruiktDoor
// analyse.procedures: status (uitvoerbaar/deels/niet), redenen met aanroepketen, roeptAan/aangeroepenDoor
const r = await client.voerUit("Module1", "Export", [], { ontbrekend: "fout" });
const u: Uitvoering = await client.voerUitVastgelegd("Module1", "Export", [], { ontbrekend: "overslaan" });
const s: WatWerktSamenvatting = await client.voerUitWatWerkt({ ontbrekend: "overslaan", metDeels: true, analyse });
```

- **Analyse** (`analyseerExtern`, statisch, voert niets uit): COM-/typebibliotheekverwijzingen
  met status (`ingebouwd`: VBA, Access, DAO/ACE-DAO, stdole; `deels`: Scripting, alleen
  Dictionary; `ontbreekt`: Office, Excel, Word, Outlook, ADODB/ADOX, MSXML, Windows Script Host,
  VBIDE, OCX’s, projectverwijzingen en onbekende bibliotheken) en de procedures die ze
  werkelijk gebruiken (objecttypen, `New`, `TypeOf`, ProgID’s, enum-constanten zoals `xlUp`,
  `adOpenStatic`). Verder `Declare` (DLL!functie), `CreateObject`/`GetObject` met ProgID,
  bestanden, `Shell`/`SendKeys`/`Environ`, register, `CurrentProject.Path`, hyperlinks, export,
  `OpenDatabase`, gekoppelde tabellen (alleen naam en soort bron, nooit een
  verbindingsreeks) en onbekende functies. Per procedure: `uitvoerbaar` (niets externs, ook
  niet indirect), `deels` (alleen op paden achter `On Error` of een voorwaarde, of een
  gedeeltelijk ondersteund onderdeel) of `niet`, met redenen en de aanroepketen (over
  modules heen, ook klassen via `Dim x As New Klasse`).
- **Uitvoeren zonder ontbrekende onderdelen** (`ontbrekend`, standaard `stoppen`): in de modus
  `fout` geeft een weigering een gewone, vangbare VBA-fout met het nummer dat VBA zelf zou
  geven (429 CreateObject/GetObject/`New` van een onbekende bibliotheek, 453 Declare/AddressOf,
  75 bestand/pad, 53 FileLen/GetAttr, 52 Print #/Close #, 5 Shell, 70 SendKeys/Environ/register,
  490 FollowHyperlink, 2302 export, 3024 OpenDatabase, 35 onbekende functie). In de modus
  `overslaan` wordt de instructie overgeslagen; een functie levert Empty, en wat een object
  zou opleveren (CreateObject, `New Excel.Application`, OpenDatabase, FileDialog …) wordt een
  plaatsvervanger die elke verdere aanroep ook overslaat (als waarde Empty, `For Each` leeg).
  Een fout 91/424 die daarna volgt wordt (alleen als geen enkele aanroeper een
  foutafhandeling heeft) ook overgeslagen. Alles komt in `overgeslagen` als
  `overgeslagen: <wat>, <module>/<regel>`, zonder broncode.
- **In elke modus is de afscherming gelijk**: het geweigerde onderdeel wordt nooit uitgevoerd
  en de argumenten ervan worden niet geëvalueerd (`ontbrekend.test.ts`). Alleen
  `CreateObject("Scripting.Dictionary")` met een letterlijke ProgID wordt in-proces
  nagebootst.
- **`voerUitWatWerkt`** voert alle publieke Subs/Functions zonder verplichte parameters met
  status `uitvoerbaar` (met `metDeels` ook `deels`) na elkaar uit, elk met eigen tijds- en
  stappenlimiet, standaard in een transactie op de werkkopie die daarna wordt teruggedraaid
  (ook na een tijdslimiet). Klassenmodules, gebeurtenisprocedures en (zonder formulierhost)
  formuliermodules worden overgeslagen, met reden in `nietUitgevoerd`. Elke uitvoering wordt
  vastgelegd als `Uitvoering` (`status`: geslaagd/fout/tijdslimiet/gestopt; stappenlimiet telt
  als tijdslimiet).

## Taal

- Declaraties: `Dim/Private/Public/Global/Static/Const/ReDim [Preserve]/Erase`, `Type … End Type`,
  `Enum … End Enum`, `DefInt A-Z` e.d., `Option Explicit/Compare/Base/Private Module`,
  `Implements` en `Event` (genoteerd), `WithEvents` (geparst, niet gekoppeld).
- Typen: Byte, Integer, Long, LongPtr/LongLong (als Long/Double), Single, Double, Currency,
  Decimal (benaderd), String, `String * n`, Boolean, Date, Variant, Object, klassen, UDT’s,
  vaste en dynamische matrices (meerdimensionaal, `Option Base`), `As New`.
- Procedures: `Sub`, `Function`, `Property Get/Let/Set`, `ByVal/ByRef/Optional/ParamArray`,
  standaardwaarden, `IsMissing`, benoemde argumenten, `Call`, functies die een matrix teruggeven.
- Besturing: `If/ElseIf/Else` (blok en één regel), `Select Case` (`Is`, `To`, lijsten),
  `For/Next` (ook `Next i, j`), `For Each`, `Do While/Until … Loop [While/Until]`,
  `While/Wend`, `With`, `Exit Sub/Function/Property/For/Do`, `GoTo`, labels en regelnummers,
  `GoSub/Return`, `End`, `Stop`.
- Fouten: `On Error GoTo label/Resume Next/GoTo 0`, `Resume`, `Resume Next`, `Resume label`,
  `Err` (Number, Description, Source, Raise, Clear), `Error n`, `Erl`. Een fout in een
  aangeroepen procedure wordt door de handler van de aanroeper opgevangen; `Resume Next`
  gaat verder na het statement waarin de fout ontstond (ook binnen lussen).
- Semantiek: Variant met subtypen, Empty/Null/Nothing, Null-voortplanting, impliciete
  conversies, Integer-overloop (fout 6; bij een Variant groeit het type mee), deling door
  nul (fout 11), typen komen niet overeen (fout 13), Null-gebruik (fout 94), matrixgrenzen
  (fout 9), matrices en UDT’s worden bij toewijzing gekopieerd, ByRef ook voor
  matrixelementen en UDT-velden.
- Begrenzing: stappenlimiet (standaard 5 miljoen statements), aanroepdiepte (fout 28),
  annulering via `AbortSignal`, en in de client een tijdslimiet die de worker beëindigt.
- Landinstelling: standaard Nederlands (`CStr(1.5)` = `1,5`, korte datum `26-10-2026`,
  `True` = `Waar`); `ENGELS_VS` is beschikbaar. Datumliteralen `#m/d/yyyy#` zijn altijd
  Amerikaans, zoals in VBA.

## Bibliotheek

Tekst (Len, Left, Right, Mid, InStr, InStrRev, Replace, Split, Join, Filter, Trim/LTrim/RTrim,
UCase/LCase, StrComp, StrConv, StrReverse, Space, String, Chr/ChrW, Asc/AscW, Hex, Oct, Val,
Str, Format, FormatNumber/Currency/Percent/DateTime), conversie (CInt, CLng, CByte, CDbl,
CSng, CCur, CDec, CStr, CBool, CDate, CVDate, CVar, CVErr, IsNumeric, IsDate, IsNull,
IsEmpty, IsArray, IsObject, IsMissing, IsError, TypeName, VarType), wiskunde (Abs, Int,
Fix, Round met bankiersafronding, Sqr, Rnd/Randomize, Sgn, Exp, Log, Sin, Cos, Tan, Atn),
datum (Date, Now, Time, Timer, Year … Second, Weekday, DateAdd, DateDiff, DatePart,
DateSerial, TimeSerial, DateValue, TimeValue, MonthName, WeekdayName), overig (IIf, Nz,
Choose, Switch, Array, LBound/UBound, RGB, QBColor, DoEvents, Beep, Error, CallByName,
MsgBox, InputBox, `Debug.Print` met `;`, `,`, `Tab()` en `Spc()`, `Debug.Assert`) en de
gangbare constanten (`vbCrLf`, `vbYesNo`, `vbObjectError`, `dbOpenDynaset`, `acForm` …).

`Format` kent de benoemde notaties (General Number, Currency, Fixed, Standard, Percent,
Scientific, Yes/No, True/False, On/Off, General/Long/Medium/Short Date, Long/Medium/Short
Time) en eigen patronen voor getallen (`0 # , . % E+`, secties met `;`), datums
(`d dd ddd dddd m mm mmm mmmm yy yyyy h hh n nn s ss q w ww y AM/PM`, `/` en `:` volgens de
landinstelling) en tekst (`@ & < >`). Format rondt half van nul af; `Round` rondt als
bankier.

Zonder host logt `MsgBox` met alleen een OK-knop de melding in de uitvoer; een `MsgBox`
met keuzeknoppen en `InputBox` worden dan geweigerd, zodat code nooit zelf “Ja” kiest.

## DAO en Access

- `CurrentDb`, `CodeDb`, `DBEngine(0)(0)`, `Workspaces(0)`; `BeginTrans/CommitTrans/Rollback`
  via de transacties van de werkkopie (`begin/bevestig/terugdraaien`, één niveau).
- `Database.OpenRecordset(tabel | query | SQL, [type])`, `Execute sql|querynaam [, dbFailOnError]`,
  `RecordsAffected`, `QueryDefs` (ook `Delete`), `TableDefs` (namen, velden, `Delete`),
  `CreateQueryDef` (met naam blijvend via `bewaarQuery`; zonder naam tijdelijk).
- `Recordset`: `EOF/BOF`, `MoveFirst/Next/Previous/Last`, `Move`, `RecordCount`,
  `AbsolutePosition`, `Bookmark`, `NoMatch`, `Fields("x")`/`!x`/`("x")`/`Fields(i).Name/.Value/.Type`,
  `AddNew/Edit/Update/CancelUpdate/Delete`, `FindFirst/Next/Previous/Last`
  (criteria met vergelijkingen, `Like`, `Is Null`, `And/Or/Not` en VBA-functies), `Requery`,
  `Clone`, `GetRows`, `Close`. Bewerken gaat via `voegToe`/`wijzig`/`verwijder` met de rowid;
  na `AddNew` wordt de rij met `rij(tabel, rowid)` teruggelezen (autonummering, standaardwaarden).
  Een tabel is bijwerkbaar, en elke query of SQL waarvoor de werkkopie `QueryResultaat.bron`
  (basistabel + rowids) teruggeeft, ook met parameters; de rest is alleen-lezen (fout 3027).
  Veldtypen (o.a. datums) komen uit `QueryResultaat.kolomsoorten`; alleen bij een onbekende
  soort wordt ISO-tekst als datum gelezen.
- `QueryDef`: `Parameters("x")`/`!x`, `OpenRecordset`, `Execute`, `SQL` (wijzigen wordt
  bij een opgeslagen query blijvend bewaard), `Type`.
  Ontbrekende parameters geven fout 3061.
- `Database.Properties` en `CreateProperty` (in het geheugen van de runtime; fout 3270 voor
  een onbekende eigenschap), `Application.SetOption/GetOption` (zonder gevolg),
  `SysCmd(acSysCmdRuntime)` (onwaar), `CurrentProject.AllForms/AllReports` (`Count`, `For Each`,
  uit de ontwerpen in de werkkopie).
- Domeinfuncties: `DCount`, `DSum`, `DAvg`, `DMin`, `DMax`, `DLookup`, `DFirst`, `DLast`.
- `DoCmd.RunSQL`, `DoCmd.SetWarnings`, `DoCmd.OpenQuery` (actiequery wordt uitgevoerd).
  `OpenForm`, `OpenReport`, `Close`, `Requery`, `GoToRecord`, `GoToControl`, `ApplyFilter`,
  `RunCommand`, `CancelEvent`, `Quit` en verwanten gaan als `HostGebeurtenis` naar de host;
  zonder host volgt een concrete melding (vensteracties zoals `Hourglass` en `Maximize`
  vervallen dan stil).
- Formulier- en rapportmodules (`Form_x`, `Report_x`): `Me`, `Me!txt`, `Me.txt.Visible`,
  kale besturingsnamen (`txtNaam = …`), formuliereigenschappen (`Me.RecordSource`, `Dirty`,
  `Requery` …), `Forms!frm!ctl`, `Screen.ActiveForm`, `CurrentProject.AllForms("x").IsLoaded`
  en `SysCmd(acSysCmdGetObjectState, …)` lopen via `FormulierHost`. Namen van eigenschappen
  en methoden komen in kleine letters; besturingsnamen moet de host hoofdletterongevoelig
  vergelijken.

## Afscherming

Geweigerd, met een Nederlandse melding en **vóórdat** argumenten worden geëvalueerd
(standaard een `VbaAfbreking` met reden `afgeschermd`, niet af te vangen met `On Error`; met
`ontbrekend: "fout"` of `"overslaan"` gaat de code verder zonder het onderdeel, zie hierboven):

- processen: `Shell`, `AppActivate`, `DoCmd.RunApp`, `Application.Shell`;
- bestanden: `Kill`, `FileCopy`, `Dir`, `MkDir`, `RmDir`, `ChDir`, `ChDrive`, `CurDir`,
  `FileLen`, `FileDateTime`, `GetAttr`, `SetAttr`, `FreeFile`, `LOF`, `Loc`,
  `Open … For`, `Close #`, `Print #`, `Write #`, `Input #`, `Line Input #`, `Get/Put #`,
  `Name … As`, `LoadPicture`, `SavePicture`, `CurrentProject.Path/FullName`,
  `CodeProject.Path/FullName`, `CurrentDb.Name`, `OpenDatabase`, `CompactDatabase`;
- COM/ActiveX: `CreateObject`, `GetObject`, `CurrentProject.Connection` (ADO);
- het VBA-project: `VBE`, `Application.References`; de bestandskiezer `Application.FileDialog`;
- Windows-API: elke met `Declare` gedeclareerde functie, `AddressOf`;
- toetsenbord, omgeving en register: `SendKeys`, `Environ`, `GetSetting`, `SaveSetting`,
  `DeleteSetting`, `GetAllSettings`;
- hyperlinks en export: `Application.FollowHyperlink`, `DoCmd.TransferText`,
  `DoCmd.TransferSpreadsheet`, `DoCmd.TransferDatabase`, `DoCmd.OutputTo`,
  `DoCmd.SendObject`, `Application.ExportXML/ImportXML/SaveAsText/LoadFromText`.

`scanAfscherming(module)` vindt dezelfde constructies statisch; `VbaClient.laad` geeft ze
mee in `afscherming`. Een eigen procedure met dezelfde naam (bv. een eigen `Dir`) gaat voor.

## Niet ondersteund (met een duidelijke melding)

`Mid`/`LSet`/`RSet` als toewijzing, `On x GoTo/GoSub`, `Eval`, `Application.Run` buiten de
geladen modules, `Recordset.Filter/Sort/OpenRecordset`, `CreateTableDef`, `Relations`,
geneste transacties,
`Forms(index)` en `For Each` over `Forms`/`Controls` met een formulierhost (zonder host is er
niets geopend: lege verzameling, en `Forms!x` buiten een formuliermodule geeft fout 2450),
`DoCmd.RunMacro`, `DeleteObject`, `Rename`,
`CopyObject`, gebeurtenissen van klassen (`RaiseEvent` heeft geen ontvangers), UserForms
(`Load`/`Unload`), `StrPtr/VarPtr/ObjPtr`. Currency en Decimal worden als
JavaScript-getal benaderd (Currency afgerond op 4 decimalen).

## Proeven

- `pnpm exec vitest run packages/vba`: parser (realistische Access-modules), semantiek,
  DAO tegen een sql.js-database (`nepwerkkopie.ts`) én tegen de echte `SqliteWerkkopie`,
  afscherming (elke constructie geweigerd zonder bijwerking), worker/client (tijdslimiet,
  `stop()`, hostverzoeken).
- `node scripts/vba-uitvoerproef.mjs`: kiest deterministisch 10 databases uit het
  access-vba-corpus, bouwt per database een werkkopie, maakt de externe analyse en voert
  `voerUitWatWerkt` uit (modus `overslaan`, automatische hostantwoorden, transactie per
  procedure, hash van het origineel voor en na). Rapport in `.local/vba-uitvoerproef.json`,
  verslag in `docs/tests/2026-10-27-vba-uitvoerproef.md`. Stand 27 oktober 2026: 134 van 165
  kandidaten geslaagd (vóór de reparaties uit die proef 110 van 167), geen tijdslimiet.
- `node scripts/vba-proef.mjs`: haalt de VBA-modules uit de corpusdatabases
  (`.local/corpus/manifest.json` en `.local/corpus/access-vba/manifest.json`) via
  `analyseerDatabase` en **parset** ze alleen; niets wordt uitgevoerd. Het rapport
  (`.local/vba-proef.json`) bevat alleen aantallen en broncodevrije constructienamen.
  Stand 26 oktober 2026: 1.556 modules (200.932 regels) uit 100 databases, waarvan
  1.552 modules (99,7 %; 99,8 % van de regels) zonder parseerfout. De vier overige
  modules zijn ook in Access ongeldig (afgebroken regel, `Do` zonder `Loop`, dubbele
  `End Sub`). Van 11.280 procedures bevat 94,9 % statisch geen afgeschermde of onbekende
  constructie.
