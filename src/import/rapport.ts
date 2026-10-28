/**
 * Eén consistent rapport over onvolledige ondersteuning, bij openen en bij
 * opslaan. Het rapport is niet-blokkerend bij openen en staat vóór opslaan
 * in het venster Opslaan als. Het is te kopiëren of als tekst te bewaren,
 * zodat het bij een foutmelding kan worden gevoegd.
 */
import type { Soort } from "../editors";
import type { Uitvoerformaat } from "../formaten";
import {
  MATRIXVERLIES,
  risiconaam,
  type Opslagroute,
  type Risico,
} from "../pakketcontrole";

export interface Rapportregel {
  /** Wat het betreft, bijvoorbeeld "Ingebedde objecten". */
  onderdeel: string;
  /** Wat de app ermee doet of wat er verloren gaat. */
  gevolg: string;
  /** Alleen ter informatie (bijv. herkende codering); niet in de kopregel. */
  info?: boolean;
}

export interface Rapport {
  moment: "openen" | "opslaan";
  /** Korte zin voor de meldingsbalk. */
  kop: string;
  regels: Rapportregel[];
}

const MODULENAAM: Record<Soort, string> = {
  docx: "de teksteditor",
  xlsx: "het rekenblad",
  pptx: "de presentatie-editor",
};

