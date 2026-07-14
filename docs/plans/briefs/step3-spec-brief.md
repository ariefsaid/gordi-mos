# Spec brief — Buildout step 3: Tasks re-home (feature-forge; spec-miner the existing DB-view first)

You are the spec author. Produce `docs/specs/redesign-tasks-rehome.spec.md`. Spec only — NO code.
This step RE-HOMES the already-shipped Tasks DB-view under the new /work/tasks route with saved-view
chips. It is mostly rewiring an existing surface — NOT a rebuild (Experience Contract Rule 11).

## READ FIRST
1. `docs/plans/2026-07-14-redesign-buildout.md` step 3 row + standing acceptance (visual diff every
   step; contract rules scored; F3 "find overdue work" is the curated e2e journey this step owns).
2. `docs/experience-contract.md` Rules 4 (canonical routes + URL state), 6 (one page anatomy),
   11 (component reuse — REWIRE TasksWorkspace, do NOT rebuild the table).
3. `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` — e7 OWNS the task-table
   grammar; the shipped `TasksWorkspace`/`TaskSurface` is the code-level canonical. Convergence owns
   the saved-view-chips-in-URL pattern (My/Team/Overdue/Follow-ups as `?view=` params).
4. The EXISTING Tasks DB-view to re-home (READ these — this is the spec-miner step, reverse-engineer
   the current behavior before specifying the rewiring): `mos-app/src/pages/TasksLayout.tsx`,
   `mos-app/src/components/tasks/{TasksWorkspace,TaskSurface,TaskDrawer,ViewTabStrip,GroupHeaderRow,useTasksViewPref}.tsx`,
   `mos-app/src/lib/db/tasks.ts`. Note how the current "Mine/RACI/All" tabs + Group/Unit/Status/Person
   filters work and how the split-view drawer + deep-link (/tasks/:id) work TODAY.
5. Step-2 routing already in place: `/work/tasks` renders the current Tasks page; `?view=` is not yet
   wired to saved views. `mos-app/src/router.tsx` (the /work/tasks route + /work/tasks/:id redirect).

## Scope
Re-home the shipped Tasks DB-view at `/work/tasks`. Saved views (My work / Team work / Overdue /
Follow-ups) become **URL query state** (`?view=mine|team|overdue|followups`), not the old tab UI —
Back/refresh/new-tab preserve the view + open record (Rule 4). The record drawer + canonical record
page (`/work/tasks/:id`) reuse the EXISTING TaskSurface/TaskDrawer (Rule 6/11). Follow-ups appears
ONLY as a saved view here (+ a Money queue entry later, step 9) — not a nav noun. The current
Group/Unit/Status/Person presentation controls stay but reflect the saved-view defaults.

IN SCOPE: the /work/tasks saved-view URL grammar, view→filter mapping, drawer/canonical-page URL
sync, follow-ups-as-saved-view. OUT OF SCOPE: any change to task schema/RLS, the TaskSurface editor
internals, Signal/occurrence work (steps 4/6). Do NOT rebuild the table or drawer.

## Conventions
EARS FR/NFR; AC-### Given/When/Then; each AC owned by ONE test at the lowest layer (component for
view→filter mapping; Playwright for the URL/back/refresh/deep-link journey incl. F3 overdue). Map
Rules 4, 6, 11 to ACs. Mark every existing component as REWIRE (with the exact seam) vs any new one
(justify per Rule 11 — there should be ~none; a thin `useTasksSavedView` hook mapping ?view→filter
is the likely only addition).

## Verify your own work
Confirm every file path exists (you have read access). Confirm the spec re-wires, never rebuilds.
List deviations. End with: SPEC-DONE
