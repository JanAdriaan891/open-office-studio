# Open Office Studio

Open-source kantoortoepassingen van het OpenAEC-ecosysteem voor tekstverwerking, rekenbladen en presentaties.

## Modules

- **Documenten** — teksten schrijven, opmaken en opslaan.
- **Rekenbladen** — tabellen, formules en grafieken maken.
- **Presentaties** — dia’s maken, vormgeven en presenteren.

## Status

De repository bevat de projectindeling, een [onderzoek naar de browserroute](docs/onderzoek/README.md) en een controleprogramma voor bestandsbehoud. De toepassingen zijn hier nog niet geïmplementeerd. Bestaande editors in de Y-app vormen het startpunt.

## Opbouw

- `packages/documenten` — tekstverwerking.
- `packages/rekenbladen` — tabellen en formules.
- `packages/presentaties` — dia’s en presentatieweergave.

## Eerste ontwikkelstappen

1. Een gedeelde werkruimte met een modulekiezer maken.
2. Per module een eenvoudige editor en lokaal opslaan toevoegen.
3. Import en export van gangbare documentformaten uitwerken.

## Onderzoek

- [Uitgebreide inventarisatie](docs/onderzoek/landschap.md)
- [Routekeuze en licentieafweging](docs/onderzoek/README.md)
- [Versies en omvanggegevens](docs/onderzoek/metingen.md)
- [Bestaande Y-app-integratie](docs/onderzoek/integratie.md)

## Controles

Python 3.10 of nieuwer, zonder aanvullende pakketten:

```bash
python3 -m unittest discover -s tests -v
```

Zie de [testmatrix](docs/onderzoek/testmatrix.md) voor het vergelijken van DOCX-, XLSX- en PPTX-pakketten.
