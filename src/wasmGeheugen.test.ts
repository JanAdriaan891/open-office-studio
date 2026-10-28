import { describe, expect, it } from "vitest";
import { isEigenWasm } from "./wasmGeheugen";

describe("WASM in het geheugen", () => {
  const oorsprong = "http://localhost:4330";
  it("bewaart alleen WASM van de eigen oorsprong", () => {
    expect(isEigenWasm("/assets/docx_parse_bg-C4cA19mh.wasm", oorsprong)).toBe(
      true,
    );
    expect(
      isEigenWasm("http://localhost:4330/assets/a.wasm?v=1", oorsprong),
    ).toBe(true);
    expect(isEigenWasm("https://cdn.example.com/a.wasm", oorsprong)).toBe(
      false,
    );
    expect(isEigenWasm("/assets/index-CUxCrpfw.js", oorsprong)).toBe(false);
    expect(isEigenWasm("::kapot::", oorsprong)).toBe(false);
  });
});
