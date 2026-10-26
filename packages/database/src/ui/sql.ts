/** Kleine, pure hulpfuncties rond Access-SQL voor de interface (geen vertaling). */
import type { OpgeslagenQuery } from "../werkkopie/contract.ts";

/** Verwijdert commentaar en een voorafgaande `PARAMETERS …;`-declaratie. */
function kern(sql: string) {
  return sql
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/^PARAMETERS\b[^;]*;/i, "")
    .trim();
}

/** Bepaalt de querysoort zoals Access die zou opslaan. */
export function querysoortVan(sql: string): OpgeslagenQuery["soort"] {
  const k = kern(sql);
  const woord = /^\(*\s*([A-Za-z]+)/.exec(k)?.[1]?.toUpperCase() ?? "";
  switch (woord) {
    case "TRANSFORM":
      return "crosstab";
    case "DELETE":
      return "delete";
    case "UPDATE":
      return "update";
    case "INSERT":
      return "append";
    case "CREATE":
    case "DROP":
    case "ALTER":
      return "ddl";
    case "SELECT": {
      // SELECT … INTO tabel FROM … is een tabelmaakquery (buiten tekst en haken gezocht).
      const zonderTekst = k.replace(/"(?:[^"]|"")*"|'(?:[^']|'')*'|\[[^\]]*\]/g, " ");
      if (/^SELECT\b[\s\S]*?\bINTO\b[\s\S]*?\bFROM\b/i.test(zonderTekst))
        return "maketable";
      if (/\bUNION\b/i.test(zonderTekst)) return "union";
      return "select";
    }
    default:
      return "select";
  }
}

/** Wijzigt deze query gegevens of structuur (en vraagt dus om bevestiging)? */
export function isActiequery(soort: OpgeslagenQuery["soort"]) {
  return ["delete", "update", "append", "maketable", "ddl"].includes(soort);
}

export const ACTIENAMEN: Record<OpgeslagenQuery["soort"], string> = {
  select: "Selectiequery",
  crosstab: "Kruistabelquery",
  delete: "Verwijderquery",
  update: "Bijwerkquery",
  append: "Toevoegquery",
  maketable: "Tabelmaakquery",
  ddl: "Gegevensdefinitiequery",
  union: "Samenvoegingsquery",
  passthrough: "Pass-through-query",
};

/** Bestandsnaam zonder tekens die besturingssystemen weigeren. */
export function veiligeNaam(naam: string) {
  return naam.replace(/[\\/:*?"<>|~\u0000-\u001f]+/g, "_").trim() || "export";
}
