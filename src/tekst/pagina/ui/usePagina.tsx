/**
 * Opdrachten voor paginanummers, kop- en voettekst, pagina-indeling,
 * kolommen, inhoudsopgave en noten. Waar de engine een opdracht heeft
 * (sectie-einde even/oneven) gaat het via de engine; de rest via de
 * pakketroute: document opslaan, OOXML bewerken en de editor herladen.
 */
import { useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDocxCommand, useDocxCommands, type DocxEditorRef } from "@betteroffice/docx-react";
import { X } from "lucide-react";
import { RibbonFout } from "../../../Ribbon";
import { useEditorApi, zichtbaarElement } from "../../../lint/editorApi";
import { useSneltoetsen } from "../../../lint/sneltoetsen";
import { metPakket, verwijderMarkering } from "../ooxml.ts";
import {
  FORMATEN,
  MARGES,
  leesSecties,
  sectieVanMarkering,
  tekstbreedteVan,
  voegKolomeindeIn,
  voegSectieEindeIn,
  wijzigSecties,
  zetKolomVoorkeur,
  type Afdrukstand,
  type Formaat,
  type KolomVoorkeur,
  type Kolommen,
  type MargeVoorkeur,
  type SectieDoel,
} from "../secties.ts";
import {
  koppelAanVorige,
  leesKopVoet,
  verwijderKopVoet,
  verwijderPaginanummers,
  voegPaginanummerIn,
  voegVeldInBijMarkering,
  zetEerstePaginaAnders,
  zetEvenOnevenAnders,
  zetKopVoetAfstand,
  zorgVoorKopVoet,
  type KopVoetSoort,
  type PaginanummerOpties,
} from "../kopvoet.ts";
import { STANDAARD_INHOUD, leesInhoudsopgave, verwijderInhoudsopgave, voegInhoudsopgaveIn, werkInhoudsopgaveBij, type InhoudOpties } from "../inhoudsopgave.ts";
import { leesNootInstellingen, voegNootIn, zetNootInstellingen, type NootSoort } from "../noten.ts";
import { bewerkKopVoet, haalKoppen, haalNoten, herstelPlek, kopVoetActief, leesPlek, sectieStand, sluitKopVoet, wachtOpIndeling, zetMarkering, type NootInfo } from "./engine.ts";
import { leesMelding, herladenBevestigd, neemBeurt, neemTaak, onthoudBevestiging, planNaHerladen, sluitMelding, toonMelding, volgMelding, type NaHerladen } from "./staat.ts";
import {
  AfstandDialoog,
  BevestigHerladen,
  BijwerkenDialoog,
  InhoudDialoog,
  KolommenDialoog,
  NootDialoog,
  NootInstellingenDialoog,
  NotenLijst,
  PaginanummerDialoog,
} from "./Dialogen.tsx";
import "./pagina.css";

const tekst = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Pakketopdracht {
  /** Voor meldingen, bijvoorbeeld "Paginanummers ingevoegd". */
  klaar: string;
  /** Een markering op de cursor: nodig, of alleen om de huidige sectie te kennen. */
  cursor?: "nodig" | "sectie";
  werk: (bytes: Uint8Array, plek: { markering: string | null; sectie: number }) => Uint8Array | null;
  /** Na herladen en indelen (bijvoorbeeld paginanummers van de inhoudsopgave nalopen). */
  na?: NaHerladen;
  /** Als `werk` niets hoefde te veranderen (null): in plaats van alleen de focus terug. */
  ongewijzigd?: (editor: DocxEditorRef) => void;
}

/** Het lint wordt bij herladen opnieuw gemount en springt dan naar Start; onthoud het tabblad. */
const actiefLintTab = () =>
  // Niet via zichtbaarElement: met een open venster is het lint `inert`.
  [...document.querySelectorAll<HTMLElement>(".office-tekst [role='tab'][aria-selected='true']")].find((t) => !t.closest("[hidden]"))?.textContent ?? null;
