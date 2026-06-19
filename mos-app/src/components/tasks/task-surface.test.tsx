import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow, ChecklistItemRow, TaskEventRow } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'

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

import { getTask, createTask, updateTaskStatus, toggleChecklistItem, updateTaskRaci, unarchiveTask, archiveTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { TaskSurface } from './task-surface'

const mockGetTask = vi.mocked(getTask)
const mockCreateTask = vi.mocked(createTask)
const mockUpdateTaskStatus = vi.mocked(updateTaskStatus)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)

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
    due_date: '2026-06-20', last_activity_at: '2026-06-11T08:00:00Z',
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
  mockUpdateTaskStatus.mockResolvedValue()
  mockCreateTask.mockResolvedValue('new-task-id')
})

function renderSurface(props: Partial<Parameters<typeof TaskSurface>[0]> = {}, auth: AuthState = authedState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/tasks/task-abc']}>
        <TaskSurface taskId="task-abc" mode="view" width="full" {...props} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// ── View mode ────────────────────────────────────────────────────────────────
describe('TaskSurface — view mode', () => {
  it('AC-070 (TaskSurface): renders title, status, RACI, checklist, activity for a loaded task', async () => {
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
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /raci/i })).toBeInTheDocument()
    expect(screen.getByText('Inspect coil')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /activity/i })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    fireEvent.click(screen.getByRole('option', { name: 'In Progress' }))
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
    await waitFor(() => screen.getByText('Drain reservoir'))
    const cb = () => screen.getByRole('checkbox', { name: 'Drain reservoir' }) as HTMLInputElement
    expect(cb().checked).toBe(false)
    fireEvent.click(cb())
    await waitFor(() => expect(vi.mocked(toggleChecklistItem)).toHaveBeenCalled())
    // optimistic flips on, the catch arm rolls back to off
    await waitFor(() => expect(cb().checked).toBe(false))
  })

  it('RACI change (rollback): restores the consulted chip when updateTaskRaci rejects', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ consulted_person_ids: ['other-id'] }), checklist: [], events: [] })
    vi.mocked(updateTaskRaci).mockRejectedValue(new Error('write failed'))
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    expect(screen.getByTestId('chip-consulted')).toHaveTextContent('Other Person')
    fireEvent.click(screen.getByRole('button', { name: /remove consulted person other person/i }))
    await waitFor(() => expect(vi.mocked(updateTaskRaci)).toHaveBeenCalled())
    // rollback restores the removed chip
    await waitFor(() => expect(screen.getByTestId('chip-consulted')).toHaveTextContent('Other Person'))
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
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    fireEvent.click(screen.getByRole('option', { name: 'In Progress' }))
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/status changed to In Progress/i))
  })

  it('AC-111: a failed status change rolls back AND announces the revert', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ status: 'Open' }), checklist: [], events: [] })
    mockUpdateTaskStatus.mockRejectedValue(new Error('write failed'))
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    fireEvent.click(screen.getByRole('option', { name: 'Blocked' }))
    await waitFor(() => expect(mockUpdateTaskStatus).toHaveBeenCalled())
    // pill reverts to Open AND the live region announces the failure
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/couldn.t save|reverted/i))
  })

  it('AC-111: a successful checklist add announces it', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    const { addChecklistItem } = await import('@/lib/db/tasks')
    vi.mocked(addChecklistItem).mockResolvedValue()
    renderDrawer()
    await waitFor(() => screen.getByRole('tablist'))
    fireEvent.click(screen.getByRole('tab', { name: /checklist/i }))
    const input = screen.getByLabelText(/add checklist item/i)
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
    await waitFor(() => screen.getByText('Wipe counter'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wipe counter' }))
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/couldn.t save|reverted/i))
  })

  it('AC-111: a failed RACI change reverts AND announces the rollback', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ consulted_person_ids: ['other-id'] }), checklist: [], events: [] })
    vi.mocked(updateTaskRaci).mockRejectedValue(new Error('write failed'))
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    fireEvent.click(screen.getByRole('button', { name: /remove consulted person other person/i }))
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

  it('renders a pinned header + tablist with Details default selected', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist, events: [] })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /details/i })).toHaveAttribute('aria-selected', 'true')
    // Details pane shows RACI + Description
    expect(screen.getByRole('region', { name: /raci/i })).toBeInTheDocument()
  })

  it('AC-106 (drawer): switching to Checklist shows the checklist pane and hides RACI', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist, events: [] })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    expect(screen.getByRole('region', { name: /raci/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /checklist/i }))
    await waitFor(() => expect(screen.getByText('Inspect coil')).toBeInTheDocument())
    expect(screen.queryByRole('region', { name: /raci/i })).toBeNull()
  })

  it('AC-103 (drawer): changing status in the pinned header updates the pill and calls updateTaskStatus', async () => {
    mockGetTask
      .mockResolvedValueOnce({ task: makeTask({ status: 'Open' }), checklist: [], events: [] })
      .mockResolvedValueOnce({ task: makeTask({ status: 'In Progress' }), checklist: [], events: [] })
    const onTaskChanged = vi.fn()
    renderDrawer({ onTaskChanged })
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    fireEvent.click(screen.getByRole('option', { name: 'In Progress' }))
    await waitFor(() => expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-abc', 'Open', 'In Progress', VIEWER_ID))
    await waitFor(() => expect(onTaskChanged).toHaveBeenCalled())
  })

  it('archive lives in the pinned foot at drawer width', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    const foot = document.querySelector('.dw-foot')
    expect(foot).toBeTruthy()
    expect(foot?.querySelector('button')?.textContent).toMatch(/archive task/i)
  })

  it('AC-104 (drawer): expand toggle calls onExpandToggle without navigation', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    const onExpandToggle = vi.fn()
    renderDrawer({ onExpandToggle })
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    fireEvent.click(screen.getByRole('button', { name: /expand to full width/i }))
    expect(onExpandToggle).toHaveBeenCalled()
  })

  it('AC-112 (drawer): archived deep-link shows the archived banner + Unarchive, edit affordances suppressed', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ archived_at: '2026-06-12T00:00:00Z' }), checklist, events: [] })
    vi.mocked(unarchiveTask).mockResolvedValue()
    renderDrawer()
    await waitFor(() => screen.getByText(/this task is archived/i))
    expect(screen.getByRole('button', { name: /unarchive/i })).toBeInTheDocument()
    // archived => no status trigger (read-only)
    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()
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
    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()
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

