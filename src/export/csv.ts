/** Minimale vorm van een geëxporteerde cel (XlsxExportCell) die de CSV-export nodig heeft. */
export interface CsvCel {
  anchor: { a1?: string };
  value:
    | { kind: "empty" }
    | { kind: "number"; value: number }
    | { kind: "text"; value: string }
    | { kind: "bool"; value: boolean }
    | { kind: "error"; value: unknown }
    | { kind: "unavailable"; reason: string };
  displayText: string;
  numberFormat: string;
}

export type Scheidingsteken = ";" | "," | "tab" | "|";
export type Codering = "utf8" | "utf8-bom" | "windows-1252";

export interface CsvOpties {
  /** Standaard puntkomma (Nederlandse instellingen). */
  scheidingsteken?: Scheidingsteken;
  /** Standaard UTF-8 met BOM, zodat Excel de tekens juist leest. */
  codering?: Codering;
}

/** Kolomletters + rijnummer naar 0-gebaseerde rij en kolom. */
export function celPositie(a1: string) {
  const delen = /^([A-Z]+)(\d+)$/.exec(a1.replace(/\$/g, "").toUpperCase());
  if (!delen) return null;
  let kolom = 0;
  for (const letter of delen[1]) kolom = kolom * 26 + letter.charCodeAt(0) - 64;
  return { rij: Number(delen[2]) - 1, kolom: kolom - 1 };
}

/** Een getalnotatie voor datum of tijd: dan de weergegeven tekst gebruiken. */
function isDatumnotatie(notatie: string) {
  const zonderTekst = notatie.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "");
  return /[dmyhsjuDMYHSJU]/.test(zonderTekst) && !/^general$/i.test(notatie);
}

/**
 * Tekst die een rekenprogramma als formule zou uitvoeren wordt met een apostrof
 * onschadelijk gemaakt (CSV-injectie), net als in Database Studio.
 */
export function neutraliseer(tekst: string) {
  return /^[=+\-@\t\r\n]/.test(tekst) ? "'" + tekst : tekst;
}

function veld(tekst: string, scheiding: string) {
  return tekst.includes(scheiding) || /["\r\n]/.test(tekst)
    ? '"' + tekst.replaceAll('"', '""') + '"'
    : tekst;
}

function celTekst(cel: CsvCel, decimaalkomma: boolean) {
  const waarde = cel.value;
  switch (waarde.kind) {
    case "empty":
      return "";
    case "number":
      if (isDatumnotatie(cel.numberFormat) || !Number.isFinite(waarde.value))
        return neutraliseer(cel.displayText);
      return decimaalkomma
        ? String(waarde.value).replace(".", ",")
        : String(waarde.value);
    case "bool":
      return decimaalkomma
        ? waarde.value
          ? "WAAR"
          : "ONWAAR"
        : waarde.value
          ? "TRUE"
          : "FALSE";
    case "text":
      return neutraliseer(waarde.value);
    default:
      return neutraliseer(cel.displayText);
  }
}

/** Zet de cellen van één blad om naar CSV-tekst (CRLF-regels). */
export function cellenNaarCsv(
  cellen: readonly CsvCel[],
  opties: CsvOpties = {},
) {
  const scheiding =
    opties.scheidingsteken === "tab" ? "\t" : (opties.scheidingsteken ?? ";");
  // Bij een puntkomma of tab gaan we uit van Nederlandse instellingen: decimale komma.
  const decimaalkomma = scheiding !== ",";
  const raster: string[][] = [];
  let kolommen = 0;
  for (const cel of cellen) {
    const positie = cel.anchor.a1 ? celPositie(cel.anchor.a1) : null;
    if (!positie) continue;
    const tekst = celTekst(cel, decimaalkomma);
    if (!tekst) continue;
    (raster[positie.rij] ??= [])[positie.kolom] = veld(tekst, scheiding);
    kolommen = Math.max(kolommen, positie.kolom + 1);
  }
  const regels: string[] = [];
  for (let rij = 0; rij < raster.length; rij++) {
    const cellenRij = raster[rij] ?? [];
    regels.push(
      Array.from({ length: kolommen }, (_, k) => cellenRij[k] ?? "").join(
        scheiding,
      ),
    );
  }
  return regels.length ? regels.join("\r\n") + "\r\n" : "";
}

const CP1252: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/** Codeert tekst; Windows-1252 vervangt onbekende tekens door '?' en meldt dat. */
export function codeer(tekst: string, codering: Codering = "utf8-bom") {
  if (codering !== "windows-1252") {
    const bytes = new TextEncoder().encode(tekst);
    if (codering === "utf8") return { bytes, vervangen: 0 };
    const metBom = new Uint8Array(bytes.length + 3);
    metBom.set([0xef, 0xbb, 0xbf]);
    metBom.set(bytes, 3);
    return { bytes: metBom, vervangen: 0 };
  }
  const uit: number[] = [];
  let vervangen = 0;
  for (const teken of tekst) {
    const code = teken.codePointAt(0)!;
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) uit.push(code);
    else if (CP1252[code]) uit.push(CP1252[code]);
    else {
      uit.push(0x3f);
      vervangen++;
    }
  }
  return { bytes: new Uint8Array(uit), vervangen };
}
