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

The subsequent complete-converter-proof guard adds one more passing targeted
test (26 unique targeted tests total). Its rerun uses an isolated `.local`
Vite cache and disables the result cache. Reused proofs must include successful
native, macro, independent-content and all 32 legacy checks, as well as the
exact application point and installer hash.

The real hosted browser build is also checked under `/office/` with no Tauri
bridge: Writer offline edit/download/reopen, Spreadsheet cell-style roundtrip,
Presentation rich-note roundtrip, and explicit unsupported-format messages
preserving an already open document. This is separate from the ordinary
production `dist` smoke check.

Initial application build/full-check run:
[`43833977445`](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43833977445)
(driver `9a9bfe392679103f3a9bde17db7e8d91168165f0`). Subsequent native-only
checks reuse this run's exact installer manifests and complete converter proofs.
The workflow concurrency group queues those reruns until the build run finishes.
The Linux driver also records the owning app PID and executable, verifies
`APPIMAGE` identifies the actual archive, and closes only that proven PID before
another package route starts. It refuses a launch intercepted by an existing app.

## First native results at the new application point

- macOS ARM64 DMG **passed**: native AXPress opened Save As and the AX status
  text showed the bundled runtime and safe macro profile. AX traversal visited
  23 nodes for the status check; it did not time out. The owned app closed and
  the original ODT hash stayed unchanged. Converter/content/macro/32-legacy
  checks, helper signature verification, associations and LaunchServices also
  passed. DMG SHA-256:
  `3269782d7c98b4b8952fcd4bb372c86acaa0d566b2f70d8096b4922bfc2f0a3f`.
  This valid same-point result is reused; no new native Mac behavior was changed
  by the subsequent Linux isolation fixes.
- Linux x64 AppImage **passed** native pointer/Save As/source/original-file
  checks. Archive SHA-256:
  `79eaf0a891e5704f31f2b06d6a864f8774640d5c2f6d3c8c70b4955aed9ab6d3`.
- Linux x64 DEB converter/content/macro/32-legacy checks **passed**, but its
  second WebDriver session timed out before a session was created. DEB SHA-256:
  `3c2f6fae2765b01e27b14f488883e0e6762f3da7e2514e61ed0d3a9e266d54c4`.
  Native DEB acceptance remains pending. The next driver isolates both the
  intermediary and native WebKit ports, the owned process group and XDG app
  state. These address inter-session interference; the initial timeout alone
  does not prove which component caused it.
- Linux project checks at this point passed: 325 JavaScript test files,
  58 Python tests, 117 Rust tests (7 intentionally ignored), engine/command
  checks, package build and production browser smoke checks.
- Screenshot observation only: the AppImage readiness capture showed a gray
  document canvas with a 109-word count and a font-substitution warning. Save As
  was visible and operable. This does not establish a separate rendering bug or
  prove document painting; it was shared with the integration chat's native
  Writer work. The report deliberately says `odtLoadedInWriter`.

Proof artifacts: `runtime317-proof-Linux` and `runtime317-proof-macOS` in the
initial run. macOS proof archive digest:
`74d3783cac5c117835ae85a7a1966ee77be35d5f342de19f2b83651896671fa0`;
Linux proof archive digest:
`bb74217c79b870c1ee6990fab569e6f2715665bacb0c8ff329416a3bf7eb8ee4`.
