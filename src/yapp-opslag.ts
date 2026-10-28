/**
 * Opslagadapter voor het bestaande Frappe/Y-app-contract
 * (`y_next/api/office.py`, commit 340c8f84b567d517b4d832a8501ce3d17255a6ce).
 *
 * De host levert het transport (oorsprong, sessiecookie) en eventueel het
 * CSRF-token van de bestaande sessie. Deze module kiest geen tenant, leest
 * geen gebruiker uit en bewaart geen aanmeldgegevens.
 */
import {
  OpslagFout,
  isSha256,
  sha256Hex,
  type BronIdentiteit,
  type BronMetadata,
  type GeopendBestand,
  type HostTransport,
  type OpslagAdapter,
  type OpslagBevestiging,
  type OpslagFoutCode,
  type OpslagVerzoek,
  type StatusUitkomst,
} from "./opslagadapter";

const API = "/api/method/y_next.api.office.";

/** Wat `MIME_TYPES` en `OFFICE_TYPES` in de Y-app op deze commit kennen. */
export const YAPP_MIME_TYPES: Readonly<Record<string, string>> = {
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
};

export interface YappOpslagOpties {
  /** Doet het verzoek met de sessie van de host (zelfde oorsprong of proxy). */
  transport: HostTransport;
  /** CSRF-token van de bestaande sessie; de host bepaalt waar dat vandaan komt. */
  csrfToken?: () => string | Promise<string>;
  /** Afbreken na deze tijd; een afgebroken save heeft een onbekende uitkomst. */
  tijdslimietMs?: number;
  /** Bestandstypen die de server accepteert; standaard DOCX/XLSX/XLSM. */
  mimeTypes?: Readonly<Record<string, string>>;
}

function extensie(bestandsnaam: string) {
  const punt = bestandsnaam.lastIndexOf(".");
  return punt < 0 ? "" : bestandsnaam.slice(punt).toLowerCase();
}

const FOUTCODES: Record<string, OpslagFoutCode> = {
  office_permission_denied: "geen-rechten",
  office_source_changed: "bronconflict",
  office_operation_conflict: "operatieconflict",
  office_file_too_large: "te-groot",
  office_unsupported_type: "niet-ondersteund",
  office_type_mismatch: "niet-ondersteund",
  office_file_not_found: "niet-gevonden",
  office_save_pending: "onbekende-uitkomst",
};

type Antwoord = { status: number; json?: Record<string, unknown> };

async function leesJson(antwoord: Response): Promise<Antwoord> {
  try {
    const json = (await antwoord.json()) as unknown;
    if (json && typeof json === "object")
      return { status: antwoord.status, json: json as Record<string, unknown> };
  } catch {
    /* Geen JSON: alleen de statuscode telt. */
  }
  return { status: antwoord.status };
}

function serverCode(json?: Record<string, unknown>) {
  if (!json) return undefined;
  if (typeof json.office_error === "string") return json.office_error;
  const tekst = [json.exception, json.exc_type, json._server_messages]
    .filter((x) => typeof x === "string")
    .join(" ");
  return /office_[a-z_]+/.exec(tekst)?.[0];
}

/** Zet een foutantwoord om naar een categorie. */
function fout({ status, json }: Antwoord): OpslagFout {
  const code = serverCode(json);
  const excType = typeof json?.exc_type === "string" ? json.exc_type : "";
  let categorie: OpslagFoutCode =
    (code && FOUTCODES[code]) ||
    (excType === "CSRFTokenError" || status === 401
      ? "geen-sessie"
      : status === 403
        ? "geen-rechten"
        : status === 404
          ? "niet-gevonden"
          : status === 413
            ? "te-groot"
            : "server");
  if (excType === "CSRFTokenError") categorie = "geen-sessie";
  return new OpslagFout(categorie, { httpStatus: status, serverCode: code });
}

function bericht(json: Record<string, unknown> | undefined) {
  const message = json?.message;
  if (!message || typeof message !== "object")
    throw new OpslagFout("ongeldig-antwoord");
  return message as Record<string, unknown>;
}

function metadata(m: Record<string, unknown>): BronMetadata {
  const { name, file_name, sha256, can_save, max_size } = m;
  if (
    typeof name !== "string" ||
    !name ||
    typeof file_name !== "string" ||
    !isSha256(sha256) ||
    typeof can_save !== "boolean" ||
    typeof max_size !== "number" ||
    !(max_size > 0)
  )
    throw new OpslagFout("ongeldig-antwoord");
  const bron: BronMetadata = {
    id: name,
    bestandsnaam: file_name,
    sha256,
    kanOpslaan: can_save,
    maxGrootte: max_size,
  };
  if (
    typeof m.attached_to_doctype === "string" &&
    typeof m.attached_to_name === "string"
  )
    bron.ouder = { soort: m.attached_to_doctype, naam: m.attached_to_name };
  return bron;
}

function bevestiging(
  m: Record<string, unknown>,
  operatieId: string,
  bron: BronIdentiteit,
): OpslagBevestiging {
  const kopie = metadata(m);
  if (
    m.operation_id !== operatieId ||
    m.source_file !== bron.id ||
    kopie.id === bron.id ||
    extensie(kopie.bestandsnaam) !== extensie(bron.bestandsnaam)
  )
    throw new OpslagFout("ongeldig-antwoord");
  return { operatieId, bronId: bron.id, kopie };
}

