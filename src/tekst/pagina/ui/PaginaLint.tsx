/**
 * Lintgroepen en -tabbladen voor de paginafuncties: Invoegen → Kop- en
 * voettekst, het tabblad Kop- en voettekst, Indeling → Pagina-instelling,
 * Kolommen en Eindes, en het tabblad Verwijzingen (inhoudsopgave en noten).
 */
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  BookOpen,
  Columns2,
  Columns3,
  FileDigit,
  FileText,
  Footprints,
  Hash,
  Link2,
  Link2Off,
  ListOrdered,
  ListTree,
  Maximize2,
  MoveVertical,
  PanelBottom,
  PanelTop,
  Proportions,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
  Ruler,
  Settings2,
  SquareSplitVertical,
  StickyNote,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Columns,
  Square,
  FilePlus2,
  type LucideIcon,
} from "lucide-react";
import { Groep, type RibbonTab } from "../../../Ribbon";
import { EigenKnop } from "../../../lint/tekst-opdrachten";
import { FORMATEN, MARGES, twipsNaarCm, type Formaat, type MargeVoorkeur } from "../secties.ts";
import { Keuzemenu, type Menuregel } from "./Keuzemenu.tsx";
import { HERLAAD_UITLEG, voorbeeldPaginanummer } from "./Dialogen.tsx";
import type { PaginaFuncties } from "./usePagina.tsx";

const HERLAAD_KORT = "Herlaadt het document; eerdere stappen zijn daarna niet meer ongedaan te maken.";
const cm = (t: number) => `${String(twipsNaarCm(t)).replace(".", ",")} cm`;

function paginanummerRegels(p: PaginaFuncties): Menuregel[] {
  const uitlijningen: { waarde: "links" | "midden" | "rechts"; naam: string; icoon: LucideIcon }[] = [
    { waarde: "links", naam: "Links", icoon: AlignLeft },
    { waarde: "midden", naam: "Midden", icoon: AlignCenter },
    { waarde: "rechts", naam: "Rechts", icoon: AlignRight },
  ];
  const plek = (positie: "boven" | "onder") =>
    uitlijningen.map((u) => ({
      naam: `${positie === "boven" ? "Bovenaan" : "Onderaan"}, ${u.naam.toLowerCase()}`,
      icoon: u.icoon,
      kies: () => p.paginanummer({ positie, uitlijning: u.waarde, vorm: "getal", opEerstePagina: true }),
    }));
  return [
    { kop: "Boven aan de pagina" },
    ...plek("boven"),
    { kop: "Onder aan de pagina" },
    ...plek("onder"),
    {
      naam: "Onderaan: Pagina X van Y",
      icoon: Hash,
      voorbeeld: voorbeeldPaginanummer("paginaVan"),
      kies: () => p.paginanummer({ positie: "onder", uitlijning: "midden", vorm: "paginaVan", opEerstePagina: true }),
    },
    { naam: "Op de cursorpositie", uitleg: "Ook in een kop- of voettekst die u bewerkt", icoon: FileDigit, uit: !p.bewerkbaar && !p.kopVoet, kies: () => p.paginanummer({ positie: "cursor", uitlijning: "midden", vorm: "getal", opEerstePagina: true }) },
    { scheiding: true },
    { naam: "Paginanummers instellen…", uitleg: "Notatie 1/i/I/a, beginnen bij, eerste pagina", icoon: Settings2, kies: () => p.paginanummerVenster() },
    { naam: "Paginanummers verwijderen", icoon: Trash2, kies: p.paginanummersWeg },
  ];
}

export function PaginanummerKnop({ p, groot = true }: { p: PaginaFuncties; groot?: boolean }) {
  return <Keuzemenu naam="Paginanummer" icoon={Hash} groot={groot} uit={!p.beschikbaar} regels={() => paginanummerRegels(p)} voet={HERLAAD_KORT} />;
}

