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
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return { ...mod, useNavigate: vi.fn(() => mockNavigate) }
})

import { createTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
// Re-homed from the deleted TaskCreate host onto the LIVE create surface (TaskSurface
// create mode, width="full" — identical to what the host rendered). AC-080 (prefills) +
// AC-081 (validation) now run against the real component.
import { TaskSurface } from '@/components/tasks/TaskSurface'

const mockCreateTask = vi.mocked(createTask)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)

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
  viewer: { person: mockPerson, roles: [mockRole], isManager: false },
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
  mockCreateTask.mockResolvedValue('new-task-id')
  mockNavigate.mockReset()
})

// ── AC-080: prefills on open ───────────────────────────────────────────────
describe('AC-080 — create form prefills', () => {
  it('R and A pre-fill to creator; BU defaults to primary-role BU, all editable', async () => {
    renderCreate()

    await waitFor(() => {
      // BU defaults to the creator's primary-role BU (bu-1 = "Cafe Operations")
      const buSelect = screen.getByLabelText(/business unit/i) as HTMLSelectElement
      expect(buSelect.value).toBe('bu-1')
    })

    // R and A selects are present and pre-filled to creator
    const rSelect = screen.getByLabelText(/^responsible \(r\)/i) as HTMLSelectElement
    expect(rSelect.value).toBe(VIEWER_ID)

    const aSelect = screen.getByLabelText(/^accountable \(a\)/i) as HTMLSelectElement
    expect(aSelect.value).toBe(VIEWER_ID)

    // BU field is editable (not disabled)
    const buSelect = screen.getByLabelText(/business unit/i)
    expect(buSelect).not.toBeDisabled()

    // R and A fields are also not disabled
    expect(rSelect).not.toBeDisabled()
    expect(aSelect).not.toBeDisabled()
  })

  it('AC-080 — R and A are changeable; chosen ids reach createTask', async () => {
    renderCreate()

    // Wait for directory to load
    await waitFor(() => screen.getByLabelText(/^responsible \(r\)/i))

    // Change R to "Other Person"
    const rSelect = screen.getByLabelText(/^responsible \(r\)/i) as HTMLSelectElement
    fireEvent.change(rSelect, { target: { value: 'other-id' } })
    expect(rSelect.value).toBe('other-id')

    // Change A to "Other Person" as well (A may equal R — no constraint)
    const aSelect = screen.getByLabelText(/^accountable \(a\)/i) as HTMLSelectElement
    fireEvent.change(aSelect, { target: { value: 'other-id' } })
    expect(aSelect.value).toBe('other-id')

    // Submit the form with title filled
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Task with changed R/A' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Task with changed R/A',
        responsiblePersonId: 'other-id',
        accountablePersonId: 'other-id',
        createdBy: VIEWER_ID,
      }))
    })
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

  it('blocks submit when BU is cleared; shows field-level message', async () => {
    // Use a state with NO roles (so primaryRoleBU = '') to ensure BU starts empty
    const noRoleState: AuthState = {
      status: 'authenticated',
      viewer: {
        person: mockPerson,
        roles: [],  // no roles → primaryRoleBU = ''
        isManager: false,
      },
      signOut: async () => {},
    }
    renderCreate(noRoleState)
    await waitFor(() => screen.getByLabelText(/business unit/i))

    // Fill title only; BU left empty (no default with no roles)
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My task' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    await waitFor(() => {
      expect(screen.getByText(/business unit is required/i)).toBeTruthy()
    })
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  it('on valid submit: calls createTask with correct payload and navigates to detail', async () => {
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
      expect(mockNavigate).toHaveBeenCalledWith('/tasks/new-task-id')
    })
  })
})
