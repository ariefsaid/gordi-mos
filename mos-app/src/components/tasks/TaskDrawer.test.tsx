import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { AuthState } from '../../auth/context'
import { AuthContext } from '../../auth/context'
import type { PeopleRow, RolesRow } from '../../lib/database.types'
import type { TaskListRow } from '../../lib/db/tasks.types'

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

import { getTask } from '../../lib/db/tasks'
import { getBusinessUnits, getPeople } from '../../lib/db/directory'
import TaskDrawer from './TaskDrawer'
import { __resetExpandPrefForTests } from './useExpandPref'

const mockGetTask = vi.mocked(getTask)
const VIEWER_ID = 'viewer-person-id'

const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Cahya Cafe',
  email: 'cahya@gordi.id', archived_at: null,
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
    id: 'task-abc', org_id: 'org', title: 'Fix the coffee machine',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: 'desc', due_date: '2026-06-20', last_activity_at: '2026-06-11T08:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  __resetExpandPrefForTests()
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Cafe Operations' }])
  vi.mocked(getPeople).mockResolvedValue([{ id: VIEWER_ID, full_name: 'Cahya Cafe' }])
})

function renderAt(path: string, mode: 'view' | 'create' = 'view') {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tasks/new" element={<TaskDrawer mode="create" />} />
          <Route path="/tasks/:taskId" element={<TaskDrawer mode={mode} />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('TaskDrawer (AC-101, AC-102)', () => {
  it('AC-101/102: reads :taskId and renders TaskSurface inside an aside labelled "Task detail"', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/tasks/task-abc')
    const aside = await screen.findByRole('complementary', { name: /task detail/i })
    await waitFor(() => expect(aside).toHaveTextContent('Fix the coffee machine'))
  })

  it('create mode renders an aside labelled "New task"', async () => {
    renderAt('/tasks/new', 'create')
    expect(await screen.findByRole('complementary', { name: /new task/i })).toBeInTheDocument()
  })

  it('AC-104/105: when the expand pref is persisted true, the surface renders full width', async () => {
    localStorage.setItem('mos.tasks.expandDefault', 'true')
    __resetExpandPrefForTests() // sync the shared snapshot to the freshly-set storage
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/tasks/task-abc')
    await waitFor(() => expect(document.querySelector('.dw-surface-expanded')).toBeTruthy())
    expect(document.querySelector('.drawer.expanded')).toBeTruthy()
  })

  it('AC-104: toggling expand persists the preference and flips the surface width', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/tasks/task-abc')
    await screen.findByText('Fix the coffee machine')
    expect(document.querySelector('.dw-surface-expanded')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /expand to full width/i }))
    await waitFor(() => expect(document.querySelector('.dw-surface-expanded')).toBeTruthy())
    expect(localStorage.getItem('mos.tasks.expandDefault')).toBe('true')
  })
})
