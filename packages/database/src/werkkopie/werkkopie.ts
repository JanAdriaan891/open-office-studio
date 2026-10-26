/**
 * In-proces-implementatie van `Werkkopie` op sql.js. Draait in de
 * databaseworker, in een eigen worker van de VBA-runtime (via de
 * MessagePort-brug) en direct in Node voor tests en proeven.
 */
import type MDBReader from "mdb-reader";
import type { BindParams, Database, SqlJsStatic, SqlValue, Statement } from "sql.js";
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
  type VeldSchema,
  type Waarde,
  type Werkkopie,
} from "./contract.ts";
import {
  citeer,
  ontleedAccessSql,
  parameterNamen,
  ROWID_KOLOM,
  soortUitType,
  typeVoorSoort,
  vertaalAccessSql,
  type ParameterSlot,
  type TabelInfo,
  type VertaalContext,
  type Vertaling,
} from "./access-sql.ts";
import { msUitTekst, msUitWaarde, isoUitMs, registreerAccessFuncties } from "./functies.ts";
import { bouwWerkkopie, META_TABELLEN, SCHEMAVERSIE, type OpbouwOpties, type OpbouwRapport } from "./opbouw.ts";

const STANDAARD_LIMIET = 10_000;

function melding(fout: unknown) {
  return fout instanceof Error ? fout.message : String(fout);
}

/** SQLite-fout naar een herkenbare werkkopiefout. */
export function sqliteFout(fout: unknown, context: string): WerkkopieFout {
  if (fout instanceof WerkkopieFout) return fout;
  const tekst = melding(fout);
  let code: WerkkopieFout["code"] = "intern";
  if (/no such (table|column|function)|ambiguous column/i.test(tekst)) code = "onbekend-object";
  else if (/constraint|FOREIGN KEY|duplicate column name|already exists/i.test(tekst)) code = "beperking";
  else if (/syntax error|misuse of aggregate|incomplete input|wrong number of arguments|not allowed|no tables specified|does not match|is not a function/i.test(tekst))
    code = "syntaxis";
  else if (/readonly|read-only/i.test(tekst)) code = "alleen-lezen";
  return new WerkkopieFout(code, `${context}: ${tekst}`);
}

const kl = (s: string) => s.toLowerCase();
const isMeta = (naam: string) => /^(_openaec_|sqlite_)/i.test(naam);

function naarSql(w: Waarde | undefined): SqlValue {
  if (w === undefined || w === null) return null;
  if (typeof w === "boolean") return w ? 1 : 0;
  return w;
}

/** Zet een parameterwaarde om naar het type uit de PARAMETERS-declaratie. */
function parameterWaarde(w: Waarde, slot: ParameterSlot): SqlValue {
  if (w === null) return null;
  const type = (slot.type ?? "").toLowerCase();
  const naam = slot.naam ?? `?${(slot.positie ?? 0) + 1}`;
  if (type === "datetime" || type === "date") {
    const ms = typeof w === "string" ? msUitTekst(w) : typeof w === "number" ? msUitWaarde(w) : null;
    if (ms === null) throw new WerkkopieFout("syntaxis", `Parameter ‘${naam}’ verwacht een datum, niet ‘${String(w)}’.`);
    return isoUitMs(ms);
  }
  if (type === "bit") return typeof w === "string" ? (/^(true|waar|ja|yes|-1|1)$/i.test(w.trim()) ? 1 : 0) : w ? 1 : 0;
  if (["byte", "short", "long", "integer", "currency", "ieeesingle", "ieeedouble", "single", "double", "decimal"].includes(type)) {
    if (typeof w === "boolean") return w ? -1 : 0;
    const n = typeof w === "number" ? w : Number(String(w).trim().replace(",", "."));
    if (!Number.isFinite(n)) throw new WerkkopieFout("syntaxis", `Parameter ‘${naam}’ verwacht een getal, niet ‘${String(w)}’.`);
    return ["byte", "short", "long", "integer"].includes(type) ? Math.round(n) : n;
  }
  if (type === "text" || type === "memo") return typeof w === "boolean" ? (w ? "Waar" : "Onwaar") : w instanceof Uint8Array ? w : String(w);
  return naarSql(w);
}

export interface WerkkopieOpties extends OpbouwOpties {}

export class SqliteWerkkopie implements Werkkopie {
  readonly bron: { naam: string; sha256: string };
  /** Rapport van de opbouw; null als de werkkopie uit een bestaand SQLite-bestand is geladen. */
  readonly opbouwrapport: OpbouwRapport | null;
  private db: Database | null;
  private basisWijzigingen: number;
  private ddlGewijzigd = false;
  private tabelCache: Map<string, TabelInfo & { primair: string[]; velden: VeldSchema[] }> | null = null;
  private queryCache: Map<string, OpgeslagenQuery> | null = null;

  constructor(db: Database, bron: { naam: string; sha256: string }, rapport: OpbouwRapport | null) {
    this.db = db;
    this.bron = bron;
    this.opbouwrapport = rapport;
    db.run("PRAGMA foreign_keys = ON");
    registreerAccessFuncties(db);
    this.basisWijzigingen = this.totaalWijzigingen();
  }

