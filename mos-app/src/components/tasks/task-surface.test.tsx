import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow, ChecklistItemRow, TaskEventRow } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { I18nProvider } from '@/i18n/I18nProvider'

// ── Mock the data layer ──────────────────────────────────────────────────────
vi.mock('../../lib/db/tasks', () => ({
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
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))
vi.mock('../../lib/comments/postComment', () => ({
  listComments: vi.fn(),
  postComment: vi.fn(),
}))

import { getTask, createTask, updateTaskStatus, updateTaskFields, toggleChecklistItem, unarchiveTask, archiveTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listComments, postComment } from '@/lib/comments/postComment'
import { TaskSurface } from './task-surface'

const mockGetTask = vi.mocked(getTask)
const mockCreateTask = vi.mocked(createTask)
const mockUpdateTaskStatus = vi.mocked(updateTaskStatus)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)
const mockListComments = vi.mocked(listComments)
const mockPostComment = vi.mocked(postComment)

const VIEWER_ID = 'viewer-person-id'

const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Cahya Cafe',
  email: 'cahya@gordi.id', archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const mockRole: RolesRow = {
  id: 'role-1', org_id: 'org', business_unit_id: 'bu-1',
  name: 'CEO', reports_to_role_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: mockPerson, roles: [mockRole], isManager: false, accessRoles: [] },
  signOut: async () => {},
}

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-abc', org_id: 'org', title: 'Fix the coffee machine',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: 'The espresso machine on floor 2 is broken.',
    due_date: '2026-06-20', objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T08:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

const mockBUs: BusinessUnitOption[] = [
  { id: 'bu-1', name: 'Cafe Operations' },
  { id: 'bu-2', name: 'Sales' },
]
const mockPeople: PersonOption[] = [
  { id: VIEWER_ID, full_name: 'Cahya Cafe' },
  { id: 'other-id', full_name: 'Other Person' },
]

