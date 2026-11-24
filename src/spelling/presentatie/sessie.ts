/**
 * Spellingcontrole van één presentatie: tekst per verhaal (tekstvak,
 * tijdelijke aanduiding, tabelcel) en de notities, fouten uit de cache,
 * golflijnen uit de dia-indeling van de engine (`layoutSlide`: regels met
 * caretposities per verhaaloffset) en vervangen via `applyEdits`
 * (`replaceText`/`setSlideNotes`, één ongedaan-maakstap, met controle dat
 * de tekst nog klopt).
 */
import type { PptxStoryText, SlideDisplayList, SlidePrimitive, TextBoxPrimitive } from "@betteroffice/pptx";
import type { PptxEditorApi, PptxPluginGeometry, PptxPluginSelection } from "@betteroffice/pptx-react";
import i18next from "../../i18n/config";
import { leesInstellingen } from "../../instellingen";
import type { Fout } from "../controleur";
import { spellingControleur } from "../dienst";
import type { Taal } from "../talen";
import type { DialoogTreffer } from "../gedeeld/Dialoog";
import { Tekstcache } from "../gedeeld/tekstcache";
import { context } from "../rekenblad/logica";

export interface DiaGolf {
  sleutel: string;
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
}

/** Een plek met tekst: een verhaal op een dia, of de notities van een dia. */
export interface Verhaal {
  dia: number;
  slideId: string;
  /** null: de notities. */
  shapeId: string | null;
  storyId: string | null;
  volgorde: number;
  tekst: string;
}

export interface PresentatieTreffer extends DialoogTreffer {
  verhaal: Verhaal;
  fout: Fout;
}

export interface MenuStand {
  x: number;
  y: number;
  verhaal: Verhaal;
  fout: Fout;
  suggesties: string[] | null;
}

/** Alle tekstvakken van een dia, ook in tabellen. */
export function tekstvakken(primitieven: readonly SlidePrimitive[], uit: TextBoxPrimitive[] = []) {
  for (const p of primitieven) {
    if (p.kind === "textBox" && p.storyId) uit.push(p);
    else if (p.kind === "table") tekstvakken(p.primitives, uit);
  }
  return uit;
}

/** De x van een verhaaloffset in een regel (caretposities van de engine). */
export function caretX(regel: { x: number; caretStops: { position: number; x: number }[] }, positie: number) {
  const stops = regel.caretStops;
  if (!stops.length) return regel.x;
  let beste = stops[0];
  for (const s of stops) if (Math.abs(s.position - positie) < Math.abs(beste.position - positie)) beste = s;
  return beste.x;
}

export class PresentatieSpelling {
  api: PptxEditorApi | null = null;
  taal: Taal;
  readonly cache = new Tekstcache(spellingControleur);
  selectie: PptxPluginSelection = null;
  aantal: number | null = null;
  probleem: string | null = null;
  menu: MenuStand | null = null;
  vensterOpen = false;
  private luisteraars = new Set<() => void>();
  private versie = 0;
  private indeling: { sleutel: string; lijst: SlideDisplayList } | null = null;
  private inhoud: { versie: string; verhalen: Verhaal[] } | null = null;
  private telTimer = 0;

  constructor(taal: Taal) {
    this.taal = taal;
  }

  get aan() {
    return leesInstellingen().spelling.controleren;
  }

  volg = (l: () => void) => {
    this.luisteraars.add(l);
    return () => {
      this.luisteraars.delete(l);
    };
  };
  leesStand = () => this.versie;
  meld() {
    this.versie++;
    this.luisteraars.forEach((l) => l());
  }

  zetTaal(taal: Taal) {
    if (taal === this.taal) return;
    this.taal = taal;
    this.meld();
    this.planTelling(0);
  }

  herbegin() {
    this.cache.wis();
    this.meld();
    this.planTelling(0);
  }

  stop() {
    window.clearTimeout(this.telTimer);
  }

  planTelling(vertraging = 700) {
    window.clearTimeout(this.telTimer);
    this.telTimer = window.setTimeout(() => {
      if (!this.aan) {
        this.aantal = null;
        return this.meld();
      }
      void this.lijst()
        .then((l) => {
          this.aantal = l.length;
          this.probleem = null;
          this.meld();
        })
        .catch((e) => {
          this.probleem = e instanceof Error ? e.message : String(e);
          this.meld();
        });
    }, vertraging);
  }

