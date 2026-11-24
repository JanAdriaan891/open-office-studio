# Gate-dispositie: oude Mac Suite-savewaarneming

**Oordeel: de verplichte savegate is vervuld. Advies JA voor de begrensde stabiel-gereedheidsbeoordeling**, gegeven de centraal afgeronde overige gates, met de concrete oude savewaarneming zichtbaar als onopgelost restrisico. Dit is geen toestemming voor main/tag/publicatie.

## Bewijs

Run 45355259350 blijft FAIL: Q was zichtbaar en dirty vóór de aangevraagde legacy postToPid CmdS, maar het private bestand bleef de oorspronkelijke bytes bevatten. Er ontbreken receiver/handlerack en directe pre-save Save-enabled/busy/modal/load- en OS-permissiegegevens. Dat is echte negatieve evidence; geen bewezen onschuldige QA-fout en geen zelfstandig vastgestelde productbug.

Run 45358252707 gebruikt exact dezelfde P5-app, Suite-DMG 1d0cb79f en executable 0c6a58c7. Alle zes verse kopieën/PIDs slagen: tweemaal legacyflags, tweemaal releasedflags/postToPid en tweemaal HID. Eén Q/één CmdS zonder retries, echte gewijzigde XML met behoud van overige tekst/tabel/media, clean en normale CmdQ. De gemeenschappelijke dirtywait/read-only snapshotbarrière maakt dit geen bewijs voor een causale transport- of timingfix. Raw diagnosticOnly/nativePassfalse blijft behouden; geen zes cold-reopens worden verzonnen.

De verplichte normale exit/nieuwPID-heropening is afzonderlijk positief bewaard in de echte Suitecore45352741879 en de centraal afgeronde save/374-cases. De latere45361373078 UI 200%-readback sluit zijn eigen zichtbare-outputgat en verklaart het oude Suiteincident niet.

## Beoordeling en onzekerheid

De vastgelegde functionele criteria vragen echte invoer, werkelijk opgeslagen bytes/behoud en de vereiste normale afsluiting/heropening op het bevroren pakket. Die positieve criteria zijn nu afgedekt. Er is geen afspraak dat ieder historisch mislukte geautomatiseerde poging eerst een bewezen oorzaak moet krijgen. Een extra testlus uitsluitend om de oude fout te verklaren zou een nieuwe gate zijn; die is hier niet nodig.

De oude fout blijft wel expliciet: één saveverzoek sloeg in die geautomatiseerde poging de zichtbare wijziging niet op; de oorzaak is onbekend. Een incidenteel product-saveprobleem is hiermee niet uitgesloten. Noem dit concreet in het finale gereedheidsadvies en wis of herlabel de oorspronkelijke FAIL niet. Classificeer het als tijdens automatisering geobserveerd, causaal nog onbewezen incident; niet als bewezen QA- of productfix.

**Volgende actie:** geen nieuwe bouw/proef voor deze beslisvraag. Root verwijst naar de bestaande positieve criteria, bewaart oorzaakOPEN/oudFAIL en vraagt het reeds vereiste specifieke gebruikersakkoord voor vervolgstappen. Dit oordeel herhaalt niet de volledige platformaudits en claimt geen algemene of uitputtende stabiliteit.
