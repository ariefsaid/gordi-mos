import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow, ChecklistItemRow, TaskEventRow } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'

// ── Mock the data layer ──────────────────────────────────────────────────────
vi.mock('../lib/db/tasks', () => ({
  getTask: vi.fn(),
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
vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...mod,
    useParams: vi.fn(() => ({ taskId: 'task-abc' })),
    useNavigate: vi.fn(() => vi.fn()),
  }
})

import { getTask, updateTaskStatus, updateTaskRaci, updateTaskFields, addChecklistItem, toggleChecklistItem, reorderChecklistItem, deleteChecklistItem, archiveTask, unarchiveTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
// Re-homed from the deleted TaskDetail host onto the LIVE task surface (TaskSurface view
// mode, width="full" — identical to what the host rendered). All detail-field ACs
// (AC-070..075, T-047, RIC-1/2/3, I2, M2) now run against the real component.
import { TaskSurface } from '@/components/tasks/task-surface'

const mockGetTask = vi.mocked(getTask)
const mockUpdateTaskStatus = vi.mocked(updateTaskStatus)
const mockUpdateTaskRaci = vi.mocked(updateTaskRaci)
const mockUpdateTaskFields = vi.mocked(updateTaskFields)
const mockAddChecklistItem = vi.mocked(addChecklistItem)
const mockToggleChecklistItem = vi.mocked(toggleChecklistItem)
const mockReorderChecklistItem = vi.mocked(reorderChecklistItem)
const mockDeleteChecklistItem = vi.mocked(deleteChecklistItem)
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
  viewer: { person: mockPerson, roles: [mockRole], isManager: false, accessRoles: [] },
  signOut: async () => {},
}
const managerState: AuthState = {
  status: 'authenticated',
  viewer: { person: { ...mockPerson, id: 'manager-id' }, roles: [mockRole], isManager: true, accessRoles: [] },
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
        {/* Re-homed: TaskSurface view mode at full width (was the TaskDetail host's render). */}
        <TaskSurface taskId="task-abc" mode="view" width="full" onClose={() => {}} onTitleResolved={() => {}} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  // Clear per-task feed-tab memory (sessionStorage) so a Checklist/Notes-tab
  // test doesn't leak the active feed tab into a later activity-default test.
  sessionStorage.clear()
  mockGetBusinessUnits.mockResolvedValue(mockBUs)
  mockGetPeople.mockResolvedValue(mockPeople)
  mockUpdateTaskStatus.mockResolvedValue()
  mockUpdateTaskRaci.mockResolvedValue()
  mockAddChecklistItem.mockResolvedValue()
  mockToggleChecklistItem.mockResolvedValue()
  mockReorderChecklistItem.mockResolvedValue()
  mockDeleteChecklistItem.mockResolvedValue()
  mockArchiveTask.mockResolvedValue()
  mockUnarchiveTask.mockResolvedValue()
  mockUpdateTaskFields.mockResolvedValue()
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

    // R and A person names (resolved from directory) — left details panel
    expect(screen.getAllByText('Cahya Cafe').length).toBeGreaterThan(0)

    // Activity log region (the feed default tab)
    expect(screen.getByRole('region', { name: /activity/i })).toBeTruthy()

    // Description now lives behind the Notes feed tab (no new entity)
    fireEvent.click(screen.getByRole('tab', { name: /notes/i }))
    expect(screen.getByText(/espresso machine on floor 2 is broken/i)).toBeTruthy()

    // Checklist items behind the Checklist feed tab
    fireEvent.click(screen.getByRole('tab', { name: /checklist/i }))
    expect(screen.getByText('Inspect heating element')).toBeTruthy()
    expect(screen.getByText('Order parts')).toBeTruthy()
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
    // First getTask call: initial load (Open); second call (after mutation): updated task (In Progress)
    mockGetTask
      .mockResolvedValueOnce({ task: makeTask({ status: 'Open' }), checklist: [], events: [] })
      .mockResolvedValueOnce({ task: makeTask({ status: 'In Progress' }), checklist: [], events: [] })
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
    await waitFor(() => expect(screen.getByText('In Progress')).toBeTruthy())
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
      viewer: { person: mockPerson, roles: [mockRole], isManager: false, accessRoles: [] }, // mockPerson.id = VIEWER_ID, not in R/A
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
    await waitFor(() => screen.getByRole('tab', { name: /checklist/i }))
    fireEvent.click(screen.getByRole('tab', { name: /checklist/i }))

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
    await waitFor(() => screen.getByRole('tab', { name: /checklist/i }))
    fireEvent.click(screen.getByRole('tab', { name: /checklist/i }))
    await waitFor(() => screen.getByText('Inspect coil'))

    const checkbox = screen.getByRole('checkbox', { name: /inspect coil/i })
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(mockToggleChecklistItem).toHaveBeenCalledWith('item-0', true, 'task-abc', VIEWER_ID)
    })
  })

  it('AC-074 reorder — move-down button calls reorderChecklistItem with swapped positions', async () => {
    const checklist = makeChecklist([
      { id: 'item-0', label: 'Step A', position: 0 },
      { id: 'item-1', label: 'Step B', position: 1 },
    ])
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist, events: [] })
    renderDetail()
    await waitFor(() => screen.getByRole('tab', { name: /checklist/i }))
    fireEvent.click(screen.getByRole('tab', { name: /checklist/i }))
    await waitFor(() => screen.getByText('Step A'))

    // Move "Step A" down (move-down button on the first item)
    const moveDownBtns = screen.getAllByRole('button', { name: /move down/i })
    fireEvent.click(moveDownBtns[0])

    await waitFor(() => {
      // item-0 moves to position 1, item-1 moves to position 0
      expect(mockReorderChecklistItem).toHaveBeenCalledWith('item-0', 1)
      expect(mockReorderChecklistItem).toHaveBeenCalledWith('item-1', 0)
    })
  })

  it('AC-074 reorder — move-up button calls reorderChecklistItem with swapped positions', async () => {
    const checklist = makeChecklist([
      { id: 'item-0', label: 'Step A', position: 0 },
      { id: 'item-1', label: 'Step B', position: 1 },
    ])
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist, events: [] })
    renderDetail()
    await waitFor(() => screen.getByRole('tab', { name: /checklist/i }))
    fireEvent.click(screen.getByRole('tab', { name: /checklist/i }))
    await waitFor(() => screen.getByText('Step B'))

    // Move "Step B" up — use the specific aria-label on its move-up button
    const moveUpStepB = screen.getByRole('button', { name: /move up step b/i })
    fireEvent.click(moveUpStepB)

    await waitFor(() => {
      expect(mockReorderChecklistItem).toHaveBeenCalledWith('item-1', 0)
      expect(mockReorderChecklistItem).toHaveBeenCalledWith('item-0', 1)
    })
  })

  it('AC-074 delete — × button calls deleteChecklistItem, item removed optimistically', async () => {
    const checklist = makeChecklist([
      { id: 'item-0', label: 'Remove me', position: 0 },
    ])
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist, events: [] })
    renderDetail()
    await waitFor(() => screen.getByRole('tab', { name: /checklist/i }))
    fireEvent.click(screen.getByRole('tab', { name: /checklist/i }))
    await waitFor(() => screen.getByText('Remove me'))

    const deleteBtn = screen.getByRole('button', { name: /delete checklist item remove me/i })
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(mockDeleteChecklistItem).toHaveBeenCalledWith('item-0', 'task-abc', VIEWER_ID)
    })
    // Item removed from DOM optimistically
    expect(screen.queryByText('Remove me')).toBeNull()
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

