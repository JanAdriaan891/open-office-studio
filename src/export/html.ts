import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ENTITEITEN: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const ontsnap = (tekst: string) =>
  tekst.replace(/[&<>"']/g, (teken) => ENTITEITEN[teken]);

/**
 * Markdown naar gesaneerde HTML. Ruwe HTML in de Markdown wordt niet
 * uitgevoerd en onveilige linkbestemmingen (zoals javascript:) worden geleegd.
 */
export function markdownNaarHtml(markdown: string) {
  return renderToStaticMarkup(
    createElement(
      Markdown,
      { remarkPlugins: [remarkGfm], skipHtml: true },
      markdown,
    ),
  );
}

/** Een volledig, zelfstandig HTML-document zonder scripts of externe bronnen. */
export function htmlDocument(titel: string, inhoud: string) {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<meta name="generator" content="OpenAEC Office Studio">
<title>${ontsnap(titel)}</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#1c1c1c}
table{border-collapse:collapse;margin:1rem 0}
th,td{border:1px solid #c8c8c8;padding:.25rem .5rem;vertical-align:top}
td.getal{text-align:right}
img{max-width:100%;height:auto;border:1px solid #ddd}
section.dia{margin:2rem 0;padding-bottom:1rem;border-bottom:1px solid #ddd}
</style>
</head>
<body>
${inhoud}
</body>
</html>
`;
}

/** Zichtbare tekst uit door ons gemaakte HTML; blokken worden regels, cellen tabs. */
export function htmlNaarTekst(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)>\s*(?=<(td|th)\b)/gi, "\t")
    .replace(/<\/(p|h[1-6]|li|tr|table|section|blockquote|pre|div)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(
      /&(lt|gt|quot|amp|nbsp|#\d+|#x[0-9a-f]+);/gi,
      (_, naam: string) => {
        const vast: Record<string, string> = {
          lt: "<",
          gt: ">",
          quot: '"',
          amp: "&",
          nbsp: " ",
        };
        if (vast[naam.toLowerCase()]) return vast[naam.toLowerCase()];
        const code = /^#x/i.test(naam)
          ? parseInt(naam.slice(2), 16)
          : parseInt(naam.slice(1), 10);
        return String.fromCodePoint(code);
      },
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "")
    .concat("\n");
}
