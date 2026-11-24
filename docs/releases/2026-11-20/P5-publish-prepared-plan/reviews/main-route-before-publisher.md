# P5 main-route proposal — read-only review, 24 November 2026

**No merge, PR change, tag or publication was performed.** This is a proposal
for explicit user approval, currently pinned to prep `f208f80e…`. The coming
publisher/collector head is not yet covered: its exact SHA/tree/delta and targeted
checks must be reviewed and substituted before this becomes a final execution plan.

## Observed route

| Ref / PR | Actual current pin |
| --- | --- |
| main / PR353 base | `93fcc6194904f70fa12d0a3546c23dac9c673ee5` |
| integration / PR353 head / PR367 base | `771fd66e0e4bd612dba4f7b6e34b517f39d52e86` |
| frozen P5 product | `b696ab86bd1c128729a079b68c0082e6df3d36a5` |
| P5 product tree / version | `e30879fd772871e690847c061ef66e6b81808a05` / `2026.48.1` |
| prep / PR367 head | `f208f80e9aba573be2f7dcfc22c5e987e5c9ce41` |
| reviewed prep tree | `e6a7f6c64804d7fbf5131822edd18772d81078df` |

[PR367](https://github.com/OpenAEC-Foundation/open-office-studio/pull/367) is
OPEN/draft, prep → integration. [PR353](https://github.com/OpenAEC-Foundation/open-office-studio/pull/353)
is OPEN/draft, integration → main. Both report MERGEABLE/CLEAN, empty
`statusCheckRollup` and no review decision. Branch metadata reports unprotected,
required checks off; applied branch rules are empty. Thus CLEAN is not evidence
of CI, review approval or stable-release readiness. Merge commits are enabled;
squash/rebase are also enabled and must not be selected for this route.

Read-only DAG checks prove **main → integration → P5 → prep**. All1017 changed
paths from P5 to prep are under `docs/`, across11 post-P5 commits; no non-doc
final-tree delta exists. Therefore the current PR367 final content is P5 plus
evidence above integration. Main has no independent commits outside the
integration ancestry. Existing integrated product differences from old main are
already contained in the tested P5 source; this is not a claim that main and P5
have no product diff.

Two permitted object-only `git merge-tree --write-tree` rehearsals—
integration+prep and main+prep—are conflict-free and both yield the reviewed prep
tree above. No checkout, fetch/shared ref, index or working-tree change occurred.
The second rehearsal represents final content, not an invented future merge SHA.

The whole proposed main result can be reviewed before writes using this pinned
[main…prep comparison](https://github.com/OpenAEC-Foundation/open-office-studio/compare/93fcc6194904f70fa12d0a3546c23dac9c673ee5...f208f80e9aba573be2f7dcfc22c5e987e5c9ce41).

## Required merge sequence and ancestry proof

1. After separately approved final-head review, make PR367 ready and use a
   **merge commit** into integration. Capture its actual merge SHA `I`.
   Require parents `[oldIntegration, approvedPrep]`, approved result tree, and
   remote integration head `I`.
2. PR353 then automatically has integration head `I`, not old771fd66e. Review
   that actual pinned PR353 state. After explicit **main-merge approval**, make
   it ready and use a **merge commit** into unchanged approved main. Capture `M`.
   Require parents `[oldMain, I]`, approved tree, remote main head `M`, and
   original P5 as an ancestor of `M`.

Because P5 is an ancestor of prep, retaining prep as PR367's parent retains P5;
retaining that integration merge as PR353's parent retains P5 in main. Squashing
either stage or rebasing/recreating the source commits can lose original P5
ancestry even if files look identical. A tag on P5 must refer to the original
b696 commit, so content equality alone is insufficient.

## Concrete guarded commands — proposal only, not executed

The constants below deliberately fail when an unreviewed publisher head arrives.
Do not replace them with “current HEAD” automatically. Root must first approve
the new exact head/tree and relevant publisher validation, then obtain the user's
separate merge/publication permissions. Run in a coordinated no-other-writes
window; no `--admin`, auto-merge, force push, squash or rebase.

```powershell
$Repo = 'OpenAEC-Foundation/open-office-studio'
$P5 = 'b696ab86bd1c128729a079b68c0082e6df3d36a5'
$ApprovedPrep = 'f208f80e9aba573be2f7dcfc22c5e987e5c9ce41'
$ApprovedIntegration = '771fd66e0e4bd612dba4f7b6e34b517f39d52e86'
$ApprovedMain = '93fcc6194904f70fa12d0a3546c23dac9c673ee5'
$ApprovedTree = 'e6a7f6c64804d7fbf5131822edd18772d81078df'

function ReadApi([string]$Path) {
    $raw = gh api "repos/$Repo/$Path"
    if ($LASTEXITCODE -ne 0) { throw "API read failed: $Path" }
    return ($raw | ConvertFrom-Json)
}
function GuardPr($Number, $BaseRef, $HeadRef, $BaseSha, $HeadSha) {
    $pr = ReadApi "pulls/$Number"
    if ($pr.state -ne 'open' -or $pr.merged -or
        $pr.base.ref -ne $BaseRef -or $pr.head.ref -ne $HeadRef -or
        $pr.base.sha -ne $BaseSha -or $pr.head.sha -ne $HeadSha) {
        throw "PR$Number changed; stop for review"
    }
    $baseNow = ReadApi ('branches/' + [uri]::EscapeDataString($BaseRef))
    $headNow = ReadApi ('branches/' + [uri]::EscapeDataString($HeadRef))
    if ($baseNow.commit.sha -ne $BaseSha -or $headNow.commit.sha -ne $HeadSha) {
        throw 'Remote branch pin changed'
    }
    return $pr
}
function GuardAncestor([string]$HeadSha) {
    $comparison = ReadApi "compare/${P5}...${HeadSha}"
    if ($comparison.merge_base_commit.sha -ne $P5 -or
        $comparison.status -notin @('ahead', 'identical')) {
        throw 'Original P5 is not an ancestor'
    }
}
function MergeExact($Number, $BaseRef, $HeadRef, $BaseSha, $HeadSha) {
    $settings = gh api "repos/$Repo" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $settings.allow_merge_commit) {
        throw 'Merge-commit method unavailable'
    }
    $pr = GuardPr $Number $BaseRef $HeadRef $BaseSha $HeadSha
    if ($pr.draft -or $pr.mergeable -ne $true -or $pr.mergeable_state -ne 'clean') {
        throw 'PR is not currently ready/clean; stop'
    }
    # sha is the API's atomic expected-HEAD guard. The base guard is separate.
    $raw = gh api --method PUT "repos/$Repo/pulls/$Number/merge" `
        -f "sha=$HeadSha" -f 'merge_method=merge'
    if ($LASTEXITCODE -ne 0) { throw "PR$Number merge rejected" }
    $result = $raw | ConvertFrom-Json
    if (-not $result.merged) { throw 'Merge did not complete' }
    $commit = ReadApi "git/commits/$($result.sha)"
    if ($commit.parents.Count -ne 2 -or $commit.parents[0].sha -ne $BaseSha -or
        $commit.parents[1].sha -ne $HeadSha -or $commit.tree.sha -ne $ApprovedTree) {
        throw 'Actual merge differs; stop, do not publish or auto-rollback'
    }
    $branch = ReadApi ('branches/' + [uri]::EscapeDataString($BaseRef))
    if ($branch.commit.sha -ne $result.sha) { throw 'Remote advanced; stop' }
    GuardAncestor $result.sha
    return $result.sha
}

# ONLY AFTER explicit approval for final-pinned PR367 ready+integration merge:
$null = GuardPr 367 'codex/integratie-2026-11-16' `
    'codex/release-prep-2026-11-20' $ApprovedIntegration $ApprovedPrep
gh pr ready 367 --repo $Repo
if ($LASTEXITCODE -ne 0) { throw 'PR367 ready rejected' }
$IntegrationAfter = MergeExact 367 'codex/integratie-2026-11-16' `
    'codex/release-prep-2026-11-20' $ApprovedIntegration $ApprovedPrep

# ONLY AFTER separate explicit main approval and review of actual PR353 head:
$null = GuardPr 353 'main' 'codex/integratie-2026-11-16' `
    $ApprovedMain $IntegrationAfter
gh pr ready 353 --repo $Repo
if ($LASTEXITCODE -ne 0) { throw 'PR353 ready rejected' }
$MainAfter = MergeExact 353 'main' 'codex/integratie-2026-11-16' `
    $ApprovedMain $IntegrationAfter
GuardAncestor $MainAfter
# STOP. Main merge permission does not authorize tag/release publication.
```

GitHub's PR merge API atomically guards the expected **head**, not an expected
base SHA. The commands check both immediately before merge and verify actual
parents/tree afterwards, but cannot lock out a concurrent base update. Hence the
coordinated no-other-writes window is material. An unexpected actual result must
stop the release plan; no automatic rollback, retag or force push is proposed.

## Checks, tag and publication boundary

Current docs-only evidence additions do not invalidate exact-P5 app/package/
browser/native proof. Preserve its scoped limits; empty current headcheck lists
must not be described as green CI. New publisher/collector code needs its own
reviewed head and relevant checks. Any actual product change needs the affected
package/native rechecks. No broad tests were repeated in this audit.

The intended tag is **v2026.48.1 → original P5 b696ab86…**, never producer2af,
docheadf208, future publisher head or the later main merge commit. The final
publisher's exact tag-ref payload is:

```json
{"ref":"refs/tags/v2026.48.1","sha":"b696ab86bd1c128729a079b68c0082e6df3d36a5"}
```

No tag-creation command is part of the main-route execution above. Root relayed
the separate advisory tag404/release404 observation; it is reused here and must
be rechecked before any approved write. Existing tags/releases must not be
overwritten or silently reused.

**A normal tag push is not neutral:** P5 `release.yml` listens to `push.tags v*`;
on a tag its build jobs run and its `publiceren` job creates a draft/prerelease.
That is a separate path from the proposed existing-byte collector/uploader and
stable publication. The publisher owner must explicitly control that interaction
and present its concrete actor/trigger/upload/release-state plan before tag or
publication approval. Do not retag a doc/publisher commit to evade this trigger.

Still required: final publisher head/tree review; explicit approval for PR367's
integration merge; explicit approval for PR353's main merge; separate explicit
tag/publication approval for the concrete existing-byte release plan. No such
permission is inferred from this proposal request.

Raw read-only API snapshots and object rehearsal are indexed in
[review.json](review.json). Final integration/prep branch rereads still matched
the pins above when this snapshot was recorded. No refs/index/PR/tag/release
writes or fetch of shared refs occurred; only allowed object rehearsal and this
private `.local` audit folder were used.
