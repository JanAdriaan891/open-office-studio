import { useEffect, useState } from "react";
import { KeyRound, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import type { Account, AccountInvoer, MailBackend, Map, OAuthProvider, TestUitkomst } from "../contract";
import { kanOAuthClientBewaren, OAUTH_DOCUMENTATIE, PROVIDERNAAM } from "../oauth";
import { OAuthWacht, useOAuth } from "./OAuth";
import { isGeldigAdres } from "../adressen";
import { foutTekst } from "../fouten";
import { Dialoog, useVraag } from "./Dialoog";
import { ServerVelden } from "./ServerVelden";
import { bewaarIspdb, leesIspdb, vergeetExterneAfzender, vertrouwdeAfzenders } from "./voorkeuren";

type Tab = "identiteit" | "servers" | "mappen" | "ophalen" | "geavanceerd";
const TABS: { id: Tab; naam: string }[] = [
  { id: "identiteit", naam: "Identiteit" },
  { id: "servers", naam: "Servers" },
  { id: "mappen", naam: "Mappen" },
  { id: "ophalen", naam: "Ophalen en privacy" },
  { id: "geavanceerd", naam: "Geavanceerd" },
];
const ROLLEN = [
  { rol: "verzonden", naam: "Verzonden berichten" },
  { rol: "concepten", naam: "Concepten" },
  { rol: "prullenbak", naam: "Prullenbak" },
  { rol: "archief", naam: "Archief" },
] as const;

/** Accountinstellingen achteraf, per account, met een lijst links zoals in Thunderbird. */
export function AccountInstellingen({
  backend,
  accounts,
  gekozen: beginKeuze,
  sluit,
  gewijzigd,
  nieuwAccount,
}: {
  backend: MailBackend;
  accounts: Account[];
  gekozen?: string;
  sluit: () => void;
  gewijzigd: (accountId?: string) => void;
  nieuwAccount: () => void;
}) {
  const [gekozen, setGekozen] = useState<string | undefined>(beginKeuze ?? accounts[0]?.id);
  const [tab, setTab] = useState<Tab>("identiteit");
  const origineel = accounts.find((a) => a.id === gekozen);
  const [concept, setConcept] = useState<AccountInvoer | null>(null);
  const [wachtwoord, setWachtwoord] = useState("");
  const [mappen, setMappen] = useState<Map[]>([]);
  const [uitkomst, setUitkomst] = useState<TestUitkomst | null>(null);
  const [bezig, setBezig] = useState("");
  const [melding, setMelding] = useState("");
  const [fout, setFout] = useState("");
  const [vraagElement, vraag, vraagOpen] = useVraag();
  const [afzenders, setAfzenders] = useState(vertrouwdeAfzenders);
  const oauth = useOAuth(backend);
  const [ispdb, setIspdb] = useState(leesIspdb);
  const [clients, setClients] = useState<Record<OAuthProvider, { id: string; geheim: string }>>({
    microsoft: { id: "", geheim: "" },
    google: { id: "", geheim: "" },
  });

  useEffect(() => {
    if (!origineel) return;
    const { wachtwoordOpgeslagen: _w, ...rest } = origineel;
    setConcept(structuredClone(rest));
    setWachtwoord("");
    setUitkomst(null);
    setMelding("");
    setFout("");
    backend.mappen(origineel.id).then(setMappen, () => setMappen([]));
    // Alleen bij een andere accountkeuze; na opslaan blijft het concept staan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origineel?.id, backend]);

  if (!origineel || !concept)
    return (
      <Dialoog titel="Accountinstellingen" sluit={sluit}>
        <p>Er is nog geen account.</p>
        <button className="email-knop is-primair" onClick={nieuwAccount}>
          <Plus size={14} /> Account toevoegen
        </button>
      </Dialoog>
    );

  const zet = (deel: Partial<AccountInvoer>) => {
    setConcept({ ...concept, ...deel });
    setMelding("");
  };
  const geldig = concept.volledigeNaam.trim() && isGeldigAdres(concept.email.trim()) && concept.imap.host && concept.smtp.host && (!concept.antwoordAan || isGeldigAdres(concept.antwoordAan));

  async function bewaar() {
    setBezig("bewaren");
    setFout("");
    try {
      await backend.bewaarAccount({ ...concept!, wachtwoord: wachtwoord || undefined });
      setWachtwoord("");
      setMelding("Instellingen opgeslagen.");
      gewijzigd(origineel!.id);
    } catch (e) {
      setFout(foutTekst(e, "Opslaan mislukt"));
    } finally {
      setBezig("");
    }
  }

  async function verwijder() {
    const keuze = await vraag({
      titel: "Account verwijderen",
      tekst: (
        <>
          Weet je zeker dat je <strong>{origineel!.naam}</strong> ({origineel!.email}) wilt verwijderen? De berichten blijven op de server staan; het opgeslagen
          wachtwoord wordt uit de sleutelhanger verwijderd.
        </>
      ),
      knoppen: [
        { waarde: "nee", label: "Annuleren" },
        { waarde: "ja", label: "Account verwijderen", soort: "gevaar" },
      ],
      annuleer: "nee",
    });
    if (keuze !== "ja") return;
    try {
      await backend.verwijderAccount(origineel!.id);
      gewijzigd();
      setGekozen(accounts.find((a) => a.id !== origineel!.id)?.id);
    } catch (e) {
      setFout(foutTekst(e, "Verwijderen mislukt"));
    }
  }

  async function opnieuwAanmelden() {
    if (!origineel?.oauth || !concept) return;
    setFout("");
    setMelding("");
    try {
      const account = await oauth.meldAan(origineel.oauth.provider, { ...concept, id: origineel.id, wachtwoord: undefined });
      if (account) {
        setMelding(`Opnieuw aangemeld als ${account.oauth?.aangemeldAls ?? account.email}.`);
        gewijzigd(account.id);
      }
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    }
  }

  async function bewaarClient(provider: OAuthProvider) {
    if (!kanOAuthClientBewaren(backend)) return;
    setFout("");
    try {
      await backend.bewaarOAuthClient(provider, clients[provider].id.trim(), clients[provider].geheim.trim() || undefined);
      setClients({ ...clients, [provider]: { id: "", geheim: "" } });
      setMelding(`Client-ID voor ${PROVIDERNAAM[provider]} opgeslagen.`);
      oauth.ververs();
    } catch (e) {
      setFout(foutTekst(e, "Client-ID opslaan mislukt"));
    }
  }

  async function test() {
    setBezig("testen");
    setFout("");
    try {
      setUitkomst(await backend.test({ ...concept!, wachtwoord: wachtwoord || undefined }));
    } catch (e) {
      setFout(foutTekst(e, "Testen mislukt"));
    } finally {
      setBezig("");
    }
  }

  return (
    <>
      <Dialoog
        titel="Accountinstellingen"
        sluit={sluit}
        breed="groot"
        className="email-instellingen"
        acties={
          <>
            {melding && <span className="email-okregel" role="status">{melding}</span>}
            {fout && <span className="email-foutregel" role="alert">{fout}</span>}
            <button className="email-knop" onClick={sluit}>
              Sluiten
            </button>
            <button className="email-knop is-primair" disabled={!geldig || !!bezig} onClick={() => void bewaar()}>
              {bezig === "bewaren" ? "Opslaan…" : "Opslaan"}
            </button>
          </>
        }
      >
        <div className="email-instellingen-indeling" inert={vraagOpen}>
          <nav aria-label="Accounts">
            {accounts.map((a) => (
              <button key={a.id} className={a.id === gekozen ? "is-gekozen" : ""} aria-current={a.id === gekozen} onClick={() => setGekozen(a.id)}>
                <UserRound size={15} />
                <span>
                  {a.naam}
                  <small>{a.email}</small>
                </span>
              </button>
            ))}
            <button className="email-account-nieuw" onClick={nieuwAccount}>
              <Plus size={15} /> Account toevoegen
            </button>
          </nav>
          <div className="email-instellingen-paneel">
            <div className="email-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.naam}
                </button>
              ))}
            </div>
            {tab === "identiteit" && (
              <div className="email-formulier" role="tabpanel">
                <label>
                  Accountnaam
                  <input value={concept.naam} onChange={(e) => zet({ naam: e.target.value })} />
                  <small>Alleen voor jezelf, bijvoorbeeld "Werk" of "Privé".</small>
                </label>
                <label>
                  Je naam
                  <input value={concept.volledigeNaam} onChange={(e) => zet({ volledigeNaam: e.target.value })} />
                </label>
                <label>
                  E-mailadres
                  <input value={concept.email} onChange={(e) => zet({ email: e.target.value.trim() })} spellCheck={false} />
                </label>
                <label>
                  Antwoordadres (Reply-To)
                  <input value={concept.antwoordAan ?? ""} onChange={(e) => zet({ antwoordAan: e.target.value.trim() || undefined })} placeholder="Leeg = je e-mailadres" spellCheck={false} />
                </label>
                <label>
                  Handtekening
                  <textarea rows={4} value={concept.handtekening ?? ""} onChange={(e) => zet({ handtekening: e.target.value })} />
                  <small>Wordt onder nieuwe berichten en antwoorden gezet, na "-- ".</small>
                </label>
              </div>
            )}
            {tab === "servers" && (
              <div className="email-formulier" role="tabpanel">
                <ServerVelden
                  imap={concept.imap}
                  smtp={concept.smtp}
                  uitkomst={uitkomst}
                  wijzig={(soort, server) => {
                    zet({ [soort]: server });
                    setUitkomst(null);
                  }}
                />
                {origineel.oauth ? (
                  oauth.bezig ? (
                    <OAuthWacht provider={oauth.bezig} annuleer={() => void oauth.annuleer()} />
                  ) : (
                    <div className="email-oauthaccount">
                      <ShieldCheck size={18} />
                      <span>
                        Aangemeld als <strong>{origineel.oauth.aangemeldAls}</strong> bij {PROVIDERNAAM[origineel.oauth.provider]}
                        <small>Er is geen wachtwoord opgeslagen; de toegang loopt via een token in de sleutelhanger.</small>
                      </span>
                      <button className="email-knop" onClick={() => void opnieuwAanmelden()}>
                        Opnieuw aanmelden
                      </button>
                    </div>
                  )
                ) : (
                <label>
                  <span>
                    <KeyRound size={13} /> Wachtwoord wijzigen
                  </span>
                  <input type="password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} placeholder={origineel.wachtwoordOpgeslagen ? "Opgeslagen · leeg laten om te behouden" : "Nog geen wachtwoord opgeslagen"} autoComplete="new-password" />
                </label>
                )}
                <div>
                  <button className="email-knop" disabled={!!bezig} onClick={() => void test()}>
                    {bezig === "testen" ? "Testen…" : uitkomst ? "Opnieuw testen" : "Verbinding testen"}
                  </button>
                </div>
              </div>
            )}
            {tab === "mappen" && (
              <div className="email-formulier" role="tabpanel">
                <p className="email-hint">Kies waar Email Studio verzonden berichten, concepten, verwijderde en gearchiveerde berichten bewaart.</p>
                {ROLLEN.map(({ rol, naam }) => (
                  <label key={rol}>
                    {naam}
                    <select value={concept.mappen?.[rol] ?? ""} onChange={(e) => zet({ mappen: { ...concept.mappen, [rol]: e.target.value || undefined } })}>
                      <option value="">Automatisch{mappen.find((m) => m.speciaal === rol) ? ` (${mappen.find((m) => m.speciaal === rol)!.naam})` : ""}</option>
                      {mappen
                        .filter((m) => m.selecteerbaar)
                        .map((m) => (
                          <option key={m.pad} value={m.pad}>
                            {m.pad.split(m.scheiding || "/").join(" › ")}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            {tab === "ophalen" && (
              <div className="email-formulier" role="tabpanel">
                <label>
                  Nieuwe berichten controleren
                  <select value={concept.controleerElke} onChange={(e) => zet({ controleerElke: Number(e.target.value) })}>
                    <option value={0}>Alleen handmatig</option>
                    {[1, 5, 10, 15, 30, 60].map((n) => (
                      <option key={n} value={n}>
                        Elke {n} {n === 1 ? "minuut" : "minuten"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="email-vinkje">
                  <input type="checkbox" checked={concept.externeInhoud} onChange={(e) => zet({ externeInhoud: e.target.checked })} />
                  <span>
                    Externe afbeeldingen en inhoud altijd tonen
                    <small>Uit aanbevolen: externe afbeeldingen verraden afzenders wanneer en waar je een bericht opent.</small>
                  </span>
                </label>
                {afzenders.length > 0 && (
                  <div className="email-afzenders">
                    <span>Afzenders waarvan externe inhoud altijd wordt getoond</span>
                    <ul>
                      {afzenders.map((a) => (
                        <li key={a}>
                          {a}
                          <button
                            className="email-iconknop"
                            aria-label={`${a} vergeten`}
                            onClick={() => {
                              vergeetExterneAfzender(a);
                              setAfzenders(vertrouwdeAfzenders());
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {tab === "geavanceerd" && (
              <div className="email-formulier" role="tabpanel">
                <p className="email-hint">
                  Aanmelden met Microsoft of Google gebruikt OAuth2. Deze instellingen gelden voor alle accounts. Een eigen client-ID is alleen nodig als de app
                  er geen meebrengt; zie <code>{OAUTH_DOCUMENTATIE}</code>.
                </p>
                <label className="email-vinkje">
                  <input
                    type="checkbox"
                    checked={ispdb}
                    onChange={(e) => {
                      setIspdb(e.target.checked);
                      bewaarIspdb(e.target.checked);
                    }}
                  />
                  <span>
                    Bij een nieuw account ook de Thunderbird-database raadplegen
                    <small>De domeinnaam gaat dan naar Mozilla. Standaard uit.</small>
                  </span>
                </label>
                {(["microsoft", "google"] as const).map((provider) => (
                  <fieldset key={provider} className="email-oauthclient">
                    <legend>{PROVIDERNAAM[provider]}</legend>
                    <p className={oauth.status?.[provider].beschikbaar ? "email-okregel" : "email-hint"}>
                      {oauth.status
                        ? oauth.status[provider].beschikbaar
                          ? "Beschikbaar."
                          : (oauth.status[provider].melding ?? "Niet beschikbaar.")
                        : "Status laden…"}
                    </p>
                    <label>
                      Client-ID
                      <input
                        value={clients[provider].id}
                        disabled={!kanOAuthClientBewaren(backend)}
                        spellCheck={false}
                        onChange={(e) => setClients({ ...clients, [provider]: { ...clients[provider], id: e.target.value } })}
                      />
                    </label>
                    {provider === "google" && (
                      <label>
                        Client-secret (optioneel)
                        <input
                          type="password"
                          value={clients.google.geheim}
                          disabled={!kanOAuthClientBewaren(backend)}
                          autoComplete="off"
                          onChange={(e) => setClients({ ...clients, google: { ...clients.google, geheim: e.target.value } })}
                        />
                      </label>
                    )}
                    <div>
                      <button className="email-knop" disabled={!kanOAuthClientBewaren(backend) || !clients[provider].id.trim()} onClick={() => void bewaarClient(provider)}>
                        Client-ID opslaan
                      </button>
                    </div>
                  </fieldset>
                ))}
                {!kanOAuthClientBewaren(backend) && <p className="email-hint">Een eigen client-ID instellen kan alleen in de desktopapp.</p>}
              </div>
            )}
            <div className="email-gevarenzone">
              <button className="email-knop is-gevaar" onClick={() => void verwijder()}>
                <Trash2 size={14} /> Account verwijderen
              </button>
            </div>
          </div>
        </div>
      </Dialoog>
      {vraagElement}
    </>
  );
}
