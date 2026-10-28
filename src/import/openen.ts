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
import {
  csvNaarXlsx,
  herkenInstellingen,
  scheidingsnaam,
  type CsvInstellingen,
} from "./csvimport";
import type { Rapportregel } from "./rapport";
import { controleerPakket } from "../pakketcontrole";
import { MACROS, openRapport, type Rapport } from "./rapport";
import { MACRO_INVOER, MACROFORMAAT, scheidMacros } from "./macros";
import type { Bronkenmerken } from "./bron";
import {
  VerkeerdWachtwoord,
  herkenVersleuteling,
  ontsleutel,
  versleutelingsMelding,
} from "./versleuteling";

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
  /** Importvenster voor CSV/TSV; null = geannuleerd. Zonder: herkende instellingen. */
  vraagCsv?: (
    naam: string,
    bytes: Uint8Array,
    ext: string,
  ) => Promise<CsvInstellingen | null>;
  /** Wachtwoordvenster; null = geannuleerd. `fout` na een onjuist wachtwoord. */
  vraagWachtwoord?: (naam: string, fout?: string) => Promise<string | null>;
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
  /** Kenmerken van het origineel (versleuteling, macro’s). */
  bron?: Bronkenmerken;
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
  const versleuteling = herkenVersleuteling(bytes);
  if (!versleuteling) return bereidOnversleuteld(naam, bytes, hulp, []);
  if (versleuteling.soort !== "agile" && versleuteling.soort !== "standard")
    throw new Error(versleutelingsMelding(versleuteling));
  if (!hulp.vraagWachtwoord)
    throw new Error("Dit bestand is met een wachtwoord versleuteld.");
  let fout: string | undefined;
  let ontsleuteld: Uint8Array;
  for (;;) {
    const wachtwoord = await hulp.vraagWachtwoord(naam, fout);
    if (wachtwoord === null) return null;
    try {
      ontsleuteld = await ontsleutel(versleuteling, wachtwoord);
      break;
    } catch (e) {
      if (!(e instanceof VerkeerdWachtwoord)) throw e;
      fout = "Onjuist wachtwoord. Probeer het opnieuw.";
    }
  }
  const resultaat = await bereidOnversleuteld(naam, ontsleuteld, hulp, [
    {
      onderdeel: "Wachtwoordbeveiliging",
      info: true,
      gevolg: `Het bestand is ontsleuteld (${versleuteling.soort === "agile" ? "ECMA-376 Agile" : "ECMA-376 Standard"}). Het wachtwoord is niet bewaard; kies bij Opslaan als opnieuw een wachtwoord om de kopie te beveiligen.`,
    },
  ]);
  if (resultaat)
    resultaat.bron = { ...resultaat.bron, versleuteling: versleuteling.soort };
  return resultaat;
}

