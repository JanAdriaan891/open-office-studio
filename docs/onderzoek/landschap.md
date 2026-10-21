# Uitgebreid onderzoek naar opensource kantoortoepassingen

Onderzoeksdatum: 21 oktober 2026. Doel: een eigen browserwerkplek voor documenten,
rekenbladen en presentaties, met standaardbestanden en aansluiting op de Y-app.

## Hoofdconclusie

Er zijn drie bruikbare families: complete suites met een documentserver,
nieuwere OOXML-editors die in de browser draaien, en losse editor- en
formaatbibliotheken. Voor Open Office Studio is de tweede familie het beste
startpunt, omdat de Y-app daar al onderdelen van gebruikt. Een complete suite
blijft een serieuze vergelijkingsroute voor complexe bestanden en ODF.

De eerste selectie is: Folio voor DOCX, de bestaande WASM-rekenbladadapter voor
XLSX, en een proef met de PPTX-editor uit hetzelfde ecosysteem. IronCalc is een
alternatieve rekenkern. Vergelijk die route praktisch met Collabora Online en
een OOXML-documentserver voordat volledige bestandscompatibiliteit wordt beloofd.
Dit is een technische selectie op bronnen, geen uitslag van een prestatietest.

## Reikwijdte en methode

Dit overzicht bestrijkt ruim zestig projecten en componenten: suites, editors,
formaatbibliotheken, samenwerking, conversie en aanverwante kantoorsoftware.
Het is een brede inventarisatie, geen claim dat elke kleine fork op internet is
gevonden. E-mail, agenda, CRM en projectplanning vallen buiten de drie editors.

Per project zijn officiële repositories, README's, licentie-informatie en waar
nodig officiële productdocumentatie onderzocht. Zoekresultaten en vergelijkingsblogs
zijn alleen gebruikt om kandidaten te vinden, niet als technische bewijsbron.
De momentopnamen staan in [repositories.json](repositories.json) en
[pakketten.json](pakketten.json). [Meetgegevens](metingen.md) bevat de versies,
publicatiedata en beschikbare omvanggegevens.

Maak onderscheid tussen:

- **Bronclaim:** functionaliteit die de maker beschrijft.
- **Broncode bevinding:** bijvoorbeeld de bestaande Y-app-opslagroute.
- **Eigen beoordeling:** geschiktheid voor onze architectuur.
- **Nog te testen:** werking op echte bestanden, snelheid, geheugen en volledig
  behoud van niet-ondersteunde onderdelen.

Een recente push kan documentatie of een andere branch betreffen. Een
gearchiveerde mirror kan naar een actieve nieuwe ontwikkelplek verwijzen.
GitHub herkent samengestelde licenties soms onvolledig; een leeg veld of
`NOASSERTION` betekent niet dat het project geen licentie heeft.

## 1. Complete suites en ingebedde kantooromgevingen

