# Access-VBA-corpus issue #8 — 26 oktober 2026

Proef van de VBA-extractie van Open Database Studio ([issue #8](https://github.com/OpenAEC-Foundation/open-office-studio/issues/8)) op echte Access-databases met VBA-modules. Het bestaande corpus (`.local/corpus`) bevatte geen enkele Access-VBA-module; dit corpus vult dat gat. Het verslag bevat alleen aantallen, bestandspaden, hashes en bronnen. Er worden geen tabelgegevens, persoonsgegevens of VBA-broncode geciteerd.

## Bronnen en selectie

- Uitsluitend openbare GitHub-repositories, geen forks. Gevonden met de zoek-API (`search/repositories`, tot 10 pagina’s per vraag, op relevantie en op recente wijziging) met de vragen `msaccess`, `ms-access vba`, `accdb`, `access database vba`, `northwind access`, `topic:ms-access`, `topic:msaccess`, `topic:access-vba`, `topic:microsoft-access`, `topic:access-database`, `topic:vba-access`, `topic:accdb`, `ms access`, `microsoft access`, `access vba`, `access frontend`, `mdb vba` en `language:VBA` met `access`, `database` of `form`. Dat leverde 7.230 kandidaat-repositories op.
- Per repository is de commit-SHA van de standaardtak vastgelegd en de bestandsboom recursief opgehaald. Alle downloads verwijzen naar die vaste revisie (`raw.githubusercontent.com/<repo>/<sha>/<pad>`); de Git-blobhash van elke download is gecontroleerd. Git LFS-pointers worden herkend en via `media.githubusercontent.com` opgehaald, met controle op de SHA-256 uit de pointer.
- Alleen `.accdb` en `.mdb` tot 25 MB. Geen `.accde`/`.mde`: die bevatten alleen gecompileerde code. Hoogstens 3 bestanden per repository, voor spreiding. Bestanden met dezelfde inhoud (Git-blob of SHA-256) zijn één keer opgenomen.
- Elk bestand moet de Jet/ACE-handtekening hebben (offset 4: `Standard Jet DB` of `Standard ACE DB`).
- Elk bestand is direct na de download onderzocht met de eigen alleen-lezende analyse (`analyseerDatabase`), in een aparte worker met een tijdslimiet van 120 s. Het zoeken stopte zodra 100 bestanden minstens één VBA-module met teruggewonnen broncode bevatten. Bestanden zonder VBA blijven met hun uitslag in het manifest, maar tellen niet mee.

De bestanden zijn nooit geopend in Access, LibreOffice of andere software die macro’s kan uitvoeren. Er is niets uit de bestanden uitgevoerd.

## Licenties

Van de 100 bestanden met VBA-bron hebben er 82 geen licentie volgens de GitHub-API. De overige 18: MIT 11, GPL-3.0 3, Apache-2.0 3, GPL-2.0 1. Openbaar op GitHub betekent niet vrij te verspreiden. Daarom blijven de bestanden lokaal onder `.local/` (door Git genegeerd) en worden ze niet verspreid. De repository bevat alleen het script; het manifest met herkomst, revisie, hashes en licentie staat ook lokaal.

## Herhalen

```bash
node scripts/corpus-access-vba.mjs        # zoeken, downloaden en per bestand analyseren (hervat bij herstart)
CORPUS_MANIFEST=.local/corpus/access-vba/manifest.json \
CORPUS_RAPPORT=.local/database-corpusproef-access-vba.json \
node scripts/database-corpusproef.mjs
```

Het script bewaart de zoekresultaten in `.local/corpus/access-vba/kandidaten.json` en het manifest in `.local/corpus/access-vba/manifest.json`. Met `DOEL=<n>` is het streefaantal aan te passen.

## Uitkomsten van het ophalen

| Onderdeel | Uitkomst |
|---|---|
| Kandidaat-repositories | 7.230 gevonden, 565 onderzocht (dan was het doel bereikt) |
| Repositories met `.accdb`/`.mdb` | 262, samen 661 databasebestanden |
| Opgehaald en geldig | 347 (265 ACCDB, 82 MDB), 853 MB |
| Niet opgenomen | 6 groter dan 25 MB · 3 downloadfouten (HTTP 404: 2 paden met niet-UTF-8-namen, 1 LFS-object) · 2 zonder Jet/ACE-handtekening |
| Met minstens één VBA-module met bron | **100** (84 ACCDB, 16 MDB) uit 74 repositories, samen 492 MB, grootste 23 MB |
| Generaties (100 met VBA) | Jet 4: 15 · ACE 12: 39 · ACE 14: 44 · ACE 16: 1 · ACE 17: 1 |
| VBA-opslag (100 met VBA) | `MSysAccessStorage` 93 · `MSysAccessObjects` 7 |
| Modules per bestand (100 met VBA) | 1 tot 111, mediaan 6 |

## Uitkomsten van de corpusproef

| Onderdeel | Uitkomst |
|---|---|
| Bestanden | 347 |
| Geopend en geanalyseerd | 339; 8 fouten, alle in mdb-reader bij versleutelde databases (zie hieronder) |
| Origineel ongewijzigd (SHA-256 vóór = na = manifest) | 347 van 347 |
| VBA-projecten gelezen | 329 (294 uit `MSysAccessStorage`, 35 uit `MSysAccessObjects`); 229 daarvan zonder modules |
| VBA-modules | 1.565 |
| Modules met teruggewonnen broncode | 1.556 (200.932 regels) |
| Modules zonder bron | 9, in 2 Access 97-bestanden (Jet 3) met `MSysModules2`-opslag (niet gedecodeerd, bekende beperking) |
| Alleen gecompileerde modules | 0 |
| Beveiligde projecten | 3 vergrendeld voor weergave, 2 met projectwachtwoord; bij alle 5 is de broncode toch teruggewonnen (de vergrendeling beschermt alleen de weergave in de editor) |
| VBA-project niet gelezen | 1 bestand (zie hieronder) |
| Tabellen / gekoppelde tabellen | 1.813 / 440 |
| Query’s (met SQL) | 4.442 (4.442) |
| Relaties / indexen | 671 / 4.394 |
| Formulieren / rapporten / macro’s | 1.612 / 658 / 209 (alleen geïnventariseerd) |
| Rijen | mdb-reader 626.696 · eigen paginascan 623.780 |
| Bestanden met rijafwijking | 49 |

### Fouten en afwijkingen

- **Geen fouten in de eigen VBA-lezers.** De CFB-lezer, de dir-stroomlezer, de MS-OVBA-decompressie en de lezer van `MSysAccessStorage` gaven bij geen enkel bestand een fout of crash. Alle modules die een modulestroom hadden, leverden broncode op. Geen worker liep in de tijdslimiet.
- 8 versleutelde databases weigert mdb-reader al bij het openen (de analyse komt niet aan VBA toe): 3× `The value of "end" is out of range … Received 32` (Office-agileversleuteling, in `verifyPassword` van mdb-reader), 3× `Not implemented yet` (andere Office-versleuteling) en 2× `Wrong password` (databasewachtwoord). Het gaat om onder meer `lenard123/fastfood-pos-csharp` (`FastFoodPOS/Resources/FastFoodDatabase.accdb`), `CarlosS1L/AtlantidaSol` (`dados/wgbdtables.accdb`), `irahulksingh/Leave-Application` (`Connection/LappwithPwd.accdb`), `karenpayneoregon/SecureConnectionAccess` en twee testbestanden van `spannm/jackcess-encrypt`. De foutmelding van mdb-reader bij agileversleuteling is onduidelijk; een herkenbare melding “versleuteld” zou beter zijn.
- `az_analyst_msaccessprojects-eb608defc8a3930b32deb4010ee310229ee23de1` (`Access_ SelectQueries.accdb`): VBA-project niet gelezen, `Wrong page type. Expected 1 but received undefined.` De fout komt uit mdb-reader bij het lezen van `MSysAccessStorage` (een paginaverwijzing buiten het bestand). Voor `MSysAccessObjects` heeft de analyse een eigen terugvalroute met de ruwe rijlezer, voor `MSysAccessStorage` niet.
- Rijafwijkingen (49 bestanden), geen VBA-onderdeel:
  - 39 tabellen in 31 bestanden: het rijaantal in de tabeldefinitie wijkt af, maar mdb-reader en de eigen scan zijn het eens. Dit is gebruikelijk bij niet-gecomprimeerde Access-bestanden.
  - 14 tabellen in 7 bestanden: eigen scan gelijk aan de tabeldefinitie, maar mdb-reader leest meer of minder rijen (bijvoorbeeld `itsmediwas_java_student_information_mana-b63bc0e…`, `mhamzap10_parking_management_system-da0533c…`). Nader te onderzoeken in de eigen paginascan (`access-pagina.ts`) of in mdb-reader.
  - 4 tabellen in 4 bestanden: alle drie de tellingen verschillen (o.a. `bmullan91_seneca_msaccess_store-d37f542…`, `naharcomputer_msaccess_vba_e2sc-331a88f…`).
  - mdb-reader leest de rijen niet bij 12 tabellen: `Failed to read complex column` (8, 6 bestanden) en `Wrong page type` (4, 4 bestanden).

## Conclusie

Het teruggewinnen van Access-modulebron is nu aangetoond op 100 echte databases uit 74 openbare projecten: 1.556 modules en ruim 200.000 regels uit `MSysAccessStorage` (Access 2007+) en `MSysAccessObjects` (Access 2000–2003), zonder één fout in de eigen CFB-, dir- of MS-OVBA-lezer. Open punten: een eigen terugvalroute voor `MSysAccessStorage`, een duidelijke melding bij versleutelde ACCDB’s, Access 97-moduleopslag (`MSysModules2`), en de rijtelling bij de 11 bestanden waar de eigen scan en mdb-reader verschillen.
