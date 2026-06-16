# Spec — Tasks UI: split-view drawer + DB-view workspace (P3)

- Feature: Tasks **UI layer** — split-view master-detail shell, variant-B drawer surface, full-bleed
  DB-view workspace with collapsible group-by, brand amendment, and `@tanstack/react-table` engine.
- Status: Shipped (2026-06-16 — PRs #15/#17/#18 split-view, PR-1/2/3 DB-view, all merged to `main`).
- Authority: `docs/decisions.md` **OD-P3-2..8** (LOCKED). Architecture: **ADR-0007** (split-view
  routing + one-UI-two-widths), **ADR-0008** (full-bleed DB-view + brand amendment + TanStack). Data
  model + RLS owned by `docs/specs/tasks-raci.spec.md` (P2-1) — this spec layers UI behavior on top
  of it; it does not reopen data or RLS decisions.
- Vocabulary: `CONTEXT.md` (used exactly); Lens-D oracle: `docs/jtbd.md` Tasks row.

> This spec closes the documentation-debt noted in both implementation plans: the AC-100..134 ids were
> introduced in the plans and must trace to a spec, not only a plan. The behavior is already live; this
> is the record of what shipped.

## Out of scope

- **Schema / RLS / migration changes** — none. This is a pure UI + design-system + one client-library
  change. The P2-1 pgTAP suite (AC-001..051) and all `lib/db/tasks.ts` signatures are untouched.
- **Board view / Calendar view** — deferred; visible as disabled "SOON" stubs only.
- **Bulk-select / row checkboxes** — deferred post-rollout (OD-P3-6).
- **Inline-cell editing** — not adopted; the drawer remains the single editor (OD-P3-6, ADR-0008).
- **Comments / free-text thread** — P2-1b (OD-P2-8), unchanged by this spec.
- **Column customisation** — no user column-toggle in v1 (OD-P3-6).
- **User column-customisation** — deferred; the condense ladder is automatic.

---

## 1. Overview & user value

This spec describes the **Tasks UI surface** layered on the `tasks-raci` data model. It covers two
shipped design slices, both governed by a single "one UI, two widths" principle:

**Slice 1 — Split-view master-detail (ADR-0007, OD-P3-2..5).** The Tasks page becomes a persistent
table (`~2/3 width`) + an actionable side drawer (`~1/3 width`, clamped 360–480px). Opening a task
no longer unmounts the table — triage continues with the drawer open (Gmail/Linear/Outlook convention).
A single `TaskSurface` component renders both the drawer and the full-width expanded focus mode; there
is no second editor and no duplicate field set (`jtbd.md` Lens-C "one home per entity" invariant).

**Slice 2 — Full-bleed DB-view workspace (ADR-0008, OD-P3-6..8).** The table is rebuilt as a
full-bleed workspace: no 1080px cap, a view-tab strip, a real toolbar, and collapsible group-by
(Status/Owner/BU) with per-group counts + overdue subtotals + "+ Add task". The row engine moves to
`@tanstack/react-table` (headless — DESIGN.md markup/tokens only). The drawer from Slice 1 is kept
verbatim as the editor surface (ADR-0007 is preserved by ADR-0008).

Primary Lens-D job (Tasks row, `docs/jtbd.md` §2): *"When I scan the work, I want to filter by
owner / RACI-role / status and spot what's off track, so I can open the one that needs attention."*
The DB-view IA (monday.com information architecture, Gordi visual register) makes the off-track signal
and ownership visible at a glance across all business units. The drawer satisfies the "open the one
that needs attention" step without destroying the scan context.

---

## 2. Domain model & vocabulary

This spec re-uses the P2-1 domain model (`docs/specs/tasks-raci.spec.md` §2) without change. The
following UI-specific terms are added:

| Term | Meaning in this spec |
|---|---|
| **Split-view** | The `TasksLayout` shell: a persistent `TasksWorkspace` table pane + an `<Outlet>` drawer slot, driven by nested routes under `/tasks`. |
| **Drawer** | The `TaskDrawer` host mounting `TaskSurface` at `width='drawer'`. Non-modal in the ≥1100px split; modal (`role="dialog"` + focus trap) in the 920–1100px overlay band and `<768px` full-screen. |
| **Expanded** | A per-user-global view toggle on the same `/tasks/:id` URL (not a new route) that grows `TaskSurface` to full width (OD-P3-3). |
| **Workspace** | `TasksWorkspace` — the full-bleed assembly: view-tab strip + toolbar + group-by table/card body (ADR-0008 D2). |
| **Group-by** | The active grouping dimension: `status` (default), `owner`, or `bu`. Persisted per-user-global (OD-P3-6). |
| **Group header** | A `GroupHeaderRow` `<tr class="grp">`: caret toggle + label + count + overdue subtotal + "+ Add task" (FR-123). |
| **Leaf row** | A task row within a group (not a group-header row). `j`/`k` cursor iterates leaf rows only. |
| **Off-track** | A task that is not Done, not archived, and has `due_date` before today-in-WIB. Computed by `isOverdue()` in `lib/dueStatus.ts` (the C1 fix: Done and archived tasks are always excluded). |
| **Transient filter chip** | A clearable filter applied by clicking "N overdue" or a group overdue subtotal; not persisted. |

---

## 3. Routing & shell architecture (ADR-0007)

The former three sibling routes (`/tasks`, `/tasks/new`, `/tasks/:taskId`) were restructured into a
nested shape. `TasksLayout` is the parent shell; the detail and create surfaces are nested children
rendered via `<Outlet>`.

```
{ path: 'tasks', element: <TasksLayout />, children: [
    { path: 'new',      element: <TaskDrawer mode="create" /> },
    { path: ':taskId',  element: <TaskDrawer mode="view" /> },
] }
```

Key routing invariants (ADR-0007 §3):
- `/tasks` (no child matched) — table renders full-width (`.split.nodrawer`); no drawer present.
- `/tasks/:id` — table stays mounted + that task's drawer renders beside it.
- `/tasks/new` — table stays mounted + drawer renders in create mode.
- **Expand is a view toggle on the same URL** — not a route push. No `/tasks/:id/full` exists.
- **Deep-link contract is preserved verbatim** — `/tasks/:id` and `/tasks/new` paths are unchanged;
  My Week and Daily Log callers were not modified (ADR-0007 §5).

`TasksLayout` passes `variant="data"` to `PageFrame`, removing the 1080px max-width cap
(`PageFrame` variant axis, ADR-0008 D1). Prose surfaces keep `variant="prose"` (default).

---

## 4. TaskSurface — one UI, two widths (ADR-0007 D1)

`TaskSurface` (in `mos-app/src/components/tasks/TaskSurface.tsx`) is the single actionable task editor.
It takes `mode: 'create' | 'view'` and `width: 'drawer' | 'full'`. Every entry path — the 1/3 drawer,
the expanded full-width focus mode, the mobile full-screen, and create — renders the same component.
There is no second editor and no duplicate field set.

### 4.1 View mode — drawer width

When `width='drawer'`:
- **Pinned header** (`TaskDrawerHeader`): title, inline `StatusTrigger` (editors) / `StatusPill`
  (viewers), R/A mini-chips, expand button, close button. Never scrolls.
- **Tab strip** (`TaskTabStrip`): roving-tabindex `role="tablist"` — **Details** (default), Checklist,
  Activity. Each tab shows a count. Last-used tab remembered per-task in `sessionStorage`
  (`mos.tasks.tab.<id>`).
- **Tab pane** (`role="tabpanel"`): Details = Description + RaciCard; Checklist = ChecklistCard;
  Activity = ActivityCard.
- **Pinned footer**: Archive button (ghost-danger; A/manager only via `canArchive`).

### 4.2 View mode — full width (expanded)

When `width='full'` (expanded or `TaskDetail` full-page host): all cards visible simultaneously (no
tabs), `page-title` title size, `.dw-tabpane { max-width: 880px; margin: 0 auto }`.

### 4.3 Expand preference

`useExpandPref` reads/writes `localStorage['mos.tasks.expandDefault']` (string `'true'`/`'false'`).
The expand toggle fires on `onExpandToggle` (keyboard `e` or the expand button) on the **same URL**
— no history push. On re-open, the persisted preference is applied.

### 4.4 Create mode

`mode='create'`: a single "New task" pane (no tab strip), `+ New task` bar in the header, Title/BU
required fields with inline-validate-on-blur errors (`--field-error-border` / `--field-error-text`),
R/A defaulted to creator, BU defaulted to creator's primary-role BU (FR-010/011). On Create success
the URL becomes `/tasks/:newId` and the surface re-renders in view mode. The create form reads
query-param pre-fills via `useSearchParams` (Owner groups → `?r=<personId>`, BU groups → `?bu=<buId>`;
Status groups → plain `/tasks/new`, no pre-fill — FR-123 Director ruling).

### 4.5 Archived and not-found states

- **Archived task**: the pinned header shows an archived banner + Unarchive (A/manager only); tabs
  render read-only; all edit affordances are suppressed (M2 invariant: `isArchived` sets `editable=false`).
- **Not-found / forbidden**: the pane shows "Task not found" + an "All tasks" link; the table remains
  usable beside it.

### 4.6 Live region (AC-111)

An off-screen `aria-live="polite"` region announces every optimistic-write outcome:
`"Status changed to X"` on success; `"Couldn't save — reverted"` on rollback. The rollback logic
itself is unchanged — the region is additive.

---

## 5. Responsive regimes (ADR-0007 §4)

Three distinct focus regimes, chosen by viewport at the URL level (same `/tasks/:id`, different render):

| Viewport | Regime | Drawer behaviour |
|---|---|---|
| ≥1100px | **Non-modal split** | `<aside>` (no `role="dialog"`, no focus trap, no scrim). Tab flows naturally between table and drawer. Table squashes to `~2/3`. |
| 920–1100px | **Modal overlay sheet** | `role="dialog"` + `aria-modal="true"` + scrim + focus trap + Esc. Table stays full-width (un-squashed). |
| <768px | **Full-screen modal** | `role="dialog"` + `aria-modal="true"` + `position:fixed; inset:0`. `TasksWorkspace` renders grouped cards behind it. |

`useIsSplitWidth` (matchMedia `(min-width: 1100px)`) and `useIsDesktop` (matchMedia `(min-width: 768px)`)
drive the regime switch. Esc always closes in modal regimes; focus is returned to the invoking row on
close.

---

## 6. TasksWorkspace — DB-view assembly (ADR-0008 D2/D3)

`TasksWorkspace` (in `mos-app/src/components/tasks/TasksWorkspace.tsx`) replaces the former `TasksTable`.
It holds one `@tanstack/react-table` instance using `getCoreRowModel()`, `getFilteredRowModel()`, and
`getSortedRowModel()`. Grouping and empty-group injection are a derived `useMemo` over the engine's
leaf rows (not `getGroupedRowModel`) — required because the Director ruling mandates the **full domain
incl. empty groups**, which TanStack's grouped row model cannot synthesize (ADR-0008 Note, PR-3 ruling).

### 6.1 Grouping

Dimensions: `status` (default, fixed 4-group set), `owner` (full `getPeople()` directory), `bu` (full
`getBusinessUnits()` directory). **All groups are always shown** including empty ones (OD-P3-6 "show
all always"). Within each group, rows sort Due-ascending (overdue first). Group state persisted via
`useTasksViewPref` (§6.3).

### 6.2 Column condense ladder (AC-113)

When the drawer is open in the ≥1100px split (`drawerOpen && splitLayout`), the table condenses:
Activity column drops first, Owner renders avatar-only, Due renders chip-only. Task column and Status
column never drop. `aria-sort` is preserved on remaining sortable headers.

### 6.3 Persistence — `useTasksViewPref`

Keys in `localStorage`: `mos.tasks.groupBy` (default `'status'`), `mos.tasks.collapsedGroups`
(JSON `{ [groupBy]: string[] }`). The `view` key (`mos.tasks.view`) is reserved for forward-compat
(Board/Calendar) but is not written/read in v1 (only `'table'` is valid). Mirrors
`useExpandPref`'s `useSyncExternalStore`-over-`localStorage` module pattern (incl.
`__resetTasksViewPrefForTests`).

### 6.4 View-tab strip (`ViewTabStrip`)

`role="tablist"` with three `role="tab"` buttons: Table (`aria-selected=true`), Board and Calendar
(`aria-disabled="true"`, `tabindex="-1"`, "SOON" pill, not activatable). Active Table tab underline:
2px `brand-orange` (the single orange sprinkle per the Orange-Sprinkle Rule).

### 6.5 Toolbar

BU filter · Status filter · Person filter · Mine/RACI/All segment · Show archived toggle · Search ·
Group-by control (brand-navy/6 bg + brand-navy border + brand-navy-text) · "N overdue" count button ·
+ New task (primary CTA). Show-archived retained (PR-3 review ruling: "keep both").

### 6.6 Mobile (<768px)

`MobileGroupedCards`: group headers + `TaskCard`s for the chosen group-by; no view-tab strip
(OD-P3-6). The compact toolbar has group-by + segment controls. Group collapse is honored.

---

## 7. Keyboard layer (OD-P3-4)

`useTasksKeyboard` attaches a `window` keydown listener. All single-letter hotkeys are suppressed when
`document.activeElement` is an INPUT / TEXTAREA / SELECT or `isContentEditable`; Esc always works.

| Key | Action |
|---|---|
| `j` | Move cursor down (leaf rows only — group-header rows are skipped) |
| `k` | Move cursor up (leaf rows only) |
| `Enter` / `o` | Open the cursor row (`navigate('/tasks/:id')`) |
| `Esc` | Close the drawer (`navigate('/tasks')`) |
| `n` | Open create drawer (`navigate('/tasks/new')`) |
| `e` | Toggle expand preference |

The cursor row gets class `.kfocus` (2px `primary` inset rule). `j`/`k` are mapped to the **leaf-row
index array** (the flat list of currently visible leaf rows, excluding headers and collapsed-group rows)
so the cursor never lands on a group-header row (OBS-121).

Group-header collapse is independently keyboard-reachable (Tab to the caret button + Enter/Space —
the `<button>` handles this natively).

---

## 8. Brand amendment (ADR-0008 D4, OD-P3-7)

Three tokens added to `DESIGN.md` and `mos-app/src/index.css` (`:root` + `@theme inline`):

| Token | Value | Rule |
|---|---|---|
| `--brand-navy` | `218 46% 22%` | Structural-Navy Rule: structural only — never action, never status. |
| `--brand-navy-text` | `218 42% 26%` | AA text/label; same rule. |
| `--brand-orange` | `18 80% 48%` | Orange-Sprinkle Rule: ≤2 marks/screen; OFF status and actions. |

Four token-only visual touches shipped in PR-1: logo square `bg-brand-navy` + dot `brand-orange`;
header avatar gradient `navy→primary`; active nav indicator `brand-navy/6` bg + `brand-navy-text`;
drawer active-tab underline `brand-navy`. The action color (`primary` blue) is unchanged.

Status chips: 8px dot (was 6px) + always-present text label (never dot-only) — WCAG 1.4.1, so status
stays perceivable when grouping ≠ Status (OBS-120). Dense DB-view row height: 50px (54px stays the
default everywhere else).

---

## 9. Virtualization (NFR-120)

`@tanstack/react-virtual` windows the **flat visible row list** (group headers + leaf rows of expanded
groups) when `rows.length >= 50`. `j`/`k` cursor scrolls the windowed row into view (`scrollToIndex`).
`aria-sort` is on the `<thead>` (outside the window). Below 50 rows renders un-windowed.

---

## 10. Optimistic sync

`TasksLayout` holds a `Map<string, TaskStatus>` optimistic-override state plus a `refreshKey` counter:
- **Status changes** — propagated via `onTaskChanged` callback through `<Outlet context>` →
  `TaskDrawer` → `TaskSurface`. The table row reflects the new status without a reload.
- **Create / archive** — bump `refreshKey`; `TasksWorkspace` watches it and refetches the list. A
  just-created row becomes selected; an archived row leaves the default list.

---

## 11. Functional requirements (EARS)

### Layout / routing

- **FR-120** The Tasks page **shall** render full-bleed (no 1080px max-width cap via
  `PageFrame variant="data"`); prose surfaces (Weekly-update write) **shall** keep the 1080px readable
  cap (`variant="prose"`, the default). *(ADR-0008 D1)*
- **FR-121** The Tasks workspace **shall** present a view-tab strip: Table (active, aria-selected) and
  Board / Calendar as `aria-disabled="true"` / `tabindex="-1"` "SOON" stubs that are not activatable.
  *(OD-P3-6)*

### Split-view / drawer surface

- **FR-100** The system **shall** nest `/tasks/new` and `/tasks/:taskId` under a parent `TasksLayout`
  route that owns the table and renders the surface via `<Outlet>`, so the table stays mounted during
  navigation between child routes. *(ADR-0007 §3)*
- **FR-101** `/tasks/:id` **shall** be the single canonical task surface — there is no second task home
  and no `/tasks/:id/full` route. The expand toggle operates on the same URL without pushing history.
  *(ADR-0007 D1/D2; OD-P3-2)*
- **FR-102** The drawer **shall** be the one actionable task editor (`TaskSurface`); the same component
  renders the 1/3 drawer, the expanded full-width focus mode, and create — no duplicate field set.
  *(ADR-0007 D1)*
- **FR-103** The pinned drawer header **shall** show title, inline status control (editors) / status
  pill (viewers), R/A mini-chips, expand toggle, and close button; it **shall** never scroll.
  *(OD-P3-3)*
- **FR-104** When the drawer is open in view mode, **shall** present three tabs — Details (default),
  Checklist, Activity — each with a count; the last-used tab **shall** be remembered per-task for the
  session (`sessionStorage`). *(OD-P3-3)*
- **FR-105** The expand preference **shall** be per-user-global (`localStorage mos.tasks.expandDefault`)
  and applied on every re-open. *(OD-P3-3)*
- **FR-106** At ≥1100px **shall** render the drawer as a non-modal `<aside>` (no scrim, no focus trap);
  at 920–1100px as a modal overlay sheet (`role="dialog"` + `aria-modal` + scrim + focus trap + Esc);
  at <768px as a full-screen modal with the card list visible behind it. *(ADR-0007 §4; OD-P3-4)*
- **FR-107** When a deep-link to `/tasks/:id` is loaded, **shall** render the table + that task's drawer
  together (the route parent owns the table; deep-link contract is unchanged). *(ADR-0007 §5)*

### Group-by workspace

- **FR-122** The Tasks workspace **shall** group rows by a selected dimension — Status (default), Owner,
  or BU — and **shall** render every group always (including empty groups), with rows sorted
  Due-ascending (overdue first) within each group. *(OD-P3-6, Q3 Director ruling)*
- **FR-123** Each group header **shall** show a caret, the group label, a row count, an overdue subtotal
  when >0, and a "+ Add task" affordance. The affordance **shall** pre-fill the grouped dimension only
  for **Owner (→R)** and **BU** groups via query params (`?r=<personId>`, `?bu=<buId>`); **Status
  groups open a plain `/tasks/new`** (no `?status=` pre-fill — the create form has no status field and
  a new task is always Open). *(OD-P3-6; Director ruling PR-3 review 2026-06-16)*
- **FR-124** When a Person filter is set, the workspace **shall** disable the Mine/RACI/All segment
  (`aria-disabled`, `tabindex="-1"`, `disabled`), de-emphasise it (`opacity: .5`), and expose a tooltip
  `"Scope is set by the Person filter"` (via `title` + `aria-description`). **No literal "Person: me"
  text.** *(OD-P3-6; Director ruling PR-2 review 2026-06-16)*
- **FR-125** The workspace **shall** persist `groupBy` and `collapsedGroups` per-user-global in
  `localStorage` under `mos.tasks.groupBy` and `mos.tasks.collapsedGroups`. *(OD-P3-6)*
- **FR-126** Clicking the page "N overdue" count or a group overdue subtotal **shall** apply a transient
  overdue-only filter chip the viewer can clear (overdue-only is not persisted). *(OD-P3-6)*
- **FR-127** On `<768px`, the workspace **shall** render grouped cards (group headers + `TaskCard`s for
  the chosen group-by) with no view-tab strip. *(OD-P3-6)*
- **FR-128** The Owner cell "+N" **shall** be a focusable control revealing a read-only tooltip of the
  other RACI members (C/I, and A if ≠ R) as `role · Name` on focus or hover. *(OD-P3-6)*

### Keyboard layer

- **FR-108** The keyboard layer **shall** support: `j`/`k` move cursor (leaf rows only, skipping group
  headers); `Enter`/`o` open cursor row; `Esc` close drawer; `n` open create; `e` toggle expand.
  Single-letter hotkeys **shall** be suppressed when a text input, textarea, select, or contenteditable
  element has focus; Esc always fires. *(OD-P3-4)*

### Overdue / off-track signal

- **FR-109** Off-track computation **shall** use `isOverdue()` from `lib/dueStatus.ts`: a task is
  off-track only when it is **not Done, not archived**, and `due_date < today-in-WIB`. Done and archived
  tasks are never counted as overdue (the C1 fix). *(OD-P3-6; `isOverdue` in `lib/dueStatus.ts`)*

---

## 12. Non-functional requirements

- **NFR-120** The workspace **shall** run the row models (sort, filter, group, aggregate, column-
  visibility) on a single client-side `@tanstack/react-table` instance with no server or schema change;
  it **shall** virtualize the flat visible row list (group headers + leaf rows) at ≥50 rows while
  preserving `j`/`k` and `aria-sort`. *(ADR-0008 D3; OD-P3-8)*
- **NFR-121** Dense DB-view row height: **50px**. Default row height (all other tables): 54px.
  Horizontal hairline dividers only (`border/70%`); no vertical column rules. *(OD-P3-6; ADR-0008 D4)*
- **NFR-122** All new tokens and styled elements **shall** resolve to DESIGN.md tokens (including the
  ratified `brand-navy` / `brand-navy-text` / `brand-orange`). The only documented px literals in this
  spec are the 50px dense row (OD-P3-6) and the drawer clamp `clamp(360px, 33vw, 480px)` (OD-P3-2).
- **NFR-123** `j`/`k` cursor navigation and `aria-sort` **shall** continue to work correctly under
  virtualization. *(AC-131)*
- **NFR-124** Micro-interactions **shall** be ~150–200ms; `@media (prefers-reduced-motion: reduce)` removes
  drawer transitions. *(OD-P3-4)*

---

## 13. Observability / accessibility requirements

- **OBS-120** Status chips **shall** always render their text label (e.g. "In Progress") alongside the
  8px dot — never a dot-only variant — regardless of the active group-by. *(WCAG 1.4.1; ADR-0008 D4)*
- **OBS-121** `j`/`k` **shall** move the leaf-row cursor only, skipping group-header rows. Group-header
  collapse **shall** be keyboard-reachable independently (Tab + Enter/Space on the caret button).
- **OBS-122** The aria-controls attribute on group-header carets is **intentionally omitted**: the table
  body is a single shared `<tbody>` (virtualization requirement), so no element can carry a per-group
  id. The caret's `aria-expanded` is sufficient to communicate collapsed/expanded state. *(PR-3 review
  ruling 2026-06-16)*

