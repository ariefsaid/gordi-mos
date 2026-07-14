# Redesign Step 3 — Tasks re-home

**Status:** Proposed  
**Owner brief:** `docs/plans/briefs/step3-spec-brief.md`  
**Buildout step:** `docs/plans/2026-07-14-redesign-buildout.md` step 3  
**Primary rules:** Experience Contract Rules **4, 6, 11**

## 1. Overview and user value

This step re-homes the **already-shipped Tasks DB-view** under the redesign Work collection at
`/work/tasks` and replaces the old **Mine / RACI / All** ownership tabs with **saved-view chips** backed by
URL query state.

User value:
- a viewer can land on **My work**, **Team work**, **Overdue**, or **Follow-ups** from one canonical Tasks route;
- the chosen view survives **Back / refresh / bookmark / new tab**;
- opening a task keeps the table and the current view in sync with the URL;
- the shipped dense task table and task record surface are **reused**, not rebuilt.

This is a **rewire** step, not a new Tasks implementation.

## 2. Scope

### In scope
- `/work/tasks` saved-view URL grammar.
- Saved-view chips for `mine | team | overdue | followups`.
- Mapping saved views onto the **existing** TasksWorkspace filter model.
- Preserving `?view=` while opening/closing `/work/tasks/:taskId` and `/work/tasks/new`.
- Reusing the existing drawer and task surface.
- F3 curated journey ownership: **find overdue work**.

### Out of scope
- Any task schema, RLS, or data-model change.
- Any rewrite of `TasksWorkspace`, `TaskSurface`, `TaskDrawer`, or the table grammar.
- Task editor internals.
- Signal / occurrence work.
- Replacing the separate `mos.follow_ups` domain model.
- URL-syncing Group / Unit / Status / Person / search / archived controls in this step.

## 3. Reverse-engineered current behavior (spec-miner baseline)

Verified from the shipped app:
- `TasksLayout` already hosts `/work/tasks` as a split-view shell with persistent table + outlet drawer.
- `TasksWorkspace` currently owns:
  - ownership segment: **mine | raci | all**;
  - presentation controls: **Group / Unit / Status / Person / search / Show archived**;
  - transient **overdueOnly** filter;
  - grouped table/mobile cards;
  - row open → `/work/tasks/:id`;
  - new task → `/work/tasks/new`.
- `listTasks()` only server-filters **businessUnitId / status / includeArchived**; person and ownership scope are client-side.
- `useTasksViewPref()` persists grouping/collapsed state in localStorage; default grouping is `none`.
- `TaskDrawer` and `TaskSurface` already reuse one task renderer for drawer/full-width modes.
- Current open/close/create navigations mostly drop `location.search`; this step must preserve `?view=`.

## 4. Reuse inventory (Rule 11)

| Path | Status | Exact seam |
|---|---|---|
| `mos-app/src/pages/tasks-layout.tsx` | **REWIRE** | Read `?view=` and pass saved-view state into the existing workspace; keep existing split-view host. |
| `mos-app/src/components/tasks/tasks-workspace.tsx` | **REWIRE** | Replace Mine/RACI/All tab bootstrap with saved-view bootstrap; keep table, grouping, row grammar, mobile cards, drawer slot. |
| `mos-app/src/components/tasks/tasks-toolbar.tsx` | **REWIRE** | Replace the old ownership segment UI with saved-view chips; keep Group / Unit / Status / Person / search / archived controls. |
| `mos-app/src/components/tasks/task-drawer.tsx` | **REWIRE** | Preserve current drawer/modal behavior, but close/back navigation must retain `location.search`. |
| `mos-app/src/components/tasks/task-surface.tsx` | **REWIRE** | Preserve current record renderer; create/close/archive/not-found links must retain `location.search`. |
| `mos-app/src/components/tasks/group-header-row.tsx` | **REUSE-AS-IS** | No new group header implementation. |
| `mos-app/src/components/tasks/use-tasks-view-pref.ts` | **REUSE-AS-IS** | Grouping persistence remains separate from saved views. |
| `mos-app/src/lib/db/tasks.ts` | **REUSE-AS-IS** | No new data API; saved-view mapping stays client-side. |
| `mos-app/src/shell/breadcrumb.tsx` | **REUSE-AS-IS / minor wire check** | Step 2 already resolves `mine/team/overdue/followups`; no new breadcrumb surface. |
| `mos-app/src/router.tsx` | **REUSE-AS-IS / minor wire check** | Step 2 route/redirects stand; Step 3 consumes the existing `?view=` grammar. |
| `mos-app/src/components/tasks/use-tasks-saved-view.ts` | **NEW (thin)** | Optional thin hook only: map `location.search` ⇄ saved-view defaults/chip metadata. Justified because no equivalent seam exists today. |

