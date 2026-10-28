/**
 * Nederlandse invoer in een rekenblad. De rekenkern herkent alleen getallen
 * met een decimale punt; "1,5", "12,5%", "€ 1.234,50", "26-10-2026" en
 * "14:30" blijven anders tekst. Deze module zet zulke invoer om naar een
 * waarde die de kern wel begrijpt, met een passende getalnotatie.
 */
export interface NederlandseInvoer {
  /** Invoer zoals de rekenkern hem parseert. */
  invoer: string;
  /** Excel-notatiecode; ontbreekt als de bestaande notatie kan blijven. */
  notatie?: string;
}

const GETAL = /^([-+]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/;

function getal(tekst: string): number | null {
  const m = GETAL.exec(tekst);
  if (!m) return null;
  const waarde = Number(
    `${m[1]}${m[2].replaceAll(".", "")}${m[3] ? "." + m[3] : ""}`,
  );
  return Number.isFinite(waarde) ? waarde : null;
}

function decimalen(tekst: string) {
  return /,(\d+)/.exec(tekst)?.[1].length ?? 0;
}

/** Excel-datumgetal: dagen sinds 30-12-1899. */
export function datumgetal(jaar: number, maand: number, dag: number) {
  const datum = new Date(Date.UTC(jaar, maand - 1, dag));
  if (
    datum.getUTCFullYear() !== jaar ||
    datum.getUTCMonth() !== maand - 1 ||
    datum.getUTCDate() !== dag
  )
    return null;
  return (datum.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
}

export function leesNederlands(ruw: string): NederlandseInvoer | null {
  const tekst = ruw.trim();
  if (!tekst || tekst.startsWith("=")) return null;

  // Zonder komma of duizendtalpunten herkent de kern het getal zelf.
  if (/^[-+]?\d+$/.test(tekst) || /^[-+]?\d*\.\d+$/.test(tekst)) {
    if (!/^[-+]?\d{1,3}(\.\d{3})+$/.test(tekst)) return null;
  }
  const kaal = getal(tekst);
  if (kaal !== null) return { invoer: String(kaal) };

  const procent = /^(.+?)\s?%$/.exec(tekst);
  if (procent) {
    const waarde = getal(procent[1]);
    if (waarde === null) return null;
    const n = decimalen(procent[1]);
    return {
      invoer: String(waarde / 100),
      notatie: n ? `0.${"0".repeat(n)}%` : "0%",
    };
  }

  const valuta = /^(?:€\s?(.+)|(.+?)\s?€)$/.exec(tekst);
  if (valuta) {
    const waarde = getal(valuta[1] ?? valuta[2]);
    if (waarde === null) return null;
    return { invoer: String(waarde), notatie: '"€ "#,##0.00' };
  }

  const datum = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})$/.exec(tekst);
  if (datum) {
    let jaar = Number(datum[3]);
    // Twee cijfers: tot en met 29 is 20xx, zoals gangbare kantoorsuites.
    if (datum[3].length === 2) jaar += jaar < 30 ? 2000 : 1900;
    const serie = datumgetal(jaar, Number(datum[2]), Number(datum[1]));
    return serie === null
      ? null
      : { invoer: String(serie), notatie: "d-m-yyyy" };
  }

  const tijd = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(tekst);
  if (tijd) {
    const [u, m, s] = [Number(tijd[1]), Number(tijd[2]), Number(tijd[3] ?? 0)];
    if (u > 23 || m > 59 || s > 59) return null;
    return {
      invoer: String((u * 3600 + m * 60 + s) / 86400),
      notatie: tijd[3] ? "h:mm:ss" : "h:mm",
    };
  }
  return null;
}
