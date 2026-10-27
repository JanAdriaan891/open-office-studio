import { describe, expect, it } from "vitest";
import { formatAdres, isGeldigAdres, parseAdressen, uniekeAdressen } from "./adressen";
import { bouwAntwoord, bouwReferenties, citeerTekst, onderwerpVoorAntwoord, onderwerpVoorDoorsturen } from "./citaat";
import { eigenTekst, vergetenBijlage } from "./bijlagecontrole";
import { DemoBackend } from "./demo-backend";
import { naarMailFout, foutTekst } from "./fouten";
import { kantoorModule } from "./kantoor";
import { naarBase64, naarBytes } from "./tauri-backend";
import type { Bericht } from "./contract";

describe("adresparser", () => {
  it("leest namen, aanhalingstekens en losse adressen", () => {
    expect(parseAdressen(`"Naam" <a@b.nl>, c@d.nl`)).toEqual([
      { naam: "Naam", adres: "a@b.nl" },
      { naam: "", adres: "c@d.nl" },
    ]);
  });
  it("splitst niet op komma's binnen aanhalingstekens en accepteert puntkomma's", () => {
    expect(parseAdressen(`"Jansen, Piet" <piet@x.nl>; Ans de Wit <ans@x.nl>\nmailto:info@x.nl`)).toEqual([
      { naam: "Jansen, Piet", adres: "piet@x.nl" },
      { naam: "Ans de Wit", adres: "ans@x.nl" },
      { naam: "", adres: "info@x.nl" },
    ]);
  });
  it("formatteert met aanhalingstekens waar nodig", () => {
    expect(formatAdres({ naam: "Jansen, Piet", adres: "p@x.nl" })).toBe(`"Jansen, Piet" <p@x.nl>`);
    expect(formatAdres({ naam: "Ans", adres: "a@x.nl" })).toBe("Ans <a@x.nl>");
    expect(formatAdres({ naam: "", adres: "a@x.nl" })).toBe("a@x.nl");
    expect(parseAdressen(formatAdres({ naam: `Een "quote"`, adres: "q@x.nl" }))).toEqual([{ naam: `Een "quote"`, adres: "q@x.nl" }]);
  });
  it("controleert adressen", () => {
    expect(isGeldigAdres("a@b.nl")).toBe(true);
    expect(isGeldigAdres("a@b")).toBe(false);
    expect(isGeldigAdres("a b@c.nl")).toBe(false);
    expect(isGeldigAdres("a@@c.nl")).toBe(false);
  });
  it("ontdubbelt hoofdletterongevoelig", () => {
    expect(uniekeAdressen([{ naam: "A", adres: "A@x.nl" }, { naam: "", adres: "a@x.nl" }, { naam: "", adres: "b@x.nl" }], ["b@x.nl"])).toEqual([
      { naam: "A", adres: "A@x.nl" },
    ]);
  });
});

const ORIGINEEL: Bericht = {
  uid: 5,
  map: "INBOX",
  datum: "2026-10-26T09:30:00Z",
  onderwerp: "Re: Planning",
  van: [{ naam: "Linda", adres: "linda@x.nl" }],
  aan: [{ naam: "Ik", adres: "ik@x.nl" }, { naam: "Sanne", adres: "sanne@x.nl" }],
  cc: [{ naam: "Omar", adres: "omar@x.nl" }, { naam: "Ik", adres: "IK@x.nl" }],
  bcc: [],
  antwoordAan: [],
  gelezen: true,
  gemarkeerd: false,
  beantwoord: false,
  grootte: 10,
  heeftBijlagen: false,
  berichtId: "<b@x.nl>",
  inReplyTo: "<a@x.nl>",
  referenties: "<a@x.nl>",
  tekst: "Dinsdag past.\n> eerder citaat",
  html: "",
  bijlagen: [],
};