  private get open(): Database {
    if (!this.db) throw new WerkkopieFout("intern", "De werkkopie is gesloten.");
    return this.db;
  }

  private totaalWijzigingen(): number {
    return Number(this.open.exec("SELECT total_changes()")[0].values[0][0]);
  }

  private ongeldig() {
    this.tabelCache = null;
    this.queryCache = null;
    this.gekoppeldCache = null;
  }

  private alle(sql: string, params: BindParams = []): SqlValue[][] {
    const stmt = this.open.prepare(sql);
    try {
      stmt.bind(params);
      const rijen: SqlValue[][] = [];
      while (stmt.step()) rijen.push(stmt.get());
      return rijen;
    } finally {
      stmt.free();
    }
  }

  // ------------------------------------------------------------- schema

  private schema() {
    if (this.tabelCache) return this.tabelCache;
    const namen = this.alle(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_openaec\\_%' ESCAPE '\\' ORDER BY name COLLATE NOCASE",
    ).map((r) => String(r[0]));
    const kaart = new Map<string, TabelInfo & { primair: string[]; velden: VeldSchema[] }>();
    for (const naam of namen) {
      const info = this.alle(`PRAGMA table_info(${citeer(naam)})`);
      const primairen = info.filter((r) => Number(r[5]) > 0).sort((a, b) => Number(a[5]) - Number(b[5]));
      const enige = primairen.length === 1;
      const velden: VeldSchema[] = info.map((r) => {
        const pk = Number(r[5]) > 0;
        const { soort, lengte } = soortUitType(String(r[2] ?? ""), pk && enige);
        const veld: VeldSchema = { naam: String(r[1]), soort };
        if (lengte) veld.lengte = lengte;
        if (Number(r[3])) veld.verplicht = true;
        if (pk) veld.primair = true;
        if (r[4] !== null && r[4] !== undefined) veld.standaard = standaardUit(String(r[4]));
        return veld;
      });
      kaart.set(kl(naam), {
        naam,
        kolommen: velden.map((v) => ({ naam: v.naam, soort: v.soort })),
        primair: primairen.map((r) => String(r[1])),
        velden,
      });
    }
    this.tabelCache = kaart;
    return kaart;
  }

  private tabelInfo(naam: string) {
    const t = this.schema().get(kl(naam));
    if (!t) throw new WerkkopieFout("onbekend-object", `Tabel ‘${naam}’ bestaat niet in de werkkopie.`);
    return t;
  }

  private queryKaart() {
    if (this.queryCache) return this.queryCache;
    const kaart = new Map<string, OpgeslagenQuery>();
    for (const [naam, sql, soort] of this.alle("SELECT naam, sql, soort FROM _openaec_querys ORDER BY naam COLLATE NOCASE"))
      kaart.set(kl(String(naam)), { naam: String(naam), sql: String(sql), soort: String(soort) as OpgeslagenQuery["soort"] });
    this.queryCache = kaart;
    return kaart;
  }

  private gekoppeldCache: Map<string, string> | null = null;
  private gekoppeld(naam: string): string | null {
    if (!this.gekoppeldCache) {
      this.gekoppeldCache = new Map();
      const rij = this.alle("SELECT waarde FROM _openaec_meta WHERE sleutel = 'gekoppeldetabellen'")[0];
      try {
        for (const g of JSON.parse(String(rij?.[0] ?? "[]")) as { naam: string; soort: string }[])
          this.gekoppeldCache.set(kl(g.naam), g.soort);
      } catch {
        /* geen gegevens */
      }
    }
    return this.gekoppeldCache.get(kl(naam)) ?? null;
  }

  private accessTabellen(): Set<string> {
    const rij = this.alle("SELECT waarde FROM _openaec_meta WHERE sleutel = 'accesstabellen'")[0];
    try {
      return new Set((JSON.parse(String(rij?.[0] ?? "[]")) as string[]).map(kl));
    } catch {
      return new Set();
    }
  }

  async tabellen(): Promise<TabelSchema[]> {
    const access = this.accessTabellen();
    return [...this.schema().values()].map((t) => ({
      naam: t.naam,
      velden: t.velden.map((v) => ({ ...v })),
      aantal: Number(this.open.exec(`SELECT COUNT(*) FROM ${citeer(t.naam)}`)[0].values[0][0]),
      herkomst: access.has(kl(t.naam)) ? "access" : "werkkopie",
    }));
  }

  async relaties(): Promise<RelatieSchema[]> {
    return this.alle("SELECT naam, tabel, velden, naarTabel, naarVelden, integriteit FROM _openaec_relaties ORDER BY naam COLLATE NOCASE").map((r) => ({
      naam: String(r[0]),
      tabel: String(r[1]),
      velden: JSON.parse(String(r[2])),
      naarTabel: String(r[3]),
      naarVelden: JSON.parse(String(r[4])),
      integriteit: !!r[5],
    }));
  }

  async querys(): Promise<OpgeslagenQuery[]> {
    return [...this.queryKaart().values()].map((q) => ({ ...q }));
  }

