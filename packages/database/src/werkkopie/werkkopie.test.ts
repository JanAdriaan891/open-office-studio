import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import MDBReader from "mdb-reader";
import { WerkkopieFout, type Werkkopie } from "./contract";
import { laadWerkkopie, nieuweWerkkopie, openWerkkopie, type SqliteWerkkopie } from "./werkkopie";
import { koppelWerkkopie, werkkopieViaPoort } from "./werkkopie-brug";
import { vertaalAccessSql } from "./access-sql";
import { JACKCESS } from "./jackcess-verwachting";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

async function vulVoorbeeld(): Promise<SqliteWerkkopie> {
  const w = nieuweWerkkopie(SQL, "Voorbeeld", [
    { naam: "Actieve klanten", sql: "SELECT * FROM Klant WHERE Actief = True;", soort: "select" },
    {
      naam: "Klanten per plaats",
      sql: "PARAMETERS [Welke plaats] Text(50);\nSELECT ID, Naam FROM [Actieve klanten] WHERE Plaats = [Welke plaats] ORDER BY Naam;",
      soort: "select",
    },
    { naam: "Saldo per plaats", sql: "TRANSFORM Sum(Saldo) AS Som SELECT Actief FROM Klant GROUP BY Actief PIVOT Plaats;", soort: "crosstab" },
    { naam: "Kruistabel als bron", sql: "SELECT Count(*) AS N FROM [Saldo per plaats];", soort: "select" },
    { naam: "Verhoog saldo", sql: "PARAMETERS Factor Double;\nUPDATE Klant SET Saldo = Saldo * [Factor] WHERE Actief;", soort: "update" },
    { naam: "Extern", sql: "SELECT * FROM dbo.tabel", soort: "passthrough" },
  ]);
  await w.maakTabel({
    naam: "Klant",
    velden: [
      { naam: "ID", soort: "autonummer", primair: true },
      { naam: "Naam", soort: "tekst", lengte: 50, verplicht: true },
      { naam: "Plaats", soort: "tekst", lengte: 50 },
      { naam: "Geboren", soort: "datum" },
      { naam: "Actief", soort: "jaNee", standaard: true },
      { naam: "Saldo", soort: "valuta", standaard: 0 },
      { naam: "Foto", soort: "binair" },
    ],
  });
  const klanten: [string, string | null, string, boolean, number][] = [
    ["Anna", "Delft", "1980-05-01", true, 100],
    ["bert", "Gouda", "1990-12-31", true, 50.5],
    ["Chris", "Delft", "26-10-2001", false, -20],
    ["Dirk", null, "2000-02-29", true, 0],
  ];
  for (const [Naam, Plaats, Geboren, Actief, Saldo] of klanten)
    await w.voegToe("Klant", { Naam, Plaats, Geboren, Actief, Saldo });
  await w.query("CREATE TABLE [Order] (ID COUNTER PRIMARY KEY, KlantID LONG REFERENCES Klant (ID), Bedrag CURRENCY, Datum DATETIME)");
  await w.query("INSERT INTO [Order] (KlantID, Bedrag, Datum) VALUES (1, 10, #10/1/2026#)");
  await w.query("INSERT INTO [Order] (KlantID, Bedrag, Datum) VALUES (1, 15, #10/20/2026#)");
  await w.query("INSERT INTO [Order] (KlantID, Bedrag, Datum) VALUES (2, 7.5, #10/26/2026 14:30#)");
  return w;
}

