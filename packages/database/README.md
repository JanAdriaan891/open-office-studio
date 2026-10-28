# Open Database Studio

Experimentele databasebrowser in de gedeelde React/Tauri-werkruimte. Volgt [issue #8](https://github.com/OpenAEC-Foundation/open-office-studio/issues/8). Tekst, Rekenblad en Presentatie houden voorrang.

Vanaf weekuitgave 2026-W43.1 is er ook een [zelfstandige desktopapp](../../apps/database-studio), met een eigen venster, pictogram, installer en native exportdialoog. De parser en objectbrowser worden gedeeld; de zelfstandige bundel bevat de kantoorengines niet.

## Werkt nu (alleen lezen)

- MDB- en ACCDB-bestanden lokaal openen met de MIT-parser `mdb-reader` 3.2.0, in een moduleworker met een tijdslimiet van 15 seconden. Originelen worden nooit beschreven. Het rapport bevat de SHA-256 van het geopende bestand.
- **Tabellen**: gebruikerstabellen, kolomnamen, typen en rijaantallen. Er worden maximaal 200 rijen per pagina getoond; zoeken en CSV-export gelden voor de geladen pagina.
- **Indexen en primaire sleutels**: met een eigen lezer van de tabeldefinitiepagina’s (Jet 3, Jet 4 en ACE). Per index worden naam, kolommen (met sorteerrichting), primair, uniek en relatie-index getoond.
- **Relaties**: uit `MSysRelationships`. Per relatie worden tabellen, kolommen, één-op-één of één-op-veel, referentiële integriteit, trapsgewijs bijwerken/verwijderen en standaardjoin getoond. Interne relaties tussen systeemtabellen worden alleen in het rapport geteld.
- **Opgeslagen query’s**: SQL wordt gereconstrueerd uit `MSysQueries` (attribuutcodes 1–11). Querysoorten: SELECT, CROSSTAB, DELETE, UPDATE, APPEND, MAKE TABLE, DDL, PASSTHROUGH en UNION. Weergave met syntaxiskleuring, export als `.sql`. Wat niet eenduidig te reconstrueren is (een onbekend parametertype, jointype of attribuut, of een ontbrekend UNION-deel), krijgt een concrete beperking en geen SQL. Er wordt niet gegokt. Bij pass-through-query’s wordt de ODBC-verbindingsreeks nooit getoond. Query’s worden niet uitgevoerd.
- **VBA-modules**: het VBA-project wordt gelezen uit `MSysAccessStorage` (Access 2007+ en recente MDB’s) of `MSysAccessObjects` (Access 2000–2003). Daarvoor zijn een eigen CFB-lezer, eigen MS-OVBA-decompressie en een eigen dir-stroomlezer gebouwd. Aanwezige broncode wordt getoond met syntaxiskleuring en kan als `.bas` worden geëxporteerd. Ontbreekt de modulestroom of staat er alleen p-code (MDE/ACCDE), dan meldt de toepassing dat; er wordt nooit bron als teruggewonnen gepresenteerd. Het rapport vermeldt ook projectvergrendeling en wachtwoord (CMG/DPB, zonder wachtwoordherstel) en COM-/bibliotheekverwijzingen.
- **Formulieren, rapporten, macro’s en gekoppelde tabellen** worden alleen geïnventariseerd: naam en soort uit `MSysObjects`.
- **Compatibiliteitsrapport** per geopend bestand, met per onderdeel de status gelezen, gedeeltelijk, niet gelezen, niet aanwezig of niet uitgevoerd, plus een toelichting. Het rapport is zichtbaar in de objectbrowser en te exporteren als JSON of tekst. Het bevat geen tabelgegevens.
- Fouten worden gemeld voor beschadigde, lege en niet-ondersteunde bestanden. De ingebouwde demonstratiegegevens blijven onderscheiden van echte databasegegevens.

## Beproefd

De [corpusproef van 26 oktober 2026](../../docs/tests/2026-10-26-database.md) heeft 82 openbare databases van Access 97 tot Access 2019+ geopend, alle 82 zonder fout en met de SHA-256 vóór en na gelijk. Uitkomsten:

- 180 tabellen; de rijaantallen zijn vergeleken met een eigen paginascan.
- 101 query’s, alle met gereconstrueerde SQL. 45 daarvan zijn exact gelijk aan de verwachting uit de Jackcess-proef.
- 11 relaties, 302 indexen en 74 VBA-projecten.

Het corpus bevat geen Access-VBA-modules. De MS-OVBA-route is daarom aanvullend beproefd op 69 echte modules uit Office-macrobestanden, met unittests voor de Access-boomopbouw. `mdb-tools` was niet beschikbaar. De onafhankelijke telling gebruikt eigen code die mdb-reader niet aanroept; dat staat ook zo in het verslag.

Eerdere proeven: de [browserproef van 0.4.1](../../docs/tests/2026-10-21-browser.md) en het [formatenverslag](../../docs/tests/2026-10-21-formaten.md).

## Grenzen

| Onderdeel | Wat gebeurt er | Wat gebeurt er niet |
|---|---|---|
| Formulieren | Naam en soort uit `MSysObjects` | Geen ontwerp, besturingselementen, gebeurtenissen of weergave |
| Rapporten | Naam en soort uit `MSysObjects` | Geen opmaak, groepering of afdruk |
| Macro’s | Naam en soort uit `MSysObjects` | Geen weergave of uitvoering; ook AutoExec wordt niet gestart |
| VBA-bron | Teruggewonnen uit MS-OVBA-modulestromen indien aanwezig | Geen herstel van alleen gecompileerde code (MDE/ACCDE); geen decodering van Access 97-opslag (`MSysModules2`) |
| VBA-uitvoering | Niet aanwezig | Er is geen VBA-runtime. Uitvoering vereist een afzonderlijk technisch ontwerp en een expliciete gebruikersactie |
| COM/ActiveX/externe bibliotheken | Alleen namen uit de VBA-verwijzingen | Er wordt niets geladen of geregistreerd |
| Query’s | SQL-reconstructie en export | Geen uitvoering, optimalisatie of controle tegen de tabellen |
| Gekoppelde tabellen en pass-through | Alleen naam en soort | Externe bronnen worden niet geopend; verbindingsreeksen worden niet getoond |
| Bewerken | Niet aanwezig | Er worden geen wijzigingen of bewerkbare kopieën gemaakt |
| Beveiliging | Jet 4-paginaversleuteling via mdb-reader | ACCDB met wachtwoord/Office-versleuteling is niet beproefd; wachtwoorden worden niet gevraagd of hersteld |

Niet-ondersteunde veldtypen en complexe velden (bijlagen, meerwaardig) kunnen een tabel gedeeltelijk onleesbaar maken. Het rapport noemt dan de tabel.

## Platformmatrix

| | Windows | Linux | macOS |
|---|---|---|---|
| Parser, objectbrowser en rapport | Ja; JavaScript in de WebView-worker, geen ODBC, ACE-driver of 32/64-bitsafhankelijkheid | Ja; idem | Ja; idem |
| Automatische tests in CI ([workflow](../../.github/workflows/database.yml)) | Vitest, Rust-tests | Vitest, productieworkerproef, databasecorpusproef (3 vaste databases), Rust-tests | Vitest, Rust-tests |
| Volledige corpusproef (82 bestanden) | Niet gedraaid | Lokaal gedraaid (Node 24) | Niet gedraaid |
| Installer gebouwd in CI | NSIS (x64) met WebView2-bootstrapper | deb en AppImage (x64) | dmg (ARM64) |
| Installer uitgepakt en gecontroleerd | Ja | Ja | Nee |
| Native exportdialoog en schone installatie | Handmatig te controleren | Handmatig te controleren | Handmatig te controleren |
| VBA- of macro-uitvoering | Nee | Nee | Nee |

De lees- en exportfunctionaliteit is op alle platforms dezelfde code. De verschillen zitten in de verpakking en in wat automatisch wordt gecontroleerd.

## Opbouw

- `database-client.ts` beheert de worker en sessiegrenzen.
- `database-worker.ts` leest metadata en tabelpagina’s. `database-parser.ts` configureert de browserbuffer vóór het laden van de parser.
- `access-analyse.ts` stelt de objecten en het compatibiliteitsrapport samen.
- `access-query.ts` reconstrueert query’s.
- `access-pagina.ts` is de eigen alleen-lezende pagina-, tabeldefinitie- en rijlezer.
- `cfb.ts` leest compound-bestanden en `ovba.ts` doet MS-OVBA-decompressie, de dir-stroom en de projectbeveiliging.
- `syntaxis.ts` verzorgt de syntaxiskleuring voor VBA en SQL.
- `model.ts` bevat de gegevensmodellen, de CSV-escaping (met bescherming tegen formule-invoer) en de tekstexport van het rapport.

De eigen lezers zijn geschreven aan de hand van de openbare specificaties MS-CFB en MS-OVBA en de documentatie van mdbtools. De querysemantiek volgt het gedrag van Jackcess; er is geen code overgenomen.

Starten: `pnpm install` en `pnpm dev`, of `pnpm database:dev`. Productie: `pnpm database:build`. Controles: `pnpm test`, `node scripts/database-corpusproef.mjs`, `node scripts/database-vba-proef.mjs` en `DATABASE_DIST=apps/database-studio/dist node scripts/test-database-worker.mjs <bestanden>`.
