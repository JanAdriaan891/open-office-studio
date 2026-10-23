# Open Notities Studio

Notities is een ingebouwde module van Office Studio. Open deze vanuit Start. De module heeft notitieboeken, secties en pagina’s; de drie kolommen volgen die indeling. De bediening en het compacte lint gebruiken dezelfde OpenAEC-stijl als de andere modules.

## Schrijven en organiseren

- Maak een notitieboek of sectie met de knoppen in het lint. Geef de naam op in het venster. Het potlood bij een bestaand notitieboek of een sectie wijzigt de naam.
- Maak pagina’s, wijzig hun titel en schrijf in tekstblokken. Enter begint een nieuw blok, Shift+Enter een regel binnen hetzelfde blok. Backspace in een leeg blok verwijdert dat blok; er blijft altijd één blok over.
- Kies een blok en gebruik Tekst, Kop, Vet of Cursief. De opmaak geldt voor het hele blok. Taak en Opsomming voegen een nieuw blok toe. Taken kunnen worden afgevinkt; Datum voegt de huidige datum toe.
- Zoeken doorloopt titels en tekst in alle notitieboeken en secties. Alle zoekwoorden moeten aanwezig zijn. Ctrl+Shift+F opent het zoekveld. Vastgezette pagina’s staan bovenaan.
- Prullenbak verplaatst een pagina naar de herstelbare prullenbak. Herstellen brengt deze terug. Er is geen opdracht om notities permanent te wissen.

## Bewaren en meenemen

Wijzigingen worden na 350 milliseconden automatisch in het lokale toepassingsprofiel bewaard. Ctrl+S schrijft direct. Bij een modulewissel worden nog wachtende wijzigingen eerst opgeslagen. De status onderaan bevestigt het resultaat; een opslagfout laat de huidige invoer staan en activeert de sluitbeveiliging.

In de browser is deze opslag gekoppeld aan het gebruikte adres en de poort. De desktopapp heeft een eigen profiel. Dit is geen cloudopslag of synchronisatie tussen computers. Een browserprofiel, applicatieprofiel of browsergegevens wissen kan deze lokale gegevens verwijderen. Maak daarom een back-up via **Bewaren → Back-up opslaan**. De desktop gebruikt een native bestandsdialoog en een atomaire schrijfactie; de browser vraagt een download aan.

Een `.openaec-notities`-back-up bevat alle notitieboeken en pagina’s, inclusief taken, opmaak en prullenbak. **Back-up toevoegen** of Ctrl+O leest dit bestand en voegt de notitieboeken toe. Bestaande gegevens worden behouden. Nieuwe identificaties en zo nodig een volgnummer bij de boeknaam voorkomen botsingen. Ongeldige, te grote en onbekende versies worden geweigerd. Het maximum is 10 MB per back-up, 100 notitieboeken, 5.000 pagina’s en 30.000 tekstblokken in totaal. De ruimte van het lokale profiel kan eerder vol raken; dan blijft exporteren beschikbaar.

Twee vensters mogen elkaars wijzigingen niet stilzwijgend overschrijven. Een schone werkruimte neemt een externe wijziging over. Bij eigen nog niet opgeslagen invoer wordt schrijven geblokkeerd en blijft die invoer staan; maak daarvan een back-up voordat je de lokale versie opnieuw opent. Onleesbare bestaande gegevens worden niet automatisch vervangen door een leeg notitieboek.

**Pagina als Markdown** bewaart de huidige titel, tekst, koppen, opmaak en takenlijst. De volledige notitieboekstructuur blijft alleen in het eigen back-upformaat behouden.

## Grenzen

Deze eerste notitiemodule gebruikt tekstblokken. Vrij geplaatste tekstvakken, tekeningen, handschrift, OCR, afbeeldingen, bijlagen, tabellen, samenwerking, cloudsynchronisatie en andere notitieformaten worden nog niet ondersteund. Vet en cursief gelden per blok; geen opmaak van losse woorden. Invoer is tekst en wordt nooit als HTML uitgevoerd.