describe("werkkopie in Node", () => {
  let w: SqliteWerkkopie;
  beforeEach(async () => {
    w = await vulVoorbeeld();
  });

  it("geeft het schema met Access-veldsoorten terug", async () => {
    const tabellen = await w.tabellen();
    expect(tabellen.map((t) => [t.naam, t.aantal, t.herkomst])).toEqual([
      ["Klant", 4, "werkkopie"],
      ["Order", 3, "werkkopie"],
    ]);
    expect(tabellen[0].velden).toEqual([
      { naam: "ID", soort: "autonummer", primair: true },
      { naam: "Naam", soort: "tekst", lengte: 50, verplicht: true },
      { naam: "Plaats", soort: "tekst", lengte: 50 },
      { naam: "Geboren", soort: "datum" },
      { naam: "Actief", soort: "jaNee", standaard: 1 },
      { naam: "Saldo", soort: "valuta", standaard: 0 },
      { naam: "Foto", soort: "binair" },
    ]);
    expect(tabellen[1].velden.map((v) => v.soort)).toEqual(["autonummer", "geheel", "valuta", "datum"]);
  });

  it("leest rijen met rowid, zoeken, sorteren en ja/nee als boolean", async () => {
    const { rijen, totaal } = await w.rijen("Klant", { sorteer: { veld: "Naam", aflopend: true } });
    expect(totaal).toBe(4);
    expect(rijen.map((r) => r.waarden.Naam)).toEqual(["Dirk", "Chris", "bert", "Anna"]);
    expect(rijen[1].waarden.Geboren).toBe("2001-10-26");
    expect(rijen[1].waarden.Actief).toBe(false);
    const gezocht = await w.rijen("klant", { zoek: "DELF" });
    expect(gezocht.totaal).toBe(2);
    expect((await w.rijen("Klant", { start: 1, aantal: 2 })).rijen.map((r) => r.rowid)).toEqual([2, 3]);
  });

  it("voegt toe, wijzigt en verwijdert op rowid", async () => {
    const rowid = await w.voegToe("Klant", { Naam: "Eva", Geboren: "1/2/2003" });
    expect(rowid).toBe(5);
    await w.wijzig("Klant", rowid, { Plaats: "Utrecht", Actief: false });
    const rij = (await w.rijen("Klant", { start: 4 })).rijen[0];
    expect(rij.waarden).toMatchObject({ Naam: "Eva", Plaats: "Utrecht", Geboren: "2003-02-01", Actief: false, Saldo: 0 });
    await w.verwijder("Klant", rowid);
    await expect(w.verwijder("Klant", rowid)).rejects.toMatchObject({ code: "onbekend-object" });
    await expect(w.voegToe("Klant", { Onbekend: 1 })).rejects.toMatchObject({ code: "onbekend-object" });
    await expect(w.voegToe("Klant", { Plaats: "x" })).rejects.toMatchObject({ code: "beperking" });
    await expect(w.voegToe("Klant", { Naam: "x".repeat(51) })).rejects.toMatchObject({ code: "beperking" });
    await expect(w.voegToe("_openaec_meta", { sleutel: "x" })).rejects.toMatchObject({ code: "alleen-lezen" });
  });

  it("dwingt referentiële integriteit af", async () => {
    await expect(w.query("INSERT INTO [Order] (KlantID, Bedrag) VALUES (99, 1)")).rejects.toMatchObject({ code: "beperking" });
    await expect(w.verwijder("Klant", 1)).rejects.toMatchObject({ code: "beperking" });
  });

  it("voert Access-SQL uit met functies, datums en Like", async () => {
    const r = await w.query(
      'SELECT Naam & " (" & Nz(Plaats, "?") & ")" AS Label, Year(Geboren) AS Jaar, Format(Saldo, "#,##0.00") AS Bedrag, IIf(Actief, "ja", "nee") AS A FROM Klant WHERE Naam Like "[a-c]*" ORDER BY Naam',
    );
    expect(r.kolommen).toEqual(["Label", "Jaar", "Bedrag", "A"]);
    expect(r.rijen).toEqual([
      ["Anna (Delft)", 1980, "100,00", "ja"],
      ["bert (Gouda)", 1990, "50,50", "ja"],
      ["Chris (Delft)", 2001, "-20,00", "nee"],
    ]);
    expect(r.uitgevoerd).toContain("acc_like");
    const datums = await w.query("SELECT Count(*) FROM [Order] WHERE Datum >= #10/20/2026# AND Datum < DateAdd('d', 1, #10/26/2026#)");
    expect(datums.rijen[0][0]).toBe(2);
    const plus = await w.query("SELECT Datum + 1 AS Morgen, DateDiff('d', #10/1/2026#, Datum) AS Dagen FROM [Order] ORDER BY ID");
    expect(plus.rijen).toEqual([
      ["2026-10-02", 0],
      ["2026-10-21", 19],
      ["2026-10-27T14:30:00", 25],
    ]);
    // Tekstvergelijking is hoofdletterongevoelig, zoals in Access.
    expect((await w.query("SELECT ID FROM Klant WHERE Naam = 'ANNA'")).rijen).toEqual([[1]]);
  });

  it("ondersteunt joins, aggregaten, TOP PERCENT, First/Last en UNION", async () => {
    const r = await w.query(
      "SELECT Klant.Naam, Count([Order].ID) AS Aantal, Sum([Order].Bedrag) AS Totaal FROM Klant LEFT JOIN [Order] ON Klant.ID = [Order].KlantID GROUP BY Klant.Naam ORDER BY Klant.Naam",
    );
    expect(r.rijen).toEqual([
      ["Anna", 2, 25],
      ["bert", 1, 7.5],
      ["Chris", 0, null],
      ["Dirk", 0, null],
    ]);
    expect((await w.query("SELECT TOP 50 PERCENT Naam FROM Klant ORDER BY Saldo DESC")).rijen).toEqual([["Anna"], ["bert"]]);
    expect((await w.query("SELECT First(Naam), Last(Naam) FROM Klant")).rijen).toEqual([["Anna", "Dirk"]]);
    const unie = await w.query("SELECT Plaats FROM Klant WHERE Plaats Is Not Null UNION SELECT 'Delft' ORDER BY Plaats");
    expect(unie.rijen).toEqual([["Delft"], ["Gouda"]]);
  });

  it("voert opgeslagen query’s uit, ook genest en met parameters", async () => {
    expect(await w.parametersVan("Klanten per plaats")).toEqual(["Welke plaats"]);
    const r = await w.voerQueryUit("Klanten per plaats", { "Welke plaats": "delft" });
    expect(r.rijen).toEqual([[1, "Anna"]]);
    expect(r.uitgevoerd).toMatch(/^WITH "Actieve klanten" AS/);
    expect((await w.query("[Klanten per plaats]", { parameters: ["Gouda"] })).rijen).toEqual([[2, "bert"]]);
    await expect(w.voerQueryUit("Klanten per plaats")).rejects.toMatchObject({ code: "parameter-ontbreekt" });
    await expect(w.voerQueryUit("Bestaat niet")).rejects.toMatchObject({ code: "onbekend-object" });
    await expect(w.voerQueryUit("Extern")).rejects.toMatchObject({ code: "niet-ondersteund" });
  });

  it("voert een kruistabel uit, ook als bron van een andere query", async () => {
    const r = await w.voerQueryUit("Saldo per plaats");
    expect(r.kolommen).toEqual(["Actief", "<>", "Delft", "Gouda"]);
    expect(r.rijen).toEqual([
      [0, null, -20, null],
      [1, 0, 100, 50.5],
    ]);
    expect((await w.voerQueryUit("Kruistabel als bron")).rijen).toEqual([[2]]);
  });

  it("voert actiequery’s uit en meldt het aantal gewijzigde rijen", async () => {
    expect(await w.gewijzigd()).toBe(true); // vulVoorbeeld heeft al gewijzigd
    const u = await w.voerQueryUit("Verhoog saldo", { Factor: "2" });
    expect(u.gewijzigd).toBe(3);
    expect((await w.query("SELECT Saldo FROM Klant WHERE ID = 1")).rijen).toEqual([[200]]);
    const j = await w.query("UPDATE Klant INNER JOIN [Order] ON Klant.ID = [Order].KlantID SET Klant.Saldo = [Order].Bedrag WHERE [Order].Bedrag < 10");
    expect(j.gewijzigd).toBe(1);
    const d = await w.query("DELETE [Order].* FROM [Order] INNER JOIN Klant ON Klant.ID = [Order].KlantID WHERE Klant.Naam = 'bert'");
    expect(d.gewijzigd).toBe(1);
    const m = await w.query("SELECT Naam, Saldo INTO Archief FROM Klant WHERE Actief = False");
    expect(m.gewijzigd).toBe(1);
    expect((await w.tabellen()).map((t) => t.naam)).toContain("Archief");
    const m2 = await w.query("SELECT Naam INTO Archief FROM Klant");
    expect(m2.gewijzigd).toBe(4);
    const ins = await w.query("INSERT INTO Archief (Naam) SELECT Naam FROM Klant WHERE Plaats = 'Delft'");
    expect(ins.gewijzigd).toBe(2);
    // Een mislukte actiequery laat niets half achter.
    await expect(w.query("UPDATE [Order] SET KlantID = KlantID + 100")).rejects.toMatchObject({ code: "beperking" });
    expect((await w.query("SELECT Max(KlantID) FROM [Order]")).rijen[0][0]).toBe(1);
  });

  it("geeft veldsoorten per kolom en rowids bij een bijwerkbare SELECT", async () => {
    const r = await w.query("SELECT Naam, Geboren, Actief, Saldo * 2 AS Dubbel, Format(Geboren, 'yyyy') AS Jaar FROM Klant WHERE Plaats = [Waar] ORDER BY Naam", {
      parameters: { Waar: "Delft" },
    });
    expect(r.kolommen).toEqual(["Naam", "Geboren", "Actief", "Dubbel", "Jaar"]);
    expect(r.kolomsoorten).toEqual(["tekst", "datum", "jaNee", null, null]);
    expect(r.bron).toEqual({ tabel: "Klant", rowids: [1, 3] });
    // Bijwerken via de rowid uit het resultaat.
    await w.wijzig(r.bron!.tabel, r.bron!.rowids[1], { Plaats: "Leiden" });
    expect((await w.rij("Klant", 3))?.waarden.Plaats).toBe("Leiden");
    expect(await w.rij("Klant", 99)).toBeNull();
    const alias = await w.query("SELECT k.* FROM Klant AS k WHERE k.ID = 2");
    expect(alias.bron).toEqual({ tabel: "Klant", rowids: [2] });
    expect(alias.kolomsoorten?.[3]).toBe("datum");
    // Niet bijwerkbaar: groeperen, joins, DISTINCT, UNION.
    expect((await w.query("SELECT Plaats, Count(*) FROM Klant GROUP BY Plaats")).bron).toBeUndefined();
    expect((await w.query("SELECT DISTINCT Plaats FROM Klant")).bron).toBeUndefined();
    expect((await w.query("SELECT Klant.Naam FROM Klant INNER JOIN [Order] ON Klant.ID = [Order].KlantID")).bron).toBeUndefined();
    expect((await w.query("SELECT Naam FROM Klant UNION SELECT Naam FROM Klant")).bron).toBeUndefined();
    // Opgeslagen query op één tabel met parameters is ook bijwerkbaar.
    expect((await w.voerQueryUit("Actieve klanten")).bron?.rowids).toEqual([1, 2, 4]);
  });

  it("ondersteunt transacties met bevestigen en terugdraaien", async () => {
    await w.exporteer();
    expect(await w.gewijzigd()).toBe(true);
    const bytes = await w.exporteer();
    const schoon = laadWerkkopie(SQL, bytes);
    expect(await schoon.gewijzigd()).toBe(false);
    await schoon.begin();
    await expect(schoon.begin()).rejects.toMatchObject({ code: "beperking" });
    await schoon.voegToe("Klant", { Naam: "Tijdelijk" });
    await schoon.query("DELETE FROM [Order]");
    await expect(schoon.exporteer()).rejects.toMatchObject({ code: "beperking" });
    await schoon.terugdraaien();
    expect((await schoon.tabellen()).map((t) => t.aantal)).toEqual([4, 3]);
    expect(await schoon.gewijzigd()).toBe(false);
    await schoon.begin();
    await schoon.voegToe("Klant", { Naam: "Blijft" });
    await schoon.bevestig();
    expect((await schoon.tabellen())[0].aantal).toBe(5);
    expect(await schoon.gewijzigd()).toBe(true);
    await expect(schoon.bevestig()).rejects.toMatchObject({ code: "beperking" });
    await expect(schoon.terugdraaien()).rejects.toMatchObject({ code: "beperking" });
    await schoon.sluit();
  });

  it("bewaart en verwijdert opgeslagen query’s", async () => {
    await w.bewaarQuery({ naam: "Rijke klanten", sql: "SELECT Naam FROM Klant WHERE Saldo > [Grens]", soort: "select" });
    expect((await w.querys()).find((q) => q.naam === "Rijke klanten")).toMatchObject({ soort: "select" });
    expect(await w.parametersVan("Rijke klanten")).toEqual(["Grens"]);
    expect((await w.voerQueryUit("rijke KLANTEN", { Grens: 60 })).rijen).toEqual([["Anna"]]);
    // Vervangen op naam, hoofdletterongevoelig.
    await w.bewaarQuery({ naam: "rijke klanten", sql: "SELECT Naam FROM Klant WHERE Saldo > 0", soort: "select" });
    expect((await w.querys()).filter((q) => q.naam.toLowerCase() === "rijke klanten")).toHaveLength(1);
    await expect(w.bewaarQuery({ naam: "Fout", sql: "SELEKT x", soort: "select" })).rejects.toMatchObject({ code: "syntaxis" });
    await expect(w.bewaarQuery({ naam: "Klant", sql: "SELECT 1", soort: "select" })).rejects.toMatchObject({ code: "beperking" });
    await w.verwijderQuery("Rijke Klanten");
    await expect(w.voerQueryUit("Rijke klanten")).rejects.toMatchObject({ code: "onbekend-object" });
    await expect(w.verwijderQuery("Rijke klanten")).rejects.toMatchObject({ code: "onbekend-object" });
  });

  it("kapt grote resultaten af op de limiet", async () => {
    const r = await w.query("SELECT * FROM Klant", { limiet: 2 });
    expect(r.rijen.length).toBe(2);
    expect(r.afgekapt).toBe(true);
  });

  it("geeft herkenbare fouten", async () => {
    await expect(w.query("SELECT FROM")).rejects.toMatchObject({ code: "syntaxis" });
    await expect(w.query("SELECT Onbekend(1)")).rejects.toMatchObject({ code: "niet-ondersteund" });
    await expect(w.query("SELECT * FROM Niets")).rejects.toMatchObject({ code: "onbekend-object" });
    await expect(w.query("DROP TABLE _openaec_meta", { dialect: "sqlite" })).rejects.toMatchObject({ code: "alleen-lezen" });
    const fout = await w.query("SELECT 1 +", { dialect: "sqlite" }).catch((e) => e);
    expect(fout).toBeInstanceOf(WerkkopieFout);
  });

  it("voert SQLite-dialect uit met benoemde parameters", async () => {
    const r = await w.query("SELECT Naam FROM Klant WHERE Saldo > :min ORDER BY Naam", { dialect: "sqlite", parameters: { min: 10 } });
    expect(r.rijen).toEqual([["Anna"], ["bert"]]);
  });

  it("maakt en verwijdert tabellen en bewaart ontwerpen", async () => {
    await expect(w.maakTabel({ naam: "Klant", velden: [{ naam: "x", soort: "tekst" }] })).rejects.toMatchObject({ code: "beperking" });
    await w.maakTabel({ naam: "Tijdelijk", velden: [{ naam: "A", soort: "geheel", primair: true }, { naam: "B", soort: "memo" }] });
    expect((await w.tabellen()).find((t) => t.naam === "Tijdelijk")?.velden).toEqual([
      { naam: "A", soort: "geheel", primair: true },
      { naam: "B", soort: "memo" },
    ]);
    await w.verwijderTabel("Tijdelijk");
    await expect(w.rijen("Tijdelijk")).rejects.toMatchObject({ code: "onbekend-object" });
    await w.bewaarOntwerp({ naam: "Klantkaart", soort: "formulier", bron: "Klant", definitie: { velden: ["Naam"] } });
    await w.bewaarOntwerp({ naam: "Klantkaart", soort: "formulier", bron: "Klant", definitie: { velden: ["Naam", "Plaats"] } });
    expect(await w.ontwerpen()).toEqual([{ naam: "Klantkaart", soort: "formulier", bron: "Klant", definitie: { velden: ["Naam", "Plaats"] } }]);
    await w.verwijderOntwerp("formulier", "Klantkaart");
    expect(await w.ontwerpen()).toEqual([]);
  });

  it("exporteert een SQLite-bestand dat weer te laden is, met werkende functies", async () => {
    const bytes = await w.exporteer();
    expect(new TextDecoder().decode(bytes.subarray(0, 15))).toBe("SQLite format 3");
    // Na export (sql.js heropent de verbinding) werken de eigen functies nog.
    expect((await w.query("SELECT UCase(Naam) FROM Klant WHERE ID = 2")).rijen).toEqual([["BERT"]]);
    expect(await w.gewijzigd()).toBe(true);
    const terug = laadWerkkopie(SQL, bytes);
    expect(terug.bron.naam).toBe("Voorbeeld");
    expect(await terug.gewijzigd()).toBe(false);
    expect((await terug.voerQueryUit("Klanten per plaats", { "Welke plaats": "Delft" })).rijen).toEqual([[1, "Anna"]]);
    await terug.sluit();
  });

  it("weigert gebruik na sluiten", async () => {
    await w.sluit();
    await expect(w.tabellen()).rejects.toMatchObject({ code: "intern" });
  });
});

