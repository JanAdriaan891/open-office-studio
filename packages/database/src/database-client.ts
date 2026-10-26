import {
  controleerDatabaseBestand,
  type DatabaseObject,
  type DatabaseSession,
} from "./model";
import type { Analyse } from "./access-analyse.ts";

export class DatabaseClient {
  private worker = new Worker(
    new URL("./database-worker.ts", import.meta.url),
    { type: "module" },
  );
  private nummer = 0;
  private gesloten: string | null = null;
  private wachtend = new Map<
    number,
    {
      klaar: (resultaat: unknown) => void;
      fout: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor() {
    this.worker.onmessage = ({ data }) => {
      const verzoek = this.wachtend.get(data.id);
      if (!verzoek) return;
      clearTimeout(verzoek.timer);
      this.wachtend.delete(data.id);
      if (data.fout) verzoek.fout(new Error(data.fout));
      else verzoek.klaar(data.resultaat);
    };
    this.worker.onerror = () =>
      this.sluit(
        "De databaselezer is gestopt. Open het bestand opnieuw om verder te gaan.",
      );
  }
  private vraag<T>(
    bericht: Record<string, unknown>,
    overdracht: Transferable[] = [],
  ): Promise<T> {
    if (this.gesloten) return Promise.reject(new Error(this.gesloten));
    const id = ++this.nummer;
    return new Promise((klaar, fout) => {
      const timer = setTimeout(
        () =>
          this.sluit(
            "Het lezen duurde langer dan 15 seconden. De parser is gestopt; het origineel is behouden.",
          ),
        15000,
      );
      this.wachtend.set(id, {
        klaar: (resultaat) => klaar(resultaat as T),
        fout,
        timer,
      });
      this.worker.postMessage({ id, ...bericht }, overdracht);
    });
  }
  async open(file: File): Promise<DatabaseSession> {
    controleerDatabaseBestand(file);
    const bytes = await file.arrayBuffer();
    const { objecten, rapport } = await this.vraag<Analyse>(
      { type: "open", bytes, naam: file.name },
      [bytes],
    );
    return {
      naam: file.name,
      grootte: file.size,
      voorbeeld: false,
      objecten,
      rapport,
      melding:
        "Alleen-lezen: tabellen (200 rijen per pagina), relaties, indexen, querydefinities en aanwezige VBA-bron worden lokaal gelezen. Formulieren, rapporten en macro’s worden alleen geïnventariseerd. Niets wordt uitgevoerd; zie het compatibiliteitsrapport.",
    };
  }
  tabel(naam: string, start: number) {
    return this.vraag<DatabaseObject>({ type: "tabel", naam, start });
  }
  sluit(reden = "De database is gesloten.") {
    this.gesloten = reden;
    this.worker.terminate();
    for (const verzoek of this.wachtend.values()) {
      clearTimeout(verzoek.timer);
      verzoek.fout(new Error(reden));
    }
    this.wachtend.clear();
  }
}
