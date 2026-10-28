import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { regelSoortNamen, type EersteRegel, type RegelSoort, type Regelafstand } from "../eenheden";
import type { AlineaOpmaak } from "../opmaak";
import { GetalVeld, Keuze, Sectie, Tabbladen, Vink } from "../velden";
import {
  opvulNamen,
  tabUitlijningNamen,
  uitlijningNamen,
  volgendeTabPositie,
  wijzigingUit,
  type AlineaFormulier,
} from "./model";

type Tab = "afstand" | "einden" | "tabs";

const speciaalNamen: readonly (readonly [EersteRegel, string])[] = [
  ["geen", "(geen)"],
  ["eerste", "Eerste regel"],
  ["verkeerd", "Verkeerd om"],
];

function nieuweRegel(soort: RegelSoort, oud: Regelafstand): Regelafstand {
  switch (soort) {
    case "meerdere":
      return { soort, regels: oud.soort === "meerdere" ? oud.regels : 1.15 };
    case "minimaal":
    case "exact":
      return { soort, pt: "pt" in oud ? oud.pt : 12 };
    default:
      return { soort };
  }
}

const VOORBEELD =
  "Voorbeeldtekst voorbeeldtekst voorbeeldtekst voorbeeldtekst voorbeeldtekst voorbeeldtekst voorbeeldtekst voorbeeldtekst voorbeeldtekst.";

/** Een verkleinde alinea tussen grijze buren, zoals het voorbeeld in Word. */
export function AlineaVoorbeeld({ f }: { f: AlineaFormulier }) {
  const schaal = 4; // px per cm in het voorbeeld
  const regel =
    f.regel.soort === "anderhalf"
      ? 1.5
      : f.regel.soort === "dubbel"
        ? 2
        : f.regel.soort === "meerdere"
          ? f.regel.regels
          : f.regel.soort === "enkel"
            ? 1.15
            : undefined;
  const eersteRegel = f.speciaal === "geen" ? 0 : (f.speciaal === "eerste" ? 1 : -1) * f.speciaalCm * schaal;
  return (
    <div className="tekstopmaak-voorbeeld" aria-hidden="true">
      <p className="grijs">Vorige alinea vorige alinea vorige alinea vorige alinea vorige alinea.</p>
      <p
        style={{
          textAlign: f.uitlijning === "both" ? "justify" : f.uitlijning,
          marginLeft: Math.max(0, f.links * schaal + Math.max(0, -eersteRegel)),
          marginRight: Math.max(0, f.rechts * schaal),
          textIndent: eersteRegel,
          marginTop: Math.min(30, f.voor / 2),
          marginBottom: Math.min(30, f.na / 2),
          lineHeight: regel ?? (f.regel.soort !== "enkel" && "pt" in f.regel ? `${f.regel.pt / 1.3}px` : undefined),
        }}
      >
        {VOORBEELD}
      </p>
      <p className="grijs">Volgende alinea volgende alinea volgende alinea volgende alinea.</p>
    </div>
  );
}

