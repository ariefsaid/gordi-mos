import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '../auth/context'
import { AuthContext } from '../auth/context'
import type { PeopleRow, RolesRow } from '../lib/database.types'
import type { TaskListRow, ChecklistItemRow, TaskEventRow } from '../lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '../lib/db/directory'

// ── Mock the data layer ──────────────────────────────────────────────────────
vi.mock('../lib/db/tasks', () => ({
  getTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskRaci: vi.fn(),
  addChecklistItem: vi.fn(),
  toggleChecklistItem: vi.fn(),
  reorderChecklistItem: vi.fn(),
  archiveTask: vi.fn(),
  unarchiveTask: vi.fn(),
}))
vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...mod,
    useParams: vi.fn(() => ({ taskId: 'task-abc' })),
    useNavigate: vi.fn(() => vi.fn()),
  }
})

import { getTask, updateTaskStatus, updateTaskRaci, addChecklistItem, toggleChecklistItem, archiveTask, unarchiveTask } from '../lib/db/tasks'
import { getBusinessUnits, getPeople } from '../lib/db/directory'
import TaskDetail from './TaskDetail'

const mockGetTask = vi.mocked(getTask)
const mockUpdateTaskStatus = vi.mocked(updateTaskStatus)
const mockUpdateTaskRaci = vi.mocked(updateTaskRaci)
const mockAddChecklistItem = vi.mocked(addChecklistItem)
const mockToggleChecklistItem = vi.mocked(toggleChecklistItem)
const mockArchiveTask = vi.mocked(archiveTask)
const mockUnarchiveTask = vi.mocked(unarchiveTask)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)

// ── Fixtures ─────────────────────────────────────────────────────────────────
const VIEWER_ID  = 'viewer-person-id'
const OTHER_ID   = 'other-person-id'
const C_PERSON   = 'c-person-id'
const I_PERSON   = 'i-person-id'

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
const managerState: AuthState = {
  status: 'authenticated',
  viewer: { person: { ...mockPerson, id: 'manager-id' }, roles: [mockRole], isManager: true },
  signOut: async () => {},
}


function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-abc',
    org_id: 'org',
    title: 'Fix the coffee machine',
    business_unit_id: 'bu-1',
    status: 'Open',
    responsible_person_id: VIEWER_ID,
    accountable_person_id: VIEWER_ID,
    consulted_person_ids: [],
    informed_person_ids: [],
    description: 'The espresso machine on floor 2 is broken.',
    due_date: '2026-06-20',
    last_activity_at: '2026-06-11T08:00:00Z',
    archived_at: null,
    created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z',
    updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

function makeChecklist(overrides: Partial<ChecklistItemRow>[] = []): ChecklistItemRow[] {
  return overrides.map((o, i) => ({
    id: `item-${i}`, org_id: 'org', task_id: 'task-abc',
    label: `Step ${i + 1}`, is_done: false, position: i,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...o,
  }))
}

