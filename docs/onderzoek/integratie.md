# Integratie met de Y-app

## Gecontroleerde bron

De publieke bron op commit `340c8f84b567d517b4d832a8501ce3d17255a6ce`
van [de Y-app](https://github.com/OpenAEC-Foundation/Y-app-ERPNext/blob/340c8f84b567d517b4d832a8501ce3d17255a6ce/y_next/api/office.py)
is gelezen, samen met `y_next/api/office_validation.py` op dezelfde commit;
er is geen verbinding met een draaiende klantomgeving gemaakt.
De ontwikkelbranch bevat zowel historische multi-instance onderdelen als de
Frappe-distributie. Kies voor een proef expliciet de doelvariant; wissel niet
stilzwijgend de authenticatie of tenantselectie om.

**Gekozen doelvariant:** de Frappe-app `y_next` (Frappe/ERPNext-site met de
app geïnstalleerd en gemigreerd, zodat het DocType `Y Office Save` bestaat).
Authenticatie is de bestaande Frappe-sessie op dezelfde oorsprong. De
multi-instance onderdelen vallen buiten deze proef.

## Bestaand opslagcontract

Alle onderstaande routes horen bij de bestaande Frappe-variant en gebruiken de
aangemelde sessie op dezelfde oorsprong.

| Actie | Methode en route | Gegevens |
|---|---|---|
| Openen | GET `/api/method/y_next.api.office.open_file` | `file_name`; antwoord in `message` met `name`, `file_name`, `file_url`, `sha256`, `attached_to_doctype`, `attached_to_name`, `can_save`, `max_size` |
| Bytes lezen | GET `/api/method/y_next.api.office.file_content` | `file_name`; binaire respons |
| Kopie opslaan | POST `/api/method/y_next.api.office.save_file` | Multipart: `file`, `source_file`, `expected_sha256`, `operation_id` (UUID); CSRF-header `X-Frappe-CSRF-Token` van de bestaande sessie |
| Uitkomst opvragen | GET `/api/method/y_next.api.office.save_status` | `operation_id`; `found` en eventueel `file` (zelfde velden als het saveantwoord) |

Bevestigde details uit de bron:

- `save_file` reserveert eerst een ontvangstbewijs op `operation_id`. Een
  herhaling met dezelfde ID, gebruiker, bron, verwachte hash, invoerhash en
  bestandsnaam geeft hetzelfde resultaat terug; andere gegevens geven
  `409 office_operation_conflict`. Zo maakt één operatie hooguit één kopie.
- Daarna wordt de bron vergrendeld en opnieuw gehasht; een afwijking geeft
  `409 office_source_changed`. De kopie is altijd privé en hangt aan dezelfde
  ouder (Project of Communication) als de bron.
- `save_status` zoekt alleen ontvangstbewijzen van de eigen sessiegebruiker
  en controleert de huidige rechten op bron en kopie. Een gereserveerde maar
  onvoltooide operatie geeft `409 office_save_pending`.
- Foutcodes staan in `office_error` van het JSON-antwoord. Rechten geven 403
  (`PermissionError`), ontbrekende bestanden 404.
- Grootte: minimum van 20 MB (`APP_MAX_SIZE`), de Frappe-uploadlimiet en
  `max_file_size` van de site; het pakket wordt bovendien als OOXML gevalideerd.

Metadata en gelezen bytes moeten dezelfde SHA-256 hebben voordat bewerking
begint. Bewaar de bron-ID en hash bij de geopende editie. Bij iedere save een
operatie-ID gebruiken; een onbekende uitkomst alleen via de statusroute
reconcilieren. Geen blinde tweede save. De ontvangen operatie, bron en hash
verifiëren. Pas na bevestiging de nieuwe kopie als bron gebruiken. Nieuwere
wijzigingen tijdens het opslaan blijven onopgeslagen.

## Opslagadapter

`src/opslagadapter.ts` legt een generieke interface vast, los van
authenticatie:

| Type | Inhoud |
|---|---|
| `BronIdentiteit` | `id` (opaque), `bestandsnaam`, `sha256` |
| `BronMetadata` | identiteit plus `kanOpslaan`, `maxGrootte`, optioneel `ouder` |
| `OpslagVerzoek` | bron, `verwachteSha256` (versievoorwaarde), `bytes`, `sha256`, `operatieId` |
| `OpslagBevestiging` | `operatieId`, `bronId`, `kopie` (metadata van de nieuwe kopie) |
| `OpslagAdapter` | `open`, `slaKopieOp`, `status`, `ondersteunt` |
| `HostTransport` | `(pad, init) => Promise<Response>`, geleverd door de host |
| `OpslagFout` | `code`: `geen-rechten`, `geen-sessie`, `bronconflict`, `operatieconflict`, `netwerk`, `te-groot`, `onbekende-uitkomst`, `niet-ondersteund`, `hash-mismatch`, `ongeldig-antwoord`, `niet-gevonden`, `bezig`, `server` |

De adapter zet zelf geen cookies, tokens of tenantheaders en leest geen
gebruiker uit. De host kiest de oorsprong (en daarmee de tenant), levert de
sessie via het transport en het CSRF-token via een callback. Hashes worden met
WebCrypto berekend.

`OpslagEditie` (zelfde bestand) houdt per geopend document de huidige bron en
een eventueel onbevestigde operatie bij:

1. Bij een gewone opslag: nieuwe UUID, `expected_sha256` = hash van de huidige
   bron. Lokale weigering bij een niet-ondersteund type, `can_save=false` of
   overschrijding van `max_size`.
2. Bij netwerkuitval, time-out of een 5xx na verzending: geen tweede save,
   alleen `save_status`. Gevonden → operatie, bron en hash verifiëren en de
   kopie als bron nemen. Niet gevonden → `onbekende-uitkomst`; de operatie
   blijft openstaan.
3. Bij de volgende opslag eerst opnieuw `save_status`. Bij dezelfde bytes
   wordt dezelfde `operation_id` opnieuw verzonden (de server maakt hooguit één
   kopie). Bij andere bytes wordt niets verzonden totdat de oude uitkomst
   bekend is of de gebruiker bewust `verwerpOnbevestigdeOperatie()` kiest.
4. Een bevestiging met afwijkende operatie, bron, hash of een kopie-ID gelijk
   aan de bron wordt geweigerd (`ongeldig-antwoord`); de bron verandert dan
   niet.

`src/yapp-opslag.ts` (`YappOpslag`) implementeert het contract hierboven.
Ondersteunde typen staan in `YAPP_MIME_TYPES` (DOCX/XLSX/XLSM). PPTX wordt al
vóór het lezen van de bytes en vóór iedere save geweigerd.

### Aanroep door een host

De UI is nog niet gekoppeld. Een host die Office Studio op dezelfde oorsprong
als de Frappe-site serveert, gebruikt het zo:

```ts
import { DocumentOpslag } from "./opslag";
import { OpslagEditie } from "./opslagadapter";
import { YappOpslag } from "./yapp-opslag";

const adapter = new YappOpslag({
  // De host bepaalt oorsprong, cookies en eventuele tenant; niet de adapter.
  transport: (pad, init) => fetch(pad, { ...init, credentials: "same-origin" }),
  csrfToken: () => hostSessie.csrfToken, // bijv. frappe.csrf_token van de host
  tijdslimietMs: 60_000,
});

const { editie, bytes } = await OpslagEditie.open(adapter, fileIdUitProjectOfMail);
// bytes in de editor laden; editie.bron.kanOpslaan bepaalt of 'Opslaan' actief is.

const opslag = new DocumentOpslag();
const id = opslag.wissel();
// ...bij iedere bewerking: opslag.wijzig(id)
const resultaat = await opslag.opslaan(() => editor.serialiseer(), editie.bewaar);
if (resultaat.status === "mislukt") toonMelding(resultaat.fout, editie.laatsteFout?.code);
// 'Opgeslagen' alleen tonen bij status "afgerond" én uitkomst "opgeslagen";
// bij schoon=false blijven latere wijzigingen als onopgeslagen gemarkeerd.
```

Bij `onbekende-uitkomst` toont de host dat de opslag niet bevestigd is en
biedt hij 'Opnieuw controleren' aan (een volgende `opslaan` vraagt eerst de
status na). `verwerpOnbevestigdeOperatie()` alleen na een expliciete keuze
van de gebruiker, omdat daarna een tweede kopie kan ontstaan.

## Wat getest is

Unit- en nep-servertests in `src/yapp-opslag.test.ts` (vitest). De nep-server
volgt de regels van `office.py`: ontvangstbewijs per operatie, bronhash,
rechten, CSRF, grootte en ondersteunde typen.

| Scenario | Uitkomst in test |
|---|---|
| SHA-256 via WebCrypto | bekende testvector |
| Openen: metadata + bytes, hash gelijk | geslaagd; adapter stuurt alleen `Accept` |
| Openen met afwijkende bytes | `hash-mismatch` |
| Groter dan `max_size` (open en save, lokaal en server) | `te-groot` |
| Onbekend bestand / netwerkuitval bij openen | `niet-gevonden` / `netwerk` |
| Opslaan als private kopie, heropenen | bron onveranderd, kopie privé met dezelfde ouder, bytes gelijk |
| Kopie wordt bron voor de volgende save | tweede save gebruikt hash van de kopie |
| Alleen leesrecht (`can_save=false`) | lokaal geweigerd, geen save-verzoek |
| Rechten ingetrokken na openen (403) | `geen-rechten`, geen kopie |
| Geen CSRF-token | `geen-sessie` |
| Bronhashconflict | `bronconflict` (409), geen kopie, bron ongewijzigd |
| Dubbele opslag met dezelfde `operation_id` | één kopie; andere inhoud → `operatieconflict` |
| Vervalste bevestiging (hash, bron, operatie, kopie=bron) | `ongeldig-antwoord`, bron ongewijzigd |
| Antwoord verloren na verwerking | via `save_status` gevonden, geen tweede save |
| Verzoek verloren vóór verwerking | `onbekende-uitkomst`, geen blinde save; daarna zelfde ID → één kopie |
| Status onbereikbaar, later gevonden | oude kopie eerst bevestigd en bron, daarna één nieuwe kopie |
| Time-out en 502 na verzending | behandeld als onbekend en gereconcilieerd |
| PPTX | geweigerd bij openen en opslaan, zonder save-verzoek |
| Koppeling met `DocumentOpslag` | bevestigde save is schoon; wijziging tijdens save blijft onopgeslagen; onbekende uitkomst → `mislukt` |

`node scripts/yapp-opslagproef.mjs --zelftest` draait het proefscript tegen een
ingebouwde nep-server zonder netwerk.

## Wat niet getest is

- **De live proef is nog niet uitgevoerd.** Er is geen testsite of sessie
  beschikbaar geweest. Er is geen verkeer naar een Y-app-server gestuurd.
- Echte OOXML-validatie (`validate_package`), Frappe-rechten, de werkelijke
  foutvorm van Frappe-responses en de CSRF-afhandeling zijn alleen nagebootst.
- Bewerken in de echte editor en heropenen in de UI: de adapter is nog niet in
  `OfficeStudio.tsx` gekoppeld.
- Cross-origin gebruik (CORS, cookies van een andere oorsprong) en de
  Tauri-desktopapp als host.

Nodig voor de live proef:

1. Een Frappe/ERPNext-testsite met `y_next` op commit `340c8f8` of later,
   gemigreerd (DocType `Y Office Save` aanwezig).
2. Twee testgebruikers: één met `File: create` en schrijfrecht op een Project
   en een Communication, één met alleen leesrecht.
3. Een niet-gevoelig DOCX-testbestand als bijlage bij dat Project en bij een
   mail (Communication); een tweede DOCX waarop alleen leesrecht bestaat.
4. Een in de editor gewijzigde versie van het testbestand (lokaal pad).
5. Een sessie of API-token van de testgebruiker, alleen als
   omgevingsvariabele.

### Proefscript

`scripts/yapp-opslagproef.mjs` leest URL, sessie (`YAPP_PROEF_SID` +
`YAPP_PROEF_CSRF` of `YAPP_PROEF_AUTORISATIE`) en File-ID's uitsluitend uit
omgevingsvariabelen en draait alleen met `YAPP_PROEF_BEVESTIG=ja-testsite`.
Het weigert http buiten localhost/`.test`, volgt geen doorverwijzingen en
stuurt de sessie alleen naar de opgegeven oorsprong. Stappen: openen en
hashcontrole, kopie opslaan, dezelfde operatie herhalen, status van bekende
en onbekende operatie, bronhashconflict (met controle dat er geen
ontvangstbewijs achterblijft), kopie heropenen, bron onveranderd en
optioneel alleen-leesrecht. Het JSON-rapport bevat alleen stapnamen,
statuscodes, serverfoutcodes, duur, hashes en ja/nee-uitkomsten; geen URL,
sessie, bestands-ID, bestandsnaam of gebruiker. Leg het rapport vast als
bewijs bij #5; handmatige controle van weergave en pakketonderdelen blijft
nodig.

Netwerkuitval tijdens de save is in het script niet live na te bootsen; test
dat in de browser met de devtools-netwerkthrottling of door de verbinding na
verzending te verbreken, en controleer dat de UI geen 'opgeslagen' toont tot
`save_status` de kopie bevestigt.

## Proefprocedure

1. Gebruik een bestaande testsite met de Y-app en een niet-gevoelig DOCX-bestand.
2. Open de bijlage vanuit mail of project en controleer de bestandsidentiteit.
3. Wijzig één herkenbare tekst en sla via dezelfde sessie een nieuwe kopie op.
4. Heropen de bevestigde kopie en vergelijk bytes, pakketonderdelen en weergave.
5. Controleer dat de bron onveranderd is en dat de kopie dezelfde ouder en
   private status heeft.
6. Herhaal met alleen leesrecht, gewijzigde bron, verbroken netwerk tijdens
   opslaan en een tweede tabblad. Geen melding 'opgeslagen' zonder bevestiging.

Deel geen wachtwoorden of sessietokens in de repository.

## PPTX-servervalidatie

Op commit `340c8f8` ontbreekt PPTX aan beide kanten van de server:

- `office.py` → `MIME_TYPES` kent alleen `.docx`, `.xlsx` en `.xlsm`.
  `file_content` zoekt het MIME-type op met `MIME_TYPES[extension(...)]`; nodig
  is `.pptx`: `application/vnd.openxmlformats-officedocument.presentationml.presentation`.
- `office_validation.py` → `OFFICE_TYPES` heeft geen `.pptx`-regel, dus
  `extension()` geeft `office_unsupported_type` bij openen én opslaan. Nodig
  is een regel met hoofdonderdeel `ppt/presentation.xml`, contenttype
  `application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml`,
  wortelelement `presentation` en de namespaces
  `http://schemas.openxmlformats.org/presentationml/2006/main` en
  `http://purl.oclc.org/ooxml/presentationml/main`.

Aandachtspunten bij die uitbreiding:

- Presentaties met foto's of video overschrijden snel de 20 MB van
  `APP_MAX_SIZE` en de 80 MB uitgepakte limiet; een aparte limiet per type of
  een expliciete keuze is nodig.
- `_validate_relationships` weigert externe relaties die geen hyperlink zijn.
  Gekoppelde video/audio (`TargetMode="External"`) in PPTX wordt dan
  geweigerd; dat is veilig, maar moet als bewuste beperking worden gemeld.
- `.pptm` (`vbaProject.bin`) blijft geweigerd, net als macro's in DOCX/XLSX.
- Tests in de Y-app met echte PPTX-pakketten (titeldia, afbeeldingen, notities,
  diamodellen) en negatieve gevallen.

Tot dat is gedaan houdt `YAPP_MIME_TYPES` PPTX buiten; een host kan na een
serverupdate de lijst via `mimeTypes` uitbreiden.

## Sjablonen

Het contract kent geen route om een nieuw document te maken: `save_file`
vereist altijd een bestaand `source_file` met hetzelfde type en hangt de kopie
aan de ouder van die bron. Sjabloontypen (`.dotx`, `.xltx`, `.potx`) staan niet
in `OFFICE_TYPES`; hun hoofdonderdeel heeft een ander contenttype
(`…template.main+xml`). 'Nieuw document vanuit sjabloon' vraagt daarom een
aparte serverroute (bijvoorbeeld aanmaken bij een expliciete ouder met
rechtencontrole op die ouder, eigen operatie-ID en ontvangstbewijs) en een
keuze waar sjablonen staan (lokaal in Office Studio of als File in de Y-app).
Dat is niet gebouwd en niet getest.

## Tenant-branding

Branding hoort, net als tenant en gebruiker, bij de host. `office.py` levert
geen huisstijl of tenantconfiguratie, en de adapter leidt niets af uit URL,
cookie of bestand. Voorstel: de host geeft bij het starten een expliciet
brandingobject (kleuren, logo, lettertypen uit het stijlboek van de tenant)
mee; zonder dat object gebruikt Office Studio de OpenAEC-standaard. Losse
kleuren in een prototype zijn geen volledige implementatie van het stijlboek.

## Grenzen en vervolg

De Frappe-route is geen bewijs van SuperCloud-, WebDAV- of andere
opslagcompatibiliteit; zo'n opslag krijgt een eigen implementatie van
`OpslagAdapter` en eigen tests. Authenticatie en rechten blijven
verantwoordelijkheid van de host.
