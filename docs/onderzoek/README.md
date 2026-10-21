# Browser-kantoorsuite: onderzoek en routekeuze

Onderzoeksdatum: 21 oktober 2026. Onderdeel van issue #1.

Lees ook de [brede inventarisatie van het opensource landschap](landschap.md) en de [versie- en omvanggegevens](metingen.md).

## Advies

Kies route C: hergebruik de bestaande browsereditors en opslagkoppeling van de
Y-app voor documenten en rekenbladen; onderzoek een aparte presentatie-editor.
Maak de gedeelde editorlaag onafhankelijk van de opslagadapter. De bestaande
Y-app biedt een concrete start, maar is geen bewijs dat willekeurige documenten
zonder verlies kunnen worden bewerkt. Vrijgave blijft afhankelijk van de
[bestandsproeven](testmatrix.md).

Dit is een bronnenonderzoek met controlehulpmiddel. Er is in deze repository
nog geen lokale editor gebouwd of live opslagproef uitgevoerd. Er zijn geen
praktijkbestanden aangeleverd. Issue #1 blijft daarom open.

## Bestaand werk dat kan worden hergebruikt

De [installatiebranch van de Y-app](https://github.com/OpenAEC-Foundation/Y-app-ERPNext/tree/340c8f84b567d517b4d832a8501ce3d17255a6ce)
bevat al document- en rekenbladeditors. De
[ontwikkelbron](https://github.com/OpenAEC-Foundation/Y-app-ERPNext/tree/cc51488bed97d251cb5c98ff91d5a0d56a49fd0a/packages/frontend/src/components/office)
bevat adapters voor DOCX en XLSX. Versies in die bron zijn
`@stll/folio-react` 0.26.0 en `@betteroffice/xlsx` / `xlsx-react` 0.3.0.

De [opslag-API](https://github.com/OpenAEC-Foundation/Y-app-ERPNext/blob/340c8f84b567d517b4d832a8501ce3d17255a6ce/y_next/api/office.py)
controleert bestands- en ouderrechten, bewaart een nieuwe private kopie,
controleert de bronhash en registreert opslagoperaties. De bestaande API kent
DOCX/XLSX/XLSM; PPTX en generieke SuperCloud-opslag zijn daarmee niet bewezen.
Zie [integratie](integratie.md) voor het contract en de resterende proef.

## Kandidaten

De omvang hieronder is de **uitgepakte npm-pakketomvang**, zonder transitieve
afhankelijkheden. Dit is nadrukkelijk geen download- of browserbundelmeting.
De exacte bytes, versies en publicatiedata staan in [pakketten.json](pakketten.json).
Onderhoudssignalen staan in [repositories.json](repositories.json); een recente
push is geen garantie voor kwaliteit of ondersteuning.

| Kandidaat | Rol en licentie | Uitvoering en uitwisseling | Omvang / onderhoudssignaal |
|---|---|---|---|
| [Folio](https://github.com/stella/folio) | DOCX-editor; Apache-2.0 | Browser; openen en opslaan als DOCX. Behoud van onbekende onderdelen is een upstreamclaim, nog lokaal te meten. | React 0.26.0: 1,13 MB; kern extra. Release 12-10-2026; recente repositoryactiviteit. |
| [BetterOffice](https://github.com/openooxml/betteroffice) | OOXML-kernen en React-editors; Apache-2.0 | Rust/WASM in browser; XLSX-bewerking en herberekening, PPTX-kandidaat. Samenwerking vraagt aanvullende infrastructuur. Behoud van onaangeroerde onderdelen wordt upstream geclaimd. | XLSX 0.3.0: 5,32 MB + React 0,23 MB; PPTX 0.2.0: 5,55 MB + React 0,27 MB. Releases 28-09-2026, recente activiteit. |
| [Tiptap](https://github.com/ueberdosis/tiptap) | Eigen teksteditor op MIT-kern | Browser; alleen rich text levert nog geen paginamodel of betrouwbare DOCX-uitwisseling. Aanvullende diensten/extensies afzonderlijk beoordelen. | Core 3.32.0: 3,30 MB; recente release. |
| [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) | DOCX-weergave; Apache-2.0 | Browserweergave, geen complete editor en geen DOCX-opslagroute. | 0.4.1: 0,98 MB; release 21-09-2026. |
| [Mammoth](https://github.com/mwilliamson/mammoth.js) | DOCX naar HTML; BSD-2-Clause | Browser of server; semantische conversie, geen behoudende DOCX-roundtrip. Geen basis voor de verliesvrije eis. | 1.13.0: 1,67 MB; release 26-09-2026. |
| [Univer](https://github.com/dream-num/univer) | Browserwerkbladen; Apache-2.0-kern | Browsereditor; officiële [bestandsuitwisseling](https://docs.univer.ai/guides/sheets/features/import-export) gebruikt een conversiebackend en aparte pakketten. Volledige route niet afgedekt door de kernlicentie. | Core 1.1.0: 4,40 MB; release 17-10-2026. |
| [SheetJS CE](https://cdn.sheetjs.com/) | Formaatbibliotheek; Apache-2.0 | Browser/Node; geen complete editor. Formule-opslag niet gelijkstellen aan herberekening. | npm `xlsx` 0.18.5: 7,50 MB, release 2022. npm is niet het actuele distributiekanaal; CDN-versie apart vastzetten. |
| [ExcelJS](https://github.com/exceljs/exceljs) | XLSX lezen/schrijven; MIT | Browser/Node; zelf een raster/editor en rekenkern toevoegen. Niet geschikt om onbekende opmaak zonder bewijs te garanderen. | 4.4.0: 21,83 MB; release 2023, laatste geregistreerde push 2025. |
| [PptxGenJS](https://github.com/gitbrent/PptxGenJS) | PPTX-generatie; MIT | Browser/Node; geschikt voor nieuwe dia's/export. Geen algemene importeditor voor bestaande presentaties. | 4.0.1: 2,61 MB; release juni 2025, push november 2025. |
| [SuperDoc](https://github.com/superdoc/docx-editor) | DOCX-browsereditor; AGPL-3.0 | Browserroute beschikbaar; licentie en eventuele aanvullende voorwaarden eerst per versie beoordelen. | Browserbundel niet gemeten; recente activiteit. |
| [DocumentServer](https://github.com/ONLYOFFICE/DocumentServer) | Ingebedde suite; AGPL-3.0 volgens repositorymetadata | Browserinterface met documentserver. Zwaardere beheer- en conversieroute; rebranding en aanvullende licentievoorwaarden apart toetsen. | Serverinstallatie en clientbundel niet gemeten; recente activiteit. |

## Routes vergelijken

| Route | Voordeel | Belangrijk nadeel | Besluit |
|---|---|---|---|
| A: één suite inbedden | Gemeenschappelijke editor en brede formaatdekking | Serverlast, licentievoorwaarden en beperkte vrijheid voor de eigen interface | Reservescenario als bestandsproeven de browserroute uitsluiten |
| B: alle editors zelf samenstellen | Volledige regie over bediening en opslag | Paginalay-out, formules, dia-opmaak en onbekende XML behouden worden eigen onderhoud | Niet kiezen als eerste route |
| C: per module hergebruik | Sluit aan bij bestaande Y-app; onderdelen afzonderlijk testen/vervangen | Verschillende engines en releasecycli vragen een gedeeld contract | Voorkeursroute onder voorbehoud van proeven |

Documenten: eerst de bestaande adapter losmaakbaar maken en drie DOCX-proeven.
Rekenbladen: dezelfde aanpak met formulecontrole, zonder cached waarden als
bewijs van correcte herberekening te gebruiken. Presentaties: eerst PPTX 0.2.0
op masters, notities en onbekende onderdelen beproeven; pas daarna de editor
integreren. Een generatiebibliotheek alleen voldoet niet voor bestaande PPTX.
ODT/ODS/ODP zijn een afzonderlijke vervolgfase: geen van de gekozen adapters is
hier als ODF-route gevalideerd. Tot die tijd expliciet niet ondersteund tonen.

## Licenties en distributie

MIT en Apache-2.0 zijn bruikbare uitgangspunten voor een eigen opensourcerelease;
bewaar licentieteksten, auteursvermeldingen en toepasselijke NOTICE-bestanden.
Een npm-licentieveld is geen volledige audit van WASM, fonts of transitieve code.
Controleer de daadwerkelijk gebundelde bestanden van de vastgezette versies.

Bij een gewijzigde AGPL-netwerktoepassing verplicht artikel 13 tot een zichtbaar
bronaanbod voor de gebruikers die er via het netwerk mee werken. Distributie
van browsercode kan daarnaast eigen broncodeverplichtingen activeren. Of een
koppeling een gecombineerd werk vormt hangt af van de concrete integratie;
een apart proces maakt die beoordeling niet automatisch overbodig. Bronnen:
[AGPL-tekst bij de editor](https://github.com/superdoc/docx-editor/blob/main/LICENSE)
en [officiële licentie](https://www.gnu.org/licenses/agpl-3.0.html).
Voor deze eerste route worden geen AGPL-componenten toegevoegd.

Het [stijlboek](https://github.com/OpenAEC-Foundation/OpenAEC-style-book) vermeldt
CC-BY-SA-4.0 op repositoryniveau. Verifieer de voorwaarden per token-/UI-pakket
voordat deze worden gekopieerd; neem niet zonder controle een MIT-licentie aan.
Gebruik eigen productnamen en vormgeving; licenties op code geven niet vanzelf
rechten op merken. Dit rapport selecteert nog geen projectlicentie.

## Bundelmeting en vrijgave

Voor elke kandidaat een productiebuild met vast lockfile maken. Meet de eerste
routebelasting en het openen van iedere editor afzonderlijk: JS, CSS, WASM en
fonts, zowel ruwe bytes als gzip/Brotli. Registreer browser, hardware, koude en
warme laadtijd, piekgeheugen en grote-bestandproef. Geen CDN in de runtime.
Een losse pakketomvang of serverimage is geen vergelijkbare browsermeting.

Nog vereist voor afronding van #1: gemeten browserbundels, praktijkcorpus,
uitgevoerde roundtrips, een lokale editorproef en de live Y-app-opslagketen.
De vervolgissues leggen deze acceptatiecriteria per module vast.
