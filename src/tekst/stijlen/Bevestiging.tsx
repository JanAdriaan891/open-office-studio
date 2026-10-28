import { useState } from "react";
import { Dialoog } from "../../werkruimte/Dialoog";
import { stijlNaam } from "./model";
import { slaBevestigingOver, useStijlen } from "./StijlenBeheer";

export const HERLAAD_MELDING =
  "Het document wordt daarna opnieuw geladen; eerdere wijzigingen kun je dan niet meer ongedaan maken.";

/** Bevestiging voor ‘stijl bijwerken op basis van de selectie’. */
export function Bevestiging({ styleId }: { styleId: string }) {
  const staat = useStijlen();
  const [nietMeer, setNietMeer] = useState(false);
  const [bezig, setBezig] = useState(false);
  const stijl = staat.stijlen?.styles.find((s) => s.styleId === styleId);
  const naam = stijl ? stijlNaam(stijl) : styleId;
  return (
    <Dialoog
      titel={`${naam} bijwerken`}
      sluit={staat.sluit}
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={staat.sluit}>
            Annuleren
          </button>
          <button
            type="button"
            className="werkruimte-knop is-primair"
            data-autofocus
            disabled={bezig}
            onClick={() => {
              if (nietMeer) slaBevestigingOver();
              setBezig(true);
              void staat
                .werkBij(styleId)
                .then(staat.sluit)
                .catch((fout) => {
                  setBezig(false);
                  staat.fout(fout);
                });
            }}
          >
            Bijwerken
          </button>
        </>
      }
    >
      <p>
        De stijl ‘{naam}’ neemt de opmaak van de selectie over (lettertype, grootte, nadruk, kleur
        {stijl?.type === "character" ? "" : ", uitlijning, afstand en inspringing"}). Alle tekst
        met deze stijl verandert mee.
      </p>
      <p className="werkruimte-uitleg">{HERLAAD_MELDING}</p>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={nietMeer} onChange={(e) => setNietMeer(e.target.checked)} />
        Niet meer vragen tijdens deze sessie
      </label>
    </Dialoog>
  );
}
