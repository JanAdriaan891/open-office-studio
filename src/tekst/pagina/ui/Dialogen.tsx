/**
 * Vensters van de paginafuncties, op de gedeelde werkruimtedialoog.
 */
import { useState, type ReactNode } from "react";
import { Dialoog } from "../../../werkruimte/Dialoog";
import { PAGINANUMMER_VORMEN, type PaginanummerOpties, type PaginanummerVorm } from "../kopvoet.ts";
import { OPVULTEKENS, STANDAARD_INHOUD, type InhoudOpties } from "../inhoudsopgave.ts";
import { NOOTNOTATIES, type NootHerstart, type NootInstellingen, type NootNotatie, type NootPositie, type NootSoort } from "../noten.ts";
import { PAGINANOTATIES, cmNaarTwips, twipsNaarCm, type Kolommen, type Paginanotatie } from "../secties.ts";
import type { NootInfo } from "./engine.ts";

export const HERLAAD_UITLEG =
  "Het document wordt daarna opnieuw geladen. Eerdere wijzigingen kunnen dan niet meer met Ongedaan maken worden teruggedraaid.";

const cmTekst = (twips: number) => String(twipsNaarCm(twips)).replace(".", ",");
const leesCm = (tekst: string) => {
  const n = Number(tekst.replace(",", ".").replace(/\s*cm$/i, ""));
  return Number.isFinite(n) ? n : NaN;
};

function Knoppen({ bevestig, sluit, knop = "OK", uit }: { bevestig: () => void; sluit: () => void; knop?: string; uit?: boolean }) {
  return (
    <>
      <span className="werkruimte-melding">{HERLAAD_UITLEG}</span>
      <button type="button" className="werkruimte-knop" onClick={sluit}>
        Annuleren
      </button>
      <button type="button" className="werkruimte-knop is-primair" disabled={uit} onClick={bevestig}>
        {knop}
      </button>
    </>
  );
}

