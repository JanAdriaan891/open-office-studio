/**
 * Eén vorm voor alle werkkopieën in de interface: opgebouwd uit een
 * MDB/ACCDB (`WerkkopieClient`), nieuw en leeg, of heropend uit `.sqlite`.
 */
import type { Werkkopie } from "../werkkopie/contract.ts";
import { WerkkopieFout } from "../werkkopie/contract.ts";
import type { OpbouwRapport } from "../werkkopie/opbouw.ts";
import { foutUitBericht, werkkopieViaPoort, type PoortWerkkopie } from "../werkkopie/werkkopie-brug.ts";

export interface BedienbareWerkkopie extends Werkkopie {
  /** Opbouwrapport (null bij een nieuwe database). */
  readonly rapport: OpbouwRapport | null;
  /** Nieuwe MessagePort voor de VBA-worker. */
  poort(): Promise<MessagePort>;
  /** Stopt de worker direct. */
  annuleer(reden?: string): void;
}

export type Herkomst = "access" | "nieuw" | "sqlite" | "voorbeeld";

export interface WerkkopieSessie {
  werkkopie: BedienbareWerkkopie;
  herkomst: Herkomst;
  /** Weergavenaam (bestandsnaam of “Nieuwe database”). */
  naam: string;
}

/**
 * Werkkopie in een eigen worker (`losse-werkkopie-worker.ts`). Nodig omdat
 * `WerkkopieClient` alleen kan opbouwen uit een Access-bestand; zie het
 * eindrapport: `nieuweWerkkopie`/`laadWerkkopie` horen eigenlijk in de client.
 */
export class LosseWerkkopie {
  static async nieuw(naam: string): Promise<BedienbareWerkkopie> {
    return LosseWerkkopie.start({ type: "nieuw", naam });
  }
  static async laad(bestand: File): Promise<BedienbareWerkkopie> {
    if (bestand.size > 100 * 1024 * 1024) throw new Error("Kies een werkkopie van maximaal 100 MB.");
    if (!bestand.size) throw new Error("Dit bestand is leeg.");
    const bytes = await bestand.arrayBuffer();
    const kop = new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(15, bytes.byteLength)));
    if (kop !== "SQLite format 3") throw new Error("Dit is geen SQLite-bestand. Kies een eerder bewaarde werkkopie (.sqlite).");
    return LosseWerkkopie.start({ type: "laad", bytes }, [bytes]);
  }

  private static async start(bericht: Record<string, unknown>, overdracht: Transferable[] = []): Promise<BedienbareWerkkopie> {
    const worker = new Worker(new URL("./losse-werkkopie-worker.ts", import.meta.url), { type: "module" });
    let gestopt: string | null = null;
    let nummer = 0;
    const wachtend = new Map<number, { klaar: (w: unknown) => void; fout: (e: Error) => void }>();
    let proxy: PoortWerkkopie | null = null;
    const annuleer = (reden = "De werkkopie is gestopt.") => {
      if (gestopt) return;
      gestopt = reden;
      worker.terminate();
      proxy?.ontkoppel();
      for (const w of wachtend.values()) w.fout(new WerkkopieFout("intern", reden));
      wachtend.clear();
    };
    worker.onmessage = ({ data }) => {
      const w = wachtend.get(data.id);
      if (!w) return;
      wachtend.delete(data.id);
      if (data.fout) w.fout(foutUitBericht({ code: data.code, melding: data.fout }));
      else w.klaar(data.resultaat);
    };
    worker.onerror = () => annuleer("De werkkopie is onverwacht gestopt.");
    const vraag = <T,>(b: Record<string, unknown>, lijst: Transferable[] = []) =>
      new Promise<T>((klaar, fout) => {
        if (gestopt) return fout(new WerkkopieFout("intern", gestopt));
        const id = ++nummer;
        wachtend.set(id, { klaar: (w) => klaar(w as T), fout });
        worker.postMessage({ id, ...b }, lijst);
      });
    const kanaal = new MessageChannel();
    try {
      const { rapport } = await vraag<{ rapport: OpbouwRapport | null }>({ ...bericht, poort: kanaal.port2 }, [
        ...overdracht,
        kanaal.port2,
      ]);
      proxy = await werkkopieViaPoort(kanaal.port1);
      const p = proxy;
      const resultaat = Object.create(p) as BedienbareWerkkopie;
      Object.defineProperties(resultaat, {
        rapport: { value: rapport },
        bron: { value: p.bron },
        poort: {
          value: async () => {
            const k = new MessageChannel();
            await vraag({ type: "poort", poort: k.port2 }, [k.port2]);
            return k.port1;
          },
        },
        annuleer: { value: annuleer },
        sluit: {
          value: async () => {
            try {
              if (!gestopt) await p.sluit();
            } finally {
              annuleer("De werkkopie is gesloten.");
            }
          },
        },
      });
      return resultaat;
    } catch (fout) {
      annuleer();
      throw fout;
    }
  }
}
