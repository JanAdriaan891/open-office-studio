/**
 * Klembord voor het raster: tekst (tabgescheiden) en HTML tegelijk, in de
 * browser én in Tauri. Volgorde: synchroon via `execCommand("copy")` met een
 * copy-luisteraar (werkt binnen een toetsaanslag of klik, ook in WebKitGTK),
 * anders de asynchrone Clipboard API (met beloftes in ClipboardItem, zodat het
 * ophalen van rijen de gebruikersactie niet verliest), en als laatste writeText.
 */
export interface KlembordInhoud {
  tekst: string;
  html: string;
}

function kopieerSynchroon(i: KlembordInhoud): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  let gezet = false;
  const luister = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData("text/plain", i.tekst);
    e.clipboardData.setData("text/html", i.html);
    e.preventDefault();
    gezet = true;
  };
  // Tijdelijk element, zodat er een selectie is en de vorige focus terugkomt.
  const vorige = document.activeElement as HTMLElement | null;
  const veld = document.createElement("textarea");
  veld.value = i.tekst;
  veld.setAttribute("readonly", "");
  veld.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(veld);
  veld.select();
  document.addEventListener("copy", luister, true);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.removeEventListener("copy", luister, true);
    veld.remove();
    vorige?.focus?.({ preventScroll: true });
  }
  return ok && gezet;
}

/** Schrijft naar het klembord; geeft false als geen enkele weg lukte. */
export async function schrijfKlembord(inhoud: KlembordInhoud | Promise<KlembordInhoud>): Promise<boolean> {
  if (!(inhoud instanceof Promise) && kopieerSynchroon(inhoud)) return true;
  const belofte = Promise.resolve(inhoud);
  const klembord = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (klembord?.write && typeof ClipboardItem !== "undefined") {
    try {
      await klembord.write([
        new ClipboardItem({
          "text/plain": belofte.then((i) => new Blob([i.tekst], { type: "text/plain" })),
          "text/html": belofte.then((i) => new Blob([i.html], { type: "text/html" })),
        }),
      ]);
      return true;
    } catch {
      /* volgende weg */
    }
  }
  const i = await belofte;
  if (klembord?.writeText)
    try {
      await klembord.writeText(i.tekst);
      return true;
    } catch {
      /* volgende weg */
    }
  return kopieerSynchroon(i);
}

/** Leest tekst van het klembord (voor “Plakken” via menu of lint); null als dat niet mag of kan. */
export async function leesKlembord(): Promise<string | null> {
  try {
    return (await navigator.clipboard?.readText?.()) ?? null;
  } catch {
    return null;
  }
}
