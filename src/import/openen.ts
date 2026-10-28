/**
 * De openroute: bepaalt per bestand hoe het in een editor terechtkomt
 * (rechtstreeks, eigen omzetting of kantoorruntime) en welk rapport erbij
 * hoort. De UI geeft alleen de vragen (wachtwoord, CSV-instellingen) mee.
 */
import type { Soort } from "../editors";
import { bestandssoort, bestandstypen } from "../formaten";
import { controleerPakket } from "../pakketcontrole";
import { openRapport, type Rapport } from "./rapport";

export interface Openhulp {
  /** Omzetting via de kantoorruntime (desktop); gooit een fout zonder runtime. */
  converteer: (
    bytes: Uint8Array,
    van: string,
    naar: string,
    soort: Soort,
  ) => Promise<Uint8Array>;
}

export interface Openresultaat {
  soort: Soort;
  /** Naam van het tabblad, met de extensie van het formaat in de editor. */
  naam: string;
  bytes: Uint8Array;
  /** Een kopie die nog niet in het eigen formaat bewaard is. */
  gewijzigd: boolean;
  rapport: Rapport | null;
  /** Voorstel voor Ctrl+S als dat afwijkt van het eigen formaat. */
  exportFormaat?: string;
}

export function extensieVan(naam: string) {
  return naam.split(".").pop()?.toLowerCase() ?? "";
}

function metExtensie(naam: string, ext: string) {
  return naam.replace(/\.[^.]+$/, "") + "." + ext;
}

/** Bereidt het openen voor; null betekent dat de gebruiker heeft geannuleerd. */
export async function bereidOpenen(
  naam: string,
  bytes: Uint8Array,
  hulp: Openhulp,
): Promise<Openresultaat | null> {
  const ext = extensieVan(naam);
  const soort = bestandssoort(ext);
  if (!soort) throw new Error("Dit bestandsformaat wordt nog niet ondersteund.");

  if (ext === soort) {
    const controle = controleerPakket(bytes, soort);
    if (!controle.strict)
      return {
        soort,
        naam,
        bytes,
        gewijzigd: false,
        rapport: openRapport({
          soort,
          risicos: controle.risicos,
          macros: controle.macros,
          route: "engine",
          bronformaat: ext,
        }),
      };
  }

  // Overige formaten (en Strict-XLSX) via de kantoorruntime.
  let risicos: ReturnType<typeof controleerPakket>["risicos"] = [];
  let macros = false;
  try {
    const controle = controleerPakket(bytes, soort);
    risicos = controle.risicos;
    macros = controle.macros;
  } catch {
    // Geen OOXML-pakket: niets te meten vóór de omzetting.
  }
  const omgezet = await hulp.converteer(bytes, ext, soort, soort);
  controleerPakket(omgezet, soort);
  return {
    soort,
    naam: metExtensie(naam, soort),
    bytes: omgezet,
    gewijzigd: true,
    rapport: openRapport({
      soort,
      risicos,
      macros,
      route: "conversie",
      bronformaat: ext,
    }),
    exportFormaat: Object.hasOwn(bestandstypen[soort].uitvoer, ext)
      ? ext
      : undefined,
  };
}
