import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'

// ── Mock the data layer (table + drawer both pull from it) ────────────────────
vi.mock('../lib/db/tasks', () => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskRaci: vi.fn(),
  updateTaskFields: vi.fn(),
  addChecklistItem: vi.fn(),
  toggleChecklistItem: vi.fn(),
  reorderChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
  archiveTask: vi.fn(),
  unarchiveTask: vi.fn(),
}))
vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))
// Cascade catalogs (Task B) — the workspace loads these non-blocking; mock to empty so the
// unit test never reaches the real supabase client. (Resolution set in beforeEach — resetAllMocks
// would otherwise wipe a factory-set implementation, leaving listObjectives() === undefined.)
vi.mock('../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))
vi.mock('../lib/comments/postComment', () => ({
  listComments: vi.fn(),
  postComment: vi.fn(),
}))

import { listTasks, getTask, updateTaskStatus, createTask, archiveTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { listComments } from '@/lib/comments/postComment'
import { TasksLayout } from './tasks-layout'
import { TaskDrawer } from '@/components/tasks/task-drawer'
import { __resetExpandPrefForTests } from '@/components/tasks/use-expand-pref'

const mockListTasks = vi.mocked(listTasks)
const mockGetTask = vi.mocked(getTask)
const mockUpdateTaskStatus = vi.mocked(updateTaskStatus)
const mockCreateTask = vi.mocked(createTask)
const mockArchiveTask = vi.mocked(archiveTask)

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

// Width-aware stub: control split (≥1100) and desktop (≥768) independently.
function stubWidths({ split, desktop = true }: { split: boolean; desktop?: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      let matches = false
      if (query.includes('1100')) matches = split
      else if (query.includes('768')) matches = desktop
      else if (query.includes('919')) matches = !desktop // useIsNarrow (max-width)
      return {
        matches, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }
    },
  })
}

const VIEWER_ID = 'viewer-person-id'
const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Arief Said',
  email: 'arief@gordi.id', archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const mockRole: RolesRow = {
  id: 'role-1', org_id: 'org', business_unit_id: 'bu-1', name: 'CEO',
  reports_to_role_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: mockPerson, roles: [mockRole], isManager: false, accessRoles: [] },
  signOut: async () => {},
}

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Default task',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T10:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

const BUS = [{ id: 'bu-1', name: 'Kitchen' }]
const PEOPLE = [{ id: VIEWER_ID, full_name: 'Arief Said' }]

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  __resetExpandPrefForTests()
  stubMatchMedia(true)
  vi.mocked(getBusinessUnits).mockResolvedValue(BUS)
  vi.mocked(getPeople).mockResolvedValue(PEOPLE)
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(listWorkLines).mockResolvedValue([])
  vi.mocked(listComments).mockResolvedValue([])
})

