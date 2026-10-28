/**
 * Taal (klik op de taal in de statusbalk): stelt de taal van het document in
 * (w:docDefaults in styles.xml, pakketroute). Als de spellingcontrole
 * (pakket W5) een eigen taalvenster registreert, opent dat in plaats hiervan.
 */
import { useState } from "react";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Herladen } from "../../lint/editorApi";
import { Dialoog } from "../../werkruimte/Dialoog";
import { herlaadMetStijlen } from "../stijlen/pakket";
import { wijzigDocStandaarden } from "../stijlen/stijlenxml";
import { TALEN, taalNaam } from "./taal";

export function TaalVenster({
  huidig,
  api,
  herlaad,
  sluit,
}: {
  huidig: string | null;
  api: () => DocxEditorRef | null;
  herlaad: Herladen | null;
  sluit: () => void;
}) {
  const lijst = huidig && !TALEN.includes(huidig as (typeof TALEN)[number]) ? [huidig, ...TALEN] : [...TALEN];
  const [keuze, setKeuze] = useState(huidig ?? "nl-NL");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  async function toepassen() {
    if (!herlaad) return;
    setBezig(true);
    try {
      const ref = api();
      await ref?.flushPendingInput();
      await herlaadMetStijlen(
        herlaad,
        (o) => ({ stijlen: wijzigDocStandaarden(o.stijlen, { taal: keuze }) }),
        { paraId: ref?.getSelectionInfo()?.paraId ?? undefined },
      );
      sluit();
    } catch (error) {
      setBezig(false);
      setFout(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Dialoog
      titel="Taal"
      sluit={sluit}
      acties={
        <>
          {fout && <span className="werkruimte-melding werkruimte-fout" role="alert">{fout}</span>}
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            Annuleren
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={bezig || !herlaad || keuze === huidig} onClick={() => void toepassen()}>
            Als documenttaal instellen
          </button>
        </>
      }
    >
      <p>Huidige taal bij de cursor: <strong>{huidig ? taalNaam(huidig) : "niet opgegeven"}</strong></p>
      <div className="tekst-talen" role="radiogroup" aria-label="Taal">
        {lijst.map((code) => (
          <label key={code} className="werkruimte-vink">
            <input type="radio" name="tekst-taal" checked={keuze === code} onChange={() => setKeuze(code)} />
            {taalNaam(code)} <small>{code}</small>
          </label>
        ))}
      </div>
      <p className="werkruimte-uitleg">
        De documenttaal geldt voor alle tekst zonder eigen taal (de standaard van het document). Tekst waaraan een andere
        taal is toegekend, houdt die. Het document wordt daarna opnieuw geladen; eerdere wijzigingen kun je dan niet meer
        ongedaan maken.
      </p>
    </Dialoog>
  );
}
