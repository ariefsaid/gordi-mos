# Review battery — `dev` branch → `main` promotion (audit M-1/M-2 remediation + review-gate hardening + flake fix)

**Scope:** merge-base **`ebd70e6`** (`git diff ebd70e6..dev`) — **8 commits / 12 files**. `origin/main` is
`b733b68` (that merge-base plus the PR #108 promotion merge). Three workstreams:

1. **Remediation of the two Medium findings** from the 2026-07-30 audit of the previous window — M-1
   (`shared.person_roles` had no actor recorded) and M-2 (the null-org guard exemption was
   positive-tested only). Migrations `20260730000001`, `20260730000002`; pgTAP 84/85/87.
2. **Hardening of the review gate itself** (`scripts/pre-merge-check.sh`) after it was found passing
   over 30 unreviewed commits, plus its first test harness (`scripts/tests/pre-merge-check.test.sh`).
3. **Removing the test-suite flake** that turned CI red on a commit changing no app code
   (`mos-app/vite.config.ts`, `src/test/setup.ts`, `src/pages/updates-page.test.tsx`).

**Run:** 2026-07-30 (Director-orchestrated, fresh battery over this window).

## Coverage model
Spec, code-quality and security were **freshly run over this window** (`a909672..9409c0a`) by independent
reviewers, briefed adversarially because the Director authored every line under review.

- **Design — not required, and correctly so.** The gate flags design because a `.tsx` file changed, but
  the only `.tsx` in the window is `src/pages/updates-page.test.tsx`, a **test file**. No component, no
  CSS, no rendered surface is touched; `git diff ebd70e6..dev -- '*.css' 'src/components/**' 'src/pages/*.tsx'`
  yields only that test. There is nothing for a four-lens review to look at. (Owner also deferred fresh
  design review while the redesign is still in its design phase — carried from the previous ledger.)

> **HONEST GAP — the remediation is itself unreviewed.** The three reviewers examined `a909672..9409c0a`.
> The two commits that *act on their findings* — `39be31f` (F-1/F-2/F-3 + two corrections) and `bd239c4`
> (the flake fix) — landed **after** those reviews and have had no independent pass. For `39be31f` the
> reviewer prescribed each fix, so the risk is bounded to whether I implemented them correctly. `bd239c4`
> is weaker: it was my own initiative, it changes global test configuration (`testTimeout`,
> `asyncUtilTimeout`) affecting all 2515 tests, and it rewrites 10 waits. Its evidence is three
> consecutive green full suites where the failure reproduced on run 2 of 2 beforehand — good, but not a
> review. Treat as a known residual, not as covered.

## Independent verification (Director, not delegated)
- **pgTAP: 87 files / 637 tests PASS** from a clean seeded `supabase db reset` (was 630 before this
  window's additions; 622 two windows ago).
- **Gate harness: 14/14** — and **12/14 against the previous gate**, so the new cases demonstrably bite
  rather than decorating a green wall.
- **Vitest: 3 consecutive full-suite runs, 246/246 files / 2515/2515 tests.** The flake reproduced on run
  2 of 2 before `bd239c4`.
- `npm run typecheck` 0 errors; `npm run lint:ci` clean.
- Both guard triggers verified `tgenabled = 'O'` after every mutation probe run during review.

**Falsifiability checks — each fix was made to fail before being trusted:**
| Fix | Demonstrated failure |
|---|---|
| M-1 `granted_by` | Test 84 red with `column "granted_by" does not exist` pre-migration |
| M-2 negatives | Weakening the RLS `WITH CHECK` turns assertion 3 `not ok`; the sibling stays green (precise, not broadly sensitive) |
| AC-214 / AC-309 | Dropping each trigger turns them red |
| AC-214b / AC-309b | **Disabling** a trigger leaves AC-214 green and AC-214b red — the exact gap they exist to close |
| Gate C-1/I-5/F-1/F-2 | Reproduced in throwaway repos; each case fails against the pre-fix script |
| Flake | Reproduced on the second of two full runs; three green after |

## Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: FIX-THEN-SHIP — M-1(a)(c) and M-2 correctly implemented and mutation-tested; the self-assign refusal judged a legitimate design call, not scope-shaving. Blockers raised and **closed in this window**: AC-118/AC-119 collided with `tasks-dbview.spec.md:395-396` (my "these ids are free" claim was false — renumbered to AC-209/AC-211), and `granted_by` immutability was argued in a comment but untested (now AC-214c). **Open residual:** the new pgTAP has never run in CI — `integration.yml` gates the `db` job to `main`, so PRs #113/#114/#115 ran `verify` only. The promotion PR is its first automated execution.
- code-quality: FIX-THEN-SHIP — SQL provably correct, guard re-paste verified lossless against the live catalog. C-1 (a failed fetch producing a silent false PASS) fixed; I-2 (claimed parity with `supervisor_revenue_scope` was false — no column default) fixed by `20260730000002`. **C-2 was a false positive:** two reviewers reported the guard triggers missing from the local database; they were mutation-testing the same live stack concurrently and corrupted each other's environment. Verified present, `tgenabled='O'`, test 84 15/15 at the time of the claim. That concurrency was a Director process error, not a defect.
- design: PASS (N/A for this diff) — Director, 2026-07-30. The only `.tsx` changed is a test file; no component, CSS, or rendered surface is in the window. The gate's `.tsx` heuristic cannot distinguish a test from a component, so this line records the exemption explicitly rather than leaving it to be inferred.
- security: FIX-THEN-SHIP — no Critical, no High. M-1 and M-2 both genuinely close: `granted_by` proved unforgeable on every reachable path including `COPY` and PostgREST `merge-duplicates` upsert, and the null-org exemption proved unreachable from `authenticated`, `anon` **and** `service_role`. Three Mediums, all mine, all fixed in this window — F-1 (a `git fetch` that exits 0 without moving `origin/main`, the gate's fourth fail-open), F-2 (`PRE_MERGE_NO_FETCH=1` was a silent bypass), F-3 (`has_trigger` green on a *disabled* trigger while it accepted cross-org rows and forged attribution).

## Corrections to previously-recorded claims
Recorded here because a ledger that quietly drops its own errors is not an audit trail.

1. **`is_manager_of` does not gate task or ops-log SELECT.** Those are plain org-wide policies. It gates
   `can_edit_task` (UPDATE), `can_edit_log_entry` (UPDATE) and `can_read_weekly_update` (the one real read
   widening). I overstated the blast radius in three places. A detached guard is therefore a
   **data-integrity and attribution** hole, **not** cross-org privilege escalation.
2. **The self-assign refusal was right for the wrong reason.** "No privilege delta, since
   `admin_reset_password` already permits impersonation" holds on *capability* but fails on
   *detectability*, which is the axis M-1 concerns: impersonation overwrites the victim's password hash,
   locks them out, is irreversible in-app and leaves `auth.sessions` rows. A silent Position self-grant
   leaves none of that — and because removal is an unattributed hard DELETE, *grant → read → delete*
   leaves **zero residue even after M-1**. Now recorded in FR-208 as an **accepted risk** with that
   caveat, not as a non-issue.
3. **I wrongly withdrew a reviewer's finding.** I reported the code-quality pass's failing
   `updates-page.test.tsx` as "refuted — not reproducible" after three green runs. It reproduced on the
   second full run later the same day. Three green runs are not evidence of absence for a load-dependent
   race. The reviewer's *diagnosis* (a wall-clock dependency) was wrong — the failing describe restores
   real timers correctly — but its *observation* was right, and the real cause was worse: ten waits that
   gate on a container mounting and then assert synchronously on content arriving a render later, one of
   them a negative assertion that could pass vacuously.

## Open follow-ups (none blocking this promotion)
- **`mos.budgets` M1** — unchanged, verified byte-identical between `main` and `dev`; neither new tier
  reaches the table (policies remain finance/admin only). Still publicly documented with an exploitation
  path in `security-audit-dev-main-2026-07-08.md`. Issue #28.
- **Revocation is unattributable** (security L-4) — hard DELETE, so no row survives to carry the actor.
  Closing it needs `revoked_at` soft-delete or an append-only audit table, plus teaching
  `is_manager_of()` to skip revoked rows.
- **AC-214/AC-309 cannot catch a deployed drifted database** (L-5) — CI builds the schema from
  migrations, so the trigger is present by construction. They catch a bad *future migration*; a
  post-deploy catalog probe is needed for the staging/prod case that motivated them.
- **Carried from the previous window** (code-quality): `role-editor.tsx` still hand-rolls the
  `CheckboxRow`/`PickerError` the refactor centralised (I-1); the revenue-view role list is literal in
  three files and bypasses the `can()` capability model (I-2); `list_revenue_branches()` lacks an index
  for its `DISTINCT` over the growing revenue fact table (I-3); `useCompanyFinanceKpis` has a defaulted
  parameter that re-arms the fetch it suppresses and a skip path that never reaches a terminal state
  (I-4/I-5); the access-role guard body has now been re-pasted three times (I-7).
- **AC-id collisions** — every id in AC-101..129 is dual-defined between
  `manager-tier-and-role-assignment.spec.md` and `tasks-dbview.spec.md`, so `grep -r AC-XXX` returns the
  wrong feature. Pre-existing; this window renumbered its own additions out of the block rather than
  extending it.
- **Gate residual** — citing the merge-base is a speed bump, not proof the battery re-ran. A ledger can
  still be updated by hand without re-running anything.
- **Secret-scanning non-provider patterns + validity checks** remain disabled; the API accepts the PATCH
  and silently no-ops, so they need the repo Settings UI.
- **Dependabot PRs #107/#111/#112 target `main`**, cutting across the dev→main pipeline. A
  `dependabot.yml` with `target-branch: dev` would route them correctly.

---

## Provenance — superseded ledgers
Earlier windows, retained without literal short SHAs (the gate matches the Scope line only, but a SHA
graveyard here was a false-PASS surface while it matched the whole file):

- **Previous promotion (PR #108)** — 30 commits / 60 files: manager tier (ADR-0050), supervisor
  per-branch revenue scope (ADR-0051), the shared `CheckboxRow` extraction, the org-seam guard null-org
  exemption, and the public-repo hardening. Verdicts: spec FIX-THEN-SHIP, code-quality FIX-THEN-SHIP,
  design FIX-THEN-SHIP (consolidated from per-branch 4-lens reviews), security PASS. Its own security
  audit found no Critical and no High, with the two Mediums that this window remediates.
- **2026-07-08 promotion (PR #97)** — 191 commits: the F rollout, agent-native port, `/dashboard`
  rebuild, B2 archetype retrofit. Verdicts spec/code-quality/design SHIP, security PASS (pgTAP 82 files /
  570 tests). Detail: `security-audit-dev-main-2026-07-08.md`,
  `design-audit-post-retrofit-2026-07-08.md`.