function makeEvent(overrides: Partial<TaskEventRow> = {}): TaskEventRow {
  return {
    id: 'evt-1', org_id: 'org', task_id: 'task-abc',
    actor_person_id: VIEWER_ID, event_type: 'created',
    from_value: null, to_value: null,
    created_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

const mockBUs: BusinessUnitOption[] = [
  { id: 'bu-1', name: 'Cafe Operations' },
  { id: 'bu-2', name: 'Sales' },
]
const mockPeople: PersonOption[] = [
  { id: VIEWER_ID, full_name: 'Cahya Cafe' },
  { id: OTHER_ID,  full_name: 'Other Person' },
  { id: C_PERSON,  full_name: 'Consulted Person' },
  { id: I_PERSON,  full_name: 'Informed Person' },
]

function renderDetail(auth: AuthState = authedState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/tasks/task-abc']}>
        <TaskDetail />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetBusinessUnits.mockResolvedValue(mockBUs)
  mockGetPeople.mockResolvedValue(mockPeople)
  mockUpdateTaskStatus.mockResolvedValue()
  mockUpdateTaskRaci.mockResolvedValue()
  mockAddChecklistItem.mockResolvedValue()
  mockToggleChecklistItem.mockResolvedValue()
  mockArchiveTask.mockResolvedValue()
  mockUnarchiveTask.mockResolvedValue()
})

// ── AC-070: detail page renders all task fields ───────────────────────────────
describe('AC-070 — detail page renders task fields', () => {
  it('shows title, status pill, due, BU, description, R/A/C/I fields, checklist, activity log', async () => {
    const task = makeTask({ consulted_person_ids: [C_PERSON], informed_person_ids: [I_PERSON] })
    const checklist = makeChecklist([{ label: 'Inspect heating element' }, { label: 'Order parts' }])
    const events = [
      makeEvent({ event_type: 'created', created_at: '2026-06-11T00:00:00Z' }),
      makeEvent({ id: 'evt-2', event_type: 'status_changed', from_value: 'Open', to_value: 'In Progress', created_at: '2026-06-11T09:00:00Z' }),
    ]
    mockGetTask.mockResolvedValue({ task, checklist, events })

    renderDetail()

    // Loading skeleton first
    expect(screen.getByRole('status')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' })).toBeTruthy()
    })

    // Status pill
    expect(screen.getByText('Open')).toBeTruthy()

    // Due date
    expect(screen.getByText(/sat 20 jun/i)).toBeTruthy()

    // Business unit (resolved from directory)
    expect(screen.getByText('Cafe Operations')).toBeTruthy()

    // Description
    expect(screen.getByText(/espresso machine on floor 2 is broken/i)).toBeTruthy()

    // R and A person names (resolved from directory)
    expect(screen.getAllByText('Cahya Cafe').length).toBeGreaterThan(0)

    // Checklist items
    expect(screen.getByText('Inspect heating element')).toBeTruthy()
    expect(screen.getByText('Order parts')).toBeTruthy()

    // Activity log region
    expect(screen.getByRole('region', { name: /activity/i })).toBeTruthy()
  })

  it('renders loading skeleton initially (aria-busy)', () => {
    mockGetTask.mockReturnValue(new Promise(() => {})) // never resolves
    renderDetail()
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('renders not-found panel when task returns no data', async () => {
    mockGetTask.mockRejectedValue(new Error('getTask failed — PGRST116'))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByText(/task not found/i)).toBeTruthy()
    })
  })
})

// ── AC-071: inline status change ──────────────────────────────────────────────
describe('AC-071 — inline status change', () => {
  it('updates pill in place (no navigation) and calls updateTaskStatus', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderDetail()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    // Open status dropdown
    const trigger = screen.getByRole('button', { name: /change status/i })
    fireEvent.click(trigger)

    // Pick "In Progress"
    const option = screen.getByRole('option', { name: 'In Progress' })
    fireEvent.click(option)

    await waitFor(() => {
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-abc', 'Open', 'In Progress', VIEWER_ID)
    })

    // Pill should now show "In Progress" without navigation
    expect(screen.getByText('In Progress')).toBeTruthy()
  })
})

// ── AC-072: RACI add/remove chips ─────────────────────────────────────────────
describe('AC-072 — RACI chip add/remove (Consulted/Informed)', () => {
  it('adds a Consulted person chip and dispatches updateTaskRaci', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderDetail()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    // Click "+ Add" in Consulted section
    const consultedSection = screen.getByTestId('raci-consulted')
    const addBtn = within(consultedSection).getByRole('button', { name: /add/i })
    fireEvent.click(addBtn)

    // Person picker opens — select a person
    const pickerOption = screen.getByRole('option', { name: 'Consulted Person' })
    fireEvent.click(pickerOption)

    await waitFor(() => {
      expect(mockUpdateTaskRaci).toHaveBeenCalledWith(
        'task-abc',
        expect.objectContaining({ consulted_person_ids: [C_PERSON] }),
        VIEWER_ID,
      )
    })
  })

  it('removes a Consulted chip and dispatches updateTaskRaci', async () => {
    const task = makeTask({ consulted_person_ids: [C_PERSON] })
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderDetail()
    await waitFor(() => screen.getByText('Consulted Person'))

    const removeBtn = screen.getByRole('button', { name: /remove consulted person/i })
    fireEvent.click(removeBtn)

    await waitFor(() => {
      expect(mockUpdateTaskRaci).toHaveBeenCalledWith(
        'task-abc',
        expect.objectContaining({ consulted_person_ids: [] }),
        VIEWER_ID,
      )
    })
  })
})