async function bereidOnversleuteld(
  naam: string,
  bytes: Uint8Array,
  hulp: Openhulp,
  bronregels: Rapportregel[],
): Promise<Openresultaat | null> {
  // Wordt aangevuld (bijv. datumsysteem 1904); de parameter zelf blijft ongewijzigd.
  bronregels = [...bronregels];
  const ext = extensieVan(naam);
  const soort = bestandssoort(ext);
  if (!soort)
    throw new Error("Dit bestandsformaat wordt nog niet ondersteund.");

  if (ext === soort) {
    const controle = controleerPakket(bytes, soort);
    if (controle.datum1904) bronregels = [...bronregels, DATUM1904];
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
          extra: bronregels,
        }),
      };
  }

  // Macrobestanden: VBA-project apart houden, het document in de editor.
  if (MACRO_INVOER.has(ext)) {
    controleerPakket(bytes, soort);
    const { bytes: zonder, macros } = await scheidMacros(bytes, soort, ext);
    const controle = controleerPakket(zonder, soort);
    if (!controle.strict) {
      const doel = MACROFORMAAT[soort];
      const modules = macros.modules.length
        ? ` (${macros.modules.length} module${macros.modules.length === 1 ? "" : "s"}: ${macros.modules.slice(0, 8).join(", ")}${macros.modules.length > 8 ? ", …" : ""})`
        : "";
      const regels: Rapportregel[] = macros.heeftVba
        ? [
            {
              onderdeel: MACROS,
              gevolg:
                `Het VBA-project${modules} wordt nooit uitgevoerd en blijft byte-voor-byte behouden bij opslaan als .${doel}.` +
                (macros.ondertekend
                  ? " De digitale handtekening van het project gaat ongewijzigd mee."
                  : "") +
                ` Opslaan als .${soort} verwijdert de macro’s (met een melding vooraf).`,
            },
          ]
        : [
            {
              onderdeel: "Macroformaat",
              gevolg: `Dit .${ext}-bestand bevat geen VBA-project; het blijft een .${doel} bij opslaan.`,
              info: true,
            },
          ];
      return {
        soort,
        naam: ext === doel ? naam : metExtensie(naam, doel),
        bytes: zonder,
        gewijzigd: ext !== doel,
        rapport: openRapport({
          soort,
          risicos: controle.risicos,
          route: "engine",
          bronformaat: ext,
          extra: [...bronregels, ...regels],
        }),
        exportFormaat: doel,
        bron: { macro: macros },
      };
    }
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
        extra: [...bronregels, ...regels],
      }),
      exportFormaat: voorstel(
        ext === "markdown" ? "md" : ext === "htm" ? "html" : ext,
      ),
    };
  }

  // CSV en TSV: altijd zelf, met het importvenster.
  if (soort === "xlsx" && (ext === "csv" || ext === "tsv" || ext === "tab")) {
    const instellingen = hulp.vraagCsv
      ? await hulp.vraagCsv(naam, bytes, ext)
      : herkenInstellingen(bytes, ext);
    if (!instellingen) return null;
    const bladnaam = naam.replace(/\.[^.]+$/, "");
    const resultaat = csvNaarXlsx(bytes, instellingen, bladnaam);
    const regels: Rapportregel[] = [
      {
        onderdeel: "Import",
        gevolg: `${resultaat.rijen} rij(en) en ${resultaat.kolommen} kolom(men) ingelezen; ${scheidingsnaam(resultaat.scheidingsteken)} als scheidingsteken, codering ${resultaat.codering}.`,
        info: true,
      },
    ];
    if (resultaat.formuleachtig)
      regels.push({
        onderdeel: "Formuleachtige tekst",
        gevolg: `${resultaat.formuleachtig} cel(len) die met =, +, - of @ beginnen zijn als tekst opgenomen, niet als formule (bescherming tegen CSV-injectie).`,
      });
    if (resultaat.afgekapt)
      regels.push({
        onderdeel: "Afgekapt",
        gevolg:
          "Het bestand is groter dan een werkblad (1.048.576 rijen of 16.384 kolommen); de rest is niet ingelezen.",
      });
    return {
      soort,
      naam: metExtensie(naam, soort),
      bytes: resultaat.xlsx,
      gewijzigd: true,
      rapport: openRapport({
        soort,
        risicos: [],
        route: "import",
        bronformaat: ext,
        extra: [...bronregels, ...regels],
      }),
      exportFormaat: voorstel(ext === "tab" ? "tsv" : ext),
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
    if (controleerPakket(omgezet, soort).datum1904)
      bronregels = [...bronregels, DATUM1904];
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
        extra: bronregels,
      }),
      // Oude binaire formaten (DOC, XLS, PPT, …): standaardvoorstel is het
      // eigen formaat; opslaan als het oude formaat kan, met een waarschuwing.
      exportFormaat:
        Object.hasOwn(bestandstypen[soort].uitvoer, ext) && !OUD_BINAIR.has(ext)
          ? ext
          : undefined,
    };
  }
}

/** Binaire Office 97–2003-formaten (en hun sjablonen en diavoorstellingen). */
export const OUD_BINAIR = new Set([
  "doc",
  "dot",
  "xls",
  "xlt",
  "xlsb",
  "ppt",
  "pps",
  "pot",
]);

const DATUM1904: Rapportregel = {
  onderdeel: "Datumsysteem 1904",
  gevolg:
    "Het werkboek telt datums vanaf 1 januari 1904 (zoals oudere Mac-Excel). Datums worden juist getoond en het datumsysteem blijft bij opslaan behouden; kopieer je datums naar een werkboek met het systeem 1900, dan verschuiven ze 1462 dagen.",
  info: true,
};
