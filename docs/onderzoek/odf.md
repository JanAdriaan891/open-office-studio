# ODF: acceptatiecriteria en proeven per formaat

Hoort bij #6. Dit document legt vast wat voor ODT, ODS en ODP getoetst moet worden voordat de app
voor een van deze formaten iets meer mag zeggen dan "conversie mogelijk". Het claimt geen
ondersteuning.

## Wat de app nu doet

Zie [Bestandsformaten](../formaten.md). Kort:

- De editors werken alleen met DOCX, XLSX en PPTX. Er is geen ODF-parser of -schrijver in de app.
- **Openen** van ODT/OTT/FODT, ODS/OTS/FODS en ODP/OTP/FODP kan alleen in de desktopversie, via een
  afzonderlijk geïnstalleerd conversieprogramma (`OPENAEC_CONVERSIE_PROGRAMMA`). Dat maakt een
  bewerkbare OOXML-kopie. Het origineel blijft ongewijzigd. Opslaan gebeurt standaard als OOXML.
- **Opslaan als** ODT, ODS of ODP: de editor bewaart eerst OOXML, daarna zet hetzelfde programma
  dat om met zijn standaardexportfilter.
- De browserversie heeft geen ODF-route. Zonder conversieprogramma geeft de desktopversie een
  foutmelding.
- Bestaande proeven: de Rust-proeven `drie_odf_formaten_heen_en_terug` (lege sjablonen) en
  `voorbeelden_in_odf_oud_en_pdf` (eigen voorbeelden, met `scripts/test-formaatuitvoer.py`), plus
  twintig ODT/ODS/ODP-bestanden per formaat in de corpusconversie van 21 oktober. Die toetsen of
  conversie lukt en of tekst/cellen terugkomen, niet of het ODF-bestand behouden blijft.

Elk ODF-bestand gaat dus twee keer door een vreemd filter (ODF → OOXML → ODF). Alles wat het
OOXML-model van de engines niet kent, of wat het filter niet vertaalt, kan verloren gaan. Daarom
gelden hieronder strengere criteria dan voor OOXML.

## Wat ontbreekt

- Geen eigen ODF-corpus met kenmerken per formaat (alleen een steekproef van openbare bestanden).
- Geen onafhankelijke ODF-inhoudscontrole naast de conversie (behalve de eenvoudige extractie in
  `scripts/praktijkcorpus.mjs`: tekst uit `content.xml`, `office:value` en `table:formula`).
- Geen visuele vergelijking ODF-bron tegen ODF-resultaat.
- Geen melding in de app dat een ODF-bestand als kopie via OOXML wordt bewerkt en dat opslaan als
  ODF een tweede conversie is. (Wel: het origineel wordt niet overschreven.)
- Geen beleid voor ODF-specifieke onderdelen: wijzigingen bijhouden in ODT, ODS-formules in
  OpenFormula-syntaxis, ODP-animaties, ingebedde objecten (`Object 1/`), macro's (`Basic/`),
  handtekeningen (`META-INF/documentsignatures.xml`), versleuteling (`META-INF/manifest.xml`).
- Geen meting van ODF in de browser: daar bestaat de route niet.

## Acceptatiecriteria per formaat

Een formaat mag pas "ondersteund (via conversie)" heten als **alle** algemene criteria en de
formaatcriteria voor elk van de drie proefbestanden slagen. Tot dan blijft de formulering
"conversie geprobeerd" uit [formaten.md](../formaten.md).

Algemeen (ODT, ODS en ODP):

1. Openen in de desktopapp levert binnen 45 s een bewerkbare kopie of een duidelijke foutmelding.
   Nooit stil verlies, nooit overschrijven van het origineel.
2. Versleutelde, ondertekende of macrobevattende ODF wordt geweigerd of met waarschuwing geopend;
   macro's worden nooit uitgevoerd.
3. No-op-roundtrip (ODF → openen → opslaan als zelfde ODF-formaat): alle tekst uit `content.xml`
   blijft behouden (multiset-vergelijking; nul ontbrekend), `mimetype` klopt, en het pakket heeft
   geen verdwenen `styles.xml`, `meta.xml` of `settings.xml`.
