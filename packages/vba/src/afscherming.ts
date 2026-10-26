/**
 * Afscherming: wat VBA-code buiten de werkkopie zou laten komen (processen,
 * bestanden, COM/ActiveX, de Windows-API, toetsaanslagen, omgevingsvariabelen,
 * het register, hyperlinks en export naar bestanden) wordt niet uitgevoerd.
 *
 * Twee lagen:
 * 1. Bij uitvoering: de interpreter weigert met een `VbaAfbreking` (reden
 *    "afgeschermd") vóórdat argumenten worden geëvalueerd. Die fout is niet
 *    met `On Error` af te vangen, zodat code niet stil verder loopt.
 * 2. Statisch: `scanAfscherming` meldt vooraf welke afgeschermde constructies
 *    een module bevat, zonder de code uit te voeren.
 */
import type { Argument, Expr, ModuleAst, Statement } from "./ast.ts";
import { VbaAfbreking } from "./fouten.ts";

export type AfschermingCategorie =
  | "proces"
  | "bestand"
  | "com"
  | "windows-api"
  | "toetsenbord"
  | "omgeving"
  | "register"
  | "hyperlink"
  | "export";

export interface Afscherming {
  /** Zoals in VBA geschreven, bv. `Shell` of `DoCmd.TransferText`. */
  naam: string;
  categorie: AfschermingCategorie;
  reden: string;
}

const REDENEN: Record<AfschermingCategorie, string> = {
  proces: "starten van programma’s",
  bestand: "toegang tot het bestandssysteem",
  com: "COM-/ActiveX-objecten",
  "windows-api": "aanroepen van de Windows-API",
  toetsenbord: "versturen van toetsaanslagen",
  omgeving: "lezen van omgevingsvariabelen",
  register: "toegang tot het Windows-register",
  hyperlink: "openen van hyperlinks en externe programma’s",
  export: "exporteren of importeren via bestanden",
};

const f = (naam: string, categorie: AfschermingCategorie): [string, Afscherming] => [
  naam.toLowerCase(),
  { naam, categorie, reden: REDENEN[categorie] },
];

/** Ingebouwde functies en statements die worden geweigerd. */
export const GEWEIGERDE_FUNCTIES = new Map<string, Afscherming>([
  f("Shell", "proces"),
  f("AppActivate", "proces"),
  f("Kill", "bestand"),
  f("FileCopy", "bestand"),
  f("Dir", "bestand"),
  f("MkDir", "bestand"),
  f("RmDir", "bestand"),
  f("ChDir", "bestand"),
  f("ChDrive", "bestand"),
  f("CurDir", "bestand"),
  f("FileLen", "bestand"),
  f("FileDateTime", "bestand"),
  f("GetAttr", "bestand"),
  f("SetAttr", "bestand"),
  f("FreeFile", "bestand"),
  f("LOF", "bestand"),
  f("Loc", "bestand"),
  f("LoadPicture", "bestand"),
  f("SavePicture", "bestand"),
  f("CreateObject", "com"),
  f("GetObject", "com"),
  f("SendKeys", "toetsenbord"),
  f("Environ", "omgeving"),
  f("GetSetting", "register"),
  f("SaveSetting", "register"),
  f("DeleteSetting", "register"),
  f("GetAllSettings", "register"),
]);

/** Leden van Access-objecten die worden geweigerd (object.lid, kleine letters). */
export const GEWEIGERDE_LEDEN = new Map<string, Afscherming>([
  f("DoCmd.TransferText", "export"),
  f("DoCmd.TransferSpreadsheet", "export"),
  f("DoCmd.TransferDatabase", "export"),
  f("DoCmd.TransferSQLDatabase", "export"),
  f("DoCmd.OutputTo", "export"),
  f("DoCmd.SendObject", "export"),
  f("DoCmd.RunApp", "proces"),
  f("DoCmd.CopyDatabaseFile", "bestand"),
  f("DoCmd.FollowHyperlink", "hyperlink"),
  f("Application.FollowHyperlink", "hyperlink"),
  f("Application.ExportXML", "export"),
  f("Application.ImportXML", "export"),
  f("Application.SaveAsText", "export"),
  f("Application.LoadFromText", "export"),
  f("Application.Shell", "proces"),
  f("CurrentProject.Path", "bestand"),
  f("CurrentProject.FullName", "bestand"),
  f("CodeProject.Path", "bestand"),
  f("CodeProject.FullName", "bestand"),
  f("Database.Name", "bestand"),
  f("CurrentDb.Name", "bestand"),
]);

export function afschermingsmelding(a: Afscherming) {
  return `${a.naam} is afgeschermd (${a.reden}) en wordt in Open Office Studio niet uitgevoerd. De VBA-code werkt alleen met de werkkopie van de database.`;
}

export function weiger(a: Afscherming): never {
  throw new VbaAfbreking("afgeschermd", afschermingsmelding(a));
}

export function weigerLid(object: string, lid: string): never {
  const a = GEWEIGERDE_LEDEN.get(`${object}.${lid}`.toLowerCase()) ?? {
    naam: `${object}.${lid}`,
    categorie: "bestand" as const,
    reden: REDENEN.bestand,
  };
  return weiger(a);
}

// ---------- statische scan ----------