  /** Alle verhalen en notities, in dia- en leesvolgorde (per versie gecachet). */
  verhalen(): Verhaal[] {
    const api = this.api;
    if (!api) return [];
    const versie = api.handle.version();
    if (this.inhoud?.versie === versie) return this.inhoud.verhalen;
    const r = api.handle.readContent();
    if (!r.ok) throw new Error(r.failure.message);
    const dia = new Map(r.slides.map((s, i) => [s.id, i + 1]));
    const verhalen: Verhaal[] = r.stories.map((s: PptxStoryText, i) => ({
      dia: dia.get(s.slideId) ?? 0,
      slideId: s.slideId,
      shapeId: s.shapeId,
      storyId: s.storyId,
      volgorde: i,
      tekst: s.text,
    }));
    r.slides.forEach((s, i) => {
      if (s.notes) verhalen.push({ dia: i + 1, slideId: s.id, shapeId: null, storyId: null, volgorde: 1e6, tekst: s.notes });
    });
    verhalen.sort((a, b) => a.dia - b.dia || a.volgorde - b.volgorde);
    this.inhoud = { versie, verhalen };
    return verhalen;
  }

  // ------------------------------------------------------------ golflijnen op de dia

  bereken(geometry: PptxPluginGeometry): DiaGolf[] {
    const api = this.api;
    if (!api || !this.aan || this.taal === "geen") return [];
    const l = geometry.layout;
    const sleutel = `${l.slide}|${l.version}`;
    if (this.indeling?.sleutel !== sleutel) {
      try {
        this.indeling = { sleutel, lijst: api.handle.layoutSlide(l.slide - 1) };
      } catch {
        return [];
      }
    }
    let verhalen: Verhaal[];
    try {
      verhalen = this.verhalen();
    } catch {
      return [];
    }
    const perVerhaal = new Map(verhalen.filter((v) => v.slideId === l.slideId && v.storyId).map((v) => [v.storyId!, v]));
    const sel = this.selectie?.target.kind === "text" ? this.selectie.target : null;
    const ontbrekend: string[] = [];
    const golven: DiaGolf[] = [];
    for (const vak of tekstvakken(this.indeling.lijst.primitives)) {
      const v = perVerhaal.get(vak.storyId!);
      if (!v) continue;
      const fouten = this.cache.lees(v.tekst, this.taal);
      if (fouten === undefined) {
        ontbrekend.push(v.tekst);
        continue;
      }
      for (const f of fouten) {
        // Het woord dat nog getypt wordt niet onderstrepen, zoals Word.
        if (sel && sel.storyId === v.storyId && sel.anchor === sel.focus && sel.focus === f.eind && !this.menu) continue;
        for (const regel of vak.lines) {
          const van = Math.max(f.start, regel.start);
          const tot = Math.min(f.eind, regel.end);
          if (tot <= van) continue;
          const x0 = caretX(regel, van);
          const x1 = caretX(regel, tot);
          if (x1 - x0 < 1) continue;
          const grootte = regel.runs[0]?.fontSizePx ?? regel.height * 0.8;
          const r = geometry.toOverlayRect({
            space: "slide-px",
            // Regels, basislijn en caretposities staan in diapixels vanaf de linkerbovenhoek van de dia.
            rect: { x: x0, y: regel.baseline + grootte * 0.08, width: x1 - x0, height: Math.max(grootte * 0.14, 2) },
          });
          if (r) golven.push({ sleutel: `${v.storyId}:${f.start}:${regel.start}`, x: r.x, y: r.y, breedte: r.width, hoogte: Math.max(2, Math.round(r.height)) });
        }
      }
    }
    if (ontbrekend.length)
      void this.cache
        .controleer(ontbrekend, this.taal)
        .then((nieuw) => nieuw && this.meld())
        .catch(() => {});
    return golven;
  }

  /** De fout onder de muis, via de treftest van de engine. */
  foutOnder(x: number, y: number): { verhaal: Verhaal; fout: Fout } | null {
    const api = this.api;
    if (!api || !this.aan) return null;
    const p = api.getPositionAtPoint(x, y);
    if (!p || p.kind !== "text") return null;
    const v = this.verhalen().find((s) => s.storyId === p.storyId && s.slideId === p.slideId);
    if (!v) return null;
    const f = (this.cache.lees(v.tekst, this.taal) ?? []).find((f) => p.position >= f.start && p.position <= f.eind);
    return f ? { verhaal: v, fout: f } : null;
  }