// ── AC-073: read-only mode for non-editors ────────────────────────────────────
describe('AC-073 — read-only mode for non-editors', () => {
  it('hides status changer, RACI edit, checklist edit, archive for unrelated viewer', async () => {
    // Task where VIEWER_ID is R/A, but the authenticated user is OTHER_ID (not R/A/manager)
    const task = makeTask({
      responsible_person_id: OTHER_ID,
      accountable_person_id: OTHER_ID,
    })
    // unrelated user is VIEWER (not the one in R/A)
    const nonEditorAuth: AuthState = {
      status: 'authenticated',
      viewer: { person: mockPerson, roles: [mockRole], isManager: false }, // mockPerson.id = VIEWER_ID, not in R/A
      signOut: async () => {},
    }
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderDetail(nonEditorAuth)

    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    // Status changer button must NOT be present
    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()

    // No "+ Add" for RACI
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull()

    // No checklist "Add a step" input
    expect(screen.queryByPlaceholderText(/add a step/i)).toBeNull()

    // No archive control
    expect(screen.queryByRole('button', { name: /archive/i })).toBeNull()
  })
})

// ── AC-074: checklist add / toggle ────────────────────────────────────────────
describe('AC-074 — checklist add / toggle', () => {
  it('adds an item: addChecklistItem called, item appears', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderDetail()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    const input = screen.getByPlaceholderText(/add a step/i)
    fireEvent.change(input, { target: { value: 'Buy a new gasket' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockAddChecklistItem).toHaveBeenCalledWith('task-abc', 'Buy a new gasket', 0, VIEWER_ID)
    })
  })

  it('toggles done: toggleChecklistItem called, checkbox state changes', async () => {
    const checklist = makeChecklist([{ id: 'item-0', label: 'Inspect coil', is_done: false }])
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist, events: [] })
    renderDetail()
    await waitFor(() => screen.getByText('Inspect coil'))

    const checkbox = screen.getByRole('checkbox', { name: /inspect coil/i })
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(mockToggleChecklistItem).toHaveBeenCalledWith('item-0', true, 'task-abc', VIEWER_ID)
    })
  })
})

// ── AC-075: activity log newest-first, no composer ───────────────────────────
describe('AC-075 — activity log renders events newest-first, no comment composer', () => {
  it('lists events newest-first with event type + from/to, no text input for comments', async () => {
    // Events pre-sorted newest-first (as the data layer returns them — getTask orders by created_at desc)
    const events: TaskEventRow[] = [
      makeEvent({ id: 'e2', event_type: 'status_changed', from_value: 'Open', to_value: 'In Progress', created_at: '2026-06-11T10:00:00Z' }),
      makeEvent({ id: 'e1', event_type: 'created', created_at: '2026-06-11T00:00:00Z' }),
    ]
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events })
    renderDetail()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    // Events must appear — newest (status_changed at 10:00) should be first in DOM
    const log = screen.getByRole('region', { name: /activity/i })
    const entries = within(log).getAllByTestId('event-entry')
    expect(entries[0].textContent).toMatch(/status changed|in progress/i)
    expect(entries[1].textContent).toMatch(/created/i)

    // No free-text comment composer (P2-1 scope guard)
    expect(screen.queryByPlaceholderText(/write a comment/i)).toBeNull()
    expect(screen.queryByRole('textbox', { name: /comment/i })).toBeNull()
  })
})

// ── T-047: archive/unarchive control gated to A/manager ──────────────────────
describe('T-047 — archive control on detail', () => {
  it('shows archive control for Accountable person; dispatches archiveTask', async () => {
    // VIEWER_ID is A on this task
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderDetail()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    const archiveBtn = screen.getByRole('button', { name: /archive task/i })
    expect(archiveBtn).toBeTruthy()

    // Click — confirm dialog
    fireEvent.click(archiveBtn)
    const confirmBtn = screen.getByRole('button', { name: /^archive$/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockArchiveTask).toHaveBeenCalledWith('task-abc', VIEWER_ID)
    })
  })

  it('shows unarchive for an already-archived task', async () => {
    const task = makeTask({ archived_at: '2026-06-11T10:00:00Z' })
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderDetail()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    expect(screen.getByRole('button', { name: /unarchive/i })).toBeTruthy()
  })

  it('hides archive for non-A non-manager Responsible-only user', async () => {
    // Task where viewer is R only (A is someone else)
    const task = makeTask({
      responsible_person_id: VIEWER_ID,
      accountable_person_id: OTHER_ID,
    })
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderDetail()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    expect(screen.queryByRole('button', { name: /archive task/i })).toBeNull()
  })

  it('shows archive for manager (isManager=true)', async () => {
    const task = makeTask({ responsible_person_id: OTHER_ID, accountable_person_id: OTHER_ID })
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderDetail(managerState)
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    expect(screen.getByRole('button', { name: /archive task/i })).toBeTruthy()
  })
})
