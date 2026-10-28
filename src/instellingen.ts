/**
 * Voorkeuren van de gebruiker (instellingenvenster, #23). In de browser in
 * localStorage, in de desktopapp daarnaast als bestand via een Rust-command
 * (`lees_voorkeuren`/`bewaar_voorkeuren`); het bestand is daar leidend.
 * Het herstelinterval staat bij automatisch herstel (src/herstel.ts).
 */
import { useSyncExternalStore } from "react";

export type Thema = "light" | "forge" | "systeem";
export type DocumentSoort = "docx" | "xlsx" | "pptx";

export interface Instellingen {
  thema: Thema;
  /** Standaardformaat voor nieuwe documenten: OOXML of ODF. */
  opslagformaat: { docx: "docx" | "odt"; xlsx: "xlsx" | "ods"; pptx: "pptx" | "odp" };
  lint: { compact: boolean; ingeklapt: boolean };
  statusbalk: {
    zoom: boolean;
    tekst: boolean;
    rekenblad: boolean;
    presentatie: boolean;
    database: boolean;
  };
  /** E-mail: externe afbeeldingen volgens het account, of nooit automatisch. */
  emailExterneInhoud: "account" | "nooit";
  /** Tekst: sneltoetsprofiel (LibreOffice-achtig of Word) en de mini-werkbalk bij selectie. */
  tekst: { sneltoetsprofiel: "standaard" | "word"; miniWerkbalk: boolean };
}

export const standaardInstellingen: Instellingen = {
  thema: "forge",
  opslagformaat: { docx: "docx", xlsx: "xlsx", pptx: "pptx" },
  lint: { compact: false, ingeklapt: false },
  statusbalk: { zoom: true, tekst: true, rekenblad: true, presentatie: true, database: true },
  emailExterneInhoud: "account",
  tekst: { sneltoetsprofiel: "standaard", miniWerkbalk: true },
};

const SLEUTEL = "openaec-office-instellingen";
/** Oudere themakeuze uit de kopbalk (src/stijl/ThemaKnop.tsx). */
const OUDE_THEMA = "openaec-office-thema";

const isObject = (waarde: unknown): waarde is Record<string, unknown> =>
  !!waarde && typeof waarde === "object" && !Array.isArray(waarde);
const kies = <T extends string>(waarde: unknown, opties: readonly T[], standaard: T): T =>
  opties.includes(waarde as T) ? (waarde as T) : standaard;
const waarOnwaar = (waarde: unknown, standaard: boolean) =>
  typeof waarde === "boolean" ? waarde : standaard;

/** Maakt van willekeurige (oude of beschadigde) gegevens geldige instellingen. */
export function normaliseerInstellingen(ruw: unknown): Instellingen {
  const s = standaardInstellingen;
  const r = isObject(ruw) ? ruw : {};
  const formaat = isObject(r.opslagformaat) ? r.opslagformaat : {};
  const lint = isObject(r.lint) ? r.lint : {};
  const status = isObject(r.statusbalk) ? r.statusbalk : {};
  const tekst = isObject(r.tekst) ? r.tekst : {};
  return {
    thema: kies(r.thema, ["light", "forge", "systeem"] as const, s.thema),
    opslagformaat: {
      docx: kies(formaat.docx, ["docx", "odt"] as const, "docx"),
      xlsx: kies(formaat.xlsx, ["xlsx", "ods"] as const, "xlsx"),
      pptx: kies(formaat.pptx, ["pptx", "odp"] as const, "pptx"),
    },
    lint: {
      compact: waarOnwaar(lint.compact, s.lint.compact),
      ingeklapt: waarOnwaar(lint.ingeklapt, s.lint.ingeklapt),
    },
    statusbalk: {
      zoom: waarOnwaar(status.zoom, true),
      tekst: waarOnwaar(status.tekst, true),
      rekenblad: waarOnwaar(status.rekenblad, true),
      presentatie: waarOnwaar(status.presentatie, true),
      database: waarOnwaar(status.database, true),
    },
    emailExterneInhoud: kies(r.emailExterneInhoud, ["account", "nooit"] as const, "account"),
    tekst: {
      sneltoetsprofiel: kies(tekst.sneltoetsprofiel, ["standaard", "word"] as const, "standaard"),
      miniWerkbalk: waarOnwaar(tekst.miniWerkbalk, s.tekst.miniWerkbalk),
    },
  };
}

type Wijziging = {
  [K in keyof Instellingen]?: Instellingen[K] extends object ? Partial<Instellingen[K]> : Instellingen[K];
};

/** Past een gedeeltelijke wijziging toe; geneste groepen worden samengevoegd. */
export function pasToe(huidig: Instellingen, wijziging: Wijziging): Instellingen {
  const volgende: Record<string, unknown> = { ...huidig };
  for (const [sleutel, waarde] of Object.entries(wijziging))
    volgende[sleutel] = isObject(waarde)
      ? { ...(huidig[sleutel as keyof Instellingen] as object), ...waarde }
      : waarde;
  return normaliseerInstellingen(volgende);
}

const desktop = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function leesLokaal(): Instellingen {
  try {
    const opgeslagen = localStorage.getItem(SLEUTEL);
    if (opgeslagen) return normaliseerInstellingen(JSON.parse(opgeslagen));
    const oudThema = localStorage.getItem(OUDE_THEMA);
    return normaliseerInstellingen({ thema: oudThema === "light" ? "light" : "forge" });
  } catch {
    return standaardInstellingen;
  }
}

let huidig: Instellingen = typeof window === "undefined" ? standaardInstellingen : leesLokaal();
const luisteraars = new Set<() => void>();
const meld = () => luisteraars.forEach((luisteraar) => luisteraar());

function bewaar(waarde: Instellingen) {
  const json = JSON.stringify(waarde);
  try {
    localStorage.setItem(SLEUTEL, json);
  } catch {
    // Zonder browseropslag gelden de keuzes alleen voor deze sessie.
  }
  if (desktop())
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("bewaar_voorkeuren", { inhoud: json }))
      .catch((fout) => console.warn("Voorkeuren niet bewaard:", fout));
}

export function leesInstellingen(): Instellingen {
  return huidig;
}

export function wijzigInstellingen(wijziging: Wijziging) {
  huidig = pasToe(huidig, wijziging);
  bewaar(huidig);
  meld();
}

export function zetTerug() {
  huidig = standaardInstellingen;
  bewaar(huidig);
  meld();
}

export function volgInstellingen(luisteraar: () => void) {
  luisteraars.add(luisteraar);
  return () => {
    luisteraars.delete(luisteraar);
  };
}

export function useInstellingen(): Instellingen {
  return useSyncExternalStore(volgInstellingen, leesInstellingen, leesInstellingen);
}

// In de desktopapp is het bestand leidend; localStorage is alleen een snelle start.
if (desktop())
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke<string | null>("lees_voorkeuren"))
    .then((inhoud) => {
      if (!inhoud) return;
      const uitBestand = normaliseerInstellingen(JSON.parse(inhoud));
      if (JSON.stringify(uitBestand) === JSON.stringify(huidig)) return;
      huidig = uitBestand;
      try {
        localStorage.setItem(SLEUTEL, JSON.stringify(huidig));
      } catch {
        // Alleen de snelle start.
      }
      meld();
    })
    .catch(() => {
      // Zonder bestand blijven de lokale keuzes gelden.
    });
