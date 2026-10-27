# VBA-uitvoerproef — 27 oktober 2026

Proef van de VBA-runtime (`packages/vba`) op 10 echte Access-databases met VBA-code uit het access-vba-corpus: eerst een statische analyse van externe afhankelijkheden, daarna het uitvoeren van alles wat zonder die afhankelijkheden kan werken. Het verslag bevat alleen aantallen, foutnummers, namen van repositories en broncodevrije oorzaken. Er staat geen VBA-broncode, databaseinhoud, verbindingsreeks of lokaal pad in.

## Veiligheid

- Alles draait in de eigen afgeschermde interpreter op een SQLite-werkkopie, in-proces gebouwd met `openWerkkopie`. Er is niets geopend in Access, LibreOffice of andere software met echte COM, Shell of bestandstoegang.
- Afgeschermde onderdelen (Shell, bestanden, CreateObject/GetObject, Declare, SendKeys, Environ, register, hyperlinks, export, VBE) worden in elke modus geweigerd vóórdat hun argumenten worden geëvalueerd. De modus `overslaan` verandert alleen wat er ná de weigering gebeurt. `ontbrekend.test.ts` laat dat per onderdeel en per modus zien: er is geen bijwerking en de werkkopie blijft ongewijzigd.
- Elke procedure draait in een eigen transactie op de werkkopie, en die transactie wordt daarna teruggedraaid. Bij alle 10 databases waren na afloop alle transacties teruggedraaid en meldde de werkkopie geen wijziging (`gewijzigd() = false`).
- Het origineel is voor en na gehasht (SHA-256). Bij alle 10 bestanden was het ongewijzigd en gelijk aan het manifest.

## Opzet

- **Selectie** (deterministisch): uit `.local/corpus/access-vba/manifest.json` komen alle MDB/ACCDB-bestanden met VBA-bron die niet versleuteld zijn. Dat zijn 100 kandidaten uit 74 repositories. Per repository is het bestand gekozen met de meeste aanroepbare procedures: publiek, Sub of Function, zonder verplichte parameters en in een standaardmodule. Gelijke aantallen zijn beslist op het totale aantal procedures en daarna op id. Daaruit zijn de eerste 10 repositories genomen waarvan de werkkopie te bouwen was.
- **Per database**:
  1. werkkopie bouwen met de VBA-modules;
  2. verwijzingen lezen (`leesVbaVerwijzingen`);
  3. gekoppelde tabellen ophalen, alleen naam en soort bron;
  4. `VbaClient.laad`;
  5. `analyseerExtern`;
  6. `voerUitWatWerkt` met de modus `overslaan` en `metDeels: true`.
- **Grenzen per procedure**: een tijdslimiet van 10 s en een stappenlimiet van 250.000 instructies.
- **Automatische hostantwoorden**: MsgBox kiest de eerste knop (vbOK of vbYes), InputBox geeft `""`, en DoCmd-gebeurtenissen (OpenForm, OpenReport …) worden alleen geregistreerd. Er is geen formulierhost, dus er is geen formulier geopend.
- **Niet uitgevoerd** (zie de tabel verderop):
  - gebeurtenisprocedures;
  - klassenmodules;
  - procedures met verplichte parameters;
  - eigenschapsprocedures;
  - procedures in formulier- en rapportmodules (zonder formulierhost);
  - procedures met analysestatus `niet`.

## De 10 databases

Kolommen:

- **Procedures**: aantal procedures in alle modules.
- **Aanroepbaar**: publieke parameterloze Subs/Functions in standaardmodules.
- **Analyse**: aantal procedures per status `uitvoerbaar` / `deels` / `niet`. Property Get/Let/Set van dezelfde naam telt als één knoop.

