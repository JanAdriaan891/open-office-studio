/** Ontwerpweergave van een tabel (velden, typen, sleutel) en de editor voor een nieuwe tabel. */
import { useId, useState } from "react";
import { ArrowDown, ArrowUp, KeyRound, Plus, Save, Trash2 } from "lucide-react";
import type { RelatieSchema, TabelSchema, VeldSchema, Veldsoort, Werkkopie } from "../werkkopie/contract.ts";
import { leesbareFout, leesInvoer, SOORTNAMEN, toonWaarde } from "./invoer.ts";
import { useDialogen } from "./Dialoog.tsx";

export function TabelOntwerp({
  werkkopie,
  schema,
  relaties,
  onVerwijderd,
}: {
  werkkopie: Werkkopie;
  schema: TabelSchema;
  relaties: RelatieSchema[];
  onVerwijderd: () => void;
}) {
  const dialogen = useDialogen();
  const [fout, setFout] = useState("");
  const eigen = relaties.filter(
    (r) => r.tabel.toLowerCase() === schema.naam.toLowerCase() || r.naarTabel.toLowerCase() === schema.naam.toLowerCase(),
  );
  return (
    <div className="database-ontwerp">
      <div className="table-wrap">
        <table aria-label={`Velden van ${schema.naam}`}>
          <thead>
            <tr>
              <th scope="col">Sleutel</th>
              <th scope="col">Veldnaam</th>
              <th scope="col">Gegevenstype</th>
              <th scope="col">Lengte</th>
              <th scope="col">Verplicht</th>
              <th scope="col">Standaardwaarde</th>
            </tr>
          </thead>
          <tbody>
            {schema.velden.map((v) => (
              <tr key={v.naam}>
                <td>{v.primair ? <KeyRound size={14} aria-label="Primaire sleutel" /> : ""}</td>
                <td>{v.naam}</td>
                <td>{SOORTNAMEN[v.soort]}</td>
                <td>{v.lengte ?? ""}</td>
                <td>{v.verplicht ? "Ja" : "Nee"}</td>
                <td>{v.standaard === undefined ? "" : toonWaarde(v.standaard, v.soort)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        {schema.herkomst === "access" ? "Overgenomen uit het Access-origineel" : "Gemaakt in de werkkopie"} ·{" "}
        {schema.aantal.toLocaleString("nl-NL")} rijen. Velden van een bestaande tabel wijzigen kan nog niet: de werkkopie
        biedt (nog) geen tabelwijziging. Maak zo nodig een nieuwe tabel.
      </p>
      {!!eigen.length && (
        <>
          <h3>Relaties</h3>
          <ul className="database-relatielijst">
            {eigen.map((r) => (
              <li key={r.naam}>
                {r.tabel}.{r.velden.join(", ")} → {r.naarTabel}.{r.naarVelden.join(", ")}
                {r.integriteit ? " · referentiële integriteit" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      <div className="database-knoppen">
        <button
          className="is-gevaar"
          onClick={async () => {
            const ja = await dialogen.bevestig({
              titel: "Tabel verwijderen",
              tekst: `Tabel ‘${schema.naam}’ met ${schema.aantal.toLocaleString("nl-NL")} rijen uit de werkkopie verwijderen? Het origineel blijft ongewijzigd.`,
              ja: "Verwijderen",
              gevaarlijk: true,
            });
            if (!ja) return;
            try {
              await werkkopie.verwijderTabel(schema.naam);
              onVerwijderd();
            } catch (e) {
              setFout(leesbareFout(e));
            }
          }}
        >
          <Trash2 size={16} /> Tabel verwijderen
        </button>
      </div>
    </div>
  );
}

const SOORTEN: Veldsoort[] = ["autonummer", "tekst", "memo", "geheel", "getal", "valuta", "datum", "jaNee", "guid"];

interface ConceptVeld {
  sleutel: number;
  naam: string;
  soort: Veldsoort;
  lengte: string;
  verplicht: boolean;
  primair: boolean;
  standaard: string;
}

/** Zet de concepten om naar een schema of geeft de eerste fout. */
export function conceptNaarSchema(naam: string, velden: ConceptVeld[]): { schema: { naam: string; velden: VeldSchema[] } } | { fout: string } {
  if (!naam.trim()) return { fout: "Geef de tabel een naam." };
  if (!velden.length) return { fout: "Voeg minstens één veld toe." };
  const uit: VeldSchema[] = [];
  for (const v of velden) {
    if (!v.naam.trim()) return { fout: "Elk veld heeft een naam nodig." };
    const veld: VeldSchema = { naam: v.naam.trim(), soort: v.soort };
    if (v.soort === "tekst") {
      const n = Number(v.lengte || 255);
      if (!Number.isInteger(n) || n < 1 || n > 255) return { fout: `Lengte van ‘${v.naam}’ moet tussen 1 en 255 liggen.` };
      veld.lengte = n;
    }
    if (v.verplicht) veld.verplicht = true;
    if (v.primair) veld.primair = true;
    if (v.standaard.trim()) {
      const r = leesInvoer(v.standaard, { ...veld, verplicht: false });
      if (!r.ok) return { fout: `Standaardwaarde van ‘${v.naam}’: ${r.fout}` };
      if (r.waarde !== null) veld.standaard = r.waarde;
    }
    uit.push(veld);
  }
  return { schema: { naam: naam.trim(), velden: uit } };
}

export function NieuweTabel({ werkkopie, onGemaakt }: { werkkopie: Werkkopie; onGemaakt: (naam: string) => void }) {
  const id = useId();
  const [naam, setNaam] = useState("Tabel1");
  const [teller, setTeller] = useState(2);
  const [velden, setVelden] = useState<ConceptVeld[]>([
    { sleutel: 0, naam: "Id", soort: "autonummer", lengte: "", verplicht: false, primair: true, standaard: "" },
    { sleutel: 1, naam: "Naam", soort: "tekst", lengte: "255", verplicht: false, primair: false, standaard: "" },
  ]);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const zet = (i: number, deel: Partial<ConceptVeld>) => setVelden((l) => l.map((v, j) => (j === i ? { ...v, ...deel } : v)));
  const verplaats = (i: number, d: number) =>
    setVelden((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const kopie = [...l];
      [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
      return kopie;
    });
  async function bewaar() {
    const r = conceptNaarSchema(naam, velden);
    if ("fout" in r) return setFout(r.fout);
    setBezig(true);
    try {
      await werkkopie.maakTabel(r.schema);
      onGemaakt(r.schema.naam);
    } catch (e) {
      setFout(leesbareFout(e));
    } finally {
      setBezig(false);
    }
  }
  return (
    <form
      className="database-ontwerp"
      onSubmit={(e) => {
        e.preventDefault();
        void bewaar();
      }}
    >
      <label className="database-veld database-veld-breed" htmlFor={`${id}-naam`}>
        <span>Tabelnaam</span>
        <input id={`${id}-naam`} value={naam} onChange={(e) => setNaam(e.target.value)} />
      </label>
      <div className="table-wrap">
        <table aria-label="Velden van de nieuwe tabel">
          <thead>
            <tr>
              <th scope="col">Sleutel</th>
              <th scope="col">Veldnaam</th>
              <th scope="col">Gegevenstype</th>
              <th scope="col">Lengte</th>
              <th scope="col">Verplicht</th>
              <th scope="col">Standaardwaarde</th>
              <th scope="col">
                <span className="sr-only">Acties</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {velden.map((v, i) => (
              <tr key={v.sleutel}>
                <td>
                  <input type="checkbox" aria-label={`${v.naam || "Veld"} is primaire sleutel`} checked={v.primair} onChange={(e) => zet(i, { primair: e.target.checked })} />
                </td>
                <td>
                  <input aria-label={`Naam van veld ${i + 1}`} value={v.naam} onChange={(e) => zet(i, { naam: e.target.value })} />
                </td>
                <td>
                  <select aria-label={`Gegevenstype van ${v.naam || `veld ${i + 1}`}`} value={v.soort} onChange={(e) => zet(i, { soort: e.target.value as Veldsoort })}>
                    {SOORTEN.map((s) => (
                      <option key={s} value={s}>
                        {SOORTNAMEN[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`Lengte van ${v.naam || `veld ${i + 1}`}`}
                    disabled={v.soort !== "tekst"}
                    inputMode="numeric"
                    size={4}
                    value={v.soort === "tekst" ? v.lengte : ""}
                    onChange={(e) => zet(i, { lengte: e.target.value })}
                  />
                </td>
                <td>
                  <input type="checkbox" aria-label={`${v.naam || "Veld"} is verplicht`} checked={v.verplicht} onChange={(e) => zet(i, { verplicht: e.target.checked })} />
                </td>
                <td>
                  <input
                    aria-label={`Standaardwaarde van ${v.naam || `veld ${i + 1}`}`}
                    disabled={v.soort === "autonummer"}
                    value={v.standaard}
                    onChange={(e) => zet(i, { standaard: e.target.value })}
                  />
                </td>
                <td className="database-rij-acties">
                  <button type="button" aria-label={`${v.naam} omhoog`} onClick={() => verplaats(i, -1)} disabled={i === 0}>
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" aria-label={`${v.naam} omlaag`} onClick={() => verplaats(i, 1)} disabled={i === velden.length - 1}>
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" aria-label={`${v.naam} verwijderen`} onClick={() => setVelden((l) => l.filter((_, j) => j !== i))}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      <div className="database-knoppen">
        <button
          type="button"
          onClick={() => {
            setVelden((l) => [...l, { sleutel: teller, naam: `Veld${l.length + 1}`, soort: "tekst", lengte: "255", verplicht: false, primair: false, standaard: "" }]);
            setTeller(teller + 1);
          }}
        >
          <Plus size={16} /> Veld toevoegen
        </button>
        <button type="submit" className="primary" disabled={bezig}>
          <Save size={16} /> Tabel maken
        </button>
      </div>
    </form>
  );
}
