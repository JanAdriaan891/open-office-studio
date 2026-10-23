import { describe, expect, it } from "vitest";
import {
  allePaginas,
  leesNotities,
  nieuweNotities,
  NotitieBewaring,
  paginaAlsMarkdown,
  voegBackupToe,
  zoekPaginas,
} from "./model";

describe("Lokale notities", () => {
  it("laat een oude schrijver nooit nieuw werk van een ander venster overschrijven", () => {
    let waarde: string | null = null;
    const opslag = {
      getItem: () => waarde,
      setItem: (_sleutel: string, tekst: string) => {
        waarde = tekst;
      },
    };
    const eerste = new NotitieBewaring(opslag),
      tweede = new NotitieBewaring(opslag);
    const a = eerste.lees(),
      b = tweede.lees();
    eerste.schrijf(a);
    expect(() => tweede.schrijf(b)).toThrow("ander venster");
    expect(JSON.parse(waarde!)).toEqual(a);
  });
  it("behoudt de oude gegevens bij volle opslag en laat daarna opnieuw opslaan toe", () => {
    let waarde: string | null = null,
      vol = false;
    const opslag = {
      getItem: () => waarde,
      setItem: (_sleutel: string, tekst: string) => {
        if (vol) throw new Error("Opslag vol");
        waarde = tekst;
      },
    };
    const bewaring = new NotitieBewaring(opslag);
    const data = bewaring.lees();
    bewaring.schrijf(data);
    const bewaard = waarde;
    allePaginas(data)[0].pagina.titel = "Nieuw werk";
    vol = true;
    expect(() => bewaring.schrijf(data)).toThrow("Opslag vol");
    expect(waarde).toBe(bewaard);
    vol = false;
    bewaring.schrijf(data);
    expect(leesNotities(waarde!).boeken[0].secties[0].paginas[0].titel).toBe(
      "Nieuw werk",
    );
  });
  it("overschrijft onleesbare bestaande notities nooit met een leeg notitieboek", () => {
    let waarde = "beschadigde gegevens";
    const bewaring = new NotitieBewaring({
      getItem: () => waarde,
      setItem: (_sleutel, tekst) => {
        waarde = tekst;
      },
    });
    expect(() => bewaring.lees()).toThrow();
    expect(() => bewaring.schrijf(nieuweNotities())).toThrow(
      "niet overschreven",
    );
    expect(waarde).toBe("beschadigde gegevens");
  });
  it("bewaart opmaak, taken en tekst verliesloos in een eigen back-up", () => {
    const data = nieuweNotities();
    const pagina = allePaginas(data)[0].pagina;
    pagina.blokken[3].klaar = true;
    pagina.blokken[1].tekst = '<script>alert("voorbeeld")</script> & ideeën';
    pagina.blokken[1].vet = true;
    expect(leesNotities(JSON.stringify(data))).toEqual(data);
    expect(paginaAlsMarkdown(pagina)).toContain(
      "- [x] Een eerste idee vastleggen",
    );
    expect(paginaAlsMarkdown(pagina)).toContain("\\<script\\>");
  });
  it("zoekt over notitieboeken en secties, zonder verwijderde pagina’s", () => {
    const data = nieuweNotities();
    expect(zoekPaginas(data, "Ideeën computer")).toHaveLength(1);
    allePaginas(data)[0].pagina.verwijderd = true;
    expect(zoekPaginas(data, "computer")).toHaveLength(0);
    expect(zoekPaginas(data, "computer", true)).toHaveLength(1);
  });
  it("importeert dezelfde back-up zonder bestaande gegevens of identificaties te overschrijven", () => {
    const data = nieuweNotities();
    const samen = voegBackupToe(data, leesNotities(JSON.stringify(data)));
    expect(samen.boeken[0]).toEqual(data.boeken[0]);
    expect(samen.boeken[1].id).not.toBe(samen.boeken[0].id);
    expect(samen.boeken[1].naam).toBe("Mijn notitieboek (2)");
    expect(leesNotities(JSON.stringify(samen)).boeken).toHaveLength(2);
    expect(allePaginas(samen)[1].pagina.blokken[0].id).not.toBe(
      allePaginas(data)[0].pagina.blokken[0].id,
    );
  });
  it.each(["dubbel", "bloktype", "datum", "markering", "versie", "leeg"])(
    "weigert beschadigde back-ups: %s",
    (fout) => {
      const data = nieuweNotities();
      const pagina = allePaginas(data)[0].pagina;
      if (fout === "dubbel") pagina.id = data.boeken[0].id;
      if (fout === "bloktype")
        (pagina.blokken[0] as unknown as { soort: string }).soort = "html";
      if (fout === "datum") pagina.bijgewerkt = "geen datum";
      if (fout === "markering")
        (pagina as unknown as { vastgezet: string }).vastgezet = "ja";
      if (fout === "versie")
        (data as unknown as { versie: number }).versie = 99;
      if (fout === "leeg") pagina.blokken = [];
      expect(() => leesNotities(JSON.stringify(data))).toThrow();
    },
  );
});
