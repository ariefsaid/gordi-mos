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
  getPersonTeams: vi.fn(),
  getTeamsByIds: vi.fn(),
  getDownlinePersonIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))
vi.mock('@/lib/db/admin-access', () => ({ listTeamLeadAssignments: vi.fn() }))
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return { ...mod, useNavigate: vi.fn(() => mockNavigate) }
})

import { createTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople, getDownlinePersonIds } from '@/lib/db/directory'
import * as directoryApi from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { listTeamLeadAssignments } from '@/lib/db/admin-access'
// Re-homed from the deleted TaskCreate host onto the LIVE create surface (TaskSurface
// create mode, width="full" — identical to what the host rendered). AC-080 (prefills) +
// AC-081 (validation) now run against the real component.
import { TaskSurface } from '@/components/tasks/task-surface'

const mockCreateTask = vi.mocked(createTask)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)
const directoryMocks = directoryApi as unknown as {
  getPersonTeams: ReturnType<typeof vi.fn>
  getTeamsByIds: ReturnType<typeof vi.fn>
}
const mockGetPersonTeams = directoryMocks.getPersonTeams
const mockGetTeamsByIds = directoryMocks.getTeamsByIds
const mockListObjectives = vi.mocked(listObjectives)
const mockListWorkLines = vi.mocked(listWorkLines)

// ── Fixtures ───────────────────────────────────────────────────────────────
const VIEWER_ID = 'viewer-person-id'

const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Cahya Cafe',
  email: 'cahya@example.test', must_change_password: false, archived_at: null,
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
  viewer: { person: mockPerson, roles: [mockRole], isManager: false, accessRoles: [], affiliated: [] },
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
const mockTeams = [
  { id: 'team-cafe', name: 'Cafe Team', businessUnitId: 'bu-1', siteId: null, orgId: 'org', isPrimary: true },
  { id: 'team-sales', name: 'Sales Team', businessUnitId: 'bu-2', siteId: null, orgId: 'org', isPrimary: false },
]

function chooseCreateOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }))
  fireEvent.click(screen.getByRole('option', { name: option }))
}

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
  mockGetPersonTeams.mockResolvedValue(mockTeams)
  mockGetTeamsByIds.mockResolvedValue(mockTeams)
  vi.mocked(getDownlinePersonIds).mockResolvedValue([])
  mockListObjectives.mockResolvedValue([])
  mockListWorkLines.mockResolvedValue([])
  mockCreateTask.mockResolvedValue('new-task-id')
  mockNavigate.mockReset()
})

// ── AC-080: prefills on open ───────────────────────────────────────────────
describe('AC-080 — create form prefills', () => {
  it('PIC pre-fills to the creator, Supervisor starts empty (required), Team defaults to primary-role Team — all editable', async () => {
    renderCreate()

    await waitFor(() => {
      // Team defaults to the creator's primary Team; its BU is derived from the Team record.
      expect(screen.getByRole('combobox', { name: 'Team' })).toHaveTextContent('Cafe Team')
    })

    // PIC pre-fills to the creator.
    const picPicker = screen.getByRole('combobox', { name: 'PIC' })
    expect(picPicker).toHaveTextContent('Cahya Cafe')

    // Supervisor starts EMPTY — a deliberate v4 product decision (OD-REDESIGN-3/14/41,
    // task-surface.tsx accountablePersonId comment): PIC and Supervisor are distinct
    // accountable roles, and auto-collapsing Supervisor to the creator/PIC defeats that model.
    // CONTEXT.md's real resolution order (PIC's manager, etc.) needs a directory lookup this
    // surface doesn't have, so Supervisor is a required, explicit choice instead of a guess.
    const supervisorPicker = screen.getByRole('combobox', { name: 'Supervisor' })
    expect(supervisorPicker).toHaveTextContent(/select supervisor/i)

    // Team field is editable (not disabled)
    const teamPicker = screen.getByRole('combobox', { name: 'Team' })
    expect(teamPicker).not.toBeDisabled()

    // PIC and Supervisor fields are also not disabled
    expect(picPicker).not.toBeDisabled()
    expect(supervisorPicker).not.toBeDisabled()
  })

  it('AC-080 — PIC and Supervisor are changeable; chosen ids reach createTask', async () => {
    renderCreate()

    // Wait for the real directory-backed Pickers to load.
    await waitFor(() => screen.getByRole('combobox', { name: 'PIC' }))

    // Change PIC to "Other Person"
    chooseCreateOption('PIC', 'Other Person')
    expect(screen.getByRole('combobox', { name: 'PIC' })).toHaveTextContent('Other Person')

    // Change Supervisor to "Other Person" as well (may equal PIC — no constraint)
    chooseCreateOption('Supervisor', 'Other Person')
    expect(screen.getByRole('combobox', { name: 'Supervisor' })).toHaveTextContent('Other Person')

    // Submit the form with title filled
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Task with changed PIC/Supervisor' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Task with changed PIC/Supervisor',
        businessUnitId: 'bu-1',
        teamId: 'team-cafe',
        responsiblePersonId: 'other-id',
        accountablePersonId: 'other-id',
        createdBy: VIEWER_ID,
      }))
    })
  })
})

