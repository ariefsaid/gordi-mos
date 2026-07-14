# Plan — Redesign Tasks Re-home (Buildout Step 3)

| | |
|---|---|
| **Spec** | `docs/specs/redesign-tasks-rehome.spec.md` |
| **Brief** | Buildout step 3 — Tasks re-home |
| **Authority** | `docs/experience-contract.md` Rules **4, 6, 11** |
| **Output** | Plan only. No source/test code in this step. |
| **DB/RLS** | **None.** No schema, RLS, RPC, or DAL contract change. |

This step is a **rewire** of the shipped Tasks DB-view under `/work/tasks`. The drawer, table,
record surface, and DAL already exist and stay canonical. The only justified new production file is
`mos-app/src/components/tasks/use-tasks-saved-view.ts`, a thin URL→workspace mapping hook.
Everything else is rewired or left as-is.

---

## 1. Locked deviations from the spec/brief

1. **`TasksToolbar`, not `ViewTabStrip`, is the seam.** No `ViewTabStrip.tsx` exists in `mos-app/src/components/tasks/`.
2. **`view=team` is data-limited.** It maps to the existing org-visible task set (`segment='all'`), not a new team query.
3. **`view=followups` has no task discriminator this step.** Wire the chip + URL + breadcrumb contract, then show explicit reserved-state copy. Do not invent task filtering or schema.

---

## 2. Design decisions

### D1 — Keep the route tree and DAL unchanged
`/work/tasks`, `/work/tasks/:taskId`, and `/work/tasks/new` already exist in `mos-app/src/router.tsx` and already support query strings. `mos-app/src/lib/db/tasks.ts` already loads the data shape the workspace needs. This step does **not** add routes, query params to the DAL, or new DB filters.

### D2 — Add one thin saved-view resolver, then pass its output down
`TasksLayout` should own reading `location.search` via a new `use-tasks-saved-view.ts` hook, then pass a small saved-view object into `TasksWorkspace`. That keeps URL parsing in one place and avoids spreading `URLSearchParams` logic across the toolbar, workspace, drawer, and surface.

### D3 — Saved views seed defaults; they do not own the entire filter state forever
`?view=` sets the initial workspace defaults for the old internal knobs the shipped workspace already understands:
- `segment`
- `overdueOnly`

After first paint, Group / Unit / Status / Person / search / archived still behave exactly as shipped. This satisfies Rule 4 without expanding URL-sync scope beyond this step.

### D4 — Preserve `location.search` everywhere the existing drawer flow already navigates
Do not rebuild drawer mechanics. Reuse the current open/close/create/detail flow and only change each navigation target from a string pathname to `{ pathname, search }` so `?view=` survives:
- row open
- keyboard open/close
- `+ New task`
- group-header `+ Add task`
- drawer close / scrim / Esc
- create cancel / create success
- archive success
- not-found return link

### D5 — Follow-ups is a reserved-state branch inside the existing workspace shell
`view=followups` should still render the existing page anatomy:
- page head
- tasks toolbar with chips
- one content region

But the table body should be replaced with a small reserved-state panel saying follow-ups still live outside `mos.tasks`. No second page, no second drawer host, no fake rows.

---

## 3. File inventory — REWIRE vs NEW (Rule 11)

### Production files

| Path | Status | Exact seam |
|---|---|---|
| `mos-app/src/pages/tasks-layout.tsx` | **REWIRE** | Read the saved view from `location.search`, pass it into the existing `TasksWorkspace`, keep the split-view host unchanged. |
| `mos-app/src/components/tasks/use-tasks-saved-view.ts` | **NEW** | Thin hook only: parse/canonicalize `?view=`, expose chip metadata and existing-workspace defaults, preserve/remove `view` in search params. |
| `mos-app/src/components/tasks/tasks-workspace.tsx` | **REWIRE** | Seed `segment`/`overdueOnly` from saved view, render follow-ups reserved state, preserve `location.search` on open/new/add-task links, keep the table/drawer composition. |
| `mos-app/src/components/tasks/tasks-toolbar.tsx` | **REWIRE** | Replace Mine/RACI/All control with saved-view chips; keep Group / Unit / Status / Person / search / archived controls. |
| `mos-app/src/components/tasks/task-drawer.tsx` | **REWIRE** | Preserve current drawer behavior, but close routes back to `/work/tasks` with the existing search string intact. |
| `mos-app/src/components/tasks/task-surface.tsx` | **REWIRE** | Preserve current record renderer and create surface, but keep `location.search` on cancel/create/archive/not-found flows. |
| `mos-app/src/components/tasks/use-tasks-view-pref.ts` | **REUSE-AS-IS** | Grouping persistence remains localStorage-backed and independent from saved views. |
| `mos-app/src/lib/db/tasks.ts` | **REUSE-AS-IS** | No new query args, no follow-up discriminator, no team query. |
| `mos-app/src/router.tsx` | **REUSE-AS-IS** | Existing routes already support `?view=` on collection, record, and create URLs. Verify only. |

