# Afgeronde beperkte controles — 24 november 2026

Alle geplande beperkte platform-, native- en pakketcontroles zijn uitgevoerd en beoordeeld op dezelfde applicatie P5 `b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree `e30879fd772871e690847c061ef66e6b81808a05`, versie `2026.48.1`. De bron/pakketidentiteiten en twee afzonderlijke producerketens zijn behouden. Dit document geeft geen toestemming voor main, tag, releaseaanmaak of publicatie.

| Onderdeel | Beoordeling | Bewijs en grens |
| --- | --- | --- |
| Windows zes zelfstandige apps | PASS binnen de afgebakende kernscenario's | Finale join `3f27ae6d`; afzonderlijk bewezen directe Presentation-canvasinvoer. Oude mislukte driverpogingen blijven behouden. |
| Linux zes apps, DEB en AppImage | PASS binnen twaalf kernroutes | Bestaande onafhankelijke audits; virtuele X11/softwaregraphics en AppImage-extractie zijn expliciet begrensd. |
| Mac zes zelfstandige apps | Geaccepteerd binnen de afgebakende functionele routes | [Geconsolideerd ownerbewijs](mac-standalone-owner-acceptance.json), met afzonderlijke onafhankelijke audits. Spreadsheet gebruikt de onderstaande bewijscombinatie. |
| Suite Windows/Linux/macOS | Afgesproken core- en issuecontroles PASS | Linux blijft beperkt voor niet-bediende lintcontexten. De oude Mac-opslagwaarneming staat hieronder afzonderlijk. |
| STW / #374 | Afgesproken route gesloten | Linux `658512c9`, Windows `c895437b`, Mac Writer `22cdd260`, Mac Suite `0261063d` en bestaand P5-browserbewijs. Mac post-savebeeld met Done-toast blijft LIMITED; vrije verse-heropening en identieke opgeslagen XML bewijzen de persistente toestand. |
| Korte #377 | PASS op drie desktopplatforms | Opslaan en echte sneltoets geven XLSX-voorstel; annuleren bewaart bron en dirty werkkopie. Zwarte Mac-captures krijgen geen visuele goedkeuring. |
| Browser | Eerder beoordeelde P5-routes behouden | Windows/Linux/macOS, `/` en `/office/`; geen overdracht van browserbewijs naar native. |
| Definitieve pakketbytes | PASS | [28 installers, rapporten, Linux-signatures en checksums](../P5-final-package-verification/README.md); geen publicatie. |

## Spreadsheet op Mac

De oorspronkelijke functionele core-receipt blijft gekoppeld aan de daadwerkelijk geteste bron en pakketbytes. De timeout van de oorspronkelijke host wordt niet veranderd in een geslaagde finale cleanup. Verse GNM- en Gnumeric-hosts bewijzen hun eigen native bediening, opslag, normale afsluiting, nieuw proces, heropening en cleanup.

De oorspronkelijke XLSB-uitvoer bevat onafhankelijk gecontroleerd dertig formules: A15 `40+2` met cache `42`, de overige 29 `1+2` met cache `3`. De oorspronkelijke late OCR-controle bij 100% blijft FAIL. [De aanvullende onafhankelijke readback-audit](../P5-Mac-native-independent/spreadsheet-xlsb-readback/audit.json) controleert exact dezelfde opgeslagen XLSX (`6476` bytes, SHA256 `0eb60817b210e6e9261764b32f97971d69e9d9ee911f3a012072c91632defdee`) in run `45361373078`, job `138332599919`: twee normale processen `2471 → 6783`, echte native zoom 200%, twee originele zichtbare A15=42-beelden, ongewijzigde body-OCR met confidence 1 en finale cleanup. Import, bewerking, #377 en opslag zijn daarbij niet opnieuw uitgevoerd.

## Nog te beoordelen oude Mac-opslagwaarneming

Run `45355259350` liet een echte ingevoerde Q en dirty document zien vóór een geautomatiseerde legacy `Command+S`; het DOCX-bestand bleef zonder Q. De oude opname registreert geen daadwerkelijke eventontvangst of save-handlerbevestiging, geen directe pre-save load/busy-state en geen filesystem-permissies. Er is geen bewezen productoorzaak of driveroorzaak.

Zes verse gecontroleerde kopieën in run `45358252707` slagen allemaal: tweemaal de oorspronkelijke PID-route, tweemaal PID met andere key-up flags en tweemaal HID. Iedere kopie bevat exact één Q, behoudt overige tekst/tabel/media en sluit normaal af. Deze proeven plus de geslaagde core- en #374-routes bewijzen de huidige afgebakende savecriteria, maar verklaren de oude waarneming niet. De [onafhankelijke differentiaalaudit](mac-suite-save-differential-independent.json) bewaart dat onderscheid.

**Centrale beslissing: de stabiele releasevoorbereiding is gereed binnen de afgesproken begrensde acceptatie.** De [onafhankelijke eindweging](save-gate-disposition.json) concludeert dat de vereiste native save-/heropencriteria door de huidige strikte positieve proeven zijn vervuld. De coördinator neemt dat oordeel over. Een bewezen oorzaak voor iedere historische mislukte geautomatiseerde poging is geen extra acceptatiecriterium. De oude FAIL blijft behouden; een incidenteel product-opslagprobleem is hiermee niet uitgesloten. Deze concrete onzekerheid blijft vermeld bij het advies. Er is geen nieuwe testronde nodig uitsluitend om die oude waarneming te verklaren. `stableReleaseReady=true` geeft geen toestemming voor main of publicatie.

Nieuwe formaatproeven en #382 blijven buiten deze gesloten P5-intake. #366 blijft uitgesteld. Volledige formaat-, font-, paginerings-, render- of algemene resourceclosure-acceptatie is niet geclaimd.
