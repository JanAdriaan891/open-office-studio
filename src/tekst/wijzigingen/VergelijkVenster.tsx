/**
 * Venster ‘Versies vergelijken’ (#57): twee documenten kiezen (dit document
 * en een ander bestand, of twee andere bestanden), vergelijken met de engine
 * en het resultaat met revisiemarkeringen in een nieuw tabblad openen. Daar
 * gaat het deelvenster Wijzigingen meteen open met de verschillen.
 */
import { useRef, useState } from "react";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { openNieuwDocument } from "../../werkruimte/gebeurtenissen";
import { useEditorApi } from "../../lint/editorApi";
import { auteur as standaardAuteur, fout } from "../gedeeld/engine";
import { heeftWijzigingen, meldingen, resultaatNaam, verschilTekst, vergelijk, type Vergelijking } from "./vergelijken";

/** Het volgende tekst-tabblad dat opent (het resultaat) krijgt het deelvenster. */
let paneelVoorVolgende = 0;
export function paneelBijVolgendTabblad() {
  paneelVoorVolgende = Date.now();
}
export function neemPaneelVerzoek() {
  const ja = Date.now() - paneelVoorVolgende < 20000;
  paneelVoorVolgende = 0;
  return ja;
}

interface Keuze {
  bron: "dit" | "bestand";
  bestand: { naam: string; bytes: Uint8Array } | null;
}

export function VergelijkVenster({ sluit }: { sluit: () => void }) {
  const { herlaad } = useEditorApi();
  const [origineel, setOrigineel] = useState<Keuze>({ bron: "bestand", bestand: null });
  const [gewijzigd, setGewijzigd] = useState<Keuze>({ bron: "dit", bestand: null });
  const [naam, setNaam] = useState(() => (standaardAuteur() === "Onbekende auteur" ? "Vergelijking" : standaardAuteur()));
  const [korrel, setKorrel] = useState<"word" | "char">("word");
  const [accepteren, setAccepteren] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [uitkomst, setUitkomst] = useState<Vergelijking | null>(null);
  const [fouttekst, setFouttekst] = useState("");
  const invoer = useRef<HTMLInputElement>(null);
  const kiesVoor = useRef<"origineel" | "gewijzigd">("origineel");

  const klaar = (k: Keuze) => k.bron === "dit" || !!k.bestand;
  const geldig = klaar(origineel) && klaar(gewijzigd) && !(origineel.bron === "dit" && gewijzigd.bron === "dit");

  async function bytesVan(k: Keuze) {
    if (k.bron === "bestand") return k.bestand!.bytes;
    if (!herlaad) throw new Error("Het document is nog niet gereed.");
    return herlaad.bytes();
  }
  async function start() {
    setBezig(true);
    setFouttekst("");
    setUitkomst(null);
    try {
      const [a, b] = [await bytesVan(origineel), await bytesVan(gewijzigd)];
      const uit = await vergelijk(a, b, { auteur: naam, korrel, eerstAccepteren: accepteren });
      setUitkomst(uit);
      if (uit.ok && uit.verschillen > 0) {
        const naamA = origineel.bron === "dit" ? "dit document" : origineel.bestand!.naam;
        const naamB = gewijzigd.bron === "dit" ? "dit document" : gewijzigd.bestand!.naam;
        paneelBijVolgendTabblad();
        openNieuwDocument({ naam: resultaatNaam(naamA, naamB), bytes: uit.bytes });
        sluit();
      }
    } catch (e) {
      setFouttekst(fout(e));
    } finally {
      setBezig(false);
    }
  }
  const keuze = (titel: string, k: Keuze, zet: (k: Keuze) => void, soort: "origineel" | "gewijzigd") => (
    <fieldset>
      <legend>{titel}</legend>
      <div className="werkruimte-keuzes" role="radiogroup" aria-label={titel}>
        <label>
          <input type="radio" checked={k.bron === "dit"} onChange={() => zet({ ...k, bron: "dit" })} /> Dit document
        </label>
        <label>
          <input type="radio" checked={k.bron === "bestand"} onChange={() => zet({ ...k, bron: "bestand" })} /> Ander bestand
        </label>
        <button
          type="button"
          className="werkruimte-knop"
          onClick={() => {
            kiesVoor.current = soort;
            invoer.current?.click();
          }}
        >
          {k.bestand ? "Ander bestand kiezen…" : "Bestand kiezen…"}
        </button>
      </div>
      {k.bestand && (
        <p className="werkruimte-uitleg">
          {k.bestand.naam}
          {heeftWijzigingen(k.bestand.bytes) ? " — bevat bijgehouden wijzigingen" : ""}
        </p>
      )}
    </fieldset>
  );
  const fout1 = uitkomst && !uitkomst.ok ? meldingen(uitkomst.meldingen) : [];
  return (
    <Dialoog
      titel="Versies vergelijken"
      sluit={sluit}
      className="tw-venster is-breed"
      acties={
        <>
          <span className="werkruimte-melding" role="status">
            {bezig ? "Vergelijken…" : uitkomst?.ok && uitkomst.verschillen === 0 ? "Geen verschillen in de lopende tekst gevonden." : ""}
          </span>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            Sluiten
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={!geldig || bezig} onClick={() => void start()}>
            Vergelijken
          </button>
        </>
      }
    >
      <p className="werkruimte-uitleg">
        Het resultaat is het origineel met de verschillen als bijgehouden wijzigingen. Het opent in een nieuw tabblad met het deelvenster Wijzigingen.
      </p>
      {keuze("Origineel document", origineel, setOrigineel, "origineel")}
      {keuze("Gewijzigd document", gewijzigd, setGewijzigd, "gewijzigd")}
      <div className="tw-raster2">
        <label className="werkruimte-veld">
          <span>Wijzigingen toeschrijven aan</span>
          <input type="text" value={naam} onChange={(e) => setNaam(e.target.value)} />
        </label>
        <label className="werkruimte-veld">
          <span>Vergelijken op</span>
          <select value={korrel} onChange={(e) => setKorrel(e.target.value as "word" | "char")}>
            <option value="word">Woorden</option>
            <option value="char">Tekens</option>
          </select>
        </label>
      </div>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={accepteren} onChange={(e) => setAccepteren(e.target.checked)} />
        Bestaande wijzigingen eerst accepteren (alleen voor de vergelijking)
      </label>
      {fouttekst && <p className="werkruimte-fout">{fouttekst}</p>}
      {fout1.length > 0 && (
        <div className="werkruimte-fout" role="alert">
          <p>De versies konden niet worden vergeleken:</p>
          <ul>
            {fout1.map((m) => (
              <li key={m.tekst}>
                {m.tekst}
                {m.aantal > 1 ? ` (${m.aantal}×)` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {uitkomst?.ok && uitkomst.verschillen > 0 && (
        <ul className="tw-verschillen">
          {uitkomst.wijzigingen.slice(0, 20).map((w) => {
            const v = verschilTekst(w);
            return (
              <li key={w.id}>
                {v.soort}: {v.oud && <del>{v.oud}</del>} {v.nieuw && <ins>{v.nieuw}</ins>}
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={invoer}
        type="file"
        hidden
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          void file.arrayBuffer().then((buffer) => {
            const bestand = { naam: file.name, bytes: new Uint8Array(buffer) };
            if (kiesVoor.current === "origineel") setOrigineel({ bron: "bestand", bestand });
            else setGewijzigd({ bron: "bestand", bestand });
          });
        }}
      />
    </Dialoog>
  );
}
