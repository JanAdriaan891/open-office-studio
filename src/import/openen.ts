/**
 * De openroute: bepaalt per bestand hoe het in een editor terechtkomt
 * (rechtstreeks, eigen omzetting of kantoorruntime) en welk rapport erbij
 * hoort. De UI geeft alleen de vragen (wachtwoord, CSV-instellingen) mee.
 */
import type { Soort } from "../editors";
import {
  bestandssoort,
  bestandstypen,
  kiesRoute,
  uitvoerformaat,
} from "../formaten";
import { LIEVER_RUNTIME, TEKSTFORMATEN, zetTekstOm } from "./tekstimport";
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
  /** Is de kantoorruntime beschikbaar? Standaard: nee. */
  runtimeBeschikbaar?: () => Promise<boolean>;
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
  if (!soort)
    throw new Error("Dit bestandsformaat wordt nog niet ondersteund.");

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

  const runtime =
    (await hulp.runtimeBeschikbaar?.().catch(() => false)) ?? false;
  /** Voorstel voor Ctrl+S: het bronformaat als de app dat nu kan maken. */
  const voorstel = (doel: string) => {
    const formaat = uitvoerformaat(soort, doel);
    return formaat && kiesRoute(formaat, runtime) ? doel : undefined;
  };

  // Eenvoudige tekstformaten zet de app zelf om; RTF en HTML liever via de
  // runtime als die er is, met de eigen lezer als terugval.
  if (soort === "docx" && TEKSTFORMATEN.has(ext)) {
    let fout: unknown = null;
    if (runtime && LIEVER_RUNTIME.has(ext)) {
      try {
        return await viaRuntime();
      } catch (e) {
        fout = e;
      }
    }
    const { bytes: docx, regels } = zetTekstOm(ext, bytes);
    if (fout)
      regels.unshift({
        onderdeel: "Kantoorruntime",
        gevolg: `Omzetten via de runtime mislukte (${String(fout)}); de eigen lezer is gebruikt.`,
      });
    return {
      soort,
      naam: metExtensie(naam, soort),
      bytes: docx,
      gewijzigd: true,
      rapport: openRapport({
        soort,
        risicos: [],
        route: "import",
        bronformaat: ext,
        extra: regels,
      }),
      exportFormaat: voorstel(
        ext === "markdown" ? "md" : ext === "htm" ? "html" : ext,
      ),
    };
  }

  return viaRuntime();

  // Overige formaten (en Strict-XLSX) via de kantoorruntime.
  async function viaRuntime(): Promise<Openresultaat> {
    if (!soort) throw new Error("Onbekende module.");
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
}
