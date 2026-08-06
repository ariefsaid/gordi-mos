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
import { OverlayHostProvider } from '@/shell/overlay-host'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import type { AgentRuntime, AgentEvent } from '@/lib/agent/runtime/port'

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
  email: 'arief@example.test', must_change_password: false, archived_at: null,
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
        <OverlayHostProvider>
          <Routes>
            <Route path="/work/tasks" element={<TasksLayout />}>
              <Route path="new" element={<TaskDrawer mode="create" />} />
              <Route path=":taskId" element={<TaskDrawer mode="view" />} />
            </Route>
          </Routes>
        </OverlayHostProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// F3: a fake Deputy runtime so the record-scoped Ask Deputy affordance actually renders
// (AskDeputyAction renders nothing with the default null-runtime context — see
// ask-deputy-action.tsx). Mirrors ask-deputy-action.test.tsx's makeFakeRuntime.
function makeFakeRuntime(): AgentRuntime {
  return {
    createRun: vi.fn(async (input: { goal: string }) => ({ id: 'r1', title: input.goal.slice(0, 60), status: 'running' as const })),
    followUp: vi.fn(async () => {}),
    openThread: vi.fn(),
    control: vi.fn(async () => {}),
    subscribe: vi.fn(async function* (): AsyncGenerator<AgentEvent> {}),
  }
}

