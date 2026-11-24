/**
 * Wat de Navigator (F5) aan de engine vraagt: de onderdelen van het document
 * per categorie, springen, en bewerkingen via de Yrs-sessie (elk één
 * ongedaan-maakstap): hoofdstukken verplaatsen, promoveren en degraderen,
 * verwijderen en hernoemen.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import i18next from "../../i18n/config";
import { begin, engine, klaar, ruw, sluitStap, type Sessie } from "../gedeeld/engine";
import { afbeeldingDoelen, naarPlek, opmerkingDoelen, sectieDoelen, tabelDoelen } from "../zoeken/ganaar";
import { ontbrekendeStijl } from "../stijlen/model";
import { verhaalVolgorde } from "../zoeken/zoeken";
import { andereKopstijl, hoofdstukKoppen, schoon, tekstBegin, verhaalLengte, verplaatsOps, type Kop, type Segment } from "./model";

export interface Item {
  id: string;
  label: string;
  /** Extra regel (adres van een koppeling, auteur). */
  uitleg?: string;
  ga: () => void;
  verwijder?: () => void;
  /** Huidige naam bij hernoemen. */
  naam?: string;
  hernoem?: (naam: string) => void;
}

export interface Bladwijzer {
  naam: string;
  paraId: string;
  offset: number;
}

const segmentenVan = (s: Sessie, story = "body") => s.storySegments(story) as unknown as Segment[];

/** De koppen van de hoofdtekst met tekst en stijl. */
export function koppen(ref: DocxEditorRef): Kop[] {
  const { sessie } = engine(ref);
  const alineas = new Map(sessie.paragraphs("body").map((p) => [p.paraId, p]));
  return sessie.headings("body").map((k) => {
    const p = alineas.get(k.paraId);
    const bron = k.heading.source as { kind?: string; styleId?: string } | undefined;
    return {
      paraId: k.paraId,
      niveau: Math.max(0, Math.min(8, k.heading.outlineLevel ?? 0)),
      tekst: schoon(p?.text ?? "") || i18next.t("writer:find.goTo.labels.emptyHeading"),
      styleId: bron?.styleId ?? (p?.properties.pStyle as string | undefined),
    };
  });
}

/** Springt naar een plek; `focus` zet de focus in het document (anders blijft die in de Navigator). */
export function naarAlinea(ref: DocxEditorRef, paraId: string, offset = 0, lengte = 0, focus = false) {
  naarPlek(ref, { story: "body", paraId, offset }, lengte, focus);
}

/** Bladwijzers (zonder verborgen bladwijzers die met _ beginnen). */
export function bladwijzers(ref: DocxEditorRef): Bladwijzer[] {
  const { sessie } = engine(ref);
  const uit: Bladwijzer[] = [];
  for (const d of segmentenVan(sessie)) {
    if (d.kind !== "pilcrow") continue;
    const lijst = (d.properties.bookmarks ?? []) as { kind?: string; name?: string; offset?: number }[];
    for (const b of lijst) if (b.kind === "start" && b.name && !b.name.startsWith("_")) uit.push({ naam: b.name, paraId: d.paraId, offset: b.offset ?? 0 });
  }
  return uit;
}

function zetBladwijzers(ref: DocxEditorRef, paraId: string, wijzig: (lijst: { kind?: string; name?: string; id?: number }[]) => unknown[]) {
  const e = engine(ref);
  const p = segmentenVan(e.sessie).find((d) => d.kind === "pilcrow" && d.paraId === paraId);
  if (!p || p.kind !== "pilcrow") return;
  begin(e);
  e.sessie.setParagraphAttr(paraId, "bookmarks", wijzig([...((p.properties.bookmarks ?? []) as { kind?: string; name?: string; id?: number }[])]));
  klaar(e, ["body"]);
}

export function hernoemBladwijzer(ref: DocxEditorRef, b: Bladwijzer, naam: string) {
  const nieuw = naam.trim().replace(/\s+/g, "_").slice(0, 40);
  if (!nieuw || nieuw === b.naam) return;
  if (bladwijzers(ref).some((x) => x.naam.toLowerCase() === nieuw.toLowerCase())) throw new Error(i18next.t("writer:navigator.errors.bookmarkExists", { name: nieuw }));
  zetBladwijzers(ref, b.paraId, (lijst) => lijst.map((x) => (x.kind === "start" && x.name === b.naam ? { ...x, name: nieuw } : x)));
}

