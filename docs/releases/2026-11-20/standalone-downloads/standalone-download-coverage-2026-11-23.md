# Zelfstandige downloads — dekking en controle, 23 november 2026

**Uitkomst:** alle **zes geregistreerde werkruimtes** hebben een zelfstandige app. Samen met de suite zijn dat **zeven producten en 28 installers** over drie OS-families/vier pakketvormen. Dit betekent niet dat ieder gereedschap, bibliotheekpakket of onderzoeksonderdeel een eigen app heeft.

Bronpunt voor de component-/appregistratie: `0dff40895e600e5716d6a72ba2791987d107825b` (PR #367); bestaande applicatiebasis `420af640` / tree `c1334c8f`, voorlopige versie47.1. Maandag23nov valt in week48; integratie bepaalt de definitieve versie en kandidaat. Deze audit wijzigt geen bron, versie, workflow, release, tag of main en start geen GUI.

## Geregistreerde werkruimtes en zelfstandige identiteit

`src/StartScherm.tsx` registreert docx/xlsx/pptx; `src/tabbladen.ts` en de daadwerkelijke render-/startupcode registreren e-mail/notities/database. `assets/studios.json`, de variantbouwer en aparte Office-/Database-configuratie koppelen ze aan echte productnamen, binaries en identifiers. De variant wordt bij het bouwen vastgezet, niet alleen via een snelkoppeling naar de suite. De apps delen wel React/Rust-code en afhankelijkheden; het zijn geen zeven onafhankelijk herbouwde engines.

| Werkruimte | Zelfstandige app | Executable | App-ID / profielnamespace |
| --- | --- | --- | --- |
| Alle zes (suite) | Open Office Studio | `open-office-studio` | `org.openaec.office-studio` |
| Tekst/docx | Open Writer Studio | `open-writer-studio` | `org.openaec.writer-studio` |
| Rekenblad/xlsx | Open Spreadsheet Studio | `open-spreadsheet-studio` | `org.openaec.spreadsheet-studio` |
| Presentatie/pptx | Open Presentation Studio | `open-presentation-studio` | `org.openaec.presentation-studio` |
| E-mail | Open Email Studio | `open-email-studio` | `org.openaec.email-studio` |
| Notities | Open Notition Studio | `open-notition-studio` | `org.openaec.notition-studio` |
| Database | Open Database Studio | `open-database-studio` | `org.openaec.database-studio` |

De eigen profielruimte is door configuratie/documentatie verklaard; profielisolatie is vandaag niet door zeven installaties opnieuw waargenomen. De huidige en publieke46.2-catalogus hebben dezelfde geselecteerde naam-/module-/binary-/ID-velden. Email behoudt documentvoorbeelden voor bijlagen; dat maakt geen nieuwe extra app.

## Waar geen zelfstandige download voor bestaat

| Onderdeel | Werkelijke status | Eigen binary/ID/profiel/installer? |
| --- | --- | --- |
| Access-VBA-runtime en VBA-paneel | Bestaand onderdeel van Database / suite | Nee |
| SQL/query-editor en database-objectgereedschap | Bestaand onderdeel van Database / suite | Nee |
| PDF-export/afdrukken en PDF-bijlagevoorbeeld | Ingebouwde functies in de toepasselijke document-/mailapps; geen aparte PDF-werkruimte | Nee |
| Grafieken en vormen/diagramgereedschap | Ingebouwd in bestaande documenteditors | Nee |
| Zelfstandige tekenmodule / Draw Studio | Onderzoeksvoorstel; geen bewezen geleverde tekeneditor | Nee; geen verborgen bestaande installer |
| Agenda/Taken/Contactpersonen als aparte app | Geen eigen werkruimte-/studio-entry; e-mailadressen aanvullen is geen Contacts Studio | Geen app/download aangetoond |

**Dekkingsgrens:** voor de zes geregistreerde werkruimtes ontbreekt geen dedicated app. Als “elk onderdeel apart” ook de hierboven genoemde functies/libraries omvat, is dat niet geleverd. Daarvoor is afzonderlijk productwerk nodig; een extra downloadknop of launcher is geen nieuwe zelfstandige app. Deze audit maakt daarvoor geen issues of implementatieclaims.

## Echte bestaande openbare links — uitsluitend 2026.46.2

Deze links komen uit de live [GitHub-release-API](https://api.github.com/repos/OpenAEC-Foundation/open-office-studio/releases/tags/v2026.46.2) en [openbare release](https://github.com/OpenAEC-Foundation/open-office-studio/releases/tag/v2026.46.2), gepubliceerd13nov2026 vanaf `cf65adf4b2ca76e4affd89f6f8812bfa4b8bec67`. Ze bevatten niet de nieuwere420/I3-correcties en certificeren geen toekomstige kandidaat. De weergegeven grootten zijn uitgedrukt in MiB; exacte bytes staan in JSON.

| App | Windows x64 — EXE | macOS Apple Silicon — DMG | Linux x64 — DEB | Linux x64 — AppImage |
| --- | --- | --- | --- | --- |
| Open Office Studio | [EXE · 70,2 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Office.Studio_2026.46.2_x64-setup.exe) | [DMG · 71,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Office.Studio_2026.46.2_aarch64.dmg) | [DEB · 72,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Office.Studio_2026.46.2_amd64.deb) | [AppImage · 146,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Office.Studio_2026.46.2_amd64.AppImage) |
| Open Writer Studio | [EXE · 70,2 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Writer.Studio_2026.46.2_x64-setup.exe) | [DMG · 71,6 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Writer.Studio_2026.46.2_aarch64.dmg) | [DEB · 72,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Writer.Studio_2026.46.2_amd64.deb) | [AppImage · 146,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Writer.Studio_2026.46.2_amd64.AppImage) |
| Open Spreadsheet Studio | [EXE · 70,2 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Spreadsheet.Studio_2026.46.2_x64-setup.exe) | [DMG · 71,5 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Spreadsheet.Studio_2026.46.2_aarch64.dmg) | [DEB · 72,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Spreadsheet.Studio_2026.46.2_amd64.deb) | [AppImage · 146,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Spreadsheet.Studio_2026.46.2_amd64.AppImage) |
| Open Presentation Studio | [EXE · 70,2 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Presentation.Studio_2026.46.2_x64-setup.exe) | [DMG · 71,6 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Presentation.Studio_2026.46.2_aarch64.dmg) | [DEB · 72,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Presentation.Studio_2026.46.2_amd64.deb) | [AppImage · 146,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Presentation.Studio_2026.46.2_amd64.AppImage) |
| Open Email Studio | [EXE · 70,2 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Email.Studio_2026.46.2_x64-setup.exe) | [DMG · 71,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Email.Studio_2026.46.2_aarch64.dmg) | [DEB · 72,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Email.Studio_2026.46.2_amd64.deb) | [AppImage · 146,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Email.Studio_2026.46.2_amd64.AppImage) |
| Open Notition Studio | [EXE · 70,2 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Notition.Studio_2026.46.2_x64-setup.exe) | [DMG · 71,6 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Notition.Studio_2026.46.2_aarch64.dmg) | [DEB · 72,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Notition.Studio_2026.46.2_amd64.deb) | [AppImage · 146,7 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Notition.Studio_2026.46.2_amd64.AppImage) |
| Open Database Studio | [EXE · 39,3 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Database.Studio_2026.46.2_x64-setup.exe) | [DMG · 38,1 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Database.Studio_2026.46.2_aarch64.dmg) | [DEB · 39,5 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Database.Studio_2026.46.2_amd64.deb) | [AppImage · 114,1 MiB](https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.46.2/Open.Database.Studio_2026.46.2_amd64.AppImage) |

Vandaag gecontroleerd zonder Authorization-header: **28× HTTP HEAD200**,28× juiste Content-Length en attachmentbestandsnaam. Er zijn **0 installerbodybytes** gedownload. Veertien kleine gepubliceerde pakketrapporten plus SHA256SUMS, samen **17.200 bytes**, zijn wel opgehaald: ze binden21 Windows/Linuxpakketten aan programmanaam, versie, bytes en gerapporteerde SHA256. Alle28 API-digests stemmen overeen met de gepubliceerde checksumregels. Dat is metadata-/manifestovereenstemming, geen eigen herhash van de binaries en geen nieuwe cryptografische handtekeningcontrole.

macOS heeft in deze set geen overeenkomstig pakketinhoudsrapport: daar zijn naam, grootte, bronconfig en API-/checksummetadata gecontroleerd, niet de identifier in een uitgepakte DMG of de notarisatie. De pakketrapporten zelf markeren installatie/nativebediening als niet-gecontroleerd; de releasetekst noemt aanvullende historische uitgevercontroles. Die zijn vandaag niet opnieuw uitgevoerd.

## Nieuwe release: namenvoorstel, geen gepubliceerde URLs

Definitieve versie/source/hash/URL zijn voor alle28 rijen **null/pending** in JSON. De onderstaande namen zijn templates, geen links. Gebruik geen oude46.2- of voorlopige47.1-hashes als eindbewijs; integratie kiest de week48-versie.

| App | Windows x64 | macOS ARM64 | Linux DEB | Linux AppImage |
| --- | --- | --- | --- | --- |
| Open Office Studio | `Open.Office.Studio_<FINALE_VERSIE>_x64-setup.exe` | `Open.Office.Studio_<FINALE_VERSIE>_aarch64.dmg` | `Open.Office.Studio_<FINALE_VERSIE>_amd64.deb` | `Open.Office.Studio_<FINALE_VERSIE>_amd64.AppImage` |
| Open Writer Studio | `Open.Writer.Studio_<FINALE_VERSIE>_x64-setup.exe` | `Open.Writer.Studio_<FINALE_VERSIE>_aarch64.dmg` | `Open.Writer.Studio_<FINALE_VERSIE>_amd64.deb` | `Open.Writer.Studio_<FINALE_VERSIE>_amd64.AppImage` |
| Open Spreadsheet Studio | `Open.Spreadsheet.Studio_<FINALE_VERSIE>_x64-setup.exe` | `Open.Spreadsheet.Studio_<FINALE_VERSIE>_aarch64.dmg` | `Open.Spreadsheet.Studio_<FINALE_VERSIE>_amd64.deb` | `Open.Spreadsheet.Studio_<FINALE_VERSIE>_amd64.AppImage` |
| Open Presentation Studio | `Open.Presentation.Studio_<FINALE_VERSIE>_x64-setup.exe` | `Open.Presentation.Studio_<FINALE_VERSIE>_aarch64.dmg` | `Open.Presentation.Studio_<FINALE_VERSIE>_amd64.deb` | `Open.Presentation.Studio_<FINALE_VERSIE>_amd64.AppImage` |
| Open Email Studio | `Open.Email.Studio_<FINALE_VERSIE>_x64-setup.exe` | `Open.Email.Studio_<FINALE_VERSIE>_aarch64.dmg` | `Open.Email.Studio_<FINALE_VERSIE>_amd64.deb` | `Open.Email.Studio_<FINALE_VERSIE>_amd64.AppImage` |
| Open Notition Studio | `Open.Notition.Studio_<FINALE_VERSIE>_x64-setup.exe` | `Open.Notition.Studio_<FINALE_VERSIE>_aarch64.dmg` | `Open.Notition.Studio_<FINALE_VERSIE>_amd64.deb` | `Open.Notition.Studio_<FINALE_VERSIE>_amd64.AppImage` |
| Open Database Studio | `Open.Database.Studio_<FINALE_VERSIE>_x64-setup.exe` | `Open.Database.Studio_<FINALE_VERSIE>_aarch64.dmg` | `Open.Database.Studio_<FINALE_VERSIE>_amd64.deb` | `Open.Database.Studio_<FINALE_VERSIE>_amd64.AppImage` |

Vier pakketvormen betekenen geen vier OS-families. Deze matrix biedt Windows x64, macOS AppleSilicon en Linux x64 als DEB/AppImage; geen WindowsARM64-, Intel-Mac- of RPM-download. Browserroutes `/` en `/office/` zijn webdistributie, geen extra desktopinstaller.

## Controle vóór een later toegestane publicatie

1. **Vast punt:** integratie sluit de intake en legt exacte source/tree/weekversie vast. Houd nieuwe fixes apart of maak expliciet een nieuwe kandidaat met benodigde hercontroles.
2. **Alle producten:**7 unieke app-identiteiten/binaries/profielen,28 pakketten,14 juiste Windows/Linuxrapporten. Controleer versie, architectuur, bestandstoewijzingen, grootte en volledige SHA256 op de echte post-signingbytes. Een shortcut, HEAD of API-label bewijst geen intern pakket.
3. **Handtekeningen:** Windows installer + geïnstalleerde exe + uninstaller met Authenticode/tijdstempel; apps uit alle DMGs met codesign/Gatekeeper/stapler; Linux-pakketten en checksummanifest met detached signatures tegen een door integratie vertrouwde actuele fingerprint.
4. **Per platform starten:** zodra het eigen pakket op source/versie/identiteit is geverifieerd en de tester vrij is. Eerst korte focus/document/invoerveld-, Ctrl-/Command- en werkelijke save/heropen-preflight; geen twee operators op dezelfde app/pc. Wacht niet zonder afhankelijkheid op andere platformbuilds.
5. **Echte functie:** suite alle6 werkruimtes; Writer DOCX, Spreadsheet XLSX-waarde/formule, Presentation PPTX; Email testfixture/concept/testaccount; Notition synthetisch notebook/back-up; Database synthetische database/query. Controleer juiste startwerkruimte, profielisolatie en werkelijk opslaan/heropenen waar van toepassing. Browserroutes apart op hetzelfde bronpunt.
6. **Download terug:** na afzonderlijk toegestane upload alle28 finale assetURLs ophalen en exact vergelijken met de ondertekende manifest-/rapportbytes, omvang, naam, SHA en signature. Installeer/bedien de werkelijke downloads; rapporteer niet beschikbare controles eerlijk.
7. **Afronden:** geen updaterbelofte zonder geverifieerde inrichting; standalone varianten gebruiken handmatige installers. Bewaar receipts, ruim eigen apps/input/ComputerUse/opname op, raak geen gedeelde sessies aan. Integratie verzorgt het centrale overzicht en expliciete toestemming voor release/tag/main.

## Bewijs en beperkingen

Het [JSON-bestand](standalone-download-coverage-2026-11-23.json) bewaart alle28 canonical URLs/assetIDs/HEAD-resultaten, exacte bytes,14 oorspronkelijke kleine rapporten, checksums, bronhashes en lege finalevelden. Bronnen omvatten de vastgezette componentregistry, studio-builder, releasevalidator, docs/studios.md en de echte publieke release-API. Geen app-code, workflow, versie, GUI, issueclaim, tag, release of main gewijzigd. Bestaande Windows-/Linux-/Mac-claims blijven bij hun eigen chats; geen nieuwe functionaliteitsacceptatie van de oudere binaries of nieuwe kandidaat afgeleid.