export class YappOpslag implements OpslagAdapter {
  private readonly mimeTypes: Readonly<Record<string, string>>;

  constructor(private readonly opties: YappOpslagOpties) {
    this.mimeTypes = opties.mimeTypes ?? YAPP_MIME_TYPES;
  }

  ondersteunt(bestandsnaam: string) {
    return Object.hasOwn(this.mimeTypes, extensie(bestandsnaam));
  }

  private async verzoek(pad: string, init: RequestInit): Promise<Response> {
    const limiet = this.opties.tijdslimietMs;
    if (!limiet) return this.opties.transport(pad, init);
    const afbreken = new AbortController();
    let klok: ReturnType<typeof setTimeout> | undefined;
    const verlopen = new Promise<never>((_, weiger) => {
      klok = setTimeout(() => {
        afbreken.abort();
        weiger(new DOMException("Tijdslimiet verstreken", "TimeoutError"));
      }, limiet);
    });
    try {
      return await Promise.race([
        this.opties.transport(pad, { ...init, signal: afbreken.signal }),
        verlopen,
      ]);
    } finally {
      clearTimeout(klok);
    }
  }

  /** GET zonder bijwerkingen; netwerkuitval betekent: niets veranderd. */
  private async lees(methode: string, parameters: Record<string, string>) {
    const query = new URLSearchParams(parameters).toString();
    try {
      return await this.verzoek(`${API}${methode}?${query}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
    } catch {
      throw new OpslagFout("netwerk");
    }
  }

  async open(bronId: string): Promise<GeopendBestand> {
    const antwoord = await this.lees("open_file", { file_name: bronId });
    const json = await leesJson(antwoord);
    if (!antwoord.ok) throw fout(json);
    const bron = metadata(bericht(json.json));
    if (bron.id !== bronId) throw new OpslagFout("ongeldig-antwoord");
    // Weigeren vóór het lezen: de server kent alleen zijn eigen typen.
    if (!this.ondersteunt(bron.bestandsnaam))
      throw new OpslagFout("niet-ondersteund");
    const inhoud = await this.lees("file_content", { file_name: bronId });
    if (!inhoud.ok) throw fout(await leesJson(inhoud));
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await inhoud.arrayBuffer());
    } catch {
      throw new OpslagFout("netwerk");
    }
    if (bytes.byteLength > bron.maxGrootte) throw new OpslagFout("te-groot");
    if ((await sha256Hex(bytes)) !== bron.sha256)
      throw new OpslagFout("hash-mismatch");
    return { bron, bytes };
  }

  async slaKopieOp(verzoek: OpslagVerzoek): Promise<OpslagBevestiging> {
    const { bron, bytes, operatieId, verwachteSha256 } = verzoek;
    const mime = this.mimeTypes[extensie(bron.bestandsnaam)];
    if (!mime) throw new OpslagFout("niet-ondersteund");
    if (!isSha256(verwachteSha256) || !isSha256(verzoek.sha256))
      throw new OpslagFout("ongeldig-antwoord", {
        melding: "Ongeldige hash in het opslagverzoek.",
      });
    const formulier = new FormData();
    const kopie = new Uint8Array(bytes.byteLength);
    kopie.set(bytes);
    formulier.append(
      "file",
      new Blob([kopie], { type: mime }),
      bron.bestandsnaam,
    );
    formulier.append("source_file", bron.id);
    formulier.append("expected_sha256", verwachteSha256);
    formulier.append("operation_id", operatieId);
    const headers: Record<string, string> = { Accept: "application/json" };
    const csrf = await this.opties.csrfToken?.();
    if (csrf) headers["X-Frappe-CSRF-Token"] = csrf;

    let antwoord: Response;
    let json: Antwoord;
    try {
      antwoord = await this.verzoek(`${API}save_file`, {
        method: "POST",
        headers,
        body: formulier,
        credentials: "same-origin",
      });
      json = await leesJson(antwoord);
    } catch {
      // Verzonden maar geen antwoord: misschien wél opgeslagen.
      throw new OpslagFout("onbekende-uitkomst");
    }
    if (!antwoord.ok) {
      // Een proxy- of serverfout ná verzending sluit opslag niet uit.
      if (antwoord.status >= 500)
        throw new OpslagFout("onbekende-uitkomst", {
          httpStatus: antwoord.status,
        });
      throw fout(json);
    }
    const resultaat = bevestiging(bericht(json.json), operatieId, bron);
    if (resultaat.kopie.sha256 !== verzoek.sha256)
      throw new OpslagFout("ongeldig-antwoord");
    return resultaat;
  }

  async status(
    operatieId: string,
    bron: BronIdentiteit,
  ): Promise<StatusUitkomst> {
    let antwoord: Response;
    try {
      antwoord = await this.lees("save_status", { operation_id: operatieId });
    } catch {
      throw new OpslagFout("onbekende-uitkomst");
    }
    const json = await leesJson(antwoord);
    if (!antwoord.ok) throw fout(json);
    const m = bericht(json.json);
    if (m.operation_id !== operatieId || typeof m.found !== "boolean")
      throw new OpslagFout("ongeldig-antwoord");
    if (!m.found) return { gevonden: false, operatieId };
    if (!m.file || typeof m.file !== "object")
      throw new OpslagFout("ongeldig-antwoord");
    return {
      gevonden: true,
      bevestiging: bevestiging(
        m.file as Record<string, unknown>,
        operatieId,
        bron,
      ),
    };
  }
}
