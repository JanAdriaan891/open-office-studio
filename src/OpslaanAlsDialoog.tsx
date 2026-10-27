import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Save, TriangleAlert } from "lucide-react";
import type { Soort } from "./editors";
import {
  GROEPEN,
  conversieStatus,
  kiesConversieprogramma,
  kiesRoute,
  uitvoerlijst,
  type ConversieStatus,
  type Groep,
  type Route,
  type Uitvoerformaat,
} from "./formaten";
import type { OpslaanKeuze } from "./export/bewaar";
import type { Codering, Scheidingsteken } from "./export/csv";
import "./OpslaanAlsDialoog.css";

const ROUTENAMEN: Record<Route, string> = {
  engine: "in de app",
  runtime: "via kantoorruntime",
  afdrukken: "via Afdrukken",
  tekst: "in de app",
  html: "in de app",
};

export interface OpslaanAlsProps {
  soort: Soort;
  /** Huidige bestandsnaam, met of zonder extensie. */
  naam: string;
  /** Voorgeselecteerd formaat. */
  formaat: string;
  /** Verliesmelding voor dit formaat en deze route (risicoBeleid), of null. */
  verlies: (formaat: Uitvoerformaat, route: Route | null) => string | null;
  bladen?: { namen: string[]; actief: number } | null;
  dias?: { aantal: number; huidig: number } | null;
  bevestig: (keuze: OpslaanKeuze) => void;
  annuleer: () => void;
  vorigeFocus: HTMLElement | null;
}

