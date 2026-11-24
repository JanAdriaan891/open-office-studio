/**
 * Spellingcontrole in Open Rekenblad Studio (#21), één aanroep in de editor:
 *
 *   const spelling = useRekenbladSpelling(api, host, zichtbaar, () => bytes);
 *   <XlsxEditor plugins={[...andere, spelling.plugin]} … />
 *   {spelling.element}
 *
 * - golflijnen onder fout gespelde woorden in tekstcellen (plugin-overlay
 *   boven het raster: schuift mee met scrollen, zoom en kolombreedte);
 * - controle in de celeditor en formulebalk (gedeeld/veld.tsx), met
 *   autocorrectie (geen hoofdletter aan het celbegin, zoals Excel);
 * - rechtermuisknop op een onderstreept woord: suggesties, Alles negeren,
 *   Toevoegen, taal van de werkmap;
 * - F7: venster Spelling door de hele werkmap;
 * - taal en aantal fouten in de statusbalk.
 */
import { useEffect, useMemo, useReducer, useRef, useSyncExternalStore, type RefObject } from "react";
import {
  defineXlsxPlugin,
  type XlsxEditorApi,
  type XlsxPluginContext,
  type XlsxPluginGeometry,
} from "@betteroffice/xlsx-react";
import i18next from "../../i18n/config";
import { leesInstellingen, volgInstellingen } from "../../instellingen";
import { registreerTaalAansluiting } from "../../tekst/info/winkel";
import { genegeerd, persoonlijk } from "../woordenlijst";
import { documentTaalUitPakket, standaardDocumentTaal } from "../gedeeld/documenttaal";
import { SpellingDialoog, type DialoogBron, type DialoogTreffer } from "../gedeeld/Dialoog";
import { Keuzemenu } from "../gedeeld/Keuzemenu";
import { useVeldSpelling } from "../gedeeld/veld";
import "../tekst/spelling.css";
import "../gedeeld/gedeeld.css";
import { isTekstinvoer } from "./logica";
import { RekenbladSpelling, spellingStatus, type RekenbladTreffer } from "./sessie";

const VELDEN = '[data-testid="xlsx-cell-editor"], [data-testid="xlsx-formula-input"], .rekenblad-formule-uitgebreid';
export const REKENBLAD_SPELLING = "oos-rekenblad-spelling";

function maakPlugin(sessie: RekenbladSpelling) {
  function Laag({ geometry }: { context: XlsxPluginContext<null>; geometry: XlsxPluginGeometry }) {
    const [, ververs] = useReducer((n: number) => n + 1, 0);
    useEffect(() => sessie.volg(ververs), []);
    const golven = sessie.bereken(geometry);
    return (
      <div
        ref={(el) => {
          sessie.overlay = el;
        }}
        className="spelling-laag"
        aria-hidden="true"
        data-fouten={golven.length}
      >
        {golven.map((g) => (
          <span
            key={g.sleutel}
            className="spelling-golf"
            style={{ left: g.x, top: g.y, width: g.breedte, height: g.hoogte, backgroundSize: `${g.hoogte * 2}px ${g.hoogte}px` }}
          />
        ))}
      </div>
    );
  }
  return defineXlsxPlugin<null>({
    id: REKENBLAD_SPELLING,
    createState: () => null,
    initialize(context) {
      sessie.selectie = context.snapshot.selection;
      sessie.planTelling(300);
    },
    onEvent(_, event) {
      if (event.type === "selection-change") sessie.selectie = event.selection;
      else if (event.type === "document-change" || event.type === "load") sessie.planTelling();
    },
    overlay: Laag,
  });
}

