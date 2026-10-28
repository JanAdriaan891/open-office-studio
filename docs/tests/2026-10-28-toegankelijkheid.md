# Toegankelijkheid van lint, dialogen en documentvlak (#24)

28 oktober 2026, branch `pakket-b`. Dit verslag beschrijft wat automatisch is getest, wat in de browser is nagelopen en hoe de handmatige schermlezerproef verloopt. De proef met NVDA en VoiceOver is **nog niet uitgevoerd**: op deze Linux-machine draait geen van beide. Vul de tabel onderaan in zodra iemand de proef doet.

## Wat er is gebouwd

- **Lint** (`src/openaec-lint`): een tablist met roving tabindex, met daaronder een `tabpanel` waarin een `toolbar` met de naam van de tab staat. Groepen hebben `role="group"` en een naam. Een ingeklapte groep is een knop met `aria-expanded` en `aria-controls`. De scrollknoppen zijn verborgen voor schermlezers, want toetsenbordgebruikers scrollen door de focus te verplaatsen.
- **Toetsenbord**: met Alt of F10 verschijnen toetstips en gaat de focus naar de actieve linttab. De pijltjes lopen door tabs en knoppen. Pijl-omlaag of Enter opent een ingeklapte groep. Esc gaat een niveau terug, tot de focus weer in het document staat. Ctrl+F1 verbergt het lint. F6 en Shift+F6 springen tussen kopbalk, tabbladen, lint, document en statusbalk (`src/werkruimte/regios.ts`).
- **Dialogen** (`src/werkruimte/Dialoog.tsx`): `role="dialog"` met `aria-modal` en een titel als naam. De focus gaat bij openen naar binnen en blijft daar bij Tab. Esc sluit het venster. Daarna keert de focus terug naar het element waar hij vandaan kwam, en zolang het venster open is, is de rest van de pagina `inert`. VerlaatDialoog en Opslaan als hadden al een eigen focusval en focusherstel.
- **Meldingen**: meldingen hadden al `role="status"`. De statusbalk krijgt in #28 een beleefde live-regio voor de documentstatus. Getallen die bij elke selectie veranderen, zoals de som, zitten daar bewust niet in.
- **Teksten voor schermlezers**: de engine-sleutels `a11y.*` en `*AriaLabel` zijn vertaald in `src/nederlands-toegankelijk.ts`. Een schermlezer leest de actieve cel nu voor als "B3, 42, geselecteerd" en het diavlak als "Dia 2 van 5".
- **Contrast**: op het lichte lint haalde secundaire tekst (groepsnamen) 4,1:1. Dat is gecorrigeerd naar ≥ 4,5:1. De amberkleurige focusrand haalde op donker grijs geen 3:1 en is in het Forge-thema goud geworden. `prefers-contrast: more`, `forced-colors: active` en `prefers-reduced-motion` worden gevolgd (`src/werkruimte/toegankelijkheid.css`).

## Automatische tests

| Test | Wat |
| --- | --- |
| `src/openaec-lint/Lint.test.tsx` | Rollen, namen en koppelingen van tablist, tab, tabpanel, toolbar en groepen; verborgen decoratie |
| `src/openaec-lint/focus.test.ts` | Pijltjes, Home en End in het lint |
| `src/openaec-lint/toetstips.test.ts` | Unieke, prefixvrije toetstips |
| `src/werkruimte/werkruimte.test.ts` | Focusval in dialogen, F6-volgorde, toetsen voor overzicht en instellingen |
| `src/werkruimte/contrast.test.ts` | Contrast van tekst (4,5:1) en focusranden (3:1) in beide thema's |
| `src/nederlands-toegankelijk.test.ts` | Geen Engelse a11y- of aria-teksten meer in Tekst, Rekenblad en Presentatie |

## In de browser nagelopen (Chromium, 800 en 600 px, licht en Forge)

- Toegankelijkheidsboom (DevTools en `read_page`): elke lintknop, keuzelijst en tab heeft een Nederlandse naam. De ingeklapte groepen verschijnen als knop met hun groepsnaam.
- Alleen met het toetsenbord: F10, letter van de tab, letter van de groep en letter van de knop. Esc, Esc, Esc brengt de focus terug in het rekenbladraster. F6 doorloopt document → kopbalk → tabbladen → lint → document. Het venster Sneltoetsen (F1) houdt de focus vast en geeft hem bij Esc terug aan het raster.

## Handmatige schermlezerproef (uit te voeren)

Voer de proef uit met NVDA 2024+ en Firefox of Edge op Windows, met de desktopapp (WebView2), en met VoiceOver op macOS (WKWebView). Begin elke keer met een nieuw leeg document.

1. **Lint**: druk op F10. Je hoort "Lint, tabblad Start, geselecteerd, 1 van N". Druk op pijl-rechts: "Invoegen, tabblad, 2 van N". Druk op pijl-omlaag: de eerste knop van de werkbalk wordt voorgelezen, met de naam van de werkbalk.
2. **Ingeklapte groep**: maak het venster 600 px breed, ga naar een ingeklapte groep en druk op Enter. Je hoort "uitgevouwen" en de eerste knop in het paneel. Esc meldt weer "samengevouwen" op de groepsknop.
3. **Toetstips**: druk op Alt, daarna op een letter. De gekozen tab of knop wordt voorgelezen.
4. **Rekenblad**: verplaats de selectie met de pijltjes. Je hoort "B3, leeg, geselecteerd", en na het typen van 42 en Enter "B3, 42".
5. **Presentatie**: wissel met Page Down van dia. Je hoort "Dia 2 van 3".
6. **Dialogen**: druk op F1. Je hoort "Sneltoetsen, dialoogvenster" en het zoekveld. Tab blijft in het venster en Esc zet je terug waar je was. Doe hetzelfde met Ctrl+, voor de instellingen en met Ctrl+W bij een gewijzigd document.
7. **Meldingen**: sla een document op. De melding wordt voorgelezen zonder dat de focus verspringt.
8. **Hoog contrast**: zet Windows op Contrastthema Woestijn. Focusrand, geselecteerde tab en ingedrukte knoppen blijven zichtbaar.
9. **Verminderde beweging**: schakel animaties uit in het besturingssysteem. Vensters en het scrollen van het lint bewegen dan niet meer.

| Stap | NVDA (Windows) | VoiceOver (macOS) | Opmerking |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | n.v.t. | | |
| 9 | | | |

## Bekende beperkingen

- De bladtabs in Rekenblad en het diapaneel komen uit de engines. Ze zijn met het toetsenbord bereikbaar, maar hun aankondigingen hangen af van de engineversie.
- In Tekst vervangen Ctrl+= en Ctrl+Shift+= (zoomen, #11) de engine-sneltoetsen voor subscript en superscript. Gebruik voor die twee Ctrl+Shift+B en Ctrl+Shift+P.
