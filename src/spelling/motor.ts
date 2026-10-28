/**
 * De "motor" achter de spellingcontrole: woorden controleren en suggesties
 * geven per taal. `DirecteMotor` draait de WASM-module in dezelfde thread
 * (in de worker en in tests); `WorkerMotor` praat met die worker vanuit de
 * hoofdthread, zodat laden en suggesties nooit het typen ophouden.
 */
import { Spellbook } from "./spellbook";
import type { TaalId } from "./talen";

export interface Motor {
  controleer(taal: TaalId, woorden: readonly string[]): Promise<boolean[]>;
  suggesties(taal: TaalId, woord: string): Promise<string[]>;
  /** Laadt het woordenboek alvast (bijvoorbeeld bij het openen van een document). */
  bereidVoor(taal: TaalId): Promise<void>;
}

export type WoordenboekBron = (taal: TaalId) => Promise<{ aff: Uint8Array; dic: Uint8Array }>;

export class DirecteMotor implements Motor {
  private woordenboeken = new Map<TaalId, Promise<number>>();
  constructor(
    private readonly module: Promise<Spellbook>,
    private readonly bron: WoordenboekBron,
  ) {}

  private woordenboek(taal: TaalId) {
    let wb = this.woordenboeken.get(taal);
    if (!wb) {
      wb = Promise.all([this.module, this.bron(taal)]).then(([m, { aff, dic }]) => m.woordenboek(aff, dic));
      // Een mislukte poging later opnieuw toestaan.
      wb.catch(() => this.woordenboeken.delete(taal));
      this.woordenboeken.set(taal, wb);
    }
    return wb;
  }

  async bereidVoor(taal: TaalId) {
    await this.woordenboek(taal);
  }

  async controleer(taal: TaalId, woorden: readonly string[]) {
    const id = await this.woordenboek(taal);
    return (await this.module).controleerLijst(id, woorden);
  }

  async suggesties(taal: TaalId, woord: string) {
    const id = await this.woordenboek(taal);
    return (await this.module).suggesties(id, woord);
  }
}

/** Berichten tussen hoofdthread en worker. */
export type Verzoek =
  | { id: number; soort: "init"; wasm: string; woordenboeken: string }
  | { id: number; soort: "controleer"; taal: TaalId; woorden: string[] }
  | { id: number; soort: "suggesties"; taal: TaalId; woord: string }
  | { id: number; soort: "bereidVoor"; taal: TaalId };
type VerzoekZonderId = Verzoek extends infer V ? (V extends Verzoek ? Omit<V, "id"> : never) : never;
export type Antwoord = { id: number; ok: true; waarde: unknown } | { id: number; ok: false; fout: string };

interface WorkerAchtig {
  postMessage(bericht: Verzoek): void;
  addEventListener(soort: "message", f: (e: MessageEvent<Antwoord>) => void): void;
  addEventListener(soort: "error", f: (e: ErrorEvent) => void): void;
  terminate(): void;
}

export class WorkerMotor implements Motor {
  private volgende = 1;
  private wachtend = new Map<number, { goed: (w: unknown) => void; fout: (e: Error) => void }>();
  private worker: WorkerAchtig;

  constructor(maak: () => WorkerAchtig, wasm: string, woordenboeken: string) {
    this.worker = maak();
    this.worker.addEventListener("message", (e) => {
      const a = e.data;
      const w = this.wachtend.get(a.id);
      if (!w) return;
      this.wachtend.delete(a.id);
      if (a.ok) w.goed(a.waarde);
      else w.fout(new Error(a.fout));
    });
    this.worker.addEventListener("error", (e) => {
      const fout = new Error(`Spellingcontrole niet beschikbaar: ${e.message}`);
      this.wachtend.forEach((w) => w.fout(fout));
      this.wachtend.clear();
    });
    void this.stuur({ soort: "init", wasm, woordenboeken }).catch(() => {
      // Het eerste echte verzoek meldt de fout.
    });
  }

  private stuur<T>(verzoek: VerzoekZonderId): Promise<T> {
    const id = this.volgende++;
    return new Promise<T>((goed, fout) => {
      this.wachtend.set(id, { goed: goed as (w: unknown) => void, fout });
      this.worker.postMessage({ ...verzoek, id });
    });
  }

  controleer(taal: TaalId, woorden: readonly string[]) {
    return this.stuur<boolean[]>({ soort: "controleer", taal, woorden: [...woorden] });
  }
  suggesties(taal: TaalId, woord: string) {
    return this.stuur<string[]>({ soort: "suggesties", taal, woord });
  }
  bereidVoor(taal: TaalId) {
    return this.stuur<void>({ soort: "bereidVoor", taal });
  }
  stop() {
    this.worker.terminate();
  }
}
