# Presentaties: testmatrix P1–P3 en routekeuze — 26 oktober 2026

Onderdeel van issue #4. De proef is uitgevoerd op 26 oktober 2026 met Node
v24.19.0, Python 3.12.3 en LibreOffice 24.2.7.2 op Linux. De opzet,
reproductie en controles zijn dezelfde als in het
[documentenverslag](2026-10-26-documenten.md).

## Fixtures

De fixtures zijn synthetisch en gemaakt met `scripts/maak-matrixfixtures.py`.
Er is geen praktijkmateriaal gebruikt. Elk pakket heeft een eigen
diamodel (master), lay-out en thema met kleur-, lettertype- en opmaakschema.

| Geval | Kenmerken | Bewerking |
|---|---|---|
| P1 | Master + lay-out, thema met `majorFont` Georgia en `minorFont` Calibri, tekstvak met expliciet `a:latin` Georgia, PNG-afbeelding | Titel «Matrixproef P1 concept» → «definitief» |
| P2 | Staafgrafiek (`ppt/charts/chart1.xml`, `c:barChart`, letterlijke reekswaarden), tabel (`a:tbl`), sprekersnotitie met notitiemaster en tweede thema | Tekstvak «Toelichting kwartaal 3» → «4» |
| P3 | Ingangsanimatie (`p:timing` met `p:set`/`p:animEffect` op een bestaande vorm), overgang (`p:transition` fade), ingebed object (`p:oleObj` + `ppt/embeddings/*.docx` + voorbeeldbeeld), onbekend pakketonderdeel met eigen relatie- en inhoudstype, onbekende `p:ext`-extensie op de dia én in het te bewerken tekstvak | Los tekstvak «variant A» → «variant B» |

Bewust niet in de fixtures: ingesloten lettertypen (`p:embeddedFontLst`),
een grafiek met ingesloten werkmap, SmartArt, video en audio. Deze zijn niet
gemeten.

## Routes

| Route | Wat | Versie |
|---|---|---|
| Browser/WASM (pptx-editor) | `openPresentation` → `searchText` → `deleteText`/`insertText` → `save` → heropenen. Dit is dezelfde `PresentationHandle` die `@betteroffice/pptx-react` in de app gebruikt (`api.save()`). | @betteroffice/pptx 0.2.0; `wasmVersion()` meldt `0.0.0` |
| Volledige suite (libreoffice) | LibreOffice headless via UNO, met een tijdelijk profiel en macro’s uit. Zoeken en vervangen per dia, opslaan met het filter «Impress MS PowerPoint 2007 XML» en heropenen. | LibreOffice 24.2.7.2 |

Beide routes importeren een bestaand bestand. Geen van beide is een
generatiebibliotheek. Er staat ook geen generatiebibliotheek (zoals
PptxGenJS) in `node_modules`, en die wordt niet als bewerkingsroute
gepresenteerd.

## Resultaten

Bronhashes (SHA-256): P1 `16963a47ba92…`, P2 `26c2d8d5dc91…`, P3 `a4e680e7ebd8…`.
De resulthashes van de WASM-route waren in herhaalde runs gelijk, bijvoorbeeld
P1 no-op `47fe824f3628…`. Volledige hashes staan in
`.local/matrix/documenten/rapport.json`.

| Geval | Route | Actie | Verdwenen | Toegevoegd | Gewijzigd | Verloren kenmerken | Tekst | Visueel (max.) |
|---|---|---|---:|---:|---|---|---|---|
| P1 | WASM | no-op | 0 | 0 | — | — | gelijk | 0 % |
| P1 | WASM | bewerking | 0 | 0 | `slide1.xml` | — | alleen bedoeld | 0,468 % |
| P1 | libreoffice | no-op | 2 | 0 | 14 onderdelen | — | gelijk | 0,011 % |
| P1 | libreoffice | bewerking | 2 | 0 | 13 onderdelen | — | alleen bedoeld | 0,479 % |
| P2 | WASM | no-op | 0 | 0 | — | — | gelijk | 0 % |
| P2 | WASM | bewerking | 0 | 0 | `slide1.xml` | — | alleen bedoeld | 0,015 % |
| P2 | libreoffice | no-op | 2 | 0 | 20 onderdelen | — | gelijk | 0,012 % |
| P2 | libreoffice | bewerking | 2 | 0 | 19 onderdelen | — | alleen bedoeld | 0,022 % |
| P3 | WASM | no-op | 0 | 0 | — | — | gelijk | 0 % |
| P3 | WASM | bewerking | 0 | 0 | `slide1.xml` | — | alleen bedoeld | 0,019 % |
| P3 | libreoffice | no-op | 5 | 2 | 14 onderdelen | onbekend onderdeel (relatie en inhoudstype), onbekende extensies (2) | gelijk | 0,011 % |
| P3 | libreoffice | bewerking | 5 | 2 | 13 onderdelen | idem | alleen bedoeld | 0,029 % |

De visuele waarden zijn het grootste aandeel afwijkende pixels per pagina,
gerenderd met LibreOffice → PDF → pdftoppm op 40 dpi. P1 heeft een grotere
waarde omdat de gewijzigde titel langer is.

**Browser/WASM**

- Bij een no-op zijn alle onderdelen byte-identiek; alleen de ZIP-container
  verschilt.
- Bij een bewerking verandert uitsluitend het bewerkte diaonderdeel. Na
  parsen is dat onderdeel structureel gelijk aan de bron met de bedoelde
  vervanging. Alleen de attribuutvolgorde en de naamruimtevolgorde zijn
  anders.
