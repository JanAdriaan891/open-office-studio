/**
 * Pagina's van een tekstdocument, precies zoals de editor ze afdrukt.
 *
 * De editor rastert bij afdrukken zijn eigen weergavelijst (dezelfde
 * paginering als op het scherm) op 192 dpi en zet die pagina's in een nieuw
 * venster. Wij geven die afdrukroutine een onzichtbaar, eigen "venster" en
 * vangen de pagina's op in plaats van ze naar de printer te sturen. Zo hoeft
 * de app de opmaak niet zelf na te bouwen en blijft de paginering gelijk aan
 * de editor.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { AfdrukDocument, AfdrukPagina } from "./model";
import { metTekstopname, naarPunten } from "./tekstopname";

/** De afdrukroutine rastert met twee beeldpunten per CSS-pixel. */
const BEELDPUNTEN_PER_PX = 2;
const PT_PER_PX = 0.75;
const LEEG_BEELD =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

interface GevangenPagina {
  canvas: HTMLCanvasElement;
}

/** Vangt de afdrukpagina's van de editor op; geeft canvassen in paginavolgorde. */
async function vangPaginas(ref: DocxEditorRef) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:10px;height:10px;border:0;visibility:hidden";
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write("<!doctype html><html><head></head><body></body></html>");
  doc.close();

  const gevangen: GevangenPagina[] = [];
  let klaar!: () => void;
  const afgedrukt = new Promise<void>((r) => (klaar = r));
  const nepVenster = {
    document: doc,
    closed: false,
    opener: null as unknown,
    focus() {},
    print() {
      klaar();
    },
    close() {
      nepVenster.closed = true;
    },
  };

  const origineelOpen = window.open;
  const origineelDataUrl = HTMLCanvasElement.prototype.toDataURL;
  // Losse canvassen (niet in het document) zijn de afdrukpagina's; die hoeven
  // niet als PNG gecodeerd te worden, we bewaren het canvas zelf.
  HTMLCanvasElement.prototype.toDataURL = function (
    this: HTMLCanvasElement,
    ...args: Parameters<HTMLCanvasElement["toDataURL"]>
  ) {
    if (!this.isConnected) {
      gevangen.push({ canvas: this });
      return LEEG_BEELD;
    }
    return origineelDataUrl.apply(this, args);
  };
  try {
    const { resultaat, tekstVan } = await metTekstopname(async () => {
      window.open = (() => nepVenster) as typeof window.open;
      let opdracht: Promise<{ ok: boolean; failure?: { message: string } }>;
      try {
        opdracht = ref.commands.execute("print", null) as never;
      } finally {
        window.open = origineelOpen;
      }
      const uitkomst = await Promise.race([
        opdracht,
        afgedrukt.then(() => ({ ok: true }) as const),
      ]);
      await afgedrukt.catch(() => {});
      return uitkomst;
    });
    if (!resultaat.ok)
      throw new Error(
        ("failure" in resultaat && resultaat.failure?.message) ||
          "Het document kon niet voor afdrukken worden voorbereid.",
      );
    return gevangen.map((p) => ({ canvas: p.canvas, tekst: tekstVan(p.canvas) }));
  } finally {
    window.open = origineelOpen;
    HTMLCanvasElement.prototype.toDataURL = origineelDataUrl;
    frame.remove();
  }
}

/** Pagina's met de maat uit het document; tekenen gebeurt eenmalig op 192 dpi. */
export async function tekstPaginas(
  ref: DocxEditorRef,
  titel: string,
): Promise<AfdrukDocument> {
  await ref.flushPendingInput();
  await ref.whenLayoutComplete({ timeoutMs: 60_000 }).catch(() => 0);
  const paginas = await vangPaginas(ref);
  if (!paginas.length)
    throw new Error("Het document heeft geen pagina's om af te drukken.");
  const uit: AfdrukPagina[] = paginas.map(({ canvas, tekst }, index) => {
    const pxBreedte = canvas.width / BEELDPUNTEN_PER_PX;
    const pxHoogte = canvas.height / BEELDPUNTEN_PER_PX;
    const factor = PT_PER_PX / BEELDPUNTEN_PER_PX;
    const punten = naarPunten(tekst, factor);
    return {
      breedte: pxBreedte * PT_PER_PX,
      hoogte: pxHoogte * PT_PER_PX,
      label: `Pagina ${index + 1}`,
      // De editor rastert altijd op 192 dpi; hogere resoluties zijn niet beschikbaar.
      teken: async () => ({ canvas, tekst: punten }),
    };
  });
  return { titel, paginas: uit };
}
