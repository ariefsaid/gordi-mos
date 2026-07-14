# COMPLETION round — step 2 build, tasks T18–T24 (implementer/qa, TDD-BDD)

The step-2 build committed tasks T1–T17 (+ existing-test updates) then died on a z.ai rate cap.
The shell impl is DONE and the unit suite is GREEN (2572). You finish the E2E + gate tasks only.
Branch `feat/redesign-buildout` (already checked out — do NOT git checkout/switch). Commit per task;
never push/PR/merge.

## READ FIRST
- `docs/plans/2026-07-14-redesign-shell-routes.plan.md` §4 Phase F (T18–T23) + Phase G (T24) — exact
  specs to write. The impl they test already exists (rail-nav, top-bar, breadcrumb, context-row,
  router redirects, command-menu palette, destinations three-registry — all committed + unit-green).
- `docs/specs/redesign-shell-routes.spec.md` — the AC Given/When/Then each e2e must prove.
- Existing e2e for patterns + the demo-login flow: `mos-app/e2e/shell-nav.spec.ts`,
  `mos-app/e2e/AC-410-nav-five-destinations.spec.ts` (these two assert the OLD IA — T23 updates them).

## Tasks (do IN ORDER, commit each)
- **T18–T22:** author the 5 new Playwright specs named in the plan (shell-routes-redirects,
  shell-url-state, shell-aria-current, shell-command-palette, shell-phone-nav) proving their ACs.
- **T23 (BDD-critical):** the existing e2e that assert the OLD nav (`shell-nav`, `AC-410-...`, any
  others that reference retired routes /updates /ops /cascade or the old 5-destination rail) now fail
  against the new shell. UPDATE their journey STEPS for the deliberate re-route (OD-57 IA) — new
  routes, new rail labels. **Keep each test's GOAL/assertion intact; only the navigation steps change.
  Never weaken an assertion or .catch a failure to go green.** If a test's goal is genuinely obsolete
  (tests a retired destination), mark it .skip with a one-line reason, don't delete silently.
- **T24 (gate):** from `mos-app/`: `npm run typecheck && npm run lint && npm test && npx playwright
  test`. All must pass. Paste the tail of each.

## Discipline (connection has dropped ~5× this session)
COMMIT AFTER EACH TASK. Only committed work survives. If you must stop, commit what compiles + stop.
Do NOT touch the shell IMPL (T1–T17 is done + reviewed-pending) unless an e2e reveals a real impl bug
— if it does, fix the impl minimally, note it loudly in your report, and keep the test's goal.

## Report
Per task: landed / spec file / AC ids. Gate tails. Any existing e2e you .skip'd + why. Any impl bug
you had to fix. End with: BUILD-DONE