---

## 14. Acceptance criteria (Given/When/Then)

> Each AC is owned by ONE test at the lowest sufficient layer. Layer key: `[unit]` = Vitest/RTL;
> `[e2e]` = Playwright. The AC id is tagged in the owning test's title so `grep -r AC-XXX` finds it.
> RLS/pgTAP contracts (AC-001..051) are unchanged and owned by `tasks-raci.spec.md`.

### Regression-invariants (Slice 2 must keep Slice 1 green)

| AC | Given / When / Then | Layer |
|---|---|---|
| **AC-116** | Given any entry to a task (table row click, `j`+Enter, My Week link, Daily Log link), When it opens, Then it resolves to the **one canonical** `/tasks/:id` surface (the drawer/expanded `TaskSurface`) — there is no second task home. | unit |
| **AC-117** | Given the drawer open in view mode, When the viewer changes status inline, Then the table row's status reflects it **without a view transition / navigation** (optimistic override). | unit |
| **AC-118** | Given any rendered status chip, Then it renders its **text label** (e.g. "In Progress") coexisting with the dot — never a dot-only variant — regardless of the active group-by. | unit |
| **AC-119** | Given a row whose task is off-track (overdue), Then the row carries an **off-track signal in-row** — red due text reading "Overdue · \<date\>" (color is not the only channel). | unit |
| **AC-120** | Given the Tasks page at any supported width, Then the rail nav + breadcrumb remain **role-stable** (Tasks active nav item present; full-bleed does not remove the breadcrumb/landmark). | unit |

