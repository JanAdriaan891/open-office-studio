# OpenAEC Email Studio

Zelfstandige e-mailclient (IMAP/SMTP) als module van OpenAEC Office Studio,
zonder koppeling met ERPNext of andere bedrijfssoftware. De interface zit in
dit pakket; de desktopapp voert het contract uit in Rust
(`src-tauri/src/email/`, Tauri-opdrachten `email_<methode>`).

## Onderdelen

| Bestand | Inhoud |
| --- | --- |
| `src/contract.ts` | Gedeeld contract tussen interface en backend (`MailBackend`). |
| `src/tauri-backend.ts` | `TauriBackend`: `invoke("email_…")`, base64 voor bijlagen heen, ruwe bytes terug. |
| `src/demo-backend.ts` | `DemoBackend`: voorbeeldmailbox in het geheugen voor de browser. |
| `src/backend.ts` | Keuze van de backend (`"__TAURI_INTERNALS__" in window`), ongelezen-telling, bewaren, links extern openen. |
| `src/sanitizer.ts`, `src/html-boom.ts` | Eigen HTML-sanitizer (toegestane lijst) en het afgeschermde leesframe. |
| `src/adressen.ts` | Adresregels lezen en schrijven (`"Naam" <a@b.nl>, c@d.nl`). |
| `src/citaat.ts` | Beantwoorden, allen beantwoorden en doorsturen: ontvangers, citaat, `In-Reply-To`/`References`. |
| `src/bijlagecontrole.ts` | Waarschuwing bij een vergeten bijlage. |
| `src/voorinstellingen.ts` | Offline voorinstellingen voor bekende providers. |
| `src/serverzoeker.ts` | Automatisch zoeken naar servers (debounce, verouderde zoekopdrachten negeren) en de kaartlogica. |
| `src/oauth.ts` | Providerherkenning (Microsoft/Google) en standaardservers voor OAuth2. |
| `src/kantoor.ts` | Welke bijlage in welke kantoormodule opent. |
| `src/ui/` | React-interface: `EmailStudio` (hoofdscherm), `Opstelvenster`, `Leesvenster`, `AccountWizard`, `AccountInstellingen`, `VerzendAlsBijlage`. |

## In de kantooromgeving

- Startscherm: vaste ingang **E-mail** in de werkruimtenavigatie (met het
  aantal ongelezen berichten in de inboxen zodra er een account is) en de
  kaart **OpenAEC Email Studio**.
- `src/OfficeStudio.tsx` laadt de module lui, net als Notities. Een
  onverzonden opstelling telt mee voor de verlaat- en sluitbeveiliging;
  Ctrl+S bewaart dan het concept.
- Bijlagen in DOCX/XLSX/PPTX (en in de desktopapp ook ODF en oudere
  formaten) openen als bewerkbare kopie in Tekst, Rekenblad of Presentatie;
  MDB/ACCDB opent in Database Studio. Andere bijlagen worden opgeslagen.
- In het bestandsmenu (Start/backstage) van een open document staat
  **Verzenden als bijlage**: het document wordt geserialiseerd en een
  opstelvenster opent boven het document.

## Account toevoegen

- Naam, e-mailadres en wachtwoord. Zodra het adres geldig is (pauze van
  600 ms) zoekt de app automatisch met `zoekServers`: ingebouwde lijst,
  autoconfig van het eigen domein, DNS (SRV/MX) en een verbindingsproef
  zonder aanmelden. Een nieuwere zoekopdracht maakt een oudere ongeldig.
- De voorstellen staan als kaarten (beste eerst) met provider, servers,
  bron, toelichting en bereikbaarheid (ook in tekst: ✓ bereikbaar, ✗ niet
  bereikbaar, ? niet getest). De eerste kaart vult de handmatige
  configuratie, die altijd zichtbaar en aanpasbaar blijft.
- "Ook de Thunderbird-database raadplegen" staat standaard uit (de
  domeinnaam gaat dan naar Mozilla) en wordt onthouden.
- Het wachtwoord gaat pas mee bij **Testen** (aparte uitkomst voor IMAP en
  SMTP) of **Gereed**.