export interface Bevinding {
  module: string;
  regel: number;
  kolom: number;
  naam: string;
  categorie: AfschermingCategorie;
}

function* expressies(e: Expr | null | undefined): Generator<Expr> {
  if (!e) return;
  yield e;
  switch (e.k) {
    case "lid":
    case "bang":
      yield* expressies(e.obj);
      break;
    case "aanroep":
      yield* expressies(e.doel);
      for (const a of e.args) yield* expressies(a.waarde);
      break;
    case "bin":
      yield* expressies(e.l);
      yield* expressies(e.r);
      break;
    case "un":
    case "haakjes":
      yield* expressies(e.e);
      break;
    case "typeof":
      yield* expressies(e.e);
      break;
  }
}

/** Alle statements, recursief door blokken heen. */
export function* statements(lijst: Statement[]): Generator<Statement> {
  for (const s of lijst) {
    yield s;
    switch (s.k) {
      case "if":
        for (const t of s.takken) yield* statements(t.body);
        if (s.anders) yield* statements(s.anders);
        break;
      case "select":
        for (const g of s.gevallen) yield* statements(g.body);
        if (s.anders) yield* statements(s.anders);
        break;
      case "for":
      case "foreach":
      case "do":
      case "with":
        yield* statements(s.body);
        break;
    }
  }
}

/** Alle expressies in een statement (niet recursief in blokken). */
export function* expressiesVan(s: Statement): Generator<Expr> {
  const args = (a: Argument[]) => a.map((x) => x.waarde);
  const lijst: (Expr | null | undefined)[] = [];
  switch (s.k) {
    case "let":
    case "set":
      lijst.push(s.doel, s.waarde);
      break;
    case "call":
      lijst.push(s.doel, ...args(s.args));
      break;
    case "print":
      lijst.push(...s.delen.map((d) => d.e));
      break;
    case "if":
      lijst.push(...s.takken.map((t) => t.voorwaarde));
      break;
    case "select":
      lijst.push(s.test, ...s.gevallen.flatMap((g) => g.tests.flatMap((t) => [t.van, t.tot])));
      break;
    case "for":
      lijst.push(s.teller, s.van, s.tot, s.stap);
      break;
    case "foreach":
      lijst.push(s.teller, s.reeks);
      break;
    case "do":
      lijst.push(s.voorTest?.e, s.naTest?.e);
      break;
    case "with":
      lijst.push(s.obj);
      break;
    case "error":
      lijst.push(s.nummer);
      break;
    case "redim":
      lijst.push(...s.variabelen.flatMap((v) => [v.doel, ...v.grenzen.flatMap((g) => [g.onder, g.boven])]));
      break;
    case "const":
      lijst.push(...s.constanten.map((c) => c.waarde));
      break;
  }
  for (const e of lijst) yield* expressies(e);
}

function kwalificatie(e: Expr): string | null {
  if (e.k === "id") return e.naam;
  if (e.k === "lid" && e.obj) {
    const o = kwalificatie(e.obj);
    return o ? `${o}.${e.naam}` : null;
  }
  if (e.k === "aanroep") return kwalificatie(e.doel);
  return null;
}

/** Zoekt afgeschermde constructies in een geparste module, zonder iets uit te voeren. */
export function scanAfscherming(m: ModuleAst): Bevinding[] {
  const uit: Bevinding[] = [];
  const voeg = (regel: number, kolom: number, naam: string, categorie: AfschermingCategorie) =>
    uit.push({ module: m.naam, regel, kolom, naam, categorie });
  for (const d of m.declares) voeg(d.regel, d.kolom, "Declare", "windows-api");
  const api = new Set(m.declares.map((d) => d.naam.toLowerCase()));
  for (const p of m.procedures)
    for (const s of statements(p.body)) {
      if (s.k === "geweigerd") voeg(s.regel, s.kolom, s.wat, "bestand");
      for (const e of expressiesVan(s)) {
        if (e.k === "addressof") voeg(e.regel, e.kolom, "AddressOf", "windows-api");
        if (e.k === "id") {
          const a = GEWEIGERDE_FUNCTIES.get(e.naam.toLowerCase());
          if (a) voeg(e.regel, e.kolom, a.naam, a.categorie);
          if (api.has(e.naam.toLowerCase())) voeg(e.regel, e.kolom, "Declare-aanroep", "windows-api");
        }
        if (e.k === "lid") {
          const q = kwalificatie(e);
          if (!q) continue;
          const delen = q.toLowerCase().split(".");
          const laatste2 = delen.slice(-2).join(".");
          const a =
            GEWEIGERDE_LEDEN.get(laatste2) ??
            (delen[0] === "vba" ? GEWEIGERDE_FUNCTIES.get(delen[1]) : undefined) ??
            (delen.length >= 2 && delen[delen.length - 1] === "path" && delen.includes("currentproject")
              ? GEWEIGERDE_LEDEN.get("currentproject.path")
              : undefined);
          if (a) voeg(e.regel, e.kolom, a.naam, a.categorie);
        }
      }
    }
  // Dubbele meldingen (zelfde plek) samenvoegen
  const gezien = new Set<string>();
  return uit.filter((b) => {
    const k = `${b.regel}:${b.kolom}:${b.naam}`;
    if (gezien.has(k)) return false;
    gezien.add(k);
    return true;
  });
}
