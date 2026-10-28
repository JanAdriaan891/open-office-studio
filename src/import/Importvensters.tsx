import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FileSpreadsheet, LockKeyhole } from "lucide-react";
import {
  CODERINGEN,
  bereidCsvVoor,
  herkenInstellingen,
  scheidingsnaam,
  typeerCel,
  type CsvCodering,
  type CsvInstellingen,
  type Datumvolgorde,
  type Kolomtype,
} from "./csvimport";
import "./import.css";

/** Modaal venster met focusval, Escape = annuleren. */
function Venster({
  titel,
  icoon,
  smal,
  annuleer,
  children,
}: {
  titel: string;
  icoon: ReactNode;
  smal?: boolean;
  annuleer: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const venster = useRef<HTMLElement>(null);
  useEffect(() => {
    const vorige = document.activeElement as HTMLElement | null;
    venster.current
      ?.querySelector<HTMLElement>("input, select, button")
      ?.focus();
    return () => {
      if (vorige?.isConnected) vorige.focus();
    };
  }, []);
  return (
    <div className="office-dialoogachtergrond">
      <section
        ref={venster}
        className={`office-dialoog importvenster${smal ? " is-smal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titel`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            annuleer();
          }
          if (event.key === "Tab") {
            const focusbaar = [
              ...(venster.current?.querySelectorAll<HTMLElement>(
                "input:not([disabled]), select:not([disabled]), button:not([disabled])",
              ) ?? []),
            ];
            const eerste = focusbaar[0],
              laatste = focusbaar[focusbaar.length - 1];
            if (event.shiftKey && document.activeElement === eerste) {
              event.preventDefault();
              laatste?.focus();
            } else if (!event.shiftKey && document.activeElement === laatste) {
              event.preventDefault();
              eerste?.focus();
            }
          }
        }}
      >
        <h2 id={`${id}-titel`}>
          {icoon} {titel}
        </h2>
        {children}
      </section>
    </div>
  );
}

const hoofdletter = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const TYPENAMEN: Record<Kolomtype, string> = {
  standaard: "Standaard",
  tekst: "Tekst",
  datum: "Datum",
  overslaan: "Overslaan",
};

