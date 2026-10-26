/**
 * Correctie op mdb-reader 3.2.0: die leest rijplaatsen met de verwijdervlag
 * (0x8000) gewoon mee en slaat juist de levende overlooprijen (0x4000, een
 * verwijzing naar de rij op een andere pagina) over. Na bewerkingen in Access
 * levert dat oude rijversies en dubbele sleutels op.
 *
 * Deze module scant de datapagina’s zelf (zoals mdbtools) en bepaalt per
 * record in de volgorde van mdb-reader (pagina’s oplopend volgens de
 * usage map, plaatsen oplopend, zonder 0x4000-plaatsen) of het een levende
 * rij is: vlag 0, of het doel van een levende overloopverwijzing.
 */
import { leesPagina, type RuwFormaat } from "../access-pagina.ts";

interface Pagina {
  nummer: number;
  vlaggen: number[];
}

export interface Datascan {
  paginas: Map<number, Pagina[]>;
  doelen: Set<string>;
}

/** Eén scan over het hele bestand: plaatsvlaggen per tabel en alle levende overloopdoelen. */
export function scanDatapaginas(bytes: Uint8Array, formaat: RuwFormaat): Datascan {
  const paginas = new Map<number, Pagina[]>();
  const doelen = new Set<string>();
  const kop = formaat.jet3 ? 8 : 12;
  const aantal = Math.floor(bytes.length / formaat.paginagrootte);
  for (let n = 1; n < aantal; n++) {
    if (bytes[n * formaat.paginagrootte] !== 0x01 && !formaat.sleutel) continue;
    const pagina = leesPagina(bytes, formaat, n);
    if (pagina[0] !== 0x01) continue;
    const z = new DataView(pagina.buffer, pagina.byteOffset, pagina.byteLength);
    const eigenaar = z.getUint32(4, true);
    const plaatsen = z.getUint16(kop, true);
    const vlaggen: number[] = [];
    for (let s = 0; s < plaatsen; s++) {
      const offset = z.getUint16(kop + 2 + s * 2, true);
      const vlag = offset & 0xc000;
      vlaggen.push(vlag);
      if (vlag === 0x4000) {
        const start = offset & 0x1fff;
        if (start + 4 <= pagina.length)
          doelen.add(`${pagina[start + 1] | (pagina[start + 2] << 8) | (pagina[start + 3] << 16)}:${pagina[start]}`);
      }
    }
    const lijst = paginas.get(eigenaar) ?? [];
    lijst.push({ nummer: n, vlaggen });
    paginas.set(eigenaar, lijst);
  }
  return { paginas, doelen };
}

/**
 * Per mdb-reader-record of het een levende rij is, of null als er niets te
 * corrigeren valt (alle records leven).
 */
export function levendeRecords(scan: Datascan, tabelPagina: number): boolean[] | null {
  const houden: boolean[] = [];
  let iets = false;
  for (const p of scan.paginas.get(tabelPagina) ?? []) {
    p.vlaggen.forEach((vlag, s) => {
      if (vlag & 0x4000) return;
      const levend = vlag === 0 || scan.doelen.has(`${p.nummer}:${s}`);
      if (!levend) iets = true;
      houden.push(levend);
    });
  }
  return iets ? houden : null;
}
