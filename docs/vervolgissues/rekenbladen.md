# Rekenbladen: XLSX-adapter en onafhankelijke formulecontrole

Onderdeel van #1. Zie `docs/onderzoek/README.md` voor de routekeuze.

Maak de bestaande rekenbladadapter herbruikbaar en vergelijk de rekenkern met een permissief gelicentieerd alternatief uit het onderzoek.

## Acceptatiecriteria

- [x] Gevallen R1–R3 uitvoeren met onafhankelijke verwachte formule-uitkomsten. Uitgevoerd met synthetische fixtures; zie [het verslag van 26 oktober 2026](../tests/2026-10-26-rekenbladen.md). Praktijkbestanden en de visuele vergelijking staan nog open.
- [ ] Niet-ondersteunde functies, fouten en oude cachewaarden herkenbaar afhandelen. De engine handelt verouderde cache en onbekende functies stil af. De hulpmodule `src/rekenbladcontrole.ts` herkent dit en is getest, maar is nog niet in de editor gekoppeld.
- [x] Grafieken, verborgen bladen, afdrukinstellingen en onbekende onderdelen onderzoeken. Op pakket- en kenmerkniveau bleef alles behouden. Na een bewerking houden de grafiektekstcache en de draaitabel verouderde waarden.
- [ ] Nederlandse getallen en datums, toegankelijkheid en grote werkboeken beproeven. Het grote werkboek is gemeten. Nederlandse invoer wordt tekst en de weergave volgt de Engelse notatie; dit is niet opgelost. Toegankelijkheid is alleen met codelezing onderzocht, niet met een schermlezer.

## Open punten uit de proef van 26 oktober 2026

- `rekenbladMelding` na `onReady` van `XlsxEditor` tonen; de aanroep staat in het verslag.
- Nederlandse invoer (`1,5`, `26-10-2026`) vóór `editCell` omzetten of de engine een locale geven. Ook Nederlandse weergave van `#,##0.00`, procenten en ingebouwde datumnotatie 14.
- Upstream melden: `=ISOWEEKNUM()` laat de WASM-kern vastlopen en maakt het geopende werkboek onbruikbaar.
- `a11y`-teksten in `rekenbladNl` vertalen; met een schermlezer beproeven.
- De rekenkern vergelijken met een permissief alternatief (bijvoorbeeld IronCalc), op dezelfde fixtures en tegen de onafhankelijke evaluator. Dit is nog niet gemeten.
- Grote werkboeken in de browser meten. In Node duurde openen van 120.001 cellen 2,7–5,9 s.
