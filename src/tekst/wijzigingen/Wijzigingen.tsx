/**
 * Wijzigingen-werkstroom (#28): alles accepteren of weigeren (ook in de
 * selectie of alleen voor getoonde auteurs), accepteren en naar de volgende,
 * markeringsweergave (alle / eenvoudig / geen / origineel), filter per auteur
 * en een deelvenster met de lijst van wijzigingen.
 */
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCheck, Eye, ListChecks, Users, X } from "lucide-react";
import { DocxEditor, useDocxCommand, useDocxCommands, type DocxEditorRef } from "@betteroffice/docx-react";
import { Groep, RibbonFout } from "../../Ribbon";
import { useEditorApi, zichtbaarElement } from "../../lint/editorApi";
import { tekstNlVolledig } from "../../nederlands-toegankelijk";
import { Keuzemenu, useEditorTik, useUitvoeren } from "../gedeeld/ui";
import { fout } from "../gedeeld/engine";
import { maakWinkel } from "../gedeeld/winkel";
import { TEKST_PLUGINS, zetMarkeringen, type Markering } from "../gedeeld/markering";
import { zetPaneel } from "../zoeken/paneelstaat";
import { besluit, lijst, voorbeeld, type Besluit } from "./opdrachten";
import { WEERGAVEN, auteurs, getoond, samenvatting, soortNaam, toonDatum, type Weergave } from "./logica";

export const wijzigingenWinkel = maakWinkel({
  paneel: false,
  weergave: "alle" as Weergave,
  verborgen: new Set<string>() as ReadonlySet<string>,
});

export function WijzigingenGroepen() {
  useEditorTik();
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  const uitvoeren = useUitvoeren();
  const opdrachten = useDocxCommands();
  const staat = wijzigingenWinkel.gebruik(api);
  const invoegen = useDocxCommand("insertPageBreak").state.enabled;
  const modus = useDocxCommand("editingMode").state.value;
  const bewerkbaar = invoegen || modus === "suggesting";
  const alle = lijst(api());
  const zichtbaar = getoond(alle, staat.verborgen);
  const geen = !zichtbaar.length;
  const filter = staat.verborgen.size > 0;

  function doe(wat: Besluit, reikwijdte: Parameters<typeof besluit>[2], omschrijving: string) {
    uitvoeren((ref) => {
      const aantal = besluit(ref, wat, { verborgen: staat.verborgen, ...reikwijdte });
      if (!aantal) meld(`Geen wijzigingen om te ${wat === "accepteren" ? "accepteren" : "weigeren"} ${omschrijving}.`);
    });
  }
  function enVolgende(wat: Besluit) {
    void opdrachten.execute(wat === "accepteren" ? "reviewAccept" : "reviewReject", null).then((r) => {
      if (!r.ok) return meld(r.failure.message);
      void opdrachten.execute("reviewNext", null);
    });
  }
  const menu = (wat: Besluit) => [
    { naam: `${wat === "accepteren" ? "Accepteren" : "Weigeren"} en naar volgende`, kies: () => enVolgende(wat), disabled: geen },
    "scheiding" as const,
    {
      naam: filter ? `Alle getoonde wijzigingen ${wat === "accepteren" ? "accepteren" : "weigeren"}` : `Alle wijzigingen ${wat === "accepteren" ? "accepteren" : "weigeren"}`,
      kies: () => doe(wat, {}, "in het document"),
      disabled: geen,
    },
    { naam: `Wijzigingen in de selectie ${wat === "accepteren" ? "accepteren" : "weigeren"}`, kies: () => doe(wat, { selectie: true }, "in de selectie"), disabled: geen },
    ...(wat === "accepteren"
      ? [{ naam: "Alles accepteren en bijhouden stoppen", kies: () => (doe(wat, {}, "in het document"), void opdrachten.execute("editingMode", { mode: "editing" })), disabled: geen }]
      : []),
  ];
  return (
    <>
      <Groep naam="Alles">
        <Keuzemenu naam="Accepteren…" icoon={CheckCheck} groot disabled={!bewerkbaar} items={menu("accepteren")} uitleg="Alles, in de selectie of alleen getoonde auteurs" />
        <Keuzemenu naam="Weigeren…" icoon={X} groot disabled={!bewerkbaar} items={menu("weigeren")} uitleg="Alles, in de selectie of alleen getoonde auteurs" />
      </Groep>
      <Groep naam="Weergave">
        <Keuzemenu
          naam={WEERGAVEN.find((w) => w.waarde === staat.weergave)?.naam ?? "Markeringen"}
          icoon={Eye}
          groot
          uitleg="Markeringsweergave voor controle"
          items={WEERGAVEN.map((w) => ({
            naam: w.naam,
            uitleg: w.uitleg,
            gekozen: staat.weergave === w.waarde,
            kies: () => wijzigingenWinkel.zet(api, { weergave: w.waarde }),
          }))}
        />
        <div className="ribbon-stapel">
          <Keuzemenu
            naam={filter ? "Auteurs (gefilterd)" : "Auteurs"}
            icoon={Users}
            uitleg="Wijzigingen per auteur tonen in het deelvenster en meenemen bij ‘alle getoonde’"
            items={[
              { naam: "Alle auteurs", gekozen: !filter, kies: () => wijzigingenWinkel.zet(api, { verborgen: new Set() }) },
              "scheiding",
              ...auteurs(alle).map((a) => ({
                naam: `${a.naam} (${a.aantal})`,
                gekozen: !staat.verborgen.has(a.naam),
                kies: () =>
                  wijzigingenWinkel.zet(api, (oud) => {
                    const verborgen = new Set(oud.verborgen);
                    if (verborgen.has(a.naam)) verborgen.delete(a.naam);
                    else verborgen.add(a.naam);
                    return { verborgen };
                  }),
              })),
            ]}
          />
          <Actieknop
            naam="Deelvenster"
            actief={staat.paneel}
            onClick={() => {
              const open = !staat.paneel;
              if (open) zetPaneel(api, { zoeken: false });
              wijzigingenWinkel.zet(api, { paneel: open });
            }}
          />
        </div>
      </Groep>
    </>
  );
}

