# UI-revamp build plan — records workspace (shell · table · record page · My Week · ⌘K · states/AA)

- **Date:** 2026-06-19
- **Spec authority:** the signed-off mockups in `docs/design-mockups/ui-revamp/*.html` (binding
  DESIGN-PLAN ANCHORs), `docs/plans/2026-06-19-ui-revamp-design-plan.md` (live spec = OD-P4-9/10/11 +
  Appendix A; §1.3/§2.3 are SUPERSEDED), `docs/decisions.md` OD-P4-9/10/11, ADR-0013.
- **Architecture:** `docs/adr/0013-records-workspace-ui-architecture.md`.
- **Constraints:** all color via runtime tokens (no literals — `engineering-conventions.md` §1b); `@/`
  alias imports only; named exports; coverage ≥80% on changed code; `npm run typecheck` + ESLint
  `--max-warnings=0` clean; file-size budget (no new file > ~350 lines; the table decomposition exists to
  honor it). **Filenames:** new files use the existing PascalCase neighbors (`TopBar.tsx`, not
  `top-bar.tsx`) — the kebab-case codemod (`engineering-conventions.md` §2) is a separate in-flight PR
  that owns the rename; do not pre-empt it.
- **TDD:** every behavior task writes the failing test FIRST (red), then the implementation (green). The
  test title carries its `AC-###` so `grep -rn AC-### mos-app/src` finds the proof.
- **Token crosswalk:** the mockups use `--ds-*`; the app uses shadcn HSL tokens. Map per design-plan §8.
  Key mappings used below: `--ds-background-secondary`→`bg-secondary`/`bg-accent` (row hover),
  `--ds-font-color-tertiary`/`-light`→`text-muted-foreground`, `--ds-color-blue`→`text-primary`/
  `bg-primary`, borders→`border-border`. Status tags use the existing `StatusPill` (already token-mapped).

> **AC IDs** are namespaced per surface to avoid collisions with shipped specs: shell `AC-S##`,
> table `AC-T##`, record page `AC-R##`, My Week `AC-W##`, ⌘K `AC-K##`, states/AA `AC-D##`.

---

## PR sequence (each PR is one surface, independently shippable)

| PR | Surface | New AC count | Net-new behavior? |
|----|---------|-------------|-------------------|
| PR-1 | Shell — brand-left top bar + nav-only rail | 8 (AC-S01..S08) | No (relocation) |
| PR-2 | Record table (Tasks) — overline + tag + hover affordances + decomposition | 7 (AC-T01..T07) | No (token/craft + refactor) |
| PR-3 | Record page — two-column hybrid internals | 6 (AC-R01..R06) | No (re-layout) |
| PR-4 | My Week — shared header + wire My-tasks to real R/A data | 6 (AC-W01..W06) | **Yes** (table wiring) |
| PR-5 | ⌘K command palette + task-search read path | 9 (AC-K01..K09) | **Yes** (palette + search) |
| PR-6 | States + dark-mode AA pass (cross-cutting) | 5 (AC-D01..D05) | No (states/AA hardening) |

**Total: 41 ACs.** Dependency order: PR-1 → PR-2 → PR-3 (PR-3 reuses table row pieces) → PR-4 (reuses
PR-2 row treatment) → PR-5 (depends on ADR-0013 search seam; opens `/tasks/:id` from PR-3) → PR-6
(audits all five). PR-5 may ship before PR-4 if scheduling demands — they are independent.

---

# PR-1 — Shell: brand-left top bar + navigation-only rail

**Goal:** replace the near-empty `Header` with a populated brand-left `TopBar`; strip the rail to nav-only.
**Files:** `src/shell/TopBar.tsx` (new), `src/shell/TopBar.test.tsx` (new), `src/shell/AppShell.tsx`,
`src/shell/RailNav.tsx`, `src/shell/RailNav.test.tsx`, `src/shell/Breadcrumb.tsx`,
`src/shell/Breadcrumb.test.tsx`. Retire: `src/shell/Header.tsx` + `Header.test.tsx` (folded into TopBar).

### Acceptance criteria

- **AC-S01** Given an authenticated viewer, When the shell renders at ≥920px, Then the top bar shows, in
  order: brand lockup (logo + "Gordi MOS") · breadcrumb · ⌘K search trigger · notification bell · user chip.
- **AC-S02** Given the top bar, When measured, Then the brand column is a fixed 236px element with a right
  divider (`border-r border-border`), and the breadcrumb track is `min-width:0` (a long crumb cannot shove
  the brand or the right cluster).
- **AC-S03** Given a very long breadcrumb current crumb, When it overflows, Then it ellipsizes
  (`truncate`) and carries a `title` attribute (no wrap, no push).
- **AC-S04** Given the user is on `/tasks`, When the breadcrumb renders, Then it reads `Tasks` (the leading
  "Gordi MOS" crumb is dropped); on `/tasks/new` it reads `Tasks › New task`.
- **AC-S05** Given the rail renders, Then it contains only the "Workspace" nav group + the Settings stub —
  no workspace switcher, no in-rail search row, no foot user chip.
- **AC-S06** Given the top bar at <920px, Then a hamburger button (`aria-label="Open navigation"`) is the
  leading element and opens the mobile drawer; at ≥920px the hamburger is absent.
- **AC-S07** Given the notification bell, Then it is an icon-only control with an accessible name
  (`aria-label="Notifications"`) and is a non-functional stub (disabled / no-op), not a live feature.
- **AC-S08** Given the top bar, Then there is exactly one `<main>` landmark in the shell (the page outlet),
  and the top bar is a `<header>` banner; the user chip's name ellipsizes (`truncate` + `title`).

### Tasks