function hoofdletter(tekst: string) {
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

/**
 * Wat de editor doet met kenmerken die hij maar beperkt ondersteunt, als het
 * eigen formaat rechtstreeks wordt geopend. Alleen wat echt beperkt is staat
 * hier; gewone onderdelen zoals revisies of notities melden we niet.
 */
function bijOpenen(risico: Risico, soort: Soort): string | null {
  // Bij DOCX en PPTX is het behoud via de engine in de testmatrix gemeten.
  const behoud =
    soort === "xlsx"
      ? "Behoud bij opslaan is voor rekenbladen nog niet gemeten; bewaar het origineel."
      : "Ze blijven bij opslaan als ." + soort + " behouden.";
  switch (risico) {
    case "ingebedde_objecten":
      return `Worden alleen als voorbeeldafbeelding getoond en kunnen hier niet worden bewerkt. ${behoud}`;
    case "grafieken":
      return `Worden getoond zoals ${MODULENAAM[soort]} ze kan tekenen; onbekende grafiektypen of opmaak kunnen afwijken. ${behoud}`;
    case "onbekende_onderdelen":
    case "onbekende_extensies":
      return `Worden niet getoond of bewerkt. ${behoud}`;
    case "custom_xml":
      return `Worden niet getoond; gekoppelde inhoudsbesturingselementen worden niet bijgewerkt. ${behoud}`;
    case "besturingselementen":
      return `Worden niet uitgevoerd en kunnen niet worden bediend. ${behoud}`;
    case "handtekening":
      return "Wordt niet gecontroleerd. Na wijzigen en opslaan is de handtekening niet meer geldig.";
    case "draaitabellen":
      return "Worden als gewone cellen getoond en niet vernieuwd.";
    case "slicers":
      return "Worden niet getoond en filteren niet.";
    case "externe_koppelingen":
      return "Worden niet bijgewerkt; de laatst opgeslagen waarden blijven staan.";
    case "gegevensverbindingen":
      return "Worden nooit uitgevoerd of vernieuwd.";
    default:
      return null;
  }
}

export interface OpenKenmerken {
  soort: Soort;
  risicos: readonly Risico[];
  macros?: boolean;
  /**
   * `engine`: eigen formaat rechtstreeks in de editor; `conversie`: via de
   * kantoorruntime omgezet; `import`: door de app zelf omgezet (tekst, CSV).
   */
  route: "engine" | "conversie" | "import";
  /** Extensie van het geopende bestand. */
  bronformaat: string;
  /** Aanvullende regels van een eigen omzetting of van de macro-afhandeling. */
  extra?: readonly Rapportregel[];
}

/** Het rapport na openen, of null als alles volledig wordt ondersteund. */
export function openRapport(kenmerken: OpenKenmerken): Rapport | null {
  const { soort, route } = kenmerken;
  const regels: Rapportregel[] = [];
  if (route === "conversie") {
    regels.push({
      onderdeel: "Omzetting",
      gevolg: `Het .${kenmerken.bronformaat}-bestand is via de kantoorruntime omgezet naar een bewerkbare .${soort}-kopie. Het origineel is niet gewijzigd. Opmaak kan afwijken; macro’s en actieve inhoud zijn niet uitgevoerd en worden niet overgenomen.`,
    });
    const verlies = kenmerken.risicos.filter((r) =>
      MATRIXVERLIES[soort].conversie.includes(r),
    );
    if (verlies.length)
      regels.push({
        onderdeel: hoofdletter(verlies.map(risiconaam).join(", ")),
        gevolg:
          "Aanwezig in het origineel; die gaan bij omzetten verloren (aangetoond in de testmatrix).",
      });
  } else if (route === "engine") {
    for (const risico of kenmerken.risicos) {
      const gevolg = bijOpenen(risico, soort);
      if (gevolg)
        regels.push({ onderdeel: hoofdletter(risiconaam(risico)), gevolg });
    }
  }
  regels.push(...(kenmerken.extra ?? []));
  if (kenmerken.macros && !regels.some((r) => r.onderdeel === MACROS))
    regels.push({
      onderdeel: MACROS,
      gevolg:
        route === "engine"
          ? "Worden nooit uitgevoerd."
          : "Worden nooit uitgevoerd en niet overgenomen in deze kopie. Bewaar het origineel.",
    });
  if (!regels.length) return null;
  const namen = regels
    .filter((r) => r.onderdeel !== "Omzetting" && !r.info)
    .map((r) => r.onderdeel.toLowerCase());
  const kop =
    route === "conversie"
      ? "Geïmporteerd als bewerkbare kopie; het origineel is behouden." +
        (namen.length ? ` Let op: ${namen.join(", ")}.` : "")
      : route === "import"
        ? `Omgezet naar een bewerkbare .${soort}-kopie; het origineel is behouden.` +
          (namen.length ? ` Let op: ${namen.join(", ")}.` : "")
        : `Niet alles wordt volledig ondersteund: ${namen.join(", ")}.`;
  return { moment: "openen", kop, regels };
}

export const MACROS = "VBA-macro’s";

const BEWERKBAAR = new Set([
  "eigen",
  "opendocument",
  "office-oud",
  "sjablonen",
]);

/** Formaten die macro’s kunnen bevatten. */
export const MACROFORMATEN = new Set([
  "docm",
  "dotm",
  "xlsm",
  "xltm",
  "pptm",
  "potm",
  "ppsm",
]);

export interface OpslaanKenmerken {
  soort: Soort;
  formaat: Uitvoerformaat;
  /** De route waarlangs het formaat gemaakt wordt; null: niet beschikbaar. */
  route: "engine" | "runtime" | "afdrukken" | "tekst" | "html" | null;
  risicos: readonly Risico[];
  macros?: boolean;
  /** Was het origineel versleuteld en wordt nu onversleuteld opgeslagen? */
  wordtOnversleuteld?: boolean;
  matrix?: typeof MATRIXVERLIES;
}

/**
 * Wat er bij opslaan in dit formaat verloren gaat of niet gegarandeerd is.
 * Het eigen formaat via de engine levert alleen een regel op als de matrix
 * verlies aantoont (dan blokkeert `risicoBeleid` opslaan) of bij macro’s.
 */
export function opslagRapport(kenmerken: OpslaanKenmerken): Rapport | null {
  const { soort, formaat, route, risicos } = kenmerken;
  const matrix = kenmerken.matrix ?? MATRIXVERLIES;
  if (!route) return null;
  const regels: Rapportregel[] = [];
  const eigen = formaat.ext === soort;
  const macroformaat = MACROFORMATEN.has(formaat.ext);
  if (kenmerken.macros && !macroformaat && route !== "afdrukken")
    regels.push({
      onderdeel: MACROS,
      gevolg: `.${formaat.ext} kan geen macro’s bevatten; het VBA-project wordt niet bewaard. Kies een macro-ingeschakeld formaat om het te behouden.`,
    });
  if (kenmerken.wordtOnversleuteld)
    regels.push({
      onderdeel: "Wachtwoordbeveiliging",
      gevolg:
        "Het origineel was met een wachtwoord versleuteld; deze kopie wordt zonder wachtwoord bewaard en is voor iedereen leesbaar.",
    });
  const opgeslagenRoute: Opslagroute | null =
    eigen || macroformaat
      ? "engine"
      : route === "runtime" && BEWERKBAAR.has(formaat.groep)
        ? "conversie"
        : null;
  if (opgeslagenRoute) {
    const verlies = risicos.filter((r) =>
      matrix[soort][opgeslagenRoute].includes(r),
    );
    if (verlies.length)
      regels.push({
        onderdeel: hoofdletter(verlies.map(risiconaam).join(", ")),
        gevolg:
          opgeslagenRoute === "engine"
            ? "De editor behoudt deze bij opslaan niet (aangetoond in de testmatrix); opslaan wordt geweigerd."
            : "Gaan bij omzetten verloren (aangetoond in de testmatrix). Het origineel blijft ongewijzigd.",
      });
    if (opgeslagenRoute === "conversie") {
      // Wat de matrix voor deze module niet heeft gemeten, noemen we eerlijk ongemeten.
      const ongemeten = risicos.filter(
        (r) => !matrix[soort].conversie.includes(r) && r !== "handtekening",
      );
      if (soort === "xlsx" && ongemeten.length)
        regels.push({
          onderdeel: hoofdletter(ongemeten.map(risiconaam).join(", ")),
          gevolg:
            "Behoud bij omzetten via de kantoorruntime is niet gemeten; controleer de kopie.",
        });
    }
    if (risicos.includes("handtekening") && (!eigen || route !== "engine"))
      regels.push({
        onderdeel: "Digitale handtekening",
        gevolg: "Wordt niet overgenomen of is na opslaan niet meer geldig.",
      });
  } else if (
    route === "tekst" ||
    route === "html" ||
    formaat.groep === "web-tekst"
  ) {
    regels.push({
      onderdeel: `Formaat .${formaat.ext}`,
      gevolg: hoofdletter(formaat.behoud) + ".",
    });
    const weg = risicos.filter((r) => r !== "onbekende_extensies");
    if (weg.length)
      regels.push({
        onderdeel: hoofdletter(weg.map(risiconaam).join(", ")),
        gevolg:
          "Aanwezig in het document; die komen niet of alleen als tekst in dit formaat.",
      });
  }
  if (!regels.length) return null;
  return {
    moment: "opslaan",
    kop: `Bij opslaan als .${formaat.ext}: ${regels.map((r) => r.onderdeel.toLowerCase()).join(", ")}.`,
    regels,
  };
}

/** Platte tekst om te kopiëren of bij een foutmelding te voegen. */
export function rapportTekst(
  rapport: Rapport,
  bestandsnaam: string,
  versie = "",
  datum = new Date(),
) {
  const regels = [
    `OpenAEC Office Studio${versie ? " " + versie : ""} — rapport bij ${rapport.moment}`,
    `Bestand: ${bestandsnaam}`,
    `Datum: ${datum.toISOString().slice(0, 19).replace("T", " ")} (UTC)`,
    "",
    rapport.kop,
    "",
    ...rapport.regels.map((r) => `- ${r.onderdeel}: ${r.gevolg}`),
  ];
  return regels.join("\n") + "\n";
}
