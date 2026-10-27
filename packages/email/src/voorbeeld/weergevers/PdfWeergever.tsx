/**
 * PDF — tijdelijk. Waar de webview zelf betrouwbaar PDF toont (Chromium/
 * WebView2, WKWebView, Firefox) gaat de blob in een iframe; op WebKitGTK
 * (Linux-desktop) en onbekende webviews verschijnt een metadatakaart. De
 * definitieve weergave komt via de Rust-route (zie README.md).
 *
 * Het iframe heeft geen `sandbox`: de ingebouwde PDF-viewer van Chromium
 * weigert in een gesandboxt frame. Daarom wordt het alleen gebruikt als de
 * inhoud aantoonbaar een PDF is (magische bytes) en de blob het type
 * application/pdf heeft, zodat er nooit HTML in de app-origin wordt geladen.
 */
import { useMemo, useState } from "react";
import { FileText, Info } from "lucide-react";
import { LIMIETEN, type WeergeverProps } from "../contract";
import { leesPdfMeta } from "../pdf-meta";
import { herkenWebview } from "../platform";
import { BestandKnoppen, Fout, Kaart, Laden, basisRegels, datumTekst, getal, useBlobUrl, useBytes } from "./gemeenschappelijk";

export function PdfWeergever({ bron, herkenning, acties }: WeergeverProps) {
  const geladen = useBytes(bron);
  const webview = useMemo(() => herkenWebview(), []);
  const ingebouwd = webview.pdfIngebouwd && herkenning.opInhoud;
  const [kaart, zetKaart] = useState(!ingebouwd);
  const bytes = geladen.stand === "klaar" ? geladen.waarde : null;
  const url = useBlobUrl(ingebouwd && !kaart ? bytes : null, "application/pdf");
  const meta = useMemo(() => {
    if (!bytes || !kaart || bytes.length > LIMIETEN.pdfMetaBytes) return null;
    try {
      return leesPdfMeta(bytes);
    } catch {
      return null;
    }
  }, [bytes, kaart]);

  if (geladen.stand === "laden") return <Laden />;
  if (geladen.stand === "fout") return <Fout melding={`De PDF kon niet worden geladen: ${geladen.melding}`} />;

  if (!kaart && url)
    return (
      <div className="vb-pdf">
        <div className="vb-werkbalk" role="toolbar" aria-label="PDF">
          <button type="button" className="vb-knop" onClick={() => zetKaart(true)}>
            <Info size={15} aria-hidden /> Eigenschappen
          </button>
          <span className="vb-ruimte" />
          <BestandKnoppen bron={bron} acties={acties} />
        </div>
        <iframe className="vb-pdfframe" src={url} title={`PDF: ${bron.bestandsnaam}`} referrerPolicy="no-referrer" />
      </div>
    );

  const melding = !ingebouwd
    ? webview.soort === "webkitgtk"
      ? "De webview op Linux kan PDF's niet betrouwbaar tonen. Het volledige voorbeeld volgt in een volgende versie (Rust-viewer)."
      : "Deze PDF kan hier niet als voorbeeld worden getoond. Het volledige voorbeeld volgt in een volgende versie (Rust-viewer)."
    : undefined;
  return (
    <Kaart
      icoon={<FileText size={26} />}
      titel={meta?.titel || bron.bestandsnaam}
      ondertitel={meta?.versie ? `PDF ${meta.versie}` : "PDF-document"}
      regels={[
        ...basisRegels(bron, geladen.waarde.length),
        { label: "Pagina's", waarde: meta?.paginas != null ? getal(meta.paginas) : meta ? "onbekend" : undefined },
        { label: "Auteur", waarde: meta?.auteur },
        { label: "Onderwerp", waarde: meta?.onderwerp },
        { label: "Gemaakt met", waarde: meta?.maker && meta.producent && meta.maker !== meta.producent ? `${meta.maker} (${meta.producent})` : meta?.maker || meta?.producent },
        { label: "Aangemaakt", waarde: datumTekst(meta?.aangemaakt) },
        { label: "Gewijzigd", waarde: datumTekst(meta?.gewijzigd) },
        { label: "Versleuteld", waarde: meta ? (meta.versleuteld ? "ja" : "nee") : undefined },
        { label: "Let op", waarde: meta?.onvolledig ? "het bestand lijkt onvolledig of beschadigd" : undefined },
      ]}
      melding={melding}
      knoppen={
        <>
          {ingebouwd && (
            <button type="button" className="vb-knop is-primair" onClick={() => zetKaart(false)}>
              <FileText size={15} aria-hidden /> Voorbeeld tonen
            </button>
          )}
          <BestandKnoppen bron={bron} acties={acties} />
        </>
      }
    />
  );
}
