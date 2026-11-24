/**
 * Gegevensgereedschap van Open Rekenblad Studio (lint Gegevens): duplicaten
 * verwijderen of markeren, tekst naar kolommen, doelzoeken en statistiek.
 * De vensters staan op de gedeelde werkruimtedialoog (focusval, Esc, inert);
 * het werk zelf staat in de bijbehorende rekenblad-*.ts-bestanden.
 */
import { useContext, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartScatter, Columns3, CopyMinus, Target } from "lucide-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Actie, Groep, RibbonFout } from "../Ribbon";
import { Dialoog } from "../werkruimte/Dialoog";
import "../werkruimte/werkruimte.css";
import { useEditorApi } from "./editorApi";
import { formatGetal } from "../i18n/opmaak";
import { intlLocale } from "../i18n/config";
import "../import/import.css";
import type { Datumvolgorde, Kolomtype } from "../import/csvimport";
import { leesSelectie, Melding, type Selectie } from "./rekenblad-opdrachten";
import { adres, bereikA1, kolomLetters, ontleedAdres, ontleedBereik, type Bereik } from "./rekenblad-logica";
import { voerStatistiekUit, type Analyse, type StatResultaat } from "./rekenblad-statistiek";
import { standaardModel, verwijzing } from "../grafieken/model";
import { voegGrafiekToeXlsx } from "../grafieken/documenten";
import { bladFilter, getalUit } from "./rekenblad-filter";
import { doelzoeken, pasDoelToe, type Oplossing } from "./rekenblad-doelzoeken";
import { gebiedRond, raadKopregel } from "./rekenblad-gegevens";
import { bewerkDuplicaten, type DuplicaatActie } from "./rekenblad-duplicaten";
import {
  aantalKolommen,
  doelVan,
  leesBreekpunten,
  leesBron,
  raadBreekpunten,
  resultaat,
  splitsRegel,
  STANDAARD_SPLITSEN,
  teOverschrijven,
  tekstNaarKolommen,
  type Kolominstelling,
  type Scheidingen,
  type SplitsOpties,
} from "./rekenblad-tekstkolommen";
import "./rekenblad-gereedschap.css";
import "./rekenblad-gegevensgereedschap.css";

export type GereedschapSoort = "duplicaten" | "tekstKolommen" | "doelzoeken" | "statistiek";

const tekstVan = (fout: unknown) => (fout instanceof Melding || fout instanceof Error ? fout.message : String(fout));

function leesOfFout(api: XlsxEditorApi): Selectie | Error {
  try {
    return leesSelectie(api);
  } catch (fout) {
    return fout instanceof Error ? fout : new Error(String(fout));
  }
}

/** Groepen voor het lint Gegevens. */
export function GereedschapGroepen({ uit, open }: { uit: boolean; open: (soort: GereedschapSoort) => void }) {
  const { t } = useTranslation("spreadsheet");
  const api = useEditorApi().rekenblad;
  const knop = (soort: GereedschapSoort, naam: string, icoon: typeof CopyMinus, groot = false) => (
    <Actie
      naam={naam}
      icoon={icoon}
      groot={groot}
      disabled={!api || uit}
      title={naam}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => open(soort)}
    />
  );
  return (
    <Groep naam={t("dataTools.group")}>
      {knop("tekstKolommen", t("dataTools.textToColumns.button"), Columns3, true)}
      {knop("duplicaten", t("dataTools.duplicates.button"), CopyMinus, true)}
    </Groep>
  );
}

/** Groep Wat-als-analyse voor het lint Gegevens. */
export function AnalyseGroep({ uit, open }: { uit: boolean; open: (soort: GereedschapSoort) => void }) {
  const { t } = useTranslation("spreadsheet");
  const api = useEditorApi().rekenblad;
  const knop = (soort: GereedschapSoort, naam: string, icoon: typeof CopyMinus) => (
    <Actie naam={naam} icoon={icoon} groot disabled={!api || uit} title={naam} onMouseDown={(e) => e.preventDefault()} onClick={() => open(soort)} />
  );
  return (
    <Groep naam={t("dataTools.analysisGroup")}>
      {knop("doelzoeken", t("dataTools.goalSeek.button"), Target)}
      {knop("statistiek", t("dataTools.statistics.button"), ChartScatter)}
    </Groep>
  );
}

/** Het geopende gereedschapsvenster. */
export function GereedschapVenster({ soort, api, sluit }: { soort: GereedschapSoort; api: XlsxEditorApi; sluit: () => void }) {
  if (soort === "duplicaten") return <DuplicatenVenster api={api} sluit={sluit} />;
  if (soort === "tekstKolommen") return <TekstKolommenVenster api={api} sluit={sluit} />;
  if (soort === "doelzoeken") return <DoelzoekVenster api={api} sluit={sluit} />;
  if (soort === "statistiek") return <StatistiekVenster api={api} sluit={sluit} />;
  return null;
}

// ------------------------------------------------------------ gemeenschappelijk

