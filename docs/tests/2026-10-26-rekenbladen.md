# Rekenbladen: R1–R3 en onafhankelijke formulecontrole — 26 oktober 2026

Onderdeel van issue #3. Beproefd is de rekenkern `@betteroffice/xlsx` 0.3.0 (Apache-2.0) in Node 24.19.0, op een AMD Ryzen 7 3700U met 8 threads. Tijdens de metingen draaiden andere processen; de belasting lag tussen 5 en 10. Er zijn geen praktijkbestanden gebruikt. Alle gevallen zijn synthetisch en bevatten geen documentinhoud van derden.

## Herhalen

```bash
python3 scripts/maak-rekenbladfixtures.py          # schrijft .local/matrix/rekenbladen/*.xlsx en manifest.json
node scripts/test-matrix-rekenbladen.mjs           # alle proeven; rapport in .local/matrix/rekenbladen/rapport.json
python3 -m unittest discover -s tests -v           # evaluator en kenmerkcontrole
pnpm test                                          # o.a. src/rekenbladcontrole.test.ts
```

De fixtures worden met alleen de Python-standaardbibliotheek gebouwd, met vaste ZIP-tijdstempels. Twee runs geven dezelfde bytes. De Node-proef maakt ze zelf opnieuw aan.

## Fixtures

| Bestand | Matrix | Kenmerken | Bewerking |
|---|---|---|---|
| `r1-kruisverwijzingen.xlsx` | R1 | drie bladen, zes formules met kruisverwijzing, notaties `#,##0.00`, `0.0%` en euro | `Invoer!B1` 10 → 20 |
| `r2-grafiek-namen.xlsx` | R2 | staafgrafiek (drawing + chart), benoemd bereik `Omzet`, verborgen blad, `pageSetup` liggend A4, `Print_Area` en `Print_Titles` | label `Gegevens!A2` → `Noordwest` |
| `r3-validatie-draaitabel.xlsx` | R3 | twee validaties (decimaal, lijst), voorwaardelijke opmaak, draaitabel met cachedefinitie en records, onbekend onderdeel met eigen relatie en inhoudstype | `Data!C2` 10 → 15 (buiten de draaitabel) |
| `verouderde-cache.xlsx` | extra | vier formules met een bewust onjuiste `<v>`, `calcChain.xml`, geen `fullCalcOnLoad` | `Cache!A1` 2 → 4 |
| `onbekende-functies.xlsx` | extra | `ONBEKENDEFUNCTIE`, `_xludf.MIJNMACRO`, `FACT` (bestaat in Excel, niet in de rekenkern), `_xlfn.XLOOKUP`, `_xlfn.TEXTJOIN` en een afhankelijke cel | `Functies!A1` 1 → 2 |
| `foutwaarden.xlsx` | extra | `#DIV/0!`, `#REF!`, `#N/A` (NA en VLOOKUP), `#VALUE!`, `IFERROR`, `ISERROR`, foutwaarde zonder formule | `Fouten!A2` 0 → 4 |
| `nl-notatie.xlsx` | extra | `[$-413]#,##0.00`, `[$-413]d-m-yyyy`, `d-m-yyyy`, euro, procent, ingebouwde datum 14 | invoerproef, zie onder |
| `groot-werkboek.xlsx` | extra | 120.001 cellen: 6.000 rijen × 19 getallen plus een SOM per rij en één eindtotaal (6.001 formules) | `Groot!A1` → 1000 |

## Uitvoering per geval

Per bestand: openen, opslaan zonder wijziging (no-op), de bewerking via `editCell`, opslaan, heropenen. De bewerking werkt via dezelfde invoerroute als de editor. Na heropenen stond de ingevoerde waarde in alle acht gevallen in de cel.

### Pakket en kenmerken

`scripts/vergelijk_pakketten.py` meldt bij elke no-op `afwijkingen`, want de engine schrijft vier onderdelen opnieuw: `[Content_Types].xml`, `_rels/.rels`, `xl/_rels/workbook.xml.rels` en `xl/workbook.xml`. Na het wegnemen van witruimte blijven twee verschillen over; dat is nagekeken voor R1, R3 en het grote werkboek. In `xl/workbook.xml` komt `calcPr fullCalcOnLoad="1"` erbij, waardoor Excel het bestand bij openen volledig opnieuw berekent. Daarnaast verdwijnen de verwijzingen naar weggelaten onderdelen. Werkbladen zonder gewijzigde uitkomsten blijven bytegelijk. Dat geldt ook voor grafiek-, tekening-, draaitabel- en onbekende onderdelen.