/** Invoegen → Kop- en voettekst. */
export function KopVoetInvoegenGroep({ p }: { p: PaginaFuncties }) {
  return (
    <Groep naam="Kop- en voettekst">
      <PaginanummerKnop p={p} />
      <div className="ribbon-stapel">
        <EigenKnop naam="Koptekst" icoon={PanelTop} uitleg="Koptekst bewerken" disabled={!p.bewerkbaar} onClick={() => p.bewerk("header")} />
        <EigenKnop naam="Voettekst" icoon={PanelBottom} uitleg="Voettekst bewerken" disabled={!p.bewerkbaar} onClick={() => p.bewerk("footer")} />
      </div>
    </Groep>
  );
}

/** Het tabblad Kop- en voettekst. */
export function kopVoetTab(p: PaginaFuncties): RibbonTab {
  const stand = p.stand();
  return {
    id: "kopvoet",
    naam: "Kop- en voettekst",
    inhoud: (
      <>
        <Groep naam="Bewerken">
          <EigenKnop naam="Koptekst bewerken" icoon={PanelTop} groot disabled={!p.bewerkbaar} onClick={() => p.bewerk("header")} />
          <EigenKnop naam="Voettekst bewerken" icoon={PanelBottom} groot disabled={!p.bewerkbaar} onClick={() => p.bewerk("footer")} />
        </Groep>
        <Groep naam="Invoegen">
          <PaginanummerKnop p={p} />
        </Groep>
        <Groep naam="Opties">
          <div className="ribbon-stapel">
            <EigenKnop
              naam="Eerste pagina anders"
              icoon={FileText}
              actief={stand.titelpagina}
              uitleg={`Eigen kop- en voettekst op de eerste pagina van de sectie. ${HERLAAD_KORT}`}
              disabled={!p.beschikbaar}
              onClick={() => p.eersteAnders(!stand.titelpagina)}
            />
            <EigenKnop
              naam="Even en oneven anders"
              icoon={BookOpen}
              actief={stand.evenOneven}
              uitleg={`Verschillende kop- en voettekst op even en oneven pagina's. ${HERLAAD_KORT}`}
              disabled={!p.beschikbaar}
              onClick={() => p.evenOneven(!stand.evenOneven)}
            />
          </div>
        </Groep>
        <Groep naam="Secties">
          <Keuzemenu
            naam="Koppelen aan vorige"
            icoon={Link2}
            groot
            uit={!p.beschikbaar}
            uitleg="Voor de sectie waarin de cursor staat"
            voet={HERLAAD_KORT}
            regels={[
              { naam: "Koptekst koppelen aan vorige", icoon: Link2, kies: () => p.koppel("header", true) },
              { naam: "Koptekst loskoppelen", icoon: Link2Off, kies: () => p.koppel("header", false) },
              { naam: "Voettekst koppelen aan vorige", icoon: Link2, kies: () => p.koppel("footer", true) },
              { naam: "Voettekst loskoppelen", icoon: Link2Off, kies: () => p.koppel("footer", false) },
            ]}
          />
        </Groep>
        <Groep naam="Positie">
          <EigenKnop naam="Afstand vanaf rand" icoon={MoveVertical} groot uitleg="Afstand van kop- en voettekst tot de paginarand" disabled={!p.beschikbaar} onClick={() => void p.afstandVenster()} />
        </Groep>
        <Groep naam="Verwijderen">
          <div className="ribbon-stapel">
            <EigenKnop naam="Koptekst verwijderen" icoon={Trash2} disabled={!p.beschikbaar} onClick={() => p.kopVoetWeg("header")} />
            <EigenKnop naam="Voettekst verwijderen" icoon={Trash2} disabled={!p.beschikbaar} onClick={() => p.kopVoetWeg("footer")} />
          </div>
        </Groep>
        <Groep naam="Sluiten">
          <EigenKnop naam="Kop- en voettekst sluiten" icoon={X} groot uitleg="Terug naar de hoofdtekst · Esc" disabled={!p.kopVoet} onClick={p.sluitBewerken} />
        </Groep>
      </>
    ),
  };
}

// ---------------------------------------------------------------------------
// Indeling

