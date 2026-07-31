# Implementation plan — Tasks page redesign (split-view master-detail, Variant B)

- **Date:** 2026-06-15
- **Feature:** P3 — Tasks redesign (master-detail split-view; "one UI, two widths")
- **Author:** eng-planner
- **Inputs (authority):** design-plan `docs/plans/2026-06-15-tasks-redesign-design-plan.md` (PRIMARY) ·
  `docs/adr/0007-tasks-split-view-master-detail.md` · `docs/decisions.md` OD-P3-2..5 (LOCKED) ·
  spec `docs/specs/tasks-raci.spec.md` (P2-1, the surface being recomposed) · `CONTEXT.md` · `docs/jtbd.md`
- **Status:** ✅ SHIPPED 2026-06-16 — PRs #15 (PR-A) · #17 (PR-B) · #18 (PR-C+D), all merged to `main`.
  As-built naming differs from this plan: the split-view shell shipped as **`TasksLayout`** (not
  `TasksSplitView`), the table was extracted to **`TasksTable`**, and route children render **`TaskDrawer`**
  (which wraps the one editor `TaskSurface`). Behavior/ACs as planned. (Plan kept as historical record.)

## Scope guardrails (read before any task)

- **UI + routing ONLY.** NO schema / RLS / grant / migration change. `lib/db/tasks.ts` mutation
  **signatures are reused verbatim** — only the call-*sites* move into `TaskSurface`. ADR-0007 records
  this so the security-auditor scope for this issue is the client only (no new data seam). **pgTAP is
  unchanged** — the RLS read/write/archive contracts (AC-001..AC-051 in the spec) are not touched by a
  UI refactor, so re-running them is regression-only, not new work.
- **Behavior-preserving refactor.** The existing `TaskDetail.test.tsx` (AC-070..075) is the **behavior
  oracle** for the extraction. It must stay green at every step. Where a task re-points it at the new
  component, the *assertions* (the goal-oracle) stay intact — we move the test's mount target, never bend
  an assertion to the new DOM (BDD authoring rule, CLAUDE.md).
- **Reuse, don't reinvent.** `StatusPill`, `OwnerCell`, `taskFormatters`, `dueStatus`, `raciMember`/
  `raciOwner` are reused as-is. The six in-file sub-components in `TaskDetail.tsx` (StatusTrigger,
  ConfirmArchive, PersonPicker, RaciCard, ChecklistCard, ActivityCard) are **extracted** to their own
  files, then composed by `TaskSurface` — logic unchanged.
- **Tokens.** Every styled element resolves to a `DESIGN.md` token; the only literal px is the documented
  drawer width `clamp(360px, 33vw, 480px)` (OD-P3-2). Field-error tokens `--field-error-border` /
  `--field-error-text` are ratified (OD-P3-5).
- **Gates (binding):** `npm run typecheck` zero errors · ESLint `--max-warnings=0` · **≥80% changed-code
  coverage** · every behavior task names its `AC-###`.

## New acceptance criteria (this redesign — beyond the P2-1 spec ACs)

These extend `docs/specs/tasks-raci.spec.md`. They are tagged at their owning test layer. The P2-1 ACs
(AC-060..091) continue to hold — the redesign must not regress them.

> **NOTE for spec-reviewer:** these AC-1xx ids are introduced by this plan and should be folded back into
> `docs/specs/tasks-raci.spec.md` §6 (or a `tasks-redesign.spec.md` addendum) at spec sign-off. Listed
> here so every behavior task traces to an AC.

| AC | Given / When / Then | Layer |
|---|---|---|
| **AC-100** | Given `/tasks`, When the page renders with no child route matched, Then the table renders full-width and no drawer is present — OD-P3-2, ADR-0007 §3. | unit |
| **AC-101** | Given the table, When the viewer opens a task (click row / `Enter`), Then the URL becomes `/tasks/:id`, the table **stays mounted**, and the drawer renders that task's surface beside it — OD-P3-2. | unit + e2e |
| **AC-102** | Given a deep-link to `/tasks/:id` (from My Week / Daily Log), When the app loads, Then the table + that task's drawer render together — OD-P3-2, ADR-0007 §5. | unit + e2e |
| **AC-103** | Given the drawer open in view mode, When the viewer changes status inline, Then it applies optimistically and the table row's status reflects it without a navigation — OD-P3-2/4, FR-031. | unit |
| **AC-104** | Given the drawer, When the viewer toggles expand (`e` / the expand button), Then the surface grows to full width on the **same URL** (no history push) and the preference persists per-user-global — OD-P3-3. | unit |
| **AC-105** | Given the surface, When it re-opens, Then the expand state matches the persisted per-user-global preference (localStorage `mos.tasks.expandDefault`) — OD-P3-3. | unit |
| **AC-106** | Given a drawer in view mode, When the viewer switches tabs (Details/Checklist/Activity), Then the tabpane content swaps; default tab is Details; last-used tab is remembered per-task within the session (sessionStorage) — OD-P3-3. | unit |
| **AC-107** | Given `+ New task`, When clicked (or `n`), Then `/tasks/new` opens the drawer in create mode (one pane, no tabs, "New task" bar) with Title/BU required and R/A defaulted to the creator — OD-P3-2, FR-010/011. | unit |
| **AC-108** | Given the create drawer, When a required field is left empty and blurred, Then an inline error renders below it (`--field-error-text`) with the border in `--field-error-border`; On Create success the URL becomes `/tasks/:newId` and the surface re-renders in view mode ready to act — OD-P3-2/5, FR-012. | unit |
| **AC-109** | Given the table region has focus, When the viewer presses `j`/`k`, Then the keyboard cursor moves down/up the rows; `Enter`/`o` opens the cursor row; `Esc` closes the drawer; `e` toggles expand; `n` opens create — and **all single-letter hotkeys are suppressed while a text input/textarea/select has focus** — OD-P3-4. | unit |
| **AC-110** | Given the ≥1100px split, Then the drawer is **non-modal** (`<aside>`, no focus trap, no scrim) and tab moves naturally between table and drawer; Given <768px (and the 920–1100 overlay), Then the drawer is **modal** (`role="dialog"` + `aria-modal` + focus trap + Esc) — OD-P3-4, ADR-0007 §4. | unit + e2e (mobile) |
| **AC-111** | Given an optimistic inline write that fails, When the data layer rejects, Then the UI rolls back and an `aria-live="polite"` region announces the revert — OD-P3-4. | unit |
| **AC-112** | Given a deep-link to an archived task, Then the pinned header shows the archived banner + Unarchive (A/manager only) and tabs render read-only; Given not-found/forbidden, Then the pane shows "Task not found" + an "All tasks" link while the table stays usable beside it — design-plan §3.2. | unit |
| **AC-113** | Given the list ≥1100px and the drawer open, Then the table condenses per the §4.1 ladder (Activity drops first, Owner→avatar-only, Due→chip-only) and **Task + Status never drop**; `aria-sort` stays on the sortable headers — design-plan §4.1. | unit |
| **AC-114** | Given 50+ rows, Then the table virtualizes (windowed) while `j/k` cursor navigation and `aria-sort` keep working — OD-P3-4. | unit |

