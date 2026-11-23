# Open Office Studio 2026.48.1 — concept, niet vrijgegeven

Dit is de actieve voorbereiding van maandag 23 november. Er is nog geen definitieve gezamenlijke pakketbron, tag of publicatie. De [centrale overdracht](current-handoff.json) bepaalt de actuele gereedheid; de vrijdagnotes en hun oude bronnen blijven historisch bewaard. Geen main-merge/push of publicatie zonder afzonderlijk akkoord.

## Opgenomen productwijzigingen

- EPUB openen (#356) behoudt in de afgedekte proef tekstvolgorde, lijsten, tabellen en afbeelding. Geen claim voor alle EPUB-varianten.
- Writer herstelt invoerfocus na een tabelkolomcommando, zodat direct Undo/Redo kan volgen (#361).
- Writer geeft gestapelde lintknoppen en de focusrand van ingeklapte groepen meer verticale ruimte (#362).
- Writer-stijlbeheer gebruikt leesbare vertaalde namen en hints en vult de huidige stijlnaam in (#363).
- De native Linux-zoek-/vervangvelden krijgen hun eigen Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y-invoergeschiedenis, met behoud van aparte documentgeschiedenis (#368).
- Bestaande toetsenbordnavigatie in het lint vraagt expliciet zichtbare focus na muisbediening (#369).
- De Windows-bouw gebruikt voor de runtime-uitpakroute een compatibele .NET-ZIP-aanroep wanneer Windows PowerShell 5.1 een Archive-module uit PowerShell 7 erft (#372). Dit herstelt de verklaarde bouwblokkade; het is geen signingcorrectie.

Eerder geaccepteerd integratiewerk, waaronder de private kantoorruntime, PR #349 en macOS Command+↑/↓ (#358), blijft behouden. Een afzonderlijke bewijsuitbreiding voor SYLK is geen ontbrekende productfix. Het macOS-bodyprobleem (#359) heeft op dit moment nog geen opgenomen productcorrectie en staat daarom niet in bovenstaande lijst als opgelost.

## Downloads en zelfstandige apps

De suite en zes zelfstandige producten krijgen ieder een eigen installer, executable, identiteit en profiel: Writer, Spreadsheet, Presentation, Email, Notition en Database. De bestaande architectuur ondersteunt Windows x64 EXE, macOS ARM64 DMG en Linux x64 DEB plus AppImage: samen zeven producten en 28 installers. De [app×platformtabel](standalone-downloads/standalone-download-coverage-2026-11-23.md) toont de bestaande openbare versie2026.46.2 en benoemt de nog ontbrekende definitieve links.

Nieuwe zelfstandige werking moet op de daadwerkelijke definitieve pakketten zonder suite-installatie, suiteprofiel of suitebestanden worden aangetoond. Alleen starten of een andere productnaam is onvoldoende. De proefgevallen omvatten relevante native open-/bewerk-/save-/volledig-afsluiten-/heropenenroutes met inhoudscontrole. E-mail gebruikt lokale synthetische data; live accounts, echte verzending en iedere conversievariant worden daarmee niet gecertificeerd.

Ingebouwde PDF-, VBA/SQL-, grafiek- en vormfuncties zijn geen aparte apps. Voor een geleverde Draw-app, Agenda-, Taken- of Contactpersonen-app is geen zelfstandige productdekking aangetoond.

## Bekende grens en nog open acceptatie

- #366, de gemelde achterblijvende paginateller, blijft uitdrukkelijk uitgesteld en ongefixt.
- De native macOS-document-/tabelbodyblokkade is nog open. Een diagnostisch pakket met uitgeschakelde workerpresentatie is een onderzoeksmiddel, geen vrijgegeven productfix.
- De Linux-correcties worden in het echte bron420-pakket getest. Gedeeltelijke successen, testdriverproblemen en niet-uitgevoerde cases blijven afzonderlijk zichtbaar; volledige lint-/invoer-/saveacceptatie is nog niet bereikt.
- De Windows-tussenbron `3a0decac3d45234d4b4d487e431b21cff961ccca`, tree `e46b8faed3ca6b468e71a4d0d77b6dc8ce259360`, is versie2026.48.1 met #372. Dit is geen definitieve gezamenlijke platformgoedkeuring.
- Definitieve drie-OS/browser-combinatie, native suite-/standaloneacceptatie, 28 pakketidentiteiten/hashes, 14 rapporten en toepasselijke signatures/notarisatie moeten nog op één vaste bron worden afgerond. Geldige oude resultaten behouden hun eigen bron en scope.
- Controle van openbare definitieve downloadbytes volgt pas na afzonderlijk toegestane upload; er worden nu geen nieuwe download-URLs als bestaand voorgesteld.

**Stabiele release gereed: NEE.** Deze concepttekst wordt pas definitief nadat de productcorrecties en vereiste controles werkelijk zijn afgerond en de concrete bron, pakketset en resterende beperkingen reviewbaar zijn.
