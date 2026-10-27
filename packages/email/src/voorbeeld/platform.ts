/** Webview-detectie voor keuzes die per platform verschillen (PDF-weergave). */

export interface Webview {
  soort: "chromium" | "webkit-apple" | "webkitgtk" | "firefox" | "onbekend";
  /** Kan de webview een PDF-blob in een iframe betrouwbaar tonen? */
  pdfIngebouwd: boolean;
}

export function herkenWebview(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
  pdfViewerEnabled: boolean | undefined = typeof navigator !== "undefined"
    ? (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled
    : undefined,
): Webview {
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return { soort: "chromium", pdfIngebouwd: pdfViewerEnabled !== false };
  if (/Firefox\//.test(ua)) return { soort: "firefox", pdfIngebouwd: pdfViewerEnabled !== false };
  if (/AppleWebKit\//.test(ua)) {
    // WKWebView (macOS/iOS) toont PDF zelf; WebKitGTK (Linux) niet betrouwbaar.
    if (/Macintosh|Mac OS X|iPhone|iPad/.test(ua) && !/Linux|X11/.test(ua)) return { soort: "webkit-apple", pdfIngebouwd: true };
    if (/Linux|X11|FreeBSD/.test(ua) && !/Android/.test(ua)) return { soort: "webkitgtk", pdfIngebouwd: false };
  }
  return { soort: "onbekend", pdfIngebouwd: pdfViewerEnabled === true };
}
