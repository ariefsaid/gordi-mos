# Review ledger — Step 6 "Occurrence-as-Tasks" (branch `claude/redesign-buildout-completion-vdrd17`)

Diff scope: the Occurrence-as-Tasks slice — Track A (`supabase/migrations/20260716000010..15*`,
`supabase/tests/{90..95}_process*.sql`), Track B (`mos-app/src/lib/db/processes*`,
`mos-app/src/lib/processes/occurrence-grouping*`, `mos-app/src/components/processes/*`, the B8
occurrence-caption render in `group-header-row.tsx`), Track C (this pass — wiring/e2e/gates, commits
`feat(occurrence): C1a` through `feat(occurrence): C3` on this branch). Spec:
`docs/specs/occurrence-as-tasks.spec.md`. Plan: `docs/plans/2026-07-16-occurrence-as-tasks.md`. ADR:
`docs/adr/0051-occurrence-as-tasks-schema.md`. This branch carries other concurrent steps (4/5/7/8/10
— see other commits interleaved in `git log`); **this ledger covers Step 6 only**. Full command:
`git log --oneline --grep='(occurrence):'`.

## Scope card (Step 6)

**In scope (built, this step):**
- **Process-definition layer, admin-less v1** (seeded by migration/seed, no in-app authoring):
  `mos.work_lines` governance delta (`business_unit_id`/`accountable_person_id`/
  `responsible_person_id`/`definition_version`), `mos.process_cadences` (manual/daily/weekly/monthly,
  WIB period keys), `mos.process_task_defs` (generated Task templates, job-function PIC binding,
  checklist steps).
- **Thin occurrence record + ambiguity queue**: `mos.process_runs`, `mos.process_run_pending_tasks`;
  `mos.tasks` provenance columns (`process_run_id`, `generated_from_task_def_id`).
- **The gated write RPCs** (all `SECURITY DEFINER`, cross-org-guarded, capability + Team-authorized,
  `revoke ... from public,anon,authenticated`): `mos.spawn_process_run` (idempotent Start — one Task
  per single-holder def, a pending row per zero/many-holder def, never a guess), `mos.resolve_pending_task`
  (human-choice materialization), `mos.complete_process_run` (deliberate human completion). Helpers
  `mos._function_holders` (org-walled job-function resolver) and `mos.can_start_process_for_team`.
- **Derived roll-up + due surface**: `mos.process_run_rollup` view (done/total/overdue/pending_unresolved/
  completion_pct, no stored counts) + `mos.due_process_runs()` (scheduler-free Start surface).
- **DAL** (`mos-app/src/lib/db/processes.ts`): `startRun`, `listDueRuns`, `listPendingTasks`,
  `resolvePendingTask`, `getRunRollup`, `listRunRollups` (Track C addition — batched), `listRunTasks`,
  `completeRun`.
- **Thin UI** (Rule 11 reuse — no parallel Task UI): `StartRunControl` mounted in the `/work/tasks`
  toolbar (self-gating on `process.start`); an **Occurrence** group-by dimension in the existing
  Tasks DB-view grouping generated Tasks under their run's caption (never the string "Process Run",
  FR-611) with a derived roll-up summary on the shared `GroupHeaderRow`; a "N to assign" affordance on
  an occurrence group opening `OccurrenceAssignDialog` → `PendingResolution` (candidate buttons for
  `reason='multiple'`, the full org picker for `reason='none'`).
- The AC-630 e2e journey (Start → grouped Task → pending → resolve → same-group Task), written and
  `--list`-verified; **live execution deferred to the Director** (§ below).

**DEFERRED (do NOT fail these in this review — explicitly out of Step 6, per spec §1/§10):**
- **Guided Process designer** (in-app authoring of cadence/task-defs/Standard steps) — OD-REDESIGN-13.
  v1 seeds definitions by migration/seed only (as `business_units`/`work_lines` already are).
- **Standards / Standard Steps / Checks / Exceptions / evidence / sign-off** quality loop —
  OD-REDESIGN-4/30/31.
