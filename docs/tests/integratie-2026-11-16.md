# Integratie hervat — 16 november 2026

Deze ronde vervolgt de eerdere integratie in
`codex/integratie-2026-11-16`, concept-PR
[#353](https://github.com/OpenAEC-Foundation/open-office-studio/pull/353).
De stopmomenten van 9 en 10 november zijn historisch; de gebruiker heeft het
weekplan hervat. Deze opdracht geeft geen toestemming voor een wijziging van
`main`, een officiële release of voortijdige sluiting van brede issues.

## Bronintake

PR #248 is op 11 november samengevoegd. De actuele basis voor deze ronde is
`93fcc6194904f70fa12d0a3546c23dac9c673ee5`. Dit is een gelezen en gefetchte basis;
de integratiechat heeft `main` niet gewijzigd.

Zes van de zeven eerder uitgestelde leveringen zijn al voorouder van deze
basis: #337, #346, #341, #343, #344 en #342. Hun volgorde en vervolgwerk staan
in de [vervolgbundel van 11 november](2026-11-11-vervolgbundel.md). Ze worden
hier niet opnieuw samengevoegd. Ook de
[prioriteitenbundel](2026-11-12-prioriteitenbundel.md) en
[crop-/klembordcorrecties](2026-11-13-crop-and-paste.md) zijn al aanwezig.

- #327 / PR #349: de oude brede branch is vervangen door een afgebakende
  actualisering op dezelfde basis. De eigenaar controleert de eerder gemeten
  vertraging opnieuw met vaste A/B/A-metingen, gewone productie- en hosted
  proeven en CI. Nog niet vrijgegeven voor deze integratie.
- PR #317 / #30: afzonderlijke hervatte native acceptatie, met eigen bronpunt
  en testworkflow. De oudere native fouten en macOS-blokkade zijn niet verdwenen
  doordat de kalender is veranderd. Geen automatische intake in deze kandidaat.

## Geldig basisbewijs op `93fcc619`

Deze resultaten blijven gekoppeld aan de basis. Ze worden niet hernoemd tot
bewijs voor een latere kandidaat met gewijzigde applicatiecode.

| Platform | Build en pakket                                                                                                                      | Functioneel                                                                                                                  | Resterend                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Windows  | [Desktop-CI 43459991173](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43459991173), pakketcontrole geslaagd | 3.466 tests, drie bestaande skips; 113 Rust-tests                                                                            | Nieuwe native bediening op het uiteindelijke kandidaatpakket                                |
| Linux    | Dezelfde CI, DEB/AppImage uitgepakt en gecontroleerd                                                                                 | 3.466 tests, drie bestaande skips; 113 Rust-tests                                                                            | Nieuwe native Writer-ronde op DEB; AppImage-bediening en andere modules niet hiermee gedekt |
| macOS    | Dezelfde CI, app/DMG en 31 bestandskoppelingen gecontroleerd                                                                         | 3.466 tests, drie bestaande skips; 113 Rust-tests; twee bestanden via LaunchServices bij starten en in draaiende app geopend | Volledig bewerken/opslaan/heropenen via de native interface nog niet bewezen                |
| Browser  | Lokale normale build 40,16 s; strikte hosted build 35,05 s                                                                           | Build en relatieve/offline broncontrole geslaagd                                                                             | Nieuwe combinatieproeven via de echte `/office/`-route na definitieve bronintake            |

De database-CI op dezelfde basis slaagt op alle drie besturingssystemen
([43459990937](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43459990937));
het zelfstandige voorbeeld eveneens
([43459990852](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43459990852)).
Alle 49 gerichte bibliografie-/tekenopmaaktests slagen lokaal zonder
skip of fout. De bibliografiecontrole vergelijkt alle pakketbytes rechtstreeks;
de tijdslimiet en inhoudelijke eisen zijn niet versoepeld.

## Nieuwe Linux-bedieningscontrole

`scripts/proef-native-linux-basis.mjs` installeert de daadwerkelijk gebouwde en
onafhankelijk gecontroleerde DEB op de tijdelijke Linux-runner. De proef gebruikt
Tauri/WebKitGTK, echte WebDriver-toetsen en een synthetisch DOCX in een eigen
testprofiel. Vereist zijn: tekst invoeren, Ctrl+S naar schijf, onafhankelijke
DOCX-inhoudscontrole, volledig proces afsluiten, opnieuw starten en de opgeslagen
tekst vinden met het echte zoekpaneel. Geen conversieprogramma, nagebootste IPC
of gecompileerde editorbrug wordt hiervoor gebruikt.

De eerste CI voor PR-head `6ae70072` stopte vóór de bediening. De werkelijke
CI-checkout `6141ad2a` heeft dezelfde boom
`a48c17cfbb4ccd7ea76532693e3a07e98c772cb6`. De geïnstalleerde executable
werd ten onrechte met de losse Cargo-build vergeleken. Het installatiepakket kan
die executable bij het verpakken wijzigen. De correctie in `8d95b0dc` vergelijkt
daarom de geïnstalleerde bytes met de payload van precies dezelfde DEB waarvan
de checksum al in het pakketrapport is gecontroleerd. Beide executable-hashes
blijven in het rapport; de mislukte eerste proef blijft als zodanig bewaard.
Dit is een correctie van de test, geen gereproduceerde applicatiefout.

De nieuwe native uitslag is nog in afwachting. Alleen een volledig geslaagde
proef telt als acceptatie van deze afgebakende Writer-ronde. Een groen pakket
of een geblokkeerde bediening telt daar niet voor. De proef draait onder Xvfb
met softwaregraphics, betreft alleen DEB/Writer en certificeert geen fysieke
hardware of algemene native moduledekking.

## Nog afronden vóór overdracht

1. #327 alleen na expliciete vrijgave van het afgebakende bronpunt beoordelen
   en eenmaal opnemen; ongunstige en gunstige meetresultaten samen bewaren.
2. Eén vast gecombineerd applicatiecodepunt aanwijzen en daarop de verplichte
   platform- en browsercontroles uitvoeren; geldige gelijkblijvende bewijzen
   hergebruiken zonder ze aan een andere bron toe te schrijven.
3. De exclusieve Windows-tester het geverifieerde uiteindelijke CI-pakket laten
   bedienen. Tijdens de CPU8-meting blijven lokale builds, browsers en installatie
   stil; pas na het eindbericht hervatten.
4. Werkelijke uitslagen, ontbrekende native controles, bronpunten en eventuele
   afzonderlijk uitgestelde leveringen vastleggen. `main` blijft ongewijzigd.
