# Mac XLSB late OCR42 boundary — independent forensic audit

**The retained pixels visibly contain A15 = 42 and the saved data is correct.
The strict OCR gate remains failed/incomplete.** This finding concerns only
the late reopened-body detector in
[45357794642/job138320456545](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45357794642/job/138320456545),
attempt1, QA `4c2d7637e61a39d851cccb39d296d13d520a9388`. It does not certify
harmlessness, diagnose a general product bug, or accept the whole XLSB case.

Only existing local files were read. No new download, GUI, CI, OCR execution,
threshold/crop change, app fix, matrix edit or Git write occurred. D410's separate
#377 save-policy audit was not repeated. 6f92 alone owns any pinned-output
reopen/real-Zoom200/unchanged-OCR follow-up.

The original proof artifact **14904041365**, **6053555 bytes**, matches retained
official ZIP SHA256
`fa28025fb854905a58643eb6f12b1a084e6569c418e6501d5fc964dd39981acd`.
All **238** unique safe members pass CRC and equal the existing raw extraction.
It expires **2027-02-22T08:37:50Z**. P5 source remains
`b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree
`e30879fd772871e690847c061ef66e6b81808a05`, version `2026.48.1`.

## Exact visible and AX evidence

All three original, unmodified captures were viewed:

- [160](160-xlsb-reopened-visible-cell-0-original.png)
- [162](162-xlsb-reopened-visible-cell-1-original.png)
- [164](164-xlsb-reopened-visible-cell-2-original.png)

They are byte-identical, SHA256
`11977c61193487a078fcc2dedb7f52d905d39cc704d8461910a563ed8e2dc0e0`.
Each visibly shows workbook **edited-native.xlsx**, name box **A15**, formula
bar **=40+2**, and **42 inside the selected body cell** at UI zoom **100%**.
AX159–166 independently show frontmost own PID **16315**, focused/selected
`AXCell` **A15, 42, selected**, with formula-bar value `=40+2`.
AX is corroboration here; it is not substituted for the original pixel review.

Each stored OCR result is bound to that exact original image, records
`imageModified:false` and `editorInputSent:false`, and contains **99 emitted
words**. **None contains exact token `42` at any confidence.** The name-box
token `A15` and formula-bar token `=40+2` are present with confidence1.
This is not a rejection of a retained low-confidence `42`.

The pinned body matcher requires exact text, confidence at least0.8, and a word
center inside its body domain. Its image is the whole original window; the
body restriction is a geometric filter, not an edited/cropped image:

| Geometry | Retained/derived coordinates |
| --- | --- |
| Window | X240, Y37, width1440, height950; window99, PID16315 |
| Original PNG | 1440×950; scale1 in both axes |
| Matcher body point domain | 240 < X < 1680; 272 < Y < 952 |
| Selected A15 AX frame | global X278, Y537, width64, height20 |
| Selected A15 in PNG | local X38, Y500, width64, height20 |

The **entire cell lies inside** the body domain and on screen. The immediate
boundary is therefore the missing token in the stored OCR output, before
confidence/body filtering; it is not an observed crop exclusion. The underlying
Vision recognition/top-candidate/word-bounding-box emission reason is **unknown**:
those intermediate alternatives were not retained. No detector setting was
changed and OCR was not rerun to guess a cause.

## Saved bytes, lifecycle and uncompleted gate

Independent stdlib ZIP/XML parsing of the actual
[edited-native.xlsx](edited-native.xlsx), **6476 bytes**, confirms SHA256
`0eb60817b210e6e9261764b32f97971d69e9d9ee911f3a012072c91632defdee`:
exactly **30 formulas**, A1:A30, with **A15 `40+2` / cached42** and the other
**29 `1+2` / cached3**. The archived 7651-byte XLSB source still hashes to its
original pin `e06ae79ed345495eee0bf5e7fd7a32638af0b646c5819f7d83a4f6fb97a151a3`.
These are independent offline observations of actual bytes, not injected model
state or a replacement for the native detector criterion.

The own native preflight used **3165 → 10639**. After saving the edited output,
normal quit/new process **10639 → 16315** reopened that exact XLSX path.
All three retained quit receipts record **Command+Q, exit0**; final cleanup is
`cleanupPassed:true`, `cleanupErrors:[]`.

The native case stopped at `writer_visible("42", "xlsb-reopened-visible-cell")`.
The generic error retains its wording, “Visible Writer body target unavailable …
Unique readable original body word unavailable: 42”; the actual app/window/PID
are Spreadsheet. Because that gate raised, the case's own later `reopenedOracle`,
final source-hash check, final case capture and success status were not reached.
The raw overall job stays **FAILURE**, receipt stays **unavailable-or-incomplete**,
`nativeAccepted:false`, and addon status stays **running**. This forensic audit
does not turn them green.

[audit.json](audit.json), [body-ocr-boundary.json](body-ocr-boundary.json),
[independent-xlsx-oracle.json](independent-xlsx-oracle.json),
[official-metadata.json](official-metadata.json) and
[member-manifest.json](member-manifest.json) retain the exact boundary, raw file
hashes and limitations. Original OCR/AX/capture/quit receipts are preserved as
unchanged compressed bytes. The pinned [matcher](pinned-vision.py.txt) and
[OCR emitter](pinned-ocr.swift.txt) are read-only source copies. The complete
original ZIP remains in the owner's existing local artifact folder.
