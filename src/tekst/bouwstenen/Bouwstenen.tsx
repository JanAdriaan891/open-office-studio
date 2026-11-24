/**
 * Bouwstenen (AutoTekst) en het AutoCorrectie-venster in Open Tekst Studio:
 * - Invoegen › Bouwstenen: galerij per categorie, selectie opslaan als
 *   bouwsteen (met opmaak) en beheren (hernoemen, categorie, verwijderen,
 *   exporteren en importeren);
 * - naam typen + F3 voegt de bouwsteen in (zoals AutoTekst in LibreOffice);
 * - Extra › AutoCorrectie-opties: de vervangingstabel per taal,
 *   uitzonderingen en de opties die tijdens het typen gelden
 *   (src/spelling/autocorrectie.ts).
 */
import { useContext, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Blocks, SpellCheck2 } from "lucide-react";
import i18next from "../../i18n/config";
import { Actie, RibbonFout } from "../../Ribbon";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import "../gedeeld/tekst-word.css";
import { useEditorApi, useEditorZichtbaar } from "../../lint/editorApi";
import { bewaarBytes } from "../../afdrukken/bewaren";
import { useInstellingen, wijzigInstellingen } from "../../instellingen";
import { maakWinkel } from "../gedeeld/winkel";
import { fout } from "../gedeeld/engine";
import { Keuzemenu, type Menuregel } from "../pagina/ui/Keuzemenu";
import { Tabbladen } from "../velden";
import { TALEN, taalNaam, type TaalId } from "../../spelling/talen";
import type { AutocorrectieInstellingen } from "../../spelling/autocorrectie";
import {
  bewaarAutocorrectie,
  exportTekst as acExport,
  herstelTaal,
  importTekst as acImport,
  leesAutocorrectie,
  verwijderVervanging,
  vervangingenVoor,
  zetVervanging,
  type AutocorrectieLijst,
} from "../../spelling/autocorrectieLijst";
import {
  alleBouwstenen,
  bewaarBouwstenen,
  exportTekst,
  importTekst,
  metBouwsteen,
  nieuwId,
  useBouwstenen,
  zoekOpNaam,
  type Bouwsteen,
} from "./opslag";
import { leesSelectie, voegSegmentenIn, woordVoorCursor } from "./engine";
import "./bouwstenen.css";

type Venster = "opslaan" | "beheren" | "autocorrectie" | null;
const winkel = maakWinkel<{ venster: Venster; selectie: Awaited<ReturnType<typeof leesSelectie>> | null }>({ venster: null, selectie: null });

const tr = (sleutel: string, waarden?: Record<string, unknown>) => i18next.t(`writer:autoText.${sleutel}`, waarden) as string;

/** F3: de bouwsteen bij het woord vóór de cursor. Geeft false als er geen past. */
export async function bouwsteenViaNaam(api: () => import("@betteroffice/docx-react").DocxEditorRef | null) {
  const woord = await woordVoorCursor(api());
  const b = woord ? zoekOpNaam(alleBouwstenen(), woord) : null;
  if (!woord || !b) throw new Error(woord ? tr("errors.noMatch", { name: woord }) : tr("errors.typeName"));
  await voegSegmentenIn(api(), b.segmenten, woord.length);
}