describe("MessagePort-brug", () => {
  it("geeft dezelfde resultaten en foutcodes via een poort", async () => {
    const w = await vulVoorbeeld();
    const kanaal = new MessageChannel();
    const ontkoppel = koppelWerkkopie(w, kanaal.port1 as unknown as MessagePort);
    const proxy: Werkkopie = await werkkopieViaPoort(kanaal.port2 as unknown as MessagePort, { tijdslimiet: 5000 });
    expect(proxy.bron).toEqual(w.bron);
    expect((await proxy.voerQueryUit("Klanten per plaats", { "Welke plaats": "Delft" })).rijen).toEqual([[1, "Anna"]]);
    expect((await proxy.rijen("Klant", { aantal: 1 })).rijen[0].waarden.Naam).toBe("Anna");
    const id = await proxy.voegToe("Klant", { Naam: "Via poort" });
    expect(id).toBe(5);
    expect((await proxy.rij!("Klant", id))?.waarden.Naam).toBe("Via poort");
    await proxy.begin!();
    await proxy.verwijder("Klant", id);
    await proxy.terugdraaien!();
    expect(await proxy.rij!("Klant", id)).not.toBeNull();
    await proxy.bewaarQuery!({ naam: "Via poort", sql: "SELECT Naam FROM Klant", soort: "select" });
    expect((await proxy.voerQueryUit("Via poort")).bron?.tabel).toBe("Klant");
    await proxy.verwijderQuery!("Via poort");
    const fout = await proxy.query("SELECT * FROM Niets").catch((e) => e);
    expect(fout).toBeInstanceOf(WerkkopieFout);
    expect(fout.code).toBe("onbekend-object");
    const bytes = await proxy.exporteer();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // sluit via de poort ontkoppelt alleen; de werkkopie zelf blijft open.
    await proxy.sluit();
    await expect(proxy.tabellen()).rejects.toMatchObject({ code: "intern" });
    expect((await w.tabellen()).length).toBe(2);
    ontkoppel();
    kanaal.port1.close();
    kanaal.port2.close();
  });
});

