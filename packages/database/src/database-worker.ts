import type MDBReader from "mdb-reader";
import { openDatabase } from "./database-parser";
import { analyseerDatabase } from "./access-analyse.ts";

// De parser blijft buiten de UI-thread; geen query’s, macro’s of gekoppelde bronnen uitvoeren.
let database: MDBReader | null = null;
const context = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (bericht: unknown) => void;
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
    } else throw new Error("De database is nog niet geopend.");
  } catch (error) {
    context.postMessage({
      id: data.id,
      fout: error instanceof Error ? error.message : String(error),
    });
  }
};
