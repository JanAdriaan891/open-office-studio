import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import type { Authenticatie, Beveiliging, ServerInstelling, TestUitkomst } from "../contract";
import { STANDAARDPOORT } from "../voorinstellingen";

const BEVEILIGING: { waarde: Beveiliging; label: string }[] = [
  { waarde: "ssl", label: "SSL/TLS" },
  { waarde: "starttls", label: "STARTTLS" },
  { waarde: "geen", label: "Geen" },
];
const AUTHENTICATIE: { waarde: Authenticatie; label: string }[] = [
  { waarde: "normaal", label: "Normaal wachtwoord" },
  { waarde: "versleuteld", label: "Versleuteld wachtwoord" },
  { waarde: "oauth2", label: "OAuth2" },
];

/** Tabel met IMAP- en SMTP-instellingen zoals in Thunderbirds handmatige configuratie. */
export function ServerVelden({
  imap,
  smtp,
  wijzig,
  uitkomst,
}: {
  imap: ServerInstelling;
  smtp: ServerInstelling;
  wijzig: (soort: "imap" | "smtp", server: ServerInstelling) => void;
  uitkomst?: TestUitkomst | null;
}) {
  const rij = (soort: "imap" | "smtp", server: ServerInstelling) => {
    const zet = (deel: Partial<ServerInstelling>) => wijzig(soort, { ...server, ...deel });
    const resultaat = uitkomst?.[soort];
    return (
      <tr>
        <th scope="row">
          {soort === "imap" ? "Inkomend (IMAP)" : "Uitgaand (SMTP)"}
          {resultaat && (
            <span className={`email-testuitkomst ${resultaat.ok ? "is-ok" : "is-fout"}`} role="status">
              {resultaat.ok ? <CircleCheck size={14} /> : <CircleX size={14} />}
              {resultaat.melding}
            </span>
          )}
        </th>
        <td>
          <input aria-label={`${soort.toUpperCase()}-server`} value={server.host} placeholder={soort === "imap" ? "imap.voorbeeld.nl" : "smtp.voorbeeld.nl"} onChange={(e) => zet({ host: e.target.value.trim() })} spellCheck={false} />
        </td>
        <td>
          <input
            aria-label={`${soort.toUpperCase()}-poort`}
            type="number"
            min={1}
            max={65535}
            value={server.poort || ""}
            onChange={(e) => zet({ poort: Number(e.target.value) })}
            className="email-poort"
          />
        </td>
        <td>
          <select
            aria-label={`${soort.toUpperCase()}-beveiliging`}
            value={server.beveiliging}
            onChange={(e) => {
              const beveiliging = e.target.value as Beveiliging;
              // Poort meeschuiven als die nog op de standaard van de vorige keuze stond.
              const standaard = Object.values(STANDAARDPOORT[soort]).includes(server.poort);
              zet({ beveiliging, poort: standaard || !server.poort ? STANDAARDPOORT[soort][beveiliging] : server.poort });
            }}
          >
            {BEVEILIGING.map((b) => (
              <option key={b.waarde} value={b.waarde}>
                {b.label}
              </option>
            ))}
          </select>
        </td>
        <td>
          <select aria-label={`${soort.toUpperCase()}-authenticatie`} value={server.authenticatie} onChange={(e) => zet({ authenticatie: e.target.value as Authenticatie })}>
            {AUTHENTICATIE.map((a) => (
              <option key={a.waarde} value={a.waarde}>
                {a.label}
              </option>
            ))}
          </select>
        </td>
        <td>
          <input aria-label={`${soort.toUpperCase()}-gebruikersnaam`} value={server.gebruikersnaam} onChange={(e) => zet({ gebruikersnaam: e.target.value })} spellCheck={false} autoComplete="username" />
        </td>
      </tr>
    );
  };
  const onversleuteld = [imap, smtp].some((s) => s.beveiliging === "geen");
  return (
    <div className="email-servers">
      <div className="email-servertabel-houder">
        <table className="email-servertabel">
          <thead>
            <tr>
              <th />
              <th>Server</th>
              <th>Poort</th>
              <th>Beveiliging</th>
              <th>Authenticatie</th>
              <th>Gebruikersnaam</th>
            </tr>
          </thead>
          <tbody>
            {rij("imap", imap)}
            {rij("smtp", smtp)}
          </tbody>
        </table>
      </div>
      {onversleuteld && (
        <p className="email-waarschuwing" role="alert">
          <TriangleAlert size={15} />
          <span>
            <strong>Onversleutelde verbinding.</strong> Je wachtwoord en berichten gaan leesbaar over het netwerk. Kies SSL/TLS of STARTTLS als je provider
            dat ondersteunt.
          </span>
        </p>
      )}
      {(imap.authenticatie === "oauth2" || smtp.authenticatie === "oauth2") && (
        <p className="email-hint">OAuth2 vraagt bij het testen of eerste gebruik om aanmelden via de provider.</p>
      )}
    </div>
  );
}
