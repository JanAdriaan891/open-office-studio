/** Relatievenster: bestaande relaties, nieuwe relatie (met of zonder integriteit) en verwijderen. */
import { useId, useState } from "react";
import { Link2, Trash2 } from "lucide-react";
import type { RelatieSchema, TabelSchema, Werkkopie } from "../werkkopie/contract.ts";
import { useDialogen } from "./Dialoog.tsx";
import { leesbareFout } from "./invoer.ts";
import { relatieUitConcept, sleutelVelden, type RelatieConcept } from "./ontwerp-logica.ts";

export function RelatieVenster({
  werkkopie,
  relaties,
  tabellen,
  onGewijzigd,
}: {
  werkkopie: Werkkopie;
  relaties: RelatieSchema[];
  tabellen: TabelSchema[];
  onGewijzigd: (melding: string) => void | Promise<void>;
}) {
  const id = useId();
  const dialogen = useDialogen();
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const eerste = tabellen[0]?.naam ?? "";
  const [concept, setConcept] = useState<RelatieConcept>(() => ({
    naam: "",
    tabel: tabellen[1]?.naam ?? eerste,
    veld: "",
    naarTabel: eerste,
    naarVeld: sleutelVelden(tabellen[0])[0] ?? "",
    integriteit: true,
    trapsBijwerken: false,
    trapsVerwijderen: false,
  }));
  const zet = (deel: Partial<RelatieConcept>) => setConcept((c) => ({ ...c, ...deel }));
  const vanTabel = tabellen.find((t) => t.naam === concept.tabel);
  const naarTabel = tabellen.find((t) => t.naam === concept.naarTabel);

  async function voer(actie: () => Promise<string>) {
    setFout("");
    setBezig(true);
    try {
      await onGewijzigd(await actie());
    } catch (e) {
      setFout(leesbareFout(e));
    } finally {
      setBezig(false);
    }
  }

  async function maak() {
    const r = relatieUitConcept(concept);
    if ("fout" in r) return setFout(r.fout);
    await voer(async () => {
      const naam = await werkkopie.maakRelatie(r);
      zet({ naam: "" });
      return `Relatie ‘${naam}’ gemaakt${r.integriteit ? " met referentiële integriteit (tabel ‘" + r.tabel + "’ veilig herbouwd)" : ""}.`;
    });
  }

  async function verwijder(r: RelatieSchema) {
    const ja = await dialogen.bevestig({
      titel: "Relatie verwijderen",
      tekst: `Relatie ‘${r.naam}’ (${r.tabel} → ${r.naarTabel}) verwijderen?${r.integriteit ? " De referentiële integriteit vervalt; de tabel wordt daarvoor veilig herbouwd." : ""} Gegevens blijven behouden.`,
      ja: "Verwijderen",
      gevaarlijk: true,
    });
    if (!ja) return;
    await voer(async () => {
      await werkkopie.verwijderRelatie(r.naam);
      return `Relatie ‘${r.naam}’ verwijderd.`;
    });
  }

  const veldKeuze = (label: string, tabel: TabelSchema | undefined, waarde: string, kies: (v: string) => void, idDeel: string) => (
    <label className="database-veld" htmlFor={`${id}-${idDeel}`}>
      <span>{label}</span>
      <select id={`${id}-${idDeel}`} value={waarde} disabled={bezig || !tabel} onChange={(e) => kies(e.target.value)}>
        <option value="">— kies een veld —</option>
        {tabel?.velden.map((v) => (
          <option key={v.naam} value={v.naam}>
            {v.naam}
            {v.primair ? " (sleutel)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
  const tabelKeuze = (label: string, waarde: string, kies: (v: string) => void, idDeel: string) => (
    <label className="database-veld" htmlFor={`${id}-${idDeel}`}>
      <span>{label}</span>
      <select id={`${id}-${idDeel}`} value={waarde} disabled={bezig} onChange={(e) => kies(e.target.value)}>
        {tabellen.map((t) => (
          <option key={t.naam} value={t.naam}>
            {t.naam}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="database-overzicht" aria-busy={bezig}>
      <h2>Relaties</h2>
      {!relaties.length ? (
        <p>Er zijn geen relaties vastgelegd in de werkkopie.</p>
      ) : (
        <div className="table-wrap">
          <table aria-label="Relaties in de werkkopie">
            <thead>
              <tr>
                <th scope="col">Naam</th>
                <th scope="col">Van (verwijzend)</th>
                <th scope="col">Naar (verwezen)</th>
                <th scope="col">Referentiële integriteit</th>
                <th scope="col">
                  <span className="sr-only">Acties</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {relaties.map((r) => (
                <tr key={r.naam}>
                  <td>{r.naam}</td>
                  <td>
                    {r.tabel} ({r.velden.join(", ")})
                  </td>
                  <td>
                    {r.naarTabel} ({r.naarVelden.join(", ")})
                  </td>
                  <td>
                    {r.integriteit
                      ? ["Afgedwongen", r.trapsBijwerken ? "trapsgewijs bijwerken" : "", r.trapsVerwijderen ? "trapsgewijs verwijderen" : ""].filter(Boolean).join(" · ")
                      : "Niet afgedwongen"}
                  </td>
                  <td className="database-rij-acties">
                    <button type="button" aria-label={`Relatie ${r.naam} verwijderen`} title="Relatie verwijderen" disabled={bezig} onClick={() => void verwijder(r)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3>Nieuwe relatie</h3>
      {tabellen.length === 0 ? (
        <p className="muted">Maak eerst een tabel.</p>
      ) : (
        <form
          className="database-relatieformulier"
          aria-label="Nieuwe relatie"
          onSubmit={(e) => {
            e.preventDefault();
            void maak();
          }}
        >
          <fieldset disabled={bezig}>
            <legend>Verwezen tabel (de “één”-kant, met de sleutel)</legend>
            {tabelKeuze("Tabel", concept.naarTabel, (t) => zet({ naarTabel: t, naarVeld: sleutelVelden(tabellen.find((x) => x.naam === t))[0] ?? "" }), "naar")}
            {veldKeuze("Veld", naarTabel, concept.naarVeld, (v) => zet({ naarVeld: v }), "naarveld")}
          </fieldset>
          <fieldset disabled={bezig}>
            <legend>Verwijzende tabel (de “veel”-kant)</legend>
            {tabelKeuze("Tabel", concept.tabel, (t) => zet({ tabel: t, veld: "" }), "van")}
            {veldKeuze("Veld", vanTabel, concept.veld, (v) => zet({ veld: v }), "vanveld")}
          </fieldset>
          <fieldset disabled={bezig}>
            <legend>Eigenschappen</legend>
            <label className="database-veld" htmlFor={`${id}-naam`}>
              <span>Naam (optioneel)</span>
              <input id={`${id}-naam`} value={concept.naam} placeholder={`${concept.naarTabel}${concept.tabel}`} onChange={(e) => zet({ naam: e.target.value })} />
            </label>
            <label className="database-vink">
              <input type="checkbox" checked={concept.integriteit} onChange={(e) => zet({ integriteit: e.target.checked })} /> Referentiële integriteit afdwingen
            </label>
            <label className="database-vink">
              <input type="checkbox" checked={concept.trapsBijwerken} disabled={!concept.integriteit} onChange={(e) => zet({ trapsBijwerken: e.target.checked })} /> Gerelateerde velden trapsgewijs bijwerken
            </label>
            <label className="database-vink">
              <input type="checkbox" checked={concept.trapsVerwijderen} disabled={!concept.integriteit} onChange={(e) => zet({ trapsVerwijderen: e.target.checked })} /> Gerelateerde records trapsgewijs verwijderen
            </label>
          </fieldset>
          <p className="muted">
            Met referentiële integriteit moet het verwezen veld de primaire sleutel of uniek zijn en moeten alle bestaande gegevens kloppen; anders
            meldt de werkkopie hoeveel rijen niet verwijzen. De verwijzende tabel wordt daarvoor veilig herbouwd.
          </p>
          <div className="database-knoppen">
            <button type="submit" className="primary" disabled={bezig}>
              <Link2 size={16} /> Relatie maken
            </button>
          </div>
        </form>
      )}
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
    </div>
  );
}
