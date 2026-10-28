/**
 * Opmaakvensters van Open Tekst (alinea, lettertype, lijsten, randen) met hun
 * lintknoppen en sneltoetsen. `tekst.tsx` hoeft alleen de provider en de
 * knoppen op te nemen.
 */
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useDocxCommand } from "@betteroffice/docx-react";
import { CaseSensitive, PaintBucket, Pilcrow, SquareDashed, Square } from "lucide-react";
import { RibbonFout } from "../Ribbon";
import { useEditorApi, zichtbaarElement } from "../lint/editorApi";
import { EigenKnop } from "../lint/tekst-opdrachten";
import { useSneltoetsen, type Sneltoets } from "../lint/sneltoetsen";
import { auteurBijOpnemen, leesSelectie, werkWeergaveBij, woordBereik, type TekstSelectie } from "./editor";
import {
  leesTekens,
  pasAlineasToe,
  pasTekensToe,
  runAttributen,
  type AlineaOpmaak,
  type GelezenTekens,
  type TekenOpmaak,
} from "./opmaak";
import { formulierUit, type AlineaFormulier } from "./alinea/model";
import { AlineaVenster } from "./alinea/AlineaVenster";
import { formulierUit as lettertypeFormulier, type LettertypeFormulier } from "./lettertype/model";
import { LettertypeVenster } from "./lettertype/LettertypeVenster";
import type { YrsStoryRange } from "@betteroffice/docx/yrs";
import { RandenVenster, type RandenBegin, type RandenTab, type RandenWijziging } from "./randen/RandenVenster";
import { arceringUit, randFormulierUit } from "./randen/model";
import { leesPaginaUitPakket, pasPaginaToe } from "./randen/pagina";
import { regelafstandNaarOoxml, type Regelafstand } from "./eenheden";

type Venster =
  | { soort: "alinea"; selectie: TekstSelectie; begin: AlineaFormulier }
  | {
      soort: "lettertype";
      selectie: TekstSelectie;
      bereik: YrsStoryRange;
      gelezen: GelezenTekens;
      begin: LettertypeFormulier;
      voorbeeld: string;
    }
  | { soort: "randen"; selectie: TekstSelectie; begin: RandenBegin; tab: RandenTab }
  | null;

export type VensterSoort = "alinea" | "lettertype" | "randen";

/** Tekens in de selectie (of het woord bij de cursor) en hun huidige opmaak. */
function tekensVan(selectie: TekstSelectie) {
  const bereik = woordBereik(selectie);
  if (!bereik) throw new Error("Selecteer eerst de tekst die je wilt opmaken.");
  const alinea = selectie.alineas[0];
  const attrs = runAttributen(selectie.sessie, selectie.story, bereik.start.paraId, bereik.start.offset);
  const gelezen = leesTekens(attrs, (alinea?.properties.defaultTextFormatting ?? {}) as Record<string, unknown>);
  const tekst =
    bereik.start.paraId === bereik.end.paraId
      ? (alinea?.text ?? "").slice(bereik.start.offset, bereik.end.offset)
      : (alinea?.text ?? "").slice(bereik.start.offset);
  return { bereik, gelezen, voorbeeld: tekst.slice(0, 40) };
}

