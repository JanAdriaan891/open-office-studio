import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, CircleDashed, CircleMinus, CircleX, Globe, KeyRound, LoaderCircle, ShieldAlert } from "lucide-react";
import type { Account, AccountInvoer, ConfiguratieVoorstel, MailBackend, OAuthProvider, ServerInstelling, TestUitkomst } from "../contract";
import { isGeldigAdres } from "../adressen";
import { foutTekst, naarMailFout } from "../fouten";
import { domeinVan, gok } from "../voorinstellingen";
import { herkenProvider, oauthServers, PROVIDERNAAM } from "../oauth";
import {
  maakKaarten,
  metVoortgang,
  serverSleutel,
  ServerZoeker,
  voortgangNaarStap,
  zoekStappen,
  type StapStatus,
  type ZoekUitkomst,
  type ZoekVoortgang,
} from "../serverzoeker";
import { isDesktop } from "../backend";
import { Dialoog } from "./Dialoog";
import { ServerVelden } from "./ServerVelden";
import { OAuthKnoppen, OAuthUitleg, OAuthWacht, useOAuth } from "./OAuth";
import { bewaarIspdb, leesIspdb } from "./voorkeuren";

const STAPICOON = {
  wacht: CircleDashed,
  bezig: LoaderCircle,
  gevonden: CircleCheck,
  niets: CircleMinus,
  overgeslagen: CircleMinus,
} as const;
const STAPTEKST = { wacht: "wacht", bezig: "bezig…", gevonden: "gevonden", niets: "niets gevonden", overgeslagen: "niet uitgevoerd" } as const;

function volledig(server: ConfiguratieVoorstel["imap"], email: string): ServerInstelling {
  return { ...server, gebruikersnaam: server.gebruikersnaam ?? email };
}

/**
 * "Account toevoegen" zoals in Thunderbird: naam, adres en wachtwoord. Zodra
 * het adres geldig is zoekt de app automatisch naar de servers en toont de
 * voorstellen als kaarten; de handmatige configuratie blijft altijd
 * zichtbaar en aanpasbaar. Het wachtwoord gaat pas mee bij Testen of Gereed.
 */