describe("citaatopbouw", () => {
  it("bouwt onderwerpen zonder dubbele voorvoegsels", () => {
    expect(onderwerpVoorAntwoord("Re: RE: Antw: Planning")).toBe("Re: Planning");
    expect(onderwerpVoorAntwoord("Planning")).toBe("Re: Planning");
    expect(onderwerpVoorDoorsturen("Fwd: FW: Planning")).toBe("Fwd: Planning");
  });
  it("citeert regels met > en nest bestaande citaten", () => {
    expect(citeerTekst("a\n> b\n")).toBe("> a\n>> b");
  });
  it("bouwt References uit eerdere References en Message-ID", () => {
    expect(bouwReferenties(ORIGINEEL)).toBe("<a@x.nl> <b@x.nl>");
    expect(bouwReferenties({ berichtId: "c@x.nl" })).toBe("<c@x.nl>");
  });
  it("beantwoorden: naar afzender, met In-Reply-To en citaat", () => {
    const a = bouwAntwoord(ORIGINEEL, "antwoord", ["ik@x.nl"]);
    expect(a.aan).toEqual([{ naam: "Linda", adres: "linda@x.nl" }]);
    expect(a.cc).toEqual([]);
    expect(a.onderwerp).toBe("Re: Planning");
    expect(a.inReplyTo).toBe("<b@x.nl>");
    expect(a.referenties).toBe("<a@x.nl> <b@x.nl>");
    expect(a.tekst).toMatch(/schreef Linda <linda@x\.nl>:\n> Dinsdag past\.\n>> eerder citaat$/);
    expect(a.html).toContain(`<blockquote type="cite">`);
  });
  it("allen beantwoorden: zonder eigen adres en zonder dubbelingen", () => {
    const a = bouwAntwoord(ORIGINEEL, "allen", ["ik@x.nl"]);
    expect(a.aan?.map((x) => x.adres)).toEqual(["linda@x.nl", "sanne@x.nl"]);
    expect(a.cc?.map((x) => x.adres)).toEqual(["omar@x.nl"]);
  });
  it("gebruikt Antwoord-aan als die er is", () => {
    const a = bouwAntwoord({ ...ORIGINEEL, antwoordAan: [{ naam: "", adres: "lijst@x.nl" }] }, "antwoord", []);
    expect(a.aan).toEqual([{ naam: "", adres: "lijst@x.nl" }]);
  });
  it("doorsturen: kop met het origineel, zonder ontvangers en draadkoppen", () => {
    const a = bouwAntwoord({ ...ORIGINEEL, html: `<p onclick="x()">Hoi</p>` }, "doorsturen", []);
    expect(a.onderwerp).toBe("Fwd: Re: Planning");
    expect(a.aan).toBeUndefined();
    expect(a.inReplyTo).toBeUndefined();
    expect(a.tekst).toContain("-------- Doorgestuurd bericht --------");
    expect(a.tekst).toContain("Van: Linda <linda@x.nl>");
    expect(a.html).toContain("<p>Hoi</p>");
    expect(a.html).not.toContain("onclick");
  });
});

describe("vergeten bijlage", () => {
  it("herkent het woord bijlage zonder bijlage", () => {
    expect(vergetenBijlage("Zie de bijlage voor de details.", "Overzicht", 0)).toBe("bijlage");
    expect(vergetenBijlage("Bijgaand het overzicht", "", 0)).toBe("bijgaand");
    expect(vergetenBijlage("", "Offerte (zie bijlage)", 0)).toBe("bijlage");
  });
  it("waarschuwt niet met bijlage of bij andere woorden", () => {
    expect(vergetenBijlage("Zie de bijlage.", "", 1)).toBeNull();
    expect(vergetenBijlage("Bijlagenummer volgt; geen bestand", "", 0)).toBeNull();
    expect(vergetenBijlage("Tot morgen!", "", 0)).toBeNull();
  });
  it("negeert citaten, doorgestuurde delen en handtekening", () => {
    const tekst = "Prima, akkoord.\n\nOp 1 januari schreef Piet <p@x.nl>:\n> zie bijlage";
    expect(eigenTekst(tekst)).toBe("Prima, akkoord.\n");
    expect(vergetenBijlage(tekst, "Re: Offerte", 0)).toBeNull();
    expect(vergetenBijlage("Ok\n> in de bijlage", "", 0)).toBeNull();
    expect(vergetenBijlage("Ok\n-- \nBijlagen altijd welkom", "", 0)).toBeNull();
  });
});

