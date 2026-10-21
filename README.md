# Open Office Studio

Open-source kantoortoepassingen van het OpenAEC-ecosysteem voor tekstverwerking, rekenbladen en presentaties.

## Modules

- **Open Writer Studio** — teksten schrijven, opmaken en opslaan.
- **Open Excel Calc Studio** — tabellen, formules en grafieken maken.
- **Open Presentatie Studio** — dia’s maken, vormgeven en presenteren.

- **Open Access Studio** — bestaande databases en VBA-bron verkennen.

## Status

Een lokale React-werkruimte met drie aangesloten kantoorengines en een Tauri-desktopbasis is beschikbaar. Nieuw, openen en opslaan als zijn aangesloten; voor Access is er alleen een voorbeeldopzet. De suite is nog een ontwikkelprototype. Zie het [testverslag](docs/tests/2026-10-21.md) voor bewezen functionaliteit en ontbrekende releasecontroles.

## Opbouw

- `packages/documenten` — tekstverwerking.
- `packages/rekenbladen` — tabellen en formules.
- `packages/presentaties` — dia’s en presentatieweergave.

## Eerste ontwikkelstappen

1. Nederlandse editorbediening en de functionele acceptatieproeven afronden.
2. Native opslag, herstel en installers op alle doelplatformen testen.
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

## Desktopontwikkeling

- [Functionele eisen en vergelijking met WordCraft en andere editors](docs/ontwerp/functionele-lat.md).
- `pnpm dev`: lokale kantooromgeving.
- `pnpm build`: TypeScript en productiebuild.
- `pnpm test`: adapter- en exportcontroles.

- `pnpm test:engines`: documenten wijzigen, opslaan en opnieuw openen met de echte engines.
- `pnpm desktop:dev`: Tauri-desktopomgeving.
- `pnpm desktop:build`: native pakket voor het huidige platform.
- [Testverslag en resterend werk](docs/tests/2026-10-21.md).
