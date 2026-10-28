# Opslaan als in Office-formaten — 27 oktober 2026

Opslaan als werkt nu met een groter aantal Office-formaten. Elk formaat in de catalogus (`src/formaten.json`) is met de drie eigen voorbeelden echt gemaakt. Daarna is het resultaat opnieuw geopend of teruggezet en gecontroleerd. Een formaat staat alleen in de catalogus als die proef met de geïnstalleerde runtime slaagde.

- Runtime: LibreOffice 24.2.7.2 (`/usr/bin/soffice`, automatisch gevonden), Linux.
- Voorbeelden: `docs/voorbeelden/Ontwerpnotitie.docx`, `Materiaaloverzicht.xlsx` (eerst door de rekenbladengine bewaard, net als in de app) en `Ontwerpvisie.pptx` (3 dia's).
- Profiel: het ingebouwde veilige profiel (`src-tauri/src/conversieprofiel.xcu`). Elke conversie krijgt een nieuw tijdelijk profiel.

```bash
node scripts/test-opslaan-als.mjs            # 49 controles, uitvoer in .local/opslaan-als/
node scripts/maak-grafiekdocx.mjs            # maakt src-tauri/tests/grafiek.docx opnieuw
cd src-tauri && cargo test && cargo test conversie -- --ignored --test-threads=1
pnpm exec vitest run src/export src/markdown.test.ts
```

## Hoe is gecontroleerd

- **Bewerkbare formaten** (eigen formaat, OpenDocument, oudere Office-formaten, sjablonen, RTF, SYLK en DIF): eerst omgezet en daarna met de runtime terug naar OOXML. Het resultaat is met de eigen engines gelezen.
  - Tekst: de kernzinnen en de tabel zijn aanwezig.
  - Rekenblad: formule `SUM(G7:G14)` in G17 en uitkomst 3068.
  - Presentatie: 3 dia's en de diatekst.
- **PDF**: met `pdfinfo` het aantal pagina's geteld. Met `pdftotext` gecontroleerd dat de tekst leesbaar is. Bij presentaties moet het aantal pagina's gelijk zijn aan het aantal dia's.
- **TXT/HTML/XHTML/EPUB/MD**: de kerntekst is aanwezig en er staat geen `<script>` in.
- **CSV/TSV**: de totaalregel met 3068 is aanwezig, en BOM en scheidingsteken zijn gecontroleerd.
- **PNG**: handtekening en afmetingen gecontroleerd.
- **Engineroutes**: dezelfde code als in de browser (`src/export/index.ts`), in Node geladen via Vite.

## Resultaat per formaat

| Module | Formaat | Route | Filter | Resultaat | Behoud / opmerking |
|---|---|---|---|---|---|
| Tekst | DOCX | engine (runtime voor import) | `MS Word 2007 XML` | geslaagd | bewerkbaar |
| Tekst | ODT | runtime | `writer8` | geslaagd | tekst en tabel na terugzetten behouden |
| Tekst | FODT | runtime | `OpenDocument Text Flat XML` | geslaagd | idem |
| Tekst | DOC | runtime | `MS Word 97` | geslaagd | idem |
| Tekst | DOTX | runtime | `MS Word 2007 XML Template` | geslaagd | idem |
| Tekst | DOT | runtime | `MS Word 97 Vorlage` | geslaagd | idem |
| Tekst | OTT | runtime | `writer8_template` | geslaagd | idem |
| Tekst | RTF | runtime | `Rich Text Format` | geslaagd | idem |
| Tekst | TXT | runtime; zonder runtime engine | `Text (encoded):UTF8` | geslaagd (beide) | alleen tekst; engine zet tabelcellen tab-gescheiden |
| Tekst | HTML | runtime; zonder runtime engine | `HTML (StarWriter):EmbedImages` | geslaagd (beide) | engine-HTML is gesaneerd, met CSP en zonder scripts; runtime terug naar DOCX: tekst en tabel behouden |
| Tekst | XHTML | runtime | `XHTML Writer File` | geslaagd | tekst aanwezig |
| Tekst | EPUB | runtime | `EPUB` | geslaagd | 9 onderdelen, tekst aanwezig |
| Tekst | MD | engine | — | geslaagd | tekst en structuur |
| Tekst | PDF | runtime; zonder runtime Afdrukken | `writer_pdf_Export` | geslaagd | 1 pagina, leesbare tekst |
| Tekst | PNG | runtime | `writer_png_Export` | geslaagd | alleen eerste pagina (817×1057) |
| Rekenblad | XLSX | engine (runtime voor import) | `Calc MS Excel 2007 XML` | geslaagd | 9 formules, totaal 3068 |
| Rekenblad | ODS | runtime | `calc8` | geslaagd | 9 formules, totaal 3068 na terugzetten |
| Rekenblad | FODS | runtime | `OpenDocument Spreadsheet Flat XML` | geslaagd | idem |
| Rekenblad | XLS | runtime | `MS Excel 97` | geslaagd | idem |
| Rekenblad | XLTX | runtime | `Calc MS Excel 2007 XML Template` | geslaagd | idem |
| Rekenblad | XLT | runtime | `MS Excel 97 Vorlage/Template` | geslaagd | idem |
| Rekenblad | OTS | runtime | `calc8_template` | geslaagd | idem |
| Rekenblad | CSV | engine (ook runtime beproefd) | `Text - txt - csv (StarCalc)` + opties | geslaagd (beide) | één blad, waarden; engine-uitvoer is regel voor regel gelijk aan die van de runtime |
| Rekenblad | TSV | engine (ook runtime beproefd) | idem met tab (9) | geslaagd (beide) | idem |
| Rekenblad | HTML | runtime; zonder runtime engine | `HTML (StarCalc)` | geslaagd (beide) | alleen weergave; formules vervallen |
| Rekenblad | DIF | runtime | `DIF` | geslaagd | alleen eerste blad; waarde 3068 behouden, formules vervallen |
| Rekenblad | SLK | runtime | `SYLK` | geslaagd | formules en 3068 behouden; opmaak grotendeels niet |
| Rekenblad | MD | engine | — | geslaagd | waarden als tabel |
| Rekenblad | PDF | runtime; zonder runtime Afdrukken | `calc_pdf_Export` | geslaagd | 3 pagina's, leesbare tekst (€ 3.068,00) |
| Rekenblad | PNG | engine | — | geslaagd | gebruikt bereik van het gekozen blad (2399×1142) |
| Presentatie | PPTX | engine (runtime voor import) | `Impress MS PowerPoint 2007 XML` | geslaagd | 3 dia's en tekst |
| Presentatie | PPSX | runtime | `Impress MS PowerPoint 2007 XML AutoPlay` | geslaagd | 3 dia's en tekst na terugzetten |
| Presentatie | ODP | runtime | `impress8` | geslaagd | idem |
| Presentatie | FODP | runtime | `OpenDocument Presentation Flat XML` | geslaagd | idem |
| Presentatie | PPT | runtime | `MS PowerPoint 97` | geslaagd | idem |
| Presentatie | PPS | runtime | `MS PowerPoint 97 AutoPlay` | geslaagd | idem |
| Presentatie | POTX | runtime | `Impress MS PowerPoint 2007 XML Template` | geslaagd | idem |
| Presentatie | POT | runtime | `MS PowerPoint 97 Vorlage` | geslaagd | idem |
| Presentatie | OTP | runtime | `impress8_template` | geslaagd | idem |
| Presentatie | HTML | engine | — | geslaagd | alleen tekst per dia (“Dia 1”, …) |
| Presentatie | MD | engine | — | geslaagd | idem, met notities |
| Presentatie | PDF | runtime; zonder runtime Afdrukken | `impress_pdf_Export` | geslaagd | 3 pagina's = 3 dia's |
| Presentatie | PDF/A-2b, dia 1–2 | runtime met opties | JSON-filteropties | geslaagd | 2 pagina's en een PDF/A-kenmerk |
| Presentatie | PNG | engine (live editor) | — | geslaagd in de browser | huidige dia (2560×1440 bij schaal 2); niet in Node te beproeven (canvas) |

In totaal slaagden 49 van de 49 controles. Een runtimeconversie duurde hier 2,5 tot 10 seconden, inclusief het opstarten van het programma met een nieuw profiel. Een engine-export duurde 26 tot 350 ms (Markdown voor tekst: 3,2 s, vooral voor het laden van de documentkern).

## Bewust weggelaten

- **DOCM, XLSM, PPTM**: de runtime kan ze schrijven, maar de app bewaart geen VBA. Bestanden met macro's worden bij het openen al omgezet zonder het VBA-project. Een "macro-ingeschakeld" bestand zonder macro's zou misleiden, dus de groep blijft leeg.
- **DBF** (`dBase`): de conversie gaf procescode 0, maar zonder uitvoerbestand. De runtime meldde een I/O-fout (dBase heeft een kolomkop per veld nodig). Het formaat is geweigerd en staat niet in de catalogus.
- **SVG voor presentaties** (`impress_svg_Export`): dit werkt, maar het bestand bevat navigatie-JavaScript (`<script type="text/ecmascript">`). Dat is actieve inhoud, dus het formaat is weggelaten.
- **HTML voor presentaties via de runtime** (`impress_html_Export`): dit levert een frameset met losse bestanden op in plaats van één bestand. In plaats daarvan gebruikt de app de HTML-route van de engine.
- **PNG van een presentatie via de runtime**: die geeft alleen de eerste dia. De app gebruikt de engine, die de huidige of gekozen dia tekent.

## Veilig profiel en DOCX met grafieken

De eerste versie van het profiel zette ook `DisableActiveContent=true`. Daarmee breekt de PDF-export van DOCX met grafieken af met SIGABRT (procescode 134). Dat bleek uit de grafiekencorpusproef ([verslag](2026-10-27-grafieken-corpus.md)): 29 van 30 DOCX-bestanden. Het is hier opnieuw gemeten:

| Proef | Met `DisableActiveContent` | Zonder |
|---|---|---|
| Zes DOCX met grafiek uit `.local/corpus/grafieken` → PDF | 5 × procescode 134 | 6 × geslaagd |
| Alle 30 DOCX uit dat corpus → PDF | — | 26 geslaagd; 4 `xceed-docx-*` niet laadbaar, ook zonder profiel (“source file could not be loaded”) |
| Eigen `src-tauri/tests/grafiek.docx` → PDF | procescode 134, geen PDF | PDF met grafiektitel “Kosten”, categorieën en as |

De afweging: in deze runtime schakelt `DisableActiveContent` vooral ingesloten OLE-objecten uit, en een grafiek is zo'n object. De instelling is daarom uit het profiel gehaald. Macro's blijven uit via `MacroSecurityLevel=3` en `DisableMacrosExecution=true`, zonder vertrouwde locaties. Externe koppelingen worden bij het laden niet bijgewerkt: in Calc staat `Link` op 1 (nooit), in Writer op 0 (nooit). Links uit onvertrouwde documenten worden geblokkeerd (`BlockUntrustedRefererLinks`). Updatecontrole en documentherstel staan uit.

Een Rust-proef (`docx_met_grafiek_naar_pdf`) en de Node-proef controleren dit voortaan. Een eenheidsproef controleert dat de instelling niet terugkomt.

## Browser

Beproefd in de ontwikkelserver (`http://localhost:1420`), zonder runtime:

- **CSV**: Materiaaloverzicht.csv met BOM, puntkomma's, decimale komma's en de regel `;Totaal materiaal;;;;;3068;`. De inhoud is gelijk aan de CSV van de runtime. Melding na afloop: "Het document blijft als gewijzigd gemarkeerd tot je het als .xlsx bewaart."
- **Markdown**: rekenblad (tabel) en presentatie (“## Dia 1”, met notities).
- **PNG**: het actieve rekenblad (2399×1142) en de huidige dia. Dia 2 was geselecteerd, stond in het venster voorgeselecteerd en is ook zo bewaard.
- **PDF via Afdrukken**: bij de presentatie ontstaat een afdrukframe met 3 geladen dia-afbeeldingen (één per liggende pagina). Het venster legt uit dat je "Opslaan als PDF" kiest. De afdrukaanroep is in de test onderschept; er is geen echte printerdialoog bediend.
- Runtimeformaten staan in de browser grijs, met de vermelding “alleen in de desktopapp”.

## Nog niet beproefd

- De native desktopapp zelf: de knop "Conversieprogramma kiezen", de opslagdialoog en het kiezen van PDF/A in het venster. De Rust-functies en de filteropties zijn wel met de echte runtime beproefd.
- Windows en macOS: de paden voor automatische detectie zijn vastgelegd, maar niet op die platforms gecontroleerd. Een Flatpak-runtime is niet beproefd. Daarvoor staat de werkmap onder `~/.cache/openaec-conversie`, omdat Flatpak de `/tmp` van het systeem niet ziet.
- De visuele gelijkenis van PDF en PNG met het origineel. Gecontroleerd zijn alleen tekst, pagina's, dia's en afmetingen.
