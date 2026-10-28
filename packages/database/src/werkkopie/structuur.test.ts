import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import MDBReader from "mdb-reader";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { MessageChannel } from "node:worker_threads";
import { analyseerDatabase } from "../access-analyse";
import { VREEMDE_SQLITE, WerkkopieFout } from "./contract";
import { laadWerkkopie, nieuweWerkkopie, isSqliteBestand, openWerkkopie, type SqliteWerkkopie } from "./werkkopie";
import { koppelWerkkopie, werkkopieViaPoort, type Poort } from "./werkkopie-brug";
import { converteerWaarde, naamPatroon } from "./structuur";
import { modulesUitAnalyse, moduleSoort } from "./modules";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

/** Klant (sleutel ID) ← Order (KlantID, FK uit DDL) met een losse index en een trigger. */
async function opzet(): Promise<SqliteWerkkopie> {
  const w = nieuweWerkkopie(SQL, "Structuur", [
    { naam: "Klanten in Delft", sql: "SELECT Naam, Plaats FROM Klant WHERE Plaats = 'Delft';", soort: "select" },
    { naam: "Via query", sql: "SELECT Naam FROM [Klanten in Delft];", soort: "select" },
    { naam: "Orders", sql: "SELECT Bedrag FROM [Order];", soort: "select" },
  ]);
  await w.maakTabel({
    naam: "Klant",
    velden: [
      { naam: "ID", soort: "autonummer", primair: true },
      { naam: "Naam", soort: "tekst", lengte: 50, verplicht: true },
      { naam: "Plaats", soort: "tekst", lengte: 50 },
      { naam: "Code", soort: "tekst", lengte: 10 },
      { naam: "Saldo", soort: "valuta", standaard: 0 },
    ],
  });
  for (const [Naam, Plaats, Code] of [
    ["Anna", "Delft", "12"],
    ["Bert", "Gouda", "7,5"],
    ["Chris", "Delft", "x"],
    ["Dirk", null, null],
  ])
    await w.voegToe("Klant", { Naam, Plaats, Code });
  await w.query("CREATE TABLE [Order] (ID COUNTER PRIMARY KEY, KlantID LONG REFERENCES Klant (ID), Bedrag CURRENCY)");
  await w.query("INSERT INTO [Order] (KlantID, Bedrag) VALUES (1, 10)");
  await w.query("INSERT INTO [Order] (KlantID, Bedrag) VALUES (2, 20)");
  await w.query('CREATE INDEX "Klant.Plaats" ON Klant (Plaats)', { dialect: "sqlite" });
  await w.query(
    "CREATE TRIGGER klant_log AFTER UPDATE OF Saldo ON Klant BEGIN UPDATE Klant SET Code = Code WHERE rowid = NEW.rowid; END",
    { dialect: "sqlite" },
  );
  return w;
}

const sqliteMaster = (w: SqliteWerkkopie, soort: string) =>
  w.query(`SELECT name FROM sqlite_master WHERE type = '${soort}' ORDER BY name`, { dialect: "sqlite" }).then((r) => r.rijen.map((x) => x[0]));

