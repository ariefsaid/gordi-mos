# Wave-2 COMPLETION — green the Task-record rework + finish OD-63 canonical page. implementer, TDD.

A prior run did the bulk of wave 2 (raci-card→task-ownership-card, Mark complete, typed ownership)
then stopped mid-slice with **7 failing task tests** and OD-63 possibly incomplete. It's WIP-committed
at HEAD (4e4a952). Finish it: make ALL tests green and complete OD-63. Branch `feat/redesign-buildout`
(already checked out — no git checkout). Commit per coherent change; never push.

## READ FIRST
`docs/plans/briefs/s13-remediation-w2-brief.md` (the full wave-2 spec) + OD-REDESIGN-62 (typed Task,
RACI off Task surfaces, Mark complete) + OD-REDESIGN-63 (in-list click = split drawer; direct/new-tab/
refresh = full canonical page). `docs/experience-contract.md` Rules 4/6/7/11/12.

## The 7 failing task tests to green (BDD — the GOAL is the new typed-ownership contract)
Run `cd mos-app && npx vitest run src/components/tasks/ src/pages/task-detail.test.tsx` to see them.
Known failures:
- RecordDetailsPanel AC-R02 (Status/typed ownership/Dates/Checklist/completion)
- create form FR-250 (usable before lookups resolve)
- TaskDrawer AC-R06 (expand @≥1100px mounts `.record-2col` two-column record page)
- RI-2 ×2 (Person filter + groupBy=workline suppresses empty groups)
- RI-4 ×2 (caption counts open non-Done non-archived; no "and N unassigned")
- task-detail AC-070 (detail page: title/status/due/Team/typed ownership/checklist/activity/completion)
- task-detail AC-071 (inline status change updates pill, calls updateTaskStatus)

For each: the impl must satisfy the NEW typed-ownership + completion contract. Where a test still
asserts the OLD RACI grammar as its GOAL, update the assertion to the new contract (PIC/Supervisor,
Mark complete) — never weaken to pass, never restore RACI to a Task surface. Where the refactor
BROKE a still-valid behavior (RI-2/RI-4 grouping/caption, inline status), fix the impl.

## Finish OD-63 (canonical page mode) if not complete
In-list click → split drawer (keep). Direct URL / new-tab / refresh of `/work/tasks/:id` → the SAME
record rendered as a full standalone canonical page (not inside the table shell). Visible "Open full
page" escalation. Preserve `?view=`. Reuse the one renderer (`mode="panel"|"page"`), Rule 11. Add the
e2e: direct `/work/tasks/:id?view=overdue` opens full page; in-list click opens drawer.

## Gates (mos-app/): typecheck 0 · lint 0 · `npm test` FULL suite green · `npx playwright test` green.
Also confirm: NO visible "RACI"/"Owner (R)"/R·A·C·I on any Task surface; Mark complete completes a task.
Paste tails. End with: FIX-DONE
