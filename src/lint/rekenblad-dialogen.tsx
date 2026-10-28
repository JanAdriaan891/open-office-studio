import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import {
  Melding,
  allesVervangen,
  benoemdeBereiken,
  bladHernoemen,
  gaNaar,
  vervangHuidige,
  zoekVolgende,
} from "./rekenblad-opdrachten";

function Paneel({
  titel,
  sluiten,
  children,
}: {
  titel: string;
  sluiten: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const paneel = useRef<HTMLElement>(null);
  useEffect(() => {
    paneel.current?.querySelector<HTMLInputElement>("input")?.select();
  }, []);
  return createPortal(
    <section
      ref={paneel}
      className="rekenblad-paneel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={id}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          sluiten();
        }
      }}
    >
      <header>
        <h2 id={id}>{titel}</h2>
        <button
          type="button"
          aria-label="Sluiten"
          title="Sluiten (Esc)"
          onClick={sluiten}
        >
          <X size={15} />
        </button>
      </header>
      {children}
    </section>,
    document.body,
  );
}

const tekstVan = (fout: unknown) =>
  fout instanceof Melding || fout instanceof Error
    ? fout.message
    : String(fout);

export function ZoekenVervangen({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const [zoek, setZoek] = useState("");
  const [door, setDoor] = useState("");
  const [hoofdletters, setHoofdletters] = useState(false);
  const [status, setStatus] = useState("");
  const bezig = useRef(false);
  async function doe(actie: () => Promise<string>) {
    if (bezig.current || !zoek) return;
    bezig.current = true;
    try {
      setStatus(await actie());
    } catch (fout) {
      setStatus(tekstVan(fout));
    } finally {
      bezig.current = false;
    }
  }
  const zoeken = (terug = false) =>
    doe(async () => {
      const r = await zoekVolgende(api, zoek, hoofdletters, terug);
      return r
        ? `${r.treffer.sheetName}!${r.treffer.a1} · ${r.aantal} ${r.aantal === 1 ? "resultaat" : "resultaten"}`
        : "Zoekterm niet gevonden.";
    });
  return (
    <Paneel titel="Zoeken en vervangen" sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={(event) => {
          event.preventDefault();
          void zoeken(false);
        }}
      >
        <label>
          Zoeken naar
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} />
        </label>
        <label>
          Vervangen door
          <input value={door} onChange={(e) => setDoor(e.target.value)} />
        </label>
        <label className="rekenblad-vinkje">
          <input
            type="checkbox"
            checked={hoofdletters}
            onChange={(e) => setHoofdletters(e.target.checked)}
          />
          Hoofdlettergevoelig
        </label>
        <div className="rekenblad-knoppen">
          <button type="button" disabled={!zoek} onClick={() => zoeken(true)}>
            Vorige
          </button>
          <button type="submit" disabled={!zoek}>
            Volgende
          </button>
          <button
            type="button"
            disabled={!zoek}
            onClick={() =>
              doe(async () => {
                const r = await vervangHuidige(api, zoek, door, hoofdletters);
                return r.vervangen
                  ? "1 cel vervangen."
                  : r.volgende
                    ? "Volgende resultaat geselecteerd; klik nogmaals om te vervangen."
                    : "Zoekterm niet gevonden.";
              })
            }
          >
            Vervangen
          </button>
          <button
            type="button"
            className="rekenblad-primair"
            disabled={!zoek}
            onClick={() =>
              doe(async () => {
                const r = await allesVervangen(api, zoek, door, hoofdletters);
                return (
                  `${r.vervangen} ${r.vervangen === 1 ? "cel" : "cellen"} vervangen.` +
                  (r.overgeslagen
                    ? ` ${r.overgeslagen} overgeslagen (formules of opgemaakte weergave).`
                    : "")
                );
              })
            }
          >
            Alles vervangen
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}

export function GaNaar({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const [tekst, setTekst] = useState("");
  const [status, setStatus] = useState("");
  const [namen] = useState(() => benoemdeBereiken(api));
  const lijst = useId();
  async function ga(doel: string) {
    try {
      await gaNaar(api, doel);
      sluiten();
    } catch (fout) {
      setStatus(tekstVan(fout));
    }
  }
  return (
    <Paneel titel="Navigator" sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={(event) => {
          event.preventDefault();
          if (tekst.trim()) void ga(tekst);
        }}
      >
        <label>
          Ga naar cel, bereik of naam
          <input
            value={tekst}
            placeholder="Bijvoorbeeld B4, A1:C10 of Blad 2!A1"
            list={namen.length ? lijst : undefined}
            onChange={(e) => setTekst(e.target.value)}
          />
        </label>
        {namen.length > 0 && (
          <>
            <datalist id={lijst}>
              {namen.map((n) => (
                <option key={n.naam} value={n.naam} />
              ))}
            </datalist>
            <ul className="rekenblad-namen" aria-label="Benoemde bereiken">
              {namen.map((n) => (
                <li key={n.naam}>
                  <button type="button" onClick={() => ga(n.naam)}>
                    <strong>{n.naam}</strong>
                    <span>{n.verwijzing}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="rekenblad-knoppen">
          <button
            type="submit"
            className="rekenblad-primair"
            disabled={!tekst.trim()}
          >
            Ga naar
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}

export function BladHernoemen({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const info = api.handle.sheetInfo();
  const [naam, setNaam] = useState(info.sheetNames[info.activeSheet] ?? "");
  const [status, setStatus] = useState("");
  return (
    <Paneel titel="Blad hernoemen" sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await bladHernoemen(api, naam);
            sluiten();
          } catch (fout) {
            setStatus(tekstVan(fout));
          }
        }}
      >
        <label>
          Naam
          <input
            value={naam}
            maxLength={31}
            onChange={(e) => setNaam(e.target.value)}
          />
        </label>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            Annuleren
          </button>
          <button type="submit" className="rekenblad-primair">
            Hernoemen
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}