1. **(test, AC-S05)** In `src/shell/RailNav.test.tsx` add `it('AC-S05: rail has nav group + Settings only — no switcher/search/userchip')`: render `<RailNav />` inside a `MemoryRouter` + auth stub; assert `queryByRole('button', { name: /Gordi MOS workspace/ })` is null, `queryByRole('button', { name: 'Search' })` is null, `queryByText('Workspace')` is present, `getByText('Settings')` is present, and there is no `UserChip` (`queryByRole('button', { name: viewer.full_name })` null). Run `npm test -- RailNav` → red.
2. **(impl, AC-S05)** In `src/shell/RailNav.tsx` delete the workspace-switcher `<div>` (lines ~30–58), the in-rail search `<div>` (lines ~60–78), and the foot user-chip `<div>` (lines ~140–143) + the `UserChip` import. Keep the `<nav aria-label="Primary">` group + the Settings stub. Run `npm test -- RailNav` → green.
3. **(test, AC-S01/S07/S08)** Create `src/shell/TopBar.test.tsx`: render `<TopBar onOpenDrawer={vi.fn()} />` in `MemoryRouter initialEntries={['/tasks']}` + authenticated auth stub. `it('AC-S01: top bar shows brand · breadcrumb · search · bell · user in order')` — assert `getByText('Gordi MOS')` (brand), `getByRole('navigation', { name: 'Breadcrumb' })`, `getByRole('button', { name: /Search/ })`, `getByRole('button', { name: 'Notifications' })`, `getByRole('button', { name: viewer.person.full_name })` all present. `it('AC-S07: notification bell is a disabled stub')` — assert the bell button has `aria-disabled="true"` (or `disabled`). `it('AC-S08: top bar is a banner with one header')` — assert `getByRole('banner')` exists. Run `npm test -- TopBar` → red.
3 files: also stub the `onOpenDrawer` prop type.
4. **(impl, AC-S01/S02/S07/S08)** Create `src/shell/TopBar.tsx` exporting `function TopBar({ onOpenDrawer, onRegisterHamburgerFocus }: TopBarProps)`. Root: `<header className="bg-background border-b border-border flex items-stretch flex-none" style={{ height: 'var(--header-h)' }}>`. Children in order:
   - Brand column: `<div className="flex items-center gap-2 border-r border-border px-3 flex-none" style={{ width: 236 }}>` containing the Gordi logo mark (copy the navy-square + orange-dot markup from the old `RailNav` switcher, `bg-brand-navy` square + `bg-brand-orange` dot) and `<span className="truncate font-semibold text-foreground" title="Gordi MOS" style={{ fontSize: 14 }}>Gordi MOS</span>`.
   - Breadcrumb track: `<div className="flex items-center px-4 flex-1 min-w-0"><Breadcrumb /></div>` (the `min-w-0` enables AC-S02 ellipsize).
   - Right cluster: `<div className="flex items-center gap-2 px-3 flex-none">` containing (a) the ⌘K search trigger (move the markup from old `RailNav`: search glyph + "Search" + `⌘K` kbd, `aria-label="Search"`; `onClick` left as a TODO no-op for PR-1 — wired in PR-5), (b) the notification bell button `aria-label="Notifications"` `disabled` with a 16px bell SVG (`aria-hidden`), (c) `<UserChip variant="header" />`.
   Define `interface TopBarProps { onOpenDrawer: () => void; onRegisterHamburgerFocus?: (fn: () => void) => void }`. Run `npm test -- TopBar` → green.
5. **(test, AC-S06)** In `TopBar.test.tsx` add `it('AC-S06: hamburger appears <920px and opens drawer')`: mock `useIsNarrow` → true, render, assert `getByRole('button', { name: 'Open navigation' })` present and `fireEvent.click` calls `onOpenDrawer`; then mock → false and assert the button is absent. Run `npm test -- TopBar` → red.
6. **(impl, AC-S06)** In `TopBar.tsx` import `useIsNarrow`; when narrow, render the hamburger button (copy the SVG + `hamburgerRef` + `onRegisterHamburgerFocus` `useEffect` pattern from the old `Header.tsx` lines 11–51) as the **first** child, before the brand column. Run `npm test -- TopBar` → green.
7. **(impl, AC-S01)** In `src/shell/AppShell.tsx` replace `import { Header }` with `import { TopBar }` and swap `<Header .../>` → `<TopBar onOpenDrawer={...} onRegisterHamburgerFocus={...} />` (same props). Delete `src/shell/Header.tsx` and `src/shell/Header.test.tsx` (`git rm`). Run `npm test -- AppShell` → green.
8. **(test, AC-S04)** In `src/shell/Breadcrumb.test.tsx` update the goal-oracle (deliberate UX change per OD-P4-11): add `it('AC-S04: breadcrumb drops the leading brand crumb')` — render at `/tasks`, assert `getByText('Tasks')` present and `queryByText('Gordi MOS')` is null; render at `/tasks/new`, assert text content is `Tasks › New task`. Update any existing assertion that expected the leading "Gordi MOS" crumb. Run `npm test -- Breadcrumb` → red.
9. **(impl, AC-S04)** In `src/shell/Breadcrumb.tsx` remove the leading `<span>Gordi MOS</span>` + its trailing separator (lines 28 + the first `›`); the section crumb becomes the first element. Wrap the current crumb in `truncate` + `title={leaf ?? section?.label}` for AC-S03. Update the docstring. Run `npm test -- Breadcrumb && npm run typecheck` → green.
10. **(verify)** `cd mos-app && npm run typecheck && npx eslint src/shell --max-warnings=0 && npm test -- shell` — all green; `grep -rn "from './Header'" src` returns nothing.

**Existing tests to update:** `Header.test.tsx` is removed; `AppShell.test.tsx` updated for `TopBar`;
`Breadcrumb.test.tsx` goal-oracle updated (deliberate UX change — dropped brand crumb). The
`RailNav.test.tsx` cases asserting switcher/search/userchip are removed (those features moved).

---

# PR-2 — Record table (Tasks): overline + soft tag + hover affordances + decomposition

**Goal:** apply the kit table craft (OD-P4-10 overline, hover-revealed checkbox + ⋯, name-as-Chip-link,
50px dense rows) AND decompose `TasksWorkspace.tsx` (~808 lines) under the file-size budget — **no
behavior change** (all existing tasks-dbview/raci ACs stay green).
**Files:** `src/components/tasks/TasksWorkspace.tsx`, `src/components/tasks/TasksToolbar.tsx` (new),
`src/components/tasks/TasksTableBody.tsx` (new), `src/components/tasks/TaskRow.tsx` (new),
`src/components/tasks/RowCheckbox.tsx` (new), `src/components/tasks/RowMenu.tsx` (new),
`src/components/tasks/TasksWorkspace.css`, plus the matching `*.test.tsx`.