export function verwijderBladwijzer(ref: DocxEditorRef, b: Bladwijzer) {
  // Het einde hoort bij hetzelfde id; dat kan in een andere alinea staan.
  const e = engine(ref);
  let id: number | undefined;
  for (const d of segmentenVan(e.sessie))
    if (d.kind === "pilcrow")
      for (const x of (d.properties.bookmarks ?? []) as { kind?: string; name?: string; id?: number }[]) if (x.kind === "start" && x.name === b.naam) id = x.id;
  begin(e);
  for (const d of segmentenVan(e.sessie)) {
    if (d.kind !== "pilcrow") continue;
    const lijst = (d.properties.bookmarks ?? []) as { kind?: string; name?: string; id?: number }[];
    const rest = lijst.filter((x) => !(x.id === id && (x.kind === "start" || x.kind === "end")));
    if (rest.length !== lijst.length) e.sessie.setParagraphAttr(d.paraId, "bookmarks", rest);
  }
  klaar(e, ["body"]);
}

export interface Koppeling {
  href: string;
  tekst: string;
  paraId: string;
  van: number;
  tot: number;
}

/** Koppelingen in de hoofdtekst (aaneengesloten tekst met hetzelfde adres samen). */
export function koppelingen(ref: DocxEditorRef): Koppeling[] {
  const { sessie } = engine(ref);
  const uit: Koppeling[] = [];
  let wachtend: Omit<Koppeling, "paraId">[] = [];
  let offset = 0;
  for (const d of segmentenVan(sessie)) {
    if (d.kind === "pilcrow") {
      uit.push(...wachtend.map((k) => ({ ...k, paraId: d.paraId })));
      wachtend = [];
      offset = 0;
      continue;
    }
    const l = d.kind === "text" ? d.text.length : 1;
    const href = d.kind === "text" ? (d.attributes.hyperlink as { href?: string } | undefined)?.href : undefined;
    const vorige = wachtend[wachtend.length - 1];
    if (href && d.kind === "text") {
      if (vorige && vorige.href === href && vorige.tot === offset) {
        vorige.tot += l;
        vorige.tekst += d.text;
      } else wachtend.push({ href, tekst: d.text, van: offset, tot: offset + l });
    }
    offset += l;
  }
  return uit;
}

export function verwijderKoppeling(ref: DocxEditorRef, k: Koppeling) {
  const e = engine(ref);
  begin(e);
  e.sessie.setHyperlink({ story: "body", start: { paraId: k.paraId, offset: k.van }, end: { paraId: k.paraId, offset: k.tot } }, null);
  klaar(e, ["body"]);
}

/** Ruw bereik van het hoofdstuk bij kop `i` (kop tot de volgende kop van gelijk of hoger niveau). */
function hoofdstukBereik(s: Sessie, lijst: readonly Kop[], i: number) {
  const segmenten = segmentenVan(s);
  const [, eind] = hoofdstukKoppen(lijst, i);
  const van = tekstBegin(segmenten, lijst[i].paraId);
  const tot = eind < lijst.length ? tekstBegin(segmenten, lijst[eind].paraId) : verhaalLengte(segmenten);
  if (van === null || tot === null) throw new Error(i18next.t("writer:navigator.errors.notFound"));
  return { segmenten, van, tot };
}

/**
 * Verplaatst het hoofdstuk van kop `bron` vóór kop `doel` (of naar het eind
 * bij `doel === null`). Eén ongedaan-maakstap.
 */
