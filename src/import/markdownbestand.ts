/** Markdown (CommonMark + GFM) naar het eigen tekstmodel. */
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import {
  dataUrlAfbeelding,
  afbeeldingstype,
  veiligeLink,
  type Blok,
  type Inline,
  type Tekstdocument,
  type Tekstopmaak,
} from "./tekstmodel";
import { htmlFragmentNaarInline } from "./htmlbestand";

/** De velden van mdast-knopen die we gebruiken. */
interface Knoop {
  type: string;
  children?: Knoop[];
  value?: string;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  url?: string;
  alt?: string | null;
  checked?: boolean | null;
  identifier?: string;
  label?: string | null;
}

export interface MarkdownImport {
  document: Tekstdocument;
  /** Afbeeldingen die niet konden worden ingesloten (extern of lokaal pad). */
  nietIngesloten: number;
  /** Ingesloten ruwe HTML die alleen als tekst is overgenomen. */
  ruweHtml: number;
  voetnoten: number;
}

export function markdownNaarModel(markdown: string): MarkdownImport {
  const boom = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as unknown as Knoop;
  const telling = { nietIngesloten: 0, ruweHtml: 0, voetnoten: 0 };
  const definities = new Map<string, string>();
  const verzamel = (knoop: Knoop) => {
    if (knoop.type === "definition" && knoop.identifier && knoop.url)
      definities.set(knoop.identifier.toLowerCase(), knoop.url);
    knoop.children?.forEach(verzamel);
  };
  verzamel(boom);

  const inline = (
    knopen: Knoop[] = [],
    opmaak: Tekstopmaak & { link?: string } = {},
  ): Inline[] =>
    knopen.flatMap((k): Inline[] => {
      switch (k.type) {
        case "text":
          return [
            {
              soort: "tekst",
              tekst: (k.value ?? "").replace(/\n/g, " "),
              ...opmaak,
            },
          ];
        case "strong":
          return inline(k.children, { ...opmaak, vet: true });
        case "emphasis":
          return inline(k.children, { ...opmaak, cursief: true });
        case "delete":
          return inline(k.children, { ...opmaak, doorgehaald: true });
        case "inlineCode":
          return [
            { soort: "tekst", tekst: k.value ?? "", ...opmaak, code: true },
          ];
        case "break":
          return [{ soort: "regeleinde" }];
        case "link":
          return inline(k.children, { ...opmaak, link: veiligeLink(k.url) });
        case "linkReference": {
          const url = definities.get((k.identifier ?? "").toLowerCase());
          return inline(k.children, { ...opmaak, link: veiligeLink(url) });
        }
        case "image":
        case "imageReference": {
          const url =
            k.type === "image"
              ? k.url
              : definities.get((k.identifier ?? "").toLowerCase());
          const data = url ? dataUrlAfbeelding(url) : null;
          const type = data ? afbeeldingstype(data) : null;
          if (data && type)
            return [{ soort: "afbeelding", data, type, alt: k.alt ?? "" }];
          telling.nietIngesloten++;
          const label = `[Afbeelding${k.alt ? ": " + k.alt : ""}]`;
          return [
            { soort: "tekst", tekst: label, ...opmaak, link: veiligeLink(url) },
          ];
        }
        case "html":
          telling.ruweHtml++;
          return htmlFragmentNaarInline(k.value ?? "", opmaak);
        case "footnoteReference":
          telling.voetnoten++;
          return [
            {
              soort: "tekst",
              tekst: `[${k.label ?? k.identifier}]`,
              ...opmaak,
              superschrift: true,
            },
          ];
        default:
          return k.children
            ? inline(k.children, opmaak)
            : k.value
              ? [{ soort: "tekst", tekst: k.value, ...opmaak }]
              : [];
      }
    });

  const blokken = (knopen: Knoop[] = []): Blok[] =>
    knopen.flatMap((k): Blok[] => {
      switch (k.type) {
        case "heading":
          return [
            {
              soort: "kop",
              niveau: Math.min(6, Math.max(1, k.depth ?? 1)) as 1,
              inhoud: inline(k.children),
            },
          ];
        case "paragraph":
          return [{ soort: "alinea", inhoud: inline(k.children) }];
        case "blockquote":
          return [{ soort: "citaat", blokken: blokken(k.children) }];
        case "code":
          return [{ soort: "code", tekst: k.value ?? "" }];
        case "thematicBreak":
          return [{ soort: "lijn" }];
        case "list":
          return [
            {
              soort: "lijst",
              geordend: !!k.ordered,
              start: k.start ?? 1,
              items: (k.children ?? []).map((item) => {
                const inhoud = blokken(item.children);
                if (typeof item.checked === "boolean") {
                  const vak: Inline = {
                    soort: "tekst",
                    tekst: item.checked ? "☒ " : "☐ ",
                  };
                  const eerste = inhoud[0];
                  if (eerste?.soort === "alinea") eerste.inhoud.unshift(vak);
                  else inhoud.unshift({ soort: "alinea", inhoud: [vak] });
                }
                return inhoud;
              }),
            },
          ];
        case "table":
          return [
            {
              soort: "tabel",
              kop: true,
              rijen: (k.children ?? []).map((rij) =>
                (rij.children ?? []).map((cel) => [
                  { soort: "alinea", inhoud: inline(cel.children) },
                ]),
              ),
            },
          ];
        case "html": {
          telling.ruweHtml++;
          const inhoud = htmlFragmentNaarInline(k.value ?? "");
          return inhoud.length ? [{ soort: "alinea", inhoud }] : [];
        }
        case "footnoteDefinition":
          telling.voetnoten++;
          return blokken(k.children).map((b, i) =>
            i === 0 && b.soort === "alinea"
              ? {
                  ...b,
                  inhoud: [
                    {
                      soort: "tekst",
                      tekst: `[${k.label ?? k.identifier}] `,
                      superschrift: true,
                    },
                    ...b.inhoud,
                  ],
                }
              : b,
          );
        case "definition":
          return [];
        default:
          return k.children ? blokken(k.children) : [];
      }
    });

  return { document: { blokken: blokken(boom.children) }, ...telling };
}
