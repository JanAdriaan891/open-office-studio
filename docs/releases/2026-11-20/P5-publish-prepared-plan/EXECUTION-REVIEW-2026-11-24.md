# Concreet uitvoeringsvoorstel — nog niet geautoriseerd

De afgesproken beperkte releasevoorbereiding van P5 is gereed. Dit voorstel voegt uitsluitend een apart gereviewde publicatieworkflow en verzamel-/uploadcode toe; het verandert de geteste applicatie of pakketbytes niet. Alle uitvoeringsrechten blijven uit. Er is nog geen mainmerge, tag, conceptrelease, upload of publicatie uitgevoerd.

De code- en API-eindreviews zijn afgerond zonder resterende materiële bevinding op de exacte bytes. [De gezamenlijke test-/reviewreceipt](final-review-receipt.json) bindt 21 gerichte publisher-tests, 8 manifestcontroles, 7 controles van de echte inline-workflowguards en de aanvullende backendmocks. Live GitHub/GPG-uitvoering blijft expliciet onbewezen en is niet tijdens voorbereiding uitgevoerd.

| Onderdeel | SHA256 |
| --- | --- |
| Finale plan | `da0851d59c65ff54c4ec09e5b1dda712a337c71525ee5e517da5ac39a26d16f8` |
| Finale releasebody | `d4045ac87d963a1e3adf9b7bd2817ee74a42c158847376f29fb808c23ec373b6` |
| Canonieke drie-bestanden-codebinding | `4b1f57af23ceedf7f61f5ae17b6c61d5c21991ed6184d106dc04a405e4de09cc` |
| Dedicated workflow | `f11e0daa4990d8e31b08367097188b3adc667906a3417544f18c5612677a6fef` |
| Onafhankelijke code/workflowreview | `aac961dc5118f40a7eccbb51af4d5e75cc495cc5aa0f3d4969b4f84ddaf93d37` |
| Onafhankelijke APIreview | `7c433c00617518fa9bade2dd94dbe228ff401034ac65a3d51ac84b1c340ae6e8` |

De finale Git-head/tree horen in het apart weergegeven akkoordvoorstel ná deze commit, zodat geen zelfreferentiële hash in het eigen commitbestand wordt verzonnen. De geplande merge-resultaat-tree moet exact die finale voorbereidings-tree zijn. Geen uitvoering zolang die finale pin en de gebruikersbeslissing ontbreken.

## Bron en expliciet restrisico

