# Independent P5 Linux/Windows browser evidence audit

PASS for the assigned two platforms and both actual browser routes (`/` and `/office/`). This is browser evidence acceptance, not native or signed-installer acceptance. macOS evidence and its separate follow-up are outside this audit.

- Application: `b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree `e30879fd772871e690847c061ef66e6b81808a05`, version `2026.48.1`.
- QA producer: run `45179944903`, attempt 1, harness `7be704895534c3095f697292af07dc10d2e5860b`. Linux job `137710842379` and Windows job `137710841837` are completed SUCCESS.
- Linux artifact `14822025134`, 4,575,685 bytes, complete ZIP SHA256 `f6efb1bb04654d40d443e9aed13eb889a846407db526d677837e8785e85be170`.
- Windows artifact `14822105792`, 5,110,927 bytes, complete ZIP SHA256 `faa16b7862573c04e852ab277b138a614f6113976dbcc715e050cb302f57bc67`.

The official metadata, complete local ZIP hashes, safe extraction, exact source/tree/build receipts, report byte hashes, four prior Writer issues (356/361/362/363) and nine Office cases per route were checked independently. Source helper hashes were explicitly checked against both Git LF and Windows CRLF representations; archived evidence was never normalized. EPUB saved DOCX text/table and embedded-image SHA were checked directly.

For #374, both vendor modules match edit `4364eb8065228c805d8fbefe7e58c29e392516b6e7cca419e191766881d324ce` and layout `c5a59ce0d980cd7f85775aaf283bcac1c19fba976b47bbe08c0387e2ca7d2569`. Each OS has 44 passing SDK checks. Each route has four passing paint cases and three actual saved DOCX files. Sixteen DOCX files (two SDK exports per OS plus three browser exports per route) were additionally audited with the unchanged shared source oracle from `3169b09020184e3a98a4d5364ad77b15f38ac063`. They retain all eight source body blocks, styles, two placeholder controls, the original DOCVARIABLE Report cache and the ordinary marker outside the field.

All sixteen original final PNGs were viewed directly and serially. The twelve marker images visibly show `REPORT TITLE --`, `STW30 EDIT`, and `2026-11-23` completely, without visible title overlap or clipping; the four controls show only the original title. Subtitles remain visible and separated. Original image SHA256s were checked after review. Stable capture evidence retains the complete current paint signature, double animation frames, at least three identical original PNGs and at least 200 ms stability. Font-substitution notices remain visible; this audit makes no cross-OS font/pixel identity or full-document layout claim.

Evidence entry points:

- `root-audit.json`: the four assigned platform/routes, prior Writer and Office checks.
- `field-root-audit.json`: SDK, paint, cleanup and independent document scopes.
- `original-png-review.json`: explicit findings and hashes for every original final image.
- `source-cleanup-and-line-endings-audit.json`: source, cleanup and LF/CRLF comparisons, plus unchanged shared-oracle binding.
- `independent-content-audits/`: independent DOCX audit reports with input hashes.
- `complete-evidence-index.json`: every retained file's exact byte count and SHA256 (excluding the index itself).
- `provenance/`: unchanged official run/job/artifact API metadata.
- `audit-tools/`: scoped copies of the audit scripts; original P4 scripts/evidence were untouched.

Original ZIPs and extracted raw data remain under `.local/nov20-ci/45179944903/writer-481-browser-QA-{Linux,Windows}/`. CI asset directories are absent from the archives, so there is no separate independent full asset-byte rehash claim. The known Mac caret-projection/blink QA boundaries are not a newly established product bug and are outside this two-platform review. No new browser run, native operation, app build, installer download, capture session, Git commit/push, main change, tag or publication was performed by this auditor.