beforeEach(() => {
  vi.resetAllMocks()
  // Clear per-task tab memory (sessionStorage) so a Checklist-tab test doesn't
  // leak the active tab into a later Details-default test (useTabMemory keys by id).
  sessionStorage.clear()
  mockGetBusinessUnits.mockResolvedValue(mockBUs)
  mockGetPeople.mockResolvedValue(mockPeople)
  mockListComments.mockResolvedValue([])
  mockPostComment.mockResolvedValue('comment-new')
  mockUpdateTaskStatus.mockResolvedValue()
  mockCreateTask.mockResolvedValue('new-task-id')
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderSurface(props: Partial<Parameters<typeof TaskSurface>[0]> = {}, auth: AuthState = authedState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/tasks/task-abc']}>
        <TaskSurface taskId="task-abc" mode="view" width="full" {...props} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// Value-first record grammar: a field renders its VALUE first and swaps in its control only when
// the row is activated. Click the field's edit affordance, then query its control.
function activateFieldByKey(key: string) {
  const btn = document.querySelector(`[data-field-key="${key}"] [data-field-edit]`) as HTMLElement
  fireEvent.click(btn)
}

function renderIndonesianSurface() {
  return render(
    <I18nProvider>
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/task-abc']}>
          <TaskSurface taskId="task-abc" mode="view" width="full" />
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

function renderSurfaceRoute(path: string) {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <Routes>
          <Route path="/work/tasks/new" element={<TaskSurface taskId={null} mode="create" width="full" />} />
          <Route path="/work/tasks/:taskId" element={<TaskSurface taskId="task-abc" mode="view" width="full" />} />
          <Route path="/work/tasks" element={<div data-testid="tasks-list">Tasks list</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// ── View mode ────────────────────────────────────────────────────────────────
describe('TaskSurface — view mode', () => {
  it('AC-070 (TaskSurface): renders title, status, typed ownership, checklist, activity, and completion', async () => {
    const task = makeTask()
    const checklist: ChecklistItemRow[] = [{
      id: 'item-0', org_id: 'org', task_id: 'task-abc', label: 'Inspect coil',
      is_done: false, position: 0, created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    }]
    const events: TaskEventRow[] = [{
      id: 'evt-1', org_id: 'org', task_id: 'task-abc', actor_person_id: VIEWER_ID,
      event_type: 'created', from_value: null, to_value: null, created_at: '2026-06-11T00:00:00Z',
    }]
    mockGetTask.mockResolvedValue({ task, checklist, events })

    renderSurface()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' })).toBeInTheDocument()
    })
    // Left panel: status + typed ownership always visible (decision-drivers above the fold)
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /task ownership/i })).toBeInTheDocument()
    expect(screen.getByText('PIC')).toBeInTheDocument()
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument()
    expect(screen.queryByText(/RACI|Responsible \(R\)|Accountable \(A\)|Consulted|Informed/)).toBeNull()
    // Content-first anatomy (OD-REDESIGN-90): Checklist and Activity are separate stacked regions
    // (the tabbed feed is retired), so both are directly visible — no tab to click.
    expect(screen.getByRole('region', { name: /activity/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /checklist/i })).toBeInTheDocument()
    expect(screen.getByText('Inspect coil')).toBeInTheDocument()
  })

  it('AC-I02: Indonesian locale localizes the task record chrome and feed', async () => {
    localStorage.setItem('mos.locale', 'id')
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })

    renderIndonesianSurface()

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' })).toBeInTheDocument())
    expect(screen.getByRole('region', { name: 'Detail tugas' })).toBeInTheDocument()
    expect(screen.getByText('Kepemilikan tugas')).toBeInTheDocument()
    // Content-first anatomy: Checklist and Activity are stacked regions (the tabbed feed is retired),
    // localized. Assert the Indonesian Activity region, the collapsed combined empty line, and the
    // composer/complete actions.
    expect(screen.getByRole('region', { name: 'Aktivitas' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Checklist' })).toBeInTheDocument()
    expect(screen.getByText(/jadilah yang pertama berkomentar/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kirim komentar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tandai selesai' })).toBeInTheDocument()
    expect(screen.queryByText('Task details')).toBeNull()
    localStorage.removeItem('mos.locale')
  })

  it('AC-R01: full width renders the single-column content-first record document (content leads; checklist + activity stacked below)', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    // Content-first anatomy: content (Task details) leads, then ownership, relations, and the
    // Checklist + Activity regions stacked below — one column, one shared RecordViewer, no tabs.
    expect(screen.getByRole('region', { name: /task details/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /checklist/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /activity/i })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
    // The shared RecordViewer owns identity + every ordered content slot, content-first.
    expect(document.querySelector('.record-viewer--page')).toBeTruthy()
    const regions = [...document.querySelectorAll('[data-content-slot]')].map((n) => (n as HTMLElement).dataset.contentSlot)
    expect(regions).toEqual(['content', 'ownership', 'relations', 'checklist', 'activity'])
  })

  it('AC-P3-CM-004: renders task comments in the live task surface', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    mockListComments.mockResolvedValue([
      { id: 'comment-1', author_id: VIEWER_ID, body: 'Please check the blocker', created_at: '2026-07-05T01:00:00Z' },
    ])

    renderSurface()

    await waitFor(() => expect(screen.getByText('Please check the blocker')).toBeInTheDocument())
    expect(mockListComments).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'task',
      entityId: 'task-abc',
    }))
  })

  it('AC-R05: full width keeps the archived banner + Unarchive above the two columns', async () => {
    const { unarchiveTask } = await import('@/lib/db/tasks')
    vi.mocked(unarchiveTask).mockResolvedValue()
    mockGetTask.mockResolvedValue({ task: makeTask({ archived_at: '2026-06-12T00:00:00Z' }), checklist: [], events: [] })
    renderSurface()
    await waitFor(() => screen.getByText(/this task is archived/i))
    expect(screen.getByRole('button', { name: /unarchive/i })).toBeInTheDocument()
  })

  it('AC-070 (TaskSurface): shows the loading skeleton initially', () => {
    mockGetTask.mockReturnValue(new Promise(() => {}))
    renderSurface()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('AC-070 (TaskSurface): shows the not-found panel when getTask rejects', async () => {
    mockGetTask.mockRejectedValue(new Error('PGRST116'))
    renderSurface()
    await waitFor(() => expect(screen.getByText(/task not found/i)).toBeInTheDocument())
  })

  it('R-T-3: demotes the not-found heading to h2 when a PageFamilyFrame owns the page h1 (identityHeadingLevel=2)', async () => {
    mockGetTask.mockRejectedValue(new Error('PGRST116'))
    renderSurface({ identityHeadingLevel: 2 })
    // Inside the focused-record PageFamilyFrame the region-3 head is the page h1, so the not-found
    // panel must nest as an h2 — never a second h1 (R-T-3 double-h1 fix).
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: /task not found/i })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('heading', { level: 1, name: /task not found/i })).not.toBeInTheDocument()
  })

  it('R-T-3: keeps the not-found heading an h1 in the default full-width host (identityHeadingLevel defaults to 1)', async () => {
    mockGetTask.mockRejectedValue(new Error('PGRST116'))
    renderSurface()
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: /task not found/i })).toBeInTheDocument(),
    )
  })

  it('calls onClose (not navigate) after a successful archive', async () => {
    const onClose = vi.fn()
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    const { archiveTask } = await import('@/lib/db/tasks')
    vi.mocked(archiveTask).mockResolvedValue()
    renderSurface({ onClose })
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    fireEvent.click(screen.getByRole('button', { name: /archive task/i }))
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('AC-071 (TaskSurface): inline status change calls updateTaskStatus', async () => {
    mockGetTask
      .mockResolvedValueOnce({ task: makeTask({ status: 'Open' }), checklist: [], events: [] })
      .mockResolvedValueOnce({ task: makeTask({ status: 'In Progress' }), checklist: [], events: [] })
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    activateFieldByKey('status')
    const status = document.querySelector('[data-field-key="status"] select') as HTMLSelectElement
    fireEvent.change(status, { target: { value: 'In Progress' } })
    await waitFor(() => {
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-abc', 'Open', 'In Progress', VIEWER_ID)
    })
  })
})