export function OpslaanAlsDialoog(props: OpslaanAlsProps) {
  const desktop = "__TAURI_INTERNALS__" in window;
  const id = useId();
  const dialoog = useRef<HTMLElement>(null);
  const naamveld = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ConversieStatus | null>(
    desktop ? null : { gevonden: false, profiel: "veilig" },
  );
  const [statusFout, setStatusFout] = useState("");
  const [naam, setNaam] = useState(props.naam.replace(/\.[^.]+$/, ""));
  const [ext, setExt] = useState(props.formaat);
  const [scheidingsteken, setScheidingsteken] = useState<Scheidingsteken>(";");
  const [codering, setCodering] = useState<Codering>("utf8-bom");
  const [blad, setBlad] = useState(props.bladen?.actief ?? 0);
  const [dia, setDia] = useState(props.dias?.huidig ?? 0);
  const [pdfa, setPdfa] = useState<0 | 1 | 2 | 3>(0);
  const [bladwijzers, setBladwijzers] = useState(true);
  const [bereik, setBereik] = useState("");

  useEffect(() => {
    if (!desktop) return;
    let actief = true;
    conversieStatus()
      .then((s) => actief && setStatus(s))
      .catch((e) => {
        if (!actief) return;
        setStatus({ gevonden: false, profiel: "veilig" });
        setStatusFout(String(e));
      });
    return () => {
      actief = false;
    };
  }, [desktop]);
  useEffect(() => {
    naamveld.current?.focus();
    naamveld.current?.select();
    const vorige = props.vorigeFocus;
    return () => {
      if (vorige?.isConnected) vorige.focus();
    };
  }, [props.vorigeFocus]);

  // Het gekozen formaat zichtbaar houden in de lijst.
  useEffect(() => {
    dialoog.current
      ?.querySelector(".opslaanals-formaat.is-gekozen")
      ?.scrollIntoView({ block: "nearest" });
  }, [ext]);
  const runtime = status?.gevonden ?? false;
  const formaten = useMemo(() => uitvoerlijst(props.soort), [props.soort]);
  const gekozen = formaten.find((f) => f.ext === ext) ?? formaten[0];
  // Zolang de status laadt, rekenen we in de desktopapp op de runtime.
  const routeVan = (f: Uitvoerformaat) =>
    kiesRoute(f, desktop && (status === null || runtime));
  const route = routeVan(gekozen);
  const verlies = props.verlies(gekozen, route);
  const groepen = (Object.keys(GROEPEN) as Groep[])
    .map((groep) => ({
      groep,
      formaten: formaten.filter((f) => f.groep === groep),
    }))
    .filter((g) => g.formaten.length);
  const bereikGeldig = !bereik.trim() || /^[\d\s,-]+$/.test(bereik);
  const kan = !!route && !!naam.trim() && bereikGeldig;

  function bevestig() {
    if (!kan || !route) return;
    props.bevestig({
      naam: naam.trim(),
      ext: gekozen.ext,
      route,
      ...(gekozen.ext === "csv" || gekozen.ext === "tsv"
        ? {
            scheidingsteken: gekozen.ext === "tsv" ? "tab" : scheidingsteken,
            codering,
            blad,
          }
        : {}),
      ...(gekozen.ext === "png" && props.soort === "xlsx" ? { blad } : {}),
      ...(gekozen.ext === "png" && props.soort === "pptx" ? { dia } : {}),
      ...(gekozen.ext === "pdf" && route === "runtime"
        ? { pdfa, bladwijzers, bereik: bereik.trim() || undefined }
        : {}),
    });
  }

  async function kiesProgramma() {
    try {
      const nieuw = await kiesConversieprogramma();
      if (nieuw) {
        setStatus(nieuw);
        setStatusFout("");
      }
    } catch (e) {
      setStatusFout(String(e));
    }
  }

  const bladkeuze = props.bladen && props.bladen.namen.length > 1 && (
    <label>
      Blad
      <select value={blad} onChange={(e) => setBlad(Number(e.target.value))}>
        {props.bladen.namen.map((naam, index) => (
          <option key={index} value={index}>
            {naam}
            {index === props.bladen!.actief ? " (actief)" : ""}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="office-dialoogachtergrond">
      <section
        ref={dialoog}
        className="office-dialoog opslaanals"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titel`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            props.annuleer();
          }
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement &&
            event.target.type === "text"
          ) {
            event.preventDefault();
            bevestig();
          }
          if (event.key === "Tab") {
            const focusbaar = [
              ...(dialoog.current?.querySelectorAll<HTMLElement>(
                "input:not([disabled]), select:not([disabled]), button:not([disabled])",
              ) ?? []),
            ];
            const eerste = focusbaar[0],
              laatste = focusbaar[focusbaar.length - 1];
            if (event.shiftKey && document.activeElement === eerste) {
              event.preventDefault();
              laatste?.focus();
            } else if (!event.shiftKey && document.activeElement === laatste) {
              event.preventDefault();
              eerste?.focus();
            }
          }
        }}
      >
        <h2 id={`${id}-titel`}>Opslaan als</h2>
        <label className="opslaanals-naam">
          Bestandsnaam
          <span>
            <input
              ref={naamveld}
              type="text"
              value={naam}
              spellCheck={false}
              onChange={(e) => setNaam(e.target.value)}
            />
            <em>.{gekozen.ext}</em>
          </span>
        </label>

        <div className="opslaanals-runtime" role="status">
          {!desktop ? (
            <>
              In de browser maakt de app Markdown, CSV, HTML, tekst en PNG zelf
              en PDF via Afdrukken. Formaten met “alleen in de desktopapp”
              vragen de desktopversie met een kantoorruntime.
            </>
          ) : status === null ? (
            <>Kantoorruntime zoeken…</>
          ) : runtime ? (
            <>
              Kantoorruntime: {status.versie ?? status.pad}{" "}
              <small>
                (
                {status.bron === "omgeving"
                  ? "uit OPENAEC_CONVERSIE_PROGRAMMA"
                  : status.bron === "instelling"
                    ? "zelf gekozen"
                    : "automatisch gevonden"}
                {status.profiel === "veilig"
                  ? ", veilig profiel: macro’s uit"
                  : ", eigen profiel"}
                )
              </small>
            </>
          ) : (
            <>
              <TriangleAlert size={14} /> Geen kantoorruntime (LibreOffice)
              gevonden. Formaten via de runtime zijn niet beschikbaar.{" "}
              <button type="button" onClick={() => void kiesProgramma()}>
                Conversieprogramma kiezen
              </button>
            </>
          )}
          {statusFout && <p className="opslaanals-fout">{statusFout}</p>}
        </div>

        <fieldset className="opslaanals-formaten">
          <legend>Formaat</legend>
          {groepen.map(({ groep, formaten }) => (
            <div key={groep} role="group" aria-label={GROEPEN[groep]}>
              <h3>{GROEPEN[groep]}</h3>
              {formaten.map((formaat) => {
                const r = routeVan(formaat);
                return (
                  <label
                    key={formaat.ext}
                    className={`opslaanals-formaat${r ? "" : " is-uit"}${formaat.ext === gekozen.ext ? " is-gekozen" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`${id}-formaat`}
                      value={formaat.ext}
                      checked={formaat.ext === gekozen.ext}
                      disabled={!r}
                      aria-label={`${formaat.naam} (.${formaat.ext})`}
                      onChange={() => setExt(formaat.ext)}
                    />
                    <span>
                      <b>
                        {formaat.naam} <code>.{formaat.ext}</code>
                      </b>
                      <small>{formaat.behoud}</small>
                    </span>
                    <i>
                      {r
                        ? ROUTENAMEN[r]
                        : desktop
                          ? "runtime ontbreekt"
                          : "alleen in de desktopapp"}
                    </i>
                  </label>
                );
              })}
            </div>
          ))}
        </fieldset>

        {(gekozen.ext === "csv" || gekozen.ext === "tsv") && (
          <div className="opslaanals-opties">
            {gekozen.ext === "csv" && (
              <label>
                Scheidingsteken
                <select
                  value={scheidingsteken}
                  onChange={(e) =>
                    setScheidingsteken(e.target.value as Scheidingsteken)
                  }
                >
                  <option value=";">Puntkomma ; (Nederlands)</option>
                  <option value=",">Komma ,</option>
                  <option value="tab">Tab</option>
                  <option value="|">Verticale streep |</option>
                </select>
              </label>
            )}
            <label>
              Codering
              <select
                value={codering}
                onChange={(e) => setCodering(e.target.value as Codering)}
              >
                <option value="utf8-bom">UTF-8 met BOM (Excel)</option>
                <option value="utf8">UTF-8</option>
                <option value="windows-1252">Windows-1252 (ANSI)</option>
              </select>
            </label>
            {bladkeuze}
            <p>
              Alleen het gekozen blad, met waarden in plaats van formules. Tekst
              die met =, +, - of @ begint krijgt een apostrof, zodat een
              rekenprogramma die niet als formule uitvoert.
            </p>
          </div>
        )}
        {gekozen.ext === "png" && props.soort === "xlsx" && bladkeuze && (
          <div className="opslaanals-opties">{bladkeuze}</div>
        )}
        {gekozen.ext === "png" && props.soort === "pptx" && props.dias && (
          <div className="opslaanals-opties">
            <label>
              Dia
              <select
                value={dia}
                onChange={(e) => setDia(Number(e.target.value))}
              >
                {Array.from({ length: props.dias.aantal }, (_, index) => (
                  <option key={index} value={index}>
                    Dia {index + 1}
                    {index === props.dias!.huidig ? " (huidige)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {gekozen.ext === "pdf" && route === "runtime" && (
          <div className="opslaanals-opties">
            <label>
              PDF-variant
              <select
                value={pdfa}
                onChange={(e) =>
                  setPdfa(Number(e.target.value) as 0 | 1 | 2 | 3)
                }
              >
                <option value={0}>Gewone PDF</option>
                <option value={2}>PDF/A-2b (archief)</option>
                <option value={1}>PDF/A-1b</option>
                <option value={3}>PDF/A-3b</option>
              </select>
            </label>
            <label>
              {props.soort === "pptx" ? "Dia’s" : "Pagina’s"}
              <input
                type="text"
                placeholder="alle, of bijv. 1-3,5"
                value={bereik}
                aria-invalid={!bereikGeldig}
                onChange={(e) => setBereik(e.target.value)}
              />
            </label>
            {props.soort === "docx" && (
              <label className="opslaanals-vink">
                <input
                  type="checkbox"
                  checked={bladwijzers}
                  onChange={(e) => setBladwijzers(e.target.checked)}
                />
                Koppen als bladwijzers
              </label>
            )}
          </div>
        )}
        {route === "afdrukken" && (
          <p className="opslaanals-uitleg">
            PDF zonder kantoorruntime gaat via Afdrukken: kies in het
            afdrukvenster de printer <strong>Opslaan als PDF</strong> (Windows:
            “Microsoft Print to PDF”). Opmaak volgt de weergave in de editor.
          </p>
        )}
        {verlies && (
          <p className="opslaanals-verlies" role="alert">
            <TriangleAlert size={14} /> {verlies}
          </p>
        )}
        {gekozen.ext !== props.soort && route && (
          <p className="opslaanals-uitleg">
            Dit is een kopie in een ander formaat. Het document blijft als
            gewijzigd gemarkeerd tot je het als .{props.soort} bewaart.
          </p>
        )}
        <div className="office-dialoogacties">
          <button type="button" onClick={props.annuleer}>
            Annuleren
          </button>
          <button
            type="button"
            className="office-dialoogdoorgaan"
            disabled={!kan}
            onClick={bevestig}
          >
            <Save size={13} />{" "}
            {route === "afdrukken" ? "Afdrukken…" : "Opslaan"}
          </button>
        </div>
      </section>
    </div>
  );
}
