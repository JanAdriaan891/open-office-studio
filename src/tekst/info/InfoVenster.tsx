/**
 * Bestand › Info: documenteigenschappen lezen en wijzigen. Wijzigingen gaan
 * bij de volgende keer opslaan in docProps/core.xml (zonder herladen); de
 * statistieken en de bewerkingstijd werkt het opslaan zelf bij.
 */
import { useEffect, useState } from "react";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { ShieldCheck } from "lucide-react";
import type { Herladen } from "../../lint/editorApi";
import { telTekst } from "../../lint/tekst-logica";
import { Dialoog } from "../../werkruimte/Dialoog";
import { leesEigenschappen, type DocumentEigenschappen, type KernEigenschappen } from "./docprops";
import { sessieMinuten, wachtendeEigenschappen, zetEigenschappen } from "./opslaan";

const VELDEN: { sleutel: keyof KernEigenschappen; naam: string; lang?: boolean }[] = [
  { sleutel: "titel", naam: "Titel" },
  { sleutel: "onderwerp", naam: "Onderwerp" },
  { sleutel: "auteur", naam: "Auteur" },
  { sleutel: "trefwoorden", naam: "Trefwoorden" },
  { sleutel: "categorie", naam: "Categorie" },
  { sleutel: "status", naam: "Status" },
  { sleutel: "opmerkingen", naam: "Opmerkingen", lang: true },
];

const getal = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("nl-NL"));
export function datumTekst(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("nl-NL", { dateStyle: "long", timeStyle: "short" });
}
function duur(minuten: number) {
  if (minuten < 60) return `${minuten} min`;
  const uur = Math.floor(minuten / 60);
  return `${uur} uur ${minuten % 60} min`;
}

export function InfoVenster({
  api,
  herlaad,
  sluit,
  inspecteren,
}: {
  api: () => DocxEditorRef | null;
  herlaad: Herladen | null;
  sluit: () => void;
  inspecteren: () => void;
}) {
  const [eigenschappen, setEigenschappen] = useState<DocumentEigenschappen | null>(null);
  const [velden, setVelden] = useState<KernEigenschappen | null>(null);
  const [telling, setTelling] = useState<{ woorden: number; tekens: number; tekensMetSpaties: number; alineas: number; paginas: number } | null>(null);
  const [fout, setFout] = useState("");

  useEffect(() => {
    let actief = true;
    void (async () => {
      try {
        if (!herlaad) throw new Error("De eigenschappen zijn hier niet beschikbaar.");
        const e = leesEigenschappen(await herlaad.bytes());
        if (!actief) return;
        const wachtend = wachtendeEigenschappen(herlaad);
        setEigenschappen(e);
        setVelden({
          titel: e.titel,
          onderwerp: e.onderwerp,
          auteur: e.auteur,
          trefwoorden: e.trefwoorden,
          opmerkingen: e.opmerkingen,
          categorie: e.categorie,
          status: e.status,
          ...wachtend,
        });
        const ref = api();
        if (ref) {
          const gelezen = await ref.readParagraphs({ view: "accepted" });
          if (gelezen.ok && actief) {
            const t = telTekst(gelezen.paragraphs.map((a) => a.text));
            setTelling({ woorden: t.woorden, tekens: t.tekensZonderSpaties, tekensMetSpaties: t.tekens, alineas: t.alineas, paginas: ref.getTotalPages() || ref.getCurrentPage() });
          }
        }
      } catch (error) {
        if (actief) setFout(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  function toepassen() {
    if (!herlaad || !velden || !eigenschappen) return;
    const wachtend = wachtendeEigenschappen(herlaad);
    const wijziging: Partial<KernEigenschappen> = {};
    for (const { sleutel } of VELDEN) {
      const oud = wachtend[sleutel] ?? eigenschappen[sleutel];
      if (velden[sleutel] !== oud) wijziging[sleutel] = velden[sleutel];
    }
    if (Object.keys(wijziging).length) zetEigenschappen(herlaad, wijziging);
    sluit();
  }

  const minuten = (eigenschappen?.bewerkingstijd ?? 0) + sessieMinuten(herlaad);
  return (
    <Dialoog
      titel="Info"
      sluit={sluit}
      className="tekst-info"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={inspecteren} style={{ marginRight: "auto" }}>
            <ShieldCheck size={14} aria-hidden="true" /> Document inspecteren…
          </button>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            Annuleren
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={!velden} onClick={toepassen}>
            Toepassen
          </button>
        </>
      }
    >
      {fout && <p className="werkruimte-fout" role="alert">{fout}</p>}
      {!velden ? (
        !fout && <p className="werkruimte-uitleg">Eigenschappen lezen…</p>
      ) : (
        <div className="tekst-info-kolommen">
          <fieldset className="werkruimte-groep">
            <legend>Eigenschappen</legend>
            {VELDEN.map(({ sleutel, naam, lang }) => (
              <label key={sleutel} className="werkruimte-veld">
                <span>{naam}</span>
                {lang ? (
                  <textarea
                    rows={3}
                    value={velden[sleutel]}
                    onChange={(e) => setVelden({ ...velden, [sleutel]: e.target.value })}
                  />
                ) : (
                  <input
                    type="text"
                    value={velden[sleutel]}
                    data-autofocus={sleutel === "titel" ? true : undefined}
                    onChange={(e) => setVelden({ ...velden, [sleutel]: e.target.value })}
                  />
                )}
              </label>
            ))}
            <p className="werkruimte-uitleg">Wordt bij de volgende keer opslaan in het bestand gezet.</p>
          </fieldset>
          <div>
            <fieldset className="werkruimte-groep">
              <legend>Statistieken</legend>
              <dl className="tekst-info-lijst">
                <dt>Pagina’s</dt>
                <dd>{getal(telling?.paginas ?? eigenschappen?.paginas)}</dd>
                <dt>Woorden</dt>
                <dd>{getal(telling?.woorden ?? eigenschappen?.woorden)}</dd>
                <dt>Tekens (zonder spaties)</dt>
                <dd>{getal(telling?.tekens ?? eigenschappen?.tekens)}</dd>
                <dt>Tekens (met spaties)</dt>
                <dd>{getal(telling?.tekensMetSpaties ?? eigenschappen?.tekensMetSpaties)}</dd>
                <dt>Alinea’s</dt>
                <dd>{getal(telling?.alineas ?? eigenschappen?.alineas)}</dd>
                <dt>Bewerkingstijd</dt>
                <dd>{duur(minuten)}</dd>
              </dl>
            </fieldset>
            <fieldset className="werkruimte-groep">
              <legend>Datums en personen</legend>
              <dl className="tekst-info-lijst">
                <dt>Gemaakt</dt>
                <dd>{datumTekst(eigenschappen?.aangemaakt)}</dd>
                <dt>Laatst gewijzigd</dt>
                <dd>{datumTekst(eigenschappen?.gewijzigd)}</dd>
                <dt>Laatst gewijzigd door</dt>
                <dd>{eigenschappen?.laatstGewijzigdDoor || "—"}</dd>
                <dt>Revisie</dt>
                <dd>{getal(eigenschappen?.revisie)}</dd>
                {eigenschappen?.toepassing && (
                  <>
                    <dt>Gemaakt met</dt>
                    <dd>{eigenschappen.toepassing}</dd>
                  </>
                )}
                {eigenschappen?.bedrijf && (
                  <>
                    <dt>Organisatie</dt>
                    <dd>{eigenschappen.bedrijf}</dd>
                  </>
                )}
              </dl>
            </fieldset>
          </div>
        </div>
      )}
    </Dialoog>
  );
}
