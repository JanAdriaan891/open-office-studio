import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useDocxCommand, useDocxCommands } from "@betteroffice/docx-react";
import { Table } from "lucide-react";
import { Actie, RibbonFout } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import { meetCursor, type Meting } from "./meten";
import {
  afmetingTekst,
  afmetingUitleg,
  begrens,
  binnen,
  celOnderPunt,
  GRENZEN,
  RASTER,
  verplaats,
  zelfdeGrootte,
  type Tabelgrootte,
} from "./raster";
import { TabelVoorbeeld } from "./TabelVoorbeeld";
import "./tabelvoorbeeld.css";

/** Maat van één rastercel en de ruimte ertussen, in pixels (zie de CSS). */
const CEL = 16;
const TUSSEN = 3;

/**
 * Lintknop Invoegen → Tabel: een keuzeraster met live voorbeeld bij de cursor,
 * en de dialoog ‘Tabel invoegen…’ met getallen.
 */
export function TabelKiezer() {
  const api = useEditorApi().tekst;
  const opdrachten = useDocxCommands();
  const meld = useContext(RibbonFout);
  const bewerkbaar = useDocxCommand("insertTable").state.enabled;
  const knop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<"raster" | "dialoog" | null>(null);
  const [meting, setMeting] = useState<Meting | null>(null);
  const [keuze, setKeuze] = useState<Tabelgrootte | null>(null);

  function openen(soort: "raster" | "dialoog") {
    setMeting(meetCursor(api()));
    setKeuze(soort === "dialoog" ? { kolommen: 5, rijen: 2 } : null);
    setOpen(soort);
  }
  function sluiten(terugNaarDocument: boolean) {
    setOpen(null);
    setKeuze(null);
    setMeting(null);
    if (terugNaarDocument) api()?.focus();
  }
  function invoegen(grootte: Tabelgrootte) {
    const { rijen, kolommen } = begrens(grootte);
    sluiten(true);
    opdrachten
      .execute("insertTable", { rows: rijen, columns: kolommen })
      .then((resultaat) => {
        if (!resultaat.ok) meld(resultaat.failure.message);
      })
      .catch((error) => meld(error instanceof Error ? error.message : String(error)));
  }

  return (
    <div ref={knop} className="tabelkiezer">
      <Actie
        naam="Tabel"
        icoon={Table}
        groot
        disabled={!bewerkbaar}
        aria-haspopup="dialog"
        aria-expanded={open === "raster"}
        title="Tabel · Kies het aantal rijen en kolommen"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open === "raster" ? sluiten(true) : openen("raster"))}
      />
      {open && meting && keuze && <TabelVoorbeeld grootte={keuze} meting={meting} />}
      {open === "raster" && (
        <Raster
          anker={knop.current}
          keuze={keuze}
          kies={(nieuw) => setKeuze((oud) => (zelfdeGrootte(oud, nieuw) ? oud : nieuw))}
          invoegen={invoegen}
          sluiten={sluiten}
          dialoog={() => openen("dialoog")}
        />
      )}
      {open === "dialoog" && keuze && (
        <TabelDialoog
          keuze={keuze}
          kies={setKeuze}
          invoegen={invoegen}
          sluiten={() => sluiten(true)}
        />
      )}
    </div>
  );
}