- **Full OD-REDESIGN-41 manager-chain Supervisor resolution** — v1 resolves explicit → role-holder →
  process A → PIC-self (editable via Reassign, unchanged elsewhere).
- **Background/scheduled spawning** (pg_cron / VPS cron / edge scheduler) and **auto-materialize-on-read**
  — v1 is explicit idempotent Start over `due_process_runs()`; the RPC is the additive seam a scheduler
  would later drive (RATIFY-3).
- **RRULE / missed-window catch-up / backfill horizon** — not modeled (no auto-spawner to miss a window).
- **Per-Team Process adoption + independent versioning** — OD-REDESIGN-54 (`process.adopt` capability
  reserved, seeded to admin, unwired).
- **Café kitchen-log → occurrence bridge** (`ops.kitchen_logs.process_run_id`) — **Step 7** (ADR D11).
- **Task BU → Team re-home** — generated Tasks keep `business_unit_id` derived from the owning Team's BU.
- **Auto-completion of a run** — `complete_process_run` stays a deliberate human act (FR-610).
- **Run cancellation workflow; occurrence spawn notifications.**

## Rules 1–12 checklist (unfilled — reviewers fill this in)

| Rule | Compliant? | Notes |
|---|---|---|
| 1 — one job per rail item | | No new rail item — Occurrence surfaces inside the existing Tasks destination. |
| 2 — three-layer boundary (domain → UI family → destination) | | `mos.process_runs`/`process_run_pending_tasks` are domain-only; the UI family is the shipped Tasks DB-view (grouping + header), never a second family. |
| 3 — rail/surface budget caps | | No new surface added — StartRunControl + OccurrenceAssignDialog mount inside the existing `/work/tasks` surface. |
| 4 — canonical routes + URL state | | Occurrence group-by is a `useTasksViewPref`-persisted client pref (mirrors status/owner/bu/workline) — no new route; `?record=`/`?q=` semantics untouched. |
| 5 — exactly one `aria-current="page"` | | Unaffected — no nav change. |
| 6 — one page anatomy per route (no second drawer host) | | `OccurrenceAssignDialog` is a hand-rolled `role="dialog"` overlay (mirrors `ConfirmArchive`), not a second drawer host; the task drawer is unchanged. Reviewer to confirm no anatomy collision. |
| 7 — verb+object action grammar (no bare `Create`) | | "Start run" (B6, unchanged); "N to assign" is a count-affordance in the `overdue`-subtotal grammar family, not a create verb — reviewer to weigh whether that's acceptable non-verb chip grammar (mirrors the existing "N overdue" pattern). |
| 8 — capture-first disclosure (mobile ≤390px) | | Not explicitly re-verified on phone width by Track C — the Start-run control + group header render inline in the existing responsive Tasks surface (desktop-table / mobile-card already responsive); no dedicated phone pass was run this track. |
| 9 — responsive disclosure order | | Same as Rule 8 — inherited from the existing Tasks responsive layout, not independently re-verified. |
| 10 — extension test (new Module ships without a new rail root/anatomy) | | Passes structurally — occurrence grouping is an *addition* to the existing Tasks grouping switch, not a new anatomy. |
| 11 — component reuse | | `groupTasksByOccurrence` (B5), `GroupHeaderRow` (B8/C2, same header — no divergent header component), `PersonPicker` reused inside `PendingResolution` (B7), `TaskListRow`/`listTasks` reused for generated Tasks (no parallel Task fetch/render). |
| 12 — usable by a high-school graduate, no training | | Job sentences per spec §1 ("Start today's recurring work and see it as tasks someone owns" / "Two people could own this — you pick who") — reviewer to assess the built copy against this bar. |

## Verdicts

<!-- Fill one verdict line per REQUIRED review before running pre-merge-check.sh.
     Accepted: PASS SHIP FIX-THEN-SHIP   Blocking: REWORK FAIL STILL-FAILING
     Required always: spec, code-quality. Required (UI changed): design. Required (schema/RLS changed): security. -->