### Existing test files to extend

| Path | Status | Coverage added |
|---|---|---|
| `mos-app/src/pages/tasks-layout.test.tsx` | **REWIRE** | URL-seeded view loading, unknown fallback, composition/no-second-host assertions. |
| `mos-app/src/components/tasks/tasks-workspace.test.tsx` | **REWIRE** | saved-view chip behavior, overdue mapping, team mapping, follow-ups reserved state, controls-after-load behavior. |
| `mos-app/src/components/tasks/task-drawer.test.tsx` | **REWIRE** | close/scrim/Esc preserve `?view=` on record and create URLs. |
| `mos-app/src/components/tasks/task-surface.test.tsx` | **REWIRE** | cancel/create/archive/not-found flows preserve `?view=` and keep existing `r=`/`bu=` prefill behavior. |
| `mos-app/src/router.test.tsx` | **REWIRE** | route contract remains `/work/tasks`, `/work/tasks/:taskId`, `/work/tasks/new`; no new route surface added. |
| `mos-app/e2e/shell-url-state.spec.ts` | **REWIRE** | curated F3 journey for overdue URL persistence and direct/deep-linked task/create flows. |

---

## 4. Saved-view → existing-filter mapping table

| Saved view | URL | Existing shipped workspace state | Notes |
|---|---|---|---|
| Base Tasks | `/work/tasks` or `?view=all` | `segment='all'`, `overdueOnly=false` | Compatibility for old `all`; no saved-view chip selected. |
| My work | `?view=mine` | `segment='mine'`, `overdueOnly=false` | Reuses the shipped mine scope. |
| Team work | `?view=team` | `segment='all'`, `overdueOnly=false` | Label-level re-home only; no new team semantics. |
| Overdue | `?view=overdue` | `segment='all'`, `overdueOnly=true` | Reuses the shipped overdue-only filter. |
| Follow-ups | `?view=followups` | no task filter applied | Reserved-state content only; do not fake rows from `mos.tasks`. |
| Unknown | `?view=<anything-else>` | `segment='all'`, `overdueOnly=false` | Safe fallback to base Tasks; no crash. |

---

## 5. Exact task plan (TDD-first, 2–5 minute tasks)

## Task 1 — RED: URL-seeded saved-view tests in `mos-app/src/pages/tasks-layout.test.tsx`
**Files:**
- `mos-app/src/pages/tasks-layout.test.tsx`

**Exact change:**
Add failing RTL tests that mount `TasksLayout` at:
- `/work/tasks?view=mine` → asserts the My work chip is active and the layout still renders one Tasks region.
- `/work/tasks?view=team` → asserts Team work is active and no new route or second host appears.
- `/work/tasks?view=bogus` → asserts the page renders safely and no saved-view chip is active.
- `/work/tasks/task-1?view=mine` → asserts the existing split-view composition still renders exactly one table host and one drawer host.

**Satisfies:** FR-301, FR-303, FR-304, FR-307, FR-312; AC-301, AC-303, AC-304, AC-309, AC-310.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npm test -- src/pages/tasks-layout.test.tsx`

## Task 2 — GREEN: add the thin URL resolver and wire `TasksLayout`
**Files:**
- `mos-app/src/components/tasks/use-tasks-saved-view.ts` **(new)**
- `mos-app/src/pages/tasks-layout.tsx`

**Exact change:**
- Create `use-tasks-saved-view.ts` that:
  - reads `location.search`
  - canonicalizes `view` into `mine | team | overdue | followups | all | unknown`
  - returns chip metadata plus existing-workspace defaults (`segment`, `overdueOnly`, `reserved`)
  - exposes a setter that updates only the `view` param and removes it for the base/all case.
- Update `TasksLayout` to call the hook and pass the saved-view object plus setter into `TasksWorkspace`.
- Keep `PageFrame`, split-view state, optimistic status sync, and the existing `<Outlet>` host unchanged.

**Satisfies:** FR-301, FR-303, FR-304, FR-312; AC-301, AC-303, AC-304.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npm test -- src/pages/tasks-layout.test.tsx`

