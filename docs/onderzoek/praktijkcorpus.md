# Praktijkcorpus: selectie, registratie en uitvoering

Hoort bij #6 en de [testmatrix](testmatrix.md). Het openbare corpus (1.566 bestanden, zie het
[corpusverslag](../tests/2026-10-21-formaten.md)) toetst robuustheid. Het praktijkcorpus toetst
iets anders: negen echte werkbestanden uit de doelgroep, één per matrixregel, met een vaste
no-op- en bewerkingsroundtrip.

**Stand op 26 oktober 2026: er zijn nog geen praktijkbestanden aangeleverd.** Alle negen regels
staan op "niet aangeleverd". Er is dus nog geen praktijkresultaat.

## Selectie

Per matrixregel één bestand. Het bestand moet de genoemde kenmerken echt bevatten. Kies liefst
bestanden die in de praktijk vaak worden bewerkt, niet de mooiste. Een bestand zonder een van de
kenmerken telt niet voor die regel. Noteer dan welke kenmerken ontbreken.

| ID | Formaat | Moet bevatten | Bewerking in de proef | Typische bron |
|---|---|---|---|---|
| D1 | DOCX | Koppen, briefpapier, kop-/voettekst, paginanummers | Eén zin wijzigen | Brief of notitie op huisstijlsjabloon |
| D2 | DOCX | Tabellen, afbeeldingen, secties, liggende pagina | Eén tabelcel wijzigen | Rapport met bijlagen of een technische omschrijving |
| D3 | DOCX | Opmerkingen, revisies, voetnoten, onbekend XML-onderdeel | Eén los tekstfragment wijzigen | Contract- of bestekversie met wijzigingen bijhouden en een invoegtoepassing |
| R1 | XLSX | Meerdere bladen, kruisverwijzingen, formules, getalopmaak | Eén invoercel wijzigen | Begroting of hoeveelhedenstaat |
| R2 | XLSX | Grafiek, benoemd bereik, verborgen blad, afdrukinstellingen | Eén label wijzigen | Planning of rapportage met grafiek |
| R3 | XLSX | Validatie, conditionele opmaak, draaitabel, onbekend onderdeel | Eén cel buiten de draaitabel wijzigen | Registratie- of urenoverzicht |
| P1 | PPTX | Diamodel, thema, lettertypen, afbeeldingen | Eén titel wijzigen | Huisstijlpresentatie |
| P2 | PPTX | Grafiek, tabel, sprekersnotities | Eén tekstvak wijzigen | Projectpresentatie |
| P3 | PPTX | Animatie, overgang, ingebed object | Eén los tekstvak wijzigen | Presentatie met ingebedde spreadsheet of video |

Uitsluiten: wachtwoordbeveiligde of versleutelde bestanden, bestanden met macro's (DOCM/XLSM/PPTM
vallen buiten deze matrix), bestanden boven 20 MiB (grens van `vergelijk_pakketten.py`) en
bestanden waarvan de eigenaar geen schriftelijke toestemming geeft.

## Anonimisering

De aanleverende partij anonimiseert vóór overdracht, in de oorspronkelijke kantoorsoftware. Doe
dat zonder de structuur te verliezen: de kenmerken uit de tabel moeten blijven bestaan.

- Vervang namen van personen, organisaties, adressen, e-mailadressen, telefoonnummers,
  projectnummers en bedragen door neutrale tekst van ongeveer dezelfde lengte.
- Vervang foto's en logo's door een effen afbeelding met dezelfde afmetingen en hetzelfde formaat.
- Verwijder of anonimiseer auteurs in revisies en opmerkingen. Laat de revisies en opmerkingen zelf staan.
- Wis documenteigenschappen (`docProps/core.xml`, `docProps/app.xml`: auteur, bedrijf, laatst gewijzigd door).
- Controleer verborgen bladen, sprekersnotities, kop-/voetteksten, benoemde bereiken en ingebedde
  objecten. Daar blijft vaak informatie achter.
- Externe koppelingen naar netwerkschijven of SharePoint vervangen door een neutraal pad.

De ontvanger controleert steekproefsgewijs op restgegevens. Twijfel betekent: niet gebruiken.

## Opslag

