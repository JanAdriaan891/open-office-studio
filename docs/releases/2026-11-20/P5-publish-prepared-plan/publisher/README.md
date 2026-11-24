# Reviewvoorstel: collector/uploader zonder herbouw

**Niet live uitgevoerd en nergens geactiveerd.** De standaardopdracht `check` leest alleen al bewaarde lokale evidence en schrijft alleen JSON naar stdout. Zij maakt geen backend, directory, subprocess, GPG- of netwerkactie. [approval.example.disabled.json](approval.example.disabled.json) is expliciet uitgeschakeld; alle step permissions zijn false. Geen workflow, tag, draft, upload, merge of publicatie is door deze voorbereiding uitgevoerd.

De drie productiecodebestanden zijn `core.py`, `gh_backend.py` en `publish_prepared.py`. Hun SHA256-map, canoniek samengenomen, is `reviewedCodeSha256`; wijzigingen aan één daarvan vereisen een nieuwe onafhankelijke review en concrete approval. Het plan is inert data. Uitvoering gebruikt een aparte expliciete approval die repository, app/tree/version, volledige plan/body/code/assets-digests, geteste tagtarget, schriftelijke goedkeuringsreferentie, expiry, main-workflowcommit/tree en step permissions pint. Een ontbrekende/onjuiste/verlopen/duplicaat-JSON-approval stopt vóór een backend/contextcall. Een later hergebruikt statebestand vereist zijn eigen goedgekeurde `inputStateSha256`.

## Vaste CLI

```text
python -B publish_prepared.py check --plan ../plan.final-review.json --body ../release-body.final-review.md
python -B test_publisher.py
```

De executing subcommands zijn `collect`, `stage-draft`, `verify-remote` en `publish`; die vereisen allemaal `--approval PATH --work-dir PATH` naast hetzelfde `--plan` en optionele `--body`. Ze worden uitsluitend later door de apart gereviewde dispatch-only mainworkflow aangeroepen. State is `WORKDIR/state.json`, assets zijn tijdelijk `WORKDIR/assets/` en eigen cache is `WORKDIR/cache/`. Default is altijd `check`; de aanwezigheid van een approval activeert niets.

| Stap | Vereiste afzonderlijke permissions | Gedrag |
| --- | --- | --- |
| collect | collect, verifyCrypto | Eerst officiële immutable attempt/head/job/gate/artifact/size/digest/tijdpreflight. Volledige ZIPs veilig controleren; exact 60 members verzamelen; originele Macbronwitness controleren;58 sums en 15 echte public-only GPG-verificaties. |
| stage-draft | checkMainAncestry, createTag, createDraft, uploadAssets | Alleen collectedstate. Actuele main moet exact de goedgekeurde workflowcommit/tree zijn en de geteste P5commit moet ancestor zijn. Geen bestaande tag/draft/release hergebruiken, overschrijven of retargeten. Tag/draft aanmaken en exact 60 bestaande assets uploaden. |
| verify-remote | readBack, verifyCrypto | Alle 60 werkelijke remote assetbytes teruglezen, IDs/namen/bytes/SHA en 58 sums vergelijken en 15 signatures opnieuw public-only verifiëren. |
| publish | checkMainAncestry, readBack, verifyCrypto, publish | Afzonderlijke toestemming. Nieuwe workflowrun doet verse remote 60-byte/GPG-readback zonder originele parentdownload. Dezelfde executioncontext kan een juist voltooide readback hergebruiken na verse exacte ID/tag/body/assetmetadata en mainpincontrole. Daarna pas publiceren en de publieke release/60assets/tag opnieuw waarnemen. |

## Main-jobtoken en recursieve builds

Mutaties zijn alleen toegestaan in de feitelijke `workflow_dispatch`-executejob van `OpenAEC-Foundation/open-office-studio/.github/workflows/publish-prepared.yml@refs/heads/main`. De backend verifieert GitHubActions-context, repository/ref/job, GITHUB_SHA==GITHUB_WORKFLOW_SHA==de goedgekeurde workflowcommit, daadwerkelijke run/attemptmetadata en exact goedgekeurde main-tree. `ghp_`/fine-grained PATs en lokale uitvoering zijn verboden. GH_TOKEN/GITHUB_TOKEN moeten hetzelfde installatie-jobtoken zijn; andere token/hostenv wordt niet als alternatief gebruikt.