function Veld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="werkruimte-veld">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Keuzes<T extends string>({ label, waarde, opties, kies, naam }: { label: string; waarde: T; opties: { waarde: T; naam: string }[]; kies: (w: T) => void; naam: string }) {
  return (
    <div className="werkruimte-keuzes" role="radiogroup" aria-label={label}>
      <span className="werkruimte-label">{label}</span>
      {opties.map((o) => (
        <label key={o.waarde}>
          <input type="radio" name={naam} checked={waarde === o.waarde} onChange={() => kies(o.waarde)} />
          {o.naam}
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function BevestigHerladen({ titel, bevestig, sluit }: { titel: string; bevestig: (altijd: boolean) => void; sluit: () => void }) {
  const [altijd, setAltijd] = useState(false);
  return (
    <Dialoog
      titel={titel}
      sluit={sluit}
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            Annuleren
          </button>
          <button type="button" className="werkruimte-knop is-primair" data-autofocus onClick={() => bevestig(altijd)}>
            Doorgaan
          </button>
        </>
      }
    >
      <p className="werkruimte-uitleg">
        Deze opdracht past het document zelf aan (de engine kan dit nog niet rechtstreeks). {HERLAAD_UITLEG}
      </p>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={altijd} onChange={(e) => setAltijd(e.target.checked)} />
        Niet meer vragen
      </label>
    </Dialoog>
  );
}

// ---------------------------------------------------------------------------

export function voorbeeldPaginanummer(vorm: PaginanummerVorm, notatie: Paginanotatie = "decimal") {
  const n = { decimal: "2", lowerRoman: "ii", upperRoman: "II", lowerLetter: "b", upperLetter: "B" }[notatie];
  const v = PAGINANUMMER_VORMEN.find((x) => x.waarde === vorm)!.voorbeeld;
  return v.replace("2", n);
}

export function PaginanummerDialoog({
  begin,
  secties,
  bevestig,
  sluit,
}: {
  begin: Partial<PaginanummerOpties>;
  secties: number;
  bevestig: (o: PaginanummerOpties) => void;
  sluit: () => void;
}) {
  const [o, setO] = useState<PaginanummerOpties>({
    positie: "onder",
    uitlijning: "midden",
    vorm: "getal",
    opEerstePagina: true,
    notatie: "decimal",
    beginBij: null,
    doel: "alle",
    ...begin,
  });
  const [start, setStart] = useState(o.beginBij == null ? "" : String(o.beginBij));
  const startOk = start.trim() === "" || (/^\d{1,4}$/.test(start.trim()) && Number(start) >= 0);
  const zet = (w: Partial<PaginanummerOpties>) => setO({ ...o, ...w });
  return (
    <Dialoog
      titel="Paginanummers"
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen knop="Invoegen" uit={!startOk} sluit={sluit} bevestig={() => bevestig({ ...o, beginBij: start.trim() === "" ? null : Number(start) })} />}
    >
      <fieldset className="werkruimte-groep">
        <legend>Plaats</legend>
        <Keuzes
          label="Positie"
          naam="pn-positie"
          waarde={o.positie}
          kies={(positie) => zet({ positie })}
          opties={[
            { waarde: "boven", naam: "Boven aan de pagina (koptekst)" },
            { waarde: "onder", naam: "Onder aan de pagina (voettekst)" },
            { waarde: "cursor", naam: "Op de cursorpositie" },
          ]}
        />
        {o.positie !== "cursor" && (
          <Keuzes
            label="Uitlijning"
            naam="pn-uitlijning"
            waarde={o.uitlijning}
            kies={(uitlijning) => zet({ uitlijning })}
            opties={[
              { waarde: "links", naam: "Links" },
              { waarde: "midden", naam: "Midden" },
              { waarde: "rechts", naam: "Rechts" },
            ]}
          />
        )}
        <Veld label="Weergave">
          <select value={o.vorm} onChange={(e) => zet({ vorm: e.target.value as PaginanummerVorm })}>
            {PAGINANUMMER_VORMEN.map((v) => (
              <option key={v.waarde} value={v.waarde}>
                {v.naam} — {voorbeeldPaginanummer(v.waarde, o.notatie)}
              </option>
            ))}
          </select>
        </Veld>
        {o.positie !== "cursor" && (
          <label className="werkruimte-vink">
            <input type="checkbox" checked={o.opEerstePagina} onChange={(e) => zet({ opEerstePagina: e.target.checked })} />
            Paginanummer op de eerste pagina tonen
          </label>
        )}
      </fieldset>
      <fieldset className="werkruimte-groep">
        <legend>Nummering</legend>
        <Veld label="Notatie">
          <select value={o.notatie} onChange={(e) => zet({ notatie: e.target.value as Paginanotatie })}>
            {PAGINANOTATIES.map((n) => (
              <option key={n.waarde} value={n.waarde}>
                {n.naam}
              </option>
            ))}
          </select>
        </Veld>
        <Veld label="Beginnen bij">
          <span className="werkruimte-eenheid">
            <input type="text" inputMode="numeric" placeholder="doorlopend" aria-invalid={!startOk} value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="werkruimte-uitleg">leeg = doorlopend</span>
          </span>
        </Veld>
        {secties > 1 && o.positie !== "cursor" && (
          <Keuzes
            label="Toepassen op"
            naam="pn-doel"
            waarde={o.doel === "alle" ? "alle" : "sectie"}
            kies={(w) => zet({ doel: w === "alle" ? "alle" : -1 })}
            opties={[
              { waarde: "alle", naam: "Hele document" },
              { waarde: "sectie", naam: "Deze sectie" },
            ]}
          />
        )}
      </fieldset>
      <p className="pagina-voorbeeld" aria-live="polite">
        Voorbeeld: <strong>{voorbeeldPaginanummer(o.vorm, o.notatie)}</strong>
        {o.positie === "cursor" ? " op de cursorpositie" : ` ${o.positie === "boven" ? "boven" : "onder"} ${o.uitlijning === "midden" ? "in het midden" : o.uitlijning}`}
      </p>
    </Dialoog>
  );
}

// ---------------------------------------------------------------------------

export function KolommenDialoog({
  begin,
  breedte,
  secties,
  bevestig,
  sluit,
}: {
  begin: Kolommen;
  breedte: number;
  secties: number;
  bevestig: (k: Kolommen, doel: "alle" | "sectie") => void;
  sluit: () => void;
}) {
  const [aantal, setAantal] = useState(String(begin.aantal));
  const [ruimte, setRuimte] = useState(cmTekst(begin.tussenruimte));
  const [lijn, setLijn] = useState(begin.lijn);
  const [doel, setDoel] = useState<"alle" | "sectie">("sectie");
  const n = Number(aantal);
  const r = leesCm(ruimte);
  const ok = Number.isInteger(n) && n >= 1 && n <= 12 && r >= 0 && r <= 10 && cmNaarTwips(r) * (n - 1) < breedte - 720 * n;
  const kolom = ok ? (breedte - cmNaarTwips(r) * (n - 1)) / n : 0;
  return (
    <Dialoog
      titel="Kolommen"
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen uit={!ok} sluit={sluit} bevestig={() => bevestig({ aantal: n, tussenruimte: cmNaarTwips(r), lijn: lijn && n > 1 }, doel)} />}
    >
      <Veld label="Aantal kolommen">
        <input type="number" min={1} max={12} value={aantal} aria-invalid={!ok} onChange={(e) => setAantal(e.target.value)} data-autofocus />
      </Veld>
      <Veld label="Tussenruimte">
        <span className="werkruimte-eenheid">
          <input type="text" inputMode="decimal" value={ruimte} onChange={(e) => setRuimte(e.target.value)} />
          cm
        </span>
      </Veld>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={lijn} disabled={n <= 1} onChange={(e) => setLijn(e.target.checked)} />
        Lijn tussen de kolommen
      </label>
      {secties > 1 && (
        <Keuzes
          label="Toepassen op"
          naam="kol-doel"
          waarde={doel}
          kies={setDoel}
          opties={[
            { waarde: "sectie", naam: "Deze sectie" },
            { waarde: "alle", naam: "Hele document" },
          ]}
        />
      )}
      <div className="pagina-kolomvoorbeeld" aria-hidden="true">
        {ok && Array.from({ length: n }, (_, i) => <span key={i} style={{ flexBasis: `${(kolom / breedte) * 100}%` }} data-lijn={lijn && i > 0 ? "" : undefined} />)}
      </div>
      <p className="werkruimte-uitleg">{ok ? `Elke kolom wordt ${cmTekst(kolom)} cm breed.` : "Kies 1 tot 12 kolommen en een tussenruimte die past."}</p>
    </Dialoog>
  );
}

// ---------------------------------------------------------------------------

export function AfstandDialoog({ koptekst, voettekst, bevestig, sluit }: { koptekst: number; voettekst: number; bevestig: (a: { koptekst: number; voettekst: number }) => void; sluit: () => void }) {
  const [kop, setKop] = useState(cmTekst(koptekst));
  const [voet, setVoet] = useState(cmTekst(voettekst));
  const k = leesCm(kop);
  const v = leesCm(voet);
  const ok = k >= 0 && k <= 10 && v >= 0 && v <= 10;
  return (
    <Dialoog
      titel="Afstand van kop- en voettekst tot de rand"
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen uit={!ok} sluit={sluit} bevestig={() => bevestig({ koptekst: cmNaarTwips(k), voettekst: cmNaarTwips(v) })} />}
    >
      <Veld label="Koptekst vanaf boven">
        <span className="werkruimte-eenheid">
          <input type="text" inputMode="decimal" value={kop} aria-invalid={!(k >= 0 && k <= 10)} onChange={(e) => setKop(e.target.value)} data-autofocus />
          cm
        </span>
      </Veld>
      <Veld label="Voettekst vanaf onder">
        <span className="werkruimte-eenheid">
          <input type="text" inputMode="decimal" value={voet} aria-invalid={!(v >= 0 && v <= 10)} onChange={(e) => setVoet(e.target.value)} />
          cm
        </span>
      </Veld>
      <p className="werkruimte-uitleg">Geldt voor de sectie waarin de cursor staat.</p>
    </Dialoog>
  );
}

// ---------------------------------------------------------------------------

export function InhoudDialoog({ begin, bestaat, bevestig, sluit }: { begin: InhoudOpties; bestaat: boolean; bevestig: (o: InhoudOpties) => void; sluit: () => void }) {
  const [o, setO] = useState<InhoudOpties>(begin);
  const zet = (w: Partial<InhoudOpties>) => setO({ ...o, ...w });
  const leader = { punt: ".", streep: "-", lijn: "_", geen: " " }[o.opvulteken];
  const regel = (tekst: string, niveau: number, pagina: string) => (
    <div className="pagina-tocregel" style={{ paddingLeft: `${(niveau - 1) * 14}px` }}>
      <span>{tekst}</span>
      {o.paginanummers && (o.rechtsUitlijnen ? <span className="pagina-tocvulling">{leader.repeat(60)}</span> : " ")}
      {o.paginanummers && <span>{pagina}</span>}
    </div>
  );
  return (
    <Dialoog
      titel="Inhoudsopgave"
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen knop={bestaat ? "Vervangen" : "Invoegen"} sluit={sluit} bevestig={() => bevestig(o)} />}
    >
      <div className="pagina-tocvoorbeeld" aria-hidden="true">
        {o.titel.trim() && <div className="pagina-toctitel">{o.titel}</div>}
        {regel("Kop 1", 1, "1")}
        {o.niveaus >= 2 && regel("Kop 2", 2, "3")}
        {o.niveaus >= 3 && regel("Kop 3", 3, "5")}
      </div>
      <Veld label="Titel">
        <input type="text" value={o.titel} placeholder="geen titel" onChange={(e) => zet({ titel: e.target.value })} data-autofocus />
      </Veld>
      <Veld label="Niveaus tonen">
        <select value={o.niveaus} onChange={(e) => zet({ niveaus: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "Alleen Kop 1" : `Kop 1 tot en met Kop ${n}`}
            </option>
          ))}
        </select>
      </Veld>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={o.paginanummers} onChange={(e) => zet({ paginanummers: e.target.checked })} />
        Paginanummers tonen
      </label>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={o.rechtsUitlijnen} disabled={!o.paginanummers} onChange={(e) => zet({ rechtsUitlijnen: e.target.checked })} />
        Paginanummers rechts uitlijnen
      </label>
      <Veld label="Opvulteken">
        <select value={o.opvulteken} disabled={!o.paginanummers || !o.rechtsUitlijnen} onChange={(e) => zet({ opvulteken: e.target.value as InhoudOpties["opvulteken"] })}>
          {OPVULTEKENS.map((v) => (
            <option key={v.waarde} value={v.waarde}>
              {v.naam}
            </option>
          ))}
        </select>
      </Veld>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={o.hyperlinks} onChange={(e) => zet({ hyperlinks: e.target.checked })} />
        Regels als koppeling naar de kop
      </label>
      <p className="werkruimte-uitleg">
        De regels komen uit de koppen (stijlen Kop 1 tot en met Kop {o.niveaus}); de paginanummers uit de huidige pagina-indeling.
      </p>
    </Dialoog>
  );
}

