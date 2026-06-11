import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { TaskListRow } from '../lib/db/tasks.types'
import type { AuthState } from '../auth/context'
import { AuthContext } from '../auth/context'
import type { PeopleRow, RolesRow } from '../lib/database.types'

// ── Mock the data layer ──────────────────────────────────────────────────────
vi.mock('../lib/db/tasks', () => ({
  listTasks: vi.fn(),
}))

import { listTasks } from '../lib/db/tasks'
import TasksPage from './TasksPage'
const mockListTasks = vi.mocked(listTasks)

// ── Stub matchMedia for useIsDesktop (desktop path by default) ──────────────
function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListenerCallbacks: [],
      addEventListener: function (_: string, cb: EventListenerOrEventListenerObject) {
        (this.addEventListenerCallbacks as EventListenerOrEventListenerObject[]).push(cb)
      },
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// ── Viewer fixture ───────────────────────────────────────────────────────────
const VIEWER_ID = 'viewer-person-id'
const OTHER_ID  = 'other-person-id'
const C_PERSON  = 'consulted-person-id'
const I_PERSON  = 'informed-person-id'

const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Arief Said',
  email: 'arief@gordi.id', archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

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

// ── Task fixtures ─────────────────────────────────────────────────────────────
function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Default task',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID,
    accountable_person_id: VIEWER_ID,
    consulted_person_ids: [],
    informed_person_ids: [],
    description: null, due_date: null,
    last_activity_at: '2026-06-11T10:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z',
    updated_at: '2026-06-11T00:00:00Z',
    business_unit: { id: 'bu-1', name: 'Kitchen' },
    responsible: { id: VIEWER_ID, full_name: 'Arief Said' },
    accountable: { id: VIEWER_ID, full_name: 'Arief Said' },
    ...overrides,
  }
}

// ── Render helper ─────────────────────────────────────────────────────────────
function renderPage(auth: AuthState = authedState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/tasks']}>
        <TasksPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  stubMatchMedia(true) // desktop by default
})

// ── T-030: AC-067 — loading / error / empty states ─────────────────────────
describe('AC-067 — TasksPage states (loading, error, empty)', () => {
  it('AC-067: shows skeleton rows while data is loading', async () => {
    // pending promise never resolves within the test tick
    mockListTasks.mockReturnValue(new Promise(() => {}))
    renderPage()
    // skeleton rows present; error and empty not present
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-067: shows inline error banner with Retry when listTasks rejects', async () => {
    mockListTasks.mockRejectedValue(new Error("Couldn't reach server"))
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
    expect(screen.getByText(/couldn't load tasks/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('AC-067: shows empty state with "+ New task" when list resolves empty', async () => {
    mockListTasks.mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /\+ new task/i })).toBeTruthy()
    })
  })

  it('AC-067: toolbar and column headers stay rendered during error state', async () => {
    mockListTasks.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() => screen.getByRole('alert'))
    // toolbar filter control labels visible
    expect(screen.getAllByText(/business unit/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^status$/i).length).toBeGreaterThan(0)
  })
})

// ── T-031: AC-060 — row content (title+BU, status, owner, due, activity) ───
describe('AC-060 — row renders title, BU, status, owner, due, activity', () => {
  it('AC-060: renders title, BU subline, status pill, responsible name, and activity age', async () => {
    // Use a last_activity_at well in the past so age shows days (no clock mock needed)
    const task = makeTask({
      title: 'SOP stock opname mingguan',
      business_unit: { id: 'bu-ops', name: 'Ops Unit' },
      status: 'In Progress',
      responsible: { id: VIEWER_ID, full_name: 'Arief Said' },
      last_activity_at: '2020-01-01T00:00:00Z', // very old → shows days
      due_date: '2099-12-31',
    })
    mockListTasks.mockResolvedValue([task])
    renderPage()

    await waitFor(() => screen.getByText('SOP stock opname mingguan'))
    expect(screen.getAllByText('Ops Unit')[0]).toBeTruthy()
    // Status pill (not the select option)
    expect(screen.getAllByText('In Progress').find(el => el.closest('.pill'))).toBeTruthy()
    expect(screen.getAllByText('Arief')[0]).toBeTruthy() // first name only
    // Activity age rendered as some unit (d/h/m)
    expect(document.querySelector('.act')).toBeTruthy()
  })

  it('AC-060: shows "+N" overflow when Accountable / Consulted / Informed differ from R', async () => {
    const task = makeTask({
      responsible: { id: VIEWER_ID, full_name: 'Arief Said' },
      accountable_person_id: OTHER_ID,
      consulted_person_ids: [C_PERSON],
      informed_person_ids: [I_PERSON],
    })
    mockListTasks.mockResolvedValue([task])
    renderPage()

    await waitFor(() => screen.getByText('Arief'))
    // A + C + I = 3 other RACI members beyond R
    expect(screen.getByText('+3')).toBeTruthy()
  })
})