// ── Mutation handlers (self-coverage — these previously relied transitively on
//    pages/TaskDetail.test.tsx; pin them directly to the new unit so PR-B can't
//    drop the proof of behavior-preservation silently) ──────────────────────────
describe('TaskSurface — mutation handlers', () => {
  const item: ChecklistItemRow = {
    id: 'item-9', org_id: 'org', task_id: 'task-abc', label: 'Drain reservoir',
    is_done: false, position: 0, created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
  }

  it('checklist toggle (optimistic): calls toggleChecklistItem with the new done state', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [item], events: [] })
    vi.mocked(toggleChecklistItem).mockResolvedValue()
    renderSurface()
    // Content-first anatomy: the checklist is a directly-visible stacked region (no tab).
    await waitFor(() => screen.getByText('Drain reservoir'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Drain reservoir' }))
    await waitFor(() =>
      expect(vi.mocked(toggleChecklistItem)).toHaveBeenCalledWith('item-9', true, 'task-abc', VIEWER_ID),
    )
  })

  it('checklist toggle (rollback): reverts the checkbox when the write rejects', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [item], events: [] })
    vi.mocked(toggleChecklistItem).mockRejectedValue(new Error('write failed'))
    renderSurface()
    // Content-first anatomy: the checklist is a directly-visible stacked region (no tab).
    await waitFor(() => screen.getByText('Drain reservoir'))
    const cb = () => screen.getByRole('checkbox', { name: 'Drain reservoir' }) as HTMLInputElement
    expect(cb().checked).toBe(false)
    fireEvent.click(cb())
    await waitFor(() => expect(vi.mocked(toggleChecklistItem)).toHaveBeenCalled())
    // optimistic flips on, the catch arm rolls back to off
    await waitFor(() => expect(cb().checked).toBe(false))
  })

  it('PIC reassignment (rollback): restores the previous PIC when the write rejects', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    vi.mocked(updateTaskFields).mockRejectedValue(new Error('write failed'))
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    // V3 Issue 5: PIC is now a RecordViewer/RecordField select (was a bespoke person picker).
    activateFieldByKey('pic')
    const pic = screen.getByRole('combobox', { name: 'PIC' }) as HTMLSelectElement
    fireEvent.change(pic, { target: { value: 'other-id' } })
    await waitFor(() => expect(vi.mocked(updateTaskFields)).toHaveBeenCalledWith(
      'task-abc', { responsible_person_id: 'other-id' }, VIEWER_ID,
    ))
    // Optimistic reassignment rolled back to the previous PIC after the write rejects.
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'PIC' }) as HTMLSelectElement).value).toBe(VIEWER_ID))
  })

  // I3: archiving reports the id back to the host (so the table drops the row).
  it('I3: confirming archive calls archiveTask then onTaskArchived with the id', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    vi.mocked(archiveTask).mockResolvedValue(undefined)
    const onTaskArchived = vi.fn()
    renderSurface({ onTaskArchived, onClose: vi.fn() })
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    fireEvent.click(screen.getByRole('button', { name: /archive task/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^archive$/i }))
    await waitFor(() => expect(vi.mocked(archiveTask)).toHaveBeenCalledWith('task-abc', VIEWER_ID))
    expect(onTaskArchived).toHaveBeenCalledWith('task-abc')
  })

  it('unarchive: archived task surfaces Unarchive and calls unarchiveTask', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ archived_at: '2026-06-12T00:00:00Z' }), checklist: [], events: [] })
    vi.mocked(unarchiveTask).mockResolvedValue()
    renderSurface()
    await waitFor(() => screen.getByText(/this task is archived/i))
    fireEvent.click(screen.getByRole('button', { name: /unarchive/i }))
    await waitFor(() => expect(vi.mocked(unarchiveTask)).toHaveBeenCalledWith('task-abc', VIEWER_ID))
  })
})

