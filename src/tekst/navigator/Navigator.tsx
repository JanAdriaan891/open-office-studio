/**
 * Navigator (F5), zoals in LibreOffice: een boom met de onderdelen van het
 * document per categorie: koppen (in- en uitklappen, slepen om een hoofdstuk
 * met inhoud te verplaatsen, promoveren en degraderen), tabellen,
 * afbeeldingen, bladwijzers, opmerkingen, voetnoten, secties en
 * koppelingen. Klikken springt erheen, het zoekveld filtert, het
 * rechtermuismenu verwijdert of hernoemt waar dat zinvol is, en de kop waarin
 * u leest of typt is gemarkeerd. Bewerkingen zijn elk één ongedaan-maakstap.
 */
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight, X } from "lucide-react";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { RibbonFout } from "../../Ribbon";
import { useEditorApi, useEditorZichtbaar, zichtbaarElement } from "../../lint/editorApi";
import { fout } from "../gedeeld/engine";
import { haalNoten, type NootInfo } from "../pagina/ui/engine";
import type { Doel } from "../zoeken/ganaar";
import { bouwBoom, filterBoom, hoofdstukKoppen, type Kop, type KopKnoop } from "./model";
import {
  bladwijzers,
  hernoemBladwijzer,
  hernoemKop,
  kopBijAlinea,
  koppelingen,
  koppen,
  naarAlinea,
  overige,
  tabelIndexen,
  verplaatsHoofdstuk,
  verwijderAfbeelding,
  verwijderBladwijzer,
  verwijderHoofdstuk,
  verwijderKoppeling,
  verwijderTabel,
  wijzigNiveau,
  type Bladwijzer,
  type Koppeling,
} from "./engine";
import "./navigator.css";

type Categorie = "koppen" | "tabellen" | "afbeeldingen" | "bladwijzers" | "opmerkingen" | "voetnoten" | "secties" | "koppelingen";
const CATEGORIEEN: Categorie[] = ["koppen", "tabellen", "afbeeldingen", "bladwijzers", "opmerkingen", "voetnoten", "secties", "koppelingen"];

interface Inhoud {
  koppen: Kop[];
  tabellen: Doel[];
  /** Per tabel het volgnummer in de hoofdtekst, of null voor een geneste tabel. */
  tabelIndex: (number | null)[];
  afbeeldingen: Doel[];
  bladwijzers: Bladwijzer[];
  opmerkingen: Doel[];
  secties: Doel[];
  koppelingen: Koppeling[];
}
const LEEG: Inhoud = { koppen: [], tabellen: [], tabelIndex: [], afbeeldingen: [], bladwijzers: [], opmerkingen: [], secties: [], koppelingen: [] };

function verzamel(ref: DocxEditorRef): Inhoud {
  const veilig = <T,>(f: () => T[]): T[] => {
    try {
      return f();
    } catch {
      return [];
    }
  };
  return {
    koppen: veilig(() => koppen(ref)),
    tabellen: veilig(() => overige.tabellen(ref)),
    tabelIndex: veilig(() => tabelIndexen(ref)),
    afbeeldingen: veilig(() => overige.afbeeldingen(ref)),
    bladwijzers: veilig(() => bladwijzers(ref)),
    opmerkingen: veilig(() => overige.opmerkingen(ref)),
    secties: veilig(() => overige.secties(ref)),
    koppelingen: veilig(() => koppelingen(ref)),
  };
}

/** Een vingerafdruk van het document om te zien of opnieuw verzamelen nodig is. */
function vingerafdruk(ref: DocxEditorRef | null) {
  try {
    const s = ref?.getEditorRef()?.getYrsSession();
    if (!s) return "";
    return `${s.storyChecksum("body")}:${s.storyIds().length}:${ref?.getTotalPages()}:${ref?.getComments().length}`;
  } catch {
    return "";
  }
}

interface Menu {
  x: number;
  y: number;
  regels: { naam: string; doe: () => void; uit?: boolean }[];
}

