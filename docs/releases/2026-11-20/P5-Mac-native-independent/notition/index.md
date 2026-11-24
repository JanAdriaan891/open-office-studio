# Independent Mac Notition audit — 24 November 2026

**PASS for the bounded local Notes core route**, with the visual coverage limit
below. This independent review used only existing downloaded files. Operator
6f92 retains the native operation and final operator review. No new download,
GUI, CI, app build, product fix, matrix edit or Git write was performed.

| Binding | Exact retained evidence |
| --- | --- |
| Product source / tree / version | `b696ab86bd1c128729a079b68c0082e6df3d36a5` / `e30879fd772871e690847c061ef66e6b81808a05` / `2026.48.1` |
| Build-only producer | `2af94cdcefa3e88e4980b631d16a88d7d7de5ae8`, run45195055147 / job137763371873 / attempt1 SUCCESS |
| App/producer source witness | 820 raw bytes, `236085a316b40b2e5033316a3e3ed45f91cb9a27e83d518117160ba4aff4e7d5` |
| Original parent | artifact14836145077, `uitgave-macOS`, ZIP `45a88b40325f516e91b0b4cb557b88fd2a81d62bde2e4be26dc87bd1b55ff015` |
| Own ARM64 DMG | 75126797 bytes, `88261673a7dbc3b15f6e0a54e89356d8911ab8fc4cb29035fee68e009a285346` |
| Copied executable | `open-notition-studio`, SHA256 `285ce633934e26d4182c3a9e97ab7d7165873903d1359234482b6f26a649ec83` |
| Native QA | `03477b0199daeb50ae7b20d552b111630c3271ce`, [run45351696628/job138300391298](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45351696628/job/138300391298), attempt1 SUCCESS |
| Audited proof artifact | 14900913932, 998323 bytes, ZIP `a1e3bb8b7745e1b53611090b8411741013204ca8cd2bcc936e31cf0532d912d3`, expires 2027-02-22T07:55:02Z |

The existing [proof.zip](proof.zip) matches the retained official artifact digest;
all **114** unique safe members pass CRC and equal the existing raw extraction.
The small producer-receipt ZIP was also hash-checked against its retained official
metadata. Source-witness bytes independently confirm the distinction between
the P5 application and the separate producer workflow. This review did not
redownload or rehash the full parent/DMG: their derivation remains the retained
producer/consumer attestation bound into this exact native receipt.

The DMG was mounted read-only, the sole app copied with `ditto`, and executable
hash equality checked before/after copying. The recorded CF identity is
`org.openaec.notition-studio`, executable `open-notition-studio`, version
`2026.48.1`; signature identity identifies thin ARM64. Existing `codesign`,
Gatekeeper and stapler commands returned 0. These are **retained Apple command
attestations**, not a fresh cryptographic verification by this audit.

No suite app, suite executable or suite profile was found by the recorded
namespace checks. Seven own profile locations were absent before preferences
were seeded. Both launches used the own copied executable, empty working
directory and bounded system PATH. Native AX/HID opening imported the synthetic
407-byte Notes backup; the ordinary UI changed the page title and appended the
marker, invoked Save now and exported a backup through the native Save panel.

Independent JSON parsing confirms `openaec-notities` schema3, notebook
**Standalone QA**, edited title **Standalone edited page**, and exact Markdown:

```text
STANDALONE_NOTITION_SEED
STANDALONE_UNCHANGED_CONTROL
STANDALONE_NOTITION_EDIT
```

The [source](source.openaec-notities) remains unchanged against the fixture
receipt: **407 bytes**, SHA256
`b6b7b40030e5be191b077145e310b595194e890ab1ce3002a71c55185fb09a96`.
The [export](notes-export.openaec-notities) is **1933 bytes**, SHA256
`770f7b054a76ecee63256a2701d94efa47a2aee980d2417fe3af3e5a94db7d63`.
After normal Command+Q/exit0, PID **2095 → 4677** reopened the own persisted
notebook without reimport. Native AX observations and the final PNG show the
edited title, seed, unchanged control and marker in both source and preview.
The second process also ended through Command+Q/exit0. Recorded cleanup stopped
the watcher and removed own profiles/copied app without errors; the own DMG had
already detached successfully.

All five original PNGs were viewed. [3](3-opened-untouched-0.png) and
[5](5-opened-0.png) show the healthy unmodified default notebook.
[59](59-opened-untouched-0.png) and [61](61-opened-0.png) are white early reopen
captures and are **not** accepted as completed-case images.
[72-notes-reopened-0.png](72-notes-reopened-0.png) is the completed edited cold
reopen and visibly confirms the marker route. **There is one completed edited
PNG, not two; no separate pre-quit edited/completed PNG exists in this artifact.**
No replacement capture or new CI was started. Parent/operator review must decide
whether that extra visual item is required; these observations do not establish
a terminal white-body product failure.

The raw `nativeAccepted:false` and review-pending flags remain unchanged in
[receipt.json.gz](receipt.json.gz). This scoped independent verdict is separate.
Sampled process/lsof evidence is not an exhaustive dependency audit; no converter
was exercised by this local Notes scenario. This is no all-format or full
notebook/export certification, nor a stable-release approval.

[audit.json](audit.json) contains the verdict, limits and retained-file hashes;
[provenance.json](provenance.json) binds the exact job/artifact/source witness;
[member-manifest.json](member-manifest.json) covers every ZIP member. Linux and
Windows Notes audits and the central release matrix remain unchanged.