Verdwenen onderdelen: `xl/calcChain.xml` (verouderde-cache) en een leeg `xl/sharedStrings.xml` (drie gevallen zonder gedeelde teksten). Excel bouwt de rekenketen zelf opnieuw op. Na de bewerking veranderden alleen de verwachte werkbladen. Bij R2 is het nieuwe label als `inlineStr` in het werkblad geschreven; `sharedStrings.xml` bleef ongewijzigd.

De eigen kenmerkcontrole (`scripts/rekenblad_kenmerken.py`) volgt relaties, niet alleen bestandsnamen. Na no-op en na bewerking waren in alle acht gevallen behouden: bladen, verborgen blad (`state="hidden"`), benoemde bereiken, afdrukbereik en -titels, `pageSetup`, grafiek met bronverwijzingen, validaties, voorwaardelijke opmaak, draaitabel met cachedefinitie en records, het onbekende onderdeel met relatie en inhoudstype, getalnotaties en formuletellingen.

| Geval | Uitkomst |
|---|---|
| R1 | Kenmerken behouden; 8 formules juist na openen, bewerking en heropenen. |
| R2 | Kenmerken behouden; 3 formules juist, ook `SUM(Omzet)` en de verwijzing naar het verborgen blad. De tekstcache in `chart1.xml` bevat nog het oude label `Noord`; de grafiek is niet visueel beoordeeld. |
| R3 | Kenmerken behouden; 2 formules juist (`C6` = 105). De draaitabel en zijn cache zijn niet vernieuwd: `Draai!B4` toont nog 40 in plaats van 45. Ook Excel vernieuwt een draaitabel pas op verzoek, maar de editor meldt het niet. |

Visuele vergelijking in de GUI, Excel of LibreOffice is niet uitgevoerd. Dit is dus een pakket- en kenmerkproef, geen weergaveproef.

## Formulecontrole

`scripts/rekenblad_formules.py` is een kleine evaluator in de Python-standaardbibliotheek, alleen voor de gebruikte functies: rekenkundige bewerkingen, vergelijkingen, `&`, verwijzingen naar andere bladen, bereiken en benoemde bereiken. Ondersteund zijn `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `IF`, `ROUND`, `IFERROR`, `ISERROR`, `NA`, `FACT`, exacte `VLOOKUP` en `XLOOKUP`, en `TEXTJOIN`. Opgeslagen `<v>`-waarden van formules worden niet gelezen. Afronding volgt Excel: eerst 15 significante cijfers, daarna half van nul af. Daardoor geeft `ROUND(22,5×1,21; 2)` 27,23 en niet 27,22. Bij een onbekende naam volgt `#NAME?`. Bestaande Excel-functies die de evaluator niet nabouwt, laten de evaluator stoppen.

De evaluator wordt in `tests/test_rekenblad_formules.py` getoetst aan handmatig afgeleide waarden, met de afleiding als commentaar. Daarna vergelijkt de Node-proef in vier fasen: na openen, na bewerking, na heropenen en de opgeslagen `<v>` in het bewerkte bestand. Per fase zijn 6.034 formulecellen vergeleken: 33 in de kleine gevallen en 6.001 in het grote werkboek. De marge is 1e-9 relatief.

- R1–R3, verouderde cache, foutwaarden en het grote werkboek: in alle fasen gelijk aan de evaluator.
- Onbekende functies: in elke fase precies vier verschillen, `C1`, `C2`, `C6` en `C7` (zie onder). Andere verschillen zijn er niet.

### Hoe de engine afwijkende gevallen afhandelt

| Geval | Gedrag van de engine | Herkenbaar? |
|---|---|---|
| Verouderde cache | Rekent bij openen opnieuw: `A3` toont 5 in plaats van de opgeslagen 999, `B1` toont `ok`. Opslaan schrijft de juiste waarden en `fullCalcOnLoad="1"`. | Nee, de correctie gebeurt stil. `formulaResult` blijft `unverified` en de exportdiagnose is algemeen. |
| Onbekende of niet-ondersteunde functie in een bestaand bestand | Toont en bewaart de opgeslagen uitkomst en rekent die niet opnieuw. Dat blijft zo nadat de invoercel is gewijzigd. `ONBEKENDEFUNCTIE` en `MIJNMACRO` houden 5 en 6, waar Excel `#NAME?` geeft. `FACT(A1)` houdt 99, waar 1 en na de bewerking 2 juist is. Afhankelijke cel `C6` gebruikt de oude waarde. | Nee, dit is stil en mogelijk onjuist. |
| Onbekende functie die in de editor wordt ingetypt | `#NAME?`. Ook `RAND()` en `WEBSERVICE()` geven `#NAME?`. | Ja, in de cel. |
| Foutwaarden | `#DIV/0!`, `#REF!`, `#N/A` en `#VALUE!` worden juist berekend en doorgegeven. `IFERROR` en `ISERROR` werken. Na de bewerking geeft `A1/A2` 2,5. | In de cel wel; er is geen overzicht. |