export function BijwerkenDialoog({ bevestig, sluit }: { bevestig: (modus: "paginas" | "alles") => void; sluit: () => void }) {
  const [modus, setModus] = useState<"paginas" | "alles">("paginas");
  return (
    <Dialoog titel="Inhoudsopgave bijwerken" sluit={sluit} className="pagina-dialoog" acties={<Knoppen knop="Bijwerken" sluit={sluit} bevestig={() => bevestig(modus)} />}>
      <Keuzes
        label="Wat bijwerken?"
        naam="toc-modus"
        waarde={modus}
        kies={setModus}
        opties={[
          { waarde: "paginas", naam: "Alleen paginanummers" },
          { waarde: "alles", naam: "De hele inhoudsopgave" },
        ]}
      />
      <p className="werkruimte-uitleg">
        ‘Alleen paginanummers’ laat de tekst van de regels staan. ‘De hele inhoudsopgave’ bouwt de regels opnieuw op uit de koppen.
      </p>
    </Dialoog>
  );
}

// ---------------------------------------------------------------------------

export function NootDialoog({ soort, bevestig, sluit }: { soort: NootSoort; bevestig: (tekst: string) => void; sluit: () => void }) {
  const [tekst, setTekst] = useState("");
  return (
    <Dialoog
      titel={soort === "voetnoot" ? "Voetnoot invoegen" : "Eindnoot invoegen"}
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen knop="Invoegen" uit={!tekst.trim()} sluit={sluit} bevestig={() => bevestig(tekst)} />}
    >
      <label className="pagina-nootveld">
        <span>Tekst van de {soort}</span>
        <textarea
          rows={4}
          value={tekst}
          data-autofocus
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && tekst.trim()) {
              e.preventDefault();
              bevestig(tekst);
            }
          }}
        />
      </label>
      <p className="werkruimte-uitleg">
        Het nootteken komt op de cursorplek; de tekst {soort === "voetnoot" ? "onderaan de pagina" : "aan het eind van het document"}. Ctrl+Enter voegt in.
      </p>
    </Dialoog>
  );
}

