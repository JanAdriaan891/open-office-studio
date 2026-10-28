import type {
  Account,
  AccountInvoer,
  Adres,
  Bericht,
  BerichtLijst,
  ConfiguratieVoorstel,
  Lijstverzoek,
  MailBackend,
  Map,
  OAuthProvider,
  OAuthStatus,
  Opstelling,
  TestUitkomst,
} from "./contract";
import { MailFoutMelding } from "./fouten";
import { gok, voorinstelling } from "./voorinstellingen";
import { inhoudstype } from "./kantoor";

/**
 * Demomailbox in het geheugen. In de browser is geen echte e-mail mogelijk
 * (geen IMAP/SMTP); deze backend laat de interface zien met neutrale,
 * zelfgeschreven voorbeeldberichten. Niets verlaat de computer.
 */
export const DEMO_MELDING = "Demo — in de browser is geen echte e-mail mogelijk; gebruik de desktopapp.";

type BijlageBron = { bestandsnaam: string; inhoudstype: string; contentId?: string; inline?: boolean } & (
  | { bytes: Uint8Array }
  | { pad: string; grootte: number }
);
interface DemoBericht {
  bericht: Bericht;
  bronnen: BijlageBron[];
}
interface DemoAccount {
  account: Account;
  mappen: Map[];
  berichten: DemoBericht[];
  volgendeUid: number;
}

const LOGO_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAAf0lEQVR42mMwM7ODoJvlbGQguHYGOIsMs5D1ohhEklloGhkwhcgwBSjCgEuCJFMQBhFvFi5lDMQoIkYBA/FK8VvDQKS1BB3LQExAEBN8DEQGKsFIYCA+mvEnC9obRB2vUSewqRP91EmQ1Mki1Mm01ClGqFOwUa2opX7hT2F1BAAulnB/YDfceAAAAABJRU5ErkJggg==";