describe("structuur wijzigen", () => {
  let w: SqliteWerkkopie;
  beforeEach(async () => {
    w = await opzet();
  });

  it("voegt een veld toe met ALTER TABLE, ook met standaardwaarde en AutoNummer", async () => {
    const r = await w.voegVeldToe("Klant", { naam: "Actief", soort: "jaNee", standaard: true });
    expect(r).toMatchObject({ herbouwd: false, querys: [] });
    expect((await w.rij("Klant", 1))?.waarden.Actief).toBe(true);
    await w.voegVeldToe("Klant", { naam: "Volgnr", soort: "autonummer" });
    expect((await w.rijen("Klant")).rijen.map((x) => x.waarden.Volgnr)).toEqual([1, 2, 3, 4]);
    await expect(w.voegVeldToe("Klant", { naam: "naam", soort: "tekst" })).rejects.toMatchObject({ code: "beperking" });
    await expect(w.voegVeldToe("Klant", { naam: "Nr", soort: "geheel", verplicht: true })).rejects.toThrow(/4 bestaande rij/);
    await expect(w.voegVeldToe("Klant", { naam: "Sleutel", soort: "geheel", primair: true })).rejects.toMatchObject({ code: "niet-ondersteund" });
    await expect(w.voegVeldToe("Klant", { naam: "Raar[", soort: "tekst" })).rejects.toMatchObject({ code: "syntaxis" });
    await expect(w.voegVeldToe("_openaec_meta", { naam: "x", soort: "tekst" })).rejects.toMatchObject({ code: "alleen-lezen" });
  });

  it("voegt een verplicht veld zonder standaard toe aan een lege tabel via herbouw", async () => {
    await w.maakTabel({ naam: "Leeg", velden: [{ naam: "A", soort: "tekst" }] });
    const r = await w.voegVeldToe("Leeg", { naam: "B", soort: "geheel", verplicht: true });
    expect(r.herbouwd).toBe(true);
    expect((await w.tabellen()).find((t) => t.naam === "Leeg")?.velden[1]).toMatchObject({ naam: "B", soort: "geheel", verplicht: true });
  });

  it("hernoemt een veld, past relaties en bijlagen aan en meldt query’s die het veld noemen", async () => {
    await w.maakRelatie({ tabel: "Order", velden: ["KlantID"], naarTabel: "Klant", naarVelden: ["ID"], integriteit: false });
    const r = await w.hernoemVeld("Klant", "Plaats", "Woonplaats");
    expect(r.herbouwd).toBe(false);
    expect(r.querys.sort()).toEqual(["Klanten in Delft"]);
    expect((await w.tabellen()).find((t) => t.naam === "Klant")?.velden.map((v) => v.naam)).toContain("Woonplaats");
    // De query zelf is niet bijgewerkt.
    expect((await w.querys()).find((q) => q.naam === "Klanten in Delft")?.sql).toContain("Plaats");
    const r2 = await w.hernoemVeld("Klant", "ID", "KlantNr");
    expect(r2.querys).toEqual([]);
    expect((await w.relaties())[0].naarVelden).toEqual(["KlantNr"]);
    // De FOREIGN KEY uit de DDL volgt de nieuwe naam en blijft werken.
    await expect(w.voegToe("Order", { KlantID: 99, Bedrag: 1 })).rejects.toMatchObject({ code: "beperking" });
    await expect(w.hernoemVeld("Klant", "Naam", "Code")).rejects.toMatchObject({ code: "beperking" });
    await expect(w.hernoemVeld("Klant", "Bestaat", "X")).rejects.toMatchObject({ code: "onbekend-object" });
  });

  it("verwijdert een veld (ALTER of herbouw) en weigert een veld in een relatie", async () => {
    await w.voegVeldToe("Klant", { naam: "Extra", soort: "tekst" });
    expect((await w.verwijderVeld("Klant", "Extra")).herbouwd).toBe(false);
    // Een trigger gebruikt het veld: geweigerd in plaats van een kapotte trigger terugzetten.
    await expect(w.verwijderVeld("Klant", "Code")).rejects.toThrow(/Trigger ‘klant_log’ gebruikt veld ‘Code’/);
    const r = await w.verwijderVeld("Klant", "Plaats");
    expect(r.herbouwd).toBe(true);
    expect(r.meldingen.join(" ")).toMatch(/Index ‘Klant.Plaats’ is vervallen/);
    expect(r.querys).toEqual(["Klanten in Delft"]);
    expect(await sqliteMaster(w, "index")).not.toContain("Klant.Plaats");
    await expect(w.verwijderVeld("Klant", "ID")).rejects.toThrow(/verwijzing vanuit ‘Order’/);
    await expect(w.verwijderVeld("Order", "KlantID")).rejects.toThrow(/verwijzing naar ‘Klant’/);
  });

  it("herbouwt bij een typewijziging met behoud van foreign keys, indexen, triggers en rowids", async () => {
    await w.wijzigVeld("Klant", "Code", { soort: "tekst", lengte: 20 });
    // Getal uit tekst: ‘x’ is niet te converteren → niets gewijzigd.
    const voor = await w.exporteer();
    const fout = await w.wijzigVeld("Klant", "Code", { soort: "getal" }).catch((e) => e);
    expect(fout).toBeInstanceOf(WerkkopieFout);
    expect(fout.code).toBe("beperking");
    expect(fout.message).toMatch(/1 rij\(en\), bijvoorbeeld rowid 3: veld ‘Code’: geen getal/);
    expect(fout.message).not.toContain("x");
    expect(await w.exporteer()).toEqual(voor);
    expect((await w.tabellen()).find((t) => t.naam === "Klant")?.velden.find((v) => v.naam === "Code")?.soort).toBe("tekst");

    await w.wijzig("Klant", 3, { Code: "3" });
    const r = await w.wijzigVeld("Klant", "Code", { soort: "getal" });
    expect(r.herbouwd).toBe(true);
    expect((await w.rijen("Klant")).rijen.map((x) => [x.rowid, x.waarden.Code])).toEqual([
      [1, 12],
      [2, 7.5],
      [3, 3],
      [4, null],
    ]);
    expect(await sqliteMaster(w, "index")).toContain("Klant.Plaats");
    expect(await sqliteMaster(w, "trigger")).toEqual(["klant_log"]);
    // De verwijzing vanuit Order (naar de herbouwde tabel) werkt nog.
    await expect(w.verwijder("Klant", 1)).rejects.toMatchObject({ code: "beperking" });
  });

  it("herbouwt een tabel met een eigen FOREIGN KEY en controleert die na afloop", async () => {
    const r = await w.wijzigVeld("Order", "Bedrag", { soort: "getal", verplicht: true });
    expect(r.herbouwd).toBe(true);
    await expect(w.voegToe("Order", { KlantID: 99, Bedrag: 1 })).rejects.toMatchObject({ code: "beperking" });
    expect((await w.query("PRAGMA foreign_key_list(\"Order\")", { dialect: "sqlite" })).rijen.length).toBe(1);
    await w.query('UPDATE "Order" SET KlantID = 1', { dialect: "sqlite" });
    const r2 = await w.wijzigVeld("Order", "Bedrag", { verplicht: false, standaard: 5 });
    expect(r2.herbouwd).toBe(true);
    expect((await w.tabellen()).find((t) => t.naam === "Order")?.velden.find((v) => v.naam === "Bedrag")?.standaard).toBe(5);
  });

  it("weigert een verplicht-wijziging bij lege waarden en wijzigt niets", async () => {
    const fout = await w.wijzigVeld("Klant", "Plaats", { verplicht: true }).catch((e) => e);
    expect(fout.message).toMatch(/1 rij\(en\), bijvoorbeeld rowid 4: veld ‘Plaats’: leeg terwijl het veld verplicht is/);
    expect((await w.tabellen()).find((t) => t.naam === "Klant")?.velden.find((v) => v.naam === "Plaats")?.verplicht).toBeUndefined();
  });

  it("weigert herbouw tijdens een transactie", async () => {
    await w.begin();
    await expect(w.wijzigVeld("Klant", "Code", { lengte: 30 })).rejects.toThrow(/lopende transactie/);
    await w.terugdraaien();
  });

  it("stelt de primaire sleutel in en controleert lege en dubbele waarden", async () => {
    await w.maakTabel({ naam: "Prijs", velden: [{ naam: "Code", soort: "tekst" }, { naam: "Bedrag", soort: "valuta" }] });
    for (const Code of ["A", "B", "b", null]) await w.voegToe("Prijs", { Code, Bedrag: 1 });
    await expect(w.zetPrimaireSleutel("Prijs", ["Code"])).rejects.toThrow(/1 rij\(en\), bijvoorbeeld rowid 4 hebben een leeg sleutelveld/);
    await w.verwijder("Prijs", 4);
    // Tekst vergelijkt hoofdletterongevoelig, zoals Access.
    await expect(w.zetPrimaireSleutel("Prijs", ["Code"])).rejects.toThrow(/2 rij\(en\), bijvoorbeeld rowid 2, 3 hebben een dubbele sleutelwaarde/);
    await w.wijzig("Prijs", 3, { Code: "C" });
    expect((await w.zetPrimaireSleutel("Prijs", ["Code"])).herbouwd).toBe(true);
    expect((await w.tabellen()).find((t) => t.naam === "Prijs")?.velden[0].primair).toBe(true);
    await expect(w.voegToe("Prijs", { Code: "a" })).rejects.toMatchObject({ code: "beperking" });
    // Sleutel van Klant weghalen kan niet: Order verwijst ernaar.
    await expect(w.zetPrimaireSleutel("Klant", [])).rejects.toThrow(/‘Order’ verwijst/);
    // Rowid-alias erbij: rowids volgen de AutoNummer-waarden, bijlagen gaan mee.
    await w.maakTabel({ naam: "Foto", velden: [{ naam: "Nr", soort: "geheel" }, { naam: "Naam", soort: "tekst" }] });
    await w.voegToe("Foto", { Nr: 10, Naam: "a" });
    await w.voegToe("Foto", { Nr: 20, Naam: "b" });
    await w.wijzigVeld("Foto", "Nr", { soort: "autonummer" });
    await w.zetPrimaireSleutel("Foto", ["Nr"]);
    expect((await w.rijen("Foto")).rijen.map((r) => r.rowid)).toEqual([10, 20]);
  });

  it("maakt en verwijdert relaties met en zonder referentiële integriteit", async () => {
    await w.maakTabel({ naam: "Bezoek", velden: [{ naam: "Nr", soort: "autonummer", primair: true }, { naam: "Klant", soort: "geheel" }, { naam: "Datum", soort: "datum" }] });
    for (const Klant of [1, 2, 9, 8, null]) await w.voegToe("Bezoek", { Klant });
    const zonder = await w.maakRelatie({ tabel: "Bezoek", velden: ["Klant"], naarTabel: "Klant", naarVelden: ["ID"], integriteit: false });
    expect(zonder).toBe("KlantBezoek");
    const fout = await w
      .maakRelatie({ naam: "Streng", tabel: "Bezoek", velden: ["Klant"], naarTabel: "Klant", naarVelden: ["ID"], integriteit: true })
      .catch((e) => e);
    expect(fout.message).toMatch(/2 rij\(en\), bijvoorbeeld rowid 3, 4 in ‘Bezoek’ verwijzen naar een niet-bestaande rij in ‘Klant’/);
    expect((await w.relaties()).map((r) => r.naam)).toEqual(["KlantBezoek"]);
    await expect(
      w.maakRelatie({ tabel: "Bezoek", velden: ["Klant"], naarTabel: "Klant", naarVelden: ["Naam"], integriteit: true }),
    ).rejects.toThrow(/passend gegevenstype/);
    await expect(
      w.maakRelatie({ tabel: "Bezoek", velden: ["Datum"], naarTabel: "Bezoek", naarVelden: ["Datum"], integriteit: true }),
    ).rejects.toThrow(/primaire sleutel of unieke index/);

    await w.query("DELETE FROM Bezoek WHERE Klant > 4");
    const naam = await w.maakRelatie({
      naam: "Streng",
      tabel: "Bezoek",
      velden: ["Klant"],
      naarTabel: "Klant",
      naarVelden: ["ID"],
      integriteit: true,
      trapsVerwijderen: true,
    });
    expect(naam).toBe("Streng");
    expect((await w.relaties()).find((r) => r.naam === "Streng")).toMatchObject({ integriteit: true, trapsVerwijderen: true, trapsBijwerken: false });
    await expect(w.voegToe("Bezoek", { Klant: 77 })).rejects.toMatchObject({ code: "beperking" });
    await w.verwijder("Order", 2);
    await w.verwijder("Klant", 2); // trapsgewijs: het bezoek van klant 2 verdwijnt mee
    expect((await w.rijen("Bezoek")).rijen.map((r) => r.waarden.Klant)).toEqual([1, null]);
    await expect(w.verwijderVeld("Bezoek", "Klant")).rejects.toThrow(/relatie/);

    await w.verwijderRelatie("streng");
    expect((await w.query('PRAGMA foreign_key_list("Bezoek")', { dialect: "sqlite" })).rijen).toEqual([]);
    await expect(w.voegToe("Bezoek", { Klant: 77 })).resolves.toBeGreaterThan(0);
    await w.verwijderRelatie("KlantBezoek");
    expect(await w.relaties()).toEqual([]);
    await expect(w.verwijderRelatie("KlantBezoek")).rejects.toMatchObject({ code: "onbekend-object" });
  });

  it("bewaart VBA-modules in de werkkopie, ook na export en heropenen", async () => {
    await w.bewaarModule({ naam: "Module1", soort: "module", bron: "Public Sub A()\nEnd Sub\n" });
    await w.bewaarModule({ naam: "Form_Klant", soort: "formulier", bron: "Private Sub Form_Load()\nEnd Sub\n" });
    await w.bewaarModule({ naam: "module1", soort: "module", bron: "Public Sub B()\nEnd Sub\n" });
    await expect(w.bewaarModule({ naam: "1fout", soort: "module", bron: "" })).rejects.toMatchObject({ code: "syntaxis" });
    await expect(w.bewaarModule({ naam: "Goed", soort: "macro" as never, bron: "" })).rejects.toMatchObject({ code: "syntaxis" });
    const lijst = await w.modules();
    expect(lijst.map((m) => [m.naam, m.soort, m.herkomst])).toEqual([
      ["Form_Klant", "formulier", "werkkopie"],
      ["Module1", "module", "werkkopie"],
    ]);
    expect(lijst[1].bron).toContain("Sub B");
    expect(lijst[1].gewijzigd).toMatch(/^\d{4}-/);
    const terug = laadWerkkopie(SQL, await w.exporteer());
    expect((await terug.modules()).map((m) => m.naam)).toEqual(["Form_Klant", "Module1"]);
    await terug.verwijderModule("form_klant");
    expect((await terug.modules()).length).toBe(1);
    await expect(terug.verwijderModule("Form_Klant")).rejects.toMatchObject({ code: "onbekend-object" });
    expect(await terug.gewijzigd()).toBe(true);
    await terug.sluit();
  });

  it("geeft de nieuwe methoden door via de MessagePort-brug", async () => {
    const kanaal = new MessageChannel();
    const los = koppelWerkkopie(w, kanaal.port1 as unknown as Poort);
    const proxy = await werkkopieViaPoort(kanaal.port2 as unknown as Poort);
    expect((await proxy.voegVeldToe("Klant", { naam: "Extra", soort: "memo" })).herbouwd).toBe(false);
    await expect(proxy.wijzigVeld("Klant", "Code", { soort: "getal" })).rejects.toMatchObject({ code: "beperking" });
    await proxy.bewaarModule({ naam: "ViaPoort", soort: "klasse", bron: "" });
    expect((await proxy.modules())[0].naam).toBe("ViaPoort");
    proxy.ontkoppel();
    los();
    kanaal.port1.close();
    kanaal.port2.close();
  });
});