  // ------------------------------------------------------------- query’s

  private context(waarden: (slots: ParameterSlot[]) => SqlValue[]): VertaalContext {
    return {
      tabel: (naam) => {
        const t = this.schema().get(kl(naam));
        return t ? { naam: t.naam, kolommen: t.kolommen } : null;
      },
      query: (naam) => this.queryKaart().get(kl(naam)) ?? null,
      gekoppeld: (naam) => this.gekoppeld(naam),
      pivotWaarden: (sql, slots) => {
        try {
          return this.alle(sql, waarden(slots)).map((r) => r[0] as Waarde);
        } catch (fout) {
          throw sqliteFout(fout, "Kolomkoppen van de kruistabel ophalen mislukt");
        }
      },
    };
  }

  private bindingen(slots: ParameterSlot[], parameters: QueryOpties["parameters"]): SqlValue[] {
    const lijst = Array.isArray(parameters) ? parameters : null;
    const record = !lijst && parameters ? parameters : null;
    const opNaam = new Map<string, Waarde>();
    if (record) for (const [k, v] of Object.entries(record)) opNaam.set(kl(k.replace(/^\[(.*)\]$/, "$1")), v);
    // Bij een lijst krijgen de benoemde parameters de waarden in volgorde van eerste gebruik.
    const benoemd = [...new Set(slots.filter((s) => s.naam !== null).map((s) => kl(s.naam!)))];
    const heeftPositioneel = slots.some((s) => s.naam === null);
    return slots.map((slot) => {
      let w: Waarde | undefined;
      if (slot.naam === null) w = lijst ? lijst[slot.positie ?? 0] : opNaam.get(`?${(slot.positie ?? 0) + 1}`);
      else if (record) w = opNaam.has(kl(slot.naam)) ? opNaam.get(kl(slot.naam)) : undefined;
      else if (lijst && !heeftPositioneel) w = lijst[benoemd.indexOf(kl(slot.naam))];
      if (w === undefined)
        throw new WerkkopieFout(
          "parameter-ontbreekt",
          slot.naam === null
            ? `Geef een waarde voor parameter ${(slot.positie ?? 0) + 1} (?).`
            : `Geef een waarde voor parameter ‘${slot.naam}’.`,
        );
      return parameterWaarde(w, slot);
    });
  }

  private vertaal(sql: string, parameters: QueryOpties["parameters"], opgeslagen?: OpgeslagenQuery): Vertaling {
    return vertaalAccessSql(sql, this.context((slots) => this.bindingen(slots, parameters)), {
      soort: opgeslagen?.soort,
      naam: opgeslagen?.naam,
      metRowid: true,
    });
  }

  /** Alleen een naam (eventueel tussen haken) die een opgeslagen query is. */
  private alsQueryNaam(sql: string): OpgeslagenQuery | null {
    const naam = sql.trim().replace(/;+$/, "").trim().replace(/^\[(.*)\]$/s, "$1");
    if (!naam || naam.length > 255) return null;
    return this.queryKaart().get(kl(naam)) ?? null;
  }

  async query(sql: string, opties: QueryOpties = {}): Promise<QueryResultaat> {
    const limiet = Math.max(0, opties.limiet ?? STANDAARD_LIMIET);
    if ((opties.dialect ?? "access") === "sqlite") return this.sqliteQuery(sql, opties.parameters, limiet);
    const opgeslagen = this.alsQueryNaam(sql);
    return this.voerVertaaldUit(opgeslagen?.sql ?? sql, opties.parameters, limiet, opgeslagen ?? undefined);
  }

  async voerQueryUit(naam: string, parameters?: Record<string, Waarde>): Promise<QueryResultaat> {
    const q = this.queryKaart().get(kl(naam));
    if (!q) throw new WerkkopieFout("onbekend-object", `Query ‘${naam}’ bestaat niet in de werkkopie.`);
    return this.voerVertaaldUit(q.sql, parameters, STANDAARD_LIMIET, q);
  }

  async parametersVan(sqlOfNaam: string): Promise<string[]> {
    const q = this.alsQueryNaam(sqlOfNaam);
    const v = vertaalAccessSql(q?.sql ?? sqlOfNaam, {
      tabel: (naam) => {
        const t = this.schema().get(kl(naam));
        return t ? { naam: t.naam, kolommen: t.kolommen } : null;
      },
      query: (naam) => this.queryKaart().get(kl(naam)) ?? null,
      gekoppeld: (naam) => this.gekoppeld(naam),
    }, { soort: q?.soort, naam: q?.naam });
    return parameterNamen(v);
  }

