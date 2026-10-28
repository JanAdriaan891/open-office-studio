/**
 * Spellingcontrole voor één geopend tekstdocument (Open Tekst Studio).
 *
 * Leest de alinea's via de plug-in-API van de engine (`readParagraphs`),
 * controleert alleen gewijzigde alinea's (gedebounced), houdt de fouten per
 * alinea bij en voert vervangingen uit als versiegecontroleerde edit-batch
 * (`applyEdits`, één ongedaan-maakstap). De golflijnen tekent de plug-in-
 * overlay (Golflijnen.tsx) uit deze gegevens.
 */
import type { DocxEditorRef, DocxPluginContext, DocxPluginGeometry } from "@betteroffice/docx-react";
import type { DocxEditStep } from "@betteroffice/docx/yrs";
import { leesInstellingen } from "../../instellingen";
import type { Controleur, Fout } from "../controleur";
import { standaardTaal, type Taal, type TaalId } from "../talen";
import { genegeerd, persoonlijk } from "../woordenlijst";
import { alineatalenUitDocx, wijsTalenToe, type Alineatalen } from "./taal";
import { autocorrectie, type Correctie } from "../autocorrectie";

export interface PluginStaat {
  /** Telt op bij elke nieuwe controle, zodat de overlay opnieuw tekent. */
  teller: number;
}

export interface Alinea {
  story: string;
  paraId: string;
  tekst: string;
  taal: Taal;
  fouten: Fout[];
}

export interface Plek {
  paraId: string;
  offset: number;
  story?: string;
}

export interface MenuStand {
  x: number;
  y: number;
  alinea: Alinea;
  fout: Fout;
  suggesties: string[] | null;
}

type Ctx = DocxPluginContext<PluginStaat>;

const VERTRAGING = 350;

export class SpellingSessie {
  /** Laatst gecontroleerde alinea's, in documentvolgorde. */
  alineas: Alinea[] = [];
  private perId = new Map<string, Alinea>();
  /** Alinea's waarvan de tekst sinds de laatste controle kan zijn gewijzigd. */
  private vuil = new Set<string>();
  private ctx: Ctx | null = null;
  /** De geometrie van de laatst getekende overlay. */
  geometrie: DocxPluginGeometry | null = null;
  /** Keuze van de gebruiker voor het hele document; null = uit w:lang. */
  documentTaal: Taal | null = null;
  /** Keuze per alinea (alleen deze sessie). */
  private alineaTaal = new Map<string, Taal>();
  private talen: Alineatalen | null = null;
  private timer = 0;
  private bezig: Promise<void> | null = null;
  private opnieuw = false;
  private laatsteWijziging = 0;
  /** Null zolang de eerste controle loopt. */
  aantal: number | null = null;
  probleem: string | null = null;
  menu: MenuStand | null = null;
  vensterOpen = false;
  private luisteraars = new Set<() => void>();
  private stand = 0;
  private gestopt = false;
  /** Aantal getypte tekens in het document (voor de autocorrectie). */
  toetsen = 0;

  constructor(
    readonly editor: () => DocxEditorRef | null,
    readonly controleur: () => Controleur,
    /** De bytes van het geladen DOCX (voor w:lang, zie taal.ts). */
    private readonly bytes: () => Uint8Array | null = () => null,
  ) {}

  // --- abonnement voor React (statusbalk, menu, venster) ---
  volg = (l: () => void) => {
    this.luisteraars.add(l);
    return () => {
      this.luisteraars.delete(l);
    };
  };
  leesStand = () => this.stand;
  meld() {
    this.stand++;
    this.luisteraars.forEach((l) => l());
  }

  /** Na `stop` weer starten (React StrictMode koppelt effecten twee keer). */
  start() {
    if (!this.gestopt) return;
    this.gestopt = false;
    this.plan(0);
  }

  stop() {
    this.gestopt = true;
    window.clearTimeout(this.timer);
  }

  get aan() {
    return leesInstellingen().spelling.controleren;
  }

