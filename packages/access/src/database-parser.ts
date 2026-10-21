import { Buffer } from "buffer";
import type MDBReader from "mdb-reader";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
export async function openDatabase(bytes: ArrayBuffer): Promise<MDBReader> {
  const { default: Lezer } = await import("mdb-reader");
  return new Lezer(Buffer.from(bytes));
}
