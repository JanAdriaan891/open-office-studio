export type BlokSoort = "tekst" | "kop" | "subkop" | "opsomming" | "taak";
export type Blok = {
  id: string;
  soort: BlokSoort;
  tekst: string;
  vet: boolean;
  cursief: boolean;
  klaar: boolean;
};
export type Pagina = {
  id: string;
  titel: string;
  bijgewerkt: string;
  vastgezet: boolean;
  verwijderd: boolean;
  blokken: Blok[];
};
export type Sectie = { id: string; naam: string; paginas: Pagina[] };
export type Notitieboek = { id: string; naam: string; secties: Sectie[] };
export type Notities = {
  formaat: "openaec-notities";
  versie: 1;
  boeken: Notitieboek[];
};
export const OPSLAGSLEUTEL = "openaec-notities-v1";
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const nieuwId = () => crypto.randomUUID();
export class NotitieBewaring {
  private verwacht: string | null = null;
  private geladen = false;
  constructor(private opslag: Pick<Storage, "getItem" | "setItem">) {}
  lees(): Notities {
    const ruw = this.opslag.getItem(OPSLAGSLEUTEL);
    const data = ruw === null ? nieuweNotities() : leesNotities(ruw);
    this.verwacht = ruw;
    this.geladen = true;
    return data;
  }
  schrijf(data: Notities) {
    if (!this.geladen)
      throw new Error(
        "De bestaande notities konden niet worden gelezen en zijn niet overschreven.",
      );
    if (this.opslag.getItem(OPSLAGSLEUTEL) !== this.verwacht)
      throw new Error(
        "De notities zijn in een ander venster gewijzigd. Maak een back-up van je huidige werk voordat je de lokale versie opnieuw opent.",
      );
    const tekst = JSON.stringify(data);
    leesNotities(tekst);
    this.opslag.setItem(OPSLAGSLEUTEL, tekst);
    this.verwacht = tekst;
  }
}
export function nieuwBlok(tekst = "", soort: BlokSoort = "tekst"): Blok {
  return {
    id: nieuwId(),
    soort,
    tekst,
    vet: false,
    cursief: false,
    klaar: false,
  };
}
export function nieuwePagina(titel = "Naamloze pagina"): Pagina {
  return {
    id: nieuwId(),
    titel,
    bijgewerkt: new Date().toISOString(),
    vastgezet: false,
    verwijderd: false,
    blokken: [nieuwBlok()],
  };
}
export function nieuweNotities(): Notities {
  return {
    formaat: "openaec-notities",
    versie: 1,
    boeken: [
      {
        id: nieuwId(),
        naam: "Mijn notitieboek",
        secties: [
          {
            id: nieuwId(),
            naam: "Ideeën",
            paginas: [
              {
                ...nieuwePagina("Ruimte voor je ideeën"),
                blokken: [
                  nieuwBlok(
                    "Een plek voor alles wat je wilt onthouden.",
                    "subkop",
                  ),
                  nieuwBlok(
                    "Verzamel je ideeën, maak een takenlijst of werk je overleg uit. Deel je notitieboek in met secties en pagina’s.",
                  ),
                  nieuwBlok("Vandaag", "kop"),
                  nieuwBlok("Een eerste idee vastleggen", "taak"),
                  nieuwBlok("Een eigen sectie aanmaken", "taak"),
                  nieuwBlok(
                    "Je notities blijven lokaal op deze computer. Maak regelmatig een back-up om ze mee te nemen naar een andere computer.",
                  ),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Accepteert uitsluitend tekstvelden en bekende bloktypen; invoer wordt nooit HTML. */
export function leesNotities(tekst: string): Notities {
  if (new TextEncoder().encode(tekst).length > MAX_BACKUP_BYTES)
    throw new Error("Kies een notitieback-up van maximaal 10 MB.");
  const data: unknown = JSON.parse(tekst);
  const ids = new Set<string>();
  let aantalPaginas = 0,
    aantalBlokken = 0;
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new Error("Ongeldige notitiestructuur.");
    return v as Record<string, unknown>;
  };
  const tekstveld = (v: unknown, max: number) => {
    if (typeof v !== "string" || v.length > max)
      throw new Error("Een tekstveld ontbreekt of is te lang.");
    return v;
  };
  const id = (v: unknown) => {
    const waarde = tekstveld(v, 100);
    if (!/^[a-zA-Z0-9_-]+$/.test(waarde) || ids.has(waarde))
      throw new Error(
        "Een onderdeel heeft een ontbrekende of dubbele identificatie.",
      );
    ids.add(waarde);
    return waarde;
  };
  const lijst = (v: unknown, max: number): unknown[] => {
    if (!Array.isArray(v) || !v.length || v.length > max)
      throw new Error("Een lijst is leeg of te groot.");
    return v;
  };
  const jaNee = (v: unknown) => {
    if (typeof v !== "boolean") throw new Error("Ongeldige markering.");
    return v;
  };
  const hoofd = object(data);
  if (hoofd.formaat !== "openaec-notities" || hoofd.versie !== 1)
    throw new Error("Dit is geen ondersteunde OpenAEC-notitieback-up.");
  const boeken = lijst(hoofd.boeken, 100).map((invoer) => {
    const boek = object(invoer);
    return {
      id: id(boek.id),
      naam: tekstveld(boek.naam, 200),
      secties: lijst(boek.secties, 200).map((invoer) => {
        const sectie = object(invoer);
        return {
          id: id(sectie.id),
          naam: tekstveld(sectie.naam, 200),
          paginas: lijst(sectie.paginas, 2000).map((invoer) => {
            if (++aantalPaginas > 5000)
              throw new Error("De back-up bevat te veel pagina’s.");
            const pagina = object(invoer);
            const bijgewerkt = tekstveld(pagina.bijgewerkt, 40);
            if (!Number.isFinite(Date.parse(bijgewerkt)))
              throw new Error("Ongeldige wijzigingsdatum.");
            return {
              id: id(pagina.id),
              titel: tekstveld(pagina.titel, 300),
              bijgewerkt,
              vastgezet: jaNee(pagina.vastgezet),
              verwijderd: jaNee(pagina.verwijderd),
              blokken: lijst(pagina.blokken, 2000).map((invoer): Blok => {
                if (++aantalBlokken > 30000)
                  throw new Error("De back-up bevat te veel tekstblokken.");
                const blok = object(invoer);
                if (
                  !["tekst", "kop", "subkop", "opsomming", "taak"].includes(
                    String(blok.soort),
                  )
                )
                  throw new Error("Onbekend tekstblok.");
                return {
                  id: id(blok.id),
                  soort: blok.soort as BlokSoort,
                  tekst: tekstveld(blok.tekst, 100000),
                  vet: jaNee(blok.vet),
                  cursief: jaNee(blok.cursief),
                  klaar: jaNee(blok.klaar),
                };
              }),
            };
          }),
        };
      }),
    };
  });
  return { formaat: "openaec-notities", versie: 1, boeken };
}

/** Import voegt toe met nieuwe identificaties; bestaande notities blijven behouden. */
export function voegBackupToe(huidig: Notities, backup: Notities): Notities {
  const namen = new Set(
    huidig.boeken.map((b) => b.naam.toLocaleLowerCase("nl")),
  );
  function uniekeNaam(naam: string) {
    const basis = naam || "Naamloos notitieboek";
    let resultaat = basis;
    let teller = 1;
    while (namen.has(resultaat.toLocaleLowerCase("nl")))
      resultaat = `${basis.slice(0, 185)} (${++teller})`;
    namen.add(resultaat.toLocaleLowerCase("nl"));
    return resultaat;
  }
  return {
    ...huidig,
    boeken: [
      ...huidig.boeken,
      ...backup.boeken.map((boek) => ({
        ...boek,
        naam: uniekeNaam(boek.naam),
        id: nieuwId(),
        secties: boek.secties.map((sectie) => ({
          ...sectie,
          id: nieuwId(),
          paginas: sectie.paginas.map((pagina) => ({
            ...pagina,
            id: nieuwId(),
            blokken: pagina.blokken.map((blok) => ({ ...blok, id: nieuwId() })),
          })),
        })),
      })),
    ],
  };
}
export function allePaginas(data: Notities) {
  return data.boeken.flatMap((boek) =>
    boek.secties.flatMap((sectie) =>
      sectie.paginas.map((pagina) => ({ boek, sectie, pagina })),
    ),
  );
}
export function zoekPaginas(
  data: Notities,
  zoekterm: string,
  prullenbak = false,
) {
  const woorden = zoekterm
    .toLocaleLowerCase("nl")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return allePaginas(data)
    .filter(({ boek, sectie, pagina }) => {
      if (pagina.verwijderd !== prullenbak) return false;
      if (!woorden.length) return true;
      const tekst = [
        boek.naam,
        sectie.naam,
        pagina.titel,
        ...pagina.blokken.map((b) => b.tekst),
      ]
        .join(" ")
        .toLocaleLowerCase("nl");
      return woorden.every((woord) => tekst.includes(woord));
    })
    .sort(
      (a, b) =>
        Number(b.pagina.vastgezet) - Number(a.pagina.vastgezet) ||
        b.pagina.bijgewerkt.localeCompare(a.pagina.bijgewerkt),
    );
}
export function paginaAlsMarkdown(pagina: Pagina) {
  const veilig = (tekst: string) => tekst.replace(/([\\`*_[\]<>])/g, "\\$1");
  return (
    `# ${veilig(pagina.titel || "Naamloze pagina")}\n\n` +
    pagina.blokken
      .map((blok) => {
        let tekst = veilig(blok.tekst);
        if (blok.vet) tekst = `**${tekst}**`;
        if (blok.cursief) tekst = `*${tekst}*`;
        const prefix =
          blok.soort === "kop"
            ? "## "
            : blok.soort === "subkop"
              ? "### "
              : blok.soort === "opsomming"
                ? "- "
                : blok.soort === "taak"
                  ? `- [${blok.klaar ? "x" : " "}] `
                  : "";
        return prefix + tekst.replace(/\n/g, prefix ? "\n  " : "\n");
      })
      .join("\n\n") +
    "\n"
  );
}
