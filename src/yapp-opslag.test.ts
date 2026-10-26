import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DocumentOpslag } from "./opslag";
import {
  OpslagEditie,
  OpslagFout,
  sha256Hex,
  type HostTransport,
} from "./opslagadapter";
import { YappOpslag } from "./yapp-opslag";

/* ------------------------------------------------------------------ */
/* Nep-Frappe-server volgens y_next/api/office.py (commit 340c8f8).   */
/* ------------------------------------------------------------------ */

type NepBestand = {
  name: string;
  file_name: string;
  bytes: Uint8Array;
  parent?: { doctype: string; name: string };
  private: boolean;
};
type Bon = {
  source: string;
  expected: string;
  input: string;
  filename: string;
  result?: string;
  resultSha?: string;
};
const OFFICE = /^\/api\/method\/y_next\.api\.office\.(\w+)(?:\?(.*))?$/;
const MIME = new Set([".docx", ".xlsx", ".xlsm"]);
const ext = (n: string) => n.slice(n.lastIndexOf(".")).toLowerCase();
const hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const officeFout = (code: string, status = 400) =>
  json(status, { exc_type: "OfficeError", office_error: code });

class NepServer {
  bestanden = new Map<string, NepBestand>();
  bonnen = new Map<string, Bon>();
  schrijfrecht = true;
  maxSize = 20 * 1024 * 1024;
  csrf = "csrf-test";
  verzoeken: { methode: string; init: RequestInit }[] = [];
  /** Laat de save wel verwerken maar het antwoord wegvallen. */
  antwoordKwijt = 0;
  /** Laat het verzoek wegvallen voordat de server het ziet. */
  verzoekKwijt = 0;
  statusOnbereikbaar = 0;
  /** Vervalst de content (open-hashmismatch). */
  vervalsInhoud = false;
  /** Vervalst het saveantwoord. */
  vervalsAntwoord?: (m: Record<string, unknown>) => void;
  private teller = 0;

  voegToe(file_name: string, bytes: Uint8Array, parent?: NepBestand["parent"]) {
    const name = `f${++this.teller}`;
    this.bestanden.set(name, { name, file_name, bytes, parent, private: true });
    return name;
  }

  kopieën() {
    return [...this.bestanden.values()].filter((b) => b.name !== "f1");
  }

  private meta(b: NepBestand) {
    return {
      name: b.name,
      file_name: b.file_name,
      file_url: `/private/files/${b.file_name}`,
      sha256: hex(b.bytes),
      attached_to_doctype: b.parent?.doctype ?? null,
      attached_to_name: b.parent?.name ?? null,
      can_save: this.schrijfrecht,
      max_size: this.maxSize,
    };
  }

  private resultaat(op: string, bon: Bon) {
    if (!bon.result) return officeFout("office_save_pending", 409);
    const b = this.bestanden.get(bon.result)!;
    return json(200, {
      message: { ...this.meta(b), operation_id: op, source_file: bon.source },
    });
  }

  transport: HostTransport = async (pad, init) => {
    const [, methode, query] = OFFICE.exec(pad) ?? [];
    if (!methode) return json(404, {});
    this.verzoeken.push({ methode, init });
    const p = new URLSearchParams(query);
    if (methode === "open_file" || methode === "file_content") {
      const b = this.bestanden.get(p.get("file_name") ?? "");
      if (!b) return json(404, { exc_type: "DoesNotExistError" });
      if (!MIME.has(ext(b.file_name)))
        return officeFout("office_unsupported_type");
      if (methode === "open_file") return json(200, { message: this.meta(b) });
      const bytes = this.vervalsInhoud
        ? new Uint8Array([...b.bytes, 0])
        : b.bytes;
      return new Response(bytes.slice(), { status: 200 });
    }
    if (methode === "save_status") {
      if (this.statusOnbereikbaar > 0) {
        this.statusOnbereikbaar--;
        throw new TypeError("Failed to fetch");
      }
      const op = p.get("operation_id")!;
      const bon = this.bonnen.get(op);
      if (!bon)
        return json(200, { message: { found: false, operation_id: op } });
      const r = await this.resultaat(op, bon).json();
      return json(200, {
        message: { found: true, operation_id: op, file: r.message },
      });
    }
    if (methode === "save_file") {
      if (this.verzoekKwijt > 0) {
        this.verzoekKwijt--;
        throw new TypeError("Failed to fetch");
      }
      const antwoord = await this.saveFile(init);
      if (this.antwoordKwijt > 0) {
        this.antwoordKwijt--;
        throw new TypeError("network error");
      }
      if (this.vervalsAntwoord && antwoord.ok) {
        const body = await antwoord.json();
        this.vervalsAntwoord(body.message);
        return json(200, body);
      }
      return antwoord;
    }
    return json(404, {});
  };

