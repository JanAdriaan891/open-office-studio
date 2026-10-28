import type { Papier, Stand } from "./model";
/** Pure indelingsberekeningen voor hand-outs en notitiepagina's (zonder DOM, dus testbaar). */

export interface Rechthoek {
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
}

export const HANDOUT_AANTALLEN = [1, 2, 3, 4, 6, 9] as const;
export type HandoutAantal = (typeof HANDOUT_AANTALLEN)[number];

/** Rand, kop- en voetband van een hand-out- of notitiepagina, in punten. */
export const PAGINARAND = 36;
export const BAND = 22;

export function inhoudsvlak(breedte: number, hoogte: number): Rechthoek {
  return {
    x: PAGINARAND,
    y: PAGINARAND + BAND,
    breedte: breedte - 2 * PAGINARAND,
    hoogte: hoogte - 2 * PAGINARAND - 2 * BAND,
  };
}

/** Grootste rechthoek met verhouding `verhouding` (breedte/hoogte), gecentreerd in `vak`. */
export function pasIn(vak: Rechthoek, verhouding: number): Rechthoek {
  let breedte = vak.breedte;
  let hoogte = breedte / verhouding;
  if (hoogte > vak.hoogte) {
    hoogte = vak.hoogte;
    breedte = hoogte * verhouding;
  }
  return {
    x: vak.x + (vak.breedte - breedte) / 2,
    y: vak.y + (vak.hoogte - hoogte) / 2,
    breedte,
    hoogte,
  };
}

export interface HandoutVak {
  dia: Rechthoek;
  /** Bij drie per pagina: ruimte voor aantekeningen naast de dia. */
  regels?: Rechthoek;
}

/**
 * Plaatst `aantal` dia's op een pagina zoals PowerPoint dat doet: één groot,
 * twee onder elkaar, drie links met regels rechts, en roosters van 2×2, 2×3
 * en 3×3. Liggend draait de roosters om.
 */
export function handoutIndeling(
  aantal: HandoutAantal,
  paginaBreedte: number,
  paginaHoogte: number,
  verhouding: number,
): HandoutVak[] {
  const vlak = inhoudsvlak(paginaBreedte, paginaHoogte);
  const liggend = paginaBreedte > paginaHoogte;
  const tussenruimte = 14;
  if (aantal === 3) {
    const vakken: HandoutVak[] = [];
    const rijen = liggend ? 1 : 3;
    const kolommen = liggend ? 3 : 1;
    const celB = (vlak.breedte - (kolommen - 1) * tussenruimte) / kolommen;
    const celH = (vlak.hoogte - (rijen - 1) * tussenruimte) / rijen;
    for (let i = 0; i < 3; i++) {
      const r = liggend ? 0 : i;
      const k = liggend ? i : 0;
      const cel = {
        x: vlak.x + k * (celB + tussenruimte),
        y: vlak.y + r * (celH + tussenruimte),
        breedte: celB,
        hoogte: celH,
      };
      if (liggend) {
        const diaVak = { ...cel, hoogte: cel.hoogte * 0.45 };
        const dia = pasIn(diaVak, verhouding);
        vakken.push({
          dia,
          regels: {
            x: cel.x,
            y: diaVak.y + diaVak.hoogte + tussenruimte,
            breedte: cel.breedte,
            hoogte: cel.hoogte - diaVak.hoogte - tussenruimte,
          },
        });
      } else {
        const diaVak = { ...cel, breedte: cel.breedte * 0.5 - tussenruimte / 2 };
        const dia = pasIn(diaVak, verhouding);
        vakken.push({
          dia: { ...dia, x: diaVak.x },
          regels: {
            x: cel.x + cel.breedte * 0.5 + tussenruimte / 2,
            y: dia.y,
            breedte: cel.breedte * 0.5 - tussenruimte / 2,
            hoogte: dia.hoogte,
          },
        });
      }
    }
    return vakken;
  }
  const rooster: Record<number, [number, number]> = {
    1: [1, 1],
    2: [1, 2],
    4: [2, 2],
    6: [2, 3],
    9: [3, 3],
  };
  let [kolommen, rijen] = rooster[aantal];
  if (liggend) [kolommen, rijen] = [rijen, kolommen];
  const celB = (vlak.breedte - (kolommen - 1) * tussenruimte) / kolommen;
  const celH = (vlak.hoogte - (rijen - 1) * tussenruimte) / rijen;
  const vakken: HandoutVak[] = [];
  // Volgorde zoals PowerPoint: horizontaal, rij voor rij.
  for (let r = 0; r < rijen; r++)
    for (let k = 0; k < kolommen; k++)
      vakken.push({
        dia: pasIn(
          {
            x: vlak.x + k * (celB + tussenruimte),
            y: vlak.y + r * (celH + tussenruimte),
            breedte: celB,
            hoogte: celH,
          },
          verhouding,
        ),
      });
  return vakken;
}

/** Plaats van de dia en het notitievak op een notitiepagina. */
export function notitieIndeling(
  paginaBreedte: number,
  paginaHoogte: number,
  verhouding: number,
) {
  const vlak = inhoudsvlak(paginaBreedte, paginaHoogte);
  const diaVak = {
    x: vlak.x + vlak.breedte * 0.075,
    y: vlak.y,
    breedte: vlak.breedte * 0.85,
    hoogte: vlak.hoogte * 0.45,
  };
  const dia = pasIn(diaVak, verhouding);
  dia.y = vlak.y;
  const boven = dia.y + dia.hoogte + 24;
  return {
    dia,
    notities: {
      x: vlak.x,
      y: boven,
      breedte: vlak.breedte,
      hoogte: vlak.y + vlak.hoogte - boven,
    },
    vervolg: vlak,
  };
}

/** Verdeelt regels over pagina's: eerst `eerste` regels, daarna `volgende` per pagina. */
export function verdeelRegels<T>(regels: T[], eerste: number, volgende: number) {
  const delen: T[][] = [regels.slice(0, Math.max(1, eerste))];
  for (let i = Math.max(1, eerste); i < regels.length; i += Math.max(1, volgende))
    delen.push(regels.slice(i, i + Math.max(1, volgende)));
  return delen;
}

export type PresentatieIndeling = "dias" | "handout" | "notities";

export interface PresentatieInstellingen {
  indeling: PresentatieIndeling;
  /** Dia's per pagina bij hand-outs. */
  perPagina: HandoutAantal;
  /** "dia": pagina's op diagrootte (gebruikelijk voor PDF). */
  papier: Papier | "dia";
  stand: Stand;
  /** Dunne rand om elke dia. */
  kader: boolean;
}

export const standaardPresentatie = (
  indeling: PresentatieIndeling = "dias",
): PresentatieInstellingen => ({
  indeling,
  perPagina: 6,
  papier: indeling === "dias" ? "dia" : "A4",
  stand: indeling === "dias" ? "liggend" : "staand",
  kader: indeling !== "dias",
});

