# Documenten: testmatrix D1–D3 — 26 oktober 2026

Onderdeel van issue #2. Uitgevoerd op 26 oktober 2026 met Node v24.19.0,
Python 3.12.3 en LibreOffice 24.2.7.2 op Linux.

## Opzet

Er zijn geen praktijkbestanden aangeleverd. Daarom zijn synthetische,
niet-gevoelige fixtures gemaakt met precies de kenmerken uit de
[testmatrix](../onderzoek/testmatrix.md). Ze bevatten alleen eigen testzinnen.
Het script gebruikt uitsluitend de Python-standaardbibliotheek en maakt
reproduceerbare ZIP-bestanden met vaste tijdstempels en een vaste volgorde.

| Geval | Kenmerken in de fixture | Bewerking |
|---|---|---|
| D1 | Kop 1/Kop 2 (stijlen met `outlineLvl`), briefpapier met PNG-logo in de koptekst, voettekst met `fldSimple PAGE` en `NUMPAGES`, twee pagina’s | «gepland in week 12» → «week 14» |
| D2 | Twee tabellen, afbeelding in de hoofdtekst, twee secties: staand en liggend (`w:orient="landscape"`, breedte > hoogte) | Tabelcel «Wandoppervlak 125 m2» → «130 m2» |
| D3 | Opmerking (`comments.xml` + bereik + verwijzing), revisies (`w:ins`, `w:del`), voetnoot, custom XML-onderdeel met eigenschappen, onbekend onderdeel met eigen relatietype en inhoudstype, onbekend `mc:Ignorable`-element in de te bewerken alinea | Losse alinea «versie A» → «versie B» |

Elke fixture doorloopt per route: (a) openen en opslaan zonder wijziging,
(b) de beperkte bewerking en (c) heropenen met dezelfde engine. Per bestand
worden engineversie, bronhash, resulthash, actie en verdwenen, gewijzigde en
toegevoegde onderdelen vastgelegd. Het bewerkingsfragment komt in elk pakket
precies één keer voor.

```bash
python3 scripts/maak-matrixfixtures.py     # .local/matrix/documenten/bron
node scripts/test-matrix-documenten.mjs   # engines, LibreOffice-route, beoordeling
```

De beoordeling bestaat uit drie onafhankelijke controles:

1. `scripts/vergelijk_pakketten.py`: SHA-256 per gedecomprimeerd onderdeel.
2. `scripts/matrix_kenmerken.py`: een eigen controle die per kenmerk de XML en
   relaties leest. Hij controleert onder meer kop- en voettekstrelaties en
   `headerReference`/`footerReference`, het logo in de koptekst met bestaand
   mediaonderdeel, het `PAGE`-veld, `sectPr` met liggende pagina, het aantal
   `w:ins` en `w:del`, opmerkingen, voetnoten, custom XML en eigenschappen,
   en het onbekende onderdeel met relatie en inhoudstype. Daarnaast vergelijkt
   hij alineateksten (inclusief `w:delText`) per onderdeel en de XML-structuur
   na parsen.
3. `scripts/matrix_visueel.py`: LibreOffice zet bron en resultaat om naar PDF,
   daarna rastert `pdftoppm` ze op 40 dpi. Per pagina telt het aandeel pixels
   met een kanaalverschil groter dan 48. Dit is LibreOffice-weergave, niet de
   weergave van de eigen editor.

De resultaten per bestand staan in `.local/matrix/documenten/rapport.json`;
die map wordt niet in Git opgenomen.

## Routes

| Route | Wat | Versie |
|---|---|---|
| docx-editor | `createYrsSession` → `openDocx` → `searchText`/`replaceRange` → `saveYrsDocx`. Dezelfde sessie-opslagkern (`writeSessionSave`) als de React-editor in de app gebruikt. | @betteroffice/docx 0.4.3, docx-react 0.4.3 |
| docx-model | `parseDocx` → tekst in het publieke documentmodel → `repackDocx` (route van `scripts/test-kantoor-engines.mjs`). | @betteroffice/docx 0.4.3 |
| libreoffice-suite | LibreOffice headless via UNO met een tijdelijk profiel en macro’s uit: laden, zoeken/vervangen, opslaan als DOCX, heropenen. | LibreOffice 24.2.7.2 |

Een tweede browserengine voor DOCX staat niet in `node_modules`. Er zijn geen
afhankelijkheden toegevoegd. De vergelijking «huidige engine tegen
alternatieve browserengine» is daarom **niet gemeten**. Gemeten zijn twee
API-routes van dezelfde engine en een volledige suite als referentie.

## Resultaten

