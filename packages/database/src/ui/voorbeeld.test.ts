import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { laadWerkkopie, nieuweWerkkopie } from "../werkkopie/werkkopie";
import { vulVoorbeeld, VOORBEELD_MODULES } from "./voorbeeld";
import { kolommenVan, laadBron } from "./bron";
import { bouwRapport, leesRapportDefinitie } from "./rapport-logica";
import { leesFormulierDefinitie } from "./formulier-logica";
import { procedureIn } from "./Formulier";
import { leesbareFout } from "./invoer";
import type { Dialogen } from "./Dialoog";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

const dialogen = (antwoorden: Record<string, string> | null): Dialogen => ({
  bevestig: async () => true,
  vraag: async () => null,
  parameters: async () => antwoorden,
  msgBox: async () => 1,
  melding: async () => undefined,
});

describe("Voorbeelddatabase als werkkopie", () => {
  it("vult tabel, query’s en ontwerpen die de interface kan gebruiken", async () => {
    const w = nieuweWerkkopie(SQL, "Voorbeelddatabase");
    await vulVoorbeeld(w);
    const [t] = await w.tabellen();
    expect(t.naam).toBe("Materialen");
    expect(t.aantal).toBe(6);
    expect((await w.querys()).map((q) => q.naam).sort()).toEqual(["Materiaal vanaf prijs", "Materialenlijst", "Prijzen met 5% verhogen"]);
    expect((await kolommenVan(w, "Materialenlijst")).map((k) => k.naam)).toEqual(["Code", "Omschrijving", "Eenheid", "Prijs"]);
    await expect(kolommenVan(w, "Prijzen met 5% verhogen")).rejects.toThrow("actiequery");

    // Parameterquery via de dialoog (Nederlandse invoer “20,5”).
    const r = await laadBron(w, "Materiaal vanaf prijs", dialogen({ "Minimale prijs": "20,5" }));
    expect(r?.rijen.map((x) => x[0])).toEqual(["MAT-003", "MAT-004"]);
    expect(await laadBron(w, "Materiaal vanaf prijs", dialogen(null))).toBeNull();

    // Rapport uit het opgeslagen ontwerp.
    const ontwerpen = await w.ontwerpen();
    const rapport = ontwerpen.find((o) => o.soort === "rapport")!;
    const data = (await laadBron(w, rapport.bron, dialogen({})))!;
    const uit = bouwRapport(data.kolommen, data.rijen, leesRapportDefinitie(rapport.definitie, rapport.naam));
    expect(uit.groepen.map((g) => g.sleutel)).toEqual(["kg", "m", "m²", "m³"]);
    expect(uit.eindtotalen[0].waarde).toBe(320 + 1450 + 36 + 210 + 480 + 95);
    expect(uit.ontbrekend).toEqual([]);

    // Formulier en gekoppelde VBA-gebeurtenissen.
    const formulier = ontwerpen.find((o) => o.soort === "formulier")!;
    const def = leesFormulierDefinitie(formulier.definitie, formulier.naam);
    const module = VOORBEELD_MODULES.find((m) => m.naam === `Form_${formulier.naam}`)!;
    for (const k of def.knoppen) expect(procedureIn(module.bron, `${k.naam}_Click`)).toEqual({ parameters: 0 });
    expect(procedureIn(module.bron, "Form_Load")).toEqual({ parameters: 0 });
    expect(procedureIn("Private Sub Form_Open(Cancel As Integer)\nEnd Sub", "Form_Open")).toEqual({ parameters: 1 });
    expect(procedureIn(module.bron, "Form_Open")).toBeNull();

    // Integriteitsfout bij een dubbele sleutel is begrijpelijk.
    const fout = await w.voegToe("Materialen", { Code: "MAT-001", Omschrijving: "Dubbel" }).catch((e) => e);
    expect(leesbareFout(fout)).toContain("moet uniek zijn");

    // Bewaren als .sqlite en heropenen behoudt ontwerpen en query’s.
    const bytes = await w.exporteer();
    expect(new TextDecoder().decode(bytes.subarray(0, 15))).toBe("SQLite format 3");
    const terug = laadWerkkopie(SQL, bytes);
    expect((await terug.ontwerpen()).length).toBe(2);
    expect((await terug.querys()).length).toBe(3);
  });
});
