import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { AuthState } from '../auth/context'
import { AuthContext } from '../auth/context'
import type { PeopleRow, RolesRow } from '../lib/database.types'
import type { TaskListRow } from '../lib/db/tasks.types'

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

import { listTasks, getTask, updateTaskStatus, createTask, archiveTask } from '../lib/db/tasks'
import { getBusinessUnits, getPeople } from '../lib/db/directory'
import TasksLayout from './TasksLayout'
import TaskDrawer from '../components/tasks/TaskDrawer'
import { __resetExpandPrefForTests } from '../components/tasks/useExpandPref'

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
  viewer: { person: mockPerson, roles: [mockRole], isManager: false },
  signOut: async () => {},
}

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Default task',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, last_activity_at: '2026-06-11T10:00:00Z',
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
})

function renderAt(path: string) {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tasks" element={<TasksLayout />}>
            <Route path="new" element={<TaskDrawer mode="create" />} />
            <Route path=":taskId" element={<TaskDrawer mode="view" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('TasksLayout — split-view shell (ADR-0007, PR-B)', () => {
  it('AC-121: TasksLayout renders inside a full-bleed (variant=data) PageFrame — no 1080px maxWidth cap', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Triage me' })])
    renderAt('/tasks')
    await waitFor(() => screen.getByText('Triage me'))
    const main = document.querySelector('main') as HTMLElement
    const inner = main.querySelector('main > div') as HTMLElement
    expect(inner.style.maxWidth).toBe('none')
  })

  it('AC-120: the Tasks <main> landmark is present and the breadcrumb/nav survive full-bleed', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Triage me' })])
    renderAt('/tasks')
    await waitFor(() => screen.getByText('Triage me'))
    // <main> landmark still present (full-bleed does not remove it)
    expect(document.querySelector('main')).toBeTruthy()
    // Tasks heading still renders (structural anchor for the page)
    expect(screen.getByRole('heading', { name: /tasks/i })).toBeInTheDocument()
  })

  it('AC-100: at /tasks the table renders and no drawer is present (nodrawer)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Triage me' })])
    renderAt('/tasks')
    await waitFor(() => screen.getByText('Triage me'))
    expect(screen.queryByRole('complementary', { name: /task detail/i })).toBeNull()
    expect(document.querySelector('.split.nodrawer')).toBeTruthy()
  })

  it('AC-101: at /tasks/:id the table STAYS mounted and the drawer renders beside it', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Triage me' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Triage me' }), checklist: [], events: [] })
    renderAt('/tasks/task-1')
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
    // table still present
    expect(document.querySelector('tbody tr.task-row')).toBeTruthy()
    expect(document.querySelector('.split.nodrawer')).toBeNull()
  })

  it('AC-101: the open task row carries aria-current and the selected style', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' }), makeTask({ id: 'task-2', title: 'Other' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open one' }), checklist: [], events: [] })
    renderAt('/tasks/task-1')
    await waitFor(() => expect(document.querySelector('tr.task-row.row-selected')).toBeTruthy())
    const selectedRow = document.querySelector('tr.task-row.row-selected')
    expect(selectedRow).toBeTruthy()
    expect(selectedRow?.getAttribute('aria-current')).toBe('true')
    expect(selectedRow?.textContent).toContain('Open one')
  })

  it('AC-103 / AC-117: an optimistic status change in the drawer is reflected in the table row without navigation (RI-2: no view transition)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one', status: 'Open' })])
    mockGetTask
      .mockResolvedValueOnce({ task: makeTask({ id: 'task-1', title: 'Open one', status: 'Open' }), checklist: [], events: [] })
      .mockResolvedValueOnce({ task: makeTask({ id: 'task-1', title: 'Open one', status: 'Blocked' }), checklist: [], events: [] })
    mockUpdateTaskStatus.mockResolvedValue()
    renderAt('/tasks/task-1')
    await waitFor(() => expect(document.querySelector('tr.task-row.row-selected')).toBeTruthy())
    // table row shows the Open status tag initially (Twenty soft Tag, .mk-tag)
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
    renderAt('/tasks/task-1')
    await waitFor(() => expect(document.querySelector('tr.task-row.row-selected')).toBeTruthy())
    expect(screen.queryByRole('columnheader', { name: /activity/i })).toBeNull()
    expect(screen.getByRole('columnheader', { name: /^task/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument()
    // sortable Due header keeps aria-sort
    expect(screen.getByRole('columnheader', { name: /due/i }).getAttribute('aria-sort')).toBe('ascending')
  })

  it('AC-113: at /tasks (no drawer) the Activity column is present (not condensed)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    renderAt('/tasks')
    await waitFor(() => screen.getByText('Open one'))
    expect(screen.getByRole('columnheader', { name: /activity/i })).toBeInTheDocument()
  })

  // AC-110/113: below the split threshold the drawer floats over a full-width table
  // (overlay/mobile), so the table must NOT condense (Activity stays).
  it('AC-113: below 1100px the table is NOT condensed even with a task open (drawer is a modal overlay)', async () => {
    stubWidths({ split: false, desktop: true }) // <1100px but ≥768 → overlay/modal regime
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open one' }), checklist: [], events: [] })
    renderAt('/tasks/task-1')
    await waitFor(() => expect(document.querySelector('tbody tr.task-row')).toBeTruthy())
    expect(screen.getByRole('columnheader', { name: /activity/i })).toBeInTheDocument()
    expect(document.querySelector('.assembly.condensed')).toBeNull()
  })

  it('AC-107: /tasks/new renders the create drawer beside the table', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    renderAt('/tasks/new')
    await waitFor(() => screen.getByRole('complementary', { name: /new task/i }))
    expect(document.querySelector('tbody tr.task-row')).toBeTruthy()
  })

  // RI-1 (C1): the expand toggle must collapse the table live — the .split grid
  // and the layout-driving `expanded` prop share ONE source of truth. Previously
  // useExpandPref was instantiated twice (read-only in TasksLayout, setter in
  // TaskDrawer) so toggling flipped the drawer + localStorage but the grid never
  // re-rendered until reload. Both panes must reflect the toggle in the SAME render.
  it('RI-1: toggling expand in the drawer collapses the .split grid to one column live (no reload)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open one' }), checklist: [], events: [] })
    renderAt('/tasks/task-1')
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
    // and the drawer itself reflects the expanded state
    expect(document.querySelector('.dw-surface-expanded')).toBeTruthy()
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
    renderAt('/tasks/new')
    await waitFor(() => screen.getByRole('complementary', { name: /new task/i }))
    // Initially the table is empty (0 tasks)
    await waitFor(() => expect(screen.getByText(/0 tasks/i)).toBeInTheDocument())

    // Fill + submit the create form (title required; BU pre-fills from role)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Freshly created' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    // The new row appears in the table and the count reflects it — no reload.
    await waitFor(() => {
      expect(document.querySelector('tbody tr.task-row')).toBeTruthy()
    })
    expect(screen.getByText('Freshly created')).toBeInTheDocument()
    expect(screen.getByText(/1 task\b/i)).toBeInTheDocument()
    // and the new task's row is the selected one (we navigated to /tasks/task-new)
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
    renderAt('/tasks')
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
    renderAt('/tasks')
    await waitFor(() => screen.getByText('First row'))
    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => screen.getByRole('complementary', { name: /new task/i }))
  })

  it('AC-109: Esc closes the open drawer (back to /tasks, table full width)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'First row' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'First row' }), checklist: [], events: [] })
    renderAt('/tasks/task-1')
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('.split.nodrawer')).toBeTruthy())
  })

  it('AC-109: typing "n" in the search field does NOT open create (hotkeys suppressed in fields)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'First row' })])
    renderAt('/tasks')
    await waitFor(() => screen.getByText('First row'))
    const search = screen.getByLabelText('Search tasks')
    search.focus()
    fireEvent.keyDown(window, { key: 'n' })
    // still on /tasks (no create drawer)
    expect(screen.queryByRole('complementary', { name: /new task/i })).toBeNull()
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
    renderAt('/tasks')
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
    renderAt('/tasks')
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
    renderAt('/tasks')
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
    renderAt('/tasks/task-2')
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
    await waitFor(() => expect(screen.getByText(/2 tasks/i)).toBeInTheDocument())

    // Archive from the drawer foot (collapsed split shows "Archive task")
    fireEvent.click(screen.getByRole('button', { name: /archive task/i }))
    // Confirm the archive dialog
    const confirm = await screen.findByRole('button', { name: /^archive$/i })
    fireEvent.click(confirm)

    // The archived row leaves the default list + the count decrements — no reload.
    await waitFor(() => {
      expect(screen.queryByText('Archive me')).toBeNull()
    })
    expect(screen.getByText('Keep me')).toBeInTheDocument()
    expect(screen.getByText(/1 task\b/i)).toBeInTheDocument()
  })
})