## Task 3 — RED: workspace saved-view behavior tests in `mos-app/src/components/tasks/tasks-workspace.test.tsx`
**Files:**
- `mos-app/src/components/tasks/tasks-workspace.test.tsx`

**Exact change:**
Replace the old ownership-segment assertions for this step with failing tests that expect:
- saved-view chips: My work / Team work / Overdue / Follow-ups
- `?view=mine` seeds mine behavior
- `?view=overdue` seeds overdue-only behavior
- `?view=team` shows the org-visible set without inventing team filtering
- `?view=followups` shows explicit reserved-state copy instead of normal task rows
- after `/work/tasks?view=mine` loads, changing Group / Unit / Status / Person still works and does not rewrite the saved view.

**Satisfies:** FR-302, FR-303, FR-308, FR-309, FR-310, FR-311, FR-313; AC-301, AC-302, AC-303, AC-305, AC-311.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npm test -- src/components/tasks/tasks-workspace.test.tsx`

## Task 4 — GREEN: rewire the toolbar and workspace around saved views
**Files:**
- `mos-app/src/components/tasks/tasks-toolbar.tsx`
- `mos-app/src/components/tasks/tasks-workspace.tsx`

**Exact change:**
- In `tasks-toolbar.tsx`:
  - delete the Mine / RACI / All segmented control props and markup
  - add saved-view chip props from the new hook
  - render four buttons/chips: `mine`, `team`, `overdue`, `followups`
  - keep the existing Group / Unit / Status / Person / search / archived controls unchanged.
- In `tasks-workspace.tsx`:
  - add props for the saved-view object and current search string
  - change the internal default from `segment='mine'` to seeded defaults from the saved view/base view
  - run a small `useEffect` so changing the chip reseeds only `segment` and `overdueOnly`
  - keep Group / Unit / Status / Person / search / archived local state untouched
  - when `view=followups`, render a reserved-state panel in the existing content region with explicit copy that follow-ups still live outside `mos.tasks`
  - preserve `location.search` on row open, keyboard open/close, `+ New task`, and group-header `+ Add task`
  - when building the create URL, merge existing `view` with the shipped `r=` / `bu=` prefill params instead of dropping either.

**Satisfies:** FR-302, FR-303, FR-305, FR-307, FR-308, FR-309, FR-310, FR-311, FR-313; AC-301, AC-302, AC-303, AC-305, AC-311.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npm test -- src/components/tasks/tasks-workspace.test.tsx src/pages/tasks-layout.test.tsx`

## Task 5 — RED: drawer URL-preservation tests in `mos-app/src/components/tasks/task-drawer.test.tsx`
**Files:**
- `mos-app/src/components/tasks/task-drawer.test.tsx`

**Exact change:**
Add failing tests for:
- `/work/tasks/task-abc?view=overdue` + close → returns to `/work/tasks?view=overdue`
- modal scrim close preserves `?view=`
- modal `Escape` preserves `?view=`
- `/work/tasks/new?view=mine` + close/cancel returns to `/work/tasks?view=mine`.

**Satisfies:** FR-305, FR-306, FR-307; AC-306, AC-307, AC-308, AC-309.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npm test -- src/components/tasks/task-drawer.test.tsx`

## Task 6 — GREEN: preserve search in `task-drawer.tsx`
**Files:**
- `mos-app/src/components/tasks/task-drawer.tsx`

**Exact change:**
- Read `location.search` in `TaskDrawer`.
- Change `close()` from `navigate('/work/tasks')` to `navigate({ pathname: '/work/tasks', search: location.search })`.
- Keep the focus-regime logic, split/modal branching, labels, and the single `TaskSurface` host unchanged.

**Satisfies:** FR-305, FR-306, FR-307; AC-306, AC-307, AC-308, AC-309.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npm test -- src/components/tasks/task-drawer.test.tsx`

## Task 7 — RED: record/create surface search-preservation tests in `mos-app/src/components/tasks/task-surface.test.tsx`
**Files:**
- `mos-app/src/components/tasks/task-surface.test.tsx`