// ── RIC-1: loading state renders VISIBLE skeleton ────────────────────────────
describe('RIC-1 — loading state renders styled skeleton', () => {
  it('renders skeleton element with sk class present in loading branch', () => {
    mockGetTask.mockReturnValue(new Promise(() => {})) // never resolves
    renderDetail()
    // The skeleton must be present with aria-busy
    const busyEl = screen.getByRole('status')
    expect(busyEl).toBeTruthy()
    // aria-busy container must be in the DOM
    const busyContainer = document.querySelector('[aria-busy="true"]')
    expect(busyContainer).toBeTruthy()
    // The .sk blocks must be present — they only have styles when the CSS is hoisted
    const skBlocks = document.querySelectorAll('.sk')
    expect(skBlocks.length).toBeGreaterThan(0)
    // The .sk-block wrapper must be present
    expect(document.querySelector('.sk-block')).toBeTruthy()
  })
})

// ── RIC-2: not-found state renders styled panel + link ───────────────────────
describe('RIC-2 — not-found state renders styled panel', () => {
  it('renders not-found panel with styled classes and a back link', async () => {
    mockGetTask.mockRejectedValue(new Error('getTask failed — PGRST116'))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByText(/task not found/i)).toBeTruthy()
    })
    // not-found-panel class must be present
    expect(document.querySelector('.not-found-panel')).toBeTruthy()
    // not-found-title class must be present
    expect(document.querySelector('.not-found-title')).toBeTruthy()
    // btn-outline (shared button hierarchy, IXD-4) styled back link must be present
    expect(document.querySelector('.btn-outline')).toBeTruthy()
    // The back link must point to /tasks
    const link = screen.getByRole('link', { name: /all tasks/i })
    expect(link).toBeTruthy()
  })
})

