import { useState } from "react";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import type { AlineaOpmaak, RandZijde } from "../opmaak";
import { GetalVeld, Keuze, KleurVeld, Sectie, Tabbladen } from "../velden";
import {
  arceringNaarModel,
  cssRand,
  metInstelling,
  metZijde,
  patroonNamen,
  randDiktes,
  randenNaarModel,
  randStijlen,
  zijdeNamen,
  type ArceringFormulier,
  type Instelling,
  type RandFormulier,
} from "./model";
import type { PaginaRand, PaginaRandWeergave } from "./pagina";

export type RandenTab = "randen" | "pagina" | "arcering";

export interface RandenBegin {
  alinea: RandFormulier;
  arcering: ArceringFormulier;
  pagina: RandFormulier;
  paginaWeergave: PaginaRandWeergave;
  paginakleur: string | null;
}

export interface RandenWijziging {
  alinea: AlineaOpmaak;
  pagina?: { rand?: PaginaRand | null; kleur?: string | null };
}

const gelijk = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Wat er in het venster veranderd is: alinea via de engine, pagina via het pakket. */
export function randenWijziging(begin: RandenBegin, nu: RandenBegin): RandenWijziging {
  const alinea: AlineaOpmaak = {};
  if (!gelijk(begin.alinea, nu.alinea)) alinea.borders = randenNaarModel(nu.alinea);
  if (!gelijk(begin.arcering, nu.arcering)) alinea.shading = arceringNaarModel(nu.arcering);
  const pagina: RandenWijziging["pagina"] = {};
  if (!gelijk(begin.pagina, nu.pagina) || begin.paginaWeergave !== nu.paginaWeergave) {
    const zijden = randenNaarModel(nu.pagina, ["top", "left", "bottom", "right"]);
    pagina.rand = zijden ? { ...zijden, display: nu.paginaWeergave, offsetFrom: "page" } : null;
  }
  if (begin.paginakleur !== nu.paginakleur) pagina.kleur = nu.paginakleur;
  return { alinea, pagina: Object.keys(pagina).length ? pagina : undefined };
}

const instellingNamen: readonly (readonly [Instelling, string])[] = [
  ["geen", "Geen"],
  ["kader", "Kader"],
  ["schaduw", "Schaduw"],
  ["aangepast", "Aangepast"],
];

function RandBewerker({
  f,
  zet,
  zijden,
  afstandMax,
}: {
  f: RandFormulier;
  zet: (f: RandFormulier) => void;
  zijden: readonly RandZijde[];
  afstandMax: number;
}) {
  const knop = (zijde: RandZijde) => (
    <button
      key={zijde}
      type="button"
      className="werkruimte-knop"
      aria-pressed={f.zijden[zijde]}
      onClick={() => zet(metZijde(f, zijde))}
    >
      {zijdeNamen[zijde]}
    </button>
  );
  const rand = cssRand(f);
  return (
    <>
      <Sectie titel="Rand">
        <Keuze label="Instelling" waarde={f.instelling} opties={instellingNamen} wijzig={(w) => zet(metInstelling(f, w))} />
        <Keuze label="Stijl" waarde={f.stijl} opties={randStijlen} wijzig={(w) => zet({ ...f, stijl: w })} />
        <KleurVeld label="Kleur" waarde={f.kleur} wijzig={(w) => zet({ ...f, kleur: w })} />
        <Keuze
          label="Dikte"
          waarde={String(f.dikte)}
          opties={randDiktes.map((d) => [String(d), `${String(d).replace(".", ",")} pt`] as const)}
          wijzig={(w) => zet({ ...f, dikte: Number(w) })}
        />
        <GetalVeld label="Afstand tot tekst" eenheid="pt" stap={1} decimalen={0} min={0} max={afstandMax} waarde={f.afstand} wijzig={(w) => zet({ ...f, afstand: w ?? 0 })} />
      </Sectie>
      <div className="tekstopmaak-zijden" aria-label="Zijden">
        <span />
        {knop("top")}
        <span />
        {knop("left")}
        <div
          className="vlak"
          aria-hidden="true"
          style={{
            borderTop: f.zijden.top ? rand : "1px dashed #ccc",
            borderBottom: f.zijden.bottom ? rand : "1px dashed #ccc",
            borderLeft: f.zijden.left ? rand : "1px dashed #ccc",
            borderRight: f.zijden.right ? rand : "1px dashed #ccc",
            boxShadow: f.instelling === "schaduw" ? "3px 3px 0 #888" : undefined,
          }}
        >
          Voorbeeldtekst voorbeeldtekst voorbeeldtekst voorbeeldtekst.
          {zijden.includes("between") && (
            <div style={{ borderTop: f.zijden.between ? rand : "1px dashed #ccc", marginTop: 6, paddingTop: 6 }}>
              Volgende alinea met dezelfde randen.
            </div>
          )}
        </div>
        {knop("right")}
        <span />
        {knop("bottom")}
        {zijden.includes("between") ? knop("between") : <span />}
      </div>
    </>
  );
}