### Split-view drawer surface

| AC | Given / When / Then | Layer |
|---|---|---|
| **AC-100** | Given `/tasks`, When the page renders with no child route matched, Then the workspace renders full-width and no drawer is present. | unit |
| **AC-101** | Given the workspace, When the viewer opens a task (click row / `Enter`), Then the URL becomes `/tasks/:id`, the table **stays mounted**, and the drawer renders that task's surface beside it. | unit + e2e |
| **AC-102** | Given a deep-link to `/tasks/:id` (from My Week / Daily Log), When the app loads, Then the table + that task's drawer render together. | unit + e2e |
| **AC-103** | Given the drawer open in view mode, When the viewer changes status inline, Then it applies optimistically and the table row's status reflects it without a navigation. | unit |
| **AC-104** | Given the drawer, When the viewer toggles expand (`e` / expand button), Then the surface grows to full width on the **same URL** (no history push) and the preference persists per-user-global. | unit |
| **AC-105** | Given the surface re-opens, Then the expand state matches the persisted per-user-global preference (`localStorage mos.tasks.expandDefault`). | unit |
| **AC-106** | Given a drawer in view mode, When the viewer switches tabs (Details/Checklist/Activity), Then the tabpane content swaps; default tab is Details; last-used tab is remembered per-task within the session (`sessionStorage mos.tasks.tab.<id>`). | unit |
| **AC-107** | Given `+ New task`, When clicked (or `n`), Then `/tasks/new` opens the drawer in create mode (one pane, no tabs, "New task" bar) with Title/BU required and R/A defaulted to the creator. | unit |
| **AC-108** | Given the create drawer, When a required field is left empty and blurred, Then an inline error renders below it (`--field-error-text` / `--field-error-border`); On Create success the URL becomes `/tasks/:newId` and the surface re-renders in view mode. | unit |
| **AC-109** | Given the workspace has focus, When the viewer presses `j`/`k`, Then the keyboard cursor moves down/up the leaf rows; `Enter`/`o` opens the cursor row; `Esc` closes the drawer; `e` toggles expand; `n` opens create; **all single-letter hotkeys are suppressed while a text input/textarea/select has focus**. | unit |
| **AC-110** | Given ≥1100px, Then the drawer is **non-modal** (`<aside>`, no focus trap, no scrim) and Tab moves naturally between table and drawer; Given 920–1100px (overlay band), Then the drawer is **modal** (`role="dialog"` + `aria-modal` + focus trap + Esc) over an un-squashed table; Given <768px, Then the drawer is full-screen modal over the card list. | unit + e2e |
| **AC-111** | Given an optimistic inline write that fails, When the data layer rejects, Then the UI rolls back and an `aria-live="polite"` region announces the revert ("Couldn't save — reverted"). | unit |
| **AC-112** | Given a deep-link to an archived task, Then the pinned header shows the archived banner + Unarchive (A/manager only) and tabs render read-only; Given not-found/forbidden, Then the pane shows "Task not found" + an "All tasks" link while the table stays usable beside it. | unit |
| **AC-113** | Given the list ≥1100px and the drawer open, Then the table condenses (Activity drops first, Owner→avatar-only, Due→chip-only) and **Task + Status never drop**; `aria-sort` stays on sortable headers. | unit |
| **AC-114** | Given 50+ rows, Then the table virtualizes (windowed) while `j`/`k` cursor navigation and `aria-sort` keep working. | unit |
| **AC-115** | *(Reserved — not assigned; AC-100..114 close Slice 1.)* | — |

