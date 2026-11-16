# #356 EPUB input

This is the bounded EPUB dependency of #30. It keeps the earlier runtime delivery
and c0 installer proofs intact. Native UI at c0 is not input proof for this new
application code.

## Original failure

`runtime-export.epub` is the exact 4,010-byte book retained from
[audit 43852869341](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43852869341).
SHA-256: `a1dae7bb740c07bfffa6210e6b406456e26f7e9837d18e77c573793324adbed0`.
It was exported from this repository's own `Ontwerpnotitie.docx` by the bundled
LibreOffice 26.8.2.2 in the c0 DEB, then refused on import by that same runtime.
ZIP mimetype, container and OPF spine were independently checked before import.
No third-party book or personal document is included.

## New own fixture and scope

`leesvolgorde.epub` is generated deterministically with
`python scripts/maak-epub356-proef.py`. Its text is project-authored and its PNG
is this project's existing `src-tauri/icons/32x32.png`. Both are covered by the
repository's license. ZIP and manifest list the second chapter first; OPF spine
lists the first chapter first. Chapter one includes Unicode, emphasis, a list
and a percent-encoded relative PNG reference; chapter two contains a table.

The application reads container → OPF → spine, validates the ZIP and XML, and
feeds the existing non-executing HTML importer and DOCX writer. It embeds
manifest-listed PNG/JPEG/GIF images and never fetches remote resources. Existing
safe-content rules are retained. The pinned XML parser is already present in
the lockfile and is now an explicit application dependency. It does not use a
native converter, so the same input route is available in the hosted browser.

This imports a document copy with a clear preservation report. CSS stylesheets,
book fonts, fixed page layout, internal navigation, scripts, audio/video and SVG
are not preserved. Missing/external/unsupported images are counted in the
report. DRM and unsupported spine media fail explicitly; no fallback to an
empty converter result is used. The initial save target is DOCX and importing
does not overwrite the original EPUB. EPUB export retains its existing desktop
runtime route.

The structure follows the primary [W3C EPUB specification](https://www.w3.org/TR/epub-33/).

## Verification

`src/import/epubbestand.test.ts` checks real fixtures, spine order, table/emphasis,
exact image bytes, unchanged input, original c0 failure fixture, native runtime
independence, actual editor save/reopen, inactive scripts/no fetching, explicit
invalid/DRM/media errors and package/expanded-output limits. EPUB 2 with a
standard XHTML doctype also passes; the doctype is removed without fetching it.

Local results: 15 EPUB tests passed; 16 existing text-import regression tests
passed, TypeScript passed, translation key/interpolation check passed for all
nine active languages (23 pre-existing prepared-language warnings). Local
dependencies remain read-only; the test runner uses a private Vite cache and
disables result-cache writes. The direct XML dependency is resolved to the
already installed exact 0.9.12 package for these local checks; CI must verify the
updated frozen lockfile normally.

Native Windows/Linux/macOS input operation and the production hosted route have
not yet been executed for this new source. No platform pass or completed issue
is inferred from the unit/engine results above.
