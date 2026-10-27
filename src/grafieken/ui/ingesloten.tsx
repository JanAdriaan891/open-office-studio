/**
 * Grafieken in Tekst (DOCX) en Presentatie (PPTX): gegevens staan in een
 * ingesloten werkboek en worden in het venster via een gegevensblad bewerkt.
 */
import { useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChartColumnBig, ListTree, Pencil } from "lucide-react";
import { Actie, Groep, RibbonFout } from "../../Ribbon";
import { useEditorApi } from "../../lint/editorApi";
import { geselecteerdeVorm, huidigeIndex } from "../../lint/presentatie-acties";
import { rasterUitModel, standaardModel } from "../model.ts";
import { GrafiekFout } from "../fouten.ts";
import {
  bewerkGrafiek,
  leesGrafiek,
  lijstGrafieken,
  tabelBijAlinea,
  verwijderGrafiek,
  voegGrafiekToeDocx,
  voegGrafiekToePptx,
  type GrafiekVerwijzing,
} from "../documenten.ts";
import { GrafiekVenster } from "./GrafiekVenster.tsx";
import { Bevestig, GrafiekenLijst } from "./Keuzevensters.tsx";

const tekst = (e: unknown) => (e instanceof Error ? e.message : String(e));
const leegAbonnement = () => () => {};

export const VOORBEELDGEGEVENS = [
  ["", "Reeks 1", "Reeks 2"],
  ["Categorie 1", "4,3", "2,4"],
  ["Categorie 2", "2,5", "4,4"],
  ["Categorie 3", "3,5", "1,8"],
  ["Categorie 4", "4,5", "2,8"],
];

/** De grafiek die in de presentatie geselecteerd is (als pad van het grafiekonderdeel). */
function geselecteerdeDiagrafiek(api: ReturnType<typeof useEditorApi>["presentatie"]) {
  if (!api) return null;
  try {
    const keuze = geselecteerdeVorm(api);
    const graphic = keuze?.vorm.graphic as { type?: string; partPath?: string } | null | undefined;
    if (keuze?.vorm.kind !== "graphicFrame" || graphic?.type !== "chart") return null;
    return `${huidigeIndex()}:${keuze.vorm.sourceId}:${graphic.partPath ?? ""}`;
  } catch {
    return null;
  }
}