// ── Live region (AC-111, AC-034) — optimistic save/rollback announcements ─────
describe('TaskSurface — live region (AC-111)', () => {
  function liveRegion() {
    return document.querySelector('[aria-live="polite"]')
  }

  it('AC-111: a successful status change announces the new status', async () => {
    mockGetTask
      .mockResolvedValueOnce({ task: makeTask({ status: 'Open' }), checklist: [], events: [] })
      .mockResolvedValueOnce({ task: makeTask({ status: 'In Progress' }), checklist: [], events: [] })
    mockUpdateTaskStatus.mockResolvedValue()
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    activateFieldByKey('status')
    const status = document.querySelector('[data-field-key="status"] select') as HTMLSelectElement
    fireEvent.change(status, { target: { value: 'In Progress' } })
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/status changed to In Progress/i))
  })

  it('AC-111: a failed status change rolls back AND announces the revert', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ status: 'Open' }), checklist: [], events: [] })
    mockUpdateTaskStatus.mockRejectedValue(new Error('write failed'))
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    activateFieldByKey('status')
    const status = document.querySelector('[data-field-key="status"] select') as HTMLSelectElement
    fireEvent.change(status, { target: { value: 'Blocked' } })
    await waitFor(() => expect(mockUpdateTaskStatus).toHaveBeenCalled())
    // pill reverts to Open AND the live region announces the failure
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/couldn.t save|reverted/i))
  })

  it('AC-111: a successful checklist add announces it', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    const { addChecklistItem } = await import('@/lib/db/tasks')
    vi.mocked(addChecklistItem).mockResolvedValue()
    renderDrawer()
    // Content-first anatomy: the checklist add field is directly visible (no tab to open).
    const input = await screen.findByLabelText(/add checklist item/i)
    fireEvent.change(input, { target: { value: 'Buy beans' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/checklist item added/i))
  })

  it('AC-111: a failed checklist toggle reverts AND announces the rollback', async () => {
    const item: ChecklistItemRow = {
      id: 'item-x', org_id: 'org', task_id: 'task-abc', label: 'Wipe counter',
      is_done: false, position: 0, created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    }
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [item], events: [] })
    vi.mocked(toggleChecklistItem).mockRejectedValue(new Error('write failed'))
    renderSurface()
    // Content-first anatomy: the checklist is a directly-visible stacked region (no tab).
    await waitFor(() => screen.getByText('Wipe counter'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wipe counter' }))
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/couldn.t save|reverted/i))
  })

  it('AC-111: a failed PIC reassignment reverts AND announces the rollback', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    vi.mocked(updateTaskFields).mockRejectedValue(new Error('write failed'))
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    activateFieldByKey('pic')
    const pic = screen.getByRole('combobox', { name: 'PIC' }) as HTMLSelectElement
    fireEvent.change(pic, { target: { value: 'other-id' } })
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/couldn.t save|reverted/i))
  })
})