export function AlineaVenster({
  begin,
  meerdere,
  toepassen,
  sluit,
}: {
  begin: AlineaFormulier;
  /** De selectie raakt meerdere alinea's: alleen gewijzigde velden gelden voor allemaal. */
  meerdere: boolean;
  toepassen: (wijziging: AlineaOpmaak) => void;
  sluit: () => void;
}) {
  const [tab, setTab] = useState<Tab>("afstand");
  const [f, setF] = useState(begin);
  const [nieuweTab, setNieuweTab] = useState(() => volgendeTabPositie(begin.tabs));
  const zet = <K extends keyof AlineaFormulier>(k: K, w: AlineaFormulier[K]) => setF((o) => ({ ...o, [k]: w }));
  const wijziging = wijzigingUit(begin, f);
  const leeg = Object.keys(wijziging).length === 0;
  return (
    <Dialoog
      titel="Alinea"
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
            onClick={() => (leeg ? sluit() : toepassen(wijziging))}
          >
            OK
          </button>
        </>
      }
    >
      {meerdere && (
        <p className="tekstopmaak-melding">
          De selectie bevat meerdere alinea’s. Alleen wat je hier wijzigt, geldt voor allemaal.
        </p>
      )}
      <Tabbladen
        tabs={[
          ["afstand", "Inspringen en afstand"],
          ["einden", "Regel- en pagina-einden"],
          ["tabs", "Tabs"],
        ]}
        actief={tab}
        kies={setTab}
      >
        {tab === "afstand" && (
          <>
            <Sectie titel="Algemeen">
              <Keuze label="Uitlijning" waarde={f.uitlijning} wijzig={(w) => zet("uitlijning", w)} opties={uitlijningNamen} />
            </Sectie>
            <Sectie titel="Inspringen">
              <GetalVeld label="Links" eenheid="cm" waarde={f.links} min={-20} max={50} wijzig={(w) => zet("links", w ?? 0)} />
              <GetalVeld label="Rechts" eenheid="cm" waarde={f.rechts} min={-20} max={50} wijzig={(w) => zet("rechts", w ?? 0)} />
              <Keuze label="Speciaal" waarde={f.speciaal} wijzig={(w) => zet("speciaal", w)} opties={speciaalNamen} />
              <GetalVeld
                label="Met"
                eenheid="cm"
                waarde={f.speciaalCm}
                min={0}
                max={50}
                uit={f.speciaal === "geen"}
                wijzig={(w) => zet("speciaalCm", w ?? 0)}
              />
            </Sectie>
            <Sectie titel="Afstand">
              <GetalVeld label="Voor" eenheid="pt" stap={6} decimalen={1} min={0} max={1584} waarde={f.voor} wijzig={(w) => zet("voor", w ?? 0)} />
              <GetalVeld label="Na" eenheid="pt" stap={6} decimalen={1} min={0} max={1584} waarde={f.na} wijzig={(w) => zet("na", w ?? 0)} />
              <Keuze
                label="Regelafstand"
                waarde={f.regel.soort}
                wijzig={(s) => zet("regel", nieuweRegel(s, f.regel))}
                opties={Object.entries(regelSoortNamen) as [RegelSoort, string][]}
              />
              {f.regel.soort === "meerdere" ? (
                <GetalVeld
                  label="Op"
                  eenheid="×"
                  stap={0.25}
                  min={0.06}
                  max={132}
                  waarde={f.regel.regels}
                  wijzig={(w) => zet("regel", { soort: "meerdere", regels: w ?? 1 })}
                />
              ) : f.regel.soort === "minimaal" || f.regel.soort === "exact" ? (
                <GetalVeld
                  label="Op"
                  eenheid="pt"
                  stap={1}
                  decimalen={1}
                  min={f.regel.soort === "exact" ? 0.7 : 0}
                  max={1584}
                  waarde={f.regel.pt}
                  wijzig={(w) => f.regel.soort !== "enkel" && zet("regel", { soort: f.regel.soort as "exact", pt: w ?? 12 })}
                />
              ) : (
                <span />
              )}
              <Vink
                label="Geen ruimte tussen alinea’s met dezelfde stijl"
                waarde={f.contextueel}
                wijzig={(w) => zet("contextueel", w)}
              />
            </Sectie>
          </>
        )}
        {tab === "einden" && (
          <Sectie titel="Paginering">
            <Vink label="Zwevende regels voorkomen" waarde={f.zwevend} wijzig={(w) => zet("zwevend", w)} />
            <Vink label="Bij volgende alinea houden" waarde={f.volgende} wijzig={(w) => zet("volgende", w)} />
            <Vink label="Regels bijeenhouden" waarde={f.bijeen} wijzig={(w) => zet("bijeen", w)} />
            <Vink label="Pagina-einde ervoor" waarde={f.paginaEinde} wijzig={(w) => zet("paginaEinde", w)} />
          </Sectie>
        )}
        {tab === "tabs" && (
          <>
            <table className="tekstopmaak-tabel">
              <thead>
                <tr>
                  <th>Positie</th>
                  <th>Uitlijning</th>
                  <th>Opvulteken</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {f.tabs.length === 0 && (
                  <tr>
                    <td colSpan={4}>Geen eigen tabstops; de standaardtabs gelden.</td>
                  </tr>
                )}
                {f.tabs.map((t, i) => {
                  const wijzigTab = (n: Partial<typeof t>) =>
                    zet("tabs", f.tabs.map((x, j) => (j === i ? { ...x, ...n } : x)));
                  return (
                    <tr key={i}>
                      <td>
                        <GetalVeld label={`Positie tab ${i + 1}`} eenheid="cm" min={0} max={55} waarde={t.cm} wijzig={(w) => wijzigTab({ cm: w ?? 0 })} />
                      </td>
                      <td>
                        <Keuze label="Uitlijning" waarde={t.uitlijning} opties={tabUitlijningNamen} wijzig={(w) => wijzigTab({ uitlijning: w })} />
                      </td>
                      <td>
                        <Keuze label="Opvulteken" waarde={t.opvul} opties={opvulNamen} wijzig={(w) => wijzigTab({ opvul: w })} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="werkruimte-knop"
                          aria-label={`Tab op ${t.cm} cm verwijderen`}
                          onClick={() => zet("tabs", f.tabs.filter((_, j) => j !== i))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="tekstopmaak-rij">
              <GetalVeld label="Nieuwe tab op" eenheid="cm" min={0} max={55} waarde={nieuweTab} wijzig={(w) => setNieuweTab(w ?? 0)} />
              <button
                type="button"
                className="werkruimte-knop"
                onClick={() => {
                  const tabs = [...f.tabs.filter((t) => t.cm !== nieuweTab), { cm: nieuweTab, uitlijning: "left" as const, opvul: "none" as const }].sort(
                    (a, b) => a.cm - b.cm,
                  );
                  zet("tabs", tabs);
                  setNieuweTab(volgendeTabPositie(tabs));
                }}
              >
                <Plus size={14} /> Toevoegen
              </button>
              <button type="button" className="werkruimte-knop" disabled={!f.tabs.length} onClick={() => zet("tabs", [])}>
                Alles wissen
              </button>
            </div>
          </>
        )}
      </Tabbladen>
      <p className="tekstopmaak-voorbeeld-titel">Voorbeeld</p>
      <AlineaVoorbeeld f={f} />
    </Dialoog>
  );
}