export interface TekstOpmaakApi {
  bewerkbaar: boolean;
  open: (soort: VensterSoort, tab?: RandenTab) => void;
  /** Directe tekenwijziging op de selectie of het woord bij de cursor. */
  tekens: (wijziging: TekenOpmaak | ((t: GelezenTekens) => TekenOpmaak)) => void;
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
  const editorApi = useEditorApi();
  const api = editorApi.tekst;
  const herlaad = editorApi.herlaad ?? null;
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
      open(soort, tab) {
        void leesSelectie(api())
          .then(async (selectie) => {
            if (soort === "randen") {
              const p = selectie.alineas[0]?.properties ?? {};
              const pagina = herlaad ? leesPaginaUitPakket(await herlaad.bytes()) : { rand: null, kleur: null };
              setVenster({
                soort,
                selectie,
                tab: tab ?? "randen",
                begin: {
                  alinea: randFormulierUit(p.borders as Record<string, unknown> | undefined),
                  arcering: arceringUit(p.shading as never),
                  pagina: randFormulierUit(pagina.rand as Record<string, unknown> | null, 24),
                  paginaWeergave: pagina.rand?.display ?? "allPages",
                  paginakleur: pagina.kleur,
                },
              });
            } else if (soort === "alinea")
              setVenster({ soort, selectie, begin: formulierUit(selectie.alineas[0]?.properties ?? {}) });
            else {
              const t = tekensVan(selectie);
              setVenster({ soort, selectie, ...t, begin: lettertypeFormulier(t.gelezen) });
            }
          })
          .catch(fout);
      },
      alinea(w) {
        void leesSelectie(api())
          .then((selectie) => alineaToepassen(selectie, w))
          .catch(fout);
      },
      tekens(w) {
        void leesSelectie(api())
          .then((selectie) => {
            const t = tekensVan(selectie);
            pasTekensToe(selectie.sessie, t.bereik, typeof w === "function" ? w(t.gelezen) : w, t.gelezen.afstand);
            werkWeergaveBij(selectie);
          })
          .catch(fout);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, bewerkbaar, herlaad],
  );

  async function randenToepassen(selectie: TekstSelectie, w: RandenWijziging) {
    if (Object.keys(w.alinea).length) alineaToepassen(selectie, w.alinea);
    if (!w.pagina) return;
    if (!herlaad) throw new Error("Paginarand en paginakleur zijn hier niet beschikbaar.");
    // Pakketroute: na de engine-wijzigingen opslaan, bewerken en herladen.
    const bytes = await herlaad.bytes();
    const paraId = selectie.ref.getSelectionInfo()?.paraId ?? undefined;
    herlaad.vervang(pasPaginaToe(bytes, w.pagina), { paraId });
  }

  const regelafstand = (r: Regelafstand) => () => opmaak.alinea(regelafstandNaarOoxml(r));
  const kan = () => recent.current.bewerkbaar;
  const sneltoetsen: Sneltoets[] = [
    { toets: "Ctrl+Shift+J", uitvoeren: () => opmaak.open("alinea"), beschikbaar: kan, omschrijving: "Alinea-opmaak" },
    { toets: "Ctrl+5", uitvoeren: regelafstand({ soort: "anderhalf" }), beschikbaar: kan, omschrijving: "Regelafstand 1,5" },
    { toets: "Ctrl+Shift+F", uitvoeren: () => opmaak.open("lettertype"), beschikbaar: kan, omschrijving: "Lettertype" },
    {
      toets: "Ctrl+Shift+A",
      uitvoeren: () => opmaak.tekens((t) => ({ allCaps: !t.allCaps })),
      beschikbaar: kan,
      omschrijving: "Alle hoofdletters",
    },
    {
      toets: "Ctrl+Shift+K",
      uitvoeren: () => opmaak.tekens((t) => ({ smallCaps: !t.smallCaps })),
      beschikbaar: kan,
      omschrijving: "Kleinkapitalen",
    },
    {
      toets: "Ctrl+Shift+H",
      uitvoeren: () => opmaak.tekens((t) => ({ hidden: !t.hidden })),
      beschikbaar: kan,
      omschrijving: "Verborgen tekst",
    },
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
      {venster?.soort === "randen" && (
        <RandenVenster
          begin={venster.begin}
          tab={venster.tab}
          paginaBeschikbaar={!!herlaad}
          sluit={sluit}
          toepassen={(w) => {
            setVenster(null);
            void randenToepassen(venster.selectie, w).catch(fout);
          }}
        />
      )}
      {venster?.soort === "lettertype" && (
        <LettertypeVenster
          begin={venster.begin}
          voorbeeldTekst={venster.voorbeeld}
          sluit={sluit}
          toepassen={(w) => {
            setVenster(null);
            try {
              pasTekensToe(venster.selectie.sessie, venster.bereik, w, venster.gelezen.afstand);
              werkWeergaveBij(venster.selectie);
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

/** Lintknop die het lettertypevenster opent. */
export function LettertypeKnop({ groot }: { groot?: boolean }) {
  const opmaak = useTekstOpmaak();
  return (
    <EigenKnop
      naam="Lettertype…"
      icoon={CaseSensitive}
      groot={groot}
      sneltoets="Ctrl+Shift+F"
      uitleg="Lettertype, effecten, onderstreping en tekenafstand"
      disabled={!opmaak.bewerkbaar}
      onClick={() => opmaak.open("lettertype")}
    />
  );
}

/** Lintknop "Randen en arcering" (alinea). */
export function RandenKnop({ groot }: { groot?: boolean }) {
  const opmaak = useTekstOpmaak();
  return (
    <EigenKnop
      naam="Randen en arcering…"
      icoon={Square}
      groot={groot}
      uitleg="Randen per zijde, stijl, dikte, kleur en arcering van de alinea"
      disabled={!opmaak.bewerkbaar}
      onClick={() => opmaak.open("randen", "randen")}
    />
  );
}

/** Lintgroep "Pagina-achtergrond": paginarand en paginakleur (pakketroute). */
export function PaginaAchtergrondKnoppen() {
  const opmaak = useTekstOpmaak();
  return (
    <>
      <EigenKnop
        naam="Paginaranden"
        icoon={SquareDashed}
        groot
        uitleg="Rand rond de pagina; het document wordt daarna opnieuw geladen"
        disabled={!opmaak.bewerkbaar}
        onClick={() => opmaak.open("randen", "pagina")}
      />
      <EigenKnop
        naam="Paginakleur"
        icoon={PaintBucket}
        groot
        uitleg="Achtergrondkleur van de pagina's; het document wordt daarna opnieuw geladen"
        disabled={!opmaak.bewerkbaar}
        onClick={() => opmaak.open("randen", "pagina")}
      />
    </>
  );
}
