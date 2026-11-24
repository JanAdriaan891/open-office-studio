# Independent P5 Linux standalone audit: four core apps

The bounded core scenarios pass for Writer, Presentation, Notition and Database, each as DEB and AppImage (eight routes). This review does not assess the failed Email or Spreadsheet jobs and does not certify the complete six-app matrix.

Application `b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree `e30879fd772871e690847c061ef66e6b81808a05`, version `2026.48.1`. Native proof producer `45190082427`, attempt 1, QA `b3d594aaf09a83215bb809bdbcda6305a0af1612`. Preparation snapshot is the exact Git `5d4198b7001c21cac7a03cf752900aac6e4dd91e:docs/tests/linux-release-input-p5/prepared.json`.

| App | Successful job | Official proof artifact | Complete proof ZIP SHA256 |
| --- | --- | --- | --- |
| Writer | 137745921948 | 14825591637 | fac7e788a7b73f4a116688d33bbab7db54e11ee452860a4150fe779212559a22 |
| Presentation | 137745921818 | 14824614985 | d7f47c5af33f4268e79ff5af61d2c4e9fb2b4ec8a11cb61fa525379c512ff535 |
| Notition | 137745921942 | 14826375277 | fe92e3a501645ad4ffc33f0cd4287793357f0af9284aeb02cd09099ea54ab4f3 |
| Database | 137745922006 | 14825227335 | 3cc2dfcdbedc40d095dc25813148412680cc7ff6f7324299079dd436fffd8a9e |

Official proof ZIP sizes/hashes and safe extraction were checked independently. The exact preparation snapshot contains six app-only child artifacts and twelve packages derived from the official Linux parent `14824745492`, complete parent SHA256 `c64b0e90e2144d1a5a6d17ad7e4881429a70ade8c48e76f7a22858b54c3928c5`. Official child/parent metadata and native receipts were compared to it. For the eight selected routes, package/report hashes, source/QA identity, payload-to-running ELF hashes, app identity, clean own profile, absence of Suite binaries/profile, actual native focus/input, save, full close/new PID reopen and cleanup receipts were checked against the exact pinned harness. Database functional work uses the normal binary, AT-SPI/XTest and credential-bound native portal; its separate WebDriver launch is only a metadata preflight.

Independent saved-output checks:

- Writer: each actual DOCX contains exactly `STANDALONE_WRITER_SAVED Original synthetic Writer text.` in its one body paragraph, matching the pinned synthetic fixture and keyboard edit.
- Presentation: each actual PPTX has exactly two ordered and correctly related slides, the first containing `STANDALONE_PRESENTATION_SAVED` once and the second blank, matching title edit and Ctrl+M.
- Notition: each exported backup JSON equals the saved local-state JSON, preserving the exact notebook title, marker and six blocks. Cold reopen proves own-profile persistence; this scenario does not re-import the backup into a fresh profile.
- Database: original and saved SQLite files pass independent read-only integrity/type/row checks. Original rows `(1, SyntheticAlpha, 7)` and `(2, SyntheticBeta, 11)` remain unchanged; saved first amount is 13, sum 24. Actual native records retain two normal exit codes `[0,0]`, distinct reopened PID and attributed SaveFile portal request.

Sixteen original saved/edited and reopened PNGs were directly viewed serially and matched to their capture hashes. Writer visibly retains marker and original text; Presentation reopen Outline shows marker on slide 1 and empty slide 2; Notition retains notebook title and marker; Database displays edited and reopened result 24. Presentation's saved image has the newly created empty slide selected, so that image alone is not a full title-layout proof. Font-substitution notices in Writer/Presentation are retained observations. No full-document layout or complete dependency-closure claim is made.

One ancillary metadata inconsistency is retained in all four DEB reports: `zenityDeclaredByDeb=false` conflicts with their exact `Depends` string `zenity, libwebkit2gtk-4.1-0, libgtk-3-0` and normal apt/`which zenity` observations. The pinned QA regex accepts only whitespace or end-of-string after `zenity`, omitting the actual comma. The original report bytes are unchanged; the audit records the inconsistency rather than treating that Boolean as valid dependency evidence. Foreign-format confirmation is outside these core scenarios. AppImage requires the external OS helper when that separate feature is used.

`independent-audit.json` provides eight per-route package/ELF/focus/cleanup bindings, independent output results, image findings and metadata limits. `pinned-harness/` and `source-templates/` preserve exact source inputs for the audit. Each app's official small ZIP is retained, along with selected original raw receipts, saved outputs, logs and PNGs. Complete original matrices remain inside their unchanged official ZIPs. `evidence-index.json` records the retained bytes and hashes.

This auditor did not download, install or re-extract installers or the 4.4 GB parent. Installer hash/ELF identity is assessed through the exact preparation snapshot, official metadata and native tester receipts; proof ZIPs and saved outputs were independently rehashed. A corrected reuse notice arrived after the four small proof downloads had completed, so the crossed duplicate Presentation/Notition proof downloads are disclosed and retained. No further archive download was made. No native operation, CI run, app build, product change, Git commit/push, main merge, tag or publication occurred. Detached Linux release signing is not certified by this audit.