| Project en primaire bron | Licentie / uitvoering | Betekenis voor Open Office Studio |
|---|---|---|
| [LibreOffice](https://www.libreoffice.org/licenses/) | MPL-2.0 met aanvullende componentlicenties; native suite | Sterke ODF-route, conversie en onafhankelijke documentcontrole. Geen eenvoudige React-component. WASM bestaat in de bron, maar gereedheid en omvang apart onderzoeken. |
| [Collabora Online](https://github.com/CollaboraOnline/online.mirror) | MPL-2.0 op de eigen bron, overige componenten apart; documentserver + browser | Serieuze benchmark voor DOCX/XLSX/PPTX én ODF. Vereist opslagintegratie en serverbeheer. |
| [ONLYOFFICE Docs](https://github.com/ONLYOFFICE/DocumentServer) | AGPL-3.0 volgens repository, voorwaarden per component/release toetsen; server + browser | Geïntegreerde editor voor drie bestandstypen. Minder werk aan de editor, meer aan hosting, integratie en licentie-/merkvoorwaarden. |
| [Euro-Office](https://github.com/Euro-Office/DocumentServer) | AGPL; documentserver + opslaghost | Alternatieve geïntegreerde route. Project maakt onderscheid tussen community-testbuilds en productiebuilds via een distributie. Afkomst, notices en releasevoorwaarden vastleggen. |
| [Nextcloud Office](https://docs.nextcloud.com/server/stable/admin_manual/office/index.html) | Integratieproduct, geen zelfstandige engine | De actuele documentatie noemt meerdere engines. Kies en versioneer de engine expliciet; de naam alleen zegt niet welke converter of licentie wordt gebruikt. |
| [CryptPad](https://github.com/cryptpad/cryptpad) | AGPL-3.0-or-later; browser met versleutelde samenwerking en server | Volwaardige privacygerichte werkplek, maar eigen opslag-/deelmodel. Geen rechtstreekse vervanging van een gewone klantopslagadapter. |
| [Apache OpenOffice](https://github.com/apache/openoffice) | Apache-2.0; desktop | Alternatieve native suite. Browserinbedding en OOXML-export niet afleiden uit de aanwezigheid van desktopapps. Geen eerste frontendkeuze. |
| [Calligra](https://github.com/KDE/calligra) | GPL/LGPL per component; desktop | Words, Sheets en Stage met ODF-oriëntatie. Interessant als referentie; geen kant-en-klare browsereditor. |
| [ONLYOFFICE Desktop Editors](https://github.com/ONLYOFFICE/DesktopEditors) | AGPL en componentvoorwaarden; desktop | Offline referentie en mogelijke aparte desktoproute; niet verwarren met een lichte browserbibliotheek. |
| [ranuts/document](https://github.com/ranuts/document) | AGPL; browser met lokale verwerking | Onderzoekskandidaat voor lokale browserbewerking van drie formaten. Conversie-WASM, bronherkomst, notices, assets en opslaggedrag eerst controleren. |
| [sok-o/officesuite](https://github.com/sok-o/officesuite) | AGPL; browser/WASM, afgeleide route | Beschrijft offlinewerking en een iframe-API. Geen onafhankelijke engine; de voorwaarden van onderliggende editor en converter blijven gelden. |

Collabora's [CODE-editie](https://www.collaboraonline.com/fr/code/) is bedoeld
voor ontwikkeling en proeven; de leverancier raadt haar niet aan als
productie-editie. De bronontwikkeling is naar Gerrit verplaatst, met een
[GitHub-mirror](https://github.com/CollaboraOnline/online.mirror).
Dit maakt een oude GitHub-activiteitsgrafiek geen betrouwbaar onderhoudsoordeel.

Bij CryptPad onderscheiden de documentatie en productpagina's verschillende
apps. De [werkbladapp](https://docs.cryptpad.org/en/user_guide/apps/sheets.html)
gebruikt een ingebedde kantoorengine; de eenvoudige rich-text-app is niet
hetzelfde als de DOCX-app. End-to-endversleuteling brengt daarnaast een eigen
sleutel-, deel- en herstelmodel mee. Dat moet passen bij tenantbeheer.

## 2. Tekstverwerking en documenteditors

| Project en primaire bron | Licentie / uitvoering | Beoordeling |
|---|---|---|
| [Folio](https://github.com/stella/folio) | Apache-2.0; browser, React/Vue en kern | Eerste kandidaat: bestaande Y-app-adapter. DOCX openen/bewerken/opslaan; onbekende onderdelen en paginalay-out controleren op eigen corpus. |
| [BetterOffice DOCX](https://docs.betteroffice.dev/docs) | Apache-2.0; Rust/WASM en React | Alternatief als één familie voor alle drie editors wenselijk is. Niet vanzelf beter dan de bestaande DOCX-adapter; dezelfde proeven uitvoeren. |
| [SuperDoc](https://github.com/superdoc/docx-editor) | AGPL-3.0 en eventuele commerciële route; browser | Functioneel relevante DOCX-kandidaat; bronaanbod en de gekozen releasevoorwaarden vooraf verwerken. |
| [Tiptap](https://github.com/ueberdosis/tiptap) | MIT-kern, aanvullende producten apart; browser | Goede rich-textbouwsteen. Pagina's en verliesvrije DOCX-uitwisseling vragen meer dan alleen de kern. |
| [ProseMirror](https://prosemirror.net/docs/changelog/) | MIT; browser | Laag niveau voor editortransacties en documentmodel. GitHub-mirror is verhuisd, niet simpelweg verlaten. Geen volledige DOCX-engine op zichzelf. |
| [Lexical](https://github.com/facebook/lexical) | MIT; browser | Geschikt voor een eigen editor met nodes en samenwerking. HTML/JSON/Markdown zijn geen bewijs van DOCX-behoud. |
| [Slate](https://github.com/ianstormtaylor/slate) | MIT; browser/React | Veel vrijheid voor een eigen editor; formaatmodel en paginering grotendeels eigen verantwoordelijkheid. |
| [Quill](https://github.com/slab/quill) | BSD-3-Clause; browser | Bruikbaar voor eenvoudige opgemaakte tekst. Niet selecteren als volledige rapporteditor voor bestaande DOCX. |
| [BlockNote](https://github.com/TypeCellOS/BlockNote#license-) | MPL-2.0-kern, XL-pakketten GPL-3.0; browser | Blokeditor voor notities en documenten. Pakketgrenzen bepalen de licentie; export niet gelijkstellen aan behoud van geïmporteerde DOCX. |
| [CKEditor 5](https://github.com/ckeditor/ckeditor5#license) | Huidige README: GPL-2.0-or-later of commercieel | Uitgebreide rich text. Premiumfuncties en documentconversie afzonderlijk toetsen; niet de hele demonstratie als vrije kern meetellen. |
| [TinyMCE](https://github.com/tinymce/tinymce#license) | Huidige README: GPL-2.0-or-later; premium apart | Sterke HTML-editor. Geen vanzelfsprekende paginagebaseerde DOCX-editor. |
| [Etherpad](https://github.com/ether/etherpad) | Apache-2.0; browser + server | Geschikt voor samen schrijven en notulen. Geen generieke oplossing voor bestaande kantooropmaak. |

Een teksteditor kan alle woorden bewaren en toch secties, paginanummers,
revisies of relaties verliezen. Daarom blijft de oorspronkelijke OOXML-structuur
belangrijk. Eerst XML volledig omzetten naar een eenvoudiger HTML-model en
vervolgens een nieuw DOCX genereren is geen behoudende route zonder aanvullend
model voor de niet-ondersteunde onderdelen.

## 3. Rekenbladen, rasters en formule-engines

| Project en primaire bron | Licentie / uitvoering | Beoordeling |
|---|---|---|
| [BetterOffice XLSX](https://github.com/openooxml/betteroffice) | Apache-2.0; Rust/WASM + React | Eerste integratiekandidaat door bestaand Y-app-werk. Bewijs nodig voor herberekening, grafieken, verborgen bladen en onbekende XML. |
| [IronCalc](https://github.com/ironcalc/IronCalc) | MIT of Apache-2.0; Rust, WASM en andere bindings | Sterke alternatieve rekenkern met XLSX-route. Geen automatische garantie voor alle werkboekfuncties. |
| [Univer](https://docs.univer.ai/guides/sheets/features/import-export) | Apache-2.0-kern, aanvullende pakketten apart | Rijke browsereditor. Officiële bestandsconversie vraagt een backend; past niet zonder meer bij alles-in-de-browser. |
| [FortuneSheet](https://github.com/ruilisi/fortune-sheet) | MIT; browser/React | Bruikbare spreadsheetinterface en formules. XLSX-uitwisseling via aparte plugin; compleet bestand testen. |
| [FortuneExcel](https://github.com/Corbe30/FortuneExcel) | MIT; import/exportplugin | Relevant bij FortuneSheet, maar geen zelfstandige editor en geen bewijs van behoud van alle werkboekonderdelen. |
| [Luckysheet](https://github.com/dream-num/Luckysheet) | MIT; gearchiveerd, verwijst naar opvolger | Niet als nieuwe basis kiezen zonder eigen onderhoudsplan. |
| [Jspreadsheet CE](https://github.com/jspreadsheet/ce) | MIT volgens bron; browser | Lichte rastercomponent; CE, Pro en extensies onderscheiden. Experimentele import is geen complete roundtrip. |
| [x-spreadsheet](https://github.com/myliang/x-spreadsheet) | MIT; verwijst naar Wolf Table | Oudere browserbasis. Niet kiezen op grond van oude demos zonder de opvolger te beoordelen. |
| [Wolf Table](https://github.com/wolf-table/table) | MIT; canvasraster | Bouwsteen voor tabellen. Geen aangetoonde complete XLSX-editor. Snapshot toont laatste push in 2024. |
| [HyperFormula](https://handsontable.com/docs/hyperformula/guide/licensing) | GPLv3 of commerciële licentie; JS | Volwaardige formule-engine als losse bouwsteen. Opslag, raster en grafieken blijven apart. |
| [Formula.js](https://github.com/formulajs/formulajs) | MIT met notices; JS | Verzameling functies. Functies alleen leveren geen werkboekmodel, afhankelijkheidsbeheer of herberekeningscyclus. |
| [Handsontable](https://handsontable.com/knowledge-base/) | Actuele gridlicentie apart; niet automatisch permissieve opensource | Spreadsheetachtig raster, maar niet opnemen als vrij beschikbare productiebasis op grond van een publieke repository. HyperFormula heeft een eigen licentie. |
| [Grist](https://github.com/gristlabs/grist-core) | Apache-2.0-kern; eigen datamodel, server en andere varianten | Sterk voor gegevensbeheer en bedrijfsprocessen. Geen vervanger voor het oorspronkelijke XLSX-bestand met alle functies. |
| [Gnumeric](https://gnome.pages.gitlab.gnome.org/gnumeric/manual/chapter-welcome.html) | GPL; desktop | Interessant als onafhankelijke rekenreferentie. Geen browsercomponent voor de eerste integratie. |

Voor een begroting betekent een verkeerde formule meer dan een visueel gebrek.
Controleer foutwaarden, datumsystemen, afronding, namen, externe verwijzingen,
dynamische matrices en volatiele functies. Bij niet-ondersteunde formules geen
oude cachewaarde als nieuw berekend resultaat presenteren. Schakel macro's en
externe gegevensverbindingen niet stilzwijgend in.

## 4. Presentaties

| Project en primaire bron | Licentie / uitvoering | Beoordeling |
|---|---|---|
| [BetterOffice PPTX](https://docs.betteroffice.dev/docs) | Apache-2.0; Rust/WASM + React | Eerst beproeven als echte PPTX-editroute; masters, thema's, notities en onbekende onderdelen expliciet testen. |
| [PPTist](https://github.com/pipipi-pikachu/PPTist) | AGPL-3.0; browser/Vue | Uitgebreide dia-interface. De [FAQ](https://github.com/pipipi-pikachu/PPTist/blob/master/doc/Q%26A.md) beschrijft beperkingen bij import/export. Documentatie is niet overal gelijk; gedrag van gekozen versie testen. |
| [PptxGenJS](https://github.com/gitbrent/PptxGenJS) | MIT; browser/Node | Goede generator voor nieuwe presentaties. Geen algemene editor voor een bestaande PPTX. |
| [Reveal.js](https://github.com/hakimel/reveal.js) | MIT; browser | Presenteren in HTML. Geschikt voor webpresentaties, niet voor behoud van een willekeurige PPTX. |
| [Slidev](https://github.com/slidevjs/slidev) | MIT; Markdown/Vue en bouwgereedschap | Goede ontwikkelaarsworkflow; geen vervanger voor visueel bewerken van bestaande kantoorbestanden. |
| [Marp](https://github.com/marp-team/marp-core) | MIT-kern; Markdownconversie | Rapportage en dia's uit tekst. Exportmogelijkheden niet verwarren met bewerkbare objecten en importcompatibiliteit. |

De complete suites uit categorie 1 zijn ook presentatiekandidaten. Voor
standaardbestanden is het behoud van diamodellen vaak belangrijker dan een groot
aantal decoratieve bewerkingen in de webinterface.

## 5. Lezen, schrijven, sjablonen en conversie

| Component en primaire bron | Licentie / omgeving | Geschikt voor / grens |
|---|---|---|
| [docx](https://github.com/dolanmiu/docx) | MIT; JS/TS browser/Node | DOCX-generatie en gerichte bewerkingen; geen complete visuele editor. |
| [Docxtemplater](https://docxtemplater.com/docs/) | MIT/GPL-keuze voor kern; uitbreidingen apart | DOCX/PPTX uit sjablonen. XLSX, HTML en andere uitbreidingen kunnen betaald zijn; zie [formaatgrenzen](https://docxtemplater.com/). |
| [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) | Apache-2.0; browser | Voorweergave; opslag en bewerking ontbreken als complete route. |
| [Mammoth](https://github.com/mwilliamson/mammoth.js) | BSD-2-Clause; JS | Inhoud naar HTML, geen betrouwbare opmaakroundtrip. |
| [SheetJS CE](https://cdn.sheetjs.com/) | Apache-2.0; JS | Gegevensimport/export. Versie via officieel distributiekanaal kiezen, niet blind het oude npm-pakket. |
| [ExcelJS](https://github.com/exceljs/exceljs) | MIT; JS | Werkboek lezen/schrijven. Geen complete editor of ingebouwde garantie op onbekende onderdelen. |
| [python-docx](https://github.com/python-openxml/python-docx) | MIT; Python | Documentautomatisering en tests. Geen paginarenderer of browserinterface. |
| [python-pptx](https://github.com/scanny/python-pptx) | MIT; Python | Dia's lezen/maken/wijzigen. Niet alle presentatiekenmerken worden ondersteund. |
| [openpyxl](https://openpyxl.readthedocs.io/en/stable/tutorial.html) | Python; licentie per distributie verifiëren | Werkboeken verwerken. Documentatie waarschuwt expliciet dat vormen verloren kunnen gaan; niet als behoudende universele tussenlaag gebruiken. |
| [XlsxWriter](https://xlsxwriter.readthedocs.io/faq.html) | BSD-2-Clause; Python | Nieuwe XLSX genereren; kan bestaande bestanden niet lezen of aanpassen. |
| [libxlsxwriter](https://github.com/jmcnamara/libxlsxwriter) | C; licenties inclusief afhankelijkheden controleren | Nieuwe werkboeken genereren; geen visuele importeditor. |
| [Apache POI](https://github.com/apache/poi) | Java; Apache-project, distributienotices controleren | OOXML/OLE-automatisering en validatie aan serverzijde; geen browserribbon. |
| [Open XML SDK](https://github.com/dotnet/Open-XML-SDK) | MIT; .NET | Pakket- en schemawerk, inspectie en gerichte wijzigingen. Geen lay-outengine. |
| [Pandoc](https://github.com/jgm/pandoc) | GPL-2.0-or-later; CLI, ook WASM-demonstratie | Inhoudsgerichte conversie. Niet selecteren om alle oorspronkelijke opmaak te behouden. |
| [Gotenberg](https://github.com/gotenberg/gotenberg) | MIT voor API, engines afzonderlijk; server/container | PDF-conversiedienst. Vereist servercapaciteit en vervangt geen interactieve editor. |
| [ODF Toolkit](https://github.com/tdf/odftoolkit) | Apache-2.0; Java | ODF-pakketverwerking; geen browsereditor. |
| [odfpy](https://github.com/eea/odfpy) | Python; samengestelde licentie per bestand controleren | ODF lezen/schrijven; geen visuele kantooromgeving. |
| [WebODF](https://webodf.org/about/license.html) | AGPL; JavaScript | ODF-weergave/bewerking als oudere route. Repositorysnapshot laatste push 2020; onderhoud en browsercompatibiliteit maken nieuw gebruik riskant. |
| [x2t-WASM](https://github.com/cryptpad/onlyoffice-x2t-wasm) | WASM-converter; onderliggende bronlicenties en notices controleren | Interessant voor lokale conversie. Conversie is nog geen garantie dat onbekende inhoud behouden blijft. |

Python, Java en .NET-bibliotheken zijn bruikbaar voor testen of optionele
serverfuncties. Ze tellen niet als client-side oplossing alleen omdat ze via
een web-API kunnen worden aangeroepen. Een WASM-port kan dat veranderen, maar
vraagt eigen prestatie-, beveiligings- en compatibiliteitsmetingen.

## 6. Samenwerking, kenniswerk en PDF

| Project en primaire bron | Licentie / uitvoering | Rol |
|---|---|---|
| [Yjs](https://github.com/yjs/yjs) | MIT; gedeelde datastructuren | Samenwerkingsbouwsteen; autorisatie, opslag, room-isolatie en OOXML-model blijven eigen werk. |
| [Automerge](https://github.com/automerge/automerge) | MIT; Rust/JS/WASM | Lokale wijzigingen samenvoegen. Geen kantoorformaat- of lay-outengine. |
| [Docmost](https://github.com/docmost/docmost) | AGPL-kern, enterprisecode apart; server | Kennisbank en documentatiesamenwerking; niet als transparante DOCX/XLSX/PPTX-editor behandelen. |
| [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | AGPL; Flutter/Rust-werkplek | Notities, gegevens en samenwerking in eigen model. Interessant als ander producttype, niet als bestandsbehoudende kantoorengine. |
| [AFFiNE](https://github.com/toeverything/AFFiNE/blob/canary/LICENSE) | MIT-delen; backend/native hebben aparte voorwaarden | Blokken en canvas. Niet het hele product als MIT bestempelen; licentiebestand per map volgen. |
| [PDF.js](https://github.com/mozilla/pdf.js) | Apache-2.0; browser | PDF-voorweergave en documentcontrole. Geen DOCX-editor. |
| [pdfme](https://github.com/pdfme/pdfme) | MIT; browser/Node | PDF-sjablonen, ontwerper en generatie. Aanvulling op rapportage. |
| [Okular](https://github.com/KDE/okular) | KDE-componentlicenties; desktop | Documentviewer voor onafhankelijke controle. Geen websuite. |
| [Scribus](https://github.com/scribusproject/scribus) | GPL-familie/componentvoorwaarden; desktop | Drukwerk en paginaontwerp; een ander werkpatroon dan tekstverwerking. |
| [AbiWord](https://github.com/AbiWord/abiword) | GPL; desktop | Lichte tekstverwerking. Mirroractiviteit in snapshot oud; geen eerste browserkeuze. |
| [Typst](https://typst.app/open-source/) | Apache-2.0-compiler; webapp is propriëtair | Goede route voor nieuwe rapporten/PDF. De vrije compiler geeft geen vrije broncode van de gehoste samenwerkingseditor. |

## 7. Licentieafweging voor een eigen release

| Familie | Praktische consequentie voor de selectie |
|---|---|
| MIT/BSD/Apache-2.0 | Goede uitgangspositie; licenties, notices en transitieve componenten blijven verplicht aandachtspunt. |
| MPL-2.0 | Copyleft op bestandsniveau. Gewijzigde gedistribueerde MPL-bestanden beschikbaar stellen; kan naast anders gelicentieerde eigen bestanden bestaan. |
| GPL | Copyleft bij verspreiding van afgeleide/gecombineerde code. Browser-JavaScript wordt aan gebruikers geleverd; alleen 'we hosten het' is geen volledige analyse. |
| AGPL | Daarnaast netwerkbronaanbod bij een gewijzigde versie die interactie via netwerk ondersteunt. Integratiegrenzen concreet beoordelen. |
| Open kern plus betaalde uitbreidingen | Alleen de daadwerkelijk vrij gelicentieerde functies meetellen. Functies in een demo kunnen buiten die kern vallen. |
| Alleen niet-commercieel of evaluatie | Geen geschikte algemene opensourcebasis voor een productiedienst op grond van die toestemming alleen. |

Deze indeling is een selectiehulpmiddel, geen volledige juridische audit. Bronnen:
[Mozilla over MPL](https://www.mozilla.org/en-US/MPL/2.0/FAQ/),
[AGPL-licentietekst](https://www.gnu.org/licenses/agpl-3.0.html),
[HyperFormula-licentie](https://github.com/handsontable/hyperformula/blob/master/LICENSE.txt)
en de licentiebestanden bij iedere kandidaat.

Een commerciële toepassing is niet op zichzelf verboden onder GPL of AGPL.
De voorwaarden bepalen onder meer hoe broncode en afgeleide werken beschikbaar
moeten zijn. Een betaalde licentie is dus niet automatisch nodig omdat er omzet
is; zij kan nodig zijn als de gewenste distributie niet aan copyleft kan voldoen.

Bij een fork blijven auteursvermeldingen en relevante notices bestaan. Een
nieuwe productnaam maakt oude verplichtingen niet ongedaan. Voor een eigen
ribbon de functionele patronen gebruiken en eigen vormgeving toepassen, met
respect voor de licentie van gebruikte UI-code en het OpenAEC-stijlboek.

## 8. Beslissing per scenario

| Scenario | Eerst onderzoeken | Waarom / harde voorwaarde |
|---|---|---|
| Browsergericht en eigen interface | Bestaande Folio/XLSX-adapters + PPTX-WASM-proef | Minste nieuwe integratie voor DOCX/XLSX; alle drie formaten afzonderlijk valideren. |
| Eén browserenginefamilie | DOCX/XLSX/PPTX uit dezelfde WASM-familie | Mogelijk eenvoudiger integratie en bediening; DOCX pas vervangen na aantoonbare verbetering. |
| Complexe documenten en ODF centraal | Collabora Online, daarnaast OOXML-documentserver als vergelijking | Brede suites onderzoeken; serverlast en opslagprotocol accepteren en meten. |
| Versleuteld samenwerken centraal | CryptPad | Sleutelbeheer en eigen werkplek passen niet zonder ontwerpkeuze in bestaande opslag. |
| Nieuwe sjablonen en rapporten | docx/Docxtemplater, PptxGenJS, XlsxWriter, Typst | Generatie is een beperkter en beter beheersbaar probleem dan willekeurige importbewerking. |
| Gegevensapplicatie met tabellen | Grist of eigen raster met formule-engine | Andere productdoelstelling; geen onbewezen XLSX-roundtrip beloven. |
| HTML/Markdown-notities | Tiptap, Lexical, BlockNote of Etherpad | Snel bruikbaar voor interne tekst; niet als volwaardige DOCX-vervanger presenteren. |

Mijn advies blijft route C uit het [beslisrapport](README.md), met twee
uitbreidingen: IronCalc als rekenalternatief opnemen en een servergebaseerde
suite als controlegroep beproeven. Geen definitieve keuze voor de presentatie-
engine maken op basis van een website of demo alleen.

## 9. Wat de proef moet aantonen

Gebruik dezelfde negen gevallen uit de [testmatrix](testmatrix.md) voor alle
relevante kandidaten. Voeg voor ODF drie gelijkwaardige bestanden toe zodra de
OOXML-route is geselecteerd. Het oorspronkelijke bestand blijft beschikbaar.

Meet per kandidaat:

1. **Bestandsbehoud:** geen verdwenen onbekende XML, media, relaties, stijlen,
   dia- of werkboekonderdelen. Semantische verschillen aanvullend controleren.
2. **Bewerking:** bedoelde wijziging klopt na opslaan en heropenen; geen stille
   wijziging van andere tekst, formules of opmaak.
3. **Rekenen:** onafhankelijke verwachte uitkomsten, foutwaarden en
   niet-ondersteunde functies. Een cachewaarde telt niet als herberekening.
4. **Weergave:** paginering, tabellen, afdrukgebieden, diamasters, notities,
   lettertypen en afbeeldingen. Server- en browserfonts gelijk vastleggen.
5. **Prestatie:** koude en warme opening, eerste interactie, geheugen,
   save-duur; JS/CSS/WASM/fonts volledig meenemen.
6. **Opslagketen:** openen onder gebruikersrechten, versieconflict, dubbele
   save, onbekende uitkomst en opnieuw openen van de bevestigde kopie.
7. **Samenwerking:** gelijktijdig bewerken, reconnect en tenantisolatie als
   aparte fase; de aanwezigheid van een CRDT is niet genoeg.
8. **Toegankelijkheid:** toetsenbord, selectie, focus, schermlezer, hoog
   contrast en Nederlandse getal-/datumweergave.

De browsers en versie, hardware, engineversie en bestandskenmerken horen bij
iedere meting. Geen gefingeerde score voor onderdelen die niet zijn getest.
Een lichte bundel met slechte bestandsuitwisseling is geen geslaagde editor.

## 10. Uitvoerbare volgorde

1. Bestaande Y-app-implementatie en bijbehorende notices als vertrekpunt nemen.
2. Lokaal de editoradapters losmaakbaar maken, met dezelfde opslagspecificatie.
3. DOCX/XLSX-corpus testen; tegelijkertijd de twee PPTX-routes vergelijken.
4. Browserbundels en WASM meten; resultaten naast de serverroute zetten.
5. Keuze vastleggen op basis van de proeven, inclusief expliciete beperkingen.
6. Pas daarna ODF, samenwerking en uitgebreid tenant-sjabloonbeheer uitwerken.

De broninventarisatie is uitgevoerd. Praktijkcorpus, lokale editorbuild,
prestatiemetingen en live Y-app-test zijn nog niet uitgevoerd. Die stappen
blijven onderdeel van issue #1 en de vervolgissues; dit onderzoek sluit het
hoofdissue niet af.
