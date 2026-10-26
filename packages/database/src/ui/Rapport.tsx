/**
 * Rapportontwerper (bron, velden, groeperen, sorteren, totalen, kop/voet) en
 * afdrukvoorbeeld. Afdrukken en PDF gaan via de printdialoog van de browser
 * (`window.print`) met print-CSS die alleen het rapport toont.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Printer, Save, Trash2 } from "lucide-react";
import type { QueryResultaat, Veldsoort, Werkkopie } from "../werkkopie/contract.ts";
import { leesbareFout, toonWaarde } from "./invoer.ts";
import { bouwRapport, FUNCTIENAMEN, type RapportDefinitie, type Totaal, type Totaalfunctie } from "./rapport-logica.ts";
import { kolommenVan, laadBron } from "./bron.ts";
import { useDialogen } from "./Dialoog.tsx";

export function RapportOntwerper({
  werkkopie,
  bronnen,
  naam: beginNaam,
  bron: beginBron,
  definitie: beginDefinitie,
  bestaandeNamen,
  nieuw = false,
  onBewaard,
  onVoorbeeld,
}: {
  werkkopie: Werkkopie;
  bronnen: string[];
  naam: string;
  bron: string;
  definitie: RapportDefinitie;
  bestaandeNamen: string[];
  /** Nog niet opgeslagen ontwerp: een bestaande naam vraagt om bevestiging. */
  nieuw?: boolean;
  onBewaard: (naam: string) => void;
  onVoorbeeld: (naam: string, bron: string, def: RapportDefinitie) => void;
}) {
  const dialogen = useDialogen();
  const id = useId();
  const [naam, setNaam] = useState(beginNaam);
  const [bron, setBron] = useState(beginBron);
  const [def, setDef] = useState<RapportDefinitie>(beginDefinitie);
  const [kolommen, setKolommen] = useState<{ naam: string; soort: Veldsoort | null }[]>([]);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState("");
  /** Naam waaronder dit ontwerp nu in de werkkopie staat (vervangen zonder te vragen). */
  const [bewaardAls, setBewaardAls] = useState(nieuw ? "" : beginNaam);
  const zet = (deel: Partial<RapportDefinitie>) => setDef((d) => ({ ...d, ...deel }));

  useEffect(() => {
    let actief = true;
    setFout("");
    if (!bron) return setKolommen([]);
    kolommenVan(werkkopie, bron).then(
      (k) => {
        if (!actief) return;
        setKolommen(k);
      },
      (e) => actief && setFout(leesbareFout(e)),
    );
    return () => {
      actief = false;
    };
  }, [werkkopie, bron]);

  const gekozen = def.velden.length ? def.velden : kolommen.map((k) => k.naam);
  // Getalvelden, met bedragen en getallen vóór sleutels (AutoNummering).
  const getallen = kolommen
    .filter((k) => k.soort === null || ["geheel", "getal", "valuta", "autonummer"].includes(k.soort))
    .sort((a, b) => Number(a.soort === "autonummer") - Number(b.soort === "autonummer"));

  function wisselVeld(veld: string, aan: boolean) {
    const basis = def.velden.length ? def.velden : kolommen.map((k) => k.naam);
    zet({ velden: aan ? [...basis.filter((v) => v !== veld), veld] : basis.filter((v) => v !== veld) });
  }
  function verplaats(i: number, d: number) {
    const lijst = [...gekozen];
    const j = i + d;
    if (j < 0 || j >= lijst.length) return;
    [lijst[i], lijst[j]] = [lijst[j], lijst[i]];
    zet({ velden: lijst });
  }

  async function bewaar() {
    const schoon = naam.trim();
    if (!schoon) return setFout("Geef het rapport een naam.");
    if (!bron) return setFout("Kies een bron.");
    if (schoon.toLowerCase() !== bewaardAls.toLowerCase() && bestaandeNamen.some((n) => n.toLowerCase() === schoon.toLowerCase())) {
      const ja = await dialogen.bevestig({ titel: "Rapport vervangen", tekst: `Er bestaat al een rapport ‘${schoon}’. Vervangen?`, ja: "Vervangen", gevaarlijk: true });
      if (!ja) return;
    }
    try {
      await werkkopie.bewaarOntwerp({ naam: schoon, soort: "rapport", bron, definitie: { ...def, titel: def.titel || schoon } });
      setMelding(`Rapport ‘${schoon}’ opgeslagen in de werkkopie.`);
      setBewaardAls(schoon);
      setFout("");
      onBewaard(schoon);
    } catch (e) {
      setFout("Opslaan mislukt: " + leesbareFout(e));
    }
  }

  return (
    <form
      className="database-ontwerper"
      onSubmit={(e) => {
        e.preventDefault();
        void bewaar();
      }}
    >
      <div className="database-ontwerper-raster">
        <label className="database-veld" htmlFor={`${id}-naam`}>
          <span>Naam</span>
          <input id={`${id}-naam`} value={naam} onChange={(e) => setNaam(e.target.value)} />
        </label>
        <label className="database-veld" htmlFor={`${id}-bron`}>
          <span>Bron (tabel of query)</span>
          <select
            id={`${id}-bron`}
            value={bron}
            onChange={(e) => {
              setBron(e.target.value);
              zet({ velden: [], groepeer: null, sorteer: [], totalen: [] });
            }}
          >
            <option value="">Kies een bron…</option>
            {bronnen.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="database-veld" htmlFor={`${id}-titel`}>
          <span>Titel</span>
          <input id={`${id}-titel`} value={def.titel} onChange={(e) => zet({ titel: e.target.value })} />
        </label>
        <label className="database-veld" htmlFor={`${id}-kop`}>
          <span>Kop (tekst boven het rapport)</span>
          <input id={`${id}-kop`} value={def.kop} onChange={(e) => zet({ kop: e.target.value })} />
        </label>
        <label className="database-veld" htmlFor={`${id}-voet`}>
          <span>Voet (tekst onder het rapport)</span>
          <input id={`${id}-voet`} value={def.voet} onChange={(e) => zet({ voet: e.target.value })} />
        </label>
        <label className="database-veld database-veld-rij" htmlFor={`${id}-liggend`}>
          <input id={`${id}-liggend`} type="checkbox" checked={!!def.liggend} onChange={(e) => zet({ liggend: e.target.checked })} />
          <span>Liggend afdrukken</span>
        </label>
      </div>
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      {!!kolommen.length && (
        <div className="database-ontwerper-delen">
          <fieldset>
            <legend>Velden en volgorde</legend>
            <ul className="database-keuzelijst">
              {gekozen.map((v, i) => (
                <li key={v}>
                  <label>
                    <input type="checkbox" checked onChange={() => wisselVeld(v, false)} /> {v}
                  </label>
                  <button type="button" aria-label={`${v} omhoog`} disabled={i === 0} onClick={() => verplaats(i, -1)}>
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" aria-label={`${v} omlaag`} disabled={i === gekozen.length - 1} onClick={() => verplaats(i, 1)}>
                    <ArrowDown size={14} />
                  </button>
                </li>
              ))}
              {kolommen
                .filter((k) => !gekozen.includes(k.naam))
                .map((k) => (
                  <li key={k.naam} className="is-uit">
                    <label>
                      <input type="checkbox" checked={false} onChange={() => wisselVeld(k.naam, true)} /> {k.naam}
                    </label>
                  </li>
                ))}
            </ul>
          </fieldset>
          <fieldset>
            <legend>Groeperen en sorteren</legend>
            <label className="database-veld" htmlFor={`${id}-groep`}>
              <span>Groeperen op</span>
              <select id={`${id}-groep`} value={def.groepeer ?? ""} onChange={(e) => zet({ groepeer: e.target.value || null })}>
                <option value="">(niet groeperen)</option>
                {kolommen.map((k) => (
                  <option key={k.naam} value={k.naam}>
                    {k.naam}
                  </option>
                ))}
              </select>
            </label>
            {def.sorteer.map((s, i) => (
              <div key={i} className="database-ontwerper-regel">
                <select
                  aria-label={`Sorteerveld ${i + 1}`}
                  value={s.veld}
                  onChange={(e) => zet({ sorteer: def.sorteer.map((x, j) => (j === i ? { ...x, veld: e.target.value } : x)) })}
                >
                  {kolommen.map((k) => (
                    <option key={k.naam} value={k.naam}>
                      {k.naam}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Sorteervolgorde ${i + 1}`}
                  value={s.aflopend ? "af" : "op"}
                  onChange={(e) => zet({ sorteer: def.sorteer.map((x, j) => (j === i ? { ...x, aflopend: e.target.value === "af" } : x)) })}
                >
                  <option value="op">Oplopend</option>
                  <option value="af">Aflopend</option>
                </select>
                <button type="button" aria-label={`Sortering ${i + 1} verwijderen`} onClick={() => zet({ sorteer: def.sorteer.filter((_, j) => j !== i) })}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => zet({ sorteer: [...def.sorteer, { veld: kolommen[0].naam, aflopend: false }] })}>
              <Plus size={14} /> Sortering toevoegen
            </button>
          </fieldset>
          <fieldset>
            <legend>Totalen (per groep en eindtotaal)</legend>
            {def.totalen.map((t, i) => (
              <div key={i} className="database-ontwerper-regel">
                <select
                  aria-label={`Functie van totaal ${i + 1}`}
                  value={t.functie}
                  onChange={(e) => zet({ totalen: def.totalen.map((x, j) => (j === i ? { ...x, functie: e.target.value as Totaalfunctie } : x)) })}
                >
                  {(Object.keys(FUNCTIENAMEN) as Totaalfunctie[]).map((f) => (
                    <option key={f} value={f}>
                      {FUNCTIENAMEN[f]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Veld van totaal ${i + 1}`}
                  value={t.veld}
                  onChange={(e) => zet({ totalen: def.totalen.map((x, j) => (j === i ? { ...x, veld: e.target.value } : x)) })}
                >
                  {(t.functie === "aantal" ? kolommen : getallen).map((k) => (
                    <option key={k.naam} value={k.naam}>
                      {k.naam}
                    </option>
                  ))}
                </select>
                <button type="button" aria-label={`Totaal ${i + 1} verwijderen`} onClick={() => zet({ totalen: def.totalen.filter((_, j) => j !== i) })}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => zet({ totalen: [...def.totalen, { veld: (getallen[0] ?? kolommen[0]).naam, functie: getallen.length ? "som" : "aantal" }] })}
            >
              <Plus size={14} /> Totaal toevoegen
            </button>
          </fieldset>
        </div>
      )}
      {melding && (
        <p className="melding" role="status">
          {melding}
        </p>
      )}
      <div className="database-knoppen">
        <button type="submit" className="primary">
          <Save size={16} /> Rapport opslaan
        </button>
        <button type="button" disabled={!bron} onClick={() => onVoorbeeld(naam.trim() || "Rapport", bron, { ...def, titel: def.titel || naam })}>
          <Eye size={16} /> Afdrukvoorbeeld
        </button>
      </div>
    </form>
  );
}

function TotaalCel({ totalen, kolom, soort }: { totalen: Totaal[]; kolom: string; soort: Veldsoort | null }) {
  const lijst = totalen.filter((t) => t.veld.toLowerCase() === kolom.toLowerCase());
  return (
    <td className="database-totaal">
      {lijst.map((t, i) => (
        <div key={i}>
          <small>{FUNCTIENAMEN[t.functie]}</small>{" "}
          {t.waarde === null ? "–" : t.functie === "aantal" ? t.waarde.toLocaleString("nl-NL") : toonWaarde(Math.round(t.waarde * 100) / 100, soort === "valuta" ? "valuta" : "getal")}
        </div>
      ))}
    </td>
  );
}

export function RapportVoorbeeld({
  werkkopie,
  naam,
  bron,
  definitie,
  onOntwerp,
}: {
  werkkopie: Werkkopie;
  naam: string;
  bron: string;
  definitie: RapportDefinitie;
  onOntwerp?: () => void;
}) {
  const dialogen = useDialogen();
  const [data, setData] = useState<QueryResultaat | null>(null);
  const [fout, setFout] = useState("");
  const [geannuleerd, setGeannuleerd] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      await Promise.resolve();
      if (!actief) return;
      try {
        const r = await laadBron(werkkopie, bron, dialogen);
        if (!actief) return;
        if (!r) setGeannuleerd(true);
        else setData(r);
      } catch (e) {
        if (actief) setFout(leesbareFout(e));
      }
    })();
    return () => {
      actief = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [werkkopie, bron]);

  const rapport = useMemo(() => (data ? bouwRapport(data.kolommen, data.rijen, definitie) : null), [data, definitie]);
  const soortVan = (kolom: string) => {
    const i = data?.kolommen.indexOf(kolom) ?? -1;
    return i >= 0 ? (data?.kolomsoorten?.[i] ?? null) : null;
  };
  const groepSoort = definitie.groepeer ? soortVan(data?.kolommen.find((k) => k.toLowerCase() === definitie.groepeer!.toLowerCase()) ?? "") : null;

  function afdrukken() {
    const stijl = document.createElement("style");
    stijl.textContent = `@page { size: A4 ${definitie.liggend ? "landscape" : "portrait"}; margin: 14mm; }`;
    document.head.append(stijl);
    document.body.classList.add("database-afdrukken");
    const opruimen = () => {
      stijl.remove();
      document.body.classList.remove("database-afdrukken");
      window.removeEventListener("afterprint", opruimen);
    };
    window.addEventListener("afterprint", opruimen);
    window.print();
    setTimeout(opruimen, 1000);
  }

  return (
    <div className="database-rapportvoorbeeld">
      <div className="database-werkbalk" role="toolbar" aria-label="Afdrukvoorbeeld">
        <button className="primary" onClick={afdrukken} disabled={!rapport}>
          <Printer size={16} /> Afdrukken of PDF
        </button>
        {onOntwerp && (
          <button onClick={onOntwerp}>
            <Pencil size={16} /> Ontwerp
          </button>
        )}
        <span className="muted">Kies in de printdialoog “Opslaan als PDF” voor een PDF-bestand.</span>
      </div>
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      {geannuleerd && <p role="status">Geen gegevens: het opgeven van parameters is geannuleerd.</p>}
      {!rapport && !fout && !geannuleerd && <p role="status">Rapport opbouwen…</p>}
      {rapport && (
        <div className={`database-afdruk ${definitie.liggend ? "is-liggend" : ""}`} aria-label={`Afdrukvoorbeeld van ${naam}`}>
          <header className="database-afdrukkop">
            <h1>{definitie.titel || naam}</h1>
            {definitie.kop && <p>{definitie.kop}</p>}
          </header>
          {!!rapport.ontbrekend.length && (
            <p className="melding fout">Deze velden komen niet (meer) voor in de bron: {rapport.ontbrekend.join(", ")}.</p>
          )}
          <table>
            <thead>
              <tr>
                {rapport.kolommen.map((k, i) => (
                  <th key={i} scope="col">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            {rapport.groepen.map((g, gi) => (
              <tbody key={gi}>
                {g.sleutel !== undefined && (
                  <tr className="database-groepkop">
                    <th colSpan={rapport.kolommen.length} scope="rowgroup">
                      {definitie.groepeer}: {g.sleutel === null ? "(leeg)" : toonWaarde(g.sleutel, groepSoort)}
                    </th>
                  </tr>
                )}
                {g.rijen.map((rij, ri) => (
                  <tr key={ri}>
                    {rapport.indexen.map((idx, ci) => (
                      <td key={ci} className={typeof rij[idx] === "number" ? "is-getal" : ""}>
                        {toonWaarde(rij[idx], data?.kolomsoorten?.[idx] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))}
                {g.sleutel !== undefined && !!g.totalen.length && (
                  <tr className="database-groepvoet">
                    {rapport.kolommen.map((k, ci) => (
                      <TotaalCel key={ci} totalen={g.totalen} kolom={k} soort={soortVan(k)} />
                    ))}
                  </tr>
                )}
              </tbody>
            ))}
            {!!rapport.eindtotalen.length && (
              <tfoot>
                <tr>
                  {rapport.kolommen.map((k, ci) => (
                    <TotaalCel key={ci} totalen={rapport.eindtotalen} kolom={k} soort={soortVan(k)} />
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
          {rapport.eindtotalen.some((t) => !rapport.kolommen.some((k) => k.toLowerCase() === t.veld.toLowerCase())) && (
            <p className="muted">
              Totalen van niet-getoonde velden:{" "}
              {rapport.eindtotalen
                .filter((t) => !rapport.kolommen.some((k) => k.toLowerCase() === t.veld.toLowerCase()))
                .map((t) => `${FUNCTIENAMEN[t.functie]} ${t.veld}: ${t.waarde === null ? "–" : t.waarde.toLocaleString("nl-NL")}`)
                .join(" · ")}
            </p>
          )}
          <footer className="database-afdrukvoet">
            <span>{definitie.voet}</span>
            <span>
              {rapport.aantal.toLocaleString("nl-NL")} records · {new Date().toLocaleDateString("nl-NL")}
              {data?.afgekapt ? " · afgekapt op 50.000 records" : ""}
            </span>
          </footer>
        </div>
      )}
    </div>
  );
}