export function PaginaIndelingKnoppen({ p }: { p: PaginaFuncties }) {
  const stand = p.stand();
  const margeRegels = (): Menuregel[] => [
    ...(Object.keys(MARGES) as MargeVoorkeur[]).map((v) => {
      const m = MARGES[v].marges;
      const actief = !!stand.marges && stand.marges.boven === m.boven && stand.marges.onder === m.onder && stand.marges.links === m.links && stand.marges.rechts === m.rechts;
      return {
        naam: MARGES[v].naam,
        uitleg: `Boven ${cm(m.boven)} · onder ${cm(m.onder)} · links ${cm(m.links)} · rechts ${cm(m.rechts)}`,
        actief,
        icoon: Square,
        kies: () => p.marges(v),
      };
    }),
    { scheiding: true },
    { naam: "Aangepaste marges…", icoon: Settings2, kies: p.paginaInstelling },
  ];
  const formaatRegels = (): Menuregel[] => [
    ...(Object.keys(FORMATEN) as Formaat[]).map((f) => {
      const F = FORMATEN[f];
      const actief = !!stand.breedte && Math.min(stand.breedte, stand.hoogte ?? 0) === F.breedte && Math.max(stand.breedte, stand.hoogte ?? 0) === F.hoogte;
      return { naam: F.naam, uitleg: F.uitleg, actief, icoon: FileText, kies: () => p.formaat(f) };
    }),
    { scheiding: true },
    { naam: "Meer papierformaten…", icoon: Settings2, kies: p.paginaInstelling },
  ];
  return (
    <>
      <Keuzemenu naam="Marges" icoon={Maximize2} groot uit={!p.beschikbaar} regels={margeRegels} voet={HERLAAD_KORT} />
      <div className="ribbon-stapel">
        <Keuzemenu
          naam="Afdrukstand"
          icoon={stand.liggend ? RectangleHorizontal : RectangleVertical}
          uit={!p.beschikbaar}
          voet={HERLAAD_KORT}
          regels={() => [
            { naam: "Staand", icoon: RectangleVertical, actief: !stand.liggend, kies: () => p.afdrukstand("staand") },
            { naam: "Liggend", icoon: RectangleHorizontal, actief: stand.liggend, kies: () => p.afdrukstand("liggend") },
          ]}
        />
        <Keuzemenu naam="Formaat" icoon={Proportions} uit={!p.beschikbaar} regels={formaatRegels} voet={HERLAAD_KORT} />
      </div>
    </>
  );
}

export function KolommenGroep({ p }: { p: PaginaFuncties }) {
  const aantal = p.stand().kolommen;
  return (
    <Groep naam="Kolommen">
      <Keuzemenu
        naam="Kolommen"
        icoon={Columns3}
        groot
        uit={!p.beschikbaar}
        voet={HERLAAD_KORT}
        regels={() => [
          { naam: "Eén", icoon: Square, actief: aantal === 1, kies: () => p.kolommen("een") },
          { naam: "Twee", icoon: Columns2, actief: aantal === 2, kies: () => p.kolommen("twee") },
          { naam: "Drie", icoon: Columns3, actief: aantal === 3, kies: () => p.kolommen("drie") },
          { naam: "Links", uitleg: "Smalle kolom links", icoon: Columns, kies: () => p.kolommen("links") },
          { naam: "Rechts", uitleg: "Smalle kolom rechts", icoon: Columns, kies: () => p.kolommen("rechts") },
          { scheiding: true },
          { naam: "Meer kolommen…", uitleg: "Aantal, tussenruimte, lijn ertussen", icoon: Settings2, kies: () => void p.kolommenVenster() },
        ]}
      />
    </Groep>
  );
}

