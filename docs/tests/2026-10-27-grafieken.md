# Grafieken maken en bewerken: 27 oktober 2026

Grafieken maken en bewerken in Tekst (DOCX), Rekenblad (XLSX) en Presentatie
(PPTX). De engines (`@betteroffice/docx` 0.4.3, `xlsx` 0.3.0, `pptx` 0.2.0)
tonen en bewaren DrawingML-grafieken, maar hebben geen API om ze te maken of te
wijzigen. Daarom bewerkt een eigen module (`src/grafieken/`) het OOXML-pakket
zelf met fflate. Daarna laadt de editor het document opnieuw.

Proefomgeving: Node v24.19.0, Python 3.12, LibreOffice 24.2.7.2 en poppler
(`pdftotext`/`pdftoppm`) op Linux.

## Opzet

| Onderdeel | Bestand | Wat |
|---|---|---|
| Model | `src/grafieken/model.ts` | 11 soorten, titel, ondertitel, legenda (positie of geen), astitels (ook de tweede as), rasterlijnen, gegevenslabels en decimalen (numFmt `#,##0.0`). Reeksen hebben naam, waarden en kleur. Het OpenAEC-palet heeft overal ≥ 3:1 contrast op wit. Koprij en kopkolom worden herkend, reeksen staan in rijen of kolommen, getallen worden in Nederlandse notatie gelezen en er zijn limieten. Meldingen zijn in het Nederlands. |
| XML | `src/grafieken/xml.ts` | Verliesvrije XML-lezer met bronposities. Alleen gewijzigde stukken worden vervangen en de rest blijft byte-gelijk. DOCTYPE wordt geweigerd, met grenzen aan diepte en grootte. |
| Grafiek-XML | `src/grafieken/chartxml.ts` | Schrijft `c:chartSpace` met `c:f`-verwijzingen plus `strCache`/`numCache`. Leest grafieken terug naar het model. Bij bijwerken worden alleen titel, tekengebied (`c:layout`, `dTable`, `spPr` en `extLst` blijven) en legenda vervangen. Soorten buiten het model (3D, radar, bel, koers, `ofPie`, oppervlak, chartex) worden geweigerd met een melding. |
| Pakket | `src/grafieken/pakket.ts` | Zip-limieten, unieke part-namen en `rId`’s, rels en `[Content_Types]` (Default of Override). |
| Documenten | `src/grafieken/documenten.ts` | Invoegen, opsommen, bijwerken en verwijderen per formaat. Rekenblad: `twoCellAnchor` in een bestaande of nieuwe tekening, `<drawing>` op de juiste plek in het blad, een nieuw blad op verzoek, niet in vastgezette rijen of kolommen. Tekst: `wp:inline` na de gekozen alinea (of erin als die leeg is), met een ingesloten werkboek via `c:externalData` en unieke `docPr`-id’s. Presentatie: `p:graphicFrame` midden op de dia, met een ingesloten werkboek. |
| Ingesloten werkboek | `src/grafieken/werkboek.ts` | Minimaal geldig XLSX (gedeelde tekenreeksen, stijlen, blad “Blad1”). |
| Bron | `src/grafieken/bron.ts` | Rekent verwijzingen terug naar een aaneengesloten bereik (voor «Gegevens selecteren»). |
| UI | `src/grafieken/ui/*` | Venster met soortkeuze, live SVG-voorbeeld, gegevensblad (plakken van tabgescheiden tekst, «Uit geselecteerde tabel»), lijst «Grafieken in dit document», bevestiging bij verwijderen, rekenblad-plugin voor de grafiekselectie en de herlaad-hook. |
| Herladen | `src/editors.tsx`, `src/lint/editorApi.ts` | `EditorApis.herlaad` geeft `{ bytes(), vervang(bytes, doel) }`: serialiseren, editor met een nieuwe sleutel opnieuw mounten, als gewijzigd markeren, en het blad/de cel, de dia (`initialSlide`) of de alinea (`scrollToParaId`) selecteren. De oude engine-API wordt eerst losgelaten (eigen weergave) en pas daarna vervangen. Zo leest niets meer een opgeruimde handle. Een opgeslagen zoom blijft staan, want de sleutel van `useDocumentZoom` verandert niet. |