interface Gebied {
  blad: number;
  sheetId: string;
  bereik: Bereik;
  kop: boolean;
}

/** Het filterbereik, de selectie of het gebied rond de cel, zoals bij sorteren. */
async function gegevensGebied(api: XlsxEditorApi, s: Selectie): Promise<Gebied> {
  const { blad, sheetId, bereik, focus } = s;
  const f = bladFilter(api.handle, blad);
  if (f && focus.row >= f.bereik.top && focus.row <= f.bereik.bottom && focus.col >= f.bereik.left && focus.col <= f.bereik.right)
    return { blad, sheetId, bereik: f.bereik, kop: true };
  const enkel = bereik.top === bereik.bottom && bereik.left === bereik.right;
  const b = enkel ? await gebiedRond(api, blad, sheetId, focus) : bereik;
  return { blad, sheetId, bereik: b, kop: await raadKopregel(api, blad, sheetId, b) };
}

// ------------------------------------------------------------ duplicaten

const ACTIES: DuplicaatActie[] = ["verwijderen", "markerenDubbel", "markerenUniek", "filteren"];

function DuplicatenVenster({ api, sluit }: { api: XlsxEditorApi; sluit: () => void }) {
  const { t } = useTranslation("spreadsheet");
  const fout = useContext(RibbonFout);
  const id = useId();
  const [selectie] = useState(() => leesOfFout(api));
  const [gebied, setGebied] = useState<Gebied | null>(null);
  const [kop, setKop] = useState(true);
  const [hoofdletters, setHoofdletters] = useState(false);
  const [gekozen, setGekozen] = useState<Set<number>>(new Set());
  const [actie, setActie] = useState<DuplicaatActie>("verwijderen");
  const [status, setStatus] = useState("");
  const [klaar, setKlaar] = useState(false);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    if (selectie instanceof Error) {
      setStatus(tekstVan(selectie));
      return;
    }
    void gegevensGebied(api, selectie)
      .then((g) => {
        setGebied(g);
        setKop(g.kop);
        setGekozen(new Set(Array.from({ length: g.bereik.right - g.bereik.left + 1 }, (_, i) => g.bereik.left + i)));
      })
      .catch((e) => setStatus(tekstVan(e)));
  }, []);

  const kolommen = gebied ? Array.from({ length: gebied.bereik.right - gebied.bereik.left + 1 }, (_, i) => gebied.bereik.left + i) : [];
  const kolomnaam = (k: number) => {
    const kopTekst = gebied && kop ? api.handle.cell(gebied.blad, gebied.bereik.top, k).input : "";
    return kopTekst ? kopTekst : t("data.sort.columnName", { column: kolomLetters(k) });
  };

  const uitvoeren = async () => {
    if (!gebied || bezig) return;
    setBezig(true);
    try {
      const r = await bewerkDuplicaten(api, {
        ...gebied,
        kop,
        kolommen: [...gekozen].sort((a, b) => a - b),
        hoofdlettergevoelig: hoofdletters,
        actie,
      });
      const aantal = formatGetal(r.aantal);
      const over = formatGetal(r.over);
      setStatus(
        r.aantal === 0 && (actie === "verwijderen" || actie === "filteren")
          ? t("dataTools.duplicates.none", { rows: over })
          : t(`dataTools.duplicates.result.${actie}`, { count: r.aantal, number: aantal, rows: over }),
      );
      setKlaar(true);
    } catch (e) {
      setStatus(tekstVan(e));
      fout(tekstVan(e));
    } finally {
      setBezig(false);
    }
  };

  return (
    <Dialoog
      titel={t("dataTools.duplicates.title")}
      sluit={sluit}
      className="rekenblad-venster is-smal"
      acties={
        klaar ? (
          <button type="button" className="werkruimte-knop is-primair" onClick={sluit} data-autofocus>
            {t("dataTools.ok")}
          </button>
        ) : (
          <>
            <button type="button" className="werkruimte-knop" onClick={sluit}>
              {t("common:cancel")}
            </button>
            <button
              type="button"
              className="werkruimte-knop is-primair"
              disabled={!gebied || !gekozen.size || bezig}
              onClick={() => void uitvoeren()}
            >
              {t(`dataTools.duplicates.run.${actie}`)}
            </button>
          </>
        )
      }
    >
      <div className="rekenblad-vensterinhoud">
        <p className="rekenblad-zacht">
          {gebied ? t("dataTools.range", { range: bereikA1(gebied.bereik) }) : t("data.filter.loading")}
        </p>
        <fieldset className="rekenblad-keuzes" disabled={klaar}>
          <legend>{t("dataTools.duplicates.action")}</legend>
          {ACTIES.map((a) => (
            <label key={a}>
              <input type="radio" name={`${id}-actie`} checked={actie === a} onChange={() => setActie(a)} />
              {t(`dataTools.duplicates.actions.${a}`)}
            </label>
          ))}
        </fieldset>
        <div className="rekenblad-vinkrij">
          <label>
            <input type="checkbox" checked={kop} disabled={klaar} onChange={(e) => setKop(e.target.checked)} />
            {t("dataTools.header")}
          </label>
          <label>
            <input type="checkbox" checked={hoofdletters} disabled={klaar} onChange={(e) => setHoofdletters(e.target.checked)} />
            {t("data.sort.caseSensitive")}
          </label>
        </div>
        <fieldset className="rekenblad-kolomkeuze" disabled={klaar || !gebied}>
          <legend>{t("dataTools.duplicates.columns")}</legend>
          <div className="rekenblad-kolomknoppen">
            <button type="button" className="werkruimte-knop" onClick={() => setGekozen(new Set(kolommen))}>
              {t("dataTools.selectAll")}
            </button>
            <button type="button" className="werkruimte-knop" onClick={() => setGekozen(new Set())}>
              {t("dataTools.selectNone")}
            </button>
          </div>
          <div className="rekenblad-kolomlijst" role="group" aria-label={t("dataTools.duplicates.columns")}>
            {kolommen.map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={gekozen.has(k)}
                  onChange={(e) => {
                    const nieuw = new Set(gekozen);
                    if (e.target.checked) nieuw.add(k);
                    else nieuw.delete(k);
                    setGekozen(nieuw);
                  }}
                />
                {kolomnaam(k)}
              </label>
            ))}
          </div>
        </fieldset>
        <p role="status" id={`${id}-status`} className="rekenblad-status">
          {status}
        </p>
      </div>
    </Dialoog>
  );
}

