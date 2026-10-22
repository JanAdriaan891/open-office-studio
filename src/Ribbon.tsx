import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";

export const RibbonFout = createContext<(bericht: string) => void>(() => {});
const opdrachtToelichtingen: Record<string, string> = {
  "Nothing to undo.": "Er is niets om ongedaan te maken.",
  "Nothing to redo.": "Er is niets om opnieuw uit te voeren.",
  "There is nothing to undo.": "Er is niets om ongedaan te maken.",
  "There is nothing to redo.": "Er is niets om opnieuw uit te voeren.",
  "The presentation is still opening.": "De presentatie wordt nog geopend.",
  "Select a shape first.": "Selecteer eerst een vorm.",
};

export interface RibbonTab {
  id: string;
  naam: string;
  inhoud: ReactNode;
}

export function Ribbon({
  tabs,
  bestand,
}: {
  tabs: RibbonTab[];
  bestand?: () => void;
}) {
  const [gekozen, setGekozen] = useState(tabs[0].id);
  const [ingeklapt, setIngeklapt] = useState(false);
  const basis = useId();
  const actief = tabs.find((tab) => tab.id === gekozen) ?? tabs[0];
  return (
    <div className="ribbon">
      <div className="ribbon-tabs">
        {bestand && (
          <button className="ribbon-bestand" onClick={bestand}>
            Bestand
          </button>
        )}
        <div className="ribbon-tabknoppen" role="tablist" aria-label="Lint">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              role="tab"
              id={`${basis}-${tab.id}`}
              aria-selected={actief.id === tab.id}
              aria-controls={`${basis}-paneel`}
              tabIndex={actief.id === tab.id ? 0 : -1}
              onClick={() => {
                setGekozen(tab.id);
                setIngeklapt(false);
              }}
              onKeyDown={(event) => {
                const volgende =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : -1;
                if (volgende < 0) return;
                event.preventDefault();
                setGekozen(tabs[volgende].id);
                setIngeklapt(false);
                document
                  .getElementById(`${basis}-${tabs[volgende].id}`)
                  ?.focus();
              }}
            >
              {tab.naam}
            </button>
          ))}
        </div>
        <button
          className="ribbon-inklap"
          aria-label={ingeklapt ? "Lint weergeven" : "Lint verbergen"}
          title={ingeklapt ? "Lint weergeven" : "Meer ruimte voor je document"}
          aria-expanded={!ingeklapt}
          aria-controls={`${basis}-paneel`}
          onClick={() => setIngeklapt(!ingeklapt)}
        >
          {ingeklapt ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      <div
        className="ribbon-inhoud"
        role="tabpanel"
        id={`${basis}-paneel`}
        aria-labelledby={`${basis}-${actief.id}`}
        hidden={ingeklapt}
      >
        {actief.inhoud}
      </div>
    </div>
  );
}

export function Groep({
  naam,
  children,
  className = "",
}: {
  naam: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ribbon-groep ${className}`} aria-label={naam}>
      <div className="ribbon-groep-inhoud">{children}</div>
      <span className="ribbon-groep-naam">{naam}</span>
    </section>
  );
}

export function Actie({
  icoon: Icoon,
  naam,
  groot,
  actief,
  ...props
}: {
  icoon: LucideIcon;
  naam: string;
  groot?: boolean;
  actief?: boolean | "mixed";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      {...props}
      className={`ribbon-actie ${groot ? "ribbon-groot" : ""} ${props.className ?? ""}`}
      aria-label={naam}
      aria-pressed={actief}
      title={props.title ?? naam}
    >
      <Icoon size={groot ? 25 : 17} strokeWidth={1.65} />
      <span>{naam}</span>
    </button>
  );
}

export interface GebondenOpdracht {
  label: string;
  shortcut: string | null;
  state: {
    enabled: boolean;
    active?: boolean | "mixed";
    value?: unknown;
    disabledReason?: { message: string };
    options?: readonly {
      label: string;
      args: unknown;
      state?: { enabled: boolean; active?: boolean | "mixed" };
    }[];
  };
  execute: (
    args?: never,
  ) => Promise<{ ok: boolean; failure?: { message: string } }>;
}

function useUitvoeren(opdracht: GebondenOpdracht) {
  const fout = useContext(RibbonFout);
  return (args?: unknown) => {
    void opdracht
      .execute(args as never)
      .then((resultaat) => {
        if (!resultaat.ok)
          fout(
            resultaat.failure?.message ??
              "De opdracht kon niet worden uitgevoerd.",
          );
      })
      .catch((error) =>
        fout(error instanceof Error ? error.message : String(error)),
      );
  };
}

export function OpdrachtKnop({
  opdracht,
  ...props
}: {
  opdracht: GebondenOpdracht;
  icoon: LucideIcon;
  naam: string;
  groot?: boolean;
}) {
  const uitvoeren = useUitvoeren(opdracht);
  const toelichting = opdracht.state.enabled
    ? opdracht.shortcut
    : opdracht.state.disabledReason?.message;
  const uitleg = toelichting
    ? (opdrachtToelichtingen[toelichting] ?? toelichting)
    : null;
  return (
    <Actie
      {...props}
      disabled={!opdracht.state.enabled}
      actief={opdracht.state.active}
      title={`${props.naam}${uitleg ? ` · ${uitleg}` : ""}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => uitvoeren()}
    />
  );
}

