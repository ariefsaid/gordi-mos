# Build brief — Buildout step 3: Tasks re-home (implementer, TDD)

Execute `docs/plans/2026-07-15-redesign-tasks-rehome.plan.md` task-by-task via TDD. Branch
`feat/redesign-buildout` (already checked out — no git checkout/switch). Commit per task; never
push/PR/merge.

## READ FIRST
- `docs/plans/2026-07-15-redesign-tasks-rehome.plan.md` — THE PLAN (13 tasks). Every exact change +
  the saved-view→filter mapping table are in it. Honor its deviations (team = label-level only this
  step; followups no discriminator this step — wire the chip, don't invent schema).
- `docs/specs/redesign-tasks-rehome.spec.md` — the ACs.
- `docs/experience-contract.md` Rule 11 — the ONLY new file is `use-tasks-saved-view.ts`. Everything
  else (tasks-layout, tasks-workspace, tasks-toolbar, task-drawer, task-surface, lib/db/tasks) is
  REWIRED/REUSED — do NOT rebuild the table, drawer, or DAL.

## Key contract (Rule 4 URL state)
`?view=mine|team|overdue|followups` drives the saved view; opening a record + the view must survive
Back / refresh / new-tab. Preserve `location.search` on row-open, keyboard open/close, `+ New task`,
and group-header `+ Add task` (the plan lists the exact seams). Reuse the existing drawer/deep-link.

## Discipline (connection dropped ~5× this session)
TDD (failing test first, never weaken to pass). COMMIT AFTER EACH TASK. If you must stop, commit what
compiles + stop. Do NOT touch task schema/RLS or the TaskSurface editor internals.

## Gates before done (from mos-app/)
`npm run typecheck` (0) · `npm run lint` (0) · `npm test` (green) · `npx playwright test` (green,
incl. the new F3 overdue journey + existing tasks e2e still passing). Paste each tail.

## Report
Tasks landed, gate tails, any plan step not completed + why, confirm only 1 new file. Verify against
the plan's FR/AC traceability. End with: BUILD-DONE
