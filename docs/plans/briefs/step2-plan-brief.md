# Plan brief — Buildout step 2: shell + routes (eng-planner)

You are eng-planner. Turn the spec `docs/specs/redesign-shell-routes.spec.md` into a no-placeholder
implementation plan → `docs/plans/2026-07-14-redesign-shell-routes.plan.md`. Plan only, no code.

## READ FIRST
1. `docs/specs/redesign-shell-routes.spec.md` — the spec (FRs/NFRs/ACs). Do not re-scope.
2. `docs/experience-contract.md` Rules 1–11 (esp. Rule 11 component reuse — the plan must EXTEND
   existing shell components, never rebuild; justify any genuinely-new component).
3. `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` — convergence owns the
   frame/routes; e7 owns the ⌘K palette (centered modal). Reference implementations to PORT.
4. The real files to modify (verify each exists, read enough to plan precise edits):
   `mos-app/src/router.tsx`, `mos-app/src/shell/` (app-shell, rail-nav, top-bar, breadcrumb),
   `mos-app/src/components/command/` (command-menu), `mos-app/src/config/features.ts`,
   `mos-app/src/i18n/messages.ts`. The convergence reference:
   `docs/design-mockups/redesign-mockups-2026-07/convergence-flows/flows.js` (sidebar order, routes,
   redirects, ⌘K palette, aria-current logic) in the gordi-mos-e7-prototype working copy.

## Output plan must have
- Exact file list (real paths) with EXTEND-vs-new marked per Rule 11.
- 2–5 min tasks, each: exact file, exact change, which FR/AC it satisfies, verify command.
- TDD ordering: the component/router tests named in the spec's ACs written red-first, then impl.
- The full redirect map (old route → new route) as concrete router entries — enumerate every current
  route by reading `router.tsx`.
- The e2e tasks (Playwright) that own the routing/aria-current/back-refresh ACs.
- Risk/rollback note.

## Verify your own work
Every FR→≥1 task, every AC→verify step, every contract rule covered; every file path exists. List
deviations. End with: PLAN-DONE
