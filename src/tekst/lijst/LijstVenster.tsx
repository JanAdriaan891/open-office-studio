import { useState } from "react";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { GetalVeld, Keuze, Sectie } from "../velden";
import { lijstSjablonen, markering, type LijstSjabloon } from "./nummering";
import type { LijstKeuze } from "./plan";

type Nummeren = "ongewijzigd" | "doorgaan" | "opnieuw";

function Voorbeeld({ s }: { s: LijstSjabloon }) {
  const regels =
    s.soort === "niveaus"
      ? [
          [0, [1]],
          [1, [1, 1]],
          [2, [1, 1, 1]],
        ]
      : [
          [0, [1]],
          [0, [2]],
          [0, [3]],
        ];
  return (
    <>
      {regels.map(([ilvl, tellers], i) => (
        <span key={i} style={{ paddingLeft: (ilvl as number) * 10, fontFamily: s.niveaus[ilvl as number]?.font }}>
          {markering(s.niveaus, ilvl as number, tellers as number[])} ―――
        </span>
      ))}
    </>
  );
}

export function LijstVenster({
  inLijst,
  niveau,
  pakketBeschikbaar,
  toepassen,
  sluit,
}: {
  /** De selectie staat (deels) in een lijst. */
  inLijst: boolean;
  /** Huidig niveau (0-gebaseerd) van de eerste lijstalinea. */
  niveau: number;
  /** Zonder herlaadfunctie kunnen nieuwe notaties en opnieuw beginnen niet. */
  pakketBeschikbaar: boolean;
  toepassen: (keuze: LijstKeuze) => void;
  sluit: () => void;
}) {
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [nieuwNiveau, setNieuwNiveau] = useState(niveau);
  const [nummeren, setNummeren] = useState<Nummeren>("ongewijzigd");
  const [beginBij, setBeginBij] = useState(1);
  const keuze: LijstKeuze = {
    ...(gekozen ? { sjabloon: gekozen } : {}),
    ...(inLijst && nieuwNiveau !== niveau ? { niveau: nieuwNiveau } : {}),
    ...(nummeren === "doorgaan" ? { nummering: "doorgaan" as const } : nummeren === "opnieuw" ? { nummering: { beginBij } } : {}),
  };
  const iets = Object.keys(keuze).length > 0;
  const herlaadt = !!gekozen || nummeren === "opnieuw";
  const groep = (soort: LijstSjabloon["soort"], titel: string) => (
    <>
      <p className="tekstopmaak-voorbeeld-titel">{titel}</p>
      <div className="tekstopmaak-galerij" role="group" aria-label={titel}>
        {lijstSjablonen
          .filter((s) => s.soort === soort)
          .map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={gekozen === s.id}
              aria-label={s.naam}
              title={s.naam}
              disabled={!pakketBeschikbaar}
              onClick={() => setGekozen(gekozen === s.id ? null : s.id)}
            >
              <Voorbeeld s={s} />
            </button>
          ))}
      </div>
    </>
  );
  return (
    <Dialoog
      titel="Lijstopties"
      sluit={sluit}
      className="tekstopmaak"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            Annuleren
          </button>
          <button type="button" className="werkruimte-knop is-primair" onClick={() => (iets ? toepassen(keuze) : sluit())}>
            OK
          </button>
        </>
      }
    >
      {groep("opsomming", "Opsommingsteken")}
      {groep("nummering", "Nummernotatie")}
      {groep("niveaus", "Lijst met meerdere niveaus")}
      <Sectie titel="Nummering">
        <Keuze
          label="Niveau"
          waarde={String(nieuwNiveau)}
          uit={!inLijst}
          opties={Array.from({ length: 9 }, (_, i) => [String(i), `Niveau ${i + 1}`] as const)}
          wijzig={(w) => setNieuwNiveau(Number(w))}
        />
        <Keuze<Nummeren>
          label="Nummeren"
          waarde={nummeren}
          opties={[
            ["ongewijzigd", "Zoals het is"],
            ["doorgaan", "Doorgaan met de vorige lijst"],
            ["opnieuw", gekozen ? "Beginnen bij" : "Opnieuw beginnen bij"],
          ]}
          wijzig={setNummeren}
        />
        <GetalVeld
          label="Beginwaarde"
          stap={1}
          decimalen={0}
          min={0}
          max={32767}
          uit={nummeren !== "opnieuw" || (!inLijst && !gekozen)}
          waarde={beginBij}
          wijzig={(w) => setBeginBij(w ?? 1)}
        />
      </Sectie>
      {herlaadt && (
        <p className="tekstopmaak-melding">
          Een nieuwe notatie of opnieuw beginnen wordt in het bestand gezet. Het document wordt daarna opnieuw geladen;
          eerdere stappen kun je dan niet meer ongedaan maken.
        </p>
      )}
      {!pakketBeschikbaar && <p className="tekstopmaak-melding">Nieuwe notaties zijn hier niet beschikbaar.</p>}
    </Dialoog>
  );
}
