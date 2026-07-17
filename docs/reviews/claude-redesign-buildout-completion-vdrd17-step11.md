# Review ledger — Step 11 "Decommission sweep" (branch `claude/redesign-buildout-completion-vdrd17`)

Diff scope: removal only, four commits on top of `3b3db97` (steps 4/5/8 design re-review APPROVE —
the last successor step this sweep depends on):

- `793eafb` — chore(sweep): remove retired Cascade page — successor Step 8 catalog re-home
- `c8c1d28` — chore(sweep): remove retired Weekly Update entry points — successor Step 4 Signals
- `27126f7` — chore(sweep): remove retired Daily Log entry points — successor Step 5 Home
- `23b9334` — chore(sweep): delete the parked e2e tied to retired destinations

**Plan:** `docs/plans/2026-07-14-redesign-buildout.md` row 11 ("Decommission sweep"). No new spec —
this step deletes code whose entry points steps 2/4/5/8 already removed; nothing new is specified.

## Method

1. Inventoried every candidate (grep for retired-screen code, cross-checked against
   `shell/retirement.test.tsx` — the retirement oracle — and against `router.tsx` to confirm zero
   remaining routes/imports).
2. Deleted in small commits, each proven safe by `npm run typecheck` (0 errors) + full `npm test`
   green before committing.
3. Dispositioned each parked e2e spec per file (delete vs. un-skip+rewrite), recorded below.
4. Fixed the stale internal comments this sweep's own deletions created (a comment referencing a
   file this same sweep deletes counts as newly-stale, not pre-existing debt).

## Inventory — code deleted

| Item | Evidence of deadness | Action | Commit |
|---|---|---|---|
| `src/pages/cascade-page.tsx` + `.css` + `.test.tsx` | `router.tsx` has zero import of `CascadePage`; `/work/cascade` is `<Navigate to="/work/tasks">`. `docs/specs/catalog-rehome.spec.md` §1 explicitly scopes this deletion to Step 11. | delete | `793eafb` |
| `src/lib/cascade/build-ladder.ts` + `.test.ts` | Sole non-test importer was `cascade-page.tsx`. `use-cascade-catalogs.ts` (a *different*, live Tasks-grouping module) does not import it — confirmed by grep. | delete | `793eafb` |
| 22 orphaned `cascade.*` i18n keys (en+id) | Sole consumer of every `cascade.*` key was `cascade-page.tsx` (grep: 1 file each, always the retired page). `home.stack.cascade.drill` is a *different*, live key (used by the feature-flagged `stacked-union-home.tsx`) — NOT removed. | delete | `793eafb` |
| `nav.updates` / `nav.dailyLog` i18n keys (en+id) | Zero non-catalog consumers (`retirement.test.tsx` already proves no nav entry carries them). Pure dead-key cleanup, bundled with the cascade-key removal. | delete | `793eafb` |
| Stale comment in `home-page.css` referencing `cascade-page.css`'s `.cascade-task-link` | Comment pointed at a file this sweep deletes. | reword | `793eafb` |
| `src/pages/updates-page.tsx` + `.test.tsx` | `router.tsx` has zero import; `/updates` is `<Navigate to="/work/signals">` (Step 4 successor, live). `docs/adr/0050-…` names Weekly Update as retired, superseded by Signals (OD-33). | delete | `c8c1d28` |
| `src/components/weekly/weekly-update-write-pane.tsx` + `.test.tsx` + `.css` | Sole non-test importer was `updates-page.tsx`. | delete | `c8c1d28` |
| `src/components/weekly/weekly-update-review-pane.tsx` + `.test.tsx` + `.fixes.test.tsx` + `.css` | `WeeklyUpdateReviewPane` component's sole importer was `updates-page.tsx`. `StatePill` (the one live export this file also carried) already lived canonically in `components/ui/state-pill.tsx` — this file only re-exported it "so existing import sites stay stable." | delete; `my-week-panel.tsx` now imports `StatePill` from `@/components/ui/state-pill` directly | `c8c1d28` |
| `src/components/weekly/progress-marker.tsx` + `.test.tsx` + `ProgressMarker.css` | Sole importer was `weekly-update-write-pane.tsx`. | delete | `c8c1d28` |
| `lib/db/weekly-updates.ts`: `upsertDraft`/`diffLines`/`submit`/`reopen`/`addLine`/`updateLine`/`removeLine` + `DraftLine`/`UpsertDraftInput` types | Grep: zero callers left anywhere once `weekly-update-write-pane.tsx` is gone (`addLine`/`updateLine`/`removeLine` were only reachable via `upsertDraft`'s internal `diffLines`). `getMyUpdate`/`listTeamUpdates`/`TeamMember` kept — still live via My Week panel + Home team module. | trim function/type exports; DB table (`mos.weekly_updates`) untouched | `c8c1d28` |
| `src/pages/ops-page.tsx` + `.test.tsx` | `router.tsx` has zero import; `/ops`, `/ops/new`, `/ops/:id/edit` are all `<Navigate to="/">` (Step 5 Home is the successor surface for "needs attention"). | delete | `27126f7` |
| `src/pages/ops-add-form.tsx` + `.test.tsx` | Sole non-test importer was `ops-page.tsx`. | delete | `27126f7` |
| `lib/db/ops-log.ts`: `listLogEntries`/`addLogEntry`/`editLogEntry`/`archiveLogEntry`/`unarchiveLogEntry`/`getLogEntry` + `LogFilters`/`CreateLogEntryInput`/`EditLogEntryInput` | Grep: zero callers left once `ops-page.tsx`/`ops-add-form.tsx` are gone. `getTodayOpsSummary` kept — still live via My Week panel. | trim function/type exports | `27126f7` |
| `lib/db/ops-log.types.ts` | Every type (`LogEntryRow`, `LogOrigin`, `LogEventType`) was consumed only by the functions just removed. | delete | `27126f7` |
| Stale comment in `dev-views-page.tsx` referencing `OpsAddForm`'s `useParams()` convention | Comment pointed at a file this sweep deletes. | reword | `27126f7` |
| Stale comment in `dev-views.spec.ts` referencing `ops-log-add.spec.ts` / `weekly-update-submit.spec.ts` | Comment pointed at two files this sweep deletes. | reword | `23b9334` |

**Cross-check performed for every item above:** `shell/retirement.test.tsx` (the retirement oracle)
still passes unmodified — it already asserted the *entry points* are gone (destinations, ⌘K, Home
links, the `/updates` redirect); this sweep proves the underlying *component/DAL* code is gone too,
which the oracle didn't (and doesn't need to) assert directly.