### Acceptance criteria

- **AC-T01** Given the Tasks table, When `<thead><th>` render, Then column headers are UPPERCASE with
  0.06em tracking, weight 400, color `text-muted-foreground` (the OD-P4-10 lighter overline) — scoped to
  `thead th` only (group headers + rail labels keep weight 600/500).
- **AC-T02** Given a task row at rest, When not hovered/selected/focused, Then the checkbox column and the
  row ⋯ menu are visually hidden; When the row is hovered, selected, or `:focus-within`, Then both are
  revealed (keyboard reaches them via `:focus-within`, not hover-only).
- **AC-T03** Given a task row, When the name cell renders, Then it is a real `<a href="/tasks/:id">`
  styled as a Chip (hover background), middle-clickable, with the name `truncate` + `title`.
- **AC-T04** Given a row, When hovered, Then the row fill is `bg-secondary` (kit row-hover), and a
  selected row is `bg-accent` (the existing `row-selected`).
- **AC-T05** Given the status cell, Then it renders the soft `StatusPill` (dot + text, never color-alone)
  and never wraps (`white-space:nowrap`).
- **AC-T06** Given a body row, When measured, Then it is 50px tall (OD-P3-6 dense DB-view) — unchanged.
- **AC-T07** Given the `select-all` header checkbox is partially selected, Then it exposes
  `aria-checked="mixed"`; each row checkbox is keyboard-focusable with `aria-checked`. *(Selection is
  presentational scaffolding for the hover-reveal; no bulk action ships this PR — the checkbox toggles a
  local selected set only.)*

### Tasks

1. **(test, AC-T01)** In `TasksWorkspace.test.tsx` add `it('AC-T01: thead th use the lighter weight-400 uppercase overline')`: render the populated table, get a `columnheader` (e.g. name `/Task/`), assert its computed/className carries the overline (assert the CSS class `th-cell` and that `TasksWorkspace.css` `.th-cell` rule is weight 400 — see task 2; for the unit test assert `getByRole('columnheader', { name: /Task/ }).className` contains `th-cell`). Run → red only if class missing.
2. **(impl, AC-T01)** In `src/components/tasks/TasksWorkspace.css` set the `.tasks-table thead th, .th-cell` rule to `font-weight: 400; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-foreground); font-size: var(--ds-font-size-xs)`. Remove any `font-weight: 600` on `th-cell`. Run `npm test -- TasksWorkspace` → green.
3. **(test, AC-T03/T04/T05/T06)** Create `src/components/tasks/TaskRow.test.tsx`: render a single `<TaskRow task={fixture} ... />` inside `<table><tbody>` + `MemoryRouter`. `it('AC-T03: name cell is an anchor to /tasks/:id')` — assert `getByRole('link', { name: fixture.title })` has `href` ending `/tasks/${fixture.id}` and `title=fixture.title`. `it('AC-T05: status is a dot+text pill that never wraps')` — assert the `StatusPill` text present and its wrapper class includes the nowrap rule. `it('AC-T06: row height is 50px')` — assert the `<tr>` class/style sets 50px. Run → red.
4. **(impl, AC-T03/T04/T05/T06)** Create `src/components/tasks/TaskRow.tsx` exporting `function TaskRow(props: TaskRowProps)`. Extract the `renderRow` body from `TasksWorkspace.tsx` (lines 465–503) verbatim into this component; type `TaskRowProps` from the closure values it reads (`task`, `now`, `condensed`, `selectedId`, `cursor`, `leafIndex`, `cursorRowRef`, `buMap`, `personMap`, `buildOthers`, `navigate`). Keep the `<a className="task-row-link">` name cell, `StatusPill`, `OwnerCell`. Add a leading `<td>` rendering `<RowCheckbox>` (task 5) and a trailing `<td>` rendering `<RowMenu>` (task 6). Update `TasksWorkspace.tsx` to `import { TaskRow }` and call `<TaskRow ... />` in both the plain and virtualized bodies (replacing the inline `renderRow`). Run `npm test -- TaskRow TasksWorkspace` → green.
5. **(impl+test, AC-T02/T07)** Create `src/components/tasks/RowCheckbox.tsx` exporting `function RowCheckbox({ checked, indeterminate, onChange, label }: RowCheckboxProps)` — a `<button role="checkbox" aria-checked={indeterminate ? 'mixed' : checked} aria-label={label} tabIndex={0}>` rendering a 16px box (`border-input`, checked fill `bg-primary`, radius `--radius-xs`). Create `RowCheckbox.test.tsx`: `it('AC-T07: exposes aria-checked mixed when indeterminate')` + `it('AC-T07: toggles via keyboard Enter/Space')`. Add the `.row-checkbox` CSS in `TasksWorkspace.css` with `visibility:hidden` at rest and `visibility:visible` on `tr:hover .row-checkbox, tr.row-selected .row-checkbox, tr:focus-within .row-checkbox`. Run → red→green.
6. **(impl+test, AC-T02)** Create `src/components/tasks/RowMenu.tsx` exporting `function RowMenu({ taskId }: { taskId: string })` — a ⋯ icon `<button aria-label="Row actions">` (16px, `text-muted-foreground`) with a small popover stub containing an "Open" `<Link to={/tasks/:id}>` item (the only action this PR; archive lives in the surface). Create `RowMenu.test.tsx`: `it('AC-T02: ⋯ menu is hidden at rest, revealed on hover/focus-within')` (assert the `.row-menu` visibility class) + `it('opens a menu with an Open item')`. Add the `.row-menu` reveal CSS mirroring task 5. Run → red→green.
7. **(impl, decomposition)** Extract the toolbar (lines 580–689) into `src/components/tasks/TasksToolbar.tsx` exporting `function TasksToolbar(props: TasksToolbarProps)` — props are the control values + setters (`groupBy/setGroupBy`, `businessUnitId/setBusinessUnitId`, `statusFilter/setStatusFilter`, `personFilter/setPersonFilter`, `segment/setSegment`, `segmentDisabled`, `searchText/setSearchText`, `includeArchived/setIncludeArchived`, `buOptions`, `personOptions`, `showNewTask`). Extract the body (`<thead>` + `<tbody>` plain/virtualized branches, lines 691–802) into `src/components/tasks/TasksTableBody.tsx` exporting `function TasksTableBody(props)`. `TasksWorkspace.tsx` keeps the data/state orchestration + composes `<TasksToolbar />` + `<TasksTableBody />`. Target: each file < 350 lines. No new assertions — the existing `TasksWorkspace.test.tsx` suite is the regression oracle (must stay green). Run `npm test -- tasks && npm run typecheck` → green.
8. **(verify)** `cd mos-app && npm run typecheck && npx eslint src/components/tasks --max-warnings=0 && npm test -- tasks && wc -l src/components/tasks/TasksWorkspace.tsx` (assert < 350). All existing tasks-dbview / tasks-raci ACs still green.