De gereviewde workflow moet beide envwaarden rechtstreeks aan `github.token` toekennen, zonder PAT/orgsecretinput. Een envstring of tokenprefix is op zichzelf geen cryptografisch issuerbewijs; de reviewed workflowassignment plus echte API-context is de provenancebasis. [GitHub documenteert](https://docs.github.com/en/actions/concepts/security/github_token) dat zulke jobtokenacties geen nieuwe push/releaseworkflows starten. Hierdoor activeert de tag niet de oude `on.push.tags=v*` bouwketen. De oude algemene publisher wordt nooit aangeroepen.

Voor iedere tag/publicatie wordt actuele main opnieuw aan de goedgekeurde commit/tree gebonden. De refcreatie-API vervangt geen bestaande tag; release- en uploadroutes hebben geen force/clobber/deletepad. Uploads streamen uitsluitend naar fixed HTTPS uploads.github.com; een expliciete NoRedirect-handler weigert 3xx vóór een volgende request met authorization kan ontstaan.

## Opslag, crypto en foutbewaring

Parentcollectie is sequentieel Windows→Linux→Mac. Vóór iedere download/extractie wordt echte vrije ruimte getoetst voor de eigen ZIP, nieuwe outputs en 1 GB reserve. Een bestaande eigen cacheZIP wordt alleen na volledige size/SHA-check gebruikt; geverifieerde parentZIPs worden na extractie verwijderd. De berekende piek op de actuele manifestbytes blijft onder 14 GB vóór checkout/reservebezetting; werkelijke vrije ruimte blijft de beslissende fail-closed check. Na exact 60 succesvolle uploads en remoteIDcontrole worden lokale installer/assetkopieën verwijderd.

Readback houdt alleen de 32 kleine report/key/signature/checksumfiles vast; telkens één installer wordt gedownload/gehasht/(voor Linux) geverifieerd en verwijderd. Eén tijdelijk public-only GPG-home controleert 14 Linuxsignatures plus SHA256SUMS. Geen geheime sleutel/passphrase wordt gelezen of geïmporteerd; private-key/tokenenv wordt uit het GPG-childenv verwijderd. Scoped gpgconf-stop en verwijdering van het tijdelijke keyhome zijn verplicht, ook op fouten.

De API is geen atomische 60-uploadtransactie. Een mislukte write kan een eigen tag/draft of gedeeltelijke upload achterlaten. State bewaart IDs/phase/fout en markeert `requiresManualReview`; er bestaat bewust geen automatische retry, partial-write resume, verwijdering of overwrite. Root moet zo'n situatie afzonderlijk beoordelen. De workflow moet één versiegebonden concurrencygroep gebruiken en alleen state bewaren, nooit approvaltokens/installer/keycaches.

## Validatie en grenzen

21 gerichte tests gebruiken uitsluitend synthetische archives/tempfiles en een fakebackend: default zero events, ongeldige approvals/plan/bytes/producer/duplicaten, duplicate JSONkeys vóór backendcalls, stage/write/orderguards, bestaande tags, veranderde main vóór tag/publicatie, gecontroleerde cross-runstate, sequentiële diskgrens, streamedreadback-corruptie en lifecycle. Echte backendconstructie voor de exacte compare-route, traversalrejection, autorisatiecontext, streaminguploadrequest en NoRedirect wordt zonder netwerk getoetst. De cryptoresultaten in deze tests zijn uitdrukkelijk fake; ze worden niet als live verificatie voorgesteld.

**Nog niet bewezen:** live GitHub jobtoken/release/upload/readback-APIgedrag, de streaming HTTP-upload tegen GitHub, GPG-uitvoering van deze nieuwe code en de uiteindelijke workflow/mainmerge/publicatie. Eerdere verifier-CI bewees dezelfde voorbereide bytes/signatures, maar geldt niet als uitvoering van deze publisher. Onafhankelijke implementatie-/workflowreview en concreet later gebruikersakkoord blijven vereist. Geen nieuwe appbuild is in de code aanwezig.
