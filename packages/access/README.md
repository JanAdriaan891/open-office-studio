# Open Access Studio

React-opzet in OpenAEC-kleuren, bedoeld voor de gedeelde Tauri-desktopomgeving.
Volgt [issue #8](https://github.com/OpenAEC-Foundation/open-office-studio/issues/8).

## Richting en prioriteit

Een databaseomgeving in de richting van LibreOffice Base, met tabellen, relaties, query’s, formulieren, rapporten en databronverbindingen. Ondersteuning voor oude MDB/ACCDB-bestanden en beschikbare VBA-bron blijft onderdeel van de richting.

Deze module heeft de laagste prioriteit. Writer, Calc en Presentatie krijgen voorrang; de huidige opzet blijft voorlopig behouden zonder verdere uitbreiding.

## Starten

Vanuit de repository: `pnpm install`, daarna `pnpm dev`. `pnpm build` controleert TypeScript en bouwt de browserweergave. De gedeelde kantooromgeving heeft inmiddels een Tauri-configuratie; Access zelf heeft nog geen native databaseadapter.

## Werkt nu

- Lokale bestandskiezer voor MDB/ACCDB; controle op extensie, leeg bestand en leesbaarheid.
- Expliciete scheiding tussen een geselecteerd bestand en ingebouwde voorbeeldgegevens.
- Objectbrowser met tabellen, query’s en VBA; zoeken in de voorbeeldtabel.
- CSV-export met bescherming tegen spreadsheetformules, SQL- en BAS-downloads.
- Licht/donker thema, responsieve weergave, lokaal gebundelde lettertypen.

## Nog niet geïmplementeerd

Geen databaseparser, formaatvalidatie, VBA-extractie of scriptuitvoering. Het selecteren van een bestand betekent niet dat de database is geopend of geïnterpreteerd. Geen ondersteuning voor bewerken, relaties, formulieren en rapporten. De bronweergave heeft nog geen syntaxiskleuring. Er worden geen bestanden geüpload of originelen beschreven.

`src/model.ts` bevat het `DatabaseReader`-contract. Een echte adapter moet objecten met hun concrete leesstatus teruggeven, met foutmeldingen voor beveiligde, beschadigde en niet-ondersteunde bestanden. Uitvoering en extractie van VBA zijn afzonderlijke onderdelen.

## Integratieroutes

- [MDB Tools](https://mdbtools.github.io/utils/): onderzoeken voor lokale tabel- en schema-extractie; geen bewijs van VBA-uitvoering.
- [Jackcess](https://jackcess.sourceforge.io/faq.html): onderzoeken voor tabellen en opgeslagen querydefinities; Java-runtime en distributie meewegen.

Beide routes vereisen corpusproeven op ieder doelplatform voordat ondersteuning wordt toegezegd. Het adaptercontract voorkomt dat de interface aan één leverancier vastzit.

## Vormgeving

Kleuren en typografieke richting volgen [OpenAEC-style-book](https://github.com/OpenAEC-Foundation/OpenAEC-style-book). De componenten zijn voor deze toepassing geschreven.