**Existing tests to update:** none deleted — `TasksWorkspace.test.tsx` is the decomposition regression
oracle (goal-oracle unchanged). New behavior gets new tests only.

---

# PR-3 — Record page: two-column hybrid internals

**Goal:** re-lay-out `TaskSurface`'s view-mode internals to the kit's two-column anatomy (left details
panel + right tabbed feed) at `full` and `drawer` widths — routing/state contract unchanged (ADR-0013
Decision 3). The `full` width becomes the two-column **record page**.
**Files:** `src/components/tasks/TaskSurface.tsx`, `src/components/tasks/RecordDetailsPanel.tsx` (new),
`src/components/tasks/RecordFeed.tsx` (new) — or reuse existing `RaciCard`/`ChecklistCard`/`ActivityCard`
inside them, `src/components/tasks/TaskSurface.css`, plus matching `*.test.tsx`.

### Acceptance criteria

- **AC-R01** Given a task open at `full` width, When the record page renders, Then it is a two-column
  layout: a fixed-width left details panel (~332px) + a `min-width:0` right feed column (long notes wrap
  inside the feed, never widen the grid — Appendix A).
- **AC-R02** Given the left details panel, Then it shows the identity row (task name `--ds-font-size-xl`
  weight 600 + sub-line BU · code in `text-muted-foreground`) above field sections Ownership (R/A/C/I) ·
  Status (inline `StatusTrigger` for editors) · Dates · Checklist count — status + R/A above the fold
  (Lens-D Q3).
- **AC-R03** Given the right feed, Then it has a tab strip Activity / Checklist / Notes with the active
  tab marked by weight + a 2px `border-primary` underline (never color-alone), `role="tablist"`/`tab`/
  `tabpanel`, roving tabindex, arrow-key nav. The feed never carries a weekly-update write/ack affordance.
- **AC-R04** Given a non-R/A viewer (not editable), Then the left panel fields are read-only (no edit
  affordance), per the existing `canEdit` permission — unchanged behavior, new layout.
- **AC-R05** Given an archived task, Then the read-only banner + Unarchive (for A/manager) render above
  the two columns — unchanged behavior.
- **AC-R06** Given the surface at `drawer` width, Then the same two-column anatomy compresses to the
  drawer (left details stacked compact above the feed at <1100px modal), and `expanded` promotes to the
  full two-column record page on the same URL — the `width`/`expanded` regimes are unchanged.

### Tasks

1. **(test, AC-R01)** In `TaskSurface.test.tsx` add `it('AC-R01: full width renders a two-column record page')`: render `<TaskSurface taskId={id} mode="view" width="full" />` with mocked `getTask`/directory; await load; assert a left panel region (`getByRole('region', { name: 'Task details' })` or a `data-testid="record-details"`) and a right feed region (`getByRole('tablist')`) both present, and that the layout root has the `record-2col` class. Run → red.
2. **(impl, AC-R01/R02)** Create `src/components/tasks/RecordDetailsPanel.tsx` exporting `function RecordDetailsPanel(props: RecordDetailsPanelProps)`: identity row (`<h1 className="task-title">` name + sub-line `{buName} · {code}` in `text-muted-foreground`), then the field sections — reuse `<StatusTrigger>`/`<StatusPill>` (per `editable`), `<RaciCard>`, dates (`formatDate`), checklist count. Props mirror what the `full` branch passes today (`task`, `buName`, `editable`, `archiveable`, `viewerId`, `peopleDirectory`, `now`, the `onStatusChange`/`onRaChange`/`onRaciChange` handlers). Wrap as `<section aria-label="Task details" data-testid="record-details" className="record-details">`. Run `npm test -- TaskSurface` (AC-R01 not yet wired) → still red.
3. **(impl, AC-R03)** Create `src/components/tasks/RecordFeed.tsx` exporting `function RecordFeed(props: RecordFeedProps)`: a tab strip reusing the existing `<TaskTabStrip>` (tabs Activity / Checklist / Notes — map `details`→ keep current tab keys; Notes is the existing description/notes pane) + the active tabpanel rendering `<ActivityCard>` / `<ChecklistCard>` / the notes section. Active tab underline = `border-b-2 border-primary` + weight. Reuse `useTabMemory`. Run `npm test -- RecordFeed` (write its test next).
4. **(test, AC-R03)** Create `RecordFeed.test.tsx`: `it('AC-R03: tab strip is a tablist with one selected tab marked by underline')` — assert `getByRole('tablist')`, exactly one `tab` with `aria-selected="true"`, arrow-key moves selection; `it('AC-R03: feed has no weekly-update write affordance')` — assert no button/link named `/write update|submit update|acknowledge/i`. Run → green after task 3.
5. **(impl, AC-R01/R04/R05/R06)** In `TaskSurface.tsx`, rewrite the `full` branch (lines 416–528) to a two-column grid: `<div className="record-2col">` → `<RecordDetailsPanel .../>` (fixed ~332px) + `<div className="record-feed-col" style={{minWidth:0}}><RecordFeed .../></div>`. Keep the archived banner (AC-R05) + `ConfirmArchive` above the grid. Keep the `drawer` branch but route its tab body through `<RecordFeed>` and its top block through a compact `<RecordDetailsPanel compact />` (AC-R06) — the existing `width`/`expanded` plumbing is untouched. Add `.record-2col`/`.record-details`/`.record-feed-col` rules to `TaskSurface.css` (grid `[332px | 1fr]`, left `border-r border-border`, feed `min-width:0`). Run `npm test -- TaskSurface RecordFeed` → green.
6. **(verify)** `cd mos-app && npm run typecheck && npx eslint src/components/tasks --max-warnings=0 && npm test -- TaskSurface RecordFeed RecordDetailsPanel TaskDrawer`. All existing tasks-raci / detail ACs still green (the inline-edit, optimistic-save, archive, permission ACs are the regression oracle).

