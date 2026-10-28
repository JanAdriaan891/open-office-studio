# Validatie: praktijkcorpus, bundelmetingen en ODF-vervolg

Onderdeel van #1. Zie `docs/onderzoek/README.md` voor de routekeuze.

Maak de routekeuze toetsbaar met dezelfde praktijkgevallen en meetmethode voor elke kandidaat.

## Acceptatiecriteria

- [ ] Negen toegestane geanonimiseerde praktijkbestanden selecteren; geen gevoelige bestanden in Git.
  Selectieprocedure, anonimiseringsregels en registratieformulier staan in
  `docs/onderzoek/praktijkcorpus.md`. Er zijn nog geen bestanden aangeleverd (26-10-2026: alle negen "niet aangeleverd").
- [ ] No-op- en bewerkingsroundtrips uitvoeren met onafhankelijke inhoudscontrole naast scripts/vergelijk_pakketten.py.
  `scripts/praktijkcorpus.mjs` voert beide roundtrips uit, met hashregistratie, `vergelijk_pakketten.py` en een
  eigen inhoudsextractie. Het script is alleen beproefd met de eigen voorbeelden (`--proef`), nog niet met praktijkbestanden.
  Visuele vergelijking ontbreekt.
- [ ] JS, CSS, WASM en fonts als productiebuild meten: ruwe/gzip/Brotli-bytes, laadtijd en geheugen.
  Bytes per bestand, categorie en route zijn gemeten, net als laadtijd en geheugen in headless Chrome 156 (koud/warm,
  3 rondes) op één laptop met achtergrondbelasting: `docs/tests/2026-10-26-bundel.md`. Nog open: andere browsers en
  webviews, een rustige machine, netwerkvertraging en de grote-bestandproef.
- [ ] Browserroute vergelijken met een servergebaseerde suite; onbekende resultaten als onbekend rapporteren.
  Vergeleken met headless LibreOffice-conversie als serverreferentie; onbekenden staan als onbekend in het verslag.
  Een servergebaseerde editorsuite (bytes naar de client, geheugen per gebruiker) is nog niet gemeten.
- [x] Voor ODT/ODS/ODP afzonderlijke criteria en proeven vastleggen; geen impliciete ondersteuning claimen.
  `docs/onderzoek/odf.md`, met de eerste proef ODF-1 (eigen voorbeelden). ODF-2 tot en met ODF-5 zijn nog niet uitgevoerd.