Van 519 Excel-functienamen (handmatig samengestelde kandidatenlijst) evalueert de engine er 216. Bij de overige 303 geeft hij `#NAME?`, waaronder `RAND`, `IRR`, `RATE`, `IPMT`, `PPMT`, `EVEN`, `ODD`, `GCD`, `LCM`, `FACT`, `COMBIN` en de databasefuncties `D*`. Bestaande bestanden met zulke functies houden dus stil hun opgeslagen uitkomst. Dat is aangetoond met `FACT` in de fixture, en daarbuiten los nagegaan met `RAND` en `IRR`.

Gevonden enginefout: `=ISOWEEKNUM()` zonder argument laat de WASM-kern vastlopen (`RuntimeError: unreachable`). Daarna geeft elke aanroep op hetzelfde werkboek `recursive use of an object detected…`. Alleen een nieuw geopend werkboek werkt weer. In de editor kan zo’n invoer niet-opgeslagen werk onbruikbaar maken. Dat is afgeleid uit de Node-proef en niet in de GUI nagespeeld. `ISOWEEKNUM(1)` geeft `#NUM!`; dat is niet met Excel vergeleken.

## Hulpmodule voor herkenbare meldingen

Omdat de engine verouderde caches en onbekende functies stil afhandelt, inventariseert `src/rekenbladcontrole.ts` die gevallen apart. De module leest de pakketbytes met `fflate`, los van de engine. Er zijn grenzen van 100 MiB per onderdeel en in totaal. De module vindt:

- functies buiten `ONDERSTEUNDE_FUNCTIES` (de 216 gemeten namen), ook `_xludf.`-gebruikersfuncties en gedeelde formules;
- foutcellen per foutwaarde, met en zonder formule;
- formules zonder opgeslagen uitkomst, `fullCalcOnLoad`, `calcMode="manual"`, `calcChain` en externe koppelingen;
- met `vergelijkCache` en `leesUitWerkboek`: cellen waarvan de opgeslagen uitkomst afwijkt van wat de engine bij openen herberekende.

`rekenbladMelding` maakt daar een Nederlandse melding van, met ernst `waarschuwing` of `info`, een titel en regels. Er zijn tien Vitest-proeven. De Node-proef controleert bij elke run dat de functielijst exact overeenkomt met de engine. Ook op de fixtures zijn de signalen gecontroleerd. Bij `verouderde-cache` zijn `A3`, `A4`, `A5` en `B1` gevonden. Bij `onbekende-functies` zijn `FACT`, `ONBEKENDEFUNCTIE` en `_XLUDF.MIJNMACRO` gevonden. Bij `foutwaarden` zijn vier soorten fouten in zeven cellen gevonden, en R1–R3 gaven geen melding.

De module is nog niet aan de interface gekoppeld. Aanroep direct na `onReady` van `XlsxEditor`, vóór de eerste bewerking:

```ts
import { inventariseerRekenblad, leesUitWerkboek, rekenbladMelding, vergelijkCache } from "./rekenbladcontrole";

const controle = inventariseerRekenblad(bytes); // dezelfde bytes als `file`
const afwijkend = vergelijkCache(controle, leesUitWerkboek(api.handle, controle));
const melding = rekenbladMelding(controle, afwijkend); // null als er niets te melden is
```

Toon `melding.titel` en `melding.regels` in een niet-blokkerende melding, met `role="status"` of bij een waarschuwing `role="alert"`. Doe het nooit stil. Na een engine-update moet de proef opnieuw draaien. Faalt de functielijst, stel die dan opnieuw vast.

## Nederlandse getallen en datums

Opgeslagen waarden worden in Engelse notatie weergegeven, ook met de taalcode `[$-413]`:

| Notatie | Waarde | Weergave door de engine | Nederlandse verwachting |
|---|---|---|---|
| `[$-413]#,##0.00` en `#,##0.00` | 1234,5 | `1,234.50` | `1.234,50` |
| `0.0%` | 0,155 | `15.5%` | `15,5%` |
| `[$€-413]\ #,##0.00` | 1234,5 | `€ 1,234.50` | `€ 1.234,50` |
| `d-m-yyyy`, ook met `[$-413]` | 46321 | `26-10-2026` | gelijk |
| ingebouwd 14 (korte datum) | 46321 | `10/26/26` | `26-10-2026` |