## 5. URL grammar and saved-view mapping

### 5.1 Canonical route shapes
- Base workspace: `/work/tasks`
- Saved views:
  - `/work/tasks?view=mine`
  - `/work/tasks?view=team`
  - `/work/tasks?view=overdue`
  - `/work/tasks?view=followups`
- Open record: `/work/tasks/:taskId` with the current search preserved, e.g. `/work/tasks/abc?view=overdue`
- Create record: `/work/tasks/new` with the current search preserved, e.g. `/work/tasks/new?view=mine&r=<id>`

### 5.2 Compatibility
- `?view=all` remains a supported compatibility value because Step 2 already declared it in route grammar.
- UI canonical target from rail/breadcrumb child is still **`/work/tasks`**.
- Unknown `?view=` values fall back safely to the base Tasks view without crashing.

### 5.3 Saved-view → existing filter mapping

| URL view | Existing TasksWorkspace state | Notes |
|---|---|---|
| _none_ / `all` | `segment='all'`, `overdueOnly=false` | Base workspace. No saved-view chip required. |
| `mine` | `segment='mine'`, `overdueOnly=false` | Direct re-home of the shipped “Mine” scope. |
| `team` | `segment='all'`, `overdueOnly=false` | **Deviation:** current DB-view has no true reporting-line/team filter; this step maps Team work to the existing org-visible workspace rather than inventing new data semantics. |
| `overdue` | `segment='all'`, `overdueOnly=true` | Reuses the shipped transient overdue filter as a URL-seeded default. |
| `followups` | reserved saved-view shell | **Deviation:** current Tasks DB-view has no task-backed follow-up discriminator and follow-ups still live in `mos.follow_ups`; this step reserves the URL/chip/breadcrumb contract and must not fake a task filter. See §10. |

### 5.4 Control precedence
1. `?view=` seeds the ownership/overdue defaults.
2. Existing Group / Unit / Status / Person / search / archived controls remain editable after load.
3. Grouping persistence from `useTasksViewPref()` remains independent of `?view=`.
4. Changing saved view replaces only the saved-view-owned defaults; it does not reset grouping persistence.

## 6. Functional requirements (EARS)