  /** Vertaalt en voert uit; actiequery’s binnen een savepoint, zodat een fout niets half achterlaat. */
  private voerVertaaldUit(sql: string, parameters: QueryOpties["parameters"], limiet: number, opgeslagen?: OpgeslagenQuery): QueryResultaat {
    const db = this.open;
    const v = this.vertaal(sql, parameters, opgeslagen);
    const binding = this.bindingen(v.parameters, parameters);
    const uitgevoerd = [...v.voorbereiding, v.sql].join(";\n");
    if (v.geeftRijen) {
      let stmt: Statement;
      try {
        stmt = db.prepare(v.sql);
      } catch (fout) {
        throw sqliteFout(fout, "De vertaalde query is ongeldig");
      }
      try {
        stmt.bind(binding);
        let kolommen = stmt.getColumnNames();
        const metRowid = v.rowidTabel !== null && kolommen[0] === ROWID_KOLOM;
        if (metRowid) kolommen = kolommen.slice(1);
        const rijen: Waarde[][] = [];
        const rowids: number[] = [];
        let afgekapt = false;
        while (stmt.step()) {
          if (rijen.length >= limiet) {
            afgekapt = true;
            break;
          }
          const rij = stmt.get() as Waarde[];
          if (metRowid) rowids.push(Number(rij.shift()));
          rijen.push(rij);
        }
        // Veldsoort per kolom: op positie als de vertaler alle kolommen kent, anders op naam.
        const bekend = v.kolommen;
        const kolomsoorten = kolommen.map((naam, i) =>
          bekend && bekend.length === kolommen.length
            ? bekend[i].soort
            : (bekend?.find((k) => kl(k.naam) === kl(naam))?.soort ?? null),
        );
        const resultaat: QueryResultaat = { kolommen, rijen, gewijzigd: 0, afgekapt, uitgevoerd, kolomsoorten };
        if (metRowid) resultaat.bron = { tabel: v.rowidTabel!, rowids };
        return resultaat;
      } catch (fout) {
        throw sqliteFout(fout, "Uitvoeren van de query mislukt");
      } finally {
        stmt.free();
      }
    }
    db.run("SAVEPOINT openaec_query");
    try {
      for (const voor of v.voorbereiding) db.run(voor);
      db.run(v.sql, binding);
      const gewijzigd = v.soort === "ddl" ? 0 : v.soort === "maketable" && v.doeltabel
        ? Number(db.exec(`SELECT COUNT(*) FROM ${citeer(v.doeltabel)}`)[0].values[0][0])
        : db.getRowsModified();
      db.run("RELEASE openaec_query");
      if (v.soort === "ddl" || v.soort === "maketable") {
        this.ddlGewijzigd = true;
        this.ongeldig();
      }
      return { kolommen: [], rijen: [], gewijzigd, afgekapt: false, uitgevoerd };
    } catch (fout) {
      db.run("ROLLBACK TO openaec_query");
      db.run("RELEASE openaec_query");
      throw sqliteFout(fout, "Uitvoeren van de actiequery mislukt; er is niets gewijzigd");
    }
  }

  private sqliteQuery(sql: string, parameters: QueryOpties["parameters"], limiet: number): QueryResultaat {
    const db = this.open;
    const eerste = /^\s*(\w+)/.exec(sql)?.[1]?.toUpperCase() ?? "";
    const leest = ["SELECT", "WITH", "VALUES", "EXPLAIN"].includes(eerste) || (eerste === "PRAGMA" && !/=/.test(sql));
    if (!leest && /_openaec_|sqlite_master|sqlite_schema/i.test(sql))
      throw new WerkkopieFout("alleen-lezen", "De metatabellen van de werkkopie zijn alleen via de werkkopiemethoden te wijzigen.");
    let binding: BindParams = [];
    if (Array.isArray(parameters)) binding = parameters.map((w) => naarSql(w));
    else if (parameters)
      binding = Object.fromEntries(Object.entries(parameters).map(([k, w]) => [/^[:$@]/.test(k) ? k : `:${k}`, naarSql(w)]));
    let stmt: Statement;
    try {
      stmt = db.prepare(sql);
    } catch (fout) {
      throw sqliteFout(fout, "SQLite weigert de opdracht");
    }
    try {
      stmt.bind(binding);
      const kolommen = stmt.getColumnNames();
      const rijen: Waarde[][] = [];
      let afgekapt = false;
      while (stmt.step()) {
        if (rijen.length >= limiet) {
          afgekapt = true;
          break;
        }
        rijen.push(stmt.get() as Waarde[]);
      }
      if (!leest) {
        this.ongeldig();
        if (/^(CREATE|DROP|ALTER)$/.test(eerste)) this.ddlGewijzigd = true;
      }
      return { kolommen, rijen, gewijzigd: leest ? 0 : db.getRowsModified(), afgekapt, uitgevoerd: sql };
    } catch (fout) {
      throw sqliteFout(fout, "Uitvoeren mislukt");
    } finally {
      stmt.free();
    }
  }

  // ------------------------------------------------------------- rijen

  private schrijfbaar(tabel: string) {
    if (isMeta(tabel)) throw new WerkkopieFout("alleen-lezen", `‘${tabel}’ is een metatabel van de werkkopie.`);
    return this.tabelInfo(tabel);
  }

