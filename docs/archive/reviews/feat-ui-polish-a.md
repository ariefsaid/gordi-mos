# Review battery — `feat/ui-polish-a` (ship to `dev`)

The union ship: `fix/ui-coherence-followups` (kitchen coherence W1.1–1.5 + deputy battery W2.1–2.2 + D7 +
type-scale) **plus** the A-level UI polish from the 3-lens design teardown. Merge commit `a2fc111`.
Full battery for the coherence+deputy half is in
[fix-ui-coherence-followups.md](fix-ui-coherence-followups.md) (incl. its "## Session 2" A-level handoff);
the design basis is [design-teardown-2026-07-07.md](design-teardown-2026-07-07.md).

## Ship verification (Director, on the union `a2fc111`)
- Full `npx vitest run` = **233 files / 2297 tests PASS** · `npm run typecheck` clean · `npm run build` clean.
- A-level items each Director-verified at build time (typecheck + targeted tests + eslint/stylelint):
  A1 bleeds+A7 reflow (`829a754`), A3 Inbox empty-state (`0fd6faf`), A5 kitchen saved-state (`1482f93`);
  A2 type-scale (`7dbf09b`). A4 (not-live states) deferred — `router.tsx` overlaps the parallel dashboard
  session; A6 (provenance) covered by that session's FreshnessLabel.
- No auth/RLS/schema/migration touched by the A-level (UI/CSS + i18n + kitchen-plan feedback only).

## Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: SHIP — conforms to the coherence retrofit (fix ledger) + the teardown's A-level; no scope creep;
  A4/A6 explicitly deferred/covered.
- code-quality: SHIP — shared-primitive reuse; bounded, behavior-preserving CSS/UI diffs; full suite green
  (2297), typecheck + build clean; each item verified at build. (Known: 1 pre-existing react-hooks/exhaustive
  -deps warning the lint gate silently allowed — the `npm run lint -- --max-warnings=0` command drops the flag;
  fix the package.json lint script, tracked in the fix ledger.)
- design: SHIP — 3-lens rendered teardown (design-teardown-2026-07-07.md) drove the A-level: both P0 bleeds
  resolved, type scale to DESIGN.md, empty-state adoption + kitchen saved-state addressed.
- security: PASS — UI/i18n/CSS only on this branch's A-level; deputy markdown/widget fail-closed validation
  (fix ledger) intact; no service-role/business-write/RLS path changed.

## Outstanding (post-ship)
- Next: **B2 page-archetype system** (the root "several apps" cure). A4 after the dashboard session's routing.
- `dev`→`main` promotion still owes its own release battery (task #16 F).
