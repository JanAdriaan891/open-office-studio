/**
 * Spellingcontrole in Open Presentatie Studio (#21):
 *
 *   const spelling = usePresentatieSpelling(api, zichtbaar, () => bytes);
 *   <PptxEditor plugins={[...andere, spelling.plugin]} … />
 *   {spelling.element}
 *
 * - golflijnen in tekstvakken en tijdens het bewerken (plugin-overlay; de
 *   posities komen uit de dia-indeling van de engine);
 * - rechtermuisknop op een onderstreept woord: suggesties, Alles negeren,
 *   Toevoegen, taal van de presentatie;
 * - F7: venster Spelling door alle dia's en notities;
 * - autocorrectie bij het typen op de dia (het notitieveld: alleen controle);
 * - taal en aantal fouten in de statusbalk.
 */
import { useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from "react";
import { definePptxPlugin, type PptxEditorApi, type PptxPluginContext, type PptxPluginGeometry } from "@betteroffice/pptx-react";
import i18next from "../../i18n/config";
import { leesInstellingen, volgInstellingen } from "../../instellingen";
import { registreerTaalAansluiting } from "../../tekst/info/winkel";
import { zichtbaarElement } from "../../lint/editorApi";
import { autocorrectie, SCHEIDING } from "../autocorrectie";
import { genegeerd, persoonlijk } from "../woordenlijst";
import { documentTaalUitPakket, standaardDocumentTaal } from "../gedeeld/documenttaal";
import { SpellingDialoog, type DialoogBron } from "../gedeeld/Dialoog";
import { Keuzemenu } from "../gedeeld/Keuzemenu";
import { useVeldSpelling } from "../gedeeld/veld";
import { spellingStatus } from "../rekenblad/sessie";
import "../tekst/spelling.css";
import "../gedeeld/gedeeld.css";
import { PresentatieSpelling, type PresentatieTreffer } from "./sessie";

export const PRESENTATIE_SPELLING = "oos-presentatie-spelling";
const HOST = ".office-presentatie";

function maakPlugin(sessie: PresentatieSpelling) {
  function Laag({ geometry }: { context: PptxPluginContext<null>; geometry: PptxPluginGeometry }) {
    const [, ververs] = useReducer((n: number) => n + 1, 0);
    useEffect(() => sessie.volg(ververs), []);
    const golven = sessie.bereken(geometry);
    return (
      <div className="spelling-laag" aria-hidden="true" data-fouten={golven.length}>
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
  return definePptxPlugin<null>({
    id: PRESENTATIE_SPELLING,
    createState: () => null,
    initialize(context) {
      sessie.selectie = context.snapshot.selection;
      sessie.planTelling(300);
    },
    onEvent(_, event) {
      if (event.type === "selection-change") {
        sessie.selectie = event.selection;
        sessie.meld();
      } else if (event.type === "document-change" || event.type === "load") sessie.planTelling();
    },
    overlay: Laag,
  });
}

export function usePresentatieSpelling(api: PptxEditorApi | null, zichtbaar: boolean, bytes: () => Uint8Array | null) {
  const sessie = useMemo(
    () => new PresentatieSpelling(documentTaalUitPakket(bytes(), "pptx") ?? standaardDocumentTaal()),
    [],
  );
  const plugin = useMemo(() => maakPlugin(sessie), [sessie]);
  sessie.api = api;

  useEffect(() => {
    if (api) sessie.planTelling(300);
  }, [api, sessie]);

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

  // Rechtermuisknop, F7 en autocorrectie op de dia.
  useEffect(() => {
    if (!zichtbaar) {
      sessie.sluitMenu();
      return;
    }
    const host = () => zichtbaarElement<HTMLElement>(HOST);
    const inDia = (doel: EventTarget | null) =>
      doel instanceof Element && !!host()?.contains(doel) && !doel.closest("input, textarea, select");
    const rechts = (e: MouseEvent) => {
      if (!inDia(e.target)) return;
      const doel = sessie.foutOnder(e.clientX, e.clientY);
      if (!doel) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void sessie.openMenu(e.clientX, e.clientY, doel.verhaal, doel.fout);
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key === "F7" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        const doel = e.target instanceof Element ? e.target : null;
        if (doel && doel !== document.body && !host()?.contains(doel) && !doel.closest(".spelling-venster")) return;
        e.preventDefault();
        e.stopPropagation();
        sessie.vensterOpen = !sessie.vensterOpen;
        sessie.meld();
        return;
      }
      if (!inDia(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.key.length !== 1) return;
      if (!SCHEIDING.test(e.key) || !leesInstellingen().spelling.autocorrectie) return;
      const s = sessie.selectie;
      if (!s || s.target.kind !== "text" || s.target.anchor !== s.target.focus) return;
      const { storyId, shapeId, focus } = s.target;
      const slideId = s.slideId;
      const teken = e.key;
      // Na de verwerking van het teken door de engine.
      window.setTimeout(() => void autocorrigeer(storyId, shapeId, slideId, focus + 1, teken), 0);
    };
    const autocorrigeer = async (storyId: string, shapeId: string, slideId: string, cursor: number, teken: string) => {
      const api = sessie.api;
      if (!api) return;
      await api.flushPendingInput();
      const tekst = sessie.verhalen().find((v) => v.storyId === storyId)?.tekst;
      if (!tekst || tekst[cursor - 1] !== teken) return;
      const c = autocorrectie(tekst, cursor, {
        taal: sessie.taal,
        uitzondering: (w) => persoonlijk.bevat(w) || genegeerd.bevat(w),
      });
      if (!c) return;
      await api.applyEdits({
        expectVersion: await api.version(),
        history: "separate",
        steps: [
          {
            op: "replaceText",
            target: { kind: "range", slideId, shapeId, storyId, start: c.start, end: c.eind },
            text: c.nieuw,
            expect: { text: c.oud },
          },
        ],
      });
    };
    window.addEventListener("contextmenu", rechts, true);
    window.addEventListener("keydown", toets, true);
    return () => {
      window.removeEventListener("contextmenu", rechts, true);
      window.removeEventListener("keydown", toets, true);
    };
  }, [sessie, zichtbaar]);

  const element = zichtbaar ? <Bediening sessie={sessie} api={api} openVenster={openVenster} /> : null;
  return { plugin, element, sessie };
}

function Bediening({
  sessie,
  api,
  openVenster,
}: {
  sessie: PresentatieSpelling;
  api: PptxEditorApi | null;
  openVenster: () => void;
}) {
  useSyncExternalStore(sessie.volg, sessie.leesStand);
  const aansluiting = useRef<ReturnType<typeof registreerTaalAansluiting> | null>(null);
  useEffect(() => {
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
  }, [sessie]);
  useEffect(() => aansluiting.current?.meld());

  // Het notitieveld onder de dia.
  const veld = useVeldSpelling(
    {
      selector: '[data-testid="pptx-notes-textarea"]',
      wortel: () => zichtbaarElement<HTMLElement>(HOST),
      taal: () => sessie.taal,
      autocorrectie: false,
      venster: openVenster,
    },
    true,
  );

  const bron: DialoogBron = {
    lijst: () => sessie.lijst(),
    start: () => sessie.startPositie(),
    toon: (t) => {
      const p = t as PresentatieTreffer;
      sessie.toon(p.verhaal, p.fout);
    },
    vervang: (lijst, door) => sessie.vervang(lijst as PresentatieTreffer[], door),
    taal: sessie.taal,
    taalLabel: i18next.t("spelling:language.presentation"),
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
          woord={menu.fout.tekst}
          suggesties={menu.suggesties}
          sluit={() => sessie.sluitMenu()}
          kies={(s) => {
            void sessie
              .vervang([{ verhaal: menu.verhaal, fout: menu.fout }], s)
              .catch(() => {})
              .finally(() => api?.focus());
          }}
          negeerAlles={() => genegeerd.voegToe(menu.fout.tekst)}
          voegToe={() => persoonlijk.voegToe(menu.fout.tekst)}
          venster={openVenster}
          taal={{ huidig: sessie.taal, kies: (t) => sessie.zetTaal(t), kop: i18next.t("spelling:language.presentation") }}
        />
      )}
      {sessie.vensterOpen && <SpellingDialoog bron={bron} />}
    </>
  );
}
