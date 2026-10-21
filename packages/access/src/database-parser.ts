import { Buffer } from "buffer";
import browserProcess from "process";
import type MDBReader from "mdb-reader";
const omgeving = globalThis as unknown as {
  Buffer: typeof Buffer;
  process?: typeof browserProcess;
};
omgeving.Buffer = Buffer;
omgeving.process ??= browserProcess;
export async function openDatabase(bytes: ArrayBuffer): Promise<MDBReader> {
  const { default: Lezer } = await import("mdb-reader");
  return new Lezer(Buffer.from(bytes));
}
