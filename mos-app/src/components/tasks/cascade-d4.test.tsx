/**
 * Cascade D4 — Objective + Work-line pickers (create form + detail edit).
 * Spec: docs/specs/cascade-foundation.spec.md NFR-206; ADR-0014.
 *
 * AC coverage:
 *   FR-241: create form shows Work-line select with "— None —" + all options
 *   FR-242: create form shows Objective select with "— None —" + all options
 *   FR-243: selecting work-line / objective passes them into createTask input
 *   FR-244: leaving "— None —" selected omits / nulls the fields in createTask
 *   FR-245: detail edit — changing Work-line select calls updateTaskFields with work_line_id
 *   FR-246: clearing Work-line select (back to "— None —") calls updateTaskFields with null
 *   FR-247: detail edit — changing Objective calls updateTaskFields with objective_id
 *   FR-248: clearing Objective calls updateTaskFields with null
 *   FR-249: detail shows "—" when work_line_id / objective_id is null (read-only)
 *   FR-250: lookups load non-blocking — form is usable before they resolve
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { TaskSurface } from './task-surface'

// ── Mock data layer ──────────────────────────────────────────────────────────
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
vi.mock('../../lib/db/objectives', () => ({
  listObjectives: vi.fn(),
}))
vi.mock('../../lib/db/work-lines', () => ({
  listWorkLines: vi.fn(),
}))

import { getTask, createTask, updateTaskFields } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'

const mockGetTask = vi.mocked(getTask)
const mockCreateTask = vi.mocked(createTask)
const mockUpdateTaskFields = vi.mocked(updateTaskFields)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)
const mockListObjectives = vi.mocked(listObjectives)
const mockListWorkLines = vi.mocked(listWorkLines)

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

const mockBUs: BusinessUnitOption[] = [{ id: 'bu-1', name: 'Cafe Operations' }]
const mockPeople: PersonOption[] = [
  { id: VIEWER_ID, full_name: 'Cahya Cafe' },
  { id: 'other-id', full_name: 'Other Person' },
]
const OBJECTIVES = [
  { id: 'obj-1', name: 'Grow direct orders' },
  { id: 'obj-2', name: 'Launch autumn menu' },
]
const WORK_LINES = [
  { id: 'wl-1', name: 'Daily IG Content', type: 'process' as const },
  { id: 'wl-2', name: 'New Menu Design', type: 'project' as const },
]

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-abc', org_id: 'org', title: 'Fix the coffee machine',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null,
    objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T08:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

// mockCreateTask must resolve so navigation fires; mock it in beforeEach
// (vi.resetAllMocks() in beforeEach wipes factory-level resolvedValues set in the
// module body, so we must re-set them in beforeEach).
beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  mockGetBusinessUnits.mockResolvedValue(mockBUs)
  mockGetPeople.mockResolvedValue(mockPeople)
  mockListObjectives.mockResolvedValue(OBJECTIVES)
  mockListWorkLines.mockResolvedValue(WORK_LINES)
  mockCreateTask.mockResolvedValue('new-task-id')
  mockUpdateTaskFields.mockResolvedValue(undefined)
})

// ── Helpers ──────────────────────────────────────────────────────────────────
function renderCreate() {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={['/tasks/new']}>
        <TaskSurface taskId={null} mode="create" width="full" onClose={vi.fn()} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

function renderView(taskOverrides: Partial<TaskListRow> = {}) {
  const task = makeTask(taskOverrides)
  mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={['/tasks/task-abc']}>
        <TaskSurface taskId="task-abc" mode="view" width="full" />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// ═══════════════════════════════════════════════════════════════════════
// CREATE FORM
// ═══════════════════════════════════════════════════════════════════════

describe('FR-241/242 — create form shows Work-line and Objective selects', () => {
  it('FR-241: shows a Work-line select with "— None —" as the first option', async () => {
    renderCreate()
    // The form is usable before lookups arrive (non-blocking); wait for the form title
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    // Work-line options load asynchronously — wait for them
    const wlSelect = await screen.findByRole('combobox', { name: /work-line/i })
    expect(wlSelect).toBeInTheDocument()
    const options = Array.from(wlSelect.querySelectorAll('option')).map(o => o.textContent ?? '')
    expect(options[0]).toBe('— None —')
    // Fix-6: options now include a (project)/(daily) type cue; match by name substring.
    expect(options.some(o => o.includes('Daily IG Content'))).toBe(true)
    expect(options.some(o => o.includes('New Menu Design'))).toBe(true)
  })

  it('FR-242: shows an Objective select with "— None —" as the first option', async () => {
    renderCreate()
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    const objSelect = await screen.findByRole('combobox', { name: /objective/i })
    expect(objSelect).toBeInTheDocument()
    const options = Array.from(objSelect.querySelectorAll('option')).map(o => o.textContent)
    expect(options[0]).toBe('— None —')
    expect(options).toContain('Grow direct orders')
    expect(options).toContain('Launch autumn menu')
  })

  it('FR-250: the create form is usable (shows BU/R/A) before Work-line/Objective lookups resolve', async () => {
    // Make lookups never resolve — form should still be functional (non-blocking)
    mockListObjectives.mockReturnValue(new Promise(() => {}))
    mockListWorkLines.mockReturnValue(new Promise(() => {}))
    renderCreate()
    // BU select should be available as soon as the blocking directory loads
    await waitFor(() => screen.getByLabelText(/business unit/i))
    expect(screen.getByRole('button', { name: /create task/i })).toBeInTheDocument()
  })
})

describe('FR-243 — selecting a Work-line/Objective passes them to createTask', () => {
  it('FR-243a: selecting a Work-line passes its id as workLineId in createTask', async () => {
    renderCreate()
    await waitFor(() => screen.getByLabelText(/title/i))
    // Fill required fields
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Task with work line' } })
    // Select a work-line
    const wlSelect = await screen.findByRole('combobox', { name: /work-line/i })
    fireEvent.change(wlSelect, { target: { value: 'wl-1' } })
    // Submit
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ workLineId: 'wl-1' }),
      )
    })
  })

  it('FR-243b: selecting an Objective passes its id as objectiveId in createTask', async () => {
    renderCreate()
    await waitFor(() => screen.getByLabelText(/title/i))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Task with objective' } })
    const objSelect = await screen.findByRole('combobox', { name: /objective/i })
    fireEvent.change(objSelect, { target: { value: 'obj-2' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ objectiveId: 'obj-2' }),
      )
    })
  })
})

describe('FR-244 — leaving "— None —" omits/nulls the fields in createTask', () => {
  it('FR-244a: Work-line left at "— None —" → workLineId is null or undefined in createTask', async () => {
    renderCreate()
    await waitFor(() => screen.getByLabelText(/title/i))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'No work line task' } })
    // Do not change work-line — leave at "— None —"
    await screen.findByRole('combobox', { name: /work-line/i }) // wait for it to render
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled())
    const call = mockCreateTask.mock.calls[0][0]
    // empty string → null conversion: workLineId should be null or absent
    const wl = call.workLineId
    expect(wl === null || wl === undefined || wl === '').toBeTruthy()
  })

  it('FR-244b: Objective left at "— None —" → objectiveId is null or undefined in createTask', async () => {
    renderCreate()
    await waitFor(() => screen.getByLabelText(/title/i))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'No objective task' } })
    await screen.findByRole('combobox', { name: /objective/i })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled())
    const call = mockCreateTask.mock.calls[0][0]
    const obj = call.objectiveId
    expect(obj === null || obj === undefined || obj === '').toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// DETAIL EDIT (view mode — RecordDetailsPanel)
// ═══════════════════════════════════════════════════════════════════════

describe('FR-245/246 — detail edit: Work-line inline select', () => {
  it('FR-245: changing the Work-line select calls updateTaskFields with { work_line_id }', async () => {
    renderView()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    const wlSelect = await screen.findByRole('combobox', { name: /work-line/i })
    fireEvent.change(wlSelect, { target: { value: 'wl-2' } })
    await waitFor(() => {
      expect(mockUpdateTaskFields).toHaveBeenCalledWith(
        'task-abc',
        expect.objectContaining({ work_line_id: 'wl-2' }),
        VIEWER_ID,
      )
    })
  })

  it('FR-246: clearing Work-line (back to "— None —") calls updateTaskFields with { work_line_id: null }', async () => {
    renderView({ work_line_id: 'wl-1' })
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    const wlSelect = await screen.findByRole('combobox', { name: /work-line/i })
    // Clear it
    fireEvent.change(wlSelect, { target: { value: '' } })
    await waitFor(() => {
      expect(mockUpdateTaskFields).toHaveBeenCalledWith(
        'task-abc',
        expect.objectContaining({ work_line_id: null }),
        VIEWER_ID,
      )
    })
  })
})

describe('FR-247/248 — detail edit: Objective inline select', () => {
  it('FR-247: changing the Objective select calls updateTaskFields with { objective_id }', async () => {
    renderView()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    const objSelect = await screen.findByRole('combobox', { name: /objective/i })
    fireEvent.change(objSelect, { target: { value: 'obj-1' } })
    await waitFor(() => {
      expect(mockUpdateTaskFields).toHaveBeenCalledWith(
        'task-abc',
        expect.objectContaining({ objective_id: 'obj-1' }),
        VIEWER_ID,
      )
    })
  })

  it('FR-248: clearing Objective calls updateTaskFields with { objective_id: null }', async () => {
    renderView({ objective_id: 'obj-2' })
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    const objSelect = await screen.findByRole('combobox', { name: /objective/i })
    fireEvent.change(objSelect, { target: { value: '' } })
    await waitFor(() => {
      expect(mockUpdateTaskFields).toHaveBeenCalledWith(
        'task-abc',
        expect.objectContaining({ objective_id: null }),
        VIEWER_ID,
      )
    })
  })
})

describe('FR-249 — detail panel shows "—" when both fields are null (read-only)', () => {
  it('FR-249: read-only viewer sees "—" for null work_line_id and null objective_id', async () => {
    // A non-editor viewer (task owned by someone else) gets read-only text fields.
    const task = makeTask({ work_line_id: null, objective_id: null,
      responsible_person_id: 'other-id', accountable_person_id: 'other-id' })
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/task-abc']}>
          <TaskSurface taskId="task-abc" mode="view" width="full" />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    // With lookups loaded but no id set, read-only path shows "—" for each field
    // Also Due date is null so there's at least one "—" from that
    const dashes = screen.getAllByText('—')
    // At minimum: work-line "—", objective "—", due date "—" = 3
    expect(dashes.length).toBeGreaterThanOrEqual(3)
  })
})
