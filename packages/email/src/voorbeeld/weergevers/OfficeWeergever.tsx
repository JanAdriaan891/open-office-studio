/** Office-documenten: kaart met "Openen in …" (koppeling via `openInModule`). */
import { useState } from "react";
import { Database, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import type { Kantoorsoort, WeergeverProps } from "../contract";
import { BestandKnoppen, Kaart, basisRegels } from "./gemeenschappelijk";

export const KANTOORMODULE: Record<Kantoorsoort, string> = {
  tekst: "Tekst",
  rekenblad: "Rekenblad",
  presentatie: "Presentatie",
  database: "Database",
};

const ICOON: Record<Kantoorsoort, typeof FileText> = {
  tekst: FileText,
  rekenblad: FileSpreadsheet,
  presentatie: Presentation,
  database: Database,
};

const OMSCHRIJVING: Record<Kantoorsoort, string> = {
  tekst: "Tekstdocument",
  rekenblad: "Rekenblad",
  presentatie: "Presentatie",
  database: "Database",
};

export function OfficeWeergever({ bron, herkenning, acties }: WeergeverProps) {
  const k = herkenning.kantoor;
  const Icoon = k ? ICOON[k] : FileText;
  const [bezig, zetBezig] = useState(false);
  const [fout, zetFout] = useState<string | null>(null);

  const openen = async () => {
    if (!k || !acties.openInModule) return;
    zetBezig(true);
    zetFout(null);
    try {
      await acties.openInModule(k, bron.bestandsnaam, await bron.bytes());
    } catch (e) {
      zetFout(e instanceof Error ? e.message : String(e));
    } finally {
      zetBezig(false);
    }
  };

  return (
    <Kaart
      icoon={<Icoon size={26} />}
      titel={bron.bestandsnaam}
      ondertitel={k ? OMSCHRIJVING[k] : "Office-document"}
      regels={[...basisRegels(bron), { label: "Type", waarde: herkenning.extensie ? herkenning.extensie.toUpperCase() : bron.inhoudstype }]}
      melding={
        fout
          ? `Openen mislukt: ${fout}`
          : k
            ? `Open een bewerkbare kopie in ${KANTOORMODULE[k]}. Het origineel in de e-mail blijft ongewijzigd.`
            : "Dit Office-formaat kan hier niet worden geopend."
      }
      knoppen={
        <>
          {k && acties.openInModule && (
            <button type="button" className="vb-knop is-primair" onClick={() => void openen()} disabled={bezig}>
              <Icoon size={15} aria-hidden /> {bezig ? "Openen…" : `Openen in ${KANTOORMODULE[k]}`}
            </button>
          )}
          <BestandKnoppen bron={bron} acties={acties} />
        </>
      }
    />
  );
}
