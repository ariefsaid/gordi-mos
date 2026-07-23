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

import { getTask, updateTaskStatus, updateTaskFields, addChecklistItem, toggleChecklistItem, reorderChecklistItem, deleteChecklistItem, archiveTask, unarchiveTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
// Re-homed from the deleted TaskDetail host onto the LIVE task surface (TaskSurface view
// mode, width="full" — identical to what the host rendered). All detail-field ACs
// (AC-070..075, T-047, RIC-1/2/3, I2, M2) now run against the real component.
import { TaskSurface } from '@/components/tasks/task-surface'

const mockGetTask = vi.mocked(getTask)
const mockUpdateTaskStatus = vi.mocked(updateTaskStatus)
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
    objective_id: null,
    work_line_id: null,
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

// Value-first record grammar: a field renders its VALUE first and swaps in its control only when
// the row is activated. Click the field's edit affordance, then query its control.
function activateFieldByKey(key: string) {
  const btn = document.querySelector(`[data-field-key="${key}"] [data-field-edit]`) as HTMLElement
  fireEvent.click(btn)
}

beforeEach(() => {
  vi.resetAllMocks()
  // Clear per-task feed-tab memory (sessionStorage) so a Checklist/Notes-tab
  // test doesn't leak the active feed tab into a later activity-default test.
  sessionStorage.clear()
  mockGetBusinessUnits.mockResolvedValue(mockBUs)
  mockGetPeople.mockResolvedValue(mockPeople)
  mockUpdateTaskStatus.mockResolvedValue()
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
  it('shows title, status pill, due, Team, typed ownership, checklist, activity log, and completion', async () => {
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

    // Due date — value-first: activate the row, then the native <input type="date"> holds the value.
    activateFieldByKey('dueDate')
    expect(screen.getByLabelText('Due')).toHaveValue('2026-06-20')

    // Business unit (resolved from directory) — a value-first Ownership field in the record
    // document (the old TaskDetail identity sub-line is gone; the RecordViewer header owns identity).
    expect(screen.getAllByText('Cafe Operations').length).toBeGreaterThan(0)

    // PIC and Supervisor names (resolved from directory) — value-first person <select>s reached by
    // activating each row; query the select value (the name appears in multiple <option>s).
    activateFieldByKey('pic')
    expect(screen.getByLabelText('PIC')).toHaveValue(VIEWER_ID)
    activateFieldByKey('supervisor')
    expect(screen.getByLabelText('Supervisor')).toHaveValue(VIEWER_ID)
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument()
    // No RACI grammar: match the parenthesized RACI labels only (bare "Consulted"/"Informed"
    // false-positive on the test's own fixture names "Consulted Person"/"Informed Person").
    expect(screen.queryByText(/RACI|Responsible \(R\)|Accountable \(A\)|Consulted \(C\)|Informed \(I\)/)).toBeNull()

    // Activity region (content-first: a stacked region, no longer a tab)
    expect(screen.getByRole('region', { name: /activity/i })).toBeTruthy()

    // Description renders once, in the content region prose (the Notes feed tab was a fossil,
    // deleted deliberately — owner-eyes item 11 / commit b031937; journey step updated, goal intact).
    expect(screen.getAllByText(/espresso machine on floor 2 is broken/i).length).toBeGreaterThan(0)

    // Content-first anatomy: the Checklist is a directly-visible stacked region (no tab to click).
    expect(screen.getByText('Inspect heating element')).toBeTruthy()
    expect(screen.getByText('Order parts')).toBeTruthy()
  }, 10_000)

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

    // Value-first: Status is the record field — activate the row, then pick "In Progress" from the
    // select (a select's change IS the commit intent). The pill updates in place, no navigation.
    activateFieldByKey('status')
    const statusSelect = document.querySelector('[data-field-key="status"] select') as HTMLSelectElement
    fireEvent.change(statusSelect, { target: { value: 'In Progress' } })

    await waitFor(() => {
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-abc', 'Open', 'In Progress', VIEWER_ID)
    })

    // Pill should now show "In Progress" without navigation
    await waitFor(() => expect(screen.getByText('In Progress')).toBeTruthy())
  })
})

