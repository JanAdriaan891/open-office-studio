/**
 * VbaClient: draait VBA in een eigen dedicated Worker. De hoofdthread blijft
 * vrij; `stop()` beëindigt de worker hard (ook midden in een oneindige lus).
 * Na stoppen of een tijdslimiet start de volgende aanroep een nieuwe worker en
 * worden de modules opnieuw geladen (modulevariabelen beginnen dan opnieuw).
 */
import type { FormulierHost, HostWaarde, VbaHost } from "./host.ts";
import type { ModuleBron } from "./interpreter.ts";
import type { HostVerzoek, LaadResultaat, NaarWorker, ProcedureInfo, VanWorker, VbaFoutInfo, VoerUitResultaat } from "./protocol.ts";

/** Wat de client van een worker gebruikt (Worker of een testvervanger). */
export interface WorkerAchtig {
  postMessage(bericht: unknown, overdracht?: Transferable[]): void;
  addEventListener(type: "message", luisteraar: (e: MessageEvent) => void): void;
  addEventListener(type: "error", luisteraar: (e: ErrorEvent) => void): void;
  terminate(): void;
}

export interface VbaClientOpties {
  /** Standaard: een module-Worker op vba-worker.ts. */
  maakWorker?: () => WorkerAchtig;
  /**
   * Levert per (her)start een verse MessagePort naar de werkkopie (koppel de
   * andere kant met `koppelWerkkopie` uit werkkopie-brug.ts). Zonder: geen database.
   */
  werkkopiePoort?: () => MessagePort | Promise<MessagePort>;
  /** Tijdslimiet per voerUit in ms (standaard 30 s); wachten op de host telt niet mee. */
  tijdslimiet?: number;
  stappenlimiet?: number;
  landinstelling?: "nl" | "en-us";
  host?: VbaHost;
  formulieren?: FormulierHost;
}

type Wacht = { klaar: (w: unknown) => void; fout: (f: VbaFoutInfo) => void };

export class VbaClient {
  private worker: WorkerAchtig | null = null;
  private gestart: Promise<void> | null = null;
  private volgendeId = 1;
  private wachtend = new Map<number, Wacht>();
  private modules: ModuleBron[] | null = null;
  private uitvoer: string[] = [];
  private lopend: { timer?: ReturnType<typeof setTimeout>; rest: number; begin: number; afbreken: (f: VbaFoutInfo) => void } | null = null;
  private hostBezig = 0;

  constructor(private readonly opties: VbaClientOpties = {}) {}

  private maakWorker(): WorkerAchtig {
    if (this.opties.maakWorker) return this.opties.maakWorker();
    return new Worker(new URL("./vba-worker.ts", import.meta.url), { type: "module", name: "vba" }) as unknown as WorkerAchtig;
  }

  private start(): Promise<void> {
    if (this.gestart) return this.gestart;
    const worker = (this.worker = this.maakWorker());
    worker.addEventListener("message", (e: MessageEvent) => void this.ontvang(worker, e.data as VanWorker));
    worker.addEventListener("error", (e: ErrorEvent) => {
      if (worker !== this.worker) return;
      this.beeindig({ soort: "intern", reden: "worker", beschrijving: `De VBA-worker is gestopt: ${e.message ?? "onbekende fout"}` });
    });
    this.gestart = (async () => {
      const poort = this.opties.werkkopiePoort ? await this.opties.werkkopiePoort() : undefined;
      const host = this.opties.host;
      await this.verzoek(
        {
          soort: "start",
          id: 0,
          metWerkkopie: !!poort,
          opties: {
            stappenlimiet: this.opties.stappenlimiet,
            landinstelling: this.opties.landinstelling,
            host: {
              msgBox: !!host?.msgBox,
              inputBox: !!host?.inputBox,
              gebeurtenis: !!host?.gebeurtenis,
              formulieren: !!this.opties.formulieren,
            },
          },
        },
        poort ? [poort] : [],
      );
      if (this.modules) await this.verzoek({ soort: "laad", id: 0, modules: this.modules });
    })();
    this.gestart.catch(() => (this.gestart = null));
    return this.gestart;
  }

  private verzoek(bericht: NaarWorker, overdracht: Transferable[] = []): Promise<unknown> {
    const id = this.volgendeId++;
    return new Promise((klaar, fout) => {
      this.wachtend.set(id, { klaar, fout: (f) => fout(Object.assign(new Error(f.beschrijving), { info: f })) });
      this.worker!.postMessage({ ...bericht, id }, overdracht);
    });
  }

  private async ontvang(worker: WorkerAchtig, b: VanWorker) {
    if (worker !== this.worker) return;
    if (b.soort === "debug") {
      this.uitvoer.push(b.tekst);
      this.opties.host?.debugPrint?.(b.tekst);
      return;
    }
    if (b.soort === "antwoord") {
      const w = this.wachtend.get(b.id);
      if (!w) return;
      this.wachtend.delete(b.id);
      if (b.ok) w.klaar(b.resultaat);
      else w.fout(b.fout);
      return;
    }
    // Verzoek van de worker aan de host; de tijdslimiet staat zolang stil.
    this.pauzeer();
    try {
      const waarde = await this.beantwoord(b.verzoek);
      if (worker === this.worker) worker.postMessage({ soort: "hostAntwoord", id: b.id, ok: true, waarde: waarde ?? null } satisfies NaarWorker);
    } catch (e) {
      if (worker === this.worker)
        worker.postMessage({ soort: "hostAntwoord", id: b.id, ok: false, melding: e instanceof Error ? e.message : String(e) } satisfies NaarWorker);
    } finally {
      this.hervat();
    }
  }