// ── Drawer width (Variant B chrome) ──────────────────────────────────────────
function renderDrawer(props: Partial<Parameters<typeof TaskSurface>[0]> = {}, auth: AuthState = authedState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/tasks/task-abc']}>
        <TaskSurface taskId="task-abc" mode="view" width="drawer" {...props} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('TaskSurface — drawer width (Variant B chrome)', () => {
  const checklist: ChecklistItemRow[] = [{
    id: 'item-0', org_id: 'org', task_id: 'task-abc', label: 'Inspect coil',
    is_done: false, position: 0, created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
  }]

  it('AC-R06 (drawer): compact single-column record — content leads, ownership + checklist + activity stacked, no tabs', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist, events: [] })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    // Content-first anatomy: no tabbed feed — Checklist and Activity are directly-visible regions.
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('region', { name: /task ownership/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /activity/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /checklist/i })).toBeInTheDocument()
    expect(document.querySelector('.record-viewer--panel')).toBeTruthy()
  })

  it('AC-R06 (drawer): content leads and ownership + checklist are both directly visible (no tab to switch)', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist, events: [] })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    expect(screen.getByRole('region', { name: /task ownership/i })).toBeInTheDocument()
    // Checklist is a stacked region, directly visible — not behind a tab.
    await waitFor(() => expect(screen.getByText('Inspect coil')).toBeInTheDocument())
    expect(screen.getByRole('region', { name: /task ownership/i })).toBeInTheDocument()
  })

  it('AC-103 (drawer): changing status in the pinned header updates the pill and calls updateTaskStatus', async () => {
    mockGetTask
      .mockResolvedValueOnce({ task: makeTask({ status: 'Open' }), checklist: [], events: [] })
      .mockResolvedValueOnce({ task: makeTask({ status: 'In Progress' }), checklist: [], events: [] })
    const onTaskChanged = vi.fn()
    renderDrawer({ onTaskChanged })
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    activateFieldByKey('status')
    const status = document.querySelector('[data-field-key="status"] select') as HTMLSelectElement
    fireEvent.change(status, { target: { value: 'In Progress' } })
    await waitFor(() => expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-abc', 'Open', 'In Progress', VIEWER_ID))
    await waitFor(() => expect(onTaskChanged).toHaveBeenCalled())
  })

  it('archive lives in the pinned foot at drawer width', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    const actions = document.querySelector('[data-viewer-region="actions"]')
    expect(actions).toBeTruthy()
    expect(within(actions as HTMLElement).getByRole('button', { name: /archive task/i })).toBeInTheDocument()
  })

  it('GAP-2 (OD-91 #7): the drawer has no expand/collapse toggle — Open full page is the one escalation', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    expect(screen.queryByRole('button', { name: /expand to full width|collapse to split/i })).toBeNull()
    // The drawer's own utility bar carries the one escalation verb instead.
    expect(screen.getByRole('button', { name: /open full page/i })).toBeInTheDocument()
  })

  it('AC-112 (drawer): archived deep-link shows the archived banner + Unarchive, edit affordances suppressed', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ archived_at: '2026-06-12T00:00:00Z' }), checklist, events: [] })
    vi.mocked(unarchiveTask).mockResolvedValue()
    renderDrawer()
    await waitFor(() => screen.getByText(/this task is archived/i))
    expect(screen.getByRole('button', { name: /unarchive/i })).toBeInTheDocument()
    // archived => no status trigger (read-only)
    expect(document.querySelector('[data-field-key="status"] select')).toBeNull()
  })

  it('AC-112 (drawer): not-found shows "Task not found" + All tasks link', async () => {
    mockGetTask.mockRejectedValue(new Error('PGRST116'))
    renderDrawer()
    await waitFor(() => expect(screen.getByText(/task not found/i)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /all tasks/i })).toBeInTheDocument()
  })

  it('drawer loading shows the skeleton', () => {
    mockGetTask.mockReturnValue(new Promise(() => {}))
    renderDrawer()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('read-only (non-editor) drawer hides the status trigger and archive', async () => {
    mockGetTask.mockResolvedValue({
      task: makeTask({ responsible_person_id: 'other-id', accountable_person_id: 'other-id' }),
      checklist: [], events: [],
    })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    expect(document.querySelector('[data-field-key="status"] select')).toBeNull()
    expect(document.querySelector('.dw-foot')).toBeNull()
  })
})