| Repository | Modules | Procedures | Aanroepbaar | Analyse | Gekoppelde tabellen |
|---|---:|---:|---:|---|---:|
| tailormade-eu/MicrosoftAccess | 95 | 666 | 110 | 340 / 64 / 240 | 0 |
| llisboa/LBase | 24 | 128 | 34 | 30 / 86 / 12 | 0 |
| kokovanR/ru.vba.msaccess | 40 | 179 | 30 | 94 / 10 / 75 | 9 |
| Naharcomputer/MSAccess_VBA_Projects | 47 | 220 | 28 | 169 / 36 / 13 | 0 |
| francescofoti/halloweendemo | 24 | 385 | 27 | 192 / 107 / 43 | 0 |
| tolikk/MSAccess | 82 | 915 | 26 | 494 / 134 / 287 | 52 |
| mdevman/ActiveDirectoryMSAccess | 8 | 96 | 24 | 33 / 6 / 42 | 20 |
| mdevman/OSLA_MSAccess | 9 | 45 | 18 | 28 / 3 / 14 | 17 |
| mdevman/AddressLookupMSAccess | 2 | 26 | 14 | 15 / 3 / 8 | 3 |
| Naharcomputer/MSAccess_VBA_E2SC | 111 | 684 | 13 | 656 / 2 / 26 | 0 |
| **Totaal** | **442** | **3.344** | **324** | **2.051 / 451 / 760** | **101** |

### Verwijzingen

Verwijzingen uit de dir-stroom van het VBA-project, geteld per database. Access legt VBA en Access zelf niet in de dir-stroom vast.

| Status | Bibliotheken (aantal databases) |
|---|---|
| ingebouwd | stdole (8), DAO/ACE-DAO (7) |
| deels | Scripting (3; alleen Dictionary) |
| ontbreekt | ADODB (6), ADOR (1), VBIDE (5), Excel (2), Word (1), Office (1), Outlook (1), Windows Script Host (1) |

### Oorzaken in de analyse

Het aantal procedures waarvoor een oorzaak direct of via de aanroepgraaf geldt (status `deels` of `niet`, alle 10 databases samen):

| Oorzaak | Procedures | Oorzaak | Procedures |
|---|---:|---|---:|
| gekoppelde tabel (408 in één front-end) | 520 | Excel | 69 + 17 via CreateObject |
| bestandstoegang | 186 | omgeving (Environ) | 43 |
| Declare (Windows-API) | 186 | export (Transfer…/OutputTo) | 43 |
| pad (CurrentProject.Path, CurrentDb.Name) | 178 | VBIDE (VBE, References) | 37 |
| ADODB | 166 + 7 via CreateObject | Office (FileDialog …) | 25 |
| onbekende naam of functie | 106 | Outlook | 10 + 18 via CreateObject |
| Scripting (FileSystemObject) | 18 + 21 via CreateObject | Word | 16 |
| externe database (OpenDatabase) | 17 | proces (Shell) | 16 |
| syntaxisfout in de module | 11 | overige CreateObject | 30 |

## Uitvoering vóór en na de reparaties

**Vóór** is gemeten met de nieuwe modi en API, maar zonder de reparaties uit de volgende sectie. Daarvoor is tijdelijk een kopie van `packages/vba/src` gebruikt waarin die reparaties waren teruggedraaid. **Na** is gemeten met de huidige stand.

De kandidaten verschillen met 2 (in tailormade-eu). Na de reparatie gelden `Application.References` en `Application.FileDialog` als afgeschermde onderdelen, en daardoor vallen twee procedures (direct of via de aanroepgraaf) onder `niet`.

| Repository | Kandidaten vóór → na | Geslaagd vóór → na | Fout vóór → na | Tijdslimiet | Uitvoeringen met overgeslagen onderdelen (na) |
|---|---|---|---|---:|---:|
| tailormade-eu/MicrosoftAccess | 46 → 44 | 29 → **36** | 17 → 8 | 0 | 10 |
| llisboa/LBase | 27 → 27 | 19 → **27** | 8 → 0 | 0 | 19 |
| kokovanR/ru.vba.msaccess | 4 → 4 | 1 → 1 | 3 → 3 | 0 | 0 |
| Naharcomputer/MSAccess_VBA_Projects | 25 → 25 | 14 → **20** | 11 → 5 | 0 | 5 |
| francescofoti/halloweendemo | 26 → 26 | 22 → **25** | 4 → 1 | 0 | 2 |
| tolikk/MSAccess | 10 → 10 | 10 → 10 | 0 → 0 | 0 | 0 |
| mdevman/ActiveDirectoryMSAccess | 4 → 4 | 1 → 1 | 3 → 3 | 0 | 0 |
| mdevman/OSLA_MSAccess | 7 → 7 | 4 → 4 | 3 → 3 | 0 | 0 |
| mdevman/AddressLookupMSAccess | 8 → 8 | 3 → 3 | 5 → 5 | 0 | 0 |
| Naharcomputer/MSAccess_VBA_E2SC | 10 → 10 | 7 → 7 | 3 → 3 | 0 | 0 |
| **Totaal** | **167 → 165** | **110 (65,9 %) → 134 (81,2 %)** | **57 → 31** | **0** | **36** |