Bronhashes (SHA-256): D1 `f8d4b7f3a7cd…`, D2 `5c68d65a4caf…`, D3 `664f8ccc77f4…`
(volledig in `bron/manifest.json`). DOCX-resulthashes verschillen per run,
omdat beide engineroutes `dcterms:modified` op het opslagmoment zetten.

| Geval | Route | Actie | Verdwenen | Toegevoegd | Gewijzigd | Verloren kenmerken | Tekst | Visueel (max.) |
|---|---|---|---:|---:|---|---|---|---|
| D1 | docx-editor | no-op | 0 | 0 | `core.xml` | — | gelijk | 0 % |
| D1 | docx-editor | bewerking | 0 | 0 | `core.xml`, `document.xml` | — | alleen bedoeld | 0,005 % |
| D1 | docx-model | no-op | 0 | 0 | `core.xml`, `document.xml`, `header1.xml`, `footer1.xml` | — | gelijk | 0 % |
| D1 | docx-model | bewerking | 0 | 0 | idem | — | alleen bedoeld | 0,005 % |
| D1 | libreoffice | no-op | 2 | 9 | 10 onderdelen | — | kop/voet hernoemd | 0 % |
| D1 | libreoffice | bewerking | 2 | 9 | 9 onderdelen | — | idem | 0,005 % |
| D2 | docx-editor | no-op | 0 | 0 | `core.xml` | — | gelijk | 0 % |
| D2 | docx-editor | bewerking | 0 | 0 | `core.xml`, `document.xml` | — | alleen bedoeld | 0,006 % |
| D2 | docx-model | no-op | 0 | 0 | `core.xml`, `document.xml` | — | gelijk | 0 % |
| D2 | docx-model | bewerking | 0 | 0 | idem | — | alleen bedoeld | 0,006 % |
| D2 | libreoffice | no-op | 1 | 3 | 8 onderdelen | — | gelijk | 2,47 % |
| D2 | libreoffice | bewerking | 1 | 3 | 7 onderdelen | — | alleen bedoeld | 2,47 % |
| D3 | docx-editor | no-op | 0 | 0 | `core.xml` | — | gelijk | 0 % |
| D3 | docx-editor | bewerking | 0 | 0 | `core.xml`, `document.xml` | — | alleen bedoeld | 0,005 % |
| D3 | docx-model | no-op | 0 | 0 | `core.xml`, `document.xml`, `footnotes.xml` | — | gelijk | 0 % |
| D3 | docx-model | bewerking | 0 | 0 | idem | — | alleen bedoeld | 0,005 % |
| D3 | libreoffice | no-op | 1 | 2 | 13 onderdelen | onbekend onderdeel (relatie en inhoudstype), onbekend element in de hoofdtekst | gelijk | 0 % |
| D3 | libreoffice | bewerking | 1 | 2 | 12 onderdelen | idem | alleen bedoeld | 0,005 % |

In alle 12 rondgangen van beide engineroutes is de bewerking na heropenen
aanwezig, is het oude fragment verdwenen en is geen andere alineatekst
gewijzigd. In geen enkel bestand ontbreekt een gemeten kenmerk. Daaronder
vallen header- en footerrelaties, het logo, het `PAGE`-veld, de liggende
sectie, één `w:ins` en één `w:del`, opmerkingen, voetnoten, custom XML, het
onbekende onderdeel met relatie en inhoudstype, en het onbekende element in
de bewerkte alinea.

### Wat er wel wijzigt

- **docx-editor**: bij een no-op verandert alleen `docProps/core.xml`
  (`dcterms:modified`). Bij een bewerking verandert verder alleen
  `word/document.xml`. De bewerkte run krijgt daarbij expliciet
  `w:rFonts Calibri` en `w:sz 22`; dat zijn dezelfde waarden als de
  documentstandaard. Er is dus een structureel XML-verschil zonder zichtbaar
  verschil.
- **docx-model**: herschrijft bij elke opslag ook ongewijzigde verhalen,
  zoals koptekst, voettekst en voetnoten. Het voegt daarbij
  naamruimtedeclaraties toe, een `w:lastRenderedPageBreak` en volledige
  `tblLook`-attributen. Het hernoemt ook `pic:cNvPr` naar de mediabestandsnaam,
  met een nieuw id. Inhoudelijk en visueel bleef alles gelijk. Deze route
  wordt in de app niet gebruikt voor opslaan.
