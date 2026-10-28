/**
 * Klein, formaatonafhankelijk documentmodel voor de eigen omzettingen
 * (TXT, Markdown, HTML, RTF → DOCX). Het dekt bewust alleen wat die
 * formaten gemeen hebben: koppen, alinea’s met basisopmaak, lijsten,
 * tabellen, code, citaten, koppelingen en afbeeldingen.
 */

export interface Tekstopmaak {
  vet?: boolean;
  cursief?: boolean;
  onderstreept?: boolean;
  doorgehaald?: boolean;
  code?: boolean;
  superschrift?: boolean;
  subschrift?: boolean;
  /** Puntgrootte. */
  grootte?: number;
  /** Hex-kleur zonder #, bijvoorbeeld "C00000". */
  kleur?: string;
  lettertype?: string;
}

export type Inline =
  | ({ soort: "tekst"; tekst: string; link?: string } & Tekstopmaak)
  | { soort: "regeleinde" }
  | { soort: "tab" }
  | {
      soort: "afbeelding";
      data: Uint8Array;
      type: "png" | "jpeg" | "gif";
      /** Breedte en hoogte in pixels (96 dpi), als bekend. */
      breedte?: number;
      hoogte?: number;
      alt?: string;
    };

export type Uitlijning = "links" | "midden" | "rechts" | "uitvullen";

export type Blok =
  | { soort: "alinea"; inhoud: Inline[]; uitlijning?: Uitlijning }
  | { soort: "kop"; niveau: 1 | 2 | 3 | 4 | 5 | 6; inhoud: Inline[] }
  | { soort: "lijst"; geordend: boolean; start?: number; items: Blok[][] }
  | { soort: "code"; tekst: string }
  | { soort: "citaat"; blokken: Blok[] }
  | {
      soort: "tabel";
      /** Eerste rij is een kopregel. */
      kop: boolean;
      rijen: Blok[][][];
    }
  | { soort: "lijn" }
  | { soort: "pagina-einde" };

export interface Tekstdocument {
  blokken: Blok[];
  titel?: string;
}

export function tekst(inhoud: string, opmaak: Tekstopmaak = {}): Inline {
  return { soort: "tekst", tekst: inhoud, ...opmaak };
}

/** Afbeeldingstype aan de eerste bytes herkennen; alleen PNG, JPEG en GIF. */
export function afbeeldingstype(
  data: Uint8Array,
): "png" | "jpeg" | "gif" | null {
  if (
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  )
    return "png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpeg";
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "gif";
  return null;
}

/** Afmetingen in pixels uit de kop van een PNG, GIF of JPEG. */
export function afbeeldingsmaat(
  data: Uint8Array,
): { breedte: number; hoogte: number } | null {
  const type = afbeeldingstype(data);
  const z = new DataView(data.buffer, data.byteOffset, data.byteLength);
  try {
    if (type === "png" && data.length >= 24)
      return { breedte: z.getUint32(16), hoogte: z.getUint32(20) };
    if (type === "gif" && data.length >= 10)
      return { breedte: z.getUint16(6, true), hoogte: z.getUint16(8, true) };
    if (type === "jpeg") {
      let i = 2;
      while (i + 9 < data.length) {
        if (data[i] !== 0xff) return null;
        const marker = data[i + 1];
        const lengte = z.getUint16(i + 2);
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          ![0xc4, 0xc8, 0xcc].includes(marker)
        )
          return { hoogte: z.getUint16(i + 5), breedte: z.getUint16(i + 7) };
        i += 2 + lengte;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Decodeert een data:-URL met base64 (alleen afbeeldingen). */
export function dataUrlAfbeelding(url: string): Uint8Array | null {
  const m = /^data:image\/(png|jpe?g|gif);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
    url.trim(),
  );
  if (!m) return null;
  try {
    const binair = atob(m[2].replace(/\s+/g, ""));
    const uit = new Uint8Array(binair.length);
    for (let i = 0; i < binair.length; i++) uit[i] = binair.charCodeAt(i);
    return afbeeldingstype(uit) ? uit : null;
  } catch {
    return null;
  }
}

/** Alleen veilige koppelingen komen in het document. */
export function veiligeLink(
  href: string | undefined | null,
): string | undefined {
  if (!href) return undefined;
  const schoon = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(schoon)) return schoon;
  if (/^#[\w-]+$/.test(schoon)) return undefined;
  return undefined;
}