**Existing tests to update:** `TaskSurface.test.tsx` — the `full`-width layout assertions change
(deliberate UX change: two-column). The goal-oracle (status/RACI editable, optimistic save, archive,
read-only viewer) stays; only structural selectors update.

---

# PR-4 — My Week: shared header + wire "My tasks" to real R/A data

**Goal:** share the PR-2 overline treatment on the My-Week mini-table, and **wire the "My tasks" card to
real tasks where the viewer is R or A** (today it is a hardcoded empty `<tr>` stub — `MyWeek.tsx`
lines 190–202). This is the one net-new behavior in this PR.
**Files:** `src/pages/MyWeek.tsx`, `src/components/weekly/MyTasksCard.tsx` (new),
`src/components/weekly/MyTasksCard.test.tsx` (new), `src/pages/MyWeek.test.tsx`. Reuse
`@/lib/db/tasks` `listTasks`, `@/lib/raciMember` `raciOwner`, `@/components/tasks/StatusPill`,
`@/components/tasks/OwnerCell`, `@/components/tasks/taskFormatters`.

### Acceptance criteria

- **AC-W01** Given a viewer with tasks where they are R or A this week, When My Week loads, Then the
  "My tasks" card lists those rows (name Chip-link → `/tasks/:id` · status pill · owner R-avatar+"+N" ·
  due · activity-age), ordered off-track-first (In Progress → Blocked → Open → Done, then due asc).
- **AC-W02** Given the "My tasks" card, When the mini-table `<th>` render, Then they use the shared
  weight-400 uppercase `text-muted-foreground` overline (same treatment as PR-2 AC-T01) — replacing the
  current `font-semibold` inline headers.
- **AC-W03** Given a viewer with no R/A tasks this week, When loaded, Then the card shows
  "No tasks where you're R or A this week — you're clear." (existing copy, preserved).
- **AC-W04** Given the My-tasks fetch is in flight, Then the card shows skeleton rows (chrome stays); on
  failure it shows a scoped inline error + Retry (the rest of My Week is unaffected — independent module).
- **AC-W05** Given a non-manager viewer, Then no team module renders; Given a manager, Then the
  role-conditional team module renders (OD-P0-7/8) — unchanged behavior.
- **AC-W06** Given a task name cell, When it overflows, Then it ellipsizes + carries `title`; status tags
  never wrap (Appendix A).

### Tasks

1. **(test, AC-W01/W02/W03/W06)** Create `src/components/weekly/MyTasksCard.test.tsx`: mock `listTasks` to return a fixture set; render `<MyTasksCard viewerId={id} now={fixedNow} />` in `MemoryRouter`. `it('AC-W01: lists R/A tasks off-track-first as name-chip links')` — assert rows present, first row is the In-Progress/Blocked one, name is a `link` to `/tasks/:id`. `it('AC-W02: mini-table th use the weight-400 overline')` — assert the `<th>` className/computed weight is 400 + uppercase. `it('AC-W03: empty → you are clear copy')` — `listTasks`→`[]`, assert the clear message. Run → red.
2. **(impl, AC-W01/W02/W03/W06)** Create `src/components/weekly/MyTasksCard.tsx` exporting `function MyTasksCard({ viewerId, now }: MyTasksCardProps)`: `useEffect` → `Promise.all([listTasks({}), getBusinessUnits(), getPeople()])`, filter to `raciOwner(t, viewerId)` (R or A — `raciOwner` already encodes R+A), sort off-track-first (reuse the `STATUS_ORDER` order then due asc). Render the `CardHead` ("My tasks" / meta / "All tasks →") + a `<table className="mini">` whose `<thead><th>` use the shared overline class, `<tbody>` rows reuse `<StatusPill>` + `<OwnerCell>` + `formatDate`/`formatAge`, name cell = `<Link className="name-chip truncate" title={t.title}>`. Empty → the AC-W03 message. Run `npm test -- MyTasksCard` → green.
3. **(test, AC-W04)** In `MyTasksCard.test.tsx` add `it('AC-W04: loading shows skeleton, error shows scoped Retry')` — assert `aria-busy` skeleton while the promise is pending; make `listTasks` reject and assert `getByRole('button', { name: /Retry/ })` + that calling it refetches. Run → red.
4. **(impl, AC-W04)** Add `loading`/`error` state machine to `MyTasksCard` (mirror the `OpsStrip` pattern): skeleton `<tbody>` rows while loading; on error a centered inline block with a Retry button calling the loader. Run `npm test -- MyTasksCard` → green.
5. **(impl, AC-W01)** In `src/pages/MyWeek.tsx` replace the hardcoded `<section aria-label="My tasks this week">…</section>` block (lines 119–203) with `<MyTasksCard viewerId={personId} now={now} />`. Remove the now-dead inline `<table>`/`<thead>` markup. Keep the dominant-module ordering (My-tasks card first, then ≤2 strips, then team module). Run `npm test -- MyWeek` → green.
6. **(test+verify, AC-W05)** Confirm the existing `MyWeek.test.tsx` manager/non-manager team-module cases still pass (AC-W05 is the existing oracle — do not change it). `cd mos-app && npm run typecheck && npx eslint src/pages/MyWeek.tsx src/components/weekly --max-warnings=0 && npm test -- MyWeek MyTasksCard`.

**Existing tests to update:** `MyWeek.test.tsx` — the My-tasks empty-stub assertion becomes the
`MyTasksCard` empty-state assertion (the goal-oracle "a clear viewer sees the you're-clear message"
stays; the data source changes from stub to `listTasks`).

