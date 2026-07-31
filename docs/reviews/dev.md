# Review battery — `dev` branch → `main` promotion (M1 closure + the four carried code-quality findings)

**Scope:** merge-base **`d88289c`** (`git diff d88289c..dev`) — **7 commits / 21 files**. `origin/main`
is `0cec33c`. Three workstreams:

1. **M1 — the last open security finding, closed.** `mos.budgets` / `mos.budget_lines` granted
   `insert, update` to `authenticated`, so a `cogs.write` holder could bypass `mos.capture_budget` and
   write an arbitrary `total_budgeted_cogs` or a cross-org `owning_bu_id`. Carried since the
   2026-07-08 audit and publicly documented with an exploitation path on a public repo. Closed by
   `20260731000001` (two revokes) + the `78_...` pgTAP rewrite. Also I-3, the covering index for
   `reporting.list_revenue_branches()` (`20260731000002`).
2. **The four carried code-quality findings** — I-1 (RoleEditor hand-rolled the centralised
   `CheckboxRow`/`PickerError`), I-2 (revenue-role list literal in three files), I-4/I-5
   (`useCompanyFinanceKpis` defaulted parameter + non-terminal skip path).
3. **Battery remediation** (`03bf498`) — acting on this window's own review findings, including a
   false claim I made in `3cd434c`'s commit message. See "Corrections" below.

**Run:** 2026-07-31 (Director-orchestrated). Builders: pi/`glm-5.2` (SQL) and pi/`glm-4.7` (app).
Reviewers: Claude (cross-family from the GLM builders), briefed adversarially because I wrote or
commissioned every line under review.

## Coverage model
- **Security · spec · code-quality** — freshly run over this window.
- **Design — REQUIRED and NOT RUN.** Unlike the previous window, this one changes **real rendered
  surfaces**, not just tests: `checkbox-row.tsx` (label markup restructured into a two-line flex
  column), `role-editor.tsx` (its entire role-checkbox list re-parented onto the shared primitive),
  `money-position-section.tsx` (provenance-note visibility condition). The last ledger's "only a test
  file changed" exemption would be **false** if copied here. Deferred per the owner's standing call
  (2026-07-30: fresh design review premature while the redesign is in its design phase) and because
  rendering the app was judged too costly after this session OOM'd a 24 GB machine. **This is a real
  gap, not an N/A** — the RoleEditor rows and the provenance note are unreviewed visually.

## Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: FIX-THEN-SHIP — M1/I-1/I-3/I-4-I-5 genuinely close; the pgTAP rewrite preserves its goal with an exact plan. Findings raised and **fixed in `03bf498`**: `AC-PB-013` was defined in no spec; three `plan-budget.spec.md` lines had become FALSE (AC-PB-008 "via the `mos` client", AC-PB-009 "RLS denies it / a finance holder can write", FR-PB-005); the I-2 refactor had made AC-320/AC-402/router assertions tautological; and `pricing-page.test.tsx` carried the same expired fixture this window claimed to have cleared. **Still open:** I-2 closes only its duplication half — the `can()` capability-model bypass named in the finding is untouched.
- code-quality: FIX-THEN-SHIP — I-1 is honest extraction (RoleEditor 326→288 lines, both pickers' tests unmodified and green), I-2 is a real single-source win, the index is well-chosen under RLS. Findings raised and **fixed in `03bf498`**: the I-4/I-5 workaround was removed from only one of two callers (`home-page.tsx:154`); the migration revokes INSERT *and* UPDATE but only INSERT was pinned; three AC-tagged tests became tautologies.
- design: NOT RUN — required and deferred, see the coverage model above. Recorded as a gap, not an exemption.
- security: PASS — no Critical, no High. M1 verified **genuinely CLOSED, not narrowed**: catalog shows `authenticated=r` only on both tables; `anon`, `service_role` (even with BYPASSRLS) and `reporting_writer` hold nothing, so a leaked service key gets `permission denied for table budgets`. No other SECURITY DEFINER function writes them; no view, rule, or upsert path exists. `capture_budget` still works end-to-end. The new assertions mutation-tested: re-granting turns them red.

## Falsifiability — every fix made to fail before being trusted
| Fix | Demonstrated failure |
|---|---|
| M1 revoke | Restoring the grant lets a finance session write `total_budgeted_cogs = 999999`; AC-PB-013 goes red |
| AC-PB-013 UPDATE half | Re-granting `update` turns assertion 8 red |
| `pricing-page` fixture | Restoring the `2026-07-01` literal turns the new no-warning assertion red |
| `budget-page` fixture | Reproduced the original expiry at 30.17 days |
| I-3 index | EXPLAIN: Seq Scan + HashAggregate + Sort → Index Only Scan + Unique, `Heap Fetches: 0` |

## Independent verification (Director)
- pgTAP **87 files / 639 tests** PASS · vitest **247 files / 2526 tests** · typecheck 0 · lint 0
- Stack booted **once** (trimmed set) and stopped — this session OOM'd a 24 GB machine; container
  count was cut 24 → 13 and the gordi stack left down.

## Corrections to my own claims
Recorded because a ledger that drops its own errors is not an audit trail.

1. **`3cd434c`'s commit message was false.** It claimed I had "checked the class, not just the
   instance" of the expired-date time bomb and cleared `pricing-page.test.tsx` because it "uses its
   date as its own reference". `pricing-page.tsx:69-73` calls `assessCostStatus` **without**
   `basisAsOf`, so the reference is wall-clock. Its `FRESH = '2026-07-01'` was 30.21 days old against
   `STALENESS_DAYS = 30` — a fixture named FRESH that the code classified as STALE, green only
   because nothing asserted the healthy branch. I grepped the test file instead of the component it
   exercises. Fixed, plus the missing negative assertion.
2. **The I-2 refactor made three AC-tagged tests unfalsifiable** and I merged them. Looping over the
   constant a function is implemented from proves nothing. This is the exact standard I applied to
   everything else this session.

## Open follow-ups (none blocking)
- **Design review of this window's rendered surfaces** — the gap named above.
- **L6 (Medium, security):** `docs/backlog.md:182-193`, added this window, publishes an
  **unremediated** credential weakness in exploit-ready detail on a public repo — no forced password
  rotation, the four synthetic `@ops.gordi.local` accounts that cannot self-rotate, and the
  manager/supervisor financial tiers behind them. Already public, so not a ship gate. **Owner action:
  rotate those four temp passwords**; stub the public entry; prioritise the fix.
- **I-2 half-open** — the `can()` capability-model bypass.
- **RLS write-policy coverage lost** — both write assertions now stop at the ACL, so
  `budgets_insert_cogs_write` / `budgets_update_cogs_write` have no negative test, while
  `20260731000001:24-25` claims they remain defence-in-depth.
- **Soft-archive unreachable** — `archived_at` can no longer be set by any path; a future archive
  feature must ship `mos.archive_budget`, NOT restore the grant (recorded in FR-PB-013).
- **`cost_basis_as_of` / `is_complete` still caller-asserted** inside `capture_budget`, so a
  `cogs.write` holder can stamp a fresh basis on stale costs.
- **Index hygiene** — `20260731000002` has no `if not exists` and no pgTAP asserting the index exists.
  (`create index concurrently` was considered and **rejected**: the Supabase CLI runs each migration
  in a transaction, where CONCURRENTLY cannot run — it would break `db reset`/`db push`.)
- **I-7** — the access-role guard body is re-pasted across three migrations, still not extracted.
- **AC-id collisions** — AC-101..129 dual-defined across two specs.
- **Unattributable revocation (L-4)** — hard DELETE, so *grant → read → delete* leaves no trace.
- **Two secret-scanning toggles** the API silently refuses; needs the Settings UI.

---

## Provenance — superseded ledgers
- **Previous promotion (PR #118)** — 19 commits: audit M-1/M-2 remediation, review-gate hardening
  (four fail-open bugs, plus its first test harness), the suite flake fix, and CI efficiency + the
  pgTAP fast lane. Verdicts: spec/code-quality/security FIX-THEN-SHIP, design N/A (test-only `.tsx`).
- **PR #108** — 30 commits: manager tier (ADR-0050), supervisor per-branch revenue scope (ADR-0051),
  the shared `CheckboxRow` extraction, the org-seam guard null-org exemption, public-repo hardening.
- **2026-07-08 (PR #97)** — 191 commits: the F rollout, agent-native port, `/dashboard` rebuild, B2
  archetype retrofit. Detail in `security-audit-dev-main-2026-07-08.md`.
