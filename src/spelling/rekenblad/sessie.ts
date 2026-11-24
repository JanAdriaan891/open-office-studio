/**
 * Spellingcontrole van één werkmap: de documenttaal, fouten per celwaarde
 * (cache), de zichtbare golflijnen uit de weergavelijst van de engine, de
 * lijst voor het venster (F7) en vervangen als één ongedaan-maakstap.
 *
 * Alleen tekstcellen (geen getallen, datums, formules). Voor de golflijnen
 * alleen wat getekend is: de weergavelijst van het huidige frame geeft per
 * tekstregel positie, lettertype en uitlijning; de breedte van de woorden
 * meten we met hetzelfde canvaslettertype als de engine.
 */
import { cellAtPoint, type DisplayList, type TextCmd } from "@betteroffice/xlsx";
import type { XlsxEditorApi, XlsxPluginGeometry, XlsxPluginSelection } from "@betteroffice/xlsx-react";
import i18next from "../../i18n/config";
import { formatGetal } from "../../i18n/opmaak";
import { leesInstellingen } from "../../instellingen";
import type { Fout } from "../controleur";
import { spellingControleur } from "../dienst";
import type { Taal } from "../talen";
import type { DialoogTreffer } from "../gedeeld/Dialoog";
import { Tekstcache } from "../gedeeld/tekstcache";
import { gaNaarBlad } from "../../lint/rekenblad-opdrachten";
import { a1, canvasFont, context, fontPx, isTekstcel, ontleedA1, regelBegin, vervangInvoer, woordX } from "./logica";

export interface Golf {
  sleutel: string;
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  blad: number;
  row: number;
  col: number;
  waarde: string;
  fout: Fout;
}

/** Een fout in de werkmap, met de cel om hem te vervangen. */
export interface RekenbladTreffer extends DialoogTreffer {
  cel: { blad: number; row: number; col: number; waarde: string };
  fout: Fout;
}

export interface MenuStand {
  x: number;
  y: number;
  golf: Golf;
  suggesties: string[] | null;
}

let meetCtx: CanvasRenderingContext2D | null = null;
function meter(font: string) {
  meetCtx ??= document.createElement("canvas").getContext("2d");
  if (!meetCtx) return (t: string) => t.length * 6;
  meetCtx.font = font;
  return (t: string) => meetCtx!.measureText(t).width;
}