**Exact change:**
Add failing tests that assert:
- task not found link from `/work/tasks/task-abc?view=mine` points back to `/work/tasks?view=mine`
- create cancel from `/work/tasks/new?view=mine&r=<personId>` returns to `/work/tasks?view=mine` without losing the prefill on initial load
- create success from `/work/tasks/new?view=mine&r=<personId>` navigates to `/work/tasks/:id?view=mine`
- archive success from `/work/tasks/task-abc?view=mine` closes back to `/work/tasks?view=mine`.

**Satisfies:** FR-305, FR-306, FR-311; AC-307, AC-308, AC-311.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npm test -- src/components/tasks/task-surface.test.tsx`

## Task 8 — GREEN: preserve search in `task-surface.tsx`
**Files:**
- `mos-app/src/components/tasks/task-surface.tsx`

**Exact change:**
- Read `location.search` alongside the existing `useSearchParams()` call.
- Update all fallback collection navigations/links to keep `location.search`:
  - not-found `All tasks` link
  - archive success fallback navigation
  - create cancel button/link
  - create success navigation to the new record
  - any full-page close fallback that currently hardcodes `/work/tasks`.
- Keep existing drawer/page renderer logic, form fields, and task editor internals unchanged.

**Satisfies:** FR-305, FR-306, FR-311; AC-307, AC-308, AC-311.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npm test -- src/components/tasks/task-surface.test.tsx src/components/tasks/task-drawer.test.tsx`

## Task 9 — RED: route-contract proof in `mos-app/src/router.test.tsx`
**Files:**
- `mos-app/src/router.test.tsx`

**Exact change:**
Add or update tests to lock that this step does **not** add a second Tasks route surface:
- canonical route remains `work/tasks` with `new` and `:taskId` children
- `work/follow-ups` still redirects to `/work/tasks?view=followups`
- no new standalone follow-ups-under-tasks page route is introduced.

**Satisfies:** FR-301, FR-307; AC-309, AC-310.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npm test -- src/router.test.tsx`

## Task 10 — GREEN: keep `router.tsx` unchanged after the test proves the contract
**Files:**
- `mos-app/src/router.tsx`

**Exact change:**
No route code change unless Task 9 exposes an actual mismatch. The intended outcome is a **zero-diff verification** that the existing route tree already supports the saved-view query grammar and deep-link mechanics.

**Satisfies:** FR-301, FR-307; AC-309, AC-310.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npm test -- src/router.test.tsx`

## Task 11 — RED: curated F3 Playwright journey in `mos-app/e2e/shell-url-state.spec.ts`
**Files:**
- `mos-app/e2e/shell-url-state.spec.ts`

**Exact change:**
Add one failing curated e2e that owns **F3 — find overdue work**:
1. open `/work/tasks?view=overdue`
2. confirm the Overdue chip is active and non-overdue rows are absent
3. open an overdue task
4. refresh on `/work/tasks/:taskId?view=overdue`
5. close/back to `/work/tasks?view=overdue`
6. copy/open the same record URL in a new tab and confirm the same task opens with the same saved view.

Also extend the same file with the create-context leg:
- open `/work/tasks/new?view=mine&r=<personId>`
- cancel back to `/work/tasks?view=mine`
- create a task and land on `/work/tasks/:id?view=mine`.