function Actieknop({ naam, actief, onClick }: { naam: string; actief: boolean; onClick: () => void }) {
  return (
    <button type="button" className="ribbon-actie" aria-pressed={actief} title="Deelvenster met alle wijzigingen" onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <ListChecks size={17} strokeWidth={1.65} />
      <span>{naam}</span>
    </button>
  );
}

/** Deelvenster links met de lijst van wijzigingen. */
export function WijzigingenPaneel() {
  const tik = useEditorTik();
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  const staat = wijzigingenWinkel.gebruik(api);
  const [plek, setPlek] = useState<{ left: number; top: number; height: number } | null>(null);
  const alle = useMemo(() => lijst(api()), [tik, api]);
  const zichtbaar = getoond(alle, staat.verborgen);
  const telling = samenvatting(zichtbaar);
  useLayoutEffect(() => {
    const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__dock-area");
    const meet = () => {
      const r = vlak?.getBoundingClientRect();
      if (r) setPlek({ left: r.left + 8, top: r.top + 8, height: Math.max(240, r.height - 16) });
    };
    meet();
    vlak?.classList.add("tw-met-zoekpaneel");
    const waarnemer = new ResizeObserver(meet);
    if (vlak) waarnemer.observe(vlak);
    window.addEventListener("resize", meet);
    return () => {
      vlak?.classList.remove("tw-met-zoekpaneel");
      waarnemer.disconnect();
      window.removeEventListener("resize", meet);
    };
  }, []);
  function kies(id: string) {
    const ref = api();
    if (ref && !ref.scrollToChangeId(Number(id))) meld("Deze wijziging is niet meer te vinden.");
  }
  function een(id: string, wat: Besluit) {
    try {
      besluit(api(), wat, { ids: [id] });
    } catch (e) {
      meld(fout(e));
    }
  }
  const sluit = () => {
    wijzigingenWinkel.zet(api, { paneel: false });
    requestAnimationFrame(() => api()?.focus());
  };
  if (!plek) return null;
  return createPortal(
    <aside
      className="tw-zoekpaneel tw-wijzigingenpaneel"
      aria-label="Wijzigingen"
      style={{ left: plek.left, top: plek.top, maxHeight: plek.height }}
      onKeyDown={(e) => e.key === "Escape" && sluit()}
    >
      <header>
        <h2>Wijzigingen</h2>
        <button type="button" className="tw-zoek-sluit" aria-label="Sluiten" title="Sluiten · Esc" onClick={sluit}>
          <X size={15} />
        </button>
      </header>
      <p className="tw-zoek-telling" role="status">
        {telling.totaal
          ? `${telling.totaal} ${telling.totaal === 1 ? "wijziging" : "wijzigingen"}: ${telling.ingevoegd} ingevoegd, ${telling.verwijderd} verwijderd${telling.opmaak ? `, ${telling.opmaak} opmaak` : ""}`
          : "Geen wijzigingen."}
        {staat.verborgen.size > 0 && ` (${alle.length - zichtbaar.length} van verborgen auteurs)`}
      </p>
      <ol className="tw-zoek-resultaten tw-wijzigingen">
        {zichtbaar.map((r) => (
          <li key={r.revisionId}>
            <div className="tw-wijziging">
              <button type="button" className="tw-wijziging-tekst" onClick={() => kies(r.revisionId)}>
                <span className="tw-zoek-plek">
                  <strong>{r.author || "Onbekend"}</strong> · {soortNaam(r.kind)} · {toonDatum(r.date)}
                </span>
                <span className={`tw-wijziging-${/del/i.test(r.kind) ? "weg" : "erbij"}`}>{r.preview || "—"}</span>
              </button>
              <span className="tw-wijziging-knoppen">
                <button type="button" aria-label={`Accepteren: ${r.preview}`} title="Accepteren" onClick={() => een(r.revisionId, "accepteren")}>
                  <Check size={14} />
                </button>
                <button type="button" aria-label={`Weigeren: ${r.preview}`} title="Weigeren" onClick={() => een(r.revisionId, "weigeren")}>
                  <X size={14} />
                </button>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </aside>,
    document.body,
  );
}

/**
 * Alleen-lezen voorbeeld voor de weergaven ‘eenvoudig’, ‘geen markeringen’ en
 * ‘origineel’. De engine kan bijgehouden wijzigingen in het document zelf
 * niet verbergen; daarom tonen we een kopie waarin ze zijn afgehandeld.
 */
export function MarkeringVoorbeeld() {
  const { tekst: api, herlaad } = useEditorApi();
  const staat = wijzigingenWinkel.gebruik(api);
  const [inhoud, setInhoud] = useState<{ bytes: Uint8Array; gewijzigd: string[]; aantal: number } | null>(null);
  const [fouttekst, setFouttekst] = useState("");
  const [plek, setPlek] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const voorbeeldRef = useRef<DocxEditorRef>(null);
  const weergave = staat.weergave;
  useEffect(() => {
    if (weergave === "alle") {
      setInhoud(null);
      return;
    }
    let actief = true;
    setFouttekst("");
    void (async () => {
      // Via de opslagkoppeling van de editor: ref.save() zou ‘Opslaan als’ openen.
      if (!herlaad) throw new Error("Het document is nog niet gereed.");
      const uit = await voorbeeld(await herlaad.bytes(), weergave === "origineel" ? "weigeren" : "accepteren");
      if (actief) setInhoud(uit);
    })().catch((e) => actief && setFouttekst(fout(e)));
    return () => {
      actief = false;
      zetMarkeringen("wijzigingen", []);
    };
  }, [weergave, api, herlaad]);
  useLayoutEffect(() => {
    if (weergave === "alle") return;
    const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__dock-area");
    const meet = () => {
      const r = vlak?.getBoundingClientRect();
      if (r) setPlek({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    meet();
    const waarnemer = new ResizeObserver(meet);
    if (vlak) waarnemer.observe(vlak);
    return () => waarnemer.disconnect();
  }, [weergave]);
  async function strepen() {
    const ref = voorbeeldRef.current;
    if (!ref || weergave !== "eenvoudig" || !inhoud?.gewijzigd.length) return;
    const gelezen = await ref.readParagraphs({ view: "accepted", paraIds: inhoud.gewijzigd });
    if (!gelezen.ok) return;
    const markeringen: Markering[] = gelezen.paragraphs.map((p) => ({
      soort: "balk",
      doel: { kind: "range", version: gelezen.version, range: { story: p.story, start: { paraId: p.paraId, offset: 0 }, end: { paraId: p.paraId, offset: p.text.length }, view: "accepted" } },
    }));
    zetMarkeringen("wijzigingen", markeringen);
  }
  if (weergave === "alle" || !plek) return null;
  const naam = WEERGAVEN.find((w) => w.waarde === weergave)?.naam;
  return createPortal(
    <div className="tw-voorbeeld" style={plek} role="region" aria-label={`Voorbeeld: ${naam}`}>
      <div className="tw-voorbeeld-balk">
        <Eye size={15} aria-hidden="true" />
        <span>
          <strong>{naam}</strong> — alleen-lezen voorbeeld
          {inhoud ? ` (${inhoud.aantal} ${inhoud.aantal === 1 ? "wijziging" : "wijzigingen"} ${weergave === "origineel" ? "geweigerd" : "geaccepteerd"} in de weergave; het document zelf is niet gewijzigd)` : ""}.
        </span>
        <button type="button" onClick={() => wijzigingenWinkel.zet(api, { weergave: "alle" })}>
          Terug naar alle markeringen
        </button>
      </div>
      {fouttekst ? (
        <p className="tw-voorbeeld-melding">{fouttekst}</p>
      ) : !inhoud ? (
        <p className="tw-voorbeeld-melding">Voorbeeld maken…</p>
      ) : (
        <DocxEditor
          key={`${weergave}-${inhoud.bytes.byteLength}`}
          ref={voorbeeldRef}
          documentBuffer={inhoud.bytes}
          readOnly
          showToolbar={false}
          showRuler={false}
          showFileOpen={false}
          showHelpMenu={false}
          plugins={TEKST_PLUGINS}
          colorMode="light"
          i18n={tekstNlVolledig}
          className="tw-voorbeeld-editor"
          onFirstPagePainted={() => void strepen()}
          loadingIndicator={<p className="tw-voorbeeld-melding">Voorbeeld laden…</p>}
        />
      )}
    </div>,
    document.body,
  );
}
