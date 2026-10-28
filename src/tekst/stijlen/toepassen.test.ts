import { describe, expect, it } from "vitest";
import { alineaRondCursor, selecteerHeleAlinea } from "./toepassen";

describe("alineastijl op de hele alinea", () => {
  it("selecteert de alinea alleen bij een cursor zonder selectie", () => {
    expect(alineaRondCursor({ from: 12, to: 12 }, 10, 40)).toEqual({ van: 10, tot: 40 });
    expect(alineaRondCursor({ from: 12, to: 18 }, 10, 40)).toBeNull();
    // Lege alinea of onbekende posities: niets te selecteren.
    expect(alineaRondCursor({ from: 10, to: 10 }, 10, 10)).toBeNull();
    expect(alineaRondCursor({ from: 10, to: 10 }, null, 40)).toBeNull();
  });

  it("selecteert en zet de cursor daarna terug", () => {
    const gezet: [number, number?][] = [];
    const editor = {
      getYrsSession: () => ({
        selection: () => ({ head: { story: "body", paraId: "p1", offset: 2 } }),
        paragraphs: () => [{ paraId: "p1", text: "Kopje", properties: {} }],
      }),
      getSelectionRange: () => ({ from: 7, to: 7 }),
      yrsLocToDisplayPosition: (loc: { offset: number }) => 5 + loc.offset,
      setSelection: (a: number, b?: number) => gezet.push([a, b]),
    };
    const herstel = selecteerHeleAlinea({ getEditorRef: () => editor } as never);
    expect(gezet).toEqual([[5, 10]]);
    herstel?.();
    expect(gezet).toEqual([[5, 10], [7, 7]]);
  });
});
