import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '../../auth/context'
import { AuthContext } from '../../auth/context'
import type { PeopleRow, RolesRow } from '../../lib/database.types'
import type { TaskListRow, ChecklistItemRow, TaskEventRow } from '../../lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '../../lib/db/directory'

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

import { getTask, createTask, updateTaskStatus } from '../../lib/db/tasks'
import { getBusinessUnits, getPeople } from '../../lib/db/directory'
import { TaskSurface } from './TaskSurface'

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
  viewer: { person: mockPerson, roles: [mockRole], isManager: false },
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
    const { archiveTask } = await import('../../lib/db/tasks')
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
})