export function useIngeslotenGrafieken(formaat: "docx" | "pptx") {
  const apis = useEditorApi();
  const herlaad = apis.herlaad;
  const fout = useContext(RibbonFout);
  const [venster, setVenster] = useState<ReactNode>(null);
  const dia = apis.presentatie;
  const abonneer = useCallback(
    (melden: () => void) => (formaat === "pptx" && dia ? dia.commands.subscribe(melden) : leegAbonnement()),
    [formaat, dia],
  );
  const diaSelectie = useSyncExternalStore(
    abonneer,
    () => (formaat === "pptx" ? geselecteerdeDiagrafiek(dia) : null),
  );
  const sluit = () => {
    setVenster(null);
    if (formaat === "docx") apis.tekst()?.focus();
    else dia?.focus();
  };
  function vereist() {
    if (!herlaad) throw new GrafiekFout("Het document is nog niet gereed.");
    if (formaat === "docx" && !apis.tekst()?.getDocument()) throw new GrafiekFout("Het document is nog niet gereed.");
    if (formaat === "pptx" && (!dia || !dia.commands.getState("insertSlide").enabled))
      throw new GrafiekFout("De presentatie kan nu niet worden bewerkt.");
    return herlaad;
  }
  const uitvoeren = (werk: () => Promise<void>) => {
    werk().catch((e) => fout(tekst(e)));
  };

  function invoegen() {
    uitvoeren(async () => {
      const herlaad = vereist();
      // Plek nu vastleggen: het venster neemt de focus over.
      const selectie = formaat === "docx" ? apis.tekst()?.getSelectionInfo() : null;
      const diaIndex = formaat === "pptx" ? huidigeIndex() : 0;
      setVenster(
        <GrafiekVenster
          titel="Grafiek invoegen"
          knop="Invoegen"
          begin={standaardModel()}
          gegevens={{
            soort: "blad",
            raster: VOORBEELDGEGEVENS,
            uitTabel:
              formaat === "docx" && selectie?.paraId
                ? async () => tabelBijAlinea(await herlaad.bytes(), selectie.paraId!, selectie.paragraphText)
                : undefined,
          }}
          bevestig={async ({ model }) => {
            const bytes = await herlaad.bytes();
            if (formaat === "docx") {
              const r = voegGrafiekToeDocx(bytes, model, { paraId: selectie?.paraId, alineaTekst: selectie?.paragraphText });
              setVenster(null);
              herlaad.vervang(r.bytes, { paraId: r.paraId });
            } else {
              const r = voegGrafiekToePptx(bytes, model, { dia: diaIndex });
              setVenster(null);
              herlaad.vervang(r.bytes, { dia: diaIndex });
            }
          }}
          sluit={sluit}
        />,
      );
    });
  }

  function bewerkVenster(bytes: Uint8Array, g: GrafiekVerwijzing) {
    const herlaad = vereist();
    const gelezen = leesGrafiek(bytes, g.chartPad);
    if (!gelezen.bewerkbaar) throw new GrafiekFout(gelezen.reden ?? "Deze grafiek kan hier niet worden bewerkt.");
    setVenster(
      <GrafiekVenster
        titel="Grafiek bewerken"
        knop="Bijwerken"
        begin={gelezen.model}
        waarschuwingen={gelezen.waarschuwingen}
        gegevens={{ soort: "blad", raster: rasterUitModel(gelezen.model) }}
        bevestig={async ({ model }) => {
          const actueel = await herlaad.bytes();
          const nieuw = bewerkGrafiek(actueel, formaat, g.chartPad, model);
          setVenster(null);
          herlaad.vervang(nieuw, formaat === "docx" ? { paraId: g.paraId } : { dia: g.dia });
        }}
        sluit={sluit}
      />,
    );
  }

  /** De aangewezen grafiek: de geselecteerde vorm (dia) of de alinea met de cursor (tekst). */
  function aangewezen(lijst: GrafiekVerwijzing[]) {
    if (formaat === "pptx" && dia) {
      const keuze = geselecteerdeVorm(dia);
      const graphic = keuze?.vorm.graphic as { type?: string; partPath?: string } | null | undefined;
      if (keuze && graphic?.type === "chart") {
        const index = huidigeIndex();
        return (
          lijst.find((g) => g.dia === index && g.vormId === keuze.vorm.sourceId) ??
          lijst.find((g) => g.dia === index && g.chartPad === graphic.partPath) ??
          null
        );
      }
      return null;
    }
    const paraId = apis.tekst()?.getSelectionInfo()?.paraId;
    return paraId ? (lijst.find((g) => g.paraId?.toUpperCase() === paraId.toUpperCase()) ?? null) : null;
  }

  function lijst(bytes: Uint8Array) {
    setVenster(
      <GrafiekenLijst
        grafieken={lijstGrafieken(bytes, formaat)}
        kies={(g) => uitvoeren(async () => bewerkVenster(await vereist().bytes(), g))}
        verwijder={vraagVerwijderen}
        sluit={sluit}
      />,
    );
  }

  const bewerken = () =>
    uitvoeren(async () => {
      const bytes = await vereist().bytes();
      const alle = lijstGrafieken(bytes, formaat);
      const g = aangewezen(alle) ?? (alle.length === 1 ? alle[0] : null);
      if (g) bewerkVenster(bytes, g);
      else lijst(bytes);
    });
  const alleGrafieken = () => uitvoeren(async () => lijst(await vereist().bytes()));

  function vraagVerwijderen(g: GrafiekVerwijzing) {
    setVenster(
      <Bevestig
        titel="Grafiek verwijderen"
        tekst={`‘${g.titel || g.naam}’ verwijderen? Het document wordt daarna opnieuw geladen; ongedaan maken van eerdere wijzigingen is dan niet meer mogelijk.`}
        knop="Verwijderen"
        doe={async () => {
          const herlaad = vereist();
          const bytes = await herlaad.bytes();
          const actueel = lijstGrafieken(bytes, formaat).find((x) => x.chartPad === g.chartPad && x.houderPad === g.houderPad && x.rid === g.rid);
          if (!actueel) throw new GrafiekFout("De grafiek is niet meer gevonden.");
          const nieuw = verwijderGrafiek(bytes, formaat, actueel);
          setVenster(null);
          herlaad.vervang(nieuw, formaat === "pptx" ? { dia: g.dia } : {});
        }}
        sluit={sluit}
      />,
    );
  }

  return {
    venster,
    invoegen,
    bewerken,
    alleGrafieken,
    /** Presentatie: er is een grafiekframe geselecteerd. */
    geselecteerd: !!diaSelectie,
    beschikbaar: !!herlaad,
  };
}
export type IngeslotenGrafieken = ReturnType<typeof useIngeslotenGrafieken>;

function Knop({ naam, icoon, groot, uit, doe }: { naam: string; icoon: typeof Pencil; groot?: boolean; uit?: boolean; doe: () => void }) {
  return <Actie naam={naam} icoon={icoon} groot={groot} disabled={uit} onMouseDown={(e) => e.preventDefault()} onClick={doe} />;
}

export function GrafiekGroep({ g, uit }: { g: IngeslotenGrafieken; uit?: boolean }) {
  return (
    <Groep naam="Grafieken">
      <Knop naam="Grafiek" icoon={ChartColumnBig} groot uit={uit || !g.beschikbaar} doe={g.invoegen} />
      <div className="ribbon-stapel">
        <Knop naam="Grafiek bewerken" icoon={Pencil} uit={uit || !g.beschikbaar} doe={g.bewerken} />
        <Knop naam="Alle grafieken" icoon={ListTree} uit={!g.beschikbaar} doe={g.alleGrafieken} />
      </div>
    </Groep>
  );
}

export function DiaGrafiekontwerp({ g, uit }: { g: IngeslotenGrafieken; uit?: boolean }) {
  return (
    <>
      <Groep naam="Grafiek">
        <Knop naam="Gegevens en opmaak" icoon={Pencil} groot uit={uit} doe={g.bewerken} />
      </Groep>
      <Groep naam="Overzicht">
        <Knop naam="Alle grafieken" icoon={ListTree} groot doe={g.alleGrafieken} />
      </Groep>
    </>
  );
}
