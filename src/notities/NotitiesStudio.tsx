import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  NotebookPen,
  Plus,
  FilePlus2,
  FolderPlus,
  Search,
  CheckSquare,
  List,
  Heading2,
  Type,
  Download,
  Upload,
  Pin,
  Trash2,
  RotateCcw,
  CalendarDays,
  Pencil,
  Check,
  X,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { Actie, Groep, Ribbon } from "../Ribbon";
import {
  allePaginas,
  leesNotities,
  MAX_BACKUP_BYTES,
  nieuwBlok,
  nieuwId,
  nieuwePagina,
  NotitieBewaring,
  OPSLAGSLEUTEL,
  paginaAlsMarkdown,
  voegBackupToe,
  zoekPaginas,
  type Blok,
  type BlokSoort,
  type Notities,
} from "./model";
import "./notities.css";

export type NotitieActies = { openen: () => void; bewaren: () => boolean };

async function bewaarBestand(naam: string, tekst: string) {
  const bytes = new TextEncoder().encode(tekst);
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    const pad = await invoke<string | null>("bewaar_kopie", bytes, {
      headers: { "x-office-naam": encodeURIComponent(naam) },
    });
    return pad ? `Opgeslagen: ${pad}` : "Opslaan geannuleerd.";
  }
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: naam.endsWith(".md")
        ? "text/markdown;charset=utf-8"
        : "application/json;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = naam;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "Download aangevraagd. Controleer het bestand in je downloads.";
}

function TekstBlok({
  blok,
  actief,
  wijzig,
  kies,
  splits,
  verwijder,
}: {
  blok: Blok;
  actief: boolean;
  wijzig: (patch: Partial<Blok>) => void;
  kies: () => void;
  splits: (positie: number, einde: number) => void;
  verwijder: () => void;
}) {
  const veld = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!veld.current) return;
    veld.current.style.height = "0";
    veld.current.style.height = `${veld.current.scrollHeight}px`;
  }, [blok.tekst, blok.soort, blok.vet, blok.cursief]);
  return (
    <div
      className={`notities-blok is-${blok.soort} ${actief ? "is-actief" : ""} ${blok.klaar && blok.soort === "taak" ? "is-klaar" : ""}`}
    >
      {blok.soort === "taak" && (
        <input
          type="checkbox"
          checked={blok.klaar}
          onChange={(e) => wijzig({ klaar: e.target.checked })}
          aria-label={`Taak afronden: ${blok.tekst || "Naamloos"}`}
        />
      )}
      {blok.soort === "opsomming" && (
        <span className="notities-punt" aria-hidden="true">
          •
        </span>
      )}
      <textarea
        ref={veld}
        aria-label={
          blok.soort === "taak"
            ? "Taaktekst"
            : blok.soort === "kop" || blok.soort === "subkop"
              ? "Koptekst"
              : "Notitietekst"
        }
        value={blok.tekst}
        maxLength={100000}
        rows={1}
        placeholder={
          blok.soort === "taak" ? "Wat wil je doen?" : "Schrijf iets…"
        }
        style={{
          fontWeight: blok.vet ? 700 : undefined,
          fontStyle: blok.cursief ? "italic" : undefined,
        }}
        onFocus={kies}
        onChange={(e) => wijzig({ tekst: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            splits(
              e.currentTarget.selectionStart,
              e.currentTarget.selectionEnd,
            );
          }
          if (e.key === "Backspace" && !blok.tekst) {
            e.preventDefault();
            verwijder();
          }
        }}
      />
    </div>
  );
}

