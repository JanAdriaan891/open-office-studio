/**
 * Werkkopie in het geheugen op sql.js, alleen voor de tests van de VBA-module.
 * Bevat een kleine vertaling van Access-SQL naar SQLite ([naam], "tekst",
 * #datum#, True/False, Like met * en ?, [parameters]). De echte werkkopie
 * (packages/database/src/werkkopie) wordt door een andere module geleverd.
 */
import { createRequire } from "node:module";
import type {
  OpgeslagenQuery,
  QueryOpties,
  QueryResultaat,
  RelatieSchema,
  StructuurResultaat,
  TabelSchema,
  VbaModuleRecord,
  VeldSchema,
  Veldsoort,
  Waarde,
  Werkkopie,
} from "../../database/src/werkkopie/contract.ts";

interface SqlStatement {
  bind(waarden: unknown): void;
  step(): boolean;
  get(): unknown[];
  getColumnNames(): string[];
  free(): void;
}
interface SqlDatabase {
  run(sql: string, params?: unknown): void;
  exec(sql: string): { columns: string[]; values: unknown[][] }[];
  prepare(sql: string): SqlStatement;
  getRowsModified(): number;
  export(): Uint8Array;
  close(): void;
}
type SqlJs = { Database: new () => SqlDatabase };

let sqlJs: Promise<SqlJs> | null = null;
function laadSqlJs(): Promise<SqlJs> {
  const require = createRequire(import.meta.url);
  const init = require("sql.js") as (cfg?: unknown) => Promise<SqlJs>;
  return (sqlJs ??= init());
}

const SOORT: [RegExp, Veldsoort][] = [
  [/autonum/i, "autonummer"],
  [/bool|janee/i, "jaNee"],
  [/date|datum/i, "datum"],
  [/currency|valuta/i, "valuta"],
  [/int/i, "geheel"],
  [/real|double|float|num/i, "getal"],
  [/memo/i, "memo"],
  [/blob/i, "binair"],
];

/** Minimale vertaling van Access-SQL naar SQLite voor de tests. */
export function vertaal(sql: string, parameters: Map<string, Waarde>): { sql: string; binding: Waarde[] } {
  let uit = "";
  const binding: Waarde[] = [];
  let naLike = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      let tekst = "";
      for (; j < sql.length; j++) {
        if (sql[j] === c && sql[j + 1] === c) {
          tekst += c;
          j++;
        } else if (sql[j] === c) break;
        else tekst += sql[j];
      }
      if (naLike) tekst = tekst.replace(/\*/g, "%").replace(/\?/g, "_");
      uit += `'${tekst.replace(/'/g, "''")}'`;
      i = j;
      naLike = false;
      continue;
    }
    if (c === "[") {
      const j = sql.indexOf("]", i);
      const naam = sql.slice(i + 1, j);
      const p = [...parameters.keys()].find((k) => k.toLowerCase() === naam.toLowerCase());
      if (p !== undefined) {
        uit += "?";
        binding.push(parameters.get(p)!);
      } else uit += `"${naam}"`;
      i = j;
      continue;
    }
    if (c === "#") {
      const j = sql.indexOf("#", i + 1);
      const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(sql.slice(i + 1, j).trim());
      if (m) {
        uit += `'${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}'`;
        i = j;
        continue;
      }
    }
    const woord = /^[A-Za-z_]\w*/.exec(sql.slice(i));
    if (woord && (i === 0 || !/\w/.test(sql[i - 1]))) {
      const w = woord[0].toLowerCase();
      if (w === "true") uit += "1";
      else if (w === "false") uit += "0";
      else {
        const p = [...parameters.keys()].find((k) => k.toLowerCase() === w);
        if (p !== undefined && !/^(select|from|where|and|or|not|like|is|null|order|by|as|into|values|set|update|delete|insert)$/.test(w)) {
          uit += "?";
          binding.push(parameters.get(p)!);
        } else uit += woord[0];
      }
      naLike = w === "like";
      i += woord[0].length - 1;
      continue;
    }
    if (!/\s/.test(c)) naLike = false;
    uit += c;
  }
  return { sql: uit, binding };
}

const naarSql = (w: Waarde) => (typeof w === "boolean" ? (w ? 1 : 0) : w);

