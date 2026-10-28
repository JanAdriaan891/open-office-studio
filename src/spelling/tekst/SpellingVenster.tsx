/**
 * Deelvenster "Spelling en grammatica" (F7): loopt de fouten langs vanaf de
 * cursor, met suggesties, Wijzigen, Alles wijzigen, Negeren, Alles negeren,
 * Toevoegen aan woordenlijst en de taal van de alinea.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TALEN, type Taal } from "../talen";
import { SpellingSessie, type Alinea, type Plek } from "./sessie";
import type { Fout } from "../controleur";

type Doel = { alinea: Alinea; fout: Fout };
const sleutel = (d: Doel) => `${d.alinea.paraId}:${d.fout.start}:${d.fout.tekst}`;

export function SpellingVenster({ sessie, stand }: { sessie: SpellingSessie; stand: number }) {
  const [doel, setDoel] = useState<Doel | null>(null);
  const [suggesties, setSuggesties] = useState<string[] | null>(null);
  const [vervang, setVervang] = useState("");
  const [klaar, setKlaar] = useState(false);
  /** Na een actie: verder zoeken vanaf hier zodra de controle bijgewerkt is. */
  const verder = useRef<{ plek: Plek | null; overslaan?: { paraId: string; start: number } } | null>({
    plek: sessie.cursor(),
  });
  const eenmalig = useRef(new Set<string>());
  const venster = useRef<HTMLElement>(null);

  const sluit = () => {
    sessie.vensterOpen = false;
    sessie.meld();
    sessie.editor()?.getEditorRef()?.focus();
  };

  const zoek = (plek: Plek | null, overslaan?: { paraId: string; start: number }) => {
    let volgende = sessie.volgendeFout(plek, overslaan);
    // Eenmaal genegeerde plekken overslaan, hooguit één ronde door het document.
    const eerste = volgende && sleutel(volgende);
    for (let i = 0; volgende && eenmalig.current.has(sleutel(volgende)) && i < 1000; i++) {
      const { alinea, fout } = volgende;
      volgende = sessie.volgendeFout({ paraId: alinea.paraId, offset: fout.eind }, { paraId: alinea.paraId, start: fout.start });
      if (volgende && sleutel(volgende) === eerste) volgende = null;
    }
    setDoel(volgende);
    setKlaar(!volgende && sessie.aantal !== null);
    setSuggesties(null);
    setVervang(volgende?.fout.tekst ?? "");
    if (volgende) sessie.selecteer(volgende.alinea, volgende.fout);
  };

  // Bij elke nieuwe controle: verder zoeken of de huidige fout bijwerken.
  useEffect(() => {
    if (sessie.aantal === null) return;
    if (verder.current) {
      const { plek, overslaan } = verder.current;
      verder.current = null;
      zoek(plek, overslaan);
    } else if (doel) {
      const nog = sessie.zichtbareFouten().find(
        (d) => d.alinea.paraId === doel.alinea.paraId && d.fout.tekst === doel.fout.tekst && Math.abs(d.fout.start - doel.fout.start) < 50,
      );
      if (!nog) zoek({ paraId: doel.alinea.paraId, offset: doel.fout.start });
      else if (nog.fout !== doel.fout) setDoel(nog);
    } else if (klaar && sessie.aantal > 0) zoek(sessie.cursor());
  }, [stand]);

  useEffect(() => {
    if (!doel) return;
    let actief = true;
    sessie
      .controleur()
      .suggesties(doel.fout.tekst, doel.fout.taal, 8)
      .then((s) => {
        if (!actief) return;
        setSuggesties(s);
        if (s[0]) setVervang(s[0]);
      })
      .catch(() => actief && setSuggesties([]));
    return () => {
      actief = false;
    };
  }, [doel?.fout]);

  // Focus in het venster (dan werken Enter en Esc). ‘Wijzigen’ is uitgeschakeld
  // tot de suggesties er zijn; val dan terug op de eerstvolgende knop.
  const focusInVenster = () => {
    const v = venster.current;
    (
      v?.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)") ??
      v?.querySelector<HTMLElement>(".spelling-knoppen button:not(:disabled)")
    )?.focus();
  };
  useEffect(focusInVenster, [doel?.fout, klaar]);
  useEffect(() => {
    const actief = document.activeElement;
    // Niet weghalen uit het invoerveld of de suggestielijst.
    if (!venster.current?.contains(actief) || actief?.closest(".spelling-knoppen")) focusInVenster();
  }, [suggesties]);

  const naActie = (offset: number, overslaan = false) => {
    if (!doel) return;
    verder.current = {
      plek: { paraId: doel.alinea.paraId, offset },
      overslaan: overslaan ? { paraId: doel.alinea.paraId, start: doel.fout.start } : undefined,
    };
  };

  const context = doel ? SpellingSessie.context(doel.alinea, doel.fout) : null;
  const taalNaam = (t: Taal) => (t === "geen" ? "Niet controleren" : (TALEN.find((x) => x.id === t)?.naam ?? t));

  return createPortal(
    <aside
      ref={venster}
      className="spelling-venster"
      role="dialog"
      aria-label="Spelling en grammatica"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          sluit();
        }
      }}
    >
      <h2>
        Spelling en grammatica
        <button type="button" aria-label="Sluiten" title="Sluiten (Esc)" onClick={sluit}>
          ×
        </button>
      </h2>
      {sessie.probleem ? (
        <p role="alert">{sessie.probleem}</p>
      ) : sessie.aantal === null ? (
        <p role="status">Document controleren…</p>
      ) : !doel ? (
        <div className="spelling-klaar" role="status">
          <p>De spellingcontrole is voltooid. Er zijn geen onbekende woorden (meer) gevonden.</p>
          <button type="button" className="werkruimte-knop" data-autofocus onClick={sluit}>
            OK
          </button>
        </div>
      ) : (
        <>
          <div className="werkruimte-label">Niet in woordenlijst ({taalNaam(doel.fout.taal)}):</div>
          <p className="spelling-context" aria-live="polite">
            {context!.voor}
            <mark>{context!.woord}</mark>
            {context!.na}
          </p>
          <label>
            Wijzigen in
            <input
              value={vervang}
              onChange={(e) => setVervang(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && vervang && vervang !== doel.fout.tekst) {
                  naActie(doel.fout.start + vervang.length);
                  void sessie.vervang([doel], vervang);
                }
              }}
            />
          </label>
          <div className="werkruimte-label">Suggesties</div>
          <ul role="listbox" aria-label="Suggesties">
            {suggesties === null ? (
              <li>
                <button type="button" disabled>
                  Zoeken…
                </button>
              </li>
            ) : !suggesties.length ? (
              <li>
                <button type="button" disabled>
                  (geen suggesties)
                </button>
              </li>
            ) : (
              suggesties.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={s === vervang}
                    onClick={() => setVervang(s)}
                    onDoubleClick={() => {
                      naActie(doel.fout.start + s.length);
                      void sessie.vervang([doel], s);
                    }}
                  >
                    {s}
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="spelling-knoppen">
            <button
              type="button"
              className="is-primair"
              data-autofocus
              disabled={!vervang || vervang === doel.fout.tekst}
              onClick={() => {
                naActie(doel.fout.start + vervang.length);
                void sessie.vervang([doel], vervang);
              }}
            >
              Wijzigen
            </button>
            <button
              type="button"
              disabled={!vervang || vervang === doel.fout.tekst}
              onClick={() => {
                naActie(doel.fout.start + vervang.length);
                void sessie.vervang(sessie.zelfdeFouten(doel.fout.tekst, doel.fout.taal), vervang);
              }}
            >
              Alles wijzigen
            </button>
            <button
              type="button"
              onClick={() => {
                eenmalig.current.add(sleutel(doel));
                // Ook de golflijn op deze plek weg (de rest van de sessie).
                sessie.negeerHier(doel.alinea, doel.fout);
                zoek({ paraId: doel.alinea.paraId, offset: doel.fout.eind }, { paraId: doel.alinea.paraId, start: doel.fout.start });
              }}
            >
              Negeren
            </button>
            <button
              type="button"
              onClick={() => {
                naActie(doel.fout.start, true);
                sessie.negeerAlles(doel.fout.tekst);
              }}
            >
              Alles negeren
            </button>
            <button
              type="button"
              style={{ gridColumn: "1 / -1" }}
              onClick={() => {
                naActie(doel.fout.start, true);
                sessie.voegToe(doel.fout.tekst);
              }}
            >
              Toevoegen aan woordenlijst
            </button>
          </div>
          <label>
            Taal van deze alinea
            <select
              value={doel.alinea.taal}
              onChange={(e) => {
                naActie(doel.fout.start);
                sessie.kiesAlineaTaal(doel.alinea.paraId, e.target.value as Taal);
              }}
            >
              {[...TALEN.map((t) => t.id), "geen" as const].map((t) => (
                <option key={t} value={t}>
                  {taalNaam(t)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </aside>,
    document.body,
  );
}
