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

Tweede kolom: de eerste proef. Derde kolom: na het herstel van de vier punten hieronder (zelfde 347 bestanden, zelfde dag).

| Onderdeel | Eerste proef | Na herstel |
|---|---|---|
| Bestanden | 347 | 347 |
| Geopend en geanalyseerd | 339; 8 fouten in mdb-reader | 339; 0 fouten, 8 herkend als versleuteld (zie hieronder) |
| Origineel ongewijzigd (SHA-256 vóór = na = manifest) | 347 van 347 | 347 van 347 |
| VBA-projecten gelezen | 329 (294 uit `MSysAccessStorage`, 35 uit `MSysAccessObjects`); 229 daarvan zonder modules | 329, ongewijzigd |
| VBA-modules / met teruggewonnen broncode | 1.565 / 1.556 (200.932 regels) | 1.565 / 1.556 |
| Modules zonder bron | 9, in 2 Access 97-bestanden (Jet 3) met `MSysModules2`-opslag (niet gedecodeerd, bekende beperking) | 9, ongewijzigd |
| Alleen gecompileerde modules | 0 | 0 |
| Beveiligde projecten | 3 vergrendeld voor weergave, 2 met projectwachtwoord; bij alle 5 is de broncode toch teruggewonnen | ongewijzigd |
| VBA-opslag via de eigen ruwe rijlezer | 35 (`MSysAccessObjects`, stil) | 36: 35 `MSysAccessObjects` + 1 `MSysAccessStorage`; nu ook vermeld in het rapport |
| VBA-project niet gelezen | 1 bestand (fout in mdb-reader) | 0 met een fout; het ene bestand is afgebroken (zie hieronder) |
| Tabellen / gekoppelde tabellen | 1.813 / 440 | 1.813 / 440 |
| Query’s (met SQL) | 4.442 (4.442) | 4.442 (4.442) |
| Relaties / indexen | 671 / 4.394 | 671 / 4.394 |
| Indexen gemarkeerd als uniek (beide corpora samen) | 2.027, waarvan 160 met dubbele waarden in de levende rijen | 2.311, waarvan 23 met „dubbele” waarden (alle op samengestelde velden, zie hieronder) |
| Formulieren / rapporten / macro’s | 1.612 / 658 / 209 (alleen geïnventariseerd) | ongewijzigd |
| Rijen: tabeldefinitie · eigen paginascan | 626.696 · 623.780 | 626.696 · 623.780 |
| Rijen: door mdb-reader gelezen · alleen-lezen-tabelpad | (niet gemeten) | 600.375 · 600.318 |
| Tabellen met rijcorrectie (verwijderde/verplaatste rijversies) | 0 | 14 |
| Bestanden met rijafwijking | 49 | 43 |

Het hoofdcorpus (`.local/corpus/manifest.json`, 82 Jackcess-testbestanden) blijft gelijk: 82 van 82 geopend, 0 fouten, 0 versleuteld, 45 van 45 query’s gelijk aan Jackcess, 4 bestanden met een (bekende) afwijking (2× samengesteld veld, 1× niet-ondersteund veldtype, 1× verouderd rijaantal in de tabeldefinitie). Daar was geen rijcorrectie nodig.

### Herstel

