/**
 * Opties voor PDF uit de app zelf (zonder conversieprogramma) in Opslaan als:
 * maker (app of kantoorruntime), paginabereik, beeldkwaliteit en per module
 * wat er in de PDF komt. Dezelfde pagina's als het afdrukvoorbeeld.
 */
import type { Soort } from "../editors";

export interface AppPdfKeuze {
  kwaliteit: "klein" | "standaard" | "hoog";
  /** Rekenblad: actief blad of hele werkmap. */
  omvang: "blad" | "werkmap";
  /** Presentatie: dia's, notitiepagina's of hand-outs (6 per pagina). */
  indeling: "dias" | "notities" | "handout";
}

export const standaardAppPdf = (): AppPdfKeuze => ({
  kwaliteit: "standaard",
  omvang: "werkmap",
  indeling: "dias",
});

export function PdfOpties(props: {
  soort: Soort;
  runtime: boolean;
  viaRuntime: boolean;
  setViaRuntime: (waar: boolean) => void;
  keuze: AppPdfKeuze;
  wijzig: (keuze: AppPdfKeuze) => void;
  bereik: string;
  setBereik: (bereik: string) => void;
  bereikGeldig: boolean;
}) {
  const { keuze, wijzig } = props;
  return (
    <div className="opslaanals-opties">
      {props.runtime && (
        <label className="opslaanals-vink">
          <input
            type="checkbox"
            checked={props.viaRuntime}
            onChange={(e) => props.setViaRuntime(e.target.checked)}
          />
          Via de kantoorruntime (PDF/A, koppen als bladwijzers)
        </label>
      )}
      {!props.viaRuntime && (
        <>
          <label>
            {props.soort === "pptx" ? "Pagina’s (na indeling)" : "Pagina’s"}
            <input
              type="text"
              placeholder="alle, of bijv. 1-3,5"
              value={props.bereik}
              aria-invalid={!props.bereikGeldig}
              onChange={(e) => props.setBereik(e.target.value)}
            />
          </label>
          <label>
            Beeldkwaliteit
            <select
              value={keuze.kwaliteit}
              onChange={(e) =>
                wijzig({ ...keuze, kwaliteit: e.target.value as AppPdfKeuze["kwaliteit"] })
              }
            >
              <option value="klein">Klein bestand (150 dpi)</option>
              <option value="standaard">Standaard (200 dpi)</option>
              <option value="hoog">Hoog, verliesvrij (300 dpi)</option>
            </select>
          </label>
          {props.soort === "xlsx" && (
            <label>
              Inhoud
              <select
                value={keuze.omvang}
                onChange={(e) => wijzig({ ...keuze, omvang: e.target.value as AppPdfKeuze["omvang"] })}
              >
                <option value="werkmap">Hele werkmap</option>
                <option value="blad">Actief blad</option>
              </select>
            </label>
          )}
          {props.soort === "pptx" && (
            <label>
              Inhoud
              <select
                value={keuze.indeling}
                onChange={(e) =>
                  wijzig({ ...keuze, indeling: e.target.value as AppPdfKeuze["indeling"] })
                }
              >
                <option value="dias">Dia’s</option>
                <option value="notities">Notitiepagina’s</option>
                <option value="handout">Hand-outs (6 per pagina)</option>
              </select>
            </label>
          )}
        </>
      )}
    </div>
  );
}
