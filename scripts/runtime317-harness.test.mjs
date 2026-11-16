import { describe, it, expect } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { manifest, verify } from "./runtime317-artifacts.mjs";
import { interfaceState } from "./proef-runtime-interface.mjs";

describe("immutable native acceptance artifacts", () => {
  it("rejects other source points, modified installers and missing packages", async () => {
    const parent = resolve(".local");
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(parent, "runtime317-test-"));
    const commit = "a".repeat(40);
    try {
      const installer = join(root, "test.deb");
      await writeFile(installer, "original installer bytes");
      const recorded = await manifest(root, commit);
      await writeFile(
        join(root, "runtime317-packages.json"),
        JSON.stringify(recorded),
      );
      expect(await verify(root, commit)).toEqual(recorded);
      await expect(verify(root, "b".repeat(40))).rejects.toThrow("must match");
      const bytes = await readFile(installer);
      await writeFile(installer, "changed installer bytes");
      await expect(verify(root, commit)).rejects.toThrow("must match");
      await writeFile(installer, bytes);
      await writeFile(join(root, "second.AppImage"), "another installer");
      await expect(verify(root, commit)).rejects.toThrow("must match");
    } finally {
      const target = await realpath(root);
      expect(dirname(target)).toBe(await realpath(parent));
      expect(basename(target)).toMatch(/^runtime317-test-/);
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("native Writer readiness", () => {
  it("does not operate Save As while the existing editor is still loading or hidden", () => {
    const previous = globalThis.document;
    let editor = true,
      button,
      bounds = { x: 10, y: 10, width: 30, height: 20 };
    globalThis.document = {
      title: "converted.docx",
      activeElement: null,
      querySelector: (selector) =>
        selector.includes("yrs-input")
          ? editor
          : selector.includes("save-all")
            ? button
            : null,
      querySelectorAll: () => [],
    };
    try {
      expect(interfaceState().ready).toBe(false);
      button = {
        disabled: true,
        title: "Save as",
        getBoundingClientRect: () => bounds,
      };
      expect(interfaceState().ready).toBe(false);
      button.disabled = false;
      bounds.width = 0;
      expect(interfaceState().ready).toBe(false);
      bounds.width = 30;
      editor = false;
      expect(interfaceState().ready).toBe(false);
      editor = true;
      expect(interfaceState().ready).toBe(true);
      expect(interfaceState().button).toMatchObject({ x: 25, y: 20 });
    } finally {
      globalThis.document = previous;
    }
  });
});
