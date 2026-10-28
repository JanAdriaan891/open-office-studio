import { describe, expect, it } from "vitest";
import { volgendeIndex } from "./focus";

describe("lintnavigatie", () => {
  it("loopt rond met pijltjes en springt met Home en End", () => {
    expect(volgendeIndex("ArrowRight", 2, 3)).toBe(0);
    expect(volgendeIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(volgendeIndex("ArrowRight", -1, 3)).toBe(0);
    expect(volgendeIndex("Home", 2, 3)).toBe(0);
    expect(volgendeIndex("End", 0, 3)).toBe(2);
    expect(volgendeIndex("Enter", 0, 3)).toBeNull();
    expect(volgendeIndex("ArrowRight", 0, 0)).toBeNull();
  });
});