## Toetsen

### Vitest (`src/grafieken/grafieken.test.ts`): 37 tests geslaagd

- Model: getallen in NL- en EN-notatie, herkenning van koprij en kopkolom, verwijzingen (ook met aanhalingstekens rond bladnamen) en validatie met Nederlandse meldingen.
- Grafiek-XML: alle 11 soorten schrijven en teruglezen (soort, titel, ondertitel, decimalen, labels, waarden, verwijzingen, astitels). Elke `crossAx` wijst naar een bestaande as en elke `axId` is uniek. Bij bijwerken blijft `extLst` behouden. `bar3DChart` wordt geweigerd. De witte rand van taartpunten wordt niet als reekskleur overgenomen.
- Pakketten: XLSX met twee grafieken (unieke rels en `cNvPr`, één `<drawing>`, onaangeroerde `styles.xml`), een nieuw blad met een dubbele naam (geweigerd), DOCX invoegen → bewerken (werkboek vervangen) → verwijderen (onderdelen en inhoudstype opgeruimd), plaatsing na een alinea, en PPTX met unieke `cNvPr`.
- Round-trip met de echte engines:
  - XLSX: het engine-id `xl/drawings/drawing1.xml#0` komt overeen met de lezer, en bewerken lukt ook na opslaan met de engine.
  - PPTX: het `graphicFrame` met `graphic.type = chart` blijft behouden.
  - DOCX: de Yrs-opslagkern van de editor bewaart grafiek en ingesloten werkboek.

De volledige suite (`vitest run src`): 71 bestanden, 1361 tests geslaagd.
`tsc --noEmit` geeft geen fouten.

### `node scripts/test-grafieken.mjs`

Per bronbestand worden 11 soorten ingevoegd, in 6 bestanden: `docs/voorbeelden/{Materiaaloverzicht.xlsx, Ontwerpnotitie.docx, Ontwerpvisie.pptx}` en `public/templates/nieuw.{xlsx,docx,pptx}`. Bij `nieuw.xlsx` zet de engine eerst gegevens in het blad. Bij Materiaaloverzicht verwijst de grafiek naar F6:G14. Alle uitvoer staat in `.local/grafieken/` (`resultaat.json`, pdf/png).

| Controle | Resultaat |
|---|---|
| Ingevoegd | 66/66 |
| XML (python3 stdlib: welgevormd, Override per onderdeel, alle rels-doelen bestaan, geen dubbele `rId`) | 66/66 |
| Engine opent en toont de grafiek, opslaan en heropenen lukken | 66/66 |
| Grafiek na opslaan met de engine nog aanwezig, met dezelfde soort en titel (DOCX via `saveYrsDocx` én `repackDocx`) | 66/66 |
| `vergelijk_pakketten.py`: niets verwijderd, alleen de verwachte onderdelen gewijzigd (`[Content_Types]`, blad/document/dia met rels), alleen grafiek-, tekening- en embedding-onderdelen toegevoegd | 66/66 |
| LibreOffice → PDF: grafiektitel in de PDF-tekst | 66/66 |
| LibreOffice → PDF → PPM (40 dpi): ≥ 1500 pixels anders dan zonder grafiek én nieuwe paletkleur (minimaal gemeten: 7.169 px verschil en 287 paletpixels) | 66/66 |
| Getekend door de eigen engine (geen plaatshouder) | 58/66, zie beperkingen |

Ter inzage staan in `.local/grafieken/pdf/` de LibreOffice-renders van de
combinatiegrafiek per bestand (`*-combinatie-*.png`). LibreOffice toont de
getallen in Nederlandse notatie (`18,0`, `4,5`), dus de numFmt werkt.

### Corpus: 100 echte bestanden (`.local/corpus/grafieken/manifest.json`)

30 DOCX, 35 XLSX en 35 PPTX, gemaakt door Microsoft Office, LibreOffice,
ONLYOFFICE, Apache POI, NPOI, docx4j, OpenXML SDK, ClosedXML, ExcelJS,
rust_xlsxwriter, Aspose en ShapeCrawler.

