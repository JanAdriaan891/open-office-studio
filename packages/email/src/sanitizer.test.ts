import { describe, expect, it } from "vitest";
import { frameDocument, htmlNaarTekst, saneerCss, saneerHtml, tekstNaarHtml, veiligeLink } from "./sanitizer";

// Bekende XSS-vectoren (o.a. OWASP-cheatsheet, html5sec.org); geen ervan mag
// actieve inhoud overhouden.
const VECTOREN = [
  `<script>alert(1)</script>`,
  `<SCRIPT SRC=//x.invalid/xss.js></SCRIPT>`,
  `<img src=x onerror=alert(1)>`,
  `<IMG SRC="javascript:alert('XSS');">`,
  `<IMG SRC=JaVaScRiPt:alert('XSS')>`,
  `<IMG SRC=&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;&#97;&#108;&#101;&#114;&#116;&#40;&#39;&#88;&#83;&#83;&#39;&#41;>`,
  `<a href="jav&#x09;ascript:alert(1)">x</a>`,
  `<a href=" javascript:alert(1)">x</a>`,
  `<a href="java\nscript:alert(1)">x</a>`,
  `<a href="vbscript:msgbox(1)">x</a>`,
  `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>`,
  `<svg/onload=alert(1)>`,
  `<svg><script>alert(1)</script></svg>`,
  `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`,
  `<iframe src="javascript:alert(1)"></iframe>`,
  `<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
  `<object data="javascript:alert(1)"></object>`,
  `<embed src="javascript:alert(1)">`,
  `<body onload=alert(1)>`,
  `<div style="background:url(javascript:alert(1))">x</div>`,
  `<div style="width: expression(alert(1))">x</div>`,
  `<div style="-moz-binding:url(http://x.invalid/xss.xml#xss)">x</div>`,
  `<div style="background:url(&#1;javascript:alert(1))">x</div>`,
  `<form action="javascript:alert(1)"><button>x</button></form>`,
  `<input onfocus=alert(1) autofocus>`,
  `<details open ontoggle=alert(1)>`,
  `<marquee onstart=alert(1)>x</marquee>`,
  `<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`,
  `<base href="javascript:alert(1)//">`,
  `<link rel=stylesheet href="javascript:alert(1)">`,
  `<style>@import 'javascript:alert(1)';</style>`,
  `<style>body{background:url("javascript:alert(1)")}</style>`,
  `<style></style><img src=x onerror=alert(1)>`,
  `<noscript><p title="</noscript><img src=x onerror=alert(1)>">`,
  `<title><img src=x onerror=alert(1)></title>`,
  `<textarea><script>alert(1)</script></textarea>`,
  `<a href="#" onclick="alert(1)">x</a>`,
  `<div onmouseover="alert(1)">x</div>`,
  `<img src="x" ONERROR="alert(1)">`,
  `<img/src="x"/onerror="alert(1)">`,
  `<template><script>alert(1)</script></template>`,
  `<!--<img src="--><img src=x onerror=alert(1)//">`,
  `<a href="javascript&colon;alert(1)">x</a>`,
  `<table background="javascript:alert(1)"><tr><td>x</td></tr></table>`,
  `<video><source onerror="alert(1)"></video>`,
  `<x onclick=alert(1)>klik</x>`,
];

describe("saneerHtml tegen XSS-vectoren", () => {
  for (const vector of VECTOREN) {
    it(vector.slice(0, 60), () => {
      const { html } = saneerHtml(vector);
      expect(html).not.toMatch(/<script|<iframe|<object|<embed|<svg|<math|<form|<input|<button|<meta|<base|<link|<template|<video|<source/i);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html).not.toMatch(/javascript:|vbscript:|data:text|expression\(|-moz-binding/i);
      // Elke overgebleven tag moet uit de toegestane lijst komen.
      for (const [, tag] of html.matchAll(/<([a-z0-9]+)/gi))
        expect(["a", "div", "p", "table", "tbody", "tr", "td", "details", "span", "style", "img"]).toContain(tag.toLowerCase());
    });
  }

  it("behoudt gewone opmaak", () => {
    const { html } = saneerHtml(`<p style="color: red; position: fixed">Hallo <b>wereld</b> <a href="https://voorbeeld.nl/a?b=1&c=2">link</a></p>`);
    expect(html).toBe(`<p style="color: red">Hallo <b>wereld</b> <a href="https://voorbeeld.nl/a?b=1&amp;c=2" rel="noopener noreferrer">link</a></p>`);
  });

  it("blokkeert externe afbeeldingen standaard en telt ze", () => {
    const invoer = `<img src="https://x.invalid/a.png" alt="A"><div style="background-image:url(https://x.invalid/b.png)">x</div><td background="http://x.invalid/c.png"></td>`;
    const uit = saneerHtml(invoer);
    expect(uit.geblokkeerd).toBe(3);
    expect(uit.html).not.toContain("x.invalid");
    expect(uit.html).toContain("[A]");
    const toegestaan = saneerHtml(invoer, { externeInhoud: true });
    expect(toegestaan.geblokkeerd).toBe(0);
    expect(toegestaan.html).toContain(`src="https://x.invalid/a.png"`);
  });

  it("zet cid:-afbeeldingen om naar de aangeleverde blob-URL", () => {
    const { html } = saneerHtml(`<img src="cid:logo@x"><img src="cid:onbekend">`, {
      cid: (id) => (id === "logo@x" ? "blob:http://localhost/123" : undefined),
    });
    expect(html).toContain(`src="blob:http://localhost/123"`);
    expect(html.match(/<img/g)?.length).toBe(1);
  });

  it("staat alleen data:-afbeeldingen van rasterformaten toe", () => {
    expect(saneerHtml(`<img src="data:image/png;base64,iVBORw0KGgo=">`).html).toContain("data:image/png");
    expect(saneerHtml(`<img src="data:image/svg+xml;base64,PHN2Zz4=">`).html).not.toContain("data:");
  });

  it("saneert stijlblokken", () => {
    const { html } = saneerHtml(
      `<style>@import url(https://x.invalid/a.css); .kop > h1 { color: red; position: absolute } @media (max-width: 600px) { p { font-size: 12px } } @font-face { src: url(x) }</style><p>x</p>`,
    );
    expect(html).toContain(".kop > h1 { color: red }");
    expect(html).toContain("@media (max-width: 600px) { p { font-size: 12px } }");
    expect(html).not.toMatch(/@import|@font-face|position/);
  });

  it("kan </style> in CSS niet laten ontsnappen", () => {
    const { html } = saneerHtml(`<style>p { color: red } </style ><img src=x onerror=alert(1)></style>`);
    expect(html).not.toMatch(/onerror/);
  });

  it("verwijdert rel/target-trucs en voegt noopener toe", () => {
    const { html } = saneerHtml(`<a href="https://a.nl" target="_top" id="x" name="y">a</a>`);
    expect(html).toBe(`<a href="https://a.nl/" rel="noopener noreferrer">a</a>`);
  });
});

