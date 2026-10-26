# Open Database Studio

Afzonderlijk te installeren React/Tauri-app voor het lokaal openen van oude MDB- en ACCDB-databases. Heeft een eigen programma (`open-database-studio`), venster, pictogram en applicatie-id (`org.openaec.database-studio`). De kantooromgeving hoeft niet geïnstalleerd te zijn.

![Zelfstandige Open Database Studio met weekversie en een echte ACCDB-tabel](../../docs/screenshots/database-2026-W43.1.jpg)

## Werkt nu

- MDB/ACCDB via Database openen of Ctrl+O kiezen.
- Gebruikerstabellen, kolomtypen en gegevens lokaal lezen in een aparte worker.
- Indexen, primaire sleutels en relaties bekijken in de objectbrowser.
- Opgeslagen query’s als gereconstrueerde SQL bekijken en als `.sql` bewaren.
- Aanwezige VBA-bron bekijken en als `.bas` bewaren. Ontbrekende of alleen gecompileerde bron wordt als beperking gemeld.
- Formulieren, rapporten, macro’s en gekoppelde tabellen worden alleen geïnventariseerd.
- Per bestand is er een compatibiliteitsrapport, te exporteren als JSON of tekst.
- Maximaal 200 rijen per pagina; zoeken en CSV-export gelden voor de geladen pagina.
- In de desktopapp worden exports met een native dialoog en een volledige, atomaire schrijfactie opgeslagen. De bron blijft ongewijzigd. In de browser wordt een download aangevraagd.
- Een ongeldige database wordt geweigerd; de eerder geopende tabel blijft staan.
- Lichte en donkere weergave, een inklapbaar lint en ingebouwde demonstratiegegevens.

De app is alleen lezen en voert geen query’s, macro’s of VBA uit. Bewerken, query-uitvoering, het tonen van formulieren en rapporten, en VBA-uitvoering zijn niet beschikbaar. Niet alle versies, encrypties en veldtypen worden ondersteund. Zie de [grenzen en platformmatrix](../../packages/database/README.md) en het [corpusverslag](../../docs/tests/2026-10-26-database.md).

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
