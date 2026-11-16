# #363 — leesbare labels voor Writer-stijlbeheer

Afgestemd en expliciet overgedragen door de integratiechat na vrijgave door de Windows-chat. Alleen [#363](https://github.com/OpenAEC-Foundation/open-office-studio/issues/363); geen #362-layout, #361-focus of #359-rendererwerk. Deze levering blijft **apart voor de volgende intake**, zonder wijziging aan de huidige integratiekandidaat of `main`. Geen automatische hervatting of issue-sluiting.

Getest bronpunt **489c4e3ce10a51e14bfd5791860e5fe3e843a544**, branch `codex/writer-363-style-labels-2026-11-16`, basis **f1085923653bd6e59982807e16a09c5fa3e3d74e**. Productiefix **2e6446faaa1e077aa683d3e590dbec1fd5f6a8d4**; de twee volgende commits corrigeren uitsluitend testdriverselectoren. Alle definitieve lokale resultaten hieronder betreffen het vastgelegde 489-punt. Oud #358/G-bewijs wordt niet als #363-platformbewijs gebruikt.

## Wijziging

Eén productiecomponent verandert: `StijlBeheerGroep` in `src/tekst/stijlen/StijlGalerij.tsx`. De tien ontbrekende `styles.manage.*`-lookups — vijf zichtbare labels plus hints en fallbackbranches — verwijzen nu naar bestaande, passende vertalingen voor stijlvenster, nieuwe stijl, bijwerken, wijzigen en stijlset. De namen `Normal`/`Standaard` en eigen stijlnamen blijven geïnterpoleerd. De bestaande teksten zijn in alle negen aangeboden talen aanwezig; geen nieuwe localebestanden of vertalingen nodig.

Geen CSS, commandohandler, beschikbaarheidsvoorwaarde, documentmodel of opslagcode gewijzigd. De groepsnaam is leesbaar `Styles`/`Stijlen`; paneel, nieuwe stijl, wijzigen en stijlset hebben leesbare toegankelijke namen en tooltips. De bestaande fallback naar Engels blijft behouden.

## Uitgevoerde controles

- **Voor de fix:** de nieuwe echte React-renderproef faalt in alle negen aangeboden talen op zichtbare/ARIA-/tooltip-`styles.manage.*`-sleutels. Een alleen op JSON-pariteit gebaseerde vertaalcontrole was al groen en kon deze verkeerde verwijzingen niet vinden.
- **Na de fix, bron489:** 18 gerichte tests in drie bestanden geslaagd. De negen rendercases controleren elk een eigen huidige stijl (`Project Body`) én de toestand zonder huidige stijl, inclusief alle labels/attributen en de bestaande disabled-status. De overige negen tests dekken het bestaande stijlmodel en verhalen. TypeScript `--noEmit` geslaagd.
- Writer-i18ncontrole: **9 talen ×1 namespace,1669 bronsleutels**, nul fouten; dezelfde **23 bestaande waarschuwingen** over voorbereide, niet-aangeboden taalmapjes. Geen massale herinrichting of vertaalwijziging.
- Normale productiefrontend en standalone hosted-build geslaagd. De definitieve normale Vite-build en hosted-build zijn na het vastleggen van489 uitgevoerd; de daarvoor door `pnpm build` voorbereide font-/spellingassets zijn ongewijzigd hergebruikt. Hosted-pad-/bronnencontrole geslaagd.
- **Echte productie-UI, lokale Windows-host, Chromium151.0.7922.34:** zowel `/` als `/office/` geslaagd met English, Nederlands en de feitelijke Engelse fallback bij Lao. Zes route/taalcombinaties; per combinatie alle vijf knoppen met volledige toegankelijke naam en tooltip, correcte groepnaam en juiste `Normal`/`Standaard`-interpolatie. Geen interne sleutels of page-errors. De driver opent het document en het tabblad Stijlen, zonder editorbridge of documentbewerking. Browsers en previewservers sluiten via `finally`.
- Alle zes originele eind-PNG's zijn bekeken en ongewijzigd bij deze receipt bewaard. Leesbare labels bevestigd; beperkte breedte kan de bestaande ellipsis tonen, terwijl naam/tooltip volledig blijven. Dit is geen acceptatie van de afzonderlijke verticale layoutmelding #362. De blanco pagina is het onbewerkte lege ingebouwde sjabloon, geen #359-test.

De [JSON-receipt](2026-11-16-writer-363-style-labels.json) bewaart beide ongewijzigde UTF-8-browserrapporten, screenshotdigests, bron-/testdriveridentiteiten en digests van de testlogs. Voorbeeld: [normaal Engels](beelden/writer-363-2026-11-16/normal/en.png), [normaal Nederlands](beelden/writer-363-2026-11-16/normal/nl.png), [hosted Nederlands](beelden/writer-363-2026-11-16/hosted/nl.png).

## Platformgrenzen en veilige afronding

| Platform | Controle op exact489 | Resterend |
| --- | --- | --- |
| Windows / browser | TypeScript, gerichte React-tests, i18n, frontend/hosted-build, zes echte browsercases | Nieuwe native Windows-pakket-/bedieningscontrole niet uitgevoerd |
| Linux | Geen nieuwe hostcontrole | Build/pakket, relevante native en browsercontrole bij volgende intake |
| macOS | Geen nieuwe hostcontrole | Build/pakket, relevante native en browsercontrole bij volgende intake |

Er is vóór de afgesproken stop geen nieuwe lange CI-/platformmatrix of lokale native GUI/opnamesessie gestart. Er is geen PR geopend die automatisch een lange matrix zou starten. Branch, reproduceerbare testdriver en bewijs zijn gepusht voor latere beoordeling; dit is geen centrale integratievrijgave of volledige platformacceptatie. #363 blijft open. Eigen headless browsers/servers zijn gesloten; geen eigen Computer Use-/schermopnamesessie gestart. Geen main-merge of automatische woensdaghervatting.