describe("heropenen van .sqlite", () => {
  it("controleert de kop, weigert een vreemde SQLite en opent die op verzoek met een melding", async () => {
    expect(() => laadWerkkopie(SQL, new TextEncoder().encode("geen sqlite".padEnd(200, " ")))).toThrow(/geen SQLite-bestand/);
    const vreemd = new SQL.Database();
    vreemd.run("CREATE TABLE Dingen (a INTEGER PRIMARY KEY, b TEXT); INSERT INTO Dingen (b) VALUES ('x'); CREATE VIEW v AS SELECT * FROM Dingen;");
    const bytes = vreemd.export();
    vreemd.close();
    expect(isSqliteBestand(bytes)).toBe(true);
    const fout = (() => {
      try {
        laadWerkkopie(SQL, bytes);
      } catch (e) {
        return e as WerkkopieFout;
      }
    })();
    expect(fout?.code).toBe("niet-ondersteund");
    expect(fout?.message.startsWith(VREEMDE_SQLITE)).toBe(true);
    const w = laadWerkkopie(SQL, bytes, { vreemdeSqlite: true, naam: "dingen.db" });
    expect(w.bron.naam).toBe("dingen.db");
    expect(w.laadmeldingen.join(" ")).toMatch(/views.*v/i);
    expect((await w.tabellen()).map((t) => [t.naam, t.herkomst, t.aantal])).toEqual([["Dingen", "werkkopie", 1]]);
    expect(await w.modules()).toEqual([]);
    await w.sluit();
  });

  it("werkt een werkkopie met schemaversie 1 bij en weigert een nieuwere", async () => {
    const w = nieuweWerkkopie(SQL, "Oud");
    await w.bewaarModule({ naam: "M", soort: "module", bron: "" });
    const db = new SQL.Database(await w.exporteer());
    db.run("DROP TABLE _openaec_modules; UPDATE _openaec_meta SET waarde = '1' WHERE sleutel = 'schemaversie'");
    const oud = laadWerkkopie(SQL, db.export());
    expect(oud.laadmeldingen.join(" ")).toMatch(/schemaversie 1 naar 2/);
    expect(await oud.modules()).toEqual([]);
    await oud.bewaarModule({ naam: "Nieuw", soort: "module", bron: "" });
    expect(await oud.gewijzigd()).toBe(true);
    db.run("UPDATE _openaec_meta SET waarde = '99' WHERE sleutel = 'schemaversie'");
    expect(() => laadWerkkopie(SQL, db.export())).toThrow(/nieuwere versie/);
    db.close();
    await oud.sluit();
    await w.sluit();
  });
});

