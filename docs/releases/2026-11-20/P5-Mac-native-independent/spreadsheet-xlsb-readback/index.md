# Mac XLSB exact-output visible readback — independent audit

**PASS: the missing native visible-reopen check is completed at real UI zoom200%.**
This supplementary result covers only authenticated saved-output readback. It
does not rerun or newly approve raw XLSB import, editing/saving, #377 policy,
other formats, or a stable release.

The earlier [100% OCR failure](../spreadsheet-xlsb-ocr-boundary/index.md) remains
unchanged alongside this result. Its original job is still failed; its stored
word lists omitted42 even though the retained pixels visibly contained it.
The new result does not prove why that omission happened or fix OCR at100%.

## Exact existing evidence

| Binding | Evidence |
| --- | --- |
| App source / tree / version | `b696ab86bd1c128729a079b68c0082e6df3d36a5` / `e30879fd772871e690847c061ef66e6b81808a05` / `2026.48.1` |
| Readback QA | `749c80e4fa41b036c71f72685f132428609fc488` |
| Coordinated successful job | [45361373078/job138332599919](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45361373078/job/138332599919), attempt1 |
| Proof artifact | 14905680506, 2346736 bytes, ZIP `6b8ea5d2d683a6c6d2ddd3e0ba6bde2d8543bd13aa21ba28455f365c8c0150cb` |
| Original native edited output | 6476 bytes, SHA256 `0eb60817b210e6e9261764b32f97971d69e9d9ee911f3a012072c91632defdee` |
| Owner-review pin | `46d1dce75d5c011e69e36739cbdd91895a49d8484a974589793b0a56d9782180` |

The existing [proof.zip](proof.zip) was independently hashed against the exact
coordinator pin and the retained operator reader's official-digest attestation.
All **129** unique safe members pass CRC and equal the already extracted raw
files. No fresh API/artifact/installer download occurred. The job metadata pin
and its origin are explicit in [coordinator-execution-pin.json](coordinator-execution-pin.json).

The actual [edited-native.xlsx](edited-native.xlsx) is byte-identical to the
output in the earlier failed artifact14904041365. Independent stdlib ZIP/XML
parsing confirms Sheet1, exactly30 formulas A1:A30: **A15 `40+2` / cached42**;
the other **29 `1+2` / cached3**. The retained source guard also preserves the
7651-byte original XLSB hash
`e06ae79ed345495eee0bf5e7fd7a32638af0b646c5819f7d83a4f6fb97a151a3`.
The readback source authenticates those prior bytes and launches the existing
XLSX twice; it does not execute the original import/edit/save routine again.

## Both native body observations pass

Both original whole-window PNGs were visually reviewed:
[54](54-xlsb-readback-visible-0-0-original.png) and
[81](81-xlsb-readback-visible-1-0-original.png). Each visibly shows
**edited-native.xlsx**, name box **A15**, formula bar **=40+2**, selected body
value **42**, and the actual application zoom label **200%**. Native AX also
reports `Zoom 200%, back to 100%`; this is an ordinary UI zoom setting, not an
image enlargement. Both images remain1440×950 and are unmodified originals.

The exact captures bind independently to **PID2471/window32** and
**PID6783/window50**. Each `screencapture -l` command targets that owned window
and returned0. AX records the correct frontmost PID, selected workbook, focused
`A15, 42, selected` cell and formula. Both original OCR lists contain exactly
one token **42**, confidence **1**, bound to their original image SHA256
`95d1430fdf02945f26b41a31faf75d3f5d0f9b2aaca9d837f065c711c3682002`.

Independent coordinate calculation reproduces the stored body target
**X389.651163 / Y300.656388**, inside the unchanged body point domain
**240 < X < 1680; 272 < Y < 952**. The original OCR/body reports record
`imageModified:false`, `editorInputSent:false`.

`vision.py` and `ocr.swift` are **byte-identical** between the earlier failed
QA4c2d7637 and this QA749c80e4. Exact-word matching, minimum confidence0.8,
original-image/PID/window checks and body bounds were not weakened. The native
readback uses ordinary visible Zoom-in controls, reselects A15, checks the actual
focus/formula and applies the unchanged detector.

## Cold reopen, cleanup and limits

The first native process **2471** closed with **Command+Q/exit0** before new PID
**6783** launched that exact saved XLSX. The second process also closed with
Command+Q/exit0. Both phase receipts pass the body target and independent
30-formula oracle; `sourceAndOutputBytesUnchanged:true`,
`xlsbVisualReadbackCompleted:true`, `cleanupPassed:true`, `cleanupErrors:[]`.

The raw receipt's external-review flags remain `nativeAccepted:false` and
`readback-functional-evidence-collected-review-pending`; they were not rewritten.
This independent scoped audit supplies the missing hard-check result separately.
The old100% failure and D410's separately owned #377 evidence remain intact.
No general format/reliability/stable-release approval follows.

[audit.json](audit.json), [body-pid-window-audit.json](body-pid-window-audit.json),
[independent-xlsx-oracle.json](independent-xlsx-oracle.json), the original
compressed OCR/AX/phase/quit receipts and [member-manifest.json](member-manifest.json)
preserve the exact proof. No new execution, download, detector change, product
fix, root matrix/handoff or Git write was made by this auditor.
