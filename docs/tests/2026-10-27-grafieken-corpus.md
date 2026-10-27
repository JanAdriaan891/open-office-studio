# Grafieken: testcorpus van 100 Office-bestanden — 27 oktober 2026

Corpus en nulmeting voor de grafiekfunctie (grafieken tonen, behouden,
invoegen en bewerken in Tekst/DOCX, Rekenblad/XLSX en Presentatie/PPTX).
Uitgevoerd op 27 oktober 2026 met Node v24.19.0, Python 3.12.3 en
LibreOffice 24.2.7.2 op Linux. Dit verslag noemt alleen aantallen,
bestandsnamen, paden, hashes en bronnen. Er staat geen documentinhoud in.

## Reproductie

```sh
node scripts/corpus-grafieken.mjs verzamel   # kandidaten zoeken, ophalen, kenmerken bepalen, 100 kiezen
node scripts/corpus-grafieken.mjs proef      # rondgang met de engines, pakketvergelijking, LibreOffice-PDF
node scripts/corpus-grafieken.mjs            # beide (ongeveer 6 minuten)
```

- Bestanden: `.local/corpus/grafieken/bestanden/<id>.<formaat>`.
  `.local/` wordt door Git genegeerd. Kandidaten staan in de cache
  `kandidaten/`, engine-uitvoer in `uitvoer/` en LibreOffice-PDF's in
  `libreoffice/`.
- Herkomst: `.local/corpus/grafieken/manifest.json`. Uitkomst van de proef:
  `.local/corpus/grafieken/proef.json`.
- Kenmerken en vergelijking: `scripts/grafieken_kenmerken.py`. Dit script
  gebruikt alleen de Python-standaardbibliotheek, leest alleen en neemt
  dezelfde grenzen over als `scripts/vergelijk_pakketten.py`: geen
  versleutelde onderdelen, geen paden met `..` of absolute paden, en een
  maximum voor het aantal onderdelen en de uitgepakte grootte.
- De selectie is deterministisch: een tweede volledige run gaf dezelfde
  100 SHA-256-hashes.

## Verzamelen

1. **Bestaand corpus.** Uit `.local/corpus/manifest.json` (Apache POI
   test-data en de LibreOffice-steekproef) zijn alle DOCX-, XLSX- en
   PPTX-bestanden gelezen en gefilterd op grafiekonderdelen.
2. **GitHub.** Daarna 27 openbare repositories die geen fork zijn, elk op
   een vaste commit van de standaardtak. Per repository is de boom opgehaald
   via `gh api`. Voor LibreOffice/core is alleen
   `chart2/qa/extras/data/{docx,xlsx,pptx}` opgehaald, omdat de volledige
   boom wordt afgekapt.
3. **Steekproef per repository en formaat.** Maximaal 40 kandidaten. Eerst
   bestanden waarvan de naam op een grafiek wijst, gespreid over de
   alfabetische lijst, en daarna de rest.
4. **Download.** Via `raw.githubusercontent.com/<repo>/<sha>/<pad>`, met
   controle op de Git-blob-SHA. Een Git LFS-pointer wordt via
   `media.githubusercontent.com` opgehaald en gecontroleerd op de SHA-256
   uit de pointer. In deze run kwam geen LFS-pointer voor.
5. **Uitsluiten.** Bestanden groter dan 20 MB, ongeldige of versleutelde
   pakketten, onleesbare chart-XML, en bestanden waarvan het formaat niet
   bij de extensie past. Dubbele inhoud (dezelfde SHA-256) telt één keer.
6. **Keuze.** Om de beurt één bestand per formaat (DOCX, PPTX, XLSX), tot
   30/35/35. De keuze is gretig: zeldzame grafieksoorten, zeldzame makers,
   een nieuwe bron en chartex krijgen voorrang. Per repository zijn
   maximaal 10 bestanden toegestaan, over alle formaten samen.

| Stap | Aantal |
|---|---:|
| Kandidaten (unieke blobs) | 2050 |
| Downloadfouten | 0 |
| Geen geldig pakket (geen ZIP, onderdelen ontbreken, ongeldige onderdeelnaam) | 60 |
| waarvan versleuteld (OLE/CFB-container) | 17 |
| Geldig, maar zonder grafiek | 1465 |
| Geldig met grafiek, uniek op SHA-256 | 525 |
| **Gekozen** | **100** |

Eén kandidaat uit het bestaande corpus is beschadigd: de ZIP-kop van
`xl/charts/chart1.xml` wijkt af van de centrale directory. Dit bestand is
als ongeldig niet meegeteld.

## Corpus

| Formaat | Bestanden | Grafiekonderdelen | waarvan chartex | met c:externalData | ingesloten werkboeken | totale grootte (MB) |
|---|---:|---:|---:|---:|---:|---:|
| DOCX | 30 | 83 | 18 | 77 | 76 | 1.7 |
| PPTX | 35 | 123 | 3 | 112 | 104 | 8.2 |
| XLSX | 35 | 51 | 8 | 0 | 0 | 2.7 |

`c:externalData` en de ingesloten werkboeken (`../embeddings/*.xlsx`
via een `package`-relatie van de grafiek) komen alleen voor in DOCX en
PPTX. Een XLSX-grafiek verwijst naar cellen in het eigen werkboek.

### Grafieksoorten (aantal bestanden met minstens één grafiek van die soort)

Soorten komen uit de chart-XML. `kolom`/`staaf` = `c:barChart` of
`c:bar3DChart` met `barDir` col of bar. `combinatie` = meer dan één
grafiektype in één `c:plotArea`. `chartex:<layoutId>` = Office 2016-grafiek
(`cx:chartSpace`). De volledige legenda staat in het manifest
(`soortenlegenda`).