describe("pure hulpfuncties", () => {
  it("converteert waarden zoals Access bij een typewijziging", () => {
    expect(converteerWaarde("7,5", "tekst", { naam: "x", soort: "getal" })).toEqual({ ok: true, waarde: 7.5 });
    expect(converteerWaarde("2,5", "tekst", { naam: "x", soort: "geheel" })).toEqual({ ok: true, waarde: 2 });
    expect(converteerWaarde(1, "jaNee", { naam: "x", soort: "geheel" })).toEqual({ ok: true, waarde: -1 });
    expect(converteerWaarde(1, "jaNee", { naam: "x", soort: "tekst" })).toEqual({ ok: true, waarde: "Waar" });
    expect(converteerWaarde(1.5, "getal", { naam: "x", soort: "tekst" })).toEqual({ ok: true, waarde: "1,5" });
    expect(converteerWaarde("26-10-2026", "tekst", { naam: "x", soort: "datum" })).toEqual({ ok: true, waarde: "2026-10-26" });
    expect(converteerWaarde("nee", "tekst", { naam: "x", soort: "jaNee" })).toEqual({ ok: true, waarde: 0 });
    expect(converteerWaarde("misschien", "tekst", { naam: "x", soort: "jaNee" }).ok).toBe(false);
    expect(converteerWaarde("abcdef", "tekst", { naam: "x", soort: "tekst", lengte: 3 })).toEqual({ ok: false, reden: "langer dan 3 tekens" });
    expect(converteerWaarde(null, "tekst", { naam: "x", soort: "tekst", verplicht: true }).ok).toBe(false);
    expect(converteerWaarde(new Uint8Array([1]), "binair", { naam: "x", soort: "tekst" }).ok).toBe(false);
    expect(converteerWaarde("A", "tekst", { naam: "x", soort: "binair" }).ok).toBe(false);
    expect(converteerWaarde("0f8fad5b-d9cb-469f-a165-70867728950e", "tekst", { naam: "x", soort: "guid" })).toEqual({
      ok: true,
      waarde: "{0f8fad5b-d9cb-469f-a165-70867728950e}",
    });
    // Zelfde soort: ongewijzigd (geen stille afronding).
    expect(converteerWaarde(1.5, "geheel", { naam: "x", soort: "geheel" })).toEqual({ ok: true, waarde: 1.5 });
  });

  it("vindt namen als los woord", () => {
    expect(naamPatroon("Plaats").test("SELECT [Plaats] FROM x")).toBe(true);
    expect(naamPatroon("Plaats").test("SELECT Woonplaats FROM x")).toBe(false);
    expect(naamPatroon("Order").test("FROM [Order]")).toBe(true);
  });

  it("zet analyse-objecten om naar modules", () => {
    expect(moduleSoort("Form_Klant")).toBe("formulier");
    expect(moduleSoort("Klasse1", "Klasse- of documentmodule")).toBe("klasse");
    expect(
      modulesUitAnalyse([
        { id: "vba:M", naam: "M", soort: "VBA", bron: "x", eigenschappen: [["Moduletype", "Standaardmodule"]] },
        { id: "vba:Z", naam: "Z", soort: "VBA" },
        { id: "T", naam: "T", soort: "Tabel" },
      ]),
    ).toEqual([{ naam: "M", soort: "module", bron: "x" }]);
  });
});

