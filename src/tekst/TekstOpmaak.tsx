/**
 * Opmaakvensters van Open Tekst (alinea, lettertype, lijsten, randen) met hun
 * lintknoppen en sneltoetsen. `tekst.tsx` hoeft alleen de provider en de
 * knoppen op te nemen.
 */
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useDocxCommand } from "@betteroffice/docx-react";
import { Pilcrow } from "lucide-react";
import { RibbonFout } from "../Ribbon";
import { useEditorApi, zichtbaarElement } from "../lint/editorApi";
import { EigenKnop } from "../lint/tekst-opdrachten";
import { useSneltoetsen, type Sneltoets } from "../lint/sneltoetsen";
import { auteurBijOpnemen, leesSelectie, werkWeergaveBij, type TekstSelectie } from "./editor";
import { pasAlineasToe, type AlineaOpmaak } from "./opmaak";
import { formulierUit, type AlineaFormulier } from "./alinea/model";
import { AlineaVenster } from "./alinea/AlineaVenster";
import { regelafstandNaarOoxml, type Regelafstand } from "./eenheden";

type Venster = { soort: "alinea"; selectie: TekstSelectie; begin: AlineaFormulier } | null;

export interface TekstOpmaakApi {
  bewerkbaar: boolean;
  open: (soort: "alinea") => void;
  /** Directe alineawijziging op de selectie (lint en sneltoetsen). */
  alinea: (wijziging: AlineaOpmaak | ((p: Record<string, unknown>) => AlineaOpmaak)) => void;
  fout: (error: unknown) => void;
}

const Context = createContext<TekstOpmaakApi | null>(null);
export function useTekstOpmaak() {
  const api = useContext(Context);
  if (!api) throw new Error("TekstOpmaakProvider ontbreekt.");
  return api;
}

function tekstVlak() {
  const tekst = zichtbaarElement<HTMLElement>(".office-tekst");
  if (!tekst) return null;
  const actief = document.activeElement;
  return actief instanceof HTMLElement && actief.classList.contains("paged-editor__yrs-input") ? actief : tekst;
}

export function TekstOpmaakProvider({ children }: { children: ReactNode }) {
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  const bewerkbaar = useDocxCommand("insertPageBreak").state.enabled;
  const opnemen = useDocxCommand("editingMode").state.value === "suggesting";
  const [venster, setVenster] = useState<Venster>(null);
  const recent = useRef({ opnemen, bewerkbaar });
  recent.current = { opnemen, bewerkbaar };

  function fout(error: unknown) {
    meld(error instanceof Error ? error.message : String(error));
  }

  function alineaToepassen(selectie: TekstSelectie, w: AlineaOpmaak | ((p: Record<string, unknown>) => AlineaOpmaak)) {
    pasAlineasToe(
      selectie.sessie,
      selectie.story,
      selectie.alineas.map((a) => a.paraId),
      typeof w === "function" ? (a) => w(a.properties) : w,
      auteurBijOpnemen(recent.current.opnemen),
    );
    werkWeergaveBij(selectie);
  }

  const opmaak = useMemo<TekstOpmaakApi>(
    () => ({
      bewerkbaar,
      fout,
      open(soort) {
        void leesSelectie(api())
          .then((selectie) => {
            if (soort === "alinea")
              setVenster({ soort, selectie, begin: formulierUit(selectie.alineas[0]?.properties ?? {}) });
          })
          .catch(fout);
      },
      alinea(w) {
        void leesSelectie(api())
          .then((selectie) => alineaToepassen(selectie, w))
          .catch(fout);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, bewerkbaar],
  );

  const regelafstand = (r: Regelafstand) => () => opmaak.alinea(regelafstandNaarOoxml(r));
  const kan = () => recent.current.bewerkbaar;
  const sneltoetsen: Sneltoets[] = [
    { toets: "Ctrl+Shift+J", uitvoeren: () => opmaak.open("alinea"), beschikbaar: kan, omschrijving: "Alinea-opmaak" },
    { toets: "Ctrl+5", uitvoeren: regelafstand({ soort: "anderhalf" }), beschikbaar: kan, omschrijving: "Regelafstand 1,5" },
  ];
  useSneltoetsen(tekstVlak, venster ? [] : sneltoetsen, "tekst");

  const sluit = () => {
    setVenster(null);
    requestAnimationFrame(() => api()?.focus());
  };

  return (
    <Context.Provider value={opmaak}>
      {children}
      {venster?.soort === "alinea" && (
        <AlineaVenster
          begin={venster.begin}
          meerdere={venster.selectie.alineas.length > 1}
          sluit={sluit}
          toepassen={(w) => {
            setVenster(null);
            try {
              alineaToepassen(venster.selectie, w);
            } catch (error) {
              fout(error);
            }
          }}
        />
      )}
    </Context.Provider>
  );
}

/** Lintknop die het alineavenster opent. */
export function AlineaKnop({ groot }: { groot?: boolean }) {
  const opmaak = useTekstOpmaak();
  return (
    <EigenKnop
      naam="Alinea…"
      icoon={Pilcrow}
      groot={groot}
      sneltoets="Ctrl+Shift+J"
      uitleg="Inspringen, afstand, regelafstand, tabs en pagina-einden"
      disabled={!opmaak.bewerkbaar}
      onClick={() => opmaak.open("alinea")}
    />
  );
}
