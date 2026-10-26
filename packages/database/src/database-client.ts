import {
  controleerDatabaseBestand,
  type DatabaseObject,
  type DatabaseSession,
} from "./model";
import type { Analyse } from "./access-analyse.ts";
import {
  WerkkopieFout,
  type OpgeslagenQuery,
  type Ontwerp,
  type QueryOpties,
  type QueryResultaat,
  type RelatieSchema,
  type Rij,
  type RijenVerzoek,
  type TabelSchema,
  type Waarde,
  type Werkkopie,
} from "./werkkopie/contract.ts";
import type { OpbouwRapport, Voortgang } from "./werkkopie/opbouw.ts";
import {
  foutUitBericht,
  type WerkkopieMethode,
} from "./werkkopie/werkkopie-brug.ts";

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

// ---------------------------------------------------------------------------
// Werkkopie (SQLite) in een eigen worker van hetzelfde script.

export interface WerkkopieTijdslimieten {
  /** Opbouw uit het origineel; standaard 5 minuten. */
  opbouw?: number;
  /** Query’s, rijen, export en tabel verwijderen; standaard 2 minuten. */
  query?: number;
  /** Overige methoden; standaard 15 seconden. */
  overig?: number;
}
export interface WerkkopieClientOpties {
  tijdslimiet?: WerkkopieTijdslimieten;
  /** Voortgang van de opbouw per tabel. */
  voortgang?: (stap: Voortgang) => void;
  /** Afbreken van de opbouw; stopt de worker. */
  signal?: AbortSignal;
}

const ZWARE_METHODEN = new Set<WerkkopieMethode>([
  "query",
  "voerQueryUit",
  "rijen",
  "exporteer",
  "verwijderTabel",
  "tabellen",
]);

/**
 * `Werkkopie` die in een eigen databaseworker draait. Zware opdrachten hebben
 * een ruimere, instelbare tijdslimiet; `annuleer()` stopt de worker direct
 * (sql.js is synchroon en kan niet halverwege worden onderbroken). Daarna is
 * de werkkopie weg; het origineel is nooit gewijzigd en kan opnieuw worden
 * opgebouwd.
 */
export class WerkkopieClient implements Werkkopie {
  private _bron: { naam: string; sha256: string };
  private _rapport: OpbouwRapport | null = null;
  private worker: Worker;
  private limieten: Required<WerkkopieTijdslimieten>;
  private nummer = 0;
  private gesloten: string | null = null;
  private wachtend = new Map<
    number,
    {
      klaar: (resultaat: unknown) => void;
      fout: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      voortgang?: (stap: Voortgang) => void;
    }
  >();

  private constructor(naam: string, limieten: Required<WerkkopieTijdslimieten>) {
    this._bron = { naam, sha256: "" };
    this.limieten = limieten;
    this.worker = new Worker(
      new URL("./database-worker.ts", import.meta.url),
      { type: "module" },
    );
    this.koppel();
  }

  get bron() {
    return this._bron;
  }
  /** Opbouwrapport: wat is overgenomen en wat niet (concreet per tabel, veld, relatie en query). */
  get rapport() {
    return this._rapport;
  }

  /** Bouwt een werkkopie uit een MDB/ACCDB. Het bestand zelf wordt alleen gelezen. */
  static async open(
    bestand: File,
    opties: WerkkopieClientOpties = {},
  ): Promise<WerkkopieClient> {
    controleerDatabaseBestand(bestand);
    const client = new WerkkopieClient(bestand.name, {
      opbouw: opties.tijdslimiet?.opbouw ?? 300_000,
      query: opties.tijdslimiet?.query ?? 120_000,
      overig: opties.tijdslimiet?.overig ?? 15_000,
    });
    const afbreken = () => client.annuleer("De opbouw van de werkkopie is afgebroken.");
    opties.signal?.addEventListener("abort", afbreken, { once: true });
    try {
      if (opties.signal?.aborted) afbreken();
      const bytes = await bestand.arrayBuffer();
      const { bron, rapport } = await client.vraag<{
        bron: { naam: string; sha256: string };
        rapport: OpbouwRapport | null;
      }>(
        { type: "werkkopie:open", bytes, naam: bestand.name },
        client.limieten.opbouw,
        [bytes],
        opties.voortgang,
      );
      client._bron = bron;
      client._rapport = rapport;
      return client;
    } catch (fout) {
      client.annuleer("De werkkopie kon niet worden opgebouwd.");
      throw fout;
    } finally {
      opties.signal?.removeEventListener("abort", afbreken);
    }
  }

  private koppel() {
    this.worker.onmessage = ({ data }) => {
      const verzoek = this.wachtend.get(data.id);
      if (!verzoek) return;
      if (data.voortgang) {
        verzoek.voortgang?.(data.voortgang);
        return;
      }
      clearTimeout(verzoek.timer);
      this.wachtend.delete(data.id);
      if (data.fout) verzoek.fout(foutUitBericht({ code: data.code, melding: data.fout }));
      else verzoek.klaar(data.resultaat);
    };
    this.worker.onerror = () =>
      this.annuleer(
        "De werkkopie is onverwacht gestopt. Het origineel is ongewijzigd; bouw de werkkopie opnieuw op.",
      );
  }