- **Aanmelden met Microsoft/Google** (OAuth2, PKCE in de systeembrowser):
  de herkende provider staat voorop (gmail.com → Google; outlook.com,
  hotmail, live, onmicrosoft.com of servers van Microsoft 365 → Microsoft).
  Tijdens het aanmelden toont de wizard "Rond het aanmelden af in je
  browser" met Annuleren. Is er geen client-ID, dan legt de wizard uit hoe
  je er een instelt (Accountinstellingen › Geavanceerd, zie
  `docs/email-oauth.md`). In de browser (demo) is OAuth niet beschikbaar.
- Accountinstellingen: identiteit, servers, mappen, ophalen en privacy,
  geavanceerd (OAuth-client-ID's, Thunderbird-database). OAuth-accounts
  tonen "Aangemeld als … bij Microsoft/Google" met **Opnieuw aanmelden** in
  plaats van een wachtwoordveld.

## Veiligheid

- HTML wordt alleen gesaneerd getoond: eigen sanitizer met een toegestane
  lijst elementen, attributen en CSS-eigenschappen; geen scripts,
  event-handlers, formulieren, frames, objecten, SVG/MathML of
  `javascript:`/`data:`-links.
- De uitvoer staat in een `<iframe sandbox="allow-same-origin">` (dus zonder
  `allow-scripts`) met een CSP `default-src 'none'`.
- Externe afbeeldingen en CSS-bronnen zijn standaard geblokkeerd; de balk
  "Externe inhoud tonen" onthoudt de keuze per bericht of per afzender.
  In de desktopapp blijft de CSP van de app dicht: na toestemming haalt
  `email_externe_inhoud(url)` (alleen afbeeldingen, SSRF-beschermd, max.
  10 MB) elke afbeelding op, met hooguit vier tegelijk; die komen als
  blob-URL in het frame en worden weer ingetrokken. In de browserdemo laadt
  het frame ze rechtstreeks.
  `cid:`-afbeeldingen komen als blob-URL uit de bijlagen.
- Klikken op een link toont eerst het echte doeladres (met waarschuwing als
  de zichtbare tekst een ander domein noemt) en opent het daarna extern.
- Wachtwoorden gaan alleen mee naar `bewaarAccount`/`test` en komen nooit
  terug; de desktopbackend bewaart ze in de sleutelhanger.

## Bijlagen

- Klik op een bijlage: voorvertoning (`src/voorbeeld/`, `<BijlageVoorbeeld>`,
  met ←/→ tussen de bijlagen van het bericht). Dubbelklik of de knop
  "Openen in …": als bewerkbare kopie in de kantoormodule.
- Opslaan via `email_bewaar_bestand` (body = bytes, kop `x-email-naam`);
  ontbreekt die, dan `bewaar_kopie` voor kantoorformaten of een melding. In
  de browser een download.
- Links openen via `tauri-plugin-opener`, anders `email_open_link`.

## Desktopopdrachten die de interface gebruikt

`email_<methode>` uit `contract.ts`, plus `email_bewaar_oauth_client`,
`email_externe_inhoud`, `email_bewaar_bestand`, `email_open_link` en het
optionele event `email-zoek-voortgang` `{stap, status}` voor de
stappenindicator in de wizard. Reply-To vult de backend uit het account.

## Sneltoetsen (zoals Thunderbird)

Ctrl+N nieuw · Ctrl+R beantwoorden · Ctrl+Shift+R allen · Ctrl+L doorsturen ·
Del verwijderen · A archiveren · M gelezen/ongelezen · S ster · F/B
volgende/vorige · N volgende ongelezen · Ctrl+F zoeken · F5/Ctrl+T ophalen ·
Ctrl+Enter verzenden · Ctrl+S concept bewaren.

## Demo

In de browser is geen echte e-mail mogelijk. Email Studio toont dan een
duidelijk gemarkeerde demomailbox met zelfgeschreven, neutrale berichten;
bijlagen komen uit `public/voorbeelden/`.

## Tests

```sh
pnpm exec vitest run packages/email
```

Herkomst: eigen code. De opzet (drie kolommen, adreschips, opstelvenster)
is geïnspireerd op de webmail van Y-app (MIT, OpenAEC Foundation); er is
geen code uit overgenomen.