/** Extra eindes: kolomeinde en sectie-einde op een even of oneven pagina. */
export function ExtraEindes({ p }: { p: PaginaFuncties }) {
  return (
    <div className="ribbon-stapel">
      <EigenKnop naam="Kolomeinde" icoon={SquareSplitVertical} sneltoets="Ctrl+Shift+Enter" uitleg={HERLAAD_KORT} disabled={!p.bewerkbaar} onClick={p.kolomeinde} />
      <EigenKnop naam="Sectie op even pagina" icoon={FilePlus2} uitleg="Nieuwe sectie op de volgende even pagina" disabled={!p.bewerkbaar} onClick={() => p.sectieEinde("evenPage")} />
      <EigenKnop naam="Sectie op oneven pagina" icoon={FilePlus2} uitleg="Nieuwe sectie op de volgende oneven pagina" disabled={!p.bewerkbaar} onClick={() => p.sectieEinde("oddPage")} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verwijzingen

export function verwijzingenTab(p: PaginaFuncties): RibbonTab {
  return {
    id: "verwijzingen",
    naam: "Verwijzingen",
    inhoud: (
      <>
        <Groep naam="Inhoudsopgave">
          <Keuzemenu
            naam="Inhoudsopgave"
            icoon={ListTree}
            groot
            uit={!p.beschikbaar}
            voet={HERLAAD_UITLEG}
            regels={[
              { naam: "Automatisch: Kop 1 tot en met 3", uitleg: "Met puntjes en paginanummers", icoon: ListOrdered, uit: !p.bewerkbaar, kies: () => void p.inhoudInvoegen({ niveaus: 3, paginanummers: true, rechtsUitlijnen: true, opvulteken: "punt", hyperlinks: true, titel: "Inhoudsopgave" }) },
              { naam: "Automatisch: Kop 1 en 2", uitleg: "Met puntjes en paginanummers", icoon: ListOrdered, uit: !p.bewerkbaar, kies: () => void p.inhoudInvoegen({ niveaus: 2, paginanummers: true, rechtsUitlijnen: true, opvulteken: "punt", hyperlinks: true, titel: "Inhoudsopgave" }) },
              { naam: "Eenvoudig, zonder paginanummers", icoon: ListOrdered, uit: !p.bewerkbaar, kies: () => void p.inhoudInvoegen({ niveaus: 3, paginanummers: false, rechtsUitlijnen: false, opvulteken: "geen", hyperlinks: true, titel: "Inhoud" }) },
              { scheiding: true },
              { naam: "Aangepaste inhoudsopgave…", uitleg: "Niveaus, opvulteken, titel", icoon: Settings2, kies: () => void p.inhoudVenster() },
              { naam: "Inhoudsopgave verwijderen", icoon: Trash2, kies: p.inhoudWeg },
            ]}
          />
          <EigenKnop naam="Bijwerken" icoon={RefreshCw} groot uitleg="Inhoudsopgave bijwerken: alleen paginanummers of de hele tabel" disabled={!p.beschikbaar} onClick={() => void p.inhoudBijwerken()} />
        </Groep>
        <Groep naam="Voetnoten">
          <EigenKnop naam="Voetnoot invoegen" icoon={Footprints} groot sneltoets="Ctrl+Alt+F" disabled={!p.bewerkbaar} onClick={() => p.noot("voetnoot")} />
          <div className="ribbon-stapel">
            <EigenKnop naam="Eindnoot invoegen" icoon={StickyNote} sneltoets="Ctrl+Alt+D" disabled={!p.bewerkbaar} onClick={() => p.noot("eindnoot")} />
            <EigenKnop naam="Volgende noot" icoon={ChevronRight} disabled={!p.beschikbaar} onClick={() => void p.volgendeNoot(1)} />
            <EigenKnop naam="Vorige noot" icoon={ChevronLeft} disabled={!p.beschikbaar} onClick={() => void p.volgendeNoot(-1)} />
          </div>
          <div className="ribbon-stapel">
            <EigenKnop naam="Noten tonen" icoon={ArrowDownToLine} uitleg="Overzicht; naar verwijzing of noot springen" disabled={!p.beschikbaar} onClick={() => void p.notenLijst()} />
            <EigenKnop naam="Notenopmaak" icoon={Ruler} uitleg="Nummering, notatie en plaats" disabled={!p.beschikbaar} onClick={() => void p.nootInstellingen()} />
          </div>
        </Groep>
      </>
    ),
  };
}

export { ArrowUpToLine };
