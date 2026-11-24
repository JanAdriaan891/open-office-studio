/**
 * Sjablonengalerij op het startscherm en in Bestand (#27): meegeleverde
 * sjablonen per module met miniatuur, en Mijn sjablonen (bewaren vanuit het
 * huidige document, toevoegen uit een bestand, verwijderen). Een sjabloon
 * opent altijd als naamloos nieuw document.
 */
import { useEffect, useId, useState } from "react";
import { FilePlus2, FileText, Presentation, Save, Sheet, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Soort } from "../editors";
import { useOpmaak } from "../i18n/opmaak";
import {
  bewaarEigenSjabloon,
  bijWijziging,
  eigenSjablonen,
  haalSjabloon,
  laadCatalogus,
  miniatuurUrl,
  sjabloonTaal,
  verwijderEigenSjabloon,
  type Catalogus,
  type EigenSjabloon,
} from "./catalogus";
import { SJABLOON_INVOER, SJABLOONFORMAAT, alsSjabloon } from "./pakket";
import "./sjablonen.css";

type Filter = "alle" | Soort | "eigen";
const ICOON = { docx: FileText, xlsx: Sheet, pptx: Presentation } as const;
const MODULE = { docx: "tekst", xlsx: "rekenblad", pptx: "presentatie" } as const;
const SOORT_VAN_EXT: Record<string, Soort> = {
  dotx: "docx", docx: "docx", xltx: "xlsx", xlsx: "xlsx", potx: "pptx", pptx: "pptx",
};