- Bestanden staan alleen in `.local/corpus/praktijk/` (`.local/` is genegeerd door Git) en heten
  precies `<ID>.<formaat>`: `D1.docx`, `R2.xlsx`, `P3.pptx` enzovoort.
- Geen kopie in issues, pull requests, chat, CI-artefacten of screenshots in de repository.
- Rapporten bevatten alleen hashes, onderdeelnamen, sleutels als `blad1!B7` of `word/document.xml#p3`
  en tellingen, nooit documenttekst. Ontbrekende teksten worden alleen als korte SHA-256-hash genoemd.
- Na afloop van het onderzoek verwijderen, tenzij de toestemming langer bewaren toelaat.

## Registratieformulier

Eén record per bestand in `.local/corpus/praktijk/register.json`. Zonder `toestemming: true` en
`geanonimiseerd: true` blokkeert het script het bestand.

```json
{
  "bestanden": [
    {
      "id": "D1",
      "bron": "organisatie of rol van de aanleveraar (geen persoonsnaam)",
      "toestemming": true,
      "toestemmingVastgelegd": "kenmerk van de schriftelijke toestemming",
      "geanonimiseerd": true,
      "geanonimiseerdDoor": "rol",
      "datum": "2026-11-02",
      "oorspronkelijkeSoftware": "programma en versie waarmee het bestand is gemaakt",
      "kenmerken": ["koppen", "briefpapier", "kop-/voettekst", "paginanummers"],
      "ontbrekendeKenmerken": [],
      "opmerkingen": ""
    }
  ]
}
```

Bewaar daarnaast buiten de repository de ondertekende toestemming. Het register zelf blijft ook
in `.local/`.

## Uitvoering

```bash
node scripts/praktijkcorpus.mjs           # alle negen regels
node scripts/praktijkcorpus.mjs --proef   # pijplijnproef met docs/voorbeelden (geen praktijkcorpus)
```

Per aanwezig en geregistreerd bestand:

1. SHA-256 van de bron.
2. In een eigen proces (maximaal 2 GiB heap, 120 s) met de echte engines van de app:
   openen → bewaren zonder wijziging (no-op), en openen → beperkte bewerking → bewaren → heropenen.
   De bewerking is nu automatisch: DOCX: markering `OpenAEC-proef` achter de eerste niet-lege
   tekstknoop; XLSX: eerste constante getalcel op blad 1 plus 1 (anders markering in de eerste
   tekstcel); PPTX: markering vooraan in het eerste tekstvak. Dat is een benadering van de
   bewerking in de matrix: D2 (tabelcel), R2 (label) en R3 (cel buiten de draaitabel) vragen nog
   een handmatige of per bestand ingestelde doelcel.
3. SHA-256 van beide resultaten.
4. Pakketcontrole met `scripts/vergelijk_pakketten.py` voor no-op en bewerking (de bewerking met
   het verwachte onderdeel als `--verwacht-gewijzigd`).
5. Onafhankelijke inhoudscontrole: een eigen extractie (alleen ZIP + XML, geen engine-code) van
   alinea's (DOCX), diateksten en notities (PPTX) en celwaarden en formules (XLSX). Vergeleken
   wordt per eenheid: gewijzigd, verdwenen, nieuw. Herberekende formulewaarden worden apart geteld.
   Na de bewerking hoort precies één eenheid gewijzigd te zijn: de bewerkte.
6. Resultaat in `.local/corpus/praktijk/resultaten/<datum>/rapport.json` en als tabel op de console.

Status "inhoud behouden; visuele controle nog nodig" betekent alleen dat de tekst- en
celcontrole geen verschil vond. Opmaak, lay-out, grafieken, animaties, revisies en ingebedde
objecten worden hiermee niet gecontroleerd. De visuele vergelijking (bron en resultaat naast
elkaar, per pagina/dia/blad) en de functionele controle van animaties, notities en formules
blijven handwerk en worden per bestand in het rapport aangevuld.

## Uitkomst 26 oktober 2026

`node scripts/praktijkcorpus.mjs` meldt voor D1–D3, R1–R3 en P1–P3: **niet aangeleverd**.

De pijplijnproef met de drie eigen voorbeelden staat in het
[bundelverslag](../tests/2026-10-26-bundel.md#praktijkcorpus). Dat zijn geen praktijkbestanden en
zij tellen niet voor het criterium.
