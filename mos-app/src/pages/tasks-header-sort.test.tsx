// Real-page oracle for Tasks table header sorting (issue #998): header clicks, the toolbar Sort
// picker and the URL must agree, row order follows, and the header semantics (aria-sort, arrow,
// keyboard) hold — identical before and after the header sort moved onto TanStack sort state.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { OverlayHostProvider } from '@/shell/overlay-host'
import type { PeopleRow, RolesRow } from '@/lib/database.types'

vi.mock('../lib/db/tasks', () => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
}))
vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
  getPersonTeams: vi.fn().mockResolvedValue([]),
  getTeamsByIds: vi.fn().mockResolvedValue([]),
  listRoleNames: vi.fn(),
  getDownlinePersonIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))
vi.mock('../lib/db/signals', () => ({}))
vi.mock('../lib/db/processes', () => ({
  canStartProcessForTeam: vi.fn(),
  listDueRuns: vi.fn(),
  startRun: vi.fn(),
  listRunRollups: vi.fn(),
  listPendingTasks: vi.fn(),
  resolvePendingTask: vi.fn(),
  listTaskDefs: vi.fn(),
}))

import { listTasks, getTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople, listRoleNames } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { canStartProcessForTeam, listDueRuns, listRunRollups, listPendingTasks, listTaskDefs } from '@/lib/db/processes'
import { TasksWorkspace } from '@/components/tasks/tasks-workspace'

const mockListTasks = vi.mocked(listTasks)
const mockGetTask = vi.mocked(getTask)

function stubDesktop() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

const VIEWER_ID = 'viewer-person-id'
const P_BUDI = 'budi-person-id'
const P_SARI = 'sari-person-id'
const P_IMAN = 'iman-person-id'

const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Arief Said',
  email: 'arief@example.test', must_change_password: false, archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
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

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Default task',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID,
    accountable_person_id: VIEWER_ID,
    consulted_person_ids: [],
    informed_person_ids: [],
    description: null, due_date: null,
    objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T10:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z',
    updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

// Every sort key orders these four differently (PIC names: Arief Said < Budi Setiawan < Iman
// Observer < Sari Support).
const FOUR_TASKS: TaskListRow[] = [
  makeTask({ id: 't-bravo', title: 'Bravo', status: 'Open', responsible_person_id: P_SARI, due_date: '2030-01-10' }),
  makeTask({ id: 't-alpha', title: 'Alpha', status: 'Blocked', responsible_person_id: P_IMAN, due_date: '2030-03-01' }),
  makeTask({ id: 't-delta', title: 'Delta', status: 'In Progress', responsible_person_id: VIEWER_ID, due_date: null }),
  makeTask({ id: 't-charlie', title: 'Charlie', status: 'Done', responsible_person_id: P_BUDI, due_date: '2030-02-01' }),
]

const PEOPLE = [
  { id: VIEWER_ID, full_name: 'Arief Said' },
  { id: P_BUDI, full_name: 'Budi Setiawan' },
  { id: P_SARI, full_name: 'Sari Support' },
  { id: P_IMAN, full_name: 'Iman Observer' },
]

let capturedLocation: ReturnType<typeof useLocation> | null = null
function LocationCapture() {
  capturedLocation = useLocation()
  return null
}
const urlParams = () => new URLSearchParams(capturedLocation?.search ?? '')

