import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfiguratieVoorstel } from "./contract";
import { maakKaarten, ServerZoeker, zoekStappen, type ZoekUitkomst } from "./serverzoeker";
import { herkenProvider, oauthServers } from "./oauth";
import { DemoBackend } from "./demo-backend";

const server = (host: string, poort: number, beveiliging: "ssl" | "starttls" | "geen" = "ssl") => ({ host, poort, beveiliging, authenticatie: "normaal" as const });

describe("ServerZoeker: debounce en annuleren", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("zoekt pas na de pauze en één keer voor snel typen", async () => {
    const zoek = vi.fn(async (email: string) => [{ bron: "gok", imap: server(`imap.${email}`, 993), smtp: server("smtp", 465) }] as ConfiguratieVoorstel[]);
    const uitkomsten: ZoekUitkomst[] = [];
    const z = new ServerZoeker(zoek, (u) => uitkomsten.push(u), 600);
    z.wijzig("a@b");
    z.wijzig("a@b.n");
    z.wijzig("a@b.nl");
    await vi.advanceTimersByTimeAsync(599);
    expect(zoek).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(zoek).toHaveBeenCalledTimes(1);
    expect(zoek).toHaveBeenCalledWith("a@b.nl");
    expect(uitkomsten.at(-1)).toMatchObject({ status: "klaar", email: "a@b.nl" });
  });

  it("negeert de uitkomst van een verouderde zoekopdracht", async () => {
    const wachtend: ((v: ConfiguratieVoorstel[]) => void)[] = [];
    const zoek = vi.fn(() => new Promise<ConfiguratieVoorstel[]>((klaar) => wachtend.push(klaar)));
    const uitkomsten: ZoekUitkomst[] = [];
    const z = new ServerZoeker(zoek, (u) => uitkomsten.push(u), 600);
    z.wijzig("oud@voorbeeld.nl");
    await vi.advanceTimersByTimeAsync(600);
    z.wijzig("nieuw@voorbeeld.nl");
    await vi.advanceTimersByTimeAsync(600);
    // De nieuwe is eerst klaar, daarna pas de oude.
    wachtend[1]([{ bron: "srv", imap: server("nieuw", 993), smtp: server("nieuw", 465) }]);
    await vi.advanceTimersByTimeAsync(0);
    wachtend[0]([{ bron: "gok", imap: server("oud", 993), smtp: server("oud", 465) }]);
    await vi.advanceTimersByTimeAsync(0);
    const klaar = uitkomsten.filter((u) => u.status === "klaar");
    expect(klaar).toHaveLength(1);
    expect(klaar[0]).toMatchObject({ email: "nieuw@voorbeeld.nl" });
  });

  it("meldt leeg bij een ongeldig adres en stopt een geplande zoektocht", async () => {
    const zoek = vi.fn(async () => [] as ConfiguratieVoorstel[]);
    const uitkomsten: ZoekUitkomst[] = [];
    const z = new ServerZoeker(zoek, (u) => uitkomsten.push(u), 600);
    z.wijzig("a@b.nl");
    z.wijzig("a@");
    await vi.advanceTimersByTimeAsync(1000);
    expect(zoek).not.toHaveBeenCalled();
    expect(uitkomsten.at(-1)).toEqual({ status: "leeg" });
    z.wijzig("c@d.nl");
    z.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(zoek).not.toHaveBeenCalled();
  });

  it("zoekt opnieuw bij gelijke invoer als dat gevraagd wordt (andere opties)", async () => {
    const zoek = vi.fn(async () => [] as ConfiguratieVoorstel[]);
    const z = new ServerZoeker(zoek, () => {}, 600);
    z.wijzig("a@b.nl");
    await vi.advanceTimersByTimeAsync(600);
    z.wijzig("a@b.nl");
    await vi.advanceTimersByTimeAsync(600);
    expect(zoek).toHaveBeenCalledTimes(1);
    z.wijzig("a@b.nl", true);
    await vi.advanceTimersByTimeAsync(600);
    expect(zoek).toHaveBeenCalledTimes(2);
  });
});