4. Bewerkingsroundtrip: precies de bewerkte eenheid verschilt; de bewerking staat na heropenen in
   het ODF-resultaat.
5. Elk verdwenen ODF-onderdeel (`Pictures/`, `Object N/`, `Configurations2/`) staat in het rapport
   en is beoordeeld.
6. Visuele vergelijking bron/resultaat per pagina, blad of dia is uitgevoerd en vastgelegd.
7. De app meldt bij openen dat het om een omgezette kopie gaat.

| Formaat | Proefbestanden (kenmerken) | Extra criteria | Bewerking |
|---|---|---|---|
| ODT | O-T1: koppen, kop-/voettekst, paginanummers, inhoudsopgave. O-T2: tabellen, afbeeldingen, secties, liggende pagina. O-T3: wijzigingen bijhouden, opmerkingen, voetnoten. | Paginatelling gelijk (via PDF-export van bron en resultaat); stijlnamen van koppen behouden; wijzigingen bijhouden blijft als wijziging (niet geaccepteerd). | Eén zin wijzigen |
| ODS | O-S1: meerdere bladen, kruisverwijzingen, formules, getalopmaak. O-S2: diagram, benoemd bereik, verborgen blad, afdrukbereik. O-S3: validatie, voorwaardelijke opmaak, draaitabel (DataPilot). | Alle `table:formula` behouden en onafhankelijk nagerekend; alle `office:value` gelijk behalve afhankelijke cellen; aantal bladen en verborgen-status gelijk. | Eén invoercel wijzigen |
| ODP | O-P1: diamodel, thema, lettertypen, afbeeldingen. O-P2: diagram, tabel, notities. O-P3: animatie, overgang, ingebed object. | Aantal dia's gelijk; notities behouden; animaties en overgangen functioneel gecontroleerd (niet alleen aanwezig in XML). | Eén titel wijzigen |

## Proeven

| Proef | Wat | Middelen | Status 26-10-2026 |
|---|---|---|---|
| ODF-1 | OOXML-voorbeeld → ODF → OOXML, tekst/cellen/dia's onafhankelijk geteld; daarna engine openen/bewaren/heropenen en bewerkte kopie weer naar ODF | `node scripts/meet-bundel.mjs --server --geen-build` (eigen voorbeelden) | Uitgevoerd, zie hieronder |
| ODF-2 | Negen ODF-proefbestanden (O-T1…O-P3) uit de praktijk: no-op en bewerking zoals hierboven | `.local/corpus/odf/`; uitbreiding van `scripts/praktijkcorpus.mjs` met een ODF-invoerstap | Niet uitgevoerd: geen bestanden |
| ODF-3 | Visuele vergelijking ODF-bron vs. ODF-resultaat (PDF-export van beide, per pagina) | Conversieprogramma + Poppler | Niet uitgevoerd |
| ODF-4 | Weigering versleuteld/ondertekend/macro-ODF in de desktopapp | Desktopbuild + drie testbestanden | Niet uitgevoerd |
| ODF-5 | Openbare ODF-steekproef (60 bestanden) opnieuw met de tekstcontrole hierboven, in plaats van alleen "conversie lukt" | `scripts/corpus-converteer.mjs` + extractie | Niet uitgevoerd |

## Eerste proef (ODF-1), 26 oktober 2026

Resultaten staan in het [bundelverslag](../tests/2026-10-26-bundel.md#odf-proef). Kort: met
LibreOffice 24.2.7.2 bleven alle teksten en celwaarden (ODT 14/14, ODS 69/69 met 9/9 formules en
totaal 3068, ODP 27/27 en 3 dia's) heen en terug behouden. De engines openden, bewerkten en bewaarden
de geïmporteerde kopie, en de bewerking kwam in het nieuwe ODF-bestand terecht. Het pakket veranderde
wel sterk (ODP: 22 onderdelen verdwenen, 31 nieuw). Opmaak is niet vergeleken. Dit is een proef met drie eigen, eenvoudige voorbeelden die als OOXML zijn begonnen. Het zegt
niets over echte ODF-bestanden met ODF-specifieke kenmerken en telt niet als acceptatie van een
formaat.