| Controle | Resultaat |
|---|---|
| Grafiekobjecten herkend (klassiek + chartex) | 257. Per bestand gelijk aan het manifest in 100/100 bestanden. |
| Bewerkbaar volgens de lezer | 143: kolom 35, staaf 21, taart 18, spreiding 17, lijn met markeringen 13, lijn 12, combinatie 9, ring 6, vlak 6, gestapelde kolom 3, 100%-kolom 3 |
| Geweigerd met een melding | 114: uitgebreide grafiek (chartex) 31. Soort buiten het model 76: `bar3DChart` 20, `bubbleChart` 13, `radarChart` 11, `stockChart` 9, `area3DChart` 9, `pie3DChart` 8, `ofPieChart` 3, `surface3DChart` 2, `line3DChart` 1. Afwijkende combinatie 3, zonder reeksen 2, ongeldige gegevens 2. |
| Bestaande grafiek bewerkt (titel) | 69 bestanden |
| Nieuwe grafiek ingevoegd | 100/100 (XLSX naast de bewerkte grafiek met dezelfde celverwijzingen; bij een grafiekblad op een nieuw werkblad) |
| Engine openen, opslaan, heropenen | 100/100 |
| Alle grafieken (oud en nieuw) behouden na opslaan met de engine | 100/100 |
| Geen nieuwe XML- of pakketfouten (alleen fouten die de bron niet al had) | 100/100 |
| LibreOffice → PDF | 99/100. `xceed-docx-66ae560a258d` laadt ook als origineel niet in LibreOffice. |
| Nieuwe grafiek zichtbaar in de PDF-tekst | 99/99 |
| Bewerkte titel zichtbaar in de PDF-tekst | 65/69 |

Twee fouten zijn dankzij het corpus gevonden en hersteld:

- Een pakket zonder `Default Extension="rels"` (Apache POI) kreeg een rels-onderdeel zonder inhoudstype. Er wordt nu een Override toegevoegd.
- Grafieken zonder bruikbare gegevens (geen categorieën, spreiding zonder getallen) worden nu als niet bewerkbaar gemeld in plaats van pas bij opslaan te falen.

### Browser (eigen tab, Vite-instantie zonder HMR)

Tijdens de proef herlaadde de gedeelde server op poort 1420 voortdurend,
omdat andere agents bestanden wijzigden. Daarom is gewerkt met dezelfde
`vite.config.ts` op poort 1440, zonder watch en zonder HMR.

- **Rekenblad** (Materiaaloverzicht):
  - Invoegen → Grafiek: bij één cel wordt het huidige gebied A6:H14 voorgevuld. F6:G14 met Kolom + lijn geeft een live voorbeeld. Daarna volgen herladen, de markering «Niet-opgeslagen wijzigingen» en de selectie op het doel.
  - Een klik op de grafiek toont het contexttabblad «Grafiekontwerp». Via «Soort wijzigen» is de grafiek veranderd in een staaf met labels en opnieuw getekend.
  - «Grafiek verwijderen» met bevestiging verwijdert de grafiek.
  - F11 opent het venster met «Op een nieuw blad» voorgekozen. Daarna verschijnt blad «Grafiek 1» met de grafiek.
- **Tekst** (Ontwerpnotitie):
  - Cursor in de eerste alinea, dan Invoegen → Grafiek met het gegevensblad. De grafiek staat direct na die alinea en het document scrolt erheen.
  - Via «Grafiek bewerken» is een waarde gewijzigd en de soort omgezet naar lijn met markeringen. Het resultaat is opnieuw getekend.
- **Presentatie** (Ontwerpvisie): een ring op dia 2 en dia 3. Na herladen blijft dezelfde dia actief. Een klik op het frame toont het contexttabblad «Grafiekontwerp». Via «Gegevens en opmaak» is de ring omgezet naar een staaf.
- Er zijn geen fouten in de console tijdens of na het herladen.

## Gebruikerstest Materiaaloverzicht: drie fouten hersteld

Scenario: `docs/voorbeelden/Materiaaloverzicht.xlsx`, blad «Materialen» (koppen
in rij 6, gegevens vanaf rij 7, zes vaste rijen), selectie B6:D12 (Materiaal,
Categorie, Aantal) en Alt+F1.