---

## Phasing & PR boundaries

The work lands as **four PRs**, each independently shippable (app stays green + deployable at each merge):

- **PR-A — Routing + `TaskSurface` extraction (behavior-preserving).** Tasks 1–13. Nests the routes,
  extracts the six sub-components, recomposes into `TaskSurface`, re-hosts `TaskDetail` + create onto it.
  At the end of PR-A the app behaves *exactly* as today (full-page detail/create) but on the new
  component spine — the AC-070..081 oracle stays green throughout. **This is the high-risk PR; merge it
  alone.**
- **PR-B — Split-view shell + drawer chrome.** Tasks 14–22. `TasksSplitView` shell, push/squash grid,
  pinned header, tab strip, expand toggle, drawer states. AC-100..106, 112, 113.
- **PR-C — Create-in-drawer + keyboard + a11y regimes.** Tasks 23–30. Create mode in the drawer,
  keyboard layer, modal/non-modal switch, live region. AC-107..111.
- **PR-D — Responsive regimes + perf.** Tasks 31–36. Overlay fallback, mobile full-screen, column-drop
  ladder polish, virtualization, optimistic-rollback hardening, e2e journeys. AC-110 (mobile), 114, e2e.

**Task count: 36** (+ 6 e2e sub-journeys folded into Task 35–36). Rough sequencing is strictly PR-A →
PR-B → PR-C → PR-D; within each PR tasks are ordered.

> **Open question to confirm before PR-D (Director):** the design-plan's Q1 (1100px fallback threshold),
> Q2 (virtualization lib), Q3 (storage key names), Q4 (920–1100 overlay design-review). Defaults are
> baked into the tasks below; flag if any differ. See "Open questions" at the bottom.

---

# PR-A — Routing + `TaskSurface` extraction (behavior-preserving)

> **Invariant for the whole PR:** `npx vitest run src/pages/TaskDetail.test.tsx` and
> `src/pages/TaskCreate.test.tsx` stay green at every task. The refactor moves code, never behavior.

## Task 1 — Nest the Tasks routes under a passthrough parent (AC-100, AC-101 scaffold)

**TDD red.** Add `mos-app/src/router.test.tsx` (new) asserting the route tree shape:

```tsx
import { describe, it, expect } from 'vitest'
import { routeConfig } from './router'

describe('router — tasks nesting (ADR-0007)', () => {
  it('AC-100: tasks is a parent route with :taskId and new as children', () => {
    const shell = routeConfig[1].children![0]            // ProtectedRoute → AppShell
    const tasks = shell.children!.find(r => r.path === 'tasks')!
    expect(tasks.children).toBeDefined()
    const childPaths = tasks.children!.map(c => c.path).sort()
    expect(childPaths).toEqual(['new', ':taskId'].sort())
    // siblings `tasks/new` / `tasks/:taskId` no longer exist at the shell level
    expect(shell.children!.some(r => r.path === 'tasks/new')).toBe(false)
    expect(shell.children!.some(r => r.path === 'tasks/:taskId')).toBe(false)
  })
})
```

Run: `cd mos-app && npx vitest run src/router.test.tsx` → **red** (still three siblings).

**Green.** Edit `mos-app/src/router.tsx`: replace lines 49–51 with a nested shape. For Task 1 keep the
existing page components as the children (the shell component arrives in Task 14) so the diff is minimal:

```tsx
{ path: 'tasks', element: <TasksPage />, children: [
    { path: 'new', element: <TaskCreate /> },
    { path: ':taskId', element: <TaskDetail /> },
] },
```

Add an `<Outlet />` to `TasksPage.tsx` (import from `react-router-dom`) at the end of its `PageFrame`
so children mount (temporary — the real shell renders it deliberately in Task 14). Update the route-map
comment block (lines 16–33) to describe the nested shape.

Run: `cd mos-app && npx vitest run src/router.test.tsx` → green.
Verify no regression: `cd mos-app && npx vitest run src/pages/TasksPage.test.tsx && npm run typecheck`.

## Task 2 — Extract `StatusTrigger` to its own file (no behavior change)

**TDD red.** New `mos-app/src/components/tasks/StatusTrigger.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatusTrigger } from './StatusTrigger'

describe('StatusTrigger', () => {
  it('renders the current status pill and opens a listbox of the 4 statuses', () => {
    render(<StatusTrigger status="Open" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    const opts = screen.getAllByRole('option')
    expect(opts).toHaveLength(4)
  })
  it('calls onChange with the picked status', () => {
    const onChange = vi.fn()
    render(<StatusTrigger status="Open" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    fireEvent.click(screen.getByRole('option', { name: /blocked/i }))
    expect(onChange).toHaveBeenCalledWith('Blocked')
  })
})
```

Run: `cd mos-app && npx vitest run src/components/tasks/StatusTrigger.test.tsx` → red.

**Green.** Create `mos-app/src/components/tasks/StatusTrigger.tsx` containing the `StatusTrigger`
component + `STATUSES` const lifted **verbatim** from `TaskDetail.tsx` lines 30–87 (export both the
component and the `StatusTriggerProps` type; import `StatusPill` and the status CSS classes — keep the
class names so existing CSS applies). Remove those lines from `TaskDetail.tsx` and import from the new
file.

Run: `npx vitest run src/components/tasks/StatusTrigger.test.tsx src/pages/TaskDetail.test.tsx && npm run typecheck`.

## Task 3 — Extract `ConfirmArchive` to its own file

**TDD red.** New `mos-app/src/components/tasks/ConfirmArchive.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmArchive } from './ConfirmArchive'

describe('ConfirmArchive', () => {
  it('renders a modal dialog and wires confirm/cancel', () => {
    const onConfirm = vi.fn(); const onCancel = vi.fn()
    render(<ConfirmArchive onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('dialog', { name: /archive confirmation/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))
    expect(onConfirm).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/ConfirmArchive.tsx` from `TaskDetail.tsx` lines 89–106
verbatim (export component + `ConfirmArchiveProps`). Remove from `TaskDetail.tsx`; import it.

Run: `npx vitest run src/components/tasks/ConfirmArchive.test.tsx src/pages/TaskDetail.test.tsx && npm run typecheck`.

## Task 4 — Extract `PersonPicker` to its own file

**TDD red.** New `mos-app/src/components/tasks/PersonPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonPicker } from './PersonPicker'

const people = [
  { id: 'p1', full_name: 'Ada Lovelace' },
  { id: 'p2', full_name: 'Alan Turing' },
] as any

describe('PersonPicker', () => {
  it('lists selectable people and excludes the given ids', () => {
    const onSelect = vi.fn(); const onClose = vi.fn()
    render(<PersonPicker people={people} exclude={['p2']} onSelect={onSelect} onClose={onClose} />)
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.click(screen.getByRole('option', { name: /ada lovelace/i }))
    expect(onSelect).toHaveBeenCalledWith('p1')
    expect(onClose).toHaveBeenCalled()
  })
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/PersonPicker.tsx` from `TaskDetail.tsx` lines 108–135
verbatim (import `initials` from `taskFormatters`; export component + `PersonPickerProps`). Remove from
`TaskDetail.tsx`; import it.