- **FR-301** When a viewer opens `/work/tasks`, the system shall render the existing Tasks DB-view under the Work collection without rebuilding the table or drawer.
- **FR-302** When a viewer selects a Tasks saved-view chip, the system shall write the corresponding `?view=` value into the URL.
- **FR-303** When `/work/tasks` is loaded with `?view=mine|team|overdue|followups|all`, the system shall seed the existing TasksWorkspace filter state from that value.
- **FR-304** When a viewer opens, refreshes, bookmarks, or copies a `/work/tasks` URL with `?view=...`, the system shall restore the same saved view. *(Rule 4)*
- **FR-305** When a viewer opens a task from any saved view, the system shall preserve the current `?view=` query string on `/work/tasks/:taskId`. *(Rule 4)*
- **FR-306** When a viewer closes the drawer, cancels create, archives from the surface, or hits row-level navigation back to the collection, the system shall return to `/work/tasks` with the prior `?view=` still present. *(Rule 4)*
- **FR-307** Where the Tasks route is active, the system shall reuse the existing `TasksLayout` → `TasksWorkspace` → `TaskDrawer` / `TaskSurface` composition and shall not introduce a second task table, drawer host, or task detail renderer. *(Rules 6, 11)*
- **FR-308** Where `view=mine` is active, the system shall reuse the shipped “Mine” ownership logic.
- **FR-309** Where `view=overdue` is active, the system shall reuse the shipped overdue-only filter logic and existing overdue signals in the table.
- **FR-310** Where `view=team` is active, the system shall reuse the existing org-visible task set and shall not invent new team-resolution semantics in this step.
- **FR-311** Where `view=followups` is active before follow-up/task convergence exists, the system shall preserve the URL/chip/breadcrumb contract and present an explicit reserved-state message rather than misrepresenting ordinary tasks as follow-ups.
- **FR-312** When `?view=` is missing, `all`, or unknown, the system shall render the base Tasks workspace safely.
- **FR-313** Where the presentation controls are shown, the system shall keep the shipped Group / Unit / Status / Person controls and make them reflect the saved-view defaults on first paint.

## 7. Non-functional requirements

- **NFR-301** The implementation shall be a **rewire-first** change: reuse the shipped Tasks table, grouping, keyboard, drawer, and task surface. *(Rule 11)*
- **NFR-302** The saved-view mapping shall remain client-side and shall not add new DB queries or schema dependencies.
- **NFR-303** The saved-view wiring shall preserve existing task-table performance characteristics, including current virtualization and optimistic row updates.
- **NFR-304** The route shall continue to satisfy the one-page Tasks anatomy already established by the shell + split-view host. *(Rule 6)*
- **NFR-305** All new behavior in this step shall be covered by one curated Playwright journey for F3 and focused component tests for saved-view mapping.

## 8. Acceptance criteria and owning test layer

| ID | Acceptance criteria | Owner test |
|---|---|---|
| **AC-301** | Given `/work/tasks?view=mine`, When the workspace loads, Then the My work chip is active and the existing workspace behaves as the shipped `segment='mine'` scope. | component (`useTasksSavedView` / `TasksWorkspace`) |
| **AC-302** | Given `/work/tasks?view=overdue`, When the workspace loads, Then only overdue tasks are shown and the existing overdue-only chip/state is active. | component (`TasksWorkspace`) |
| **AC-303** | Given `/work/tasks?view=team`, When the workspace loads, Then the Team work chip is active and the existing org-visible task set is shown without inventing a new team query. | component (`TasksWorkspace`) |
| **AC-304** | Given `/work/tasks?view=bogus`, When the workspace loads, Then the base Tasks view renders safely and no crash occurs. | component (`useTasksSavedView`) |
| **AC-305** | Given `/work/tasks?view=mine`, When the viewer changes Group / Unit / Status / Person after load, Then those controls still work and the saved view only seeds defaults. | component (`TasksWorkspace`) |
| **AC-306** | Given `/work/tasks?view=overdue`, When the viewer opens a task, refreshes, and closes the drawer, Then the record URL and the overdue view are preserved across each step. *(Rule 4, F3)* | Playwright |
| **AC-307** | Given `/work/tasks/:taskId?view=mine` opened directly in a new tab, When the route resolves, Then the existing Tasks layout and record surface open the same task with `?view=mine` still present. *(Rule 4)* | Playwright |
| **AC-308** | Given `/work/tasks/new?view=mine&r=<personId>`, When the viewer cancels or creates, Then the route returns to the corresponding `?view=mine` Tasks context while preserving existing prefill behavior. | Playwright |
| **AC-309** | Given the Tasks route under Work, When it renders with and without an open record, Then the route still uses the existing shell header/context/content/drawer anatomy and does not mount a second drawer host. *(Rule 6)* | component/route composition test |
| **AC-310** | Given the step diff, When reviewed against the implementation inventory, Then task table/detail behavior is delivered by rewiring `TasksWorkspace`, `TaskDrawer`, and `TaskSurface` rather than a replacement surface. *(Rule 11)* | review ledger + targeted route composition test |
| **AC-311** | Given `/work/tasks?view=followups` before Step 9 convergence, When the workspace loads, Then the Follow-ups chip and breadcrumb are present and the content explicitly states that task-backed follow-ups are not wired in this step. | component |