  private async beantwoord(v: HostVerzoek): Promise<HostWaarde | number | void | null> {
    const host = this.opties.host;
    const f = this.opties.formulieren;
    switch (v.soort) {
      case "msgBox":
        return host!.msgBox!(v.verzoek);
      case "inputBox":
        return host!.inputBox!(v.verzoek);
      case "gebeurtenis":
        return host!.gebeurtenis!(v.gebeurtenis);
      case "formulier":
        if (!f) throw new Error("Er is geen formulierhost gekoppeld.");
        switch (v.actie) {
          case "isGeopend":
            return f.isGeopend(v.doel);
          case "lees":
            return f.lees(v.doel, v.eigenschap, v.args);
          case "zet":
            return f.zet(v.doel, v.eigenschap, v.waarde);
          case "roepAan":
            return f.roepAan(v.doel, v.methode, v.args);
          case "heeftBesturing":
            return f.heeftBesturing ? f.heeftBesturing(v.doel, v.naam) : true;
        }
    }
  }

  private pauzeer() {
    this.hostBezig++;
    const l = this.lopend;
    if (l?.timer) {
      clearTimeout(l.timer);
      l.timer = undefined;
      l.rest -= Date.now() - l.begin;
    }
  }
  private hervat() {
    this.hostBezig--;
    const l = this.lopend;
    if (l && !this.hostBezig && !l.timer) this.zetTimer(l);
  }
  private zetTimer(l: NonNullable<VbaClient["lopend"]>) {
    l.begin = Date.now();
    l.timer = setTimeout(() => {
      const ms = this.opties.tijdslimiet ?? 30_000;
      l.afbreken({ soort: "afbreking", reden: "tijdslimiet", beschrijving: `De tijdslimiet van ${ms / 1000} seconden is verstreken; de VBA-worker is gestopt.` });
    }, Math.max(0, l.rest));
  }

  /** Beëindigt de worker en laat alle lopende verzoeken met `fout` eindigen. */
  private beeindig(fout: VbaFoutInfo) {
    this.worker?.terminate();
    this.worker = null;
    this.gestart = null;
    const lijst = [...this.wachtend.values()];
    this.wachtend.clear();
    for (const w of lijst) w.fout(fout);
    if (this.lopend?.timer) clearTimeout(this.lopend.timer);
    this.lopend = null;
    this.hostBezig = 0;
  }

  /** Laadt modules (vervangt eerder geladen modules). */
  async laad(modules: ModuleBron[]): Promise<LaadResultaat> {
    const kopie = modules.map((m) => ({ naam: m.naam, bron: m.bron, soort: m.soort }));
    if (!this.gestart) this.modules = null; // een nieuwe start hoeft niets oud te laden
    await this.start();
    this.modules = kopie;
    return (await this.verzoek({ soort: "laad", id: 0, modules: kopie })) as LaadResultaat;
  }

  /** Publieke Subs/Functions zonder verplichte parameters (en gebeurtenisprocedures van formulieren). */
  async procedures(): Promise<ProcedureInfo[]> {
    await this.start();
    const alle = (await this.verzoek({ soort: "procedures", id: 0 })) as ProcedureInfo[];
    return alle.filter((p) => (p.publiek && p.zonderVerplichteParameters) || p.gebeurtenis);
  }

  /** Voert een procedure uit. Fouten komen terug als `{ ok: false, fout }` met regelnummer. */
  async voerUit(module: string, procedure: string, argumenten: HostWaarde[] = []): Promise<VoerUitResultaat> {
    try {
      await this.start();
    } catch (e) {
      return { ok: false, fout: (e as { info?: VbaFoutInfo }).info ?? { soort: "intern", beschrijving: String(e) }, uitvoer: [] };
    }
    this.uitvoer = [];
    const ms = this.opties.tijdslimiet ?? 30_000;
    return new Promise<VoerUitResultaat>((klaar) => {
      const l: NonNullable<VbaClient["lopend"]> = {
        rest: ms,
        begin: Date.now(),
        afbreken: (fout) => {
          const uitvoer = this.uitvoer;
          this.beeindig(fout);
          klaar({ ok: false, fout, uitvoer });
        },
      };
      this.lopend = l;
      this.zetTimer(l);
      this.verzoek({ soort: "voerUit", id: 0, module, procedure, argumenten }).then(
        (r) => {
          if (this.lopend === l) {
            clearTimeout(l.timer);
            this.lopend = null;
          }
          klaar(r as VoerUitResultaat);
        },
        (e: { info?: VbaFoutInfo }) => {
          if (this.lopend === l) {
            clearTimeout(l.timer);
            this.lopend = null;
          }
          klaar({ ok: false, fout: e.info ?? { soort: "intern", beschrijving: String(e) }, uitvoer: this.uitvoer });
        },
      );
    });
  }

  /** Stopt de lopende uitvoering door de worker te beëindigen. */
  stop() {
    this.beeindig({ soort: "afbreking", reden: "gestopt", beschrijving: "De uitvoering is gestopt." });
  }

  /** Sluit de client definitief. */
  sluit() {
    this.stop();
    this.modules = null;
  }
}