export function SjabloonGalerij(props: {
  bezig: boolean;
  /** Opent bytes als naamloos nieuw document. */
  open: (soort: Soort, naam: string, bytes: Uint8Array) => void;
  /** Het open document (voor "Huidig document als sjabloon"). */
  huidig?: { naam: string; soort: Soort; bytes: () => Promise<Uint8Array> };
  meld: (tekst: string, soort?: "info" | "fout") => void;
}) {
  const { t, i18n } = useTranslation(["backstage", "common"]);
  const opmaak = useOpmaak();
  const id = useId();
  const [catalogus, setCatalogus] = useState<Catalogus | null>(null);
  const [eigen, setEigen] = useState<EigenSjabloon[]>([]);
  const [filter, setFilter] = useState<Filter>("alle");
  const [naamVoorBewaren, setNaamVoorBewaren] = useState<string | null>(null);

  useEffect(() => {
    laadCatalogus().then(setCatalogus, () => setCatalogus({ versie: 1, talen: ["en"], sjablonen: [] }));
    const ververs = () => void eigenSjablonen().then(setEigen);
    ververs();
    return bijWijziging(ververs);
  }, []);

  const taal = sjabloonTaal(i18n.language, catalogus?.talen ?? ["en"]);
  const tekst = (r: Record<string, string>) => r[taal] ?? r.en ?? Object.values(r)[0] ?? "";
  const galerij = (catalogus?.sjablonen ?? []).filter((s) => filter === "alle" || filter === s.soort);
  const eigenZichtbaar = eigen.filter((s) => filter === "alle" || filter === "eigen" || filter === s.soort);

  async function kies(soort: Soort, naam: string, bytes: () => Promise<Uint8Array>) {
    try {
      props.open(soort, naam, await bytes());
    } catch (e) {
      props.meld(t("templates.openFailed", { error: String(e) }), "fout");
    }
  }

  async function bewaarHuidige(naam: string) {
    if (!props.huidig) return;
    try {
      const bytes = alsSjabloon(await props.huidig.bytes(), props.huidig.soort);
      await bewaarEigenSjabloon(naam, props.huidig.soort, bytes);
      setNaamVoorBewaren(null);
      setFilter("eigen");
      props.meld(t("templates.saved", { name: naam }));
    } catch (e) {
      props.meld(t("templates.saveFailed", { error: String(e) }), "fout");
    }
  }

  /**
   * Bestandskiezer op aanvraag: geen blijvend tweede bestandsveld in het
   * startscherm naast dat van "Bestaand bestand".
   */
  function kiesBestanden() {
    const veld = document.createElement("input");
    veld.type = "file";
    veld.multiple = true;
    veld.accept = [...SJABLOON_INVOER, "docx", "xlsx", "pptx"].map((e) => `.${e}`).join(",");
    veld.onchange = () => void voegToe(veld.files);
    veld.click();
  }

  async function voegToe(lijst: FileList | null) {
    for (const f of [...(lijst ?? [])]) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      const soort = SOORT_VAN_EXT[ext];
      if (!soort || f.size > 50 * 1024 * 1024) {
        props.meld(t("templates.unsupported", { name: f.name }), "fout");
        continue;
      }
      try {
        const bytes = alsSjabloon(new Uint8Array(await f.arrayBuffer()), soort);
        await bewaarEigenSjabloon(f.name.replace(/\.[^.]+$/, ""), soort, bytes);
        setFilter("eigen");
      } catch (e) {
        props.meld(t("templates.saveFailed", { error: String(e) }), "fout");
      }
    }
  }

  const filters: [Filter, string][] = [
    ["alle", t("templates.all")],
    ["docx", t("common:modules.tekst")],
    ["xlsx", t("common:modules.rekenblad")],
    ["pptx", t("common:modules.presentatie")],
    ["eigen", t("templates.mine")],
  ];

  return (
    <section className="start-galerij" aria-labelledby={`${id}-titel`}>
      <div className="start-sectiekop">
        <h2 id={`${id}-titel`}>{t("templates.title")}</h2>
        <span>{t("templates.hint")}</span>
      </div>
      <div className="galerij-balk">
        <div className="galerij-filters" role="tablist" aria-label={t("templates.title")}>
          {filters.map(([waarde, label]) => (
            <button
              key={waarde}
              role="tab"
              aria-selected={filter === waarde}
              className={filter === waarde ? "is-actief" : ""}
              onClick={() => setFilter(waarde)}
            >
              {label}
              {waarde === "eigen" && eigen.length > 0 && <small>{eigen.length}</small>}
            </button>
          ))}
        </div>
        <div className="galerij-acties">
          {props.huidig && (
            <button
              disabled={props.bezig}
              onClick={() => setNaamVoorBewaren(props.huidig!.naam.replace(/\.[^.]+$/, ""))}
              title={t("templates.saveCurrentTitle", { format: SJABLOONFORMAAT[props.huidig.soort].toUpperCase() })}
            >
              <Save size={14} /> {t("templates.saveCurrent")}
            </button>
          )}
          <button disabled={props.bezig} onClick={kiesBestanden}>
            <FilePlus2 size={14} /> {t("templates.add")}
          </button>
        </div>
      </div>
      {naamVoorBewaren !== null && props.huidig && (
        <form
          className="galerij-bewaren"
          onSubmit={(e) => {
            e.preventDefault();
            if (naamVoorBewaren.trim()) void bewaarHuidige(naamVoorBewaren.trim());
          }}
        >
          <label>
            {t("templates.nameLabel")}
            <input
              autoFocus
              value={naamVoorBewaren}
              onChange={(e) => setNaamVoorBewaren(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setNaamVoorBewaren(null)}
            />
          </label>
          <button type="submit" className="office-knop office-primair" disabled={!naamVoorBewaren.trim()}>
            {t("common:save")}
          </button>
          <button type="button" className="office-knop" onClick={() => setNaamVoorBewaren(null)}>
            {t("common:cancel")}
          </button>
        </form>
      )}
      <div className="galerij-raster" role="list">
        {eigenZichtbaar.map((s) => {
          const Icoon = ICOON[s.soort];
          return (
            <div key={s.id} role="listitem" className={`galerij-kaart is-eigen module-${s.soort}`}>
              <button
                className="galerij-open"
                disabled={props.bezig}
                onClick={() => void kies(s.soort, s.naam, async () => s.bytes)}
                title={t("templates.openTitle", { name: s.naam })}
              >
                <span className={`galerij-beeld beeld-${s.soort}`}>
                  <Icoon size={34} strokeWidth={1.3} />
                </span>
                <strong>{s.naam}</strong>
                <small>
                  {t(`common:modules.${MODULE[s.soort]}`)} · {opmaak.datum(s.datum)}
                </small>
              </button>
              <button
                className="galerij-verwijder"
                aria-label={t("templates.delete", { name: s.naam })}
                title={t("templates.delete", { name: s.naam })}
                onClick={() => void verwijderEigenSjabloon(s.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        {filter !== "eigen" &&
          galerij.map((s) => {
            const naam = tekst(s.naam);
            const beeld = miniatuurUrl(s, taal);
            const Icoon = ICOON[s.soort];
            return (
              <div key={s.id} role="listitem" className={`galerij-kaart module-${s.soort}`}>
                <button
                  className="galerij-open"
                  disabled={props.bezig}
                  onClick={() => void kies(s.soort, naam, () => haalSjabloon(s, taal))}
                  title={t("templates.openTitle", { name: naam })}
                >
                  <span className={`galerij-beeld beeld-${s.soort}`}>
                    {beeld ? <img src={beeld} alt="" loading="lazy" /> : <Icoon size={34} strokeWidth={1.3} />}
                  </span>
                  <strong>{naam}</strong>
                  <small>{tekst(s.omschrijving)}</small>
                </button>
              </div>
            );
          })}
        {filter === "eigen" && !eigen.length && <p className="galerij-leeg">{t("templates.mineEmpty")}</p>}
      </div>
    </section>
  );
}