| Soort | DOCX | PPTX | XLSX | Totaal |
|---|---:|---:|---:|---:|
| 3d | 9 | 7 | 6 | 22 |
| bel | 4 | 5 | 2 | 11 |
| combinatie | 5 | 5 | 5 | 15 |
| draaigrafiek | 0 | 0 | 2 | 2 |
| gestapeld | 6 | 5 | 5 | 16 |
| gestapeld-100 | 2 | 5 | 3 | 10 |
| koers | 3 | 0 | 2 | 5 |
| kolom | 15 | 21 | 12 | 48 |
| lijn | 9 | 7 | 11 | 27 |
| oppervlak | 1 | 0 | 1 | 2 |
| radar | 5 | 3 | 1 | 9 |
| ring | 1 | 5 | 1 | 7 |
| spreiding | 4 | 7 | 3 | 14 |
| staaf | 7 | 10 | 5 | 22 |
| taart | 8 | 10 | 6 | 24 |
| vlak | 5 | 3 | 4 | 12 |
| chartex | 2 | 3 | 4 | 9 |
| chartex:boxWhisker | 1 | 0 | 1 | 2 |
| chartex:clusteredColumn | 1 | 0 | 3 | 4 |
| chartex:funnel | 1 | 2 | 1 | 4 |
| chartex:paretoLine | 1 | 0 | 2 | 3 |
| chartex:sunburst | 1 | 0 | 1 | 2 |
| chartex:treemap | 1 | 0 | 1 | 2 |
| chartex:waterfall | 2 | 1 | 1 | 4 |

In `taart` zitten ook 3 bestanden met `c:ofPieChart` (taart-van-taart/staaf-van-taart)
en 4 met `c:pie3DChart`. Niet in het corpus: `c:surfaceChart` (2D) en de chartex-soorten
`regionMap` en `histogram` (zonder pareto). Ruwe elementtellingen per bestand staan in
`grafiekelementen`.

### Makers (`docProps/app.xml`, `Application`)

| Makerfamilie (docProps/app.xml) | DOCX | PPTX | XLSX |
|---|---:|---:|---:|
| Aspose.Slides | 0 | 4 | 0 |
| LibreOffice | 1 | 2 | 2 |
| Microsoft | 24 | 25 | 28 |
| ONLYOFFICE | 1 | 0 | 2 |
| onbekend | 4 | 4 | 3 |

Onder de makers zitten Word, Excel en PowerPoint (versies 12 tot 16,
Windows en Mac), LibreOffice/LibreOfficeDev 5.1 tot 25.2, Collabora Office
26.04, ONLYOFFICE 5.4 en 9.4, en Aspose.Slides 21.12. «Onbekend» (11
bestanden) heeft geen `docProps/app.xml`. Dit zijn bestanden die door
bibliotheken zijn gemaakt of bewerkt: Xceed DocX, docx4j, Apache POI,
python-pptx, PhpSpreadsheet en Syncfusion. **Er is geen bestand gevonden
dat aantoonbaar door Google Docs, Sheets of Slides is gemaakt.** Google-exports
hebben geen herkenbare `Application`-waarde. Onder de geselecteerde en de
afgewezen kandidaten is geen bestand als Google-export te herkennen.

### Bronnen en licenties

De licentie is de SPDX-code die GitHub voor de repository meldt. `null`
betekent dat GitHub geen code vaststelt: `NOASSERTION` of geen
licentiebestand dat GitHub herkent. Dat geldt voor apache/poi, docx4j,
PHPPresentation, Xceed DocX en de Syncfusion-voorbeelden. Controleer de
licentie van deze repositories zelf voordat je bestanden verder verspreidt.
De bestanden blijven lokaal en worden niet verspreid.

| Bron (repository) | Revisie | Licentie | DOCX | PPTX | XLSX |
|---|---|---|---:|---:|---:|
| ClosedXML/ClosedXML | `057f5976c7` | MIT | 0 | 0 | 1 |
| LibreOffice/core | `3205e33691` | GPL-3.0 | 4 | 3 | 3 |
| ONLYOFFICE/document-templates | `0a52fb76fa` | Apache-2.0 | 1 | 1 | 1 |
| OpenXmlDev/Open-Xml-PowerTools | `536ca1fb4b` | MIT | 3 | 2 | 0 |
| PHPOffice/PHPPresentation | `67a3b85673` | null | 0 | 1 | 0 |
| PHPOffice/PhpSpreadsheet | `ed591ed22e` | MIT | 0 | 0 | 5 |
| ShapeCrawler/ShapeCrawler | `affa57ece0` | MIT | 0 | 3 | 0 |
| SyncfusionExamples/DocIO-Examples | `6f510a166e` | null | 2 | 0 | 0 |
| SyncfusionExamples/PowerPoint-Examples | `9ac559157b` | null | 0 | 2 | 0 |
| SyncfusionExamples/XlsIO-Examples | `9305f5d054` | null | 0 | 0 | 2 |
| apache/poi | `d91a76448f` | null | 1 | 3 | 3 |
| apache/tika | `f45b9498f3` | Apache-2.0 | 1 | 2 | 1 |
| aspose-cells/Aspose.Cells-for-.NET | `7f78d477f4` | MIT | 0 | 0 | 3 |
| aspose-slides/Aspose.Slides-for-.NET | `e5d3e93ec3` | MIT | 0 | 4 | 2 |
| aspose-words/Aspose.Words-for-.NET | `0dee8aa1ae` | MIT | 4 | 0 | 0 |
| dotnet/Open-XML-SDK | `431ab05cf1` | MIT | 5 | 3 | 1 |
| exceljs/exceljs | `5bed18b45e` | MIT | 0 | 0 | 1 |
| jmcnamara/XlsxWriter | `a880ecc15c` | BSD-2-Clause | 0 | 0 | 3 |
| jmcnamara/rust_xlsxwriter | `714c836d7d` | Apache-2.0 | 0 | 0 | 3 |
| nissl-lab/npoi | `bae3fec504` | Apache-2.0 | 1 | 2 | 3 |
| plutext/docx4j | `6ae8731f98` | null | 3 | 4 | 3 |
| python-openxml/python-docx | `e45454602b` | MIT | 1 | 0 | 0 |
| scanny/python-pptx | `278b47b1de` | MIT | 0 | 5 | 0 |
| xceedsoftware/DocX | `4029607c53` | null | 4 | 0 | 0 |