| Fout | Oorzaak | Herstel |
|---|---|---|
| «Eerste kolom bevat namen» stond uit, dus categorieën 1..6 | De kopkolom werd alleen herkend als de kolom ernaast getallen had; daar stond Categorie (tekst). | `herkenKoppen` (`model.ts`): de eerste kolom is een kopkolom als ten minste twee derde van de gevulde gegevenscellen tekst of datum is (datum via de weergavetekst van het rekenblad) en er elders in het bereik getallen staan. Volgnummers tellen ook als namen: tekst met voorloopnul (`01`, ook als getal met notatie `00`), of opeenvolgende gehele getallen onder een tekstkop (kolom «Nr.»). Voor de eerste rij geldt hetzelfde (overwegend tekst of datums). |
| Categorie werd als reeks opgenomen | Elke kolom naast de kopkolom werd een reeks. | Reeksen zonder getallen tellen standaard niet mee (`heeftGetallen`, `kiesReeksen`). Het venster toont onder «Reeksen» elke reeks met een vinkje; een reeks zonder getallen staat uitgevinkt en uitgeschakeld met «(geen getallen)». De gebruiker kan ook zelf reeksen uitvinken. De voorvertoning volgt. Blijft er niets over: «Geen enkele kolom in het bereik bevat getallen …» of «Kies minstens één reeks voor de grafiek.». Bij «Grafiek bewerken» leidt `bronUitModel` de overgeslagen kolommen af (`overslaan`), zodat het bereik B6:D12 blijft en Categorie weer uitgevinkt staat. |
| Grafiek op F7, over Prijs per eenheid, Totaal en Beschikbaarheid | De plek was «selectie rechts + 2 kolommen». | `plaatsing.ts` (`plekVoorGrafiek`) met het bladmodel uit `bladmodelXlsx` (`documenten.ts`): cellen met een waarde of formule, samengevoegde gebieden, bestaande tekeningobjecten en de vaste rijen/kolommen; alleen opgemaakte lege cellen tellen niet mee. De grafiek komt rechts naast het gebruikte bereik (eerste lege kolom + 1 marge), op de hoogte van de bovenkant van de selectie. Begint dat voorbij kolom 30, dan onder het gebruikte bereik, links uitgelijnd met de selectie. Nooit in vaste rijen/kolommen, en een vangnet schuift de grafiek omlaag zolang hij iets bedekt. Bij Materiaaloverzicht: **J7**. |

Gevonden tijdens het herstel:

- **Scrollen tot de grafiek**: de rekenblad-engine (`xlsx` 0.3.0) laat alleen scrollen tot de laatste cel van het blad (`sheetInfo().contentWidth/Height`). Tekeningen tellen niet mee, dus een grafiek naast de gegevens viel in een smal venster buiten bereik. `voegGrafiekToeXlsx` zet nu een lege cel met standaardstijl (`<c r="R23" s="0"/>`) op de hoek rechtsonder van het anker, in de juiste rij- en celvolgorde en met bijgewerkte `spans`. Daarmee groeit het scrollbereik (getoetst met de engine, ook na opslaan en heropenen). Excel en LibreOffice negeren zo'n cel. Een kolomopmaak op die ene cel vervalt. Werkboeken zonder `cellXfs` krijgen de cel niet, want daar zou `s="0"` ongeldig zijn. In de eerste corpusrun gaf dat bij twee docx4j-bestanden de engine-fout «cell style index 0 is out of range».
- **Na herladen in beeld**: het herlaaddoel krijgt het grafiekgebied mee (`XlsxDoel.zicht` in `herladen.ts`). Eerst wordt de hoek rechtsonder in beeld gebracht, daarna wordt de linkerbovencel van de grafiek geselecteerd.
- **Selectie van de engine**: de plugin `openaec-grafiekselectie` volgt nu ook de celselectie (`cellen()`), zodat de grafiekmaker niet meer afhangt van de weergave (naamvak en `aria-selected`). Daarbij valt hij terug op de oude manier.
- **Naamvak**: het naamvak van `xlsx-react` 0.3.0 is `readOnly`. Typen van `B6:D14` + Enter doet in de app zelf dus ook niets; dat komt niet door de testtool. Het is een beperking van de engine en buiten `src/grafieken` niet hersteld. Een bereik selecteren via **Navigator (F5)** werkt wel, en de grafiekmaker vult daarna `Materialen!B6:D12` voor.