export class RekenbladSpelling {
  api: XlsxEditorApi | null = null;
  taal: Taal;
  readonly cache = new Tekstcache(spellingControleur);
  selectie: XlsxPluginSelection = null;
  aantal: number | null = null;
  probleem: string | null = null;
  menu: MenuStand | null = null;
  vensterOpen = false;
  /** De golflijnen van het laatst getekende frame (overlaypixels). */
  golven: Golf[] = [];
  overlay: HTMLElement | null = null;
  private luisteraars = new Set<() => void>();
  private versie = 0;
  private dl: { id: string; lijst: DisplayList } | null = null;
  private cellen: { sleutel: string; kaart: Map<string, string> } | null = null;
  private lijstCache: { versie: string; taal: Taal; stand: number; lijst: RekenbladTreffer[] } | null = null;
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
    this.lijstCache = null;
    this.meld();
    this.planTelling(0);
  }

  /** Woordenlijst of instellingen gewijzigd. */
  herbegin() {
    this.cache.wis();
    this.lijstCache = null;
    this.meld();
    this.planTelling(0);
  }

  /** Na een wijziging in de werkmap: de telling (statusbalk) kort uitgesteld bijwerken. */
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

  stop() {
    window.clearTimeout(this.telTimer);
  }

  // ------------------------------------------------------------ zichtbare golflijnen

  /** Tekstcellen in het getekende gebied: "rij,kolom" → waarde. */
  private tekstcellen(sheetId: string, rijen: number[], kolommen: number[]) {
    const api = this.api!;
    if (!rijen.length || !kolommen.length) return new Map<string, string>();
    const [r0, r1, c0, c1] = [Math.min(...rijen), Math.max(...rijen), Math.min(...kolommen), Math.max(...kolommen)];
    const sleutel = `${api.handle.version()}|${sheetId}|${r0}:${r1}|${c0}:${c1}`;
    if (this.cellen?.sleutel === sleutel) return this.cellen.kaart;
    const kaart = new Map<string, string>();
    const r = api.handle.readCells({
      ranges: [{ sheetId, range: { kind: "rowCol", start: { row: r0, col: c0 }, end: { row: r1, col: c1 } } }],
    });
    if (r.ok)
      r.ranges[0]?.cells.forEach((rij, i) =>
        rij.forEach((cel, j) => {
          if (isTekstcel(cel)) kaart.set(`${r0 + i},${c0 + j}`, (cel.value as { value: string }).value);
        }),
      );
    this.cellen = { sleutel, kaart };
    return kaart;
  }

  /** Berekent de golflijnen voor dit frame; vraagt ontbrekende waarden na bij de worker. */
  bereken(geometry: XlsxPluginGeometry): Golf[] {
    const api = this.api;
    if (!api || !this.aan || this.taal === "geen") return (this.golven = []);
    const l = geometry.layout;
    const info = api.handle.sheetInfo();
    const blad = info.sheetIds.indexOf(l.sheetId);
    if (blad < 0) return (this.golven = []);
    if (this.dl?.id !== l.id) this.dl = { id: l.id, lijst: api.handle.displayList(l.viewport) };
    const dl = this.dl.lijst;
    const grid = dl.grid;
    if (!grid) return (this.golven = []);
    const aantalRijen = grid.rowOffsets.length - 1;
    const aantalKol = grid.colOffsets.length - 1;
    const rijen = grid.rowIndices ?? Array.from({ length: aantalRijen }, (_, i) => grid.startRow + i);
    const kolommen = grid.colIndices ?? Array.from({ length: aantalKol }, (_, i) => grid.startCol + i);
    const cellen = this.tekstcellen(l.sheetId, rijen, kolommen);

    // Tekstregels per cel, op volgorde van boven naar onder.
    const perCel = new Map<string, { row: number; col: number; regels: TextCmd[] }>();
    for (const cmd of dl.commands) {
      if (cmd.op !== "text" || cmd.ghost || cmd.chart || !cmd.text.trim()) continue;
      const px = cmd.align === "right" ? cmd.x - 2 : cmd.align === "center" ? cmd.x : cmd.x + 2;
      const cel = cellAtPoint(grid, px, cmd.y - fontPx(cmd) * 0.3);
      if (!cel) continue;
      const k = `${cel.row},${cel.col}`;
      if (!cellen.has(k)) continue;
      let item = perCel.get(k);
      if (!item) perCel.set(k, (item = { row: cel.row, col: cel.col, regels: [] }));
      item.regels.push(cmd);
    }

    const ontbrekend: string[] = [];
    const golven: Golf[] = [];
    const zoom = l.zoom;
    for (const [k, { row, col, regels }] of perCel) {
      const waarde = cellen.get(k)!;
      const fouten = this.cache.lees(waarde, this.taal);
      if (fouten === undefined) {
        ontbrekend.push(waarde);
        continue;
      }
      if (!fouten.length) continue;
      regels.sort((a, b) => a.y - b.y);
      const begin = regelBegin(waarde, regels.map((r) => r.text));
      regels.forEach((cmd, i) => {
        const b = begin[i];
        if (b === null) return;
        const meet = meter(canvasFont(cmd));
        const hoogte = fontPx(cmd);
        for (const f of fouten) {
          if (f.start < b || f.eind > b + cmd.text.length) continue;
          const { x, breedte } = woordX(cmd, f.start - b, f.eind - b, meet);
          let x0 = x;
          let x1 = x + breedte;
          if (cmd.clip) {
            x0 = Math.max(x0, cmd.clip.x);
            x1 = Math.min(x1, cmd.clip.x + cmd.clip.w);
            if (x1 <= x0) continue;
          }
          const dikte = Math.max(2, Math.round(3 * zoom));
          golven.push({
            sleutel: `${row}:${col}:${f.start}:${i}`,
            x: x0 * zoom,
            y: (cmd.y + hoogte * 0.12) * zoom,
            breedte: (x1 - x0) * zoom,
            hoogte: dikte,
            blad,
            row,
            col,
            waarde,
            fout: f,
          });
        }
      });
    }
    if (ontbrekend.length)
      void this.cache
        .controleer(ontbrekend, this.taal)
        .then((nieuw) => nieuw && this.meld())
        .catch(() => {});
    return (this.golven = golven);
  }

  /** De golflijn onder een punt (clientcoördinaten). */
  golfOnder(x: number, y: number): Golf | null {
    const o = this.overlay?.getBoundingClientRect();
    if (!o) return null;
    const px = x - o.left;
    const py = y - o.top;
    return (
      this.golven.find(
        (g) => px >= g.x - 1 && px <= g.x + g.breedte + 1 && py >= g.y - g.hoogte * 6 && py <= g.y + g.hoogte * 2,
      ) ?? null
    );
  }

  async openMenu(x: number, y: number, golf: Golf) {
    this.menu = { x, y, golf, suggesties: null };
    this.meld();
    const s = await spellingControleur()
      .suggesties(golf.fout.tekst, golf.fout.taal, 5)
      .catch(() => [] as string[]);
    if (this.menu?.golf === golf) {
      this.menu = { ...this.menu, suggesties: s };
      this.meld();
    }
  }

  sluitMenu() {
    if (!this.menu) return;
    this.menu = null;
    this.meld();
  }

  // ------------------------------------------------------------ hele werkmap (F7, telling)

  /** Alle fouten in de werkmap in volgorde blad, rij, kolom, positie. */
  async lijst(): Promise<RekenbladTreffer[]> {
    const api = this.api;
    if (!api) return [];
    const versie = await api.version();
    const c = this.lijstCache;
    if (c && c.versie === versie && c.taal === this.taal && c.stand === this.cache.stand) return c.lijst;
    if (this.taal === "geen") return [];
    const uit = api.handle.exportStructured({ includeDefinedNames: false, maxCells: 200_000 });
    if (!uit.ok) throw new Error(uit.failure.message);
    const info = api.handle.sheetInfo();
    const cellen: { blad: number; naam: string; row: number; col: number; waarde: string }[] = [];
    for (const blad of uit.content.sheets) {
      if (blad.kind !== "worksheet") continue;
      // Het blad volgens het anker van de export (index en naam in de werkmap).
      const anker = blad.anchor.kind === "sheet" ? blad.anchor.sheet : null;
      const index = anker?.index ?? info.sheetIds.indexOf(blad.id);
      const naam = anker?.name ?? info.sheetNames[index] ?? "";
      if (index < 0) continue;
      for (const cel of blad.cells) {
        if (cel.formula !== null || cel.value.kind !== "text" || cel.anchor.kind !== "cell") continue;
        if (cel.merge && !cel.merge.origin) continue;
        const plek = ontleedA1(cel.anchor.a1);
        if (plek) cellen.push({ blad: index, naam, ...plek, waarde: cel.value.value });
      }
    }
    await this.cache.controleer(
      cellen.map((c) => c.waarde),
      this.taal,
    );
    const lijst: RekenbladTreffer[] = [];
    for (const cel of cellen) {
      for (const f of this.cache.lees(cel.waarde, this.taal) ?? []) {
        const ctx = context(cel.waarde, f);
        lijst.push({
          sleutel: `${cel.blad}:${cel.row}:${cel.col}:${f.start}:${f.tekst}`,
          positie: [cel.blad, cel.row, cel.col, f.start],
          woord: f.tekst,
          taal: f.taal,
          ...ctx,
          plek: `${cel.naam}!${a1(cel.row, cel.col)}`,
          cel: { blad: cel.blad, row: cel.row, col: cel.col, waarde: cel.waarde },
          fout: f,
        });
      }
    }
    lijst.sort((a, b) => a.positie.reduce((d, v, i) => d || v - b.positie[i], 0));
    this.lijstCache = { versie, taal: this.taal, stand: this.cache.stand, lijst };
    return lijst;
  }

  /** De selectie als beginpositie voor het venster. */
  startPositie(): number[] {
    const s = this.selectie;
    if (!s?.cells) return [this.api?.handle.sheetInfo().activeSheet ?? 0, 0, 0, 0];
    return [s.sheetIndex, s.cells.focus.row, s.cells.focus.col, 0];
  }

  async toon(blad: number, row: number, col: number) {
    const api = this.api;
    if (!api) return;
    await gaNaarBlad(api, blad);
    api.selectCells(blad, { anchor: { row, col }, focus: { row, col } });
  }

  /**
   * Vervangt fouten door `door`, per cel samengevoegd, als één
   * ongedaan-maakstap. Een cel die intussen veranderd is, blijft staan.
   */
  async vervang(plekken: readonly { blad: number; row: number; col: number; waarde: string; fout: Fout }[], door: string) {
    const api = this.api;
    if (!api || !plekken.length) return;
    const info = api.handle.sheetInfo();
    const perCel = new Map<string, { blad: number; row: number; col: number; waarde: string; fouten: Fout[] }>();
    for (const p of plekken) {
      const k = `${p.blad}:${p.row}:${p.col}`;
      let c = perCel.get(k);
      if (!c) perCel.set(k, (c = { blad: p.blad, row: p.row, col: p.col, waarde: p.waarde, fouten: [] }));
      c.fouten.push(p.fout);
    }
    const steps = [];
    for (const c of perCel.values()) {
      const invoer = api.handle.cell(c.blad, c.row, c.col).input;
      const nieuw = vervangInvoer(invoer, c.waarde, c.fouten, door);
      if (nieuw === null) continue;
      steps.push({
        op: "setCellInputs" as const,
        target: { sheetId: info.sheetIds[c.blad], range: { kind: "a1" as const, a1: a1(c.row, c.col) } },
        inputs: [[nieuw]],
        expect: { cells: [[{ value: { kind: "text" as const, value: c.waarde } }]] },
      });
    }
    if (!steps.length) return;
    const r = await api.applyEdits({ expectVersion: await api.version(), history: "separate", steps });
    if (!r.ok) throw new Error(r.failure.message);
  }
}

/** Korte status voor de statusbalk. */
export function spellingStatus(s: { aan: boolean; taal: Taal; aantal: number | null; probleem: string | null }) {
  if (!s.aan || s.taal === "geen") return null;
  if (s.probleem) return i18next.t("spelling:status.unavailable");
  if (s.aantal === null) return i18next.t("spelling:status.checking");
  if (s.aantal === 0) return i18next.t("spelling:status.noErrors");
  return i18next.t("spelling:status.errors", { count: s.aantal, errors: formatGetal(s.aantal) });
}