## Proef

Elk bestand is in een apart Node-kindproces (tijdslimiet 180 s) geopend
met de echte engines uit `node_modules`, zonder wijziging opgeslagen en
heropend. De routes zijn dezelfde als in `scripts/test-kantoor-engines.mjs`
en `scripts/test-matrix-documenten.mjs`:

- XLSX: `openWorkbook` → `save` → `openWorkbook` (@betteroffice/xlsx 0.3.0)
- PPTX: `openPresentation` → `save` → `openPresentation`, met hetzelfde
  aantal dia's (@betteroffice/pptx 0.2.0)
- DOCX-model: `parseDocx` → `repackDocx` → `parseDocx`
  (@betteroffice/docx 0.4.3)
- DOCX-editor: `createYrsSession().openDocx` → `saveYrsDocx` → `openDocx`.
  Dit is de opslagkern van @betteroffice/docx-react.

Daarna vergeleek `grafieken_kenmerken.py vergelijk` per grafiek de
grafiekonderdelen, met hun SHA-256, met alles waarnaar de grafiek via
relaties verwijst: ingesloten werkboeken, `chartStyle`/`chartColorStyle`,
`themeOverride`, afbeeldingen. Ook gecontroleerd: de verwijzingen van
dia, tekening of document naar de grafiek (`chart`/`chartEx`-relaties),
het aantal `c:externalData`, en kapotte relaties in de uitvoer.

«Herkend» is het aantal grafieken dat de engine zelf als grafiek ziet:

- XLSX en PPTX: objecten met `kind: "chart"` in `exportXlsxStructured`
  of `exportPptxStructured`.
- DOCX-model: knopen met `type: "chart"` in de hoofdtekst van het model.

De editor-route biedt geen vergelijkbare telling.

### Resultaten per formaat en route

| Formaat / route | Geopend | Opgeslagen | Heropend | Grafieken behouden | Grafiekonderdelen byte-identiek | Verloren onderdelen | Engine-fouten | Grafieken voor → na | externalData voor → na | Ingesloten werkboeken voor → na | Door engine herkend (voor → na) |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|
| XLSX / xlsx-werkboek | 35/35 | 35/35 | 35/35 | 35/35 | 35/35 | 0 | 0 | 51 → 51 | 0 → 0 | 0 → 0 | 50 → 50 van 51 |
| PPTX / pptx-editor | 35/35 | 35/35 | 35/35 | 35/35 | 35/35 | 0 | 0 | 123 → 123 | 112 → 112 | 104 → 104 | 120 → 120 van 123 |
| DOCX / docx-model | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 0 | 0 | 83 → 83 | 77 → 77 | 76 → 76 | 59 → 59 van 83 |
| DOCX / docx-editor | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 0 | 0 | 83 → 83 | 77 → 77 | 76 → 76 | niet gemeten |

LibreOffice-referentie: het origineel is headless naar PDF geconverteerd.
Leesbaar = een PDF met minstens één pagina.

| Formaat | Leesbaar | Niet leesbaar |
|---|---:|---|
| XLSX | 35/35 | — |
| PPTX | 35/35 | — |
| DOCX | 26/30 | `xceed-docx-2f3749a10320`, `xceed-docx-66ae560a258d`, `xceed-docx-854cb7dfed99`, `xceed-docx-ebe10ff5c60e` («source file could not be loaded») |

Samen leverde dat 671 PDF-pagina's op. De run gebruikte bwrap met
`--unshare-net` en een tijdelijk profiel (MacroSecurityLevel 3,
DisableMacrosExecution, geen SecureURL, koppelingen niet bijwerken). Eerst
werd in groepen van tien geconverteerd; mislukte bestanden zijn daarna per
bestand opnieuw geprobeerd.

### Bevindingen

1. **Een no-op-rondgang behoudt grafieken volledig.** Dat geldt voor alle
   100 bestanden en alle vier routes. Alle chart-, chartEx-, stijl-, kleur-
   en ingesloten-werkboekonderdelen zijn byte-identiek. De verwijzingen
   naar de grafieken en alle `c:externalData` blijven bestaan, en er zijn
   geen kapotte relaties. De pakketten zelf zijn wel opnieuw gezipt, en
   andere onderdelen (`document.xml`, werkbladen) wijzigen. De engines
   geven grafiekonderdelen dus ongewijzigd door. Dit zegt niets over
   behoud na een bewerking van de grafiek of van de omgeving ervan. Die
   proef is hier niet gedaan.
2. **chartex (`cx:chartSpace`) wordt niet als grafiek herkend.**
   - In PPTX: 3 van de 3 chartex-grafieken ontbreken in
     `exportPptxStructured`: `aspose-slides-fbc2a661d192` (funnel),
     `docx4j-68210c2f43dd` (waterfall) en `libreoffice-df34aa1618d0`
     (funnel).
   - In het DOCX-model: alle 18 chartex-grafieken ontbreken
     (`aspose-words-f093f3c158db` met 17 en `docx4j-7f0144b41d01` met 1).
   - Ze blijven wel behouden. In XLSX telde `exportXlsxStructured` de
     chartex-grafieken wel mee.