// OD-63: a direct/new-tab/refresh (or the "Open full page" escalation) renders the
// record as a standalone full canonical PAGE. In jsdom there's no
// PerformanceNavigationTiming, so the boot direct-load path stays null; the
// explicit state escalation ({ taskSurface: 'page' }) is the unit-test seam, and the
// real-browser direct-open branch is proven by the e2e.
function renderAtState(path: string, state: unknown, runtime: AgentRuntime | null = null) {
  // Split the query off the path: react-router does not re-parse a `pathname` that
  // already carries `?…` when the initial entry is an object, so pass search explicitly.
  const [pathname, query = ''] = path.split('?')
  const search = query ? `?${query}` : ''
  return render(
    <AuthContext.Provider value={authedState}>
      <AgentRuntimeProvider runtime={runtime}>
        <MemoryRouter initialEntries={[{ pathname, search, state }] as never}>
          <OverlayHostProvider>
            <Routes>
              <Route path="/work/tasks" element={<TasksLayout />}>
                <Route path="new" element={<TaskDrawer mode="create" />} />
                <Route path=":taskId" element={<TaskDrawer mode="view" />} />
              </Route>
            </Routes>
          </OverlayHostProvider>
        </MemoryRouter>
      </AgentRuntimeProvider>
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
    expect(screen.getByRole('button', { name: 'AR Follow-ups' })).toHaveAttribute('aria-pressed', 'false')
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
    // The shared RecordViewer exposes the status as the same labelled Select in
    // panel and page modes; scope to the record panel, not the collection toolbar.
    const drawer = screen.getByRole('complementary', { name: /task detail/i })
    // Value-first grammar: activate the Status field, then the select swaps in.
    fireEvent.click(within(drawer as HTMLElement).getByRole('button', { name: /edit status/i }))
    const status = drawer.querySelector('[data-field-key="status"] select') as HTMLSelectElement
    fireEvent.change(status, { target: { value: 'Blocked' } })
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

  // GAP-2 (OD-91 #7): expand-in-place is retired — the drawer never collapses the table grid;
  // there is no .split.expanded state and no expand toggle. The split stays two-column with the
  // table assembly visible while a drawer is open; "Open full page" is the one escalation.
  it('GAP-2: an open drawer keeps the two-column split with no expand toggle or .split.expanded', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open one' }), checklist: [], events: [] })
    renderAt('/work/tasks/task-1')
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
    const split = document.querySelector('.split')
    expect(split).toBeTruthy()
    expect(split?.classList.contains('expanded')).toBe(false)
    expect(document.querySelector('.assembly')).toBeTruthy()
    // No width toggle anywhere, and the grid never enters an expanded state.
    expect(screen.queryByRole('button', { name: /expand to full width|collapse to split/i })).toBeNull()
    expect(document.querySelector('.split.expanded')).toBeNull()
    expect(document.querySelector('.dw-surface')).toBeTruthy()
  })

  // RI-2 (C2): after creating a task in the drawer, the table must show the new
  // row + updated open/total count without a reload.
  it('RI-2: creating a task in the drawer adds its row to the table + updates the count (no reload)', async () => {
    // First load: empty list. After create: the new row is present.
    mockListTasks
      .mockResolvedValueOnce([])
      .mockResolvedValue([makeTask({ id: 'task-new', title: 'Freshly created' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-new', title: 'Freshly created' }), checklist: [], events: [] })
    mockCreateTask.mockResolvedValue('task-new')
    renderAt('/work/tasks/new')
    await waitFor(() => screen.getByRole('complementary', { name: /create task/i }))
    // Initially the table is empty. The count reads inside the ONE muted meta sentence
    // ("N open · M total") — the content-header count pill was removed.
    await waitFor(() => {
      expect(document.querySelector('[data-testid="tasks-count-line"]')?.textContent).toContain('0 open · 0 total')
    })

    // Fill + submit the create form (title required; BU pre-fills from role). Supervisor starts
    // empty and is required (OD-REDESIGN-3/14/41, task-surface.tsx accountablePersonId) — a valid
    // submit needs it explicitly chosen.
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Freshly created' } })
    fireEvent.change(screen.getByLabelText(/^supervisor$/i), { target: { value: VIEWER_ID } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    // The new row appears in the table and the count reflects it — no reload.
    await waitFor(() => {
      expect(document.querySelector('tbody tr.task-row')).toBeTruthy()
    })
    expect(screen.getByText('Freshly created')).toBeInTheDocument()
    expect(document.querySelector('[data-testid="tasks-count-line"]')?.textContent).toContain('1 open · 1 total')
    // GAP-6 (OD-91 #11): after-create returns to the collection with the new row HIGHLIGHTED
    // (row-just-created) — not opened in the drawer. The create drawer is gone.
    await waitFor(() => {
      const flashed = document.querySelector('tr.task-row.row-just-created')
      expect(flashed?.textContent).toContain('Freshly created')
    })
    expect(screen.queryByRole('complementary', { name: /create task|task detail/i })).toBeNull()
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
    await waitFor(() => expect(document.querySelector('[data-testid="tasks-count-line"]')?.textContent).toContain('2 open · 2 total'))

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
    expect(document.querySelector('[data-testid="tasks-count-line"]')?.textContent).toContain('1 open · 1 total')
  }, 10_000)
})

// ── OD-63: canonical page mode on direct open ────────────────────────────────
describe('TasksLayout — OD-63 canonical page mode', () => {
  it('OD-63: an "Open full page" escalation renders the record as a standalone full page — no table, no drawer', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Standalone page task' }), checklist: [], events: [] })
    renderAtState('/work/tasks/task-1', { taskSurface: 'page' })

    // P1-2: the ONE renderer (TaskSurface) renders the record identity as the page's ONE h1 —
    // the generic shell PageHead is hidden (tasks-layout.tsx TaskRecordPage passes hideHead), so
    // there is no separate "Task" heading competing with it.
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Standalone page task' }))

    // No split-drawer aside and no table shell — it is a standalone canonical page.
    expect(screen.queryByRole('complementary', { name: /task detail/i })).toBeNull()
    expect(screen.queryByRole('region', { name: /tasks/i })).toBeNull()
    expect(document.querySelector('.split')).toBeNull()
    expect(document.querySelector('tbody tr.task-row')).toBeNull()
    // The full-width shared RecordViewer anatomy mounts.
    expect(document.querySelector('.record-viewer--page')).toBeTruthy()
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
    expect(document.querySelector('.record-viewer--panel')).toBeTruthy()
    // And the panel offers the escalation to the full page.
    expect(screen.getByRole('button', { name: /open full page/i })).toBeInTheDocument()
  })

  // V3 Issue 3, Task 9/10 — the direct/full Task page is the Focused-record representative.
  // P1-2 (deliberate anatomy change, docs/decisions.md / Luna P1-2): the record identity's own
  // overline+title IS the page heading now — there is exactly ONE h1 total, no separate generic
  // shell h1 above it (the old "shell h1 generic + record h2 resolved title" split duplicated
  // page-head chrome above the identity; see docs/reviews for the y≈234-vs-E7's-y≈124 finding).
  it('Focused record family: a direct Task page mounts inside the focused-record frame with exactly ONE h1 — the record identity, resolved title', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open me' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open me' }), checklist: [], events: [] })
    renderAtState('/work/tasks/task-1', { taskSurface: 'page' })

    // The record identity IS the h1 (the shell's generic PageHead is hidden — hideHead).
    await screen.findByRole('heading', { level: 1, name: 'Open me' })

    const main = document.querySelector('main')
    expect(main?.getAttribute('data-page-family')).toBe('focused-record')

    // The resolved title shows exactly ONCE, as the page's only heading — no generic "Task"
    // heading competing with it, no duplicate at any level.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryByRole('heading', { level: 1, name: 'Task' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Open me' })).toBeNull()

    // The generic shell job sentence is gone with the hidden PageHead (the identity + the
    // record-chrome row are the page's only pre-content chrome now); the internal family
    // name never shows either way.
    expect(screen.queryByText('Review and update this task.')).toBeNull()
    expect(screen.queryByText('Focused record')).toBeNull()

    // Typed Task context is preserved (Team = Kitchen); no collection/table shell.
    // Value-first grammar: Team renders as text/chip value, not a permanent select.
    expect(screen.getAllByText('Kitchen').length).toBeGreaterThan(0)
    expect(document.querySelector('tbody tr.task-row')).toBeNull()
    expect(document.querySelector('.record-viewer--page')).toBeTruthy()
  })

  // P1-2 / H3 (Luna floor): the standalone canonical page's Back lives at the SHARED record-page
  // seam (.record-page-chrome) now — the same chrome every record kind (Task, Signal, …) uses — a
  // source-aware "Back to <collection>" affordance leading, the record actions (Ask Deputy) trailing.
  it('P1-2: the standalone full-page record chrome carries a Back-to-Tasks affordance', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open me' }), checklist: [], events: [] })
    renderAtState('/work/tasks/task-1', { taskSurface: 'page' })

    await screen.findByRole('heading', { level: 1, name: 'Open me' })

    const chromeRow = document.querySelector('.record-page-chrome') as HTMLElement
    expect(chromeRow).toBeTruthy()
    const backLink = within(chromeRow).getByRole('link', { name: /back to tasks/i })
    expect(backLink).toHaveAttribute('href', '/work/tasks')
  })

  // F3 (E7 floor): the drawer and the expanded@split pseudo-full-page already carry the
  // record-scoped Ask Deputy affordance via RecordPanelHost's chrome (task-drawer.tsx
  // hostActions, showPanelUtility=false there). The standalone canonical page (this
  // direct-open path) has no RecordPanelHost — TaskSurface's own internal chrome row is
  // the only header the record has, so IT now carries the same affordance, top-right of
  // that row (mirrors E7's `data-journey="J05"` "Ask @Deputy about this" record-header button).
  it('F3: the standalone full-page record carries the record-scoped Ask Deputy affordance in its own chrome row', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open me' }), checklist: [], events: [] })
    renderAtState('/work/tasks/task-1', { taskSurface: 'page' }, makeFakeRuntime())

    await screen.findByRole('heading', { level: 1, name: 'Open me' })

    // Lives in the shared record-page chrome (.record-page-chrome), not buried in the body. The
    // record-scoped Ask Deputy seed resolves from the record title (onTitleResolved), one render
    // after the h1, so await it rather than assuming it is present the instant the heading is.
    const askButton = await screen.findByRole('button', { name: 'Ask Deputy' })
    expect(askButton.closest('.record-page-chrome')).toBeTruthy()
  })

  it('F3: no Ask Deputy affordance renders while the record is still loading', () => {
    mockGetTask.mockReturnValue(new Promise(() => {}))
    renderAtState('/work/tasks/task-1', { taskSurface: 'page' }, makeFakeRuntime())
    expect(screen.queryByRole('button', { name: 'Ask Deputy' })).toBeNull()
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