// ── Create mode ──────────────────────────────────────────────────────────────
function renderCreate(auth: AuthState = authedState, onClose = vi.fn()) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/tasks/new']}>
        <TaskSurface taskId={null} mode="create" width="full" onClose={onClose} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('TaskSurface — saved-view URL preservation', () => {
  it('AC-307: not-found link from /work/tasks/task-abc?view=mine points back to /work/tasks?view=mine', async () => {
    mockGetTask.mockRejectedValue(new Error('PGRST116'))
    renderSurfaceRoute('/work/tasks/task-abc?view=mine')
    const link = await screen.findByRole('link', { name: /all tasks/i })
    expect(link.getAttribute('href')).toBe('/work/tasks?view=mine')
  })

  it('AC-308: create cancel from /work/tasks/new?view=mine&r=other-id returns to /work/tasks?view=mine without losing the prefill on load', async () => {
    renderSurfaceRoute('/work/tasks/new?view=mine&r=other-id')
    const responsible = await screen.findByLabelText(/^pic$/i)
    expect((responsible as HTMLSelectElement).value).toBe('other-id')
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=mine'))
  })

  it('AC-311: create success from /work/tasks/new?view=mine&r=other-id lands on /work/tasks/:id?view=mine', async () => {
    renderSurfaceRoute('/work/tasks/new?view=mine&r=other-id')
    await waitFor(() => screen.getByLabelText(/title/i))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Saved view task' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks/new-task-id?view=mine'))
  })

  it('AC-311: archive success from /work/tasks/task-abc?view=mine returns to /work/tasks?view=mine', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    vi.mocked(archiveTask).mockResolvedValue(undefined)
    renderSurfaceRoute('/work/tasks/task-abc?view=mine')
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    fireEvent.click(screen.getByRole('button', { name: /archive task/i }))
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=mine'))
  })
})