### Full-bleed workspace / DB-view

| AC | Given / When / Then | Layer |
|---|---|---|
| **AC-121** | Given a page with `variant="data"`, When it renders, Then the content container has **no 1080px max-width cap** (full-bleed); Given `variant="prose"` (or default), Then the 1080px cap is present. | unit |
| **AC-122** | Given the Tasks workspace, When it renders, Then a view-tab strip shows **Table selected** (`aria-selected=true`) and **Board + Calendar** as `aria-disabled="true"` "SOON" stubs (`tabindex=-1`, not activatable). | unit |
| **AC-123** | Given the workspace with default state, Then rows are **grouped by Status**, each group header showing the label, a **count**, and an **overdue subtotal** when >0; within a group rows are **Due-ascending (overdue first)**. | unit |
| **AC-124** | Given grouping by **Owner** (or BU), When a group has zero leaf rows, Then its header is **still shown** (count 0, caret, "+ Add task", no overdue subtotal). | unit |
| **AC-125** | Given grouping by **Owner**, When "+ Add task" in a group header is activated, Then the create drawer opens at `/tasks/new?r=<personId>` pre-filling that person as R. | unit |
| **AC-126** | Given a Person filter is chosen, Then the Mine/RACI/All segment is **disabled** (`aria-disabled`, `tabindex=-1`, `disabled`), de-emphasised, and a tooltip reads `"Scope is set by the Person filter"` — **no literal "Person: me" text**. | unit |
| **AC-127** | Given the viewer changes `groupBy` or collapses a group, When the page re-opens, Then the choice is **restored** from `localStorage mos.tasks.{groupBy,collapsedGroups}`. | unit |
| **AC-128** | Given the page "N overdue" count (or a group overdue subtotal) is a button, When activated, Then a **transient overdue-only filter chip** is applied (only overdue rows shown) and is clearable via the chip ✕. | unit |
| **AC-129** | Given `<768px`, Then the workspace renders **grouped cards** (group headers + `TaskCard`s for the chosen group-by) and **no view-tab strip**. | unit |
| **AC-130** | Given an Owner cell with other RACI members, When the "+N" control is focused or hovered, Then a read-only tooltip lists the C/I people (and A if ≠ R) as `role · Name`. | unit |
| **AC-131** | Given the workspace, When the row count is ≥50, Then the leaf rows **virtualize** while `j`/`k` cursor + `aria-sort` keep working; `j`/`k` **skips group-header rows**. | unit |
| **AC-132** | Given group-header collapse is keyboard-reachable (Tab to the caret, Enter/Space toggles `aria-expanded`), When toggled, Then the group's leaf rows hide/show and the collapse state persists per-user-global. | unit |
| **AC-133** | Given the missing-states set on the full-bleed workspace, Then: **loading** shows a skeleton + `aria-busy`/`role=status`; **empty (no tasks)** shows the segment-aware empty block + `+ New task`; **error** shows a `role=alert` + Retry; **no-results (filtered)** shows "No tasks match these filters" + Clear filters + `+ New task`; **zero-overdue** omits the overdue segment entirely (no "all clear" badge). | unit |
| **AC-134** | Given the full Tasks workspace journey, When the viewer groups by Status, opens a row, changes status inline, then groups by Owner and adds a task via a group "+ Add task", Then the cross-stack flow works end-to-end (deep-link canonical, optimistic sync, pre-fill). | e2e |

