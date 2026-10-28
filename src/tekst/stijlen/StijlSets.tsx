/**
 * Stijlset en thema-lettertypen (eenvoudig): het lettertypepaar van het
 * thema (koppen/hoofdtekst) en de alinea-afstand van het document
 * (docDefaults). Stijlen die thema-lettertypen gebruiken veranderen mee.
 */
import { useMemo, useState } from "react";
import { useDocxCommand } from "@betteroffice/docx-react";
import { Dialoog } from "../../werkruimte/Dialoog";
import { HERLAAD_MELDING } from "./Bevestiging";
import { useStijlen } from "./StijlenBeheer";
import { wijzigDocStandaarden, wijzigThemaLettertypen } from "./stijlenxml";

export const LETTERTYPEPAREN: { naam: string; koppen: string; tekst: string }[] = [
  { naam: "Office", koppen: "Calibri Light", tekst: "Calibri" },
  { naam: "Office 2007–2010", koppen: "Cambria", tekst: "Calibri" },
  { naam: "Klassiek", koppen: "Liberation Serif", tekst: "Liberation Serif" },
  { naam: "Modern", koppen: "Montserrat", tekst: "Inter" },
  { naam: "Rapport", koppen: "Source Serif 4", tekst: "Source Sans 3" },
  { naam: "Elegant", koppen: "Playfair Display", tekst: "Lato" },
  { naam: "Boek", koppen: "EB Garamond", tekst: "EB Garamond" },
  { naam: "Technisch", koppen: "IBM Plex Sans", tekst: "Noto Serif" },
  { naam: "Toegankelijk", koppen: "Atkinson Hyperlegible", tekst: "Atkinson Hyperlegible" },
];

export const AFSTANDEN: { naam: string; ruimteNa: number; regelafstand: number; uitleg: string }[] = [
  { naam: "Standaard (Word 2013+)", ruimteNa: 8, regelafstand: 1.08, uitleg: "8 pt na, regelafstand 1,08" },
  { naam: "Compact", ruimteNa: 4, regelafstand: 1, uitleg: "4 pt na, enkel" },
  { naam: "Geen alinea-afstand", ruimteNa: 0, regelafstand: 1, uitleg: "0 pt na, enkel" },
  { naam: "Ruim", ruimteNa: 10, regelafstand: 1.15, uitleg: "10 pt na, 1,15" },
  { naam: "Open", ruimteNa: 12, regelafstand: 1.5, uitleg: "12 pt na, 1,5" },
  { naam: "Dubbel", ruimteNa: 8, regelafstand: 2, uitleg: "8 pt na, dubbel" },
];

export function StijlSets() {
  const staat = useStijlen();
  const fonts = staat.thema?.fontScheme;
  const huidigKoppen = fonts?.majorFont?.latin ?? "";
  const huidigTekst = fonts?.minorFont?.latin ?? "";
  const beschikbaar = useDocxCommand("fontFamily").state.options ?? [];
  const [koppen, setKoppen] = useState(huidigKoppen);
  const [tekst, setTekst] = useState(huidigTekst);
  const [afstand, setAfstand] = useState<number | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const paar = useMemo(
    () => LETTERTYPEPAREN.findIndex((p) => p.koppen === koppen && p.tekst === tekst),
    [koppen, tekst],
  );
  const zonderThema = !staat.thema?.fontScheme;

  async function toepassen() {
    setBezig(true);
    setFout("");
    try {
      const veranderd = await staat.herlaadStijlen((o) => {
        const uit: { stijlen?: string; thema?: string } = {};
        if ((koppen !== huidigKoppen || tekst !== huidigTekst) && o.thema)
          uit.thema = wijzigThemaLettertypen(o.thema, {
            koppen: koppen.trim() || undefined,
            tekst: tekst.trim() || undefined,
          });
        if (afstand !== null) {
          const a = AFSTANDEN[afstand];
          uit.stijlen = wijzigDocStandaarden(o.stijlen, { ruimteNa: a.ruimteNa, regelafstand: a.regelafstand });
        }
        return uit;
      });
      if (!veranderd) setBezig(false);
      staat.sluit();
    } catch (error) {
      setBezig(false);
      setFout(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Dialoog
      titel="Stijlset en thema-lettertypen"
      sluit={staat.sluit}
      acties={
        <>
          {fout && <span className="werkruimte-melding werkruimte-fout" role="alert">{fout}</span>}
          <button type="button" className="werkruimte-knop" onClick={staat.sluit}>Annuleren</button>
          <button type="button" className="werkruimte-knop is-primair" disabled={bezig} onClick={() => void toepassen()}>
            Toepassen
          </button>
        </>
      }
    >
      <fieldset className="werkruimte-groep" disabled={zonderThema}>
        <legend>Thema-lettertypen</legend>
        {zonderThema && <p className="werkruimte-uitleg">Dit document heeft geen thema met lettertypen.</p>}
        <label className="werkruimte-veld">
          <span>Lettertypepaar</span>
          <select
            value={paar}
            onChange={(e) => {
              const p = LETTERTYPEPAREN[Number(e.target.value)];
              if (p) {
                setKoppen(p.koppen);
                setTekst(p.tekst);
              }
            }}
          >
            <option value={-1}>(eigen keuze)</option>
            {LETTERTYPEPAREN.map((p, i) => (
              <option key={p.naam} value={i}>
                {p.naam}: {p.koppen} / {p.tekst}
              </option>
            ))}
          </select>
        </label>
        <label className="werkruimte-veld">
          <span>Koppen</span>
          <input type="text" list="tekst-set-lettertypen" value={koppen} onChange={(e) => setKoppen(e.target.value)} />
        </label>
        <label className="werkruimte-veld">
          <span>Hoofdtekst</span>
          <input type="text" list="tekst-set-lettertypen" value={tekst} onChange={(e) => setTekst(e.target.value)} />
        </label>
        <datalist id="tekst-set-lettertypen">
          {beschikbaar.map((o) => (
            <option key={o.label} value={o.label} />
          ))}
        </datalist>
        <div className="tekst-set-voorbeeld" aria-hidden="true">
          <strong style={{ fontFamily: `"${koppen}", sans-serif` }}>Kop in {koppen || "—"}</strong>
          <span style={{ fontFamily: `"${tekst}", sans-serif` }}>Hoofdtekst in {tekst || "—"}: de snelle bruine vos.</span>
        </div>
        <p className="werkruimte-uitleg">
          Alleen stijlen die de thema-lettertypen gebruiken (zoals in de meeste Word-documenten) veranderen mee.
        </p>
      </fieldset>
      <fieldset className="werkruimte-groep">
        <legend>Alinea-afstand van het document</legend>
        <div className="werkruimte-keuzes">
          <label>
            <input type="radio" name="tekst-afstand" checked={afstand === null} onChange={() => setAfstand(null)} /> Niet wijzigen
          </label>
          {AFSTANDEN.map((a, i) => (
            <label key={a.naam} title={a.uitleg}>
              <input type="radio" name="tekst-afstand" checked={afstand === i} onChange={() => setAfstand(i)} /> {a.naam}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="werkruimte-uitleg">{HERLAAD_MELDING}</p>
    </Dialoog>
  );
}