**"RACI remnants"** (named in the task brief) — investigated, nothing to remove. There is no retired
RACI *page*; `raci-member.ts`/RACI columns on tasks (Responsible/Accountable/Consulted/Informed) are
live Tasks functionality, not a retired MOS-era screen.

## e2e disposition

All 5 were already stubbed `test.skip(true, '…successor lands in step N')` with no test body left to
rewrite. Disposition below — delete vs. un-skip+rewrite decided per the journey's real-world GOAL,
not just its route.

| Spec | Original goal (pre-stub, via `git log`) | Successor exists? | Disposition | Why |
|---|---|---|---|---|
| `AC-305-cascade.spec.ts` | Member opens Work → Cascade nav item, sees the org objective ladder, narrows to "Mine". | No direct equivalent — the Cascade *page* is gone; catalog re-home (`/work/objectives`, `/work/projects`) is an admin/manager governance screen, not an "everyone" ladder view. | **Delete** | `docs/specs/catalog-rehome.spec.md` §1 explicitly says this deletion is Step 11's job and explicitly says "Any new e2e journey… not modified here." The successor surface (`/work/objectives`) already has a curated e2e (`AC-020-catalog.spec.ts`); the grouping-by-objective/work-line behavior lives in Tasks and is covered at the unit layer (`cascade-d1.test.tsx`, `cascade-d4.test.tsx`). |
| `weekly-update-submit.spec.ts` | Member writes + submits a weekly update; manager sees it. | No — Signals capture directly (no draft/submit lifecycle). | **Delete** | Given as the explicit worked example in the task brief. |
| `weekly-update-reopen.spec.ts` | Reopen a submitted update, edit, resubmit; manager sees the revision. | No — same object as submit (the draft/submit/reopen lifecycle), which Signals does not have (Signals use correction/retraction, a different interaction model per `docs/adr/0050-…`). | **Delete** | Sibling of `weekly-update-submit`; same retired object, same "no successor" reasoning. |
| `ops-log-add.spec.ts` | Add a manual floor-log entry; it appears in the feed. | No — manual entry is retired outright (replaced by structured Café occurrence checks, Step 6/7 — a fundamentally different object, not a free-form log). | **Delete** | `/ops/new` now redirects to `/`; there is no "add a manual log entry" surface anywhere in the app to rewrite this journey onto. |
| `ops-log-needs-attention.spec.ts` | Needs-attention entry → My Week ops strip amber → archive clears it. | Partial — Home's attention brief (failed-checks lane) is the spiritual successor for *surfacing* something needing attention, but `docs/specs/home-proper.spec.md` §8 **explicitly forbids adding a new Home e2e** for this ("a duplicate Home e2e would not test anything F3 doesn't… add at most one assertion to F3 if a gap, never a new journey"). | **Delete** | Per the Home spec's own binding guidance, the attention-brief GOAL is already covered by the curated F3 (find-overdue-work, Step 3) + 15 unit ACs (AC-501..515, `home-page.test.tsx`/`attention-brief.test.tsx`). Writing a new e2e here would violate that guidance, not honor "keep the goal." |