// ── RIC-3: non-editor sees no edit affordances ───────────────────────────────
describe('RIC-3 — non-editor read-only regression guard', () => {
  it('non-editor sees no status trigger, no archive, no RACI add, no checklist input', async () => {
    const task = makeTask({
      responsible_person_id: OTHER_ID,
      accountable_person_id: OTHER_ID,
    })
    const nonEditorAuth: AuthState = {
      status: 'authenticated',
      viewer: { person: mockPerson, roles: [mockRole], isManager: false, accessRoles: [] },
      signOut: async () => {},
    }
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderDetail(nonEditorAuth)
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /archive/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull()
    expect(screen.queryByPlaceholderText(/add a step/i)).toBeNull()
  })
})

// ── I2: R and A editable via person pickers ──────────────────────────────────
describe('I2 — R and A editable on detail page', () => {
  const R_PERSON = OTHER_ID // Use OTHER_ID as the initial R
  const A_PERSON = OTHER_ID // same for initial A

  it('editor can change Responsible via picker — dispatches updateTaskFields with new R id', async () => {
    const task = makeTask({
      responsible_person_id: R_PERSON,
      accountable_person_id: A_PERSON,
    })
    // Editor is the manager
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    mockGetTask.mockResolvedValueOnce({ task, checklist: [], events: [] })
    mockGetTask
      .mockResolvedValueOnce({ task, checklist: [], events: [] })
      .mockResolvedValue({ task: { ...task, responsible_person_id: VIEWER_ID }, checklist: [], events: [] })
    renderDetail(managerState)
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    // Should see an editable R picker button
    const changeRBtn = screen.getByRole('button', { name: /change responsible/i })
    expect(changeRBtn).toBeTruthy()
    fireEvent.click(changeRBtn)

    // Picker opens — select Cahya Cafe (VIEWER_ID)
    const option = screen.getByRole('option', { name: 'Cahya Cafe' })
    fireEvent.click(option)

    await waitFor(() => {
      expect(mockUpdateTaskFields).toHaveBeenCalledWith(
        'task-abc',
        expect.objectContaining({ responsible_person_id: VIEWER_ID }),
        'manager-id',
      )
    })
  })

  it('editor can change Accountable via picker — dispatches updateTaskFields with new A id', async () => {
    const task = makeTask({
      responsible_person_id: R_PERSON,
      accountable_person_id: A_PERSON,
    })
    mockGetTask
      .mockResolvedValueOnce({ task, checklist: [], events: [] })
      .mockResolvedValue({ task: { ...task, accountable_person_id: VIEWER_ID }, checklist: [], events: [] })
    renderDetail(managerState)
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    const changeABtn = screen.getByRole('button', { name: /change accountable/i })
    expect(changeABtn).toBeTruthy()
    fireEvent.click(changeABtn)

    const option = screen.getByRole('option', { name: 'Cahya Cafe' })
    fireEvent.click(option)

    await waitFor(() => {
      expect(mockUpdateTaskFields).toHaveBeenCalledWith(
        'task-abc',
        expect.objectContaining({ accountable_person_id: VIEWER_ID }),
        'manager-id',
      )
    })
  })

  it('non-editor sees static R/A display (no picker button)', async () => {
    const task = makeTask({
      responsible_person_id: OTHER_ID,
      accountable_person_id: OTHER_ID,
    })
    const nonEditorAuth: AuthState = {
      status: 'authenticated',
      viewer: { person: mockPerson, roles: [mockRole], isManager: false, accessRoles: [] },
      signOut: async () => {},
    }
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderDetail(nonEditorAuth)
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    expect(screen.queryByRole('button', { name: /change responsible/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /change accountable/i })).toBeNull()
    // The person names should still be visible statically
    expect(screen.getAllByText('Other Person').length).toBeGreaterThan(0)
  })
})

// ── M2: archived task is read-only except Unarchive ─────────────────────────
describe('M2 — archived task is read-only except Unarchive', () => {
  it('archived task shows no status trigger, no RACI pickers, no checklist add', async () => {
    // Viewer is A (would normally be an editor + archiver)
    const task = makeTask({
      archived_at: '2026-06-11T10:00:00Z',
      responsible_person_id: VIEWER_ID,
      accountable_person_id: VIEWER_ID,
    })
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderDetail()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    // No status change trigger
    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()

    // No RACI add buttons
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull()

    // No checklist add input
    expect(screen.queryByPlaceholderText(/add a step/i)).toBeNull()

    // No R/A change picker buttons
    expect(screen.queryByRole('button', { name: /change responsible/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /change accountable/i })).toBeNull()
  })

  it('archived task still shows Unarchive button for A/manager', async () => {
    const task = makeTask({
      archived_at: '2026-06-11T10:00:00Z',
      responsible_person_id: VIEWER_ID,
      accountable_person_id: VIEWER_ID,
    })
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderDetail()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    expect(screen.getByRole('button', { name: /unarchive/i })).toBeTruthy()
  })
})