function herstelLintTab(naam: string | null) {
  if (!naam) return;
  const tabs = [...document.querySelectorAll<HTMLElement>(".office-tekst [role='tab']")].filter((t) => !t.closest("[inert], [hidden]"));
  const tab = tabs.find((t) => t.textContent === naam);
  if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
}

/** Wacht na herladen tot het lint en de nieuwe editor gereed zijn en voert de geplande taak uit. */
function useNaHerladen() {
  const apis = useEditorApi();
  const fout = useContext(RibbonFout);
  const recent = useRef({ apis, fout });
  recent.current = { apis, fout };
  // Alleen bij het mounten: het lint wordt bij herladen opnieuw gemount.
  useEffect(() => {
    let gestopt = false;
    const probeer = (n: number) => {
      if (gestopt) return;
      const { apis, fout } = recent.current;
      const herlaad = apis.herlaad;
      const gepland = herlaad ? neemTaak(herlaad) : undefined;
      if (!herlaad || !gepland) return;
      const api = apis.tekst();
      if (api && api !== gepland.oud && api.getDocument()) {
        // Ook uitvoeren als dit lint intussen opnieuw gemount is: de taak werkt op de editor zelf.
        void wachtOpIndeling(api)
          .then(() => gepland.taak(api))
          .catch((e) => fout(tekst(e)));
        return;
      }
      // Nog niet gereed: terugleggen en straks opnieuw.
      planNaHerladen(herlaad, gepland.taak, gepland.oud);
      if (n > 0) setTimeout(() => probeer(n - 1), 200);
    };
    probeer(150);
    return () => {
      gestopt = true;
    };
  }, []);
}

/** De korte melding onderaan (overleeft het herladen van het lint). */
function Melding() {
  const m = useSyncExternalStore(volgMelding, leesMelding, leesMelding);
  if (!m) return null;
  return createPortal(
    <div className={`pagina-melding ${m.soort === "fout" ? "is-fout" : ""}`} role={m.soort === "fout" ? "alert" : "status"}>
      <span>{m.tekst}</span>
      <button type="button" aria-label="Melding sluiten" onClick={sluitMelding}>
        <X size={14} />
      </button>
    </div>,
    document.body,
  );
}

