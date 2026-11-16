# Integratie — 16 november 2026

Werkbranch: `codex/integratie-2026-11-16`, concept-PR [#353](https://github.com/OpenAEC-Foundation/open-office-studio/pull/353). Deze kandidaat blijft concept: de Windows-bediening is door een fysieke Escape-stop onderbroken en native visuele/platformcontroles ontbreken nog. Er is geen toestemming voor `main`, een officiële release of voortijdige issue-sluiting.

## Vastgelegde bron en intake

De applicatiefreeze is **`e1f84f84f4d72e5ce8ab967e376a6f38344edf39`**, tree `2e6123201cd3a357ac3b2df8126fa15760fce865`. De latere testharness `e6765c56d1d07e0a44d5901f9e7dabc5a43e38f3` voegt uitsluitend test-/workflowbestanden toe; `src`, `src-tauri`, `public`, `assets`, `vendor`, package-/lockfile en Vite-/TypeScript-config verschillen niet van de freeze. Resultaten hieronder blijven bij hun werkelijk geteste commit en pakket. De verplichte CI op de nieuwe harness-head is afzonderlijk gestart; die uitslag wordt niet uit de eerdere bron afgeleid.

Basis is `93fcc6194904f70fa12d0a3546c23dac9c673ee5`. PR #248 was al op 11 november samengevoegd. De zes late leveringen #337, #346, #341, #343, #344 en #342 zitten al in deze basis en zijn niet dubbel toegepast; zie de [vervolgbundel](2026-11-11-vervolgbundel.md), [prioriteitenbundel](2026-11-12-prioriteitenbundel.md) en [crop-/klembordcorrecties](2026-11-13-crop-and-paste.md).

#327 / PR #349 is eenmaal geïntegreerd vanuit de afgebakende head `cb99e79ed2e1c9468f24bf69903572b6dc29ad82`, met bewijs uit `4f88c4f75dca3cba1c61628d7a5655ba983327e8`. De applicatie-invoer van de freeze is gelijk aan deze vrijgegeven bron. De oude brede 8bf-head is bewaard en niet opnieuw toegepast. De vrijgave betreft gezamenlijke/native validatie; issue #327 blijft open en de bron-PR blijft concept.

PR [#354](https://github.com/OpenAEC-Foundation/open-office-studio/pull/354), head `ae0813a4f21b8862b0b5270ceb16c303587d7143`, is afzonderlijk opgeleverd voor de volgende bronintake. Deze vervangt de historische PR #317; niet beide opnemen. De nieuwe platformbewijzen gelden voor de eigen applicatiebron `c0fbbcb8`, niet voor deze freeze. De runtimewijziging is nog niet in #353 opgenomen en onderbreekt de lopende Windows-ronde niet.

## Gecombineerd bewijs op de applicatiefreeze

| Platform | Tests, build en pakket                                                                                                                         | Werkelijke bediening                                                                                                                                                | Nog open                                                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | 3.480 tests / drie bestaande skips / 325 bestanden; 58 Python; 113 Rust / vijf ignored; build en uitgepakte NSIS gecontroleerd                 | Werkelijk DOCX openen, NL→EN-taalgrens, invoer, Undo/Redo en Ctrl+S; opgeslagen XML en media onafhankelijk gecontroleerd                                            | Door Escape gestopt: sluiten/heropenen, tabwissel, crop toepassen, Spreadsheet en Presentation niet afgerond                                                  |
| Linux    | Dezelfde 3.480 / drie skips; 58 Python; 113 Rust / zes ignored; build, DEB en AppImage uitgepakt                                               | Het oorspronkelijke DEB doorstaat met harness e676 echte toetsen, Ctrl+S, schijfcontrole, volledig appproces afsluiten, nieuw proces en één Find-resultaat          | Paginatekst in latere screenshots niet leesbaar; geen visuele native acceptatie. Geen taalgrenzen/UndoRedo/tabs, andere modules of AppImage-bediening bewezen |
| macOS    | Dezelfde 3.480 / drie skips; 58 Python; 113 Rust / vijf ignored; app/DMG, koppelingen en LaunchServices-start/openen in draaiende app geslaagd | Alleen de afgebakende native openingsproef                                                                                                                          | Geen huidige native taal-/invoer-/opslag-/heropenacceptatie; de nieuw beschikbare #354-driver is een mogelijke vervolgmethode, geen bewijs op deze freeze     |
| Browser  | Normale build 42,11 s; hosted 33,05 s, strikte externe/relatieve broncontrole geslaagd                                                         | Alle drie OS: negen gewone en negen echte `/office/`-gevallen, 54 totaal; lokaal bovendien 25 taalchecks per route en echte 600-alinea Ctrl+S/download/heropenproef | Geen native GUI-vervanging of algemene prestatieclaim                                                                                                         |

[Desktop-CI 43838167666](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43838167666) heeft geslaagde Windows- en macOS-jobs; Linux faalde uitsluitend in de eerste nieuwe native Ctrl+S-proef. Die rode uitslag blijft behouden. De [database-CI](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43838167470) slaagt op alle drie OS, evenals [voorbeeld](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43838167506) en [Writer-formaatproef](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43838167534).

De [exact-head browsermatrix](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43838158506) slaagt volledig. Alle zes rapporten bevestigen bron `e1f84f84`, `dirty=false`, negen gevallen en nul paginafouten. De drie ZIP-digests zijn onafhankelijk gecontroleerd. Normale en hosted distributies hebben elk 727 bestanden; boomhashes `825ee7a0c54227209d6776e3bbe42d24674ed7a524a76330757450b3710d8233` en `20311112e57cb567d9bc902710d8208bb6ce5d57a57ccfbcdb7ad72a49fd9772`. Algoritme: Unicode-gesorteerde relatieve POSIX-paden, per bestand UTF-8 `path TAB sha256 TAB bytes NEWLINE`.

De 50 taalchecks gebruiken de vastgelegde productieprobe met de verwachte bronassertie aangepast aan deze freeze, zonder gewijzigde productassertions, meetbrug of Tauri-simulatie. Beide routes bewaren tekst, taalgrenzen, Undo/Redo en documenttabs. De 600-alineaproef controleert alle opgeslagen en heropende teksten exact.

## Native Linux: uitslagen blijven gescheiden

De eerste twee harnesspogingen stopten vóór de bediening: eerst een onjuiste vergelijking met de losse Cargo-binary in plaats van de gecontroleerde DEB-payload; daarna de niet ondersteunde `tauri-driver --version`-aanroep. De huidige controle vergelijkt geïnstalleerde bytes met de DEB-payload, leest Cargo's echte installatieregister en registreert de driverbinary-SHA.

De eerste echte proef op de freeze toonde de getypte tekst, maar het bestand bleef bytegelijk aan de invoer en Ctrl+S was niet geslaagd. De helper wachtte alleen op een invoerveld. De nieuwe harness vereist ook de zichtbare, enabled Save-knop vóór typen en vóór opslaan, in twee opeenvolgende polls. Deze herhaling ondersteunt een gereed-/timinghypothese; ze bewijst niet sluitend waarom de eerste Ctrl+S miste. Een laat geplaatste keydown-observer kan de door de app afgehandelde savechord missen door `stopImmediatePropagation`.

[Herhaling 43842027746](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43842027746) gebruikt **exact hetzelfde** bewaarde DEB, SHA `14d588cdfcebc6e50607033a324c3e6c37a77f440a5aebd36b5a6356d4ea3eb5`. Het Actions-archief, pakketrapport, broncommit en geïnstalleerde payload zijn opnieuw gecontroleerd. Geen applicatieherbouw of fallback-Saveklik. Alle vier strikte rondechecks en cleanup slagen; zelfstandig uitgepakte uitvoer bevat exact één alinea `NATIVE_LINUX_SAVED_MARKER Synthetic native Linux document.`. Opgeslagen SHA `51c763956dacb5f610724ec97bfc0aca1defdae1817a77a0b4d70fae6d9cbf46`.

**Visuele beperking:** de eerste failure-PNG toont leesbare tekst op een donkere pagina. De latere saved-/reopened-PNG's tonen een lichte pagina zonder leesbare glyphs; het Find-paneel toont wel de juiste tekst en één treffer, met een gele documenthighlight. Dit is een screenshotwaarneming, geen bewezen font-, renderer- of #327-oorzaak. De data-/procesronde is geslaagd; volledige native schildering is niet geaccepteerd. De proef gebruikt Xvfb/softwaregraphics en certificeert geen fysieke hardware.

## Native Windows: fysieke stop gerespecteerd

Gecontroleerde NSIS-SHA `2993245b1f168b8793a6f2530aa860b7c0a8fca6b052841841cdd268ffe20e25`; installatie exit 0. De werkelijke geïnstalleerde executable heeft SHA `87821a86fe4aa3c8b18ff69b0fb63278d40c297c2ad181aa05709d7645e3a0ad` en versie 2026.46.2.

De kleine synthetische Writer-uitvoer is werkelijk opgeslagen, SHA `fee5aac50a3330a7c511571885f75a4c162160d500d82e851f3301b2ed0c5619`. Alineateksten, talen, oorspronkelijke afbeelding en ongewijzigde cropwaarden zijn zelfstandig gecontroleerd. Dit is gedeeltelijke native acceptatie. Bij de eerste cropgreep meldde Computer Use een fysieke Escape-stop; daarna is geen verdere GUI-invoer gedaan en geen andere operator gestart.

De cropdialoog kan nog openstaan met oorspronkelijke, niet toegepaste waarden. Het eigen Writer-bestand is schoon opgeslagen; voorkeuren zijn niet gewijzigd. Alleen na expliciete hervatting door de gebruiker mag dezelfde operator de dialoog annuleren en het eigen document sluiten. Overige native tests blijven afzonderlijk open.

## Prestatiebewijs en volgende stappen

Het [bronrapport](2026-11-16-pr349-combination.md) bewaart de volledige CPU4/CPU8-context, ook eerdere ongunstige metingen. CPU8 A/B/A: 7.747,98 / 8.167,27 / 10.510,58 ms inclusief rust en uitgesteld werk. De kandidaat valt tussen de controles; geen algemene snelheids- of RAM-winst claimen. Tekst/caret/geometrie/opslagcontroles slagen.

1. Beoordeel de afzonderlijke CI op harness-head e676: [desktop 43842910043](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43842910043), [database 43842910068](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43842910068), Writer 43842910064 en voorbeeld 43842910029. Bij het schrijven lopen de eerste controles nog; ze zijn niet groen verklaard.
2. Laat de gebruiker bepalen of Windows GUI uitsluitend mag worden opgeruimd of later ook verder getest. Respecteer de stop; gebruik geen andere operator als omweg.
3. Houd de native visuele Linux- en macOS-bedieningsgaten expliciet open. De beschikbare begrensde Mac-AX-driver kan later op het huidige pakket worden aangepast, met echte modalcontrole en zonder rechtenwijzigingen.
4. Beoordeel daarna de volgende bronintake PR #354 en test die nieuwe applicatiecombinatie opnieuw. Neem #317 niet daarnaast op. Geen automatische nieuwe issuescope, main-merge of release.

Het [machineleesbare rapport](integratie-2026-11-16.json) koppelt bronnen, CI, archief-/pakketdigests, zelfstandige controles en resterend werk. Oude overdrachten blijven historisch; deze integratiechat blijft het centrale overzicht.