export function useRekenbladSpelling(
  api: XlsxEditorApi | null,
  host: RefObject<HTMLElement | null>,
  zichtbaar: boolean,
  bytes: () => Uint8Array | null,
) {
  const sessie = useMemo(
    () => new RekenbladSpelling(documentTaalUitPakket(bytes(), "xlsx") ?? standaardDocumentTaal()),
    [],
  );
  const plugin = useMemo(() => maakPlugin(sessie), [sessie]);
  sessie.api = api;

  useEffect(() => {
    if (api) sessie.planTelling(300);
  }, [api, sessie]);

  // Woordenlijst of instellingen gewijzigd: opnieuw controleren.
  useEffect(() => {
    let vorige = JSON.stringify(leesInstellingen().spelling);
    const stop1 = volgInstellingen(() => {
      const nu = JSON.stringify(leesInstellingen().spelling);
      if (nu !== vorige) {
        vorige = nu;
        sessie.herbegin();
      }
    });
    const stop2 = persoonlijk.volg(() => sessie.herbegin());
    const stop3 = genegeerd.volg(() => sessie.herbegin());
    return () => {
      stop1();
      stop2();
      stop3();
      sessie.stop();
    };
  }, [sessie]);

  const openVenster = () => {
    sessie.sluitMenu();
    sessie.vensterOpen = true;
    sessie.meld();
  };

  // Rechtermuisknop op een onderstreept woord en F7.
  useEffect(() => {
    if (!zichtbaar) {
      sessie.sluitMenu();
      return;
    }
    const rechts = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !host.current?.contains(e.target)) return;
      if (e.target.closest("input, textarea")) return;
      const golf = sessie.golfOnder(e.clientX, e.clientY);
      if (!golf) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void sessie.openMenu(e.clientX, e.clientY, golf);
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key !== "F7" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const doel = e.target instanceof Element ? e.target : null;
      if (doel && doel !== document.body && !host.current?.contains(doel) && !doel.closest(".spelling-venster")) return;
      e.preventDefault();
      e.stopPropagation();
      sessie.vensterOpen = !sessie.vensterOpen;
      sessie.meld();
    };
    window.addEventListener("contextmenu", rechts, true);
    window.addEventListener("keydown", toets, true);
    return () => {
      window.removeEventListener("contextmenu", rechts, true);
      window.removeEventListener("keydown", toets, true);
    };
  }, [sessie, zichtbaar]);

  const element = zichtbaar ? <Bediening sessie={sessie} api={api} host={host} openVenster={openVenster} /> : null;
  return { plugin, element, sessie };
}

/** Menu, venster, veldcontrole en statusbalk; tekent opnieuw bij elke wijziging van de sessie. */
function Bediening({
  sessie,
  api,
  host,
  openVenster,
}: {
  sessie: RekenbladSpelling;
  api: XlsxEditorApi | null;
  host: RefObject<HTMLElement | null>;
  openVenster: () => void;
}) {
  const zichtbaar = true;
  useSyncExternalStore(sessie.volg, sessie.leesStand);
  // Statusbalk: taal en aantal fouten.
  const aansluiting = useRef<ReturnType<typeof registreerTaalAansluiting> | null>(null);
  useEffect(() => {
    if (!zichtbaar) return;
    const a = registreerTaalAansluiting({
      status: () => spellingStatus(sessie),
      taal: () => sessie.taal,
      zetTaal: (taal) => sessie.zetTaal(taal),
    });
    aansluiting.current = a;
    return () => {
      a.stop();
      aansluiting.current = null;
    };
  }, [sessie, zichtbaar]);
  useEffect(() => aansluiting.current?.meld());

  const veld = useVeldSpelling(
    {
      selector: VELDEN,
      wortel: () => host.current,
      taal: () => sessie.taal,
      isTekst: isTekstinvoer,
      beginIsZinsbegin: false,
      zonderFocus: true,
      venster: openVenster,
    },
    zichtbaar,
  );

  const bron: DialoogBron = {
    lijst: () => sessie.lijst(),
    start: () => sessie.startPositie(),
    toon: (t: DialoogTreffer) => {
      const { cel } = t as RekenbladTreffer;
      void sessie.toon(cel.blad, cel.row, cel.col);
    },
    vervang: (lijst, door) =>
      sessie.vervang(
        (lijst as RekenbladTreffer[]).map((t) => ({ ...t.cel, fout: t.fout })),
        door,
      ),
    taal: sessie.taal,
    taalLabel: i18next.t("spelling:language.workbook"),
    zetTaal: (taal) => sessie.zetTaal(taal),
    sluit: () => {
      sessie.vensterOpen = false;
      sessie.meld();
      api?.focus();
    },
  };

  const menu = sessie.menu;
  return (
    <>
      {veld}
      {menu && (
        <Keuzemenu
          x={menu.x}
          y={menu.y}
          woord={menu.golf.fout.tekst}
          suggesties={menu.suggesties}
          sluit={() => sessie.sluitMenu()}
          kies={(s) => {
            const g = menu.golf;
            void sessie
              .vervang([{ blad: g.blad, row: g.row, col: g.col, waarde: g.waarde, fout: g.fout }], s)
              .catch(() => {})
              .finally(() => api?.focus());
          }}
          negeerAlles={() => genegeerd.voegToe(menu.golf.fout.tekst)}
          voegToe={() => persoonlijk.voegToe(menu.golf.fout.tekst)}
          venster={openVenster}
          taal={{ huidig: sessie.taal, kies: (t) => sessie.zetTaal(t), kop: i18next.t("spelling:language.workbook") }}
        />
      )}
      {sessie.vensterOpen && <SpellingDialoog bron={bron} />}
    </>
  );

}
