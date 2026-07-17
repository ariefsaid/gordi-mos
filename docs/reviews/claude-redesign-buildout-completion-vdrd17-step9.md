# Review ledger — Step 9 "Money + Inbox alignment" (branch `claude/redesign-buildout-completion-vdrd17`)

Diff scope: the Follow-up queue "one record, two doors" convergence only —
`mos-app/src/components/follow-ups/use-follow-up-queue.ts` (new, extracted verbatim),
`mos-app/src/components/follow-ups/follow-up-queue-table.tsx` (new, extracted verbatim),
`mos-app/src/components/follow-ups/follow-up-queue-embed.tsx` (new),
`mos-app/src/components/follow-ups/follow-up-queue-embed.test.tsx` (new),
`mos-app/src/pages/follow-ups-page.tsx` (rewritten as a thin composition — rendered output
unchanged, proven by `follow-ups-page.test.tsx` staying green unmodified),
`mos-app/src/pages/dashboard-page.tsx` + `.css` (Door-2 discoverable link),
`mos-app/src/pages/dashboard-page.test.tsx` (1 new regression `describe`),
`mos-app/src/pages/dashboard-page.followups-door.test.tsx` (new, sibling flag-variant),
`mos-app/src/router.tsx` (1 new route: `money/follow-ups`),
`mos-app/src/router.test.tsx` (1 new test case),
`mos-app/src/components/tasks/tasks-workspace.tsx` (reserved-`followups` branch gains a
`SHOW_FOLLOWUPS` split),
`mos-app/src/components/tasks/tasks-workspace-followups-door.test.tsx` (new, sibling
flag-variant), `mos-app/src/consistency.regression.test.tsx` (RI-IXD-8 target repointed at the
extracted `FollowUpQueueTable` — see "Deviations" below).
Commits `feat(money): T-A1` through `feat(money): T-C4`, plus `fix(money): repoint RI-IXD-8`, on
this branch. This branch carries other concurrent steps (4/5/6/7/8/10 etc. — see other commits
interleaved in `git log`); **this ledger covers Step 9 only**. Full command:
`git log --oneline --grep='(money):'`.

**Spec:** `docs/specs/money-inbox-alignment.spec.md` (FR-900..910, NFR-900..903, OBS-900,
AC-900..909).
**Plan:** `docs/plans/2026-07-17-money-inbox-alignment.md` (T-A1..A5 / T-B1..B3 / T-C1..C4).

## Scope card (Step 9)

**In scope (built, this step):**
- The Follow-up queue extraction: ONE data/behavior hook (`useFollowUpQueue`) + ONE presentational
  renderer (`FollowUpQueueTable`), lifted verbatim out of the pre-existing `FollowUpsPage`. Three
  consumers compose them — `FollowUpsPage` (rewired, unchanged rendered output), the new
  `FollowUpQueueEmbed` (Door 1), and `FollowUpsPage` again at a second route (Door 2) — zero
  duplicate table/detail/lifecycle-action implementations (FR-905/Rule 11).
- **Door 1**: `/work/tasks?view=followups` renders the live queue via `FollowUpQueueEmbed`, gated by
  `SHOW_FOLLOWUPS` (flag-off keeps the exact FR-311 placeholder, byte-for-byte).
- **Door 2**: `/money/follow-ups` route (finance/admin `RequireAccessRole` + `SHOW_FOLLOWUPS` gate,
  mirroring `money/budget`/`money/pricing`) + a discoverable `Link` in `DashboardChrome`
  (`SHOW_FOLLOWUPS`-gated, state-independent of the sales-reporting load state).
- Every row's source link, in every door, resolves to the single canonical
  `/work/follow-ups/:id` route (FR-906) — no second canonical URL.
- Zero schema/RLS/migration change (NFR-901). Zero Inbox change (FR-909). Zero new i18n keys
  (all `followUps.*` / `tasks.saved.followups` / `tasks.followups.*` strings already existed).

**DEFERRED (not built here — do not fail these):**
- Flipping `SHOW_FOLLOWUPS` to `true` in production — stays `false` throughout this step
  (RATIFY-9-1 below).
- Home's `data-money-ar-slot` — a separate, not-yet-scoped follow-up (RATIFY-9-3 below).
- A live overdue-count badge on the Door-2 link — the link is a navigational door only
  (RATIFY-9-2 below, NFR-903).
- Any visual/mockup-ratified treatment of a Money/Follow-ups screen — none exists yet; Door 2's
  link is a minimal, reuse-only placement.

## Rules 1–12 checklist (unfilled — reviewers fill this in)