  async rijen(tabel: string, verzoek: RijenVerzoek = {}): Promise<{ rijen: Rij[]; totaal: number }> {
    const t = this.tabelInfo(tabel);
    const start = Math.max(0, Math.trunc(verzoek.start ?? 0));
    const aantal = Math.max(0, Math.trunc(verzoek.aantal ?? 200));
    const params: SqlValue[] = [];
    let waar = "";
    if (verzoek.zoek) {
      const tekstvelden = t.velden.filter((v) => v.soort === "tekst" || v.soort === "memo" || v.soort === "guid");
      if (!tekstvelden.length) return { rijen: [], totaal: 0 };
      const patroon = `%${verzoek.zoek.replace(/[\\%_]/g, "\\$&")}%`;
      waar = ` WHERE ${tekstvelden.map((v) => `${citeer(v.naam)} LIKE ? ESCAPE '\\'`).join(" OR ")}`;
      for (const _ of tekstvelden) params.push(patroon);
    }
    let orde = " ORDER BY rowid";
    if (verzoek.sorteer) {
      const veld = t.velden.find((v) => kl(v.naam) === kl(verzoek.sorteer!.veld));
      if (!veld) throw new WerkkopieFout("onbekend-object", `Veld ‘${verzoek.sorteer.veld}’ bestaat niet in tabel ‘${t.naam}’.`);
      orde = ` ORDER BY ${citeer(veld.naam)}${verzoek.sorteer.aflopend ? " DESC" : ""}, rowid`;
    }
    const totaal = Number(this.alle(`SELECT COUNT(*) FROM ${citeer(t.naam)}${waar}`, params)[0][0]);
    const jaNee = new Set(t.velden.filter((v) => v.soort === "jaNee").map((v) => v.naam));
    const kolommen = t.velden.map((v) => v.naam);
    const rijen = this.alle(
      `SELECT rowid, ${kolommen.map(citeer).join(", ")} FROM ${citeer(t.naam)}${waar}${orde} LIMIT ? OFFSET ?`,
      [...params, aantal, start],
    ).map((r) => {
      const waarden: Record<string, Waarde> = {};
      kolommen.forEach((k, i) => {
        const w = r[i + 1] as Waarde;
        waarden[k] = jaNee.has(k) && typeof w === "number" ? w !== 0 : w;
      });
      return { rowid: Number(r[0]), waarden };
    });
    return { rijen, totaal };
  }

  async rij(tabel: string, rowid: number): Promise<Rij | null> {
    const t = this.tabelInfo(tabel);
    const kolommen = t.velden.map((v) => v.naam);
    const jaNee = new Set(t.velden.filter((v) => v.soort === "jaNee").map((v) => v.naam));
    const r = this.alle(`SELECT rowid, ${kolommen.map(citeer).join(", ")} FROM ${citeer(t.naam)} WHERE rowid = ?`, [rowid])[0];
    if (!r) return null;
    const waarden: Record<string, Waarde> = {};
    kolommen.forEach((k, i) => {
      const w = r[i + 1] as Waarde;
      waarden[k] = jaNee.has(k) && typeof w === "number" ? w !== 0 : w;
    });
    return { rowid: Number(r[0]), waarden };
  }

  private kolommenVoor(t: ReturnType<SqliteWerkkopie["tabelInfo"]>, waarden: Record<string, Waarde>) {
    return Object.entries(waarden).map(([naam, w]) => {
      const veld = t.velden.find((v) => kl(v.naam) === kl(naam));
      if (!veld) throw new WerkkopieFout("onbekend-object", `Veld ‘${naam}’ bestaat niet in tabel ‘${t.naam}’.`);
      if (veld.soort === "datum" && typeof w === "string" && w.trim()) {
        const ms = msUitTekst(w);
        if (ms === null) throw new WerkkopieFout("syntaxis", `‘${w}’ is geen geldige datum voor veld ‘${veld.naam}’.`);
        return { veld, waarde: isoUitMs(ms) as SqlValue };
      }
      return { veld, waarde: naarSql(w) };
    });
  }

  private schrijf<T>(context: string, actie: () => T): T {
    try {
      return actie();
    } catch (fout) {
      throw sqliteFout(fout, context);
    }
  }

  async voegToe(tabel: string, waarden: Record<string, Waarde>): Promise<number> {
    const t = this.schrijfbaar(tabel);
    const paren = this.kolommenVoor(t, waarden);
    // Autonummer zonder rowid-alias: volgend nummer zelf toekennen.
    for (const veld of t.velden)
      if (veld.soort === "autonummer" && !(veld.primair && t.primair.length === 1) && !paren.some((p) => p.veld === veld)) {
        const max = Number(this.alle(`SELECT COALESCE(MAX(${citeer(veld.naam)}), 0) FROM ${citeer(t.naam)}`)[0][0]);
        paren.push({ veld, waarde: max + 1 });
      }
    const sql = paren.length
      ? `INSERT INTO ${citeer(t.naam)} (${paren.map((p) => citeer(p.veld.naam)).join(", ")}) VALUES (${paren.map(() => "?").join(", ")})`
      : `INSERT INTO ${citeer(t.naam)} DEFAULT VALUES`;
    return this.schrijf(`Rij toevoegen aan ‘${t.naam}’ mislukt`, () => {
      this.open.run(sql, paren.map((p) => p.waarde));
      return Number(this.open.exec("SELECT last_insert_rowid()")[0].values[0][0]);
    });
  }

