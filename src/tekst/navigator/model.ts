/**
 * Pure hulp voor de Navigator (F5): de kopjesboom, het bereik van een
 * hoofdstuk in de verhaalsegmenten, de ruwe bewerkingen om een hoofdstuk te
 * verplaatsen en het kopniveau ophogen of verlagen.
 */

export interface Kop {
  paraId: string;
  /** 0 = Kop 1. */
  niveau: number;
  tekst: string;
  styleId?: string;
}

export interface KopKnoop extends Kop {
  kinderen: KopKnoop[];
}

/** Bouwt een boom uit koppen in documentvolgorde (een sprong van niveau 1 naar 3 nest gewoon). */
export function bouwBoom(koppen: readonly Kop[]): KopKnoop[] {
  const wortel: KopKnoop[] = [];
  const stapel: KopKnoop[] = [];
  for (const k of koppen) {
    const knoop: KopKnoop = { ...k, kinderen: [] };
    while (stapel.length && stapel[stapel.length - 1].niveau >= k.niveau) stapel.pop();
    (stapel.length ? stapel[stapel.length - 1].kinderen : wortel).push(knoop);
    stapel.push(knoop);
  }
  return wortel;
}

/** Filtert de boom op tekst; een ouder blijft staan als een kind past. */
export function filterBoom(boom: readonly KopKnoop[], zoek: string): KopKnoop[] {
  const z = zoek.trim().toLocaleLowerCase();
  if (!z) return [...boom];
  const uit: KopKnoop[] = [];
  for (const k of boom) {
    const kinderen = filterBoom(k.kinderen, z);
    if (kinderen.length || k.tekst.toLocaleLowerCase().includes(z)) uit.push({ ...k, kinderen });
  }
  return uit;
}

/** Index van de koppen die bij het hoofdstuk van kop `i` horen: [i, eind). */
export function hoofdstukKoppen(koppen: readonly Kop[], i: number): [number, number] {
  let j = i + 1;
  while (j < koppen.length && koppen[j].niveau > koppen[i].niveau) j++;
  return [i, j];
}

/** Een segment zoals de sessie het geeft (alleen wat hier nodig is). */
export type Segment =
  | { kind: "text"; text: string; attributes: Record<string, unknown> }
  | { kind: "pilcrow"; paraId: string; properties: Record<string, unknown>; attributes: Record<string, unknown> }
  | { kind: "embed"; embedKind: string; payload: Record<string, unknown>; attributes: Record<string, unknown> };

const lengte = (s: Segment) => (s.kind === "text" ? s.text.length : 1);

/**
 * Ruwe beginpositie van de tekst van een alinea: na het einde van de vorige
 * alinea, maar na tabellen die vóór deze alinea staan (die horen bij het
 * voorgaande hoofdstuk).
 */
export function tekstBegin(segmenten: readonly Segment[], paraId: string): number | null {
  let positie = 0;
  let begin = 0;
  let inTabellen = true;
  for (const s of segmenten) {
    if (s.kind === "pilcrow") {
      if (s.paraId === paraId) return begin;
      positie += 1;
      begin = positie;
      inTabellen = true;
      continue;
    }
    if (inTabellen && s.kind === "embed" && s.embedKind === "table") {
      positie += 1;
      begin = positie;
      continue;
    }
    inTabellen = false;
    positie += lengte(s);
  }
  return null;
}

export const verhaalLengte = (segmenten: readonly Segment[]) => segmenten.reduce((n, s) => n + lengte(s), 0);

/** De segmenten tussen twee ruwe posities (tekst wordt bijgesneden). */
export function segmentenTussen(segmenten: readonly Segment[], van: number, tot: number): Segment[] {
  const uit: Segment[] = [];
  let positie = 0;
  for (const s of segmenten) {
    const l = lengte(s);
    if (positie + l > van && positie < tot)
      uit.push(s.kind === "text" ? { ...s, text: s.text.slice(Math.max(0, van - positie), Math.min(l, tot - positie)) } : s);
    positie += l;
    if (positie >= tot) break;
  }
  return uit;
}

/**
 * Ruwe bewerkingen die het bereik [van, tot) naar ruwe positie `doel` (in het
 * oorspronkelijke verhaal, buiten het bereik) verplaatsen: eerst verwijderen,
 * dan op de bijgewerkte plek opnieuw invoegen met dezelfde opmaak, embeds en
 * alinea-id's. Null als het bereik niets verplaatst.
 */
export function verplaatsOps(segmenten: readonly Segment[], van: number, tot: number, doel: number): unknown[] | null {
  if (tot <= van || (doel >= van && doel <= tot)) return null;
  const stuk = segmentenTussen(segmenten, van, tot);
  const ops: unknown[] = [{ op: "delete", index: van, len: tot - van }];
  let i = doel > tot ? doel - (tot - van) : doel;
  for (const s of stuk) {
    if (s.kind === "text") {
      if (!s.text) continue;
      ops.push({ op: "insert", index: i, text: s.text, attrs: s.attributes });
      i += s.text.length;
    } else {
      ops.push(
        s.kind === "pilcrow"
          ? { op: "insertEmbed", index: i, kind: "pilcrow", payload: { ...s.properties, paraId: s.paraId }, attrs: s.attributes }
          : { op: "insertEmbed", index: i, kind: s.embedKind, payload: s.payload, attrs: s.attributes },
      );
      i += 1;
    }
  }
  return ops;
}

/** De kopstijl één niveau hoger (-1) of lager (+1): Heading2 → Heading1; null als dat niet kan. */
export function andereKopstijl(styleId: string | undefined, niveau: number, stap: -1 | 1): string | null {
  const nieuw = niveau + stap;
  if (nieuw < 0 || nieuw > 8) return null;
  const m = /^(.*?)(\d)$/.exec(styleId ?? "");
  if (m) return `${m[1]}${nieuw + 1}`;
  return `Heading${nieuw + 1}`;
}

/** Tekst zonder objecttekens (U+FFFC), ingekort voor de lijst. */
export const schoon = (tekst: string, max = 120) => tekst.replace(/￼/g, "").replace(/\s+/g, " ").trim().slice(0, max);
