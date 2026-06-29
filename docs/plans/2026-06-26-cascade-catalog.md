# Plan — Cascade catalog management (Objectives + Projects/Processes)

- Spec: `docs/specs/cascade-catalog.spec.md` · Decision: **OD-C-2** (`docs/decisions.md`)
- Branch: `feat/cascade-catalog` (off main; collapse-fix already committed as 7289d31)
- No ADR (OD-C-2: reversible policy tighten + CRUD UI; no manager primitive built)

Test pyramid: pgTAP for RLS write-gates, Vitest/RTL for nav + pages + db layer, 1 Playwright e2e.

---

## Phase A — DB / RLS

**A1. Migration: tighten Objectives write to admin-only** — `supabase/migrations/20260626000003_objectives_admin_only.sql`
- `drop policy objectives_insert_admin_or_ops_lead on mos.objectives;`
  `drop policy objectives_update_admin_or_ops_lead on mos.objectives;`
- recreate `objectives_insert_admin` / `objectives_update_admin` with check `... and shared.has_access_role('admin')`.
- `work_lines` policies UNCHANGED (ops_lead + admin already correct, OD-C-2).
- DOWN comment block restoring the `admin_or_ops_lead` policies.
- Verify: `supabase db reset` (or `supabase migration up`) succeeds.

**A2. Extend pgTAP `supabase/tests/51_mos_cascade_lookups.sql`** (same fixtures)
- Bump `plan(16)` → new count.
- **Flip** the existing `lives_ok('ops_lead can INSERT into mos.objectives')` → `throws_ok(...,'42501', ...)` with comment "OD-C-2: objectives are admin-only" (BDD: deliberate policy change).
- Add: admin can `UPDATE` (rename) + archive (`set archived_at`) an objective (lives_ok).
- Add: ops_lead can `UPDATE` + archive a work_line (lives_ok); member cannot (throws 42501).
- Add: `DELETE` on `mos.objectives` and `mos.work_lines` denied for admin (throws — no grant → 42501).
- Verify: `supabase test db` green.

---

## Phase B — Data layer (TDD: test first)

**B1. `mos-app/src/lib/db/objectives.ts`** (+ `objectives.test.ts`)
- Keep `listObjectives()` (picker, active-only) untouched.
- Add `ObjectiveAdminRow { id; name; archived_at: string|null }`.
- `listObjectivesAll()` → select `id,name,archived_at` (no archived filter), order `archived_at nulls first, name`.
- `createObjective(name: string)` → insert `{ name }` (DB stamps org_id); return new row.
- `renameObjective(id, name)` → update `{ name }`.
- `setObjectiveArchived(id, archived: boolean)` → update `{ archived_at: archived ? new Date().toISOString() : null }`.
- All throw on PostgREST error (match existing style). Tests mock `supabase.schema`.

**B2. `mos-app/src/lib/db/work-lines.ts`** (+ `work-lines.test.ts`) — mirror B1
- `WorkLineAdminRow { id; name; type: 'project'|'process'; archived_at }`.
- `listWorkLinesAll()`, `createWorkLine(name, type)`, `renameWorkLine(id, name)`, `setWorkLineArchived(id, archived)`.
- (No `type` update — FR-014 immutability.)
- Verify B1+B2: `npx vitest run src/lib/db/objectives.test.ts src/lib/db/work-lines.test.ts`.

---

## Phase C — UI

**C1. `mos-app/src/auth/require-access-role.tsx`** (+ test) — reusable route guard
- `<RequireAccessRole anyOf={['admin']}>`: reads `useAuth()`; if authenticated and `viewer.accessRoles` intersects `anyOf` → `<Outlet/>`, else `<Navigate to="/" replace/>`. Non-authenticated falls through to ProtectedRoute (already wraps). Test: renders Outlet when role present; redirects when absent.