export function verplaatsHoofdstuk(ref: DocxEditorRef, bron: string, doel: string | null) {
  const e = engine(ref);
  const lijst = koppen(ref);
  const i = lijst.findIndex((k) => k.paraId === bron);
  if (i < 0) throw new Error(i18next.t("writer:navigator.errors.notFound"));
  const { segmenten, van, tot } = hoofdstukBereik(e.sessie, lijst, i);
  let ops: unknown[] | null;
  let nieuwBegin: number;
  if (doel === null) {
    // Naar het eind: de rest van het document (met de slotalinea) schuift vóór het hoofdstuk.
    const lengte = verhaalLengte(segmenten);
    ops = verplaatsOps(segmenten, tot, lengte, van);
    nieuwBegin = van + (lengte - tot);
  } else {
    const plek = tekstBegin(segmenten, doel);
    if (plek === null) throw new Error(i18next.t("writer:navigator.errors.notFound"));
    ops = verplaatsOps(segmenten, van, tot, plek);
    nieuwBegin = plek > tot ? plek - (tot - van) : plek;
  }
  if (!ops) return null;
  begin(e);
  try {
    ruw(e.sessie, "body", ops);
  } finally {
    klaar(e, e.sessie.storyIds());
  }
  // De engine geeft de verplaatste alinea's nieuwe id's: zoek de kop op zijn nieuwe plek.
  const nieuw = alineaBij(e.sessie, nieuwBegin);
  if (nieuw) naarAlinea(ref, nieuw);
  return nieuw;
}

/** De alinea waarin ruwe positie `index` van de hoofdtekst valt. */
function alineaBij(s: Sessie, index: number): string | null {
  for (const p of s.paragraphSpans("body")) {
    const span = s.locateParagraph("body", p.paraId);
    if (index >= span.start && index <= span.end) return p.paraId;
  }
  return null;
}

/** Hoogt (stap -1) of verlaagt (+1) het niveau van een kop, met of zonder onderliggende koppen. */
export async function wijzigNiveau(ref: DocxEditorRef, paraId: string, stap: -1 | 1, metOnderliggende = true) {
  const e = engine(ref);
  const lijst = koppen(ref);
  const i = lijst.findIndex((k) => k.paraId === paraId);
  if (i < 0) return;
  const [van, tot] = metOnderliggende ? hoofdstukKoppen(lijst, i) : [i, i + 1];
  const wijzigingen = lijst.slice(van, tot).map((k) => ({ k, stijl: andereKopstijl(k.styleId, k.niveau, stap) }));
  if (wijzigingen.some((w) => !w.stijl)) throw new Error(i18next.t("writer:navigator.errors.level"));
  const stijlen = ref.getDocument()?.package.styles;
  for (const w of wijzigingen) {
    const ontbreekt = ontbrekendeStijl(stijlen, w.stijl!);
    if (ontbreekt) throw new Error(ontbreekt);
  }
  // Via de stijlopdracht van de engine met de hele alinea geselecteerd: die
  // neemt ook de tekenopmaak en het overzichtsniveau van de stijl over (zie
  // stijlen/toepassen.ts). Alle koppen samen zijn één ongedaan-maakstap.
  begin(e);
  try {
    for (const { k, stijl } of wijzigingen) {
      const p = e.sessie.paragraphs("body").find((x) => x.paraId === k.paraId);
      const vanPos = e.weergave.yrsLocToDisplayPosition({ story: "body", paraId: k.paraId, offset: 0 });
      const totPos = e.weergave.yrsLocToDisplayPosition({ story: "body", paraId: k.paraId, offset: p?.text.length ?? 0 });
      if (vanPos === null || totPos === null) continue;
      e.weergave.setSelection(vanPos, totPos);
      const uit = await ref.commands.execute("paragraphStyle", { styleId: stijl! });
      if (!uit.ok) throw new Error(uit.failure.message);
      // De engine zet bij het openen het overzichtsniveau van de stijl ook op de
      // alinea zelf; dat moet meeveranderen, anders blijft de kop op zijn oude niveau.
      const pilcrow = segmentenVan(e.sessie).find((d) => d.kind === "pilcrow" && d.paraId === k.paraId);
      if (pilcrow?.kind === "pilcrow" && pilcrow.properties.outlineLevel !== undefined)
        e.sessie.setParagraphAttr(k.paraId, "outlineLevel", k.niveau + stap);
    }
  } finally {
    e.weergave.syncYrsInputState(true, ["body"]);
    sluitStap(e);
  }
  naarAlinea(ref, paraId);
}

