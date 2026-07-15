# Remediation wave 2 — Task record rework (OD-62) + canonical page mode (OD-63). implementer, TDD.

The DELICATE slice: it changes the SHIPPED Task renderer + domain-surface semantics — a deliberate,
owner-ratified exception to "rewire, don't rebuild" (OD-62). Work carefully; keep the shared renderer
ONE renderer (Rule 11 still applies — extend it, don't fork a second Task editor). Branch
`feat/redesign-buildout` (already checked out — no git checkout). Commit per coherent change; never push.

## READ FIRST
- `docs/decisions.md` OD-REDESIGN-62 (typed Task, RACI removed from Task surfaces → Objectives/
  Projects/Processes only; + visible "Mark complete") + OD-REDESIGN-63 (record URL: split drawer on
  in-list click, full canonical page on direct/new-tab/refresh — BOTH).
- `docs/reviews/feat-redesign-buildout.md` § "Design/UX review — steps 1–3" (the Task-record + record-URL
  findings + evidence).
- `docs/jtbd.md` anchor A4 (RACI belongs on Objective/Project/Process; a Task carries PIC + Supervisor).
- `docs/experience-contract.md` Rules 4, 6, 7, 11, 12.
- The shipped Task surfaces: `mos-app/src/components/tasks/task-surface.tsx` (the editor),
  `tasks-workspace.tsx` / the table `OWNER (R)` column, `task-drawer.tsx`, `mos-app/src/lib/db/tasks.ts`,
  `mos-app/src/router.tsx` (the `/work/tasks/:id` route + panel/page).
- Reference (drive them): e7 record panel `http://localhost:8766/e7-prototype.html` and convergence
  record `http://localhost:8134/` — typed Task with Team/PIC/Supervisor/Due/source + **Mark complete** +
  Reassign PIC. Match that grammar, adapted to MOS tokens.

## Change 1 — Typed Task record, RACI removed from Task surfaces (OD-62)
- Task record + the table's ownership column show **Team · PIC · Supervisor · Due · source/provenance**
  — NOT "OWNERSHIP (RACI)" / R·A·C·I pills / "Owner (R)". Remove RACI editing from the TASK surface.
- Add a visible **"Mark complete"** primary action (verb+object, Rule 7) + a clear **Reassign PIC** path.
- **Do NOT remove RACI from Objective/Project/Process surfaces** — RACI stays there; it only leaves Tasks.
- Keep it ONE Task renderer (extend `task-surface.tsx`, don't fork). Update the many existing Task tests
  per BDD: the GOAL changes (RACI→PIC/Supervisor + completion) — update the journey/assertions to the
  correct new contract; never weaken to pass, never leave a test asserting the old RACI grammar.

## Change 2 — Canonical page mode on direct open (OD-63, Rule 4)
- In-list click → the existing split drawer (UNCHANGED — keep it, owner wants fast triage).
- Direct URL / new-tab / refresh of `/work/tasks/:id` → the SAME record content rendered as a standalone
  full canonical PAGE (not inside the table+drawer shell). Visible "Open full page" escalation from the
  panel. Preserve `?view=` on all of it (Rule 4). Reuse the one renderer in `mode="panel"|"page"`.

## OUT OF SCOPE: Home attention brief (Step 5), Signals (Step 4), Café rename (Step 7), demo fixtures.
Do not touch. RACI on governance objects stays.

## Gates (mos-app/): typecheck 0 · lint 0 · npm test green (update Task tests to new contract) ·
npx playwright test green (add: direct /work/tasks/:id opens full page; in-list click opens drawer;
Mark complete completes a task; no RACI text on a Task surface). Paste tails.

## Verify your own work against OD-62/63 + the reference mockups. End with: FIX-DONE