Na de reparaties, per analysestatus:

- procedures met status `uitvoerbaar`: 89 van 116 geslaagd (77 %);
- procedures met status `deels`: 45 van 49 geslaagd (92 %). Hun ontbrekende onderdelen zijn overgeslagen en geregistreerd.

Geen enkele procedure liep tegen een tijds- of stappenlimiet aan, en de proef is niet vastgelopen. Per database duurde het uitvoeren minder dan 2,5 s.

**Niet uitgevoerd** (3.097 procedures samen, met de reden):

| Reden | Procedures |
|---|---:|
| gebeurtenisprocedure | 1.444 |
| verplichte parameters | 602 |
| formulier- of rapportmodule (geen formulierhost) | 387 |
| klassenmodule | 349 |
| analysestatus `niet` | 159 |
| eigenschapsprocedure | 125 |
| niet publiek | 31 |

**Meest overgeslagen**, geteld per plek en uitvoering:

- bestands-I/O: `Print #` 65, `Open … For` 17, `Close #` 17, `FreeFile` 17;
- `CurrentDb.Name` 16;
- `Declare`-aanroepen (venster-API’s) 22;
- ADODB: `CurrentProject.Connection` 7, `New ADODB.Command` 6, plus de leden daarvan op het plaatsvervangende object;
- Outlook via `GetObject`, met vervolgaanroepen;
- onbekende namen 12;
- `Application.VBE` 3;
- `CurrentProject.Path` 4.

## Gebreken in onze runtime en reparaties

Vóór de reparaties eindigden 57 uitvoeringen met een fout. Volgens de indeling van het proefscript wezen 27 daarvan direct op onze runtime: „niet ondersteund”, fout 438, of een vertaal- of werkkopiefout 3251/3075. Bij nader onderzoek kwamen ook fout 91, 424 en 13 voor een deel uit onze runtime (punten 1, 2 en 7). Na de reparaties zijn er 26 fouten minder (57 → 31). Hersteld:

1. **Enumtypen als objecttype behandeld.** Een variabele, parameter of functie van een eigen `Enum`-type of van een VBA/DAO/Access-enumtype (`VbCompareMethod`, `RecordsetTypeEnum`, `AcFormView` …) kreeg Nothing. Een toewijzing gaf dan fout 91 of 13. Deze typen zijn nu een Long, zoals in VBA.
2. **Publieke Enums uit klassenmodules waren niet zichtbaar.** Een verwijzing als `Soort.Waarde` gaf fout 424, en die fout had geen regelnummer als hij in de standaardwaarde van een parameter zat. Zulke Enums zijn nu overal zichtbaar, en fouten bij het binden van parameters krijgen een positie.
3. **`Forms!x` buiten een formuliermodule zonder formulierhost.**
   - Gaf eerst een niet-vangbare afbreking. Nu volgt fout 2450 of 2451, zoals in Access wanneer het formulier niet geopend is, en die is met `On Error` af te vangen.
   - `For Each` over `Forms` en `Forms.Count` zijn leeg.
   - `CurrentProject.AllForms/AllReports` hebben `Count` en `For Each` (op de ontwerpen in de werkkopie) en `Item(i)`.
4. **`Application.SetOption/GetOption`** werden niet ondersteund en hebben nu geen gevolg.
5. **`SysCmd(acSysCmdRuntime)`.** De constanten `acSysCmdRuntime`, `…Profile`, `…AccessDir`, `…GetWorkgroupFile` e.d. ontbraken. `Runtime` geeft nu Onwaar en `Profile` geeft `""`. `AccessDir` en `GetWorkgroupFile` zijn als padtoegang afgeschermd.
6. **`Database.Properties` en `CreateProperty`** werden niet ondersteund. Nu kennen ze `Properties("x")` lezen en zetten, `Append`, `Delete`, `Count` en `For Each`. Ze leven alleen in het geheugen van de runtime, en een onbekende eigenschap geeft fout 3270. Daardoor werkt het gangbare patroon voor AllowBypassKey/AppIcon met foutafhandeling.
7. **`VBE`, `Application.VBE`, `Application.References` en `Application.FileDialog`.**
   - Waren eerst „niet ondersteund”, of een impliciete lege variabele die later fout 424 gaf.
   - Zijn nu afgeschermde onderdelen, net als CreateObject: in elke modus geweigerd, en met `overslaan` of `fout` netjes te omzeilen.