export function OpdrachtKeuze({
  opdracht,
  naam,
  breed,
  vertaal,
}: {
  opdracht: GebondenOpdracht;
  naam: string;
  breed?: boolean;
  vertaal?: (naam: string) => string;
}) {
  const uitvoeren = useUitvoeren(opdracht);
  const opties = opdracht.state.options ?? [];
  const gekozen = opties.findIndex((optie) => {
    if (optie.state) return optie.state.active === true;
    const waarden = Object.values(
      (optie.args ?? {}) as Record<string, unknown>,
    );
    return waarden.length === 1 && waarden[0] === opdracht.state.value;
  });
  return (
    <label
      className={`ribbon-keuze ${breed ? "ribbon-keuze-breed" : ""}`}
      title={naam}
    >
      <select
        aria-label={naam}
        disabled={!opdracht.state.enabled}
        value={gekozen < 0 ? "" : gekozen}
        onChange={(event) => uitvoeren(opties[Number(event.target.value)].args)}
      >
        {gekozen < 0 && (
          <option value="">
            {typeof opdracht.state.value === "string"
              ? opdracht.state.value
              : naam}
          </option>
        )}
        {opties.map((optie, index) => (
          <option
            key={index}
            value={index}
            disabled={optie.state?.enabled === false}
          >
            {vertaal?.(optie.label) ?? optie.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} />
    </label>
  );
}

export function OpdrachtKleur({
  opdracht,
  naam,
  icoon: Icoon,
  args,
}: {
  opdracht: GebondenOpdracht;
  naam: string;
  icoon: LucideIcon;
  args: (kleur: string) => unknown;
}) {
  const uitvoeren = useUitvoeren(opdracht);
  const waarde =
    typeof opdracht.state.value === "string"
      ? opdracht.state.value.replace(/^#/, "")
      : "";
  const kleur = /^[0-9a-f]{6}$/i.test(waarde) ? `#${waarde}` : "#36363e";
  return (
    <label
      className="ribbon-kleur"
      title={naam}
      data-disabled={!opdracht.state.enabled}
    >
      <Icoon size={17} strokeWidth={1.65} />
      <i style={{ background: kleur }} />
      <ChevronDown size={10} />
      <input
        type="color"
        aria-label={naam}
        value={kleur}
        disabled={!opdracht.state.enabled}
        onInput={(event) => uitvoeren(args(event.currentTarget.value))}
        onChange={(event) => uitvoeren(args(event.target.value))}
      />
    </label>
  );
}

export function OpdrachtGetal({
  opdracht,
  naam,
  args,
}: {
  opdracht: GebondenOpdracht;
  naam: string;
  args: (waarde: number) => unknown;
}) {
  const uitvoeren = useUitvoeren(opdracht);
  const [waarde, setWaarde] = useState(String(opdracht.state.value ?? ""));
  useEffect(
    () => setWaarde(String(opdracht.state.value ?? "")),
    [opdracht.state.value],
  );
  function toepassen() {
    const getal = Number(waarde);
    if (getal >= 1 && getal <= 400 && getal !== opdracht.state.value)
      uitvoeren(args(getal));
    else setWaarde(String(opdracht.state.value ?? ""));
  }
  return (
    <input
      className="ribbon-getal"
      type="number"
      aria-label={naam}
      title={naam}
      min={1}
      max={400}
      value={waarde}
      disabled={!opdracht.state.enabled}
      onChange={(event) => setWaarde(event.target.value)}
      onBlur={toepassen}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          toepassen();
        }
        if (event.key === "Escape")
          setWaarde(String(opdracht.state.value ?? ""));
        event.stopPropagation();
      }}
    />
  );
}
