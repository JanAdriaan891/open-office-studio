/**
 * React-koppeling van de VBA-sessie: toestemming (eenmaal per database),
 * uitvoervenster (Debug.Print), MsgBox/InputBox als echte dialogen,
 * DoCmd-acties naar de interface, Stop en foutmeldingen met regelnummer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { HostGebeurtenis, HostWaarde } from "../../../vba/src/host.ts";
import type { VoerUitResultaat } from "../../../vba/src/protocol.ts";
import type { Dialogen } from "./Dialoog.tsx";
import { foutTekst, VbaSessie, vanHostWaarde, type VbaModule } from "./vba-sessie.ts";
import type { BedienbareWerkkopie } from "./werkkopie-sessie.ts";

export interface VbaActies {
  openFormulier(naam: string): void | Promise<void>;
  openRapport(naam: string): void;
  openQuery(naam: string): void;
  openTabel(naam: string): void;
  /** Sluit een formulier of rapport; zonder naam het actieve formulier. */
  sluit(soort: "formulier" | "rapport" | null, naam: string | null): void;
}

export interface Uitvoerregel {
  soort: "uitvoer" | "info" | "fout";
  tekst: string;
}

export interface VbaBediening {
  sessie: VbaSessie | null;
  uitvoer: Uitvoerregel[];
  bezig: string | null;
  /** Loopt er nu VBA (direct, zonder te wachten op een render)? */
  isBezig(): boolean;
  toegestaan: boolean;
  /** Vraagt (eenmalig) toestemming; false als de gebruiker weigert. */
  vraagToestemming(reden?: string): Promise<boolean>;
  voerUit(module: string, procedure: string, args?: HostWaarde[]): Promise<VoerUitResultaat | null>;
  stop(): void;
  wisUitvoer(): void;
}

const ACCESS_RECORD: Record<number, string> = { 0: "vorige", 1: "volgende", 2: "eerste", 3: "laatste", 4: "naar", 5: "nieuw" };

