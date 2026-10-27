/** Onbekende of niet te tonen bestanden: type, grootte en Opslaan. */
import { FileQuestion } from "lucide-react";
import type { WeergeverProps } from "../contract";
import { BestandKnoppen, Kaart, basisRegels } from "./gemeenschappelijk";

export function OnbekendWeergever({ bron, herkenning, acties }: WeergeverProps) {
  return (
    <Kaart
      icoon={<FileQuestion size={26} />}
      titel={bron.bestandsnaam}
      ondertitel="Geen voorbeeld beschikbaar"
      regels={[
        ...basisRegels(bron),
        { label: "Opgegeven type", waarde: bron.inhoudstype || "onbekend" },
        { label: "Extensie", waarde: herkenning.extensie ? `.${herkenning.extensie}` : "geen" },
      ]}
      melding="Van dit bestandstype kan geen voorbeeld worden getoond. Sla het op en open het alleen als je de afzender vertrouwt."
      // Bewust geen "Openen met standaardprogramma": onbekende bestanden kunnen uitvoerbaar zijn.
      knoppen={<BestandKnoppen bron={bron} acties={acties} extern={false} />}
    />
  );
}
