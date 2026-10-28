/**
 * Navigatievenster ‘Zoeken en vervangen’ (#29) met resultatenlijst en
 * markering in het document, en het venster Ga naar (Ctrl+G).
 */
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownToLine, ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";
import { useDocxCommand } from "@betteroffice/docx-react";
import { Groep, RibbonFout } from "../../Ribbon";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { useEditorApi, useEditorZichtbaar, zichtbaarElement } from "../../lint/editorApi";
import { useSneltoetsen } from "../../lint/sneltoetsen";
import { fout } from "../gedeeld/engine";
import { zetMarkeringen, type Markering } from "../gedeeld/markering";
import { usePaneelStaat, zetPaneel } from "./paneelstaat";
import { gaNaar, vervang, zoek, type Resultaat, type ZoekIndex } from "./zoeken";
import { heeftOpmaak, type Opmaakfilter, type ZoekOpties } from "./logica";
import { doelen, huidigNummer, leesNummer, type Doel, type Doelsoort } from "./ganaar";

const SPECIAAL: [string, string, boolean?][] = [
  ["^p", "Alineamarkering"],
  ["^t", "Tabteken"],
  ["^l", "Regeleinde"],
  ["^m", "Handmatig pagina-einde"],
  ["^g", "Afbeelding"],
  ["^?", "Willekeurig teken"],
  ["^#", "Willekeurig cijfer"],
  ["^$", "Willekeurige letter"],
  ["^w", "Witruimte"],
  ["^s", "Vaste spatie"],
  ["^&", "Gevonden tekst (vervangen)", true],
  ["^^", "Dakje"],
];

/** Lintgroep Zoeken: navigatievenster, vervangen en Ga naar. */
export function ZoekKnoppen({ groot }: { groot?: boolean }) {
  const api = useEditorApi().tekst;
  const knoppen = (
    <>
      <EigenKnop naam="Zoeken" icoon={Search} groot={groot} sneltoets="Ctrl+F" uitleg="In het navigatievenster, met resultatenlijst" onClick={() => zetPaneel(api, { zoeken: "zoeken" })} />
      <EigenKnop
        naam="Vervangen"
        icoon={Replace}
        groot={groot}
        sneltoets="Ctrl+H"
        uitleg="Uitgebreid zoeken en vervangen: hoofdletters, hele woorden, jokertekens, speciale tekens en opmaak"
        onClick={() => zetPaneel(api, { zoeken: "vervangen" })}
      />
      <EigenKnop naam="Ga naar" icoon={ArrowDownToLine} groot={groot} sneltoets="Ctrl+G" uitleg="Pagina, sectie, regel, kop, tabel, afbeelding of opmerking" onClick={() => zetPaneel(api, { gaNaar: true })} />
    </>
  );
  return <Groep naam="Zoeken">{groot ? knoppen : <div className="ribbon-stapel">{knoppen}</div>}</Groep>;
}

function tekstVlak() {
  const tekst = zichtbaarElement<HTMLElement>(".office-tekst");
  if (!tekst) return null;
  const actief = document.activeElement;
  return actief instanceof HTMLElement && actief.classList.contains("paged-editor__yrs-input") ? actief : tekst;
}

/** Hoort bij elke tekst-editor: sneltoetsen, het deelvenster en Ga naar. */
export function ZoekHost() {
  const api = useEditorApi().tekst;
  const staat = usePaneelStaat(api);
  const zichtbaar = useEditorZichtbaar();
  const vanSelectie = () => {
    const tekst = api()?.getSelectionInfo()?.selectedText ?? "";
    return tekst && tekst.length < 120 && !/\n/.test(tekst) ? tekst : undefined;
  };
  useSneltoetsen(
    tekstVlak,
    [
      { toets: "Ctrl+F", uitvoeren: () => zetPaneel(api, { zoeken: "zoeken" }), omschrijving: "Zoeken in het navigatievenster" },
      { toets: "Ctrl+H", uitvoeren: () => zetPaneel(api, { zoeken: "vervangen" }), omschrijving: "Uitgebreid zoeken en vervangen" },
      { toets: "Ctrl+G", uitvoeren: () => zetPaneel(api, { gaNaar: true }), omschrijving: "Ga naar" },
    ],
    "tekst",
  );
  if (!zichtbaar) return null;
  return (
    <>
      {staat.zoeken && <ZoekPaneel modus={staat.zoeken} verzoek={staat.verzoek} beginTekst={vanSelectie} />}
      {staat.gaNaar && <GaNaarVenster sluit={() => zetPaneel(api, { gaNaar: false })} />}
    </>
  );
}

