import type { BewaarUitkomst } from "./opslag";

/**
 * Generieke opslagadapter voor een geopend kantoorbestand.
 *
 * De adapter beschrijft alleen bytes, bronidentiteit, versievoorwaarde,
 * operatie-ID, bevestiging en statusopvraag. Authenticatie, sessie, CSRF,
 * tenantkeuze en gebruikersidentiteit horen bij de host: die levert een
 * transportfunctie en de adapter leidt tenant of gebruiker nooit zelf af.
 */

/** SHA-256 als 64 kleine hexadecimale tekens. */
export type Sha256 = string;

/** Identiteit van een opslagbron zoals de host die aanwijst. */
export interface BronIdentiteit {
  /** Opaque bron-ID van de opslag (bijvoorbeeld de Frappe File-naam). */
  id: string;
  bestandsnaam: string;
  /** Hash van de bytes waarop de bewerking gebaseerd is. */
  sha256: Sha256;
}

/** Metadata die de opslag bij een bron teruggeeft. */
export interface BronMetadata extends BronIdentiteit {
  /** Mag de huidige sessie een kopie naast deze bron opslaan? */
  kanOpslaan: boolean;
  /** Maximale bestandsgrootte in bytes die de opslag accepteert. */
  maxGrootte: number;
  /** Optionele koppeling (bijvoorbeeld project of mail); alleen doorgegeven. */
  ouder?: { soort: string; naam: string };
}

export interface GeopendBestand {
  bron: BronMetadata;
  bytes: Uint8Array;
}

/** Eén opslagpoging: altijd een nieuwe private kopie naast de bron. */
export interface OpslagVerzoek {
  bron: BronIdentiteit;
  /** Versievoorwaarde: de bron moet nog deze hash hebben. */
  verwachteSha256: Sha256;
  bytes: Uint8Array;
  /** Hash van `bytes`, vooraf berekend door de aanroeper. */
  sha256: Sha256;
  /** UUID; dezelfde ID mag de opslag hooguit één kopie laten maken. */
  operatieId: string;
}

/** Door de opslag bevestigde en door de adapter geverifieerde kopie. */
export interface OpslagBevestiging {
  operatieId: string;
  bronId: string;
  kopie: BronMetadata;
}

export type StatusUitkomst =
  | { gevonden: false; operatieId: string }
  | { gevonden: true; bevestiging: OpslagBevestiging };

export interface OpslagAdapter {
  /** Leest metadata én bytes; de hash van de bytes is al gecontroleerd. */
  open(bronId: string): Promise<GeopendBestand>;
  /** Slaat één kopie op. Een onbekende uitkomst wordt als `onbekende-uitkomst` gemeld. */
  slaKopieOp(verzoek: OpslagVerzoek): Promise<OpslagBevestiging>;
  /** Vraagt de uitkomst van een eerdere operatie op (zonder opnieuw op te slaan). */
  status(operatieId: string, bron: BronIdentiteit): Promise<StatusUitkomst>;
  /** Kan deze opslag dit bestandstype openen en opslaan? */
  ondersteunt(bestandsnaam: string): boolean;
}

/**
 * Transport dat de host levert. Het pad is relatief aan de door de host
 * gekozen oorsprong; de host voegt sessie, cookies en eventuele tenantcontext
 * toe. De adapter zet zelf geen aanmeldgegevens.
 */
export type HostTransport = (
  pad: string,
  init: RequestInit,
) => Promise<Response>;

export type OpslagFoutCode =
  | "geen-rechten"
  | "geen-sessie"
  | "bronconflict"
  | "operatieconflict"
  | "netwerk"
  | "te-groot"
  | "onbekende-uitkomst"
  | "niet-ondersteund"
  | "hash-mismatch"
  | "ongeldig-antwoord"
  | "niet-gevonden"
  | "bezig"
  | "server";

