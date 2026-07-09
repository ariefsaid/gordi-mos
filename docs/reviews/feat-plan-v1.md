# Review battery — `feat/plan-v1` (Issue D: Plan v1 — budget/COGS + certified-metric registry)

- **Slice:** the Plan destination's real content — budget/COGS capture (read-and-budget), certified-metric
  registry (Finance certifies, migration-seeded), fail-loud freshness, pricing pre-flight margin check.
  Behind `SHOW_PLAN_BUDGET` (default off). ADR-0022 + D14 step 5.
- **Spec:** `docs/specs/plan-budget.spec.md`. **Plan:** `docs/plans/2026-07-07-plan-budget.md`.
- **Build:** gpt-5.5 (z.ai/GLM rate-limited; fallback). **Base:** rebased onto dev `35ca2a6` → `0d8daf9`.
- **Risk:** MEDIUM — new schema + RLS + link-integrity (reference data + budgets), but **no live
  money-transaction RPC** (read-and-budget; no ESB write). Director reviewed the RLS/link migration directly.

## Verdict lines (machine-checked by `scripts/pre-merge-check.sh`)
- spec: PASS — gpt-5.5 authored + Director-reviewed; matches ADR-0022 (read-and-budget, no recipe edit, no ESB/price write).
- code-quality: PASS — Director read `20260710000003_mos_budgets.sql`: **link-never-copy enforced structurally** (`budget_lines` has NO `unit_cost` column — cost resolves by joining `reporting.ingredient_cost_lines`); `is_complete=false` on missing cost line (no silent zero); `certified_metric_key` → fail-loud badge (anchor A7). 96.19% line coverage on changed files.
- design: PASS — Plan surfaces (budget capture + pricing pre-flight) structure verified; **visual render deferred to F-enablement** (flag-off).
- security: PASS — Director reviewed RLS: **force RLS** on both tables, org seam (`org_id = current_org_id()`), writes gated by `can('cogs.write')` (seeded finance+admin, ADR-0020), `created_by` pinned to caller, no delete path (soft-archive). No ESB write. **pgTAP 74/75/76** prove the RLS + link contracts (non-owner can't write; cross-org isolation; link integrity).

## Battery evidence (Director-re-run, isolated)
- `npm run typecheck` → **0**. `npm run lint` → **0**. `npm test -- --run` → **2327/2327** (rebased onto dev-with-C).
- `supabase db test` (pgTAP) → Director's **independent isolated** run after an explicit `supabase db reset`:
  C's `74_follow_ups_rls` + `75_follow_up_transition_rpc` + D's `76_plan_cogs_readmodels` + `77_mos_certified_metrics`
  + `78_mos_budgets_rls_link` **all ok**. **Two false-failure lessons logged:** (1) two concurrent
  `supabase db test` runs on the one shared local Postgres corrupt each other's results (D's first "FAIL" was a
  race with C's build) — serialize DB ops; (2) `supabase db test` doesn't always re-apply changed migrations —
  force `supabase db reset` first (a stale db made C's `74/75` spuriously "function does not exist").
- Rebased onto dev twice (E, then C) — additive conflicts (flags/keys/routes/nav/test-mocks) resolved both slices' additions; no marker residue.
- Migrations `20260710000001/2/3` (read-models · certified_metrics · budgets); pgTAP **renumbered 74/75/76 → 76/77/78** (C's follow-up tests own 74/75 on dev). Non-colliding.

## Notes
- Certified-metric registry is **migration-seeded** (no runtime CRUD UI — the owner-confirmed discipline).
- The live ESB BOM/`last_hpp` feed: built against a `reporting`/read-model interface with representative seed
  rows (structured for a drop-in real feed, not faked in components).
- Visual render + flag-flip happen at F (rollout), alongside C + E.
