# Documenten: bestaande DOCX-editor losmaken en bestandsbehoud toetsen

Onderdeel van #1. Zie `docs/onderzoek/README.md` voor de routekeuze.

Maak de bestaande DOCX-adapter uit de Y-app herbruikbaar in Open Office Studio. Vergelijk de huidige engine met de alternatieve browserengine op dezelfde bestanden.

## Acceptatiecriteria

- [ ] Editor lokaal openen, wijzigen, opslaan en heropenen. *(Engine-sessieroute aangetoond met D1–D3; GUI-heropenen met de matrixbestanden nog niet uitgevoerd.)*
- [x] Gevallen D1–D3 uit docs/onderzoek/testmatrix.md uitvoeren; pakket- en visuele verschillen vastleggen. *(Synthetische fixtures; zie [verslag](../tests/2026-10-26-documenten.md).)*
- [x] Revisies, kop-/voetteksten en onbekende onderdelen behouden of de bewerking expliciet weigeren. *(Engine behoudt alles; conversieroute waarschuwt expliciet; engineverlies blokkeert opslaan via `src/pakketcontrole.ts`.)*
- [ ] Vastgezette versies, licenties en notices opnemen; oorspronkelijke Y-app-werking behouden. *(Versies en licentieteksten aanwezig; Y-app-werking niet getoetst.)*

De vergelijking met een alternatieve browserengine is niet gemeten: er is geen tweede DOCX-browserengine geïnstalleerd. Wel vergeleken: twee API-routes van de huidige engine en LibreOffice als volledige suite.
