import type { Beveiliging, ConfiguratieVoorstel } from "./contract";

/**
 * Voorinstellingen voor bekende providers (offline, zonder netwerkverkeer).
 * De desktopbackend heeft een eigen lijst en kan daarna online zoeken; deze
 * lijst dient de demo en als terugval in de interface.
 */
type Server = [host: string, poort: number, beveiliging: Beveiliging];
const PROVIDERS: { domeinen: string[]; imap: Server; smtp: Server }[] = [
  { domeinen: ["gmail.com", "googlemail.com"], imap: ["imap.gmail.com", 993, "ssl"], smtp: ["smtp.gmail.com", 465, "ssl"] },
  {
    domeinen: ["outlook.com", "hotmail.com", "hotmail.nl", "live.com", "live.nl", "msn.com"],
    imap: ["outlook.office365.com", 993, "ssl"],
    smtp: ["smtp-mail.outlook.com", 587, "starttls"],
  },
  { domeinen: ["yahoo.com", "yahoo.nl", "ymail.com"], imap: ["imap.mail.yahoo.com", 993, "ssl"], smtp: ["smtp.mail.yahoo.com", 465, "ssl"] },
  { domeinen: ["icloud.com", "me.com", "mac.com"], imap: ["imap.mail.me.com", 993, "ssl"], smtp: ["smtp.mail.me.com", 587, "starttls"] },
  { domeinen: ["ziggo.nl", "upcmail.nl", "home.nl", "casema.nl", "quicknet.nl"], imap: ["imap.ziggo.nl", 993, "ssl"], smtp: ["smtp.ziggo.nl", 587, "starttls"] },
  { domeinen: ["kpnmail.nl", "kpnplanet.nl", "planet.nl", "hetnet.nl", "telfort.nl"], imap: ["imap.kpnmail.nl", 993, "ssl"], smtp: ["smtp.kpnmail.nl", 587, "starttls"] },
  { domeinen: ["xs4all.nl"], imap: ["imap.xs4all.nl", 993, "ssl"], smtp: ["smtp.xs4all.nl", 465, "ssl"] },
  { domeinen: ["gmx.com", "gmx.net", "gmx.de"], imap: ["imap.gmx.net", 993, "ssl"], smtp: ["mail.gmx.net", 465, "ssl"] },
  { domeinen: ["fastmail.com", "fastmail.fm"], imap: ["imap.fastmail.com", 993, "ssl"], smtp: ["smtp.fastmail.com", 465, "ssl"] },
  { domeinen: ["posteo.de", "posteo.net"], imap: ["posteo.de", 993, "ssl"], smtp: ["posteo.de", 465, "ssl"] },
  { domeinen: ["mailbox.org"], imap: ["imap.mailbox.org", 993, "ssl"], smtp: ["smtp.mailbox.org", 465, "ssl"] },
];

export function domeinVan(email: string) {
  return email.split("@").pop()?.trim().toLowerCase() ?? "";
}

export function voorinstelling(email: string): ConfiguratieVoorstel | null {
  const domein = domeinVan(email);
  const provider = PROVIDERS.find((p) => p.domeinen.includes(domein));
  if (!provider) return null;
  const server = ([host, poort, beveiliging]: Server) => ({ host, poort, beveiliging, authenticatie: "normaal" as const, gebruikersnaam: email });
  return { bron: "voorinstelling", imap: server(provider.imap), smtp: server(provider.smtp) };
}

/** Gangbare gok zoals Thunderbird die doet: imap./smtp. op het eigen domein. */
export function gok(email: string): ConfiguratieVoorstel {
  const domein = domeinVan(email);
  return {
    bron: "gok",
    imap: { host: `imap.${domein}`, poort: 993, beveiliging: "ssl", authenticatie: "normaal", gebruikersnaam: email },
    smtp: { host: `smtp.${domein}`, poort: 465, beveiliging: "ssl", authenticatie: "normaal", gebruikersnaam: email },
  };
}

export const STANDAARDPOORT: Record<"imap" | "smtp", Record<Beveiliging, number>> = {
  imap: { ssl: 993, starttls: 143, geen: 143 },
  smtp: { ssl: 465, starttls: 587, geen: 25 },
};
