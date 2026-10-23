# Weekuitgave en zelfstandige database-app — 2026-W43.1

Gecontroleerd op 23 oktober 2026. De versiebestanden van Office Studio en Open Access Studio bevatten `2026.43.1`; de interface toont `2026-W43.1`.

## Uitgevoerd

- 42 frontendproeven slagen, waaronder acht ISO-weekgevallen met jaarwisselingen en ongeldige datums.
- De versiecontrole bevestigt dezelfde versie in package-, Tauri-, Cargo- en lockbestanden van beide apps.
- De zelfstandige Access-productiebundel bouwt met ongeveer 506 kB JavaScript, inclusief worker. De bundelcontrole vindt geen kantoorengine of kantoor-WASM en bevestigt de meegedistribueerde licenties.
- De gebouwde Access-worker leest een oudere MDB, een ACCDB en een MDB met 512 rijen, ook zonder de gebruikelijke Node-globals. Paginering wordt afzonderlijk gecontroleerd.
- Twee Rust-proeven controleren het weigeren van database-extensies, lege en ongeldige tekstuitvoer en een echte atomaire CSV-schrijfactie.
- Elf Python-proeven slagen. TypeScript en beide productiefrontends bouwen.
- De zelfstandige Linux-DEB is lokaal gebouwd en uitgepakt: eigen programmanaam, versie, architectuur, bibliotheken, snelkoppeling en pictogram zijn gecontroleerd. De volledige platformbouwstraat maakt daarnaast eigen Windows-, AppImage- en macOS-pakketten.

## GUI

De zelfstandige browserapp is met echte corpusbestanden bediend:

1. ACCDB via Database openen gekozen; vier tabelnamen en de negen kolommen met twee rijen van Table1 gelezen.
2. Zoeken op `abcdefg` beperkt de geladen tabel tot één rij. De daadwerkelijke CSV-download is onafhankelijk gelezen: negen kolommen en precies de gekozen rij.
3. Een oudere MDB via Ctrl+O geopend. De eerste pagina toont rijen 1–200 van 512; Volgende pagina toont rijen 201–400.
4. Ongeldige database-invoer geeft een Nederlandse foutmelding en behoudt de bestaande tweede pagina.
5. De definitieve OpenAEC-stijl met de echte ACCDB opnieuw geopend. Lichte en donkere weergave, logo, weekversie en het compacte lint visueel gecontroleerd. De browserconsole bevat tijdens deze bediening geen foutmelding.

In de kantooromgeving zijn start, Writer, Calc en Presentatie visueel gecontroleerd met de eigen voorbeelden. Het Writer-bestandsmenu begint op dezelfde hoogte als de onderkant van de kopbalk (44 pixels); een hit-test op de ribbonpositie treft het menu. De bestaande stapelcontext en invoerblokkering blijven behouden.

## Stijlbron en grenzen

De stijl gebruikt de officiële tokens en het symbool uit OpenAEC-style-book, revisie `dfdcd415b26604081b1699560621d3e9ae7ea6bf`. Herkomst, licentie en toepassing staan in [de stijlnotitie](../ontwerp/openaec-stijl.md). De nieuwe [screenshots](../screenshots/README.md) zijn rechtstreeks uit de productiefrontends vastgelegd.

Deze browsercontroles vervangen geen schone installatie of native dialoogbediening. Access blijft alleen lezen; query-editor, formulieren, relaties, VBA-extractie en VBA-uitvoering ontbreken. De oude corpusproef met 1.566 bestanden is voor deze wijziging niet volledig herhaald. De kantoorengines en hun formaatbeperkingen zijn verder ongewijzigd.