3. **DOCX-model mist klassieke grafieken.**
   - `poi-79b1cb639a9c`: 4 van de 6 grafieken herkend.
   - De 4 `xceed-docx-*`-bestanden: 0 van 1 herkend. Xceed DocX schrijft
     geen `Override` voor de grafiek en een afwijkend standaardinhoudstype
     voor `.xml`. LibreOffice kan deze bestanden ook niet openen. De
     engines openen en bewaren ze wel.
4. **XLSX:** `poi-b2aa57fd6811` (`test-data/spreadsheet/65016.xlsx`, zonder
   `docProps/app.xml`) bevat een lijngrafiek die `exportXlsxStructured`
   niet als grafiek telt.
5. **LibreOffice en DisableActiveContent.** Met `DisableActiveContent=true`
   in het profiel brak LibreOffice 24.2.7 de PDF-export af met SIGABRT
   (exitcode 134). Dat gebeurde bij 29 van de 30 DOCX-bestanden met
   grafieken; XLSX en PPTX hadden er geen last van. Writer laadt grafieken
   als ingesloten objecten. Zonder die instelling (macro's nog steeds uit)
   converteerden 26 van de 30. Het nog niet vastgelegde
   `src-tauri/src/conversieprofiel.xcu` zet deze instelling aan. Een
   DOCX-conversie met grafieken via dat profiel zal daarom waarschijnlijk
   mislukken. Dat is aan dat profiel niet getest; alleen met hetzelfde
   instellingsitem in een tijdelijk profiel.

## Gebruik door `scripts/test-grafieken.mjs`

Het manifest is bedoeld om direct te itereren:

```js
const { bestanden } = JSON.parse(await readFile(".local/corpus/grafieken/manifest.json", "utf8"));
for (const b of bestanden.filter((b) => b.status === "geldig")) {
  // b.bestand   pad vanaf de repositorywortel, bijv. .local/corpus/grafieken/bestanden/poi-1a2b….xlsx
  // b.formaat   "docx" | "xlsx" | "pptx" (altijd gelijk aan de extensie)
  // b.grafieken aantal grafiekonderdelen (klassiek + chartex); b.klassiek / b.chartex apart
  // b.grafiekonderdelen  onderdeelnamen, bijv. ["word/charts/chart1.xml", …]
  // b.soorten   Nederlandse soortlabels (zie manifest.soortenlegenda), bijv. ["gestapeld","kolom"]
  // b.grafiekelementen   ruwe tellingen, bijv. {"c:barChart": 2, "c:externalData": 2, "cx:chart": 1}
  // b.externalData / b.ingeslotenWerkboeken / b.externGekoppeld, b.maker / b.makerfamilie
  // b.sha256    voor controle; b.bron, b.revisie, b.pad, b.url, b.licentie voor herkomst
}
```

Selecteren op soort: `bestanden.filter((b) => b.soorten.includes("taart"))`,
of op chartex: `b.chartex > 0`. De uitkomst per bestand en route staat in
`proef.json` onder `resultaten[].routes[]`, met `vergelijking` en
`engineGrafiekenVoor`/`engineGrafiekenNa`, en kan als nulmeting dienen.
`python3 scripts/grafieken_kenmerken.py vergelijk` (stdin: JSON-lijst met
`[bron, uitvoer]`) kan ook na een bewerking worden gebruikt.

## Bestanden

Volledige SHA-256, Git-blob-SHA, revisie en URL staan in het manifest.

| id | formaat | bron | pad | grafieken | soorten | sha256 (eerste 16) |
|---|---|---|---|---:|---|---|
| aspose-words-b8e4b905d06c | docx | aspose-words/Aspose.Words-for-.NET | `Examples/Data/Golds/ReportingEngine.SetChartSeriesColorDynamically Gold.docx` | 2 | combinatie, kolom, lijn | `787857e5511d3133` |
| aspose-words-e6ad9c51f904 | docx | aspose-words/Aspose.Words-for-.NET | `Examples/Data/Combo chart.docx` | 1 | combinatie, kolom, lijn | `db0c7b7026e14a19` |
| aspose-words-e9bca30b8338 | docx | aspose-words/Aspose.Words-for-.NET | `Examples/Data/Reporting engine template - Chart series color.docx` | 2 | combinatie, kolom, lijn | `0134f177d4627a44` |
| aspose-words-f093f3c158db | docx | aspose-words/Aspose.Words-for-.NET | `Examples/Data/Reporting engine template - Word 2016 Charts.docx` | 22 | chartex, chartex:boxWhisker, chartex:clusteredColumn, chartex:funnel, chartex:paretoLine, chartex:sunburst, chartex:treemap, chartex:waterfall, combinatie, koers, kolom | `4f68e55946357bc8` |
| docx4j-7f0144b41d01 | docx | plutext/docx4j | `docx4j-markdown/src/test/resources/charts/waterfall.docx` | 1 | chartex, chartex:waterfall | `34201b81f80ea345` |
| docx4j-dda1ad76dbc0 | docx | plutext/docx4j | `docx4j-core-tests/src/test/resources/charts/authoring/p3-bar-stacked.docx` | 1 | gestapeld, staaf | `e206afe43c34b640` |
| docx4j-ff20600302db | docx | plutext/docx4j | `docx4j-core-tests/src/test/resources/charts/authoring/p3-bar-stacked-100.docx` | 1 | gestapeld-100, staaf | `518003065d2fa8aa` |
| libreoffice-70de8b218866 | docx | LibreOffice/core | `chart2/qa/extras/data/docx/data_point_inherited_color.docx` | 1 | taart | `c63c9be0237bb472` |
| libreoffice-9ff8b4fd171f | docx | LibreOffice/core | `chart2/qa/extras/data/docx/bar-chart-labels.docx` | 1 | gestapeld-100, staaf | `9e60968bbf9860d6` |
| libreoffice-a804e7df2dcf | docx | LibreOffice/core | `chart2/qa/extras/data/docx/testStockChart.docx` | 1 | combinatie, koers, kolom | `0a98fd5f6def5e17` |
| libreoffice-f0642d4d5c29 | docx | LibreOffice/core | `chart2/qa/extras/data/docx/doughnutChart.docx` | 1 | ring | `1309cf2dbad88a3a` |
| npoi-d4e5bc827e12 | docx | nissl-lab/npoi | `testcases/test-data/document/61745.docx` | 2 | kolom, staaf | `ec54badce04b9fc3` |
| onlyoffice-sjablonen-0afdd1ea3cc3 | docx | ONLYOFFICE/document-templates | `sample-mobile/sample.docx` | 1 | kolom | `f1515f28731b2bae` |
| openxml-powertools-d1578bc416e2 | docx | OpenXmlDev/Open-Xml-PowerTools | `TestFiles/CU012-Chart-Embedded-Xlsx-04.docx` | 1 | 3d, staaf | `de3d512df4a25827` |
| openxml-powertools-dd95819ec2d5 | docx | OpenXmlDev/Open-Xml-PowerTools | `OpenXmlPowerToolsExamples/ChartUpdater01/Chart-Cached-Data-03.docx` | 1 | 3d, oppervlak | `a541f835aa409841` |
| openxml-powertools-e813a05d73fa | docx | OpenXmlDev/Open-Xml-PowerTools | `TestFiles/CU009-Chart-Embedded-Xlsx-01.docx` | 1 | 3d, staaf | `9ab879f154b041e3` |
| openxml-sdk-dc88c2f57266 | docx | dotnet/Open-XML-SDK | `test/DocumentFormat.OpenXml.Tests.Assets/assets/TestDataStorage/v2FxTestFiles/wordprocessing/chart/chart4.docx` | 7 | 3d, bel, gestapeld, kolom, lijn, radar, spreiding, taart, vlak | `a62b3e5c33d382ee` |
| openxml-sdk-e22ead756560 | docx | dotnet/Open-XML-SDK | `test/DocumentFormat.OpenXml.Tests.Assets/assets/TestDataStorage/v2FxTestFiles/wordprocessing/chart/chart2.docx` | 7 | 3d, bel, gestapeld, kolom, lijn, radar, spreiding, taart, vlak | `fe4e9d30a12f4ba9` |
| openxml-sdk-eb2c51036e6d | docx | dotnet/Open-XML-SDK | `test/DocumentFormat.OpenXml.Tests.Assets/assets/TestDataStorage/v2FxTestFiles/wordprocessing/chart/chart1.docx` | 7 | 3d, bel, gestapeld, kolom, lijn, radar, spreiding, taart, vlak | `c479f6488e408205` |
| openxml-sdk-ede5c00691c6 | docx | dotnet/Open-XML-SDK | `test/DocumentFormat.OpenXml.Tests.Assets/assets/TestDataStorage/v2FxTestFiles/wordprocessing/chart/chart-Area.docx` | 1 | 3d, gestapeld, vlak | `c604469c3badfaca` |
| openxml-sdk-fffdececd21d | docx | dotnet/Open-XML-SDK | `test/DocumentFormat.OpenXml.Tests.Assets/assets/TestDataStorage/v2FxTestFiles/wordprocessing/chart/chart3.docx` | 7 | 3d, bel, gestapeld, kolom, lijn, radar, spreiding, taart, vlak | `e0a46b5820de2f36` |
| poi-79b1cb639a9c | docx | apache/poi | `test-data/document/chartex.docx` | 6 | koers, kolom, lijn, radar | `5d7f0ca9aa26d024` |
| python-docx-bf3d9c9d1da1 | docx | python-openxml/python-docx | `features/steps/test_files/shp-inline-shape-access.docx` | 1 | kolom | `8fcf0f0433be0968` |
| syncfusion-docio-363a05b86bc0 | docx | SyncfusionExamples/DocIO-Examples | `Charts/Format-Chart-Area/.NET/Format-Chart-Area/Data/Template.docx` | 1 | kolom | `cda331de78c2cec4` |
| syncfusion-docio-c5503620c78c | docx | SyncfusionExamples/DocIO-Examples | `Charts/Convert-chart-to-image/.NET/Convert-chart-to-image/Data/TemplateWithChart.docx` | 1 | taart | `a802ac8f8856800e` |
| tika-7e9d9851a35e | docx | apache/tika | `tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-microsoft-module/src/test/resources/test-documents/testWORD_charts.docx` | 1 | taart | `04580520e7577ab4` |
| xceed-docx-2f3749a10320 | docx | xceedsoftware/DocX | `Xceed.Words.NET.Examples/Samples/Chart/Output/PieChart.docx` | 1 | taart | `385a11e6a05080eb` |
| xceed-docx-66ae560a258d | docx | xceedsoftware/DocX | `Xceed.Words.NET.Examples/Samples/Chart/Output/3DChart.docx` | 1 | 3d, kolom | `f5a0ba3ffd2b98ea` |
| xceed-docx-854cb7dfed99 | docx | xceedsoftware/DocX | `Xceed.Words.NET.Examples/Samples/Chart/Output/LineChart.docx` | 1 | lijn | `195c402e8e40f763` |
| xceed-docx-ebe10ff5c60e | docx | xceedsoftware/DocX | `Xceed.Words.NET.Examples/Samples/Chart/Output/BarChart.docx` | 1 | staaf | `b23494503edebd6c` |
| aspose-slides-5f5eabf08599 | pptx | aspose-slides/Aspose.Slides-for-.NET | `Examples/Data/Charts/DoughnutHoleSize_out.pptx` | 1 | ring | `2c67b4b78ce172e0` |
| aspose-slides-af2909fef489 | pptx | aspose-slides/Aspose.Slides-for-.NET | `Examples/Data/Charts/resultchart.pptx` | 3 | bel, kolom | `7775eba88d816999` |
| aspose-slides-de163e559e48 | pptx | aspose-slides/Aspose.Slides-for-.NET | `Examples/Data/Charts/AsposeChart_out.pptx` | 1 | combinatie, spreiding | `dbb0a2e29d265469` |
| aspose-slides-fbc2a661d192 | pptx | aspose-slides/Aspose.Slides-for-.NET | `Examples/Data/Charts/Funnel.pptx` | 2 | chartex, chartex:funnel, kolom | `da4197cad20b062e` |
| docx4j-0832d1e4f6e0 | pptx | plutext/docx4j | `docx4j-chart-render/src/test/resources/charts/render/probes/r1-bar-stacked-100.pptx` | 1 | gestapeld-100, staaf | `6d73374f87c67fda` |
| docx4j-0a1f84c5d451 | pptx | plutext/docx4j | `docx4j-chart-render/src/test/resources/charts/render/probes/r1-doughnut.pptx` | 1 | ring | `d4e7b09831a66cca` |
| docx4j-68210c2f43dd | pptx | plutext/docx4j | `docx4j-core-tests/src/test/resources/charts/waterfall.pptx` | 1 | chartex, chartex:waterfall | `39a84e811e72ff16` |
| docx4j-ae7a987a342b | pptx | plutext/docx4j | `docx4j-chart-render/src/test/resources/charts/render/probes/r1-bar-stacked.pptx` | 1 | gestapeld, staaf | `e65dba1e3d573e1e` |
| libreoffice-27d099d40f04 | pptx | LibreOffice/core | `chart2/qa/extras/data/pptx/stacked-non-stacked-mix-y-axis.pptx` | 3 | combinatie, gestapeld, gestapeld-100, kolom, vlak | `4954aef3015216c7` |
| libreoffice-629056ecc87a | pptx | LibreOffice/core | `chart2/qa/extras/data/pptx/tdf115107-2.pptx` | 1 | combinatie, kolom, lijn | `705e5a5f8b038f55` |
| libreoffice-df34aa1618d0 | pptx | LibreOffice/core | `chart2/qa/extras/data/pptx/funnel-pp1.pptx` | 1 | chartex, chartex:funnel | `8f971346a21010df` |
| npoi-05c30aae37e8 | pptx | nissl-lab/npoi | `testcases/test-data/slideshow/aascu.org_workarea_downloadasset.aspx_id=5864.pptx` | 8 | 3d, combinatie, kolom, lijn | `5df09eff2c5fbb2b` |
| npoi-33d28e154c47 | pptx | nissl-lab/npoi | `testcases/test-data/slideshow/pie-chart.pptx` | 1 | taart | `3b6404b59b24cb79` |
| onlyoffice-sjablonen-14032ee5205e | pptx | ONLYOFFICE/document-templates | `sample-mobile/sample.pptx` | 1 | gestapeld, staaf | `524d1144395e5889` |
| openxml-powertools-02baedbc8785 | pptx | OpenXmlDev/Open-Xml-PowerTools | `OpenXmlPowerToolsExamples/PresentationBuilder01/Customer Content.pptx` | 1 | kolom | `79ee477bca5b958d` |
| openxml-powertools-3796212a2c3b | pptx | OpenXmlDev/Open-Xml-PowerTools | `TestFiles/CU019-Chart-Embedded-Xlsx-41.pptx` | 1 | kolom | `75b496730ad75cf1` |
| openxml-sdk-0548dbc730c8 | pptx | dotnet/Open-XML-SDK | `test/DocumentFormat.OpenXml.Tests.Assets/assets/TestDataStorage/v2FxTestFiles/presentation/Chart_3D (Column).pptx` | 1 | 3d, kolom | `2b3d57ce8fe0409a` |
| openxml-sdk-8d7954ec53d0 | pptx | dotnet/Open-XML-SDK | `test/DocumentFormat.OpenXml.Tests.Assets/assets/TestDataStorage/v2FxTestFiles/presentation/test.pptx` | 1 | 3d, kolom | `86900700af0faa06` |
| openxml-sdk-b9c771565fa0 | pptx | dotnet/Open-XML-SDK | `test/DocumentFormat.OpenXml.Tests.Assets/assets/TestDataStorage/v2FxTestFiles/presentation/Chart_3D (Column)+Animation (Fly Out, as one object).pptx` | 1 | 3d, kolom | `1c165c6f1a11c424` |
| phppresentation-ddd4e48838b5 | pptx | PHPOffice/PHPPresentation | `tests/resources/files/PPTX_ChartBar.pptx` | 1 | kolom | `710c1091bb283b98` |
| poi-14b71bcbc835 | pptx | apache/poi | `test-data/slideshow/aascu.org_hbcu_leadershipsummit_cooper_.pptx` | 2 | gestapeld-100, kolom | `0089e34825a40c63` |
| poi-e6203e1975c7 | pptx | apache/poi | `test-data/slideshow/LIBRE_OFFICE-100610-0.pptx` | 10 | 3d, staaf, taart | `3691e1902a2590f3` |
| poi-f569d7f3a1a8 | pptx | apache/poi | `test-data/slideshow/radar-chart.pptx` | 1 | radar | `faf631199e44a1eb` |
| python-pptx-4b80fbd6b17d | pptx | scanny/python-pptx | `features/steps/test_files/cht-axis-props.pptx` | 8 | bel, kolom, lijn, spreiding | `e5fc3cf4f639cd68` |
| python-pptx-7ad46f325f49 | pptx | scanny/python-pptx | `features/steps/test_files/cht-series.pptx` | 11 | bel, combinatie, kolom, lijn, radar, ring, spreiding, staaf, taart, vlak | `b0aafc22914d65e7` |
| python-pptx-9853b1b014f8 | pptx | scanny/python-pptx | `features/steps/test_files/cht-chart-type.pptx` | 31 | 3d, bel, gestapeld, gestapeld-100, kolom, lijn, radar, spreiding, staaf, taart, vlak | `d0a7979d05970aa8` |
| python-pptx-deec544f20b6 | pptx | scanny/python-pptx | `features/steps/test_files/cht-datalabels.pptx` | 5 | kolom, ring, staaf, taart | `f0cfec1f27395002` |
| python-pptx-fab73863d2e1 | pptx | scanny/python-pptx | `features/steps/test_files/cht-replace-data.pptx` | 7 | bel, gestapeld-100, kolom, lijn, spreiding, staaf, taart | `db05d1a0b5fe7a65` |
| shapecrawler-0df651af660a | pptx | ShapeCrawler/ShapeCrawler | `ShapeCrawler.Tests/Assets/025_chart.pptx` | 8 | kolom, lijn, ring, spreiding, staaf, taart | `6ef0e65b303a0a98` |
| shapecrawler-cbf94a85443d | pptx | ShapeCrawler/ShapeCrawler | `ShapeCrawler.Tests/Assets/084 charts.pptx` | 2 | 3d, gestapeld, kolom, taart | `e78c115f7c544e54` |
| shapecrawler-cf678a67a571 | pptx | ShapeCrawler/ShapeCrawler | `ShapeCrawler.Tests/Assets/024_chart.pptx` | 2 | kolom, spreiding | `124c2137fbedec86` |
| syncfusion-pptx-c82074e54287 | pptx | SyncfusionExamples/PowerPoint-Examples | `Charts/Apply-chart-3D-formats/.NET/Apply-chart-3D-formats/Data/Template.pptx` | 1 | staaf | `c03c0dcce2cd484c` |
| syncfusion-pptx-f73abe3be5d1 | pptx | SyncfusionExamples/PowerPoint-Examples | `Charts/Format-Series/Explode-Pie-Chart/.NET/Explode-Pie-Chart/Data/Template.pptx` | 1 | taart | `0089df025375b9e2` |
| tika-1f1daf07b901 | pptx | apache/tika | `tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-microsoft-module/src/test/resources/test-documents/testPPT_various2.pptx` | 1 | kolom | `24f56e909a059726` |
| tika-af549b1ae80f | pptx | apache/tika | `tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-microsoft-module/src/test/resources/test-documents/testPPT_charts.pptx` | 1 | taart | `a6763b16b4bdc367` |
| aspose-cells-0a32b0215333 | xlsx | aspose-cells/Aspose.Cells-for-.NET | `Examples/Data/01_SourceDirectory/sampleInlineCharts.xlsx` | 3 | 3d, gestapeld, kolom, lijn, taart | `10909cfd6c8d5a7f` |
| aspose-cells-1b1f58857a35 | xlsx | aspose-cells/Aspose.Cells-for-.NET | `Examples/Data/01_SourceDirectory/sampleRichTextCustomDataLabel.xlsx` | 1 | combinatie, kolom, lijn, vlak | `baa99ca3d88c1374` |
| aspose-cells-bcb01cc91342 | xlsx | aspose-cells/Aspose.Cells-for-.NET | `Examples/Data/01_SourceDirectory/sampleReadManipulateExcel2016Charts.xlsx` | 5 | chartex, chartex:boxWhisker, chartex:clusteredColumn, chartex:sunburst, chartex:treemap, chartex:waterfall | `96ea4d34cd8c2fab` |
| aspose-slides-821f41d99890 | xlsx | aspose-slides/Aspose.Slides-for-.NET | `Demos/Aspose.Slides.Web/wwwroot/slides/static/templates/files/BubbleDataTemplate.xlsx` | 1 | bel | `7894533df2320bce` |
| aspose-slides-9bc391fba939 | xlsx | aspose-slides/Aspose.Slides-for-.NET | `Examples/Data/Shapes/book1.xlsx` | 1 | 3d, kolom | `9b298f0207a0077c` |
| closedxml-30dfb2ee1ec8 | xlsx | ClosedXML/ClosedXML | `ClosedXML.Tests/Resource/Other/PivotTableReferenceFiles/ChartsheetAndPivotTable.xlsx` | 1 | taart | `fe9806c2e07de617` |
| docx4j-1ed5054148e4 | xlsx | plutext/docx4j | `docx4j-chart-render/src/test/resources/charts/render/probes/r14-sweep-scatter.xlsx` | 1 | spreiding | `022dd89f85a55323` |
| docx4j-3103b7ec7bb3 | xlsx | plutext/docx4j | `docx4j-chart-render/src/test/resources/charts/render/probes/r14-scatter-smooth.xlsx` | 1 | spreiding | `e4a956f17d5afe17` |
| docx4j-cf039940ce5c | xlsx | plutext/docx4j | `docx4j-core-tests/src/test/resources/charts/cr047-pareto-hidden-axis-titled.xlsx` | 1 | chartex, chartex:clusteredColumn, chartex:paretoLine | `50379080dcd8f917` |
| exceljs-c8d7b3c01300 | xlsx | exceljs/exceljs | `spec/integration/data/chart-sheet.xlsx` | 1 | kolom | `d3caa6d3cd8b4552` |
| libreoffice-27ae097e2eba | xlsx | LibreOffice/core | `chart2/qa/extras/data/xlsx/invertIfNeg_bubble.xlsx` | 1 | bel | `e3966923b40b0f34` |
| libreoffice-2886bdc2f144 | xlsx | LibreOffice/core | `chart2/qa/extras/data/xlsx/paretoLine.xlsx` | 1 | chartex, chartex:clusteredColumn, chartex:paretoLine | `46f96c30f6de3a0b` |
| libreoffice-80b1a746343d | xlsx | LibreOffice/core | `chart2/qa/extras/data/xlsx/color_funnel.xlsx` | 1 | chartex, chartex:funnel | `146266cbba8dd471` |
| npoi-8defbd6cc4b8 | xlsx | nissl-lab/npoi | `testcases/test-data/spreadsheet/WithChartSheet.xlsx` | 1 | draaigrafiek, gestapeld, kolom | `792b9f21afdb6b8b` |
| npoi-9b8deceae25a | xlsx | nissl-lab/npoi | `testcases/test-data/spreadsheet/WithTwoCharts.xlsx` | 2 | lijn, vlak | `7d29c92e9f7968a5` |
| npoi-e7398e274bce | xlsx | nissl-lab/npoi | `testcases/test-data/spreadsheet/WithThreeCharts.xlsx` | 3 | lijn, taart, vlak | `629b69bd250d9b4e` |
| onlyoffice-sjablonen-8b1570666b50 | xlsx | ONLYOFFICE/document-templates | `sample-mobile/sample.xlsx` | 3 | gestapeld, lijn, staaf, taart | `50858be515ff6bfc` |
| openxml-sdk-e70eb1a5ad7b | xlsx | dotnet/Open-XML-SDK | `test/DocumentFormat.OpenXml.Tests.Assets/assets/TestDataStorage/Robustness/OFCAT/00df219f-f99a-4e93-b049-a666df53894c.xlsx` | 1 | 3d, gestapeld-100, staaf | `bb214d3a9f87496f` |
| phpspreadsheet-7306d0d46ef6 | xlsx | PHPOffice/PhpSpreadsheet | `samples/templates/32readwriteAreaPercentageChart3D1.xlsx` | 1 | 3d, gestapeld-100, vlak | `6fc2ac342b946974` |
| phpspreadsheet-82289bc4104e | xlsx | PHPOffice/PhpSpreadsheet | `samples/templates/32readwriteStockChart4.xlsx` | 2 | combinatie, koers, kolom | `90877d7390437330` |
| phpspreadsheet-a327a5df9061 | xlsx | PHPOffice/PhpSpreadsheet | `samples/templates/32readwriteRadarChart1.xlsx` | 2 | kolom, radar | `eda281ca5d6e28aa` |
| phpspreadsheet-d46b9c775149 | xlsx | PHPOffice/PhpSpreadsheet | `samples/templates/32readwriteSurfaceChart1.xlsx` | 2 | 3d, kolom, oppervlak | `25d50aeef9648cb0` |
| phpspreadsheet-f22f7087bb38 | xlsx | PHPOffice/PhpSpreadsheet | `samples/templates/32readwriteDonutChartExploded1.xlsx` | 2 | kolom, ring | `d8693a8a61ceb81c` |
| poi-b2aa57fd6811 | xlsx | apache/poi | `test-data/spreadsheet/65016.xlsx` | 1 | lijn | `c66bdc4ea8135da1` |
| poi-b476779931fd | xlsx | apache/poi | `test-data/spreadsheet/LIBRE_OFFICE-128382-0.xlsx` | 2 | 3d, lijn, taart | `e6dbe8f5da66804b` |
| poi-ec2be38234f9 | xlsx | apache/poi | `test-data/spreadsheet/57362.xlsx` | 1 | combinatie, kolom, lijn | `9f06f767e5b66596` |
| rust-xlsxwriter-7ff2068b6f08 | xlsx | jmcnamara/rust_xlsxwriter | `tests/input/chart_bar10.xlsx` | 1 | gestapeld-100, staaf | `31903d038e50fcbb` |
| rust-xlsxwriter-9e9fe1dc92f1 | xlsx | jmcnamara/rust_xlsxwriter | `tests/input/chart_combined05.xlsx` | 1 | combinatie, lijn, staaf | `a403cb094ae6a72d` |
| rust-xlsxwriter-dad5b71ed5ef | xlsx | jmcnamara/rust_xlsxwriter | `tests/input/chart_gridlines07.xlsx` | 1 | koers | `46557f20c963b70c` |
| syncfusion-xlsio-c4441d2f08d2 | xlsx | SyncfusionExamples/XlsIO-Examples | `Chart to Image/Chart to Image/.NET/Chart to Image/Chart to Image/Data/InputTemplate.xlsx` | 1 | combinatie, kolom, lijn | `cc3da19739e5ea1b` |
| syncfusion-xlsio-f22c26cf61b8 | xlsx | SyncfusionExamples/XlsIO-Examples | `Pivot Charts/Refresh Pivot Chart/.NET/Refresh Pivot Chart/Refresh Pivot Chart/Data/PivotChart.xlsx` | 1 | draaigrafiek, kolom | `e1db5b533b7c20db` |
| tika-2c5d0df5d6e4 | xlsx | apache/tika | `tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-microsoft-module/src/test/resources/test-documents/testEXCEL_charts.xlsx` | 1 | taart | `2c1a8bb222e6f4b0` |
| xlsxwriter-192ab5694219 | xlsx | jmcnamara/XlsxWriter | `xlsxwriter/test/comparison/xlsx_files/chart_scatter02.xlsx` | 1 | spreiding | `c2c0bf2156aab92e` |
| xlsxwriter-2db332871483 | xlsx | jmcnamara/XlsxWriter | `xlsxwriter/test/comparison/xlsx_files/chart_theme02.xlsx` | 1 | gestapeld, lijn | `2838c446c0e1f00d` |
| xlsxwriter-a0ab89692825 | xlsx | jmcnamara/XlsxWriter | `xlsxwriter/test/comparison/xlsx_files/chart_bar09.xlsx` | 1 | gestapeld, staaf | `72b3c4e16bbf7ddf` |