## 9. Error-handling table

| Scenario | Required behavior |
|---|---|
| Unknown `?view=` value | Fall back to base Tasks workspace; no crash; chips show no saved-view selection. |
| `?view=all` | Treat as base Tasks workspace for compatibility. |
| Open task no longer matches current saved-view filter | Keep the record open; do not mutate the URL or force-close the drawer. |
| Task not found / no access | Preserve the existing not-found panel behavior, but its return link must keep the prior `?view=` if present. |
| Create cancelled from a saved view | Return to the prior `/work/tasks?view=...` context. |
| Archive from a saved view | Return to the prior `/work/tasks?view=...` context after existing archive flow completes. |
| `view=followups` requested before convergence exists | Show explicit reserved-state copy; do not silently show unrelated tasks as follow-ups. |
| Task list load failure | Preserve existing error/retry state; saved-view selection remains encoded in the URL. |

## 10. Deviations and explicit limits

1. **User brief path deviation:** the repo paths are lowercase/hyphenated, not the camel-case paths named in the brief. Verified equivalents:
   - `mos-app/src/pages/tasks-layout.tsx`
   - `mos-app/src/components/tasks/tasks-workspace.tsx`
   - `mos-app/src/components/tasks/task-surface.tsx`
   - `mos-app/src/components/tasks/task-drawer.tsx`
   - `mos-app/src/components/tasks/group-header-row.tsx`
   - `mos-app/src/components/tasks/use-tasks-view-pref.ts`
   - `mos-app/src/components/tasks/tasks-toolbar.tsx` (**no `ViewTabStrip.tsx` exists; the current seam is `TasksToolbar` + shared `ViewTabs`**)
2. **Team work is a label-level re-home, not new data semantics.** The shipped Tasks DB-view has no true reporting-line/team filter; `view=team` therefore maps to the existing org-visible workspace in this step.
3. **Follow-ups cannot be truthfully filtered from `mos.tasks` in this step.** The current follow-up model still lives in `mos.follow_ups`; this spec reserves the saved-view contract and requires explicit placeholder copy instead of a fake task filter.
4. **Only saved-view URL state is added here.** Group / Unit / Status / Person / search / archived controls remain non-URL state in this step.
5. **This spec re-wires, never rebuilds.** No replacement table, drawer, or detail page is permitted.

## 11. Implementation TODO checklist

- [ ] Add a thin saved-view resolver (hook or equivalent) that maps `location.search` to workspace defaults.
- [ ] Rewire `TasksLayout` to read the saved-view state and feed the existing workspace.
- [ ] Rewire `TasksToolbar` to replace the old Mine/RACI/All segment with saved-view chips.
- [ ] Rewire `TasksWorkspace` so `?view=` seeds `segment` / `overdueOnly` without replacing existing controls.
- [ ] Preserve `location.search` on row open, drawer close, keyboard open/close, new task, cancel, create success, archive success, and not-found return links.
- [ ] Keep `GroupHeaderRow`, grouping persistence, table grammar, mobile cards, and drawer slot unchanged except for saved-view wiring.
- [ ] Add component tests for view parsing and view→filter mapping.
- [ ] Add the curated Playwright F3 journey for `/work/tasks?view=overdue` covering open → refresh → back/close.
- [ ] Capture owner review screenshots for desktop + 390px with the reference surface from the salvage inventory.
- [ ] Score Experience Contract Rules 4, 6, and 11 in the review ledger.

## 12. Verification

- Read and verified existing files at the paths listed in §10.  
- Confirmed this spec is a **rewire spec**, not a rebuild spec.  
- Confirmed the only justified new seam is a thin saved-view mapping helper.

SPEC-DONE
