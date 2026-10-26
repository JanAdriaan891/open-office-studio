import { describe, expect, it } from "vitest";
import { koppelWerkkopie, werkkopieViaPoort, type Poort } from "../../database/src/werkkopie/werkkopie-brug.ts";
import { maakNepWerkkopie } from "./nepwerkkopie.ts";
import { VbaClient, type WorkerAchtig } from "./vba-client.ts";
import { startVbaWorker, type WorkerPoort } from "./worker-kern.ts";

/** Worker in hetzelfde proces, via een MessageChannel (zelfde berichten als een echte Worker). */
function nepWorker(): WorkerAchtig {
  const kanaal = new MessageChannel();
  startVbaWorker(kanaal.port2 as unknown as WorkerPoort, async (p) => {
    p.start();
    return werkkopieViaPoort(p as unknown as Poort);
  });
  kanaal.port2.start();
  kanaal.port1.start();
  return {
    postMessage: (m: unknown, t?: Transferable[]) => kanaal.port1.postMessage(m, t ?? []),
    addEventListener: ((type: string, f: (e: MessageEvent) => void) => {
      if (type === "message") kanaal.port1.addEventListener("message", f);
    }) as WorkerAchtig["addEventListener"],
    terminate: () => {
      kanaal.port1.close();
      kanaal.port2.close();
    },
  };
}

const MODULE = `Option Compare Database
Option Explicit
Private teller As Long
Public Function Totaal() As Currency
  Totaal = DSum("Saldo", "Klanten")
End Function
Public Sub Groet()
  teller = teller + 1
  Debug.Print "Hallo"; teller
  If MsgBox("Doorgaan?", vbYesNo) = vbYes Then Debug.Print "ja"
End Sub
Public Sub Kapot()
  Dim x As Integer
  x = 1
  x = x / 0
End Sub
Public Sub Eindeloos()
  Do: DoEvents: Loop
End Sub
Public Sub Gevaarlijk()
  Shell "format c:"
End Sub
Private Sub Verborgen()
End Sub
Public Sub MetParameter(x As Long)
End Sub
Public Sub Form_BeforeUpdate(Cancel As Integer)
  If DCount("*", "Klanten") > 1 Then Cancel = True
End Sub`;

async function maakClient(opties: ConstructorParameters<typeof VbaClient>[0] = {}) {
  const werkkopie = await maakNepWerkkopie("CREATE TABLE Klanten (ID INTEGER PRIMARY KEY, Saldo CURRENCY); INSERT INTO Klanten VALUES (1, 10.5), (2, 4);");
  return new VbaClient({
    maakWorker: nepWorker,
    werkkopiePoort: () => {
      const k = new MessageChannel();
      k.port1.start();
      koppelWerkkopie(werkkopie, k.port1 as unknown as Poort);
      return k.port2;
    },
    ...opties,
  });
}

describe("VbaClient en worker", () => {
  it("laadt modules, somt procedures op en voert uit met database en host", async () => {
    const vragen: string[] = [];
    const client = await maakClient({ host: { msgBox: async (v) => (vragen.push(v.tekst), 6) } });
    const r = await client.laad([{ naam: "Module1", bron: MODULE, soort: "module" }]);
    expect(r.fouten).toEqual([]);
    expect(r.afscherming.map((a) => a.naam)).toEqual(["Shell"]);
    expect((await client.procedures()).map((p) => p.naam)).toEqual(["Totaal", "Groet", "Kapot", "Eindeloos", "Gevaarlijk"]);
    expect(await client.voerUit("Module1", "Totaal")).toEqual({ ok: true, resultaat: 14.5, argumenten: [], uitvoer: [], stappen: 1 });
    const g = await client.voerUit("Module1", "Groet");
    expect(g).toMatchObject({ ok: true, uitvoer: ["Hallo 1 ", "ja"] });
    expect(vragen).toEqual(["Doorgaan?"]);
    // ByRef-argumenten komen terug (Cancel van een gebeurtenis)
    expect(await client.voerUit("Module1", "Form_BeforeUpdate", [0])).toMatchObject({ ok: true, argumenten: [-1] });
    // modulevariabelen blijven bewaard tussen aanroepen
    expect(await client.voerUit("Module1", "Groet")).toMatchObject({ uitvoer: ["Hallo 2 ", "ja"] });
    client.sluit();
  });

  it("geeft fouten terug met nummer en regel", async () => {
    const client = await maakClient();
    await client.laad([{ naam: "Module1", bron: MODULE, soort: "module" }]);
    const r = await client.voerUit("Module1", "Kapot");
    expect(r).toMatchObject({ ok: false, fout: { soort: "runtime", nummer: 11, module: "Module1", procedure: "Kapot", regel: 15 } });
    const a = await client.voerUit("Module1", "Gevaarlijk");
    expect(a).toMatchObject({ ok: false, fout: { soort: "afbreking", reden: "afgeschermd" } });
    const s = await client.laad([{ naam: "Kapot", bron: "Sub X(\nEnd Sub", soort: "module" }]);
    expect(s.fouten[0]).toMatchObject({ soort: "parseer", module: "Kapot", regel: 1 });
    client.sluit();
  });

  it("stopt bij de tijdslimiet en start daarna opnieuw met dezelfde modules", async () => {
    const client = await maakClient({ tijdslimiet: 150, stappenlimiet: 300_000 });
    await client.laad([{ naam: "Module1", bron: MODULE, soort: "module" }]);
    const r = await client.voerUit("Module1", "Eindeloos");
    expect(r).toMatchObject({ ok: false, fout: { reden: "tijdslimiet" } });
    expect(await client.voerUit("Module1", "Totaal")).toMatchObject({ ok: true, resultaat: 14.5 });
    client.sluit();
  });

  it("stop() beëindigt een lopende uitvoering", async () => {
    const client = await maakClient({ stappenlimiet: 300_000 });
    await client.laad([{ naam: "Module1", bron: MODULE, soort: "module" }]);
    const p = client.voerUit("Module1", "Eindeloos");
    setTimeout(() => client.stop(), 50);
    expect(await p).toMatchObject({ ok: false, fout: { reden: "gestopt" } });
    client.sluit();
  });
});