  private async saveFile(init: RequestInit) {
    if (init.method !== "POST") return json(405, {});
    const headers = init.headers as Record<string, string>;
    if (headers["X-Frappe-CSRF-Token"] !== this.csrf)
      return json(400, { exc_type: "CSRFTokenError" });
    const form = init.body as FormData;
    const op = String(form.get("operation_id"));
    const expected = String(form.get("expected_sha256")).toLowerCase();
    const sourceName = String(form.get("source_file"));
    const upload = form.get("file") as File | null;
    if (!/^[0-9a-f-]{36}$/.test(op))
      return officeFout("office_invalid_operation_id");
    const source = this.bestanden.get(sourceName);
    if (!source) return json(404, { exc_type: "DoesNotExistError" });
    if (!this.schrijfrecht)
      return json(403, {
        exc_type: "PermissionError",
        exception:
          "frappe.exceptions.PermissionError: office_permission_denied",
      });
    if (!upload) return officeFout("office_missing_upload");
    if (
      !MIME.has(ext(upload.name)) ||
      ext(upload.name) !== ext(source.file_name)
    )
      return officeFout("office_type_mismatch");
    const content = new Uint8Array(await upload.arrayBuffer());
    if (content.byteLength > this.maxSize)
      return officeFout("office_file_too_large");
    const input = hex(content);
    const bestaand = this.bonnen.get(op);
    if (bestaand) {
      if (
        bestaand.source !== sourceName ||
        bestaand.expected !== expected ||
        bestaand.input !== input ||
        bestaand.filename !== upload.name
      )
        return officeFout("office_operation_conflict", 409);
      return this.resultaat(op, bestaand);
    }
    if (hex(source.bytes) !== expected)
      return officeFout("office_source_changed", 409);
    const kopie = this.voegToe(upload.name, content, source.parent);
    this.bonnen.set(op, {
      source: sourceName,
      expected,
      input,
      filename: upload.name,
      result: kopie,
      resultSha: input,
    });
    return this.resultaat(op, this.bonnen.get(op)!);
  }
}

const docx = (tekst: string) =>
  new TextEncoder().encode(`PK\u0003\u0004${tekst}`);

function opzet(
  bestandsnaam = "offerte.docx",
  opties: { tijdslimietMs?: number } = {},
) {
  const server = new NepServer();
  const bronId = server.voegToe(bestandsnaam, docx("origineel"), {
    doctype: "Project",
    name: "PRJ-0001",
  });
  const adapter = new YappOpslag({
    transport: server.transport,
    csrfToken: () => server.csrf,
    ...opties,
  });
  return { server, bronId, adapter };
}

async function verwachtFout(belofte: Promise<unknown>, code: string) {
  const fout = await belofte.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(fout).toBeInstanceOf(OpslagFout);
  expect((fout as OpslagFout).code).toBe(code);
  return fout as OpslagFout;
}

/* ------------------------------------------------------------------ */