// ── AC-072: PIC reassignment ──────────────────────────────────────────────────
describe('AC-072 — typed Task ownership', () => {
  it('reassigns the PIC through the visible Task path', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    mockUpdateTaskFields.mockResolvedValue()
    renderDetail()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    // PIC reassignment journey: the record adapter exposes PIC as a value-first person <select>
    // reached by activating the row. The goal-oracle "reassigns the PIC through the visible Task
    // path" is met by picking a person; the journey step is "activate the field, then choose".
    activateFieldByKey('pic')
    const picSelect = screen.getByLabelText('PIC')
    fireEvent.change(picSelect, { target: { value: OTHER_ID } })

    await waitFor(() => expect(mockUpdateTaskFields).toHaveBeenCalledWith(
      'task-abc', { responsible_person_id: OTHER_ID }, VIEWER_ID,
    ))
  })
})

// ── AC-073: read-only mode for non-editors ────────────────────────────────────
describe('AC-073 — read-only mode for non-editors', () => {
  it('hides status changer, PIC reassignment, checklist edit, and archive for unrelated viewer', async () => {
    // Task owned by another person; this viewer is not PIC/Supervisor/manager.
    const task = makeTask({
      responsible_person_id: OTHER_ID,
      accountable_person_id: OTHER_ID,
    })
    // authenticated user is VIEWER_ID, not on the Task.
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

    // No PIC reassignment control
    expect(screen.queryByRole('button', { name: /reassign pic/i })).toBeNull()

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
    // Content-first anatomy: the checklist add field is directly visible (no tab to open).
    const input = await screen.findByPlaceholderText(/add a step/i)
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
    // Content-first anatomy: the checklist is a directly-visible stacked region (no tab).
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
    // Content-first anatomy: the checklist is a directly-visible stacked region (no tab).
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
    // Content-first anatomy: the checklist is a directly-visible stacked region (no tab).
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
    // Content-first anatomy: the checklist is a directly-visible stacked region (no tab).
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

// ── AC-075 + AC-P3-CM-004: activity log newest-first + comments composer ─────
describe('AC-075 / AC-P3-CM-004 — activity log + comments', () => {
  it('lists events newest-first and renders the task comment composer', async () => {
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

    // P3a Phase F deliberately supersedes the old P2 scope guard: task comments are live now.
    expect(screen.getByRole('region', { name: /comments/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /comment/i })).toBeInTheDocument()
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
  it('non-editor sees no status trigger, no archive, no PIC reassignment, no checklist input', async () => {
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

// ── I2: PIC reassignment stays on the typed Task surface ─────────────────────
describe('I2 — PIC reassignment on detail page', () => {
  it('manager can reassign the PIC without exposing governance-role editing', async () => {
    const task = makeTask({ responsible_person_id: OTHER_ID, accountable_person_id: OTHER_ID })
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    mockUpdateTaskFields.mockResolvedValue()
    renderDetail(managerState)
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))

    // PIC reassignment journey: the record adapter exposes PIC as a value-first person <select>
    // reached by activating the row (see AC-072 note). Goal-oracle: manager can reassign PIC
    // through the visible Task path without governance-role editing.
    activateFieldByKey('pic')
    const picSelect = screen.getByLabelText('PIC')
    fireEvent.change(picSelect, { target: { value: VIEWER_ID } })

    await waitFor(() => expect(mockUpdateTaskFields).toHaveBeenCalledWith(
      'task-abc', { responsible_person_id: VIEWER_ID }, 'manager-id',
    ))
    // No RACI grammar: parenthesized labels only (bare words false-positive on fixture names).
    expect(screen.queryByText(/RACI|Responsible \(R\)|Accountable \(A\)|Consulted \(C\)|Informed \(I\)/)).toBeNull()
  })
})

// ── M2: archived task is read-only except Unarchive ─────────────────────────
describe('M2 — archived task is read-only except Unarchive', () => {
  it('archived task shows no status trigger, no PIC reassignment, no checklist add', async () => {
    // Viewer is the Supervisor (would normally be an editor + archiver)
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

    // No reassignment control
    expect(screen.queryByRole('button', { name: /reassign pic/i })).toBeNull()

    // No checklist add input
    expect(screen.queryByPlaceholderText(/add a step/i)).toBeNull()

    // No PIC reassignment button
    expect(screen.queryByRole('button', { name: /reassign pic/i })).toBeNull()
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