- **libreoffice**: schrijft het hele pakket opnieuw. D1 krijgt nieuwe kop- en
  voettekstonderdelen (`header2/3`, `footer2/3`), het mediabestand wordt
  hernoemd en het gecachte veldresultaat in de voettekst wordt «2» in plaats
  van «1». D2 geeft visueel 0,6 % en 2,5 % pixelverschil op pagina 1 en 2;
  dat is niet verder geanalyseerd. D3 **verliest** het onbekende onderdeel,
  de relatie ernaartoe en het onbekende element in de hoofdtekst. Revisies,
  opmerkingen, voetnoten en custom XML blijven behouden.

## Bewaking in de app

`src/pakketcontrole.ts` herkent bij `controleerPakket` nu ook risicovolle
kenmerken (`risicos`): revisies, opmerkingen, voetnoten, kop-/voetteksten,
custom XML, onbekende onderdelen (relatietype of inhoudstype buiten
OOXML/Microsoft) en onbekende naamruimten in de hoofdtekst. Daarvoor worden
alleen `[Content_Types].xml`, de `.rels`-bestanden en `word/document.xml`
uitgepakt. De bestaande grenzen blijven gelden.

`risicoBeleid(risicos, soort, route)` legt vast wat de matrix als verlies
heeft aangetoond (`MATRIXVERLIES`):

- **Opslaan via de engine**: voor DOCX is geen verlies aangetoond, dus
  er wordt niets geblokkeerd. Vindt een latere engineproef wel verlies, dan
  wordt het kenmerk aan `MATRIXVERLIES.docx.engine` toegevoegd. Opslaan geeft
  dan «Opslaan geweigerd…» en het origineel blijft ongewijzigd.
- **Conversie via LibreOffice**: dit geldt voor Opslaan als ODT, DOC of RTF
  en voor het importeren van bijvoorbeeld `.docm` of `.dotx`. Bevat het
  bestand onbekende onderdelen of extensie-elementen, dan krijgt de melding
  een expliciete waarschuwing dat die verloren gaan en dat de kopie niet
  verliesvrij is. Bij PDF-, TXT-, CSV- en HTML-export verschijnt die
  waarschuwing niet.

`src/OfficeStudio.tsx` roept dit aan in `bewaarKopie` en in de importroute. De
matrixproef faalt als een gemeten verlies niet als bewaakt risico wordt
herkend. Hij faalt ook als de engineroute een blokkade zou geven terwijl de
matrix geen verlies toont. Nieuwe unit-tests staan in
`src/pakketcontrole.test.ts` en `tests/test_matrix.py`.

## Uitgevoerde controles

- `node scripts/test-matrix-documenten.mjs`: 30 rondgangen (18 DOCX, 12 PPTX), afgerond
  met exitcode 0.
- `pnpm exec tsc --noEmit`, `pnpm test` (149 Vitest-proeven, waarvan 7 nieuwe pakketcontroleproeven) en
  `python3 -m unittest discover -s tests` slagen (33 Python-proeven, waarvan 7 nieuwe matrixproeven).

## Grenzen

- Dit zijn synthetische, kleine fixtures. Ze vervangen het praktijkcorpus en
  de visuele acceptatieproef in de app niet.
- De Node-proef gebruikt `saveYrsDocx`, niet de React-editor zelf. De editor
  gebruikt dezelfde `writeSessionSave`-kern, maar zijn GUI-pad (typen,
  selectie, lay-out) is met deze bestanden niet bediend.
- De visuele vergelijking gebruikt LibreOffice als renderer.
- Een alternatieve browserengine voor DOCX is niet gemeten (zie Routes).
- De Y-app-opslagketen is niet beproefd.

## Status issue #2

| Criterium | Status |
|---|---|
| Editor lokaal openen, wijzigen, opslaan en heropenen | Deels: de engine-sessieroute is met D1–D3 aangetoond. De GUI is eerder met eigen documenten aangetoond ([21 okt](2026-10-21.md), [22 okt](2026-10-22-gui.md)), maar heropenen in de GUI met de matrixbestanden is niet uitgevoerd. |
| D1–D3 uitvoeren; pakket- en visuele verschillen vastleggen | Gehaald voor synthetische fixtures (pakket, kenmerken, tekst, LibreOffice-render). |
| Revisies, kop-/voetteksten en onbekende onderdelen behouden of de bewerking expliciet weigeren | Gehaald: de engine behoudt alles. Voor de conversieroute, waar wel verlies is aangetoond, waarschuwt de app expliciet. Bij engineverlies weigert de app opslaan. |
| Vastgezette versies, licenties en notices; Y-app-werking behouden | Deels: de versies staan exact vast (0.4.3). Apache-2.0-teksten worden in de build in `licenses/npm.txt` opgenomen; de pakketten leveren geen NOTICE-bestand mee. De Y-app-werking is niet getoetst. |
