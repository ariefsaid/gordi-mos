# Review ledger — feat/cascade-catalog

Diff scope: `git diff 7445396..HEAD` — cascade catalog management (Objectives + Projects/Processes
surfaces under Workspace, role-gated; data layer; RLS tighten objectives→admin-only; Work-line→
Project/Process UI relabel; + a bundled task-drawer collapse-button fix). Branch is stacked on
feat/admin-user-mgmt (reuses its role-guard + nav-section pattern); merges after it.

## Verdicts

- spec: PASS — spec-reviewer (2026-06-26). All FR-001..022 + NFR-001..005 implemented; every AC has its owning test: AC-001..007 (unit), AC-010..013 (pgTAP 51/58), **AC-020 (curated e2e `AC-020-catalog.spec.ts`, green)**. AC-014 (archived leaves picker) covered by `objectives/work-lines.test.ts` archived-filter asserts + `cascade-d1` FR-235 name-resolution + AC-020's picker assertion + live verify. (Reviewer's original FIX-THEN-SHIP gap — the deferred AC-020 e2e — has since been written and passes.)
- code-quality: FIX-THEN-SHIP — code-quality-reviewer (2026-06-26). Important #1 `handleArchive` savingId leak → fixed (try/finally); #2 archive-failure test → added; Minor #3 RequireAccessRoleProps named type → done. Follow-up: collapse AdminRoute into RequireAccessRole once admin-user-mgmt lands (#4). 98.6% line coverage on changed code.
- design: FIX-THEN-SHIP — design-reviewer 4-lens, rendered live (2026-06-26). Important #1 Type `<select>` off-token radius → fixed (var(--radius-sm) + kit border/focus ring + guard test); #2 rows didn't reflow on phone → fixed (flex-wrap + min-w-0); Minor #3 type tags single-color → fixed (Project=blue/Process=sand). Lens C/D clean (correct IA, disciplined scope). Optional polish deferred (#4 redundant Name label, #5 archive confirm, #6 focus-return).
- security: PASS — security-auditor OWASP/STRIDE on the RLS seam (2026-06-26). No Critical/High. Tenancy, privilege (admin-only objectives, ops_lead/admin work_lines, member denied), no-DELETE, anon-key-only client all verified. MEDIUM-2 (test 58 lacked INSERT + cross-org) → fixed (58 now 12/12 incl. org-stamp + cross-org isolation). MEDIUM-1 = deploy gate: migration 20260626000003 must be applied per environment (CI `supabase test db` applies all migrations; staging/prod apply on deploy).

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (eslint --max-warnings=0) |
| `npm test` (Vitest) | PASS — 1259/1259 (one pre-existing kitchen-plan flake under parallelism; passes in isolation + on re-run) |
| `npx playwright test` (e2e) | PASS — AC-020 curated catalog journey green (1 passed) |
| `supabase test db` (pgTAP) | PASS — catalog 51 (16/16) + 58 (12/12) run directly vs local DB; full suite via CI |

## Decision

MERGE (pending owner approval) — stacked on feat/admin-user-mgmt, so merge AFTER that branch lands.
Deploy prerequisite: apply migration 20260626000003. Follow-up (non-blocking): AdminRoute↔RequireAccessRole consolidation once admin-user-mgmt lands.
