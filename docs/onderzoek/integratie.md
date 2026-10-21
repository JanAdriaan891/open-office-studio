# Integratie met de Y-app

## Gecontroleerde bron

De publieke bron op commit `340c8f84b567d517b4d832a8501ce3d17255a6ce`
van [de Y-app](https://github.com/OpenAEC-Foundation/Y-app-ERPNext/blob/340c8f84b567d517b4d832a8501ce3d17255a6ce/y_next/api/office.py)
is gelezen; er is geen verbinding met een draaiende klantomgeving gemaakt.
De ontwikkelbranch bevat zowel historische multi-instance onderdelen als de
Frappe-distributie. Kies voor een proef expliciet de doelvariant; wissel niet
stilzwijgend de authenticatie of tenantselectie om.

## Bestaand opslagcontract

Alle onderstaande routes horen bij de bestaande Frappe-variant en gebruiken de
aangemelde sessie op dezelfde oorsprong.

| Actie | Methode en route | Gegevens |
|---|---|---|
| Openen | GET `/api/method/y_next.api.office.open_file` | `file_name`; antwoord in `message` met `name`, `file_name`, `sha256`, `can_save`, `max_size` |
| Bytes lezen | GET `/api/method/y_next.api.office.file_content` | `file_name`; binaire respons |
| Kopie opslaan | POST `/api/method/y_next.api.office.save_file` | Multipart: `file`, `source_file`, `expected_sha256`, `operation_id`; CSRF-header van de bestaande sessie |
| Uitkomst opvragen | GET `/api/method/y_next.api.office.save_status` | `operation_id`; `found` en eventueel `file` |

Metadata en gelezen bytes moeten dezelfde SHA-256 hebben voordat bewerking
begint. Bewaar de bron-ID en hash bij de geopende editie. Bij iedere save een
operatie-ID gebruiken; een onbekende uitkomst alleen via de statusroute
reconcilieren. Geen blinde tweede save. De ontvangen operatie, bron en hash
verifiëren. Pas na bevestiging de nieuwe kopie als bron gebruiken. Nieuwere
wijzigingen tijdens het opslaan blijven onopgeslagen.

## Proefprocedure

1. Gebruik een bestaande testsite met de Y-app en een niet-gevoelig DOCX-bestand.
2. Open de bijlage vanuit mail of project en controleer de bestandsidentiteit.
3. Wijzig één herkenbare tekst en sla via dezelfde sessie een nieuwe kopie op.
4. Heropen de bevestigde kopie en vergelijk bytes, pakketonderdelen en weergave.
5. Controleer dat de bron onveranderd is en dat de kopie dezelfde ouder en
   private status heeft.
6. Herhaal met alleen leesrecht, gewijzigde bron, verbroken netwerk tijdens
   opslaan en een tweede tabblad. Geen melding 'opgeslagen' zonder bevestiging.

De proef is **nog niet uitgevoerd**. Nodig: bereikbare testomgeving, geldige
sessie, een geschikt testbestand en de frontend-broncheckout. Deel geen
wachtwoorden of sessietokens in de repository.

## Grenzen en vervolg

Een generieke Storage-adapter is nog niet vastgesteld. De Frappe-route is geen
bewijs van SuperCloud-, WebDAV- of andere opslagcompatibiliteit. Houd bytes,
versievoorwaarde en opslagbevestiging in een expliciete adapterinterface;
authenticatie en rechten blijven verantwoordelijkheid van de host.
PPTX vraagt eerst uitbreiding van servervalidatie en MIME-ondersteuning.
Tenant-branding vraagt aansluiting op de echte hostconfiguratie; losse kleuren
in een prototype zijn geen volledige implementatie van het stijlboek.