| Rule | Compliant? | Notes |
|---|---|---|
| 1 — one job per rail item | | |
| 2 — three-layer boundary (Follow-up domain → ONE table/detail UI family → two destinations: Money queue entry, Work Tasks saved-view) | | |
| 3 — rail/surface budget caps | | |
| 4 — canonical routes + URL state (exactly one Follow-up record URL: `/work/follow-ups/:id`, from either door) | | |
| 5 — exactly one `aria-current="page"` | | |
| 6 — one page anatomy per route (`FollowUpQueueEmbed` has no `PageFrame`/`PageHead` of its own — mounts inside `TasksWorkspace`'s own content region) | | |
| 7 — verb+object action grammar (lifecycle-action buttons: Chase/Promise/Partial/Settle/Confirm — unchanged from pre-Step-9) | | |
| 8 — capture-first disclosure (N/A — no new composer/form in this step) | | |
| 9 — responsive disclosure order (mobile↔desktop parity — `DataTable`'s existing 768px reflow, unchanged) | | |
| 10 — extension test (a third door composes the SAME hook + table with zero new table/detail code; `destinations.tsx`/`job-sentences.ts`/`breadcrumb.tsx` untouched — verified, §3 of the spec) | | |
| 11 — component reuse (ONE `useFollowUpQueue` + ONE `FollowUpQueueTable`; no second implementation) | | |
| 12 — usable by a high-school graduate, no training | | |

## Verdicts

<!-- Fill one verdict line per REQUIRED review before running pre-merge-check.sh.
     Accepted: PASS SHIP FIX-THEN-SHIP   Blocking: REWORK FAIL STILL-FAILING
     Required always: spec, code-quality. Required (UI changed): design. Required (schema/RLS changed): security. -->

- spec: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes>
- code-quality: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes>
- design: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes> (required — `.tsx`/`.css` changed: `dashboard-page.tsx`/`.css`, `follow-up-queue-embed.tsx`, `follow-up-queue-table.tsx`, `follow-ups-page.tsx`, `tasks-workspace.tsx`, `router.tsx`)
- security: N/A — no auth/RLS/schema path touched (NFR-901: no new schema/table/RLS/migration this step; the existing `follow_ups_select` RLS + `mos.transition_follow_up` SECURITY DEFINER RPC are reused as-is and already pgTAP-proven).

## Gates (fresh, this pass)

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS (zero errors) |
| `npm run lint -- --max-warnings=0` | PASS (zero errors/warnings) |
| `npm test` (Vitest) + coverage ≥80% changed lines | PASS — see build report for the run log |
| `bash scripts/pre-merge-check.sh` | <!-- expected FAIL until Verdicts above are filled --> |

No pgTAP required (no schema/RLS touched — NFR-901). No Playwright required (`SHOW_FOLLOWUPS` stays
off; no new curated e2e journey — spec §12/plan §2 "No new e2e journey").

## Ratify before merge

1. **RATIFY-9-1: `SHOW_FOLLOWUPS` stays `false`.** `docs/decisions.md` OD-IA-1 records "backup/restore
   drill gates the AR bridge," and no document surveyed for the spec records that drill as complete.
   This step wires both doors fully behind the flag (flipping it is a one-line change with zero
   further code) but does **not** flip it. Confirm the backup/restore go-live gate status before ever
   flipping `SHOW_FOLLOWUPS` to `true`.

2. **RATIFY-9-2: Door 2's link treatment is a minimal, unratified placement.** A plain
   `.btn.btn-outline` `Link` labelled "Follow-up queue" in `DashboardChrome` — no mockup exists for a
   Money/Follow-ups convergence screen. Acceptable pending the mandatory 4-lens design review for
   this step; a live overdue-count badge is explicitly deferred (NFR-903), not rejected.

3. **RATIFY-9-3: Home's `data-money-ar-slot` is intentionally untouched.** Its own comment
   ("a self-contained drop point for the parallel AR/Follow-up slice… NO invented AR figure this
   slice") pre-dates this spec and is not resolved here. Confirm this slot remains a separate,
   not-yet-scoped follow-up rather than an expected-but-missed part of this step.

## Deviations from the plan (implementer notes)

- **`consistency.regression.test.tsx`'s `RI-IXD-8` guard** (a pre-existing repo-wide regression
  check, not named in the money-inbox-alignment plan) asserted that
  `pages/follow-ups-page.tsx` directly imports `@/components/dashboard/data-table` and
  `@/components/ui/state-kit`. The T-B1/T-B2 extraction moved that usage into the new
  `components/follow-ups/follow-up-queue-table.tsx`, so the literal file-path assertion broke
  (`npm test` caught this; the plan's own named regression anchors — `follow-ups-page.test.tsx`,
  `tasks-workspace.test.tsx`'s `AC-311`, `router.test.tsx`'s `/inbox` case — were untouched and
  green). RI-IXD-8's *goal* ("the retrofit target stays on the shared table + state kit, not a
  private list grammar") still holds — the import just lives one hop away, in the extracted
  component all three doors compose. Repointed the target list entry from
  `pages/follow-ups-page.tsx` to `components/follow-ups/follow-up-queue-table.tsx` (single commit,
  `fix(money): repoint RI-IXD-8...`) rather than weakening the assertion.
- **`follow-up-queue-embed.test.tsx`** (T-C1, as specified verbatim in the plan) omitted the
  desktop-forcing `matchMedia` stub that its sibling `follow-ups-page.test.tsx` (`applyViewport`)
  and the plan's own T-C3 test both carry. Without it, jsdom's global default stub
  (`matches: false`, `src/test/setup.ts`) renders `DataTable`'s phone-card branch instead of a
  `<table>`, and the AC-904 `getByRole('table', ...)` assertion legitimately failed for a missing
  test-environment default, not a component defect. Added the same desktop-forcing `matchMedia`
  stub used by the sibling tests in a `beforeEach`; the assertion itself was not weakened or
  reworded.

## Deferred / tracked debt

None beyond the three RATIFY items above and the spec's own out-of-scope list (§2), all owned by
later, already-identified follow-ups (SHOW_FOLLOWUPS go-live, the Home AR slot, a future overdue
count badge).
