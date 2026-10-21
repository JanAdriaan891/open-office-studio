# Visuele richting en opdrachten

## Referenties bekeken op 21 oktober 2026

[WordCraft](https://github.com/storytold/wordcraft) is functioneel interessant door de gedeelde opdrachten voor lint, toetsenbord en automatisering. De [gepubliceerde editorafbeelding](https://raw.githubusercontent.com/storytold/wordcraft/main/docs/images/hero.png) toont een herkenbare opbouw met titelbalk, tabbladen, opdrachtgroepen, stijlen en documentnavigatie. De egui-interface kan niet rechtstreeks als React-component worden overgenomen. Ondersteuningsclaims van het project bewijzen geen compatibiliteit van onze suite.

[ONLYOFFICE 10](https://www.onlyoffice.com/blog/2026/10/onlyoffice-desktop-editors-10) is een actuele referentie voor een vereenvoudigd startvenster. De [interfacehandleiding](https://helpcenter.onlyoffice.com/docs/userguides/presentation_editor/ProgramInterface.aspx) beschrijft de hiërarchie van bestandsnaam, tabbladen en werkruimte. [LibreOffice Notebookbar](https://help.libreoffice.org/latest/en-US/text/shared/01/notebook_bar.html?DbPAR=SHARED) laat zien hoe een bekende tabindeling naast compactere varianten kan bestaan.

## Uitwerking

Een lichte titelbalk en rustige werkruimte geven het document voorrang. Het witte lint heeft afgeronde hoeken, duidelijke groepen en amberkleurige actieve opdrachten. Writer, Calc en Presentatie delen deze bediening. Contextuele tabel- en afbeeldingsopdrachten in Writer verschijnen bij een relevante selectie. Het bestandsmenu houdt de bestaande editor gemonteerd en schakelt bewerking tijdelijk uit.

Knoppen gebruiken de publieke opdracht-API’s van de geïnstalleerde engines. Beschikbaarheid, selectiewaarden, actieve opmaak en foutmeldingen komen uit die API’s. Er is geen onbeveiligde HTTP- of externe automatiserings-API toegevoegd. De bestaande lokale opslagopdrachten blijven via Tauri lopen.

Calc toont rij- en kolomnamen via een overlay die de werkelijke afmetingen, verborgen indices, vastgezette rijen, zoom en scrollpositie uit de rekenkern volgt. De koppen zijn op dit moment labels; selectie en verslepen van volledige rijen of kolommen via die koppen moeten nog worden gebouwd.

## Controle

Werkelijke exports zijn onafhankelijk gelezen: Writer-kleur, tekengrootte en tabelafmetingen; Calc-formule, resultaat en opmaak; Presentatie-vormkleur, contour, lijndikte, notities en dia-aantal. De [screenshotgalerij](../screenshots/README.md) gebruikt de echte productie-interface met eigen voorbeeldbestanden. Het [testverslag](../tests/2026-10-21.md) begrenst wat al is bewezen en welke releasecontroles nog openstaan.