---

## 15. Extends/supersedes mapping for `tasks-raci.spec.md`

The following P2-1 FRs from `docs/specs/tasks-raci.spec.md` are extended or superseded by this spec.
The data-model FRs (FR-001..014, FR-050..056) and RLS NFRs are **untouched and owned by tasks-raci**.

| tasks-raci FR | Status | What changed |
|---|---|---|
| **FR-022** (list row contents) | **Extended** | Rows now live inside group headers. Group headers add a count + overdue subtotal (FR-123). The condense ladder (AC-113) progressively hides Activity / Owner name / Due chip when the drawer is open at ≥1100px. |
| **FR-023** (due-cell colour "Overdue") | **Superseded** | Off-track now excludes Done and archived tasks (`isOverdue()` in `lib/dueStatus.ts` — the C1 fix). In the condensed split-view the due cell renders a chip-only glyph; color is never the only channel (WCAG 1.4.1 — OBS-120 and the non-color "Overdue · \<date\>" text, AC-119). |
| **FR-024** (BU/Status/Person filters + Mine/RACI/All segment + search) | **Extended** | Adds: Group-by control (FR-122); Person-overrides-segment disabling with tooltip (FR-124); "N overdue" click-to-filter button (FR-126); Show-archived checkbox retained. |
| **FR-025** (hide archived by default) | **Holds unchanged** | Show-archived toggle is retained in the toolbar (PR-3 review ruling 2026-06-16). |
| **FR-026** (due-asc sort) | **Extended** | Sort is now **within-group Due-asc** (overdue first inside each group). The TanStack row engine owns sort/filter; the default sort is Due-ascending within each group dimension. |
| **FR-030** / **FR-031** (detail page + inline status) | **Superseded** | The "detail page" concept is replaced by the split-view surface: one `TaskSurface` component at one canonical URL `/tasks/:id` (FR-101). Status change-in-place is preserved (now AC-103/117); the table row reflects it optimistically without navigation. |