/** SQLite-type voor de nep-werkkopie; `SOORT` hierboven leest het terug. */
const NEP_TYPE: Record<Veldsoort, string> = {
  tekst: "TEXT",
  memo: "MEMO",
  geheel: "INTEGER",
  getal: "DOUBLE",
  valuta: "CURRENCY",
  datum: "DATETIME",
  jaNee: "BOOLEAN",
  autonummer: "AUTONUMMER INTEGER",
  binair: "BLOB",
  guid: "TEXT",
};
const nepKolom = (v: VeldSchema) => `"${v.naam}" ${NEP_TYPE[v.soort]}${v.verplicht ? " NOT NULL" : ""}`;
const nietOndersteund = (wat: string) => Object.assign(new Error(`${wat} wordt in de nep-werkkopie niet ondersteund.`), { code: "niet-ondersteund" });
const structuur = (): StructuurResultaat => ({ herbouwd: false, querys: [], meldingen: [] });

export async function maakNepWerkkopie(opzet: string, querys: OpgeslagenQuery[] = []): Promise<Werkkopie & { db: SqlDatabase }> {
  const SQL = await laadSqlJs();
  const db = new SQL.Database();
  db.run(opzet);
  let gewijzigd = false;
  let transactie = false;
  querys = [...querys];
  // Minimaal: relaties en modules alleen in het geheugen (geen FOREIGN KEY).
  const relaties: RelatieSchema[] = [];
  const modules: VbaModuleRecord[] = [];

  const tabellen = async (): Promise<TabelSchema[]> => {
    const namen = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values.map((r) => String(r[0])) ?? [];
    return namen.map((naam) => {
      const info = db.exec(`PRAGMA table_info("${naam}")`)[0];
      const aantal = Number(db.exec(`SELECT COUNT(*) FROM "${naam}"`)[0].values[0][0]);
      return {
        naam,
        aantal,
        herkomst: "access" as const,
        velden: info.values.map((r) => ({
          naam: String(r[1]),
          soort: SOORT.find(([re]) => re.test(String(r[2])))?.[1] ?? "tekst",
          primair: Number(r[5]) > 0,
        })),
      };
    });
  };

  const kolomnamen = async () => new Set((await tabellen()).flatMap((t) => [t.naam.toLowerCase(), ...t.velden.map((v) => v.naam.toLowerCase())]));

  const parametersVan = async (sqlOfNaam: string) => {
    const q = querys.find((x) => x.naam.toLowerCase() === sqlOfNaam.toLowerCase());
    const sql = q ? q.sql : sqlOfNaam;
    const bekend = await kolomnamen();
    const uit: string[] = [];
    const zonderTekst = sql.replace(/"[^"]*"|'[^']*'/g, "");
    for (const m of zonderTekst.matchAll(/\[([^\]]+)\]/g)) if (!bekend.has(m[1].toLowerCase()) && !uit.includes(m[1])) uit.push(m[1]);
    return uit;
  };

  const query = async (sql: string, opties: QueryOpties = {}): Promise<QueryResultaat> => {
    const params = new Map<string, Waarde>(Object.entries(Array.isArray(opties.parameters) ? {} : (opties.parameters ?? {})));
    const { sql: vertaald, binding } = opties.dialect === "sqlite" ? { sql, binding: [] as Waarde[] } : vertaal(sql, params);
    const ontbreekt = (await parametersVan(sql)).filter((p) => ![...params.keys()].some((k) => k.toLowerCase() === p.toLowerCase()));
    if (ontbreekt.length) throw Object.assign(new Error(`Parameter ontbreekt: ${ontbreekt[0]}`), { code: "parameter-ontbreekt" });
    try {
      if (/^\s*select/i.test(vertaald)) {
        // Eén basistabel zonder groeperen/DISTINCT/aggregaten: rowid meegeven (QueryResultaat.bron).
        const schema = await tabellen();
        const m = /^\s*select\s+(?!distinct\b|top\b)([\s\S]+?)\s+from\s+"?([A-Za-z_]\w*)"?\s*(?:where\b[\s\S]*|order\s+by\b[\s\S]*)?;?\s*$/i.exec(vertaald);
        const bronTabel =
          m && !/\b(count|sum|avg|min|max)\s*\(/i.test(m[1]) && !/\b(group\s+by|join|union)\b/i.test(vertaald)
            ? schema.find((t) => t.naam.toLowerCase() === m[2].toLowerCase())
            : undefined;
        const st = db.prepare(bronTabel ? vertaald.replace(/^\s*select\s+/i, "SELECT rowid AS ooo_rowid, ") : vertaald);
        st.bind(binding.map(naarSql));
        const rijen: Waarde[][] = [];
        const limiet = opties.limiet ?? 10_000;
        let afgekapt = false;
        while (st.step()) {
          if (rijen.length >= limiet) {
            afgekapt = true;
            break;
          }
          rijen.push(st.get() as Waarde[]);
        }
        let kolommen = st.getColumnNames();
        st.free();
        const rowids = bronTabel ? rijen.map((r) => Number(r.shift())) : [];
        if (bronTabel) kolommen = kolommen.slice(1);
        const velden = bronTabel ? bronTabel.velden : schema.flatMap((t) => t.velden);
        const kolomsoorten = kolommen.map((k) => velden.find((v) => v.naam.toLowerCase() === k.toLowerCase())?.soort ?? null);
        const resultaat: QueryResultaat = { kolommen, rijen, gewijzigd: 0, afgekapt, uitgevoerd: vertaald, kolomsoorten };
        if (bronTabel) resultaat.bron = { tabel: bronTabel.naam, rowids };
        return resultaat;
      }
      db.run(vertaald, binding.map(naarSql));
      gewijzigd = true;
      return { kolommen: [], rijen: [], gewijzigd: db.getRowsModified(), afgekapt: false, uitgevoerd: vertaald };
    } catch (e) {
      throw Object.assign(new Error(`SQL-fout: ${(e as Error).message}`), { code: "syntaxis" });
    }
  };

  return {
    db,
    bron: { naam: "test.accdb", sha256: "0".repeat(64) },
    tabellen,
    relaties: async () => relaties.map((r) => ({ ...r })),
    querys: async () => querys,
    query,
    voerQueryUit: async (naam, parameters) => {
      const q = querys.find((x) => x.naam.toLowerCase() === naam.toLowerCase());
      if (!q) throw Object.assign(new Error(`Query ${naam} bestaat niet`), { code: "onbekend-object" });
      return query(q.sql, { parameters });
    },
    parametersVan,
    rijen: async (tabel, verzoek = {}) => {
      const totaal = Number(db.exec(`SELECT COUNT(*) FROM "${tabel}"`)[0].values[0][0]);
      const r = db.exec(`SELECT rowid AS ooo_rowid, * FROM "${tabel}" ORDER BY rowid LIMIT ${verzoek.aantal ?? 200} OFFSET ${verzoek.start ?? 0}`)[0];
      const rijen = (r?.values ?? []).map((v) => ({
        rowid: Number(v[0]),
        waarden: Object.fromEntries(r.columns.slice(1).map((k, i) => [k, v[i + 1] as Waarde])),
      }));
      return { rijen, totaal };
    },
    rij: async (tabel, rowid) => {
      const r = db.exec(`SELECT rowid AS ooo_rowid, * FROM "${tabel}" WHERE rowid = ${Number(rowid)}`)[0];
      if (!r?.values.length) return null;
      return { rowid, waarden: Object.fromEntries(r.columns.slice(1).map((k, i) => [k, r.values[0][i + 1] as Waarde])) };
    },
    bewaarQuery: async (q) => {
      const i = querys.findIndex((x) => x.naam.toLowerCase() === q.naam.toLowerCase());
      if (i >= 0) querys.splice(i, 1);
      querys.push({ ...q });
      gewijzigd = true;
    },
    verwijderQuery: async (naam) => {
      const i = querys.findIndex((x) => x.naam.toLowerCase() === naam.toLowerCase());
      if (i < 0) throw Object.assign(new Error(`Query ${naam} bestaat niet`), { code: "onbekend-object" });
      querys.splice(i, 1);
    },
    begin: async () => {
      if (transactie) throw Object.assign(new Error("Er loopt al een transactie."), { code: "beperking" });
      db.run("SAVEPOINT nep_transactie");
      transactie = true;
    },
    bevestig: async () => {
      if (!transactie) throw Object.assign(new Error("Er loopt geen transactie."), { code: "beperking" });
      db.run("RELEASE nep_transactie");
      transactie = false;
    },
    terugdraaien: async () => {
      if (!transactie) throw Object.assign(new Error("Er loopt geen transactie."), { code: "beperking" });
      db.run("ROLLBACK TO nep_transactie");
      db.run("RELEASE nep_transactie");
      transactie = false;
    },
    voegToe: async (tabel, waarden) => {
      const k = Object.keys(waarden);
      db.run(
        k.length ? `INSERT INTO "${tabel}" (${k.map((x) => `"${x}"`).join(", ")}) VALUES (${k.map(() => "?").join(", ")})` : `INSERT INTO "${tabel}" DEFAULT VALUES`,
        k.map((x) => naarSql(waarden[x])),
      );
      gewijzigd = true;
      return Number(db.exec("SELECT last_insert_rowid()")[0].values[0][0]);
    },
    wijzig: async (tabel, rowid, waarden) => {
      const k = Object.keys(waarden);
      db.run(`UPDATE "${tabel}" SET ${k.map((x) => `"${x}" = ?`).join(", ")} WHERE rowid = ?`, [...k.map((x) => naarSql(waarden[x])), rowid]);
      gewijzigd = true;
    },
    verwijder: async (tabel, rowid) => {
      db.run(`DELETE FROM "${tabel}" WHERE rowid = ?`, [rowid]);
      gewijzigd = true;
    },
    maakTabel: async (schema) => {
      const sleutel = schema.velden.filter((v) => v.primair).map((v) => `"${v.naam}"`);
      db.run(`CREATE TABLE "${schema.naam}" (${[...schema.velden.map(nepKolom), ...(sleutel.length ? [`PRIMARY KEY (${sleutel.join(", ")})`] : [])].join(", ")})`);
      gewijzigd = true;
    },
    verwijderTabel: async (naam) => {
      db.run(`DROP TABLE "${naam}"`);
    },
    voegVeldToe: async (tabel, veld) => {
      db.run(`ALTER TABLE "${tabel}" ADD COLUMN ${nepKolom({ ...veld, verplicht: false })}`);
      gewijzigd = true;
      return structuur();
    },
    hernoemVeld: async (tabel, veld, nieuweNaam) => {
      db.run(`ALTER TABLE "${tabel}" RENAME COLUMN "${veld}" TO "${nieuweNaam}"`);
      gewijzigd = true;
      return structuur();
    },
    verwijderVeld: async (tabel, veld) => {
      db.run(`ALTER TABLE "${tabel}" DROP COLUMN "${veld}"`);
      gewijzigd = true;
      return structuur();
    },
    wijzigVeld: async () => {
      throw nietOndersteund("Een veld wijzigen");
    },
    zetPrimaireSleutel: async () => {
      throw nietOndersteund("De primaire sleutel instellen");
    },
    maakRelatie: async (r) => {
      const naam = r.naam ?? `${r.naarTabel}${r.tabel}`;
      relaties.push({ ...r, naam });
      return naam;
    },
    verwijderRelatie: async (naam) => {
      const i = relaties.findIndex((r) => r.naam.toLowerCase() === naam.toLowerCase());
      if (i < 0) throw Object.assign(new Error(`Relatie ${naam} bestaat niet`), { code: "onbekend-object" });
      relaties.splice(i, 1);
    },
    modules: async () => modules.map((m) => ({ ...m })),
    bewaarModule: async (m) => {
      const i = modules.findIndex((x) => x.naam.toLowerCase() === m.naam.toLowerCase());
      const record: VbaModuleRecord = { naam: m.naam, soort: m.soort, bron: m.bron, herkomst: i >= 0 ? modules[i].herkomst : "werkkopie", gewijzigd: new Date().toISOString() };
      if (i >= 0) modules[i] = record;
      else modules.push(record);
    },
    verwijderModule: async (naam) => {
      const i = modules.findIndex((x) => x.naam.toLowerCase() === naam.toLowerCase());
      if (i < 0) throw Object.assign(new Error(`Module ${naam} bestaat niet`), { code: "onbekend-object" });
      modules.splice(i, 1);
    },
    ontwerpen: async () => [],
    bewaarOntwerp: async () => {},
    verwijderOntwerp: async () => {},
    gewijzigd: async () => gewijzigd,
    exporteer: async () => db.export(),
    sluit: async () => db.close(),
  };
}

/** Rijen van een SELECT in de testdatabase (voor controles in tests). */
export function rijenVan(db: SqlDatabase, sql: string) {
  return db.exec(sql)[0]?.values ?? [];
}