---

# PR-5 — ⌘K command palette + task-search read path

**Goal:** build the command palette (Recent + Quick actions default; typed filter across Navigate /
Records / Actions) and the task-search read path (ADR-0013 Decision 4 — a PostgREST title query, not an
RPC). The rail/top-bar ⌘K trigger opens it; `⌘K`/`Ctrl+K` opens it globally; Esc closes.
**Files:** `src/lib/db/tasks.ts` (add `searchTasksByTitle`), `src/lib/db/tasks.test.ts`,
`src/components/command/CommandMenu.tsx` (new), `src/components/command/CommandMenu.test.tsx` (new),
`src/components/command/useCommandMenu.ts` (new — open/close + global hotkey), `src/shell/TopBar.tsx`
(wire the trigger), `src/shell/AppShell.tsx` (mount the menu + hotkey provider).

### Acceptance criteria

- **AC-K01** Given the search read path, When `searchTasksByTitle('forecast')` is called, Then it queries
  `mos.tasks` selecting `id,title,status`, filters `ilike` on title, limits to ≤20 rows, and returns
  `TaskTitleRef[]` — relying on the existing RLS row-visibility (no `org_id` sent by the client).
- **AC-K02** Given the rail/top-bar ⌘K trigger, When clicked, Then the command menu opens centered with
  the search input focused; When `⌘K` (mac) / `Ctrl+K` (other) is pressed anywhere, Then it opens too.
- **AC-K03** Given the menu with an empty query, Then it shows Recent (if any) + Quick actions (New task ·
  Write weekly update · Add log entry) + Navigate (My Week · Tasks · Updates · Daily Log).
- **AC-K04** Given the user types a query, Then results filter across Navigate / Records / Actions; the
  Records group async-loads matching tasks (skeleton row while pending).
- **AC-K05** Given a record result is activated (↵ or click), Then the menu closes and navigates to
  `/tasks/:id` (the canonical record surface, ADR-0013 Decision 3).
- **AC-K06** Given the record search fails, Then the Records group shows "Couldn't search records." and
  Navigate/Actions still work (scoped failure).
- **AC-K07** Given the menu is open, Then it is `role="dialog" aria-modal="true" aria-label="Command
  menu"` with a focus trap, Esc closes, and focus returns to the trigger.
- **AC-K08** Given the menu, Then the input is `role="combobox" aria-expanded aria-controls` the listbox;
  results are `role="listbox"` with `role="option"` + `aria-selected`; the active option is tracked via
  `aria-activedescendant` (focus stays in the input); ↑↓ move active, ↵ activates, Esc closes.
- **AC-K09** Given a long record title in a result row, Then it ellipsizes + carries `title`; group labels
  use `text-muted-foreground` (AA in dark, ADR-0013 Decision 2).

### Tasks

1. **(test, AC-K01)** In `src/lib/db/tasks.test.ts` add `it('AC-K01: searchTasksByTitle queries mos.tasks ilike title, limited, id/title/status')`: mock the supabase `schema('mos').from('tasks').select(...).ilike(...).limit(...)` chain (mirror the existing `getTaskTitlesByIds` test mock); assert the select is `'id,title,status'`, `ilike` called with `'title', '%forecast%'`, `limit(20)`, and the returned shape is `TaskTitleRef[]`. Run → red.
2. **(impl, AC-K01)** In `src/lib/db/tasks.ts` add:
   ```ts
   /** Search tasks by title for the command palette (ADR-0013 D4). RLS-governed read —
    *  reuses the org-visibility policy that governs listTasks; org_id is never sent. */
   export async function searchTasksByTitle(q: string, limit = 20): Promise<TaskTitleRef[]> {
     const term = q.trim()
     if (!term) return []
     const { data, error } = await mos()
       .from('tasks')
       .select('id,title,status')
       .ilike('title', `%${term}%`)
       .is('archived_at', null)
       .order('last_activity_at', { ascending: false })
       .limit(limit)
     if (error) throw new Error(`searchTasksByTitle failed — ${error.message}`)
     return (data ?? []) as unknown as TaskTitleRef[]
   }
   ```
   Run `npm test -- lib/db/tasks` → green.
3. **(test, AC-K02/K07/K08)** Create `src/components/command/CommandMenu.test.tsx`: render `<CommandMenu open onClose={fn} />` in `MemoryRouter` + auth stub. `it('AC-K07: dialog with aria-modal, Esc closes + returns focus')`; `it('AC-K08: input is combobox, body is listbox, ↑↓ move aria-activedescendant')` — assert roles, press ArrowDown and assert `aria-activedescendant` changes; `it('AC-K02: open focuses the search input')`. Run → red.
4. **(impl, AC-K02/K03/K07/K08/K09)** Create `src/components/command/CommandMenu.tsx` exporting `function CommandMenu({ open, onClose }: CommandMenuProps)`. Structure per the mockup anchor (`mock-command-menu.html`): scrim + centered panel (`bg-popover border-border rounded-md shadow-lg`, `~560px`, top ~64px); header = search `<input role="combobox" aria-expanded aria-controls="cm-list" aria-activedescendant=...>` (sets its own `color` — ADR D2); body `<ul role="listbox" id="cm-list">` with grouped `role="option"` items (group label `text-muted-foreground uppercase`); footer key hints. Default (empty query) renders Recent + Quick actions + Navigate (static action defs: New task→`/tasks/new`, Write weekly update→`/updates`, Add log entry→`/ops/new`, Navigate→the four routes). Focus trap + Esc + return-focus (reuse the `TaskDrawer` focus-trap pattern). ↑↓/Home/End move active index; ↵ activates `items[active]`. Result rows `truncate` + `title`. Run `npm test -- CommandMenu` → green.
5. **(test, AC-K04/K05/K06)** In `CommandMenu.test.tsx` add: mock `searchTasksByTitle`. `it('AC-K04: typing loads the Records group')` — type "forecast", assert a Records group option appears (await the async); assert a skeleton row shows while pending. `it('AC-K05: activating a record navigates to /tasks/:id')` — render with a `useNavigate` spy (or assert the router location), activate the record option, assert nav to `/tasks/<id>` + `onClose` called. `it('AC-K06: search failure shows a scoped message, Navigate still works')` — reject `searchTasksByTitle`, assert "Couldn't search records." and that a Navigate option is still activatable. Run → red.
6. **(impl, AC-K04/K05/K06)** In `CommandMenu.tsx` add a debounced (~150ms) effect: when the query is non-empty, call `searchTasksByTitle(query)` into a `{ status: 'loading'|'ready'|'error', rows }` state; render the Records group accordingly (skeleton / options / "Couldn't search records."). Record option `onActivate` → `navigate(/tasks/${id})` + `onClose()`. Navigate/Actions are always rendered (scoped failure). Run `npm test -- CommandMenu` → green.
7. **(impl+test, AC-K02)** Create `src/components/command/useCommandMenu.ts` exporting `function useCommandMenu()` → `{ open, setOpen }` plus a global `keydown` listener for `(e.metaKey||e.ctrlKey) && e.key==='k'` → `e.preventDefault(); setOpen(true)`. Create `useCommandMenu.test.ts`: `it('AC-K02: ⌘K / Ctrl+K toggles open')`. Run → red→green.
8. **(impl, AC-K02)** In `src/shell/AppShell.tsx` call `useCommandMenu()`, render `<CommandMenu open={open} onClose={() => setOpen(false)} />` (outside the grid, like `MobileDrawer`), and pass an `onOpenSearch={() => setOpen(true)}` prop down to `TopBar`. In `src/shell/TopBar.tsx` wire the ⌘K search trigger `onClick={onOpenSearch}` (replacing the PR-1 no-op). Run `npm test -- AppShell TopBar` → green.
9. **(verify)** `cd mos-app && npm run typecheck && npx eslint src/components/command src/lib/db/tasks.ts src/shell --max-warnings=0 && npm test -- command tasks AppShell TopBar`. Then `grep -rn "AC-K0" src` confirms all nine tagged.