describe("DemoBackend", () => {
  const laad = async (pad: string) => new TextEncoder().encode(`inhoud van ${pad}`);
  it("heeft een demo-account met inbox, ongelezen-aantallen en bijlagen", async () => {
    const demo = new DemoBackend({ laad });
    expect(demo.soort).toBe("demo");
    const [account] = await demo.accounts();
    const mappen = await demo.mappen(account.id);
    const inbox = mappen.find((m) => m.speciaal === "inbox")!;
    expect(inbox.ongelezen).toBeGreaterThan(0);
    const lijst = await demo.berichten(account.id, { map: "INBOX", start: 0, aantal: 50 });
    expect(lijst.totaal).toBe(lijst.berichten.length);
    const metBijlage = lijst.berichten.find((b) => b.onderwerp.startsWith("Ontwerpnotitie"))!;
    expect(metBijlage.heeftBijlagen).toBe(true);
    const bericht = await demo.bericht(account.id, "INBOX", metBijlage.uid);
    expect(bericht.bijlagen[0].bestandsnaam).toBe("Ontwerpnotitie.docx");
    expect(new TextDecoder().decode(await demo.bijlage(account.id, "INBOX", metBijlage.uid, 0))).toContain("Ontwerpnotitie.docx");
  });
  it("pagineert nieuwste eerst en filtert op ongelezen en zoektekst", async () => {
    const demo = new DemoBackend({ laad });
    const pagina = await demo.berichten("demo", { map: "INBOX/Meldingen", start: 100, aantal: 50 });
    expect(pagina.totaal).toBe(240);
    expect(pagina.berichten).toHaveLength(50);
    expect(pagina.berichten[0].datum! > pagina.berichten[1].datum!).toBe(true);
    const ongelezen = await demo.berichten("demo", { map: "INBOX/Meldingen", start: 0, aantal: 500, alleenOngelezen: true });
    expect(ongelezen.berichten.every((b) => !b.gelezen)).toBe(true);
    const zoek = await demo.berichten("demo", { map: "INBOX", start: 0, aantal: 50, zoek: { tekst: "sanne", velden: ["van"] } });
    expect(zoek.berichten.map((b) => b.van[0].naam)).toEqual(["Sanne de Vries"]);
  });
  it("markeert, verplaatst en verwijdert via de prullenbak", async () => {
    const demo = new DemoBackend({ laad });
    await demo.markeer("demo", "INBOX", [1], "gelezen", true);
    expect((await demo.bericht("demo", "INBOX", 1)).gelezen).toBe(true);
    await demo.verwijder("demo", "INBOX", [1], false);
    const prullenbak = await demo.berichten("demo", { map: "Prullenbak", start: 0, aantal: 10 });
    expect(prullenbak.totaal).toBe(1);
    await demo.verwijder("demo", "Prullenbak", [prullenbak.berichten[0].uid], false);
    expect((await demo.berichten("demo", { map: "Prullenbak", start: 0, aantal: 10 })).totaal).toBe(0);
  });
  it("verstuurt naar Verzonden, bewaart concepten en meldt fouten met een code", async () => {
    const demo = new DemoBackend({ laad });
    const opstelling = { van: "demo@voorbeeld.invalid", aan: ["a@x.nl"], cc: [], bcc: [], onderwerp: "Test", tekst: "Hoi", bijlagen: [] };
    const { berichtId } = await demo.verstuur("demo", opstelling);
    expect(berichtId).toMatch(/^<demo-/);
    const verzonden = await demo.berichten("demo", { map: "Verzonden", start: 0, aantal: 10 });
    expect(verzonden.berichten[0].onderwerp).toBe("Test");
    await demo.bewaarConcept("demo", opstelling);
    expect((await demo.berichten("demo", { map: "Concepten", start: 0, aantal: 10 })).totaal).toBe(1);
    await expect(demo.verstuur("demo", { ...opstelling, aan: [] })).rejects.toMatchObject({ code: "geweigerd" });
    await expect(demo.verstuur("demo", { ...opstelling, aan: ["x@fout.invalid"] })).rejects.toMatchObject({ code: "geweigerd" });
  });
  it("account toevoegen: voorinstelling, test per server en geen wachtwoord terug", async () => {
    const demo = new DemoBackend({ laad, leeg: true });
    expect(await demo.accounts()).toEqual([]);
    expect((await demo.stelConfiguratieVoor("iemand@gmail.com"))?.imap.host).toBe("imap.gmail.com");
    expect(await demo.stelConfiguratieVoor("iemand@eigendomein.nl")).toBeNull();
    expect((await demo.stelConfiguratieVoor("iemand@eigendomein.nl", { online: true }))?.bron).toBe("gok");
    const invoer = {
      naam: "Werk",
      volledigeNaam: "Iemand",
      email: "iemand@eigendomein.nl",
      imap: { host: "imap.eigendomein.nl", poort: 993, beveiliging: "ssl" as const, authenticatie: "normaal" as const, gebruikersnaam: "iemand" },
      smtp: { host: "fout.eigendomein.nl", poort: 465, beveiliging: "ssl" as const, authenticatie: "normaal" as const, gebruikersnaam: "iemand" },
      controleerElke: 10,
      externeInhoud: false,
      wachtwoord: "geheim",
    };
    const test = await demo.test(invoer);
    expect(test.imap.ok).toBe(true);
    expect(test.smtp.ok).toBe(false);
    const account = await demo.bewaarAccount(invoer);
    expect(account.wachtwoordOpgeslagen).toBe(true);
    expect(JSON.stringify(await demo.accounts())).not.toContain("geheim");
    expect((await demo.mappen(account.id)).find((m) => m.speciaal === "inbox")?.ongelezen).toBe(1);
    const contacten = await demo.contacten(account.id, "studio");
    expect(contacten[0].adres).toBe("studio@voorbeeld.invalid");
  });
});

