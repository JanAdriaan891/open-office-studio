/** Omzetting tussen VBA-waarden en structureel kloonbare hostwaarden. */
import { naarIso, vanIso } from "./datum.ts";
import type { HostWaarde } from "./host.ts";
import {
  Datum,
  Foutwaarde,
  Getal,
  LEEG,
  Leeg,
  NULL,
  Niets,
  NullWaarde,
  Ontbrekend,
  VbaMatrix,
  VbaObject,
  VbaRecord,
  type VbaWaarde,
} from "./waarden.ts";

export function naarHost(w: VbaWaarde): HostWaarde {
  if (w instanceof NullWaarde || w instanceof Niets || w instanceof Ontbrekend) return null;
  if (w instanceof Leeg) return { leeg: true };
  if (w instanceof Getal) return w.w;
  if (w instanceof Datum) return { datum: naarIso(w.w) };
  if (typeof w === "boolean" || typeof w === "string") return w;
  if (w instanceof VbaMatrix) return w.data.map(naarHost);
  if (w instanceof Foutwaarde) return `Error ${w.nummer}`;
  if (w instanceof VbaRecord) return `[${w.typeNaam}]`;
  if (w instanceof VbaObject) return `[${w.typeNaam}]`;
  return null;
}

export function vanHost(w: HostWaarde | undefined): VbaWaarde {
  if (w === undefined || w === null) return NULL;
  if (typeof w === "number") return Number.isInteger(w) && Math.abs(w) <= 2147483647 ? new Getal("Long", w, true) : new Getal("Double", w, true);
  if (typeof w === "string" || typeof w === "boolean") return w;
  if (Array.isArray(w)) return new VbaMatrix([{ onder: 0, boven: w.length - 1 }], w.map(vanHost), "Variant");
  if ("leeg" in w) return LEEG;
  if ("datum" in w) {
    const s = vanIso(w.datum);
    return s === null ? w.datum : new Datum(s);
  }
  return NULL;
}
