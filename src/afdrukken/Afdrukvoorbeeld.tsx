/**
 * Afdrukvoorbeeld voor alle modules (#18): pagina's bekijken, bladeren, zoomen,
 * bereik, exemplaren en module-instellingen kiezen, en daarna afdrukken of als
 * PDF bewaren. Afdruk en PDF gebruiken precies de pagina's van het voorbeeld.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  Printer,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { AfdrukBron, RekenbladBron } from "./bron";
import {
  PAPIER,
  exemplaren,
  ontleedBereik,
  type AfdrukDocument,
  type Papier,
  type Stand,
} from "./model";
import type { BladAfdrukInstellingen } from "./rekenbladInstellingen";
import type { RekenbladOmvang } from "./bronRekenblad";
import {
  HANDOUT_AANTALLEN,
  standaardPresentatie,
  type HandoutAantal,
  type PresentatieInstellingen,
} from "./indeling";
import { PaginaEinden } from "./PaginaEinden";
import "./afdrukvoorbeeld.css";

export interface AfdrukvoorbeeldProps {
  bron: AfdrukBron;
  /** Direct het afdrukvenster openen zodra de pagina's klaar zijn (Ctrl+P). */
  directAfdrukken?: boolean;
  indeling?: PresentatieInstellingen["indeling"];
  sluit: () => void;
  meld: (tekst: string) => void;
  /** Bewaart bytes als bestand (desktop: opslagdialoog, browser: download). */
  bewaar: (bytes: Uint8Array, bestandsnaam: string, mime: string) => Promise<string | null>;
}

