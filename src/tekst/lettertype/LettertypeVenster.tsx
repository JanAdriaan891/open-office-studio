import { useContext, useId, useMemo, useState } from "react";
import { useDocxCommand } from "@betteroffice/docx-react";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { DocumentLettertypen } from "../../lettertypen/context";
import { lettertypeGroepen, recenteLettertypen } from "../../lettertypen/LettertypeKeuze";
import { bekendeSysteemLettertypen } from "../../lettertypen/systeem";
import type { TekenOpmaak } from "../opmaak";
import { GetalVeld, Keuze, KleurVeld, Sectie, Tabbladen, Vink } from "../velden";
import {
  metEffect,
  onderstrepingNamen,
  stijlNamen,
  voorbeeldStijl,
  wijzigingUit,
  type Hoogte,
  type LettertypeFormulier,
  type Richting,
} from "./model";

type Tab = "lettertype" | "geavanceerd";

function FamilieKeuze({ waarde, wijzig }: { waarde: string; wijzig: (familie: string) => void }) {
  const id = useId();
  const engine = useDocxCommand("fontFamily").state.options?.map((o) => o.label) ?? [];
  const document = useContext(DocumentLettertypen);
  const groepen = useMemo(
    () =>
      lettertypeGroepen({
        document: [waarde, ...document],
        recent: recenteLettertypen(),
        engine,
        systeem: bekendeSysteemLettertypen(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document, engine.length],
  );
  return (
    <div className="tekstopmaak-veld">
      <label htmlFor={id}>Lettertype</label>
      <select id={id} value={waarde} onChange={(e) => wijzig(e.target.value)} data-autofocus>
        {groepen.map((g) => (
          <optgroup key={g.naam} label={g.naam}>
            {g.regels.map((r) => (
              <option key={`${g.naam}:${r.familie}`} value={r.familie} style={{ fontFamily: `"${r.familie}"` }}>
                {r.familie}
                {r.vervanger ? ` (→ ${r.vervanger})` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

export function LettertypeVenster({
  begin,
  voorbeeldTekst,
  toepassen,
  sluit,
}: {
  begin: LettertypeFormulier;
  voorbeeldTekst: string;
  toepassen: (wijziging: TekenOpmaak) => void;
  sluit: () => void;
}) {
  const [tab, setTab] = useState<Tab>("lettertype");
  const [f, setF] = useState(begin);
  const zet = <K extends keyof LettertypeFormulier>(k: K, w: LettertypeFormulier[K]) => setF((o) => ({ ...o, [k]: w }));
  const effect = (k: keyof LettertypeFormulier) => (aan: boolean) => setF((o) => metEffect(o, k, aan));
  const wijziging = wijzigingUit(begin, f);
  return (
    <Dialoog
      titel="Lettertype"
      sluit={sluit}
      className="tekstopmaak"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            Annuleren
          </button>
          <button
            type="button"
            className="werkruimte-knop is-primair"
            onClick={() => (Object.keys(wijziging).length ? toepassen(wijziging) : sluit())}
          >
            OK
          </button>
        </>
      }
    >
      <Tabbladen
        tabs={[
          ["lettertype", "Lettertype"],
          ["geavanceerd", "Geavanceerd"],
        ]}
        actief={tab}
        kies={setTab}
      >
        {tab === "lettertype" ? (
          <>
            <Sectie titel="Lettertype">
              <FamilieKeuze waarde={f.familie} wijzig={(w) => zet("familie", w)} />
              <Keuze label="Stijl" waarde={f.stijl} opties={stijlNamen} wijzig={(w) => zet("stijl", w)} />
              <GetalVeld label="Grootte" eenheid="pt" stap={1} decimalen={1} min={1} max={1638} waarde={f.grootte} wijzig={(w) => zet("grootte", w ?? 11)} />
              <KleurVeld label="Tekstkleur" waarde={f.kleur} wijzig={(w) => zet("kleur", w)} />
              <Keuze label="Onderstreping" waarde={f.onderstreping} opties={onderstrepingNamen} wijzig={(w) => zet("onderstreping", w)} />
              {f.onderstreping !== "geen" && (
                <KleurVeld label="Kleur onderstreping" waarde={f.onderstrepingKleur} wijzig={(w) => zet("onderstrepingKleur", w)} />
              )}
            </Sectie>
            <Sectie titel="Effecten">
              <Vink label="Doorhalen" waarde={f.doorhalen} wijzig={effect("doorhalen")} />
              <Vink label="Dubbel doorhalen" waarde={f.dubbelDoorhalen} wijzig={effect("dubbelDoorhalen")} />
              <Vink label="Superscript" waarde={f.superscript} wijzig={effect("superscript")} />
              <Vink label="Subscript" waarde={f.subscript} wijzig={effect("subscript")} />
              <Vink label="Kleinkapitalen" waarde={f.kleinkapitalen} wijzig={effect("kleinkapitalen")} />
              <Vink label="Alle hoofdletters" waarde={f.hoofdletters} wijzig={effect("hoofdletters")} />
              <Vink label="Verborgen" waarde={f.verborgen} wijzig={effect("verborgen")} />
            </Sectie>
          </>
        ) : (
          <Sectie titel="Tekenafstand">
            <GetalVeld label="Schaal" eenheid="%" stap={10} decimalen={0} min={1} max={600} waarde={f.schaal} wijzig={(w) => zet("schaal", w ?? 100)} />
            <Keuze<Richting>
              label="Afstand"
              waarde={f.afstand}
              opties={[
                ["normaal", "Normaal"],
                ["breder", "Breder"],
                ["smaller", "Smaller"],
              ]}
              wijzig={(w) => zet("afstand", w)}
            />
            <GetalVeld label="Met" eenheid="pt" stap={0.1} decimalen={2} min={0} max={1584} uit={f.afstand === "normaal"} waarde={f.afstandPt} wijzig={(w) => zet("afstandPt", w ?? 0)} />
            <Keuze<Hoogte>
              label="Positie"
              waarde={f.positie}
              opties={[
                ["normaal", "Normaal"],
                ["verhoogd", "Verhoogd"],
                ["verlaagd", "Verlaagd"],
              ]}
              wijzig={(w) => zet("positie", w)}
            />
            <GetalVeld label="Met" eenheid="pt" stap={0.5} decimalen={1} min={0} max={1584} uit={f.positie === "normaal"} waarde={f.positiePt} wijzig={(w) => zet("positiePt", w ?? 0)} />
            <Vink label="Tekenspatiëring (kerning)" waarde={f.spatieren} wijzig={(w) => zet("spatieren", w)} />
            <GetalVeld label="Vanaf" eenheid="pt" stap={1} decimalen={1} min={1} max={1638} uit={!f.spatieren} waarde={f.spatierenVanaf} wijzig={(w) => zet("spatierenVanaf", w ?? 11)} />
          </Sectie>
        )}
      </Tabbladen>
      <p className="tekstopmaak-voorbeeld-titel">Voorbeeld</p>
      <div className="tekstopmaak-voorbeeld tekstopmaak-lettervoorbeeld" aria-hidden="true">
        <span style={voorbeeldStijl(f)}>{voorbeeldTekst || f.familie}</span>
      </div>
    </Dialoog>
  );
}