const MELDINGEN: Record<OpslagFoutCode, string> = {
  "geen-rechten":
    "Je hebt geen recht om een kopie van dit bestand op te slaan.",
  "geen-sessie": "De sessie is verlopen; meld je opnieuw aan in de host.",
  bronconflict:
    "Het bronbestand is intussen gewijzigd; er is niets opgeslagen.",
  operatieconflict:
    "Deze opslagoperatie hoort bij andere gegevens; er is niets aangepast.",
  netwerk: "De opslag is niet bereikbaar; er is niets opgeslagen.",
  "te-groot": "Het bestand is groter dan de opslag toestaat.",
  "onbekende-uitkomst":
    "Het is niet bevestigd of de kopie is opgeslagen; de uitkomst wordt eerst nagevraagd.",
  "niet-ondersteund":
    "Dit bestandstype wordt door deze opslag niet ondersteund.",
  "hash-mismatch":
    "De gelezen bytes komen niet overeen met de hash van de opslag.",
  "ongeldig-antwoord": "De opslag gaf een onverwacht of onjuist antwoord.",
  "niet-gevonden": "Het bestand bestaat niet of is niet zichtbaar.",
  bezig: "Er loopt al een opslag voor dit document.",
  server: "De opslag meldde een fout.",
};

export class OpslagFout extends Error {
  readonly code: OpslagFoutCode;
  readonly httpStatus?: number;
  /** Foutcode van de server, bijvoorbeeld `office_source_changed`. */
  readonly serverCode?: string;

  constructor(
    code: OpslagFoutCode,
    details: {
      httpStatus?: number;
      serverCode?: string;
      melding?: string;
    } = {},
  ) {
    super(details.melding ?? MELDINGEN[code]);
    this.name = "OpslagFout";
    this.code = code;
    this.httpStatus = details.httpStatus;
    this.serverCode = details.serverCode;
  }
}

export function isSha256(waarde: unknown): waarde is Sha256 {
  return typeof waarde === "string" && /^[0-9a-f]{64}$/.test(waarde);
}

/** SHA-256 via WebCrypto (browser, Tauri-webview en Node 20+). */
export async function sha256Hex(bytes: Uint8Array): Promise<Sha256> {
  const kopie = new Uint8Array(bytes.byteLength);
  kopie.set(bytes);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", kopie));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function nieuweOperatieId(): string {
  return crypto.randomUUID();
}

type Poging = {
  operatieId: string;
  sha256: Sha256;
  bytes: Uint8Array;
  bron: BronIdentiteit;
};

/**
 * Houdt één geopende editie bij een opslagadapter bij: de huidige bron en
 * een eventueel nog onbevestigde operatie. Een nieuwe kopie wordt pas bron
 * nadat operatie, bron-ID en hash zijn geverifieerd.
 */
export class OpslagEditie {
  private huidigeBron: BronMetadata;
  private openstaand?: Poging;
  private actief = false;
  laatsteFout?: OpslagFout;

  constructor(
    private readonly adapter: OpslagAdapter,
    bron: BronMetadata,
  ) {
    this.huidigeBron = { ...bron };
  }

  /** Opent een bron; de adapter heeft de bytes al tegen de hash gecontroleerd. */
  static async open(adapter: OpslagAdapter, bronId: string) {
    const { bron, bytes } = await adapter.open(bronId);
    return { editie: new OpslagEditie(adapter, bron), bytes };
  }

  get bron(): BronMetadata {
    return { ...this.huidigeBron };
  }

  /** Operatie-ID waarvan de uitkomst nog niet bevestigd is. */
  get onbevestigdeOperatie(): string | undefined {
    return this.openstaand?.operatieId;
  }

  /**
   * Alleen na een expliciete keuze van de gebruiker: vergeet een operatie
   * waarvan de uitkomst onbekend bleef. Daarna kan een volgende opslag een
   * tweede kopie opleveren als de oude operatie alsnog slaagde.
   */
  verwerpOnbevestigdeOperatie() {
    this.openstaand = undefined;
  }

  /** Te gebruiken als `bewaar` in `DocumentOpslag.opslaan(serialiseer, bewaar)`. */
  bewaar = async (bytes: Uint8Array): Promise<BewaarUitkomst> => {
    const bevestiging = await this.slaOp(bytes);
    return {
      status: "opgeslagen",
      pad: bevestiging.kopie.bestandsnaam,
      toelichting: "Private kopie opgeslagen en bevestigd door de opslag.",
    };
  };

