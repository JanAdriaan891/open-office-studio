import type { ConfiguratieVoorstel, OAuthProvider, ServerInstelling } from "./contract";
import { domeinVan } from "./voorinstellingen";

export const PROVIDERNAAM: Record<OAuthProvider, string> = {
  microsoft: "Microsoft",
  google: "Google",
};

const GOOGLE_DOMEINEN = ["gmail.com", "googlemail.com"];
const MICROSOFT_DOMEINEN = ["outlook.com", "outlook.nl", "hotmail.com", "hotmail.nl", "live.com", "live.nl", "msn.com"];

/**
 * Welke OAuth2-aanmelding past bij dit adres? Op het domein (gmail.com →
 * Google, outlook.com/hotmail/live/onmicrosoft.com → Microsoft) of, voor een
 * eigen domein, op de servers uit de voorinstelling of autoconfig (Microsoft
 * 365 of Google Workspace).
 */
export function herkenProvider(email: string, voorstel?: ConfiguratieVoorstel | null): OAuthProvider | null {
  const domein = domeinVan(email);
  if (!domein) return null;
  if (GOOGLE_DOMEINEN.includes(domein)) return "google";
  if (MICROSOFT_DOMEINEN.includes(domein) || /^hotmail\.|^live\./.test(domein) || domein.endsWith(".onmicrosoft.com") || domein === "onmicrosoft.com")
    return "microsoft";
  const hosts = voorstel ? [voorstel.imap.host, voorstel.smtp.host].map((h) => h.toLowerCase()) : [];
  if (hosts.some((h) => /(^|\.)(office365\.com|outlook\.com|office\.com)$/.test(h))) return "microsoft";
  if (hosts.some((h) => /(^|\.)(gmail\.com|googlemail\.com|google\.com)$/.test(h))) return "google";
  return null;
}

/** Standaardservers voor OAuth2-accounts; de backend kan ze aanvullen. */
export function oauthServers(provider: OAuthProvider, email: string): { imap: ServerInstelling; smtp: ServerInstelling } {
  const server = (host: string, poort: number, beveiliging: ServerInstelling["beveiliging"]): ServerInstelling => ({
    host,
    poort,
    beveiliging,
    authenticatie: "oauth2",
    gebruikersnaam: email,
  });
  return provider === "microsoft"
    ? { imap: server("outlook.office365.com", 993, "ssl"), smtp: server("smtp.office365.com", 587, "starttls") }
    : { imap: server("imap.gmail.com", 993, "ssl"), smtp: server("smtp.gmail.com", 465, "ssl") };
}

/** Optionele uitbreiding van de desktopbackend: eigen OAuth-client instellen. */
export interface OAuthClientInstelling {
  bewaarOAuthClient(provider: OAuthProvider, clientId: string, clientSecret?: string): Promise<void>;
}

export function kanOAuthClientBewaren(backend: unknown): backend is OAuthClientInstelling {
  return typeof (backend as Partial<OAuthClientInstelling>)?.bewaarOAuthClient === "function";
}

export const OAUTH_DOCUMENTATIE = "docs/email-oauth.md";
