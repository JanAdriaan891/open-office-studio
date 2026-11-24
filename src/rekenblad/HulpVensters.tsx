/**
 * Kleine hulpvensters uit de ideeënlijst (#376): een aantal rijen of kolommen
 * invoegen, doorvoeren tot een opgegeven cel en de grote formulebewerker.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { useOpmaak } from "../i18n/opmaak";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { vul } from "../lint/rekenblad-gegevens";
import { adres, bereikA1 } from "../lint/rekenblad-logica";
import { alleenLezen, leesSelectie, Melding, type Selectie } from "../lint/rekenblad-opdrachten";
import { leesAantal, maxInvoegen, voegAantalIn, type InvoegAs, type InvoegPlek } from "./aantalInvoegen";
import { doelCellen, doortrekDoel, leesDoel, MAX_DOORTREKKEN } from "./doortrekken";
import { formuleOpEenRegel, formuleOpRegels } from "./formuleOpmaak";
import { regionaleInvoer } from "./regionaleInvoer";

function selectieOfFout(api: XlsxEditorApi): Selectie | Error {
  try {
    return leesSelectie(api);
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

/** Een gekozen aantal rijen of kolommen invoegen, boven/links of onder/rechts van de selectie. */
export function InvoegenVenster({ api, as, sluiten }: { api: XlsxEditorApi; as: InvoegAs; sluiten: () => void }) {
  const { t } = useTranslation("spreadsheet");
  const opmaak = useOpmaak();
  const rij = as === "rij";
  const [aantal, setAantal] = useState(() => {
    const s = selectieOfFout(api);
    if (s instanceof Error) return "1";
    return String(rij ? s.bereik.bottom - s.bereik.top + 1 : s.bereik.right - s.bereik.left + 1);
  });
  const [plek, setPlek] = useState<InvoegPlek>("voor");
  const [status, setStatus] = useState("");
  const n = leesAantal(aantal, as);
  return (
    <Paneel titel={t(rij ? "insertCount.titleRows" : "insertCount.titleColumns")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={async (e) => {
          e.preventDefault();
          if (n === null) return;
          try {
            await voegAantalIn(api, as, plek, n);
            sluiten();
          } catch (fout) {
            setStatus(tekstVan(fout));
          }
        }}
      >
        <label>
          {t(rij ? "insertCount.countRows" : "insertCount.countColumns")}
          <input
            inputMode="numeric"
            value={aantal}
            aria-invalid={aantal !== "" && n === null}
            onChange={(e) => setAantal(e.target.value)}
          />
        </label>
        <p className="rekenblad-hint">{t("insertCount.hint", { max: opmaak.getal(maxInvoegen(as)) })}</p>
        <fieldset className="rekenblad-keuzes">
          <legend>{t("insertCount.position")}</legend>
          {(["voor", "na"] as const).map((p) => (
            <label key={p} className="rekenblad-vinkje">
              <input type="radio" name="invoegplek" checked={plek === p} onChange={() => setPlek(p)} />
              {t(`insertCount.${rij ? (p === "voor" ? "above" : "below") : p === "voor" ? "left" : "right"}`)}
            </label>
          ))}
        </fieldset>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:cancel")}
          </button>
          <button type="submit" className="rekenblad-primair" disabled={n === null || alleenLezen(api)}>
            {t("insertCount.insert")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}

/** De selectie doorvoeren tot een opgegeven cel, rij of kolom (zoals slepen met de vulgreep). */
export function DoortrekkenVenster({ api, sluiten }: { api: XlsxEditorApi; sluiten: () => void }) {
  const { t } = useTranslation("spreadsheet");
  const opmaak = useOpmaak();
  const [selectie] = useState(() => selectieOfFout(api));
  const [tekst, setTekst] = useState("");
  const [status, setStatus] = useState("");
  const [bezig, setBezig] = useState(false);
  if (selectie instanceof Error)
    return (
      <Paneel titel={t("fillTo.title")} sluiten={sluiten}>
        <p role="alert">{selectie.message}</p>
      </Paneel>
    );
  const bron = selectie.bereik;
  const cel = tekst.trim() ? leesDoel(tekst, bron) : null;
  const doel = cel ? doortrekDoel(bron, cel) : null;
  const teGroot = !!doel && doelCellen(doel) > MAX_DOORTREKKEN;
  const uitleg = !tekst.trim()
    ? t("fillTo.hint")
    : !cel
      ? t("fillTo.invalid")
      : !doel
        ? t("fillTo.inside")
        : teGroot
          ? t("fillTo.tooLarge", { max: opmaak.getal(MAX_DOORTREKKEN) })
          : t(`fillTo.preview.${doel.richting}`, { range: bereikA1(doel.doel), cells: doel.aantal });
  return (
    <Paneel titel={t("fillTo.title")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!doel || teGroot || bezig) return;
          setBezig(true);
          try {
            const r = await vul(api, selectie.blad, selectie.sheetId, bron, doel.doel, doel.richting, "auto");
            api.selectCells(selectie.blad, {
              anchor: { row: r.bereik.top, col: r.bereik.left },
              focus: { row: r.bereik.bottom, col: r.bereik.right },
            });
            sluiten();
          } catch (fout) {
            setStatus(tekstVan(fout));
          } finally {
            setBezig(false);
          }
        }}
      >
        <p className="rekenblad-hint">{t("fillTo.source", { range: bereikA1(bron) })}</p>
        <label>
          {t("fillTo.target")}
          <input
            value={tekst}
            spellCheck={false}
            autoCapitalize="characters"
            aria-invalid={tekst.trim() !== "" && (!doel || teGroot)}
            onChange={(e) => setTekst(e.target.value)}
          />
        </label>
        <p className="rekenblad-hint" aria-live="polite">
          {uitleg}
        </p>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:cancel")}
          </button>
          <button
            type="submit"
            className="rekenblad-primair"
            disabled={!doel || teGroot || bezig || alleenLezen(api)}
          >
            {t("fillTo.fill")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}

/**
 * Grote formulebewerker: de inhoud van de actieve cel in een ruim, meerregelig
 * veld. Enter geeft een nieuwe regel, Ctrl+Enter legt vast (één
 * ongedaan-maakstap). Regeleinden en inspringing blijven in de formule staan.
 */
export function FormuleVenster({ api, sluiten }: { api: XlsxEditorApi; sluiten: () => void }) {
  const { t } = useTranslation("spreadsheet");
  const [selectie] = useState(() => selectieOfFout(api));
  const [tekst, setTekst] = useState(() =>
    selectie instanceof Error ? "" : api.handle.cell(selectie.blad, selectie.focus.row, selectie.focus.col).input,
  );
  const [status, setStatus] = useState("");
  const veld = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const v = veld.current;
    if (!v) return;
    v.focus();
    v.setSelectionRange(v.value.length, v.value.length);
  }, []);
  if (selectie instanceof Error)
    return (
      <Paneel titel={t("formulaEditor.title", { cell: "" })} sluiten={sluiten} breed>
        <p role="alert">{selectie.message}</p>
      </Paneel>
    );
  const cel = selectie.focus;
  const lezen = alleenLezen(api);
  const isFormule = tekst.startsWith("=");
  const vastleggen = async () => {
    if (lezen) return;
    try {
      const r = await api.applyEdits({
        expectVersion: await api.version(),
        steps: [
          regionaleInvoer({ sheetId: selectie.sheetId, range: { kind: "rowCol", start: cel, end: cel } }, [[tekst]]),
        ],
      });
      if (!r.ok) throw new Melding(r.failure.message);
      sluiten();
    } catch (fout) {
      setStatus(tekstVan(fout));
    }
  };
  return (
    <Paneel titel={t("formulaEditor.title", { cell: adres(cel) })} sluiten={sluiten} breed>
      <form
        className="rekenblad-formulier"
        onSubmit={(e) => {
          e.preventDefault();
          void vastleggen();
        }}
      >
        <textarea
          ref={veld}
          className="rekenblad-formulebewerker"
          value={tekst}
          rows={14}
          spellCheck={false}
          readOnly={lezen}
          aria-label={t("formulaEditor.label", { cell: adres(cel) })}
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void vastleggen();
            } else if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
              // Tab springt in; Shift+Tab verlaat het veld (toetsenbordbediening).
              e.preventDefault();
              const v = e.currentTarget;
              const p = v.selectionStart;
              const nieuw = `${v.value.slice(0, p)}  ${v.value.slice(v.selectionEnd)}`;
              setTekst(nieuw);
              requestAnimationFrame(() => v.setSelectionRange(p + 2, p + 2));
            }
          }}
        />
        <p className="rekenblad-hint">
          {t("formulaEditor.hint", { lines: tekst.split("\n").length, characters: tekst.length })}
        </p>
        <div className="rekenblad-knoppen">
          <button type="button" disabled={!isFormule || lezen} onClick={() => setTekst(formuleOpRegels(tekst))}>
            {t("formulaEditor.format")}
          </button>
          <button type="button" disabled={!isFormule || lezen} onClick={() => setTekst(formuleOpEenRegel(tekst))}>
            {t("formulaEditor.singleLine")}
          </button>
          <button type="button" onClick={sluiten}>
            {t("common:cancel")}
          </button>
          <button type="submit" className="rekenblad-primair" disabled={lezen}>
            {t("common:ok")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}