Invoer via `editCell` en via `applyEdits` met `setCellInputs`: `1,5`, `1.234,5`, `26-10-2026`, `2026-10-26` en `10/26/2026` worden allemaal **tekst**. Dat geldt ook in cellen met een Nederlandse getal- of datumnotatie. Alleen `1.5` wordt het getal 1,5. De editorlaag (`src/editors.tsx`, `src/nederlands.ts`) vertaalt alleen bedieningsteksten en zet invoer ongewijzigd door. Nederlandse invoer is dus nu onjuist: `1,5` telt niet mee in een `SOM`. Er komt geen melding. Dit is niet opgelost. Een invoervertaling vóór `editCell` is nodig, of een locale-ondersteuning in de engine.

## Toegankelijkheid (codelezing)

Niet met een schermlezer beproefd. Gelezen in `@betteroffice/xlsx-react` 0.3.0:

- De editor heeft `role="application"` met het label `editor.appLabel`. Er is een werkbalk (`toolbar`), en bladtabs gebruiken `tablist`/`tab`/`tabpanel`. Menu’s gebruiken `menuitem`, `menuitemcheckbox` en `menuitemradio`, en dialogen `aria-modal`.
- Het canvas wordt gespiegeld in een visueel verborgen `role="grid"` met `row`, `columnheader`, `rowheader` en `gridcell` met `aria-selected`. Dat geldt alleen voor de zichtbare cellen van het huidige frame. Grafieken krijgen `role="img"` met label. Fouten gebruiken `role="alert"`.
- Toetsenbord: pijltoetsen, Home/End, PageUp/PageDown, Tab, Enter, F2 en Escape, met Shift voor uitbreiden. Er is geen `aria-activedescendant` en geen `aria-live` voor de actieve cel.
- `rekenbladNl` vult de `a11y`-teksten niet in. Schermlezerlabels zoals `Spreadsheet grid`, `Row {row}` en `{address}, empty` blijven daardoor Engels. `RekenbladKoppen` is terecht `aria-hidden`.

## Groot werkboek

120.001 cellen, 6.001 formules, 545 kB XLSX. Er zijn zes runs gedaan, steeds in één Node-proces na de kleinere gevallen. De belasting van de machine lag tussen 5 en 10.

| Stap | Gemeten |
|---|---|
| Openen (inclusief herberekening) | 2,7–5,9 s |
| 6.001 formulecellen lezen (`readCells`) | 132–415 ms |
| Opslaan zonder wijziging | 33–65 ms |
| Eén invoercel wijzigen (herberekent rij- en eindtotaal) | 242–405 ms |
| Opslaan na wijziging | 345–574 ms |
| Heropenen | 2,4–3,8 s |
| RSS na afloop / toename tijdens het geval | 356–404 MiB / 231–244 MiB |

De spreiding komt waarschijnlijk door de wisselende achtergrondbelasting. De uitkomsten zijn na bewerking en heropenen gelijk aan de evaluator. Dit is een Node-meting zonder browser, canvas of React; de browserbelasting is niet gemeten.

## Vergelijking met een permissieve rekenkern

Niet gemeten. Er is geen nieuw pakket geïnstalleerd. De referentie in deze ronde is de eigen evaluator: onafhankelijk, maar klein en beperkt tot de gebruikte functies. Kandidaten voor een vervolgproef, op dezelfde fixtures:

- IronCalc (Rust/WASM): opgegeven als MIT/Apache-2.0.
- formula.js: MIT; alleen functies, geen afhankelijkheidsgraaf.
- fast-formula-parser: MIT.

HyperFormula valt af als permissief alternatief, omdat het onder GPLv3 of een commerciële licentie wordt aangeboden. Deze licenties zijn de vermelding van de projecten zelf en niet opnieuw gecontroleerd. Pas na meting kan iets worden gezegd over juistheid, functiedekking of snelheid.

## Automatische controles

- `node scripts/test-matrix-rekenbladen.mjs`: geslaagd, inclusief de controles op formules, signalen en de functielijst.
- `python3 -m unittest discover -s tests`: 33 geslaagd, waarvan 15 nieuw (`test_rekenblad_formules.py` en `test_rekenblad_kenmerken.py`).
- `pnpm test`: 149 geslaagd in 13 bestanden, waarvan 10 nieuw in `src/rekenbladcontrole.test.ts`. De overige proeven komen uit parallel werk.
- `pnpm exec tsc --noEmit`: geslaagd.

## Grenzen

Alleen synthetische fixtures zijn gebruikt, geen praktijkbestanden. Er is geen visuele vergelijking gedaan en de proef liep niet in de GUI of browser. De evaluator dekt alleen de gebruikte functies. De lijst van 519 kandidaten is handmatig samengesteld; functies die daarin ontbreken, zijn niet gemeten. De hulpmodule ontleedt XML met reguliere expressies en is geen volledige OOXML-parser. Een exotisch maar geldig bestand kan daardoor signalen missen.
