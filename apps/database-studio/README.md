# Open Database Studio

Afzonderlijk te installeren React/Tauri-app voor het lokaal openen van oude MDB- en ACCDB-databases. Heeft een eigen programma (`open-database-studio`), venster, pictogram en applicatie-id (`org.openaec.database-studio`). De kantooromgeving hoeft niet geïnstalleerd te zijn.

![Zelfstandige Open Database Studio met weekversie en een echte ACCDB-tabel](../../docs/screenshots/database-2026-W43.1.jpg)

## Werkt nu

- MDB/ACCDB openen via Openen of Ctrl+O. Na een alleen-lezen-analyse (objecten, VBA-bron, compatibiliteitsrapport) wordt een bewerkbare **SQLite-werkkopie** opgebouwd, met voortgang, annuleren en een opbouwrapport. Het origineel blijft altijd ongewijzigd.
- Nieuwe lege database, de ingebouwde voorbeelddatabase, en een eerder bewaarde werkkopie (`.sqlite`) heropenen.
- Tabellen: gegevensraster met paginering, sorteren, zoeken, bewerken met typecontrole per veldsoort (Nederlandse getallen en datums), rijen toevoegen en verwijderen, begrijpelijke meldingen bij sleutel- en relatiefouten; ontwerpweergave en nieuwe tabellen.
- Query’s: opgeslagen query’s en een SQL-editor (Access-SQL, F5 of Ctrl+Enter), parameters via een dialoog, actiequery’s alleen na bevestiging, resultaat als CSV, opslaan als query.
- Formulieren: automatisch formulier en een eenvoudige ontwerper; één record tegelijk of als gegevensblad. Een formulier met dezelfde naam als een Access-formulier koppelt de VBA-module `Form_<naam>` (Form_Load, Form_Current, knop_Click). Access-formulierontwerpen zelf zijn niet leesbaar.
- Rapporten: groeperen, sorteren, totalen (som, gemiddelde, aantal), kop en voet; afdrukken of PDF via de printdialoog.
- VBA: procedures afgeschermd uitvoeren op de werkkopie, alleen na expliciete toestemming (eenmaal per database), met directvenster, MsgBox/InputBox als dialogen, Stop-knop en tijdslimiet. Er wordt nooit iets automatisch uitgevoerd (ook geen AutoExec).
- Exporteren: werkkopie als `.sqlite`, tabellen en queryresultaten als CSV, bron als `.sql`/`.bas`, rapporten als JSON of tekst. In de desktopapp via een native dialoog met atomaire schrijfactie; `.sqlite` alleen met een echte SQLite-kop. In de browser wordt een download aangevraagd.
- Lichte en donkere weergave en een OpenAEC-lint met Start, Maken, Externe gegevens en Databasehulpmiddelen.

Wijzigingen bestaan alleen in de werkkopie; bewaar die als `.sqlite` om ze te houden. Bewerkte VBA-modules worden (nog) niet in de werkkopie bewaard. Niet alle versies, encrypties en veldtypen worden ondersteund. Zie de [grenzen en platformmatrix](../../packages/database/README.md) en het [corpusverslag](../../docs/tests/2026-10-26-database.md).

## Ontwikkelen en bouwen

Voer vanuit de repositoryhoofdmap uit:

```bash
pnpm install --frozen-lockfile
pnpm database:dev
pnpm database:build
pnpm database:desktop:dev
pnpm database:desktop:build
```

`database:dev` gebruikt poort 1430. De frontend heeft een eigen HTML-ingang en eigen `dist` in deze map. De productiecontrole weigert ingebouwde kantoorengines; de database-app levert alleen de benodigde parser, UI en licenties mee.

De [bouwstraat](../../.github/workflows/database.yml) maakt eigen Windows-x64-, Linux-x64- en macOS-ARM64-pakketten. Windows bundelt de WebView2-bootstrapper en loader. Windows- en Linux-pakketten worden uitgepakt en gecontroleerd. Native dialoogbediening en een schone installatie vereisen afzonderlijke controles.

## Versies

De gedeelde [weekversie](../../versie.json) is zichtbaar in de app. `2026.43.1` betekent week 43 van 2026, eerste uitgave. Zie [weekversies instellen](../../docs/versies.md).