// ── T-032: AC-061 — due-cell coloring ───────────────────────────────────────
// Use only Date fake (toFake: ['Date']) so setTimeout/waitFor still work.
describe('AC-061 — due-cell colouring (overdue/soon/calm via dueStatus)', () => {
  it('AC-061: overdue task shows "Overdue ·" prefix', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-11T05:00:00Z')) // 12:00 WIB Wed 11 Jun 2026
    try {
      const task = makeTask({ due_date: '2026-06-10', title: 'Overdue task' })
      mockListTasks.mockResolvedValue([task])
      renderPage()
      // The due cell specifically should contain "Overdue ·" prefix
      await waitFor(() => {
        const dueCells = document.querySelectorAll('.due-overdue')
        expect(dueCells.length).toBeGreaterThan(0)
        const cellText = Array.from(dueCells).map(c => c.textContent).join(' ')
        expect(cellText).toMatch(/overdue/i)
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('AC-061: soon task (within 3 days) renders with due-soon class', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-11T05:00:00Z')) // 12:00 WIB Wed 11 Jun 2026
    try {
      const task = makeTask({ due_date: '2026-06-13', title: 'Soon task' }) // +2 days
      mockListTasks.mockResolvedValue([task])
      renderPage()
      await waitFor(() => screen.getByText('Soon task'))
      const dueCells = document.querySelectorAll('.due-soon')
      expect(dueCells.length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('AC-061: calm task renders with due-calm class', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-11T05:00:00Z')) // 12:00 WIB Wed 11 Jun 2026
    try {
      const task = makeTask({ due_date: '2026-06-20', title: 'Calm task' }) // +9 days
      mockListTasks.mockResolvedValue([task])
      renderPage()
      await waitFor(() => screen.getByText('Calm task'))
      const dueCells = document.querySelectorAll('.due-calm')
      expect(dueCells.length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── T-033: AC-063 — BU / Status / Person filters ────────────────────────────
describe('AC-063 — filters: Business Unit, Status, Person', () => {
  // Both tasks are assigned to VIEWER_ID so they pass the default "Mine" segment filter
  const taskKitchen = makeTask({
    id: 'task-kitchen', title: 'Kitchen task',
    business_unit_id: 'bu-kitchen',
    business_unit: { id: 'bu-kitchen', name: 'Kitchen BU' },
    status: 'Open',
    responsible_person_id: VIEWER_ID,
    accountable_person_id: VIEWER_ID,
    responsible: { id: VIEWER_ID, full_name: 'Arief Said' },
  })
  const taskRoastery = makeTask({
    id: 'task-roastery', title: 'Roastery task',
    business_unit_id: 'bu-roastery',
    business_unit: { id: 'bu-roastery', name: 'Roastery BU' },
    status: 'Blocked',
    responsible_person_id: VIEWER_ID,
    accountable_person_id: VIEWER_ID,
    responsible: { id: VIEWER_ID, full_name: 'Arief Said' },
  })

  it('AC-063: BU filter — selecting a BU shows only matching BU tasks', async () => {
    // First call returns all; second (after BU filter) returns filtered set
    mockListTasks.mockResolvedValueOnce([taskKitchen, taskRoastery])
    mockListTasks.mockResolvedValueOnce([taskKitchen])
    renderPage()
    await waitFor(() => screen.getByText('Roastery task'))

    const buSelect = screen.getByLabelText(/business unit/i)
    fireEvent.change(buSelect, { target: { value: 'bu-kitchen' } })

    await waitFor(() => {
      expect(screen.queryByText('Roastery task')).toBeNull()
      expect(screen.getByText('Kitchen task')).toBeTruthy()
    })
    expect(mockListTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ businessUnitId: 'bu-kitchen' })
    )
  })

  it('AC-063: Status filter — selecting a status shows only matching rows', async () => {
    mockListTasks.mockResolvedValueOnce([taskKitchen, taskRoastery])
    mockListTasks.mockResolvedValueOnce([taskRoastery])
    renderPage()
    await waitFor(() => screen.getByText('Kitchen task'))

    const statusSelect = screen.getByLabelText(/^status$/i)
    fireEvent.change(statusSelect, { target: { value: 'Blocked' } })

    await waitFor(() => {
      expect(screen.queryByText('Kitchen task')).toBeNull()
      expect(screen.getByText('Roastery task')).toBeTruthy()
    })
    expect(mockListTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'Blocked' })
    )
  })

  it('AC-063: Person filter — selecting a person shows tasks where they are in any RACI role', async () => {
    // Use "All" segment so all tasks load visibly regardless of RACI role
    // Tasks: viewer is R on first, viewer is C on second, neither on third
    const taskViewerR = makeTask({
      id: 'task-viewer-r', title: 'Viewer is R',
      responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
      responsible: { id: VIEWER_ID, full_name: 'Arief Said' },
    })
    const taskViewerC = makeTask({
      id: 'task-viewer-c', title: 'Viewer is C',
      responsible_person_id: OTHER_ID, accountable_person_id: OTHER_ID,
      consulted_person_ids: [VIEWER_ID],
      responsible: { id: OTHER_ID, full_name: 'Budi Setiawan' },
    })
    const taskUnrelated = makeTask({
      id: 'task-unrelated', title: 'Not viewer task',
      responsible_person_id: OTHER_ID, accountable_person_id: OTHER_ID,
      responsible: { id: OTHER_ID, full_name: 'Budi Setiawan' },
    })
    mockListTasks.mockResolvedValue([taskViewerR, taskViewerC, taskUnrelated])
    renderPage()
    // Switch to "All" so all tasks are visible before applying person filter
    await waitFor(() => screen.getByRole('tab', { name: /^all$/i }))
    fireEvent.click(screen.getByRole('tab', { name: /^all$/i }))
    await waitFor(() => screen.getByText('Not viewer task'))

    // Now apply person filter for the viewer
    const personSelect = screen.getByLabelText(/^person$/i)
    fireEvent.change(personSelect, { target: { value: VIEWER_ID } })

    await waitFor(() => {
      expect(screen.getByText('Viewer is R')).toBeTruthy()
      expect(screen.getByText('Viewer is C')).toBeTruthy()
      expect(screen.queryByText('Not viewer task')).toBeNull()
    })
  })
})

// ── T-034: AC-064 — Mine / RACI-involved / All segmented control ─────────────
describe('AC-064 — segmented control: Mine / RACI-involved / All', () => {
  const taskMine = makeTask({
    id: 'mine', title: 'My task',
    responsible_person_id: VIEWER_ID,
    accountable_person_id: VIEWER_ID,
    responsible: { id: VIEWER_ID, full_name: 'Arief Said' },
  })
  const taskConsulted = makeTask({
    id: 'consulted', title: 'Consulted task',
    responsible_person_id: OTHER_ID,
    accountable_person_id: OTHER_ID,
    consulted_person_ids: [VIEWER_ID],
    responsible: { id: OTHER_ID, full_name: 'Budi Setiawan' },
  })
  const taskUnrelated = makeTask({
    id: 'unrelated', title: 'Unrelated task',
    responsible_person_id: OTHER_ID,
    accountable_person_id: OTHER_ID,
    responsible: { id: OTHER_ID, full_name: 'Budi Setiawan' },
  })

  beforeEach(() => {
    mockListTasks.mockResolvedValue([taskMine, taskConsulted, taskUnrelated])
  })

  it('AC-064: "Mine" segment (default) shows only R-or-A tasks', async () => {
    renderPage()
    await waitFor(() => screen.getByText('My task'))
    expect(screen.queryByText('Consulted task')).toBeNull()
    expect(screen.queryByText('Unrelated task')).toBeNull()
  })

  it('AC-064: "RACI-involved" adds C/I tasks in scope', async () => {
    renderPage()
    await waitFor(() => screen.getByText('My task'))

    fireEvent.click(screen.getByRole('tab', { name: /raci-involved/i }))

    await waitFor(() => {
      expect(screen.getByText('My task')).toBeTruthy()
      expect(screen.getByText('Consulted task')).toBeTruthy()
      expect(screen.queryByText('Unrelated task')).toBeNull()
    })
  })

  it('AC-064: "All" shows every loaded row regardless of RACI', async () => {
    renderPage()
    await waitFor(() => screen.getByText('My task'))

    fireEvent.click(screen.getByRole('tab', { name: /^all$/i }))

    await waitFor(() => {
      expect(screen.getByText('My task')).toBeTruthy()
      expect(screen.getByText('Consulted task')).toBeTruthy()
      expect(screen.getByText('Unrelated task')).toBeTruthy()
    })
  })
})

// ── T-035: AC-065 — Show archived toggle ─────────────────────────────────────
describe('AC-065 — archived rows hidden by default; show-archived toggle reveals them', () => {
  it('AC-065: archived task hidden on first paint', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'active', title: 'Active task' }),
    ])
    renderPage()
    await waitFor(() => screen.getByText('Active task'))
    // listTasks called with includeArchived falsy
    expect(mockListTasks).toHaveBeenCalledWith(
      expect.not.objectContaining({ includeArchived: true })
    )
  })

  it('AC-065: toggling "Show archived" re-queries with includeArchived:true', async () => {
    mockListTasks.mockResolvedValueOnce([makeTask({ id: 'active', title: 'Active task' })])
    mockListTasks.mockResolvedValueOnce([
      makeTask({ id: 'active', title: 'Active task' }),
      makeTask({ id: 'arch', title: 'Archived task', archived_at: '2026-06-01T00:00:00Z' }),
    ])
    renderPage()
    await waitFor(() => screen.getByText('Active task'))

    const toggle = screen.getByRole('checkbox', { name: /show archived/i })
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(mockListTasks).toHaveBeenLastCalledWith(
        expect.objectContaining({ includeArchived: true })
      )
    })
    await waitFor(() => screen.getByText('Archived task'))
  })
})

// ── T-036: AC-066 — default sort due ascending ──────────────────────────────
describe('AC-066 — default sort: due ascending (overdue first)', () => {
  it('AC-066: rows rendered in due-date ascending order at first paint', async () => {
    const late  = makeTask({ id: 't1', title: 'Later task',   due_date: '2026-06-20' })
    const early = makeTask({ id: 't2', title: 'Earlier task', due_date: '2026-06-12' })
    const none  = makeTask({ id: 't3', title: 'No due task',  due_date: null })
    // listTasks returns already-sorted (server-side), component must preserve order
    mockListTasks.mockResolvedValue([early, late, none])
    renderPage()
    await waitFor(() => screen.getByText('Earlier task'))

    const rows = screen.getAllByRole('row')
    const titles = rows.slice(1).map(r => r.textContent)
    const earlyIdx = titles.findIndex(t => t?.includes('Earlier task'))
    const lateIdx  = titles.findIndex(t => t?.includes('Later task'))
    expect(earlyIdx).toBeLessThan(lateIdx)
  })

  it('AC-066: Due column header has aria-sort="ascending" at first paint', async () => {
    mockListTasks.mockResolvedValue([makeTask()])
    renderPage()
    await waitFor(() => screen.getByText('Default task'))
    const dueHeader = screen.getByRole('columnheader', { name: /due/i })
    expect(dueHeader.getAttribute('aria-sort')).toBe('ascending')
  })
})

// ── Responsive: card list at mobile width ────────────────────────────────────
describe('responsive — card list at <768px', () => {
  it('renders card list (not table rows) on narrow viewport', async () => {
    stubMatchMedia(false) // narrow: useIsDesktop() returns false

    const task = makeTask({ title: 'Mobile task', status: 'Open' })
    mockListTasks.mockResolvedValue([task])
    renderPage()

    await waitFor(() => screen.getByText('Mobile task'))
    // Table rows should not be present; card articles should be
    expect(document.querySelector('[data-testid="task-card"]')).toBeTruthy()
    expect(document.querySelector('tbody tr')).toBeNull()
  })
})

// ── a11y: ARIA roles and labels ──────────────────────────────────────────────
describe('a11y — aria roles and labels', () => {
  it('segmented control has tablist/tab roles and aria-selected', async () => {
    mockListTasks.mockResolvedValue([makeTask()])
    renderPage()
    await waitFor(() => screen.getByRole('tablist'))
    expect(screen.getByRole('tab', { name: /mine/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /raci-involved/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^all$/i })).toBeTruthy()
    // "Mine" is selected by default
    expect(screen.getByRole('tab', { name: /mine/i }).getAttribute('aria-selected')).toBe('true')
  })

  it('loading region has aria-busy and a visually-hidden loading message', async () => {
    mockListTasks.mockReturnValue(new Promise(() => {}))
    renderPage()
    const busyRegion = document.querySelector('[aria-busy="true"]')
    expect(busyRegion).toBeTruthy()
  })

  it('+ New task link is present with correct href', async () => {
    mockListTasks.mockResolvedValue([])
    renderPage()
    await waitFor(() => screen.getByRole('link', { name: /\+ new task/i }))
    const link = screen.getByRole('link', { name: /\+ new task/i })
    expect(link.getAttribute('href')).toContain('/tasks/new')
  })
})
