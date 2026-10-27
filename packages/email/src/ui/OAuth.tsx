import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Info, LoaderCircle } from "lucide-react";
import type { Account, AccountInvoer, MailBackend, OAuthProvider, OAuthStatus } from "../contract";
import { foutTekst, naarMailFout } from "../fouten";
import { OAUTH_DOCUMENTATIE, PROVIDERNAAM } from "../oauth";

export type OAuthStatussen = Record<OAuthProvider, OAuthStatus>;
const NIET_BESCHIKBAAR: OAuthStatus = {
  beschikbaar: false,
  melding: "Deze versie van de app ondersteunt aanmelden met Microsoft of Google nog niet.",
};

/** Status van de providers en een lopende aanmelding, met annuleren. */
export function useOAuth(backend: MailBackend) {
  const [status, setStatus] = useState<OAuthStatussen | null>(null);
  const [bezig, setBezig] = useState<OAuthProvider | null>(null);
  const geannuleerd = useRef(false);
  const ververs = useCallback(() => {
    backend
      .oauthStatus()
      .then(setStatus)
      .catch(() => setStatus({ microsoft: NIET_BESCHIKBAAR, google: NIET_BESCHIKBAAR }));
  }, [backend]);
  useEffect(ververs, [ververs]);

  /** Geeft het account terug, null bij annuleren; gooit een leesbare fout. */
  const meldAan = useCallback(
    async (provider: OAuthProvider, account: AccountInvoer): Promise<Account | null> => {
      geannuleerd.current = false;
      setBezig(provider);
      try {
        return await backend.meldAanMetOAuth(provider, account);
      } catch (e) {
        if (geannuleerd.current) return null;
        throw new Error(foutTekst(e, `Aanmelden bij ${PROVIDERNAAM[provider]} mislukt`));
      } finally {
        setBezig(null);
      }
    },
    [backend],
  );
  const annuleer = useCallback(async () => {
    geannuleerd.current = true;
    try {
      await backend.annuleerOAuth();
    } catch (e) {
      // Niets meer om af te breken.
      void naarMailFout(e);
    }
    setBezig(null);
  }, [backend]);
  return { status, bezig, meldAan, annuleer, ververs };
}

export function OAuthWacht({ provider, annuleer }: { provider: OAuthProvider; annuleer: () => void }) {
  return (
    <div className="email-oauthwacht" role="status" aria-live="polite">
      <LoaderCircle size={30} className="email-draait" />
      <h3>Rond het aanmelden af in je browser</h3>
      <p>
        De aanmeldpagina van {PROVIDERNAAM[provider]} is in je browser geopend. Meld je daar aan en geef toestemming voor e-mail; daarna gaat Email Studio
        hier verder.
      </p>
      <button className="email-knop" onClick={annuleer}>
        Annuleren
      </button>
    </div>
  );
}

export function OAuthUitleg({ provider, status }: { provider: OAuthProvider; status?: OAuthStatus }) {
  return (
    <div className="email-oauthuitleg" role="note">
      <Info size={15} />
      <div>
        <strong>Aanmelden met {PROVIDERNAAM[provider]} is hier niet beschikbaar.</strong>
        <p>{status?.melding ?? NIET_BESCHIKBAAR.melding}</p>
        <p>
          In de desktopapp kun je onder <em>Extra › Accountinstellingen › Geavanceerd</em> een eigen client-ID voor {PROVIDERNAAM[provider]} instellen. Hoe
          je die aanmaakt staat in <code>{OAUTH_DOCUMENTATIE}</code>. Je kunt ook verdergaan met een (app-)wachtwoord.
        </p>
      </div>
    </div>
  );
}

/** De twee aanmeldknoppen; de herkende provider staat voorop en is primair. */
export function OAuthKnoppen({
  aanbevolen,
  kies,
  uitgeschakeld,
}: {
  aanbevolen: OAuthProvider | null;
  kies: (provider: OAuthProvider) => void;
  uitgeschakeld?: boolean;
}) {
  const volgorde: OAuthProvider[] = aanbevolen === "google" ? ["google", "microsoft"] : ["microsoft", "google"];
  return (
    <div className="email-oauthknoppen">
      {volgorde.map((provider) => (
        <button
          key={provider}
          type="button"
          className={`email-knop ${provider === aanbevolen ? "is-primair" : ""}`}
          disabled={uitgeschakeld}
          onClick={() => kies(provider)}
        >
          <ExternalLink size={14} /> Aanmelden met {PROVIDERNAAM[provider]}
          {provider === aanbevolen && <small className="email-aanbevolen">aanbevolen</small>}
        </button>
      ))}
    </div>
  );
}
