# Bestandsformaten in 0.4.3

DOCX, XLSX en PPTX werken rechtstreeks in de editors. De andere invoerextensies hieronder worden in de desktopversie lokaal geconverteerd. Daarvoor moet een kantoorruntime (LibreOffice) geïnstalleerd zijn. De app zoekt die zelf; zie [Kantoorruntime](#kantoorruntime-conversieprogramma). Een catalogusvermelding betekent dat conversie geprobeerd kan worden; niet dat iedere variant getest of verliesvrij is.

| Module | Rechtstreeks | Via lokale conversie openen |
|---|---|---|
| Tekst | DOCX | DOC, DOT, DOTX, DOCM, DOTM, ODT, OTT, FODT, RTF, TXT, HTM, HTML, XHTML, ABW, ZABW, SXW, STW, WPD, WPS, WRI, HWP, LWP, PAGES, FB2, EPUB, PSW, SDW, UOT |
| Rekenblad | XLSX | XLS, XLT, XLTX, XLSM, XLTM, XLSB, ODS, OTS, FODS, CSV, TSV, TAB, DIF, SLK, SYLK, SXC, STC, DBF, GNUMERIC, GNM, NUMBERS, WK1, WK3, WK4, WKS, 123, WB1, WB2, WQ1, WQ2, ET, ETT, UOS |
| Presentatie | PPTX | PPT, PPS, POT, PPTM, POTM, PPSX, POTX, ODP, OTP, FODP, SXI, STI, DPS, DPT, KEY, SDD, UOP |

## Opslaan als

Open het venster Opslaan als met de knop in de kopbalk, met F12 of met Ctrl+Shift+S. Daarin kies je de bestandsnaam en het formaat. Elk formaat toont wat er behouden blijft en hoe het gemaakt wordt:

- **in de app**: de app maakt het bestand zelf met de engines, ook in de browser en zonder runtime;
- **via kantoorruntime**: de desktopapp converteert met LibreOffice.

PDF maakt de app zelf (ook in de browser). Met een kantoorruntime kun je in het venster kiezen voor "Via de kantoorruntime" (PDF/A, koppen als bladwijzers).

Alleen het eigen formaat (DOCX/XLSX/PPTX) haalt de markering "gewijzigd" weg. Elk ander formaat is een kopie: het document blijft als gewijzigd gemarkeerd tot het in het eigen formaat is bewaard. Het venster legt dat uit. Bij een conversie naar een bewerkbaar formaat staat de verliesmelding van de pakketcontrole (`risicoBeleid`) al vóór het opslaan in het venster. Opslaan als in het eigen formaat maakt van het gekozen bestand het nieuwe werkbestand van het tabblad.

## Opslaan (Ctrl+S)

- **Bestand van schijf** (desktop: bestandsmenu, dubbelklik in Verkenner, recente bestanden, slepen): Ctrl+S schrijft atomair terug naar hetzelfde bestand. Het pad blijft in Rust (`src-tauri/src/werkbestanden.rs`); de webview kent alleen een token en de bestandsnaam.
- **Geïmporteerd ODT, DOC, enz.**: de eerste Ctrl+S vraagt eenmalig of het bestand in zijn eigen formaat bijgewerkt mag worden, met de verliesmelding. Daarna zet de kantoorruntime het document om en wordt het origineel bijgewerkt. Kies je "Opslaan als…", of is er geen runtime, dan opent Opslaan als.
- **Buiten de app gewijzigd of verdwenen** (grootte, wijzigingstijd en SHA-256 sinds openen of het laatste opslaan): keuze tussen overschrijven, Opslaan als en annuleren.
- **Alleen-lezen of geen schrijfrechten**: melding en Opslaan als.
- **Nieuw document of browser**: de eerste Ctrl+S opent Opslaan als; daarna bewaart Ctrl+S opnieuw met dezelfde keuze (in de browser als download).

| Groep | Tekst | Rekenblad | Presentatie |
|---|---|---|---|
| Eigen formaat | DOCX (app) | XLSX (app) | PPTX (app), PPSX |
| OpenDocument | ODT, FODT | ODS, FODS | ODP, FODP |
| Oudere Office-formaten | DOC | XLS | PPT, PPS |
| Sjablonen | DOTX, DOT, OTT | XLTX, XLT, OTS | POTX, POT, OTP |
| Macro-ingeschakeld | — | — | — |
| Web en tekst | RTF, TXT¹, HTML¹, XHTML, EPUB, MD (app) | CSV (app), TSV (app), HTML¹, DIF, SLK, MD (app) | HTML (app), MD (app) |
| PDF en afbeelding | PDF (app²), PNG (eerste pagina) | PDF (app²), PNG (app, één blad) | PDF (app²: dia's, notitiepagina's of hand-outs), PNG (app, gekozen dia) |

¹ Via de runtime; zonder runtime maakt de app een eenvoudige, gesaneerde versie uit de documentstructuur.
² De app maakt de PDF zelf, met dezelfde pagina's als het afdrukvoorbeeld; kies een paginabereik en de beeldkwaliteit. Met de runtime kan het ook via LibreOffice, met keuze voor PDF/A-1b/2b/3b en (tekst) koppen als bladwijzers.

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
- **PDF (app)**: een eigen PDF-schrijver (`src/export/pdf/`). Elke pagina van het afdrukvoorbeeld wordt een beeld in hoge resolutie (JPEG 150/200 dpi of verliesvrij 300 dpi) met daarover een onzichtbare tekstlaag in een ingesloten, glyphloos TrueType-lettertype met ToUnicode-tabel. Zo is de PDF gelijk aan het voorbeeld en de afdruk, en blijft tekst selecteerbaar en doorzoekbaar. Daarnaast: klikbare koppelingen (http, mailto, tel), bladwijzers (bladen, dia's) en documenteigenschappen (titel, auteur, onderwerp, trefwoorden) in Info en XMP. Tekst-pagina's komen uit de afdrukroutine van de editor (192 dpi), rekenbladen volgen de pagina-indeling van elk blad (afdrukbereik, schaal), presentaties als dia's, notitiepagina's of hand-outs. Nog niet: vectortekst met ingesloten lettertypesubsets, PDF/A en opmerkingen in de PDF (gebruik daarvoor de runtime). Proef: `node scripts/test-pdf-zonder-runtime.mjs`.
- **Afdrukken**: Ctrl+P (of Ctrl+Shift+O, of de knop Afdrukken) opent het afdrukvoorbeeld met paginabereik, exemplaren en de instellingen per module; afdrukken gebruikt precies die pagina's, elk op de eigen papiermaat.

Database Studio opent MDB/ACCDB als SQLite-werkkopie; het origineel wordt nooit overschreven. De werkkopie kan als SQLite (.sqlite) worden bewaard en heropend, tabellen en queryresultaten als CSV, query’s als SQL en VBA-modules als BAS. Terugschrijven naar MDB/ACCDB wordt niet ondersteund.

Markdown (.md) uit Tekst bewaart koppen, lijsten, links, tabellen en basisopmaak als UTF-8-tekst. Paginaopmaak, ingesloten afbeeldingen en revisies vragen een DOCX; een Markdown-export wist daarom de wijzigingsmarkering niet. Afgekapt resultaat wordt geweigerd. Markdown openen is nog niet aangesloten.

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

## Lettertypen

De app meet en tekent met echte lettertypebestanden. Volgorde: een meegeleverd lettertype met precies die naam (`public/fonts`), dan het lettertype van deze computer (desktop: opgesomd en gelezen met de Rust-crate `fontdb` 0.24, MIT; losse TrueType/OpenType tot 40 MB, geen .ttc-verzamelingen; browser: `queryLocalFonts` na toestemming), dan een metrisch gelijkwaardige vervanger: Calibri → Carlito, Cambria → Caladea, Arial/Helvetica → Liberation Sans, Times New Roman → Liberation Serif, Courier New → Liberation Mono, Georgia → Gelasio, Comic Sans MS → Comic Relief, en benaderingen voor onder meer Segoe UI, Verdana en Aptos (`src/lettertypen/vervanging.ts`). Ontbreekt een lettertype uit het document, dan meldt het tabblad welke lettertypen zijn vervangen. In het bestand blijven de oorspronkelijke namen staan. De lettertypekeuze in het lint toont elk lettertype in zijn eigen vorm, met recent gebruikte lettertypen bovenaan en een zoekveld.
