# Review battery — `feat/home-stacked-union` (Issue E: Home stacked-union cockpit)

- **Slice:** Home composes the union of the roles a person holds as one scrollable surface, widest-scope-first
  (owner-cockpit → function-cockpit(s) → my-week | capture-first). Behind `SHOW_HOME_STACKED` (default off).
- **Spec:** `docs/specs/home-stacked-union.spec.md`. **Plan:** `docs/plans/2026-07-07-home-stacked-union.md`.
- **Build:** gpt-5.5 (z.ai/GLM was rate-limited; fallback per `docs/pi-delegation.md`). **Base:** dev `4010881`.
- **Risk:** LOW — UI composition only, **no schema, no money-path**, ships dark. Director review = the review
  (builder was gpt-5.5; no separate cross-family needed for a flag-off UI-only slice).

## Verdict lines (machine-checked by `scripts/pre-merge-check.sh`)
- spec: PASS — gpt-5.5 authored + Director-reviewed; matches decisions.md "Home composition" (stacked-union, not toggle).
- code-quality: PASS — Director read `home-stack.ts`: pure role-union selector, correct widest-scope-first order + union semantics (no dup my-week), member→capture-first only, BU-apex detection sound; 98.67% line / 89% branch coverage on changed files.
- design: PASS — structure + composition logic verified; **visual render deferred to F-enablement** (flag-off; the full composed Home — E's stack + C's AR money tile + margin — is rendered together when SHOW_HOME_STACKED flips at rollout). Phone-first sections per spec.
- security: PASS — no schema, no new RLS, no money-path; visibility-direction (member→no finance, BU-head→own-BU-only) enforced in the composition + covered by tests.

## Battery evidence (Director-re-run)
- `npm run typecheck` → **0 errors**. `npm run lint` → **0 errors** (Director re-ran in-worktree).
- `npm test -- --run` → **2280/2280** (gpt-5.5 self-report; +~20 tests over baseline). Coverage 98.67% changed.
- e2e `home-stacked-union.spec.ts` authored; not run in the worktree (missing e2e Supabase service-role env) —
  runs under the seeded CI/Director harness at F-enablement.

## Integration notes for F
- E refactored `home-page.tsx` (extracted finance-KPI logic to `use-company-finance-kpis.ts` + `home-stack/`
  components) and added `stacked-union-home.tsx` behind the flag. **C's AR money tile must land in E's
  `money-position-section.tsx` slot** (C built its tile against the v1 Home; reconcile at C's merge).
- The **ops-KPI section is an empty-state placeholder** (owner-deferred metric set — no fake numbers).