type Drie = "" | "ja" | "nee";
const naarDrie = (d: Drie) => (d === "" ? undefined : d === "ja");

function ZoekPaneel({ modus, verzoek, beginTekst }: { modus: "zoeken" | "vervangen"; verzoek: number; beginTekst: () => string | undefined }) {
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  const [zoekTekst, setZoekTekst] = useState(() => beginTekst() ?? "");
  const [vervangTekst, setVervangTekst] = useState("");
  const [opties, setOpties] = useState<ZoekOpties>({});
  const [vet, setVet] = useState<Drie>("");
  const [cursief, setCursief] = useState<Drie>("");
  const [onderstreept, setOnderstreept] = useState<Drie>("");
  const [stijl, setStijl] = useState("");
  const [meer, setMeer] = useState(false);
  const [resultaten, setResultaten] = useState<Resultaat[]>([]);
  const [index, setIndex] = useState<ZoekIndex | null>(null);
  const [huidig, setHuidig] = useState(-1);
  const [melding, setMelding] = useState("");
  const [plek, setPlek] = useState<{ left: number; top: number; height: number } | null>(null);
  const zoekVeld = useRef<HTMLInputElement>(null);
  const vervangVeld = useRef<HTMLInputElement>(null);
  const laatsteVeld = useRef<HTMLInputElement | null>(null);
  const stijlen = useDocxCommand("paragraphStyle").state.options ?? [];
  // Vervangen kan ook bij wijzigingen bijhouden (de vervanging wordt dan een voorstel).
  const invoegen = useDocxCommand("insertPageBreak").state.enabled;
  const bewerkingsmodus = useDocxCommand("editingMode").state.value;
  const bewerkbaar = invoegen || bewerkingsmodus === "suggesting";
  /** Na vervangen blijft de melding staan tot er een nieuwe zoekopdracht is. */
  const naVervangen = useRef(false);
  const opmaak: Opmaakfilter = useMemo(
    () => ({ vet: naarDrie(vet), cursief: naarDrie(cursief), onderstreept: naarDrie(onderstreept), stijl: stijl || undefined }),
    [vet, cursief, onderstreept, stijl],
  );
  const metOpmaak = heeftOpmaak(opmaak);
  const vervangen = modus === "vervangen";

  // Plaats: links in het documentvlak onder het lint.
  useLayoutEffect(() => {
    const meet = () => {
      const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__dock-area");
      const r = vlak?.getBoundingClientRect();
      if (r) setPlek({ left: r.left + 8, top: r.top + 8, height: Math.max(240, r.height - 16) });
    };
    meet();
    window.addEventListener("resize", meet);
    const waarnemer = new ResizeObserver(meet);
    const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__dock-area");
    // Het document schuift op, zoals bij het navigatievenster van Word.
    vlak?.classList.add("tw-met-zoekpaneel");
    if (vlak) waarnemer.observe(vlak);
    return () => {
      vlak?.classList.remove("tw-met-zoekpaneel");
      window.removeEventListener("resize", meet);
      waarnemer.disconnect();
    };
  }, []);

  useEffect(() => {
    const veld = vervangen && zoekTekst ? vervangVeld.current : zoekVeld.current;
    veld?.focus();
    veld?.select();
    // Bij de eerste opening bestaat het veld pas zodra de plek bekend is.
  }, [verzoek, !!plek]);

  const markeer = useCallback((lijst: Resultaat[], idx: ZoekIndex | null, nu: number) => {
    if (!idx) return zetMarkeringen("zoeken", []);
    const uit: Markering[] = [];
    lijst.forEach((r, i) =>
      r.delen.forEach((d) => {
        if (d.tot <= d.van) return;
        uit.push({
          soort: i === nu ? "zoekHuidig" : "zoek",
          doel: { kind: "range", version: idx.versie, range: { story: r.story, start: { paraId: d.paraId, offset: d.van }, end: { paraId: d.paraId, offset: d.tot }, view: "accepted" } },
        });
      }),
    );
    zetMarkeringen("zoeken", uit);
  }, []);

  const zoekNu = useCallback(
    async (behoud = false) => {
      const ref = api();
      if (!ref || (!zoekTekst && !metOpmaak)) {
        setResultaten([]);
        setIndex(null);
        setHuidig(-1);
        setMelding("");
        markeer([], null, -1);
        return;
      }
      try {
        const uit = await zoek(ref, { zoek: zoekTekst, opties, opmaak });
        setIndex(uit.index);
        setResultaten(uit.resultaten);
        const nu = uit.resultaten.length ? (behoud ? Math.min(Math.max(huidig, 0), uit.resultaten.length - 1) : -1) : -1;
        setHuidig(nu);
        if (!(behoud && naVervangen.current)) setMelding(uit.resultaten.length ? "" : "Geen resultaten.");
        markeer(uit.resultaten, uit.index, nu);
      } catch (error) {
        setResultaten([]);
        setIndex(null);
        setMelding(fout(error));
        markeer([], null, -1);
      }
    },
    [api, zoekTekst, opties, opmaak, metOpmaak, huidig, markeer],
  );

  // Live zoeken bij typen; opnieuw na een wijziging in het document.
  useEffect(() => {
    naVervangen.current = false;
    const wacht = setTimeout(() => void zoekNu(false), 250);
    return () => clearTimeout(wacht);
  }, [zoekTekst, opties, opmaak]);
  const zoekRef = useRef(zoekNu);
  zoekRef.current = zoekNu;
  useEffect(() => {
    const ref = api();
    if (!ref) return;
    let wacht: ReturnType<typeof setTimeout> | undefined;
    const weg = ref.onContentChange(() => {
      clearTimeout(wacht);
      wacht = setTimeout(() => void zoekRef.current(true), 500);
    });
    return () => {
      clearTimeout(wacht);
      weg();
    };
  }, [api]);
  useEffect(() => () => zetMarkeringen("zoeken", []), []);

  function ga(nr: number) {
    if (!resultaten.length || !index) return;
    const n = ((nr % resultaten.length) + resultaten.length) % resultaten.length;
    setHuidig(n);
    markeer(resultaten, index, n);
    try {
      gaNaar(api(), index, resultaten[n]);
    } catch (error) {
      meld(fout(error));
    }
  }
  /** Volgende treffer vanaf de cursor, zoals Word: de eerste na de huidige. */
  const volgende = () => ga(huidig + 1);
  const vorige = () => ga(huidig < 0 ? resultaten.length - 1 : huidig - 1);

  async function vervangEen() {
    if (!index || !resultaten.length) return;
    if (huidig < 0) return volgende();
    try {
      await vervang(api(), index, [resultaten[huidig]], vervangTekst, opties);
      naVervangen.current = true;
      setMelding("1 vervangen.");
      // De volgende treffer krijgt hetzelfde nummer na opnieuw zoeken.
      const ref = api();
      if (!ref) return;
      const uit = await zoek(ref, { zoek: zoekTekst, opties, opmaak });
      setIndex(uit.index);
      setResultaten(uit.resultaten);
      const n = uit.resultaten.length ? Math.min(huidig, uit.resultaten.length - 1) : -1;
      setHuidig(n);
      markeer(uit.resultaten, uit.index, n);
      if (n >= 0) gaNaar(ref, uit.index, uit.resultaten[n]);
    } catch (error) {
      setMelding(fout(error));
    }
  }
  async function vervangAlles() {
    if (!index || !resultaten.length) return;
    try {
      const uit = await vervang(api(), index, resultaten, vervangTekst, opties);
      await zoekNu(false);
      naVervangen.current = true;
      setMelding(`${uit.aantal} ${uit.aantal === 1 ? "treffer" : "treffers"} vervangen; Ctrl+Z draait dit in één keer terug.`);
    } catch (error) {
      setMelding(fout(error));
    }
  }
  function voegIn(code: string) {
    const veld = laatsteVeld.current ?? zoekVeld.current;
    if (!veld) return;
    const begin = veld.selectionStart ?? veld.value.length,
      eind = veld.selectionEnd ?? veld.value.length;
    const nieuw = veld.value.slice(0, begin) + code + veld.value.slice(eind);
    if (veld === vervangVeld.current) setVervangTekst(nieuw);
    else setZoekTekst(nieuw);
    requestAnimationFrame(() => {
      veld.focus();
      veld.setSelectionRange(begin + code.length, begin + code.length);
    });
  }
  function sluit() {
    zetMarkeringen("zoeken", []);
    zetPaneel(api, { zoeken: false });
    requestAnimationFrame(() => api()?.focus());
  }
  const keuze = (label: string, waarde: Drie, zet: (d: Drie) => void) => (
    <label className="tw-zoek-opmaak">
      <span>{label}</span>
      <select value={waarde} onChange={(e) => zet(e.target.value as Drie)}>
        <option value="">maakt niet uit</option>
        <option value="ja">ja</option>
        <option value="nee">nee</option>
      </select>
    </label>
  );
  if (!plek) return null;
  return createPortal(
    <aside
      className="tw-zoekpaneel"
      role="search"
      aria-label="Zoeken en vervangen"
      style={{ left: plek.left, top: plek.top, maxHeight: plek.height }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          sluit();
        }
      }}
    >
      <header>
        <h2>{vervangen ? "Zoeken en vervangen" : "Navigatie: zoeken"}</h2>
        <button type="button" className="tw-zoek-wissel" onClick={() => zetPaneel(api, { zoeken: vervangen ? "zoeken" : "vervangen" })}>
          {vervangen ? "Alleen zoeken" : "Vervangen…"}
        </button>
        <button type="button" className="tw-zoek-sluit" aria-label="Sluiten" title="Sluiten · Esc" onClick={sluit}>
          <X size={15} />
        </button>
      </header>
      <div className="tw-zoek-rij">
        <input
          ref={zoekVeld}
          type="search"
          aria-label="Zoeken naar"
          placeholder="Zoeken in document"
          value={zoekTekst}
          onFocus={(e) => (laatsteVeld.current = e.currentTarget)}
          onChange={(e) => setZoekTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) vorige();
              else volgende();
            }
          }}
        />
        <button type="button" aria-label="Vorige treffer" title="Vorige · Shift+Enter" onClick={vorige} disabled={!resultaten.length}>
          <ChevronUp size={15} />
        </button>
        <button type="button" aria-label="Volgende treffer" title="Volgende · Enter" onClick={volgende} disabled={!resultaten.length}>
          <ChevronDown size={15} />
        </button>
      </div>
      {vervangen && (
        <div className="tw-zoek-rij">
          <input
            ref={vervangVeld}
            type="text"
            aria-label="Vervangen door"
            placeholder="Vervangen door"
            value={vervangTekst}
            onFocus={(e) => (laatsteVeld.current = e.currentTarget)}
            onChange={(e) => setVervangTekst(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void vervangEen();
              }
            }}
          />
        </div>
      )}
      {vervangen && (
        <div className="tw-zoek-knoppen">
          <button type="button" disabled={!bewerkbaar || !resultaten.length} onClick={() => void vervangEen()}>
            Vervangen
          </button>
          <button type="button" disabled={!bewerkbaar || !resultaten.length} onClick={() => void vervangAlles()}>
            Alles vervangen
          </button>
        </div>
      )}
      <div className="tw-zoek-opties">
        <label>
          <input type="checkbox" checked={!!opties.hoofdlettergevoelig} disabled={opties.jokertekens} onChange={(e) => setOpties({ ...opties, hoofdlettergevoelig: e.target.checked })} />
          Hoofdlettergevoelig
        </label>
        <label>
          <input type="checkbox" checked={!!opties.heleWoorden} disabled={opties.jokertekens} onChange={(e) => setOpties({ ...opties, heleWoorden: e.target.checked })} />
          Alleen hele woorden
        </label>
        <label>
          <input type="checkbox" checked={!!opties.jokertekens} onChange={(e) => setOpties({ ...opties, jokertekens: e.target.checked, regex: false })} />
          Jokertekens
        </label>
        <label>
          <input type="checkbox" checked={!!opties.regex} onChange={(e) => setOpties({ ...opties, regex: e.target.checked, jokertekens: false })} />
          Reguliere expressie
        </label>
      </div>
      <details className="tw-zoek-meer" open={meer} onToggle={(e) => setMeer((e.target as HTMLDetailsElement).open)}>
        <summary>Speciaal en opmaak{metOpmaak ? " (opmaak actief)" : ""}</summary>
        <div className="tw-zoek-speciaal" role="group" aria-label="Speciale tekens invoegen">
          {SPECIAAL.filter(([, , alleenVervangen]) => !alleenVervangen || vervangen).map(([code, naam]) => (
            <button key={code} type="button" title={naam} onMouseDown={(e) => e.preventDefault()} onClick={() => voegIn(code)}>
              <code>{code}</code> {naam}
            </button>
          ))}
        </div>
        <div className="tw-zoek-opmaakrij">
          {keuze("Vet", vet, setVet)}
          {keuze("Cursief", cursief, setCursief)}
          {keuze("Onderstreept", onderstreept, setOnderstreept)}
          <label className="tw-zoek-opmaak">
            <span>Stijl</span>
            <select value={stijl} onChange={(e) => setStijl(e.target.value)}>
              <option value="">maakt niet uit</option>
              {stijlen.map((o) => (
                <option key={o.args.styleId} value={o.args.styleId}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="tw-zoek-hulp">
          Jokertekens: <code>?</code> één teken, <code>*</code> willekeurig, <code>[a-z]</code>, <code>[!0-9]</code>, <code>{"{2,3}"}</code>, <code>@</code> één of meer, <code>&lt;</code> en <code>&gt;</code> woordbegin
          en -einde, <code>( )</code> groep met <code>\1</code> in de vervangtekst. Zonder zoektekst zoekt u alleen op opmaak.
        </p>
      </details>
      <p className="tw-zoek-telling" role="status" aria-live="polite">
        {resultaten.length ? `${huidig >= 0 ? `${huidig + 1} van ` : ""}${resultaten.length} ${resultaten.length === 1 ? "resultaat" : "resultaten"}` : melding}
        {resultaten.length > 0 && melding && <span> · {melding}</span>}
      </p>
      <ol className="tw-zoek-resultaten" aria-label="Resultaten">
        {resultaten.slice(0, 500).map((r, i) => (
          <li key={i}>
            <button type="button" aria-current={i === huidig} onClick={() => ga(i)}>
              <span className="tw-zoek-plek">{r.plek}</span>
              <span>
                {r.context.voor}
                <mark>{r.context.treffer}</mark>
                {r.context.na}
              </span>
            </button>
          </li>
        ))}
        {resultaten.length > 500 && <li className="tw-zoek-plek">… en nog {resultaten.length - 500}</li>}
      </ol>
    </aside>,
    document.body,
  );
}

const SOORTEN: { soort: Doelsoort; naam: string; nummer: string; lijst: boolean }[] = [
  { soort: "pagina", naam: "Pagina", nummer: "Paginanummer", lijst: false },
  { soort: "sectie", naam: "Sectie", nummer: "Sectienummer", lijst: false },
  { soort: "regel", naam: "Regel", nummer: "Regelnummer", lijst: false },
  { soort: "kop", naam: "Kop", nummer: "Kopnummer", lijst: true },
  { soort: "tabel", naam: "Tabel", nummer: "Tabelnummer", lijst: true },
  { soort: "afbeelding", naam: "Afbeelding", nummer: "Afbeeldingsnummer", lijst: true },
  { soort: "opmerking", naam: "Opmerking", nummer: "Opmerkingsnummer", lijst: true },
];

const MEERVOUD: Record<Doelsoort, string> = {
  pagina: "pagina’s",
  sectie: "secties",
  regel: "regels",
  kop: "koppen",
  tabel: "tabellen",
  afbeelding: "afbeeldingen",
  opmerking: "opmerkingen",
};

function GaNaarVenster({ sluit }: { sluit: () => void }) {
  const api = useEditorApi().tekst;
  const [soort, setSoort] = useState<Doelsoort>("pagina");
  const [lijst, setLijst] = useState<Doel[]>([]);
  const [invoer, setInvoer] = useState("");
  const [gekozen, setGekozen] = useState(0);
  const [melding, setMelding] = useState("");
  const [bezocht, setBezocht] = useState(false);
  const huidigeSoort = SOORTEN.find((s) => s.soort === soort)!;
  /** Vorige/volgende: bij pagina's vanaf de huidige pagina, anders vanaf het laatst bezochte doel. */
  function stap(richting: 1 | -1) {
    const ref = api();
    if (!ref || !lijst.length) return;
    const basis = soort === "pagina" ? (ref.getCurrentPage() || 1) - 1 : bezocht ? gekozen : richting === 1 ? -1 : lijst.length;
    ga(lijst[Math.max(0, Math.min(lijst.length - 1, basis + richting))]);
  }
  useEffect(() => {
    const ref = api();
    if (!ref) return;
    let actief = true;
    void doelen(ref, soort)
      .then((d) => {
        if (!actief) return;
        setLijst(d);
        setGekozen(0);
        setBezocht(false);
        setMelding(d.length ? "" : `Geen ${MEERVOUD[soort]} in dit document.`);
      })
      .catch((e) => actief && setMelding(fout(e)));
    return () => {
      actief = false;
    };
  }, [soort, api]);
  const nummer = leesNummer(invoer, api() ? huidigNummer(api()!, soort) || gekozen + 1 : 1, lijst.length);
  function ga(doel: Doel | undefined) {
    const ref = api();
    if (!ref || !doel) return;
    try {
      doel.ga(ref);
      setGekozen(doel.nr - 1);
      setBezocht(true);
      setMelding(`${doel.label.trim()}`);
    } catch (e) {
      setMelding(fout(e));
    }
  }
  function gaNaarInvoer() {
    if (huidigeSoort.lijst && !invoer.trim()) return ga(lijst[gekozen]);
    if (nummer === null) return setMelding(`Typ een nummer van 1 tot en met ${lijst.length}, of +n/−n.`);
    ga(lijst[nummer - 1]);
    sluit();
  }
  return (
    <Dialoog
      titel="Ga naar"
      sluit={sluit}
      className="tw-venster is-breed"
      acties={
        <>
          <span className="werkruimte-melding" role="status">
            {melding}
          </span>
          <button type="button" className="werkruimte-knop" disabled={!lijst.length} onClick={() => stap(-1)}>
            Vorige
          </button>
          <button type="button" className="werkruimte-knop" disabled={!lijst.length} onClick={() => stap(1)}>
            Volgende
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={!lijst.length} onClick={gaNaarInvoer}>
            Ga naar
          </button>
        </>
      }
    >
      <div className="tw-ganaar">
        <div role="listbox" aria-label="Ga naar wat" className="tw-ganaar-soorten">
          {SOORTEN.map((s) => (
            <button key={s.soort} type="button" role="option" aria-selected={s.soort === soort} onClick={() => setSoort(s.soort)}>
              {s.naam}
            </button>
          ))}
        </div>
        <div className="tw-ganaar-doel">
          <label className="werkruimte-veld">
            <span>
              {huidigeSoort.nummer}
              {lijst.length ? ` (1–${lijst.length})` : ""}
            </span>
            <input
              type="text"
              inputMode="numeric"
              data-autofocus=""
              value={invoer}
              placeholder={soort === "pagina" ? "bijv. 3, +2 of -1" : "nummer"}
              onChange={(e) => setInvoer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  gaNaarInvoer();
                }
              }}
            />
          </label>
          {huidigeSoort.lijst && lijst.length > 0 && (
            <ul className="tw-ganaar-lijst" aria-label={MEERVOUD[soort][0].toUpperCase() + MEERVOUD[soort].slice(1)}>
              {lijst.map((d, i) => (
                <li key={i}>
                  <button type="button" aria-current={i === gekozen} onClick={() => ga(d)} onDoubleClick={() => (ga(d), sluit())}>
                    {d.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialoog>
  );
}