function weergave(
  waarde: string,
  type: Kolomtype,
  instellingen: CsvInstellingen,
) {
  const cel = typeerCel(waarde, type, instellingen);
  if (cel.soort === "leeg") return { tekst: "", getal: false };
  if (cel.soort === "tekst")
    return {
      tekst: (cel.formuleachtig ? "'" : "") + cel.waarde,
      getal: false,
    };
  if (cel.soort === "getal")
    return {
      tekst: cel.procent
        ? `${(cel.waarde * 100).toLocaleString("nl-NL")}%`
        : cel.waarde.toLocaleString("nl-NL", { maximumFractionDigits: 10 }),
      getal: true,
    };
  const ms = Date.UTC(1899, 11, 30) + cel.waarde * 86400000;
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  const datum =
    instellingen.datumvolgorde === "MDJ"
      ? `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()}`
      : instellingen.datumvolgorde === "JMD"
        ? `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
        : `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
  return {
    tekst: cel.tijd
      ? `${datum} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
      : datum,
    getal: true,
  };
}

/** Importvenster voor CSV/TSV met voorvertoning van de eerste 50 rijen. */
export function CsvImportVenster({
  naam,
  bytes,
  ext,
  bevestig,
  annuleer,
}: {
  naam: string;
  bytes: Uint8Array;
  ext: string;
  bevestig: (instellingen: CsvInstellingen) => void;
  annuleer: () => void;
}) {
  const [instellingen, setInstellingen] = useState(() =>
    herkenInstellingen(bytes, ext),
  );
  const [eigenTeken, setEigenTeken] = useState("");
  const zet = (wijziging: Partial<CsvInstellingen>) =>
    setInstellingen((oud) => ({ ...oud, ...wijziging }));
  const voorbeeld = useMemo(() => {
    try {
      return { ...bereidCsvVoor(bytes, instellingen, 51), fout: "" };
    } catch (e) {
      return {
        rijen: [],
        kolommen: 0,
        codering: "",
        scheidingsteken: "",
        fout: String(e),
      };
    }
  }, [bytes, instellingen]);
  const vast = [";", ",", "\t", "|"];
  const scheidingKeuze = vast.includes(instellingen.scheidingsteken)
    ? instellingen.scheidingsteken
    : "eigen";
  const kolommen = Math.min(voorbeeld.kolommen, 200);
  const typen = Array.from(
    { length: kolommen },
    (_, k) => instellingen.kolomtypen[k] ?? "standaard",
  );
  const rijen = voorbeeld.rijen.slice(0, instellingen.kopregel ? 51 : 50);

  return (
    <Venster
      titel={`${naam} importeren`}
      icoon={<FileSpreadsheet size={18} />}
      annuleer={annuleer}
    >
      <div className="importvenster-raster">
        <label>
          Scheidingsteken
          <select
            value={scheidingKeuze}
            onChange={(e) =>
              zet({
                scheidingsteken:
                  e.target.value === "eigen"
                    ? eigenTeken || ";"
                    : e.target.value,
              })
            }
          >
            <option value=";">Puntkomma ;</option>
            <option value=",">Komma ,</option>
            <option value={"\t"}>Tab</option>
            <option value="|">Verticale streep |</option>
            <option value="eigen">Eigen teken…</option>
          </select>
        </label>
        {scheidingKeuze === "eigen" && (
          <label>
            Eigen teken
            <input
              type="text"
              maxLength={1}
              value={eigenTeken || instellingen.scheidingsteken}
              onChange={(e) => {
                setEigenTeken(e.target.value);
                if (e.target.value) zet({ scheidingsteken: e.target.value });
              }}
            />
          </label>
        )}
        <label>
          Tekstafbakening
          <select
            value={instellingen.tekstteken}
            onChange={(e) =>
              zet({
                tekstteken: e.target.value as CsvInstellingen["tekstteken"],
              })
            }
          >
            <option value={'"'}>Dubbel aanhalingsteken "</option>
            <option value="'">Enkel aanhalingsteken '</option>
            <option value="">Geen</option>
          </select>
        </label>
        <label>
          Tekencodering
          <select
            value={instellingen.codering}
            onChange={(e) => zet({ codering: e.target.value as CsvCodering })}
          >
            {CODERINGEN.map((c) => (
              <option key={c.waarde} value={c.waarde}>
                {c.naam}
                {c.waarde === "auto" && voorbeeld.codering
                  ? ` (${voorbeeld.codering})`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Getallen
          <select
            value={instellingen.getalnotatie}
            onChange={(e) =>
              zet({ getalnotatie: e.target.value as "nl" | "en" })
            }
          >
            <option value="nl">Nederlands (1.234,56)</option>
            <option value="en">Engels (1,234.56)</option>
          </select>
        </label>
        <label>
          Datumvolgorde
          <select
            value={instellingen.datumvolgorde}
            onChange={(e) =>
              zet({ datumvolgorde: e.target.value as Datumvolgorde })
            }
          >
            <option value="DMJ">Dag-maand-jaar (31-12-2026)</option>
            <option value="MDJ">Maand-dag-jaar (12/31/2026)</option>
            <option value="JMD">Jaar-maand-dag (2026-12-31)</option>
          </select>
        </label>
        <label>
          Vanaf rij
          <input
            type="text"
            inputMode="numeric"
            value={instellingen.beginrij + 1}
            onChange={(e) =>
              zet({
                beginrij: Math.max(
                  0,
                  Math.min(1000, (Number(e.target.value) || 1) - 1),
                ),
              })
            }
          />
        </label>
        <label className="importvenster-vink">
          <input
            type="checkbox"
            checked={instellingen.kopregel}
            onChange={(e) => zet({ kopregel: e.target.checked })}
          />
          Eerste rij is kopregel
        </label>
      </div>
      {voorbeeld.fout ? (
        <p className="importvenster-fout">{voorbeeld.fout}</p>
      ) : (
        <div
          className="importvenster-voorbeeld"
          role="region"
          aria-label="Voorbeeld van de eerste 50 rijen"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                {typen.map((type, k) => (
                  <th key={k} scope="col">
                    <select
                      aria-label={`Type van kolom ${k + 1}`}
                      value={type}
                      onChange={(e) => {
                        const kolomtypen = [...typen];
                        kolomtypen[k] = e.target.value as Kolomtype;
                        zet({ kolomtypen });
                      }}
                    >
                      {(Object.keys(TYPENAMEN) as Kolomtype[]).map((t) => (
                        <option key={t} value={t}>
                          {TYPENAMEN[t]}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rijen.map((rij, r) => {
                const kop = instellingen.kopregel && r === 0;
                return (
                  <tr key={r} className={kop ? "is-kop" : ""}>
                    {typen.map((type, k) => {
                      if (type === "overslaan")
                        return (
                          <td key={k} aria-hidden>
                            —
                          </td>
                        );
                      const w = weergave(
                        rij[k] ?? "",
                        kop ? "tekst" : type,
                        instellingen,
                      );
                      return (
                        <td
                          key={k}
                          className={w.getal ? "is-getal" : ""}
                          title={rij[k]}
                        >
                          {w.tekst}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="importvenster-uitleg">
        {hoofdletter(scheidingsnaam(voorbeeld.scheidingsteken || ";"))} als
        scheidingsteken, {kolommen} kolom(men). Kies <b>Tekst</b> voor
        postcodes, artikelnummers en IBAN; voorloopnullen en getallen van meer
        dan 15 cijfers blijven in Standaard al tekst. Waarden die met =, +, - of
        @ beginnen worden nooit als formule ingelezen (apostrof in de
        voorvertoning).
      </p>
      <div className="office-dialoogacties">
        <button type="button" onClick={annuleer}>
          Annuleren
        </button>
        <button
          type="button"
          className="office-dialoogdoorgaan"
          disabled={!!voorbeeld.fout}
          onClick={() => bevestig({ ...instellingen, kolomtypen: typen })}
        >
          Importeren
        </button>
      </div>
    </Venster>
  );
}

/** Vraagt het wachtwoord van een versleuteld document. Het wachtwoord wordt nergens bewaard. */
export function WachtwoordVenster({
  naam,
  fout,
  bevestig,
  annuleer,
}: {
  naam: string;
  fout?: string;
  bevestig: (wachtwoord: string) => void;
  annuleer: () => void;
}) {
  const [wachtwoord, setWachtwoord] = useState("");
  return (
    <Venster
      titel="Wachtwoord vereist"
      icoon={<LockKeyhole size={18} />}
      smal
      annuleer={annuleer}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (wachtwoord) bevestig(wachtwoord);
        }}
      >
        <p className="importvenster-uitleg">
          <b>{naam}</b> is met een wachtwoord versleuteld. Het wachtwoord wordt
          alleen gebruikt om het bestand op dit apparaat te openen en wordt niet
          bewaard.
        </p>
        <label>
          Wachtwoord
          <input
            type="password"
            autoComplete="off"
            value={wachtwoord}
            aria-invalid={!!fout}
            onChange={(e) => setWachtwoord(e.target.value)}
          />
        </label>
        {fout && <p className="importvenster-fout">{fout}</p>}
        <div className="office-dialoogacties">
          <button type="button" onClick={annuleer}>
            Annuleren
          </button>
          <button
            type="submit"
            className="office-dialoogdoorgaan"
            disabled={!wachtwoord}
          >
            Openen
          </button>
        </div>
      </form>
    </Venster>
  );
}

type Vraag =
  | {
      soort: "csv";
      naam: string;
      bytes: Uint8Array;
      ext: string;
      antwoord: (instellingen: CsvInstellingen | null) => void;
    }
  | {
      soort: "wachtwoord";
      naam: string;
      fout?: string;
      antwoord: (wachtwoord: string | null) => void;
    };

/**
 * De vragen die de openroute aan de gebruiker stelt, als beloftes, plus het
 * venster dat erbij hoort. Zo blijft de openroute zelf vrij van UI.
 */
export function useImportvragen() {
  const [vraag, setVraag] = useState<Vraag | null>(null);
  const vraagCsv = useCallback(
    (naam: string, bytes: Uint8Array, ext: string) =>
      new Promise<CsvInstellingen | null>((antwoord) =>
        setVraag({ soort: "csv", naam, bytes, ext, antwoord }),
      ),
    [],
  );
  const vraagWachtwoord = useCallback(
    (naam: string, fout?: string) =>
      new Promise<string | null>((antwoord) =>
        setVraag({ soort: "wachtwoord", naam, fout, antwoord }),
      ),
    [],
  );
  const beantwoord = <T,>(antwoord: (w: T) => void, waarde: T) => {
    setVraag(null);
    antwoord(waarde);
  };
  const venster =
    vraag?.soort === "csv" ? (
      <CsvImportVenster
        naam={vraag.naam}
        bytes={vraag.bytes}
        ext={vraag.ext}
        bevestig={(i) => beantwoord(vraag.antwoord, i)}
        annuleer={() => beantwoord(vraag.antwoord, null)}
      />
    ) : vraag?.soort === "wachtwoord" ? (
      <WachtwoordVenster
        key={vraag.fout ?? "eerste"}
        naam={vraag.naam}
        fout={vraag.fout}
        bevestig={(w) => beantwoord(vraag.antwoord, w)}
        annuleer={() => beantwoord(vraag.antwoord, null)}
      />
    ) : null;
  return { vraagCsv, vraagWachtwoord, venster, open: vraag !== null };
}