function base64NaarBytes(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const MAPPEN = (): Map[] => [
  { pad: "INBOX", naam: "Postvak IN", scheiding: "/", speciaal: "inbox", selecteerbaar: true },
  { pad: "INBOX/Meldingen", naam: "Meldingen", scheiding: "/", selecteerbaar: true },
  { pad: "Concepten", naam: "Concepten", scheiding: "/", speciaal: "concepten", selecteerbaar: true },
  { pad: "Verzonden", naam: "Verzonden", scheiding: "/", speciaal: "verzonden", selecteerbaar: true },
  { pad: "Archief", naam: "Archief", scheiding: "/", speciaal: "archief", selecteerbaar: true },
  { pad: "Ongewenst", naam: "Ongewenst", scheiding: "/", speciaal: "ongewenst", selecteerbaar: true },
  { pad: "Prullenbak", naam: "Prullenbak", scheiding: "/", speciaal: "prullenbak", selecteerbaar: true },
];

const IK: Adres = { naam: "Demo Gebruiker", adres: "demo@voorbeeld.invalid" };
const STUDIO: Adres = { naam: "OpenAEC Email Studio", adres: "studio@voorbeeld.invalid" };
const SANNE: Adres = { naam: "Sanne de Vries", adres: "sanne@ontwerpbureau.invalid" };
const OMAR: Adres = { naam: "Omar Bakker", adres: "omar@bouwbedrijf.invalid" };
const LINDA: Adres = { naam: "Linda Smit", adres: "linda@adviesgroep.invalid" };
const NIEUWS: Adres = { naam: "Nieuwsbrief Duurzaam Bouwen", adres: "nieuws@nieuwsbrief.invalid" };

function geleden(uren: number) {
  return new Date(Date.now() - uren * 3600_000).toISOString();
}

function maakBericht(
  uid: number,
  map: string,
  velden: Partial<Bericht> & Pick<Bericht, "onderwerp" | "van" | "tekst">,
  bronnen: BijlageBron[] = [],
): DemoBericht {
  const bijlagen = bronnen.map((b, index) => ({
    index,
    bestandsnaam: b.bestandsnaam,
    inhoudstype: b.inhoudstype,
    grootte: "bytes" in b ? b.bytes.length : b.grootte,
    contentId: b.contentId,
    inline: !!b.inline,
  }));
  const bericht: Bericht = {
    uid,
    map,
    datum: geleden(uid),
    aan: [IK],
    cc: [],
    bcc: [],
    antwoordAan: [],
    gelezen: false,
    gemarkeerd: false,
    beantwoord: false,
    html: "",
    berichtId: `<demo-${uid}@voorbeeld.invalid>`,
    ...velden,
    grootte: 0,
    heeftBijlagen: bijlagen.some((b) => !b.inline),
    bijlagen,
  };
  bericht.grootte = bericht.tekst.length + bericht.html.length + bijlagen.reduce((som, b) => som + b.grootte, 0);
  return { bericht, bronnen };
}

function demoBerichten(): DemoBericht[] {
  const lijst: DemoBericht[] = [
    maakBericht(1, "INBOX", {
      datum: geleden(0.5),
      onderwerp: "Welkom bij OpenAEC Email Studio",
      van: [STUDIO],
      tekst:
        "Welkom!\n\nDit is een demomailbox. In de browser kan Email Studio geen echte e-mail ophalen of versturen; gebruik daarvoor de desktopapp.\n\nProbeer gerust: beantwoorden, markeren met een ster (S), verplaatsen naar het archief en een bijlage openen in Tekst of Rekenblad.\n\nHet OpenAEC-logo hieronder is een inline afbeelding uit een bijlage (cid:).",
      html: `<div style="font-family: Inter, sans-serif; color: #36363e">
<h2 style="color: #d97706; margin: 0 0 12px">Welkom!</h2>
<p>Dit is een <strong>demomailbox</strong>. In de browser kan Email Studio geen echte e-mail ophalen of versturen; gebruik daarvoor de desktopapp.</p>
<p>Probeer gerust: beantwoorden, markeren met een ster (<kbd>S</kbd>), verplaatsen naar het archief en een bijlage openen in Tekst of Rekenblad.</p>
<p><img src="cid:logo@voorbeeld.invalid" alt="OpenAEC-logo" width="24" height="24"> Het logo links is een inline afbeelding uit een bijlage.</p>
</div>`,
    }, [{ bestandsnaam: "logo.png", inhoudstype: "image/png", contentId: "logo@voorbeeld.invalid", inline: true, bytes: base64NaarBytes(LOGO_PNG) }]),
    maakBericht(2, "INBOX", {
      datum: geleden(2),
      onderwerp: "Ontwerpnotitie gevel ter review",
      van: [SANNE],
      cc: [LINDA],
      tekst:
        "Hoi,\n\nIn de bijlage vind je de ontwerpnotitie voor de gevel. Kun je de tabel met uitgangspunten nalopen en je opmerkingen direct in het document zetten?\n\nGroet,\nSanne",
      berichtId: "<gevel-1@ontwerpbureau.invalid>",
    }, [{ bestandsnaam: "Ontwerpnotitie.docx", inhoudstype: inhoudstype("x.docx"), pad: "/voorbeelden/Ontwerpnotitie.docx", grootte: 18000 }]),
    maakBericht(3, "INBOX", {
      datum: geleden(5),
      onderwerp: "Materiaaloverzicht week 44",
      van: [OMAR],
      tekst:
        "Goedemiddag,\n\nHierbij het materiaaloverzicht. De totalen in kolom F zijn bijgewerkt met de nieuwe prijzen.\n\nMet vriendelijke groet,\nOmar Bakker",
      gemarkeerd: true,
    }, [{ bestandsnaam: "Materiaaloverzicht.xlsx", inhoudstype: inhoudstype("x.xlsx"), pad: "/voorbeelden/Materiaaloverzicht.xlsx", grootte: 9000 }]),
    maakBericht(4, "INBOX", {
      datum: geleden(9),
      onderwerp: "Nieuwsbrief: circulair bouwen in de praktijk",
      van: [NIEUWS],
      tekst: "Nieuwsbrief circulair bouwen. Bekijk de webversie: https://voorbeeld.invalid/nieuwsbrief",
      // Bevat bewust actieve inhoud en externe bronnen om de afscherming te tonen.
      html: `<html><head><style>.kop{background:#fff5df;padding:16px;border-radius:8px} @import url("https://voorbeeld.invalid/x.css"); .kop h1{font-size:20px;margin:0}</style>
<script>alert("Dit script wordt nooit uitgevoerd")</script></head>
<body><div class="kop"><h1>Circulair bouwen in de praktijk</h1></div>
<p><img src="https://voorbeeld.invalid/banner.png" alt="Banner" width="560" height="120"></p>
<p>Deze maand: hergebruik van gevelelementen en materiaalpaspoorten.</p>
<p><a href="https://voorbeeld.invalid/artikel?id=42">Lees het artikel</a> · <a href="javascript:alert(1)">Gevaarlijke link</a></p>
<img src="https://voorbeeld.invalid/pixel.gif" width="1" height="1" onerror="alert(2)">
<form action="https://voorbeeld.invalid/inloggen"><input name="wachtwoord"></form>
</body></html>`,
      gelezen: true,
    }),
    maakBericht(5, "INBOX", {
      datum: geleden(26),
      onderwerp: "Re: Planning volgende week",
      van: [LINDA],
      aan: [IK, SANNE],
      tekst:
        "Dinsdag 10:00 schikt mij goed. Zal ik een ruimte reserveren?\n\nLinda\n\nOp maandag schreef Demo Gebruiker <demo@voorbeeld.invalid>:\n> Zullen we de planning dinsdag of woensdag bespreken?",
      inReplyTo: "<planning-1@voorbeeld.invalid>",
      referenties: "<planning-1@voorbeeld.invalid>",
      berichtId: "<planning-2@adviesgroep.invalid>",
      gelezen: true,
      beantwoord: true,
    }),
    maakBericht(6, "INBOX", {
      datum: geleden(50),
      onderwerp: "Afspraak bevestigd",
      van: [OMAR],
      tekst: "Bedankt voor het overleg van vanmorgen. Ik heb de afspraak voor de bouwplaats bevestigd.",
      gelezen: true,
    }),
    maakBericht(7, "Verzonden", {
      datum: geleden(30),
      onderwerp: "Planning volgende week",
      van: [IK],
      aan: [LINDA, SANNE],
      tekst: "Zullen we de planning dinsdag of woensdag bespreken?",
      berichtId: "<planning-1@voorbeeld.invalid>",
      gelezen: true,
    }),
  ];
  // Genoeg berichten om paginering en de gevirtualiseerde lijst te tonen.
  for (let i = 0; i < 240; i++) {
    lijst.push(
      maakBericht(100 + i, "INBOX/Meldingen", {
        datum: geleden(3 + i * 7),
        onderwerp: `Automatische melding ${240 - i}: back-up voltooid`,
        van: [{ naam: "Back-upmelding", adres: "meldingen@voorbeeld.invalid" }],
        tekst: `De nachtelijke back-up nummer ${240 - i} is voltooid.`,
        gelezen: i > 4,
      }),
    );
  }
  return lijst;
}

export interface DemoOpties {
  /** Laadt voorbeeldbestanden; standaard via fetch vanaf de app. */
  laad?: (pad: string) => Promise<Uint8Array>;
  /** Zonder voorbeeldaccount beginnen (voor tests van de wizard). */
  leeg?: boolean;
  /** Gesimuleerde zoektijd van `zoekServers` in ms. */
  vertraging?: number;
}

export class DemoBackend implements MailBackend {
  readonly soort = "demo" as const;
  private data: DemoAccount[] = [];
  private teller = 1;
  private laad: (pad: string) => Promise<Uint8Array>;
  private vertraging: number;

  constructor(opties: DemoOpties = {}) {
    this.vertraging = opties.vertraging ?? 900;
    this.laad =
      opties.laad ??
      (async (pad) => {
        const antwoord = await fetch(pad);
        if (!antwoord.ok) throw new MailFoutMelding("niet-gevonden", `Voorbeeldbestand ${pad} ontbreekt.`);
        return new Uint8Array(await antwoord.arrayBuffer());
      });
    if (!opties.leeg) {
      this.data.push({
        account: {
          id: "demo",
          naam: "Demopostvak",
          volledigeNaam: IK.naam,
          email: IK.adres,
          handtekening: "Demo Gebruiker\nOpenAEC Office Studio",
          imap: { host: "imap.voorbeeld.invalid", poort: 993, beveiliging: "ssl", authenticatie: "normaal", gebruikersnaam: IK.adres },
          smtp: { host: "smtp.voorbeeld.invalid", poort: 465, beveiliging: "ssl", authenticatie: "normaal", gebruikersnaam: IK.adres },
          mappen: {},
          controleerElke: 0,
          externeInhoud: false,
          wachtwoordOpgeslagen: true,
        },
        mappen: MAPPEN(),
        berichten: demoBerichten(),
        volgendeUid: 1000,
      });
    }
  }

  private vind(accountId: string) {
    const gevonden = this.data.find((d) => d.account.id === accountId);
    if (!gevonden) throw new MailFoutMelding("niet-gevonden", "Account bestaat niet.");
    return gevonden;
  }
  private berichtVan(accountId: string, map: string, uid: number) {
    const gevonden = this.vind(accountId).berichten.find((b) => b.bericht.map === map && b.bericht.uid === uid);
    if (!gevonden) throw new MailFoutMelding("niet-gevonden", "Bericht bestaat niet.");
    return gevonden;
  }
  private speciaal(account: DemoAccount, soort: "verzonden" | "concepten" | "prullenbak" | "archief") {
    return account.account.mappen?.[soort] || account.mappen.find((m) => m.speciaal === soort)?.pad || soort;
  }

  async accounts() {
    return this.data.map((d) => structuredClone(d.account));
  }

  async bewaarAccount(invoer: AccountInvoer): Promise<Account> {
    const { wachtwoord, ...rest } = invoer;
    const bestaand = invoer.id ? this.data.find((d) => d.account.id === invoer.id) : undefined;
    if (bestaand) {
      bestaand.account = {
        ...bestaand.account,
        ...rest,
        id: bestaand.account.id,
        wachtwoordOpgeslagen: bestaand.account.wachtwoordOpgeslagen || !!wachtwoord,
      };
      return structuredClone(bestaand.account);
    }
    const account: Account = { ...rest, id: `demo-${++this.teller}`, wachtwoordOpgeslagen: !!wachtwoord };
    this.data.push({
      account,
      mappen: MAPPEN(),
      berichten: [
        maakBericht(1, "INBOX", {
          onderwerp: "Je account is toegevoegd (demo)",
          van: [STUDIO],
          aan: [{ naam: account.volledigeNaam, adres: account.email }],
          tekst: `Het account ${account.email} is in de demo toegevoegd. ${DEMO_MELDING}`,
        }),
      ],
      volgendeUid: 10,
    });
    return structuredClone(account);
  }

  async verwijderAccount(id: string) {
    this.data = this.data.filter((d) => d.account.id !== id);
  }

  async stelConfiguratieVoor(email: string, opties?: { online?: boolean }): Promise<ConfiguratieVoorstel | null> {
    const vast = voorinstelling(email);
    if (vast) return vast;
    // De demo zoekt nooit online; "online" levert hier een gangbare gok op.
    return opties?.online ? gok(email) : null;
  }

  /**
   * Nepvoorstellen voor een paar domeinen, zodat de wizard in de browser te
   * proberen is. Er gaat niets over het netwerk.
   */
  async zoekServers(email: string, opties?: { ispdb?: boolean; proef?: boolean }): Promise<ConfiguratieVoorstel[]> {
    await new Promise((klaar) => setTimeout(klaar, this.vertraging));
    const domein = email.split("@").pop()?.toLowerCase() ?? "";
    const server = (host: string, poort: number, beveiliging: "ssl" | "starttls" | "geen") => ({ host, poort, beveiliging, authenticatie: "normaal" as const, gebruikersnaam: email });
    const proef = (imap: boolean | null, smtp: boolean | null) => (opties?.proef === false ? undefined : { imap, smtp });
    const uit: ConfiguratieVoorstel[] = [];
    const vast = voorinstelling(email);
    if (vast) {
      const oauth = /gmail|googlemail/.test(domein) ? "google" : /outlook|hotmail|live|msn/.test(domein) ? "microsoft" : undefined;
      uit.push({ ...vast, provider: oauth === "google" ? "Google" : oauth === "microsoft" ? "Microsoft (Outlook.com)" : domein, oauth, toelichting: "Bekende provider (demo).", bereikbaar: proef(true, true) });
    } else if (domein.includes("m365") || domein === "ontwerpbureau.nl") {
      uit.push({
        bron: "mx",
        provider: "Microsoft 365",
        toelichting: `MX-record van ${domein} wijst naar mail.protection.outlook.com (demo).`,
        oauth: "microsoft",
        bereikbaar: proef(true, true),
        imap: server("outlook.office365.com", 993, "ssl"),
        smtp: server("smtp.office365.com", 587, "starttls"),
      });
    } else if (domein === "adviesgroep.nl") {
      uit.push({
        bron: "autoconfig",
        provider: "Adviesgroep (eigen server)",
        toelichting: `Gevonden op autoconfig.${domein} (demo).`,
        bereikbaar: proef(true, null),
        imap: server(`mail.${domein}`, 993, "ssl"),
        smtp: server(`mail.${domein}`, 587, "starttls"),
      });
      uit.push({ bron: "srv", toelichting: "_imaps._tcp en _submission._tcp (demo).", bereikbaar: proef(true, true), imap: server(`mail.${domein}`, 993, "ssl"), smtp: server(`mail.${domein}`, 587, "starttls") });
    } else if (domein) {
      if (opties?.ispdb) uit.push({ bron: "ispdb", toelichting: "Uit de Thunderbird-database (demo).", bereikbaar: proef(null, null), imap: server(`imap.${domein}`, 993, "ssl"), smtp: server(`smtp.${domein}`, 465, "ssl") });
      uit.push({ bron: "gok", toelichting: "Gangbare servernamen; de IMAP-proef slaagde (demo).", bereikbaar: proef(true, false), imap: server(`imap.${domein}`, 993, "ssl"), smtp: server(`smtp.${domein}`, 587, "starttls") });
      uit.push({ bron: "gok", toelichting: "Alternatieve servernaam (demo).", bereikbaar: proef(false, true), imap: server(`mail.${domein}`, 993, "ssl"), smtp: server(`mail.${domein}`, 465, "ssl") });
    }
    return uit;
  }

  async test(account: AccountInvoer): Promise<TestUitkomst> {
    const controleer = (s: AccountInvoer["imap"], naam: string) => {
      if (!s.host.trim()) return { ok: false, melding: `Geen ${naam}-server opgegeven.` };
      if (!(s.poort > 0 && s.poort < 65536)) return { ok: false, melding: "Ongeldige poort." };
      if (/fout|invalid-host/i.test(s.host)) return { ok: false, melding: `Demo: ${s.host} is niet bereikbaar.` };
      return {
        ok: true,
        melding: `Demo: verbinding gesimuleerd${s.beveiliging === "geen" ? " (onversleuteld!)" : ""}.`,
      };
    };
    return { imap: controleer(account.imap, "IMAP"), smtp: controleer(account.smtp, "SMTP") };
  }

  async mappen(accountId: string): Promise<Map[]> {
    const account = this.vind(accountId);
    return account.mappen.map((m) => {
      const berichten = account.berichten.filter((b) => b.bericht.map === m.pad);
      return { ...m, totaal: berichten.length, ongelezen: berichten.filter((b) => !b.bericht.gelezen).length };
    });
  }
  async maakMap(accountId: string, pad: string) {
    const account = this.vind(accountId);
    if (account.mappen.some((m) => m.pad === pad)) throw new MailFoutMelding("geweigerd", "Deze map bestaat al.");
    account.mappen.push({ pad, naam: pad.split("/").pop() ?? pad, scheiding: "/", selecteerbaar: true });
  }
  async hernoemMap(accountId: string, pad: string, nieuwPad: string) {
    const account = this.vind(accountId);
    const map = account.mappen.find((m) => m.pad === pad);
    if (!map || map.speciaal === "inbox") throw new MailFoutMelding("geweigerd", "Deze map kan niet worden hernoemd.");
    for (const m of account.mappen)
      if (m.pad === pad || m.pad.startsWith(pad + "/")) {
        m.pad = nieuwPad + m.pad.slice(pad.length);
        m.naam = m.pad.split("/").pop() ?? m.pad;
      }
    for (const b of account.berichten)
      if (b.bericht.map === pad || b.bericht.map.startsWith(pad + "/")) b.bericht.map = nieuwPad + b.bericht.map.slice(pad.length);
  }
  async verwijderMap(accountId: string, pad: string) {
    const account = this.vind(accountId);
    const map = account.mappen.find((m) => m.pad === pad);
    if (!map || map.speciaal) throw new MailFoutMelding("geweigerd", "Speciale mappen kunnen niet worden verwijderd.");
    account.mappen = account.mappen.filter((m) => m.pad !== pad && !m.pad.startsWith(pad + "/"));
    account.berichten = account.berichten.filter((b) => b.bericht.map !== pad && !b.bericht.map.startsWith(pad + "/"));
  }

  async berichten(accountId: string, verzoek: Lijstverzoek): Promise<BerichtLijst> {
    let lijst = this.vind(accountId).berichten.map((b) => b.bericht).filter((b) => b.map === verzoek.map);
    if (verzoek.alleenOngelezen) lijst = lijst.filter((b) => !b.gelezen);
    const zoek = verzoek.zoek?.tekst.trim().toLowerCase();
    if (zoek) {
      const velden = verzoek.zoek!.velden.length ? verzoek.zoek!.velden : ["onderwerp", "van", "aan"];
      const adressen = (a: Adres[]) => a.map((x) => `${x.naam} ${x.adres}`).join(" ").toLowerCase();
      lijst = lijst.filter(
        (b) =>
          (velden.includes("onderwerp") && b.onderwerp.toLowerCase().includes(zoek)) ||
          (velden.includes("van") && adressen(b.van).includes(zoek)) ||
          (velden.includes("aan") && adressen([...b.aan, ...b.cc]).includes(zoek)) ||
          (velden.includes("inhoud") && b.tekst.toLowerCase().includes(zoek)),
      );
    }
    lijst.sort((a, b) => (b.datum ?? "").localeCompare(a.datum ?? ""));
    return {
      totaal: lijst.length,
      berichten: lijst.slice(verzoek.start, verzoek.start + verzoek.aantal).map((b) => {
        const { bcc: _bcc, antwoordAan: _aa, tekst: _t, html: _h, bijlagen: _b, ...kop } = b;
        return structuredClone(kop);
      }),
    };
  }

  async bericht(accountId: string, map: string, uid: number) {
    return structuredClone(this.berichtVan(accountId, map, uid).bericht);
  }

  async bijlage(accountId: string, map: string, uid: number, index: number) {
    const bron = this.berichtVan(accountId, map, uid).bronnen[index];
    if (!bron) throw new MailFoutMelding("niet-gevonden", "Bijlage bestaat niet.");
    return "bytes" in bron ? bron.bytes.slice() : this.laad(bron.pad);
  }

  async bron(accountId: string, map: string, uid: number) {
    const b = this.berichtVan(accountId, map, uid).bericht;
    const adres = (a: Adres[]) => a.map((x) => (x.naam ? `"${x.naam}" <${x.adres}>` : x.adres)).join(", ");
    const eml = [
      `From: ${adres(b.van)}`,
      `To: ${adres(b.aan)}`,
      ...(b.cc.length ? [`Cc: ${adres(b.cc)}`] : []),
      `Subject: ${b.onderwerp}`,
      `Date: ${new Date(b.datum ?? Date.now()).toUTCString()}`,
      `Message-ID: ${b.berichtId ?? ""}`,
      ...(b.inReplyTo ? [`In-Reply-To: ${b.inReplyTo}`] : []),
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "X-Demo: OpenAEC Email Studio",
      "",
      b.tekst,
    ].join("\r\n");
    return new TextEncoder().encode(eml);
  }

  async markeer(accountId: string, map: string, uids: number[], vlag: "gelezen" | "gemarkeerd" | "beantwoord", aan: boolean) {
    for (const uid of uids) this.berichtVan(accountId, map, uid).bericht[vlag] = aan;
  }

  async verplaats(accountId: string, map: string, uids: number[], doel: string) {
    const account = this.vind(accountId);
    if (!account.mappen.some((m) => m.pad === doel)) throw new MailFoutMelding("niet-gevonden", "Doelmap bestaat niet.");
    for (const uid of uids) {
      const b = this.berichtVan(accountId, map, uid);
      b.bericht.map = doel;
      b.bericht.uid = account.volgendeUid++;
    }
  }

  async verwijder(accountId: string, map: string, uids: number[], definitief: boolean) {
    const account = this.vind(accountId);
    const prullenbak = this.speciaal(account, "prullenbak");
    if (definitief || map === prullenbak) {
      account.berichten = account.berichten.filter((b) => !(b.bericht.map === map && uids.includes(b.bericht.uid)));
      return;
    }
    await this.verplaats(accountId, map, uids, prullenbak);
  }

  private uitOpstelling(account: DemoAccount, map: string, opstelling: Opstelling, berichtId: string) {
    const lees = (lijst: string[]) => lijst.map((a) => {
      const m = /^(.*?)<([^>]+)>$/.exec(a.trim());
      return m ? { naam: m[1].trim().replace(/^"|"$/g, ""), adres: m[2] } : { naam: "", adres: a.trim() };
    });
    return maakBericht(
      account.volgendeUid++,
      map,
      {
        datum: new Date().toISOString(),
        onderwerp: opstelling.onderwerp,
        van: lees([opstelling.van]),
        aan: lees(opstelling.aan),
        cc: lees(opstelling.cc),
        bcc: lees(opstelling.bcc),
        tekst: opstelling.tekst,
        html: opstelling.html ?? "",
        gelezen: true,
        berichtId,
        inReplyTo: opstelling.inReplyTo,
        referenties: opstelling.referenties,
      },
      opstelling.bijlagen.map((b) => ({ bestandsnaam: b.bestandsnaam, inhoudstype: b.inhoudstype, bytes: b.bytes })),
    );
  }

  async verstuur(accountId: string, opstelling: Opstelling) {
    const account = this.vind(accountId);
    const ontvangers = [...opstelling.aan, ...opstelling.cc, ...opstelling.bcc];
    if (!ontvangers.length) throw new MailFoutMelding("geweigerd", "Geen ontvangers opgegeven.");
    if (ontvangers.some((a) => /@fout\.invalid>?$/i.test(a.trim())))
      throw new MailFoutMelding("geweigerd", "Demo: de server weigert ontvanger @fout.invalid.");
    const grootte = opstelling.bijlagen.reduce((som, b) => som + b.bytes.length, 0);
    if (grootte > 25 * 1024 * 1024) throw new MailFoutMelding("te-groot", "Demo: maximaal 25 MB aan bijlagen.");
    const berichtId = `<demo-${crypto.randomUUID()}@voorbeeld.invalid>`;
    account.berichten.push(this.uitOpstelling(account, this.speciaal(account, "verzonden"), opstelling, berichtId));
    return { berichtId };
  }

  async bewaarConcept(accountId: string, opstelling: Opstelling) {
    const account = this.vind(accountId);
    const map = this.speciaal(account, "concepten");
    account.berichten.push(this.uitOpstelling(account, map, opstelling, `<concept-${crypto.randomUUID()}@voorbeeld.invalid>`));
  }

  async oauthStatus(): Promise<Record<OAuthProvider, OAuthStatus>> {
    const status = { beschikbaar: false, melding: "Aanmelden met Microsoft of Google kan alleen in de desktopapp." };
    return { microsoft: { ...status }, google: { ...status } };
  }

  async meldAanMetOAuth(_provider: OAuthProvider, _account: AccountInvoer): Promise<Account> {
    throw new MailFoutMelding("niet-beschikbaar", "Aanmelden met Microsoft of Google kan alleen in de desktopapp.");
  }

  async annuleerOAuth() {
    // Niets lopend in de demo.
  }

  async contacten(accountId: string, zoek: string): Promise<Adres[]> {
    const account = this.vind(accountId);
    const term = zoek.trim().toLowerCase();
    const gezien = new globalThis.Map<string, Adres>();
    for (const { bericht } of account.berichten)
      for (const adres of [...bericht.van, ...bericht.aan, ...bericht.cc])
        if (adres.adres !== account.account.email && !gezien.has(adres.adres.toLowerCase())) gezien.set(adres.adres.toLowerCase(), adres);
    return [...gezien.values()]
      .filter((a) => !term || a.naam.toLowerCase().includes(term) || a.adres.toLowerCase().includes(term))
      .slice(0, 10);
  }
}
