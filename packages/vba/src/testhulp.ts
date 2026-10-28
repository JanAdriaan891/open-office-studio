/** Hulpfuncties voor de tests (geen productiecode). */
import { VbaRuntime, type ModuleBron, type RuntimeOpties } from "./interpreter.ts";
import { naarHost } from "./conversie.ts";

export async function draai(
  bron: string,
  procedure = "Test",
  opties: RuntimeOpties & { extra?: ModuleBron[]; args?: Parameters<VbaRuntime["voerUit"]>[2] } = {},
) {
  const rt = new VbaRuntime({ nu: () => new Date(2026, 9, 26, 14, 30, 15), ...opties });
  const fouten = rt.laad([{ naam: "Module1", bron, soort: "module" }, ...(opties.extra ?? [])]);
  if (fouten.length) throw fouten[0];
  const u = await rt.voerUit("Module1", procedure, opties.args ?? []);
  return { uitvoer: u.uitvoer, resultaat: naarHost(u.resultaat), rt, ruw: u.resultaat };
}

/** Voert een procedure uit en geeft de Debug.Print-regels terug. */
export async function print(bron: string, opties: Parameters<typeof draai>[2] = {}) {
  return (await draai(bron, "Test", opties)).uitvoer;
}

/** Waarde van één expressie (als hostwaarde). */
export async function expr(e: string, opties: Parameters<typeof draai>[2] = {}) {
  const { resultaat } = await draai(`Function Test()\n Test = ${e}\nEnd Function`, "Test", opties);
  return resultaat;
}
