/**
 * Document inspecteren: toont verborgen tekst, opmerkingen, bijgehouden
 * wijzigingen en persoonlijke gegevens en verwijdert desgewenst (pakketroute
 * en herladen; ongedaan maken van eerdere wijzigingen vervalt).
 */
import { useEffect, useState } from "react";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Herladen } from "../../lint/editorApi";
import { Dialoog } from "../../werkruimte/Dialoog";
import { inspecteer, schoonOp, type InspectieUitslag, type Opschonen } from "./inspectie";
import { zetEigenschappen } from "./opslaan";

export function InspectieVenster({
  api,
  herlaad,
  sluit,
  naHerladen = sluit,
}: {
  api: () => DocxEditorRef | null;
  herlaad: Herladen | null;
  sluit: () => void;
  /** Na verwijderen (het document is opnieuw geladen). */
  naHerladen?: () => void;
}) {
  const [uitslag, setUitslag] = useState<InspectieUitslag | null>(null);
  const [keuze, setKeuze] = useState<Opschonen>({});
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    let actief = true;
    void (async () => {
      try {
        if (!herlaad) throw new Error("Inspecteren is hier niet beschikbaar.");
        const u = inspecteer(await herlaad.bytes());
        if (actief) setUitslag(u);
      } catch (error) {
        if (actief) setFout(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  const p = uitslag?.eigenschappen;
  const persoonlijk = uitslag ? uitslag.personen.length + (p?.bedrijf ? 1 : 0) : 0;
  const rijen: { sleutel: keyof Opschonen; naam: string; aantal: number; uitleg: string; leeg: string }[] = uitslag
    ? [
        { sleutel: "verborgenTekst", naam: "Verborgen tekst", aantal: uitslag.verborgenTekst, uitleg: `${uitslag.verborgenTekst} stuk(ken) tekst met de opmaak ‘verborgen’.`, leeg: "Geen verborgen tekst gevonden." },
        { sleutel: "opmerkingen", naam: "Opmerkingen", aantal: uitslag.opmerkingen, uitleg: `${uitslag.opmerkingen} opmerking(en).`, leeg: "Geen opmerkingen gevonden." },
        { sleutel: "revisies", naam: "Bijgehouden wijzigingen", aantal: uitslag.revisies, uitleg: `${uitslag.revisies} wijziging(en); verwijderen accepteert ze allemaal.`, leeg: "Geen bijgehouden wijzigingen gevonden." },
        {
          sleutel: "persoonlijk",
          naam: "Persoonlijke gegevens",
          aantal: persoonlijk,
          uitleg: [
            uitslag.personen.length ? `Namen: ${uitslag.personen.join(", ")}.` : "",
            p?.bedrijf ? `Organisatie: ${p.bedrijf}.` : "",
            "Verwijderen wist auteur, laatst gewijzigd door, organisatie en vervangt namen bij opmerkingen en wijzigingen door ‘Auteur’.",
          ]
            .filter(Boolean)
            .join(" "),
          leeg: "Geen namen of organisatie gevonden.",
        },
      ]
    : [];
  const iets = Object.values(keuze).some(Boolean);

  async function verwijderen() {
    if (!herlaad || !iets) return;
    setBezig(true);
    try {
      const ref = api();
      await ref?.flushPendingInput();
      const nieuw = schoonOp(await herlaad.bytes(), keuze);
      // Een wachtende auteur uit Bestand › Info zou de naam bij opslaan terugzetten.
      if (keuze.persoonlijk) zetEigenschappen(herlaad, { auteur: "" });
      herlaad.vervang(nieuw, { paraId: ref?.getSelectionInfo()?.paraId ?? undefined });
      naHerladen();
    } catch (error) {
      setBezig(false);
      setFout(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Dialoog
      titel="Document inspecteren"
      sluit={sluit}
      className="tekst-info"
      acties={
        <>
          {fout && <span className="werkruimte-melding werkruimte-fout" role="alert">{fout}</span>}
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            Sluiten
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={!iets || bezig} onClick={() => void verwijderen()}>
            Geselecteerde verwijderen
          </button>
        </>
      }
    >
      {!uitslag ? (
        !fout && <p className="werkruimte-uitleg">Het document wordt geïnspecteerd…</p>
      ) : (
        <>
          <ul className="tekst-inspectie">
            {rijen.map((r) => (
              <li key={r.sleutel}>
                <label className="werkruimte-vink">
                  <input
                    type="checkbox"
                    disabled={!r.aantal}
                    checked={!!keuze[r.sleutel]}
                    onChange={(e) => setKeuze({ ...keuze, [r.sleutel]: e.target.checked })}
                  />
                  <strong>{r.naam}</strong>
                  <span className={`tekst-inspectie-telling ${r.aantal ? "is-gevonden" : ""}`}>{r.aantal ? "gevonden" : "niets"}</span>
                </label>
                <p className="werkruimte-uitleg">{r.aantal ? r.uitleg : r.leeg}</p>
              </li>
            ))}
          </ul>
          <p className="werkruimte-uitleg">
            Het document wordt daarna opnieuw geladen; eerdere wijzigingen kun je dan niet meer ongedaan maken. Sla daarna op om
            het bestand zelf te wijzigen.
          </p>
        </>
      )}
    </Dialoog>
  );
}