type Zoom = "pagina" | "breedte" | number;
const VOORBEELD_DPI = 110;
const ZOOMSTAPPEN = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function Afdrukvoorbeeld(props: AfdrukvoorbeeldProps) {
  const { bron } = props;
  const id = useId();
  const dialoog = useRef<HTMLElement>(null);
  const weergave = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<AfdrukDocument | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState<string | null>("Pagina's voorbereiden…");
  const [huidig, setHuidig] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("pagina");
  const [bereik, setBereik] = useState("");
  const [aantal, setAantal] = useState(1);
  const [sorteren, setSorteren] = useState(true);
  const [kwaliteit, setKwaliteit] = useState<"klein" | "standaard" | "hoog">("standaard");
  // Getekende voorbeeldpagina's per document: index → object-URL.
  const beelden = useRef<{ doc: AfdrukDocument | null; urls: Map<number, string>; bezig: Set<number> }>({
    doc: null,
    urls: new Map(),
    bezig: new Set(),
  });
  const [, setGetekend] = useState(0);
  const [vakMaat, setVakMaat] = useState({ breedte: 800, hoogte: 600 });

  // Module-instellingen.
  const [presentatie, setPresentatie] = useState<PresentatieInstellingen>(() =>
    standaardPresentatie(props.indeling ?? "dias"),
  );
  const [rapportStand, setRapportStand] = useState<Stand>(
    bron.soort === "rapport" ? bron.stand : "staand",
  );
  const [omvang, setOmvang] = useState<RekenbladOmvang>("blad");
  const [negeerBereik, setNegeerBereik] = useState(false);
  const [bladInstellingen, setBladInstellingen] = useState<BladAfdrukInstellingen[] | null>(null);
  const [opgeslagen, setOpgeslagen] = useState<string>("");
  const [bladKeuze, setBladKeuze] = useState(bron.soort === "xlsx" ? bron.actief : 0);
  const [einden, setEinden] = useState(false);

  useEffect(() => {
    if (bron.soort !== "xlsx") return;
    let actief = true;
    bron
      .leesInstellingen()
      .then((lijst) => {
        if (!actief) return;
        setBladInstellingen(lijst);
        setOpgeslagen(JSON.stringify(lijst));
      })
      .catch((e) => actief && setFout(String(e instanceof Error ? e.message : e)));
    return () => {
      actief = false;
    };
  }, [bron]);

  const keuzeSleutel = JSON.stringify({
    presentatie,
    rapportStand,
    omvang,
    negeerBereik,
    bladInstellingen,
  });

  // Pagina's opnieuw maken als de instellingen veranderen.
  useEffect(() => {
    if (bron.soort === "xlsx" && !bladInstellingen) return;
    let actief = true;
    setBezig("Pagina's voorbereiden…");
    const wacht = setTimeout(async () => {
      try {
        let nieuw: AfdrukDocument;
        if (bron.soort === "docx") nieuw = await bron.maak();
        else if (bron.soort === "pptx") nieuw = await bron.maak(presentatie);
        else if (bron.soort === "rapport") nieuw = await bron.maak(rapportStand);
        else
          nieuw = await bron.maak({
            omvang,
            instellingen: bladInstellingen!,
            negeerAfdrukbereik: negeerBereik,
          });
        if (!actief) return;
        setDoc(nieuw);
        setFout("");
        setHuidig((h) => Math.max(0, Math.min(h, nieuw.paginas.length - 1)));
      } catch (e) {
        if (actief) setFout(e instanceof Error ? e.message : String(e));
      } finally {
        if (actief) setBezig(null);
      }
    }, 200);
    return () => {
      actief = false;
      clearTimeout(wacht);
    };
  }, [keuzeSleutel, bron]);

  useEffect(
    () => () => {
      beelden.current.urls.forEach((url) => URL.revokeObjectURL(url));
      beelden.current.urls.clear();
    },
    [],
  );

  // Het zichtbare vak meten voor "hele pagina" en "paginabreedte".
  useEffect(() => {
    const el = weergave.current;
    if (!el) return;
    const meet = () =>
      setVakMaat({ breedte: el.clientWidth - 48, hoogte: el.clientHeight - 48 });
    meet();
    const waarnemer = new ResizeObserver(meet);
    waarnemer.observe(el);
    return () => waarnemer.disconnect();
  }, []);

  // Huidige pagina (en de buren) tekenen, elke pagina één keer per document.
  useEffect(() => {
    if (!doc) return;
    const cache = beelden.current;
    if (cache.doc !== doc) {
      cache.urls.forEach((url) => URL.revokeObjectURL(url));
      cache.urls = new Map();
      cache.bezig = new Set();
      cache.doc = doc;
    }
    const nodig = [huidig, huidig + 1, huidig - 1].filter(
      (i) => i >= 0 && i < doc.paginas.length && !cache.urls.has(i) && !cache.bezig.has(i),
    );
    for (const index of nodig) {
      cache.bezig.add(index);
      void (async () => {
        try {
          const { canvasNaarBlob } = await import("./afdrukframe");
          const t = await doc.paginas[index].teken(VOORBEELD_DPI);
          const blob = await canvasNaarBlob(t.canvas, "image/png");
          if (beelden.current.doc !== doc) return;
          beelden.current.urls.set(index, URL.createObjectURL(blob));
          setGetekend((n) => n + 1);
        } catch (e) {
          if (beelden.current.doc === doc) setFout(e instanceof Error ? e.message : String(e));
        }
      })();
    }
  }, [doc, huidig]);

  useEffect(() => {
    dialoog.current?.querySelector<HTMLElement>(".afdruk-primair")?.focus();
  }, []);

  const totaal = doc?.paginas.length ?? 0;
  const gekozen = useMemo(() => (doc ? ontleedBereik(bereik, totaal) : null), [bereik, doc, totaal]);
  const bereikGeldig = !!gekozen && gekozen.length > 0;
  const pagina = doc?.paginas[huidig];
  const schaal = (() => {
    if (!pagina) return 1;
    const pxB = (pagina.breedte * 96) / 72;
    const pxH = (pagina.hoogte * 96) / 72;
    if (zoom === "breedte") return vakMaat.breedte / pxB;
    if (zoom === "pagina") return Math.min(vakMaat.breedte / pxB, vakMaat.hoogte / pxH);
    return zoom;
  })();

  const directGedaan = useRef(false);
  useEffect(() => {
    if (props.directAfdrukken && doc && !bezig && !directGedaan.current) {
      directGedaan.current = true;
      void afdrukken();
    }
  }, [doc, bezig]);

  async function afdrukken() {
    if (!doc || !gekozen?.length) return;
    setBezig("Afdruk voorbereiden…");
    try {
      const { drukPaginasAf } = await import("./afdrukframe");
      await drukPaginasAf(
        doc.paginas,
        exemplaren(gekozen, aantal, sorteren),
        doc.titel,
        200,
        (klaar, n) => setBezig(`Afdruk voorbereiden… ${klaar} van ${n}`),
      );
      props.meld(
        "Kies in het afdrukvenster de printer, dubbelzijdig afdrukken en eventueel ‘Opslaan als PDF’.",
      );
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(null);
    }
  }

  async function alsPdf() {
    if (!doc || !gekozen?.length) return;
    setBezig("PDF maken…");
    try {
      const { maakPdf } = await import("../export/pdf");
      const bytes = await maakPdf(doc, {
        indexen: gekozen,
        kwaliteit,
        voortgang: (klaar, n) => setBezig(`PDF maken… ${klaar} van ${n}`),
      });
      const naam = `${doc.titel.replace(/[\\/:*?"<>|]+/g, "_").trim() || "Naamloos"}.pdf`;
      const pad = await props.bewaar(bytes, naam, "application/pdf");
      if (pad !== null) props.meld(pad ? `PDF bewaard: ${pad}` : `PDF ${naam} wordt gedownload.`);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(null);
    }
  }

  async function bewaarIndeling() {
    if (bron.soort !== "xlsx" || !bladInstellingen || !bron.bewaarInstellingen) return;
    const oud = JSON.parse(opgeslagen) as BladAfdrukInstellingen[];
    const wijzigingen = new Map<number, BladAfdrukInstellingen>();
    bladInstellingen.forEach((inst, i) => {
      if (JSON.stringify(inst) !== JSON.stringify(oud[i])) wijzigingen.set(i, inst);
    });
    if (!wijzigingen.size) return;
    try {
      await bron.bewaarInstellingen(wijzigingen);
      props.meld("De pagina-indeling is in de werkmap opgeslagen. Bewaar het document om dit vast te leggen.");
      props.sluit();
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    }
  }

  const naar = (index: number) => setHuidig(Math.max(0, Math.min(totaal - 1, index)));
  const zoomStap = (richting: 1 | -1) => {
    const nu = schaal;
    const volgende =
      richting > 0
        ? ZOOMSTAPPEN.find((z) => z > nu + 0.01) ?? ZOOMSTAPPEN[ZOOMSTAPPEN.length - 1]
        : [...ZOOMSTAPPEN].reverse().find((z) => z < nu - 0.01) ?? ZOOMSTAPPEN[0];
    setZoom(volgende);
  };

  const inst = bladInstellingen?.[bladKeuze];
  const wijzigBlad = (patch: Partial<BladAfdrukInstellingen>) =>
    setBladInstellingen((lijst) =>
      lijst ? lijst.map((b, i) => (i === bladKeuze ? { ...b, ...patch } : b)) : lijst,
    );
  const indelingGewijzigd = !!bladInstellingen && JSON.stringify(bladInstellingen) !== opgeslagen;

  return (
    <div className="office-dialoogachtergrond afdruk-achtergrond">
      <section
        ref={dialoog}
        className="office-dialoog afdrukvoorbeeld"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titel`}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            props.sluit();
          } else if (e.key === "PageDown" || (e.key === "ArrowRight" && e.altKey)) {
            e.preventDefault();
            naar(huidig + 1);
          } else if (e.key === "PageUp" || (e.key === "ArrowLeft" && e.altKey)) {
            e.preventDefault();
            naar(huidig - 1);
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
            e.preventDefault();
            void afdrukken();
          }
        }}
      >
        <header className="afdruk-kop">
          <h2 id={`${id}-titel`}>Afdrukvoorbeeld – {bron.titel}</h2>
          <button type="button" className="afdruk-sluit" aria-label="Sluiten" onClick={props.sluit}>
            <X size={16} />
          </button>
        </header>
        <div className="afdruk-inhoud">
          <aside className="afdruk-opties" aria-label="Afdrukinstellingen">
            <fieldset>
              <legend>Afdrukken</legend>
              <label>
                Pagina’s
                <input
                  type="text"
                  value={bereik}
                  placeholder="alle, of bijv. 1-3, 5"
                  aria-invalid={!!doc && !bereikGeldig}
                  onChange={(e) => setBereik(e.target.value)}
                />
              </label>
              <label>
                Exemplaren
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={aantal}
                  onChange={(e) => setAantal(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                />
              </label>
              {aantal > 1 && (
                <label className="afdruk-vink">
                  <input type="checkbox" checked={sorteren} onChange={(e) => setSorteren(e.target.checked)} />
                  Sorteren (1, 2, 3 – 1, 2, 3)
                </label>
              )}
              <p className="afdruk-uitleg">
                Printer, dubbelzijdig en kleur kies je daarna in het afdrukvenster van het systeem.
              </p>
            </fieldset>

            {bron.soort === "pptx" && (
              <fieldset>
                <legend>Presentatie</legend>
                <label>
                  Afdrukken als
                  <select
                    value={presentatie.indeling}
                    onChange={(e) => {
                      const indeling = e.target.value as PresentatieInstellingen["indeling"];
                      setPresentatie({ ...standaardPresentatie(indeling), perPagina: presentatie.perPagina });
                    }}
                  >
                    <option value="dias">Dia’s</option>
                    <option value="handout">Hand-outs</option>
                    <option value="notities">Notitiepagina’s</option>
                  </select>
                </label>
                {presentatie.indeling === "handout" && (
                  <label>
                    Dia’s per pagina
                    <select
                      value={presentatie.perPagina}
                      onChange={(e) =>
                        setPresentatie({ ...presentatie, perPagina: Number(e.target.value) as HandoutAantal })
                      }
                    >
                      {HANDOUT_AANTALLEN.map((n) => (
                        <option key={n} value={n}>
                          {n}
                          {n === 3 ? " (met regels)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Papier
                  <select
                    value={presentatie.papier}
                    onChange={(e) => setPresentatie({ ...presentatie, papier: e.target.value as Papier | "dia" })}
                  >
                    {presentatie.indeling === "dias" && <option value="dia">Diagrootte</option>}
                    {(Object.keys(PAPIER) as Papier[]).map((p) => (
                      <option key={p} value={p}>
                        {PAPIER[p].naam}
                      </option>
                    ))}
                  </select>
                </label>
                {presentatie.papier !== "dia" && (
                  <StandKeuze stand={presentatie.stand} wijzig={(stand) => setPresentatie({ ...presentatie, stand })} />
                )}
                {presentatie.indeling === "dias" && presentatie.papier !== "dia" && (
                  <label className="afdruk-vink">
                    <input
                      type="checkbox"
                      checked={presentatie.kader}
                      onChange={(e) => setPresentatie({ ...presentatie, kader: e.target.checked })}
                    />
                    Kader om dia’s
                  </label>
                )}
              </fieldset>
            )}

            {bron.soort === "rapport" && (
              <fieldset>
                <legend>Rapport</legend>
                <StandKeuze stand={rapportStand} wijzig={setRapportStand} />
              </fieldset>
            )}

            {bron.soort === "xlsx" && inst && (
              <RekenbladOpties
                bron={bron}
                omvang={omvang}
                setOmvang={setOmvang}
                negeerBereik={negeerBereik}
                setNegeerBereik={setNegeerBereik}
                bladKeuze={bladKeuze}
                setBladKeuze={setBladKeuze}
                inst={inst}
                wijzig={wijzigBlad}
                einden={() => setEinden(true)}
              />
            )}
            {bron.soort === "xlsx" && bron.bewaarInstellingen && (
              <button type="button" disabled={!indelingGewijzigd} onClick={bewaarIndeling}>
                Pagina-indeling in werkmap opslaan
              </button>
            )}

            <fieldset>
              <legend>PDF</legend>
              <label>
                Beeldkwaliteit
                <select value={kwaliteit} onChange={(e) => setKwaliteit(e.target.value as typeof kwaliteit)}>
                  <option value="klein">Klein bestand (150 dpi)</option>
                  <option value="standaard">Standaard (200 dpi)</option>
                  <option value="hoog">Hoog, verliesvrij (300 dpi)</option>
                </select>
              </label>
              <p className="afdruk-uitleg">
                Tekst blijft selecteerbaar en doorzoekbaar; de PDF volgt precies dit voorbeeld.
              </p>
            </fieldset>
          </aside>

          <div className="afdruk-voorbeeld">
            <div className="afdruk-balk" role="toolbar" aria-label="Bladeren en zoomen">
              <button type="button" aria-label="Vorige pagina" disabled={huidig <= 0} onClick={() => naar(huidig - 1)}>
                <ChevronLeft size={15} />
              </button>
              <span className="afdruk-teller">
                Pagina{" "}
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, totaal)}
                  value={totaal ? huidig + 1 : 0}
                  aria-label="Paginanummer"
                  onChange={(e) => naar(Number(e.target.value) - 1)}
                />{" "}
                van {totaal}
              </span>
              <button
                type="button"
                aria-label="Volgende pagina"
                disabled={huidig >= totaal - 1}
                onClick={() => naar(huidig + 1)}
              >
                <ChevronRight size={15} />
              </button>
              <span className="afdruk-scheiding" />
              <button type="button" aria-label="Uitzoomen" onClick={() => zoomStap(-1)}>
                <ZoomOut size={15} />
              </button>
              <select
                aria-label="Zoom"
                value={typeof zoom === "number" ? String(zoom) : zoom}
                onChange={(e) =>
                  setZoom(e.target.value === "pagina" || e.target.value === "breedte" ? e.target.value : Number(e.target.value))
                }
              >
                <option value="pagina">Hele pagina</option>
                <option value="breedte">Paginabreedte</option>
                {ZOOMSTAPPEN.map((z) => (
                  <option key={z} value={String(z)}>
                    {Math.round(z * 100)}%
                  </option>
                ))}
                {typeof zoom === "number" && !ZOOMSTAPPEN.includes(zoom) && (
                  <option value={String(zoom)}>{Math.round(zoom * 100)}%</option>
                )}
              </select>
              <button type="button" aria-label="Inzoomen" onClick={() => zoomStap(1)}>
                <ZoomIn size={15} />
              </button>
              {pagina?.label && <span className="afdruk-label">{pagina.label}</span>}
            </div>
            <div className="afdruk-weergave" ref={weergave} tabIndex={0} aria-label="Paginavoorbeeld">
              {pagina && (
                <div
                  className="afdruk-pagina"
                  style={{
                    width: `${((pagina.breedte * 96) / 72) * schaal}px`,
                    height: `${((pagina.hoogte * 96) / 72) * schaal}px`,
                  }}
                >
                  {beelden.current.doc === doc && beelden.current.urls.has(huidig) ? (
                    <img src={beelden.current.urls.get(huidig)} alt={`Voorbeeld van pagina ${huidig + 1}`} />
                  ) : (
                    <span className="afdruk-laden">Pagina tekenen…</span>
                  )}
                </div>
              )}
              {!doc && !fout && <p role="status">Pagina’s voorbereiden…</p>}
            </div>
            {doc?.meldingen?.map((m, i) => (
              <p key={i} className="afdruk-melding">
                {m}
              </p>
            ))}
            {fout && (
              <p className="afdruk-fout" role="alert">
                {fout}
              </p>
            )}
          </div>
        </div>
        <footer className="office-dialoogacties">
          {bezig && (
            <span className="afdruk-bezig" role="status">
              {bezig}
            </span>
          )}
          <button type="button" onClick={props.sluit}>
            Sluiten
          </button>
          <button type="button" disabled={!doc || !bereikGeldig || !!bezig} onClick={alsPdf}>
            <FileDown size={13} /> Opslaan als PDF
          </button>
          <button
            type="button"
            className="office-dialoogdoorgaan afdruk-primair"
            disabled={!doc || !bereikGeldig || !!bezig}
            onClick={afdrukken}
          >
            <Printer size={13} /> Afdrukken
          </button>
        </footer>
        {einden && bron.soort === "xlsx" && bladInstellingen && (
          <PaginaEinden
            bron={bron}
            blad={bladKeuze}
            keuze={{ omvang: "blad", instellingen: bladInstellingen, negeerAfdrukbereik: negeerBereik }}
            sluit={() => setEinden(false)}
            wijzig={(rijEinden, kolomEinden) => wijzigBlad({ rijEinden, kolomEinden })}
          />
        )}
      </section>
    </div>
  );
}

function StandKeuze({ stand, wijzig }: { stand: Stand; wijzig: (s: Stand) => void }) {
  return (
    <label>
      Afdrukstand
      <select value={stand} onChange={(e) => wijzig(e.target.value as Stand)}>
        <option value="staand">Staand</option>
        <option value="liggend">Liggend</option>
      </select>
    </label>
  );
}

function RekenbladOpties(props: {
  bron: RekenbladBron;
  omvang: RekenbladOmvang;
  setOmvang: (o: RekenbladOmvang) => void;
  negeerBereik: boolean;
  setNegeerBereik: (b: boolean) => void;
  bladKeuze: number;
  setBladKeuze: (n: number) => void;
  inst: BladAfdrukInstellingen;
  wijzig: (patch: Partial<BladAfdrukInstellingen>) => void;
  einden: () => void;
}) {
  const { bron, inst, wijzig } = props;
  const marge = (sleutel: keyof BladAfdrukInstellingen["marges"], naam: string) => (
    <label className="afdruk-klein">
      {naam}
      <input
        type="number"
        min={0}
        max={10}
        step={0.1}
        value={Math.round(inst.marges[sleutel] * 2.54 * 10) / 10}
        onChange={(e) =>
          wijzig({ marges: { ...inst.marges, [sleutel]: Math.max(0, Number(e.target.value) || 0) / 2.54 } })
        }
      />
    </label>
  );
  const kopVoet = (soort: "kop" | "voet", naam: string) => (
    <div className="afdruk-kopvoet">
      <span>{naam}</span>
      {(["links", "midden", "rechts"] as const).map((deel) => (
        <input
          key={deel}
          type="text"
          aria-label={`${naam} ${deel}`}
          placeholder={deel}
          value={inst[soort][deel]}
          onChange={(e) => wijzig({ [soort]: { ...inst[soort], [deel]: e.target.value } })}
        />
      ))}
    </div>
  );
  return (
    <>
      <fieldset>
        <legend>Rekenblad</legend>
        <label>
          Afdrukken
          <select value={props.omvang} onChange={(e) => props.setOmvang(e.target.value as RekenbladOmvang)}>
            <option value="blad">Actief blad</option>
            <option value="werkmap">Hele werkmap</option>
            <option value="selectie" disabled={!bron.selectie}>
              Selectie{bron.selectie ? ` (${bron.selectie})` : " (niets geselecteerd)"}
            </option>
          </select>
        </label>
        <label className="afdruk-vink">
          <input
            type="checkbox"
            checked={props.negeerBereik}
            onChange={(e) => props.setNegeerBereik(e.target.checked)}
          />
          Afdrukbereik negeren
        </label>
      </fieldset>
      <fieldset>
        <legend>Pagina-indeling</legend>
        {bron.bladen.length > 1 && (
          <label>
            Blad
            <select value={props.bladKeuze} onChange={(e) => props.setBladKeuze(Number(e.target.value))}>
              {bron.bladen.map((naam, i) => (
                <option key={i} value={i}>
                  {naam}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Papier
          <select value={inst.papier} onChange={(e) => wijzig({ papier: e.target.value as Papier })}>
            {(Object.keys(PAPIER) as Papier[]).map((p) => (
              <option key={p} value={p}>
                {PAPIER[p].naam}
              </option>
            ))}
          </select>
        </label>
        <StandKeuze stand={inst.stand} wijzig={(stand) => wijzig({ stand })} />
        <label>
          Schaal
          <select
            value={inst.passend ? (inst.passendHoog === 0 ? "breedte" : "pagina") : "procent"}
            onChange={(e) => {
              const w = e.target.value;
              if (w === "procent") wijzig({ passend: false });
              else if (w === "pagina") wijzig({ passend: true, passendBreed: 1, passendHoog: 1 });
              else wijzig({ passend: true, passendBreed: 1, passendHoog: 0 });
            }}
          >
            <option value="procent">Percentage</option>
            <option value="pagina">Passend op één pagina</option>
            <option value="breedte">Passend op paginabreedte</option>
          </select>
        </label>
        {inst.passend ? (
          <div className="afdruk-rij">
            <label className="afdruk-klein">
              Pagina’s breed
              <input
                type="number"
                min={0}
                max={99}
                value={inst.passendBreed}
                onChange={(e) => wijzig({ passendBreed: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <label className="afdruk-klein">
              hoog (0 = vrij)
              <input
                type="number"
                min={0}
                max={99}
                value={inst.passendHoog}
                onChange={(e) => wijzig({ passendHoog: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          </div>
        ) : (
          <label>
            Percentage
            <input
              type="number"
              min={10}
              max={400}
              value={inst.schaal}
              onChange={(e) => wijzig({ schaal: Math.max(10, Math.min(400, Number(e.target.value) || 100)) })}
            />
          </label>
        )}
        <div className="afdruk-rij">
          {marge("boven", "Boven (cm)")}
          {marge("onder", "Onder")}
          {marge("links", "Links")}
          {marge("rechts", "Rechts")}
        </div>
        <label>
          Afdrukbereik
          <input
            type="text"
            placeholder="gebruikt bereik, of bijv. A1:H40"
            value={inst.afdrukbereik ?? ""}
            onChange={(e) => wijzig({ afdrukbereik: e.target.value.trim() || null })}
          />
        </label>
        <div className="afdruk-rij">
          <label className="afdruk-klein">
            Rijen herhalen
            <input
              type="text"
              placeholder="bijv. 1:2"
              value={inst.herhaalRijen ?? ""}
              onChange={(e) => wijzig({ herhaalRijen: e.target.value.trim() || null })}
            />
          </label>
          <label className="afdruk-klein">
            Kolommen herhalen
            <input
              type="text"
              placeholder="bijv. A:B"
              value={inst.herhaalKolommen ?? ""}
              onChange={(e) => wijzig({ herhaalKolommen: e.target.value.trim() || null })}
            />
          </label>
        </div>
        <label className="afdruk-vink">
          <input type="checkbox" checked={inst.rasterlijnen} onChange={(e) => wijzig({ rasterlijnen: e.target.checked })} />
          Rasterlijnen afdrukken
        </label>
        <label className="afdruk-vink">
          <input type="checkbox" checked={inst.koppen} onChange={(e) => wijzig({ koppen: e.target.checked })} />
          Rij- en kolomkoppen afdrukken
        </label>
        <label className="afdruk-vink">
          <input
            type="checkbox"
            checked={inst.horizontaalCentreren}
            onChange={(e) => wijzig({ horizontaalCentreren: e.target.checked })}
          />
          Horizontaal centreren
        </label>
        <label>
          Paginavolgorde
          <select value={inst.volgorde} onChange={(e) => wijzig({ volgorde: e.target.value as "omlaag" | "over" })}>
            <option value="omlaag">Eerst omlaag, dan over</option>
            <option value="over">Eerst over, dan omlaag</option>
          </select>
        </label>
        {kopVoet("kop", "Koptekst")}
        {kopVoet("voet", "Voettekst")}
        <p className="afdruk-uitleg">
          Velden: &amp;[Pagina], &amp;[Pagina's], &amp;[Datum], &amp;[Tijd], &amp;[Bestand], &amp;[Blad].
        </p>
        <button type="button" onClick={props.einden}>
          Pagina-eindevoorbeeld…
        </button>
      </fieldset>
    </>
  );
}
