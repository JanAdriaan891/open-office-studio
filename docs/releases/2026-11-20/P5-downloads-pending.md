# P5-pakketbindingen en voorbereide downloads — niet gepubliceerd

Bron b696ab86bd1c128729a079b68c0082e6df3d36a5; tree e30879fd772871e690847c061ef66e6b81808a05; versie 2026.48.1.
Alle 28 pakketnamen, bytes, SHA256 en werkelijke producerketens zijn nu vastgelegd in [de JSON-matrix](P5-downloads-pending.json) en onafhankelijk gebonden aan [de finale pakketcontrole](P5-final-package-verification/README.md). De tabel hieronder toont uitsluitend bestandsnamen; publieke URL's blijven null en publicDownloadsAvailable=false. Native acceptatie blijft afzonderlijk in de [centrale zelfstandigheidsmatrix](P5-standalone-matrix.json).

## Vastgelegde bestandsnamen — alle 28 nog niet gepubliceerd

| App | Windows x64 EXE | macOS ARM64 DMG | Linux x64 DEB | Linux x64 AppImage |
| --- | --- | --- | --- | --- |
| Open Office Studio | `Open.Office.Studio_2026.48.1_x64-setup.exe` — niet gepubliceerd | `Open.Office.Studio_2026.48.1_aarch64.dmg` — niet gepubliceerd | `Open.Office.Studio_2026.48.1_amd64.deb` — niet gepubliceerd | `Open.Office.Studio_2026.48.1_amd64.AppImage` — niet gepubliceerd |
| Open Writer Studio | `Open.Writer.Studio_2026.48.1_x64-setup.exe` — niet gepubliceerd | `Open.Writer.Studio_2026.48.1_aarch64.dmg` — niet gepubliceerd | `Open.Writer.Studio_2026.48.1_amd64.deb` — niet gepubliceerd | `Open.Writer.Studio_2026.48.1_amd64.AppImage` — niet gepubliceerd |
| Open Spreadsheet Studio | `Open.Spreadsheet.Studio_2026.48.1_x64-setup.exe` — niet gepubliceerd | `Open.Spreadsheet.Studio_2026.48.1_aarch64.dmg` — niet gepubliceerd | `Open.Spreadsheet.Studio_2026.48.1_amd64.deb` — niet gepubliceerd | `Open.Spreadsheet.Studio_2026.48.1_amd64.AppImage` — niet gepubliceerd |
| Open Presentation Studio | `Open.Presentation.Studio_2026.48.1_x64-setup.exe` — niet gepubliceerd | `Open.Presentation.Studio_2026.48.1_aarch64.dmg` — niet gepubliceerd | `Open.Presentation.Studio_2026.48.1_amd64.deb` — niet gepubliceerd | `Open.Presentation.Studio_2026.48.1_amd64.AppImage` — niet gepubliceerd |
| Open Email Studio | `Open.Email.Studio_2026.48.1_x64-setup.exe` — niet gepubliceerd | `Open.Email.Studio_2026.48.1_aarch64.dmg` — niet gepubliceerd | `Open.Email.Studio_2026.48.1_amd64.deb` — niet gepubliceerd | `Open.Email.Studio_2026.48.1_amd64.AppImage` — niet gepubliceerd |
| Open Notition Studio | `Open.Notition.Studio_2026.48.1_x64-setup.exe` — niet gepubliceerd | `Open.Notition.Studio_2026.48.1_aarch64.dmg` — niet gepubliceerd | `Open.Notition.Studio_2026.48.1_amd64.deb` — niet gepubliceerd | `Open.Notition.Studio_2026.48.1_amd64.AppImage` — niet gepubliceerd |
| Open Database Studio | `Open.Database.Studio_2026.48.1_x64-setup.exe` — niet gepubliceerd | `Open.Database.Studio_2026.48.1_aarch64.dmg` — niet gepubliceerd | `Open.Database.Studio_2026.48.1_amd64.deb` — niet gepubliceerd | `Open.Database.Studio_2026.48.1_amd64.AppImage` — niet gepubliceerd |

Interne artifactmembers behouden spaties; de latere publicatiecollector vervangt uitsluitend spaties door punten. JSON bewaart beide namen. Architectuur is Windows x64, macOS ARM64 en Linux x64; geen Intel-Mac/Windows-ARM/RPM-aanbod afgeleid.

## Identiteiten en afzonderlijk te accepteren kernscenario’s