function renderAt(path: string) {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/work/tasks" element={<TasksLayout />}>
            <Route path="new" element={<TaskDrawer mode="create" />} />
            <Route path=":taskId" element={<TaskDrawer mode="view" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// OD-63: a direct/new-tab/refresh (or the "Open full page" escalation) renders the
// record as a standalone full canonical PAGE. In jsdom there's no
// PerformanceNavigationTiming, so the boot direct-load path stays null; the
// explicit state escalation ({ taskSurface: 'page' }) is the unit-test seam, and the
// real-browser direct-open branch is proven by the e2e.
function renderAtState(path: string, state: unknown) {
  // Split the query off the path: react-router does not re-parse a `pathname` that
  // already carries `?…` when the initial entry is an object, so pass search explicitly.
  const [pathname, query = ''] = path.split('?')
  const search = query ? `?${query}` : ''
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={[{ pathname, search, state }] as never}>
        <Routes>
          <Route path="/work/tasks" element={<TasksLayout />}>
            <Route path="new" element={<TaskDrawer mode="create" />} />
            <Route path=":taskId" element={<TaskDrawer mode="view" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('TasksLayout — split-view shell (ADR-0007, PR-B)', () => {
  it('AC-121: TasksLayout renders inside the V3 Workspace frame — full-bleed content, no inline 1080px prose cap', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Triage me' })])
    renderAt('/work/tasks')
    await waitFor(() => screen.getByText('Triage me'))
    const main = document.querySelector('main') as HTMLElement
    // V3 workspace frame: the <main> carries the family marker and the content
    // container is the page-frame__content wrapper (width capped by CSS at 1180px,
    // never the old inline 1080px prose cap).
    expect(main.getAttribute('data-page-family')).toBe('workspace')
    const inner = main.querySelector(':scope > div') as HTMLElement
    expect(inner.className).toContain('page-frame__content')
    expect(inner.style.maxWidth).toBe('')
  })

  it('AC-120: the Tasks <main> landmark is present and the breadcrumb/nav survive full-bleed', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Triage me' })])
    renderAt('/work/tasks')
    await waitFor(() => screen.getByText('Triage me'))
    // <main> landmark still present (full-bleed does not remove it)
    expect(document.querySelector('main')).toBeTruthy()
    // Tasks heading still renders (structural anchor for the page)
    expect(screen.getByRole('heading', { name: /tasks/i })).toBeInTheDocument()
  })

  it('AC-100: at /tasks the table renders and no drawer is present (nodrawer)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Triage me' })])
    renderAt('/work/tasks')
    await waitFor(() => screen.getByText('Triage me'))
    expect(screen.queryByRole('complementary', { name: /task detail/i })).toBeNull()
    expect(document.querySelector('.split.nodrawer')).toBeTruthy()
  })

  it('AC-301: /work/tasks?view=mine activates My work and keeps one Tasks region', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Mine task' })])
    renderAt('/work/tasks?view=mine')
    await waitFor(() => screen.getByText('Mine task'))
    expect(screen.getByRole('button', { name: 'My work' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelectorAll('.assembly')).toHaveLength(1)
  })

  it('§Task-11: /work/tasks?view=team degrades to the org-visible All set with no Team-work chip (Issue-8 gate)', async () => {
    // DELIBERATE goal change (record-collection plan §Task-11): `view=team` is no longer a supported
    // view; it is rejected on parse and falls back to the org-visible All set. No Team-work chip
    // exists until Issue 8 lands the real Task team_id contract.
    mockListTasks.mockResolvedValue([makeTask({ title: 'Shared task', responsible_person_id: 'other-id', accountable_person_id: 'other-id' })])
    renderAt('/work/tasks?view=team')
    await waitFor(() => screen.getByText('Shared task'))
    expect(screen.queryByRole('button', { name: 'Team work' })).toBeNull()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelectorAll('.assembly')).toHaveLength(1)
    expect(document.querySelectorAll('.drawer, [role="dialog"]')).toHaveLength(0)
  })

  it('AC-304: /work/tasks?view=bogus falls back safely with no active saved-view chip', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Fallback task', responsible_person_id: 'other-id', accountable_person_id: 'other-id' })])
    renderAt('/work/tasks?view=bogus')
    await waitFor(() => screen.getByText('Fallback task'))
    expect(screen.getByRole('button', { name: 'My work' })).toHaveAttribute('aria-pressed', 'false')
    // §Task-11: no Team-work chip exists.
    expect(screen.queryByRole('button', { name: 'Team work' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Follow-ups' })).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelectorAll('.assembly')).toHaveLength(1)
  })

  it('AC-309: /work/tasks/task-1?view=mine keeps one table host and one drawer host', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open me' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open me' }), checklist: [], events: [] })
    renderAt('/work/tasks/task-1?view=mine')
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
    expect(document.querySelectorAll('.assembly')).toHaveLength(1)
    expect(screen.getAllByRole('complementary', { name: /task detail/i })).toHaveLength(1)
  })

  it('AC-101: at /tasks/:id the table STAYS mounted and the drawer renders beside it', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Triage me' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Triage me' }), checklist: [], events: [] })
    renderAt('/work/tasks/task-1')
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
    // table still present
    await waitFor(() => expect(document.querySelector('tbody tr.task-row')).toBeTruthy())
    expect(document.querySelector('.split.nodrawer')).toBeNull()
  })

  // I7 (cohesion-debt 2026-07-19): the open row is a SELECTION → aria-selected;
  // aria-current stays reserved for the rail/breadcrumb ("exactly one aria-current").
  it('AC-101: the open task row carries aria-selected and the selected style (never aria-current)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' }), makeTask({ id: 'task-2', title: 'Other' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open one' }), checklist: [], events: [] })
    renderAt('/work/tasks/task-1')
    await waitFor(() => expect(document.querySelector('tr.task-row.row-selected')).toBeTruthy())
    const selectedRow = document.querySelector('tr.task-row.row-selected')
    expect(selectedRow).toBeTruthy()
    expect(selectedRow?.getAttribute('aria-selected')).toBe('true')
    expect(selectedRow?.getAttribute('aria-current')).toBeNull()
    expect(selectedRow?.textContent).toContain('Open one')
  })

  it('AC-103 / AC-117: an optimistic status change in the drawer is reflected in the table row without navigation (RI-2: no view transition)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one', status: 'Open' })])
    mockGetTask
      .mockResolvedValueOnce({ task: makeTask({ id: 'task-1', title: 'Open one', status: 'Open' }), checklist: [], events: [] })
      .mockResolvedValueOnce({ task: makeTask({ id: 'task-1', title: 'Open one', status: 'Blocked' }), checklist: [], events: [] })
    mockUpdateTaskStatus.mockResolvedValue()
    renderAt('/work/tasks/task-1')
    await waitFor(() => expect(document.querySelector('tr.task-row.row-selected')).toBeTruthy())
    // table row shows the Open status tag initially (soft Tag, .mk-tag)
    const row = () => document.querySelector('tr.task-row.row-selected')
    expect(row()?.querySelector('.mk-tag')?.textContent).toContain('Open')
    // change status in the drawer header (scope to the status popover listbox,
    // not the toolbar Status <select> which also has a "Blocked" option)
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    const listbox = screen.getByRole('listbox', { name: /select status/i })
    fireEvent.click(within(listbox).getByRole('option', { name: 'Blocked' }))
    await waitFor(() => {
      const pill = row()?.querySelector('.mk-tag')
      expect(pill?.textContent).toContain('Blocked')
    })
  })

  it('AC-113: with the drawer open the Activity column is dropped; Task + Status remain; aria-sort intact', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open one' }), checklist: [], events: [] })
    renderAt('/work/tasks/task-1')
    await waitFor(() => expect(document.querySelector('tr.task-row.row-selected')).toBeTruthy())
    expect(screen.queryByRole('columnheader', { name: /activity/i })).toBeNull()
    expect(screen.getByRole('columnheader', { name: /^task/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument()
    // sortable Due header keeps aria-sort
    expect(screen.getByRole('columnheader', { name: /due/i }).getAttribute('aria-sort')).toBe('ascending')
  })

  // Wave 2c: Activity moved OUT of the default table (to the drawer) for every desktop
  // mode, so the decision-critical Due column can't be clipped. The priority columns
  // (Task/Status/Due) remain + Due stays sortable.
  it('AC-113: at /tasks (no drawer) the priority columns render and Activity is drawer-only', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    renderAt('/work/tasks')
    await waitFor(() => screen.getByText('Open one'))
    expect(screen.getByRole('columnheader', { name: /^task$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /due/i }).getAttribute('aria-sort')).toBe('ascending')
    // Activity is no longer a table column (moved to the drawer — OD-62).
    expect(screen.queryByRole('columnheader', { name: /activity/i })).toBeNull()
  })

  // AC-110/113: below the split threshold the drawer floats over a full-width table
  // (overlay/mobile), so the table must NOT condense. Priority columns render; Activity
  // is drawer-only in every mode.
  it('AC-113: below 1100px the table is NOT condensed even with a task open (drawer is a modal overlay)', async () => {
    stubWidths({ split: false, desktop: true }) // <1100px but ≥768 → overlay/modal regime
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open one' }), checklist: [], events: [] })
    renderAt('/work/tasks/task-1')
    await waitFor(() => expect(document.querySelector('tbody tr.task-row')).toBeTruthy())
    // Overlay regime never condenses (the drawer floats over a full-width table).
    expect(document.querySelector('.assembly.condensed')).toBeNull()
    // Activity is drawer-only in every mode (Wave 2c priority trim).
    expect(screen.queryByRole('columnheader', { name: /activity/i })).toBeNull()
  })

  it('AC-107: /tasks/new renders the create drawer beside the table', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    renderAt('/work/tasks/new')
    await waitFor(() => screen.getByRole('complementary', { name: /create task/i }))
    expect(document.querySelector('tbody tr.task-row')).toBeTruthy()
  })

  it('with the create drawer open, the header "+ New task" is not a second active primary', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    renderAt('/work/tasks/new')
    await waitFor(() => screen.getByRole('complementary', { name: /create task/i }))
    expect(screen.queryByRole('link', { name: /\+ create task/i })).toBeNull()
  })

  // RI-1 (C1): the expand toggle must collapse the table live — the .split grid
  // and the layout-driving `expanded` prop share ONE source of truth. Previously
  // useExpandPref was instantiated twice (read-only in TasksLayout, setter in
  // TaskDrawer) so toggling flipped the drawer + localStorage but the grid never
  // re-rendered until reload. Both panes must reflect the toggle in the SAME render.
  it('RI-1: toggling expand in the drawer collapses the .split grid to one column live (no reload)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open one' }), checklist: [], events: [] })
    renderAt('/work/tasks/task-1')
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
    // Split view (not expanded): grid is two-column, table assembly visible
    const split = document.querySelector('.split')
    expect(split).toBeTruthy()
    expect(split?.classList.contains('expanded')).toBe(false)
    expect(document.querySelector('.assembly')).toBeTruthy()

    // Toggle expand from the drawer header
    fireEvent.click(screen.getByRole('button', { name: /expand to full width/i }))

    // SAME render: the layout grid collapses to one column (.split.expanded) —
    // no reload required.
    await waitFor(() => {
      expect(document.querySelector('.split.expanded')).toBeTruthy()
    })
    // and the surface itself promotes to the full-width two-column record page
    // (ADR-0013 D3 / AC-R06: expanded@split mounts .record-2col, not the compact stack).
    expect(document.querySelector('.record-2col')).toBeTruthy()
    expect(document.querySelector('.dw-surface')).toBeNull()
  })

  // RI-2 (C2): after creating a task in the drawer, the table must show the new
  // row + updated count without a reload. Previously TasksTable fetched only on
  // [businessUnitId, statusFilter, includeArchived] so create had no refetch
  // channel — the count + empty-copy said "0 tasks" while the drawer showed it.
  it('RI-2: creating a task in the drawer adds its row to the table + updates the count (no reload)', async () => {
    // First load: empty list. After create: the new row is present.
    mockListTasks
      .mockResolvedValueOnce([])
      .mockResolvedValue([makeTask({ id: 'task-new', title: 'Freshly created' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-new', title: 'Freshly created' }), checklist: [], events: [] })
    mockCreateTask.mockResolvedValue('task-new')
    renderAt('/work/tasks/new')
    await waitFor(() => screen.getByRole('complementary', { name: /create task/i }))
    // Initially the table is empty. UI-fidelity rework: the count lives in the
    // content-header count pill (.ch-count) — read it there (was "N tasks" text).
    await waitFor(() => {
      expect(document.querySelector('.content-header .ch-count')?.textContent).toBe('0')
    })

    // Fill + submit the create form (title required; BU pre-fills from role)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Freshly created' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    // The new row appears in the table and the count reflects it — no reload.
    await waitFor(() => {
      expect(document.querySelector('tbody tr.task-row')).toBeTruthy()
    })
    expect(screen.getByText('Freshly created')).toBeInTheDocument()
    expect(document.querySelector('.content-header .ch-count')?.textContent).toBe('1')
    // and the create task's row is the selected one (we navigated to /tasks/task-new)
    await waitFor(() => {
      const sel = document.querySelector('tr.task-row.row-selected')
      expect(sel?.textContent).toContain('Freshly created')
    })
  })

  // AC-109: keyboard navigation — j/k move the cursor, Enter opens, n opens create,
  // Esc closes. The cursor row carries the .kfocus class.
  it('AC-109: j moves the cursor (row gets .kfocus); Enter opens the cursor row', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'task-1', title: 'First row' }),
      makeTask({ id: 'task-2', title: 'Second row' }),
    ])
    renderAt('/work/tasks')
    await waitFor(() => screen.getByText('First row'))
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => expect(document.querySelector('tr.task-row.kfocus')).toBeTruthy())
    const cursorRow = document.querySelector('tr.task-row.kfocus')
    expect(cursorRow?.textContent).toContain('First row')
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => {
      expect(document.querySelector('tr.task-row.kfocus')?.textContent).toContain('Second row')
    })
    // Enter opens the cursor row → navigates to /tasks/task-2 → drawer mounts
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-2', title: 'Second row' }), checklist: [], events: [] })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
  })

  it('AC-109: n navigates to the create drawer', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'First row' })])
    renderAt('/work/tasks')
    await waitFor(() => screen.getByText('First row'))
    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => screen.getByRole('complementary', { name: /create task/i }))
  })

  it('AC-109: Esc closes the open drawer (back to /tasks, table full width)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'First row' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'First row' }), checklist: [], events: [] })
    renderAt('/work/tasks/task-1')
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('.split.nodrawer')).toBeTruthy())
  })

  it('AC-109: typing "n" in the search field does NOT open create (hotkeys suppressed in fields)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'First row' })])
    renderAt('/work/tasks')
    await waitFor(() => screen.getByText('First row'))
    const search = screen.getByLabelText('Search tasks')
    search.focus()
    fireEvent.keyDown(window, { key: 'n' })
    // still on /tasks (no create drawer)
    expect(screen.queryByRole('complementary', { name: /create task/i })).toBeNull()
  })

  // AC-114: the table virtualizes at 50+ rows yet j/k cursor + aria-sort survive.
  // jsdom reports offsetHeight=0, so stub a 600px viewport for the scroll
  // container the virtualizer measures (otherwise it'd window to 0 rows).
  function stubViewportHeight(height = 600) {
    const orig = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.className?.includes?.('tasks-scroll-virtual')) return height
        return orig?.get?.call(this) ?? 0
      },
    })
  }

  it('AC-114: with 60 rows the table windows (not all 60 <tr> in the DOM)', async () => {
    stubViewportHeight()
    const rows = Array.from({ length: 60 }, (_, i) =>
      makeTask({ id: `task-${i}`, title: `Task number ${i}` }))
    mockListTasks.mockResolvedValue(rows)
    renderAt('/work/tasks')
    await waitFor(() => expect(document.querySelector('tbody tr.task-row')).toBeTruthy())
    const bodyRows = document.querySelectorAll('tbody tr.task-row')
    // Windowed: far fewer than 60 rows are actually mounted.
    expect(bodyRows.length).toBeLessThan(60)
    expect(bodyRows.length).toBeGreaterThan(0)
  })

  it('AC-114: under windowing aria-sort stays on the sortable headers and j/k still moves the cursor', async () => {
    stubViewportHeight()
    const rows = Array.from({ length: 60 }, (_, i) =>
      makeTask({ id: `task-${i}`, title: `Task number ${i}` }))
    mockListTasks.mockResolvedValue(rows)
    renderAt('/work/tasks')
    await waitFor(() => expect(document.querySelector('tbody tr.task-row')).toBeTruthy())
    // aria-sort intact on the Due header (default sort)
    expect(screen.getByRole('columnheader', { name: /due/i }).getAttribute('aria-sort')).toBe('ascending')
    // j moves the cursor (the cursor row carries .kfocus)
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => expect(document.querySelector('tr.task-row.kfocus')).toBeTruthy())
  })

  it('AC-114: under 50 rows the table is NOT windowed (all rows mounted)', async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: `task-${i}`, title: `Task number ${i}` }))
    mockListTasks.mockResolvedValue(rows)
    renderAt('/work/tasks')
    await waitFor(() => expect(document.querySelector('tbody tr.task-row')).toBeTruthy())
    expect(document.querySelectorAll('tbody tr.task-row').length).toBe(10)
  })

  // RI-3 (I3): archiving from the drawer must remove the row from the default
  // list + decrement the count without a reload.
  it('RI-3: archiving from the drawer removes the row from the default list + decrements the count (no reload)', async () => {
    mockListTasks
      .mockResolvedValueOnce([
        makeTask({ id: 'task-1', title: 'Keep me' }),
        makeTask({ id: 'task-2', title: 'Archive me' }),
      ])
      .mockResolvedValue([makeTask({ id: 'task-1', title: 'Keep me' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-2', title: 'Archive me' }), checklist: [], events: [] })
    mockArchiveTask.mockResolvedValue()
    renderAt('/work/tasks/task-2')
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
    await waitFor(() => expect(document.querySelector('.content-header .ch-count')?.textContent).toBe('2'))

    // Archive from the drawer foot (collapsed split shows "Archive task")
    fireEvent.click(screen.getByRole('button', { name: /archive task/i }))
    // Confirm the archive dialog
    const confirm = await screen.findByRole('button', { name: /^archive$/i })
    fireEvent.click(confirm)

    // The archived row leaves the default list + the count decrements — no reload.
    // This assertion sits at the end of a multi-async-step chain (archiveTask resolve →
    // refreshKey bump → list refetch → navigate('/work/tasks') → drawer unmount + row drop).
    // Under parallel-test CPU load that chain can take several seconds of wall-clock re-renders,
    // so the default 1000ms waitFor budget and Vitest's default 5000ms test budget are too tight.
    // Widen the budgets for this genuinely-chained transition; the goal (archived title gone from
    // BOTH list and drawer, no reload) is unchanged.
    await waitFor(() => {
      expect(screen.queryByText('Archive me')).toBeNull()
    }, { timeout: 4000 })
    expect(screen.getByText('Keep me')).toBeInTheDocument()
    expect(document.querySelector('.content-header .ch-count')?.textContent).toBe('1')
  }, 10_000)
})

// ── OD-63: canonical page mode on direct open ────────────────────────────────
describe('TasksLayout — OD-63 canonical page mode', () => {
  it('OD-63: an "Open full page" escalation renders the record as a standalone full page — no table, no drawer', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Standalone page task' }), checklist: [], events: [] })
    renderAtState('/work/tasks/task-1', { taskSurface: 'page' })

    // The ONE renderer (TaskSurface) renders the record identity row.
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Standalone page task' }))

    // No split-drawer aside and no table shell — it is a standalone canonical page.
    expect(screen.queryByRole('complementary', { name: /task detail/i })).toBeNull()
    expect(screen.queryByRole('region', { name: /tasks/i })).toBeNull()
    expect(document.querySelector('.split')).toBeNull()
    expect(document.querySelector('tbody tr.task-row')).toBeNull()
    // The full-width two-column record anatomy mounts.
    expect(document.querySelector('.record-2col')).toBeTruthy()
    // presentation="page" → no "Open full page" escalation (already on the page).
    expect(screen.queryByRole('button', { name: /open full page/i })).toBeNull()
  })

  it('OD-63: in-list click (no state) keeps the split drawer + table (panel mode)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Row task' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Row task' }), checklist: [], events: [] })
    renderAt('/work/tasks/task-1')
    // The drawer mounts beside a still-mounted table — the load-bearing split-view win.
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
    expect(document.querySelector('tbody tr.task-row')).toBeTruthy()
    expect(document.querySelector('.record-2col')).toBeNull()
    // And the panel offers the escalation to the full page.
    expect(screen.getByRole('button', { name: /open full page/i })).toBeInTheDocument()
  })

  // V3 Issue 3, Task 9/10 — the direct/full Task page is the Focused-record representative.
  it('Focused record family: a direct Task page mounts inside the focused-record frame with one h1 (shell) + one h2 (record identity)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open me' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open me' }), checklist: [], events: [] })
    renderAtState('/work/tasks/task-1', { taskSurface: 'page' })

    // The record identity is now an h2 (the PageFamilyFrame owns the shell h1).
    await screen.findByRole('heading', { level: 2, name: 'Open me' })
    // The shell h1 resolves to the same title one render later (async via
    // onTitleResolved), so wait for it before asserting the exact heading counts.
    await screen.findByRole('heading', { level: 1, name: 'Open me' })

    const main = document.querySelector('main')
    expect(main?.getAttribute('data-page-family')).toBe('focused-record')

    // Exactly one shell h1 and one record-identity h2, both the resolved title.
    expect(screen.getAllByRole('heading', { level: 1, name: 'Open me' })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 2, name: 'Open me' })).toHaveLength(1)

    // The focused-record job sentence renders; the internal family name never shows.
    expect(screen.getByText('Review and update this task.')).toBeInTheDocument()
    expect(screen.queryByText('Focused record')).toBeNull()

    // Typed Task context is preserved (Team = Kitchen); no collection/table shell.
    expect(document.querySelector('.rd-id-sub')?.textContent).toContain('Kitchen')
    expect(document.querySelector('tbody tr.task-row')).toBeNull()
    expect(document.querySelector('.record-2col')).toBeTruthy()
  })

  it('Focused record family: the shell shows the loading state before the title resolves', () => {
    mockGetTask.mockReturnValue(new Promise(() => {}))
    renderAtState('/work/tasks/task-1', { taskSurface: 'page' })
    const main = document.querySelector('main')
    expect(main?.getAttribute('data-page-family')).toBe('focused-record')
    expect(main?.getAttribute('data-page-state')).toBe('loading')
    expect(main?.getAttribute('aria-busy')).toBe('true')
  })

  it('OD-63: ?view= is preserved on the standalone page (Rule 4)', async () => {
    // The record fails to load → the not-found back link must carry the preserved
    // ?view= search (TaskSurface builds it from location.search), so a direct-open
    // of /work/tasks/:id?view=overdue returns the user to the SAME saved view.
    mockGetTask.mockRejectedValue(new Error('not found'))
    renderAtState('/work/tasks/task-1?view=overdue', { taskSurface: 'page' })
    await waitFor(() => screen.getByText(/task not found/i))
    const allTasks = screen.getByRole('link', { name: /all tasks/i })
    expect(allTasks.getAttribute('href')).toContain('view=overdue')
  })
})