1. **Terugvalroute voor `MSysAccessStorage`.** Als mdb-reader een VBA-opslagtabel niet kan lezen, leest de analyse die nu altijd met de eigen ruwe rijlezer (`leesRijenRuw` in `access-pagina.ts`), voor `MSysAccessStorage` en `MSysAccessObjects`. De rijlezer leest nu ook tekst (gecomprimeerde Unicode), OLE- en memovelden (in de rij, één LVAL-rij of een LVAL-keten), en slaat onleesbare rijen over met een melding in plaats van de hele tabel op te geven. Controle: op alle 295 Jet 4/ACE-bestanden waar mdb-reader de opslag wél leest, levert de ruwe lezer exact dezelfde 22.149 rijen (145 MB aan lange waarden, byte voor byte gelijk). In `az_analyst_msaccessprojects-eb608de…` (`Access_ SelectQueries.accdb`) verwijzen 5 van de 23 rijen naar pagina’s voorbij het einde van het bestand (3.889 pagina’s, verwijzing naar 3.894): het bestand in de repository is afgebroken. De 18 leesbare rijen bevatten geen VBA-project; het rapport meldt nu „niet gelezen” met die reden, in plaats van een fout. MSysObjects vermeldt in dit bestand 0 modules.
2. **Versleutelde databases.** De bestandskop wordt vóór het openen gecontroleerd: bij ACE (Access 2007+) betekent een coderingssleutel op 0x3E in de ontsleutelde kop dat het bestand met een databasewachtwoord versleuteld is; het schema staat op 0x299 (zoals in Jackcess-encrypt). Alle 8 bestanden worden zo herkend (5× Office-agileversleuteling, 3× Office-RC4-CryptoAPI), zonder mdb-reader aan te roepen; de foutsoorten van mdb-reader (`Wrong password`, `Not implemented yet`, `The value of "end" is out of range`) blijven als vangnet. De gebruiker krijgt de melding „Deze database is versleuteld of met een wachtwoord beveiligd; dat wordt nog niet ondersteund.” (foutcode `versleuteld`); de worker stuurt daarbij een compatibiliteitsrapport mee met de regel *Versleuteling — niet gelezen* en het herkende schema. Er wordt geen wachtwoord gevraagd of geprobeerd. Jet 4-RC4-paginacodering zonder wachtwoord was al leesbaar en blijft dat.
3. **Rijen in het alleen-lezen-tabelpad.** Het `tabel`-pad gebruikt nu dezelfde correctie als de werkkopie (`werkkopie/rijfilter.ts`): verwijderde rijplaatsen (0x8000) vallen weg, levende overlooprijen (0x4000) komen erbij, alleen als de eigen paginascan precies aansluit op mdb-reader en op de tabeldefinitie. Bladeren (200 rijen per pagina) en het totaal volgen de levende rijen. Alle 14 tabellen in 7 bestanden uit de eerste proef (eigen scan = tabeldefinitie, mdb-reader anders) tonen nu het juiste aantal en staan niet meer bij de afwijkingen.
4. **Unieke indexen.** De unieke vlag werd op de verkeerde plek gelezen. Bij Jet 4/ACE staan na de kolomplaatsen, de usage map en de eerste indexpagina nog 4 onbekende bytes vóór de vlaggen (Jackcess: `SKIP_BEFORE_INDEX_FLAGS`); de lezer nam de laatste byte van het paginanummer. Na herstel: in clinic.accdb (`rizwansafi043_clinic_managment_system-b2525e5…`) is index PID op `BillT` niet uniek (vlag 0x80), de primaire sleutel wel (0x89). Een logische index die de fysieke index van de primaire sleutel deelt, geldt nu ook als uniek. De dubbele sleutels in `PatientT` daar kwamen uit verwijderde rijversies (punt 3). De 23 overgebleven gevallen zijn verborgen indexen op samengestelde velden (bijlagen, meerwaardige velden, versiegeschiedenis): die zijn uniek op de verborgen ID van het samengestelde veld, terwijl mdb-reader de inhoud teruggeeft; dat is geen leesfout.

### Overige afwijkingen (ongewijzigd)

- 39 tabellen in 31 bestanden: het rijaantal in de tabeldefinitie wijkt af, maar mdb-reader, het alleen-lezen-pad en de eigen scan zijn het eens. Dit is gebruikelijk bij niet-gecomprimeerde Access-bestanden; de correctie wordt dan bewust niet toegepast.
- 4 tabellen in 4 bestanden waar de eigen scan afwijkt: 2× zijn tabeldefinitie en mdb-reader het eens maar telt de eigen scan meer rijplaatsen (`bmullan91_seneca_msaccess_store-d37f542…` `test/TestDB.accdb`, `eliomarsouza_gerenciadormsaccesssimple-017cc69…` `BANCO.mdb`; de correctie wordt daar niet toegepast), 2× leest mdb-reader de tabel niet (`Wrong page type`) en wijkt de eigen scan af van de tabeldefinitie (`naharcomputer_msaccess_vba_e2sc-331a88f…` en `-a21566c…`).
- mdb-reader leest de rijen niet bij 12 tabellen: `Failed to read complex column` (8, 6 bestanden) en `Wrong page type` (4, 4 bestanden).

## Conclusie

Het teruggewinnen van Access-modulebron is nu aangetoond op 100 echte databases uit 74 openbare projecten: 1.556 modules en ruim 200.000 regels uit `MSysAccessStorage` (Access 2007+) en `MSysAccessObjects` (Access 2000–2003), zonder één fout in de eigen CFB-, dir- of MS-OVBA-lezer. Na het herstel heeft `MSysAccessStorage` een eigen terugvalroute, geven versleutelde ACCDB’s een duidelijke melding en een rapport, tonen het alleen-lezen-pad en de werkkopie dezelfde rijen, en kloppen de unieke vlaggen van indexen. Open punten: Access 97-moduleopslag (`MSysModules2`), samengestelde velden en de `Wrong page type`-tabellen in mdb-reader, en de 4 tabellen waar de eigen paginascan afwijkt.
