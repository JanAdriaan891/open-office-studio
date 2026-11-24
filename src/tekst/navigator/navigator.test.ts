import { describe, expect, it } from "vitest";
import { andereKopstijl, bouwBoom, filterBoom, hoofdstukKoppen, tekstBegin, verhaalLengte, verplaatsOps, type Segment } from "./model";

const kop = (paraId: string, niveau: number, tekst = paraId) => ({ paraId, niveau, tekst });
const t = (text: string): Segment => ({ kind: "text", text, attributes: {} });
const p = (paraId: string): Segment => ({ kind: "pilcrow", paraId, properties: {}, attributes: {} });
const tabel: Segment = { kind: "embed", embedKind: "table", payload: {}, attributes: {} };

/** Past ruwe bewerkingen toe op een tekstweergave (¶ = alineagrens, [T] = tabel). */
function pasToe(segmenten: Segment[], ops: unknown[]) {
  let s = segmenten.map((d) => (d.kind === "text" ? d.text : d.kind === "pilcrow" ? "¶" : "T")).join("");
  for (const o of ops as { op: string; index: number; len?: number; text?: string; kind?: string }[]) {
    if (o.op === "delete") s = s.slice(0, o.index) + s.slice(o.index + o.len!);
    else if (o.op === "insert") s = s.slice(0, o.index) + o.text + s.slice(o.index);
    else s = s.slice(0, o.index) + (o.kind === "pilcrow" ? "¶" : "T") + s.slice(o.index);
  }
  return s;
}

describe("navigator", () => {
  it("bouwt en filtert de kopjesboom", () => {
    const boom = bouwBoom([kop("a", 0), kop("a1", 1), kop("a1x", 2), kop("b", 0), kop("b1", 2)]);
    expect(boom.map((k) => k.paraId)).toEqual(["a", "b"]);
    expect(boom[0].kinderen[0].kinderen[0].paraId).toBe("a1x");
    expect(boom[1].kinderen[0].paraId).toBe("b1");
    const gefilterd = filterBoom(boom, "A1X");
    expect(gefilterd.map((k) => k.paraId)).toEqual(["a"]);
    expect(gefilterd[0].kinderen[0].kinderen.map((k) => k.paraId)).toEqual(["a1x"]);
  });
  it("bepaalt welke koppen bij een hoofdstuk horen", () => {
    const lijst = [kop("a", 0), kop("a1", 1), kop("b", 0)];
    expect(hoofdstukKoppen(lijst, 0)).toEqual([0, 2]);
    expect(hoofdstukKoppen(lijst, 1)).toEqual([1, 2]);
    expect(hoofdstukKoppen(lijst, 2)).toEqual([2, 3]);
  });
  it("een tabel vóór een kop hoort bij het vorige hoofdstuk", () => {
    const seg = [t("A"), p("a"), t("x"), p("x"), tabel, t("B"), p("b")];
    expect(tekstBegin(seg, "a")).toBe(0);
    expect(tekstBegin(seg, "b")).toBe(5);
    expect(tekstBegin(seg, "zz")).toBeNull();
  });
  it("verplaatst een hoofdstuk vooruit en achteruit", () => {
    const seg = [t("A"), p("a"), t("a."), p("1"), t("B"), p("b"), t("b."), p("2"), t("C"), p("c")];
    // Hoofdstuk B (B¶b.¶) vóór A.
    const b = tekstBegin(seg, "b")!;
    const c = tekstBegin(seg, "c")!;
    expect(pasToe(seg, verplaatsOps(seg, b, c, 0)!)).toBe("B¶b.¶A¶a.¶C¶");
    // Hoofdstuk A naar vóór C.
    expect(pasToe(seg, verplaatsOps(seg, 0, b, c)!)).toBe("B¶b.¶A¶a.¶C¶");
    // Naar het eind: de rest schuift naar voren.
    expect(pasToe(seg, verplaatsOps(seg, b, verhaalLengte(seg), 0)!)).toBe("B¶b.¶C¶A¶a.¶");
    // Binnen het eigen bereik: niets.
    expect(verplaatsOps(seg, 0, b, 1)).toBeNull();
  });
  it("neemt alinea-id's mee bij het opnieuw invoegen", () => {
    const seg = [t("A"), p("a"), t("B"), p("b")];
    const ops = verplaatsOps(seg, 2, 4, 0) as { payload?: { paraId?: string } }[];
    expect(ops.find((o) => o.payload)?.payload?.paraId).toBe("b");
  });
  it("kiest de kopstijl van het nieuwe niveau", () => {
    expect(andereKopstijl("Heading2", 1, -1)).toBe("Heading1");
    expect(andereKopstijl("Kop1", 0, 1)).toBe("Kop2");
    expect(andereKopstijl("Heading1", 0, -1)).toBeNull();
    expect(andereKopstijl(undefined, 2, 1)).toBe("Heading4");
  });
});
