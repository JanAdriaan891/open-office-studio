# OpenAEC-stijl in de kantooromgeving

De weekuitgave 2026-W43.1 gebruikt de officiële [OpenAEC-style-book](https://github.com/OpenAEC-Foundation/OpenAEC-style-book), revisie `dfdcd415b26604081b1699560621d3e9ae7ea6bf`. De kleur- en typografietokens, het merkboek en de Tauri/React-voorbeeldapp zijn als bron gebruikt.

## Toepassing

- Construction Amber `#D97706` voor accenten, tabranden en focus; Deep Forge `#36363E` voor tekst, primaire knoppen en de statusbalk.
- Blueprint White `#FAFAF9`, Concrete `#F5F5F4` en warme randkleuren voor de werkruimte en panelen.
- Inter voor bediening en Space Grotesk 700 voor koppen en het productmerk. Lettertypen worden lokaal meegeleverd.
- Het officiële OpenAEC-symbool in beide kopbalken.
- Een compacte kopbalk van 44 pixels, linttabbladen van 30 pixels en een opdrachtpaneel van 98 pixels, aansluitend op het desktopvoorbeeld.
- Dezelfde stijl voor Writer, Calc, Presentatie en de afzonderlijke database-app. Documentinhoud en celopmaak behouden hun eigen kleuren en lettertypen.
- Donkere databasepanelen gebruiken Deep Forge en Night Build met lichte tekst. Kleine actieve bedieningselementen krijgen een amber accent.

De kopbalkhoogte en de bovenrand van het bestandsmenu delen één CSS-variabele, zodat het menu de volledige ribbon blijft bedekken. Het inkappen van het lint en bestaande toetsenbordbediening blijven beschikbaar. Er zijn geen nieuwe vensterknoppen toegevoegd die in de browser niet werken; de desktopapp behoudt de native vensterbediening.

## Herkomst en onderhoud

De overgenomen tokens en het ongewijzigde SVG-symbool staan in `src/stijl`, samen met bronrevisie en de CC BY-SA 4.0-licentie. `openaec-tokens.css` is uit de meegeleverde JSON-tokens afgeleid; `openaec-office.css` past die toe op de bestaande componenten. De licentie en bronvermelding worden in de distributies meegenomen. Deze bronvermelding geldt voor de overgenomen stijlonderdelen; overige onderdelen behouden hun eigen licentie.

Bij een volgende stijluitgave eerst de bronrevisie en JSON-tokens bijwerken, daarna de CSS aanpassen en beide apps visueel controleren. De oudere schermafbeeldingen blijven als historische testreferentie beschikbaar.
