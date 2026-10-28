# Bestandsformaten in 0.4.3

DOCX, XLSX en PPTX werken rechtstreeks in de editors. De andere invoerextensies hieronder worden in de desktopversie lokaal geconverteerd. Daarvoor moet een kantoorruntime (LibreOffice) geïnstalleerd zijn. De app zoekt die zelf; zie [Kantoorruntime](#kantoorruntime-conversieprogramma). Een catalogusvermelding betekent dat conversie geprobeerd kan worden; niet dat iedere variant getest of verliesvrij is.

| Module | Rechtstreeks | Via lokale conversie openen |
|---|---|---|
| Tekst | DOCX | DOC, DOT, DOTX, DOCM, DOTM, ODT, OTT, FODT, RTF, TXT, HTM, HTML, XHTML, ABW, ZABW, SXW, STW, WPD, WPS, WRI, HWP, LWP, PAGES, FB2, EPUB, PSW, SDW, UOT |
| Rekenblad | XLSX | XLS, XLT, XLTX, XLSM, XLTM, XLSB, ODS, OTS, FODS, CSV, TSV, TAB, DIF, SLK, SYLK, SXC, STC, DBF, GNUMERIC, GNM, NUMBERS, WK1, WK3, WK4, WKS, 123, WB1, WB2, WQ1, WQ2, ET, ETT, UOS |
| Presentatie | PPTX | PPT, PPS, POT, PPTM, POTM, PPSX, POTX, ODP, OTP, FODP, SXI, STI, DPS, DPT, KEY, SDD, UOP |

## Opslaan als

Open het venster Opslaan als met de knop in de kopbalk of met Ctrl+Shift+S. Daarin kies je de bestandsnaam en het formaat. Elk formaat toont wat er behouden blijft en hoe het gemaakt wordt:

- **in de app**: de app maakt het bestand zelf met de engines, ook in de browser en zonder runtime;
- **via kantoorruntime**: de desktopapp converteert met LibreOffice;
- **via Afdrukken**: PDF zonder runtime.

Ctrl+S bewaart opnieuw in het laatst gekozen formaat. Alleen het eigen formaat (DOCX/XLSX/PPTX) haalt de markering "gewijzigd" weg. Elk ander formaat is een kopie: het document blijft als gewijzigd gemarkeerd tot het in het eigen formaat is bewaard. Het venster legt dat uit. Bij een conversie naar een bewerkbaar formaat staat de verliesmelding van de pakketcontrole (`risicoBeleid`) al vóór het opslaan in het venster.

| Groep | Tekst | Rekenblad | Presentatie |
|---|---|---|---|
| Eigen formaat | DOCX (app) | XLSX (app) | PPTX (app), PPSX |
| OpenDocument | ODT, FODT | ODS, FODS | ODP, FODP |
| Oudere Office-formaten | DOC | XLS | PPT, PPS |
| Sjablonen | DOTX, DOT, OTT | XLTX, XLT, OTS | POTX, POT, OTP |
| Macro-ingeschakeld | — | — | — |
| Web en tekst | RTF, TXT¹, HTML¹, XHTML, EPUB, MD (app) | CSV (app), TSV (app), HTML¹, DIF, SLK, MD (app) | HTML (app), MD (app) |
| PDF en afbeelding | PDF², PNG (eerste pagina) | PDF², PNG (app, één blad) | PDF², PNG (app, gekozen dia) |

¹ Via de runtime; zonder runtime maakt de app een eenvoudige, gesaneerde versie uit de documentstructuur.
² Via de runtime, met keuze voor PDF/A-1b/2b/3b, een pagina- of diabereik en (tekst) koppen als bladwijzers. Zonder runtime gaat het via Afdrukken → "Opslaan als PDF".

Formaten zonder "(app)" zijn alleen beschikbaar in de desktopapp met kantoorruntime. In de browser staan ze grijs met de vermelding "alleen in de desktopapp".

Elk formaat in deze tabel is met de drie eigen voorbeelden echt gemaakt en opnieuw geopend; zie het [testverslag Opslaan als](tests/2026-10-27-opslaan-als.md). Daar staat per formaat ook het gebruikte exportfilter.

Niet opgenomen:

- **DOCM, XLSM, PPTM**: de app bewaart geen VBA, dus een macrobestand zonder macro's zou misleiden.
- **DBF**: de runtime weigert de export van het voorbeeld.
- **SVG van een presentatie**: het bestand bevat navigatiescript.
- **HTML van een presentatie via de runtime**: dat levert meerdere losse bestanden op.

### Routes zonder runtime (ook in de browser)

- **Markdown** (alle modules): uit de engines (`exportDocxMarkdown`, `exportXlsxMarkdown`, `exportPptxMarkdown`), zonder bronankers. Diakoppen worden "Dia 1", "Dia 2" enzovoort.
- **CSV/TSV** (rekenblad):
  - één blad naar keuze (standaard het actieve blad), met waarden in plaats van formules;
  - standaard puntkomma met decimale komma (Nederlandse instellingen). Een komma als scheidingsteken krijgt een decimale punt;
  - codering UTF-8 met BOM (standaard), UTF-8 of Windows-1252 (met een melding als tekens zijn vervangen);
  - tekst die met `=`, `+`, `-`, `@`, een tab of een regeleinde begint krijgt een apostrof (bescherming tegen CSV-injectie, net als in Database Studio). Echte getallen blijven ongewijzigd.
- **TXT en HTML** (tekst): uit de Markdown van de documentkern, gesaneerd weergegeven. HTML is één bestand zonder scripts of externe bronnen, met een strikt Content-Security-Policy. Rekenblad-HTML is per blad een tabel met samengevoegde cellen. Presentatie-HTML bevat de tekst per dia.
- **PNG**: het gebruikte bereik van een rekenblad via de engine (`renderRangePng`), of de gekozen dia (standaard de huidige) via dezelfde tekenroutine als de editor (`slideToPng`).
- **PDF via Afdrukken**: het afdrukvenster van de editor. Een presentatie wordt afgedrukt als één dia per liggende pagina. Kies in het afdrukvenster de printer "Opslaan als PDF" (Windows: "Microsoft Print to PDF").

Database Studio opent MDB/ACCDB als SQLite-werkkopie; het origineel wordt nooit overschreven. De werkkopie kan als SQLite (.sqlite) worden bewaard en heropend, tabellen en queryresultaten als CSV, query’s als SQL en VBA-modules als BAS. Terugschrijven naar MDB/ACCDB wordt niet ondersteund.

Markdown (.md) uit Tekst bewaart koppen, lijsten, links, tabellen en basisopmaak als UTF-8-tekst. Paginaopmaak, ingesloten afbeeldingen en revisies vragen een DOCX; een Markdown-export wist daarom de wijzigingsmarkering niet. Afgekapt resultaat wordt geweigerd.

### CSV en TSV importeren

CSV, TSV en TAB openen altijd via het eigen importvenster (`src/import/csvimport.ts`), ook in de browser en ook als er een runtime is:

- scheidingsteken (puntkomma, komma, tab, verticale streep of eigen teken), tekstafbakening (", ' of geen) en tekencodering (UTF-8, Windows-1252, ISO-8859-15, UTF-16) worden herkend en zijn te wijzigen;
- getalnotatie Nederlands (1.234,56) of Engels (1,234.56), datumvolgorde dag-maand-jaar, maand-dag-jaar of jaar-maand-dag, kopregel en beginrij;
- per kolom het type: Standaard, Tekst, Datum of Overslaan. De voorvertoning van de eerste 50 rijen verandert direct mee;
- in Standaard blijven waarden met een voorloopnul (postcodes, telefoonnummers) en met meer dan 15 cijfers (IBAN, EAN, ordernummers) tekst. Getallen met een andere notatie dan gekozen blijven ook tekst, zodat niets stil verkeerd wordt omgerekend;
- waarden die met `=`, `+`, `-` of `@` beginnen en geen getal zijn, komen als tekst met apostrofvoorvoegsel in het blad: nooit als formule (CSV-injectie). Het rapport telt ze;
- het resultaat is een XLSX met één blad, een vastgezette en gefilterde kopregel en datumnotatie volgens de gekozen volgorde. Ctrl+S stelt weer CSV (of TSV) voor, met de melding dat alleen het actieve blad wordt bewaard.

### Tekstformaten openen zonder runtime

TXT, Markdown, HTML en RTF zet de app zelf om naar een nieuwe DOCX-kopie in een nieuw tabblad (`src/import/`), ook in de browser. Het rapport na openen zegt wat er is overgenomen en wat niet.

- **TXT**: codering herkend (BOM, UTF-8, UTF-16 met en zonder BOM, anders Windows-1252) en regeleinden (CRLF, LF, CR, gemengd). Elke regel wordt een alinea; tabs blijven tabs. Ctrl+S stelt weer TXT voor; Opslaan als TXT biedt UTF-8, UTF-8 met BOM of Windows-1252.
- **Markdown** (`.md`, `.markdown`, CommonMark met GFM): koppen, opmaak, geneste en genummerde lijsten, takenlijsten, koppelingen, tabellen, codeblokken, citaten en ingesloten data-afbeeldingen (PNG, JPEG, GIF). Externe of lokale afbeeldingen worden niet opgehaald en staan als tekst. Ruwe HTML wordt alleen als tekst overgenomen. Voetnoten worden gewone tekst met een nummer.
- **HTML** (`.htm`, `.html`, `.xhtml`): eigen, tolerante lezer zonder DOM. Koppen, alinea’s, opmaak (ook `style` voor vet, cursief, onderstreept en kleur), lijsten, tabellen, koppelingen (alleen http, https, mailto en tel) en data-afbeeldingen. Scripts, stijlbladen, formulieren, iframes en externe bronnen worden nooit geladen of uitgevoerd. Codering via BOM, `<meta charset>` of herkenning.
- **RTF**: eigen eenvoudige lezer (`src/import/rtfbestand.ts`) voor tekst met codepagina’s en Unicode, vet, cursief, onderstreept, doorgehaald, super- en subschrift, grootte, kleur, uitlijning, koppen, tabs, regel- en pagina-einden, eenvoudige tabellen, hyperlinks en PNG/JPEG-afbeeldingen. Niet: kop- en voetteksten, voet- en eindnoten, opmerkingen, objecten, WMF/EMF, tekstvakken, geneste tabellen, samengevoegde cellen en echte lijstnummering (de zichtbare opsommingstekst blijft staan). Wat overgeslagen is, staat in het rapport.
- In de desktopapp met kantoorruntime gaan HTML en RTF eerst via de runtime (hogere trouw). Mislukt dat, dan valt de app terug op de eigen lezer en meldt dat.
- Opslaan als HTML vanuit Tekst sluit de afbeeldingen nu als data-URL in (alleen PNG, JPEG en GIF uit de hoofdtekst).
- RTF opslaan kan alleen via de kantoorruntime.

## Rapport bij onvolledige ondersteuning

Na het openen staat er één niet-blokkerende melding boven het document als iets niet volledig wordt ondersteund (`src/import/rapport.ts`). Onder **Details** staat per onderdeel wat de app ermee doet, met **Kopiëren** en **Bewaren als tekst** om het rapport bij een foutmelding te voegen.

- Rechtstreeks geopende OOXML: ingebedde objecten, grafieken, onbekende onderdelen en extensies, aangepaste XML, formulier- en ActiveX-besturingselementen, digitale handtekeningen en VBA. Voor rekenbladen ook draaitabellen, slicers, externe koppelingen en gegevensverbindingen. Bij rekenbladen staat erbij dat behoud bij opslaan nog niet gemeten is.
- Omgezette bestanden: de omzetting zelf en het in de testmatrix aangetoonde verlies.
- Vóór opslaan toont Opslaan als hetzelfde soort rapport: aangetoond verlies, ongemeten kenmerken (rekenbladen via de runtime), vervallende macro’s of wachtwoordbeveiliging en wat een tekstformaat niet bewaart. Annuleren of Opslaan blijft de keuze; aangetoond engineverlies blijft opslaan in het eigen formaat blokkeren.

## Gedrag en grenzen

- Import maakt een bewerkbare OOXML-kopie. Het origineel wordt niet overschreven. Opmaak en onbekende onderdelen kunnen wijzigen.
- Strict-XLSX wordt herkend en eerst lokaal omgezet. Wachtwoordbeveiligde documenten hebben nog geen wachtwoordinvoer.
- Alles behalve het eigen formaat is een kopie. Sla ook het bewerkbare document op; een kopie wist de wijzigingsmarkering niet. CSV, TSV, DIF en PNG van een rekenblad bevatten één blad.
- Met het veilige standaardprofiel worden macro’s tijdens conversie niet uitgevoerd. VBA-behoud of -uitvoering is niet beschikbaar.
- Bestanden: maximaal 100 MB; OOXML: maximaal 256 MB uitgepakt, 64 MB per onderdeel en 10.000 onderdelen.
- De browserversie heeft geen lokale conversie. Daar zijn alleen de routes zonder runtime beschikbaar (zie hierboven). Een ontbrekende runtime of filter levert een foutmelding op.
- PDF-import, teken- en formuleformaten, ODB, e-mailarchieven, volledige template-export en een groot aantal beeld-/tekenfilters zijn nog niet aangesloten. Dit is nog geen volledige formaatdekking.

De catalogus legt per uitvoerformaat het exportfilter en eventuele standaardopties vast (bijvoorbeeld UTF-8 voor TXT, puntkomma en BOM voor CSV). Rust leest diezelfde catalogus en bouwt het filterargument zelf op. Gekozen opties (CSV: scheidingsteken, codering, blad; PDF: PDF/A, bereik, bladwijzers) gaan als gecontroleerde JSON-kop (`x-office-opties`) naar Rust. Onbekende of ongeldige waarden worden geweigerd. Welke filters beschikbaar zijn, verschilt per runtimeversie; beproefd met LibreOffice 24.2. Zie het [testverslag met weigeringen en resterend werk](tests/2026-10-21-formaten.md).

## Kantoorruntime (conversieprogramma)

De runtime wordt niet met de installers meegeleverd. De desktopapp vindt hem in deze volgorde:

1. `OPENAEC_CONVERSIE_PROGRAMMA`: het volledige pad naar het programma. Dit heeft altijd voorrang.
2. Een programma dat je in de app hebt gekozen: Opslaan als → "Conversieprogramma kiezen". Het pad wordt bewaard in `conversie.json` in de app-gegevensmap. De app accepteert alleen een bestaand, uitvoerbaar bestand met de naam `soffice`, `soffice.exe` of `soffice.bin`.
3. Automatisch, op vaste, bekende installatiepaden. Er wordt niet door andere mappen gezocht:
   - Linux: `/usr/bin/soffice`, `/usr/lib/libreoffice/program/soffice`, `/usr/lib64/libreoffice/program/soffice`, `/opt/libreoffice*/program/soffice` (nieuwste eerst), de Flatpak-export `org.libreoffice.LibreOffice` (systeem en gebruiker), en daarna `soffice` in het zoekpad (gelijk aan `which soffice`).
   - macOS: `/Applications/LibreOffice.app/Contents/MacOS/soffice`, daarna `soffice` in het zoekpad.
   - Windows: `%ProgramFiles%\LibreOffice\program\soffice.exe`, `%ProgramW6432%\…` en `%ProgramFiles(x86)%\…`.

Opslaan als toont welk programma is gevonden, de versie (`soffice --version`) en de bron (omgeving, zelf gekozen of automatisch). Dat komt van het Tauri-commando `conversie_status`.

### Veilig profiel

Zonder `OPENAEC_CONVERSIE_PROFIEL` krijgt elke conversie een nieuw tijdelijk profiel met het ingebouwde veilige profiel (`src-tauri/src/conversieprofiel.xcu`):

- macro-beveiliging op het hoogste niveau (`MacroSecurityLevel=3`), macro-uitvoering uit (`DisableMacrosExecution`) en geen vertrouwde locaties;
- externe koppelingen worden bij het laden niet bijgewerkt (Calc en Writer: "nooit");
- links uit onvertrouwde documenten geblokkeerd;
- updatecontrole, eerste-startassistent en documentherstel uit.

`DisableActiveContent` staat bewust niet aan. In LibreOffice 24.2 breekt de PDF-export van DOCX met grafieken daarmee af (SIGABRT). Zie het [testverslag](tests/2026-10-27-opslaan-als.md#veilig-profiel-en-docx-met-grafieken).

Met `OPENAEC_CONVERSIE_PROFIEL` gebruik je een eigen profielbestand. Tijdslimiet (45 s, daarna wordt de procesgroep gestopt) en groottegrens (100 MB in en uit) gelden altijd.

Zonder runtime werken DOCX, XLSX en PPTX gewoon, net als alle routes "in de app". Andere formaten geven dan een duidelijke melding, met in de desktopapp de knop om het programma te kiezen.