- Applicatie en beoogd tagdoel: `b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree `e30879fd772871e690847c061ef66e6b81808a05`, versie `2026.48.1`.
- Huidige mainbasis: `93fcc6194904f70fa12d0a3546c23dac9c673ee5`.
- Huidige integratiebasis: `771fd66e0e4bd612dba4f7b6e34b517f39d52e86`.
- De finale gereviewde voorbereidingshead en tree worden na de code-eindreview exact vastgelegd in het concrete akkoordvoorstel. Geen automatische vervanging door een latere HEAD.
- Eén eerdere geautomatiseerde Mac-Suite-saveactie bewaarde de zichtbare dirty wijziging niet. De oorzaak is onbekend; een incidenteel product-opslagprobleem is niet uitgesloten. Latere strikte save-/heropengevallen en zes gecontroleerde kopieën slagen. [De eindweging](../P5-native-completion-2026-11-24/save-gate-disposition.json) accepteert de afgesproken savecriteria zonder de oude FAIL als gerepareerd te labelen.

## Gevraagde samenvoegroute

1. Controleer beide actuele PR-heads/bases, de volledige diff en de overeengekomen tree. Stop bij extra wijzigingen, conflicten of gewijzigde basis. De [read-only routecontrole](../P5-native-completion-2026-11-24/README.md) en de uiteindelijke route-receipt behouden hun eigen bronpin.
2. Maak PR #367 gereed en voeg hem met een **mergecommit** samen naar `codex/integratie-2026-11-16`. Controleer werkelijke twee ouders en resultaat-tree. Geen squash, rebase, auto-merge of adminbypass.
3. Controleer vervolgens PR #353 met zijn werkelijke nieuwe integratiehead. Maak hem gereed en voeg hem met een **mergecommit** samen naar de ongewijzigde goedgekeurde mainbasis. Controleer ouders, tree en de bereikbaarheid van de oorspronkelijke P5-commit vanuit main. De uiteindelijke main-SHA mag alleen worden afgeleid uit deze vooraf goedgekeurde exacte ouders/tree; extra wijzigingen vereisen nieuwe review.
4. Controleer eventuele vereiste repositorychecks; `MERGEABLE/CLEAN` of lege headchecks zijn geen testbewijs. Bestaande exacte P5-app/platform/pakketresultaten blijven behouden; de nieuwe publicatiecode heeft gerichte eigen controles en onafhankelijke review nodig.

GitHub bewaakt bij PR-merge de verwachte head atomair, niet de verwachte basis. De stappen controleren de basis direct vooraf en ouders/tree achteraf. Uitvoering vraagt daarom één gecoördineerd moment zonder andere integratieschrijvers. Een afwijkende uitkomst stopt het publicatiepad; er volgt geen automatische rollback of forcepush.

## Tag, bestaande assets en publicatie

De nieuwe `.github/workflows/publish-prepared.yml` heeft alleen `workflow_dispatch`, standaard `stage=check` en `execute=false`. Alleen de expliciet gekozen uitvoeringsjob op main krijgt `contents: write`. De code controleert het echte run/attempt/workflow/ref/main-tree, exact goedgekeurde code-/body-/planhashes en toegestane stappen.

**Geen gewone lokale tagpush:** de oorspronkelijke `release.yml` bouwt bij `push.tags: v*` opnieuw. Tag `v2026.48.1` mag daarom uitsluitend via de aparte gereviewde Actions-job met rechtstreeks `${{ github.token }}` worden aangemaakt, exact op P5. GitHub documenteert dat door dit jobtoken veroorzaakte gewone push/release-events geen nieuwe workflowruns starten; dispatch-events vormen een uitzondering. Er wordt geen PAT ingevoerd, geen workflow globaal uitgezet en geen ongewenste herbouw achteraf geannuleerd. [Primaire GitHub-documentatie](https://docs.github.com/en/actions/concepts/security/github_token).

Het [finale manifest](plan.final-review.json) behoudt exact de bestaande 60 assets: 28 installers, 14 rapporten, 14 Linux-signatures, twee publieke-sleutelbestanden, `SHA256SUMS` en zijn signature. De 58 checksumregels sluiten de checksumfile en zijn eigen signature uit. Windows/Linux blijven op run45177730188/attempt1; Mac blijft op45195055147/attempt1 met de oorspronkelijke P5-bronwitness. Geen nieuwe appbuild, signingrun of sleutelmateriaal van een andere bron.

De uitvoeringsvolgorde is:

1. Lees actuele bevroren producer/job/attempt/artifactmetadata, gates en expiry. Controleer volledige oorspronkelijke archieven of reeds aanwezige volledig gehashte caches. Verzamel uitsluitend de exacte manifestleden; controleer veilige paden, dubbele namen, grootte, SHA256 en de originele Mac-bronwitness. Verwerk archieven opeenvolgend en bewaak werkelijke vrije schijfruimte.
2. Controleer alle 60 verzamelde bestanden, 58 checksumregels en 15 signatures met uitsluitend de publieke sleutel in een tijdelijke geïsoleerde GPG-home. Ruim die eigen sleutel-/agentresources aantoonbaar op. Importeer geen privésleutel en voer geen signing uit.
3. Bewijs P5-ancestry van de goedgekeurde main. Vereis afwezigheid van de bedoelde tag en elke gelijknamige release/draft. Maak de exacte P5-tag en daarna een lege draft met de [finale releasebody ter review](release-body.final-review.md). Upload alleen de 60 geverifieerde assets, zonder clobber of vervangen van bestaande assets.
4. Lees de werkelijke 60 upload-IDs/namen/bytes terug, download/hash de daadwerkelijke uploads en controleer opnieuw de checksumfile en 15 signatures. Controleer dat de release/assetset tijdens readback niet veranderde. Maak de bron/pakket/URL-binding zichtbaar in de state-receipt.
5. Publiceer alleen met expliciete toestemming voor die stap en na geslaagde readback. `draft` voert alleen tot en met readback uit; `release` voert de vooraf expliciet goedgekeurde gehele reeks uit. Een latere afzonderlijke `publish` vereist het exacte oorspronkelijke `state.json`, zijn goedgekeurde SHA en opnieuw gecontroleerde actuele assets/signatures. Controleer na publicatie de publieke releasestatus, tag en assetidentiteit.

Het bestand `state.json` legt elke stap vast en bevat geen token, private key of installer-cache. De workflow bewaart alleen dit statusbestand als artifact. Het disabled approvaltemplate is geen toestemming en geen actie. Een geschreven akkoord moet de daadwerkelijke finale bron-/code-/plan-/bodypins, het afgeleide goedgekeurde mainresultaat, het tagdoel en de afzonderlijk toegestane acties benoemen.

## Afbreken en grenzen van de verificatie

Bij een ontbrekende of afwijkende gate, onvoldoende ruimte, expired artifact, bestaande tag/release, hash/signaturefout, gewijzigde remote assetset of falende stap: stoppen, status bewaren, niets overschrijven of retargeten. Een gedeeltelijk aangemaakte tag/draft/upload wordt niet blind herhaald of automatisch verwijderd. De oorspronkelijke releases en pakketten blijven behouden. Eventueel intrekken van een nieuw gepubliceerde release of een gerichte revert vereist een afzonderlijk concrete beslissing; geen forcepush of tagverplaatsing.

Deze voorbereiding gebruikt lokale tests met opname van nepbackend-events en echte offline manifest-/broncontroles. Zij voert geen live collector, sleutelimport, tag/draft/upload/publicatie uit. Onafhankelijke code-review en gerichte tests maken de eerste uitvoering reviewbaar; zij worden niet gepresenteerd als reeds geslaagde echte publicatie. De werkelijke uitvoeringsduur hangt mede af van ongeveer 8,5 GB bestaande payloads en hun upload/readback. Er is geen onderbouwde publicatie-eindtijd voordat die overdrachten werkelijk lopen.

#366 blijft buiten deze release. Andere nieuwe formaatproeven, #382 en toekomstig causaal Mac-saveonderzoek veranderen dit P5-plan niet. De gebruiker kan het concrete voorstel goedkeuren, beperken tot merge/draft/readback, of uitvoering uitstellen; zonder specifiek akkoord blijft alles uit.