export default function NotitiesStudio({
  bestandsmenu,
  inactief,
  registreer,
  onOnopgeslagen,
}: {
  bestandsmenu: () => void;
  inactief: boolean;
  registreer: (acties: NotitieActies | null) => void;
  onOnopgeslagen: (waarde: boolean) => void;
}) {
  const [start] = useState(() => {
    let opslag: NotitieBewaring | null = null;
    try {
      opslag = new NotitieBewaring(window.localStorage);
      const nieuw = window.localStorage.getItem(OPSLAGSLEUTEL) === null;
      return { opslag, data: opslag.lees(), fout: "", nieuw };
    } catch (e) {
      return {
        opslag,
        data: null,
        nieuw: false,
        fout: `Lokale notities konden niet worden gelezen: ${String(e)}. Bestaande gegevens zijn niet overschreven.`,
      };
    }
  });
  const [data, setData] = useState<Notities | null>(start.data);
  const dataRef = useRef(data),
    vuil = useRef(false),
    opslag = useRef(start.opslag);
  const [fout, setFout] = useState(start.fout),
    [melding, setMelding] = useState(""),
    [status, setStatus] = useState(
      start.data ? "Lokaal opgeslagen" : "Opslag niet beschikbaar",
    );
  const eerste = start.data
    ? (allePaginas(start.data).find(({ pagina }) => !pagina.verwijderd) ??
      allePaginas(start.data)[0])
    : null;
  const [boekId, setBoekId] = useState(eerste?.boek.id ?? ""),
    [sectieId, setSectieId] = useState(eerste?.sectie.id ?? ""),
    [paginaId, setPaginaId] = useState(eerste?.pagina.id ?? ""),
    [blokId, setBlokId] = useState(eerste?.pagina.blokken[0].id ?? "");
  const [zoekterm, setZoekterm] = useState(""),
    [prullenbak, setPrullenbak] = useState(false),
    [exportBezig, setExportBezig] = useState(false);
  const [naamveld, setNaamveld] = useState<{
    soort: "boek" | "sectie";
    waarde: string;
  } | null>(null);
  const invoer = useRef<HTMLInputElement>(null),
    inhoud = useRef<HTMLDivElement>(null),
    zoekveld = useRef<HTMLInputElement>(null);
  const bewaarRef = useRef<() => boolean>(() => true);
  const boek = data?.boeken.find((b) => b.id === boekId) ?? data?.boeken[0];
  const sectie =
    boek?.secties.find((s) => s.id === sectieId) ?? boek?.secties[0];
  const selectie = data
    ? allePaginas(data).find(({ pagina }) => pagina.id === paginaId)
    : undefined;
  const pagina = selectie?.pagina;
  const actiefBlok = pagina?.blokken.find((b) => b.id === blokId);
  const resultaten = data
    ? zoekPaginas(data, zoekterm, prullenbak).filter(
        (r) => zoekterm.trim() || prullenbak || r.sectie.id === sectie?.id,
      )
    : [];

  function wijzigen(nieuw: Notities) {
    dataRef.current = nieuw;
    vuil.current = true;
    onOnopgeslagen(true);
    setData(nieuw);
    setStatus("Opslaan…");
  }
  function bewaren() {
    if (!vuil.current) return true;
    try {
      if (!dataRef.current || !opslag.current)
        throw new Error("Lokale opslag is niet beschikbaar.");
      opslag.current.schrijf(dataRef.current);
      vuil.current = false;
      onOnopgeslagen(false);
      setStatus("Lokaal opgeslagen");
      setFout("");
      return true;
    } catch (e) {
      setFout(
        `Automatisch opslaan mislukt: ${String(e)} Maak een back-up om je huidige werk te bewaren.`,
      );
      setStatus("Niet opgeslagen");
      return false;
    }
  }
  bewaarRef.current = bewaren;
  useEffect(() => {
    if (start.nieuw && dataRef.current) {
      vuil.current = true;
      onOnopgeslagen(true);
      bewaarRef.current();
    }
  }, [start.nieuw, onOnopgeslagen]);
  useEffect(() => {
    if (!vuil.current) return;
    const timer = setTimeout(() => bewaarRef.current(), 350);
    return () => clearTimeout(timer);
  }, [data]);
  useEffect(() => {
    registreer({
      openen: () => invoer.current?.click(),
      bewaren: () => bewaarRef.current(),
    });
    return () => registreer(null);
  }, [registreer]);
  useEffect(() => {
    const extern = (e: StorageEvent) => {
      if (e.key !== OPSLAGSLEUTEL && e.key !== null) return;
      if (vuil.current) {
        setFout(
          "Een ander venster heeft de lokale notities gewijzigd. Je huidige werk is behouden; maak een back-up voordat je de lokale versie opnieuw opent.",
        );
        return;
      }
      try {
        const nieuw = opslag.current?.lees();
        if (nieuw) {
          dataRef.current = nieuw;
          setData(nieuw);
          setMelding("Lokale notities bijgewerkt vanuit een ander venster.");
        }
      } catch (e) {
        setFout(
          `Notities uit het andere venster konden niet worden gelezen: ${String(e)}`,
        );
      }
    };
    const toetsen = (e: KeyboardEvent) => {
      if (inactief) return;
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        zoekveld.current?.focus();
      }
    };
    window.addEventListener("storage", extern);
    window.addEventListener("keydown", toetsen);
    return () => {
      window.removeEventListener("storage", extern);
      window.removeEventListener("keydown", toetsen);
    };
  }, [inactief]);

  function wijzigPagina(patch: Partial<NonNullable<typeof pagina>>) {
    if (!dataRef.current || !pagina) return;
    wijzigen({
      ...dataRef.current,
      boeken: dataRef.current.boeken.map((b) => ({
        ...b,
        secties: b.secties.map((s) => ({
          ...s,
          paginas: s.paginas.map((p) =>
            p.id === pagina.id
              ? { ...p, ...patch, bijgewerkt: new Date().toISOString() }
              : p,
          ),
        })),
      })),
    });
  }
  function wijzigBlok(id: string, patch: Partial<Blok>) {
    if (pagina)
      wijzigPagina({
        blokken: pagina.blokken.map((b) =>
          b.id === id ? { ...b, ...patch } : b,
        ),
      });
  }
  function kiesPagina(id: string) {
    const r =
      dataRef.current &&
      allePaginas(dataRef.current).find(({ pagina }) => pagina.id === id);
    if (!r) return;
    setPaginaId(id);
    setBoekId(r.boek.id);
    setSectieId(r.sectie.id);
    setBlokId(r.pagina.blokken[0].id);
  }
  function focusBlok(id: string) {
    setBlokId(id);
    requestAnimationFrame(() =>
      inhoud.current
        ?.querySelector<HTMLTextAreaElement>(`[data-blok="${id}"] textarea`)
        ?.focus(),
    );
  }
  function voegBlokToe(soort: BlokSoort = "tekst", tekst = "") {
    if (!pagina || pagina.verwijderd || pagina.blokken.length >= 2000) return;
    const nieuw = nieuwBlok(tekst, soort);
    const index = pagina.blokken.findIndex((b) => b.id === blokId);
    const blokken = [...pagina.blokken];
    blokken.splice(index < 0 ? blokken.length : index + 1, 0, nieuw);
    wijzigPagina({ blokken });
    focusBlok(nieuw.id);
  }
  function splitsBlok(blok: Blok, positie: number, einde: number) {
    if (!pagina || pagina.blokken.length >= 2000) return;
    if (!blok.tekst && (blok.soort === "taak" || blok.soort === "opsomming")) {
      wijzigBlok(blok.id, { soort: "tekst" });
      return;
    }
    const nieuw = nieuwBlok(
      blok.tekst.slice(einde),
      blok.soort === "kop" || blok.soort === "subkop" ? "tekst" : blok.soort,
    );
    const index = pagina.blokken.findIndex((b) => b.id === blok.id);
    const blokken = [...pagina.blokken];
    blokken.splice(
      index,
      1,
      { ...blok, tekst: blok.tekst.slice(0, positie) },
      nieuw,
    );
    wijzigPagina({ blokken });
    focusBlok(nieuw.id);
  }
  function verwijderBlok(blok: Blok) {
    if (!pagina || pagina.blokken.length <= 1) return;
    const index = pagina.blokken.findIndex((b) => b.id === blok.id);
    const vorig = pagina.blokken[Math.max(0, index - 1)].id;
    wijzigPagina({ blokken: pagina.blokken.filter((b) => b.id !== blok.id) });
    focusBlok(vorig === blok.id ? pagina.blokken[1].id : vorig);
  }
  function nieuweInhoud(soort: "boek" | "sectie" | "pagina") {
    if (!data || !boek || !sectie) return;
    const p = nieuwePagina();
    const s = { id: nieuwId(), naam: "Nieuwe sectie", paginas: [p] };
    const b = { id: nieuwId(), naam: "Nieuw notitieboek", secties: [s] };
    if (
      (soort === "boek" && data.boeken.length >= 100) ||
      (soort === "sectie" && boek.secties.length >= 200) ||
      allePaginas(data).length >= 5000
    ) {
      setFout(
        "De maximale omvang is bereikt. Maak een back-up en gebruik een apart notitieboekbestand.",
      );
      return;
    }
    wijzigen({
      ...data,
      boeken:
        soort === "boek"
          ? [...data.boeken, b]
          : data.boeken.map((item) =>
              item.id !== boek.id
                ? item
                : {
                    ...item,
                    secties:
                      soort === "sectie"
                        ? [...item.secties, s]
                        : item.secties.map((item) =>
                            item.id !== sectie.id
                              ? item
                              : { ...item, paginas: [...item.paginas, p] },
                          ),
                  },
            ),
    });
    setBoekId(soort === "boek" ? b.id : boek.id);
    setSectieId(soort === "pagina" ? sectie.id : s.id);
    setPaginaId(p.id);
    setBlokId(p.blokken[0].id);
    setZoekterm("");
    setPrullenbak(false);
    if (soort !== "pagina")
      setNaamveld({ soort, waarde: soort === "boek" ? b.naam : s.naam });
    else
      requestAnimationFrame(() =>
        inhoud.current
          ?.querySelector<HTMLInputElement>(".notities-paginatitel")
          ?.focus(),
      );
  }
  function hernoem() {
    if (!data || !boek || !sectie || !naamveld?.waarde.trim()) return;
    wijzigen({
      ...data,
      boeken: data.boeken.map((b) =>
        b.id !== boek.id
          ? b
          : {
              ...b,
              naam: naamveld.soort === "boek" ? naamveld.waarde.trim() : b.naam,
              secties: b.secties.map((s) =>
                s.id === sectie.id && naamveld.soort === "sectie"
                  ? { ...s, naam: naamveld.waarde.trim() }
                  : s,
              ),
            },
      ),
    });
    setNaamveld(null);
  }
  async function exporteer(markdown = false, ruw = false) {
    if (exportBezig) return;
    setExportBezig(true);
    try {
      const tekst = ruw
        ? window.localStorage.getItem(OPSLAGSLEUTEL)
        : markdown && pagina
          ? paginaAlsMarkdown(pagina)
          : dataRef.current
            ? JSON.stringify(dataRef.current)
            : null;
      if (!tekst)
        throw new Error("Er zijn geen notities beschikbaar voor een back-up.");
      const naam =
        markdown && pagina
          ? `${(pagina.titel || "Notitie").replace(/[^\p{L}\p{N}\s_-]/gu, "").slice(0, 100)}.md`
          : `Notities-${new Date().toISOString().slice(0, 10)}.openaec-notities`;
      setMelding(await bewaarBestand(naam, tekst));
    } catch (e) {
      setFout(`Exporteren mislukt: ${String(e)}`);
    } finally {
      setExportBezig(false);
    }
  }
  const bewerkbaar = !!pagina && !pagina.verwijderd;
  const knoppen = (soort: BlokSoort) => () => {
    if (actiefBlok && bewerkbaar) {
      wijzigBlok(actiefBlok.id, { soort });
      focusBlok(actiefBlok.id);
    }
  };
  return (
    <section
      className="notities-studio"
      inert={inactief}
      aria-label="Notities Studio"
    >
      <Ribbon
        bestand={bestandsmenu}
        tabs={[
          {
            id: "start",
            naam: "Start",
            inhoud: (
              <>
                <Groep naam="Organiseren">
                  <Actie
                    icoon={NotebookPen}
                    naam="Notitieboek"
                    groot
                    disabled={!data}
                    onClick={() => nieuweInhoud("boek")}
                  />
                  <Actie
                    icoon={FolderPlus}
                    naam="Sectie"
                    groot
                    disabled={!data}
                    onClick={() => nieuweInhoud("sectie")}
                  />
                  <Actie
                    icoon={FilePlus2}
                    naam="Pagina"
                    groot
                    disabled={!data}
                    onClick={() => nieuweInhoud("pagina")}
                  />
                </Groep>
                <Groep naam="Tekst">
                  <Actie
                    icoon={Type}
                    naam="Tekst"
                    disabled={!bewerkbaar || !actiefBlok}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={knoppen("tekst")}
                  />
                  <Actie
                    icoon={Heading2}
                    naam="Kop"
                    disabled={!bewerkbaar || !actiefBlok}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={knoppen("kop")}
                  />
                  <Actie
                    icoon={Bold}
                    naam="Vet"
                    actief={actiefBlok?.vet}
                    disabled={!bewerkbaar || !actiefBlok}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (actiefBlok) {
                        wijzigBlok(actiefBlok.id, { vet: !actiefBlok.vet });
                        focusBlok(actiefBlok.id);
                      }
                    }}
                  />
                  <Actie
                    icoon={Italic}
                    naam="Cursief"
                    actief={actiefBlok?.cursief}
                    disabled={!bewerkbaar || !actiefBlok}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (actiefBlok) {
                        wijzigBlok(actiefBlok.id, {
                          cursief: !actiefBlok.cursief,
                        });
                        focusBlok(actiefBlok.id);
                      }
                    }}
                  />
                </Groep>
                <Groep naam="Invoegen">
                  <Actie
                    icoon={CheckSquare}
                    naam="Taak"
                    groot
                    disabled={!bewerkbaar}
                    onClick={() => voegBlokToe("taak")}
                  />
                  <Actie
                    icoon={List}
                    naam="Opsomming"
                    groot
                    disabled={!bewerkbaar}
                    onClick={() => voegBlokToe("opsomming")}
                  />
                  <Actie
                    icoon={CalendarDays}
                    naam="Datum"
                    groot
                    disabled={!bewerkbaar}
                    onClick={() =>
                      voegBlokToe(
                        "tekst",
                        new Intl.DateTimeFormat("nl-NL", {
                          dateStyle: "full",
                        }).format(new Date()),
                      )
                    }
                  />
                </Groep>
                <Groep naam="Pagina">
                  <Actie
                    icoon={Pin}
                    naam="Vastzetten"
                    actief={pagina?.vastgezet}
                    groot
                    disabled={!bewerkbaar}
                    onClick={() =>
                      wijzigPagina({ vastgezet: !pagina?.vastgezet })
                    }
                  />
                  <Actie
                    icoon={pagina?.verwijderd ? RotateCcw : Trash2}
                    naam={pagina?.verwijderd ? "Herstellen" : "Prullenbak"}
                    groot
                    disabled={!pagina}
                    onClick={() => {
                      wijzigPagina({ verwijderd: !pagina?.verwijderd });
                      setPrullenbak(!pagina?.verwijderd);
                    }}
                  />
                </Groep>
              </>
            ),
          },
          {
            id: "bewaren",
            naam: "Bewaren",
            inhoud: (
              <>
                <Groep naam="Back-up">
                  <Actie
                    icoon={Download}
                    naam="Back-up opslaan"
                    groot
                    disabled={!data || exportBezig}
                    onClick={() => void exporteer()}
                  />
                  <Actie
                    icoon={Upload}
                    naam="Back-up toevoegen"
                    groot
                    disabled={!data || exportBezig}
                    onClick={() => invoer.current?.click()}
                  />
                </Groep>
                <Groep naam="Exporteren">
                  <Actie
                    icoon={Download}
                    naam="Pagina als Markdown"
                    groot
                    disabled={!pagina || exportBezig}
                    onClick={() => void exporteer(true)}
                  />
                </Groep>
                <Groep naam="Lokale opslag">
                  <Actie
                    icoon={ShieldCheck}
                    naam="Nu opslaan"
                    groot
                    disabled={!data}
                    onClick={() => bewaren()}
                  />
                </Groep>
                <p className="notities-bewaaruitleg">
                  Je notities worden automatisch lokaal opgeslagen.
                  <br />
                  Een back-up bevat alle notitieboeken, ook de prullenbak.
                </p>
              </>
            ),
          },
        ]}
      />
      <input
        hidden
        type="file"
        disabled={!!naamveld}
        ref={invoer}
        accept=".openaec-notities,.json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !dataRef.current) return;
          try {
            if (!file.size || file.size > MAX_BACKUP_BYTES)
              throw new Error("Kies een niet-lege back-up van maximaal 10 MB.");
            const backup = leesNotities(await file.text());
            const samen = voegBackupToe(dataRef.current, backup);
            leesNotities(JSON.stringify(samen));
            wijzigen(samen);
            const b = samen.boeken[samen.boeken.length - backup.boeken.length];
            setBoekId(b.id);
            setSectieId(b.secties[0].id);
            setPaginaId(b.secties[0].paginas[0].id);
            setBlokId(b.secties[0].paginas[0].blokken[0].id);
            setZoekterm("");
            setPrullenbak(false);
            setMelding(
              `${backup.boeken.length} notitieboek(en) toegevoegd. Bestaande notities zijn behouden.`,
            );
          } catch (e) {
            setFout(`Back-up niet toegevoegd: ${String(e)}`);
          }
        }}
      />
      {fout && (
        <div className="notities-melding is-fout" role="alert">
          <AlertCircle size={17} />
          <span>{fout}</span>
          {data ? (
            <button onClick={() => bewaren()}>Opnieuw opslaan</button>
          ) : (
            <button onClick={() => void exporteer(false, true)}>
              Bestaande gegevens exporteren
            </button>
          )}
          {data && (
            <button
              aria-label="Notitiefout sluiten"
              onClick={() => setFout("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {melding && (
        <div className="notities-melding" role="status">
          <span>{melding}</span>
          <button
            aria-label="Notitiemelding sluiten"
            onClick={() => setMelding("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {data && (
        <div className="notities-werkruimte">
          <aside
            className="notities-boeken"
            aria-label="Notitieboeken en secties"
          >
            <div className="notities-zijlabel">MIJN NOTITIEBOEKEN</div>
            <div className="notities-boekkiezer">
              <NotebookPen size={19} />
              <select
                aria-label="Notitieboek kiezen"
                value={boek?.id}
                onChange={(e) => {
                  const b = data.boeken.find((b) => b.id === e.target.value)!;
                  setBoekId(b.id);
                  setSectieId(b.secties[0].id);
                  const p = b.secties
                    .flatMap((s) => s.paginas)
                    .find((p) => !p.verwijderd);
                  if (p) kiesPagina(p.id);
                  else setPaginaId("");
                  setZoekterm("");
                  setPrullenbak(false);
                }}
              >
                {data.boeken.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.naam || "Naamloos notitieboek"}
                  </option>
                ))}
              </select>
              <button
                aria-label="Notitieboek hernoemen"
                onClick={() =>
                  boek && setNaamveld({ soort: "boek", waarde: boek.naam })
                }
              >
                <Pencil size={13} />
              </button>
            </div>
            <div className="notities-zoek">
              <Search size={16} />
              <input
                ref={zoekveld}
                aria-label="Alle notities doorzoeken"
                placeholder="Zoeken in alle notities"
                value={zoekterm}
                onChange={(e) => setZoekterm(e.target.value)}
              />
            </div>
            <div className="notities-zijlabel notities-sectiekop">
              SECTIES
              <button
                aria-label="Nieuwe sectie"
                onClick={() => nieuweInhoud("sectie")}
              >
                <Plus size={15} />
              </button>
            </div>
            <nav aria-label="Secties">
              {boek?.secties.map((s, i) => (
                <button
                  key={s.id}
                  className={
                    s.id === sectie?.id && !zoekterm && !prullenbak
                      ? "is-geselecteerd"
                      : ""
                  }
                  onClick={() => {
                    setSectieId(s.id);
                    const p = s.paginas.find((p) => !p.verwijderd);
                    if (p) kiesPagina(p.id);
                    else setPaginaId("");
                    setZoekterm("");
                    setPrullenbak(false);
                  }}
                >
                  <i
                    style={{
                      background: ["#d97706", "#3b7a71", "#7b6c99", "#6e8294"][
                        i % 4
                      ],
                    }}
                  />
                  <span>{s.naam || "Naamloze sectie"}</span>
                  <small>{s.paginas.filter((p) => !p.verwijderd).length}</small>
                </button>
              ))}
            </nav>
            <button
              className="notities-nieuwboek"
              onClick={() => nieuweInhoud("boek")}
            >
              <Plus size={15} /> Notitieboek toevoegen
            </button>
            <div className="notities-zijvoet">
              <button
                className={prullenbak ? "is-geselecteerd" : ""}
                onClick={() => {
                  setPrullenbak(!prullenbak);
                  setZoekterm("");
                }}
              >
                <Trash2 size={15} /> Prullenbak
                <span>
                  {
                    allePaginas(data).filter(({ pagina }) => pagina.verwijderd)
                      .length
                  }
                </span>
              </button>
              <p>
                <ShieldCheck size={14} /> Alleen op jouw computer
              </p>
            </div>
          </aside>
          <aside className="notities-paginas" aria-label="Pagina’s">
            <div className="notities-lijstkop">
              <div>
                <span>
                  {zoekterm
                    ? "ZOEKRESULTATEN"
                    : prullenbak
                      ? "HERSTEL JE PAGINA’S"
                      : "PAGINA’S"}
                </span>
                <h2>
                  {zoekterm
                    ? "Alle notities"
                    : prullenbak
                      ? "Prullenbak"
                      : sectie?.naam}
                </h2>
              </div>
              {!zoekterm && !prullenbak && (
                <button
                  aria-label="Sectie hernoemen"
                  onClick={() =>
                    sectie &&
                    setNaamveld({ soort: "sectie", waarde: sectie.naam })
                  }
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
            {!prullenbak && (
              <button
                className="notities-nieuwepagina"
                onClick={() => nieuweInhoud("pagina")}
              >
                <Plus size={15} /> Nieuwe pagina
              </button>
            )}
            <div className="notities-paginalijst">
              {resultaten.map(({ boek: b, sectie: s, pagina: p }) => (
                <button
                  key={p.id}
                  className={p.id === pagina?.id ? "is-geselecteerd" : ""}
                  onClick={() => kiesPagina(p.id)}
                >
                  <strong>
                    {p.vastgezet && <Pin size={12} />}
                    {p.titel || "Naamloze pagina"}
                  </strong>
                  <span>
                    {p.blokken
                      .map((b) => b.tekst)
                      .filter(Boolean)
                      .join(" ")
                      .slice(0, 90) || "Een lege pagina, klaar voor je ideeën."}
                  </span>
                  <small>
                    {zoekterm || prullenbak
                      ? `${b.naam} / ${s.naam}`
                      : new Intl.DateTimeFormat("nl-NL", {
                          day: "numeric",
                          month: "short",
                        }).format(new Date(p.bijgewerkt))}
                  </small>
                </button>
              ))}
              {!resultaten.length && (
                <p className="notities-geenresultaten">
                  {zoekterm
                    ? "Geen pagina’s gevonden."
                    : prullenbak
                      ? "Je prullenbak is leeg."
                      : "Begin met een nieuwe pagina."}
                </p>
              )}
            </div>
          </aside>
          <main className="notities-pagina" ref={inhoud}>
            {pagina ? (
              <article key={pagina.id}>
                <div className="notities-paginakop">
                  <span>
                    {selectie?.boek.naam}
                    <b>/</b>
                    {selectie?.sectie.naam}
                  </span>
                  <button
                    title="Deze pagina als Markdown bewaren"
                    disabled={exportBezig}
                    onClick={() => void exporteer(true)}
                  >
                    <Download size={15} /> Markdown
                  </button>
                </div>
                <input
                  className="notities-paginatitel"
                  aria-label="Paginatitel"
                  value={pagina.titel}
                  maxLength={300}
                  readOnly={pagina.verwijderd}
                  placeholder="Naamloze pagina"
                  onChange={(e) => wijzigPagina({ titel: e.target.value })}
                />
                <div className="notities-paginadatum">
                  <CalendarDays size={13} />
                  {new Intl.DateTimeFormat("nl-NL", {
                    dateStyle: "long",
                    timeStyle: "short",
                  }).format(new Date(pagina.bijgewerkt))}
                  <span>·</span>
                  {pagina.blokken.reduce(
                    (a, b) =>
                      a + b.tekst.trim().split(/\s+/).filter(Boolean).length,
                    0,
                  )}{" "}
                  woorden
                </div>
                {pagina.verwijderd ? (
                  <>
                    <div className="notities-herstel">
                      <Trash2 size={18} />
                      <span>Deze pagina staat in de prullenbak.</span>
                      <button
                        onClick={() => {
                          wijzigPagina({ verwijderd: false });
                          setPrullenbak(false);
                        }}
                      >
                        Pagina herstellen
                      </button>
                    </div>
                    <div className="notities-leestekst">
                      {pagina.blokken.map((b) => (
                        <p key={b.id}>
                          {b.soort === "taak" ? (b.klaar ? "☑ " : "☐ ") : ""}
                          {b.tekst}
                        </p>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="notities-tekstblokken">
                      {pagina.blokken.map((blok) => (
                        <div key={blok.id} data-blok={blok.id}>
                          <TekstBlok
                            blok={blok}
                            actief={blokId === blok.id}
                            kies={() => setBlokId(blok.id)}
                            wijzig={(patch) => wijzigBlok(blok.id, patch)}
                            splits={(positie, einde) =>
                              splitsBlok(blok, positie, einde)
                            }
                            verwijder={() => verwijderBlok(blok)}
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      className="notities-bloktoevoegen"
                      disabled={pagina.blokken.length >= 2000}
                      onClick={() => voegBlokToe()}
                    >
                      <Plus size={15} /> Tekst toevoegen
                    </button>
                    <div className="notities-paginatip">
                      Enter voor een nieuw blok · Shift+Enter voor een nieuwe
                      regel
                    </div>
                  </>
                )}
              </article>
            ) : (
              <div className="notities-legepagina">
                <NotebookPen size={38} />
                <h2>Ruimte voor een nieuw idee.</h2>
                <p>Kies een pagina of begin een nieuwe notitie.</p>
                <button onClick={() => nieuweInhoud("pagina")}>
                  <Plus size={16} /> Nieuwe pagina
                </button>
              </div>
            )}
          </main>
        </div>
      )}
      <div className="notities-opslagstatus" role="status">
        {vuil.current ? <AlertCircle size={13} /> : <ShieldCheck size={13} />}
        {status}
        <span>Ctrl+S opslaan · Ctrl+Shift+F zoeken</span>
      </div>
      {naamveld && (
        <div
          className="notities-naamachtergrond"
          onKeyDown={(e) => {
            if (e.key === "Escape") setNaamveld(null);
            if (e.key === "Tab") {
              const items = Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>("input,button"),
              );
              const i = items.indexOf(document.activeElement as HTMLElement);
              e.preventDefault();
              items[
                (i + (e.shiftKey ? items.length - 1 : 1)) % items.length
              ]?.focus();
            }
          }}
        >
          <form
            className="notities-naamdialoog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notities-naam-titel"
            onSubmit={(e) => {
              e.preventDefault();
              hernoem();
            }}
          >
            <h2 id="notities-naam-titel">
              {naamveld.soort === "boek" ? "Notitieboek" : "Sectie"} een naam
              geven
            </h2>
            <label>
              Naam
              <input
                autoFocus
                maxLength={200}
                value={naamveld.waarde}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  setNaamveld({ ...naamveld, waarde: e.target.value })
                }
              />
            </label>
            <div>
              <button type="button" onClick={() => setNaamveld(null)}>
                Annuleren
              </button>
              <button type="submit" disabled={!naamveld.waarde.trim()}>
                <Check size={15} /> Opslaan
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