`e2e/helpers/weeklyUpdates.ts` deleted — its only consumers were the two deleted weekly-update
specs (grep confirmed zero other importers). `e2e/fixtures/tasks.ts`'s `CASCADE` fixture and its
`global-setup.ts` seeding step were **kept** — `e2e/AC-230.spec.ts` (live, unrelated to the retired
Cascade page) depends on that seeded data and explicitly isolates itself from it in `beforeAll`.

## Rules-note (removal step — applicable rules)

This is a removal step (no UI/behavior change); the applicable bar is narrower than a build step's
full Rules 1–12 checklist:

- **No dead links.** `router.tsx`'s redirect stubs (`/updates` → `/work/signals`, `/ops`/`/ops/new`/
  `/ops/:id/edit` → `/`, `/work/cascade` → `/work/tasks`) are unchanged and still resolve — this
  sweep deletes the retired *page components*, never the redirects that point *at* their successors.
- **No orphan i18n.** `messages.test.ts`'s `AC-I01` (en/id key-set parity) passes; the 24 keys removed
  (22 `cascade.*` + `nav.updates` + `nav.dailyLog`) had zero remaining consumers, verified by grep
  before each deletion.
- **Retirement tests still green.** `shell/retirement.test.tsx` (4/4) passes unmodified — the
  entry-point assertions it owns (no nav/⌘K/Home entry point, `/updates` redirects) were already
  proven by steps 2–5; this sweep proves the code behind those entry points is gone too.

## Verdicts

<!-- Fill one verdict line per REQUIRED review before running pre-merge-check.sh.
     Accepted: PASS SHIP FIX-THEN-SHIP   Blocking: REWORK FAIL STILL-FAILING
     Required always: spec, code-quality. Required (UI changed): design. Required (schema/RLS changed): security. -->

- spec: APPROVE — spec-reviewer (opus), 2026-07-17. Completeness + preservation verified in BOTH
  directions (nothing retired remains; every deliberate survivor intact, justifications independently
  checked); all 5 e2e deletions endorsed against the owning specs; DB preservation law honored.
- code-quality: APPROVE — same reviewer. Deletion hygiene clean; one LOW nit (orphaned vi.mock keys
  in 4 live test files) FIXED by the Director post-review (commit 83facfe, 65 tests green).
- design: N/A — no `.tsx`/`.css` behavior change (deletions + a `StatePill` import-path fix only;
  `home-page.css` comment-only edit). Owner's final visual/regression pass (per the master plan's
  "owner gate: final visual/regression pass" for this step) still applies at the Director level.
- security: N/A — no auth/RLS/schema path touched; `mos.weekly_updates` and `ops.log_entries` tables
  and their migrations are untouched (data preservation is law).

