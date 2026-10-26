/** Eigen, alleen-lezende paginalezer voor Jet/ACE-tabeldefinities (indexen) en een onafhankelijke rijtelling. */
export interface RuwFormaat {
  naam: string;
  jet3: boolean;
  paginagrootte: number;
  sleutel: number;
}
export interface RuweKolom {
  nummer: number;
  naam: string;
  type: number;
  vast: boolean;
  variabelIndex: number;
  vasteOffset: number;
  lengte: number;
}
export interface RuweIndex {
  naam: string;
  kolommen: { naam: string; oplopend: boolean }[];
  primair: boolean;
  uniek: boolean;
  extern: boolean;
}
export interface RuweTabel {
  rijen: number;
  kolommen: RuweKolom[];
  indexen: RuweIndex[];
}

const versies: Record<number, string> = {
  0: "Jet 3 (Access 97)",
  1: "Jet 4 (Access 2000–2003)",
  2: "ACE 12 (Access 2007)",
  3: "ACE 14 (Access 2010)",
  4: "ACE 15 (Access 2013)",
  5: "ACE 16 (Access 2016+)",
  6: "ACE 17 (Access 2019+)",
};

function rc4(sleutel: Uint8Array, data: Uint8Array) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + sleutel[i % sleutel.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const uit = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    uit[n] = data[n] ^ s[(s[i] + s[j]) & 255];
  }
  return uit;
}

export function leesFormaat(bytes: Uint8Array): RuwFormaat {
  if (bytes.length < 2048 || bytes[0] !== 0 || bytes[1] !== 1)
    throw new Error("Geen Jet/ACE-kop gevonden.");
  const versie = bytes[0x14];
  const jet3 = versie === 0;
  const kop = rc4(
    Uint8Array.of(0xc7, 0xda, 0x39, 0x6b),
    bytes.subarray(0x18, 0x18 + (jet3 ? 126 : 128)),
  );
  const sleutel = new DataView(kop.buffer).getUint32(0x3e - 0x18, true);
  return {
    naam: versies[versie] ?? `Onbekende versie ${versie}`,
    jet3,
    paginagrootte: jet3 ? 2048 : 4096,
    sleutel: versie >= 2 ? 0 : sleutel,
  };
}

export function leesPagina(
  bytes: Uint8Array,
  formaat: RuwFormaat,
  nummer: number,
) {
  const start = nummer * formaat.paginagrootte;
  if (nummer < 1 || start + formaat.paginagrootte > bytes.length)
    throw new Error(`Pagina ${nummer} ligt buiten het bestand.`);
  const pagina = bytes.subarray(start, start + formaat.paginagrootte);
  if (!formaat.sleutel) return pagina;
  const sleutel = new Uint8Array(4);
  new DataView(sleutel.buffer).setUint32(
    0,
    (formaat.sleutel ^ nummer) >>> 0,
    true,
  );
  return rc4(sleutel, pagina);
}

function naamLezer(data: Uint8Array, jet3: boolean) {
  const utf16 = new TextDecoder("utf-16le");
  const latin = new TextDecoder("windows-1252");
  return (positie: number): [string, number] => {
    if (jet3) {
      const lengte = data[positie];
      return [
        latin.decode(data.subarray(positie + 1, positie + 1 + lengte)),
        positie + 1 + lengte,
      ];
    }
    const lengte = data[positie] | (data[positie + 1] << 8);
    const ruw = data.subarray(positie + 2, positie + 2 + lengte);
    if (ruw[0] === 0xff && ruw[1] === 0xfe) {
      let tekst = "";
      let gecomprimeerd = true;
      for (let i = 2; i < ruw.length; ) {
        if (ruw[i] === 0) {
          gecomprimeerd = !gecomprimeerd;
          i++;
        } else if (gecomprimeerd) tekst += String.fromCharCode(ruw[i++]);
        else {
          tekst += String.fromCharCode(ruw[i] | (ruw[i + 1] << 8));
          i += 2;
        }
      }
      return [tekst, positie + 2 + lengte];
    }
    return [utf16.decode(ruw), positie + 2 + lengte];
  };
}