function renderPage(initialUrl = '/work/tasks') {
  capturedLocation = null
  function Harness() {
    const [savedView] = useState<React.ComponentProps<typeof TasksWorkspace>['savedView']>(
      { view: 'all', activeChip: null, segment: 'all', overdueOnly: false, search: '' },
    )
    return (
      <>
        <TasksWorkspace savedView={savedView} onSavedViewChange={() => {}} />
        <LocationCapture />
      </>
    )
  }
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <OverlayHostProvider>
          <Harness />
        </OverlayHostProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const th = (cls: string) => document.querySelector(`th.${cls}`) as HTMLTableCellElement
const headerButton = (cls: string) => th(cls).querySelector('button') as HTMLButtonElement
const clickHeader = (cls: string) => fireEvent.click(headerButton(cls))
const ariaSorts = () => ({
  task: th('th-task').getAttribute('aria-sort'),
  status: th('th-status').getAttribute('aria-sort'),
  owner: th('th-owner').getAttribute('aria-sort'),
  due: th('th-due').getAttribute('aria-sort'),
})
const titles = () => Array.from(document.querySelectorAll('tbody tr.task-row a.task-row-link'))
  .map((a) => a.getAttribute('title'))

// The toolbar's Sort picker (opens the shared controls door when it is collapsed).
function sortPicker() {
  const door = screen.queryByRole('button', { name: /^view & filters/i })
  if (door?.getAttribute('aria-expanded') === 'false') fireEvent.click(door)
  return within(screen.getByRole('group', { name: /view & filters/i })).getByRole('combobox', { name: /^sort$/i })
}
function chooseToolbarSort(label: string) {
  fireEvent.click(sortPicker())
  fireEvent.click(screen.getByRole('option', { name: label }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListTasks.mockReset()
  stubDesktop()
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Kitchen' }] as never)
  vi.mocked(getPeople).mockResolvedValue(PEOPLE as never)
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(listWorkLines).mockResolvedValue([])
  mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
  vi.mocked(listDueRuns).mockResolvedValue([])
  vi.mocked(canStartProcessForTeam).mockResolvedValue(false)
  vi.mocked(listRunRollups).mockResolvedValue([])
  vi.mocked(listPendingTasks).mockResolvedValue([])
  vi.mocked(listTaskDefs).mockResolvedValue([])
  vi.mocked(listRoleNames).mockResolvedValue([])
  mockListTasks.mockResolvedValue(FOUR_TASKS)
})

async function ready() {
  await waitFor(() => expect(titles().length).toBeGreaterThan(0))
}

describe('Tasks header sort — click cycle', () => {
  it('first paint: Due is the ascending sorted header, the other sort headers are none, Supervisor has no aria-sort', async () => {
    renderPage()
    await ready()
    expect(ariaSorts()).toEqual({ task: 'none', status: 'none', owner: 'none', due: 'ascending' })
    expect(th('th-supervisor').hasAttribute('aria-sort')).toBe(false)
    expect(th('th-supervisor').querySelector('button')).toBeNull()
    expect(document.querySelectorAll('th.th-sorted')).toHaveLength(1)
    expect(th('th-due').classList.contains('th-sorted')).toBe(true)
    expect(titles()).toEqual(['Bravo', 'Alpha', 'Delta', 'Charlie'])
  })

  it('the same header twice: up arrow then down arrow, aria-sort ascending then descending, never a third state', async () => {
    renderPage()
    await ready()
    const arrow = () => th('th-due').querySelector('.collection-grammar-sort-indicator')
    expect(arrow()?.textContent).toBe('↑')
    expect(arrow()?.getAttribute('aria-hidden')).toBe('true')

    clickHeader('th-due')
    await waitFor(() => expect(th('th-due').getAttribute('aria-sort')).toBe('descending'))
    expect(arrow()?.textContent).toBe('↓')
    expect(titles()).toEqual(['Delta', 'Alpha', 'Bravo', 'Charlie'])

    clickHeader('th-due')
    await waitFor(() => expect(th('th-due').getAttribute('aria-sort')).toBe('ascending'))
    expect(arrow()?.textContent).toBe('↑')
    expect(titles()).toEqual(['Bravo', 'Alpha', 'Delta', 'Charlie'])

    clickHeader('th-due')
    await waitFor(() => expect(th('th-due').getAttribute('aria-sort')).toBe('descending'))
    expect(document.querySelectorAll('.collection-grammar-sort-indicator')).toHaveLength(1)
  })

  it('a new column starts ascending; URL omits sort=due and dir=ascending, writes the rest', async () => {
    renderPage()
    await ready()
    expect(urlParams().has('sort')).toBe(false)
    expect(urlParams().has('dir')).toBe(false)

    clickHeader('th-due')
    await waitFor(() => expect(urlParams().get('dir')).toBe('descending'))
    expect(urlParams().has('sort')).toBe(false)

    clickHeader('th-task')
    await waitFor(() => expect(urlParams().get('sort')).toBe('task'))
    expect(urlParams().has('dir')).toBe(false)
    expect(ariaSorts()).toEqual({ task: 'ascending', status: 'none', owner: 'none', due: 'none' })
    expect(titles()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])

    clickHeader('th-task')
    await waitFor(() => expect(urlParams().get('dir')).toBe('descending'))
    expect(urlParams().get('sort')).toBe('task')
    expect(ariaSorts().task).toBe('descending')
    expect(titles()).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha'])

    clickHeader('th-status')
    await waitFor(() => expect(urlParams().get('sort')).toBe('status'))
    expect(urlParams().has('dir')).toBe(false)
    expect(ariaSorts()).toEqual({ task: 'none', status: 'ascending', owner: 'none', due: 'none' })
    expect(titles()).toEqual(['Alpha', 'Charlie', 'Delta', 'Bravo'])

    clickHeader('th-owner')
    await waitFor(() => expect(urlParams().get('sort')).toBe('pic'))
    expect(urlParams().has('dir')).toBe(false)
    expect(ariaSorts()).toEqual({ task: 'none', status: 'none', owner: 'ascending', due: 'none' })
    expect(titles()).toEqual(['Delta', 'Charlie', 'Alpha', 'Bravo'])

    clickHeader('th-owner')
    await waitFor(() => expect(urlParams().get('dir')).toBe('descending'))
    expect(urlParams().get('sort')).toBe('pic')
    expect(titles()).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta'])

    clickHeader('th-due')
    await waitFor(() => expect(urlParams().has('sort')).toBe(false))
    expect(urlParams().has('dir')).toBe(false)
    expect(ariaSorts().due).toBe('ascending')
  })

  it('Enter and Space on a focused header button both sort', async () => {
    const user = userEvent.setup()
    renderPage()
    await ready()
    const button = headerButton('th-task')
    expect(button.tagName).toBe('BUTTON')
    button.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(th('th-task').getAttribute('aria-sort')).toBe('ascending'))
    await user.keyboard(' ')
    await waitFor(() => expect(th('th-task').getAttribute('aria-sort')).toBe('descending'))
  })
})