The following FRs are **unaffected** by this spec: FR-001..014 (schema/create), FR-032..034 (RACI/activity
on the surface — still rendered by the same `RaciCard`/`ActivityCard`/`ChecklistCard` components),
FR-040..042 (checklist), FR-050..056 (edit/archive write gating — RLS and `canEdit`/`canArchive` oracles
unchanged).

---

## 16. Key component map

| Component | Path | Covers |
|---|---|---|
| `TasksLayout` | `mos-app/src/pages/TasksLayout.tsx` | Shell: nested routes, `variant="data"` PageFrame, optimistic-override state, `<Outlet context>` |
| `TasksWorkspace` | `mos-app/src/components/tasks/TasksWorkspace.tsx` | Full workspace assembly: TanStack instance, grouping, toolbar, group headers, virtualization |
| `TaskDrawer` | `mos-app/src/components/tasks/TaskDrawer.tsx` | Drawer host: modal/non-modal regime, focus management, `useExpandPref` |
| `TaskSurface` | `mos-app/src/components/tasks/TaskSurface.tsx` | One editor: view + create modes, tabs, live region |
| `TaskDrawerHeader` | `mos-app/src/components/tasks/TaskDrawerHeader.tsx` | Pinned header (title, StatusTrigger, R/A chips, expand/close) |
| `TaskTabStrip` | `mos-app/src/components/tasks/TaskTabStrip.tsx` | Tab strip (Details/Checklist/Activity, roving tabindex) |
| `GroupHeaderRow` | `mos-app/src/components/tasks/GroupHeaderRow.tsx` | Group header row (caret, label, count, overdue subtotal, + Add task) |
| `MobileGroupedCards` | `mos-app/src/components/tasks/MobileGroupedCards.tsx` | <768px grouped card body (no view-tabs) |
| `ViewTabStrip` | `mos-app/src/components/tasks/ViewTabStrip.tsx` | Table/Board/Calendar view-tab strip |
| `StatusPill` | `mos-app/src/components/tasks/StatusPill.tsx` | 8px dot + always-present text label |
| `OwnerCell` | `mos-app/src/components/tasks/OwnerCell.tsx` | R-avatar + first name + "+N" RACI tooltip |
| `useExpandPref` | `mos-app/src/components/tasks/useExpandPref.ts` | `localStorage mos.tasks.expandDefault` |
| `useTasksViewPref` | `mos-app/src/components/tasks/useTasksViewPref.ts` | `localStorage mos.tasks.{groupBy,collapsedGroups}` |
| `useTabMemory` | `mos-app/src/components/tasks/useTabMemory.ts` | `sessionStorage mos.tasks.tab.<id>` |
| `useTasksKeyboard` | `mos-app/src/components/tasks/useTasksKeyboard.ts` | `j/k/Enter/o/Esc/n/e` keyboard layer |
| `useIsSplitWidth` | `mos-app/src/shell/useIsSplitWidth.ts` | matchMedia `(min-width: 1100px)` |
| `PageFrame` | `mos-app/src/shell/PageFrame.tsx` | `variant: 'data' | 'prose'` layout frame |
| `isOverdue` / `dueStatus` | `mos-app/src/lib/dueStatus.ts` | Off-track classifier (C1 fix: Done/archived excluded) |