// ------------------------------------------------------------ tekst naar kolommen

const KOLOMTYPEN: Kolomtype[] = ["standaard", "tekst", "datum", "overslaan"];
const VOORBEELDRIJEN = 20;
const VOORBEELDKOLOMMEN = 40;

/** Decimaalteken van de interfacetaal als standaard voor getallen. */
const getalnotatieVanTaal = (): "nl" | "en" => ((1.5).toLocaleString(intlLocale()).includes(",") ? "nl" : "en");

/** Raadt de scheidingstekens uit de regels: het teken dat in de meeste regels staat. */
export function raadScheidingen(regels: readonly string[]): Scheidingen {
  const proef = regels.filter((r) => r.trim()).slice(0, 200);
  const telling = (teken: string) => proef.filter((r) => r.includes(teken)).length;
  const kandidaten: [keyof Omit<Scheidingen, "eigen">, string][] = [
    ["tab", "\t"],
    ["puntkomma", ";"],
    ["komma", ","],
  ];
  const beste = kandidaten.map(([k, t]) => [k, telling(t)] as const).sort((a, b) => b[1] - a[1])[0];
  const geen = { tab: false, puntkomma: false, komma: false, spatie: false, eigen: "" };
  if (beste && beste[1] > 0) return { ...geen, [beste[0]]: true };
  if (telling("|") > 0) return { ...geen, eigen: "|" };
  if (telling(" ") > 0) return { ...geen, spatie: true };
  return { ...geen, tab: true };
}