| App | Binary | Eigen ID / geconfigureerde profielnamespace | Kernscenario |
| --- | --- | --- | --- |
| Open Office Studio | `open-office-studio` | `org.openaec.office-studio` | Alle zes werkruimtes bereikbaar; Writer input/Find/Undo/Redo/lint/tabel; STW-DOCVARIABLE-titel zichtbaar na edit/save/volledige exit/nieuw proces; bronveld/cache en overige inhoud onafhankelijk controleren. |
| Open Writer Studio | `open-writer-studio` | `org.openaec.writer-studio` | DOCX en echte STW via native openen; titelveld met caps/tracking en gewone marker zonder overlap; Undo/Redo, DOCX-save, normale exit en nieuw proces; veld/cache/stijlen/placeholder-oracle. |
| Open Spreadsheet Studio | `open-spreadsheet-studio` | `org.openaec.spreadsheet-studio` | XLSX-waarden/formule en Undo/Redo; import-only XLSB Ctrl+S en Opslaan openen Opslaan als met XLSX-voorstel; annuleren wijzigt oorspronkelijke XLSB niet; opgeslagen XLSX na nieuw proces onafhankelijk controleren. |
| Open Presentation Studio | `open-presentation-studio` | `org.openaec.presentation-studio` | PPTX openen, bestaande titel/notities bewerken, Undo/Redo, save, normale exit en nieuw proces; dia/tekststructuur onafhankelijk controleren; geen algemene legacy-opmaakclaim. |
| Open Email Studio | `open-email-studio` | `org.openaec.email-studio` | Synthetisch lokaal account/testserver; compose Ctrl+S en werkende knop bewaren werkelijk concept met juiste MIME/body; modal-/documentisolatie; normale exit en nieuw proces heropenen. Geen echte mail verzenden. |
| Open Notition Studio | `open-notition-studio` | `org.openaec.notition-studio` | Synthetische .openaec-notities-back-up toevoegen, juiste notebook/sectie/pagina kiezen, titel/body bewerken, bewaren, normale exit en nieuw proces; daadwerkelijke persistente inhoud controleren. |
| Open Database Studio | `open-database-studio` | `org.openaec.database-studio` | Synthetische database via native picker openen, tabel/query-resultaat en ondersteunde export opslaan; normale exit/nieuw proces en inhoudscontrole; geen niet-ondersteunde databaserondschrijfclaim. |

Zes geregistreerde werkruimtes docx/xlsx/pptx/email/notities/database corresponderen met zes dedicated producten. De zeven app-identiteiten/binaries zijn bronmatig uniek; onafhankelijke profielisolatie en Suite-afwezigheid blijven native bewijsvereisten. Ingebouwde PDF-, VBA/SQL-, grafiek-/vormfuncties zijn geen extra zelfstandige apps.

## Historische links

De [bestaande openbare 2026.46.2-links](standalone-downloads/standalone-download-coverage-2026-11-23.md#echte-bestaande-openbare-links--uitsluitend-2026462) zijn historisch. Deze review heeft geen URL bezocht en geen installer gedownload; eerdere HTTP/metadata-audits blijven onder hun oorspronkelijke datum/bron. Een kandidaat kan voor publicatie worden beoordeeld zonder al publieke links te hebben. Verificatie van latere openbare downloadbytes blijft een afzonderlijke, nog niet geautoriseerde publicatiestap.

## Acceptatie per pakketvorm

Voor iedere rij: bron/run/job/attempt/gatetijd → officiële archive/member → volledige grootte/SHA → echte pakket-ID/architectuur/executable/profiel → toepasselijke signing → native focus/save/reopenpreflight → kernscenario + onafhankelijke inhoud + originele beelden → normale afsluiting/nieuw proces + cleanup. Build-, script-, engine-, browser- en native bewijs worden apart gelabeld. Linux DEB en AppImage worden niet onderling als nativepass overgenomen.

Browser / en /office/ worden apart op P5/Windows/Linux/macOS beoordeeld; browserdekking wordt geen native zelfstandigheids- of OS-filepickerpass.

Zie [JSON met 28 actuele pakketbindingen](P5-downloads-pending.json), de oorspronkelijke [bron-/schema-audit](P5-downloads-source-audit.json) en [actuele centrale overdracht](current-handoff.json). De centrale zelfstandigheidsmatrix blijft eigenaar van de echte native acceptatieresultaten; deze documentatie geeft geen nativepass.

## Gecontroleerde ketens en latere publicatiestap

Windows en Linux behouden producer 45177730188/attempt1 op appbronP5. macOS gebruikt de afzonderlijke producer 45195055147/attempt1/workflowhead 2af94cdcefa3e88e4980b631d16a88d7d7de5ae8; de werkelijke appbron blijft b696ab86/treee30879fd. De originele 820-byte bronwitness/SHA236085a316b40b2e5033316a3e3ed45f91cb9a27e83d518117160ba4aff4e7d5 bindt beide. De oorspronkelijke Macfailure blijft behouden.

Er zijn 60 voorbereide releaseassets: 28 installers, 14 rapporten, 14 Linux-signatures, 2 publieke-sleutelbestanden, SHA256SUMS en diens signature. Het manifest heeft 58 regels omdat het zichzelf en de eigen signature niet opsomt. De onafhankelijke review controleert echte bewaarde bytes/rapporten/sums/fingerprint; 15 cryptografische verificaties zijn in een apart public-only GPG-home in CI uitgevoerd. Geen extra lokale GPG-verificatie wordt geclaimd.

De bestaande release.yml-publisher vereist een eigen succesvolle bouwmatrix en haalt alleen artifacts uit diezelfde run. Hij kan de aparte Macrun niet aan de mislukte oorspronkelijke matrix lenen. Na resterende native acceptatie is **afzonderlijk gebruikersakkoord** nodig voor een gereviewd plan dat uitsluitend deze 60 bestaande assets met beide producerketens en een expliciet tagtarget verzamelt/publiceert. Een nieuwe algemene publiceren=true-build mag de geteste pakketbytes niet ongemerkt vervangen. Er is geen publisherwijziging of publicatietrigger uitgevoerd.