**pgTAP note (conditional):** the search read path reuses the existing `mos.tasks` RLS row-visibility
policy — **no new policy/contract, so no new pgTAP**. *Only if* the build adds a DB index (e.g.
`CREATE INDEX … ON mos.tasks USING gin (title gin_trgm_ops)`) for the `ilike` does this PR also need a
reversible migration in `supabase/migrations/` (index create + drop) — that index is **OPEN QUESTION
(owner/Director)** below; default is no index at Gordi scale.

**E2E note:** add one curated Playwright journey only if the Director deems the full ⌘K→record cross-stack
flow e2e-worthy; otherwise the Vitest/RTL coverage above is the lowest sufficient layer (the search read
contract is unit-tested at the data layer, the palette at the component layer).

---

# PR-6 — States + dark-mode AA pass (cross-cutting)

**Goal:** verify the state vocabulary (loading / empty / error / edge) per surface and fold in the
design-reviewer's three regression-invariants (RI-1/2/3) as per-surface dark-mode AA checks. Mostly
audit + small fixes; minimal new code.
**Files:** any surface CSS needing a token fix; a new test util
`src/test/darkModeContrast.test.tsx` (optional render-audit harness) if useful.

### Acceptance criteria

- **AC-D01 (RI-1)** Given any surface rendered under `.dark`, Then no element inherits the light-theme
  primary text color into a dark scope — every surface root sets its `color` explicitly (verified per
  surface: shell, table, record page, My Week, ⌘K).
- **AC-D02 (RI-2)** Given any label/meta role under `.dark` (table overline, rail group label, nav counts,
  ⌘K group labels, kbd hints), Then it resolves to `text-muted-foreground` (`--ds-font-color-tertiary`
  ≈4.6:1), never `--ds-font-color-light` (≈3.1:1).
- **AC-D03 (RI-3)** Given identity-bearing single-line strings (brand wordmark, breadcrumb current crumb,
  user name, table name cell, ⌘K result rows), Then each is `truncate` (`overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap`) + carries `title`.
- **AC-D04** Given each surface, Then loading shows a skeleton with the chrome staying put; empty
  distinguishes filtered-empty ("Clear filters") from truly-empty ("Create the first one"); error is
  scoped to the module with a Retry. *(Audit the five surfaces; fix any gap.)*
- **AC-D05** Given status tags / chips on any surface, Then they are dot + text (never color-alone) and
  `white-space:nowrap`.

### Tasks

