# Independent Mac Database audit — 24 November 2026

**PASS for the bounded supported SQLite working-copy read/query/export/cold-reopen
route.** This is not record-editing, MDB/ACCDB, or general CRUD acceptance. Only
existing downloaded evidence was read. No download, GUI, CI, product fix, matrix
edit or Git write was performed; no next work is started automatically.

| Binding | Exact retained evidence |
| --- | --- |
| App source / tree / version | `b696ab86bd1c128729a079b68c0082e6df3d36a5` / `e30879fd772871e690847c061ef66e6b81808a05` / `2026.48.1` |
| Separate producer | `2af94cdcefa3e88e4980b631d16a88d7d7de5ae8`; run45195055147 / job137763371873 / attempt1 SUCCESS |
| App/producer witness | 820 bytes, `236085a316b40b2e5033316a3e3ed45f91cb9a27e83d518117160ba4aff4e7d5` |
| Original parent | artifact14836145077; ZIP `45a88b40325f516e91b0b4cb557b88fd2a81d62bde2e4be26dc87bd1b55ff015` |
| Own ARM64 DMG | 39962398 bytes; `a3ad897b5345f8f8faf96f8e11dda33a25f912ffba8d4acb28b719edd9a0e016` |
| Own copied executable | `open-database-studio`; SHA256 `3340813df0720935e9b143a051f58ca105da026a1d520b577dda0d2905895c62` |
| Native QA | `03477b0199daeb50ae7b20d552b111630c3271ce`; [run45351696628/job138300391257](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45351696628/job/138300391257), attempt1 SUCCESS |
| Audited proof artifact | 14900779409; 2093483 bytes; ZIP `85da1a10721086f42d6b12b1cc7b9bc927737558e9eb37e607cee7cfa675d341`; expires 2027-02-22T07:55:02Z |

The existing [proof.zip](proof.zip) matches the retained official artifact digest.
All **137** unique safe members pass CRC and equal the already extracted raw
files. The source-witness raw bytes and retained producer receipt distinguish
the P5 app from its build-only producer. The small producer-receipt ZIP also
matches its retained official digest. Full parent/DMG derivation is retained
producer/consumer evidence; neither was downloaded or unpacked again here.

The own DMG was mounted read-only, its sole app copied with `ditto`, and the
executable hash checked equal before/after copying. Recorded CF identity is
`org.openaec.database-studio`, executable `open-database-studio`, version
`2026.48.1`; signature identity reports thin ARM64. Existing `codesign`,
Gatekeeper and stapler commands returned 0. These are **retained Apple command
attestations**, not fresh cryptographic verification by this audit.

The recorded initial checks found no suite app, suite executable or suite
profile. Seven own profile locations were absent. Both launches use the own
installed app, empty working directory and bounded system PATH. The real native
Open panel and supported external-SQLite confirmation opened the synthetic file
as a working copy. The native table shows three rows. A real SQL View query
`SELECT SUM(amount) AS qa_total FROM standalone_data;` returns **60**. Native Save
exports the working copy through the OS Save panel.

Independent Python SQLite parsing used `mode=ro&immutable=1` for both files;
integrity checks return `ok`, and audit reads did not change either file hash:

| id | label | amount / SQLite type |
| --- | --- | --- |
| 1 | STANDALONE_DATABASE_SEED | 10 / integer |
| 2 | beta | 20 / integer |
| 3 | STANDALONE_UNCHANGED_CONTROL | 30 / integer |

The [source](source.sqlite) remains unchanged against its fixture receipt:
**8192 bytes**, SHA256
`b8c474f0ef6f6addce743b7870346eb2243c888dcee093371c3d6dcc93646732`.
The [export](database-export.sqlite) is **53248 bytes**, SHA256
`d8e2f0935eb5f3ea8957fd35d7dfb937a6e0655b9b67f69c2dfafa339943fcca`.
Its extra `_openaec_*` metadata tables belong to the working-copy format; data
rows and integer sum remain identical. This is **not** proof of user record
INSERT/UPDATE/DELETE or a general writable-data model.

Process **1628** closed via Command+Q/exit0. New PID **3420** opened the exported
file through the actual native Open panel and again displayed SQL SUM **60**.
It also closed through Command+Q/exit0. Both original completed images were
viewed: [native table](22-database-table-0.png) and
[cold-reopened query result](85-database-reopened-0.png). Recorded cleanup stopped
the owned watcher, removed the own copied app/profiles and reports no errors;
the own DMG had detached successfully. Sampled process/lsof evidence does not
constitute exhaustive dependency or resource closure.

Owner review hash
`259daf982a851a3e5ab892045ffb01ab08b9909f0d6d67b561d912608bf09c45`
was checked before preserving [that review](owner-review.json.gz). The raw
[receipt.json.gz](receipt.json.gz) still says `nativeAccepted:false` and
review-pending; it was not rewritten. This independent scoped verdict is
separate, and 6f92 retains the operator's final review.

[audit.json](audit.json), [independent-sqlite-oracle.json](independent-sqlite-oracle.json),
[provenance.json](provenance.json) and [member-manifest.json](member-manifest.json)
bind the exact hashes, rows, lifecycle and limits. No MDB/ACCDB or general CRUD
claim, stable-release approval, or central matrix/handoff change follows.
All other evidence remains unchanged.
