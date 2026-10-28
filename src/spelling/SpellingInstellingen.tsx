/**
 * Groep "Spelling en autocorrectie" in het instellingenvenster, met de
 * persoonlijke woordenlijst.
 */
import { useState } from "react";
import { useInstellingen, wijzigInstellingen } from "../instellingen";
import { useWoordenlijsten } from "./woordenlijst";

export function SpellingInstellingen() {
  const { spelling } = useInstellingen();
  const { persoonlijk } = useWoordenlijsten();
  const [lijstOpen, setLijstOpen] = useState(false);
  const vink = (sleutel: keyof typeof spelling, tekst: string) => (
    <label className="werkruimte-vink">
      <input
        type="checkbox"
        checked={spelling[sleutel]}
        onChange={(e) => wijzigInstellingen({ spelling: { [sleutel]: e.target.checked } })}
      />
      {tekst}
    </label>
  );
  const woorden = persoonlijk.alle();
  return (
    <fieldset className="werkruimte-groep">
      <legend>Spelling en autocorrectie</legend>
      {vink("controleren", "Spelling controleren tijdens het typen (rode golflijn)")}
      {vink("hoofdletterwoordenNegeren", "Woorden in HOOFDLETTERS negeren")}
      {vink("cijferwoordenNegeren", "Woorden met cijfers negeren")}
      {vink(
        "autocorrectie",
        "Autocorrectie: TWee HOofdletters, hoofdletter aan het zinsbegin en veelvoorkomende typefouten",
      )}
      <p className="werkruimte-uitleg">
        Woordenboeken: OpenTaal (Nederlands) en SCOWL (Engels, VK en VS). Rechtsklik op een onderstreept woord
        voor suggesties; F7 opent het deelvenster Spelling en grammatica.
      </p>
      <button type="button" className="werkruimte-knop" onClick={() => setLijstOpen(!lijstOpen)} aria-expanded={lijstOpen}>
        Persoonlijke woordenlijst ({woorden.length})…
      </button>
      {lijstOpen && (
        <ul className="werkruimte-uitleg" aria-label="Persoonlijke woordenlijst" style={{ maxHeight: 160, overflow: "auto" }}>
          {!woorden.length && <li>Nog geen woorden toegevoegd.</li>}
          {woorden.map((w) => (
            <li key={w} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              {w}
              <button type="button" className="werkruimte-knop" aria-label={`${w} verwijderen`} onClick={() => persoonlijk.verwijder(w)}>
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