describe("hulpfuncties", () => {
  it("normaliseert fouten van de backend", () => {
    expect(naarMailFout({ code: "aanmelding", melding: "535 fout" })).toMatchObject({ code: "aanmelding", melding: "535 fout" });
    expect(naarMailFout(JSON.stringify({ code: "te-groot", melding: "x" })).code).toBe("te-groot");
    expect(naarMailFout("Command email_accounts not found").code).toBe("niet-beschikbaar");
    expect(foutTekst({ code: "aanmelding", melding: "535" })).toMatch(/^Aanmelden mislukt.*\(535\)$/);
  });
  it("zet bytes om voor IPC", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(naarBase64(bytes)).toBe("AAEC+v8=");
    expect(naarBytes(bytes.buffer)).toEqual(bytes);
    expect(naarBytes([0, 1, 2, 250, 255])).toEqual(bytes);
  });
  it("koppelt bijlagen aan modules", () => {
    expect(kantoorModule("Notitie.DOCX")).toBe("docx");
    expect(kantoorModule("lijst.ods")).toBe("xlsx");
    expect(kantoorModule("dia.odp")).toBe("pptx");
    expect(kantoorModule("data.accdb")).toBe("database");
    expect(kantoorModule("foto.jpg")).toBeNull();
  });
});