// Corpusproef (alleen als het lokale corpus aanwezig is; zie scripts/corpus-download.mjs).
const manifestPad = ".local/corpus/manifest.json";
const corpus = existsSync(manifestPad)
  ? (JSON.parse(readFileSync(manifestPad, "utf8")).bestanden as { pad: string; bestand: string; naam: string; status: string; sha256: string; extensie: string }[]).filter(
      (b) => b.status === "opgehaald" && /^(mdb|accdb)$/.test(b.extensie) && existsSync(b.bestand),
    )
  : [];

describe.skipIf(!corpus.length)("werkkopie uit het Access-corpus", () => {
  const kies = (deel: string) => corpus.find((b) => b.pad.endsWith(deel))!;
  const bouw = async (deel: string) => {
    const bestand = kies(deel);
    const buffer = readFileSync(bestand.bestand);
    const w = await openWerkkopie(SQL, new MDBReader(buffer), new Uint8Array(buffer), bestand.naam);
    return { w, buffer, bestand };
  };

  it("de 45 Jackcess-query’s uit de vijf queryTest-databases komen over en vertalen of geven een concrete beperking", async () => {
    let aantal = 0;
    for (const versie of ["V1997/queryV1997.mdb", "V2000/queryTestV2000.mdb", "V2003/queryV2003.mdb", "V2007/queryV2007.accdb", "V2010/queryV2010.accdb"]) {
      const { w } = await bouw(versie);
      const querys = await w.querys();
      for (const q of querys) {
        if (!(q.naam in JACKCESS)) continue;
        aantal++;
        expect(q.sql).toBe(JACKCESS[q.naam]);
        const tabellen = new Map((await w.tabellen()).map((t) => [t.naam.toLowerCase(), t]));
        try {
          vertaalAccessSql(q.sql, {
            tabel: (n) => {
              const t = tabellen.get(n.toLowerCase());
              return t ? { naam: t.naam, kolommen: t.velden.map((v) => ({ naam: v.naam, soort: v.soort })) } : null;
            },
            query: () => null,
          }, { soort: q.soort, naam: q.naam });
        } catch (e) {
          expect(e).toBeInstanceOf(WerkkopieFout);
          expect(["niet-ondersteund", "beperking"]).toContain((e as WerkkopieFout).code);
        }
      }
      await w.sluit();
    }
    expect(aantal).toBe(45);
  });

  it("neemt rijen, sleutels en relaties over en laat het origineel ongewijzigd", async () => {
    for (const deel of ["V2010/indexV2010.accdb", "V2003/common1V2003.mdb", "V2007/complexDataV2007.accdb"]) {
      const { w, buffer, bestand } = await bouw(deel);
      const reader = new MDBReader(buffer);
      for (const t of await w.tabellen()) expect(t.aantal, `${deel} ${t.naam}`).toBe(reader.getTable(t.naam).rowCount);
      expect(w.bron.sha256).toBe(bestand.sha256);
      expect(createHash("sha256").update(readFileSync(bestand.bestand)).digest("hex")).toBe(bestand.sha256);
      await w.sluit();
    }
  });
});
