# Wave 2b — fix ALL remediation code-review BLOCK findings. implementer, TDD. Fix all, nothing else.

The remediation code review (docs/reviews/feat-redesign-buildout.md § "Remediation (waves 1+2)")
BLOCKED. Fix every finding. Branch `feat/redesign-buildout` (already checked out — no git checkout).
Commit per fix; never push. TDD (assert the correct goal; never weaken; never restore RACI to a Task surface).

## CRITICAL
1. **Home MyTasksCard still shows RACI (OD-62 violation).** `mos-app/src/components/weekly/my-tasks-card.tsx`
   (mounted at `home-page.tsx:121`) still renders "Owner (R)", "Responsible or Accountable", R/A filtering,
   and the legacy +N grammar — a VISIBLE Task surface leaking RACI. Re-home it to typed **Team/PIC/
   Supervisor** (reuse the `TaskOwnershipCard`/typed grammar), OR hide the card. Update its tests
   (`my-tasks-card.test.tsx`) to the new typed goal (do NOT leave old RACI as the contract). Do NOT
   remove RACI from Objective/Project/Process (governance) surfaces.
2. **OD-63 page-mode detector bug.** `mos-app/src/components/tasks/task-page-mode.ts:20-64` captures
   `BOOT_DIRECT_RECORD_ID` once and ignores `{taskSurface:'panel'}`. After a DIRECT load of record X →
   SPA-navigate to the list → click X again, it wrongly renders PAGE mode instead of the split drawer
   (`tasks-layout.tsx:55-68`). Add a real SPA-vs-hard-navigation precedence so an in-list click ALWAYS
   opens the drawer; only a genuine direct/new-tab/refresh opens full page. Add a regression test:
   direct record → list → same-record click = drawer (not page); real refresh = page.

## IMPORTANT
3. **OD-61 incomplete.** Add the persistent phone `+` launcher (reuse the approved launcher grammar —
   do NOT invent a new one) so members have a thumb-reachable create; and move the overdue filter +
   clear control INSIDE the single "View options" control (all filters behind one control, Rule 8).
   Tests for both.
4. **i18n.** New OD-61/62/63 copy is hardcoded English in `task-ownership-card.tsx`, `task-drawer-header.tsx`,
   `tasks-workspace.tsx`, `tasks-toolbar.tsx`. Add EN+ID `useT` message keys (shape-identical) — ID
   locale must render the new grammar in Indonesian.
5. **Coverage.** `task-page-mode.ts` is 70.96% (<80% gate). Add deterministic unit tests for its
   boot-navigation branches.
6. **BDD cleanup.** `tasks-page.test.tsx:372-401,430-447` (+ my-tasks-card tests) still assert old RACI
   goals — re-specify to typed PIC/Supervisor; don't leave RACI as the Task UX contract.

## MINOR
7. Remove dead task-row RACI plumbing (`OwnerCellRaciMember[]`/`buildOthers`/`others`) from the TASK
   path (`tasks-workspace.tsx:302-318,547-559`, `tasks-table-body.tsx`, `mobile-grouped-cards.tsx`) —
   keep `OwnerCellRaciMember` only where the genuine legacy (non-task/governance) card still needs it.
   Update stale comments (removed column layout, old Mine/RACI toolbar).

## Gates (mos-app/): typecheck 0 · lint 0 · full `npm test` green · `npx playwright test` green ·
changed-code coverage ≥80%. Confirm NO visible RACI on ANY Task surface (incl. Home mini-card).
Paste tails. End with: FIX-DONE
