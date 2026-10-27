/** Drukt dia's af via een tijdelijk, onzichtbaar frame met één dia per pagina. */
export async function drukDiasAf(pngs: Uint8Array[]) {
  const urls = pngs.map((png) =>
    URL.createObjectURL(new Blob([new Uint8Array(png)], { type: "image/png" })),
  );
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>Dia's</title><style>@page{size:landscape;margin:0}html,body{margin:0}img{display:block;width:100%;height:auto;page-break-after:always;break-after:page}</style></head><body>${urls
      .map((url) => `<img src="${url}" alt="">`)
      .join("")}</body></html>`,
  );
  doc.close();
  await Promise.all(
    [...doc.images].map((img) =>
      img.complete
        ? null
        : new Promise((klaar) => {
            img.onload = img.onerror = klaar;
          }),
    ),
  );
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => {
    frame.remove();
    urls.forEach((url) => URL.revokeObjectURL(url));
  }, 60_000);
}