function TekstKolommenVenster({ api, sluit }: { api: XlsxEditorApi; sluit: () => void }) {
  const { t } = useTranslation("spreadsheet");
  const { t: ti } = useTranslation("import");
  const fout = useContext(RibbonFout);
  const id = useId();
  const [selectie] = useState(() => leesOfFout(api));
  const [bron, setBron] = useState<{ sheetId: string; bereik: Bereik; regels: string[] } | null>(null);
  const [opties, setOpties] = useState<SplitsOpties>(STANDAARD_SPLITSEN);
  const [breekTekst, setBreekTekst] = useState("");
  const [kolommen, setKolommen] = useState<Kolominstelling[]>([]);
  const [getalnotatie, setGetalnotatie] = useState<"nl" | "en">(getalnotatieVanTaal);
  const [doelTekst, setDoelTekst] = useState("");
  const [status, setStatus] = useState("");
  const [bevestig, setBevestig] = useState(false);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    if (selectie instanceof Error) {
      setStatus(tekstVan(selectie));
      return;
    }
    const { blad, sheetId, bereik, focus } = selectie;
    void (async () => {
      if (bereik.left !== bereik.right) throw new Melding(t("dataTools.textToColumns.messages.oneColumn"));
      let b = bereik;
      // Eén cel: de aaneengesloten gegevens in die kolom.
      if (bereik.top === bereik.bottom) {
        const g = await gebiedRond(api, blad, sheetId, focus);
        b = { top: g.top, bottom: g.bottom, left: focus.col, right: focus.col };
      }
      const regels = await leesBron(api, sheetId, b);
      const scheidingen = raadScheidingen(regels);
      const breekpunten = raadBreekpunten(regels.slice(0, 200));
      const vast = scheidingen.spatie && breekpunten.length > 0 && regels.some((r) => /\S {2,}\S/.test(r));
      setBron({ sheetId, bereik: b, regels });
      setOpties({ ...STANDAARD_SPLITSEN, soort: vast ? "vast" : "scheiding", scheidingen, breekpunten });
      setBreekTekst(breekpunten.join(", "));
      setDoelTekst(adres({ row: b.top, col: b.left }));
    })().catch((e) => setStatus(tekstVan(e)));
  }, []);

  const delen = useMemo(() => (bron ? bron.regels.map((r) => splitsRegel(r, opties)) : []), [bron, opties]);
  const breedte = aantalKolommen(delen);
  const typen: Kolominstelling[] = Array.from({ length: breedte }, (_, k) => kolommen[k] ?? { type: "standaard", datumvolgorde: "DMJ" });
  const typenSleutel = JSON.stringify(typen);
  const voorbeeld = useMemo(
    () =>
      resultaat(
        delen.slice(0, VOORBEELDRIJEN),
        typen.map((k) => (k.type === "overslaan" ? { ...k, type: "standaard" as Kolomtype } : k)),
        getalnotatie,
      ),
    [delen, typenSleutel, getalnotatie],
  );
  const zetOpties = (deel: Partial<SplitsOpties>) => {
    setOpties((oud) => ({ ...oud, ...deel }));
    setBevestig(false);
  };
  const zetScheiding = (deel: Partial<Scheidingen>) => zetOpties({ scheidingen: { ...opties.scheidingen, ...deel } });
  const zetKolom = (k: number, deel: Partial<Kolominstelling>) => {
    const nieuw = [...typen];
    nieuw[k] = { ...nieuw[k], ...deel };
    setKolommen(nieuw);
    setBevestig(false);
  };
  const wisselBreekpunt = (p: number) => {
    const punten = opties.breekpunten.includes(p)
      ? opties.breekpunten.filter((x) => x !== p)
      : [...opties.breekpunten, p].sort((a, b) => a - b);
    zetOpties({ breekpunten: punten });
    setBreekTekst(punten.join(", "));
  };

  const toepassen = async () => {
    if (!bron || bezig) return;
    const doelcel = ontleedAdres(doelTekst);
    if (!doelcel) {
      setStatus(t("dataTools.textToColumns.messages.badDestination"));
      return;
    }
    setBezig(true);
    try {
      const gehouden = typen.filter((k) => k.type !== "overslaan").length;
      const d = doelVan(bron.bereik, doelcel, gehouden);
      if (!bevestig) {
        const n = await teOverschrijven(api, bron.sheetId, bron.bereik, d);
        if (n > 0) {
          setStatus(t("dataTools.textToColumns.messages.overwrite", { count: n, number: formatGetal(n) }));
          setBevestig(true);
          return;
        }
      }
      const r = await tekstNaarKolommen(api, { sheetId: bron.sheetId, bron: bron.bereik, doelcel, opties, kolommen: typen, getalnotatie });
      api.selectCells(api.handle.sheetInfo().activeSheet, { anchor: { row: r.top, col: r.left }, focus: { row: r.bottom, col: r.right } });
      sluit();
    } catch (e) {
      setStatus(tekstVan(e));
      fout(tekstVan(e));
    } finally {
      setBezig(false);
    }
  };

  const s = opties.scheidingen;
  const vinkje = (sleutel: keyof Omit<Scheidingen, "eigen">, label: string) => (
    <label>
      <input type="checkbox" checked={s[sleutel]} onChange={(e) => zetScheiding({ [sleutel]: e.target.checked })} />
      {label}
    </label>
  );
  const lijnen = bron ? bron.regels.slice(0, 8) : [];
  const lengte = Math.min(120, Math.max(10, ...lijnen.map((r) => r.length + 1)));

  return (
    <Dialoog
      titel={t("dataTools.textToColumns.title")}
      sluit={sluit}
      className="rekenblad-venster"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={!bron || bezig} onClick={() => void toepassen()}>
            {bevestig ? t("dataTools.textToColumns.replace") : t("dataTools.apply")}
          </button>
        </>
      }
    >
      <div className="rekenblad-vensterinhoud">
        <p className="rekenblad-zacht">
          {bron
            ? t("dataTools.textToColumns.source", { range: bereikA1(bron.bereik), count: bron.regels.length, rows: formatGetal(bron.regels.length) })
            : t("data.filter.loading")}
        </p>
        <fieldset className="rekenblad-keuzes rekenblad-naast">
          <legend>{t("dataTools.textToColumns.kind")}</legend>
          <label>
            <input type="radio" name={`${id}-soort`} checked={opties.soort === "scheiding"} onChange={() => zetOpties({ soort: "scheiding" })} />
            {t("dataTools.textToColumns.delimited")}
          </label>
          <label>
            <input type="radio" name={`${id}-soort`} checked={opties.soort === "vast"} onChange={() => zetOpties({ soort: "vast" })} />
            {t("dataTools.textToColumns.fixedWidth")}
          </label>
        </fieldset>
        {opties.soort === "scheiding" ? (
          <fieldset className="rekenblad-keuzes">
            <legend>{ti("csv.separator")}</legend>
            <div className="rekenblad-vinkrij">
              {vinkje("tab", ti("csv.separatorTab"))}
              {vinkje("puntkomma", ti("csv.separatorSemicolon"))}
              {vinkje("komma", ti("csv.separatorComma"))}
              {vinkje("spatie", t("dataTools.textToColumns.space"))}
              <label>
                {ti("csv.otherCharacter")}
                <input className="rekenblad-smalveld" value={s.eigen} maxLength={4} onChange={(e) => zetScheiding({ eigen: e.target.value })} />
              </label>
            </div>
            <div className="rekenblad-vinkrij">
              <label>
                <input type="checkbox" checked={opties.samenvoegen} onChange={(e) => zetOpties({ samenvoegen: e.target.checked })} />
                {t("dataTools.textToColumns.mergeDelimiters")}
              </label>
              <label>
                {ti("csv.textQualifier")}
                <select value={opties.tekstteken} onChange={(e) => zetOpties({ tekstteken: e.target.value as SplitsOpties["tekstteken"] })}>
                  <option value={'"'}>{ti("csv.doubleQuote")}</option>
                  <option value="'">{ti("csv.singleQuote")}</option>
                  <option value="">{ti("csv.none")}</option>
                </select>
              </label>
            </div>
          </fieldset>
        ) : (
          <fieldset className="rekenblad-keuzes">
            <legend>{t("dataTools.textToColumns.breaks")}</legend>
            <p className="rekenblad-zacht">{t("dataTools.textToColumns.breaksHint")}</p>
            <div className="rekenblad-liniaal" aria-hidden="true">
              <div className="rekenblad-liniaalregel is-schaal">
                {Array.from({ length: lengte }, (_, p) => (
                  <span key={p}>{p % 10 === 0 ? String(p).slice(-1) : p % 5 === 0 ? "·" : " "}</span>
                ))}
              </div>
              {lijnen.map((regel, r) => (
                <div key={r} className="rekenblad-liniaalregel">
                  {Array.from({ length: lengte }, (_, p) => (
                    <span key={p} className={opties.breekpunten.includes(p) ? "is-breuk" : ""} onClick={() => p > 0 && wisselBreekpunt(p)}>
                      {regel[p] && regel[p] !== " " ? regel[p] : " "}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <label className="rekenblad-veld">
              {t("dataTools.textToColumns.breakPositions")}
              <input
                value={breekTekst}
                inputMode="numeric"
                placeholder="5, 12, 20"
                onChange={(e) => {
                  setBreekTekst(e.target.value);
                  zetOpties({ breekpunten: leesBreekpunten(e.target.value) });
                }}
              />
            </label>
          </fieldset>
        )}
        <div className="rekenblad-velden">
          <label>
            {ti("csv.numbers")}
            <select value={getalnotatie} onChange={(e) => setGetalnotatie(e.target.value as "nl" | "en")}>
              <option value="nl">{ti("csv.numbersDutch")}</option>
              <option value="en">{ti("csv.numbersEnglish")}</option>
            </select>
          </label>
          <label>
            {t("dataTools.textToColumns.destination")}
            <input
              value={doelTekst}
              onChange={(e) => {
                setDoelTekst(e.target.value);
                setBevestig(false);
              }}
            />
          </label>
        </div>
        <div className="importvenster-voorbeeld" role="region" aria-label={t("dataTools.textToColumns.preview")} tabIndex={0}>
          <table>
            <thead>
              <tr>
                {typen.slice(0, VOORBEELDKOLOMMEN).map((k, c) => (
                  <th key={c} scope="col">
                    <select
                      aria-label={ti("csv.columnType", { column: c + 1 })}
                      value={k.type}
                      onChange={(e) => zetKolom(c, { type: e.target.value as Kolomtype })}
                    >
                      {KOLOMTYPEN.map((soort) => (
                        <option key={soort} value={soort}>
                          {ti(`csv.types.${soort}`)}
                        </option>
                      ))}
                    </select>
                    {k.type === "datum" && (
                      <select
                        aria-label={ti("csv.dateOrder")}
                        value={k.datumvolgorde}
                        onChange={(e) => zetKolom(c, { datumvolgorde: e.target.value as Datumvolgorde })}
                      >
                        <option value="DMJ">{t("dataTools.textToColumns.dmy")}</option>
                        <option value="MDJ">{t("dataTools.textToColumns.mdy")}</option>
                        <option value="JMD">{t("dataTools.textToColumns.ymd")}</option>
                      </select>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {voorbeeld.map((rij, r) => (
                <tr key={r}>
                  {rij.slice(0, VOORBEELDKOLOMMEN).map((c, k) => {
                    const overslaan = typen[k]?.type === "overslaan";
                    const getal = !overslaan && c.notatie !== "plainText" && !c.invoer.startsWith("'") && c.invoer !== "";
                    return (
                      <td key={k} className={overslaan ? "is-overslaan" : getal ? "is-getal" : ""}>
                        {overslaan ? "—" : (delen[r]?.[k] ?? "")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </div>
    </Dialoog>
  );
}

// ------------------------------------------------------------ doelzoeken

function DoelzoekVenster({ api, sluit }: { api: XlsxEditorApi; sluit: () => void }) {
  const { t } = useTranslation("spreadsheet");
  const fout = useContext(RibbonFout);
  const [selectie] = useState(() => leesOfFout(api));
  const [formuleTekst, setFormuleTekst] = useState(() => (selectie instanceof Error ? "" : adres(selectie.focus)));
  const [doelTekst, setDoelTekst] = useState("");
  const [variabeleTekst, setVariabeleTekst] = useState("");
  const [status, setStatus] = useState(() => (selectie instanceof Error ? tekstVan(selectie) : ""));
  const [oplossing, setOplossing] = useState<(Oplossing & { cel: string; sheetId: string; variabele: { row: number; col: number } }) | null>(null);
  const [bezig, setBezig] = useState(false);
  const getal = (x: number) => formatGetal(x, { maximumSignificantDigits: 15 });

  const oplossen = async () => {
    if (selectie instanceof Error || bezig) return;
    const formulecel = ontleedAdres(formuleTekst);
    const variabelecel = ontleedAdres(variabeleTekst);
    const doelwaarde = getalUit(doelTekst);
    if (!formulecel) return setStatus(t("dataTools.goalSeek.messages.badFormulaCell"));
    if (doelwaarde === null) return setStatus(t("dataTools.goalSeek.messages.badTarget"));
    if (!variabelecel) return setStatus(t("dataTools.goalSeek.messages.badVariableCell"));
    setBezig(true);
    setOplossing(null);
    setStatus(t("dataTools.goalSeek.busy"));
    try {
      const r = await doelzoeken(api, { blad: selectie.blad, sheetId: selectie.sheetId, formulecel, variabelecel, doelwaarde });
      const cel = adres(variabelecel).toUpperCase();
      setOplossing({ ...r, cel, sheetId: selectie.sheetId, variabele: variabelecel });
      setStatus(
        r.gevonden
          ? t("dataTools.goalSeek.found", { cell: cel, value: getal(r.x), formula: adres(formulecel), result: getal(r.y) })
          : Number.isFinite(r.y)
            ? t("dataTools.goalSeek.notFound", { cell: cel, value: getal(r.x), result: getal(r.y) })
            : t("dataTools.goalSeek.messages.noNumber"),
      );
    } catch (e) {
      setStatus(tekstVan(e));
    } finally {
      setBezig(false);
    }
  };

  const toepassen = async () => {
    if (!oplossing || !Number.isFinite(oplossing.y)) return;
    try {
      await pasDoelToe(api, { sheetId: oplossing.sheetId, variabelecel: oplossing.variabele }, oplossing.x);
      sluit();
    } catch (e) {
      setStatus(tekstVan(e));
      fout(tekstVan(e));
    }
  };

  const wijzig = (zet: (w: string) => void) => (e: { target: { value: string } }) => {
    zet(e.target.value);
    setOplossing(null);
  };

  return (
    <Dialoog
      titel={t("dataTools.goalSeek.title")}
      sluit={sluit}
      className="rekenblad-venster is-smal"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop" disabled={bezig || selectie instanceof Error} onClick={() => void oplossen()}>
            {t("dataTools.goalSeek.solve")}
          </button>
          <button
            type="button"
            className="werkruimte-knop is-primair"
            disabled={!oplossing || !Number.isFinite(oplossing.y)}
            onClick={() => void toepassen()}
          >
            {t("dataTools.apply")}
          </button>
        </>
      }
    >
      <form
        className="rekenblad-vensterinhoud"
        onSubmit={(e) => {
          e.preventDefault();
          void (oplossing ? toepassen() : oplossen());
        }}
      >
        <label className="rekenblad-veld">
          {t("dataTools.goalSeek.formulaCell")}
          <input value={formuleTekst} onChange={wijzig(setFormuleTekst)} />
        </label>
        <label className="rekenblad-veld">
          {t("dataTools.goalSeek.target")}
          <input value={doelTekst} inputMode="decimal" onChange={wijzig(setDoelTekst)} data-autofocus />
        </label>
        <label className="rekenblad-veld">
          {t("dataTools.goalSeek.variableCell")}
          <input value={variabeleTekst} onChange={wijzig(setVariabeleTekst)} placeholder="B1" />
        </label>
        <p className="rekenblad-zacht">{t("dataTools.goalSeek.hint")}</p>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
        <button type="submit" hidden />
      </form>
    </Dialoog>
  );
}

// ------------------------------------------------------------ statistiek

const ANALYSES: Analyse[] = ["beschrijvend", "correlatie", "regressie", "histogram", "steekproef"];

function StatistiekVenster({ api, sluit }: { api: XlsxEditorApi; sluit: () => void }) {
  const { t } = useTranslation("spreadsheet");
  const fout = useContext(RibbonFout);
  const herlaad = useEditorApi().herlaad;
  const id = useId();
  const [selectie] = useState(() => leesOfFout(api));
  const [analyse, setAnalyse] = useState<Analyse>("beschrijvend");
  const [invoer, setInvoer] = useState("");
  const [xTekst, setXTekst] = useState("");
  const [klassen, setKlassen] = useState("");
  const [perKolom, setPerKolom] = useState(true);
  const [labels, setLabels] = useState(true);
  const [formules, setFormules] = useState(true);
  const [methode, setMethode] = useState<"willekeurig" | "periodiek">("willekeurig");
  const [grootte, setGrootte] = useState("10");
  const [nieuwBlad, setNieuwBlad] = useState(true);
  const [doelTekst, setDoelTekst] = useState("");
  const [grafiek, setGrafiek] = useState(false);
  const [status, setStatus] = useState(() => (selectie instanceof Error ? tekstVan(selectie) : ""));
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    if (selectie instanceof Error) return;
    void gegevensGebied(api, selectie)
      .then((g) => {
        setInvoer(bereikA1(g.bereik));
        setLabels(g.kop);
        // Twee kolommen: de eerste is x (voor regressie), de tweede y.
        if (g.bereik.right - g.bereik.left === 1) setXTekst(bereikA1({ ...g.bereik, right: g.bereik.left }));
        setDoelTekst(adres({ row: g.bereik.top, col: g.bereik.right + 2 }));
      })
      .catch(() => undefined);
  }, []);

  const uitvoeren = async () => {
    if (selectie instanceof Error || bezig) return;
    let b = ontleedBereik(invoer);
    if (!b) return setStatus(t("dataTools.statistics.messages.badRange"));
    let x: Bereik | null = null;
    if (analyse === "regressie") {
      x = ontleedBereik(xTekst);
      if (!x) return setStatus(t("dataTools.statistics.messages.badRange"));
      // Twee kolommen als y opgegeven en de eerste is x: de tweede kolom is y.
      if (b.right > b.left && x.left === b.left && x.right === b.left) b = { ...b, left: b.right };
    }
    const k = analyse === "histogram" && klassen.trim() ? ontleedBereik(klassen) : null;
    if (analyse === "histogram" && klassen.trim() && !k) return setStatus(t("dataTools.statistics.messages.badRange"));
    const doelcel = nieuwBlad ? null : ontleedAdres(doelTekst);
    if (!nieuwBlad && !doelcel) return setStatus(t("dataTools.statistics.messages.badDestination"));
    const n = Number(grootte);
    if (analyse === "steekproef" && (!Number.isInteger(n) || n < 1)) return setStatus(t("dataTools.statistics.messages.badSize"));
    setBezig(true);
    try {
      const r: StatResultaat = await voerStatistiekUit(api, {
        analyse,
        blad: selectie.blad,
        sheetId: selectie.sheetId,
        invoer: b,
        perKolom: analyse === "beschrijvend" || analyse === "correlatie" ? perKolom : true,
        labels,
        x,
        klassen: k,
        methode,
        grootte: n,
        formules: analyse !== "steekproef" && formules,
        doelcel,
      });
      try {
        const c = { row: r.bereik.top, col: r.bereik.left };
        if (!api.selectCells(r.blad, { anchor: c, focus: { row: r.bereik.bottom, col: r.bereik.right } })) api.handle.setActiveSheet(r.blad);
      } catch {
        // Navigeren is een gemak.
      }
      if (grafiek && r.regressie && herlaad) {
        const g = r.regressie;
        const top = g.links.row + 8;
        const onder = g.links.row + g.rijen - 1;
        const col = g.links.col;
        const model = standaardModel({
          soort: "spreiding",
          titel: `${g.y.naam} ~ ${g.x.naam}`,
          asTitelX: g.x.naam,
          asTitelY: g.y.naam,
          categorieen: g.x.waarden.map((w) => (w === null ? "" : String(w))),
          categorieenRef: verwijzing(g.bladnaam, top, col, onder, col),
          reeksen: [
            { naam: g.y.naam, waarden: g.y.waarden, waardenRef: verwijzing(g.bladnaam, top, col + 1, onder, col + 1) },
            {
              naam: t("dataTools.statistics.trendline"),
              waarden: g.voorspeld,
              waardenRef: verwijzing(g.bladnaam, top, col + 2, onder, col + 2),
              lijn: true,
            },
          ],
        });
        const bytes = await herlaad.bytes();
        const plek = voegGrafiekToeXlsx(bytes, model, { blad: r.blad, col: col + 5, row: g.links.row, kolommen: 8, rijen: 16 });
        herlaad.vervang(plek.bytes, { blad: r.blad, cel: { row: r.bereik.top, col: r.bereik.left } });
      }
      sluit();
    } catch (e) {
      setStatus(tekstVan(e));
      fout(tekstVan(e));
    } finally {
      setBezig(false);
    }
  };

  const perKeuze = analyse === "beschrijvend" || analyse === "correlatie";
  return (
    <Dialoog
      titel={t("dataTools.statistics.title")}
      sluit={sluit}
      className="rekenblad-venster is-smal"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={bezig || selectie instanceof Error} onClick={() => void uitvoeren()}>
            {t("dataTools.statistics.run")}
          </button>
        </>
      }
    >
      <form
        className="rekenblad-vensterinhoud"
        onSubmit={(e) => {
          e.preventDefault();
          void uitvoeren();
        }}
      >
        <label className="rekenblad-veld">
          {t("dataTools.statistics.analysis")}
          <select value={analyse} onChange={(e) => setAnalyse(e.target.value as Analyse)} data-autofocus>
            {ANALYSES.map((a) => (
              <option key={a} value={a}>
                {t(`dataTools.statistics.analyses.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="rekenblad-zacht">{t(`dataTools.statistics.explain.${analyse}`)}</p>
        <div className="rekenblad-velden">
          <label>
            {t(analyse === "regressie" ? "dataTools.statistics.yRange" : "dataTools.statistics.inputRange")}
            <input value={invoer} onChange={(e) => setInvoer(e.target.value)} placeholder="A1:A20" />
          </label>
          {analyse === "regressie" && (
            <label>
              {t("dataTools.statistics.xRange")}
              <input value={xTekst} onChange={(e) => setXTekst(e.target.value)} placeholder="B1:B20" />
            </label>
          )}
          {analyse === "histogram" && (
            <label>
              {t("dataTools.statistics.binRange")}
              <input value={klassen} onChange={(e) => setKlassen(e.target.value)} placeholder={t("dataTools.statistics.automatic")} />
            </label>
          )}
          {analyse === "steekproef" && (
            <label>
              {t(methode === "periodiek" ? "dataTools.statistics.period" : "dataTools.statistics.sampleSize")}
              <input value={grootte} inputMode="numeric" onChange={(e) => setGrootte(e.target.value)} />
            </label>
          )}
        </div>
        {perKeuze && (
          <fieldset className="rekenblad-keuzes rekenblad-naast">
            <legend>{t("dataTools.statistics.groupedBy")}</legend>
            <label>
              <input type="radio" name={`${id}-per`} checked={perKolom} onChange={() => setPerKolom(true)} />
              {t("dataTools.statistics.columns")}
            </label>
            <label>
              <input type="radio" name={`${id}-per`} checked={!perKolom} onChange={() => setPerKolom(false)} />
              {t("dataTools.statistics.rows")}
            </label>
          </fieldset>
        )}
        {analyse === "steekproef" && (
          <fieldset className="rekenblad-keuzes rekenblad-naast">
            <legend>{t("dataTools.statistics.method")}</legend>
            <label>
              <input type="radio" name={`${id}-methode`} checked={methode === "willekeurig"} onChange={() => setMethode("willekeurig")} />
              {t("dataTools.statistics.random")}
            </label>
            <label>
              <input type="radio" name={`${id}-methode`} checked={methode === "periodiek"} onChange={() => setMethode("periodiek")} />
              {t("dataTools.statistics.periodic")}
            </label>
          </fieldset>
        )}
        <div className="rekenblad-vinkrij">
          <label>
            <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
            {t(perKeuze && !perKolom ? "dataTools.statistics.labelsColumn" : "dataTools.statistics.labelsRow")}
          </label>
          {analyse !== "steekproef" && (
            <label>
              <input type="checkbox" checked={formules} onChange={(e) => setFormules(e.target.checked)} />
              {t("dataTools.statistics.formulas")}
            </label>
          )}
          {analyse === "regressie" && (
            <label>
              <input type="checkbox" checked={grafiek} onChange={(e) => setGrafiek(e.target.checked)} />
              {t("dataTools.statistics.chart")}
            </label>
          )}
        </div>
        {analyse === "regressie" && grafiek && <p className="rekenblad-zacht">{t("dataTools.statistics.chartHint")}</p>}
        <fieldset className="rekenblad-keuzes">
          <legend>{t("dataTools.statistics.output")}</legend>
          <label>
            <input type="radio" name={`${id}-uit`} checked={nieuwBlad} onChange={() => setNieuwBlad(true)} />
            {t("dataTools.statistics.newSheet")}
          </label>
          <label>
            <input type="radio" name={`${id}-uit`} checked={!nieuwBlad} onChange={() => setNieuwBlad(false)} />
            {t("dataTools.statistics.outputCell")}
            <input
              className="rekenblad-smalveld"
              aria-label={t("dataTools.statistics.outputCell")}
              value={doelTekst}
              disabled={nieuwBlad}
              onChange={(e) => setDoelTekst(e.target.value)}
            />
          </label>
        </fieldset>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
        <button type="submit" hidden />
      </form>
    </Dialoog>
  );
}
