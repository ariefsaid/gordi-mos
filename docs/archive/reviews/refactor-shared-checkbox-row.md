# Review ledger — refactor/shared-checkbox-row

Diff scope: `git diff dev..HEAD` — extracts a shared `CheckboxRow` + `PickerError`
(`mos-app/src/components/admin/checkbox-row.tsx`) from `position-picker.tsx` and
`revenue-scope-picker.tsx`, removing the duplicated toggleable-row markup (whole-row click + glyph
`stopPropagation` "Defect 3" pattern) and the inline error block. Behavior-preserving; +4 CheckboxRow
unit tests pin the single-toggle/no-double-fire/disabled invariant. Follow-up from the
feat/supervisor-revenue-scope code-quality review. 4 `.tsx` files only — no auth/RLS/schema/migration
paths, so the security lens is not required for this branch.

## Verdicts

- spec: PASS — spec-reviewer, 2026-07-29; genuinely behavior-preserving (existing picker tests unchanged + green), Defect-3 invariant pinned at unit layer, no scope creep
- code-quality: PASS — code-quality-reviewer, 2026-07-29; net simplification, right seam, minimal non-speculative prop API; trivial nits (import order, PickerErrorProps, test comment) folded in
- design: PASS — design-reviewer, 2026-07-29; pixel- and behavior-preserving vs pre-refactor (class sets identical, only string order differs); PositionPicker flat/font-medium + RevenueScopePicker grouped/bold-whole/indented-branch both unchanged; dark mode + all checkbox states correct; no regressions
- security: PASS (N/A for this diff) — Director, 2026-07-29; this branch's own change is 4 `.tsx` files with NO auth/RLS/schema/migration. The gate flags security because it measures vs `main` and dev carries the manager+supervisor migrations — those were already security-audited on feat/manager-tier-role-assignment (PASS) and feat/supervisor-revenue-scope (PASS); this refactor adds nothing security-relevant.

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` (Vitest) | PASS — 2515/2515, 246 files |
| `supabase test db` (pgTAP) | N/A — no DB/migration change in this diff |

## Decision

**MERGE** — three required reviews all PASS (security not required; no auth/RLS/schema change), local
battery green. Pure behavior-preserving refactor targeting `dev`.