describe("kaartlogica", () => {
  const voorstellen: ConfiguratieVoorstel[] = [
    { bron: "mx", provider: "Microsoft 365", toelichting: "MX wijst naar outlook", oauth: "microsoft", bereikbaar: { imap: true, smtp: null }, imap: server("outlook.office365.com", 993), smtp: server("smtp.office365.com", 587, "starttls") },
    { bron: "srv", bereikbaar: { imap: null, smtp: true }, imap: server("OUTLOOK.office365.com", 993), smtp: server("smtp.office365.com", 587, "starttls") },
    { bron: "gok", bereikbaar: { imap: false, smtp: null }, imap: server("mail.x.nl", 143, "geen"), smtp: server("mail.x.nl", 25, "geen") },
  ];
  it("houdt de volgorde, voegt gelijke servers samen en combineert de proef", () => {
    const kaarten = maakKaarten(voorstellen, "x.nl");
    expect(kaarten).toHaveLength(2);
    expect(kaarten[0].titel).toBe("Microsoft 365");
    expect(kaarten[0].bron).toBe("MX-records (provider herkend) + DNS-SRV-records");
    expect(kaarten[0].imapBereikbaar.tekst).toBe("bereikbaar");
    expect(kaarten[0].smtpBereikbaar).toEqual({ teken: "✓", tekst: "bereikbaar" });
    expect(kaarten[0].oauth).toBe("microsoft");
    expect(kaarten[0].smtp).toBe("smtp.office365.com:587 · STARTTLS");
  });
  it("toont bereikbaarheid ook in tekst en markeert onversleuteld", () => {
    const [, gok] = maakKaarten(voorstellen, "x.nl");
    expect(gok.titel).toBe("x.nl");
    expect(gok.imapBereikbaar).toEqual({ teken: "✗", tekst: "niet bereikbaar" });
    expect(gok.smtpBereikbaar).toEqual({ teken: "?", tekst: "niet getest" });
    expect(gok.onversleuteld).toBe(true);
  });
  it("leidt de stappen af uit de uitkomst", () => {
    expect(zoekStappen({ status: "bezig", email: "a@x.nl" }, false).every((s) => s.status === "bezig")).toBe(true);
    const stappen = zoekStappen({ status: "klaar", email: "a@x.nl", voorstellen }, true);
    expect(stappen.map((s) => `${s.naam}:${s.status}`)).toEqual([
      "Ingebouwde lijst:niets",
      "Eigen domein:niets",
      "DNS:gevonden",
      "Thunderbird-database:niets",
      "Verbindingsproef:gevonden",
    ]);
  });
});

describe("providerherkenning voor OAuth2", () => {
  it("herkent Google en Microsoft aan het domein", () => {
    expect(herkenProvider("a@gmail.com")).toBe("google");
    expect(herkenProvider("a@googlemail.com")).toBe("google");
    expect(herkenProvider("a@outlook.com")).toBe("microsoft");
    expect(herkenProvider("a@hotmail.nl")).toBe("microsoft");
    expect(herkenProvider("a@live.com")).toBe("microsoft");
    expect(herkenProvider("a@bedrijf.onmicrosoft.com")).toBe("microsoft");
    expect(herkenProvider("a@ziggo.nl")).toBeNull();
  });
  it("herkent een eigen domein aan de servers uit het voorstel", () => {
    const m365: ConfiguratieVoorstel = { bron: "mx", imap: server("outlook.office365.com", 993), smtp: server("smtp.office365.com", 587, "starttls") };
    const workspace: ConfiguratieVoorstel = { bron: "voorinstelling", imap: server("imap.gmail.com", 993), smtp: server("smtp.gmail.com", 465) };
    expect(herkenProvider("a@bureau.nl", m365)).toBe("microsoft");
    expect(herkenProvider("a@bureau.nl", workspace)).toBe("google");
    expect(herkenProvider("a@bureau.nl", { bron: "gok", imap: server("imap.bureau.nl", 993), smtp: server("smtp.bureau.nl", 465) })).toBeNull();
  });
  it("geeft OAuth2-servers met de juiste authenticatie", () => {
    const s = oauthServers("microsoft", "a@b.nl");
    expect(s.imap).toMatchObject({ host: "outlook.office365.com", authenticatie: "oauth2", gebruikersnaam: "a@b.nl" });
    expect(oauthServers("google", "a@b.nl").smtp.host).toBe("smtp.gmail.com");
  });
});

