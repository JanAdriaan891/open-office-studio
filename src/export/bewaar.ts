import type { Soort } from "../editors";
import type { BewaarUitkomst } from "../opslag";
import { controleerPakket, risicoBeleid } from "../pakketcontrole";
import {
  converteer,
  kiesRoute,
  uitvoerformaat,
  type ConversieOpties,
  type Route,
  type Uitvoerformaat,
} from "../formaten";
import type { Codering, Scheidingsteken } from "./csv";

/** Wat de gebruiker in Opslaan als heeft gekozen. */
export interface OpslaanKeuze {
  /** Bestandsnaam zonder extensie. */
  naam: string;
  ext: string;
  route: Route;
  scheidingsteken?: Scheidingsteken;
  codering?: Codering;
  /** 0-gebaseerd blad. */
  blad?: number;
  /** 0-gebaseerde dia. */
  dia?: number;
  /** 0 = gewone PDF. */
  pdfa?: 0 | 1 | 2 | 3;
  bladwijzers?: boolean;
  bereik?: string;
}

const BEWERKBAAR = new Set([
  "eigen",
  "opendocument",
  "office-oud",
  "sjablonen",
]);

/** De verliesmelding die vóór het opslaan in dit formaat hoort, of null. */
export function verliesmelding(
  bytes: Uint8Array,
  soort: Soort,
  formaat: Uitvoerformaat,
  route: Route | null,
) {
  if (
    formaat.ext === soort ||
    route !== "runtime" ||
    !BEWERKBAAR.has(formaat.groep)
  )
    return null;
  try {
    return risicoBeleid(
      controleerPakket(bytes, soort).risicos,
      soort,
      "conversie",
    ).waarschuwing;
  } catch {
    return null;
  }
}

function runtimeOpties(keuze: OpslaanKeuze): ConversieOpties | undefined {
  const opties: ConversieOpties = {};
  if (keuze.ext === "pdf") {
    if (keuze.pdfa) opties.pdfa = keuze.pdfa;
    if (keuze.bladwijzers !== undefined) opties.bladwijzers = keuze.bladwijzers;
    if (keuze.bereik?.trim()) opties.bereik = keuze.bereik.trim();
  }
  if (keuze.ext === "csv" || keuze.ext === "tsv") {
    if (keuze.scheidingsteken) opties.scheidingsteken = keuze.scheidingsteken;
    if (keuze.codering) opties.codering = keuze.codering;
    if (keuze.blad !== undefined) opties.blad = keuze.blad + 1;
  }
  return Object.keys(opties).length ? opties : undefined;
}

/**
 * Maakt het gekozen formaat (engine of runtime) en bewaart het: native
 * opslagdialoog in de desktopapp, download in de browser. Alleen het eigen
 * formaat telt als "opgeslagen"; al het andere is een export, zodat het
 * document als gewijzigd gemarkeerd blijft.
 */
export async function bewaarInFormaat(
  soort: Soort,
  bytes: Uint8Array,
  keuze: OpslaanKeuze,
): Promise<BewaarUitkomst> {
  const formaat = uitvoerformaat(soort, keuze.ext);
  if (!formaat) throw new Error("Dit formaat wordt niet ondersteund.");
  const desktop = "__TAURI_INTERNALS__" in window;
  const eigen = keuze.ext === soort;
  const toelichtingen: string[] = [];
  // Aangetoond verlies via de eigen engine blokkeert opslaan in het eigen formaat.
  const beleid = risicoBeleid(
    controleerPakket(bytes, soort).risicos,
    soort,
    eigen ? "engine" : "conversie",
  );
  if (beleid.opslaanGeblokkeerd) throw new Error(beleid.waarschuwing!);
  const melding = verliesmelding(bytes, soort, formaat, keuze.route);
  if (melding) toelichtingen.push(melding);

  let uitvoer: Uint8Array;
  let mime = "application/octet-stream";
  if (keuze.route === "runtime") {
    uitvoer = await converteer(
      bytes,
      soort,
      keuze.ext,
      soort,
      runtimeOpties(keuze),
    );
  } else if (keuze.route === "afdrukken") {
    throw new Error("PDF zonder kantoorruntime loopt via Afdrukken.");
  } else {
    const { maakExport } = await import("./index");
    const resultaat = await maakExport(soort, keuze.ext, bytes, keuze.naam, {
      blad: keuze.blad,
      dia: keuze.dia,
      scheidingsteken: keuze.scheidingsteken,
      codering: keuze.codering,
    });
    uitvoer = resultaat.bytes;
    mime = resultaat.mime;
    if (resultaat.toelichting) toelichtingen.push(resultaat.toelichting);
  }
  if (!eigen)
    toelichtingen.push(
      `Het document blijft als gewijzigd gemarkeerd tot je het als .${soort} bewaart.`,
    );
  const toelichting = toelichtingen.join(" ") || undefined;
  const bestandsnaam = `${keuze.naam.replace(/[\\/:*?"<>|]+/g, "_").trim() || "Naamloos"}.${keuze.ext}`;
  if (desktop) {
    const { invoke } = await import("@tauri-apps/api/core");
    const pad = await invoke<string | null>("bewaar_kopie", uitvoer, {
      headers: { "x-office-naam": encodeURIComponent(bestandsnaam) },
    });
    if (!pad) return { status: "geannuleerd" };
    return { status: eigen ? "opgeslagen" : "geëxporteerd", pad, toelichting };
  }
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(uitvoer)], { type: mime }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = bestandsnaam;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { status: "download", toelichting };
}

/** Standaardkeuze voor Ctrl+S zonder eerder gekozen opties. */
export function standaardKeuze(
  soort: Soort,
  naam: string,
  ext: string,
): OpslaanKeuze {
  const formaat = uitvoerformaat(soort, ext) ?? uitvoerformaat(soort, soort)!;
  const desktop = "__TAURI_INTERNALS__" in window;
  return {
    naam: naam.replace(/\.[^.]+$/, ""),
    ext: formaat.ext,
    route: kiesRoute(formaat, desktop) ?? "engine",
  };
}