  private vraag<T>(
    bericht: Record<string, unknown>,
    limiet: number,
    overdracht: Transferable[] = [],
    voortgang?: (stap: Voortgang) => void,
  ): Promise<T> {
    if (this.gesloten) return Promise.reject(new WerkkopieFout("intern", this.gesloten));
    const id = ++this.nummer;
    return new Promise((klaar, fout) => {
      const timer = setTimeout(
        () =>
          this.annuleer(
            `De werkkopie deed er langer dan ${Math.round(limiet / 1000)} seconden over en is gestopt. Het origineel is ongewijzigd; bouw de werkkopie opnieuw op of verhoog de tijdslimiet.`,
            "beperking",
          ),
        limiet,
      );
      this.wachtend.set(id, {
        klaar: (resultaat) => klaar(resultaat as T),
        fout,
        timer,
        voortgang,
      });
      this.worker.postMessage({ id, ...bericht }, overdracht);
    });
  }

  private roep<T>(methode: WerkkopieMethode, ...args: unknown[]): Promise<T> {
    return this.vraag<T>(
      { type: "werkkopie", methode, args },
      ZWARE_METHODEN.has(methode) ? this.limieten.query : this.limieten.overig,
    );
  }

  /** Stopt de worker direct; alle openstaande verzoeken worden afgewezen. */
  annuleer(
    reden = "De werkkopie is gestopt op verzoek.",
    code: "beperking" | "intern" = "intern",
  ) {
    if (this.gesloten) return;
    this.gesloten = reden;
    this.worker.terminate();
    for (const verzoek of this.wachtend.values()) {
      clearTimeout(verzoek.timer);
      verzoek.fout(new WerkkopieFout(code, reden));
    }
    this.wachtend.clear();
  }

  /**
   * Geeft een MessagePort waarmee een andere worker (bijvoorbeeld de
   * VBA-runtime) rechtstreeks met deze werkkopie praat via
   * `werkkopieViaPoort` uit `werkkopie/werkkopie-brug.ts`.
   */
  async poort(): Promise<MessagePort> {
    const kanaal = new MessageChannel();
    await this.vraag(
      { type: "werkkopie:poort", poort: kanaal.port2 },
      this.limieten.overig,
      [kanaal.port2],
    );
    return kanaal.port1;
  }

  tabellen() {
    return this.roep<TabelSchema[]>("tabellen");
  }
  relaties() {
    return this.roep<RelatieSchema[]>("relaties");
  }
  querys() {
    return this.roep<OpgeslagenQuery[]>("querys");
  }
  query(sql: string, opties?: QueryOpties) {
    return this.roep<QueryResultaat>("query", sql, opties);
  }
  voerQueryUit(naam: string, parameters?: Record<string, Waarde>) {
    return this.roep<QueryResultaat>("voerQueryUit", naam, parameters);
  }
  parametersVan(sqlOfNaam: string) {
    return this.roep<string[]>("parametersVan", sqlOfNaam);
  }
  rijen(tabel: string, verzoek?: RijenVerzoek) {
    return this.roep<{ rijen: Rij[]; totaal: number }>("rijen", tabel, verzoek);
  }
  rij(tabel: string, rowid: number) {
    return this.roep<Rij | null>("rij", tabel, rowid);
  }
  bewaarQuery(query: OpgeslagenQuery) {
    return this.roep<void>("bewaarQuery", query);
  }
  verwijderQuery(naam: string) {
    return this.roep<void>("verwijderQuery", naam);
  }
  begin() {
    return this.roep<void>("begin");
  }
  bevestig() {
    return this.roep<void>("bevestig");
  }
  terugdraaien() {
    return this.roep<void>("terugdraaien");
  }
  voegToe(tabel: string, waarden: Record<string, Waarde>) {
    return this.roep<number>("voegToe", tabel, waarden);
  }
  wijzig(tabel: string, rowid: number, waarden: Record<string, Waarde>) {
    return this.roep<void>("wijzig", tabel, rowid, waarden);
  }
  verwijder(tabel: string, rowid: number) {
    return this.roep<void>("verwijder", tabel, rowid);
  }
  maakTabel(schema: Omit<TabelSchema, "aantal" | "herkomst">) {
    return this.roep<void>("maakTabel", schema);
  }
  verwijderTabel(naam: string) {
    return this.roep<void>("verwijderTabel", naam);
  }
  ontwerpen() {
    return this.roep<Ontwerp[]>("ontwerpen");
  }
  bewaarOntwerp(ontwerp: Ontwerp) {
    return this.roep<void>("bewaarOntwerp", ontwerp);
  }
  verwijderOntwerp(soort: Ontwerp["soort"], naam: string) {
    return this.roep<void>("verwijderOntwerp", soort, naam);
  }
  gewijzigd() {
    return this.roep<boolean>("gewijzigd");
  }
  exporteer() {
    return this.roep<Uint8Array>("exporteer");
  }
  async sluit() {
    if (this.gesloten) return;
    try {
      await this.roep<void>("sluit");
    } finally {
      this.annuleer("De werkkopie is gesloten.");
    }
  }
}
