# Plan brief — Buildout step 3: Tasks re-home (eng-planner)

Turn `docs/specs/redesign-tasks-rehome.spec.md` into a no-placeholder plan →
`docs/plans/2026-07-15-redesign-tasks-rehome.plan.md`. Plan only, no code.

## READ FIRST
- `docs/specs/redesign-tasks-rehome.spec.md` — the spec (honor its 3 deviations: ViewTabStrip→
  tasks-toolbar seam; team view data-limited; followups no task discriminator this step — wire the
  chips, scope what data exists, don't invent schema).
- `docs/experience-contract.md` Rules 4/6/11.
- The real files to rewire: `mos-app/src/pages/tasks-layout.tsx`,
  `mos-app/src/components/tasks/{tasks-workspace,tasks-toolbar,task-drawer,task-surface,use-tasks-view-pref}.tsx`,
  `mos-app/src/lib/db/tasks.ts`, `mos-app/src/router.tsx`. Read enough to plan precise seams.

## Output plan
- Exact file list, REWIRE vs NEW per Rule 11 (the only new file should be the thin
  `use-tasks-saved-view.ts` hook mapping `?view=` → the existing scope/filter the workspace already
  supports; everything else REWIRED).
- 2–5 min tasks; each: exact file, exact change, FR/AC it satisfies, verify command. TDD order.
- The saved-view→existing-filter mapping table (mine/team/overdue/followups → which existing
  segment/filter the shipped workspace already has).
- URL-sync tasks: `?view=` + open-record in the URL, Back/refresh/new-tab preserve (Rule 4), reusing
  the existing drawer/deep-link mechanics — do NOT re-implement the drawer.
- The F3 "find overdue work" Playwright journey (the curated e2e this step owns).
- Risk/rollback.

## Verify your own work
Every FR→task, every AC→verify; every path exists; rewire-not-rebuild confirmed. Deviations listed.
End with: PLAN-DONE