describe('Tasks header sort — toolbar and header agree', () => {
  it('a toolbar choice lights the matching header and a header click updates the toolbar', async () => {
    renderPage()
    await ready()

    chooseToolbarSort('Due latest')
    await waitFor(() => expect(th('th-due').getAttribute('aria-sort')).toBe('descending'))
    expect(urlParams().get('dir')).toBe('descending')
    clickHeader('th-due')
    await waitFor(() => expect(th('th-due').getAttribute('aria-sort')).toBe('ascending'))
    expect(sortPicker()).toHaveTextContent('Due soonest')

    chooseToolbarSort('PIC A–Z')
    await waitFor(() => expect(th('th-owner').getAttribute('aria-sort')).toBe('ascending'))
    expect(urlParams().get('sort')).toBe('pic')
    expect(titles()).toEqual(['Delta', 'Charlie', 'Alpha', 'Bravo'])
    clickHeader('th-owner')
    await waitFor(() => expect(th('th-owner').getAttribute('aria-sort')).toBe('descending'))
    expect(urlParams().get('dir')).toBe('descending')

    clickHeader('th-status')
    await waitFor(() => expect(sortPicker()).toHaveTextContent('Status'))
    expect(urlParams().get('sort')).toBe('status')
    expect(urlParams().has('dir')).toBe(false)

    clickHeader('th-task')
    await waitFor(() => expect(sortPicker()).toHaveTextContent('Task A–Z'))
    expect(ariaSorts()).toEqual({ task: 'ascending', status: 'none', owner: 'none', due: 'none' })
  })

  it('a toolbar-only sort (recent activity) lights no header; the next header click starts ascending', async () => {
    renderPage()
    await ready()
    chooseToolbarSort('Recent activity')
    await waitFor(() => expect(urlParams().get('sort')).toBe('activity'))
    expect(ariaSorts()).toEqual({ task: 'none', status: 'none', owner: 'none', due: 'none' })
    expect(document.querySelectorAll('th.th-sorted')).toHaveLength(0)

    clickHeader('th-due')
    await waitFor(() => expect(th('th-due').getAttribute('aria-sort')).toBe('ascending'))
    expect(urlParams().has('sort')).toBe(false)
  })

  it('a reload of a header-sorted URL reproduces the header state and the order', async () => {
    renderPage('/work/tasks?sort=pic&dir=descending')
    await ready()
    expect(ariaSorts()).toEqual({ task: 'none', status: 'none', owner: 'descending', due: 'none' })
    expect(th('th-owner').querySelector('.collection-grammar-sort-indicator')?.textContent).toBe('↓')
    expect(titles()).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta'])
  })
})

describe('Tasks header sort — supervisor sort (toolbar only, no header button)', () => {
  it('sort=supervisor marks no header sorted, including the Task header', async () => {
    renderPage('/work/tasks?sort=supervisor')
    await ready()
    expect(sortPicker()).toHaveTextContent('Supervisor')
    expect(ariaSorts()).toEqual({ task: 'none', status: 'none', owner: 'none', due: 'none' })
    expect(document.querySelectorAll('th.th-sorted')).toHaveLength(0)
    expect(document.querySelectorAll('.collection-grammar-sort-indicator')).toHaveLength(0)
  })
})

describe('Tasks header sort — windowed table', () => {
  let originalOffsetHeight: PropertyDescriptor | undefined
  beforeEach(() => {
    originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.className?.includes?.('tasks-scroll-virtual')) return 600
        return originalOffsetHeight?.get?.call(this) ?? 0
      },
    })
  })
  afterEach(() => {
    if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
  })

  it('with 60 rows the Due header is ascending on first paint and header clicks still sort', async () => {
    mockListTasks.mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => makeTask({
        id: `task-${i}`,
        title: `Task number ${String(i).padStart(2, '0')}`,
        due_date: `2030-01-${String((i % 28) + 1).padStart(2, '0')}`,
      })),
    )
    renderPage()
    await waitFor(() => expect(document.querySelector('tbody tr.task-row')).toBeTruthy())
    expect(document.querySelectorAll('tbody tr.task-row').length).toBeLessThan(60)
    expect(th('th-due').getAttribute('aria-sort')).toBe('ascending')

    clickHeader('th-due')
    await waitFor(() => expect(th('th-due').getAttribute('aria-sort')).toBe('descending'))
    expect(urlParams().get('dir')).toBe('descending')

    clickHeader('th-task')
    await waitFor(() => expect(th('th-task').getAttribute('aria-sort')).toBe('ascending'))
    expect(titles()[0]).toBe('Task number 00')
  })
})
