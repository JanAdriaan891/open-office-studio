import { describe, expect, it, vi } from "vitest";
import { conceptOpslaanToets, toetsBuitenOpstelling } from "./opstel-sneltoetsen";

function toets(deel: Partial<Parameters<typeof conceptOpslaanToets>[0]> = {}) {
  const event = {
    key: "s",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    defaultPrevented: false,
    ...deel,
    preventDefault: vi.fn(() => {
      event.defaultPrevented = true;
    }),
  };
  return event;
}

describe("concept opslaan vanuit de modale opstelling", () => {
  it.each([
    { ctrlKey: true, metaKey: false, key: "s" },
    { ctrlKey: false, metaKey: true, key: "s" },
    { ctrlKey: true, metaKey: false, key: "S" },
  ])(
    "roept de Draft-callback eenmaal aan voor $key met Ctrl=$ctrlKey/Meta=$metaKey",
    (modifiers) => {
      const event = toets(modifiers);
      const bewaarConcept = vi.fn(async () => {
        expect(event.defaultPrevented).toBe(true);
      });
      expect(conceptOpslaanToets(event, false, bewaarConcept)).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(bewaarConcept).toHaveBeenCalledOnce();
      expect(bewaarConcept).toHaveBeenCalledWith();
    },
  );

  it.each([
    { ctrlKey: false },
    { ctrlKey: true, metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { key: "Escape" },
    { key: "Enter" },
    { key: "b" },
  ])("laat andere toetsen/modifiers aan hun eigen bediening: %j", (deel) => {
    const event = toets(deel),
      bewaren = vi.fn();
    expect(conceptOpslaanToets(event, false, bewaren)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(bewaren).not.toHaveBeenCalled();
  });

  it.each([
    { isComposing: true },
    { nativeEvent: { isComposing: true } },
    { keyCode: 229 },
    { nativeEvent: { keyCode: 229 } },
    { defaultPrevented: true },
  ])("onderschept geen actieve IME of al afgehandelde invoer: %j", (deel) => {
    const event = toets(deel),
      bewaren = vi.fn();
    expect(conceptOpslaanToets(event, false, bewaren)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(bewaren).not.toHaveBeenCalled();
  });

  it.each([
    { repeat: true, bezig: false },
    { repeat: false, bezig: true },
    { repeat: true, bezig: true },
  ])(
    "voorkomt browser-Save zonder dubbele Draft-aanroep: %j",
    ({ repeat, bezig }) => {
      const event = toets({ repeat }),
        bewaren = vi.fn();
      expect(conceptOpslaanToets(event, bezig, bewaren)).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(bewaren).not.toHaveBeenCalled();
    },
  );
});

describe("Ctrl+S terwijl de focus buiten het opstelvenster staat (#379)", () => {
  const venster = {};
  const doel = (binnen: string | null) => ({
    closest: (selector: string) => (binnen && selector.includes(binnen) ? {} : null),
  });

  it("neemt body/achtergrond over zodat de toets niet stil verdwijnt", () => {
    expect(toetsBuitenOpstelling(doel(null), venster)).toBe(true);
    expect(toetsBuitenOpstelling(null, venster)).toBe(true);
    const event = toets(),
      bewaren = vi.fn();
    if (toetsBuitenOpstelling(doel(null), venster))
      conceptOpslaanToets(event, false, bewaren);
    expect(bewaren).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it.each(["[role='dialog']", "[role='alertdialog']", "dialog", "[role='menu']"])(
    "laat toetsen binnen %s aan dat venster (geen dubbele of vreemde opslag)",
    (binnen) => {
      expect(toetsBuitenOpstelling(doel(binnen), venster)).toBe(false);
    },
  );

  it("doet niets zonder gekoppeld opstelvenster", () => {
    expect(toetsBuitenOpstelling(doel(null), null)).toBe(false);
  });
});
