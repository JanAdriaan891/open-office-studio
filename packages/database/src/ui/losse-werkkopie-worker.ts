/**
 * Worker voor een werkkopie zonder Access-origineel: een nieuwe lege database
 * of een eerder bewaarde `.sqlite`-werkkopie. Gebruikt alleen de publieke
 * functies van de werkkopielaag; alle verzoeken lopen via MessagePorts
 * (`koppelWerkkopie`), zodat de interface en de VBA-runtime dezelfde weg nemen.
 */
import { koppelWerkkopie } from "../werkkopie/werkkopie-brug.ts";
import type { SqliteWerkkopie } from "../werkkopie/werkkopie.ts";

let werkkopie: SqliteWerkkopie | null = null;
const context = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (bericht: unknown, overdracht?: Transferable[]) => void;
};

context.onmessage = async ({ data }) => {
  try {
    if (data.type === "nieuw" || data.type === "laad") {
      const [{ laadSqlJs }, { nieuweWerkkopie, laadWerkkopie }] = await Promise.all([
        import("../werkkopie/sqljs-browser.ts"),
        import("../werkkopie/werkkopie.ts"),
      ]);
      const SQL = await laadSqlJs();
      await werkkopie?.sluit();
      werkkopie =
        data.type === "nieuw"
          ? nieuweWerkkopie(SQL, String(data.naam || "Nieuwe database"))
          : laadWerkkopie(SQL, new Uint8Array(data.bytes as ArrayBuffer));
      koppelWerkkopie(werkkopie, data.poort as MessagePort, { sluitToegestaan: true });
      context.postMessage({
        id: data.id,
        resultaat: { bron: werkkopie.bron, rapport: werkkopie.opbouwrapport ?? null },
      });
    } else if (data.type === "poort") {
      if (!werkkopie) throw new Error("Er is geen werkkopie geopend.");
      koppelWerkkopie(werkkopie, data.poort as MessagePort);
      context.postMessage({ id: data.id, resultaat: true });
    } else throw new Error("Onbekend verzoek aan de werkkopie.");
  } catch (fout) {
    context.postMessage({
      id: data.id,
      fout: fout instanceof Error ? fout.message : String(fout),
      code: fout && typeof fout === "object" && "code" in fout ? (fout as { code: unknown }).code : undefined,
    });
  }
};