**C2. `mos-app/src/shell/sections.tsx`** — add catalog sections
- New exported `CATALOG_SECTIONS` (or extend SECTIONS): `{ path:'/objectives', label:'Objectives', Icon:ObjectivesIcon, anyOf:['admin'] }`, `{ path:'/projects-processes', label:'Projects & Processes', Icon:WorkLineIcon, anyOf:['ops_lead','admin'] }`.
- Add 2 icons to `icons.tsx` (reuse a simple target/flow glyph; tokens only).
- `sectionForPath` must include these (breadcrumb resolution).

**C3. `mos-app/src/shell/rail-nav.tsx` + `mobile-drawer.tsx`** — render catalog items gated
- Filter catalog sections by `anyOf.some(r => accessRoles.includes(r))`. Place under Workspace, after Tasks.
- Update `rail-nav.test.tsx` / mobile-drawer test: admin sees both; ops_lead sees only Projects & Processes; member sees neither.

**C4. Catalog UI** — `mos-app/src/components/catalog/catalog-manager.tsx` (+ test) — shared list/add/rename/archive
- Props: `title`, `loadAll`, `create`, `rename`, `setArchived`, optional `extraCreateField` (the work-line type select), optional per-row `meta` (type badge).
- States: loading skeleton · empty · list (active group + archived group) · inline rename (edit-in-place) · add form with required-name validation (on submit + blur) · optimistic add/rename/archive with rollback + error region (mirror TaskSurface patterns). a11y: labeled inputs, `aria-live` for outcomes.
- `mos-app/src/pages/objectives-page.tsx` + `projects-processes-page.tsx` → thin wrappers passing the db fns. (PageHead title.)
- Tests own AC-004/005/006/007 (component states).

**C5. `mos-app/src/router.tsx`** — routes
- Inside the protected layout, add `{ element:<RequireAccessRole anyOf={['admin']}/>, children:[{ path:'objectives', element:<ObjectivesPage/> }] }` and the ops_lead/admin one for `projects-processes`.

**C6. Task-form relabel (FR-020)** — `mos-app/src/components/tasks/task-surface.tsx`
- Change `<label>Work-line</label>` → `Project/Process`; `aria-label="Work-line"` → `Project/Process`. Keep option `(project)/(daily)` cue.
- Update any test asserting the "Work-line" label string (`task-surface.test.tsx`, e2e) → "Project/Process".
- Verify: `npm run typecheck && npx vitest run`.

---

## Phase D — breadcrumb + e2e

**D1.** Confirm breadcrumb renders "Objectives" / "Projects & Processes" via `sectionForPath` (covered C2); add breadcrumb test cases.
**D2. e2e** `mos-app/e2e/AC-020-catalog.spec.ts` — admin logs in (demo `dewi.dev` is admin? else grant), opens Objectives, add → rename → archive, assert each + that archived item leaves the task-form Objective picker. Needs an admin access-role on the e2e/demo user — verify seed; if missing, grant in `seed.dev-auth`/test seed.

---

## Phase E — gate

**E1.** `npm run typecheck` (0) · `npx eslint … --max-warnings=0` · `npx vitest run` (all) · `supabase test db` (all).
**E2.** Review battery → `docs/reviews/feat-cascade-catalog.md`: spec-reviewer · code-quality-reviewer · design-reviewer (.tsx/.css touched) · security-auditor (RLS path touched). Then `bash scripts/pre-merge-check.sh` exit 0.
**E3.** Live verify (Playwright): nav visibility per role · add/rename/archive round-trip · task-form relabel · archived leaves picker.
**E4.** Pause for owner: PR (do not merge).

## Risks / notes
- Breaking existing test 51 is expected & handled (A2). grep `AC-213` to confirm nothing else asserts ops_lead-objectives.
- Demo/e2e admin role must exist for D2 — verify before writing the journey.
- `accessRoles` already carries derived `manager`; we ignore it (gate on admin/ops_lead only).