export function NootInstellingenDialoog({
  begin,
  bevestig,
  sluit,
}: {
  begin: { soort: NootSoort; instellingen: Record<NootSoort, NootInstellingen> };
  bevestig: (soort: NootSoort, w: NootInstellingen) => void;
  sluit: () => void;
}) {
  const [soort, setSoort] = useState<NootSoort>(begin.soort);
  const [alle, setAlle] = useState(begin.instellingen);
  const w = alle[soort];
  const [start, setStart] = useState(String(w.beginBij));
  const zet = (x: Partial<NootInstellingen>) => setAlle({ ...alle, [soort]: { ...w, ...x } });
  const startOk = /^\d{1,4}$/.test(start) && Number(start) >= 1;
  return (
    <Dialoog
      titel="Voetnoten en eindnoten"
      sluit={sluit}
      className="pagina-dialoog"
      acties={<Knoppen knop="Toepassen" uit={!startOk} sluit={sluit} bevestig={() => bevestig(soort, { ...w, beginBij: Number(start) })} />}
    >
      <Keuzes
        label="Soort"
        naam="noot-soort"
        waarde={soort}
        kies={(s) => {
          setSoort(s);
          setStart(String(alle[s].beginBij));
        }}
        opties={[
          { waarde: "voetnoot", naam: "Voetnoten" },
          { waarde: "eindnoot", naam: "Eindnoten" },
        ]}
      />
      <Veld label="Plaats">
        <select value={w.positie} onChange={(e) => zet({ positie: e.target.value as NootPositie })}>
          {soort === "voetnoot" ? (
            <>
              <option value="pageBottom">Onderaan de pagina</option>
              <option value="beneathText">Onder de tekst</option>
            </>
          ) : (
            <>
              <option value="docEnd">Einde van het document</option>
              <option value="sectEnd">Einde van de sectie</option>
            </>
          )}
        </select>
      </Veld>
      <Veld label="Notatie">
        <select value={w.notatie} onChange={(e) => zet({ notatie: e.target.value as NootNotatie })}>
          {NOOTNOTATIES.map((n) => (
            <option key={n.waarde} value={n.waarde}>
              {n.naam}
            </option>
          ))}
        </select>
      </Veld>
      <Veld label="Beginnen bij">
        <input type="text" inputMode="numeric" value={start} aria-invalid={!startOk} onChange={(e) => setStart(e.target.value)} />
      </Veld>
      <Veld label="Nummering">
        <select value={w.herstart} onChange={(e) => zet({ herstart: e.target.value as NootHerstart })}>
          <option value="continuous">Doorlopend</option>
          <option value="eachSect">Elke sectie opnieuw</option>
          {soort === "voetnoot" && <option value="eachPage">Elke pagina opnieuw</option>}
        </select>
      </Veld>
      <p className="werkruimte-uitleg">Geldt voor het hele document.</p>
    </Dialoog>
  );
}

