# Visuele richting en opdrachten

## Referenties bekeken op 21 oktober 2026

Bekeken zijn een opensource DOCX-editor met gedeelde opdrachten voor lint, toetsenbord en automatisering, en de actuele start- en lintvensters van gangbare kantoorsuites. Daaruit is de hiërarchie van titelbalk met bestandsnaam, tabbladen, opdrachtgroepen, stijlen, documentnavigatie en werkruimte overgenomen, en het idee dat een bekende tabindeling naast compactere varianten kan bestaan. Code of beelden zijn niet overgenomen, en ondersteuningsclaims van andere projecten bewijzen geen compatibiliteit van onze suite.

## Uitwerking

Een lichte titelbalk en rustige werkruimte geven het document voorrang. Het witte lint heeft afgeronde hoeken, duidelijke groepen en amberkleurige actieve opdrachten. Tekst, Rekenblad en Presentatie delen deze bediening. Contextuele tabel- en afbeeldingsopdrachten in Tekst verschijnen bij een relevante selectie. Het bestandsmenu houdt de bestaande editor gemonteerd en schakelt bewerking tijdelijk uit.

Knoppen gebruiken de publieke opdracht-API’s van de geïnstalleerde engines. Beschikbaarheid, selectiewaarden, actieve opmaak en foutmeldingen komen uit die API’s. Er is geen onbeveiligde HTTP- of externe automatiserings-API toegevoegd. De bestaande lokale opslagopdrachten blijven via Tauri lopen.

Rekenblad toont rij- en kolomnamen via een overlay die de werkelijke afmetingen, verborgen indices, vastgezette rijen, zoom en scrollpositie uit de rekenkern volgt. De koppen zijn op dit moment labels; selectie en verslepen van volledige rijen of kolommen via die koppen moeten nog worden gebouwd.

## Controle

Werkelijke exports zijn onafhankelijk gelezen: Tekstkleur, tekengrootte en tabelafmetingen; rekenbladformule, resultaat en opmaak; Presentatie-vormkleur, contour, lijndikte, notities en dia-aantal. De [screenshotgalerij](../screenshots/README.md) gebruikt de echte productie-interface met eigen voorbeeldbestanden. Het [testverslag](../tests/2026-10-21.md) begrenst wat al is bewezen en welke releasecontroles nog openstaan.
