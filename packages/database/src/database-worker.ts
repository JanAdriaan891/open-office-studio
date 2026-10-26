import type MDBReader from "mdb-reader";
import { openDatabase } from "./database-parser";
import { analyseerDatabase } from "./access-analyse.ts";
import type { SqliteWerkkopie } from "./werkkopie/werkkopie.ts";

// De parser blijft buiten de UI-thread. Het alleen-lezen-pad (open/tabel) voert geen
// query’s, macro’s of gekoppelde bronnen uit. De werkkopie (SQLite) wordt alleen op
// verzoek opgebouwd en laadt sql.js pas dan; het origineel blijft ongewijzigd.
let database: MDBReader | null = null;
let werkkopie: SqliteWerkkopie | null = null;
const context = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (bericht: unknown, overdracht?: Transferable[]) => void;
};
function tekst(waarde: unknown): string {
  if (waarde === null || waarde === undefined) return "";
  if (waarde instanceof Date) return waarde.toISOString();
  if (waarde instanceof Uint8Array)
    return `[Binaire gegevens: ${waarde.byteLength} bytes]`;
  return String(waarde);
}
context.onmessage = async ({ data }) => {
  try {
    if (data.type === "open") {
      const bytes = new Uint8Array(data.bytes);
      database = await openDatabase(data.bytes);
      context.postMessage({
        id: data.id,
        resultaat: await analyseerDatabase(database, bytes, {
          naam: data.naam ?? "database",
          grootte: bytes.byteLength,
        }),
      });
    } else if (data.type === "tabel" && database) {
      const tabel = database.getTable(data.naam);
      const kolommen = tabel.getColumnNames();
      const rijen = tabel.getData({ rowOffset: data.start, rowLimit: 200 });
      context.postMessage({
        id: data.id,
        resultaat: {
          id: data.naam,
          naam: data.naam,
          soort: "Tabel",
          kolommen,
          kolomtypen: tabel.getColumns().map((k) => k.type),
          rijen: rijen.map((rij) => kolommen.map((kolom) => tekst(rij[kolom]))),
          totaalRijen: tabel.rowCount,
        },
      });
    } else if (data.type === "werkkopie:open") {
      // Eigen lezer: de werkkopie kan in een aparte worker draaien naast het alleen-lezen-pad.
      const bytes = new Uint8Array(data.bytes);
      const lezer = await openDatabase(data.bytes);
      const [{ laadSqlJs }, { openWerkkopie }] = await Promise.all([
        import("./werkkopie/sqljs-browser.ts"),
        import("./werkkopie/werkkopie.ts"),
      ]);
      const SQL = await laadSqlJs();
      await werkkopie?.sluit();
      werkkopie = null;
      werkkopie = await openWerkkopie(SQL, lezer, bytes, data.naam ?? "database", {
        voortgang: (stap) => context.postMessage({ id: data.id, voortgang: stap }),
      });
      context.postMessage({
        id: data.id,
        resultaat: { bron: werkkopie.bron, rapport: werkkopie.opbouwrapport },
      });
    } else if (data.type === "werkkopie" && werkkopie) {
      const { voerWerkkopieMethodeUit } = await import("./werkkopie/werkkopie-brug.ts");
      const resultaat = await voerWerkkopieMethodeUit(werkkopie, data.methode, data.args ?? []);
      if (data.methode === "sluit") werkkopie = null;
      context.postMessage(
        { id: data.id, resultaat },
        resultaat instanceof Uint8Array ? [resultaat.buffer as ArrayBuffer] : [],
      );
    } else if (data.type === "werkkopie:poort" && werkkopie) {
      const { koppelWerkkopie } = await import("./werkkopie/werkkopie-brug.ts");
      koppelWerkkopie(werkkopie, data.poort as MessagePort);
      context.postMessage({ id: data.id, resultaat: true });
    } else if (data.type === "werkkopie" || data.type === "werkkopie:poort") {
      context.postMessage({
        id: data.id,
        fout: "Er is geen werkkopie geopend.",
        code: "intern",
      });
    } else throw new Error("De database is nog niet geopend.");
  } catch (error) {
    context.postMessage({
      id: data.id,
      fout: error instanceof Error ? error.message : String(error),
      code:
        error && typeof error === "object" && "code" in error
          ? (error as { code: unknown }).code
          : undefined,
    });
  }
};