describe('TaskSurface — create mode', () => {
  it('AC-080 (TaskSurface create): PIC/Supervisor default to creator, Team defaults to primary-role Team; all editable', async () => {
    renderCreate()
    await waitFor(() => {
      const buSelect = screen.getByLabelText(/team/i) as HTMLSelectElement
      expect(buSelect.value).toBe('bu-1')
    })
    const rSelect = screen.getByLabelText(/^pic$/i) as HTMLSelectElement
    expect(rSelect.value).toBe(VIEWER_ID)
    const aSelect = screen.getByLabelText(/^supervisor$/i) as HTMLSelectElement
    expect(aSelect.value).toBe(VIEWER_ID)
    expect(rSelect).not.toBeDisabled()
    expect(aSelect).not.toBeDisabled()
  })

  it('AC-081 (TaskSurface create): empty Title blocks submit with a field error', async () => {
    renderCreate()
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(screen.getByText(/title is required/i)).toBeInTheDocument())
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  // I4: the field-error TEXT must use the AA-darkened red (--status-lost-text /
  // --field-error-text), NOT base --destructive (~3.6:1, fails AA as small text).
  // The invalid field outline may stay --destructive (it's a non-text affordance).
  it('I4: the field-error helper text renders with the tc-field-error class', async () => {
    renderCreate()
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    const err = await screen.findByText(/title is required/i)
    expect(err).toHaveClass('tc-field-error')
  })

  // DO-15(b,c) (census-sweep R2 task-create F4/F5): while the directory resolves, the
  // Team/PIC/Supervisor fields render the shared LoadingShell grammar (role=status +
  // skeleton) with DIRECTORY-scoped labels — these fields load teams/people, not tasks.
  it('DO-15(b,c): resolving directory fields render LoadingShell with directory-scoped labels', async () => {
    mockGetBusinessUnits.mockReturnValue(new Promise(() => {}))
    mockGetPeople.mockReturnValue(new Promise(() => {}))
    renderCreate()
    const statuses = await screen.findAllByRole('status')
    const labels = statuses.map((el) => el.getAttribute('aria-label'))
    expect(labels).toContain('Loading teams…')
    expect(labels.filter((l) => l === 'Loading people…')).toHaveLength(2)
    // The shared skeleton grammar hosts the shell — no literal "Loading tasks" text.
    expect(document.querySelector('.tc-loading-field .skeleton-bar')).toBeTruthy()
    expect(screen.queryByText(/loading tasks/i)).toBeNull()
  })

  // DO-15(d) (census-sweep R2 task-create F6): the submit error names the problem and the
  // recovery — never the bare "Something went wrong" shrug.
  it('DO-15(d): failed submit shows an error naming the problem and the recovery', async () => {
    mockCreateTask.mockRejectedValue(new Error('boom'))
    renderCreate()
    await waitFor(() => screen.getByLabelText(/title/i))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Doomed task' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn.t be created/i)
    expect(alert).toHaveTextContent(/try again/i)
    expect(alert).not.toHaveTextContent(/something went wrong/i)
  })

  it('AC-107 (create drawer): at drawer width renders a "Create task" bar with no double card frame', async () => {
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface taskId={null} mode="create" width="drawer" onClose={vi.fn()} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    expect(screen.getAllByText('Create task').length).toBeGreaterThan(0)
    expect(document.querySelector('.tc-create-drawer')).toBeTruthy()
    expect(document.querySelector('.tc-card')).toBeNull()
    // create still works at drawer width
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Drawer task' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Drawer task' })))
  })

  // DO-4 (census-sweep R2, task-create F1): CreateSurface honors showPanelUtility exactly like
  // ViewSurface — when the overlay host owns the chrome, the surface renders NO bar of its own.
  it('DO-4: showPanelUtility=false suppresses the create-mode chrome bar (host owns the chrome)', async () => {
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface
            taskId={null} mode="create" width="drawer"
            onClose={vi.fn()}
            showPanelUtility={false}
          />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    expect(document.querySelector('.dw-bar')).toBeNull()
    expect(screen.queryByRole('button', { name: /expand to full width/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
    // The form itself is intact (Cancel + submit still present).
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
  })

  // GAP-2 (OD-91 #7): expand-in-place is retired — the create-mode drawer bar carries no
  // expand toggle at any width (only the title + the one ✕).
  it('GAP-2: create-mode drawer bar shows NO expand toggle', async () => {
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface taskId={null} mode="create" width="drawer" onClose={vi.fn()} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    expect(screen.queryByRole('button', { name: /expand to full width|collapse to split/i })).toBeNull()
    // The surface never carries the retired expanded-width class.
    expect(document.querySelector('.dw-surface-expanded')).toBeNull()
  })

  // C2: a successful create reports the new id back to the host (so the table
  // can refetch) before navigating.
  it('C2: successful create calls onTaskCreated with the new id', async () => {
    const onTaskCreated = vi.fn()
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface taskId={null} mode="create" width="drawer" onClose={vi.fn()} onTaskCreated={onTaskCreated} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByLabelText(/title/i))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Reportable task' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(onTaskCreated).toHaveBeenCalledWith('new-task-id'))
  })

  it('AC-081 (TaskSurface create): valid submit calls createTask and navigates to the create task', async () => {
    renderCreate()
    await waitFor(() => screen.getByLabelText(/title/i))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'New Task Alpha' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'New Task Alpha', businessUnitId: 'bu-1',
        responsiblePersonId: VIEWER_ID, accountablePersonId: VIEWER_ID, createdBy: VIEWER_ID,
      }))
    })
  })

  // AC-108: inline-validate-ON-BLUR (design-plan §7) — the create form validates
  // a required field the moment focus leaves it empty, not only on submit.
  it('AC-108: blurring an empty Title renders an inline error (role=alert) + the error border class', async () => {
    renderCreate()
    const title = await screen.findByLabelText('Title')
    // Field starts clean — no error before interaction
    expect(screen.queryByText(/title is required/i)).toBeNull()
    fireEvent.blur(title)
    // Error appears below the field, announced, and the input carries the error class
    const err = await screen.findByText(/title is required/i)
    expect(err).toHaveAttribute('role', 'alert')
    // Error affordance: the ratified TextInput carries it on its root (destructive border);
    // aria-invalid on the input is the accessible oracle.
    expect(title.closest('.mk-textinput')).toHaveClass('mk-textinput--error')
    expect(title).toHaveAttribute('aria-invalid', 'true')
  })

  it('AC-108: a blur error clears once the field is filled (typing)', async () => {
    renderCreate()
    const title = await screen.findByLabelText('Title')
    fireEvent.blur(title)
    await screen.findByText(/title is required/i)
    fireEvent.change(title, { target: { value: 'Now it has a value' } })
    await waitFor(() => expect(screen.queryByText(/title is required/i)).toBeNull())
    expect(title.closest('.mk-textinput')).not.toHaveClass('mk-textinput--error')
  })

  it('AC-108: blurring an empty Team renders an inline error', async () => {
    // Auth with no role → no primary-role BU, so the BU select starts empty.
    const noRoleAuth: AuthState = {
      status: 'authenticated',
      viewer: { person: mockPerson, roles: [], isManager: false, accessRoles: [] },
      signOut: async () => {},
    }
    renderCreate(noRoleAuth)
    const bu = await screen.findByLabelText('Team')
    fireEvent.blur(bu)
    const err = await screen.findByText(/team is required/i)
    expect(err).toHaveAttribute('role', 'alert')
    // F2 fix: Team is now the design-system Select primitive (styled chevron/box,
    // no native chrome) — its error border lives on the mk-select wrapper (Select.css
    // .mk-select--error), not on the bare <select> element itself.
    expect(bu.closest('.mk-select')).toHaveClass('mk-select--error')
  })
})
