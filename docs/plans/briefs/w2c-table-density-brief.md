# Wave 2c — desktop Tasks table density (design re-review BLOCK, last steps-1–3 finding). implementer, TDD.

The design re-review found ONE remaining in-scope regression: the desktop Tasks table at 1280px shows
10 columns (Task/Status/PIC/Supervisor/Project-Process/Objective/Team/Due/Source/Activity = ~1284px in
a 994px viewport), pushing the **decision-critical Due column off-screen**. The e7 reference
(`http://localhost:8766/e7-prototype.html#/work`) fits a calm decision table
(Title/Ownership/Supervisor/Status/Due) at 1280px. Reviewer picked **Option A (recommended)**: condense
to e7's priority columns; move optional columns into the record/drawer. No owner decision needed —
implementation choice within OD-61..64.

Branch `feat/redesign-buildout` (already checked out — no git checkout). Commit per change; never push. TDD.

## The fix (Option A)
At the desktop DB-view (≥~1100px), show only the **priority decision columns**: Title · Ownership (PIC)
· Supervisor · Status · Due — all visible in the first viewport (no horizontal clip of Due). Move the
optional columns — **Project/Process, Objective, Source, Activity** — OUT of the default table: into
the record drawer/full page (where the typed Task already shows them) and/or behind an explicit,
calm column-options toggle. Keep the typed Task contract (OD-62) — this is column PRIORITY, not
removing data. Do NOT rebuild the table (Rule 11 — `TasksWorkspace`/`TasksTableBody` config change).
Reuse existing drawer for the moved fields (they're already there).

## Verify
Component/e2e test: at 1280px, the Tasks table's Due column is within the content width (not clipped);
the optional fields remain reachable in the drawer/full page. Drive the app + e7 mockup to compare.

## Gates (mos-app/): typecheck 0 · lint 0 · full npm test green · npx playwright test green. Paste tails.
Confirm at 1280px: Due visible in first paint; table width <= content width (no Due clip). End: FIX-DONE