/** Invoegen › Bouwstenen. */
export function BouwsteenMenu({ uit }: { uit: boolean }) {
  const { t } = useTranslation("writer");
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  const lijst = useBouwstenen();
  const regels = (): Menuregel[] => {
    const uitkomst: Menuregel[] = [];
    const perCategorie = new Map<string, Bouwsteen[]>();
    for (const b of lijst) perCategorie.set(b.categorie, [...(perCategorie.get(b.categorie) ?? []), b]);
    for (const [categorie, stenen] of perCategorie) {
      uitkomst.push({ kop: categorie || t("autoText.general") });
      for (const b of stenen)
        uitkomst.push({
          naam: b.naam,
          uitleg: b.tekst.replace(/\s+/g, " ").slice(0, 80),
          uit,
          kies: () => void voegSegmentenIn(api(), b.segmenten).catch((e) => meld(fout(e))),
        });
    }
    if (!lijst.length) uitkomst.push({ naam: t("autoText.empty"), uit: true, kies: () => {} });
    uitkomst.push(
      { scheiding: true },
      {
        naam: t("autoText.saveSelection"),
        uit,
        kies: () =>
          void leesSelectie(api())
            .then((selectie) => winkel.zet(api, { venster: "opslaan", selectie }))
            .catch((e) => meld(fout(e))),
      },
      { naam: t("autoText.manage"), kies: () => winkel.zet(api, { venster: "beheren" }) },
    );
    return uitkomst;
  };
  return <Keuzemenu naam={t("autoText.buildingBlocks")} icoon={Blocks} groot uitleg={t("autoText.hint", { key: "F3" })} regels={regels} />;
}

/** Extra › AutoCorrectie-opties. */
export function AutoCorrectieKnop() {
  const { t } = useTranslation("writer");
  const api = useEditorApi().tekst;
  return (
    <Actie
      naam={t("autoCorrect.button")}
      icoon={SpellCheck2}
      groot
      title={t("autoCorrect.button")}
      onClick={() => winkel.zet(api, { venster: "autocorrectie" })}
    />
  );
}

export function BouwsteenHost() {
  const api = useEditorApi().tekst;
  const zichtbaar = useEditorZichtbaar();
  const staat = winkel.gebruik(api);
  if (!zichtbaar || !staat.venster) return null;
  const sluit = () => {
    winkel.zet(api, { venster: null, selectie: null });
    requestAnimationFrame(() => api()?.focus());
  };
  if (staat.venster === "opslaan" && staat.selectie) return <OpslaanVenster selectie={staat.selectie} sluit={sluit} />;
  if (staat.venster === "beheren") return <BeheerVenster sluit={sluit} />;
  if (staat.venster === "autocorrectie") return <AutoCorrectieVenster sluit={sluit} />;
  return null;
}

/** Leest een gekozen JSON-bestand. */
function useBestandKiezer(lees: (tekst: string) => void) {
  const invoer = useRef<HTMLInputElement>(null);
  const element = (
    <input
      ref={invoer}
      type="file"
      hidden
      accept=".json,application/json"
      onChange={(e) => {
        const bestand = e.target.files?.[0];
        e.target.value = "";
        if (bestand) void bestand.text().then(lees);
      }}
    />
  );
  return { element, kies: () => invoer.current?.click() };
}

// ---------------------------------------------------------------------------

function OpslaanVenster({ selectie, sluit }: { selectie: Awaited<ReturnType<typeof leesSelectie>>; sluit: () => void }) {
  const { t } = useTranslation("writer");
  const lijst = useBouwstenen();
  const voorstel = selectie.tekst.split(/\s+/).slice(0, 2).join(" ").replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 30);
  const [naam, setNaam] = useState(voorstel);
  const [categorie, setCategorie] = useState("");
  const categorieen = [...new Set(lijst.map((b) => b.categorie).filter(Boolean))];
  const bestaat = lijst.some((b) => b.naam.toLocaleLowerCase() === naam.trim().toLocaleLowerCase());
  const opslaan = () => {
    if (!naam.trim()) return;
    bewaarBouwstenen(
      metBouwsteen(lijst, { id: nieuwId(), naam: naam.trim(), categorie: categorie.trim(), tekst: selectie.tekst, segmenten: selectie.segmenten, gewijzigd: Date.now() }),
    );
    sluit();
  };
  return (
    <Dialoog
      titel={t("autoText.saveTitle")}
      sluit={sluit}
      className="tw-venster"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {i18next.t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={!naam.trim()} onClick={opslaan}>
            {bestaat ? t("autoText.replace") : i18next.t("common:save")}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          opslaan();
        }}
      >
        <label className="werkruimte-veld">
          <span>{t("autoText.name")}</span>
          <input type="text" value={naam} data-autofocus maxLength={80} onChange={(e) => setNaam(e.target.value)} />
        </label>
        <label className="werkruimte-veld">
          <span>{t("autoText.category")}</span>
          <input type="text" list="bouwsteen-categorieen" value={categorie} maxLength={60} placeholder={t("autoText.general")} onChange={(e) => setCategorie(e.target.value)} />
          <datalist id="bouwsteen-categorieen">
            {categorieen.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </form>
      <p className="werkruimte-uitleg">{t("autoText.saveHint", { key: "F3" })}</p>
      {bestaat && <p className="werkruimte-uitleg">{t("autoText.exists")}</p>}
      {selectie.overgeslagen > 0 && <p className="werkruimte-uitleg">{t("autoText.skipped")}</p>}
      <blockquote className="bouwsteen-voorbeeld">{selectie.tekst.slice(0, 400)}</blockquote>
    </Dialoog>
  );
}