  // --- plug-in-levenscyclus ---
  bijContext(ctx: Ctx) {
    this.ctx = ctx;
  }

  bijLaden(ctx: Ctx) {
    this.ctx = ctx;
    this.alineas = [];
    this.perId.clear();
    this.vuil.clear();
    this.talen = null;
    this.aantal = null;
    this.plan(0);
  }

  bijWijziging(ctx: Ctx) {
    this.ctx = ctx;
    this.laatsteWijziging = performance.now();
    const cursor = this.cursor();
    if (cursor) this.vuil.add(cursor.paraId);
    else this.vuil = new Set(this.perId.keys());
    this.plan(VERTRAGING);
  }

  plan(vertraging = VERTRAGING) {
    if (this.gestopt) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.controleer(), vertraging);
  }

  /** De cursor als alinea en offset, of null. */
  cursor(): Plek | null {
    const ed = this.editor()?.getEditorRef();
    const bereik = ed?.getSelectionRange();
    if (!ed || !bereik) return null;
    try {
      const loc = ed.displayPositionToYrsLoc(bereik.from);
      return loc ? { paraId: loc.paraId, offset: loc.offset, story: loc.story } : null;
    } catch {
      return null;
    }
  }

  /** De talen uit het geladen pakket (eenmalig per document gelezen). */
  private taalmodel(): Alineatalen {
    this.talen ??= alineatalenUitDocx(this.bytes());
    return this.talen;
  }

  /** De hoofdtekst en de tabelcellen daarin (kop- en voetteksten en noten niet). */
  private verhalen(): string[] {
    try {
      const ids = this.editor()?.getEditorRef()?.getYrsSession()?.storyIds() ?? ["body"];
      const uit = ids.filter((id) => id === "body" || /^body:t\d+:r\d+c\d+/.test(id));
      return uit.includes("body") ? uit : ["body", ...uit];
    } catch {
      return ["body"];
    }
  }

  /** De taal van het document: gekozen, of uit de standaardstijl, of van het systeem. */
  taalVanDocument(): Taal {
    return this.documentTaal ?? this.talen?.standaard ?? standaardTaal();
  }

  taalVanAlinea(paraId: string): Taal {
    return this.perId.get(paraId)?.taal ?? this.taalVanDocument();
  }

  kiesDocumentTaal(taal: Taal | null) {
    this.documentTaal = taal;
    this.alineaTaal.clear();
    this.herbegin();
  }

  kiesAlineaTaal(paraId: string, taal: Taal) {
    this.alineaTaal.set(paraId, taal);
    this.vuil.add(paraId);
    this.plan(0);
  }

  /** Alles opnieuw (andere taal, instelling of woordenlijst). */
  herbegin() {
    for (const a of this.alineas) a.tekst = "\u0000";
    this.plan(0);
  }

  /** Controleert de gewijzigde alinea's. Eén controle tegelijk. */
  async controleer(): Promise<void> {
    if (this.bezig) {
      this.opnieuw = true;
      return this.bezig;
    }
    this.bezig = this.voerControleUit().finally(() => {
      this.bezig = null;
      if (this.opnieuw) {
        this.opnieuw = false;
        this.plan(VERTRAGING);
      }
    });
    return this.bezig;
  }

  private async voerControleUit() {
    const ctx = this.ctx;
    if (!ctx || this.gestopt) return;
    if (!this.aan) {
      this.alineas = [];
      this.perId.clear();
      this.aantal = 0;
      this.herteken();
      return;
    }
    // Alle verhalen in één versie lezen (de hoofdtekst en elke tabelcel apart).
    const verhalen = this.verhalen();
    const gelezen: { story: string; paragraphs: { story: string; paraId: string; text: string }[] }[] = [];
    try {
      await ctx.run(async (vers) => {
        const uit = await Promise.all(verhalen.map((story) => vers.read.readParagraphs({ view: "accepted", story })));
        const versies = new Set<string>();
        uit.forEach((r, i) => {
          if ("ok" in r && r.ok) {
            versies.add(r.version);
            gelezen.push({ story: verhalen[i], paragraphs: r.paragraphs });
          }
        });
        // Tussendoor getypt: later opnieuw.
        if (versies.size > 1) gelezen.length = 0;
      });
    } catch {
      return;
    }
    if (!gelezen.length) {
      this.opnieuw = true;
      return;
    }
    const instelling = leesInstellingen().spelling;
    const { talen, plek } = this.taalmodel();
    const docTaal = this.taalVanDocument();
    const teControleren: Alinea[] = [];
    const maak = (p: { story: string; paraId: string; text: string }, i: number, uitModel: (Taal | null)[] | undefined) => {
      const taal = this.alineaTaal.get(p.paraId) ?? (this.documentTaal ? null : uitModel?.[i]) ?? docTaal;
      const oud = this.perId.get(p.paraId);
      if (oud && oud.tekst === p.text && oud.taal === taal && !this.vuil.has(p.paraId)) return oud;
      const a: Alinea = { story: p.story, paraId: p.paraId, tekst: p.text, taal, fouten: [] };
      teControleren.push(a);
      return a;
    };
    // Documentvolgorde: de cellen van een tabel komen na de alinea vóór die tabel.
    const perVerhaal = gelezen.map((v) => {
      const uitModel = wijsTalenToe(
        v.paragraphs.map((p) => p.text),
        talen.get(v.story),
      );
      return { story: v.story, alineas: v.paragraphs.map((p, i) => maak(p, i, uitModel)) };
    });
    const hoofd = perVerhaal.find((v) => v.story === "body")?.alineas ?? [];
    const cellen = perVerhaal.filter((v) => v.story !== "body");
    const nieuw: Alinea[] = [];
    for (let i = 0; i <= hoofd.length; i++) {
      for (const c of cellen) if ((plek.get(c.story) ?? hoofd.length) === i) nieuw.push(...c.alineas);
      if (i < hoofd.length) nieuw.push(hoofd[i]);
    }
    for (const c of cellen) if ((plek.get(c.story) ?? hoofd.length) > hoofd.length) nieuw.push(...c.alineas);
    try {
      const c = this.controleur();
      // U+FFFC (afbeelding, veld) is geen letter en breekt woorden netjes af.
      const uitkomst = await c.controleer(
        teControleren.map((a) => ({ tekst: a.tekst, taal: a.taal })),
        instelling,
      );
      // Niet onderstrepen terwijl iemand nog aan het woord typt (zoals Word).
      const cursor = performance.now() - this.laatsteWijziging < 1500 ? this.cursor() : null;
      teControleren.forEach((a, i) => {
        a.fouten = uitkomst[i].filter(
          (f) => !(cursor && cursor.paraId === a.paraId && f.eind === cursor.offset),
        );
        // Opnieuw bekijken zodra de cursor weg is.
        if (cursor && cursor.paraId === a.paraId && a.fouten.length !== uitkomst[i].length) a.tekst = "\u0000";
      });
      this.probleem = null;
    } catch (fout) {
      this.probleem = String((fout as Error)?.message ?? fout);
      this.aantal = null;
      this.meld();
      return;
    }
    // Is het document intussen veranderd, dan blijven de gewijzigde alinea's vuil.
    this.alineas = nieuw;
    this.perId = new Map(nieuw.map((a) => [a.paraId, a]));
    for (const a of teControleren) this.vuil.delete(a.paraId);
    this.aantal = nieuw.reduce((n, a) => n + a.fouten.length, 0);
    this.herteken();
  }

  private herteken() {
    void this.ctx
      ?.run((vers) => {
        vers.setState((s) => ({ teller: s.teller + 1 }));
      })
      .catch(() => {});
    this.meld();
  }

  /** Alinea's die de overlay mag tekenen (niet vuil). */
  zichtbareFouten(): { alinea: Alinea; fout: Fout }[] {
    const uit: { alinea: Alinea; fout: Fout }[] = [];
    for (const a of this.alineas) {
      if (this.vuil.has(a.paraId)) continue;
      for (const f of a.fouten)
        if (!persoonlijk.bevat(f.tekst) && !genegeerd.bevat(f.tekst)) uit.push({ alinea: a, fout: f });
    }
    return uit;
  }

  foutOp(plek: Plek): { alinea: Alinea; fout: Fout } | null {
    const a = this.perId.get(plek.paraId);
    if (!a || this.vuil.has(a.paraId)) return null;
    const f = a.fouten.find((f) => f.start <= plek.offset && plek.offset <= f.eind);
    if (!f || persoonlijk.bevat(f.tekst) || genegeerd.bevat(f.tekst)) return null;
    return { alinea: a, fout: f };
  }

  /** De eerste fout na `vanaf` (of vanaf het begin), met doorlopen naar het begin. */
  volgendeFout(vanaf: Plek | null, overslaan?: { paraId: string; start: number }): { alinea: Alinea; fout: Fout } | null {
    const lijst = this.zichtbareFouten();
    if (!lijst.length) return null;
    if (!vanaf) return lijst[0];
    const index = this.alineas.findIndex((a) => a.paraId === vanaf.paraId);
    const volgorde = new Map(this.alineas.map((a, i) => [a.paraId, i]));
    const na = lijst.find(({ alinea, fout }) => {
      const i = volgorde.get(alinea.paraId)!;
      if (overslaan && alinea.paraId === overslaan.paraId && fout.start === overslaan.start) return false;
      return i > index || (i === index && fout.start >= vanaf.offset);
    });
    return na ?? lijst.find(({ alinea, fout }) => !(overslaan && alinea.paraId === overslaan.paraId && fout.start === overslaan.start)) ?? null;
  }

  /** Selecteert een fout in de editor en scrolt ernaartoe. */
  selecteer(alinea: Alinea, fout: Fout) {
    const ed = this.editor()?.getEditorRef();
    if (!ed) return;
    const van = ed.yrsLocToDisplayPosition({ story: alinea.story, paraId: alinea.paraId, offset: fout.start });
    const tot = ed.yrsLocToDisplayPosition({ story: alinea.story, paraId: alinea.paraId, offset: fout.eind });
    if (van !== null && tot !== null) ed.highlightRange(van, tot);
  }

  /**
   * Vervangt fouten door nieuwe tekst als één edit-batch (één
   * ongedaan-maakstap). Leest eerst de huidige versie en controleert dat de
   * woorden er nog precies zo staan.
   */
  async vervang(doelen: readonly { alinea: Alinea; fout: Fout }[], nieuw: string): Promise<boolean> {
    const ctx = this.ctx;
    if (!ctx || !doelen.length) return false;
    let gelukt = false;
    await this.editor()?.flushPendingInput().catch(() => {});
    await ctx.run(async (vers) => {
      if (!vers.edits) return;
      const ids = [...new Set(doelen.map((d) => d.alinea.paraId))];
      const r = await vers.read.readParagraphs({ view: "accepted", paraIds: ids, story: doelen[0].alinea.story });
      if (!("ok" in r) || !r.ok) return;
      const huidig = new Map(r.paragraphs.map((p) => [p.paraId, p.text]));
      const stappen: DocxEditStep[] = [];
      for (const { alinea, fout } of doelen) {
        if (huidig.get(alinea.paraId)?.slice(fout.start, fout.eind) !== fout.tekst) continue;
        stappen.push({
          op: "replaceText",
          target: {
            kind: "range",
            story: alinea.story,
            start: { paraId: alinea.paraId, offset: fout.start },
            end: { paraId: alinea.paraId, offset: fout.eind },
            view: "accepted",
          },
          text: nieuw,
          expect: { text: fout.tekst },
        });
      }
      if (!stappen.length) return;
      const uit = await vers.edits.applyEdits({ expectVersion: r.version, steps: stappen });
      gelukt = "ok" in uit && uit.ok;
    });
    if (gelukt) {
      for (const { alinea } of doelen) this.vuil.add(alinea.paraId);
      this.plan(0);
    }
    return gelukt;
  }

  /** Alle plekken van hetzelfde onbekende woord (voor "Alles wijzigen"). */
  zelfdeFouten(woord: string, taal: TaalId) {
    return this.zichtbareFouten().filter(({ fout }) => fout.tekst === woord && fout.taal === taal);
  }

  negeerAlles(woord: string) {
    genegeerd.voegToe(woord);
    this.herteken();
  }

  voegToe(woord: string) {
    persoonlijk.voegToe(woord);
    this.herteken();
  }

  /**
   * Autocorrectie van het zojuist getypte woord (na een spatie of leesteken).
   * Eén edit-batch met bewaking: is er intussen verder getypt, dan weigert de
   * engine de batch (andere versie) en gebeurt er niets.
   */
  /**
   * Autocorrectie bij de toetsaanslag zelf, vóórdat de engine het
   * scheidingsteken invoegt: synchroon lezen (YrsSession.readParagraphs) en
   * vervangen via de invoerweg van de engine (setSelection + insertText).
   * Zo kan doortypen er niet tussen komen. Geeft "later" als de engine nog
   * invoer verwerkt (dan de asynchrone weg), anders of er gecorrigeerd is.
   */
  autocorrigeerBijToets(teken: string): boolean | "later" {
    const ed = this.editor()?.getEditorRef();
    const sessie = ed?.getYrsSession();
    if (!ed || !sessie) return "later";
    if (ed.hasPendingInput()) return "later";
    const bereik = ed.getSelectionRange();
    if (!bereik || bereik.from !== bereik.to) return false;
    const cursor = this.cursor();
    if (!cursor?.story) return false;
    let tekst: string;
    try {
      const r = sessie.readParagraphs({ view: "accepted", story: cursor.story, paraIds: [cursor.paraId] });
      if (!r.ok || !r.paragraphs[0]) return false;
      tekst = r.paragraphs[0].text;
    } catch {
      return "later";
    }
    const metTeken = tekst.slice(0, cursor.offset) + teken + tekst.slice(cursor.offset);
    const c = autocorrectie(metTeken, cursor.offset + 1, {
      taal: this.perId.get(cursor.paraId)?.taal ?? this.taalVanDocument(),
      uitzondering: (w) => persoonlijk.bevat(w) || genegeerd.bevat(w),
    });
    if (!c || c.eind > cursor.offset) return false;
    const loc = (offset: number) => ({ story: cursor.story!, paraId: cursor.paraId, offset });
    const van = ed.yrsLocToDisplayPosition(loc(c.start));
    const tot = ed.yrsLocToDisplayPosition(loc(c.eind));
    if (van === null || tot === null) return false;
    ed.setSelection(van, tot);
    ed.insertText(c.nieuw);
    return true;
  }

  autocorrigeer(teken?: string, volgnummer?: number): Promise<Correctie | null> {
    // Na elkaar: een correctie verschuift de tekst voor de volgende.
    const volgende = this.autoKetting.then(() => this.autocorrigeerNu(teken, volgnummer));
    this.autoKetting = volgende.catch(() => null);
    return volgende;
  }

  private autoKetting: Promise<unknown> = Promise.resolve();

  private async autocorrigeerNu(teken?: string, volgnummer?: number): Promise<Correctie | null> {
    const ctx = this.ctx;
    const ed = this.editor();
    if (!ctx || !ed) return null;
    await ed.flushPendingInput().catch(() => {});
    const begin = this.cursor();
    if (!begin) return null;
    let toegepast: Correctie | null = null;
    await ctx.run(async (vers) => {
      if (!vers.edits) return;
      const story = begin.story ?? "body";
      let c: Correctie | null = null;
      // Wie snel doortypt, maakt intussen een nieuwe versie: dan opnieuw lezen
      // en alleen toepassen als het woord er nog precies zo staat.
      for (let poging = 0; poging < 6 && !toegepast; poging++) {
        const r = await vers.read.readParagraphs({ view: "accepted", story, paraIds: [begin.paraId] });
        if (!("ok" in r) || !r.ok || !r.paragraphs[0]) return;
        const tekst = r.paragraphs[0].text;
        if (!c) {
          // Wie doortypt, staat al verder: tel terug hoeveel tekens er sinds het
          // scheidingsteken zijn getypt (cursor en teller direct na het lezen).
          const nu = this.cursor();
          if (!nu || nu.paraId !== begin.paraId) return;
          const erna = volgnummer === undefined ? 0 : Math.max(0, this.toetsen - volgnummer);
          const schatting = nu.offset - 1 - erna;
          const plek = teken
            ? [0, -1, 1, -2, 2, -3, 3].map((d) => schatting + d).find((p) => p >= 0 && tekst[p] === teken)
            : nu.offset - 1;
          if (plek === undefined) return;
          const cursor = { ...nu, offset: plek + 1 };
          const taal = this.perId.get(cursor.paraId)?.taal ?? this.taalVanDocument();
          c = autocorrectie(tekst, cursor.offset, {
            taal,
            uitzondering: (w) => persoonlijk.bevat(w) || genegeerd.bevat(w),
          });
          if (!c) return;
        } else if (tekst.slice(c.start, c.eind) !== c.oud) return;
        const uit = await vers.edits!.applyEdits({
          expectVersion: r.version,
          steps: [
            {
              op: "replaceText",
              target: {
                kind: "range",
                story,
                start: { paraId: begin.paraId, offset: c.start },
                end: { paraId: begin.paraId, offset: c.eind },
                view: "accepted",
              },
              text: c.nieuw,
              expect: { text: c.oud },
            },
          ],
        });
        if ("ok" in uit && uit.ok) toegepast = c;
        else if (!("failure" in uit) || (uit as { failure?: { code?: string } }).failure?.code !== "stale-version") return;
      }
    });
    return toegepast;
  }

  // --- rechtermuismenu ---
  async openMenu(x: number, y: number, alinea: Alinea, fout: Fout) {
    this.menu = { x, y, alinea, fout, suggesties: null };
    this.meld();
    let suggesties: string[] = [];
    try {
      suggesties = await this.controleur().suggesties(fout.tekst, fout.taal, 5);
    } catch {
      // Zonder suggesties blijft het menu bruikbaar.
    }
    if (this.menu?.fout === fout) {
      this.menu = { ...this.menu, suggesties };
      this.meld();
    }
  }

  sluitMenu() {
    if (!this.menu) return;
    this.menu = null;
    this.meld();
  }

  /** Zoekt de fout onder een schermpunt (voor het rechtermuismenu). */
  foutOnderPunt(x: number, y: number): { alinea: Alinea; fout: Fout } | null {
    const ref = this.editor();
    let punt: ReturnType<DocxEditorRef["getPositionAtPoint"]> = null;
    try {
      punt = ref?.getPositionAtPoint(x, y) ?? null;
    } catch {
      return null;
    }
    if (!punt || punt.region !== "body") return null;
    return this.foutOp({ paraId: punt.target.start.paraId, offset: punt.target.start.offset });
  }

  /** Ondersteunende tekst voor het venster: de zin rond de fout. */
  static context(alinea: Alinea, fout: Fout, marge = 60) {
    const begin = Math.max(0, fout.start - marge);
    const eind = Math.min(alinea.tekst.length, fout.eind + marge);
    let voor = alinea.tekst.slice(begin, fout.start);
    let na = alinea.tekst.slice(fout.eind, eind);
    // Afgebroken woorden aan de randen weglaten.
    if (begin > 0) voor = voor.replace(/^\S*\s/, "…");
    if (eind < alinea.tekst.length) na = na.replace(/\s\S*$/, "…");
    return { voor: voor.replace(/￼/g, ""), woord: fout.tekst, na: na.replace(/￼/g, "") };
  }
}