export function leesTabeldefinitie(
  bytes: Uint8Array,
  formaat: RuwFormaat,
  paginaNummer: number,
): RuweTabel {
  const delen: Uint8Array[] = [];
  const gezien = new Set<number>();
  for (let n = paginaNummer; n; ) {
    if (gezien.has(n) || gezien.size > 1000)
      throw new Error("Kringverwijzing in tabeldefinitie.");
    gezien.add(n);
    const pagina = leesPagina(bytes, formaat, n);
    if (pagina[0] !== 0x02)
      throw new Error(
        `Pagina ${n} is geen tabeldefinitie (mogelijk versleuteld).`,
      );
    delen.push(delen.length ? pagina.subarray(8) : pagina);
    n = new DataView(pagina.buffer, pagina.byteOffset).getUint32(4, true);
  }
  const data = new Uint8Array(
    delen.reduce((som, deel) => som + deel.length, 0),
  );
  delen.reduce(
    (positie, deel) => (data.set(deel, positie), positie + deel.length),
    0,
  );
  const z = new DataView(data.buffer);
  const j3 = formaat.jet3;
  const rijen = z.getUint32(j3 ? 12 : 16, true);
  const aantalKolommen = z.getUint16(j3 ? 25 : 45, true);
  const aantalIndexen = z.getUint32(j3 ? 27 : 47, true);
  const aantalEcht = z.getUint32(j3 ? 31 : 51, true);
  if (aantalKolommen > 4096 || aantalIndexen > 1024 || aantalEcht > 1024)
    throw new Error("Onwaarschijnlijke tabeldefinitie.");
  let positie = (j3 ? 43 : 63) + aantalEcht * (j3 ? 8 : 12);
  const kolommen: RuweKolom[] = [];
  for (let i = 0; i < aantalKolommen; i++) {
    kolommen.push({
      type: data[positie],
      nummer: z.getUint16(positie + (j3 ? 1 : 5), true),
      naam: "",
      vast: !!(data[positie + (j3 ? 13 : 15)] & 0x01),
      variabelIndex: z.getUint16(positie + (j3 ? 3 : 7), true),
      vasteOffset: z.getUint16(positie + (j3 ? 14 : 21), true),
      lengte: z.getUint16(positie + (j3 ? 16 : 23), true),
    });
    positie += j3 ? 18 : 25;
  }
  const naam = naamLezer(data, j3);
  for (const kolom of kolommen) [kolom.naam, positie] = naam(positie);
  const kolomNaam = new Map(kolommen.map((k) => [k.nummer, k.naam]));
  const echt: { kolommen: RuweIndex["kolommen"]; uniek: boolean }[] = [];
  for (let i = 0; i < aantalEcht; i++) {
    const basis = positie + (j3 ? 0 : 4);
    const lijst: RuweIndex["kolommen"] = [];
    for (let k = 0; k < 10; k++) {
      const nummer = z.getUint16(basis + k * 3, true);
      if (nummer !== 0xffff)
        lijst.push({
          naam: kolomNaam.get(nummer) ?? `kolom ${nummer}`,
          oplopend: data[basis + k * 3 + 2] !== 2,
        });
    }
    echt.push({ kolommen: lijst, uniek: !!(data[basis + 38] & 0x01) });
    positie += j3 ? 39 : 52;
  }
  const logisch: { echt: number; type: number }[] = [];
  for (let i = 0; i < aantalIndexen; i++) {
    const basis = positie + (j3 ? 0 : 4);
    logisch.push({
      echt: z.getUint32(basis + 4, true),
      type: data[basis + 19],
    });
    positie += j3 ? 20 : 28;
  }
  const indexen = logisch.map((item) => {
    let indexNaam: string;
    [indexNaam, positie] = naam(positie);
    const bron = echt[item.echt];
    return {
      naam: indexNaam,
      kolommen: bron?.kolommen ?? [],
      primair: item.type === 1,
      uniek: item.type === 1 || !!bron?.uniek,
      extern: item.type === 2,
    };
  });
  return { rijen, kolommen, indexen };
}

