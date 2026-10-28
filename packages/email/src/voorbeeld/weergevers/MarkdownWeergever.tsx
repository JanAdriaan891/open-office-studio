/**
 * Markdown met react-markdown + remark-gfm, zonder rauwe HTML (`skipHtml`,
 * geen rehype-raw). Links gaan pas na bevestiging extern open; externe
 * afbeeldingen zijn standaard geblokkeerd.
 */
import { useMemo, useState } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, FileCode, ImageOff } from "lucide-react";
import { LIMIETEN, type WeergeverProps } from "../contract";
import { decodeerTekst } from "../codering";
import { grootteTekst } from "../herkenning";
import { Fout, Laden, useBytes } from "./gemeenschappelijk";
import { regelnummers } from "./TekstWeergever";

/** Alleen http(s) en mailto zijn klikbaar (na bevestiging). */
export function isVeiligeLink(href: string | undefined): href is string {
  return !!href && /^(https?:|mailto:)/i.test(href);
}

export function MarkdownWeergave({
  tekst,
  externeAfbeeldingen,
  opLink,
}: {
  tekst: string;
  externeAfbeeldingen: boolean;
  /** Gebruiker klikte op een (veilige) link. */
  opLink?: (url: string) => void;
}) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      urlTransform={(url, sleutel) => {
        // Inline afbeeldingen als data-URL zijn lokaal en mogen; de standaard filtert de rest.
        if (sleutel === "src" && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url)) return url;
        return defaultUrlTransform(url);
      }}
      components={{
        a: ({ href, children, title }) =>
          isVeiligeLink(href) ? (
            <a
              href={href}
              title={title ?? href}
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                opLink?.(href);
              }}
            >
              {children}
            </a>
          ) : (
            <span className="vb-md-link" title={href ? `Link niet geopend: ${href}` : undefined}>
              {children}
            </span>
          ),
        img: ({ src, alt }) => {
          const bron = typeof src === "string" ? src : "";
          const lokaal = bron.startsWith("data:image/");
          if (lokaal || (externeAfbeeldingen && /^https?:/i.test(bron)))
            return <img src={bron} alt={alt ?? ""} referrerPolicy="no-referrer" loading="lazy" />;
          return (
            <span className="vb-md-geblokkeerd" title={bron || undefined}>
              <ImageOff size={14} aria-hidden /> {alt || "Afbeelding"}{" "}
              {/^https?:/i.test(bron) ? "(externe afbeelding geblokkeerd)" : "(niet beschikbaar)"}
            </span>
          );
        },
      }}
    >
      {tekst}
    </Markdown>
  );
}

/** Bevat de tekst externe afbeeldingen (markdown-syntaxis)? */
export function heeftExterneAfbeeldingen(tekst: string): boolean {
  return /!\[[^\]]*\]\(\s*<?https?:/i.test(tekst) || /^\s*\[[^\]]+\]:\s*<?https?:/im.test(tekst);
}

export function MarkdownWeergever({ bron, acties }: WeergeverProps) {
  const geladen = useBytes(bron);
  const [modus, zetModus] = useState<"weergave" | "bron">("weergave");
  const [extern, zetExtern] = useState(false);
  const [teBevestigen, zetTeBevestigen] = useState<string | null>(null);
  const bytes = geladen.stand === "klaar" ? geladen.waarde : null;
  const gedecodeerd = useMemo(() => (bytes ? decodeerTekst(bytes, LIMIETEN.markdownBytes) : null), [bytes]);
  const externAanwezig = useMemo(() => (gedecodeerd ? heeftExterneAfbeeldingen(gedecodeerd.tekst) : false), [gedecodeerd]);

  if (geladen.stand === "laden") return <Laden />;
  if (geladen.stand === "fout") return <Fout melding={`Het bestand kon niet worden geladen: ${geladen.melding}`} />;
  const tekst = gedecodeerd!.tekst;

  return (
    <div className="vb-markdown">
      <div className="vb-werkbalk" role="toolbar" aria-label="Markdown">
        <div className="vb-segment" role="group" aria-label="Weergave">
          <button type="button" aria-pressed={modus === "weergave"} onClick={() => zetModus("weergave")}>
            <Eye size={15} aria-hidden /> Weergave
          </button>
          <button type="button" aria-pressed={modus === "bron"} onClick={() => zetModus("bron")}>
            <FileCode size={15} aria-hidden /> Bron
          </button>
        </div>
        {modus === "weergave" && externAanwezig && (
          <label className="vb-schakel">
            <input type="checkbox" checked={extern} onChange={(e) => zetExtern(e.target.checked)} /> Externe afbeeldingen tonen
          </label>
        )}
      </div>
      {gedecodeerd!.afgekapt && (
        <p className="vb-band" role="note">
          Eerste {grootteTekst(LIMIETEN.markdownBytes)} getoond van {grootteTekst(geladen.waarde.length)}.
        </p>
      )}
      {teBevestigen && (
        <div className="vb-band vb-bevestig" role="alertdialog" aria-label="Link openen">
          <span>
            Deze link openen buiten Office Studio?
            <br />
            <code>{teBevestigen}</code>
          </span>
          <span className="vb-bandknoppen">
            <button
              type="button"
              className="vb-knop is-primair"
              autoFocus
              onClick={() => {
                const url = teBevestigen;
                zetTeBevestigen(null);
                void (acties.openLink ?? standaardOpenLink)(url);
              }}
            >
              Openen
            </button>
            <button type="button" className="vb-knop" onClick={() => zetTeBevestigen(null)}>
              Annuleren
            </button>
          </span>
        </div>
      )}
      {modus === "weergave" ? (
        <div className="vb-markdownvlak" tabIndex={0}>
          <article className="vb-md-inhoud">
            <MarkdownWeergave tekst={tekst} externeAfbeeldingen={extern} opLink={zetTeBevestigen} />
          </article>
        </div>
      ) : (
        <div className="vb-tekstvlak" tabIndex={0}>
          <pre className="vb-regelnummers" aria-hidden>
            {regelnummers(tekst)}
          </pre>
          <pre className="vb-tekstinhoud">{tekst}</pre>
        </div>
      )}
    </div>
  );
}

function standaardOpenLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
