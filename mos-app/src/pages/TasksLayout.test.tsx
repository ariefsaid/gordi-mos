import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { AuthState } from '../auth/context'
import { AuthContext } from '../auth/context'
import type { PeopleRow, RolesRow } from '../lib/database.types'
import type { TaskListRow } from '../lib/db/tasks.types'

// ── Mock the data layer (table + drawer both pull from it) ────────────────────
vi.mock('../lib/db/tasks', () => ({
  listTasks: vi.fn(),
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
vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))

import { listTasks, getTask, updateTaskStatus } from '../lib/db/tasks'
import { getBusinessUnits, getPeople } from '../lib/db/directory'
import TasksLayout from './TasksLayout'
import TaskDrawer from '../components/tasks/TaskDrawer'

const mockListTasks = vi.mocked(listTasks)
const mockGetTask = vi.mocked(getTask)
const mockUpdateTaskStatus = vi.mocked(updateTaskStatus)

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

const VIEWER_ID = 'viewer-person-id'
const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Arief Said',
  email: 'arief@gordi.id', archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const mockRole: RolesRow = {
  id: 'role-1', org_id: 'org', business_unit_id: 'bu-1', name: 'CEO',
  reports_to_role_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: mockPerson, roles: [mockRole], isManager: false },
  signOut: async () => {},
}

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Default task',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, last_activity_at: '2026-06-11T10:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

const BUS = [{ id: 'bu-1', name: 'Kitchen' }]
const PEOPLE = [{ id: VIEWER_ID, full_name: 'Arief Said' }]

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  stubMatchMedia(true)
  vi.mocked(getBusinessUnits).mockResolvedValue(BUS)
  vi.mocked(getPeople).mockResolvedValue(PEOPLE)
})

function renderAt(path: string) {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tasks" element={<TasksLayout />}>
            <Route path="new" element={<TaskDrawer mode="create" />} />
            <Route path=":taskId" element={<TaskDrawer mode="view" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('TasksLayout — split-view shell (ADR-0007, PR-B)', () => {
  it('AC-100: at /tasks the table renders and no drawer is present (nodrawer)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Triage me' })])
    renderAt('/tasks')
    await waitFor(() => screen.getByText('Triage me'))
    expect(screen.queryByRole('complementary', { name: /task detail/i })).toBeNull()
    expect(document.querySelector('.split.nodrawer')).toBeTruthy()
  })

  it('AC-101: at /tasks/:id the table STAYS mounted and the drawer renders beside it', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Triage me' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Triage me' }), checklist: [], events: [] })
    renderAt('/tasks/task-1')
    await waitFor(() => screen.getByRole('complementary', { name: /task detail/i }))
    // table still present
    expect(document.querySelector('tbody tr.task-row')).toBeTruthy()
    expect(document.querySelector('.split.nodrawer')).toBeNull()
  })

  it('AC-101: the open task row carries aria-current and the selected style', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' }), makeTask({ id: 'task-2', title: 'Other' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open one' }), checklist: [], events: [] })
    renderAt('/tasks/task-1')
    await waitFor(() => expect(document.querySelector('tr.task-row.row-selected')).toBeTruthy())
    const selectedRow = document.querySelector('tr.task-row.row-selected')
    expect(selectedRow).toBeTruthy()
    expect(selectedRow?.getAttribute('aria-current')).toBe('true')
    expect(selectedRow?.textContent).toContain('Open one')
  })

  it('AC-103: an optimistic status change in the drawer is reflected in the table row', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one', status: 'Open' })])
    mockGetTask
      .mockResolvedValueOnce({ task: makeTask({ id: 'task-1', title: 'Open one', status: 'Open' }), checklist: [], events: [] })
      .mockResolvedValueOnce({ task: makeTask({ id: 'task-1', title: 'Open one', status: 'Blocked' }), checklist: [], events: [] })
    mockUpdateTaskStatus.mockResolvedValue()
    renderAt('/tasks/task-1')
    await waitFor(() => expect(document.querySelector('tr.task-row.row-selected')).toBeTruthy())
    // table row shows the Open status pill initially
    const row = () => document.querySelector('tr.task-row.row-selected')
    expect(row()?.querySelector('.pill')?.textContent).toContain('Open')
    // change status in the drawer header (scope to the status popover listbox,
    // not the toolbar Status <select> which also has a "Blocked" option)
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    const listbox = screen.getByRole('listbox', { name: /select status/i })
    fireEvent.click(within(listbox).getByRole('option', { name: 'Blocked' }))
    await waitFor(() => {
      const pill = row()?.querySelector('.pill')
      expect(pill?.textContent).toContain('Blocked')
    })
  })

  it('AC-113: with the drawer open the Activity column is dropped; Task + Status remain; aria-sort intact', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    mockGetTask.mockResolvedValue({ task: makeTask({ id: 'task-1', title: 'Open one' }), checklist: [], events: [] })
    renderAt('/tasks/task-1')
    await waitFor(() => expect(document.querySelector('tr.task-row.row-selected')).toBeTruthy())
    expect(screen.queryByRole('columnheader', { name: /activity/i })).toBeNull()
    expect(screen.getByRole('columnheader', { name: /^task/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument()
    // sortable Due header keeps aria-sort
    expect(screen.getByRole('columnheader', { name: /due/i }).getAttribute('aria-sort')).toBe('ascending')
  })

  it('AC-113: at /tasks (no drawer) the Activity column is present (not condensed)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    renderAt('/tasks')
    await waitFor(() => screen.getByText('Open one'))
    expect(screen.getByRole('columnheader', { name: /activity/i })).toBeInTheDocument()
  })

  it('AC-107: /tasks/new renders the create drawer beside the table', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Open one' })])
    renderAt('/tasks/new')
    await waitFor(() => screen.getByRole('complementary', { name: /new task/i }))
    expect(document.querySelector('tbody tr.task-row')).toBeTruthy()
  })
})
