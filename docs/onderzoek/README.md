# Browser-kantoorsuite: onderzoek en routekeuze

Onderzoeksdatum: 21 oktober 2026. Onderdeel van issue #1.

De volledige broninventarisatie, met de onderzochte projecten, versies, omvang en onderhoudssignalen,
wordt buiten deze repository bewaard. Dit document geeft de conclusies.

## Advies

Kies route C: hergebruik de bestaande browsereditors en opslagkoppeling van de
Y-app voor documenten en rekenbladen; onderzoek een aparte presentatie-editor.
Maak de gedeelde editorlaag onafhankelijk van de opslagadapter. De bestaande
Y-app biedt een concrete start, maar is geen bewijs dat willekeurige documenten
zonder verlies kunnen worden bewerkt. Vrijgave blijft afhankelijk van de
[bestandsproeven](testmatrix.md).

Dit is een bronnenonderzoek met controlehulpmiddel. Er zijn nog geen
praktijkbestanden aangeleverd. Issue #1 blijft daarom open.

## Bestaand werk dat kan worden hergebruikt

De [installatiebranch van de Y-app](https://github.com/OpenAEC-Foundation/Y-app-ERPNext/tree/340c8f84b567d517b4d832a8501ce3d17255a6ce)
bevat al document- en rekenbladeditors. De
[ontwikkelbron](https://github.com/OpenAEC-Foundation/Y-app-ERPNext/tree/cc51488bed97d251cb5c98ff91d5a0d56a49fd0a/packages/frontend/src/components/office)
bevat adapters voor DOCX en XLSX.

De [opslag-API](https://github.com/OpenAEC-Foundation/Y-app-ERPNext/blob/340c8f84b567d517b4d832a8501ce3d17255a6ce/y_next/api/office.py)
controleert bestands- en ouderrechten, bewaart een nieuwe private kopie,
controleert de bronhash en registreert opslagoperaties. De bestaande API kent
DOCX/XLSX/XLSM; PPTX en generieke SuperCloud-opslag zijn daarmee niet bewezen.
Zie [integratie](integratie.md) voor het contract en de resterende proef.

## Soorten kandidaten

Onderzocht zijn opensource bouwstenen in vijf groepen. De omvang is gemeten als
uitgepakte npm-pakketomvang, zonder transitieve afhankelijkheden; dat is geen
download- of browserbundelmeting.

| Soort | Bevinding |
|---|---|
| Complete DOCX-browsereditors (Apache-2.0) | Openen en opslaan als DOCX in de browser. Behoud van onbekende onderdelen is een upstreamclaim die lokaal gemeten moet worden. |
| OOXML-kernen met React-editors (Rust/WASM, Apache-2.0) | XLSX-bewerking met herberekening en een PPTX-kandidaat. Samenwerking vraagt aanvullende infrastructuur. Dit zijn de pakketten die nu in `package.json` staan. |
| Losse teksteditorkernen, weergave- en conversiebibliotheken (MIT, BSD, Apache-2.0) | Bruikbaar als onderdeel, maar zonder paginamodel, behoudende DOCX-roundtrip of complete editor geen basis voor de verliesvrije eis. |
| Formaat- en generatiebibliotheken voor XLSX en PPTX (MIT, Apache-2.0) | Geschikt voor lezen, schrijven of nieuwe dia’s; geen algemene editor voor bestaande bestanden. Formule-opslag is geen bewijs van correcte herberekening. |
| Ingebedde suites en editors met documentserver (AGPL-3.0) | Brede formaatdekking, maar zwaardere beheer- en conversieroute, rebranding en aanvullende licentievoorwaarden. Niet voor de eerste route. |

Een recente push of release is geen garantie voor kwaliteit of ondersteuning.

## Routes vergelijken

| Route | Voordeel | Belangrijk nadeel | Besluit |
|---|---|---|---|
| A: één suite inbedden | Gemeenschappelijke editor en brede formaatdekking | Serverlast, licentievoorwaarden en beperkte vrijheid voor de eigen interface | Reservescenario als bestandsproeven de browserroute uitsluiten |
| B: alle editors zelf samenstellen | Volledige regie over bediening en opslag | Paginalay-out, formules, dia-opmaak en onbekende XML behouden worden eigen onderhoud | Niet kiezen als eerste route |
| C: per module hergebruik | Sluit aan bij bestaande Y-app; onderdelen afzonderlijk testen/vervangen | Verschillende engines en releasecycli vragen een gedeeld contract | Voorkeursroute onder voorbehoud van proeven |

Documenten: eerst de bestaande adapter losmaakbaar maken en drie DOCX-proeven.
Rekenbladen: dezelfde aanpak met formulecontrole, zonder cached waarden als
bewijs van correcte herberekening te gebruiken. Presentaties: eerst de PPTX-kern
op masters, notities en onbekende onderdelen beproeven; pas daarna de editor
integreren. Een generatiebibliotheek alleen voldoet niet voor bestaande PPTX.
ODT/ODS/ODP zijn een afzonderlijke vervolgfase: geen van de gekozen adapters is
hier als ODF-route gevalideerd. Tot die tijd expliciet niet ondersteund tonen.

## Licenties en distributie

MIT en Apache-2.0 zijn bruikbare uitgangspunten voor een eigen opensourcerelease;
bewaar licentieteksten, auteursvermeldingen en toepasselijke NOTICE-bestanden.
Een npm-licentieveld is geen volledige audit van WASM, fonts of transitieve code.
Controleer de daadwerkelijk gebundelde bestanden van de vastgezette versies.

Bij een gewijzigde AGPL-netwerktoepassing verplicht artikel 13 tot een zichtbaar
bronaanbod voor de gebruikers die er via het netwerk mee werken. Distributie
van browsercode kan daarnaast eigen broncodeverplichtingen activeren. Of een
koppeling een gecombineerd werk vormt hangt af van de concrete integratie;
een apart proces maakt die beoordeling niet automatisch overbodig. Bron:
[officiële licentie](https://www.gnu.org/licenses/agpl-3.0.html).
Voor deze eerste route worden geen AGPL-componenten toegevoegd.

Het [stijlboek](https://github.com/OpenAEC-Foundation/OpenAEC-style-book) vermeldt
CC-BY-SA-4.0 op repositoryniveau. Verifieer de voorwaarden per token-/UI-pakket
voordat deze worden gekopieerd; neem niet zonder controle een MIT-licentie aan.
Gebruik eigen productnamen en vormgeving; licenties op code geven niet vanzelf
rechten op merken. Dit rapport selecteert nog geen projectlicentie.

## Bundelmeting en vrijgave

Voor elke kandidaat een productiebuild met vast lockfile maken. Meet de eerste
routebelasting en het openen van iedere editor afzonderlijk: JS, CSS, WASM en
fonts, zowel ruwe bytes als gzip/Brotli. Registreer browser, hardware, koude en
warme laadtijd, piekgeheugen en grote-bestandproef. Geen CDN in de runtime.
Een losse pakketomvang of serverimage is geen vergelijkbare browsermeting.

Nog vereist voor afronding van #1: gemeten browserbundels, praktijkcorpus,
uitgevoerde roundtrips, een lokale editorproef en de live Y-app-opslagketen.
De vervolgissues leggen deze acceptatiecriteria per module vast.
