# Bestandsformaten in 0.4.3

DOCX, XLSX en PPTX werken rechtstreeks in de editors. De andere onderstaande invoerextensies hebben een lokale conversieroute in de desktopversie. Daarvoor moet LibreOffice afzonderlijk geïnstalleerd zijn. Een catalogusvermelding betekent dat conversie geprobeerd kan worden; niet dat iedere variant getest of verliesvrij is.

| Module | Rechtstreeks | Via lokale conversie openen | Opslaan als / export |
|---|---|---|---|
| Writer | DOCX | DOC, DOT, DOTX, DOCM, DOTM, ODT, OTT, FODT, RTF, TXT, HTM, HTML, XHTML, ABW, ZABW, SXW, STW, WPD, WPS, WRI, HWP, LWP, PAGES, FB2, EPUB, PSW, SDW, UOT | DOCX, MD, ODT, DOC, RTF, TXT, PDF |
| Calc | XLSX | XLS, XLT, XLTX, XLSM, XLTM, XLSB, ODS, OTS, FODS, CSV, TSV, TAB, DIF, SLK, SYLK, SXC, STC, DBF, GNUMERIC, GNM, NUMBERS, WK1, WK3, WK4, WKS, 123, WB1, WB2, WQ1, WQ2, ET, ETT, UOS | XLSX, ODS, XLS, CSV, PDF |
| Presentatie | PPTX | PPT, PPS, POT, PPTM, POTM, PPSX, POTX, ODP, OTP, FODP, SXI, STI, DPS, DPT, KEY, SDD, UOP | PPTX, ODP, PPT, PPSX, PDF |

Access leest MDB/ACCDB-tabellen; alleen de geladen pagina kan als CSV worden geëxporteerd.

Writer exporteert Markdown (.md) rechtstreeks via de documentkern, ook in de browser en zonder conversieruntime. Kies Markdown in Opslagformaat en gebruik Opslaan als of Ctrl+S. Koppen, lijsten, links, tabellen en basisopmaak worden als UTF-8-tekst bewaard. Paginaopmaak, ingesloten afbeeldingen en revisies vragen een DOCX; een Markdown-export wist daarom de wijzigingsmarkering niet. Afgekapt resultaat wordt geweigerd. Markdown openen is nog niet aangesloten.

## Gedrag en grenzen

- Import maakt een bewerkbare OOXML-kopie. Het origineel wordt niet overschreven. Opmaak en onbekende onderdelen kunnen wijzigen.
- Strict-XLSX wordt herkend en eerst lokaal omgezet. Wachtwoordbeveiligde documenten hebben nog geen wachtwoordinvoer.
- PDF, CSV en TXT zijn exportformaten. Sla ook het bewerkbare document op; een export wist de wijzigingsmarkering niet. CSV bewaart slechts één blad.
- Macro’s en actieve inhoud worden tijdens conversie niet uitgevoerd. VBA-behoud of uitvoering is niet beschikbaar.
- Bestanden: maximaal 100 MB; OOXML: maximaal 256 MB uitgepakt, 64 MB per onderdeel en 10.000 onderdelen.
- De browserversie heeft geen lokale conversie. Een ontbrekende runtime of filter levert een foutmelding op.
- PDF-import, Draw-/Math-formaten, ODB, e-mailarchieven, volledige template-export en een groot aantal beeld-/tekenfilters zijn nog niet aangesloten. Dit is nog geen volledige LibreOffice-formaatdekking.

De catalogus gebruikt de officiële [conversiefilters](https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html). Beschikbaarheid verschilt per lokale runtimeversie. Zie het [testverslag met weigeringen en resterend werk](tests/2026-10-21-formaten.md).
