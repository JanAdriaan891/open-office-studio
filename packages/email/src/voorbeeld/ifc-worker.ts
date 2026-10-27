/**
 * Web Worker voor de IFC-metadatakaart. Ontvangt `{ bytes }`, stuurt
 * `{ voortgang }` en tot slot `{ meta }` of `{ fout }`. Annuleren gebeurt door
 * de worker te beëindigen (zie `analyseerIfc`).
 */
import { analyseerIfcSync } from "./ifc-meta";

interface WorkerContext {
  onmessage: ((e: MessageEvent<{ bytes: Uint8Array }>) => void) | null;
  postMessage(bericht: unknown): void;
}
const ctx = self as unknown as WorkerContext;

ctx.onmessage = (e: MessageEvent<{ bytes: Uint8Array }>) => {
  try {
    let laatste = -1;
    const meta = analyseerIfcSync(e.data.bytes, (f) => {
      const procent = Math.floor(f * 100);
      if (procent !== laatste) {
        laatste = procent;
        ctx.postMessage({ voortgang: f });
      }
    });
    ctx.postMessage({ meta });
  } catch (fout) {
    ctx.postMessage({ fout: fout instanceof Error ? fout.message : String(fout) });
  }
};