## Gates (fresh, this pass)

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS (0 errors) |
| `npm run lint -- --max-warnings=0` | PASS (0 errors/warnings, incl. `lint:css`) |
| `npm test` (Vitest, full suite) | PASS — 271 files / 2712 tests, 0 failures |
| `shell/retirement.test.tsx` | PASS (4/4) |
| `bash scripts/pre-merge-check.sh` | <!-- run by the Director before merge --> |

No pgTAP required (no schema/RLS touched). No new Playwright run needed for the deleted specs
(deleted, not un-skipped) — `AC-230.spec.ts`'s live dependency on the `CASCADE` fixture was checked
by inspection (fixture-seeding code untouched), not by a live Playwright run in this sandbox slice.

## What still exists on purpose

- **`mos.weekly_updates` and `ops.log_entries` tables + their migrations** — untouched. Data
  preservation is law (task brief, binding). `ops.log_entries` is also actively read/written by the
  live Café module (kitchen logs, `origin='kitchen'`) — it is shared infrastructure, not exclusive to
  the retired Daily Log screen.
- **`src/pages/my-week.tsx` (`MyWeek`) + `my-week.test.tsx` + `my-week.hidden.test.tsx`** — NOT
  deleted, despite having zero route in `router.tsx` (HomePage replaced it as the index route in
  Step 5). This is a **deliberate, documented decision**, not orphaned dead code:
  `docs/specs/home-v1.spec.md` §8 states *"My Week component survives. The `<MyWeek />` page export
  stays, kept as a thin wrapper around `<MyWeekPanel />` so existing tests… remain green (ADR-0019 D2:
  'component survives')."* Deleting it would contradict a standing, named ADR decision — out of this
  sweep's removal-only mandate, which targets code whose retirement was itself decided (weekly
  update/daily log/cascade), not code a *different* decision chose to keep. Flagged here rather than
  touched.
- **`getMyUpdate`/`listTeamUpdates` (weekly-updates DAL) and `getTodayOpsSummary` (ops-log DAL)** —
  kept; they back the surviving My Week panel (via the kept `MyWeek` page) and Home's manager Team
  module (`TeamModule` in `my-week-panel.tsx`, gated by `SHOW_WEEKLY_UPDATES && isManager`, not by
  `hideLegacyCadenceCards`). This is genuinely live code for managers on Home today, not orphaned.
- **`e2e/fixtures/tasks.ts`'s `CASCADE` fixture + its `global-setup.ts` seeding** — kept; `AC-230.spec.ts`
  (a live, unrelated Tasks-grouping journey) depends on the seeded rows and explicitly isolates
  itself from them.
- **Docs** — nothing under `docs/` was touched other than this ledger, per the task brief
  ("superseded ≠ deletable applies to DOCS, never delete docs/"). Historical plan/spec/review docs
  that still mention the retired specs by name (`docs/plans/2026-07-06-work-spine.md`,
  `docs/specs/catalog-rehome.spec.md`, `docs/reviews/claude-redesign-buildout-completion-vdrd17-step8.md`,
  etc.) are left as historical record.

## Deferred / left alone (not this sweep's job)

- **`docs/reviews/…step10.md`'s Rule-12 copy nit** ("Events sub-copy's 'collection…connected' jargon
  — plain-language rewrite routed to the step-11 sweep") was noticed but **not actioned** here — it
  is a copy/wording change (a feature-adjacent edit), and this task's brief scopes Step 11 strictly
  to removal of retired-screen code + parked-e2e disposition + stale-link/import cleanup. Flagging
  for the Director to route explicitly (own issue or fold into the final visual pass) rather than
  silently expanding this sweep's diff.
- **`WeeklyUpdateStrip`/`OpsStrip`'s internal `<Link to="/updates">` / `<Link to="/ops">`** inside
  `my-week-panel.tsx` (only rendered when `hideLegacyCadenceCards` is false, i.e. only via the
  deliberately-kept, unrouted `MyWeek` page) were left pointing at the redirect stubs rather than
  retargeted straight at `/work/signals` / `/`. Both routes still resolve correctly (one redirect
  hop, not a dead link) — retargeting them is a behavior-preserving micro-optimization, not a
  removal, and out of scope for a REMOVAL-ONLY step.