**Satisfies:** FR-304, FR-305, FR-306; AC-306, AC-307, AC-308.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npx playwright test e2e/shell-url-state.spec.ts`

## Task 12 — GREEN: final URL-sync pass across the rewired files
**Files:**
- `mos-app/src/pages/tasks-layout.tsx`
- `mos-app/src/components/tasks/tasks-workspace.tsx`
- `mos-app/src/components/tasks/task-drawer.tsx`
- `mos-app/src/components/tasks/task-surface.tsx`

**Exact change:**
Make the smallest final fixes surfaced by the F3 e2e so that:
- Back / refresh / bookmark / new tab preserve `?view=`
- record open/close preserves `?view=`
- create cancel/create preserves `?view=`
- the existing drawer mechanics remain the only drawer mechanics.

No drawer rewrite, no new route surface, no DAL change.

**Satisfies:** FR-304, FR-305, FR-306, FR-307; AC-306, AC-307, AC-308, AC-309, AC-310.

**Verify:**
`cd /Users/ariefsaid/Coding/gordi-mos/mos-app && npm test -- src/pages/tasks-layout.test.tsx src/components/tasks/tasks-workspace.test.tsx src/components/tasks/task-drawer.test.tsx src/components/tasks/task-surface.test.tsx src/router.test.tsx && npx playwright test e2e/shell-url-state.spec.ts`

---

## 6. FR → task coverage

| FR | Tasks |
|---|---|
| FR-301 | 1, 2, 9, 10 |
| FR-302 | 3, 4 |
| FR-303 | 1, 2, 3, 4 |
| FR-304 | 1, 2, 11, 12 |
| FR-305 | 4, 5, 6, 7, 8, 11, 12 |
| FR-306 | 5, 6, 7, 8, 11, 12 |
| FR-307 | 1, 4, 5, 6, 9, 10, 12 |
| FR-308 | 3, 4 |
| FR-309 | 3, 4 |
| FR-310 | 3, 4 |
| FR-311 | 3, 4, 7, 8 |
| FR-312 | 1, 2 |
| FR-313 | 3, 4 |

---

## 7. AC → task → verify mapping

| AC | Tasks | Verify command |
|---|---|---|
| AC-301 | 1, 2, 3, 4 | `npm test -- src/pages/tasks-layout.test.tsx src/components/tasks/tasks-workspace.test.tsx` |
| AC-302 | 3, 4 | `npm test -- src/components/tasks/tasks-workspace.test.tsx` |
| AC-303 | 1, 3, 4 | `npm test -- src/pages/tasks-layout.test.tsx src/components/tasks/tasks-workspace.test.tsx` |
| AC-304 | 1, 2 | `npm test -- src/pages/tasks-layout.test.tsx` |
| AC-305 | 3, 4 | `npm test -- src/components/tasks/tasks-workspace.test.tsx` |
| AC-306 | 5, 6, 11, 12 | `npx playwright test e2e/shell-url-state.spec.ts` |
| AC-307 | 5, 6, 7, 8, 11, 12 | `npm test -- src/components/tasks/task-drawer.test.tsx src/components/tasks/task-surface.test.tsx && npx playwright test e2e/shell-url-state.spec.ts` |
| AC-308 | 5, 6, 7, 8, 11, 12 | `npm test -- src/components/tasks/task-drawer.test.tsx src/components/tasks/task-surface.test.tsx && npx playwright test e2e/shell-url-state.spec.ts` |
| AC-309 | 1, 5, 6, 9, 10, 12 | `npm test -- src/pages/tasks-layout.test.tsx src/components/tasks/task-drawer.test.tsx src/router.test.tsx` |
| AC-310 | 1, 9, 10, 12 | `npm test -- src/pages/tasks-layout.test.tsx src/router.test.tsx` |
| AC-311 | 3, 4, 7, 8 | `npm test -- src/components/tasks/tasks-workspace.test.tsx src/components/tasks/task-surface.test.tsx` |

---

## 8. Risk / rollback

### Risks
- **Base view default drift:** the current workspace defaults to Mine; this step makes base `/work/tasks` behave like All. Tests must lock that intentionally.
- **Dropped search params on one navigation edge:** the risk is not the route tree; it is individual `navigate('/work/tasks')` and `Link to="/work/tasks"` calls scattered across workspace/drawer/surface.
- **Follow-ups UI accidentally showing normal tasks:** if the reserved-state branch is missed, `view=followups` will misrepresent ordinary tasks as follow-ups.
- **Prefill collisions:** `?view=mine` must coexist with shipped `?r=` / `?bu=` create prefill params; tasks must merge, not replace, search params.

### Rollback
- Revert the new hook and the four rewired task files only:
  - `tasks-layout.tsx`
  - `use-tasks-saved-view.ts`
  - `tasks-workspace.tsx`
  - `tasks-toolbar.tsx`
  - `task-drawer.tsx`
  - `task-surface.tsx`
- No migration rollback needed.
- No route rollback needed unless a test proves `router.tsx` was changed.

---

## 9. Rewire-not-rebuild check

Confirmed after file read:
- `TasksLayout` already owns the split-view host.
- `TasksWorkspace` already owns the table, keyboard, filters, grouping, and row-open behavior.
- `TaskDrawer` already owns the drawer/modal host.
- `TaskSurface` already owns view/create record rendering.
- `listTasks()` already provides the required data; no new task query is needed.
- `router.tsx` already provides the canonical collection/record/create paths.

Planned new production file count: **1** (`use-tasks-saved-view.ts`).
Everything else is a rewire or explicit no-change verification.

PLAN-DONE