1. **(audit+test, AC-D02)** Grep the changed CSS for the offending token: `grep -rn "font-color-light\|--ds-font-color-light" mos-app/src` and any `text-` class that should be `text-muted-foreground` on a label role. For each label role (table overline already fixed PR-2, rail group label, nav counts, ⌘K group labels, kbd hints) assert it uses `text-muted-foreground`. Write `it('AC-D02: rail group label + nav counts use muted-foreground')` in `RailNav.test.tsx`. Fix any literal. Run → green.
2. **(audit+test, AC-D01)** For each surface root (`TopBar`, `TasksWorkspace`, `TaskSurface` record page, `MyTasksCard`, `CommandMenu`), confirm the root element (or its CSS rule) sets `color`. The `CommandMenu` panel + items set `color` explicitly per the mockup pattern (already in PR-5 task 4) — add `it('AC-D01: command menu items set explicit color')` asserting the `.cm-item`/panel class carries a `color` rule (read `CommandMenu.tsx`/CSS). Run → green.
3. **(audit, AC-D03)** Confirm `truncate` + `title` on: brand wordmark (PR-1 task 4), breadcrumb current (PR-1 task 9), user name (UserChip already truncates — confirm `title`), table name cell (PR-2 task 4), ⌘K result rows (PR-5 task 4). Add a `title` to `UserChip` name if missing (one-line edit). Run `npm test -- UserChip` → green.
4. **(audit, AC-D04)** Walk the five surfaces' loading/empty/error: Tasks (already complete — `EmptyState` filtered vs truly-empty, `ErrorState` Retry); record page (`DetailSkeleton`, not-found, inline-save error); My Week (PR-4 added skeleton + scoped Retry); ⌘K (PR-5 skeleton + scoped "Couldn't search records."); shell (structural — count chip "0", breadcrumb route fallback). Document any gap as a follow-up task; fix trivial ones inline.
5. **(verify, AC-D05)** `grep -rn "white-space:\s*nowrap\|whitespace-nowrap" mos-app/src/components/tasks` confirms status tags nowrap; confirm `StatusPill` renders dot + text (it does). `cd mos-app && npm run typecheck && npx eslint src --max-warnings=0 && npm test`. Render each surface light + dark at ≥1280px and a narrow width (design-reviewer's manual gate) — no clip/wrap/overflow, AA on label text.

**Existing tests to update:** none structurally — this PR adds AA assertions and fixes token regressions.

---

## Test-layer assignment summary (per AC, lowest sufficient layer)

- **Vitest/RTL (unit/component):** AC-S01..S08, AC-T01..T07, AC-R01..R06, AC-W01..W06, AC-K02..K09,
  AC-D01..D05. (Render, states, roles, focus, token classes.)
- **Vitest (data-layer unit, mocked supabase):** AC-K01 (`searchTasksByTitle` query contract).
- **pgTAP (integration):** **none required** — the search read path reuses the existing `mos.tasks` RLS
  row-visibility contract (already covered by the tasks RLS pgTAP). *Conditional:* if the owner approves a
  trigram index, add a reversible migration (no new pgTAP unless a new policy is introduced).
- **Playwright (e2e):** none mandated. *Optional:* one curated ⌘K→record journey if the Director deems the
  cross-stack flow e2e-worthy.

---

## Director resolutions (2026-06-19)

Resolutions to the questions below so the build is unblocked (owner may override any):
1. **Search index → DEFER.** Ship `ilike` seq-scan at Gordi scale; `pg_trgm` GIN index is a reversible
   fast-follow migration when row counts warrant. PR-5 adds **no** migration.
2. **⌘K "Recent" → KEEP via `localStorage` ring buffer** (last ~5 opened `/tasks/:id`, client-only, no
   backend/RLS). Honors the signed mockup; trivial. (If it complicates PR-5, fall back to deferring the
   Recent group — Quick actions + Navigate + live Records search is a valid v1.)
3. **Notes tab → map to the existing description/notes pane** (no new data/entity) for v1. A dedicated
   notes entity is a roadmap item.
4. **My-tasks scope = R or A** — confirmed (OD-P0-8; `raciOwner` already encodes R+A).
5. **No separate spec file.** The signed-off mockups + OD-P4-9/10/11 + this plan's namespaced GWT ACs are
   the acceptance oracle — no `docs/specs/ui-revamp.spec.md` (feature-forge) needed for a presentation revamp.
6. **Filename convention at build time:** PR-1 onward follow whatever is on `main` when the surface starts
   — the kebab-case codemod lands **first** (its own PR, merged before PR-1), so new files are born
   **kebab** (`top-bar.tsx`, not `TopBar.tsx`). The plan's "use PascalCase neighbors" note applies only if
   a build PR somehow precedes the codemod merge; it should not.
7. **TasksWorkspace decomposition (PR-2)** — the escalate-don't-force instruction stands; the existing
   suite is the regression oracle.

---

## Open questions / risks for the Director

1. **⌘K search index (OPEN QUESTION — owner/Director).** `searchTasksByTitle` uses `ilike '%q%'` which
   cannot use a btree index (leading wildcard → seq scan). At Gordi scale (dozens of tasks) this is fine.
   If the task count grows, add `CREATE EXTENSION pg_trgm; CREATE INDEX … USING gin (title gin_trgm_ops)`
   as a reversible migration. **Recommendation:** ship without the index now; add it as a fast-follow
   migration when row counts warrant. Decide whether to pre-empt with the index in PR-5 or defer.
2. **⌘K "Recent" source (OPEN QUESTION — owner).** The default-state Recent group needs a source of
   recently-opened records. **Recommendation:** a `localStorage` ring buffer of the last ~5 opened
   `/tasks/:id` (client-only, no backend, no RLS concern). Confirm this is acceptable vs deferring the
   Recent group to a later slice (Quick actions + Navigate alone are a valid v1 empty state).
3. **`TasksWorkspace` decomposition risk (PR-2).** The ~808-line component carries the TanStack engine,
   grouping, virtualization, keyboard cursor, and optimistic-sync — tightly coupled via closures. The
   extraction (TaskRow / TasksToolbar / TasksTableBody) must thread many props; the regression oracle is
   the **existing** `TasksWorkspace.test.tsx` suite (must stay 100% green). **Risk:** prop-threading bugs
   in the virtualized body. Mitigation: extract `TaskRow` first (smallest, used by both body branches),
   run the full suite, then extract the body + toolbar. If the suite reveals coupling that can't be cleanly
   threaded in 2–5 min tasks, escalate — do not force the split.
4. **My Week "My tasks" wiring is net-new behavior (PR-4).** Today the card is a hardcoded empty stub; the
   mockup shows it populated. PR-4 wires it to `listTasks` + `raciOwner`. Confirm "R or A" is the intended
   scope (matches OD-P0-8 "tasks where the viewer is R or A" — `raciOwner` already encodes R+A). Risk:
   loading the full org task set client-side per My Week visit (same posture as the Tasks workspace —
   acceptable at scale; revisit with a server-side `mine` filter if it bottlenecks).
5. **Notes tab in the record feed (PR-3).** The design-plan §3.4 names the right-feed tabs
   "Activity / Checklist / Notes," but the current `TaskTabStrip` uses `details / checklist / activity`.
   **OPEN QUESTION (owner):** is "Notes" a new field/tab, or a rename of the existing description/details
   pane? **Recommendation:** map Notes → the existing description pane (no new data) for v1; a dedicated
   notes entity is a roadmap item. Confirm before PR-3.
6. **No spec file exists for this revamp.** The signed-off mockups + OD-P4-9/10/11 + the design-plan are
   the de-facto spec; this plan's per-surface ACs are authored here (namespaced `AC-S/T/R/W/K/D`). If the
   Director wants a `docs/specs/ui-revamp.spec.md` EARS spec authored first (feature-forge), say so —
   otherwise these ACs are the acceptance oracle.