  async wijzig(tabel: string, rowid: number, waarden: Record<string, Waarde>): Promise<void> {
    const t = this.schrijfbaar(tabel);
    const paren = this.kolommenVoor(t, waarden);
    if (!paren.length) return;
    this.schrijf(`Rij in ‘${t.naam}’ wijzigen mislukt`, () => {
      this.open.run(
        `UPDATE ${citeer(t.naam)} SET ${paren.map((p) => `${citeer(p.veld.naam)} = ?`).join(", ")} WHERE rowid = ?`,
        [...paren.map((p) => p.waarde), rowid],
      );
    });
    if (!this.open.getRowsModified()) throw new WerkkopieFout("onbekend-object", `Rij ${rowid} bestaat niet in tabel ‘${t.naam}’.`);
  }

  async verwijder(tabel: string, rowid: number): Promise<void> {
    const t = this.schrijfbaar(tabel);
    this.schrijf(`Rij uit ‘${t.naam}’ verwijderen mislukt`, () =>
      this.open.run(`DELETE FROM ${citeer(t.naam)} WHERE rowid = ?`, [rowid]),
    );
    if (!this.open.getRowsModified()) throw new WerkkopieFout("onbekend-object", `Rij ${rowid} bestaat niet in tabel ‘${t.naam}’.`);
  }

  // ------------------------------------------------------------- tabellen

  async maakTabel(schema: Omit<TabelSchema, "aantal" | "herkomst">): Promise<void> {
    const naam = schema.naam?.trim();
    if (!naam) throw new WerkkopieFout("syntaxis", "Geef de tabel een naam.");
    if (isMeta(naam)) throw new WerkkopieFout("alleen-lezen", `‘${naam}’ is een gereserveerde naam van de werkkopie.`);
    if (this.schema().has(kl(naam)) || this.queryKaart().has(kl(naam)))
      throw new WerkkopieFout("beperking", `Er bestaat al een tabel of query ‘${naam}’.`);
    if (!schema.velden.length) throw new WerkkopieFout("syntaxis", "Een tabel heeft minstens één veld nodig.");
    const namen = new Set<string>();
    for (const v of schema.velden) {
      if (!v.naam?.trim()) throw new WerkkopieFout("syntaxis", "Elk veld heeft een naam nodig.");
      if (namen.has(kl(v.naam))) throw new WerkkopieFout("syntaxis", `Veld ‘${v.naam}’ komt twee keer voor.`);
      namen.add(kl(v.naam));
    }
    const primair = schema.velden.filter((v) => v.primair);
    const enige = primair.length === 1;
    const delen = schema.velden.map((v) => {
      const isPk = enige && v.primair === true;
      let sql = `${citeer(v.naam)} ${typeVoorSoort(v.soort, { lengte: v.lengte, primair: isPk, enigePrimair: enige })}`;
      if (isPk) sql += " PRIMARY KEY";
      if (v.verplicht) sql += " NOT NULL";
      if (v.standaard !== undefined) sql += ` DEFAULT ${sqlLiteraal(v.standaard)}`;
      if (v.soort === "tekst" && v.lengte && v.lengte > 0) sql += ` CHECK (length(${citeer(v.naam)}) <= ${Math.trunc(v.lengte)})`;
      return sql;
    });
    if (primair.length > 1) delen.push(`PRIMARY KEY (${primair.map((v) => citeer(v.naam)).join(", ")})`);
    this.schrijf(`Tabel ‘${naam}’ maken mislukt`, () => this.open.run(`CREATE TABLE ${citeer(naam)} (${delen.join(", ")})`));
    this.ddlGewijzigd = true;
    this.ongeldig();
  }

  async verwijderTabel(naam: string): Promise<void> {
    const t = this.schrijfbaar(naam);
    const verwijzend = this.alle(
      "SELECT naam, tabel FROM _openaec_relaties WHERE integriteit = 1 AND lower(naarTabel) = lower(?) AND lower(tabel) <> lower(?)",
      [t.naam, t.naam],
    );
    if (verwijzend.length)
      throw new WerkkopieFout(
        "beperking",
        `Tabel ‘${t.naam}’ kan niet worden verwijderd: relatie ‘${verwijzend[0][0]}’ vanuit ‘${verwijzend[0][1]}’ dwingt referentiële integriteit af.`,
      );
    this.schrijf(`Tabel ‘${t.naam}’ verwijderen mislukt`, () => {
      this.open.run("SAVEPOINT openaec_drop");
      try {
        this.open.run(`DROP TABLE ${citeer(t.naam)}`);
        this.open.run("DELETE FROM _openaec_relaties WHERE lower(tabel) = lower(?) OR lower(naarTabel) = lower(?)", [t.naam, t.naam]);
        this.open.run("DELETE FROM _openaec_bijlagen WHERE lower(tabel) = lower(?)", [t.naam]);
        this.open.run("RELEASE openaec_drop");
      } catch (fout) {
        this.open.run("ROLLBACK TO openaec_drop");
        this.open.run("RELEASE openaec_drop");
        throw fout;
      }
    });
    this.ddlGewijzigd = true;
    this.ongeldig();
  }