- spec: APPROVE — spec-reviewer (opus), 2026-07-17. AC-601..630 all owned at correct layer; pgTAP 95/689 live-verified; FR-611 + OD-41 fail-closed positively asserted; ratify list accurate. Security pass + live AC-630 noted as Director-owned merge gates.
- code-quality: APPROVE (fix-then-ship) — code-quality-reviewer (opus), 2026-07-17. 0 Critical. IMPORTANT-1 silent resolve/start mutation failures — FIX WAVE PENDING; IMPORTANT-2 tasks-workspace at 836 lines → useOccurrenceGroups extraction directed; minors: rollup silent-catch warn, PersonPicker onClose, due_process_runs scale note.
- design: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes> (4-lens review — `*.tsx`/`*.css` changed this step)
- security: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes> (**MANDATORY**, spec §7 — spawn RPC privilege/injection, `_function_holders` tenancy, RLS seams, `org_id` on generated Tasks, resolve/complete gates, capability grants; any Critical/High blocks merge)

## Gates (Track C pass, this branch)

| Gate | Status |
|---|---|
| `cd mos-app && npm run typecheck` | PASS — 0 errors |
| `cd mos-app && npm run lint -- --max-warnings=0` | PASS — 0 (eslint + stylelint) |
| `cd mos-app && npm test` (Vitest) | PASS — 271 files / 2842 tests (full suite, incl. this step's new/extended tests) |
| `cd mos-app && npx playwright test --list` | PASS — 58 tests / 35 files listed clean, incl. `AC-630-start-occurrence.spec.ts` |
| `gh workflow run integration.yml --ref <branch>` (pgTAP suite 90–95 + definer-revoke lint + live-stack e2e incl. AC-630) | **DEFERRED TO DIRECTOR** — no Docker / no live Supabase stack in this Track-C sandbox (per the dispatch brief). Track A's local verification is parse/apply-only; live pgTAP + the live AC-630 run happen in CI post-merge. |
| `bash scripts/pre-merge-check.sh` | **NOT YET RUN** — expected to fail until the Verdicts above are filled by the review battery |

## Deferred-to-Director live checks (explicit list)

Everything below requires the live self-hosted Supabase stack / CI `integration.yml`, unavailable in
this Track-C sandbox:
1. `gh workflow run integration.yml --ref claude/redesign-buildout-completion-vdrd17` → `gh run watch`:
   - pgTAP suite `90_process_substrate.sql` .. `95_process_rollup_authz.sql` (AC-601..613) plus the
     full pre-existing suite (no regression).
   - Definer-revoke lint (`spawn_process_run`, `resolve_pending_task`, `complete_process_run`,
     `_test_seed_process_tree` all `revoke ... from public,anon,authenticated`).
   - The live-stack e2e run of `e2e/AC-630-start-occurrence.spec.ts` against a real Postgres + RLS +
     PostgREST stack (this is the actual cross-stack proof — the spec explicitly requires it run for
     real, not mocked).
2. The mandatory security-auditor pass (spec §7) — six numbered items (spawn RPC privilege/injection,
   `_function_holders` tenancy, RLS seams, `org_id` tenancy on generated Tasks, resolve/complete gates,
   capability grants) — any Critical/High blocks merge.
3. `bash scripts/pre-merge-check.sh` after the Verdicts section above is filled.

## Ratify before merge

**Spec RATIFY-1..10** (`docs/specs/occurrence-as-tasks.spec.md` §8 — as-built, all shipped "as stated"
per the spec's own recommendation; flagging here for the owner's grill/walkthrough sign-off):
1. **Process-definition storage** — extended `mos.work_lines` (not a separate `mos.process_definitions`
   table). Shipped as recommended.
2. **Cadence kinds + period grain** — `manual/daily/weekly/monthly` with WIB period keys (daily
   `YYYY-MM-DD`, weekly ISO Mon-week, monthly `YYYY-MM`); RRULE deferred. Shipped as stated.
3. **Spawn trigger model** — explicit human "Start run" over `due_process_runs()`; no cron/scheduler in
   v1. Shipped as recommended (fail-closed, human-in-the-loop).
4. **Supervisor resolution depth** — shallow (explicit → role-holder → process A → PIC-self), editable.
   Shipped as recommended.
5. **`process.start` capability grants** — ops_lead + admin only, no `member` in v1. Shipped as
   recommended (default-deny broad); Café retrofit (Step 7) decides a rostered `member` "today's
   opening" grant.
6. **Run read visibility** — `mos.process_runs` org-readable. Shipped as recommended.
7. **Ambiguity handling model** — zero/many holders ⇒ `process_run_pending_tasks` human-choice row,
   never a guessed Task. Shipped as stated (fail-closed).
8. **Idempotency grain** — `unique(org_id, work_line_id, owning_team_id, period_key)` + `on conflict do
   nothing`. Shipped as stated.
9. **Completion semantics** — human `complete_process_run`, no auto-complete. Shipped as stated.
10. **Checklist-vs-Task boundary (OD-12)** — single-operator steps live in `process_task_defs.
    checklist_items` → materialized `task_checklist_items` on one Task. Shipped as stated.

**Track A deviations** (as reported by the dispatch brief; Track C did not re-verify these against
live pgTAP — flagged here per the brief for the owner/reviewer record):
- pgTAP test-file renumbering: the plan's task numbering (`90_process_substrate.sql`..) landed as
  `91_process_substrate.sql`..`95_process_rollup_authz.sql` (91–95, not 90–94) — the pre-existing
  Signal-v1 suite already occupies `90_signal_create_rpc.sql`; Track A renumbered forward to avoid a
  collision. File contents/AC coverage unchanged, only the leading number shifted.
- Demo seed's ambiguity role is held by **two** dev personas (`Café Opener (demo)` → Cahya + Krishna),
  not the spec's abstract "zero or many" — a deliberate concrete choice so the dev/e2e demo exercises
  the `reason='multiple'` path (the `reason='none'` vacant path is exercised by a separate task-def in
  the pgTAP fixture, `mos._test_seed_process_tree`, not the dev seed).
- `sandbox-pg.sh` / `config.toml [db.seed] sql_paths` seed-list ordering: `seed.dev-processes.sql` was
  inserted after `seed.dev-signals.sql` (needs people/BUs/Teams from that file) and before
  `seed.dev-auth.sql` — confirmed present in `supabase/config.toml` at HEAD.

**Track B deviations** (as reported by the dispatch brief):
- `SpawnResult` fields are **snake_case in the RPC response, camelCase-free in the TS type**
  (`run_id`/`created`/`pending`/`idempotent`) — the plan's B1 type freeze already specified this
  exact shape; Track C confirms `mos-app/src/lib/db/processes.types.ts` matches it verbatim (the spec
  prose's `{runId, created, pending}` wording in AC-620 was the informal description, not a literal
  field-name mandate — the frozen type contract is authoritative per the plan's own "no-placeholder"
  rule).
- `StartRunControl`'s "Start run" button uses `aria-describedby` (not a per-row unique accessible name)
  to attach the process+Team context to the shared "Start run" label — refined from a naive
  "Start run — Café Opening / HQ Operations" verbose name so a multi-row due list doesn't repeat long
  names into the button's accessible name; screen-reader users still get full context via the
  `aria-describedby` region. Confirmed present in `start-run-control.tsx`; Track C's C1 mount test
  asserts the accessible name stays the bare "Start run" (Rule 7).

**Track C (this pass) deviations / decisions:**
- The plan's C1 says "extend `mos-app/src/pages/tasks-page.test.tsx`" as if it tests a `TasksPage`
  host component. That host was deleted in an earlier redesign wave (per the test file's own header
  comment) — the file actually renders `TasksWorkspace` directly and is the real owner of every Tasks
  DB-view behavior AC. Track C extended it as-is (same file, same convention already established by
  the file), not a new `tasks-page.tsx`.
- Added `listRunRollups(runIds: string[])` to `processes.ts` (not named in the B-task list, which only
  specified singular `getRunRollup`) — a small Track-C-authored batched read (`.in('process_run_id',
  runIds)`) so the Occurrence group-by fetches one roll-up query for N rendered groups instead of N
  `getRunRollup` calls. Fully unit-tested (`processes.test.ts`).
- Added `OccurrenceAssignDialog` (`mos-app/src/components/tasks/occurrence-assign-dialog.tsx`) — the
  plan describes "mount the pending-resolution surface" without naming a host component; Track C
  introduced this thin dialog (mirrors `ConfirmArchive`'s hand-rolled `role="dialog"` overlay idiom)
  to list every unresolved pending row for a clicked occurrence, each rendered via the existing
  `PendingResolution` (B7) — no second resolution UI (Rule 11).
- Ad-hoc Tasks under Occurrence group-by: the plan/spec don't specify UI treatment for Tasks with no
  `process_run_id` when the viewer groups by Occurrence. Track C surfaces them in a trailing
  "Not part of a recurring occurrence" catch-all group (never silently disappear), consistent with
  the existing OD-P3-6 "groups always shown" precedent (e.g. the work-line groupBy's "No work-line"
  trailing group).
- The typing seam (`TaskListRow` lacking `process_run_id`/`generated_from_task_def_id`) is resolved by
  making both fields **optional** on `TaskRow` (`tasks.types.ts`) and normalizing
  (`row.process_run_id ?? null`) at the ONE call site that needs the stricter `OccurrenceGroupableTask`
  shape (`tasks-workspace.tsx`'s occurrence-groups branch) — no `as`/type-cast anywhere. Proven by a
  dedicated compile-fidelity test (`tasks.types.test.ts`) asserting both an ad-hoc-task literal (no
  such keys) and a generated-task literal satisfy `TaskRow`, and that the normalized shape satisfies
  `OccurrenceGroupableTask` with no cast.
- AC-630 e2e uses the **existing** `MANAGER` fixture (Dewi Director — `admin` access role ⇒
  `process.start`, active member of the `hq_operations` Team per `seed.dev-signals.sql`) rather than
  adding a new dedicated fixture user — she already satisfies "an authorized lead with `process.start`
  + owning-Team membership" the plan calls for. The spec's own seeded "Café HQ daily opening" occurrence
  (`seed.dev-processes.sql`) supplies both PIC-resolution paths (single-holder + two-holder ambiguous)
  needed by the journey.
- AC-630 self-cleans via inline, tightly-scoped SQL (delete-then-recreate the occurrence for
  `work_line_id + owning_team_id` only, mirrors `AC-524-follow-up.spec.ts`'s embedded-`sql()` pattern)
  rather than adding a step to `e2e/global-setup.ts`. Chosen to keep the blast radius to this one
  process+Team (never touches other org/task/signal e2e fixtures) and because Track C cannot verify a
  `global-setup.ts` change against a live stack in this sandbox — a scoped, spec-local cleanup is safer
  to hand off unverified than a shared-setup-file edit.

## Deferred / tracked debt

- **No dedicated phone-width (≤390px) pass on the Start-run control / occurrence group header this
  track** (Rules 8/9 above) — both inherit the existing Tasks responsive layout (table↔card) but
  Track C did not independently screenshot/verify the phone card presentation of an occurrence group
  header or the assign dialog at narrow width. Recommend design-reviewer's 4-lens pass cover this.
- **`OccurrenceAssignDialog` has no focus-trap / Escape-to-close** (mirrors `ConfirmArchive`, which
  also has neither) — consistent with the existing hand-rolled dialog idiom in this codebase, not a
  new gap Track C introduced, but flagged since a second occurrence multiplies the surface area if a
  future pass adds a real modal primitive.
- **`listRunRollups` failure is silent** (`.catch(() => {/* keep previous rollups */})`) — if the
  roll-up read fails, the occurrence group header falls back to the plain count/overdue grammar
  (`occurrenceRollup: undefined`) rather than surfacing an error; the Tasks list itself still loads
  and functions. Deliberate (a roll-up-fetch failure shouldn't block the whole page), flagged for the
  code-quality pass to confirm this degrade-gracefully choice is acceptable.