export function RandenVenster({
  begin,
  tab: beginTab,
  paginaBeschikbaar,
  toepassen,
  sluit,
}: {
  begin: RandenBegin;
  tab: RandenTab;
  /** Zonder herlaadfunctie kunnen paginarand en paginakleur niet. */
  paginaBeschikbaar: boolean;
  toepassen: (wijziging: RandenWijziging) => void;
  sluit: () => void;
}) {
  const [tab, setTab] = useState<RandenTab>(beginTab);
  const [nu, setNu] = useState(begin);
  const wijziging = randenWijziging(begin, nu);
  const iets = Object.keys(wijziging.alinea).length > 0 || !!wijziging.pagina;
  return (
    <Dialoog
      titel="Randen en arcering"
      sluit={sluit}
      className="tekstopmaak"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            Annuleren
          </button>
          <button type="button" className="werkruimte-knop is-primair" onClick={() => (iets ? toepassen(wijziging) : sluit())}>
            OK
          </button>
        </>
      }
    >
      <Tabbladen
        tabs={[
          ["randen", "Randen"],
          ["pagina", "Paginarand en -kleur"],
          ["arcering", "Arcering"],
        ]}
        actief={tab}
        kies={setTab}
      >
        {tab === "randen" && (
          <RandBewerker f={nu.alinea} zet={(alinea) => setNu({ ...nu, alinea })} zijden={["top", "bottom", "left", "right", "between"]} afstandMax={31} />
        )}
        {tab === "arcering" && (
          <>
            <Sectie titel="Opvulling">
              <KleurVeld label="Opvulkleur" automatisch="Geen" waarde={nu.arcering.opvulling} wijzig={(w) => setNu({ ...nu, arcering: { ...nu.arcering, opvulling: w } })} />
              <Keuze label="Patroon" waarde={nu.arcering.patroon} opties={patroonNamen} wijzig={(w) => setNu({ ...nu, arcering: { ...nu.arcering, patroon: w } })} />
              {nu.arcering.patroon !== "clear" && (
                <KleurVeld label="Patroonkleur" waarde={nu.arcering.patroonKleur} wijzig={(w) => setNu({ ...nu, arcering: { ...nu.arcering, patroonKleur: w } })} />
              )}
            </Sectie>
            <div
              className="tekstopmaak-voorbeeld"
              aria-hidden="true"
              style={{ background: nu.arcering.opvulling ? `#${nu.arcering.opvulling}` : "#fff" }}
            >
              Voorbeeldtekst met arcering achter de hele alinea.
            </div>
          </>
        )}
        {tab === "pagina" &&
          (paginaBeschikbaar ? (
            <>
              <p className="tekstopmaak-melding">
                Paginarand en paginakleur worden in het bestand gezet. Het document wordt daarna opnieuw geladen; eerdere
                stappen kun je dan niet meer ongedaan maken. De editor toont ze nog niet op het scherm; Word, LibreOffice
                en andere tekstverwerkers wel.
              </p>
              <RandBewerker f={nu.pagina} zet={(pagina) => setNu({ ...nu, pagina })} zijden={["top", "bottom", "left", "right"]} afstandMax={31} />
              <Sectie titel="Pagina">
                <Keuze<PaginaRandWeergave>
                  label="Rand toepassen op"
                  waarde={nu.paginaWeergave}
                  opties={[
                    ["allPages", "Alle pagina’s"],
                    ["firstPage", "Alleen de eerste pagina"],
                    ["notFirstPage", "Alle behalve de eerste"],
                  ]}
                  wijzig={(w) => setNu({ ...nu, paginaWeergave: w })}
                />
                <KleurVeld label="Paginakleur" automatisch="Geen kleur" waarde={nu.paginakleur} wijzig={(w) => setNu({ ...nu, paginakleur: w })} />
              </Sectie>
            </>
          ) : (
            <p className="tekstopmaak-melding">Paginarand en paginakleur zijn hier niet beschikbaar.</p>
          ))}
      </Tabbladen>
    </Dialoog>
  );
}
