# #30: resumed native acceptance

## Source provenance

- Agreed integration base: `93fcc6194904f70fa12d0a3546c23dac9c673ee5`.
- Original #30 head: `7e48cf5834a8c7a115f9eb9fcdc0ca8c50c4e0f7`, delta from
  `1e5afa399117fd84df628955ec82b0e597993c83`.
- The original delta was applied with `git apply --3way`, excluding
  `.github/workflows/desktop.yml`, which the integration chat owns. No conflicts
  were reported. The runtime-specific checks move to a dedicated workflow.
- Retained from the integration base: version `2026.46.2`, English release
  metadata, and the presentation media-volume/media-name postprocessing chain.
- Historical run `42814410322` tested merge point
  `c7118fce9d825ac95fbab46d714c04e8b541a896`. Those results remain historical;
  they do not certify this new candidate.

## Remaining gates

| Route | Historical result | Required new proof |
| --- | --- | --- |
| Windows NSIS / WebView2 | CDP endpoint unavailable | Installed app opens ODT; enabled Save As shows bundled source |
| Linux DEB / WebKitGTK | Save As not observed | Installed app opens ODT; native pointer opens Save As with bundled source |
| Linux AppImage / WebKitGTK | GUI not run | Actual AppImage entry point passes the same native controls |
| macOS DMG / WKWebView | Unbounded AX traversal timed out | Bounded native AX interaction observes Save As with bundled source |
| Browser production build | Passed at historical point | Offline edit/save/reopen and explicit conversion limitations at the new point |

Native `blocked` is never a pass. Builds and converter tests are recorded
separately from actual native operation. No local app, installer, printer or
security settings are touched; native probes run only on isolated hosted CI.