/** Verwijdert een hoofdstuk (kop met inhoud). */
export function verwijderHoofdstuk(ref: DocxEditorRef, paraId: string) {
  const e = engine(ref);
  const lijst = koppen(ref);
  const i = lijst.findIndex((k) => k.paraId === paraId);
  if (i < 0) return;
  const { segmenten, van, tot } = hoofdstukBereik(e.sessie, lijst, i);
  // De slotalinea (met de laatste alineagrens) blijft altijd staan.
  const eind = tot >= verhaalLengte(segmenten) ? tot - 1 : tot;
  if (eind <= van) return;
  begin(e);
  try {
    ruw(e.sessie, "body", [{ op: "delete", index: van, len: eind - van }]);
  } finally {
    klaar(e, e.sessie.storyIds());
  }
}

/** Vervangt de tekst van een kop (de opmaak van het begin blijft). */
export function hernoemKop(ref: DocxEditorRef, paraId: string, tekst: string) {
  const nieuw = tekst.replace(/\s+/g, " ").trim();
  if (!nieuw) return;
  const e = engine(ref);
  const p = e.sessie.paragraphs("body").find((x) => x.paraId === paraId);
  if (!p) return;
  // Alleen de tekst vóór het eerste object vervangen (velden en afbeeldingen blijven).
  const object = p.text.indexOf("￼");
  const eind = object < 0 ? p.text.length : object;
  begin(e);
  try {
    e.sessie.replaceRange({ story: "body", start: { paraId, offset: 0 }, end: { paraId, offset: eind } }, nieuw);
  } finally {
    klaar(e, ["body"]);
  }
}

/** Verwijdert de tabel met dit volgnummer in de hoofdtekst. */
export function verwijderTabel(ref: DocxEditorRef, tableIndex: number) {
  const e = engine(ref);
  begin(e);
  try {
    e.sessie.deleteTable({ story: "body", tableIndex });
  } finally {
    klaar(e, e.sessie.storyIds());
  }
}

/** Verwijdert de n-de afbeelding (0-gebaseerd) in de hoofdtekst. */
export function verwijderAfbeelding(ref: DocxEditorRef, n: number) {
  const e = engine(ref);
  let index = 0;
  let teller = 0;
  for (const d of segmentenVan(e.sessie)) {
    if (d.kind === "embed" && d.embedKind === "image") {
      if (teller === n) {
        begin(e);
        try {
          ruw(e.sessie, "body", [{ op: "delete", index, len: 1 }]);
        } finally {
          klaar(e, ["body"]);
        }
        return;
      }
      teller++;
    }
    index += d.kind === "text" ? d.text.length : 1;
  }
}

/** Per tabel (in de volgorde van Ga naar) het volgnummer in de hoofdtekst, of null als hij genest is. */
export function tabelIndexen(ref: DocxEditorRef): (number | null)[] {
  const { sessie } = engine(ref);
  const uit: (number | null)[] = [];
  let inBody = 0;
  for (const verhaal of verhaalVolgorde(sessie))
    for (const d of sessie.storySegments(verhaal))
      if (d.kind === "embed" && d.embedKind === "table") uit.push(verhaal === "body" ? inBody++ : null);
  return uit;
}

/** Tabellen, afbeeldingen, opmerkingen en secties via de Ga naar-lijsten (#29). */
export const overige = {
  tabellen: (ref: DocxEditorRef) => tabelDoelen(ref),
  afbeeldingen: (ref: DocxEditorRef) => afbeeldingDoelen(ref),
  opmerkingen: (ref: DocxEditorRef) => opmerkingDoelen(ref),
  secties: (ref: DocxEditorRef) => sectieDoelen(ref),
};

/** De kop waarin een alinea valt (de laatste kop op of vóór die alinea). */
export function kopBijAlinea(ref: DocxEditorRef, paraId: string, lijst: readonly Kop[]): string | null {
  const { sessie } = engine(ref);
  const volgorde = new Map(sessie.paragraphs("body").map((p, i) => [p.paraId, i]));
  const plek = volgorde.get(paraId);
  if (plek === undefined) return null;
  let uit: string | null = null;
  for (const k of lijst) {
    const i = volgorde.get(k.paraId);
    if (i !== undefined && i <= plek) uit = k.paraId;
  }
  return uit;
}

