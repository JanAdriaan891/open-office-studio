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

## Immutable application and repeatable drivers

The new application point is `c0fbbcb843f0fd44e0e7e9d54a7989d017e39812`.
The dedicated workflow checks out that exact point for all application builds,
unit checks, native converter checks and production browser tests. Only after
packaging does it overlay the native test drivers from the workflow head;
reports record that separate `harnessPoint`.

Installers and their source/SHA-256 manifest are uploaded before native UI gates.
`converter-proof.json` records successful converter/content/macro/legacy checks
before attempting the UI. A later driver-only run can reuse those exact packages
and the generated ODT by setting `artifactRun` in
`.github/runtime317-candidate.json`. It refuses different application points,
different package bytes or incomplete converter proofs. Reuse does not certify
any newer application source.

Windows uses an executable-scoped HKLM WebView2 debugging override on the
disposable hosted runner, because elevated WebView2 ignores environment
overrides. The prior value is saved and restored in `finally`; no override is
added to production code or the user's computer. See [Microsoft's documented
override rules](https://learn.microsoft.com/microsoft-edge/webview2/concepts/security#for-an-elevated-host-app-use-appropriate-override-flags).

Linux waits for Writer to finish loading and enable Save As, then uses a native
pointer action. AppImage is launched through its original runtime/AppRun with
`APPIMAGE_EXTRACT_AND_RUN=1`; a successful DEB never substitutes for AppImage UI.

macOS uses AXPress on the enabled Save As button. Its native AX helper caps IPC
timeouts, traversal depth, children per node, total nodes and wall time, and
does not request the editor text area's value. It neither grants TCC permissions
nor adds an app test bridge. See [Apple's per-process AX timeout API](https://developer.apple.com/documentation/applicationservices/1459345-axuielementsetmessagingtimeout).

Local lightweight checks: 25 targeted tests passed (runtime packaging/config,
immutable package verification and Writer readiness); Node syntax, Python
compilation, PowerShell parsing and version consistency passed. Native platform
results remain pending until actual CI execution.
