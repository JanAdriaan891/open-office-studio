import { describe, expect, it } from "vitest";
import { normaliseerInstellingen, pasToe, standaardInstellingen } from "./instellingen";

describe("instellingen", () => {
  it("valt terug op standaarden bij onbekende of beschadigde gegevens", () => {
    expect(normaliseerInstellingen(null)).toEqual(standaardInstellingen);
    expect(normaliseerInstellingen("tekst")).toEqual(standaardInstellingen);
    const raar = normaliseerInstellingen({
      thema: "paars",
      opslagformaat: { docx: "exe", xlsx: "ods" },
      herstelInterval: 999,
      lint: { compact: "ja" },
      statusbalk: { zoom: false },
      emailExterneInhoud: "altijd",
    });
    expect(raar.thema).toBe("forge");
    expect(raar.opslagformaat).toEqual({ docx: "docx", xlsx: "ods", pptx: "pptx" });
    expect(raar.herstelInterval).toBe(60);
    expect(raar.lint.compact).toBe(false);
    expect(raar.statusbalk.zoom).toBe(false);
    expect(raar.statusbalk.tekst).toBe(true);
    expect(raar.emailExterneInhoud).toBe("account");
  });

  it("begrenst het herstelinterval en rondt af", () => {
    expect(normaliseerInstellingen({ herstelInterval: -3 }).herstelInterval).toBe(0);
    expect(normaliseerInstellingen({ herstelInterval: 2.6 }).herstelInterval).toBe(3);
    expect(normaliseerInstellingen({ herstelInterval: "x" }).herstelInterval).toBe(5);
  });

  it("voegt geneste wijzigingen samen", () => {
    const na = pasToe(standaardInstellingen, { lint: { compact: true }, thema: "systeem" });
    expect(na.lint).toEqual({ compact: true, ingeklapt: false });
    expect(na.thema).toBe("systeem");
    expect(pasToe(na, { opslagformaat: { pptx: "odp" } }).opslagformaat).toEqual({
      docx: "docx",
      xlsx: "xlsx",
      pptx: "odp",
    });
  });
});
