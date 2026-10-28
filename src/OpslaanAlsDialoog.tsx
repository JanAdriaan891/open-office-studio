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
import type { Rapport } from "./import/rapport";
import { Verliesrapport } from "./import/RapportMelding";
import { VERSLEUTELBAAR } from "./import/bron";
import type { Codering, Scheidingsteken } from "./export/csv";
import { PdfOpties, standaardAppPdf } from "./export/PdfOpties";
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
  /** Verliesrapport voor dit formaat en deze route, of null. */
  verlies: (
    formaat: Uitvoerformaat,
    route: Route | null,
    metWachtwoord: boolean,
  ) => Rapport | null;
  /** Het origineel was met een wachtwoord versleuteld. */
  versleuteld?: boolean;
  /** Het document is als macrobestand geopend (VBA-project beschikbaar). */
  macros?: boolean;
  /** Wachtwoord dat in deze sessie al voor dit document is gekozen. */
  wachtwoord?: string;
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
  const [tekstcodering, setTekstcodering] = useState<Codering>("utf8");
  const [beveiligen, setBeveiligen] = useState(
    !!props.versleuteld || !!props.wachtwoord,
  );
  const [wachtwoord, setWachtwoord] = useState(props.wachtwoord ?? "");
  const [herhaling, setHerhaling] = useState(props.wachtwoord ?? "");
  const [blad, setBlad] = useState(props.bladen?.actief ?? 0);
  const [dia, setDia] = useState(props.dias?.huidig ?? 0);
  const [pdfa, setPdfa] = useState<0 | 1 | 2 | 3>(0);
  const [bladwijzers, setBladwijzers] = useState(true);
  const [bereik, setBereik] = useState("");
  const [pdfViaRuntime, setPdfViaRuntime] = useState(false);
  const [appPdf, setAppPdf] = useState(standaardAppPdf);

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
  // Macroformaten alleen voor een geopend macrobestand (met het VBA-project).
  const formaten = useMemo(
    () =>
      uitvoerlijst(props.soort).filter(
        (f) => f.groep !== "macro" || props.macros,
      ),
    [props.soort, props.macros],
  );
  const gekozen = formaten.find((f) => f.ext === ext) ?? formaten[0];
  // Zolang de status laadt, rekenen we in de desktopapp op de runtime.
  const routeVan = (f: Uitvoerformaat) =>
    kiesRoute(f, desktop && (status === null || runtime));
  // PDF maakt de app zelf; met runtime kan de gebruiker ervoor kiezen (PDF/A).
  const route =
    gekozen.ext === "pdf" && pdfViaRuntime && runtime
      ? "runtime"
      : routeVan(gekozen);
  const kanBeveiligen = VERSLEUTELBAAR.has(gekozen.ext) && route === "engine";
  const metWachtwoord = kanBeveiligen && beveiligen;
  const wachtwoordFout = !metWachtwoord
    ? ""
    : !wachtwoord
      ? "Kies een wachtwoord."
      : wachtwoord !== herhaling
        ? "De wachtwoorden zijn niet gelijk."
        : wachtwoord.length > 255
          ? "Hooguit 255 tekens."
          : "";
  const verlies = props.verlies(gekozen, route, metWachtwoord);
  const groepen = (Object.keys(GROEPEN) as Groep[])
    .map((groep) => ({
      groep,
      formaten: formaten.filter((f) => f.groep === groep),
    }))
    .filter((g) => g.formaten.length);
  const bereikGeldig = !bereik.trim() || /^[\d\s,-]+$/.test(bereik);
  const kan = !!route && !!naam.trim() && bereikGeldig && !wachtwoordFout;

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
      ...(metWachtwoord ? { wachtwoord } : {}),
      ...(gekozen.ext === "txt" && route === "tekst"
        ? { codering: tekstcodering }
        : {}),
      ...(gekozen.ext === "png" && props.soort === "xlsx" ? { blad } : {}),
      ...(gekozen.ext === "png" && props.soort === "pptx" ? { dia } : {}),
      ...(gekozen.ext === "pdf" && route === "runtime"
        ? { pdfa, bladwijzers, bereik: bereik.trim() || undefined }
        : {}),
      ...(gekozen.ext === "pdf" && route === "engine"
        ? { pdf: appPdf, bereik: bereik.trim() || undefined }
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
              In de browser maakt de app Markdown, CSV, HTML, tekst, PNG en PDF
              zelf. Formaten met “alleen in de desktopapp”
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
        {kanBeveiligen && (
          <div className="opslaanals-opties">
            <label className="opslaanals-vink">
              <input
                type="checkbox"
                checked={beveiligen}
                onChange={(e) => setBeveiligen(e.target.checked)}
              />
              Beveiligen met een wachtwoord om te openen
            </label>
            {beveiligen && (
              <>
                <label>
                  Wachtwoord
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={wachtwoord}
                    onChange={(e) => setWachtwoord(e.target.value)}
                  />
                </label>
                <label>
                  Herhaal wachtwoord
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={herhaling}
                    aria-invalid={!!herhaling && !!wachtwoordFout}
                    onChange={(e) => setHerhaling(e.target.value)}
                  />
                </label>
              </>
            )}
            <p>
              {beveiligen
                ? "Versleuteling volgens ECMA-376 (AES-256), te openen in Word, Excel, PowerPoint en LibreOffice. Het wachtwoord wordt niet bewaard; ben je het kwijt, dan is het bestand niet meer te openen."
                : "Dit is geen schrijf- of bladbeveiliging: zonder vinkje wordt het bestand onversleuteld bewaard."}
              {wachtwoordFout && beveiligen && (wachtwoord || herhaling) ? (
                <span className="opslaanals-fout"> {wachtwoordFout}</span>
              ) : null}
            </p>
          </div>
        )}
        {gekozen.ext === "txt" && route === "tekst" && (
          <div className="opslaanals-opties">
            <label>
              Codering
              <select
                value={tekstcodering}
                onChange={(e) => setTekstcodering(e.target.value as Codering)}
              >
                <option value="utf8">UTF-8</option>
                <option value="utf8-bom">
                  UTF-8 met BOM (Kladblok, Excel)
                </option>
                <option value="windows-1252">Windows-1252 (ANSI)</option>
              </select>
            </label>
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
        {gekozen.ext === "pdf" && (
          <PdfOpties
            soort={props.soort}
            runtime={runtime}
            viaRuntime={route === "runtime"}
            setViaRuntime={setPdfViaRuntime}
            keuze={appPdf}
            wijzig={setAppPdf}
            bereik={bereik}
            setBereik={setBereik}
            bereikGeldig={bereikGeldig}
          />
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
          <Verliesrapport
            rapport={verlies}
            bestandsnaam={`${naam.trim() || "Naamloos"}.${props.soort}`}
          />
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
