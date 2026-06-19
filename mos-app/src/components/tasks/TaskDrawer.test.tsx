import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'

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

import { getTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import TaskDrawer from './TaskDrawer'
import { __resetExpandPrefForTests } from './useExpandPref'

const mockGetTask = vi.mocked(getTask)
const VIEWER_ID = 'viewer-person-id'

// Width-regime stub: control which width queries match (1100 split / 920 band / 768 desktop).
function stubWidths({ split, band, desktop }: { split: boolean; band?: boolean; desktop?: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      let matches = false
      if (query.includes('1100')) matches = split
      else if (query.includes('920')) matches = band ?? false
      else if (query.includes('768')) matches = desktop ?? true
      return {
        matches, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }
    },
  })
}

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
  stubWidths({ split: true, desktop: true }) // default: the ≥1100px non-modal split regime
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Cafe Operations' }])
  vi.mocked(getPeople).mockResolvedValue([{ id: VIEWER_ID, full_name: 'Cahya Cafe' }])
})

function renderAt(path: string, mode: 'view' | 'create' = 'view') {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tasks" element={<div data-testid="list-here">Tasks list</div>} />
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

describe('TaskDrawer — focus regime (AC-110)', () => {
  it('AC-110: ≥1100px split renders a non-modal aside (no role=dialog, no aria-modal, no scrim)', async () => {
    stubWidths({ split: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/tasks/task-abc')
    const aside = await screen.findByRole('complementary', { name: /task detail/i })
    expect(aside.getAttribute('role')).toBeNull()         // it IS an <aside>, not a dialog
    expect(aside.getAttribute('aria-modal')).toBeNull()
    expect(document.querySelector('.drawer-scrim')).toBeNull()
  })

  it('AC-110: <1100px renders role=dialog + aria-modal + a scrim', async () => {
    stubWidths({ split: false, band: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/tasks/task-abc')
    const dialog = await screen.findByRole('dialog', { name: /task detail/i })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.querySelector('.drawer-scrim')).toBeTruthy()
  })

  it('AC-110: in the modal regime, clicking the scrim closes the drawer (→ /tasks)', async () => {
    stubWidths({ split: false, band: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/tasks/task-abc')
    await screen.findByRole('dialog', { name: /task detail/i })
    fireEvent.click(document.querySelector('.drawer-scrim')!)
    await waitFor(() => expect(screen.getByTestId('list-here')).toBeInTheDocument())
  })

  it('AC-110: in the modal regime, Esc closes the drawer', async () => {
    stubWidths({ split: false, band: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/tasks/task-abc')
    const dialog = await screen.findByRole('dialog', { name: /task detail/i })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.getByTestId('list-here')).toBeInTheDocument())
  })

  it('AC-110 (overlay band 920–1100): renders the modal as a right-side sheet (drawer-sheet, not full-screen)', async () => {
    stubWidths({ split: false, band: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/tasks/task-abc')
    await screen.findByRole('dialog', { name: /task detail/i })
    expect(document.querySelector('.drawer-modal.drawer-sheet')).toBeTruthy()
    expect(document.querySelector('.drawer-modal.drawer-fullscreen')).toBeNull()
  })

  it('AC-110 (mobile <768): renders the modal full-screen', async () => {
    stubWidths({ split: false, band: false, desktop: false })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/tasks/task-abc')
    await screen.findByRole('dialog', { name: /task detail/i })
    expect(document.querySelector('.drawer-modal.drawer-fullscreen')).toBeTruthy()
    expect(document.querySelector('.drawer-modal.drawer-sheet')).toBeNull()
  })
})
