# Pakketcontrole en conversieherstel — 0.4.2

## Herstel

De conversiefunctie negeerde de procescode zodra het hulpprogramma was beëindigd. Een eventueel achtergebleven uitvoerbestand kon daardoor na een mislukte procesafloop alsnog worden aangeboden. Vanaf 0.4.2 wordt alleen een succesvol beëindigd proces aanvaard, gevolgd door de bestaande controles op uitvoerbestand en omvang. Bij een fout of tijdslimiet blijft het origineel behouden.

Drie nieuwe Rust-proeven starten echte kindprocessen: succesvol beëindigen, een foutcode teruggeven en de tijdslimiet overschrijden. Het wachtende proefproces wordt beëindigd; de proef wacht niet op de volledige dertig seconden slaaptijd.

## Lokaal uitgevoerd

- 23 Vitest-proeven en 11 Python-pakketproeven slagen.
- Tekst, Rekenblad en Presentatie bewaren wijzigingen na openen, wijzigen, bewaren en heropenen met de echte engines.
- Zes reguliere Rust-proeven slagen. De twee bestaande runtimeproeven blijven afzonderlijk gestart.
- De uitgebreide runtimeproef slaagt: vijftien conversies met ODF, oudere formaten en PDF, plus een Strict-XLSX-conversie. De gehele proef duurde hier 41,09 seconden.
- De onafhankelijke Python-controle bevestigt alineatekst en tabelaantallen, ingevulde cellen, formules, totaal 3068, dia-aantallen, diatekst en leesbare tekst in drie PDF’s.
- De geconverteerde Strict-XLSX wordt door de echte rekenbladengine geopend, bewaard en heropend.
- TypeScript en de productiebuild slagen.

Dit is geen nieuwe volledige corpusmeting. De grotere corpusuitkomsten en bekende vertraging bij grote documenten staan in het [formaatverslag](2026-10-21-formaten.md).

## Installers controleren

`scripts/controleer-installers.py` controleert de werkelijk gebouwde bestanden, zonder de toepassing of installer te starten:

| Pakket | Controles |
|---|---|
| Windows NSIS | Archiefcontrole, volledig uitpakken, x64-programma, x64-WebView2-loader, ingebedde WebView2-bootstrapper |
| Linux DEB | Interne versie, pakketnaam, amd64, opgegeven GTK/WebKit-afhankelijkheden, uitpakken, ELF-architectuur, uitvoerrechten, gevonden bibliotheken, snelkoppeling en pictogram |
| Linux AppImage | Type 2, volledig uitpakken van SquashFS, uitvoerbare AppRun, ELF-architectuur, uitvoerrechten, gevonden bibliotheken, snelkoppeling en pictogram |

De controle produceert een JSON-rapport met pakketomvang, SHA-256 en uitgevoerde controles. De bouwstraat bewaart dit als afzonderlijk artefact bij iedere geslaagde Windows- en Linux-build. De macOS-build behoudt zijn bestaande bouwcontrole; deze nieuwe scriptcontrole is daarvoor niet aangesloten.

De controle is eerst uitgevoerd op de daadwerkelijk gepubliceerde 0.4.1-pakketten; alle drie slagen. Twee negatieve controles slagen eveneens: een 32-bits uitvoerbaar bestand wordt als x64-programma afgekeurd, en een hernoemd oud DEB-pakket wordt wegens de onjuiste interne versie afgekeurd.

## Grenzen

Uitpakken en afhankelijkheden controleren vervangt geen schone installatie, native bestandsdialoog of bediening op Windows/WebView2 en Linux/WebKit. De bibliotheekcontrole gebruikt de omgeving waarin zij draait. De conversieruntime wordt nog afzonderlijk geïnstalleerd. De pakketten zijn niet vertrouwd ondertekend. Bestaande browserproeven staan in het [browserverslag](2026-10-21-browser.md).
