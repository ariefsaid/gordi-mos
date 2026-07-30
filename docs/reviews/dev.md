# Review battery — `dev` branch → `main` promotion (manager tier + supervisor revenue scope + guards + repo hardening)

**Scope:** `git diff main..dev` — **30 commits / 60 files** since the last promotion (`main` @ `e746c07`, PR #97).
Five workstreams: the **manager** financial-visibility tier + admin-assigns-Jabatan/Position (ADR-0050),
the **supervisor** access tier + per-branch revenue scope (ADR-0051), the shared `CheckboxRow`/`PickerError`
extraction, the org-seam guard null-`current_org_id` exemption, and the public-repo hardening
(gitignore + CI least-privilege). Backing schema: **5 migrations** (`20260729000001`–`000005`) with paired
pgTAP (`supabase/tests/30, 83, 84, 85, 86, 87`).

**Run:** 2026-07-30 (Director-orchestrated, fresh battery).

> **Why this ledger was rebuilt from scratch.** The previous `dev.md` described the **2026-07-08**
> promotion — "191 commits / ~453 files since `main` @ `669ee0a`". `669ee0a` is already an ancestor of
> `main`; that window closed with PR #97. `scripts/pre-merge-check.sh` nonetheless **exited 0** on it,
> because the script only checks that verdict lines exist for the current branch name — it never
> compares the ledger's scope to the actual `main..dev` diff. A stale ledger is indistinguishable from
> a fresh one. **Open follow-up: make the script fail when the ledger's stated baseline diverges from
> `git merge-base main HEAD`.** Until then this gate remains willpower-assisted.

## Coverage model
Every lens except design was **freshly re-run end-to-end over this window**; none of the 2026-07-08
conclusions were inherited.

- **Security** — fresh OWASP/STRIDE pass over the whole `main..dev` auth/RLS/migration surface, verified
  against the live local Postgres catalog with attack probes executed in rolled-back transactions.
- **Spec · Code-quality** — fresh, each covering both the four per-branch-reviewed workstreams (verifying
  the recorded verdicts actually hold against the merged code) and the one commit that had no ledger.
- **Design** — **consolidated from the per-branch reviews, not freshly re-run.** Owner decision
  (2026-07-30): still in the design phase, so a fresh cross-cutting pass is premature. Consolidated
  sources: `feat-manager-tier-role-assignment.md:13` (FIX-THEN-SHIP, 4-lens on admin /people; slug-leak,
  dialog-scroll and row hit-target fixed in `e28d277` with 6 regression tests),
  `feat-supervisor-revenue-scope.md:14` (FIX-THEN-SHIP, 4-lens on RevenueScopePicker + revenue-only
  dashboard/home; channel grouping fixed in `95864e9` with regression test; margin surfaces confirmed
  absent rather than zeroed), `refactor-shared-checkbox-row.md:15` (PASS, pixel- and behaviour-preserving).
  **What this does not cover:** the two access tiers were designed in separate branches and have never
  been reviewed side by side. Specifically unexamined — whether manager and supervisor present as one
  coherent access model in `RoleEditor` / the People table, and whether the newly view-only `/dashboard`
  and Plan surfaces communicate "look but don't touch" or leave dead affordances. Carry into the design phase.

## Independent verification (Director, not delegated)
- **Full suite green:** `npm run test:coverage` → **246/246 files, 2515/2515 tests**. Changed-code coverage
  ≥80% on every touched file (most at 100%).
- `npm run typecheck` → 0 errors. `npm run lint:ci` (eslint `--max-warnings=0` + stylelint) → clean.
- **CI green on the promotion PR (#108) at `f3f57a6`:** `verify` SUCCESS **and** `db` SUCCESS — the full
  Supabase + pgTAP + Playwright gate (`Files=87, Tests=622, Result: PASS`, 39 e2e passed). Every
  "N/A local — CI-gated" row in the four per-branch ledgers is now backed by a real green run.
- **One reported blocker was refuted.** The code-quality pass reported `npm run test:coverage` failing at
  `updates-page.test.tsx:544` on a wall-clock dependency. Not reproducible: that file passes 46/46 in
  isolation, the full suite is 2515/2515, and CI's `verify` — which runs exactly that command — passed on
  the same commit. Three independent contradictions; the finding is withdrawn, not deferred.

## Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: FIX-THEN-SHIP — code and tests match every per-branch ledger claim; `b1fe0ba` does exactly its stated 3-file scope, all 4 action SHAs match their tags, the required `verify` job name is intact. Three blockers found and **closed in PR #109**: ADR-0051 + the supervisor spec + both 2026-07-29 plans were never committed (a new access tier had shipped to `dev` with no governing document in the repo), and `access-roles.spec.md:487-494` still stated the pre-inversion `assigned ∪ derived-manager` contract.
- code-quality: FIX-THEN-SHIP — sound migrations, strong pgTAP, `canViewFinance` fully migrated with no mixed naming; typecheck and lint clean. Non-blocking follow-ups filed below; the one reported hard blocker (red merge gate) was refuted on independent re-run.
- design: FIX-THEN-SHIP — consolidated from the three per-branch 4-lens reviews (2026-07-29); no Critical in any, all Important findings fixed with regression tests. Fresh cross-cutting review deliberately deferred by owner decision (still in design phase); the unexamined seam is named above.
- security: PASS — no Critical, no High. RLS proven the wall on all 5 touched tables (enable+force catalog-verified; cross-org and wrong-role negatives pinned in pgTAP 83–86). The null-org guard exemption — the window's highest-risk change — was proven **empirically unreachable** from an authenticated or anon PostgREST session (`42501` on both tables, because `WITH CHECK (org_id = current_org_id() …)` evaluates NULL when the org claim is absent). No new SECURITY DEFINER function; no secrets in the delta.

## Open follow-ups (none blocking this promotion)

**Security (from the fresh audit)**
- **M-1** `shared.person_roles` admin write path has no self-assign block and no actor provenance — a
  permission-affecting write with zero attribution (STRIDE Repudiation; no privilege delta, since an admin
  can already impersonate via `admin_reset_password`). Inconsistent with its own sibling
  `reporting.supervisor_revenue_scope`, created two migrations later, which *does* carry `granted_by`.
  Fix: add `granted_by` + force it in `_guard_person_roles`; block self-assign; pin with `throws_ok`.
- **M-2** The null-org guard exemption is **positive-tested only** (`87_guard_null_org_seed.sql` — two
  `lives_ok`, zero negatives). Defence went from two walls to one, and the remaining wall has no test for
  this case; the next migration that relaxes either `WITH CHECK` re-opens an org-unbound write with no
  failing test. Fix: ~10 lines appending `throws_ok` probes for an authenticated null-org admin session.
- **L-1** `reporting.list_revenue_branches()` keeps the default PUBLIC EXECUTE grant (blast radius nil —
  SECURITY INVOKER, `search_path=''`, `anon` lacks schema usage — but off-pattern vs NFR-007).
- **L-2** Both new money tiers inherit the stale-JWT revocation lag.
- **L-3** `01_rls_enabled.sql` is a name whitelist, so the new `reporting` table has no enable+force proof.
  Fix with one catalog-wide assertion that fails automatically for any future table.

**Code quality**
- **I-1** (Director-verified) `role-editor.tsx:237-268` and `:283-295` still hand-roll the exact
  `CheckboxRow` and `PickerError` the refactor centralised — the extraction deduped the two copies and left
  the original. Confirmed: `role-editor.tsx` imports neither; only the two pickers do.
- **I-2** The revenue-view role list is literal in three files (`capabilities.ts:19`, `router.tsx:141`,
  `destinations.tsx:75`) and bypasses the `can()` capability model that mirrors `shared.role_capabilities`.
  Both new tiers use the non-canonical idiom; there are now two ways to express "what a tier may do".
- **I-3** Missing index for `list_revenue_branches()`'s `DISTINCT` over the growing revenue fact table,
  called unconditionally on every admin People-page load (Part B Data/Schema DoD).
- **I-4 / I-5** `useCompanyFinanceKpis` — a defaulted second parameter re-arms the margin fetch the hook
  exists to suppress, and the skip path never reaches a terminal state, so `marginState` reads `'loading'`
  forever (the caller papers over it).
- **I-7** The 50-line access-role guard body was re-pasted twice in this one window; a comment is the only
  thing protecting the no-lockout invariant across the copy-paste.
- Minors: SHA pin comments say `# v4` where the pins are `v4.4.0`/`v4.3.0`; `persist-credentials: false`
  not set on either checkout; the `__pycache__` ignore is directory-scoped rather than repo-wide;
  `!supabase/op.*.env` would be less fragile than the single-file negation.

**Dependency alerts** — Dependabot was enabled 2026-07-30 and immediately surfaced **10 open alerts
(7 high, 3 medium)**. Five are **runtime** scope, all `react-router` (installed 7.17.0): four clear with a
bump to **7.18.0**, inside the existing `^7` range. The fifth (RSC-mode CSRF) nominally wants 8.3.0 but does
not apply — this is a Vite SPA and RSC mode is used nowhere in `mos-app/src`. The other five
(`brace-expansion`, `fast-uri`, `js-yaml`) are build-time only.

**Process** — `chore/repo-hardening` merged to `dev` with no ledger; `pre-merge-check.sh:33-42` would have
exited 1 on that branch. Coverage supplied retroactively by this battery. AC-id collisions across specs
(AC-101, AC-301…315) weaken the `grep -r AC-XXX` traceability rule; AC-102's assertion was retagged to
AC-302 by a sibling branch inside this same window.

---

## Superseded ledger (2026-07-08 promotion, `main` @ `669ee0a` → PR #97)
Retained for provenance. That window's verdicts — spec SHIP, code-quality SHIP, design SHIP, security PASS
(pgTAP 82 files / 570 tests) — covered the F rollout, the agent-native port, the `/dashboard` rebuild and
the B2 archetype retrofit. Full detail: `security-audit-dev-main-2026-07-08.md`,
`design-audit-post-retrofit-2026-07-08.md`. **Its `mos.budgets` M1 finding remains open and is unchanged by
the current window** — verified byte-identical between `main` and `dev`; neither new tier reaches the table
(budgets policies remain finance/admin only).