export function useVba(
  werkkopie: BedienbareWerkkopie | null,
  modules: VbaModule[],
  dialogen: Dialogen,
  acties: VbaActies,
): VbaBediening {
  const [sessie, setSessie] = useState<VbaSessie | null>(null);
  const [uitvoer, setUitvoer] = useState<Uitvoerregel[]>([]);
  const [bezig, setBezig] = useState<string | null>(null);
  const [toegestaan, setToegestaan] = useState(false);
  const recent = useRef({ dialogen, acties, modules, sessie });
  recent.current = { dialogen, acties, modules, sessie };
  const loopt = useRef<string | null>(null);
  const toestemming = useRef(false);
  const voeg = useCallback((r: Uitvoerregel) => setUitvoer((u) => [...u.slice(-999), r]), []);

  useEffect(() => {
    setToegestaan(false);
    toestemming.current = false;
    setUitvoer([]);
    setBezig(null);
    if (!werkkopie) {
      setSessie(null);
      return;
    }
    const s: VbaSessie = new VbaSessie(werkkopie, {
      msgBox: (v) => recent.current.dialogen.msgBox(v),
      inputBox: (v) => recent.current.dialogen.vraag({ titel: v.titel || "Open Database Studio", label: v.tekst, standaard: v.standaard }),
      debugPrint: (tekst) => voeg({ soort: "uitvoer", tekst }),
      gebeurtenis: (g) => gebeurtenis(g, s),
    });
    setSessie(s);
    return () => s.sluit();
  }, [werkkopie, voeg]);

  async function gebeurtenis(g: HostGebeurtenis, s: VbaSessie): Promise<HostWaarde | void> {
    const a = recent.current.acties;
    const tekst = (i: number) => {
      const w = vanHostWaarde(g.args[i] ?? null);
      return w === null ? null : String(w);
    };
    switch (g.soort) {
      case "OpenForm":
        if (!tekst(0)) throw new Error("DoCmd.OpenForm zonder formuliernaam.");
        await a.openFormulier(tekst(0)!);
        return;
      case "OpenReport":
        if (!tekst(0)) throw new Error("DoCmd.OpenReport zonder rapportnaam.");
        a.openRapport(tekst(0)!);
        return;
      case "OpenQuery":
        a.openQuery(tekst(0) ?? "");
        return;
      case "OpenTable":
        a.openTabel(tekst(0) ?? "");
        return;
      case "Close": {
        const type = vanHostWaarde(g.args[0] ?? null);
        a.sluit(type === 3 ? "rapport" : type === 2 ? "formulier" : null, tekst(1));
        return;
      }
      case "Requery":
      case "Refresh":
      case "RefreshRecord":
        if (s.formulieren.actief) await s.formulieren.roepAan({ soort: "formulier", naam: s.formulieren.actief }, "requery", []);
        return;
      case "GoToRecord": {
        const naam = tekst(1) || s.formulieren.actief;
        if (!naam) throw new Error("DoCmd.GoToRecord: er is geen formulier geopend.");
        const record = Number(vanHostWaarde(g.args[2] ?? null) ?? 1);
        const offset = Number(vanHostWaarde(g.args[3] ?? null) ?? 1);
        await s.formulieren.roepAan({ soort: "formulier", naam }, "gotorecord", [ACCESS_RECORD[record] ?? "volgende", offset]);
        return;
      }
      case "Beep":
      case "Hourglass":
      case "Echo":
      case "Maximize":
      case "Minimize":
      case "Restore":
      case "RepaintObject":
      case "ShowToolbar":
      case "MoveSize":
      case "SelectObject":
        return;
      case "CancelEvent":
        voeg({ soort: "info", tekst: "DoCmd.CancelEvent: gebeurtenis geannuleerd." });
        return;
      case "Quit":
        voeg({ soort: "info", tekst: "DoCmd.Quit genegeerd: Open Database Studio wordt niet door VBA afgesloten." });
        return;
      default:
        throw new Error(`DoCmd.${g.soort} wordt in Open Database Studio (nog) niet ondersteund.`);
    }
  }

  const vraagToestemming = useCallback(
    async (reden?: string) => {
      if (toestemming.current) return true;
      const ja = await recent.current.dialogen.bevestig({
        titel: "VBA-code uitvoeren?",
        tekst: (
          <>
            {reden && <p>{reden}</p>}
            <p>
              VBA-code uit deze database draait <strong>afgeschermd</strong> in een eigen proces, uitsluitend op de werkkopie. Het origineel
              blijft ongewijzigd.
            </p>
            <ul>
              <li>Geen toegang tot bestanden, mappen, het register of de omgeving.</li>
              <li>Geen COM/ActiveX (CreateObject), Shell, Windows-API (Declare) of SendKeys.</li>
              <li>Tijdslimiet van 30 seconden per uitvoering en een Stop-knop.</li>
            </ul>
            <p>De code kan wel gegevens in de werkkopie wijzigen. Voer alleen code uit van een bron die je vertrouwt.</p>
            <p className="muted">Deze vraag komt één keer per geopende database.</p>
          </>
        ),
        ja: "VBA toestaan",
        nee: "Niet uitvoeren",
        standaardNee: true,
      });
      if (ja) {
        toestemming.current = true;
        setToegestaan(true);
      }
      return ja;
    },
    [],
  );

  const voerUit = useCallback(
    async (module: string, procedure: string, args: HostWaarde[] = []) => {
      const s = recent.current.sessie;
      if (!s) return null;
      if (loopt.current) {
        voeg({ soort: "fout", tekst: `${module}.${procedure} niet gestart: ${loopt.current} loopt nog.` });
        return null;
      }
      if (!(await vraagToestemming())) return null;
      loopt.current = `${module}.${procedure}`;
      setBezig(loopt.current);
      voeg({ soort: "info", tekst: `▶ ${module}.${procedure}` });
      try {
        const r = await s.voerUit(recent.current.modules, module, procedure, args);
        if (r.ok) voeg({ soort: "info", tekst: `■ Klaar (${r.stappen.toLocaleString("nl-NL")} stappen)` });
        else voeg({ soort: "fout", tekst: foutTekst(r) });
        return r;
      } catch (e) {
        voeg({ soort: "fout", tekst: e instanceof Error ? e.message : String(e) });
        return null;
      } finally {
        loopt.current = null;
        setBezig(null);
      }
    },
    [vraagToestemming, voeg],
  );

  return {
    sessie,
    uitvoer,
    bezig,
    isBezig: () => loopt.current !== null,
    toegestaan,
    vraagToestemming,
    voerUit,
    stop: () => {
      recent.current.sessie?.stop();
      voeg({ soort: "info", tekst: "Uitvoering gestopt." });
    },
    wisUitvoer: () => setUitvoer([]),
  };
}
