# Niet-uitvoerend plan voor 60 bestaande releaseassets

**Uitsluitend reviewvoorbereiding. Geen werkende publisher, workflow, startmarker of toestemming.** `executionEnabled=false`, alle publicatie-/main-/tagapprovals zijn false of null. Een geslaagde offlinevalidator verandert dat niet.

[plan.json](plan.json) benoemt alle 60 namen, bytes, SHA256 en oorspronkelijke artifactmembers. De 28 installers komen uit de werkelijk geverifieerde Windows/Linuxproducer 45177730188/attempt1 en de afzonderlijke Macproducer 45195055147/attempt1. Applicatie blijft exact P5 `b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree `e30879fd772871e690847c061ef66e6b81808a05`, versie 2026.48.1; Macworkflowhead 2af blijft een afzonderlijke identiteit. De originele Macfailure in 45177730188 wordt behouden.

De 32 overige voorbereide assets komen uit originele proofartifact 14900089777 van verificatierun 45352330223: 14 rapporten, 14 Linux-signatures, 2 publieke-sleutelbestanden, SHA256SUMS en diens signature. Het ondertekende manifest heeft 58 regels omdat het zichzelf en zijn signature niet opsomt. De auditreceipt is bewijs en hoort bewust niet tot deze 60 releaseassets. Er zijn nog geen publieke URL's.

## Wat dit nu controleert

De offlinevalidator leest uitsluitend de al bewaarde 26.500-byte proofZIP en dit lokale plan/template/body. Hij controleert exacte 60 namen, unieke leden, 58 checksumregels, 28 bytes/member/producerbindings, de aparte Macbronwitness en disabled approvals. Zeven kleine positieve/negatieve controles beschermen tegen duplicaten/extra assets, gewijzigde digests/bytes/memberpaden, geleende Macrunidentiteit, verzonnen URL's/toestemming en verkeerd tagtarget/checksumscope. Geen netwerk, download, GPG, Gitwrite of externe actie is geïmplementeerd.

Vanaf deze map kunnen uitsluitend de twee read-only controles worden uitgevoerd:

```text
python -B validate_plan.py
python -B test_validate_plan.py
```

De werkelijke 15 public-only cryptografische verificaties en scoped sleutelcleanup gebeurden al in de bestaande verifier-CI; deze validator herhaalt die niet. Native werking, huidige remote artifactstatus, main-ancestry en publicatietoestemming worden evenmin bewezen.

## Latere concrete review- en akkoordvolgorde

1. Rond de open native acceptatie en expliciete beperkingen af. #366 blijft uitgesteld. Laat de gebruiker de exacte P5-bron, beide producerketens, dit bevroren 60-assetmanifest en de definitieve releasebody beoordelen. [release-body.review.md](release-body.review.md) is nu alleen een reproduceerbaar concept; geen stabiel-gereedclaim.
2. Vraag afzonderlijk concreet akkoord voor de bedoelde integratie/mainstappen, het gekozen al geteste tagtarget en de beoogde tag/draft/assets/publicatie. [approval.disabled.json](approval.disabled.json) is slechts een uitgeschakeld reviewtemplate en wordt door geen workflow geconsumeerd. Het invullen ervan voert niets uit en vervangt gebruikersakkoord niet.
3. Bewijs na de goedgekeurde mainintegratie dat het expliciet goedgekeurde al geteste tagtarget een ancestor van actuele main is. Voorgesteld is de daadwerkelijk gebouwde P5-commit; tag niet per ongeluk de Macworkflowhead 2af of een ongereviewde documentatiehead. Controleer bestaande tag/releasestatus en eventuele wijzigingen opnieuw zonder iets te overschrijven.
4. Review eerst een afzonderlijke, niet-herbouwende collector/uploaderimplementatie. Die moet de actuele bron/job/attempt/expiry/signaturegates en volledige oorspronkelijke archivehashes/memberbytes binden, exact 60 assets verzamelen en 58 checksums plus 15 signatures controleren. **Die implementatie bestaat niet in deze map.** Het bestaande release.yml-publicatiepad is ongeschikt: needs de eigen volledige bouwmatrix en download-artifact uit alleen dezelfde run kunnen de aparte Macrun niet lenen. Start daarom geen nieuwe algemene publiceren=true-build ter vervanging van de geteste bytes.
5. Pas met het concrete akkoord en gereviewde implementatie: maak de bedoelde draftrelease met het goedgekeurde tagtarget en upload uitsluitend deze 60 exact geverifieerde bestaande assets uit beide producerketens. Lees daarna alle 60 geüploade namen/bytes/hashes werkelijk terug, controleer signed checksums en bind de echte URL's. Publiceer pas na die verificatie en het afzonderlijke publicatieakkoord; controleer daarna de echte publieke staat.

Dit plan verlaagt voorbereidingswerk en maakt geen nieuwe appbuild nodig. Het bewijst niet dat uploaden/publiceren al werkt of dat de stabiele release gereed is. Root reviewt en commit de documentatie; geen main/tag/release/API-write is door deze voorbereiding uitgevoerd.
