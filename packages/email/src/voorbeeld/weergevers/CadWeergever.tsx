/** DWG en DXF: metadatakaart; de tekening zelf volgt via de Rust-viewer. */
import { useMemo } from "react";
import { DraftingCompass } from "lucide-react";
import { LIMIETEN, type WeergeverProps } from "../contract";
import { leesDwgMeta, leesDxfMeta } from "../cad-meta";
import { BestandKnoppen, Fout, Kaart, Laden, basisRegels, getal, useBlobUrl, useBytes } from "./gemeenschappelijk";

const RUST_MELDING = "Voorbeeld volgt in een volgende versie (Rust-viewer).";
const MAX_LAGEN = 40;

export function CadWeergever({ bron, soort, acties }: WeergeverProps) {
  const geladen = useBytes(bron);
  const bytes = geladen.stand === "klaar" ? geladen.waarde : null;
  const dwg = useMemo(() => (bytes && soort === "dwg" ? leesDwgMeta(bytes) : null), [bytes, soort]);
  const dxf = useMemo(() => {
    if (!bytes || soort !== "dxf" || bytes.length > LIMIETEN.dxfBytes) return null;
    try {
      return leesDxfMeta(bytes);
    } catch {
      return null;
    }
  }, [bytes, soort]);
  const miniatuur = useBlobUrl(dwg?.miniatuur?.bytes, dwg?.miniatuur?.type ?? "image/png");

  if (geladen.stand === "laden") return <Laden />;
  if (geladen.stand === "fout") return <Fout melding={`De tekening kon niet worden geladen: ${geladen.melding}`} />;
  const grootte = geladen.waarde.length;

  if (soort === "dwg") {
    return (
      <Kaart
        icoon={<DraftingCompass size={26} />}
        titel={bron.bestandsnaam}
        ondertitel="AutoCAD-tekening (DWG)"
        regels={[
          ...basisRegels(bron, grootte),
          { label: "Formaat", waarde: dwg?.code ? `${dwg.code}${dwg.versie ? ` (${dwg.versie.release})` : ""}` : "onbekend" },
          { label: "Opgeslagen als", waarde: dwg?.versie?.autocad ?? (dwg?.code ? "onbekende AutoCAD-versie" : undefined) },
        ]}
        melding={RUST_MELDING}
        knoppen={<BestandKnoppen bron={bron} acties={acties} />}
      >
        {miniatuur && (
          <figure className="vb-miniatuur">
            <img src={miniatuur} alt="Ingebed miniatuurvoorbeeld van de tekening" />
            <figcaption>Miniatuur uit het bestand</figcaption>
          </figure>
        )}
      </Kaart>
    );
  }

  const lagen = dxf?.lagen ?? [];
  return (
    <Kaart
      icoon={<DraftingCompass size={26} />}
      titel={bron.bestandsnaam}
      ondertitel={dxf?.binair ? "Binaire DXF-tekening" : "DXF-tekening"}
      regels={[
        ...basisRegels(bron, grootte),
        { label: "Formaat", waarde: dxf?.acadver ? `${dxf.acadver}${dxf.versie ? ` (${dxf.versie.autocad})` : ""}` : undefined },
        { label: "Eenheden", waarde: dxf?.eenheid },
        { label: "Entiteiten", waarde: dxf && !dxf.binair ? getal(dxf.totaalEntiteiten) : undefined },
        { label: "Blokken", waarde: dxf?.blokken ? getal(dxf.blokken) : undefined },
        { label: "Lagen", waarde: lagen.length ? getal(lagen.length) : undefined },
      ]}
      melding={
        !dxf && grootte > LIMIETEN.dxfBytes
          ? `Dit bestand is te groot om hier te ontleden. ${RUST_MELDING}`
          : RUST_MELDING
      }
      knoppen={<BestandKnoppen bron={bron} acties={acties} />}
    >
      {dxf && dxf.entiteiten.length > 0 && (
        <details className="vb-details" open>
          <summary>Entiteiten per type</summary>
          <table className="vb-tabel">
            <tbody>
              {dxf.entiteiten.slice(0, 30).map(([type, n]) => (
                <tr key={type}>
                  <th scope="row">{type}</th>
                  <td>{getal(n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {lagen.length > 0 && (
        <details className="vb-details">
          <summary>Lagen ({getal(lagen.length)})</summary>
          <ul className="vb-lijst">
            {lagen.slice(0, MAX_LAGEN).map((l) => (
              <li key={l}>{l}</li>
            ))}
            {lagen.length > MAX_LAGEN && <li>… en nog {getal(lagen.length - MAX_LAGEN)}</li>}
          </ul>
        </details>
      )}
    </Kaart>
  );
}