describe("DemoBackend: zoeken en OAuth", () => {
  it("geeft realistische nepvoorstellen", async () => {
    const demo = new DemoBackend({ vertraging: 0 });
    expect((await demo.zoekServers("a@gmail.com"))[0]).toMatchObject({ bron: "voorinstelling", oauth: "google" });
    expect((await demo.zoekServers("a@ontwerpbureau.nl"))[0]).toMatchObject({ bron: "mx", provider: "Microsoft 365", oauth: "microsoft" });
    const eigen = await demo.zoekServers("a@eigenbureau.nl");
    expect(eigen.map((v) => v.bron)).toEqual(["gok", "gok"]);
    expect((await demo.zoekServers("a@eigenbureau.nl", { ispdb: true }))[0].bron).toBe("ispdb");
  });
  it("meldt OAuth als niet beschikbaar in de browser", async () => {
    const demo = new DemoBackend({ vertraging: 0 });
    const status = await demo.oauthStatus();
    expect(status.microsoft.beschikbaar).toBe(false);
    expect(status.google.melding).toMatch(/desktopapp/);
    await expect(demo.meldAanMetOAuth("google", {} as never)).rejects.toMatchObject({ code: "niet-beschikbaar" });
  });
});

describe("voortgangsevents", () => {
  it("vertaalt backendstappen en laat ze voorgaan tijdens het zoeken", async () => {
    const { voortgangNaarStap, metVoortgang, zoekStappen } = await import("./serverzoeker");
    expect(voortgangNaarStap({ stap: "autoconfig", status: "bezig" })).toEqual({ naam: "Eigen domein", status: "bezig" });
    expect(voortgangNaarStap({ stap: "mx", status: "gevonden" })).toEqual({ naam: "DNS", status: "gevonden" });
    expect(voortgangNaarStap({ stap: "onbekend", status: "bezig" })).toBeNull();
    const bezig = zoekStappen({ status: "bezig", email: "a@b.nl" }, false);
    const stappen = metVoortgang(bezig, { "Ingebouwde lijst": "niets", "Eigen domein": "bezig" }, true);
    expect(stappen.map((s) => s.status)).toEqual(["niets", "bezig", "wacht", "wacht"]);
    expect(metVoortgang(bezig, {}, true).every((s) => s.status === "bezig")).toBe(true);
  });
});

describe("externe afbeeldingen via de host", () => {
  it("haalt beperkt parallel op, weigert niet-afbeeldingen en geeft blob-URL's vrij", async () => {
    const { laadExterneAfbeeldingen } = await import("./backend");
    let actief = 0;
    let piek = 0;
    const haal = async (url: string) => {
      actief++;
      piek = Math.max(piek, actief);
      await new Promise((r) => setTimeout(r, 5));
      actief--;
      if (url.includes("fout")) throw new Error("x");
      return { bytes: new Uint8Array([1, 2, 3]), contentType: url.endsWith(".html") ? "text/html" : "image/png" };
    };
    const urls = ["a.png", "b.png", "c.png", "d.png", "e.png", "fout.png", "g.html"].map((u) => `https://x.invalid/${u}`);
    const uit = await laadExterneAfbeeldingen(urls, haal, 3);
    expect(piek).toBeLessThanOrEqual(3);
    expect(Object.keys(uit.urls)).toHaveLength(5);
    expect(uit.mislukt).toBe(2);
    expect(Object.values(uit.urls).every((u) => u.startsWith("blob:"))).toBe(true);
    uit.vrijgeven();
  });
});
