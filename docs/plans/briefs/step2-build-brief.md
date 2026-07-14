# Build brief — Buildout step 2: shell + routes (implementer, TDD)

You are the implementer. Execute the plan `docs/plans/2026-07-14-redesign-shell-routes.plan.md`
task-by-task via TDD. You are in the gordi-mos repo on branch `feat/redesign-buildout` (already
checked out — do NOT run git checkout/switch/branch; work in place). Commit on this branch; never
push/PR/merge.

## READ FIRST
1. `docs/plans/2026-07-14-redesign-shell-routes.plan.md` — THE PLAN. Execute §4 task list in order
   (Phases A→…). Every exact change is in §3. Honor the D-PLN deviations already decided.
2. `docs/specs/redesign-shell-routes.spec.md` — the signed spec (don't re-scope).
3. `docs/experience-contract.md` Rule 11 — EXTEND existing shell components; the ONLY new components
   allowed are the 3 the plan justifies (context-row, job-sentences, slice-stub-page). Do not create
   any other new component or re-implement an existing surface.
4. Reference for the frame/routes/⌘K: `docs/design-mockups/redesign-mockups-2026-07/convergence-flows/flows.js`
   (in the gordi-mos-e7-prototype working copy) — port its sidebar order, route grammar, redirects,
   centered ⌘K palette, and single-aria-current logic. e7 owns the palette look.

## Discipline (MANDATORY — the connection has dropped ~5× this session)
- **TDD:** write the failing test first (the plan names them), then impl. Never weaken a test to pass.
- **COMMIT AFTER EACH TASK** (`git add <files> && git commit -m "step2 Tn: ..."`). Only committed
  work survives a drop. Never leave a half-written file uncommitted; if you must stop, commit what
  compiles and stop.
- After each phase run the phase's verify commands from the plan.

## Gates before you report done (from mos-app/)
`npm run typecheck` (0) · `npm run lint` (0, --max-warnings=0) · `npm test` (green, no test weakened)
· `npx playwright test` (existing specs must still pass = routing/behavior non-regression, plus the
new routing/aria/back-refresh e2e the plan adds). Report the tail of each.

## Report
Tasks landed, gate tails, any plan step you couldn't complete + why, any new component beyond the 3
justified (there should be none). Verify your own work against the plan's FR/AC traceability.
End with: BUILD-DONE
