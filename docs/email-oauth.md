# OAuth2 voor Email Studio (Microsoft en Google)

Email Studio meldt zich bij Microsoft (Outlook.com, Microsoft 365) en Google (Gmail)
aan via OAuth2 volgens RFC 8252: de systeembrowser opent de aanmeldpagina van de
provider, de app gebruikt PKCE (S256) en een willekeurige `state`, en de provider
stuurt de browser terug naar een tijdelijke luisteraar op deze computer
(`http://localhost:<poort>/` voor Microsoft, `http://127.0.0.1:<poort>/` voor
Google; de luisteraar bindt op 127.0.0.1 en ::1, wacht maximaal 5 minuten op één
geldige terugkoppeling en sluit dan). De aanmelding is af te breken met
`annuleerOAuth`.

Na aanmelden staat het **vernieuwingstoken** in de sleutelhanger van het
besturingssysteem (dienst `OpenAEC Email Studio`, gebruiker `<account-id>:oauth`);
het **toegangstoken** staat alleen in het geheugen en wordt vóór het verlopen
vernieuwd. Weigert de mailserver het token (AUTHENTICATIONFAILED), dan vernieuwt
Email Studio één keer en probeert opnieuw. Is de toestemming ingetrokken of
verlopen, dan volgt de melding "Opnieuw aanmelden bij Microsoft/Google".
IMAP gebruikt `AUTHENTICATE XOAUTH2`, SMTP het mechanisme `XOAUTH2`.

Het e-mailadres wordt uit het `id_token` gelezen zonder handtekeningcontrole. Dat
is alleen een weergave en voorstel voor het adres; de mailserver controleert bij
XOAUTH2 zelf of token en mailbox bij elkaar horen.

## Waar het client-ID vandaan komt

Er staat geen client-ID in de broncode. Email Studio zoekt in deze volgorde:

1. **App-instelling**: opdracht `email_bewaar_oauth_client(provider, clientId, clientSecret?)`.
   Het client-ID komt in `email-oauth.json` in de app-datamap, een eventueel
   client-geheim in de sleutelhanger (gebruiker `oauth-client:<provider>`).
   Een leeg client-ID wist de instelling.
2. **Bij het bouwen** (`option_env!`): `OPENAEC_OAUTH_MICROSOFT_CLIENT_ID`,
   `OPENAEC_OAUTH_GOOGLE_CLIENT_ID`, `OPENAEC_OAUTH_GOOGLE_CLIENT_SECRET`.
3. **Omgevingsvariabelen tijdens het draaien** met dezelfde namen (plus
   `OPENAEC_OAUTH_MICROSOFT_CLIENT_SECRET`, normaal niet nodig).

Zonder client-ID geeft `oauthStatus()` voor die provider `beschikbaar: false` met
een korte uitleg.

## Microsoft Entra (Outlook.com en Microsoft 365)

1. Ga naar <https://entra.microsoft.com> → **Identiteit → Toepassingen →
   App-registraties → Nieuwe registratie**.
2. Naam bijvoorbeeld "OpenAEC Email Studio". Ondersteunde accounttypen:
   **Accounts in elke organisatiemap en persoonlijke Microsoft-accounts**
   (anders werkt alleen de eigen tenant of geen Outlook.com).
3. Redirect-URI: platform **Mobiele en desktopapps**, waarde `http://localhost`.
   Entra accepteert voor loopback elke poort; Email Studio kiest een willekeurige.
4. **Verificatie → Geavanceerde instellingen → Openbare clientstromen toestaan: Ja**.
   Er is géén clientgeheim nodig (openbare client met PKCE).
5. **API-machtigingen → Een machtiging toevoegen → API's die mijn organisatie
   gebruikt → Office 365 Exchange Online** (of via *Microsoft Graph* de
   gedelegeerde machtigingen) en voeg toe:
   - `IMAP.AccessAsUser.All`
   - `SMTP.Send`
   - `offline_access`, `openid`, `email`
   De app vraagt de scopes
   `https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access openid email`.
6. Kopieer de **Toepassings-id (client)** en vul die in als client-ID.

Microsoft 365-beheerders: IMAP en "Authenticated SMTP" moeten voor de mailbox aan
staan (Exchange-beheercentrum → mailbox → E-mail-apps). Afhankelijk van het
tenantbeleid moet een beheerder eenmalig toestemming geven.

Servers: `outlook.office365.com:993` (SSL/TLS) en `smtp.office365.com:587` (STARTTLS).

## Google Cloud (Gmail en Google Workspace)

1. Maak een project in <https://console.cloud.google.com>.
2. **API's en services → Bibliotheek → Gmail API → Inschakelen**.
3. **OAuth-toestemmingsscherm** (Google Auth Platform): type **Extern** (of
   **Intern** voor alleen de eigen Workspace-organisatie). Vul app-naam,
   ondersteunings-e-mail en ontwikkelaarscontact in.
4. **Gegevenstoegang / Scopes**: voeg `https://mail.google.com/`, `openid` en
   `email` toe. `https://mail.google.com/` is een **beperkte scope**.
5. **Clients → Client maken → Type: Desktop-app**. Een redirect-URI hoeft niet te
   worden ingevuld: desktopclients accepteren `http://127.0.0.1:<poort>`.
6. Kopieer client-ID én client-geheim. Bij desktopclients is het geheim volgens
   Google niet vertrouwelijk, maar het tokeneindpunt vraagt er wel om; Email
   Studio bewaart het in de sleutelhanger.
7. **Testgebruikers**: zolang de app de publicatiestatus *Testen* heeft, kunnen
   alleen de hier toegevoegde Google-accounts (max. 100) zich aanmelden, en
   verlopen vernieuwingstokens na 7 dagen.
8. **Publiceren voor iedereen**: voor de beperkte scope `https://mail.google.com/`
   eist Google bij publieke distributie een **verificatie** van de app, inclusief
   een jaarlijkse beveiligingsbeoordeling (CASA) door een externe partij. Voor
   intern gebruik binnen één Workspace-organisatie (type *Intern*) is dat niet
   nodig. Alternatief zonder verificatie: een app-wachtwoord met
   "normaal wachtwoord".

De app vraagt `access_type=offline` en `prompt=consent` zodat Google altijd een
vernieuwingstoken teruggeeft.

Servers: `imap.gmail.com:993` (SSL/TLS) en `smtp.gmail.com:465` (SSL/TLS) of 587
(STARTTLS). Gmail zet verzonden mail zelf in "Verzonden"; Email Studio slaat de
extra kopie dan over.

## Veiligheid

- Tokens en client-geheimen komen nooit in meldingen, logboeken of het
  accountbestand.
- De terugkoppeling wordt alleen geaccepteerd met de juiste `state`; de luisteraar
  draait alleen op loopback en sluit na de aanmelding of na 5 minuten.
- Het tokeneindpunt wordt alleen over HTTPS benaderd (met de Mozilla-basiscertificaten).
