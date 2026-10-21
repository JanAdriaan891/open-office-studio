# Functionele lat voor OpenAEC Office

De toepassingen moeten in dagelijkse bewerkingen op Word, Excel, PowerPoint en Access lijken, in een eigen OpenAEC-interface met Tauri + React. Een werkbalk of bestandsviewer alleen voldoet niet. Onderstaande onderdelen zijn acceptatiedoelen, geen verklaring van bestaande ondersteuning.

| Module | Vereist voor een bruikbare eerste versie | Daarna uitbreiden |
| --- | --- | --- |
| Open Writer Studio | Paginaweergave, stijlen, tekst- en alineaopmaak, lijsten, tabellen, afbeeldingen, marges, kop/voetteksten, paginanummers, zoeken/vervangen, undo/redo, DOCX openen/bewerken/opslaan, PDF/afdrukken | Inhoudsopgave, voetnoten, opmerkingen, wijzigingen bijhouden, secties, spelling, ODT, samenvoegen |
| Open Excel Calc Studio | Meerdere bladen, celtypen en opmaak, formules met correcte herberekening en fouten, verwijzingen, kopiëren/plakken, doorvoeren, sorteren/filteren, kolombreedtes, XLSX/CSV openen en opslaan | Grafieken, draaitabellen, validatie, voorwaardelijke opmaak, benoemde bereiken, ODS |
| Open Presentatie Studio | Dia’s toevoegen/verwijderen/herschikken, thema’s, tekst, afbeeldingen, vormen, uitlijnen, dupliceren, notities, diavoorstelling, PPTX openen/bewerken/opslaan | Tabellen, grafieken, diamodellen, overgangen, animaties, ODP |
| Open Access Studio | MDB/ACCDB lezen, objectbrowser, tabellen en typen, zoeken/filteren, export, querydefinities en beschikbare VBA-bron tonen | Relaties, query-uitvoering, formulieren, rapporten, bewerken van kopieën; VBA-uitvoering apart onderzoeken |

Iedere module heeft openen, opslaan als, recente bestanden, sneltoetsen, duidelijke foutmeldingen en bescherming tegen verlies van wijzigingen nodig. Offlinewerking en behoud van inhoud bij opnieuw openen zijn releasevoorwaarden. Ontbrekende ondersteuning wordt expliciet aangegeven; conversie mag niet stilzwijgend objecten of formules verwijderen.

## Prioriteit en richting

Open Writer Studio, Open Excel Calc Studio en Open Presentatie Studio hebben voorrang bij implementatie, compatibiliteitstesten en desktopbuilds. Binnen deze drie is nog geen onderlinge prioriteitsvolgorde vastgesteld.

Open Access Studio heeft de laagste prioriteit. De richting is een databaseomgeving zoals LibreOffice Base: tabellen, relaties, query’s, formulieren en rapporten, met verbindingen naar databronnen. Oude MDB/ACCDB-bestanden en beschikbare VBA-bron kunnen openen blijft een aanvullend compatibiliteitsdoel. VBA kunnen bekijken betekent niet dat scripts uitvoerbaar zijn.

De huidige Access-opzet blijft beschikbaar; verdere uitbouw wacht op de kernfunctionaliteit van de drie hoofdmodules. Databaseformulieren en rapporten horen bij de uiteindelijke scope, niet bij de eerste kantoorrelease.

## Vergelijking van routes — 21 oktober 2026

| Referentie | Relevantie | Consequentie voor onze keuze |
| --- | --- | --- |
| [WordCraft](https://github.com/storytold/wordcraft) | Project beschrijft Rust/WASM, lokaal DOCX, lint, stijlen, revisies en verwijzingen | Sterke kandidaat voor functionele vergelijking van Writer. Claims nog met eigen bestanden toetsen; De egui-interface is geen React-component; kernintegratie via Rust/WASM onderzoeken. Het project vermeldt MIT OR Apache-2.0. |
| [ONLYOFFICE Desktop Editors](https://github.com/ONLYOFFICE/DesktopEditors) | Bestaande complete suite met documenten, rekenbladen en presentaties | Referentie voor diepgang en bediening. Native integratie, distributie en AGPL-verplichtingen apart beoordelen. |
| [LibreOffice](https://www.libreoffice.org/) | Brede desktopreferentie inclusief databaseformulieren en rapporten | Gebruik als functionele vergelijking en voor het onafhankelijk openen van exports. |
| [Tiptap Pages](https://tiptap.dev/docs/pages/getting-started/overview) | React/webgerichte paginaopmaak, kop- en voetteksten | Pages is een Pro-pakket, dus niet zonder meer een volledig opensource basis. |
| BetterOffice | Reeds geselecteerde React-pakketten voor de drie documenttypen | Integratiekandidaat, nog geen bewezen volledige kantoorfunctionaliteit. Per versie end-to-end toetsen. |

Bronnen zijn projectdocumentatie, geen onafhankelijk bewijs van compatibiliteit. Kies de engine pas na hetzelfde proefdocument met stijlen, tabellen, afbeeldingen, paginaonderbrekingen en revisies te hebben geopend, gewijzigd, opgeslagen en opnieuw gecontroleerd. Voor rekenbladen en presentaties gelden vergelijkbare corpusproeven.

## Concrete acceptatieproef Writer

1. Maak een document van vijf pagina’s met titel, drie kopniveaus, lijst, tabel, afbeelding, koptekst en paginanummer.
2. Wijzig opmaak en tekst; controleer ongedaan maken en opnieuw uitvoeren.
3. Sla op als DOCX, sluit de toepassing en open opnieuw; vergelijk tekst, objecten, stijlen en pagina-indeling.
4. Open de uitvoer in een onafhankelijke kantoorapplicatie; registreer afwijkingen.
5. Exporteer naar PDF en controleer de pagina’s visueel.
6. Herhaal offline en op Windows, Linux en macOS. Een webbuild bewijst geen desktopinstallatie.

## Huidige stand

De drie hoofdeditors zijn aangesloten op een React-werkruimte met nieuwe bestanden, openen en opslaan als. De Tauri-basis en een lokale Linux-debugbuild zijn toegevoegd. Access behoudt zijn voorbeeldopzet. Dit is nog geen volledige kantoorvervanger: zie het [testverslag](../tests/2026-10-21.md) voor uitgevoerde controles en de resterende releasevoorwaarden.