function Raster({
  anker,
  keuze,
  kies,
  invoegen,
  sluiten,
  dialoog,
}: {
  anker: HTMLElement | null;
  keuze: Tabelgrootte | null;
  kies: (grootte: Tabelgrootte | null) => void;
  invoegen: (grootte: Tabelgrootte) => void;
  sluiten: (terugNaarDocument: boolean) => void;
  dialoog: () => void;
}) {
  const paneel = useRef<HTMLDivElement>(null);
  const raster = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const r = anker?.getBoundingClientRect();
    const breedte = paneel.current?.offsetWidth ?? 220;
    if (r)
      setPlek({
        left: Math.max(8, Math.min(r.left, window.innerWidth - breedte - 8)),
        top: r.bottom + 4,
      });
    raster.current?.focus();
  }, [anker]);
  useEffect(() => {
    const buiten = (event: PointerEvent) => {
      const doel = event.target as Node;
      if (!paneel.current?.contains(doel) && !anker?.contains(doel)) sluiten(false);
    };
    const weg = () => sluiten(false);
    document.addEventListener("pointerdown", buiten, true);
    window.addEventListener("blur", weg);
    window.addEventListener("resize", weg);
    return () => {
      document.removeEventListener("pointerdown", buiten, true);
      window.removeEventListener("blur", weg);
      window.removeEventListener("resize", weg);
    };
  }, [anker, sluiten]);

  const cel = (event: MouseEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    return celOnderPunt(event.clientX - r.left, event.clientY - r.top, CEL, TUSSEN);
  };
  const cellen = [];
  for (let rij = 1; rij <= RASTER.rijen; rij++)
    for (let kolom = 1; kolom <= RASTER.kolommen; kolom++)
      cellen.push(
        <span
          key={`${rij}-${kolom}`}
          className="tabelkiezer-cel"
          data-gekozen={binnen(keuze, rij, kolom) || undefined}
        />,
      );

  return createPortal(
    <div
      ref={paneel}
      className="tabelkiezer-paneel"
      role="dialog"
      aria-label="Tabel invoegen"
      style={{ left: plek.left, top: plek.top }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          sluiten(true);
        }
      }}
    >
      <div className="tabelkiezer-kop" aria-hidden="true">
        {keuze ? `Tabel ${afmetingTekst(keuze)}` : "Tabel invoegen"}
      </div>
      <div
        ref={raster}
        className="tabelkiezer-raster"
        role="slider"
        tabIndex={0}
        aria-label="Tabelgrootte, kolommen bij rijen"
        aria-valuetext={afmetingUitleg(keuze)}
        style={{
          gridTemplateColumns: `repeat(${RASTER.kolommen}, ${CEL}px)`,
          gridAutoRows: `${CEL}px`,
          gap: TUSSEN,
        }}
        onMouseMove={(event) => {
          const onder = cel(event);
          if (onder) kies(onder);
        }}
        onMouseLeave={() => kies(null)}
        onClick={(event) => {
          const onder = cel(event);
          if (onder) invoegen(onder);
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && keuze) {
            event.preventDefault();
            invoegen(keuze);
            return;
          }
          const nieuw = verplaats(keuze, event.key);
          if (nieuw) {
            event.preventDefault();
            event.stopPropagation();
            kies(nieuw);
          }
        }}
        onBlur={(event) => {
          if (!paneel.current?.contains(event.relatedTarget as Node | null)) kies(null);
        }}
      >
        {cellen}
      </div>
      <div className="tabelkiezer-afmeting" aria-live="polite">
        {keuze ? afmetingTekst(keuze) : "Beweeg of gebruik de pijltjestoetsen"}
      </div>
      <button
        type="button"
        className="tabelkiezer-menu"
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            raster.current?.focus();
          }
        }}
        onClick={dialoog}
      >
        Tabel invoegen…
      </button>
    </div>,
    document.body,
  );
}

function TabelDialoog({
  keuze,
  kies,
  invoegen,
  sluiten,
}: {
  keuze: Tabelgrootte;
  kies: (grootte: Tabelgrootte) => void;
  invoegen: (grootte: Tabelgrootte) => void;
  sluiten: () => void;
}) {
  const eerste = useRef<HTMLInputElement>(null);
  const [tekst, setTekst] = useState({
    kolommen: String(keuze.kolommen),
    rijen: String(keuze.rijen),
  });
  useEffect(() => {
    eerste.current?.focus();
    eerste.current?.select();
  }, []);
  const geldig = (waarde: string, max: number) => {
    const n = Number(waarde);
    return Number.isInteger(n) && n >= 1 && n <= max;
  };
  const klopt =
    geldig(tekst.kolommen, GRENZEN.kolommen) && geldig(tekst.rijen, GRENZEN.rijen);
  function wijzig(veld: "kolommen" | "rijen", waarde: string) {
    const volgende = { ...tekst, [veld]: waarde };
    setTekst(volgende);
    const n = Number(waarde);
    if (Number.isFinite(n) && n >= 1) kies(begrens({ ...keuze, [veld]: n }));
  }
  const veld = (soort: "kolommen" | "rijen", label: string) => (
    <label className="tekst-veld">
      {label}
      <input
        ref={soort === "kolommen" ? eerste : undefined}
        type="number"
        inputMode="numeric"
        min={1}
        max={GRENZEN[soort]}
        value={tekst[soort]}
        aria-invalid={!geldig(tekst[soort], GRENZEN[soort])}
        onChange={(event) => wijzig(soort, event.target.value)}
      />
    </label>
  );
  return createPortal(
    <div
      className="tabelvoorbeeld-dialoogachtergrond"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) sluiten();
      }}
    >
      <form
        className="office-dialoog tekst-dialoog tabelvoorbeeld-dialoog"
        role="dialog"
        aria-modal="true"
        aria-label="Tabel invoegen"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            sluiten();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (klopt) invoegen({ kolommen: Number(tekst.kolommen), rijen: Number(tekst.rijen) });
        }}
      >
        <h2>Tabel invoegen</h2>
        <div className="tabelvoorbeeld-velden">
          {veld("kolommen", "Aantal kolommen")}
          {veld("rijen", "Aantal rijen")}
        </div>
        <p className="tabelvoorbeeld-toelichting">
          {klopt
            ? `Het voorbeeld bij de cursor toont een tabel van ${afmetingUitleg(keuze)}.`
            : `Kies 1 tot ${GRENZEN.kolommen} kolommen en 1 tot ${GRENZEN.rijen} rijen.`}
        </p>
        <div className="office-dialoogacties">
          <button type="submit" className="office-dialoogdoorgaan" disabled={!klopt}>
            Invoegen
          </button>
          <button type="button" onClick={sluiten}>
            Annuleren
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
