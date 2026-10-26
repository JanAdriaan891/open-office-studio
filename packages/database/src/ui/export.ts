/** Bewaren van binaire exports (SQLite-werkkopie). Tekstexports lopen via `DatabaseUitvoer`. */
import type { Veldsoort, Waarde } from "../werkkopie/contract.ts";
import { csv } from "../model.ts";
import { csvRijen } from "./invoer.ts";

export type DatabaseBinaireUitvoer = (
  naam: string,
  inhoud: Uint8Array,
  type: string,
) => Promise<{ status: "opgeslagen"; pad: string } | { status: "download" } | { status: "geannuleerd" }>;

export const downloadBinair: DatabaseBinaireUitvoer = async (naam, inhoud, type) => {
  const url = URL.createObjectURL(new Blob([inhoud as BlobPart], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = naam;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { status: "download" };
};

/** CSV (puntkomma, UTF-8 met BOM, Nederlandse notatie) uit werkkopiewaarden. */
export function csvUitWaarden(kolommen: string[], rijen: Waarde[][], soorten: (Veldsoort | null | undefined)[] = []) {
  return csv(kolommen, csvRijen(rijen, soorten));
}