- `p:timing`, `p:transition`, `p:oleObj` en beide onbekende extensies op de
  bewerkte dia blijven behouden, net als het onbekende onderdeel.
- Masters, lay-outs, thema’s (inclusief lettertypeschema), notities,
  notitiemaster, grafiek, tabel en afbeelding zijn onaangeroerd.

**LibreOffice**

- Schrijft alle onderdelen opnieuw.
- Laat `tableStyles.xml` en `viewProps.xml` weg.
- Hernoemt het ingebedde object naar `oleObject1.docx` en het voorbeeldbeeld
  naar `image1.png`. Beide blijven via relaties bereikbaar.
- Behoudt master, thema, lettertypeschema, grafiek, tabel, notities, animatie
  en overgang. Het schrijft daarbij expliciete `a:latin`-lettertypen in dia’s
  die die eerst niet hadden.
- **Verliest** het onbekende pakketonderdeel en beide onbekende
  `p:ext`-extensies.

## Keuze

**Kies de browser/WASM-route (`@betteroffice/pptx` met `@betteroffice/pptx-react`)
als editor. Gebruik LibreOffice alleen voor conversie van en naar andere
formaten (PPT, ODP, PPSX, PDF), met een expliciete verlieswaarschuwing.**
Onderbouwing: op P1–P3 behoudt de WASM-route elk gemeten kenmerk, laat ze
ongewijzigde onderdelen byte-identiek en verandert ze alleen de bewerkte dia.
De suite herschrijft het hele pakket en verliest onbekende inhoud.

| Gegeven | Waarde |
|---|---|
| Pakketversies (exact vastgezet in `package.json`) | `@betteroffice/pptx` 0.2.0, `@betteroffice/pptx-react` 0.2.0, `@betteroffice/pptx-i18n` 0.2.0 |
| Licentie | Apache-2.0 (`package.json` en volledige `LICENSE`). Copyright: «Elia Hilse, The OpenOOXML Project» (pptx, pptx-react) en «The OpenOOXML contributors» (pptx-i18n). Geen NOTICE-bestand meegeleverd. De teksten komen bij de build in `licenses/npm.txt`. |
| Omvang in `node_modules` (ruw / gzip -9) | `pptx_wasm_bg.wasm` 5.395.943 / 2.078.459 B; `pptx` JS 74.469 / 19.179 B; `pptx-react` JS 196.802 / 62.718 B; `pptx-i18n` 171.728 B totaal. Pakketten totaal: 5,55 MB + 0,27 MB + 0,17 MB. |
| Afhankelijkheden | `pptx` geen; `pptx-react` alleen `pptx` en `pptx-i18n` (plus React als peer) |
| Volledige suite | LibreOffice 24.2.7.2 (MPL-2.0, deels LGPLv3+), als extern programma op de desktop; wordt niet meegebundeld |

Deze omvang is gemeten in `node_modules`. Het is geen browserbundelmeting:
er is geen productiebuild gemaakt en Brotli is niet gemeten.

### Beperkingen

- Alleen synthetische fixtures met één dia. Er is geen praktijkcorpus voor
  P1–P3 gebruikt; het openbare corpus staat in [21 okt](2026-10-21-formaten.md).
- Gemeten bewerking: alleen tekst vervangen in een tekstvak of titel.
  Bewerken van grafiek, tabelcel, notities of animatie en het verplaatsen van
  vormen zijn niet in deze matrix gemeten.
- Volgens de upstream-README zet de gestructureerde export grafieken,
  SmartArt, ingebedde objecten en niet-gemodelleerde vormen om naar
  placeholders. Dat geldt voor de export en niet voor het opslaan, maar de
  editor toont deze inhoud mogelijk niet volledig. Dat is niet in de GUI
  gecontroleerd.
- Een ingesloten lettertype, een grafiek met werkmap, SmartArt en
  media zijn niet gemeten.
- `wasmVersion()` meldt `0.0.0`. Identificeer de engine daarom aan de hand
  van de npm-versie en de lockfile.
- De GUI-editor is in deze proef niet bediend met P1–P3. Eerdere GUI-proeven
  (dia, notitie, diavoorstelling) gebruikten eigen bestanden
  ([22 okt](2026-10-22-gui.md)).

## Bewaking

`controleerPakket` herkent in PPTX notities, animaties (`p:timing`),
overgangen, grafieken, ingebedde objecten, opmerkingen, onbekende onderdelen
en onbekende naamruimten op dia’s. `risicoBeleid` blokkeert opslaan via de
WASM-engine niet, omdat de matrix voor PPTX geen engineverlies toonde. Bij een
conversie via LibreOffice meldt het expliciet dat onbekende onderdelen en
extensie-elementen verloren gaan. Dat geldt voor Opslaan als PPT, ODP of PPSX
en voor het importeren van bijvoorbeeld `.pptm` of `.potx`. Zie het
[documentenverslag](2026-10-26-documenten.md#bewaking-in-de-app).

## Status issue #4

| Criterium | Status |
|---|---|
| P1–P3: openen, één wijziging, opslaan en heropenen | Gehaald voor synthetische fixtures, op beide routes (engine; GUI niet met deze bestanden). |
| Masters, thema’s, notities, animaties en onbekende onderdelen controleren | Gehaald: per kenmerk gecontroleerd, zie de tabel. |
| Geen generatiebibliotheek zonder import als complete bewerkingsroute | Gehaald: beide routes importeren bestaande PPTX; er is geen generatiebibliotheek gebruikt of aanwezig. |
| Keuze met pakketversie, licentie, bundelomvang en beperkingen | Gehaald, met de kanttekening dat de omvang een pakketmeting is en geen productiebundelmeting. |
