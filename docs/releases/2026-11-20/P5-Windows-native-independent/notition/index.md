# Independent Windows Notition audit — 24 November 2026

**PASS for the bounded standalone local-notebook core scenario.** The original
completed native PNGs were reviewed, and both saved Notes JSON files were parsed
independently. No new download, CI, app build, installer execution, GUI session or
product fix was performed. Other apps and the release matrix are outside this audit.

| Binding | Exact retained evidence |
| --- | --- |
| App source / tree / version | `b696ab86bd1c128729a079b68c0082e6df3d36a5` / `e30879fd772871e690847c061ef66e6b81808a05` / `2026.48.1` |
| Native QA | `97710e2ba22d0939ef121fdebb18dec43ed2df9d`, [run45352319983/job138301685144](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45352319983/job/138301685144), attempt1, **job SUCCESS** |
| Original Windows parent | run45177730188 / job137703365803 / attempt1 SUCCESS; artifact14828525724, ZIP `24816ccb20360bbfc976abf38810988dfe4b27a3305c80d5b80b711719587e0d` |
| Own-app preparation / child | run45195780472 / job137765723008 / QA `f88a805beb152d42a22806d135d9af1c912aedcb`; child14829370514, ZIP `df4a90656a3b7e2a60782c1fc5a9bcd7266eba40f2c3ae9f32130c4fd4039914` |
| NSIS installer | 73570344 bytes, `01a200d652c22e8bb59f37cba28bfa9694e121ba6cd7e98c9ba5a0c3b20f74b1` |
| Payload = installed x64 PE | 88116128 bytes, `c4d976fd30e76d9413cefedf9917fcdeea986f7f3b224931e4eb795f24bc2af5` |
| Audited proof artifact | 14900238584, 435241 bytes, ZIP `dbf968829e258890e713173056507614e88b3065ba4027962c8baceabcb95695`, expires 2027-02-22T07:59:54Z |

The existing whole [proof.zip](proof.zip) matches the retained official digest.
All 31 unique safe members pass CRC and equal the already extracted raw files.
The own-child consumer receipt, original preparation binding, canonical report
hash and native payload/installed-PE equality are consistent. The original
attempt1 Windows signing/package/runtime gates passed. The overall native
workflow is **FAILURE** and remains recorded as such; only its exact Notition
job and scoped result are accepted here.

The initial hosted machine reported no suite paths, app processes or previous
profiles. Both phases identify `org.openaec.notition-studio`, the actual own
installed executable and an isolated native-created WebView2 profile. Ordinary
UI created notebook **STANDALONE23 NOTEBOOK**, page **STANDALONE23 NOTE** and
text **STANDALONE23 NOTE BODY**. Save backup opened the owned Windows “Save a
copy” dialog; physical filename input/readback and native Enter are recorded.

After WM_CLOSE, process **4480** fully exited and its owned WebViews were gone
before new process **5876** started. The restarted app selected the persisted
notebook and exported another backup. Independent parsing confirms format
`openaec-notities`, schema version3, the unique notebook/page/text markers and
the same object IDs. [Initial](initial.openaec-notities) and
[reopened](reopened.openaec-notities) backups are byte-identical, **2081 bytes**,
SHA256 `c48dd1bcd2fc8da76bf2b043b4cdd5a66b3575fbc2cb878fd49b52f7dd9b972a`.
Both original [initial](initial-completed.png) and
[reopened](reopened-completed.png) completed PNGs visibly show the markers and
their respective successful backup paths.

The second process and its WebViews exited. The final report records no residual
owned WebViews/apps/suite paths, restored WebView policy, uninstall of the own
installation, removal of the app-native profile and disposal of the temporary
profile. The native profile present in `afterNative` was removed by the separate
[final profile cleanup](profile-cleanup.json); it is not silently treated as
absent before that cleanup.

Signature conclusions are limited to **retained Windows attestations**: installer
and installed PE reported `Valid`, the expected publisher and nonempty timestamp
signers, tied to these exact hashes. This audit did not independently rerun OS
Authenticode cryptography or unpack/redownload the installer. The core proves
local creation/editing, own-profile persistence and JSON backup export, **not**
backup-file reimport, every export format or all notebook features. It is no
stable-release approval.

[audit.json](audit.json) contains the scoped verdict and file hashes;
[provenance.json](provenance.json) retains the source/attempt/job/artifact and
consumer chain; [member-manifest.json](member-manifest.json) covers every raw
ZIP member. The unchanged [report.json](report.json) preserves native lifecycle,
signature attestations and cleanup details. Linux evidence and the root matrix
were left unchanged.