export function Navigator({ sluit }: { sluit: () => void }) {
  const { t } = useTranslation("writer");
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  const zichtbaar = useEditorZichtbaar();
  const [plek, setPlek] = useState<{ left: number; top: number; height: number } | null>(null);
  const [inhoud, setInhoud] = useState<Inhoud>(LEEG);
  const [noten, setNoten] = useState<NootInfo[] | null>(null);
  const [zoek, setZoek] = useState("");
  const [open, setOpen] = useState<Set<Categorie>>(() => new Set<Categorie>(["koppen"]));
  const [ingeklapt, setIngeklapt] = useState<Set<string>>(new Set());
  const [huidig, setHuidig] = useState<string | null>(null);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [hernoemen, setHernoemen] = useState<{ id: string; naam: string; klaar: (naam: string) => void } | null>(null);
  const [sleep, setSleep] = useState<{ bron: string; doel: string | null } | null>(null);
  const afdruk = useRef("");
  const paneel = useRef<HTMLElement>(null);

  const doe = useCallback(
    (taak: () => unknown) => {
      try {
        const uit = taak();
        if (uit instanceof Promise) uit.catch((e) => meld(fout(e)));
      } catch (e) {
        meld(fout(e));
      }
    },
    [meld],
  );

  // Plaats: links in het documentvlak, het document schuift op.
  useLayoutEffect(() => {
    if (!zichtbaar) return;
    const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__dock-area");
    const meet = () => {
      const r = vlak?.getBoundingClientRect();
      if (r) setPlek({ left: r.left + 8, top: r.top + 8, height: Math.max(240, r.height - 16) });
    };
    meet();
    vlak?.classList.add("tw-met-navigator");
    const waarnemer = new ResizeObserver(meet);
    if (vlak) waarnemer.observe(vlak);
    window.addEventListener("resize", meet);
    return () => {
      vlak?.classList.remove("tw-met-navigator");
      waarnemer.disconnect();
      window.removeEventListener("resize", meet);
    };
  }, [zichtbaar]);

  // Inhoud: opnieuw verzamelen als het document verandert.
  const ververs = useCallback(
    (geforceerd = false) => {
      const ref = api();
      if (!ref) return;
      const nu = vingerafdruk(ref);
      if (!geforceerd && nu === afdruk.current) return;
      afdruk.current = nu;
      setInhoud(verzamel(ref));
      if (open.has("voetnoten"))
        void haalNoten(ref)
          .then((n) => setNoten(n.filter((x) => x.soort === "voetnoot")))
          .catch(() => setNoten([]));
    },
    [api, open],
  );
  useEffect(() => {
    if (!zichtbaar) return;
    ververs(true);
    const tik = window.setInterval(() => ververs(), 800);
    return () => window.clearInterval(tik);
  }, [zichtbaar, ververs]);

  // Huidige kop: bij de cursor en tijdens scrollen bij de bovenkant van het beeld.
  useEffect(() => {
    if (!zichtbaar) return;
    const ref = api();
    const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__scroll-container");
    let wacht = 0;
    const bijScrollen = () => {
      window.clearTimeout(wacht);
      wacht = window.setTimeout(() => {
        const r = vlak?.getBoundingClientRect();
        if (!ref || !r) return;
        const punt = ref.getPositionAtPoint(r.left + r.width / 2, r.top + 80);
        const paraId = punt && punt.region === "body" ? punt.target.start.paraId : null;
        if (paraId) setHuidig(kopBijAlinea(ref, paraId, inhoud.koppen));
      }, 80);
    };
    const bijCursor = () => {
      const sel = ref?.getEditorRef()?.getYrsSession()?.selection();
      if (ref && sel?.head.story === "body") setHuidig(kopBijAlinea(ref, sel.head.paraId, inhoud.koppen));
    };
    vlak?.addEventListener("scroll", bijScrollen, { passive: true });
    document.addEventListener("selectionchange", bijCursor);
    window.addEventListener("keyup", bijCursor);
    window.addEventListener("mouseup", bijCursor);
    bijCursor();
    return () => {
      window.clearTimeout(wacht);
      vlak?.removeEventListener("scroll", bijScrollen);
      document.removeEventListener("selectionchange", bijCursor);
      window.removeEventListener("keyup", bijCursor);
      window.removeEventListener("mouseup", bijCursor);
    };
  }, [zichtbaar, api, inhoud.koppen]);

  useEffect(() => {
    if (!menu) return;
    const weg = () => setMenu(null);
    window.addEventListener("mousedown", weg);
    window.addEventListener("blur", weg);
    return () => {
      window.removeEventListener("mousedown", weg);
      window.removeEventListener("blur", weg);
    };
  }, [menu]);

  const ref = () => api();
  const naHoofdstukbewerking = (nieuw?: string | null) => {
    ververs(true);
    if (nieuw) setGekozen(nieuw);
  };
  const verplaats = (bron: string, doel: string | null) =>
    doe(() => {
      const r = ref();
      if (r) naHoofdstukbewerking(verplaatsHoofdstuk(r, bron, doel));
    });
  /** Hoofdstuk één plaats omhoog (-1) of omlaag (+1) tussen zijn broers. */
  const schuif = (paraId: string, richting: -1 | 1) => {
    const lijst = inhoud.koppen;
    const i = lijst.findIndex((k) => k.paraId === paraId);
    if (i < 0) return;
    const niveau = lijst[i].niveau;
    if (richting < 0) {
      // De vorige kop op hetzelfde niveau (binnen dezelfde ouder).
      for (let j = i - 1; j >= 0 && lijst[j].niveau >= niveau; j--) if (lijst[j].niveau === niveau) return verplaats(paraId, lijst[j].paraId);
    } else {
      const [, eind] = hoofdstukKoppen(lijst, i);
      if (eind >= lijst.length || lijst[eind].niveau < niveau) return;
      const [, naVolgende] = hoofdstukKoppen(lijst, eind);
      verplaats(paraId, naVolgende < lijst.length ? lijst[naVolgende].paraId : null);
    }
  };
  const niveau = (paraId: string, stap: -1 | 1, mee = true) =>
    doe(async () => {
      const r = ref();
      if (r) await wijzigNiveau(r, paraId, stap, mee);
      ververs(true);
    });

  const boom = useMemo(() => filterBoom(bouwBoom(inhoud.koppen), zoek), [inhoud.koppen, zoek]);
  const past = (tekst: string) => !zoek.trim() || tekst.toLocaleLowerCase().includes(zoek.trim().toLocaleLowerCase());

  const kopMenu = (k: Kop, x: number, y: number) =>
    setMenu({
      x,
      y,
      regels: [
        { naam: t("navigator.menu.chapterUp"), doe: () => schuif(k.paraId, -1) },
        { naam: t("navigator.menu.chapterDown"), doe: () => schuif(k.paraId, 1) },
        { naam: t("navigator.menu.promoteChapter"), doe: () => niveau(k.paraId, -1), uit: k.niveau === 0 },
        { naam: t("navigator.menu.demoteChapter"), doe: () => niveau(k.paraId, 1), uit: k.niveau >= 8 },
        { naam: t("navigator.menu.promoteLevel"), doe: () => niveau(k.paraId, -1, false), uit: k.niveau === 0 },
        { naam: t("navigator.menu.demoteLevel"), doe: () => niveau(k.paraId, 1, false), uit: k.niveau >= 8 },
        {
          naam: t("navigator.menu.rename"),
          doe: () => setHernoemen({ id: k.paraId, naam: k.tekst, klaar: (naam) => doe(() => (hernoemKop(ref()!, k.paraId, naam), ververs(true))) }),
        },
        { naam: t("navigator.menu.deleteChapter"), doe: () => doe(() => (verwijderHoofdstuk(ref()!, k.paraId), ververs(true))) },
      ],
    });

  const knoop = (k: KopKnoop): ReactNode => {
    const dicht = ingeklapt.has(k.paraId) && !zoek;
    const isSleepDoel = sleep?.doel === k.paraId && sleep.bron !== k.paraId;
    return (
      <li key={k.paraId} role="treeitem" aria-expanded={k.kinderen.length ? !dicht : undefined} aria-selected={gekozen === k.paraId} aria-level={k.niveau + 1}>
        <div
          className={`nav-rij${huidig === k.paraId ? " is-huidig" : ""}${gekozen === k.paraId ? " is-gekozen" : ""}${isSleepDoel ? " is-sleepdoel" : ""}`}
          draggable={!hernoemen}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", k.tekst);
            setSleep({ bron: k.paraId, doel: null });
          }}
          onDragOver={(e) => {
            if (!sleep) return;
            e.preventDefault();
            if (sleep.doel !== k.paraId) setSleep({ ...sleep, doel: k.paraId });
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (sleep && sleep.bron !== k.paraId) verplaats(sleep.bron, k.paraId);
            setSleep(null);
          }}
          onDragEnd={() => setSleep(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setGekozen(k.paraId);
            kopMenu(k, e.clientX, e.clientY);
          }}
        >
          {k.kinderen.length ? (
            <button
              type="button"
              className="nav-klap"
              aria-label={dicht ? t("navigator.expand") : t("navigator.collapse")}
              onClick={() => {
                const n = new Set(ingeklapt);
                dicht ? n.delete(k.paraId) : n.add(k.paraId);
                setIngeklapt(n);
              }}
            >
              {dicht ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : (
            <span className="nav-klap" />
          )}
          {hernoemen?.id === k.paraId ? (
            <Hernoemveld hernoemen={hernoemen} stop={() => setHernoemen(null)} />
          ) : (
            <button
              type="button"
              className="nav-label"
              title={k.tekst}
              onClick={() => {
                setGekozen(k.paraId);
                doe(() => naarAlinea(ref()!, k.paraId));
              }}
              onKeyDown={(e) => {
                const mod = e.ctrlKey || e.metaKey;
                if (e.key === "Enter") (e.preventDefault(), doe(() => naarAlinea(ref()!, k.paraId, 0, 0, true)));
                else if (mod && e.key === "ArrowUp") (e.preventDefault(), schuif(k.paraId, -1));
                else if (mod && e.key === "ArrowDown") (e.preventDefault(), schuif(k.paraId, 1));
                else if (mod && e.key === "ArrowLeft") (e.preventDefault(), niveau(k.paraId, -1));
                else if (mod && e.key === "ArrowRight") (e.preventDefault(), niveau(k.paraId, 1));
                else if (e.key === "F2") {
                  e.preventDefault();
                  setHernoemen({ id: k.paraId, naam: k.tekst, klaar: (naam) => doe(() => (hernoemKop(ref()!, k.paraId, naam), ververs(true))) });
                }
                else if (e.key === "Delete") (e.preventDefault(), doe(() => (verwijderHoofdstuk(ref()!, k.paraId), ververs(true))));
                else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                  e.preventDefault();
                  const r = (e.target as HTMLElement).getBoundingClientRect();
                  kopMenu(k, r.left + 16, r.bottom);
                }
              }}
              onFocus={() => setGekozen(k.paraId)}
            >
              {k.tekst}
            </button>
          )}
        </div>
        {k.kinderen.length > 0 && !dicht && <ul role="group">{k.kinderen.map(knoop)}</ul>}
      </li>
    );
  };

  const lijstItems = (items: { id: string; label: string; uitleg?: string; ga: () => void; menu?: Menu["regels"]; hernoem?: { naam: string; klaar: (n: string) => void } }[]) => {
    const zichtbaar = items.filter((i) => past(i.label + " " + (i.uitleg ?? "")));
    if (!zichtbaar.length) return <p className="nav-leeg">{zoek ? t("navigator.noMatches") : t("navigator.none")}</p>;
    return (
      <ul role="group">
        {zichtbaar.map((i) => (
          <li key={i.id} role="treeitem" aria-selected={gekozen === i.id}>
            <div
              className={`nav-rij${gekozen === i.id ? " is-gekozen" : ""}`}
              onContextMenu={(e) => {
                if (!i.menu) return;
                e.preventDefault();
                setGekozen(i.id);
                setMenu({ x: e.clientX, y: e.clientY, regels: i.menu });
              }}
            >
              <span className="nav-klap" />
              {hernoemen?.id === i.id ? (
                <Hernoemveld hernoemen={hernoemen} stop={() => setHernoemen(null)} />
              ) : (
                <button
                  type="button"
                  className="nav-label"
                  title={i.uitleg ? `${i.label}\n${i.uitleg}` : i.label}
                  onFocus={() => setGekozen(i.id)}
                  onClick={() => doe(i.ga)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      doe(i.ga);
                      api()?.focus();
                    } else if (e.key === "F2" && i.hernoem) {
                      e.preventDefault();
                      setHernoemen({ id: i.id, ...i.hernoem });
                    } else if ((e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) && i.menu) {
                      e.preventDefault();
                      const r = (e.target as HTMLElement).getBoundingClientRect();
                      setMenu({ x: r.left + 16, y: r.bottom, regels: i.menu });
                    }
                  }}
                >
                  {i.label}
                  {i.uitleg && <span className="nav-uitleg">{i.uitleg}</span>}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const verwijder = t("navigator.menu.delete");
  const items: Record<Exclude<Categorie, "koppen">, () => ReactNode> = {
    tabellen: () =>
      lijstItems(
        inhoud.tabellen.map((d, n) => {
          // Alleen tabellen in de hoofdtekst zijn hier te verwijderen; geneste staan in een cel.
          const index = inhoud.tabelIndex[n];
          return {
            id: `t${n}`,
            label: d.label,
            ga: () => d.ga(ref()!),
            menu: index === null || index === undefined ? undefined : [{ naam: verwijder, doe: () => doe(() => (verwijderTabel(ref()!, index), ververs(true))) }],
          };
        }),
      ),
    afbeeldingen: () =>
      lijstItems(
        inhoud.afbeeldingen.map((d, n) => ({
          id: `a${n}`,
          label: d.label,
          ga: () => d.ga(ref()!),
          menu: [{ naam: verwijder, doe: () => doe(() => (verwijderAfbeelding(ref()!, n), ververs(true))) }],
        })),
      ),
    bladwijzers: () =>
      lijstItems(
        inhoud.bladwijzers.map((b) => {
          const hernoem = { naam: b.naam, klaar: (naam: string) => doe(() => (hernoemBladwijzer(ref()!, b, naam), ververs(true))) };
          return {
            id: `b${b.naam}`,
            label: b.naam,
            ga: () => naarAlinea(ref()!, b.paraId, b.offset),
            hernoem,
            menu: [
              { naam: t("navigator.menu.rename"), doe: () => setHernoemen({ id: `b${b.naam}`, ...hernoem }) },
              { naam: verwijder, doe: () => doe(() => (verwijderBladwijzer(ref()!, b), ververs(true))) },
            ],
          };
        }),
      ),
    opmerkingen: () => lijstItems(inhoud.opmerkingen.map((d, n) => ({ id: `o${n}`, label: d.label, ga: () => d.ga(ref()!) }))),
    voetnoten: () =>
      noten === null ? (
        <p className="nav-leeg">{t("navigator.loading")}</p>
      ) : (
        lijstItems(
          noten.map((n) => ({
            id: `v${n.noteId}`,
            label: t("navigator.footnote", { n: n.volgnummer, text: n.tekst.slice(0, 60) }),
            uitleg: n.paginaVerwijzing !== null ? t("navigator.page", { n: n.paginaVerwijzing + 1 }) : undefined,
            ga: () => {
              if (n.paraId) naarAlinea(ref()!, n.paraId);
            },
          })),
        )
      ),
    secties: () => lijstItems(inhoud.secties.map((d, n) => ({ id: `s${n}`, label: d.label, ga: () => d.ga(ref()!) }))),
    koppelingen: () =>
      lijstItems(
        inhoud.koppelingen.map((k, n) => ({
          id: `k${n}`,
          label: k.tekst.trim() || k.href,
          uitleg: k.href,
          ga: () => naarAlinea(ref()!, k.paraId, k.van, k.tot - k.van),
          menu: [{ naam: t("navigator.menu.removeLink"), doe: () => doe(() => (verwijderKoppeling(ref()!, k), ververs(true))) }],
        })),
      ),
  };
  const aantal: Record<Categorie, number | null> = {
    koppen: inhoud.koppen.length,
    tabellen: inhoud.tabellen.length,
    afbeeldingen: inhoud.afbeeldingen.length,
    bladwijzers: inhoud.bladwijzers.length,
    opmerkingen: inhoud.opmerkingen.length,
    voetnoten: noten?.length ?? null,
    secties: inhoud.secties.length,
    koppelingen: inhoud.koppelingen.length,
  };

  if (!zichtbaar || !plek) return null;
  const kop = gekozen ? inhoud.koppen.find((k) => k.paraId === gekozen) : undefined;
  return createPortal(
    <aside
      ref={paneel}
      className="tw-navigator"
      aria-label={t("navigator.title")}
      style={{ left: plek.left, top: plek.top, maxHeight: plek.height }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !hernoemen) {
          e.preventDefault();
          if (menu) setMenu(null);
          else sluit();
        }
      }}
    >
      <header>
        <h2>{t("navigator.title")}</h2>
        <button type="button" className="nav-sluit" aria-label={t("common:close")} title={`${t("common:close")} · F5`} onClick={sluit}>
          <X size={15} />
        </button>
      </header>
      <input type="search" className="nav-zoek" placeholder={t("navigator.search")} aria-label={t("navigator.search")} value={zoek} onChange={(e) => setZoek(e.target.value)} />
      <div className="nav-knoppen" role="toolbar" aria-label={t("navigator.headingTools")}>
        <button type="button" disabled={!kop} title={`${t("navigator.menu.chapterUp")} · Ctrl+↑`} aria-label={t("navigator.menu.chapterUp")} onClick={() => kop && schuif(kop.paraId, -1)}>
          <ArrowUp size={14} />
        </button>
        <button type="button" disabled={!kop} title={`${t("navigator.menu.chapterDown")} · Ctrl+↓`} aria-label={t("navigator.menu.chapterDown")} onClick={() => kop && schuif(kop.paraId, 1)}>
          <ArrowDown size={14} />
        </button>
        <button type="button" disabled={!kop || kop.niveau === 0} title={`${t("navigator.menu.promoteChapter")} · Ctrl+←`} aria-label={t("navigator.menu.promoteChapter")} onClick={() => kop && niveau(kop.paraId, -1)}>
          <ArrowLeft size={14} />
        </button>
        <button type="button" disabled={!kop || kop.niveau >= 8} title={`${t("navigator.menu.demoteChapter")} · Ctrl+→`} aria-label={t("navigator.menu.demoteChapter")} onClick={() => kop && niveau(kop.paraId, 1)}>
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="nav-inhoud" role="tree" aria-label={t("navigator.title")}>
        {CATEGORIEEN.map((c) => {
          const isOpen = open.has(c) || !!zoek.trim();
          return (
            <section key={c} className="nav-categorie">
              <button
                type="button"
                className="nav-categoriekop"
                aria-expanded={isOpen}
                onClick={() => {
                  const n = new Set(open);
                  if (n.has(c)) n.delete(c);
                  else {
                    n.add(c);
                    if (c === "voetnoten" && noten === null) {
                      const r = ref();
                      if (r)
                        void haalNoten(r)
                          .then((x) => setNoten(x.filter((y) => y.soort === "voetnoot")))
                          .catch(() => setNoten([]));
                    }
                  }
                  setOpen(n);
                }}
              >
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>{t(`navigator.categories.${c}`)}</span>
                {aantal[c] !== null && <span className="nav-aantal">{aantal[c]}</span>}
              </button>
              {isOpen &&
                (c === "koppen" ? (
                  boom.length ? (
                    <ul
                      role="group"
                      onDragOver={(e) => sleep && e.preventDefault()}
                      onDrop={(e) => {
                        // Op de lege ruimte onder de lijst: naar het eind.
                        if (e.target !== e.currentTarget || !sleep) return;
                        e.preventDefault();
                        verplaats(sleep.bron, null);
                        setSleep(null);
                      }}
                    >
                      {boom.map(knoop)}
                      {sleep && (
                        <li
                          className={`nav-einddoel${sleep.doel === null ? " is-sleepdoel" : ""}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (sleep.doel !== null) setSleep({ ...sleep, doel: null });
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            verplaats(sleep.bron, null);
                            setSleep(null);
                          }}
                        >
                          {t("navigator.dropAtEnd")}
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="nav-leeg">{zoek ? t("navigator.noMatches") : t("navigator.noHeadings")}</p>
                  )
                ) : (
                  items[c]()
                ))}
            </section>
          );
        })}
      </div>
      {menu && (
        <div className="nav-menu" role="menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {menu.regels.map((r) => (
            <button
              key={r.naam}
              type="button"
              role="menuitem"
              disabled={r.uit}
              onClick={() => {
                setMenu(null);
                r.doe();
              }}
            >
              {r.naam}
            </button>
          ))}
        </div>
      )}
    </aside>,
    document.body,
  );
}

function Hernoemveld({ hernoemen, stop }: { hernoemen: { naam: string; klaar: (naam: string) => void }; stop: () => void }) {
  const [waarde, setWaarde] = useState(hernoemen.naam);
  return (
    <input
      className="nav-hernoem"
      autoFocus
      value={waarde}
      onChange={(e) => setWaarde(e.target.value)}
      onBlur={stop}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (waarde.trim() && waarde !== hernoemen.naam) hernoemen.klaar(waarde);
          stop();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          stop();
        }
      }}
    />
  );
}
