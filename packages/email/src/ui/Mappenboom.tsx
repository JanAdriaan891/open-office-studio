import { useMemo } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  FilePen,
  Folder,
  Inbox,
  Mail,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Account, Map } from "../contract";

const ICONEN: Record<NonNullable<Map["speciaal"]>, LucideIcon> = {
  inbox: Inbox,
  verzonden: Send,
  concepten: FilePen,
  prullenbak: Trash2,
  ongewenst: ShieldAlert,
  archief: Archive,
  alle: Mail,
  gemarkeerd: Star,
};
const VOLGORDE: (Map["speciaal"] | undefined)[] = ["inbox", "concepten", "verzonden", "archief", "ongewenst", "prullenbak"];

export interface MapKeuze {
  accountId: string;
  map: string;
}

/** Hiërarchie uit de paden met scheidingsteken; speciale mappen eerst. */
function boom(mappen: Map[]) {
  const sorteer = (a: Map, b: Map) => {
    const va = a.speciaal ? VOLGORDE.indexOf(a.speciaal) : -1;
    const vb = b.speciaal ? VOLGORDE.indexOf(b.speciaal) : -1;
    if (va >= 0 || vb >= 0) return (va < 0 ? 99 : va) - (vb < 0 ? 99 : vb);
    return a.naam.localeCompare(b.naam, "nl");
  };
  const uit: { map: Map; diepte: number }[] = [];
  const kinderen = (ouder: string | null, diepte: number) => {
    const lijst = mappen.filter((m) => {
      const deel = m.pad.lastIndexOf(m.scheiding || "/");
      const ouderPad = deel < 0 ? null : m.pad.slice(0, deel);
      // Een map waarvan de ouder niet bestaat hoort op het hoogste niveau.
      const effectief = ouderPad && mappen.some((x) => x.pad === ouderPad) ? ouderPad : null;
      return effectief === ouder;
    });
    for (const map of lijst.sort(sorteer)) {
      uit.push({ map, diepte });
      kinderen(map.pad, diepte + 1);
    }
  };
  kinderen(null, 0);
  return uit;
}

export function Mappenboom({
  accounts,
  mappen,
  actief,
  kies,
  ingeklapt,
  wisselInklap,
  ladenFout,
}: {
  accounts: Account[];
  mappen: Record<string, Map[]>;
  actief: MapKeuze | null;
  kies: (keuze: MapKeuze) => void;
  ingeklapt: Set<string>;
  wisselInklap: (accountId: string) => void;
  ladenFout: Record<string, string>;
}) {
  const bomen = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, boom(mappen[a.id] ?? [])])), [accounts, mappen]);
  return (
    <nav className="email-mappen" aria-label="Mappen">
      {accounts.map((account) => {
        const dicht = ingeklapt.has(account.id);
        const inbox = mappen[account.id]?.find((m) => m.speciaal === "inbox");
        return (
          <div key={account.id} className="email-account">
            <button className="email-accountkop" onClick={() => wisselInklap(account.id)} aria-expanded={!dicht} title={account.email}>
              {dicht ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span>{account.naam}</span>
              {dicht && !!inbox?.ongelezen && <b className="email-teller">{inbox.ongelezen}</b>}
            </button>
            {!dicht && (
              <ul>
                {ladenFout[account.id] && (
                  <li className="email-mapfout" role="alert">
                    {ladenFout[account.id]}
                  </li>
                )}
                {!mappen[account.id] && !ladenFout[account.id] && <li className="email-mapladen">Mappen laden…</li>}
                {bomen[account.id]?.map(({ map, diepte }) => {
                  const Icoon = map.speciaal ? ICONEN[map.speciaal] : Folder;
                  const gekozen = actief?.accountId === account.id && actief.map === map.pad;
                  return (
                    <li key={map.pad}>
                      <button
                        className={`email-map ${gekozen ? "is-gekozen" : ""} ${map.ongelezen ? "heeft-ongelezen" : ""}`}
                        style={{ paddingLeft: 14 + diepte * 14 }}
                        disabled={!map.selecteerbaar}
                        aria-current={gekozen ? "true" : undefined}
                        onClick={() => kies({ accountId: account.id, map: map.pad })}
                        title={map.pad}
                      >
                        <Icoon size={15} strokeWidth={1.7} />
                        <span>{map.naam}</span>
                        {!!map.ongelezen && (
                          <b className="email-teller" aria-label={`${map.ongelezen} ongelezen`}>
                            {map.ongelezen}
                          </b>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
