# Bestandsformaten in 0.4.3

DOCX, XLSX en PPTX werken rechtstreeks in de editors. De andere onderstaande invoerextensies hebben een lokale conversieroute in de desktopversie. Daarvoor moet een conversieprogramma afzonderlijk geïnstalleerd en ingesteld zijn; zie [Conversieprogramma instellen](#conversieprogramma-instellen). Een catalogusvermelding betekent dat conversie geprobeerd kan worden; niet dat iedere variant getest of verliesvrij is.

| Module | Rechtstreeks | Via lokale conversie openen | Opslaan als / export |
|---|---|---|---|
| Tekst | DOCX | DOC, DOT, DOTX, DOCM, DOTM, ODT, OTT, FODT, RTF, TXT, HTM, HTML, XHTML, ABW, ZABW, SXW, STW, WPD, WPS, WRI, HWP, LWP, PAGES, FB2, EPUB, PSW, SDW, UOT | DOCX, MD, ODT, DOC, RTF, TXT, PDF |
| Rekenblad | XLSX | XLS, XLT, XLTX, XLSM, XLTM, XLSB, ODS, OTS, FODS, CSV, TSV, TAB, DIF, SLK, SYLK, SXC, STC, DBF, GNUMERIC, GNM, NUMBERS, WK1, WK3, WK4, WKS, 123, WB1, WB2, WQ1, WQ2, ET, ETT, UOS | XLSX, ODS, XLS, CSV, PDF |
| Presentatie | PPTX | PPT, PPS, POT, PPTM, POTM, PPSX, POTX, ODP, OTP, FODP, SXI, STI, DPS, DPT, KEY, SDD, UOP | PPTX, ODP, PPT, PPSX, PDF |

Database Studio opent MDB/ACCDB als SQLite-werkkopie; het origineel wordt nooit overschreven. De werkkopie kan als SQLite (.sqlite) worden bewaard en heropend, tabellen en queryresultaten als CSV, query’s als SQL en VBA-modules als BAS. Terugschrijven naar MDB/ACCDB wordt niet ondersteund.

Tekst exporteert Markdown (.md) rechtstreeks via de documentkern, ook in de browser en zonder conversieruntime. Kies Markdown in Opslagformaat en gebruik Opslaan als of Ctrl+S. Koppen, lijsten, links, tabellen en basisopmaak worden als UTF-8-tekst bewaard. Paginaopmaak, ingesloten afbeeldingen en revisies vragen een DOCX; een Markdown-export wist daarom de wijzigingsmarkering niet. Afgekapt resultaat wordt geweigerd. Markdown openen is nog niet aangesloten.

## Gedrag en grenzen

- Import maakt een bewerkbare OOXML-kopie. Het origineel wordt niet overschreven. Opmaak en onbekende onderdelen kunnen wijzigen.
- Strict-XLSX wordt herkend en eerst lokaal omgezet. Wachtwoordbeveiligde documenten hebben nog geen wachtwoordinvoer.
- PDF, CSV en TXT zijn exportformaten. Sla ook het bewerkbare document op; een export wist de wijzigingsmarkering niet. CSV bewaart slechts één blad.
- Met het aanbevolen conversieprofiel worden macro’s en actieve inhoud tijdens conversie niet uitgevoerd. VBA-behoud of uitvoering is niet beschikbaar.
- Bestanden: maximaal 100 MB; OOXML: maximaal 256 MB uitgepakt, 64 MB per onderdeel en 10.000 onderdelen.
- De browserversie heeft geen lokale conversie. Een ontbrekende runtime of filter levert een foutmelding op.
- PDF-import, teken- en formuleformaten, ODB, e-mailarchieven, volledige template-export en een groot aantal beeld-/tekenfilters zijn nog niet aangesloten. Dit is nog geen volledige formaatdekking.

De catalogus laat de runtime per uitvoerextensie het standaardexportfilter kiezen; alleen voor TXT legt hij UTF-8 vast. Beschikbaarheid verschilt per lokale runtimeversie. Zie het [testverslag met weigeringen en resterend werk](tests/2026-10-21-formaten.md).

## Conversieprogramma instellen

De desktopversie zoekt het conversieprogramma niet zelf; het wordt ook niet met de installers meegeleverd. Stel het in met omgevingsvariabelen voordat je de app start:

- `OPENAEC_CONVERSIE_PROGRAMMA`: het volledige pad naar het uitvoerbare bestand van een kantoorruntime die headless kan omzetten (`--headless --convert-to`).
- `OPENAEC_CONVERSIE_PROFIEL` (aanbevolen): het pad naar een profielbestand voor die runtime dat macro’s en actieve inhoud uitschakelt. Elke conversie krijgt een eigen tijdelijk profiel; dit bestand wordt daarin geplaatst.

Zonder `OPENAEC_CONVERSIE_PROGRAMMA` werken DOCX, XLSX en PPTX gewoon; andere formaten geven dan een duidelijke foutmelding.