describe("WebCrypto-hash", () => {
  it("berekent SHA-256 gelijk aan de bekende testvector", async () => {
    const abc = new TextEncoder().encode("abc");
    expect(await sha256Hex(abc)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("Openen via het Y-app-contract", () => {
  it("leest metadata en bytes en controleert de hash", async () => {
    const { adapter, bronId, server } = opzet();
    const { bron, bytes } = await adapter.open(bronId);
    expect(bron).toMatchObject({
      id: bronId,
      bestandsnaam: "offerte.docx",
      sha256: hex(docx("origineel")),
      kanOpslaan: true,
      ouder: { soort: "Project", naam: "PRJ-0001" },
    });
    expect(bytes).toEqual(docx("origineel"));
    expect(server.verzoeken.map((v) => v.methode)).toEqual([
      "open_file",
      "file_content",
    ]);
    // Geen aanmeldgegevens of tenant vanuit de adapter.
    for (const { init } of server.verzoeken) {
      expect(init.method).toBe("GET");
      expect(Object.keys(init.headers as object)).toEqual(["Accept"]);
    }
  });

  it("weigert bytes waarvan de hash niet met de metadata overeenkomt", async () => {
    const { adapter, bronId, server } = opzet();
    server.vervalsInhoud = true;
    await verwachtFout(adapter.open(bronId), "hash-mismatch");
  });

  it("weigert een bestand dat groter is dan max_size", async () => {
    const { adapter, bronId, server } = opzet();
    server.maxSize = 4;
    await verwachtFout(adapter.open(bronId), "te-groot");
  });

  it("meldt een onbekend bestand en netwerkuitval bij openen", async () => {
    const { adapter, server } = opzet();
    await verwachtFout(adapter.open("bestaat-niet"), "niet-gevonden");
    const kapot = new YappOpslag({
      transport: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await verwachtFout(kapot.open("f1"), "netwerk");
    expect(server.verzoeken).toHaveLength(1);
  });

  it("weigert PPTX zolang de server alleen DOCX/XLSX/XLSM kent", async () => {
    const { adapter, server } = opzet();
    const pptx = server.voegToe("dia.pptx", docx("dia"));
    expect(adapter.ondersteunt("dia.pptx")).toBe(false);
    expect(adapter.ondersteunt("rekenblad.XLSM")).toBe(true);
    await verwachtFout(adapter.open(pptx), "niet-ondersteund");
    await verwachtFout(
      adapter.slaKopieOp({
        bron: { id: pptx, bestandsnaam: "dia.pptx", sha256: hex(docx("dia")) },
        verwachteSha256: hex(docx("dia")),
        bytes: docx("nieuw"),
        sha256: hex(docx("nieuw")),
        operatieId: crypto.randomUUID(),
      }),
      "niet-ondersteund",
    );
    expect(server.verzoeken.some((v) => v.methode === "save_file")).toBe(false);
  });
});

describe("Opslaan als private kopie", () => {
  it("slaat op, verifieert de bevestiging en heropent de kopie", async () => {
    const { adapter, bronId, server } = opzet();
    const { editie } = await OpslagEditie.open(adapter, bronId);
    const nieuw = docx("gewijzigd");
    const b = await editie.slaOp(nieuw);
    expect(b.bronId).toBe(bronId);
    expect(b.kopie.sha256).toBe(hex(nieuw));
    expect(editie.bron.id).toBe(b.kopie.id);
    expect(editie.bron.sha256).toBe(hex(nieuw));
    // Bron blijft onveranderd, kopie heeft dezelfde ouder en is privé.
    expect(server.bestanden.get(bronId)!.bytes).toEqual(docx("origineel"));
    const kopie = server.bestanden.get(b.kopie.id)!;
    expect(kopie.parent).toEqual({ doctype: "Project", name: "PRJ-0001" });
    expect(kopie.private).toBe(true);
    const heropend = await adapter.open(b.kopie.id);
    expect(heropend.bytes).toEqual(nieuw);
    // Multipart volgens het contract, met CSRF van de host.
    const save = server.verzoeken.find((v) => v.methode === "save_file")!;
    const form = save.init.body as FormData;
    expect(form.get("source_file")).toBe(bronId);
    expect(form.get("expected_sha256")).toBe(hex(docx("origineel")));
    expect(form.get("operation_id")).toBe(b.operatieId);
    expect((form.get("file") as File).name).toBe("offerte.docx");
    expect((form.get("file") as File).type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("gebruikt na bevestiging de kopie als bron voor de volgende opslag", async () => {
    const { adapter, bronId, server } = opzet();
    const { editie } = await OpslagEditie.open(adapter, bronId);
    const eerste = await editie.slaOp(docx("een"));
    const tweede = await editie.slaOp(docx("twee"));
    expect(tweede.bronId).toBe(eerste.kopie.id);
    const forms = server.verzoeken
      .filter((v) => v.methode === "save_file")
      .map((v) => v.init.body as FormData);
    expect(forms[1].get("expected_sha256")).toBe(hex(docx("een")));
  });

  it("weigert lokaal bij alleen leesrecht (can_save=false) zonder save-verzoek", async () => {
    const { adapter, bronId, server } = opzet();
    server.schrijfrecht = false;
    const { editie } = await OpslagEditie.open(adapter, bronId);
    expect(editie.bron.kanOpslaan).toBe(false);
    await verwachtFout(editie.slaOp(docx("x")), "geen-rechten");
    expect(server.verzoeken.some((v) => v.methode === "save_file")).toBe(false);
  });

  it("meldt een 403 van de server als geen rechten", async () => {
    const { adapter, bronId, server } = opzet();
    const { editie } = await OpslagEditie.open(adapter, bronId);
    server.schrijfrecht = false; // rechten ingetrokken na openen
    const f = await verwachtFout(editie.slaOp(docx("x")), "geen-rechten");
    expect(f.httpStatus).toBe(403);
    expect(f.serverCode).toBe("office_permission_denied");
    expect(server.kopieën()).toHaveLength(0);
    expect(editie.bron.id).toBe(bronId);
  });

  it("meldt een ontbrekend CSRF-token als sessieprobleem", async () => {
    const { server, bronId } = opzet();
    const adapter = new YappOpslag({ transport: server.transport });
    const { editie } = await OpslagEditie.open(adapter, bronId);
    await verwachtFout(editie.slaOp(docx("x")), "geen-sessie");
  });

  it("meldt een bronhashconflict en houdt de oude bron", async () => {
    const { adapter, bronId, server } = opzet();
    const { editie } = await OpslagEditie.open(adapter, bronId);
    server.bestanden.get(bronId)!.bytes = docx("door iemand anders");
    const f = await verwachtFout(
      editie.slaOp(docx("mijn wijziging")),
      "bronconflict",
    );
    expect(f.httpStatus).toBe(409);
    expect(server.kopieën()).toHaveLength(0);
    expect(editie.bron.sha256).toBe(hex(docx("origineel")));
    expect(editie.onbevestigdeOperatie).toBeUndefined();
  });

  it("weigert te grote bestanden lokaal en via de server", async () => {
    const { adapter, bronId, server } = opzet();
    server.maxSize = 50;
    const { editie } = await OpslagEditie.open(adapter, bronId);
    await verwachtFout(editie.slaOp(new Uint8Array(51)), "te-groot");
    expect(server.verzoeken.some((v) => v.methode === "save_file")).toBe(false);
    server.maxSize = 10; // server verlaagt de limiet na openen
    await verwachtFout(editie.slaOp(docx("iets langer")), "te-groot");
  });

  it("maakt bij dezelfde operation_id twee keer hooguit één kopie", async () => {
    const { adapter, bronId, server } = opzet();
    const operatieId = crypto.randomUUID();
    const bytes = docx("dubbel");
    const verzoek = {
      bron: {
        id: bronId,
        bestandsnaam: "offerte.docx",
        sha256: hex(docx("origineel")),
      },
      verwachteSha256: hex(docx("origineel")),
      bytes,
      sha256: hex(bytes),
      operatieId,
    };
    const [a, b] = await Promise.all([
      adapter.slaKopieOp(verzoek),
      adapter.slaKopieOp(verzoek),
    ]);
    expect(a.kopie.id).toBe(b.kopie.id);
    expect(server.kopieën()).toHaveLength(1);
    // Dezelfde ID met andere inhoud is een operatieconflict.
    await verwachtFout(
      adapter.slaKopieOp({
        ...verzoek,
        bytes: docx("anders"),
        sha256: hex(docx("anders")),
      }),
      "operatieconflict",
    );
    expect(server.kopieën()).toHaveLength(1);
  });

  it("vertrouwt geen bevestiging met een afwijkende hash, bron of operatie", async () => {
    for (const vervals of [
      (m: Record<string, unknown>) => (m.sha256 = "0".repeat(64)),
      (m: Record<string, unknown>) => (m.source_file = "f999"),
      (m: Record<string, unknown>) => (m.operation_id = crypto.randomUUID()),
      (m: Record<string, unknown>) => (m.name = "f1"),
    ]) {
      const { adapter, bronId, server } = opzet();
      const { editie } = await OpslagEditie.open(adapter, bronId);
      server.vervalsAntwoord = vervals;
      await verwachtFout(editie.slaOp(docx("x")), "ongeldig-antwoord");
      expect(editie.bron.id).toBe(bronId);
    }
  });
});

describe("Onbekende uitkomst en reconciliatie", () => {
  const saves = (s: NepServer) =>
    s.verzoeken.filter((v) => v.methode === "save_file").length;
  const statussen = (s: NepServer) =>
    s.verzoeken.filter((v) => v.methode === "save_status").length;

  it("vindt een wél verwerkte save via save_status zonder tweede save", async () => {
    const { adapter, bronId, server } = opzet();
    const { editie } = await OpslagEditie.open(adapter, bronId);
    server.antwoordKwijt = 1;
    const b = await editie.slaOp(docx("verloren antwoord"));
    expect(saves(server)).toBe(1);
    expect(statussen(server)).toBe(1);
    expect(server.kopieën()).toHaveLength(1);
    expect(editie.bron.id).toBe(b.kopie.id);
    expect(editie.onbevestigdeOperatie).toBeUndefined();
  });

  it("meldt niet-gevonden als onbekend, slaat niet blind opnieuw op en houdt de bron", async () => {
    const { adapter, bronId, server } = opzet();
    const { editie } = await OpslagEditie.open(adapter, bronId);
    server.verzoekKwijt = 1;
    await verwachtFout(editie.slaOp(docx("weg")), "onbekende-uitkomst");
    expect(saves(server)).toBe(1);
    expect(statussen(server)).toBe(1);
    expect(server.kopieën()).toHaveLength(0);
    expect(editie.bron.id).toBe(bronId);
    const operatie = editie.onbevestigdeOperatie;
    expect(operatie).toBeDefined();

    // Andere inhoud: eerst nagaan, niet opslaan zolang de oude uitkomst onbekend is.
    await verwachtFout(editie.slaOp(docx("nieuwer")), "onbekende-uitkomst");
    expect(saves(server)).toBe(1);
    expect(editie.onbevestigdeOperatie).toBe(operatie);

    // Zelfde inhoud: herhaling met dezelfde operation_id, server maakt één kopie.
    const b = await editie.slaOp(docx("weg"));
    expect(b.operatieId).toBe(operatie);
    expect(server.kopieën()).toHaveLength(1);
    expect(editie.onbevestigdeOperatie).toBeUndefined();
  });

  it("neemt een later alsnog gevonden operatie over vóór een nieuwe save", async () => {
    const { adapter, bronId, server } = opzet();
    const { editie } = await OpslagEditie.open(adapter, bronId);
    server.antwoordKwijt = 1;
    server.statusOnbereikbaar = 1;
    await verwachtFout(editie.slaOp(docx("een")), "onbekende-uitkomst");
    expect(server.kopieën()).toHaveLength(1); // wel opgeslagen, nog niet bevestigd
    expect(editie.bron.id).toBe(bronId);
    const b = await editie.slaOp(docx("twee"));
    // Eerst de oude kopie bevestigd en als bron genomen, daarna één nieuwe kopie.
    const eersteKopie = server.kopieën()[0].name;
    expect(b.bronId).toBe(eersteKopie);
    expect(server.kopieën()).toHaveLength(2);
    expect(saves(server)).toBe(2);
  });

  it("behandelt een time-out als onbekende uitkomst en reconcilieert", async () => {
    const server = new NepServer();
    const bronId = server.voegToe("blad.xlsx", docx("blad"));
    let vasthouden = true;
    const transport: HostTransport = async (pad, init) => {
      const antwoord = await server.transport(pad, init);
      if (vasthouden && pad.endsWith("save_file")) {
        vasthouden = false;
        await new Promise((r) => setTimeout(r, 200));
      }
      return antwoord;
    };
    const adapter = new YappOpslag({
      transport,
      csrfToken: () => server.csrf,
      tijdslimietMs: 20,
    });
    const { editie } = await OpslagEditie.open(adapter, bronId);
    const b = await editie.slaOp(docx("blad 2"));
    expect(server.kopieën()).toHaveLength(1);
    expect(b.kopie.bestandsnaam).toBe("blad.xlsx");
    expect(
      server.verzoeken.filter((v) => v.methode === "save_file"),
    ).toHaveLength(1);
  });

  it("behandelt een 502 na verzending als onbekende uitkomst", async () => {
    const { server, bronId } = opzet();
    const transport: HostTransport = async (pad, init) => {
      const antwoord = await server.transport(pad, init);
      return pad.endsWith("save_file")
        ? new Response("Bad Gateway", { status: 502 })
        : antwoord;
    };
    const adapter = new YappOpslag({ transport, csrfToken: () => server.csrf });
    const { editie } = await OpslagEditie.open(adapter, bronId);
    const b = await editie.slaOp(docx("via status"));
    expect(server.kopieën().map((k) => k.name)).toEqual([b.kopie.id]);
  });
});

describe("Koppeling met DocumentOpslag", () => {
  it("meldt een bevestigde Y-app-opslag als schoon", async () => {
    const { adapter, bronId } = opzet();
    const { editie } = await OpslagEditie.open(adapter, bronId);
    const opslag = new DocumentOpslag();
    const id = opslag.wissel();
    opslag.wijzig(id);
    const r = await opslag.opslaan(async () => docx("klaar"), editie.bewaar);
    expect(r).toMatchObject({
      status: "afgerond",
      schoon: true,
      uitkomst: { status: "opgeslagen", pad: "offerte.docx" },
    });
    expect(opslag.gewijzigd).toBe(false);
  });

  it("houdt wijzigingen tijdens de save onopgeslagen; de kopie wordt wel bron", async () => {
    const { server, bronId } = opzet();
    let losLaten!: () => void;
    const wacht = new Promise<void>((r) => (losLaten = r));
    const transport: HostTransport = async (pad, init) => {
      if (pad.endsWith("save_file")) await wacht;
      return server.transport(pad, init);
    };
    const adapter = new YappOpslag({ transport, csrfToken: () => server.csrf });
    const { editie } = await OpslagEditie.open(adapter, bronId);
    const opslag = new DocumentOpslag();
    const id = opslag.wissel();
    opslag.wijzig(id);
    const loopt = opslag.opslaan(async () => docx("revisie 1"), editie.bewaar);
    await vi.waitFor(() => expect(opslag.bezig).toBe(true));
    await new Promise((r) => setTimeout(r, 5));
    opslag.wijzig(id); // gebruiker typt verder tijdens het opslaan
    losLaten();
    expect(await loopt).toMatchObject({ status: "afgerond", schoon: false });
    expect(opslag.gewijzigd).toBe(true);
    expect(editie.bron.sha256).toBe(hex(docx("revisie 1")));
  });

  it("meldt een onbekende uitkomst als mislukt en laat het document gewijzigd", async () => {
    const { adapter, bronId, server } = opzet();
    const { editie } = await OpslagEditie.open(adapter, bronId);
    const opslag = new DocumentOpslag();
    const id = opslag.wissel();
    opslag.wijzig(id);
    server.verzoekKwijt = 1;
    const r = await opslag.opslaan(async () => docx("x"), editie.bewaar);
    expect(r).toMatchObject({ status: "mislukt", actueel: true });
    expect(opslag.gewijzigd).toBe(true);
    expect(editie.laatsteFout?.code).toBe("onbekende-uitkomst");
  });
});
