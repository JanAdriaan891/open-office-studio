/** IFC: metadatakaart uit de STEP-kop en een telling in een Web Worker. */
import { useEffect, useState } from "react";
import { Box } from "lucide-react";
import { LIMIETEN, type WeergeverProps } from "../contract";
import { Geannuleerd, IFC_BOUWDELEN, analyseerIfc, type IfcMeta, type IfcStructuurdeel } from "../ifc-meta";
import { BestandKnoppen, Fout, Kaart, Laden, basisRegels, getal, useBytes } from "./gemeenschappelijk";

const RUST_MELDING = "Het 3D-voorbeeld volgt in een volgende versie (Rust-viewer).";
const SCHEMANAAM: Record<string, string> = {
  IFC2X3: "IFC 2x3",
  IFC4: "IFC 4",
  IFC4X1: "IFC 4.1",
  IFC4X2: "IFC 4.2",
  IFC4X3: "IFC 4.3",
  IFC4X3_ADD2: "IFC 4.3 ADD2",
};

type Analyse =
  | { stand: "bezig"; voortgang: number }
  | { stand: "klaar"; meta: IfcMeta }
  | { stand: "geannuleerd" }
  | { stand: "fout"; melding: string };

function naamVan(d: IfcStructuurdeel) {
  const n = d.naam || d.langeNaam || `#${d.id}`;
  return d.langeNaam && d.naam && d.langeNaam !== d.naam ? `${d.naam} – ${d.langeNaam}` : n;
}

export function IfcWeergever({ bron, acties }: WeergeverProps) {
  const geladen = useBytes(bron);
  const bytes = geladen.stand === "klaar" ? geladen.waarde : null;
  const [analyse, zetAnalyse] = useState<Analyse>({ stand: "bezig", voortgang: 0 });
  const [afbreker, zetAfbreker] = useState<AbortController | null>(null);
  const [poging, zetPoging] = useState(0);

  useEffect(() => {
    if (!bytes || bytes.length > LIMIETEN.ifcBytes) return;
    const ac = new AbortController();
    zetAfbreker(ac);
    zetAnalyse({ stand: "bezig", voortgang: 0 });
    analyseerIfc(bytes, {
      signaal: ac.signal,
      opVoortgang: (v) => !ac.signal.aborted && zetAnalyse({ stand: "bezig", voortgang: v }),
    }).then(
      (meta) => !ac.signal.aborted && zetAnalyse({ stand: "klaar", meta }),
      (e) => {
        if (e instanceof Geannuleerd) zetAnalyse({ stand: "geannuleerd" });
        else zetAnalyse({ stand: "fout", melding: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => ac.abort();
  }, [bytes, poging]);

  if (geladen.stand === "laden") return <Laden />;
  if (geladen.stand === "fout") return <Fout melding={`Het model kon niet worden geladen: ${geladen.melding}`} />;
  const grootte = geladen.waarde.length;
  const meta = analyse.stand === "klaar" ? analyse.meta : null;
  const kop = meta?.kop;
  const telling = new Map(meta?.entiteiten ?? []);
  const bouwdelen = IFC_BOUWDELEN.filter(([t]) => telling.has(t));

  let status: React.ReactNode = null;
  if (grootte > LIMIETEN.ifcBytes) status = <p className="vb-melding">Dit model is groter dan {Math.round(LIMIETEN.ifcBytes / 1024 / 1024)} MB en wordt hier niet geanalyseerd.</p>;
  else if (analyse.stand === "bezig")
    status = (
      <div className="vb-voortgang">
        <label>
          Model analyseren… {Math.round(analyse.voortgang * 100)}%
          <progress max={1} value={analyse.voortgang} />
        </label>
        <button type="button" className="vb-knop" onClick={() => afbreker?.abort()}>
          Annuleren
        </button>
      </div>
    );
  else if (analyse.stand === "geannuleerd")
    status = (
      <div className="vb-voortgang">
        <span>Analyse geannuleerd.</span>
        <button type="button" className="vb-knop" onClick={() => zetPoging((p) => p + 1)}>
          Opnieuw analyseren
        </button>
      </div>
    );
  else if (analyse.stand === "fout") status = <p className="vb-melding">De analyse is mislukt: {analyse.melding}</p>;

  return (
    <Kaart
      icoon={<Box size={26} />}
      titel={meta?.project ? naamVan(meta.project) : bron.bestandsnaam}
      ondertitel={kop?.schema.length ? `IFC-model · ${kop.schema.map((s) => SCHEMANAAM[s.toUpperCase()] ?? s).join(", ")}` : "IFC-model"}
      regels={[
        ...basisRegels(bron, grootte),
        { label: "Naam in bestand", waarde: kop?.naam },
        { label: "Tijdstip", waarde: kop?.tijdstip },
        { label: "Auteur", waarde: kop?.auteurs.filter(Boolean).join(", ") },
        { label: "Organisatie", waarde: kop?.organisaties.filter(Boolean).join(", ") },
        { label: "Toepassing", waarde: kop?.toepassing || kop?.preprocessor },
        { label: "Beschrijving", waarde: kop?.beschrijving.filter(Boolean).join("; ") },
        { label: "Terreinen", waarde: meta?.terreinen.length ? meta.terreinen.map(naamVan).join(", ") : undefined },
        { label: "Gebouwen", waarde: meta?.gebouwen.length ? meta.gebouwen.map(naamVan).join(", ") : undefined },
        { label: "Entiteiten", waarde: meta ? getal(meta.totaal) : undefined },
        { label: "Let op", waarde: meta && !meta.volledig ? "het bestand lijkt onvolledig (geen END-ISO-10303-21)" : undefined },
      ]}
      melding={RUST_MELDING}
      knoppen={<BestandKnoppen bron={bron} acties={acties} />}
    >
      {status}
      {meta && meta.verdiepingen.length > 0 && (
        <details className="vb-details" open>
          <summary>Verdiepingen ({getal(meta.verdiepingen.length)})</summary>
          <table className="vb-tabel">
            <tbody>
              {meta.verdiepingen.map((v) => (
                <tr key={v.id}>
                  <th scope="row">{naamVan(v)}</th>
                  <td>{v.hoogte !== undefined ? v.hoogte.toLocaleString("nl-NL", { maximumFractionDigits: 3 }) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {bouwdelen.length > 0 && (
        <details className="vb-details" open>
          <summary>Bouwdelen</summary>
          <table className="vb-tabel">
            <tbody>
              {bouwdelen.map(([t, naam]) => (
                <tr key={t}>
                  <th scope="row" title={t}>
                    {naam}
                  </th>
                  <td>{getal(telling.get(t)!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {meta && meta.entiteiten.length > 0 && (
        <details className="vb-details">
          <summary>Alle entiteittypen ({getal(meta.entiteiten.length)})</summary>
          <table className="vb-tabel">
            <tbody>
              {meta.entiteiten.slice(0, 200).map(([t, n]) => (
                <tr key={t}>
                  <th scope="row">{t}</th>
                  <td>{getal(n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </Kaart>
  );
}