function BeheerVenster({ sluit }: { sluit: () => void }) {
  const { t } = useTranslation("writer");
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  const lijst = useBouwstenen();
  const [gekozen, setGekozen] = useState<string | null>(lijst[0]?.id ?? null);
  const [melding, setMelding] = useState("");
  const huidig = lijst.find((b) => b.id === gekozen) ?? null;
  const wijzig = (w: Partial<Bouwsteen>) => huidig && bewaarBouwstenen(lijst.map((b) => (b.id === huidig.id ? { ...b, ...w, gewijzigd: Date.now() } : b)));
  const kiezer = useBestandKiezer((tekst) => {
    try {
      const nieuw = importTekst(tekst);
      let samen = alleBouwstenen();
      for (const b of nieuw) samen = metBouwsteen(samen, b);
      bewaarBouwstenen(samen);
      setMelding(t("autoText.imported", { number: nieuw.length }));
    } catch {
      setMelding(t("autoText.errors.import"));
    }
  });
  return (
    <Dialoog
      titel={t("autoText.manage")}
      sluit={sluit}
      className="tw-venster is-breed"
      acties={
        <>
          <span className="werkruimte-melding" role="status">
            {melding}
          </span>
          <button type="button" className="werkruimte-knop" onClick={kiezer.kies}>
            {t("autoText.import")}
          </button>
          <button
            type="button"
            className="werkruimte-knop"
            disabled={!lijst.length}
            onClick={() => void bewaarBytes(new TextEncoder().encode(exportTekst(lijst)), `${t("autoText.fileName")}.json`, "application/json", { terugvalDownload: true })}
          >
            {t("autoText.export")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" onClick={sluit}>
            {i18next.t("common:close")}
          </button>
        </>
      }
    >
      {kiezer.element}
      {!lijst.length ? (
        <p className="werkruimte-uitleg">{t("autoText.emptyHelp")}</p>
      ) : (
        <div className="bouwsteen-beheer">
          <select size={12} aria-label={t("autoText.buildingBlocks")} value={gekozen ?? ""} onChange={(e) => setGekozen(e.target.value)} data-autofocus>
            {lijst.map((b) => (
              <option key={b.id} value={b.id}>
                {b.categorie ? `${b.categorie} › ${b.naam}` : b.naam}
              </option>
            ))}
          </select>
          {huidig && (
            <div>
              <label className="werkruimte-veld">
                <span>{t("autoText.name")}</span>
                <input key={`n${huidig.id}`} type="text" defaultValue={huidig.naam} maxLength={80} onBlur={(e) => e.target.value.trim() && wijzig({ naam: e.target.value.trim() })} />
              </label>
              <label className="werkruimte-veld">
                <span>{t("autoText.category")}</span>
                <input key={`c${huidig.id}`} type="text" defaultValue={huidig.categorie} maxLength={60} onBlur={(e) => wijzig({ categorie: e.target.value.trim() })} />
              </label>
              <blockquote className="bouwsteen-voorbeeld">{huidig.tekst.slice(0, 600)}</blockquote>
              <div className="werkruimte-keuzes">
                <button
                  type="button"
                  className="werkruimte-knop"
                  onClick={() =>
                    void voegSegmentenIn(api(), huidig.segmenten)
                      .then(sluit)
                      .catch((e) => meld(fout(e)))
                  }
                >
                  {t("autoText.insert")}
                </button>
                <button
                  type="button"
                  className="werkruimte-knop"
                  onClick={() => {
                    bewaarBouwstenen(lijst.filter((b) => b.id !== huidig.id));
                    setGekozen(lijst.find((b) => b.id !== huidig.id)?.id ?? null);
                  }}
                >
                  {i18next.t("common:remove")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialoog>
  );
}

// ---------------------------------------------------------------------------
// AutoCorrectie

const OPTIES: (keyof AutocorrectieInstellingen)[] = ["tweeHoofdletters", "zinsbegin", "vervangen", "aanhalingstekens", "streepjes", "rangtelwoorden", "urls"];

function AutoCorrectieVenster({ sluit }: { sluit: () => void }) {
  const { t } = useTranslation("writer");
  const [tab, setTab] = useState<"vervangen" | "uitzonderingen" | "opties">("vervangen");
  const [lijst, setLijst] = useState<AutocorrectieLijst>(leesAutocorrectie);
  const [taal, setTaal] = useState<TaalId>(() => (i18next.language.startsWith("nl") ? "nl" : "en-GB"));
  const [van, setVan] = useState("");
  const [naar, setNaar] = useState("");
  const [melding, setMelding] = useState("");
  const aan = useInstellingen().spelling.autocorrectie;
  const tabel = useMemo(() => Object.entries(vervangingenVoor(lijst, taal)).sort((a, b) => a[0].localeCompare(b[0])), [lijst, taal]);
  const gefilterd = van ? tabel.filter(([k]) => k.toLocaleLowerCase().startsWith(van.toLocaleLowerCase())) : tabel;
  const bestaat = tabel.some(([k]) => k === van);
  const kiezer = useBestandKiezer((tekst) => {
    try {
      setLijst(acImport(tekst));
      setMelding(t("autoCorrect.importedHint"));
    } catch {
      setMelding(t("autoText.errors.import"));
    }
  });
  const bewaar = () => {
    bewaarAutocorrectie(lijst);
    sluit();
  };
  return (
    <Dialoog
      titel={t("autoCorrect.title")}
      sluit={sluit}
      className="tw-venster is-breed autocorrectie-venster"
      acties={
        <>
          <span className="werkruimte-melding" role="status">
            {melding}
          </span>
          <button type="button" className="werkruimte-knop" onClick={kiezer.kies}>
            {t("autoText.import")}
          </button>
          <button
            type="button"
            className="werkruimte-knop"
            onClick={() => void bewaarBytes(new TextEncoder().encode(acExport(lijst)), `${t("autoCorrect.fileName")}.json`, "application/json", { terugvalDownload: true })}
          >
            {t("autoText.export")}
          </button>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {i18next.t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" onClick={bewaar}>
            {i18next.t("common:ok")}
          </button>
        </>
      }
    >
      {kiezer.element}
      <Tabbladen
        tabs={[
          ["vervangen", t("autoCorrect.tabs.replace")],
          ["uitzonderingen", t("autoCorrect.tabs.exceptions")],
          ["opties", t("autoCorrect.tabs.options")],
        ]}
        actief={tab}
        kies={setTab}
      >
        {tab === "vervangen" && (
          <>
            <label className="werkruimte-veld">
              <span>{t("autoCorrect.language")}</span>
              <select value={taal} onChange={(e) => setTaal(e.target.value as TaalId)}>
                {TALEN.map((l) => (
                  <option key={l.id} value={l.id}>
                    {taalNaam(l.id)}
                  </option>
                ))}
              </select>
            </label>
            <div className="autocorrectie-invoer">
              <label className="werkruimte-veld">
                <span>{t("autoCorrect.replace")}</span>
                <input type="text" value={van} data-autofocus onChange={(e) => setVan(e.target.value.trim())} />
              </label>
              <label className="werkruimte-veld">
                <span>{t("autoCorrect.with")}</span>
                <input type="text" value={naar} onChange={(e) => setNaar(e.target.value)} />
              </label>
              <button
                type="button"
                className="werkruimte-knop"
                disabled={!van || !naar || /\s/.test(van)}
                onClick={() => {
                  setLijst(zetVervanging(lijst, taal, van, naar));
                  setVan("");
                  setNaar("");
                }}
              >
                {bestaat ? t("autoText.replace") : t("autoCorrect.add")}
              </button>
              <button type="button" className="werkruimte-knop" disabled={!bestaat} onClick={() => setLijst(verwijderVervanging(lijst, taal, van))}>
                {i18next.t("common:remove")}
              </button>
            </div>
            <div className="autocorrectie-tabel" role="region" aria-label={t("autoCorrect.tabs.replace")} tabIndex={0}>
              <table>
                <tbody>
                  {gefilterd.slice(0, 400).map(([k, v]) => (
                    <tr key={k} className={k === van ? "is-gekozen" : undefined} onClick={() => (setVan(k), setNaar(v))}>
                      <td>{k}</td>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="werkruimte-knop" onClick={() => setLijst(herstelTaal(lijst, taal))}>
              {t("autoCorrect.reset")}
            </button>
          </>
        )}
        {tab === "uitzonderingen" && (
          <div className="tw-raster2">
            <Uitzonderingen
              titel={t("autoCorrect.noCapitalAfter")}
              uitleg={t("autoCorrect.noCapitalAfterHint")}
              lijst={lijst.geenZinsbegin}
              zet={(geenZinsbegin) => setLijst({ ...lijst, geenZinsbegin })}
            />
            <Uitzonderingen
              titel={t("autoCorrect.twoCapitals")}
              uitleg={t("autoCorrect.twoCapitalsHint")}
              lijst={lijst.tweeHoofdletters}
              zet={(tweeHoofdletters) => setLijst({ ...lijst, tweeHoofdletters })}
            />
          </div>
        )}
        {tab === "opties" && (
          <>
            <label className="werkruimte-vink">
              <input type="checkbox" checked={aan} onChange={(e) => wijzigInstellingen({ spelling: { autocorrectie: e.target.checked } })} />
              {t("autoCorrect.enabled")}
            </label>
            <fieldset disabled={!aan}>
              <legend>{t("autoCorrect.whileTyping")}</legend>
              {OPTIES.map((o) => (
                <label key={o} className="werkruimte-vink">
                  <input type="checkbox" checked={lijst.opties[o]} onChange={(e) => setLijst({ ...lijst, opties: { ...lijst.opties, [o]: e.target.checked } })} />
                  {t(`autoCorrect.options.${o}`)}
                </label>
              ))}
            </fieldset>
            <p className="werkruimte-uitleg">{t("autoCorrect.undoHint")}</p>
          </>
        )}
      </Tabbladen>
    </Dialoog>
  );
}

function Uitzonderingen({ titel, uitleg, lijst, zet }: { titel: string; uitleg: string; lijst: string[]; zet: (l: string[]) => void }) {
  const [nieuw, setNieuw] = useState("");
  const { t } = useTranslation("writer");
  return (
    <fieldset>
      <legend>{titel}</legend>
      <p className="werkruimte-uitleg">{uitleg}</p>
      <div className="autocorrectie-invoer">
        <input type="text" aria-label={titel} value={nieuw} onChange={(e) => setNieuw(e.target.value.trim())} />
        <button
          type="button"
          className="werkruimte-knop"
          disabled={!nieuw || lijst.includes(nieuw)}
          onClick={() => {
            zet([...lijst, nieuw].sort());
            setNieuw("");
          }}
        >
          {t("autoCorrect.add")}
        </button>
      </div>
      <ul className="autocorrectie-lijst">
        {lijst.map((w) => (
          <li key={w}>
            {w}
            <button type="button" className="werkruimte-knop" aria-label={i18next.t("writer:autoCorrect.removeItem", { item: w })} onClick={() => zet(lijst.filter((x) => x !== w))}>
              {i18next.t("common:remove")}
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