8. **DAO-foutnummers.** `CREATE TABLE` op een bestaande tabel geeft nu fout 3010 in plaats van 3251. Er zijn standaardteksten toegevoegd voor 3010, 3075, 3251, 3270, 3367, 2450, 2451, 2456 en de nummers van de modus `fout` (48, 52, 53, 68, 70, 75, 76, 429, 453, 490, 2293, 2302, 3024).

Al vóór de nulmeting toegevoegd, en dus in beide metingen gelijk: `CreateObject("Scripting.Dictionary")` met een letterlijke ProgID. Die wordt in-proces nagebootst; elke andere of dynamische ProgID blijft afgeschermd.

## Resterende fouten (na)

| Soort | Fouten | Toelichting |
|---|---:|---|
| Gegevens ontbreken in de database zelf | 17 | fout 3078 (8): tabel bestaat niet of is alleen gekoppeld. Fout 3265 (6): het veld ontbreekt in de tabel. Fout 3061 (3): een query vraagt een parameter, bv. een formulierverwijzing. |
| Toepassingsstatus of formulier nodig | 10 | fout 91 (3): een globaal gebruikersobject wordt pas bij het inloggen gezet. Fout 424 (4): `CodeContextObject`, het aanroepende formulier. Fout 2450 (1). Verder `Me.Controls` doorlopen (1) en `Reports(index)` (1). |
| Werkkopie of SQL | 4 | fout 3251 (2): Access-systeemtabellen (MSys…) staan niet in de werkkopie. Fout 3075 (1): `TRUNCATE TABLE`, SQL Server-syntaxis, ook in Access ongeldig. Fout 3010 (1): de code maakt een tabel die al bestaat. |

## Wat nog ontbreekt

- **Formulieren.** Procedures in formulier- en rapportmodules (387) en gebeurtenisprocedures (1.444) zijn alleen zinvol met de formulierhost van Database Studio. `For Each` over `Me.Controls` of over geopende `Forms`, `Forms(index)`/`Reports(index)` en `CodeContextObject` vragen een host-API die geopende formulieren en besturingselementen kan opsommen.
- **Gekoppelde tabellen.** Ze zijn de grootste externe oorzaak, vooral in front-ends met een aparte back-end. De werkkopie bevat alleen lokale tabellen. Een back-end die meegeladen wordt als tweede werkkopie zou dit oplossen.
- **ADO** (`ADODB`, `CurrentProject.Connection`). Het is de meest gebruikte ontbrekende bibliotheek. Een ADO-subset bovenop de werkkopie, zoals de DAO-subset, zou in deze 10 databases 173 procedures raken.
- **Geneste transacties.** Een `BeginTrans` in de code binnen de proeftransactie van `voerUitWatWerkt` geeft fout 3251. Dat kwam in deze proef niet als fout voor.
- **Systeemtabellen.** `MSysObjects` e.d. zitten niet in de werkkopie. Code die daaruit leest, faalt met 3078 of 3251.
- **Analyse.**
  - De analyse is statisch. „Onbekende naam of functie” kan ook een fout in de code zelf zijn.
  - Late binding (`Dim x As Object` met een dynamische ProgID) wordt alleen herkend aan `CreateObject`/`GetObject`.
  - De aanroepgraaf volgt klassenmethoden alleen via `Dim x As [New] Klasse` en `Set x = New Klasse`.

## Herhalen

```bash
node scripts/vba-uitvoerproef.mjs     # schrijft .local/vba-uitvoerproef.json
pnpm exec vitest run packages/vba     # o.a. ontbrekend.test.ts en extern.test.ts
```

Het rapport `.local/vba-uitvoerproef.json` (lokaal, niet in Git) bevat per database:

- de analyse (status, oorzaken, verwijzingen zonder pad);
- per uitgevoerde procedure de status, de stappen, de overgeslagen onderdelen (wat, categorie en regel) en de hostgebeurtenissen;
- bij een fout het nummer en een broncodevrije oorzaak.

De nulmeting staat in `.local/vba-uitvoerproef-voor.json`.