describe('TaskSurface — create mode', () => {
  it('AC-080 (TaskSurface create): R/A default to creator, BU defaults to primary-role BU; all editable', async () => {
    renderCreate()
    await waitFor(() => {
      const buSelect = screen.getByLabelText(/business unit/i) as HTMLSelectElement
      expect(buSelect.value).toBe('bu-1')
    })
    const rSelect = screen.getByLabelText(/^responsible \(r\)/i) as HTMLSelectElement
    expect(rSelect.value).toBe(VIEWER_ID)
    const aSelect = screen.getByLabelText(/^accountable \(a\)/i) as HTMLSelectElement
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

  it('AC-107 (create drawer): at drawer width renders a "New task" bar with no double card frame', async () => {
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface taskId={null} mode="create" width="drawer" onClose={vi.fn()} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    expect(screen.getByText('New task')).toBeInTheDocument()
    expect(document.querySelector('.tc-create-drawer')).toBeTruthy()
    expect(document.querySelector('.tc-card')).toBeNull()
    // create still works at drawer width
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Drawer task' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Drawer task' })))
  })

  // M5: the create-mode drawer bar must include the expand toggle for parity
  // with view mode (mockup Screen 2). It reflects `expanded` and calls back.
  it('M5: create-mode drawer bar shows the expand toggle and calls onExpandToggle', async () => {
    const onExpandToggle = vi.fn()
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface
            taskId={null} mode="create" width="drawer"
            expanded={false} onExpandToggle={onExpandToggle} onClose={vi.fn()}
          />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    const toggle = screen.getByRole('button', { name: /expand to full width/i })
    expect(toggle).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(onExpandToggle).toHaveBeenCalled()
  })

  it('M5: create-mode drawer bar reflects expanded=true (collapse affordance + full-width crumb)', async () => {
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface
            taskId={null} mode="create" width="drawer"
            expanded onExpandToggle={vi.fn()} onClose={vi.fn()}
          />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    expect(screen.getByRole('button', { name: /collapse to split/i })).toBeInTheDocument()
    expect(screen.getByText(/new task · full width/i)).toBeInTheDocument()
    expect(document.querySelector('.dw-surface-expanded')).toBeTruthy()
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

  it('AC-081 (TaskSurface create): valid submit calls createTask and navigates to the new task', async () => {
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
    expect(title).toHaveClass('tc-input-error')
    expect(title).toHaveAttribute('aria-invalid', 'true')
  })

  it('AC-108: a blur error clears once the field is filled (typing)', async () => {
    renderCreate()
    const title = await screen.findByLabelText('Title')
    fireEvent.blur(title)
    await screen.findByText(/title is required/i)
    fireEvent.change(title, { target: { value: 'Now it has a value' } })
    await waitFor(() => expect(screen.queryByText(/title is required/i)).toBeNull())
    expect(title).not.toHaveClass('tc-input-error')
  })

  it('AC-108: blurring an empty Business unit renders an inline error', async () => {
    // Auth with no role → no primary-role BU, so the BU select starts empty.
    const noRoleAuth: AuthState = {
      status: 'authenticated',
      viewer: { person: mockPerson, roles: [], isManager: false, accessRoles: [] },
      signOut: async () => {},
    }
    renderCreate(noRoleAuth)
    const bu = await screen.findByLabelText('Business unit')
    fireEvent.blur(bu)
    const err = await screen.findByText(/business unit is required/i)
    expect(err).toHaveAttribute('role', 'alert')
    expect(bu).toHaveClass('tc-input-error')
  })
})