export function NotenLijst({ noten, gaNaar, sluit }: { noten: NootInfo[]; gaNaar: (n: NootInfo, waar: "verwijzing" | "noot") => void; sluit: () => void }) {
  return (
    <Dialoog
      titel="Voetnoten en eindnoten"
      sluit={sluit}
      className="pagina-dialoog pagina-notenlijst"
      acties={
        <button type="button" className="werkruimte-knop" onClick={sluit}>
          Sluiten
        </button>
      }
    >
      {noten.length === 0 ? (
        <p className="werkruimte-uitleg">Dit document heeft geen voet- of eindnoten.</p>
      ) : (
        <ol className="pagina-noten">
          {noten.map((n) => (
            <li key={`${n.soort}-${n.noteId}`}>
              <span className="pagina-nootnummer">
                {n.soort === "voetnoot" ? "Voetnoot" : "Eindnoot"} {n.volgnummer}
              </span>
              <span className="pagina-noottekst">{n.tekst || "(leeg)"}</span>
              <span className="pagina-nootacties">
                <button type="button" className="werkruimte-knop" onClick={() => gaNaar(n, "verwijzing")}>
                  Naar verwijzing{n.paginaVerwijzing != null ? ` (p. ${n.paginaVerwijzing + 1})` : ""}
                </button>
                <button type="button" className="werkruimte-knop" onClick={() => gaNaar(n, "noot")}>
                  Naar noot{n.paginaNoot != null ? ` (p. ${n.paginaNoot + 1})` : ""}
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Dialoog>
  );
}

export { STANDAARD_INHOUD };