// ── #1029: Project/Process is shown directly; the Objective is derived, never picked ──
describe('create surface — Project/Process context and Supervisor default (#1029)', () => {
  const WORK_LINES = [
    { id: 'wl-1', name: 'Q4 Launch', type: 'project', objective_id: 'obj-1' },
    { id: 'wl-2', name: 'Daily Open', type: 'process', objective_id: null },
  ] as never

  it('shows Project/Process without a reveal and has no Objective picker', async () => {
    mockListObjectives.mockResolvedValue([{ id: 'obj-1', name: 'Grow retail revenue' } as never])
    mockListWorkLines.mockResolvedValue(WORK_LINES)
    renderCreate()
    expect(await screen.findByRole('combobox', { name: 'Project/Process' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add context/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/objective/i)).not.toBeInTheDocument()
  })

  it('the Project/Process comes after Due date in the field order', async () => {
    mockListWorkLines.mockResolvedValue(WORK_LINES)
    renderCreate()
    const project = await screen.findByRole('combobox', { name: 'Project/Process' })
    const due = screen.getByLabelText('Due date')
    expect(due.compareDocumentPosition(project) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('writes the Objective of the chosen Project/Process, and its Due date', async () => {
    mockListWorkLines.mockResolvedValue(WORK_LINES)
    renderCreate()
    await screen.findByRole('combobox', { name: 'Project/Process' })
    chooseCreateOption('Supervisor', 'Other Person')
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-11-05' } })
    chooseCreateOption('Project/Process', 'Q4 Launch (Project)')
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Derived objective' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
      workLineId: 'wl-1', objectiveId: 'obj-1', dueDate: '2026-11-05',
    })))
  })

  it('a Project/Process with no Objective writes no Objective', async () => {
    mockListWorkLines.mockResolvedValue(WORK_LINES)
    renderCreate()
    await screen.findByRole('combobox', { name: 'Project/Process' })
    chooseCreateOption('Supervisor', 'Other Person')
    chooseCreateOption('Project/Process', 'Daily Open (Daily / ongoing)')
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'No objective' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
      workLineId: 'wl-2', objectiveId: null,
    })))
  })

  it('an admin creator gets the home Team lead as Supervisor, PIC stays self', async () => {
    mockListWorkLines.mockResolvedValue([])
    vi.mocked(listTeamLeadAssignments).mockResolvedValue([
      { team_id: 'team-cafe', team_name: 'Cafe Team', business_unit_id: 'bu-1', lead_person_id: 'other-id', lead_name: 'Other Person' },
    ])
    renderCreate({ ...authedState, viewer: { ...authedState.viewer, accessRoles: ['admin'] } })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Supervisor' })).toHaveTextContent('Other Person'))
    expect(screen.getByRole('combobox', { name: 'PIC' })).toHaveTextContent('Cahya Cafe')
  })

  it('a non-admin creator keeps an empty Supervisor and never reads Team leads', async () => {
    renderCreate()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Team' })).toHaveTextContent('Cafe Team'))
    expect(screen.getByRole('combobox', { name: 'Supervisor' })).toHaveTextContent(/select supervisor/i)
    expect(listTeamLeadAssignments).not.toHaveBeenCalled()
  })
})

// ── AC-081: validation blocks empty title / BU ─────────────────────────────
describe('AC-081 — create form validation', () => {
  it('blocks submit with empty title; shows field-level message; createTask NOT called', async () => {
    renderCreate()
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))

    // Satisfy the other required fields so this test isolates the title error.
    chooseCreateOption('Supervisor', 'Cahya Cafe')
    const submitBtn = screen.getByRole('button', { name: /create task/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/title is required/i)).toBeTruthy()
    })
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  // AUTHORED HERE (#192, DD-WAY-21): v4 made Supervisor a required field (task-surface.tsx
  // accountablePersonId comment, OD-REDESIGN-3/14/41 — see AC-080) but shipped no test proving
  // the submit-blocking half of that contract, only the "starts empty" half. Title and Team both
  // have this coverage already; Supervisor didn't.
  it('blocks submit when Supervisor is left empty; shows field-level message; createTask NOT called', async () => {
    renderCreate()
    await waitFor(() => screen.getByLabelText(/title/i))

    // Title and Team are both satisfied (BU pre-fills); only Supervisor is missing.
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Task missing supervisor' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    await waitFor(() => {
      expect(screen.getByText(/supervisor is required/i)).toBeTruthy()
    })
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  it('blocks submit when Team is cleared; shows field-level message', async () => {
    // A person with no effective Team membership starts with no Team choice.
    const noRoleState: AuthState = {
      status: 'authenticated',
      viewer: {
        person: mockPerson,
        roles: [],  // no roles → primaryRoleBU = ''
        isManager: false,
        accessRoles: [],
        affiliated: [],
      },
      signOut: async () => {},
    }
    mockGetPersonTeams.mockResolvedValueOnce([])
    renderCreate(noRoleState)
    await waitFor(() => screen.getByRole('combobox', { name: 'Team' }))

    // Fill title and Supervisor; Team remains empty.
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My task' } })
    chooseCreateOption('Supervisor', 'Cahya Cafe')
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
    // The Team supplies the derived BU. Supervisor starts empty and is required, so choose it
    // explicitly for a valid submit.
    chooseCreateOption('Supervisor', 'Cahya Cafe')
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'New Task Alpha',
        businessUnitId: 'bu-1',
        teamId: 'team-cafe',
        responsiblePersonId: VIEWER_ID,
        accountablePersonId: VIEWER_ID,
        createdBy: VIEWER_ID,
      }))
      // GAP-6: after-create returns to the collection with ?highlight=<new id> (not the drawer).
      expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/work/tasks', search: '?highlight=new-task-id' })
    })
  })
})