  // ------------------------------------------------------------- opgeslagen query’s

  async bewaarQuery(query: OpgeslagenQuery): Promise<void> {
    const naam = query.naam?.trim();
    const soorten: OpgeslagenQuery["soort"][] = ["select", "crosstab", "delete", "update", "append", "maketable", "ddl", "union", "passthrough"];
    if (!naam) throw new WerkkopieFout("syntaxis", "Geef de query een naam.");
    if (!soorten.includes(query.soort)) throw new WerkkopieFout("syntaxis", `Onbekende querysoort ‘${String(query.soort)}’.`);
    if (typeof query.sql !== "string" || !query.sql.trim()) throw new WerkkopieFout("syntaxis", "De query heeft geen SQL.");
    if (this.schema().has(kl(naam))) throw new WerkkopieFout("beperking", `Er bestaat al een tabel ‘${naam}’; een query mag niet dezelfde naam hebben.`);
    // Access bewaart alleen ontleedbare SQL; pass-through-SQL is voor een externe server.
    if (query.soort !== "passthrough") ontleedAccessSql(query.sql);
    this.schrijf("Query bewaren mislukt", () => {
      this.open.run("DELETE FROM _openaec_querys WHERE naam = ? COLLATE NOCASE", [naam]);
      this.open.run("INSERT INTO _openaec_querys (naam, sql, soort) VALUES (?, ?, ?)", [naam, query.sql, query.soort]);
    });
    this.queryCache = null;
    this.ddlGewijzigd = true;
  }

  async verwijderQuery(naam: string): Promise<void> {
    this.open.run("DELETE FROM _openaec_querys WHERE naam = ? COLLATE NOCASE", [naam]);
    if (!this.open.getRowsModified()) throw new WerkkopieFout("onbekend-object", `Query ‘${naam}’ bestaat niet in de werkkopie.`);
    this.queryCache = null;
    this.ddlGewijzigd = true;
  }

  // ------------------------------------------------------------- transacties

  private transactie: { wijzigingen: number; ddl: boolean } | null = null;

  async begin(): Promise<void> {
    if (this.transactie)
      throw new WerkkopieFout("beperking", "Er loopt al een transactie; geneste transacties worden niet ondersteund.");
    this.open.run("SAVEPOINT openaec_transactie");
    this.transactie = { wijzigingen: this.totaalWijzigingen(), ddl: this.ddlGewijzigd };
  }

  async bevestig(): Promise<void> {
    if (!this.transactie) throw new WerkkopieFout("beperking", "Er loopt geen transactie om te bevestigen.");
    this.schrijf("Transactie bevestigen mislukt", () => this.open.run("RELEASE openaec_transactie"));
    this.transactie = null;
  }

  async terugdraaien(): Promise<void> {
    if (!this.transactie) throw new WerkkopieFout("beperking", "Er loopt geen transactie om terug te draaien.");
    const { wijzigingen, ddl } = this.transactie;
    this.schrijf("Transactie terugdraaien mislukt", () => {
      this.open.run("ROLLBACK TO openaec_transactie");
      this.open.run("RELEASE openaec_transactie");
    });
    // Teruggedraaide wijzigingen tellen niet als wijziging van de werkkopie.
    this.basisWijzigingen += this.totaalWijzigingen() - wijzigingen;
    this.ddlGewijzigd = ddl;
    this.transactie = null;
    this.ongeldig();
  }

  // ------------------------------------------------------------- ontwerpen

  async ontwerpen(): Promise<Ontwerp[]> {
    return this.alle("SELECT naam, soort, bron, definitie FROM _openaec_ontwerpen ORDER BY soort, naam COLLATE NOCASE").map((r) => ({
      naam: String(r[0]),
      soort: String(r[1]) as Ontwerp["soort"],
      bron: String(r[2]),
      definitie: JSON.parse(String(r[3])),
    }));
  }

  async bewaarOntwerp(ontwerp: Ontwerp): Promise<void> {
    if (ontwerp.soort !== "formulier" && ontwerp.soort !== "rapport")
      throw new WerkkopieFout("syntaxis", `Onbekende ontwerpsoort ‘${String(ontwerp.soort)}’.`);
    if (!ontwerp.naam?.trim()) throw new WerkkopieFout("syntaxis", "Geef het ontwerp een naam.");
    let definitie: string;
    try {
      definitie = JSON.stringify(ontwerp.definitie ?? null);
    } catch (fout) {
      throw new WerkkopieFout("beperking", `De ontwerpdefinitie is niet als JSON te bewaren: ${melding(fout)}`);
    }
    this.schrijf("Ontwerp bewaren mislukt", () =>
      this.open.run("INSERT OR REPLACE INTO _openaec_ontwerpen (soort, naam, bron, definitie) VALUES (?, ?, ?, ?)", [
        ontwerp.soort,
        ontwerp.naam,
        ontwerp.bron ?? "",
        definitie,
      ]),
    );
    this.ddlGewijzigd = true;
  }