export function AccountWizard({
  backend,
  sluit,
  klaar,
}: {
  backend: MailBackend;
  sluit?: () => void;
  klaar: (account: Account) => void;
}) {
  const [volledigeNaam, setVolledigeNaam] = useState("");
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [ispdb, setIspdb] = useState(leesIspdb);
  const [zoeken, setZoeken] = useState<ZoekUitkomst>({ status: "leeg" });
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [imap, setImap] = useState<ServerInstelling | null>(null);
  const [smtp, setSmtp] = useState<ServerInstelling | null>(null);
  const [aangepast, setAangepast] = useState(false);
  const [uitkomst, setUitkomst] = useState<TestUitkomst | null>(null);
  const [bezig, setBezig] = useState<"" | "testen" | "bewaren">("");
  const [fout, setFout] = useState("");
  const oauth = useOAuth(backend);
  const [oauthUitleg, setOauthUitleg] = useState<OAuthProvider | null>(null);
  const opties = useRef({ ispdb });
  opties.current = { ispdb };
  const aangepastRef = useRef(aangepast);
  aangepastRef.current = aangepast;

  // Eén zoeker per wizard; terugval op de offline voorinstelling als de backend
  // `zoekServers` (nog) niet kent.
  const zoeker = useMemo(
    () =>
      new ServerZoeker(
        async (adres) => {
          try {
            return await backend.zoekServers(adres, { ispdb: opties.current.ispdb, proef: true });
          } catch (e) {
            if (naarMailFout(e).code !== "niet-beschikbaar") throw e;
            const v = await backend.stelConfiguratieVoor(adres, { online: true });
            return v ? [v] : [];
          }
        },
        setZoeken,
      ),
    [backend],
  );
  useEffect(() => () => zoeker.stop(), [zoeker]);
  useEffect(() => zoeker.wijzig(email), [email, zoeker]);

  const domein = domeinVan(email);
  const kaarten = useMemo(() => (zoeken.status === "klaar" ? maakKaarten(zoeken.voorstellen, domein) : []), [zoeken, domein]);
  // Optionele voortgang van de desktopbackend (`email-zoek-voortgang`).
  const [voortgang, setVoortgang] = useState<Record<string, StapStatus>>({});
  useEffect(() => {
    if (zoeken.status === "wacht") setVoortgang({});
  }, [zoeken.status]);
  useEffect(() => {
    if (!isDesktop()) return;
    let stop: (() => void) | null = null;
    let actief = true;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<ZoekVoortgang>("email-zoek-voortgang", (e) => {
          const stap = voortgangNaarStap(e.payload);
          if (stap) setVoortgang((v) => ({ ...v, [stap.naam]: stap.status }));
        }),
      )
      .then((s) => {
        if (actief) stop = s;
        else s();
      })
      .catch(() => {});
    return () => {
      actief = false;
      stop?.();
    };
  }, []);
  const stappen = metVoortgang(zoekStappen(zoeken, ispdb), voortgang, zoeken.status === "bezig");

  function kies(voorstel: ConfiguratieVoorstel) {
    setGekozen(serverSleutel(voorstel));
    setImap(volledig(voorstel.imap, email.trim()));
    setSmtp(volledig(voorstel.smtp, email.trim()));
    setAangepast(false);
    setUitkomst(null);
  }

  // De beste kaart voorselecteren, tenzij de gebruiker de servers al heeft aangepast.
  useEffect(() => {
    if (zoeken.status !== "klaar" || aangepastRef.current) return;
    if (zoeken.voorstellen.length) kies(zoeken.voorstellen[0]);
    else {
      const g = gok(zoeken.email);
      setGekozen(null);
      setImap(volledig(g.imap, zoeken.email));
      setSmtp(volledig(g.smtp, zoeken.email));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoeken]);

  const gekozenVoorstel = zoeken.status === "klaar" ? zoeken.voorstellen.find((v) => serverSleutel(v) === gekozen) : undefined;
  const aanbevolen = gekozenVoorstel?.oauth ?? kaarten.find((k) => k.oauth)?.oauth ?? herkenProvider(email.trim(), gekozenVoorstel);

  function invoer(): AccountInvoer {
    const adres = email.trim();
    return {
      naam: adres,
      volledigeNaam: volledigeNaam.trim(),
      email: adres,
      imap: imap ?? volledig(gok(adres).imap, adres),
      smtp: smtp ?? volledig(gok(adres).smtp, adres),
      mappen: {},
      controleerElke: 10,
      externeInhoud: false,
      wachtwoord: wachtwoord || undefined,
    };
  }

  async function meldAan(provider: OAuthProvider) {
    setFout("");
    if (!volledigeNaam.trim() || !isGeldigAdres(email.trim())) {
      setFout("Vul eerst je naam en e-mailadres in.");
      return;
    }
    if (!oauth.status?.[provider].beschikbaar) {
      setOauthUitleg(provider);
      return;
    }
    setOauthUitleg(null);
    const passend = zoeken.status === "klaar" ? zoeken.voorstellen.find((v) => v.oauth === provider) : undefined;
    const servers = passend ? { imap: volledig(passend.imap, email.trim()), smtp: volledig(passend.smtp, email.trim()) } : oauthServers(provider, email.trim());
    try {
      const account = await oauth.meldAan(provider, {
        ...invoer(),
        imap: { ...servers.imap, authenticatie: "oauth2", gebruikersnaam: email.trim() },
        smtp: { ...servers.smtp, authenticatie: "oauth2", gebruikersnaam: email.trim() },
        wachtwoord: undefined,
      });
      if (account) klaar(account);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    }
  }

  async function test() {
    if (!imap || !smtp) return;
    setFout("");
    setBezig("testen");
    try {
      setUitkomst(await backend.test(invoer()));
    } catch (e) {
      setFout(foutTekst(e, "Testen mislukt"));
    } finally {
      setBezig("");
    }
  }

  async function bewaar() {
    if (!imap || !smtp) return;
    setFout("");
    setBezig("bewaren");
    try {
      klaar(await backend.bewaarAccount(invoer()));
    } catch (e) {
      setFout(foutTekst(e, "Account opslaan mislukt"));
    } finally {
      setBezig("");
    }
  }

  const gegevensGeldig = !!volledigeNaam.trim() && isGeldigAdres(email.trim());
  const getest = uitkomst?.imap.ok && uitkomst.smtp.ok;
  const serversIngevuld = !!imap?.host && !!smtp?.host;
  return (
    <Dialoog
      titel="Account toevoegen"
      sluit={oauth.bezig ? () => void oauth.annuleer() : sluit}
      breed="groot"
      className="email-wizard"
      acties={
        oauth.bezig ? undefined : (
          <>
            {fout && (
              <span className="email-foutregel" role="alert">
                {fout}
              </span>
            )}
            {sluit && (
              <button className="email-knop" onClick={sluit}>
                Annuleren
              </button>
            )}
            <button className="email-knop" onClick={() => void test()} disabled={!!bezig || !gegevensGeldig || !serversIngevuld}>
              {bezig === "testen" ? "Testen…" : uitkomst ? "Opnieuw testen" : "Testen"}
            </button>
            <button
              className="email-knop is-primair"
              onClick={() => void bewaar()}
              disabled={!!bezig || !gegevensGeldig || !serversIngevuld}
              title={getest ? "Account opslaan" : "Nog niet (geslaagd) getest; je kunt het account toch opslaan"}
            >
              {bezig === "bewaren" ? "Opslaan…" : getest ? "Gereed" : "Toch opslaan"}
            </button>
          </>
        )
      }
    >
      {oauth.bezig ? (
        <OAuthWacht provider={oauth.bezig} annuleer={() => void oauth.annuleer()} />
      ) : (
        <div className="email-wizard-indeling">
          <form
            className="email-formulier"
            onSubmit={(e) => {
              e.preventDefault();
              zoeker.wijzig(email, true);
            }}
          >
            <p className="email-intro">Gebruik je bestaande e-mailadres. Email Studio werkt met elke provider die IMAP en SMTP aanbiedt.</p>
            <label>
              Je volledige naam
              <input autoFocus value={volledigeNaam} onChange={(e) => setVolledigeNaam(e.target.value)} autoComplete="name" placeholder="Voornaam Achternaam" />
              <small>Zoals ontvangers je naam zien.</small>
            </label>
            <label>
              E-mailadres
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setAangepast(false);
                  setOauthUitleg(null);
                }}
                autoComplete="email"
                placeholder="naam@voorbeeld.nl"
                spellCheck={false}
              />
            </label>
            <label>
              Wachtwoord
              <input type="password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} autoComplete="current-password" />
              <small>
                <KeyRound size={12} /> Wordt pas gebruikt bij Testen of Gereed, en alleen in de sleutelhanger van je besturingssysteem bewaard.
              </small>
            </label>
            <label className="email-vinkje">
              <input
                type="checkbox"
                checked={ispdb}
                onChange={(e) => {
                  setIspdb(e.target.checked);
                  bewaarIspdb(e.target.checked);
                  opties.current = { ispdb: e.target.checked };
                  zoeker.wijzig(email, true);
                }}
              />
              <span>
                Ook de Thunderbird-database raadplegen
                <small>De domeinnaam (niet je adres of wachtwoord) gaat dan naar Mozilla.</small>
              </span>
            </label>
            <div className="email-oauthblok">
              <span>Of meld je aan zonder wachtwoord in de app:</span>
              <OAuthKnoppen aanbevolen={aanbevolen} kies={(p) => void meldAan(p)} uitgeschakeld={!!bezig} />
            </div>
            {oauthUitleg && <OAuthUitleg provider={oauthUitleg} status={oauth.status?.[oauthUitleg]} />}
            <button type="submit" hidden />
          </form>

          <section className="email-zoekresultaat" aria-label="Gevonden instellingen" aria-busy={zoeken.status === "bezig" || zoeken.status === "wacht"}>
            <h3>
              <Globe size={15} /> Serverinstellingen {domein && isGeldigAdres(email.trim()) ? `voor ${domein}` : ""}
            </h3>
            {zoeken.status === "leeg" ? (
              <p className="email-hint">Vul je e-mailadres in; Email Studio zoekt dan automatisch naar de juiste servers.</p>
            ) : (
              <ol className="email-zoekstappen" aria-live="polite">
                {stappen.map((stap) => {
                  const Icoon = STAPICOON[stap.status];
                  return (
                    <li key={stap.naam} className={`is-${stap.status}`}>
                      <Icoon size={13} className={stap.status === "bezig" ? "email-draait" : undefined} />
                      {stap.naam} <small>{STAPTEKST[stap.status]}</small>
                    </li>
                  );
                })}
              </ol>
            )}
            {zoeken.status === "fout" && (
              <p className="email-foutregel" role="alert">
                {foutTekst(zoeken.fout, "Zoeken mislukt")} Vul de servers hieronder zelf in.
              </p>
            )}
            {zoeken.status === "klaar" && !kaarten.length && (
              <p className="email-hint">Er zijn geen instellingen gevonden. Vul de servers hieronder zelf in; vraag ze zo nodig op bij je provider.</p>
            )}
            {kaarten.length > 0 && (
              <div className="email-kaarten" role="radiogroup" aria-label="Voorstellen">
                {kaarten.map((kaart) => {
                  const actief = kaart.sleutel === gekozen && !aangepast;
                  return (
                    <div key={kaart.sleutel} className={`email-kaart ${actief ? "is-gekozen" : ""}`}>
                      <button role="radio" aria-checked={actief} className="email-kaartkeuze" onClick={() => kies(kaart.voorstel)}>
                        <strong>{kaart.titel}</strong>
                        <small>
                          {kaart.bron}
                          {kaart.toelichting ? ` · ${kaart.toelichting}` : ""}
                        </small>
                        <span className="email-kaartserver">
                          IMAP {kaart.imap}{" "}
                          <em className={`email-bereik is-${kaart.imapBereikbaar.tekst.replace(/ /g, "-")}`}>
                            {kaart.imapBereikbaar.teken} {kaart.imapBereikbaar.tekst}
                          </em>
                        </span>
                        <span className="email-kaartserver">
                          SMTP {kaart.smtp}{" "}
                          <em className={`email-bereik is-${kaart.smtpBereikbaar.tekst.replace(/ /g, "-")}`}>
                            {kaart.smtpBereikbaar.teken} {kaart.smtpBereikbaar.tekst}
                          </em>
                        </span>
                        {kaart.onversleuteld && (
                          <span className="email-kaartwaarschuwing">
                            <ShieldAlert size={13} /> onversleuteld
                          </span>
                        )}
                      </button>
                      {kaart.oauth && (
                        <button className="email-knop is-primair" onClick={() => void meldAan(kaart.oauth!)}>
                          Aanmelden met {PROVIDERNAAM[kaart.oauth]}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <h3 className="email-handmatig-kop">
              Handmatige configuratie {aangepast && <small>· aangepast</small>}
            </h3>
            {imap && smtp ? (
              <ServerVelden
                imap={imap}
                smtp={smtp}
                uitkomst={uitkomst}
                wijzig={(soort, server) => {
                  (soort === "imap" ? setImap : setSmtp)(server);
                  setAangepast(true);
                  setUitkomst(null);
                }}
              />
            ) : (
              <p className="email-hint">De velden verschijnen zodra er een geldig e-mailadres is.</p>
            )}
            {uitkomst && !uitkomst.imap.ok && !uitkomst.smtp.ok && (
              <p className="email-hint">
                <CircleX size={13} /> Beide servers faalden. Controleer adres, wachtwoord en servernamen.
              </p>
            )}
          </section>
        </div>
      )}
    </Dialoog>
  );
}