/** Telt rijen per tabeldefinitiepagina door alle datapagina’s te scannen, los van mdb-reader. */
export function telRijenRuw(
  bytes: Uint8Array,
  formaat: RuwFormaat,
): Map<number, number> {
  const tellingen = new Map<number, number>();
  const aantal = Math.floor(bytes.length / formaat.paginagrootte);
  for (let n = 1; n < aantal; n++) {
    if (bytes[n * formaat.paginagrootte] !== 0x01 && !formaat.sleutel) continue;
    const pagina = leesPagina(bytes, formaat, n);
    if (pagina[0] !== 0x01) continue;
    const z = new DataView(pagina.buffer, pagina.byteOffset, pagina.byteLength);
    const eigenaar = z.getUint32(4, true);
    const kop = formaat.jet3 ? 8 : 12;
    let rijen = 0;
    for (let r = 0; r < z.getUint16(kop, true); r++)
      if (!(z.getUint16(kop + 2 + r * 2, true) & 0x8000)) rijen++;
    tellingen.set(eigenaar, (tellingen.get(eigenaar) ?? 0) + rijen);
  }
  return tellingen;
}

/** Leest rijen ruw (alleen Jet 4/ACE, alleen Long- en binaire kolommen); bedoeld voor systeemtabellen die mdb-reader weigert. */
export function leesRijenRuw(
  bytes: Uint8Array,
  formaat: RuwFormaat,
  tabelPagina: number,
): Record<string, number | Uint8Array | null>[] {
  if (formaat.jet3)
    throw new Error("Ruwe rijen worden alleen voor Jet 4/ACE gelezen.");
  const { kolommen } = leesTabeldefinitie(bytes, formaat, tabelPagina);
  const rijen: Record<string, number | Uint8Array | null>[] = [];
  const leesRij = (
    pagina: Uint8Array,
    rij: number,
    diepte: number,
  ): Uint8Array | null => {
    const z = new DataView(pagina.buffer, pagina.byteOffset, pagina.byteLength);
    const offset = z.getUint16(14 + rij * 2, true);
    if (offset & 0x8000 && !diepte) return null;
    const start = offset & 0x1fff;
    const einde = rij
      ? z.getUint16(14 + (rij - 1) * 2, true) & 0x1fff
      : pagina.length;
    const inhoud = pagina.subarray(start, einde);
    if (!(offset & 0x4000)) return inhoud;
    if (diepte > 3) throw new Error("Te diepe overloopverwijzing.");
    const doel = leesPagina(
      bytes,
      formaat,
      inhoud[1] | (inhoud[2] << 8) | (inhoud[3] << 16),
    );
    return leesRij(doel, inhoud[0], diepte + 1);
  };
  const aantal = Math.floor(bytes.length / formaat.paginagrootte);
  for (let n = 1; n < aantal; n++) {
    if (bytes[n * formaat.paginagrootte] !== 0x01 && !formaat.sleutel) continue;
    const pagina = leesPagina(bytes, formaat, n);
    const z = new DataView(pagina.buffer, pagina.byteOffset, pagina.byteLength);
    if (pagina[0] !== 0x01 || z.getUint32(4, true) !== tabelPagina) continue;
    for (let r = 0; r < z.getUint16(12, true); r++) {
      const rij = leesRij(pagina, r, 0);
      if (!rij) continue;
      const rz = new DataView(rij.buffer, rij.byteOffset, rij.byteLength);
      const aantalKolommen = rz.getUint16(0, true);
      const maskerLengte = Math.ceil(aantalKolommen / 8);
      const masker = rij.subarray(rij.length - maskerLengte);
      const variabel = rz.getUint16(rij.length - maskerLengte - 2, true);
      const varOffset = (i: number) =>
        rz.getUint16(rij.length - maskerLengte - 4 - i * 2, true);
      const waarden: Record<string, number | Uint8Array | null> = {};
      for (const kolom of kolommen) {
        const aanwezig =
          kolom.nummer < aantalKolommen &&
          (masker[kolom.nummer >> 3] >> (kolom.nummer & 7)) & 1;
        const inhoud = !aanwezig
          ? null
          : kolom.vast
            ? rij.subarray(
                2 + kolom.vasteOffset,
                2 + kolom.vasteOffset + kolom.lengte,
              )
            : kolom.variabelIndex < variabel
              ? rij.subarray(
                  varOffset(kolom.variabelIndex),
                  varOffset(kolom.variabelIndex + 1),
                )
              : null;
        waarden[kolom.naam] =
          !inhoud || ![4, 9, 17].includes(kolom.type)
            ? null
            : kolom.type === 4
              ? inhoud.length === 4
                ? new DataView(inhoud.buffer, inhoud.byteOffset, 4).getInt32(
                    0,
                    true,
                  )
                : null
              : inhoud.slice();
      }
      rijen.push(waarden);
    }
  }
  return rijen;
}