  async openMenu(x: number, y: number, verhaal: Verhaal, fout: Fout) {
    this.menu = { x, y, verhaal, fout, suggesties: null };
    this.meld();
    const s = await spellingControleur()
      .suggesties(fout.tekst, fout.taal, 5)
      .catch(() => [] as string[]);
    if (this.menu?.fout === fout) {
      this.menu = { ...this.menu, suggesties: s };
      this.meld();
    }
  }

  sluitMenu() {
    if (!this.menu) return;
    this.menu = null;
    this.meld();
  }

  // ------------------------------------------------------------ venster en vervangen

  async lijst(): Promise<PresentatieTreffer[]> {
    const api = this.api;
    if (!api || this.taal === "geen") return [];
    await api.flushPendingInput();
    const verhalen = this.verhalen();
    await this.cache.controleer(
      verhalen.map((v) => v.tekst),
      this.taal,
    );
    const lijst: PresentatieTreffer[] = [];
    for (const v of verhalen)
      for (const f of this.cache.lees(v.tekst, this.taal) ?? [])
        lijst.push({
          sleutel: `${v.slideId}:${v.storyId ?? "notities"}:${f.start}:${f.tekst}`,
          positie: [v.dia, v.volgorde, f.start],
          woord: f.tekst,
          taal: f.taal,
          ...context(v.tekst, f),
          plek: i18next.t(v.storyId ? "spelling:place.slide" : "spelling:place.slideNotes", { slide: v.dia }),
          verhaal: v,
          fout: f,
        });
    return lijst;
  }

  startPositie(): number[] {
    const s = this.selectie;
    if (!s) return [1, 0, 0];
    if (s.target.kind === "text") {
      const t = s.target;
      const v = this.verhalen().find((x) => x.storyId === t.storyId && x.slideId === s.slideId);
      return [s.slide, v?.volgorde ?? 0, Math.min(t.anchor, t.focus)];
    }
    return [s.slide, 0, 0];
  }

  toon(v: Verhaal, f: Fout) {
    const api = this.api;
    if (!api) return;
    if (v.storyId && v.shapeId) api.selectText({ slide: v.dia, shapeId: v.shapeId, storyId: v.storyId, start: f.start, end: f.eind });
    else api.goToSlide(v.dia);
  }

  /** Vervangt fouten door `door` als één ongedaan-maakstap. */
  async vervang(plekken: readonly { verhaal: Verhaal; fout: Fout }[], door: string) {
    const api = this.api;
    if (!api || !plekken.length) return;
    const versie = await api.version();
    const steps: Parameters<PptxEditorApi["applyEdits"]>[0]["steps"][number][] = [];
    const notities = new Map<string, { verhaal: Verhaal; fouten: Fout[] }>();
    // Van achter naar voren: eerdere offsets blijven geldig, hoe de engine de stappen ook toepast.
    const volgorde = [...plekken].sort((a, b) => b.fout.start - a.fout.start);
    for (const { verhaal: v, fout: f } of volgorde) {
      if (v.storyId && v.shapeId)
        steps.push({
          op: "replaceText",
          target: { kind: "range", slideId: v.slideId, shapeId: v.shapeId, storyId: v.storyId, start: f.start, end: f.eind },
          text: door,
          expect: { text: f.tekst },
        });
      else {
        const n = notities.get(v.slideId) ?? { verhaal: v, fouten: [] };
        n.fouten.push(f);
        notities.set(v.slideId, n);
      }
    }
    for (const { verhaal: v, fouten } of notities.values()) {
      let tekst = v.tekst;
      for (const f of [...fouten].sort((a, b) => b.start - a.start))
        if (tekst.slice(f.start, f.eind) === f.tekst) tekst = tekst.slice(0, f.start) + door + tekst.slice(f.eind);
      steps.push({ op: "setSlideNotes", target: { slideId: v.slideId }, text: tekst, expect: { text: v.tekst } });
    }
    const r = await api.applyEdits({ expectVersion: versie, history: "separate", steps });
    if (!r.ok) throw new Error(r.failure.message);
  }
}