// VBA-corpus (alleen als het lokaal aanwezig is): modules uit de analyse komen in de werkkopie
// en overleven export en heropenen. Er wordt geen VBA uitgevoerd.
const vbaManifest = ".local/corpus/access-vba/manifest.json";
const vbaBestand = existsSync(vbaManifest)
  ? (JSON.parse(readFileSync(vbaManifest, "utf8")).bestanden as { pad: string; bestand: string; naam: string; sha256: string; status: string }[]).find(
      (b) => b.status === "opgehaald" && b.pad === "asvnTest/asvnTest2003.mdb" && existsSync(b.bestand),
    )
  : undefined;

describe.skipIf(!vbaBestand)("VBA-modules bij de opbouw", () => {
  it("zet de geëxtraheerde modules in _openaec_modules en houdt ze na heropenen", async () => {
    const buffer = readFileSync(vbaBestand!.bestand);
    const bytes = new Uint8Array(buffer);
    const analyse = await analyseerDatabase(new MDBReader(buffer), bytes, { naam: vbaBestand!.naam, grootte: bytes.byteLength });
    const modules = modulesUitAnalyse(analyse.objecten);
    expect(modules.length).toBeGreaterThan(0);
    const w = await openWerkkopie(SQL, new MDBReader(buffer), bytes, vbaBestand!.naam, { modules });
    expect(w.opbouwrapport?.modules).toBe(modules.length);
    const opgeslagen = await w.modules();
    expect(opgeslagen.map((m) => [m.naam, m.herkomst, m.gewijzigd])).toEqual(
      [...modules].sort((a, b) => a.naam.localeCompare(b.naam, undefined, { sensitivity: "base" })).map((m) => [m.naam, "access", null]),
    );
    await w.bewaarModule({ ...modules[0], bron: modules[0].bron + "\r\n' bewerkt" });
    await w.bewaarModule({ naam: "NieuweModule", soort: "module", bron: "Public Sub X()\r\nEnd Sub\r\n" });
    const terug = laadWerkkopie(SQL, await w.exporteer());
    const na = await terug.modules();
    expect(na.find((m) => m.naam === modules[0].naam)).toMatchObject({ herkomst: "access", gewijzigd: expect.any(String) });
    expect(na.find((m) => m.naam === modules[0].naam)?.bron).toMatch(/' bewerkt$/);
    expect(na.find((m) => m.naam === "NieuweModule")?.herkomst).toBe("werkkopie");
    await terug.sluit();
    await w.sluit();
    expect(createHash("sha256").update(readFileSync(vbaBestand!.bestand)).digest("hex")).toBe(vbaBestand!.sha256);
  });
});
