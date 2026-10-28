# Integratie: live Y-app-opslagproef en gedeeld editorcontract

Onderdeel van #1. Zie `docs/onderzoek/README.md` voor de routekeuze.

Gebruik het bestaande opslagcontract in docs/onderzoek/integratie.md. Bepaal expliciet welke Y-app-variant en testsite worden gebruikt.

## Acceptatiecriteria

- [ ] DOCX vanuit project of mail openen, bewerken, als private kopie opslaan en heropenen.
  Adapter en nep-servertest aanwezig; live proef en UI-koppeling nog niet uitgevoerd.
- [ ] Rechten, bronhashconflict, dubbele opslag, netwerkuitval en onopgeslagen wijzigingen tijdens save testen.
  Clientzijde getest met een nep-server (`src/yapp-opslag.test.ts`); tegen een echte testsite nog open.
- [x] Generieke opslagadapter scheiden van authenticatie; tenant en gebruiker niet zelf afleiden.
  `src/opslagadapter.ts` en `src/yapp-opslag.ts`; de host levert transport en CSRF.
- [x] PPTX-servervalidatie, sjablonen en tenant-branding apart onderbouwen.
  Zie de gelijknamige secties in `docs/onderzoek/integratie.md`.
- [ ] Live testomgeving en bewijs vastleggen zonder geheimen of gebruikersgegevens te publiceren.
  Proefscript `scripts/yapp-opslagproef.mjs` staat klaar; testsite en uitvoering ontbreken.

Gekozen variant: de Frappe-app `y_next` met de bestaande sessie op dezelfde
oorsprong (zie `docs/onderzoek/integratie.md`). Testsite: nog niet beschikbaar.