Run: `npx vitest run src/components/tasks/PersonPicker.test.tsx src/pages/TaskDetail.test.tsx && npm run typecheck`.

## Task 5 — Extract `RaciCard` to its own file

**TDD red.** New `mos-app/src/components/tasks/RaciCard.test.tsx` — assert the four role fields render
and an editor can open the C picker (re-use the fixture shape from `TaskDetail.test.tsx`):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RaciCard } from './RaciCard'
// build a minimal task + people fixture inline (R=p1, A=p1, C=[], I=[])

it('AC-072 (component): editor can open the Consulted picker', () => {
  // render RaciCard with canEdit=true; click "Add Consulted person"; expect a listbox
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/RaciCard.tsx` from `TaskDetail.tsx` lines 137–347
verbatim (import `PersonPicker` from the new file + `initials`; export component + `RaciCardProps`).
Remove from `TaskDetail.tsx`; import it.

Run: `npx vitest run src/components/tasks/RaciCard.test.tsx src/pages/TaskDetail.test.tsx && npm run typecheck`.

## Task 6 — Extract `ChecklistCard` to its own file

**TDD red.** New `mos-app/src/components/tasks/ChecklistCard.test.tsx` — assert add-on-Enter and a
disabled checkbox when `canEdit=false`:

```tsx
it('AC-074 (component): typing a label + Enter calls onAdd', () => {
  const onAdd = vi.fn()
  render(<ChecklistCard items={[]} canEdit taskId="t" viewerId="v"
    onAdd={onAdd} onToggle={()=>{}} onReorder={()=>{}} onDelete={()=>{}} />)
  const input = screen.getByLabelText(/add checklist item/i)
  fireEvent.change(input, { target: { value: 'Buy beans' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onAdd).toHaveBeenCalledWith('Buy beans')
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/ChecklistCard.tsx` from `TaskDetail.tsx` lines 349–445
verbatim (export component + `ChecklistCardProps`). Remove from `TaskDetail.tsx`; import it.

Run: `npx vitest run src/components/tasks/ChecklistCard.test.tsx src/pages/TaskDetail.test.tsx && npm run typecheck`.

## Task 7 — Extract `ActivityCard` (+ `eventLabel`) to its own file

**TDD red.** New `mos-app/src/components/tasks/ActivityCard.test.tsx` — assert empty state + a
`status_changed` event renders the `from → to` transition:

```tsx
it('AC-075 (component): renders a status_changed event with from→to', () => {
  const events = [{ id:'e1', event_type:'status_changed', from_value:'Open',
    to_value:'Blocked', actor_person_id:'p1', created_at:'2026-06-15T00:00:00Z' }] as any
  render(<ActivityCard events={events} people={[{id:'p1',full_name:'Ada'}] as any} now={new Date()} />)
  expect(screen.getByText(/Open → Blocked/)).toBeInTheDocument()
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/ActivityCard.tsx` from `TaskDetail.tsx` lines 447–489
verbatim (`eventLabel` + `ActivityCard`; import `formatAge`, `initials`; export component +
`ActivityCardProps`). Remove from `TaskDetail.tsx`; import it.

Run: `npx vitest run src/components/tasks/ActivityCard.test.tsx src/pages/TaskDetail.test.tsx && npm run typecheck`.

## Task 8 — Extract the permission oracle + status const to a shared module

**TDD red.** New `mos-app/src/components/tasks/taskPermissions.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { canEdit, canArchive } from './taskPermissions'
const t = (o: any) => ({ responsible_person_id:'r', accountable_person_id:'a', ...o }) as any

describe('task permission oracle (mirrors mos.can_edit_task)', () => {
  it('R or A or manager can edit; nobody else', () => {
    expect(canEdit(t({}), 'r', false)).toBe(true)
    expect(canEdit(t({}), 'a', false)).toBe(true)
    expect(canEdit(t({}), 'x', true)).toBe(true)
    expect(canEdit(t({}), 'x', false)).toBe(false)
  })
  it('archive is A or manager only — not a bare R', () => {
    expect(canArchive(t({}), 'r', false)).toBe(false)
    expect(canArchive(t({}), 'a', false)).toBe(true)
    expect(canArchive(t({}), 'x', true)).toBe(true)
  })
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/taskPermissions.ts` with `canEdit`, `canArchive` lifted
verbatim from `TaskDetail.tsx` lines 15–28. Remove from `TaskDetail.tsx`; import them. (Keep `STATUSES`
in `StatusTrigger.tsx` from Task 2; if `TaskDetail.tsx` still references it, import from there.)

Run: `npx vitest run src/components/tasks/taskPermissions.test.tsx src/pages/TaskDetail.test.tsx && npm run typecheck`.

## Task 9 — Create `TaskSurface` skeleton owning the optimistic-write handlers (view mode, full width)

**TDD red.** New `mos-app/src/components/tasks/TaskSurface.test.tsx` — assert it loads a task and renders
the reused cards (mirror the `TaskDetail.test.tsx` mocks of `lib/db/tasks` + `directory`):

```tsx
it('AC-070 (TaskSurface): renders title, status, RACI, checklist, activity for a loaded task', async () => {
  // mockGetTask resolves a task; render <TaskSurface taskId="task-abc" mode="view" width="full" />
  // expect title text, a StatusPill, RACI section, Checklist section, Activity section
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/TaskSurface.tsx`. **Move** the entire stateful body of
`TaskDetail.tsx` (lines 509–844: the data load, `localTask`/`localChecklist` state, all `handle*`
optimistic handlers, the render of head + RACI + Checklist + Activity + ConfirmArchive) into a function
component with this signature:

```tsx
export type TaskSurfaceProps = {
  taskId: string | null          // null only in create mode (Task 24)
  mode: 'view' | 'create'
  width: 'drawer' | 'full'
  onClose?: () => void           // drawer/expanded use this; full host ignores
  onExpandToggle?: () => void    // wired in Task 18
  expanded?: boolean
  onTaskChanged?: (task: TaskListRow) => void  // lets the table sync optimistic status (Task 20)
}
```

For Task 9 implement **`mode='view'` only** (create is Task 24 — early-return `null` if `mode==='create'`
for now). Use `taskId` from props instead of `useParams`; replace `navigate('/tasks')` on archive with
`onClose?.()` falling back to `navigate('/tasks')`. Keep all handlers + the `getTask` refetch verbatim.
Render the existing markup (breadcrumb stays out — that's host chrome). Import the six extracted
components + `canEdit`/`canArchive`.

Run: `npx vitest run src/components/tasks/TaskSurface.test.tsx && npm run typecheck`.

## Task 10 — Re-host `TaskDetail` as a thin full-width wrapper over `TaskSurface`

**TDD red.** Re-point `mos-app/src/pages/TaskDetail.test.tsx`: keep ALL existing AC-070..075 assertions
(the goal-oracle) unchanged; it already mounts `<TaskDetail />` and mocks `useParams` → `{taskId:'task-abc'}`,
so no test edit is needed beyond confirming it still drives through the wrapper. Run it first → it may
red if the wrapper isn't wired:
`cd mos-app && npx vitest run src/pages/TaskDetail.test.tsx`.

**Green.** Reduce `mos-app/src/pages/TaskDetail.tsx` to a thin host:

```tsx
export default function TaskDetail() {
  useDocumentTitle('Task — Gordi MOS')
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  return (
    <PageFrame>
      <nav aria-label="Breadcrumb" className="breadcrumb">…Tasks / current…</nav>
      <TaskSurface taskId={taskId ?? null} mode="view" width="full"
        onClose={() => navigate('/tasks')} />
    </PageFrame>
  )
}
```

(The breadcrumb's current-title needs the loaded task; for the wrapper, render a static "Tasks /" crumb
or have `TaskSurface` accept an `onTitleResolved` callback — pick the callback to keep the AC-070 title
assertion satisfied. Keep `TaskDetail.css` import on `TaskSurface` now.)

Run: `npx vitest run src/pages/TaskDetail.test.tsx && npm run typecheck`. **All AC-070..075 green.**

## Task 11 — Move `TaskDetail.css` ownership to `TaskSurface`

**TDD red.** N/A (pure file-move; covered by Task 9/10 tests staying green).

**Green.** Change the `import './TaskDetail.css'` to live in `TaskSurface.tsx` (rename the file to
`mos-app/src/components/tasks/TaskSurface.css` and update the import path; keep all class names so no
visual change). Remove the now-dead import from `TaskDetail.tsx`.

Run: `npx vitest run src/components/tasks/TaskSurface.test.tsx src/pages/TaskDetail.test.tsx && npm run typecheck && npm run build`.

## Task 12 — `TaskSurface` create mode hosts the existing create field set (parity)

**TDD red.** Add to `TaskSurface.test.tsx`:

```tsx
it('AC-080 (TaskSurface create): R/A default to creator, BU defaults to primary-role BU; all editable', () => {
  // render <TaskSurface taskId={null} mode="create" width="full" /> inside an authed AuthContext
  // expect Title input, BU select (primary-role BU pre-selected), R select=creator, A select=creator
})
it('AC-081 (TaskSurface create): empty Title or BU blocks submit with a field error', () => {
  // submit with empty title → expect a role=alert field error; createTask not called
})
```

Run → red.

**Green.** Implement `mode==='create'` in `TaskSurface.tsx` by porting `TaskCreate.tsx`'s form state +
`handleSubmit` + field markup **into the same component** (one pane, no tabs). On success call
`navigate('/tasks/' + newId)` (full host) — Task 25 swaps this for in-place re-render in the drawer.
Reuse `createTask`, `getBusinessUnits`, `getPeople`. Field-error classes use the ratified tokens
(`tc-input-error` → mapped to `--field-error-border`; `tc-field-error` → `--field-error-text`).

Run: `npx vitest run src/components/tasks/TaskSurface.test.tsx && npm run typecheck`.

## Task 13 — Re-host `TaskCreate` page onto `TaskSurface` create mode; close out PR-A

**TDD red.** Keep `mos-app/src/pages/TaskCreate.test.tsx` AC-080/081 assertions intact; run → may red.

**Green.** Reduce `mos-app/src/pages/TaskCreate.tsx` to:

```tsx
export default function TaskCreate() {
  useDocumentTitle('New task — Gordi MOS')
  const navigate = useNavigate()
  return (
    <PageFrame>
      <nav aria-label="Breadcrumb" className="tc-breadcrumb">…Tasks / New task…</nav>
      <TaskSurface taskId={null} mode="create" width="full"
        onClose={() => navigate('/tasks')} />
    </PageFrame>
  )
}
```

Run full Tasks suite: `cd mos-app && npx vitest run src/pages/TaskDetail.test.tsx src/pages/TaskCreate.test.tsx src/pages/TasksPage.test.tsx src/router.test.tsx && npm run typecheck && npx eslint . --max-warnings=0`.

**PR-A done.** The app behaves exactly as before, on the new component spine. Open PR-A; Director merges
before PR-B.

---

# PR-B — Split-view shell + drawer chrome

## Task 14 — `TasksSplitView` shell renders the table pane + `<Outlet>` drawer slot (AC-100, AC-101)

**TDD red.** New `mos-app/src/pages/TasksSplitView.test.tsx`:

```tsx
it('AC-100: at /tasks (no child) the table renders full-width with no drawer', () => {
  // render routes [{ path:'tasks', element:<TasksSplitView/>, children:[{path:':taskId',element:<div data-testid="drawer"/>}]}]
  // at initialEntries ['/tasks'] → expect the tasks table, queryByTestId('drawer') null,
  // and the split container has class 'nodrawer'
})
it('AC-101: at /tasks/:id the table stays mounted and the drawer slot renders', () => {
  // initialEntries ['/tasks/task-1'] → expect both the table AND data-testid="drawer"
})
```

Run → red.

**Green.** Create `mos-app/src/pages/TasksSplitView.tsx` by moving `TasksPage.tsx`'s entire body into it
(it becomes the shell), wrapping the table `.assembly` and an `<Outlet />` in a `.split` grid:

```tsx
import { Outlet, useParams } from 'react-router-dom'
// …existing table state/render…
const { taskId } = useParams()
const drawerOpen = Boolean(taskId) || isCreateRoute  // create detection via useMatch('/tasks/new')
return (
  <PageFrame>
    <div className="page-head-row">…</div>
    <div className={`split${drawerOpen ? '' : ' nodrawer'}`}>
      <section className="assembly" aria-label="Tasks">…existing table…</section>
      <Outlet />
    </div>
    <style>{`/* existing + .split grid */`}</style>
  </PageFrame>
)
```

`.split` CSS: `display:grid; grid-template-columns: 1fr clamp(360px,33vw,480px); align-items:start; gap:12px;`
and `.split.nodrawer { grid-template-columns: 1fr; }`. Page bg `hsl(var(--secondary)/0.35)`.

Update `router.tsx`: `{ path: 'tasks', element: <TasksSplitView />, children: [...] }`; delete the now-unused
`TasksPage` import (or keep `TasksPage.tsx` re-exporting `TasksSplitView` for one release — prefer delete +
rename the test file `TasksPage.test.tsx` → keep its assertions, mount `TasksSplitView`). Remove the
temporary `<Outlet/>` added to `TasksPage` in Task 1.

Run: `npx vitest run src/pages/TasksSplitView.test.tsx src/router.test.tsx && npm run typecheck`.

## Task 15 — Drawer host wraps `TaskSurface` at `width='drawer'` from the route param (AC-101, AC-102)

**TDD red.** New `mos-app/src/components/tasks/TaskDrawer.test.tsx`:

```tsx
it('AC-101/102: reads :taskId and renders TaskSurface in drawer width inside an aside', () => {
  // mock getTask; render <TaskDrawer/> at route '/tasks/task-abc'
  // expect an <aside aria-label="Task detail"> containing the task title
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/TaskDrawer.tsx`:

```tsx
export default function TaskDrawer({ mode }: { mode: 'view' | 'create' }) {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useExpandPref()  // Task 18
  return (
    <aside className={`drawer${expanded ? ' expanded' : ''}`} aria-label={mode === 'create' ? 'New task' : 'Task detail'}>
      <TaskSurface taskId={taskId ?? null} mode={mode} width={expanded ? 'full' : 'drawer'}
        expanded={expanded} onExpandToggle={() => setExpanded(e => !e)}
        onClose={() => navigate('/tasks')} />
    </aside>
  )
}
```

Wire `router.tsx` children to render `<TaskDrawer mode="view" />` / `<TaskDrawer mode="create" />`.

Run: `npx vitest run src/components/tasks/TaskDrawer.test.tsx && npm run typecheck`.

## Task 16 — Extract the pinned action header `TaskDrawerHeader` (AC-103 scaffold, design-plan §1.2)

**TDD red.** New `mos-app/src/components/tasks/TaskDrawerHeader.test.tsx` — assert pinned title + unit +
status trigger + R/A mini-chips render, and a close + expand button are present with their aria-labels:

```tsx
it('renders title, status trigger, R/A mini-chips, expand + close controls', () => {
  // render header with a fixture task; expect getByRole('button',{name:/change status/i}),
  // getByRole('button',{name:/expand to full width/i}), getByRole('button',{name:/close/i})
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/TaskDrawerHeader.tsx` (presentational): `.dw-bar` (crumb +
expand + close), `.dw-pinned` (title, `.dw-unit`, `StatusTrigger` for editors / `StatusPill` for viewers,
R/A mini-chips). Props: `{ task, buName, editable, expanded, onStatusChange, onExpandToggle, onClose }`.
Tokens per design-plan §6.3. Render it inside `TaskSurface` (view mode) replacing the old `.head-card`
block when `width==='drawer'` (keep the full-width head when `width==='full'` — both call the same
`handleStatusChange`).

Run: `npx vitest run src/components/tasks/TaskDrawerHeader.test.tsx src/components/tasks/TaskSurface.test.tsx && npm run typecheck`.

## Task 17 — Extract `TaskTabStrip` (Details/Checklist/Activity) with counts + roving tabs (AC-106 scaffold)

**TDD red.** New `mos-app/src/components/tasks/TaskTabStrip.test.tsx`:

```tsx
it('renders a tablist of 3 tabs with counts and roving selection', () => {
  render(<TaskTabStrip active="details" checklistCount={[1,4]} activityCount={3} onSelect={()=>{}} />)
  expect(screen.getByRole('tablist')).toBeInTheDocument()
  expect(screen.getAllByRole('tab')).toHaveLength(3)
  expect(screen.getByRole('tab', { name: /checklist/i })).toHaveTextContent('1/4')
})
it('arrow keys move roving focus across tabs', () => {/* ArrowRight from Details focuses Checklist */})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/TaskTabStrip.tsx`: `role="tablist"`, three
`role="tab"` buttons with `aria-selected`/`aria-controls`, roving `tabindex`, ArrowLeft/Right handler,
`primary` 2px underline on active (DESIGN.md §5 Tabs — reuse). Props
`{ active: 'details'|'checklist'|'activity', checklistCount:[done,total], activityCount, onSelect }`.

Run: `npx vitest run src/components/tasks/TaskTabStrip.test.tsx && npm run typecheck`.

## Task 18 — Expand toggle persistence hook `useExpandPref` (per-user-global) (AC-104, AC-105)

**TDD red.** New `mos-app/src/components/tasks/useExpandPref.test.ts`:

```tsx
import { renderHook, act } from '@testing-library/react'
import { useExpandPref } from './useExpandPref'

beforeEach(() => localStorage.clear())
it('AC-105: defaults to false and reads the persisted value', () => {
  localStorage.setItem('mos.tasks.expandDefault', 'true')
  const { result } = renderHook(() => useExpandPref())
  expect(result.current[0]).toBe(true)
})
it('AC-104: toggling persists to localStorage', () => {
  const { result } = renderHook(() => useExpandPref())
  act(() => result.current[1](e => !e))
  expect(localStorage.getItem('mos.tasks.expandDefault')).toBe('true')
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/useExpandPref.ts`:
`export function useExpandPref(): [boolean, Dispatch<SetStateAction<boolean>>]` reading/writing
`localStorage['mos.tasks.expandDefault']` (string `'true'`/`'false'`), guarded for SSR/absent storage.

Run: `npx vitest run src/components/tasks/useExpandPref.test.ts && npm run typecheck`.

## Task 19 — Session per-task tab memory hook `useTabMemory` (AC-106)

**TDD red.** New `mos-app/src/components/tasks/useTabMemory.test.ts`:

```tsx
it('AC-106: defaults to "details"; remembers last tab per task id in sessionStorage', () => {
  const { result, rerender } = renderHook(({ id }) => useTabMemory(id), { initialProps: { id: 't1' } })
  expect(result.current[0]).toBe('details')
  act(() => result.current[1]('checklist'))
  expect(sessionStorage.getItem('mos.tasks.tab.t1')).toBe('checklist')
  rerender({ id: 't2' })          // a different task resets to details
  expect(result.current[0]).toBe('details')
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/useTabMemory.ts`:
`useTabMemory(taskId: string | null): [TabKey, (t: TabKey) => void]` keyed `mos.tasks.tab.<id>` in
sessionStorage, default `'details'`.

Run: `npx vitest run src/components/tasks/useTabMemory.test.ts && npm run typecheck`.

## Task 20 — Wire tabs + pinned foot into `TaskSurface` view mode (AC-106, AC-103, design-plan §1.2/§3)

**TDD red.** Add to `TaskSurface.test.tsx`:

```tsx
it('AC-106 (TaskSurface drawer): Details is default; switching to Checklist shows the checklist pane', async () => {
  // render TaskSurface width="drawer"; default shows RACI/description (Details);
  // click the Checklist tab → checklist items visible, RACI hidden
})
it('AC-103: changing status in the pinned header updates the pill in place and calls updateTaskStatus', async () => {
  // open status trigger in the pinned header, pick 'In Progress' → pill updates, mock called
})
```

Run → red.

**Green.** In `TaskSurface.tsx` (`width==='drawer'`, `mode==='view'`): compose `TaskDrawerHeader` (pinned)
+ `TaskTabStrip` (sticky) + a `.dw-tabpane` rendering one of: **Details** (Description + `RaciCard`),
**Checklist** (`ChecklistCard`), **Activity** (`ActivityCard`) keyed by `useTabMemory(taskId)` + a pinned
`.dw-foot` with the Archive button (ghost-danger, A/manager only via `canArchive`). Each pane gets
`role="tabpanel"` + `aria-labelledby`. Call `onTaskChanged?.(updatedTask)` after a successful status
change so the table can sync (Task 21). `width==='full'` keeps the stacked layout (all cards visible, no
tabs) — the expanded focus mode reflows via CSS (Task 22).

Run: `npx vitest run src/components/tasks/TaskSurface.test.tsx && npm run typecheck`.

## Task 21 — Selected-row + open-task sync in `TasksSplitView` (AC-101, AC-103)

**TDD red.** Add to `TasksSplitView.test.tsx`:

```tsx
it('AC-101: the open task row has aria-current and the primary/7% selected style', () => {
  // at /tasks/task-1 → the row for task-1 has aria-current="true"
})
it('AC-103: an optimistic status change in the drawer is reflected in the table row', async () => {
  // open drawer, change status → the table row's StatusPill text updates
  // (TasksSplitView holds an optimistic override map keyed by task id, fed by onTaskChanged)
})
```

Run → red.

**Green.** In `TasksSplitView.tsx`: read `:taskId`, mark that row `aria-current="true"` + class
`row-selected` (`primary/7%` fill). Hold a `Map<string, Partial<TaskListRow>>` optimistic-override state;
pass an `onTaskChanged` down through `TaskDrawer` → `TaskSurface` that merges into the override so the
row reflects status changes without a full reload. (Drawer mounts via `<Outlet>`; pass the callback via
route `context` using `<Outlet context={{ onTaskChanged }} />` + `useOutletContext` in `TaskDrawer`.)

Run: `npx vitest run src/pages/TasksSplitView.test.tsx && npm run typecheck`.

## Task 22 — Drawer states + expanded reflow CSS (AC-104, AC-112; design-plan §1.3/§3.2)

**TDD red.** Add to `TaskSurface.test.tsx` / `TaskDrawer.test.tsx`:

```tsx
it('AC-104: expand toggle sets width=full on the same surface (no nav) and persists', async () => {
  // click expand → TaskSurface receives width='full'; useExpandPref persisted true; URL unchanged
})
it('AC-112: a deep-link to an archived task shows the archived banner + read-only tabs', async () => {
  // getTask resolves archived_at != null → banner + Unarchive (for A/manager); edit affordances absent
})
it('AC-112: not-found resolves to "Task not found" + All tasks link, table still beside it', async () => {
  // getTask rejects → pane shows the not-found message + link; aside collapses to the bar
})
```

Run → red.

**Green.** Add the drawer/expanded states to `TaskSurface.tsx` + `TaskSurface.css`: loading skeleton
pinned-header shape; archived banner (reuse existing `isArchived` branch) inside the pinned header for
drawer width; not-found pane within the drawer body (collapse the pinned header to `.dw-bar`); error pane
+ Retry. Expanded reflow: `.drawer.expanded` → horizontal pinned header, `.dw-tabpane { max-width:880px;
margin:0 auto }`, title `page-title` size. Transitions 150–200ms with
`@media (prefers-reduced-motion: reduce)` removing them.

Run: `npx vitest run src/components/tasks/TaskSurface.test.tsx src/components/tasks/TaskDrawer.test.tsx && npm run typecheck && npm run build`.

## Task 23 — Column-condense ladder when the drawer is open (AC-113; design-plan §4.1)

**TDD red.** Add to `TasksSplitView.test.tsx`:

```tsx
it('AC-113: with the drawer open the Activity column is dropped; Task + Status remain; aria-sort intact', () => {
  // at /tasks/task-1 → the Activity <th> is absent (or aria-hidden), Task & Status <th> present,
  // sortable headers keep aria-sort
})
```

Run → red.

**Green.** In `TasksSplitView.tsx`, derive `condensed = drawerOpen` and conditionally drop the Activity
column, render Owner as avatar-only (`OwnerCell` already collapses to avatar+"+N"; add a `compact` prop
or a CSS class hiding the name), and Due as the chip-only (drop the "Overdue ·" prefix when condensed).
Keep Task + Status always. Preserve `aria-sort` on remaining sortable `<th>`. Drive via a `.condensed`
class on the table + a colgroup switch.

Run: `npx vitest run src/pages/TasksSplitView.test.tsx && npm run typecheck`.

**PR-B done.** Open PR-B; Director merges before PR-C.

---

# PR-C — Create-in-drawer + keyboard + a11y regimes

## Task 24 — Create drawer: one-pane "New task" form in `TaskSurface` drawer width (AC-107)

**TDD red.** Add to `TaskSurface.test.tsx`:

```tsx
it('AC-107: create mode in drawer renders a single "New task" pane (no tabs) with Title/BU required', () => {
  // render TaskSurface mode="create" width="drawer" → "New task" bar, Title input, BU select,
  // R/A defaulted to creator, Create + Cancel foot; queryByRole('tablist') is null
})
```

Run → red.

**Green.** In `TaskSurface.tsx` `mode==='create'`: render the `.dw-pinned` collapsed to a "New task" bar
(no Status/R/A chips), the create field set in `.dw-tabpane` (no `TaskTabStrip`), and `.dw-foot` with
**Create** (primary) + **Cancel** (outline → `onClose`). Reuse the create state/handlers from Task 12.

Run: `npx vitest run src/components/tasks/TaskSurface.test.tsx && npm run typecheck`.

## Task 25 — Create → in-place transition `/tasks/new` → `/tasks/:newId` (AC-108)

**TDD red.** Add to `TaskSurface.test.tsx`:

```tsx
it('AC-108: on Create success it navigates to /tasks/:newId and the surface re-renders in view mode', async () => {
  // mockCreateTask → 'new-id'; fill Title + BU; click Create →
  // expect navigate called with '/tasks/new-id'
})
it('AC-108: empty Title blurred shows inline error in --field-error-text with --field-error-border', () => {
  // blur empty Title → role=alert error below the field; input has the error class
})
```

Run → red.

**Green.** On Create success in `TaskSurface` create mode call `navigate('/tasks/' + newId, { replace: false })`
(the drawer host re-mounts in view mode for the new id — same `TaskSurface`, `mode='view'`). Add
inline-validate-**on-blur** to Title + BU (set the field error on blur if empty; clear on change). Map the
error classes to `--field-error-border` / `--field-error-text` in `TaskSurface.css`.

Run: `npx vitest run src/components/tasks/TaskSurface.test.tsx && npm run typecheck`.

## Task 26 — Keyboard layer hook `useTasksKeyboard` (j/k/Enter/o/Esc/n/e) (AC-109)

**TDD red.** New `mos-app/src/components/tasks/useTasksKeyboard.test.ts`:

```tsx
it('AC-109: j/k move the cursor; Enter/o open; Esc closes; n new; e expand', () => {
  const onOpen = vi.fn(), onClose = vi.fn(), onNew = vi.fn(), onExpand = vi.fn()
  const { result } = renderHook(() => useTasksKeyboard({ rowCount: 3, onOpen, onClose, onNew, onExpand }))
  act(() => fireKey('j')); act(() => fireKey('Enter'))
  expect(onOpen).toHaveBeenCalledWith(0 /* cursor index */)
})
it('AC-109: single-letter hotkeys are suppressed when a text field has focus', () => {
  // focus an <input>; fire 'n' → onNew NOT called
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/useTasksKeyboard.ts`: a `window` keydown listener that
maintains a cursor index (0..rowCount-1), calls the callbacks, and **early-returns when
`document.activeElement` is an INPUT/TEXTAREA/SELECT or `isContentEditable`** for single-letter keys
(Esc always works). Returns `{ cursor, setCursor }`.

Run: `npx vitest run src/components/tasks/useTasksKeyboard.test.ts && npm run typecheck`.

## Task 27 — Wire keyboard into `TasksSplitView` with the `.kfocus` cursor row (AC-109)

**TDD red.** Add to `TasksSplitView.test.tsx`:

```tsx
it('AC-109: j then Enter navigates to the cursor row task; n navigates to /tasks/new', () => {
  // render with rows; fire 'j' → first row gets class kfocus; 'Enter' → navigate('/tasks/<id>')
  // fire 'n' → navigate('/tasks/new')
})
```

Run → red.

**Green.** In `TasksSplitView.tsx` use `useTasksKeyboard({ rowCount, onOpen: i => navigate('/tasks/'+rows[i].id),
onClose: () => navigate('/tasks'), onNew: () => navigate('/tasks/new'), onExpand: toggleExpand })`. Apply
`.kfocus` (`primary` 2px inset rule) to the cursor row. Only engage when focus is within the table region.

Run: `npx vitest run src/pages/TasksSplitView.test.tsx && npm run typecheck`.

## Task 28 — Modal/non-modal focus regime in `TaskDrawer` (AC-110)

**TDD red.** Add to `TaskDrawer.test.tsx`:

```tsx
it('AC-110: ≥1100px split renders a non-modal aside (no role=dialog, no aria-modal)', () => {
  // matchMedia(min-width:1100px)=true → <aside> without role=dialog, no focus trap
})
it('AC-110: <1100px renders role=dialog + aria-modal and traps focus; Esc closes', () => {
  // matchMedia false → role="dialog" aria-modal="true"; Tab cycles within; Esc → onClose
})
```

Run → red.

**Green.** Add `mos-app/src/shell/useIsSplitWidth.ts` (matchMedia `(min-width: 1100px)`, mirroring
`useIsDesktop`). In `TaskDrawer.tsx`: when split → `<aside aria-label=...>` non-modal; when not →
`role="dialog" aria-modal="true"` + a scrim + a focus trap (focus first control on open, trap Tab, Esc →
`onClose`, restore focus to the originating row on close). On open in split mode, move focus to the pinned
header without trapping.

Run: `npx vitest run src/components/tasks/TaskDrawer.test.tsx && npm run typecheck`.

## Task 29 — `aria-live` region for optimistic save/rollback announcements (AC-111)

**TDD red.** Add to `TaskSurface.test.tsx`:

```tsx
it('AC-111: a failed status change rolls back and announces the revert via the live region', async () => {
  // mockUpdateTaskStatus rejects; change status → pill reverts to old value AND
  // an aria-live="polite" region contains /couldn.t save/i
})
it('AC-111: a successful status change announces "Status changed to In Progress"', async () => {})
```

Run → red.

**Green.** Add an off-screen `aria-live="polite"` region in `TaskSurface` (one ref-held string). On each
optimistic handler success/rollback (status, checklist add/toggle, RACI), set the message
("Status changed to X" / "Checklist item added" / "Couldn't save — reverted"). The rollback branches
already exist in the handlers — only the announcement string is added; do not change the rollback logic.

Run: `npx vitest run src/components/tasks/TaskSurface.test.tsx && npm run typecheck`.

## Task 30 — Lint + coverage sweep for PR-C

**TDD red.** N/A (gate task).

**Green.** Run the full new-surface suite + gates:
`cd mos-app && npx vitest run src/components/tasks src/pages/TasksSplitView.test.tsx src/pages/TaskDetail.test.tsx src/pages/TaskCreate.test.tsx --coverage && npm run typecheck && npx eslint . --max-warnings=0`.
Fix any file under 80% changed-line coverage by adding the missing-state unit test (loading / empty-tab /
read-only / dirty-create-discard per design-plan §3). **PR-C done.**

---

# PR-D — Responsive regimes + perf

## Task 31 — Overlay fallback at 920–1100px (AC-110 band; design-plan §4)

**TDD red.** Add to `TaskDrawer.test.tsx`:

```tsx
it('AC-110 (overlay band): 920–1100px renders the drawer as a modal sheet over an un-squashed table', () => {
  // matchMedia: min-width:1100=false, min-width:920=true → role=dialog sheet; .split is NOT squashed
  // (TasksSplitView keeps grid 1fr; the drawer floats with a scrim)
})
```

Run → red.

**Green.** Add `useIsOverlayBand` (matchMedia `(min-width:920px) and (max-width:1099.98px)`). In
`TasksSplitView`, when overlay-band the `.split` stays `1fr` (no squash) and `TaskDrawer` renders the
modal sheet variant (right-side sheet, `card`+`border`, standard scrim) — reusing the Task 28 modal path.

Run: `npx vitest run src/components/tasks/TaskDrawer.test.tsx src/pages/TasksSplitView.test.tsx && npm run typecheck`.

## Task 32 — Mobile full-screen surface <768px (AC-110 mobile; design-plan §1.5)

**TDD red.** Add to `TaskDrawer.test.tsx`:

```tsx
it('AC-110 (mobile): <768px renders the surface full-screen modal; the table is the card list behind it', () => {
  // matchMedia(min-width:768)=false → full-screen role=dialog; the TaskCard list is the table branch
})
```

Run → red.

**Green.** When `!useIsDesktop()` the `TaskDrawer` renders full-screen (`position:fixed; inset:0`) modal,
sticky head + horizontally-scrollable tab strip, ≥44px touch targets. `TasksSplitView` already renders the
card list at <768 (reused from `TasksPage`). Same `/tasks/:id`.

Run: `npx vitest run src/components/tasks/TaskDrawer.test.tsx && npm run typecheck`.

## Task 33 — Virtualize the table at 50+ rows, preserving j/k + aria-sort (AC-114)

**TDD red.** Add to `TasksSplitView.test.tsx`:

```tsx
it('AC-114: with 60 rows the table virtualizes yet j/k cursor + aria-sort still work', () => {
  // render 60 tasks → not all 60 <tr> in the DOM (windowed); fire 'j' moves cursor;
  // sortable header keeps aria-sort; clicking a windowed-in row still navigates
})
```

Run → red.

**Green.** Add windowing for the desktop table when `rows.length >= 50` using
**`@tanstack/react-virtual`** (Q2 default — small, headless, keeps native `<tr>`s; confirm with Director).
Keep `aria-sort` on the `<thead>` (outside the window), and make the `j/k` cursor scroll the windowed row
into view (`scrollToIndex`). Below 50 rows render the plain table (no behavior change).

Run: `npx vitest run src/pages/TasksSplitView.test.tsx && npm run typecheck`.

## Task 34 — Optimistic-rollback hardening for checklist + RACI in the drawer (AC-111 completion)

**TDD red.** Add to `TaskSurface.test.tsx`:

```tsx
it('AC-111: a failed checklist toggle reverts the checkbox and announces the rollback', async () => {})
it('AC-111: a failed RACI add reverts the chip set and announces the rollback', async () => {})
```

Run → red.

**Green.** Ensure the checklist + RACI handlers (already rolling back) also set the live-region message
on failure (extend Task 29's mechanism to those paths). No logic change beyond the announcement.

Run: `npx vitest run src/components/tasks/TaskSurface.test.tsx && npm run typecheck`.

## Task 35 — E2E: open-in-drawer, expand, create-in-drawer (AC-101, AC-104, AC-108)

**TDD red.** New `mos-app/e2e/tasks-split-view.spec.ts` (model on `tasks-create-status.spec.ts`):

- **Journey 1 (AC-101):** log in → `/tasks` → click a row → URL is `/tasks/:id`, the table is still
  visible, the drawer shows the task title, change status inline → the table row reflects it.
- **Journey 2 (AC-104):** open a task → click expand → surface goes full width, URL unchanged → reload →
  next task opens expanded (persisted).
- **Journey 3 (AC-108):** click `+ New task` → drawer create mode → fill Title + BU → Create → URL becomes
  `/tasks/:newId`, surface is in view mode, the task is in the table.

Run: `cd mos-app && npx playwright test e2e/tasks-split-view.spec.ts` → red, then green.

## Task 36 — E2E: deep-link + mobile full-screen + keyboard nav (AC-102, AC-110, AC-109)

**TDD red.** New `mos-app/e2e/tasks-deeplink-mobile-keyboard.spec.ts`:

- **Journey 4 (AC-102):** navigate directly to `/tasks/:id` → table + drawer render together.
- **Journey 5 (AC-110 mobile):** set viewport 390×844 → `/tasks/:id` renders full-screen modal; Esc/back
  returns to the card list.
- **Journey 6 (AC-109):** at `/tasks` press `j j Enter` → opens the 2nd row's task; `Esc` → back to
  `/tasks`; `n` → `/tasks/new`.

Run: `cd mos-app && npx playwright test e2e/tasks-deeplink-mobile-keyboard.spec.ts` → red, then green.

**Final gate (whole feature):**
`cd mos-app && npm run typecheck && npx eslint . --max-warnings=0 && npx vitest run --coverage && npx playwright test e2e/tasks-split-view.spec.ts e2e/tasks-deeplink-mobile-keyboard.spec.ts e2e/tasks-create-status.spec.ts e2e/tasks-archive.spec.ts`.
Confirm AC-090/091 (existing P2-1 e2e) still pass — the redesign must not regress them.

---

## AC → Task coverage map

| AC | Task(s) | Layer |
|---|---|---|
| AC-100 | 1, 14 | unit |
| AC-101 | 14, 15, 21, 27, 35 | unit + e2e |
| AC-102 | 15, 36 | unit + e2e |
| AC-103 | 16, 20, 21 | unit |
| AC-104 | 18, 22, 35 | unit + e2e |
| AC-105 | 18 | unit |
| AC-106 | 17, 19, 20 | unit |
| AC-107 | 24 | unit |
| AC-108 | 25, 35 | unit + e2e |
| AC-109 | 26, 27, 36 | unit + e2e |
| AC-110 | 28, 31, 32, 36 | unit + e2e |
| AC-111 | 29, 34 | unit |
| AC-112 | 22 | unit |
| AC-113 | 23 | unit |
| AC-114 | 33 | unit |
| AC-070..075 (P2-1) | 5,6,7,9,10,16,20 keep green | unit (oracle) |
| AC-080/081 (P2-1) | 12, 13, 24, 25 keep green | unit (oracle) |
| AC-090/091 (P2-1) | 35,36 final gate keep green | e2e (oracle) |
| AC-001..AC-051 (RLS) | **unchanged** — pgTAP not touched (UI-only) | pgTAP (regression) |

## Risks & mitigations

1. **`TaskDetail` (844-line) → `TaskSurface` refactor (highest risk).** Mitigated by: extract-then-recompose
   in 8 small tasks (2–8), each keeping `TaskDetail.test.tsx` green; PR-A lands behavior-identical before
   any visual change; the AC-070..075 oracle is the gate at every commit.
2. **Routing migration (sibling → nested) breaking deep-links.** Mitigated by: `/tasks/:id` + `/tasks/new`
   paths are unchanged (only their parent changes); Task 1's router test + Task 36's deep-link e2e prove
   My Week / Daily Log links still resolve. No caller is edited.
3. **Dual focus regime (non-modal split vs modal overlay/mobile) correctness.** Mitigated by separate
   tests for each regime (Tasks 28/31/32) and Esc-to-close proven in the modal path.
4. **Virtualization vs j/k cursor + aria-sort.** Mitigated by Task 33's combined assertion; fallback per
   ADR-0007 "Watch": ship cursor + sort correctness first, virtualization is a perf add-on, not behavior.
5. **Outlet context plumbing for optimistic table sync.** If `useOutletContext` proves awkward, fall back
   to lifting drawer state into `TasksSplitView` and rendering `TaskDrawer` directly (still param-driven) —
   either keeps `/tasks/:id` canonical.

## Open questions for the Director

- **Q1 — fallback threshold 1100px?** Baked into Tasks 28/31 (`useIsSplitWidth` = ≥1100; overlay band
  920–1100). Confirm vs 1024 / 1152 (design-plan Q1). Changing it is a one-line matchMedia edit.
- **Q2 — virtualization library = `@tanstack/react-virtual`?** Baked into Task 33 (headless, keeps `<tr>`s,
  `scrollToIndex` for the cursor). Confirm or name an alternative.
- **Q3 — storage keys** `mos.tasks.expandDefault` (global, localStorage) + `mos.tasks.tab.<id>` (per-task,
  sessionStorage). Confirm the `mos.tasks.*` prefix matches any existing MOS pref convention.
- **Q4 — 920–1100 overlay band is mockup-adjacent, not mockup-shown** (design-plan Q4). Reuses existing
  tokens (scrim + `card`/`border` sheet) so no new identity, but flag for a design-review render check.
- **Q5 — `TaskCreate.tsx` / `TaskDetail.tsx` thin wrappers vs full removal.** The plan keeps them as thin
  hosts (Tasks 10/13) so the full-page routes survive if ever wanted; once the drawer is the only entry,
  the Director may choose to delete them and route children straight to `TaskDrawer` (already the case for
  the nested children — the thin pages become reachable only if a future direct route is added). Confirm
  whether to delete them at the end of PR-C.