export function usePagina() {
  const apis = useEditorApi();
  const opdrachten = useDocxCommands();
  const fout = useContext(RibbonFout);
  const bewerkbaar = useDocxCommand("insertPageBreak").state.enabled;
  const [venster, setVenster] = useState<ReactNode>(null);
  const [kopVoet, setKopVoet] = useState(false);
  useNaHerladen();

  // Volg of de engine in de bewerkmodus voor kop/voettekst staat.
  useEffect(() => {
    const vlak = zichtbaarElement<HTMLElement>(".office-tekst") ?? document.body;
    const kijk = () => setKopVoet(kopVoetActief());
    kijk();
    const waarnemer = new MutationObserver(kijk);
    waarnemer.observe(vlak, { childList: true, subtree: true });
    return () => waarnemer.disconnect();
  }, []);

  const api = () => apis.tekst();
  const sluit = () => {
    setVenster(null);
    api()?.focus();
  };
  const klaarVoor = () => {
    const herlaad = apis.herlaad;
    const editor = api();
    if (!herlaad || !editor?.getDocument()) throw new Error("Het document is nog niet gereed.");
    return { herlaad, editor };
  };

  /** Vraagt (één keer) of herladen goed is. */
  function bevestigd(titel: string): Promise<boolean> {
    if (herladenBevestigd()) return Promise.resolve(true);
    return new Promise((klaar) => {
      setVenster(
        <BevestigHerladen
          titel={titel}
          sluit={() => {
            setVenster(null);
            klaar(false);
          }}
          bevestig={(altijd) => {
            onthoudBevestiging(altijd);
            setVenster(null);
            klaar(true);
          }}
        />,
      );
    });
  }

  /** De pakketroute: markering (optioneel), opslaan, bewerken, herladen. */
  async function pakket(o: Pakketopdracht) {
    // Eén bewerking tegelijk: een tweede klik wacht tot de vorige herladen is.
    const vrij = await neemBeurt();
    let doorgegeven = false;
    try {
      const { herlaad, editor } = klaarVoor();
      if (!(await bevestigd("Document opnieuw laden"))) {
        editor.focus();
        return;
      }
      // Vóór de markering: de plek telt vanaf het eind, de markering valt dan weg.
      const plek = await leesPlek(editor);
      let markering: Awaited<ReturnType<typeof zetMarkering>> = null;
      if (o.cursor) {
        markering = bewerkbaar || kopVoetActief() ? await zetMarkering(editor) : null;
        if (!markering && o.cursor === "nodig") throw new Error("Zet de cursor eerst op de plek in de tekst.");
      }
      let bytes: Uint8Array;
      let uit: Uint8Array | null;
      try {
        bytes = await herlaad.bytes();
        let sectie = -1;
        if (markering && o.cursor === "sectie") {
          sectie = sectieVanMarkering(bytes, markering.markering) ?? -1;
          bytes = metPakket(bytes, (p) => {
            verwijderMarkering(p, markering!.markering);
            return p.inpakken();
          });
        }
        if (sectie < 0) sectie = Math.max(0, leesSecties(bytes).length - 1);
        uit = o.werk(bytes, { markering: o.cursor === "nodig" ? markering!.markering : null, sectie });
      } catch (e) {
        markering?.ongedaan();
        throw e;
      }
      if (!uit) {
        markering?.ongedaan();
        if (o.ongewijzigd) o.ongewijzigd(editor);
        else editor.focus();
        return;
      }
      const lintTab = actiefLintTab();
      planNaHerladen(herlaad, async (nieuw) => {
        try {
          herstelLintTab(lintTab);
          await herstelPlek(nieuw, plek, "eind");
          toonMelding(`${o.klaar}. Ongedaan maken van eerdere wijzigingen is na het herladen niet meer mogelijk.`);
          await o.na?.(nieuw);
        } finally {
          vrij();
        }
      }, editor);
      doorgegeven = true;
      setVenster(null);
      herlaad.vervang(uit);
    } catch (e) {
      fout(tekst(e));
      api()?.focus();
    } finally {
      if (!doorgegeven) vrij();
    }
  }

  // --- Paginanummers en kop/voet -------------------------------------------

  function paginanummer(opties: PaginanummerOpties) {
    if (opties.positie === "cursor")
      return void pakket({
        klaar: "Paginanummer ingevoegd",
        cursor: "nodig",
        werk: (b, { markering }) => voegVeldInBijMarkering(b, markering!, opties.vorm),
      });
    void pakket({
      klaar: "Paginanummers ingevoegd",
      cursor: opties.doel === -1 ? "sectie" : undefined,
      werk: (b, { sectie }) => voegPaginanummerIn(b, { ...opties, doel: opties.doel === -1 ? sectie : (opties.doel ?? "alle") }),
    });
  }
  function paginanummerVenster(begin: Partial<PaginanummerOpties> = {}) {
    setVenster(<PaginanummerDialoog begin={begin} secties={sectieStand(api()).aantalSecties} sluit={sluit} bevestig={paginanummer} />);
  }
  const paginanummersWeg = () => void pakket({ klaar: "Paginanummers verwijderd", werk: (b) => verwijderPaginanummers(b) });
  const eersteAnders = (aan: boolean) => void pakket({ klaar: aan ? "Eerste pagina anders" : "Eerste pagina gelijk", cursor: "sectie", werk: (b, { sectie }) => zetEerstePaginaAnders(b, sectie, aan) });
  const evenOneven = (aan: boolean) => void pakket({ klaar: aan ? "Even en oneven pagina's anders" : "Even en oneven pagina's gelijk", werk: (b) => zetEvenOnevenAnders(b, aan) });
  const koppel = (soort: KopVoetSoort, gekoppeld: boolean) =>
    void pakket({
      klaar: `${soort === "header" ? "Koptekst" : "Voettekst"} ${gekoppeld ? "gekoppeld aan" : "losgekoppeld van"} de vorige sectie`,
      cursor: "sectie",
      werk: (b, { sectie }) => koppelAanVorige(b, sectie, soort, gekoppeld),
    });
  const kopVoetWeg = (soort: KopVoetSoort) =>
    void pakket({ klaar: `${soort === "header" ? "Koptekst" : "Voettekst"} verwijderd`, cursor: "sectie", werk: (b, { sectie }) => verwijderKopVoet(b, sectie, soort) });
  async function afstandVenster() {
    try {
      const { herlaad } = klaarVoor();
      const stand = leesKopVoet(await herlaad.bytes());
      const s = stand.secties[stand.secties.length - 1];
      setVenster(
        <AfstandDialoog
          koptekst={s.koptekst}
          voettekst={s.voettekst}
          sluit={sluit}
          bevestig={(a) => void pakket({ klaar: "Afstand van kop- en voettekst aangepast", cursor: "sectie", werk: (b, { sectie }) => zetKopVoetAfstand(b, sectie, a) })}
        />,
      );
    } catch (e) {
      fout(tekst(e));
    }
  }
  function bewerk(soort: KopVoetSoort) {
    const editor = api();
    if (!editor) return;
    const sectie = editor.getDocument()?.package?.document?.finalSectionProperties;
    const refs = soort === "header" ? sectie?.headerReferences : sectie?.footerReferences;
    const naam = soort === "header" ? "Koptekst" : "Voettekst";
    const openen = (e: DocxEditorRef) => {
      if (!bewerkKopVoet(e, soort)) return fout(`De ${naam.toLowerCase()} kon niet worden geopend. Dubbelklik in de boven- of ondermarge van een pagina.`);
      setTimeout(() => {
        if (!kopVoetActief()) fout(`De ${naam.toLowerCase()} kon niet worden geopend. Dubbelklik in de ${soort === "header" ? "boven" : "onder"}marge van een pagina.`);
      }, 600);
    };
    // Eerste pagina anders / even en oneven: die pagina's tonen een eigen onderdeel.
    const stand = sectieStand(editor);
    const nodig = ["default", ...(stand.titelpagina ? ["first"] : []), ...(stand.evenOneven ? ["even"] : [])];
    if (nodig.every((t) => refs?.some((r) => (r.type ?? "default") === t))) return openen(editor);
    // Nog geen (passende) kop/voettekst: eerst een lege toevoegen (pakketroute), daarna openen.
    void pakket({
      klaar: `${naam} toegevoegd`,
      cursor: "sectie",
      werk: (b, { sectie: s }) => zorgVoorKopVoet(b, s, soort),
      na: (nieuw) => {
        setTimeout(() => openen(nieuw), 300);
      },
      ongewijzigd: openen,
    });
  }
  function sluitBewerken() {
    if (!sluitKopVoet()) {
      // Terugval: Esc in de editor.
      const doel = document.activeElement ?? document.body;
      doel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
    api()?.focus();
  }

  // --- Pagina-indeling --------------------------------------------------------

  const sectieWijziging = (klaar: string, w: Parameters<typeof wijzigSecties>[2]) =>
    void pakket({ klaar, cursor: "sectie", werk: (b, { sectie }) => wijzigSecties(b, sectie, w) });
  const marges = (v: MargeVoorkeur) => sectieWijziging(`Marges ‘${MARGES[v].naam}’ ingesteld`, { marges: MARGES[v].marges });
  const afdrukstand = (a: Afdrukstand) => sectieWijziging(a === "liggend" ? "Afdrukstand liggend" : "Afdrukstand staand", { afdrukstand: a });
  const formaat = (f: Formaat) => sectieWijziging(`Papierformaat ${FORMATEN[f].naam}`, { formaat: FORMATEN[f] });
  const kolommen = (v: KolomVoorkeur) =>
    void pakket({ klaar: "Kolommen ingesteld", cursor: "sectie", werk: (b, { sectie }) => zetKolomVoorkeur(b, sectie, v) });
  async function kolommenVenster() {
    try {
      const { herlaad, editor } = klaarVoor();
      const bytes = await herlaad.bytes();
      const lijst = leesSecties(bytes);
      const s = lijst[lijst.length - 1];
      setVenster(
        <KolommenDialoog
          begin={s.kolommen}
          breedte={tekstbreedteVan(s)}
          secties={sectieStand(editor).aantalSecties}
          sluit={sluit}
          bevestig={(k: Kolommen, doel) =>
            void pakket({ klaar: "Kolommen ingesteld", cursor: "sectie", werk: (b, { sectie }) => wijzigSecties(b, doel === "alle" ? "alle" : (sectie as SectieDoel), { kolommen: k }) })
          }
        />,
      );
    } catch (e) {
      fout(tekst(e));
    }
  }
  const kolomeinde = () => void pakket({ klaar: "Kolomeinde ingevoegd", cursor: "nodig", werk: (b, { markering }) => voegKolomeindeIn(b, markering!) });
  /**
   * Sectie-einde (volgende, even of oneven pagina, of doorlopend). Pakketroute:
   * de engine voegt het via `insertSectionBreak*` wel in, maar kan het daarna
   * niet tekenen ("unsupported embed"); zie engine-verzoeken.
   */
  const SECTIE_EINDE = {
    nextPage: "Sectie-einde (nieuwe pagina) ingevoegd",
    continuous: "Doorlopend sectie-einde ingevoegd",
    evenPage: "Sectie-einde (even pagina) ingevoegd",
    oddPage: "Sectie-einde (oneven pagina) ingevoegd",
  } as const;
  const sectieEinde = (soort: keyof typeof SECTIE_EINDE) =>
    void pakket({
      klaar: SECTIE_EINDE[soort],
      cursor: "nodig",
      werk: (b, { markering }) => voegSectieEindeIn(b, markering!, soort),
    });
  const paginaInstelling = () => {
    void opdrachten.execute("pageSetup", null).then((r) => {
      if (!r.ok) fout(r.failure.message);
    });
  };

  // --- Inhoudsopgave ----------------------------------------------------------

  /** Na herladen: paginanummers nalopen met de nieuwe indeling (de inhoudsopgave zelf neemt ruimte in). */
  const tocNalopen: NaHerladen = async (nieuw) => {
    const herlaad = apis.herlaad;
    if (!herlaad) return;
    const koppen = await haalKoppen(nieuw);
    const plek = await leesPlek(nieuw);
    const r = werkInhoudsopgaveBij(await herlaad.bytes(), koppen, "paginas");
    if (!r.gewijzigd) return;
    const lintTab = actiefLintTab();
    // Wachten tot ook dit herladen klaar is: pas dan mag een volgende bewerking.
    await new Promise<void>((klaar) => {
      planNaHerladen(
        herlaad,
        async (n) => {
          try {
            herstelLintTab(lintTab);
            await herstelPlek(n, plek, "eind");
          } finally {
            klaar();
          }
        },
        nieuw,
      );
      herlaad.vervang(r.bytes);
    });
  };
  async function inhoudInvoegen(opties: InhoudOpties) {
    try {
      const { herlaad, editor } = klaarVoor();
      const bestaand = leesInhoudsopgave(await herlaad.bytes());
      const koppen = await haalKoppen(editor);
      if (bestaand)
        return void pakket({
          klaar: "Inhoudsopgave vervangen",
          werk: (b) => werkInhoudsopgaveBij(b, koppen, "alles", opties).bytes,
          na: tocNalopen,
        });
      void pakket({
        klaar: koppen.length ? "Inhoudsopgave ingevoegd" : "Inhoudsopgave ingevoegd (nog zonder koppen)",
        cursor: "nodig",
        werk: (b, { markering }) => voegInhoudsopgaveIn(b, markering, koppen, opties),
        na: tocNalopen,
      });
    } catch (e) {
      fout(tekst(e));
    }
  }
  async function inhoudVenster() {
    try {
      const { herlaad } = klaarVoor();
      const bestaand = leesInhoudsopgave(await herlaad.bytes());
      setVenster(<InhoudDialoog begin={bestaand ?? STANDAARD_INHOUD} bestaat={!!bestaand} sluit={sluit} bevestig={(o) => void inhoudInvoegen(o)} />);
    } catch (e) {
      fout(tekst(e));
    }
  }
  async function inhoudBijwerken(modus?: "paginas" | "alles") {
    if (!modus) {
      setVenster(<BijwerkenDialoog sluit={sluit} bevestig={(m) => void inhoudBijwerken(m)} />);
      return;
    }
    try {
      const { herlaad, editor } = klaarVoor();
      setVenster(null);
      const bytes = await herlaad.bytes();
      if (!leesInhoudsopgave(bytes)) throw new Error("Dit document heeft geen inhoudsopgave. Voeg er eerst een in.");
      const koppen = await haalKoppen(editor);
      const proef = werkInhoudsopgaveBij(bytes, koppen, modus);
      if (!proef.gewijzigd) {
        toonMelding("De inhoudsopgave is al actueel.");
        editor.focus();
        return;
      }
      void pakket({ klaar: modus === "paginas" ? "Paginanummers van de inhoudsopgave bijgewerkt" : "Inhoudsopgave bijgewerkt", werk: (b) => werkInhoudsopgaveBij(b, koppen, modus).bytes, na: modus === "alles" ? tocNalopen : undefined });
    } catch (e) {
      fout(tekst(e));
    }
  }
  const inhoudWeg = () => void pakket({ klaar: "Inhoudsopgave verwijderd", werk: (b) => verwijderInhoudsopgave(b) });

  // --- Noten --------------------------------------------------------------------

  function noot(soort: NootSoort) {
    if (!bewerkbaar) return fout("Het document kan nu niet worden bewerkt.");
    setVenster(
      <NootDialoog
        soort={soort}
        sluit={sluit}
        bevestig={(t) =>
          void pakket({
            klaar: soort === "voetnoot" ? "Voetnoot ingevoegd" : "Eindnoot ingevoegd",
            cursor: "nodig",
            werk: (b, { markering }) => voegNootIn(b, markering!, soort, t).bytes,
          })
        }
      />,
    );
  }
  async function nootInstellingen(soort: NootSoort = "voetnoot") {
    try {
      const { herlaad } = klaarVoor();
      const bytes = await herlaad.bytes();
      setVenster(
        <NootInstellingenDialoog
          begin={{ soort, instellingen: { voetnoot: leesNootInstellingen(bytes, "voetnoot"), eindnoot: leesNootInstellingen(bytes, "eindnoot") } }}
          sluit={sluit}
          bevestig={(s, w) => void pakket({ klaar: "Notenopmaak aangepast", werk: (b) => zetNootInstellingen(b, s, w) })}
        />,
      );
    } catch (e) {
      fout(tekst(e));
    }
  }
  function gaNaarNoot(editor: DocxEditorRef, n: NootInfo, waar: "verwijzing" | "noot") {
    if (waar === "noot" && n.paginaNoot != null) {
      editor.scrollToPage(n.paginaNoot + 1);
      // Noten staan onderaan de pagina (of aan het eind): breng de onderkant in beeld.
      requestAnimationFrame(() => {
        const paginas = [...document.querySelectorAll<HTMLElement>(".office-tekst .canvas-page")].filter((p) => !p.closest("[inert], [hidden]"));
        paginas[n.paginaNoot!]?.scrollIntoView({ block: "end" });
      });
    } else if (n.paraId && editor.scrollToParaId(n.paraId)) {
      /* gescrold */
    } else if (n.paginaVerwijzing != null) editor.scrollToPage(n.paginaVerwijzing + 1);
  }
  async function notenLijst() {
    try {
      const { editor } = klaarVoor();
      const noten = await haalNoten(editor);
      setVenster(
        <NotenLijst
          noten={noten}
          sluit={sluit}
          gaNaar={(n, waar) => {
            setVenster(null);
            gaNaarNoot(editor, n, waar);
          }}
        />,
      );
    } catch (e) {
      fout(tekst(e));
    }
  }
  /** Naar de volgende of vorige noot ten opzichte van de cursor (engine: paged export + scrollen). */
  async function volgendeNoot(richting: 1 | -1) {
    try {
      const { editor } = klaarVoor();
      const noten = await haalNoten(editor);
      if (!noten.length) return toonMelding("Dit document heeft geen voet- of eindnoten.");
      const hier = editor.getSelectionInfo()?.paraId ?? null;
      const alineas = (await editor.readParagraphs({ view: "accepted" })) as { ok: boolean; paragraphs?: { paraId: string }[] };
      const volgorde = new Map((alineas.paragraphs ?? []).map((p, i) => [p.paraId, i]));
      const positie = hier != null ? (volgorde.get(hier) ?? -1) : -1;
      const index = (n: NootInfo) => (n.paraId != null ? (volgorde.get(n.paraId) ?? -1) : -1);
      const doel =
        richting === 1
          ? (noten.find((n) => index(n) > positie) ?? noten[0])
          : ([...noten].reverse().find((n) => index(n) < positie && index(n) >= 0) ?? noten[noten.length - 1]);
      gaNaarNoot(editor, doel, "verwijzing");
      toonMelding(`${doel.soort === "voetnoot" ? "Voetnoot" : "Eindnoot"} ${doel.volgnummer}: ${doel.tekst.slice(0, 80) || "(leeg)"}`, "info", 4000);
    } catch (e) {
      fout(tekst(e));
    }
  }

  useSneltoetsen(
    () => {
      const tekstvlak = zichtbaarElement<HTMLElement>(".office-tekst");
      if (!tekstvlak) return null;
      // De invoer van de engine hangt direct onder <body> (zie tekst-opdrachten).
      const actief = document.activeElement;
      return actief instanceof HTMLElement && actief.classList.contains("paged-editor__yrs-input") ? actief : tekstvlak;
    },
    venster
      ? []
      : [
          { toets: "Ctrl+Alt+F", uitvoeren: () => noot("voetnoot"), beschikbaar: () => bewerkbaar, omschrijving: "Voetnoot invoegen" },
          { toets: "Ctrl+Alt+D", uitvoeren: () => noot("eindnoot"), beschikbaar: () => bewerkbaar, omschrijving: "Eindnoot invoegen" },
          { toets: "Ctrl+Shift+Enter", uitvoeren: kolomeinde, beschikbaar: () => bewerkbaar, omschrijving: "Kolomeinde" },
        ],
    "tekst",
  );

  return {
    venster: (
      <>
        {venster}
        <Melding />
      </>
    ),
    bewerkbaar,
    beschikbaar: !!apis.herlaad,
    kopVoet,
    stand: () => sectieStand(api()),
    paginanummer,
    paginanummerVenster,
    paginanummersWeg,
    eersteAnders,
    evenOneven,
    koppel,
    kopVoetWeg,
    afstandVenster,
    bewerk,
    sluitBewerken,
    marges,
    afdrukstand,
    formaat,
    kolommen,
    kolommenVenster,
    kolomeinde,
    sectieEinde,
    paginaInstelling,
    inhoudInvoegen,
    inhoudVenster,
    inhoudBijwerken,
    inhoudWeg,
    noot,
    nootInstellingen,
    notenLijst,
    volgendeNoot,
  };
}
export type PaginaFuncties = ReturnType<typeof usePagina>;