Toetsen:

- Vitest, 7 nieuwe tests in «gebruikerstest Materiaaloverzicht» en de engine-rondgang: herkenning (tekst, datums, `01`, 1-2-3 onder «Nr.», geen kopkolom bij Aantal/Prijs), uitsluiten en meldingen, `bronUitModel` met `overslaan`, plaatsing met een fictief bladmodel (vaste rijen en kolommen, te breed blad → eronder, leeg blad, vangnet), het echte bladmodel van Materiaaloverzicht (J7, een tweede grafiek op T7) en de reikwijdtecel (nieuwe rij, bestaande rij met `spans`, bestaande cel ongemoeid).
- Browser (productie-build, `vite preview` op poort 4341, eigen tab): Materiaaloverzicht openen, F5 → `B6:D12`, Alt+F1. Het venster toont `Materialen!B6:D12`, beide vinkjes «bevat namen» aan, «Categorie (geen getallen)» uitgevinkt, en een voorbeeld met 1 reeks (Aantal) en 6 categorieën met de materiaalnamen. Na Invoegen staat de grafiek op J7:R23 naast de tabel, onder de vaste rijen, met de selectie op J7 en kolom J in beeld. De console is foutloos.
- `node scripts/test-grafieken.mjs` (opnieuw gedraaid): 66/66 op alle controles (engine-tekening 58/66, zoals eerder). Corpus ongewijzigd: engine 100/100, alle grafieken behouden 100/100, LibreOffice 99/100 (dezelfde `xceed-docx-66ae560a258d`).

## Beperkingen

- **Ongedaan maken**: herladen wist de geschiedenis van de editor. Het venster meldt dit vooraf.
- **Weergave in de rekenblad-engine**: `xlsx` 0.3.0 tekent gestapelde en 100%-kolommen, spreiding en combinatie als lege plaatshouder («not shown»). Opslaan, Excel en LibreOffice tonen ze wel. DOCX en PPTX tekenen alle 11 soorten. De PPTX-engine tekent bij een ring met meerdere reeksen alleen de buitenste ring.
- **Getalnotatie in de engines**: de numFmt `#,##0` is taalneutraal. LibreOffice en Excel tonen `1.000`, de engines van de app tonen `1,000`.
- **Bewerken**:
  - Opmaak per reeks (behalve de effen kleur), trendlijnen, foutbalken en datalabels per punt vervallen. Ondersteunde varianten van onbekende soorten worden met een waarschuwing omgezet: gestapelde staaf → staaf, gestapelde lijn → lijn.
  - Taart gebruikt alleen de eerste reeks.
  - Categorieën met meerdere niveaus worden één niveau.
  - Bij DOCX en PPTX wordt het ingesloten werkboek vervangen door de gegevens uit het gegevensblad. Andere bladen in dat werkboek vervallen.
- **Aanwijzen**:
  - Tekst: de grafiek wordt bepaald via de alinea met de cursor. Lukt dat niet, dan valt de keuze op de enige grafiek of verschijnt de lijst «Grafieken in dit document». Er is geen contexttabblad, omdat docx-react een aangeklikte grafiek niet als selectie meldt.
  - Rekenblad: via `chartId` van de engine (plugin `openaec-grafiekselectie`), anders via de enige grafiek op het actieve blad.
- **Invoegen in tekst**: altijd na de alinea met de cursor (of in de alinea als die leeg is), niet midden in een alinea.
- **Ondertitel**: een ondertitel zonder titel wordt bij teruglezen de titel.
- **Grafiekbladen**: een grafiek op een grafiekblad (chartsheet) wordt herkend. Een nieuwe grafiek komt altijd op een werkblad.
- **Opnieuw draaien**: `node scripts/test-grafieken.mjs [--zonder-libreoffice] [--zonder-corpus] [--corpus=N]`. De volledige run met corpus en LibreOffice duurt enkele minuten.