  async slaOp(bytes: Uint8Array): Promise<OpslagBevestiging> {
    if (this.actief) throw new OpslagFout("bezig");
    this.actief = true;
    try {
      const sha256 = await sha256Hex(bytes);
      if (this.openstaand) {
        const vorige = this.openstaand;
        const gevonden = await this.vraagNa(vorige);
        if (gevonden) {
          if (gevonden.kopie.sha256 === sha256) return gevonden;
        } else if (vorige.sha256 === sha256) {
          // Zelfde bytes, zelfde operatie-ID: de opslag maakt hooguit één kopie.
          return await this.verstuur(vorige);
        } else {
          throw new OpslagFout("onbekende-uitkomst", {
            melding:
              "Een eerdere opslag is nog niet bevestigd. Probeer later opnieuw of kies bewust om die operatie te verwerpen.",
          });
        }
      }
      const bron = this.huidigeBron;
      if (!this.adapter.ondersteunt(bron.bestandsnaam))
        throw new OpslagFout("niet-ondersteund");
      if (!bron.kanOpslaan) throw new OpslagFout("geen-rechten");
      if (!bytes.byteLength || bytes.byteLength > bron.maxGrootte)
        throw new OpslagFout("te-groot");
      return await this.verstuur({
        operatieId: nieuweOperatieId(),
        sha256,
        bytes,
        bron: {
          id: bron.id,
          bestandsnaam: bron.bestandsnaam,
          sha256: bron.sha256,
        },
      });
    } catch (fout) {
      this.laatsteFout =
        fout instanceof OpslagFout
          ? fout
          : new OpslagFout("server", { melding: String(fout) });
      throw this.laatsteFout;
    } finally {
      this.actief = false;
    }
  }

  private async verstuur(poging: Poging): Promise<OpslagBevestiging> {
    let bevestiging: OpslagBevestiging;
    try {
      bevestiging = await this.adapter.slaKopieOp({
        bron: poging.bron,
        verwachteSha256: poging.bron.sha256,
        bytes: poging.bytes,
        sha256: poging.sha256,
        operatieId: poging.operatieId,
      });
    } catch (fout) {
      if (fout instanceof OpslagFout && fout.code !== "onbekende-uitkomst") {
        // Definitieve weigering: deze operatie heeft niets opgeslagen.
        if (this.openstaand?.operatieId === poging.operatieId)
          this.openstaand = undefined;
        throw fout;
      }
      // Onbekende uitkomst: uitsluitend nagaan via de statusopvraag.
      this.openstaand = poging;
      const gevonden = await this.vraagNa(poging);
      if (gevonden) return gevonden;
      throw new OpslagFout("onbekende-uitkomst", {
        melding:
          "De opslag is niet bevestigd en (nog) niet gevonden. Er is niet opnieuw opgeslagen.",
      });
    }
    this.openstaand = poging;
    return this.bevestig(poging, bevestiging);
  }

  private async vraagNa(poging: Poging): Promise<OpslagBevestiging | null> {
    let uitkomst: StatusUitkomst;
    try {
      uitkomst = await this.adapter.status(poging.operatieId, poging.bron);
    } catch (fout) {
      throw new OpslagFout("onbekende-uitkomst", {
        httpStatus: fout instanceof OpslagFout ? fout.httpStatus : undefined,
        serverCode: fout instanceof OpslagFout ? fout.serverCode : undefined,
        melding:
          "De uitkomst van de opslag kon niet worden nagevraagd; er is niet opnieuw opgeslagen.",
      });
    }
    if (!uitkomst.gevonden) {
      if (uitkomst.operatieId !== poging.operatieId)
        throw new OpslagFout("ongeldig-antwoord");
      return null;
    }
    return this.bevestig(poging, uitkomst.bevestiging);
  }

  private bevestig(poging: Poging, b: OpslagBevestiging): OpslagBevestiging {
    if (
      b.operatieId !== poging.operatieId ||
      b.bronId !== poging.bron.id ||
      b.kopie.sha256 !== poging.sha256 ||
      !b.kopie.id ||
      b.kopie.id === poging.bron.id
    )
      throw new OpslagFout("ongeldig-antwoord", {
        melding:
          "De opslagbevestiging hoort niet bij deze operatie, bron of inhoud; de kopie wordt niet als bron gebruikt.",
      });
    this.openstaand = undefined;
    this.huidigeBron = { ...b.kopie };
    return b;
  }
}
