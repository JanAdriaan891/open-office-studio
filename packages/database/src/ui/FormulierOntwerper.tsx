/** Eenvoudige formulierontwerper: bron, velden (volgorde, labels, besturingsnamen) en knoppen. */
import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Plus, Save, Trash2 } from "lucide-react";
import type { Veldsoort, Werkkopie } from "../werkkopie/contract.ts";
import { leesbareFout } from "./invoer.ts";
import { automatischFormulier, controleerDefinitie, type FormulierDefinitie } from "./formulier-logica.ts";
import { kolommenVan } from "./bron.ts";
import { useDialogen } from "./Dialoog.tsx";

export function FormulierOntwerper({
  werkkopie,
  bronnen,
  naam: beginNaam,
  bron: beginBron,
  definitie: beginDefinitie,
  bestaandeNamen,
  moduleKnoppen,
  onBewaard,
  onOpenen,
}: {
  werkkopie: Werkkopie;
  bronnen: string[];
  naam: string;
  bron: string;
  definitie: FormulierDefinitie | null;
  bestaandeNamen: string[];
  /** Knoppen waarvoor de formuliermodule een _Click-procedure heeft (voorstel). */
  moduleKnoppen: (naam: string) => string[];
  onBewaard: (naam: string) => void;
  onOpenen: (naam: string) => void;
}) {
  const dialogen = useDialogen();
  const id = useId();
  const [naam, setNaam] = useState(beginNaam);
  const [bron, setBron] = useState(beginBron);
  const [def, setDef] = useState<FormulierDefinitie | null>(beginDefinitie);
  const [kolommen, setKolommen] = useState<{ naam: string; soort: Veldsoort | null }[]>([]);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState("");
  const [bewaardAls, setBewaardAls] = useState(beginDefinitie ? beginNaam : "");

  useEffect(() => {
    let actief = true;
    if (!bron) return setKolommen([]);
    kolommenVan(werkkopie, bron).then(
      (k) => {
        if (!actief) return;
        setKolommen(k);
        setFout("");
        setDef((d) => d ?? automatischFormulier(naam || bron, k));
      },
      (e) => actief && setFout(leesbareFout(e)),
    );
    return () => {
      actief = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [werkkopie, bron]);

  const zet = (deel: Partial<FormulierDefinitie>) => setDef((d) => (d ? { ...d, ...deel } : d));
  const voorgesteld = moduleKnoppen(naam).filter((k) => !def?.knoppen.some((x) => x.naam.toLowerCase() === k.toLowerCase()));

  async function bewaar(openen: boolean) {
    if (!def) return;
    const schoon = naam.trim();
    if (!schoon) return setFout("Geef het formulier een naam.");
    const fouten = controleerDefinitie(def);
    if (fouten.length) return setFout(fouten.join(" "));
    if (schoon.toLowerCase() !== bewaardAls.toLowerCase() && bestaandeNamen.some((n) => n.toLowerCase() === schoon.toLowerCase())) {
      const ja = await dialogen.bevestig({ titel: "Formulier vervangen", tekst: `Er bestaat al een formulier ‘${schoon}’. Vervangen?`, ja: "Vervangen", gevaarlijk: true });
      if (!ja) return;
    }
    try {
      await werkkopie.bewaarOntwerp({ naam: schoon, soort: "formulier", bron, definitie: { ...def, titel: def.titel || schoon } });
      setFout("");
      setMelding(`Formulier ‘${schoon}’ opgeslagen in de werkkopie.`);
      setBewaardAls(schoon);
      onBewaard(schoon);
      if (openen) onOpenen(schoon);
    } catch (e) {
      setFout("Opslaan mislukt: " + leesbareFout(e));
    }
  }

  const ongebruikt = kolommen.filter((k) => !def?.velden.some((v) => v.veld.toLowerCase() === k.naam.toLowerCase()));

  return (
    <form
      className="database-ontwerper"
      onSubmit={(e) => {
        e.preventDefault();
        void bewaar(false);
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
              setDef(null);
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
        {def && (
          <label className="database-veld" htmlFor={`${id}-titel`}>
            <span>Titel</span>
            <input id={`${id}-titel`} value={def.titel} onChange={(e) => zet({ titel: e.target.value })} />
          </label>
        )}
        {def && (
          <label className="database-veld database-veld-rij" htmlFor={`${id}-blad`}>
            <input id={`${id}-blad`} type="checkbox" checked={!!def.gegevensblad} onChange={(e) => zet({ gegevensblad: e.target.checked })} />
            <span>Openen als gegevensblad</span>
          </label>
        )}
      </div>
      <p className="muted">
        De naam bepaalt de koppeling met VBA: formulier ‘Klanten’ gebruikt module Form_Klanten. De besturingsnaam is de naam waarmee VBA
        het veld aanspreekt (Me!txtNaam).
      </p>
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      {def && (
        <div className="database-ontwerper-delen">
          <fieldset className="is-breed">
            <legend>Velden</legend>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Veld</th>
                    <th scope="col">Label</th>
                    <th scope="col">Besturingsnaam (VBA)</th>
                    <th scope="col">
                      <span className="sr-only">Acties</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {def.velden.map((v, i) => (
                    <tr key={v.veld}>
                      <td>{v.veld}</td>
                      <td>
                        <input
                          aria-label={`Label van ${v.veld}`}
                          value={v.label}
                          onChange={(e) => zet({ velden: def.velden.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Besturingsnaam van ${v.veld}`}
                          value={v.besturing}
                          onChange={(e) => zet({ velden: def.velden.map((x, j) => (j === i ? { ...x, besturing: e.target.value } : x)) })}
                        />
                      </td>
                      <td className="database-rij-acties">
                        <button
                          type="button"
                          aria-label={`${v.veld} omhoog`}
                          disabled={i === 0}
                          onClick={() => {
                            const l = [...def.velden];
                            [l[i - 1], l[i]] = [l[i], l[i - 1]];
                            zet({ velden: l });
                          }}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`${v.veld} omlaag`}
                          disabled={i === def.velden.length - 1}
                          onClick={() => {
                            const l = [...def.velden];
                            [l[i + 1], l[i]] = [l[i], l[i + 1]];
                            zet({ velden: l });
                          }}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button type="button" aria-label={`${v.veld} weglaten`} onClick={() => zet({ velden: def.velden.filter((_, j) => j !== i) })}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!!ongebruikt.length && (
              <div className="database-knoppen">
                {ongebruikt.map((k) => (
                  <button
                    type="button"
                    key={k.naam}
                    onClick={() => zet({ velden: [...def.velden, { veld: k.naam, label: k.naam, besturing: k.naam }] })}
                  >
                    <Plus size={14} /> {k.naam}
                  </button>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset className="is-breed">
            <legend>Knoppen</legend>
            {def.knoppen.map((k, i) => (
              <div key={i} className="database-ontwerper-regel">
                <input
                  aria-label={`Naam van knop ${i + 1}`}
                  value={k.naam}
                  onChange={(e) => zet({ knoppen: def.knoppen.map((x, j) => (j === i ? { ...x, naam: e.target.value } : x)) })}
                />
                <input
                  aria-label={`Tekst van knop ${i + 1}`}
                  value={k.label}
                  onChange={(e) => zet({ knoppen: def.knoppen.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                />
                <button type="button" aria-label={`Knop ${k.naam} verwijderen`} onClick={() => zet({ knoppen: def.knoppen.filter((_, j) => j !== i) })}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="database-knoppen">
              <button type="button" onClick={() => zet({ knoppen: [...def.knoppen, { naam: `cmdKnop${def.knoppen.length + 1}`, label: "Knop" }] })}>
                <Plus size={14} /> Knop toevoegen
              </button>
              {voorgesteld.map((k) => (
                <button type="button" key={k} onClick={() => zet({ knoppen: [...def.knoppen, { naam: k, label: k.replace(/^cmd/i, "") }] })}>
                  <Plus size={14} /> {k} (uit VBA)
                </button>
              ))}
            </div>
            <p className="muted">Een knop voert bij klikken de VBA-procedure &lt;knopnaam&gt;_Click uit de formuliermodule uit.</p>
          </fieldset>
        </div>
      )}
      {melding && (
        <p className="melding" role="status">
          {melding}
        </p>
      )}
      <div className="database-knoppen">
        <button type="submit" className="primary" disabled={!def}>
          <Save size={16} /> Formulier opslaan
        </button>
        <button type="button" disabled={!def} onClick={() => void bewaar(true)}>
          <Eye size={16} /> Opslaan en openen
        </button>
      </div>
    </form>
  );
}