describe("veiligeLink", () => {
  it("staat http(s), mailto en tel toe", () => {
    expect(veiligeLink("https://voorbeeld.nl")).toBe("https://voorbeeld.nl/");
    expect(veiligeLink("mailto:a@b.nl")).toBe("mailto:a@b.nl");
    expect(veiligeLink("tel:+31201234567")).toBe("tel:+31201234567");
  });
  it("weigert gevaarlijke en relatieve links", () => {
    for (const link of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,x", "/relatief", "file:///etc/passwd", "#anker"])
      expect(veiligeLink(link)).toBeNull();
  });
});

describe("saneerCss", () => {
  it("laat alleen toegestane eigenschappen door", () => {
    expect(saneerCss("color: red; position: fixed; z-index: 9; font-weight: bold", {}, { geblokkeerd: 0 })).toBe("color: red; font-weight: bold");
  });
  it("weigert escapes waarmee filters te omzeilen zijn", () => {
    expect(saneerCss("background: u\\72l(javascript:alert(1))", {}, { geblokkeerd: 0 })).toBe("");
  });
});

describe("tekst en HTML", () => {
  it("maakt links in platte tekst klikbaar en escapet de rest", () => {
    const html = tekstNaarHtml("Zie https://voorbeeld.nl/x. <b>geen opmaak</b>");
    expect(html).toContain(`<a href="https://voorbeeld.nl/x"`);
    expect(html).toContain("&lt;b&gt;");
  });
  it("zet HTML om naar tekst met lijsten en regels", () => {
    expect(htmlNaarTekst("<p>Hallo</p><ul><li>een</li><li>twee</li></ul><p>Groet<br>Piet</p>")).toBe("Hallo\n\n- een\n- twee\n\nGroet\nPiet");
  });
  it("frameDocument heeft een strenge CSP zonder scripts", () => {
    const doc = frameDocument("<p>x</p>");
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("script-src 'none'");
    expect(doc).toContain("img-src data: blob:;");
    expect(frameDocument("", { externeInhoud: true })).toContain("img-src data: blob: https: http:");
  });
});

describe("htmlNaarTekst met citaten", () => {
  it("zet blockquote om naar >-regels, ook genest", () => {
    expect(htmlNaarTekst("<p>Ja</p><p>Op x schreef y:</p><blockquote><p>Eerst</p><blockquote>Ouder</blockquote></blockquote>")).toBe(
      "Ja\n\nOp x schreef y:\n\n> Eerst\n>\n>> Ouder",
    );
  });
  it("laat klassen weg als dat gevraagd is", () => {
    expect(saneerHtml(`<div class="office-dialoog">x</div>`, { klassen: false }).html).toBe("<div>x</div>");
  });
});

describe("externe inhoud via de host", () => {
  it("verzamelt externe URL's en vervangt ze alleen door blob-URL's", async () => {
    const { externeUrls } = await import("./sanitizer");
    const html = `<img src="https://x.invalid/a.png"><div style="background:url(http://x.invalid/b.png)">x</div><img src="https://x.invalid/a.png">`;
    expect(externeUrls(html)).toEqual(["https://x.invalid/a.png", "http://x.invalid/b.png"]);
    const uit = saneerHtml(html, {
      externeInhoud: true,
      extern: (u) => (u.endsWith("a.png") ? "blob:http://localhost/1" : "https://evil.invalid/x.png"),
    });
    expect(uit.html).toContain(`src="blob:http://localhost/1"`);
    expect(uit.html).not.toContain("x.invalid");
    expect(uit.html).not.toContain("evil.invalid");
    expect(uit.geblokkeerd).toBe(1);
  });
});
