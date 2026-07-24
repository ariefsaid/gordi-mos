import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../lib/db/tasks', () => ({
  createTask: vi.fn(),
}))
vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))
vi.mock('../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return { ...mod, useNavigate: vi.fn(() => mockNavigate) }
})

import { createTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
// Re-homed from the deleted TaskCreate host onto the LIVE create surface (TaskSurface
// create mode, width="full" — identical to what the host rendered). AC-080 (prefills) +
// AC-081 (validation) now run against the real component.
import { TaskSurface } from '@/components/tasks/task-surface'

const mockCreateTask = vi.mocked(createTask)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)
const mockListObjectives = vi.mocked(listObjectives)
const mockListWorkLines = vi.mocked(listWorkLines)

// ── Fixtures ───────────────────────────────────────────────────────────────
const VIEWER_ID = 'viewer-person-id'

const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Cahya Cafe',
  email: 'cahya@gordi.id', archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
// Primary-role BU = bu-1 (earliest assigned role on bu-1)
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

const mockBUs: BusinessUnitOption[] = [
  { id: 'bu-1', name: 'Cafe Operations' },
  { id: 'bu-2', name: 'Sales' },
]
const mockPeople: PersonOption[] = [
  { id: VIEWER_ID, full_name: 'Cahya Cafe' },
  { id: 'other-id', full_name: 'Other Person' },
]

function renderCreate(auth: AuthState = authedState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/tasks/new']}>
        {/* Re-homed: TaskSurface create mode at full width (was the TaskCreate host's render). */}
        <TaskSurface taskId={null} mode="create" width="full" onClose={() => {}} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetBusinessUnits.mockResolvedValue(mockBUs)
  mockGetPeople.mockResolvedValue(mockPeople)
  mockListObjectives.mockResolvedValue([])
  mockListWorkLines.mockResolvedValue([])
  mockCreateTask.mockResolvedValue('new-task-id')
  mockNavigate.mockReset()
})

// ── AC-080: prefills on open ───────────────────────────────────────────────
describe('AC-080 — create form prefills', () => {
  it('PIC and Supervisor pre-fill to creator; Team defaults to primary-role Team, all editable', async () => {
    renderCreate()

    await waitFor(() => {
      // Team defaults to the creator's primary-role BU (bu-1 = "Cafe Operations")
      const teamSelect = screen.getByLabelText(/^team$/i) as HTMLSelectElement
      expect(teamSelect.value).toBe('bu-1')
    })

    // PIC and Supervisor selects are present and pre-filled to creator
    const picSelect = screen.getByLabelText(/^pic$/i) as HTMLSelectElement
    expect(picSelect.value).toBe(VIEWER_ID)

    const supervisorSelect = screen.getByLabelText(/^supervisor$/i) as HTMLSelectElement
    expect(supervisorSelect.value).toBe(VIEWER_ID)

    // Team field is editable (not disabled)
    const teamSelect = screen.getByLabelText(/^team$/i)
    expect(teamSelect).not.toBeDisabled()

    // PIC and Supervisor fields are also not disabled
    expect(picSelect).not.toBeDisabled()
    expect(supervisorSelect).not.toBeDisabled()
  })

  it('AC-080 — PIC and Supervisor are changeable; chosen ids reach createTask', async () => {
    renderCreate()

    // Wait for directory to load
    await waitFor(() => screen.getByLabelText(/^pic$/i))

    // Change PIC to "Other Person"
    const picSelect = screen.getByLabelText(/^pic$/i) as HTMLSelectElement
    fireEvent.change(picSelect, { target: { value: 'other-id' } })
    expect(picSelect.value).toBe('other-id')

    // Change Supervisor to "Other Person" as well (may equal PIC — no constraint)
    const supervisorSelect = screen.getByLabelText(/^supervisor$/i) as HTMLSelectElement
    fireEvent.change(supervisorSelect, { target: { value: 'other-id' } })
    expect(supervisorSelect.value).toBe('other-id')

    // Submit the form with title filled
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Task with changed PIC/Supervisor' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Task with changed PIC/Supervisor',
        responsiblePersonId: 'other-id',
        accountablePersonId: 'other-id',
        createdBy: VIEWER_ID,
      }))
    })
  })
})

// ── F17 (OD-91 #29): optional context pickers behind one "+ Add context" reveal ──
describe('F17 — create-task context reveal', () => {
  it('the Objective/Project pickers stay hidden behind "+ Add context"; the reveal shows them', async () => {
    mockListObjectives.mockResolvedValue([
      { id: 'obj-1', name: 'Grow retail revenue' } as never,
    ])
    renderCreate()
    // The reveal appears once a context lookup arrives; the Objective picker is NOT shown yet.
    const reveal = await screen.findByRole('button', { name: /add context/i })
    expect(screen.queryByLabelText(/objective/i)).not.toBeInTheDocument()
    // Opening the reveal shows the optional pickers…
    fireEvent.click(reveal)
    expect(await screen.findByLabelText(/objective/i)).toBeInTheDocument()
    // …and the reveal button itself is gone (it stays open once opened).
    expect(screen.queryByRole('button', { name: /add context/i })).not.toBeInTheDocument()
  })
})

// ── AC-081: validation blocks empty title / BU ─────────────────────────────
describe('AC-081 — create form validation', () => {
  it('blocks submit with empty title; shows field-level message; createTask NOT called', async () => {
    renderCreate()
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))

    // Leave title empty; BU is pre-filled so only title is missing
    const submitBtn = screen.getByRole('button', { name: /create task/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/title is required/i)).toBeTruthy()
    })
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  it('blocks submit when Team is cleared; shows field-level message', async () => {
    // Use a state with NO roles (so primaryRoleBU = '') to ensure Team starts empty
    const noRoleState: AuthState = {
      status: 'authenticated',
      viewer: {
        person: mockPerson,
        roles: [],  // no roles → primaryRoleBU = ''
        isManager: false,
        accessRoles: [],
      },
      signOut: async () => {},
    }
    renderCreate(noRoleState)
    await waitFor(() => screen.getByLabelText(/^team$/i))

    // Fill title only; Team left empty (no default with no roles)
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My task' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    await waitFor(() => {
      expect(screen.getByText(/team is required/i)).toBeTruthy()
    })
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  it('GAP-6 (OD-91 #11): on valid submit, createTask is called and it returns to the collection with the new row highlighted', async () => {
    renderCreate()
    await waitFor(() => screen.getByLabelText(/title/i))

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'New Task Alpha' } })
    // BU already pre-filled to bu-1
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'New Task Alpha',
        businessUnitId: 'bu-1',
        responsiblePersonId: VIEWER_ID,
        accountablePersonId: VIEWER_ID,
        createdBy: VIEWER_ID,
      }))
      // GAP-6: after-create returns to the collection with ?highlight=<new id> (not the drawer).
      expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/work/tasks', search: '?highlight=new-task-id' })
    })
  })
})