  async verwijderOntwerp(soort: Ontwerp["soort"], naam: string): Promise<void> {
    this.open.run("DELETE FROM _openaec_ontwerpen WHERE soort = ? AND naam = ?", [soort, naam]);
    if (!this.open.getRowsModified()) throw new WerkkopieFout("onbekend-object", `Er is geen ${soort} ‘${naam}’.`);
    this.ddlGewijzigd = true;
  }

  // ------------------------------------------------------------- overig

  async gewijzigd(): Promise<boolean> {
    return this.ddlGewijzigd || this.totaalWijzigingen() !== this.basisWijzigingen;
  }

  async exporteer(): Promise<Uint8Array> {
    const db = this.open;
    if (this.transactie)
      throw new WerkkopieFout("beperking", "Rond eerst de lopende transactie af (bevestigen of terugdraaien) voordat je exporteert.");
    const wijzigingen = this.totaalWijzigingen() - this.basisWijzigingen;
    // sql.js heropent de verbinding bij export(): functies en pragma’s opnieuw zetten.
    const bytes = db.export();
    db.run("PRAGMA foreign_keys = ON");
    registreerAccessFuncties(db);
    this.basisWijzigingen = this.totaalWijzigingen() - wijzigingen;
    return bytes;
  }

  async sluit(): Promise<void> {
    // Een niet-bevestigde transactie vervalt met de werkkopie.
    this.db?.close();
    this.db = null;
    this.transactie = null;
  }
}

function standaardUit(sql: string): Waarde {
  if (/^'.*'$/s.test(sql)) return sql.slice(1, -1).replaceAll("''", "'");
  if (/^NULL$/i.test(sql)) return null;
  const n = Number(sql);
  return Number.isFinite(n) ? n : sql;
}

function sqlLiteraal(w: Waarde): string {
  if (w === null) return "NULL";
  if (typeof w === "boolean") return w ? "1" : "0";
  if (typeof w === "number") {
    if (!Number.isFinite(w)) throw new WerkkopieFout("syntaxis", "Een standaardwaarde moet een eindig getal zijn.");
    return String(w);
  }
  if (w instanceof Uint8Array) return `X'${Array.from(w, (b) => b.toString(16).padStart(2, "0")).join("")}'`;
  return `'${w.replaceAll("'", "''")}'`;
}

/** Bouwt een werkkopie in dit proces uit de bytes van een MDB/ACCDB. */
export async function openWerkkopie(
  SQL: SqlJsStatic,
  reader: MDBReader,
  bytes: Uint8Array,
  naam: string,
  opties: WerkkopieOpties = {},
): Promise<SqliteWerkkopie> {
  const { db, rapport } = await bouwWerkkopie(SQL, reader, bytes, naam, opties);
  return new SqliteWerkkopie(db, { naam, sha256: rapport.sha256 }, rapport);
}

/**
 * Lege werkkopie zonder Access-origineel (nieuwe database, of tests).
 * `querys` worden als opgeslagen Access-query’s vastgelegd.
 */
export function nieuweWerkkopie(
  SQL: SqlJsStatic,
  naam = "Nieuwe database",
  querys: OpgeslagenQuery[] = [],
): SqliteWerkkopie {
  const db = new SQL.Database();
  db.exec(META_TABELLEN);
  const tijdstip = new Date().toISOString();
  for (const [sleutel, waarde] of [
    ["bronnaam", naam],
    ["sha256", ""],
    ["tijdstip", tijdstip],
    ["schemaversie", String(SCHEMAVERSIE)],
    ["accesstabellen", "[]"],
  ])
    db.run("INSERT INTO _openaec_meta (sleutel, waarde) VALUES (?, ?)", [sleutel, waarde]);
  for (const q of querys) db.run("INSERT INTO _openaec_querys (naam, sql, soort) VALUES (?, ?, ?)", [q.naam, q.sql, q.soort]);
  return new SqliteWerkkopie(db, { naam, sha256: "" }, null);
}

/** Laadt een eerder geëxporteerde werkkopie (SQLite-bestand). */
export function laadWerkkopie(SQL: SqlJsStatic, sqlite: Uint8Array): SqliteWerkkopie {
  const db = new SQL.Database(sqlite);
  try {
    const meta = new Map(
      (db.exec("SELECT sleutel, waarde FROM _openaec_meta")[0]?.values ?? []).map((r) => [String(r[0]), String(r[1])]),
    );
    let rapport: OpbouwRapport | null = null;
    try {
      rapport = JSON.parse(meta.get("opbouwrapport") ?? "null");
    } catch {
      rapport = null;
    }
    return new SqliteWerkkopie(db, { naam: meta.get("bronnaam") ?? "werkkopie", sha256: meta.get("sha256") ?? "" }, rapport);
  } catch (fout) {
    db.close();
    throw new WerkkopieFout("syntaxis", `Dit is geen werkkopie van Open Database Studio: ${melding(fout)}`);
  }
}
