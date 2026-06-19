/**
 * PR-2 TasksTable tests — Task 9 (toolbar), Task 10 (Person-overrides-segment),
 * Task 11 (missing states + overdue filter button).
 * Tests that cover behavior via the full split-view (TasksLayout.test.tsx) are kept there.
 * These tests mount TasksTable directly to assert PR-2-specific additions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { __resetTasksViewPrefForTests } from './use-tasks-view-pref'

// ── Mock data layer ──────────────────────────────────────────────────────────
vi.mock('../../lib/db/tasks', () => ({
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
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))

import { listTasks } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { TasksWorkspace } from './tasks-workspace'
import { __resetExpandPrefForTests } from './use-expand-pref'

const mockListTasks = vi.mocked(listTasks)

const VIEWER_ID = 'viewer-id'
const VIEWER_PERSON: PeopleRow = {
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
  viewer: { person: VIEWER_PERSON, roles: [mockRole], isManager: false, accessRoles: [] },
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
const PEOPLE = [
  { id: VIEWER_ID, full_name: 'Arief Said' },
  { id: 'other-id', full_name: 'Budi Setiawan' },
]

function stubMatchMedia(split = true, desktop = true) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      let matches = false
      if (query.includes('1100')) matches = split
      else if (query.includes('768')) matches = desktop
      return {
        matches, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }
    },
  })
}

function renderTable(props: Partial<React.ComponentProps<typeof TasksWorkspace>> = {}) {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={['/tasks']}>
        <TasksWorkspace {...props} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  __resetExpandPrefForTests()
  __resetTasksViewPrefForTests()
  stubMatchMedia(true, true)
  vi.mocked(getBusinessUnits).mockResolvedValue(BUS)
  vi.mocked(getPeople).mockResolvedValue(PEOPLE)
})

// ── Task 9 — group-by control in toolbar (view-tab strip removed per owner — the table IS the view, PMO-style)

describe('Task 9 — group-by control in toolbar', () => {
  it('renders a group-by control with Status, Owner, Business unit options', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    // Group-by control is labelled and present
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    expect(groupSelect).toBeInTheDocument()
    // Options
    const options = Array.from(groupSelect.querySelectorAll('option')).map(o => o.textContent)
    expect(options).toContain('Status')
    expect(options).toContain('Owner')
    expect(options.some(o => o && /business unit/i.test(o))).toBe(true)
  })

  it('group-by control defaults to "status" (from useTasksViewPref)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    const groupSelect = screen.getByRole('combobox', { name: /group/i }) as HTMLSelectElement
    expect(groupSelect.value).toBe('status')
  })

  it('changing group-by persists the choice to localStorage (flat — no grouping output in PR-2)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'owner' } })
    // Persisted immediately
    expect(localStorage.getItem('mos.tasks.groupBy')).toBe('owner')
    // Output remains flat (no group header rows in PR-2)
    await waitFor(() => {
      // table row for the task still renders (flat, no grouping)
      expect(document.querySelector('tr.task-row')).toBeTruthy()
    })
  })
})

// ── Task 10 — Person-overrides-segment (AC-126) ───────────────────────────────

describe('Task 10 — Person-overrides-segment (AC-126, FR-124)', () => {
  it('AC-126: when no Person is selected, the Mine/RACI/All segment is enabled', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    const segList = screen.getByRole('tablist', { name: /ownership filter/i })
    const buttons = segList.querySelectorAll('[role="tab"]')
    buttons.forEach(btn => {
      expect(btn.getAttribute('aria-disabled')).not.toBe('true')
      expect(btn.getAttribute('tabindex')).not.toBe('-1')
    })
  })

  it('AC-126: selecting a Person disables the Mine/RACI/All segment (aria-disabled, out of tab order)', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ title: 'Budi task', responsible_person_id: 'other-id' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Budi task'))
    // Pick Budi Setiawan in the Person filter
    const personSelect = screen.getByRole('combobox', { name: /person/i })
    fireEvent.change(personSelect, { target: { value: 'other-id' } })

    await waitFor(() => {
      const segList = screen.getByRole('tablist', { name: /ownership filter/i })
      const buttons = segList.querySelectorAll('[role="tab"]')
      buttons.forEach(btn => {
        expect(btn).toHaveAttribute('aria-disabled', 'true')
        expect(btn).toHaveAttribute('tabindex', '-1')
      })
      // PR-2-review ruling: the disabled segment carries a tooltip explaining the
      // override (NOT a literal "Person: me" label). Goal: Person overrides segment.
      expect(segList).toHaveAttribute('title', 'Scope is set by the Person filter')
      expect(segList.textContent).not.toMatch(/person: me/i)
    })
  })

  it('AC-126: clearing Person re-enables the segment', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    const personSelect = screen.getByRole('combobox', { name: /person/i })
    // Set person
    fireEvent.change(personSelect, { target: { value: 'other-id' } })
    // Clear person
    fireEvent.change(personSelect, { target: { value: '' } })
    await waitFor(() => {
      const segList = screen.getByRole('tablist', { name: /ownership filter/i })
      const mineBtn = Array.from(segList.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('Mine'))
      expect(mineBtn?.getAttribute('aria-disabled')).not.toBe('true')
    })
  })
})

// ── Task 11 — Missing states + overdue filter button (AC-133, AC-128) ─────────

describe('Task 11 — missing states + overdue filter (AC-133, AC-128)', () => {
  it('AC-133: loading shows a skeleton + aria-busy + role=status', async () => {
    // Never resolve so it stays loading
    mockListTasks.mockReturnValue(new Promise(() => {}))
    renderTable()
    // aria-busy on the loading container
    await waitFor(() => {
      expect(document.querySelector('[aria-busy="true"]')).toBeTruthy()
    })
    // role=status for screen readers
    expect(document.querySelector('[role="status"]')).toBeTruthy()
  })

  it('AC-133: error shows role=alert + Retry button', async () => {
    mockListTasks.mockRejectedValue(new Error('network failure'))
    renderTable()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('AC-133: empty (no tasks, no active filter) shows segment-aware empty copy + New task CTA', async () => {
    mockListTasks.mockResolvedValue([])
    renderTable()
    await waitFor(() => {
      // Mine segment default → "No tasks assigned to you"
      expect(screen.getByText(/no tasks assigned to you/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /\+ new task/i })).toBeInTheDocument()
  })

  it('AC-133: no-results-after-filter shows distinct message + Clear filters + New task (not the empty-no-tasks copy)', async () => {
    // One task from a different person — viewer is on Mine segment by default but has no tasks
    // Use search to create a no-results-after-filter state
    mockListTasks.mockResolvedValue([makeTask({ title: 'Alpha task' })])
    renderTable()
    await waitFor(() => screen.getByText('Alpha task'))
    // Type a search that matches nothing
    const search = screen.getByLabelText('Search tasks')
    fireEvent.change(search, { target: { value: 'zzz-no-match' } })
    await waitFor(() => {
      expect(screen.getByText(/no tasks match these filters/i)).toBeInTheDocument()
    })
    // Clear filters button present
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
    // + New task CTA present
    expect(screen.getByRole('link', { name: /\+ new task/i })).toBeInTheDocument()
    // Not showing the empty-no-tasks copy
    expect(screen.queryByText(/no tasks assigned to you/i)).toBeNull()
  })

  it('AC-133: zero-overdue omits the overdue segment entirely (no "0 overdue" in count line)', async () => {
    mockListTasks.mockResolvedValue([
      // Switch to All segment to make non-viewer tasks visible
      makeTask({ id: 't1', title: 'On time task', due_date: '2030-12-31' }),
    ])
    renderTable()
    await waitFor(() => screen.getByRole('heading', { name: /tasks/i }))
    // Wait for data to load — use 'All' segment to ensure tasks show
    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)
    await waitFor(() => {
      const countEl = document.querySelector('[data-testid="tasks-count-line"]')
      // The count line is always present; assert it and that it omits "0 overdue".
      expect(countEl).toBeTruthy()
      expect(countEl!.textContent).not.toMatch(/0 overdue/)
    })
  })

  it('AC-128: the "N overdue" count is a button that filters to overdue-only and is clearable', async () => {
    const overdueDate = '2020-01-01' // well in the past
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Overdue task', due_date: overdueDate }),
      makeTask({ id: 't2', title: 'Normal task', due_date: '2030-12-31' }),
    ])
    renderTable()
    await waitFor(() => screen.getByRole('heading', { name: /tasks/i }))
    // Switch to All to see both tasks
    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)

    // Wait for both tasks visible
    await waitFor(() => {
      expect(screen.getByText('Overdue task')).toBeInTheDocument()
      expect(screen.getByText('Normal task')).toBeInTheDocument()
    })

    // The page count-line "N overdue" is a button (group subtotals also expose
    // overdue-filter buttons now that grouping is live — scope to the count line).
    const overdueBtn = document.querySelector('[data-testid="tasks-count-line"] .overdue-filter-btn') as HTMLButtonElement
    expect(overdueBtn).toBeTruthy()
    expect(overdueBtn.getAttribute('aria-label')).toMatch(/filter to.*overdue/i)

    // Click it → only overdue rows shown + clearable chip
    fireEvent.click(overdueBtn)
    await waitFor(() => {
      expect(screen.queryByText('Normal task')).toBeNull()
      expect(screen.getByText('Overdue task')).toBeInTheDocument()
    })

    // Clearable chip present
    const clearChip = screen.getByRole('button', { name: /clear overdue filter/i })
    expect(clearChip).toBeInTheDocument()

    // Clear → both tasks visible again
    fireEvent.click(clearChip)
    await waitFor(() => {
      expect(screen.getByText('Normal task')).toBeInTheDocument()
      expect(screen.getByText('Overdue task')).toBeInTheDocument()
    })
  })

  it('AC-133: Clear filters button resets all filters', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Alpha task' })])
    renderTable()
    await waitFor(() => screen.getByText('Alpha task'))
    // Apply a search filter that yields no results
    const search = screen.getByLabelText('Search tasks')
    fireEvent.change(search, { target: { value: 'zzz-no-match' } })
    await waitFor(() => screen.getByRole('button', { name: /clear filters/i }))
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    // After clear the task is visible again
    await waitFor(() => {
      expect(screen.getByText('Alpha task')).toBeInTheDocument()
    })
  })
})

// ── PR-3 — TanStack refactor + group-by engine + group headers ────────────────

// Helper: switch the ownership segment to "All" so non-viewer tasks are visible.
async function switchToAll() {
  const seg = screen.getByRole('tablist', { name: /ownership filter/i })
  const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
  if (allBtn) fireEvent.click(allBtn as Element)
}

describe('Task 13 — TasksWorkspace canonical home (AC-116)', () => {
  it('AC-116: clicking a row navigates to the one canonical /tasks/:id surface', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-9', title: 'Canonical task' })])
    renderTable({ drawerSlot: <div /> })
    await waitFor(() => screen.getByText('Canonical task'))
    const row = document.querySelector('tr.task-row') as HTMLElement
    expect(row).toBeTruthy()
    // The row carries the canonical link to /tasks/:id (no alternate detail route)
    const link = row.querySelector('a.task-row-link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/tasks/task-9')
  })
})

describe('Task 14/15 — grouping engine (AC-123, AC-119)', () => {
  it('AC-123: defaults to grouping by Status with a count per group', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'a', title: 'Open one', status: 'Open' }),
      makeTask({ id: 'b', title: 'Blocked one', status: 'Blocked' }),
      makeTask({ id: 'c', title: 'Blocked two', status: 'Blocked' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Open one'))
    await switchToAll()
    await waitFor(() => screen.getByText('Blocked one'))
    // Group header rows (tr.grp) for each status, never .task-row
    const groups = document.querySelectorAll('tr.grp')
    expect(groups.length).toBeGreaterThanOrEqual(4) // all 4 statuses shown
    // Blocked group header shows its label + count 2
    const blockedHeader = Array.from(groups).find(g => g.textContent?.includes('Blocked'))
    expect(blockedHeader).toBeTruthy()
    expect(blockedHeader!.textContent).toContain('2')
  })

  it('AC-123: within a group, leaf rows are sorted Due-ascending (overdue first)', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'late', title: 'Later task', status: 'Open', due_date: '2030-12-31' }),
      makeTask({ id: 'over', title: 'Overdue task', status: 'Open', due_date: '2020-01-01' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Later task'))
    await switchToAll()
    await waitFor(() => screen.getByText('Overdue task'))
    const rows = Array.from(document.querySelectorAll('tr.task-row'))
    const idxOver = rows.findIndex(r => r.textContent?.includes('Overdue task'))
    const idxLate = rows.findIndex(r => r.textContent?.includes('Later task'))
    expect(idxOver).toBeLessThan(idxLate)
  })

  it('AC-119: an overdue row shows the in-row off-track signal "Overdue · <date>" in red', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'over', title: 'Overdue task', status: 'Open', due_date: '2020-01-01' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Overdue task'))
    await switchToAll()
    await waitFor(() => {
      const cell = document.querySelector('tr.task-row .due-overdue')
      expect(cell).toBeTruthy()
      expect(cell!.textContent).toMatch(/^Overdue · /)
    })
  })
})

describe('Task 17 — show all groups incl. empty (AC-124)', () => {
  it('AC-124: grouping by Owner shows ALL owner groups, including those with zero tasks', async () => {
    // Only the viewer owns a task; Budi (other-id) owns none → his group still renders.
    mockListTasks.mockResolvedValue([makeTask({ id: 'a', title: 'Mine task' })])
    renderTable()
    await waitFor(() => screen.getByText('Mine task'))
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'owner' } })
    await waitFor(() => {
      const groups = Array.from(document.querySelectorAll('tr.grp'))
      const budiHeader = groups.find(g => g.textContent?.includes('Budi'))
      expect(budiHeader).toBeTruthy()
      expect(budiHeader!.textContent).toContain('0') // zero count
    })
  })
})

describe('Task 18 — group collapse persists (AC-132)', () => {
  it('AC-132: toggling a group caret collapses its leaf rows and persists per-user-global', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'a', title: 'Open visible', status: 'Open' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Open visible'))
    await switchToAll()
    await waitFor(() => screen.getByText('Open visible'))
    // Find the Open group header's caret toggle
    const groups = Array.from(document.querySelectorAll('tr.grp'))
    const openHeader = groups.find(g => g.textContent?.includes('Open'))!
    const caret = openHeader.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(caret.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(caret)
    // Leaf row hidden + persisted
    await waitFor(() => {
      expect(screen.queryByText('Open visible')).toBeNull()
    })
    expect(JSON.parse(localStorage.getItem('mos.tasks.collapsedGroups')!)).toEqual({ status: ['Open'] })
  })
})

describe('Task 18 — j/k skips group-header rows (AC-131, OBS-121)', () => {
  it('AC-131/OBS-121: j moves the leaf-row cursor and never lands on a group-header row', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'o1', title: 'Open one', status: 'Open' }),
      makeTask({ id: 'b1', title: 'Blocked one', status: 'Blocked' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Open one'))
    await switchToAll()
    await waitFor(() => screen.getByText('Blocked one'))
    // Press j several times — the cursor (.kfocus) must always be on a .task-row,
    // never on a .grp header (group headers are not cursor targets).
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(window, { key: 'j' })
      const cursorRow = document.querySelector('tr.kfocus')
      if (cursorRow) {
        expect(cursorRow.classList.contains('task-row')).toBe(true)
        expect(cursorRow.classList.contains('grp')).toBe(false)
      }
    }
    // After 2+ presses the cursor has landed on a leaf row
    expect(document.querySelector('tr.task-row.kfocus')).toBeTruthy()
  })

  // I1: aria-current exposes the keyboard cursor to AT
  it('I1/OBS-121: j/k move aria-current="true" across leaf rows; group headers never receive it', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'o1', title: 'Open one', status: 'Open' }),
      makeTask({ id: 'b1', title: 'Blocked one', status: 'Blocked' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Open one'))
    await switchToAll()
    await waitFor(() => screen.getByText('Blocked one'))

    // Before any j press: no aria-current=true on any task-row
    expect(document.querySelector('tr.task-row[aria-current="true"]')).toBeNull()

    // First j: cursor lands on leaf index 0 → that row should have aria-current="true"
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => {
      const currentRow = document.querySelector('tr.task-row[aria-current="true"]')
      expect(currentRow).toBeTruthy()
      // Must be a task-row, not a group header
      expect(currentRow!.classList.contains('task-row')).toBe(true)
      expect(currentRow!.classList.contains('grp')).toBe(false)
    })

    // j again: aria-current moves to next leaf row; previous row loses it
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => {
      const currentRows = document.querySelectorAll('tr.task-row[aria-current="true"]')
      // Exactly one row carries aria-current at a time
      expect(currentRows.length).toBe(1)
      // And it is still a task-row, never a .grp
      expect(currentRows[0].classList.contains('grp')).toBe(false)
    })
  })
})

describe('Task 19 — "+ Add task" pre-fill (AC-125)', () => {
  it('AC-125: in an Owner-grouped view, a group "+ Add task" navigates to /tasks/new?r=<personId>', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'a', title: 'Mine task' })])
    // Capture navigation by rendering a route that echoes the URL
    const { container } = renderTable()
    await waitFor(() => screen.getByText('Mine task'))
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'owner' } })
    await waitFor(() => {
      const groups = Array.from(container.querySelectorAll('tr.grp .glabel'))
      expect(groups.some(g => g.textContent?.includes('Arief'))).toBe(true)
    })
    const groups = Array.from(container.querySelectorAll('tr.grp'))
    const ariefHeader = groups.find(g => g.querySelector('.glabel')?.textContent?.includes('Arief'))!
    const addBtn = ariefHeader.querySelector('button.gadd') as HTMLButtonElement
    expect(addBtn).toBeTruthy()
    // The add affordance carries the pre-fill target person as its data attribute
    expect(addBtn.getAttribute('data-prefill')).toBe(`r=${VIEWER_ID}`)
  })

  it('AC-125 / FR-123 (refined): Status-group "+ Add task" has NO ?status= pre-fill (plain create link)', async () => {
    // CreateSurface has no status field — tasks always open as "Open". A ?status= param
    // would be silently dropped, so the Status group must emit an empty prefill (plain /tasks/new).
    mockListTasks.mockResolvedValue([makeTask({ id: 'a', title: 'Mine task', status: 'Open' })])
    const { container } = renderTable()
    await waitFor(() => screen.getByText('Mine task'))
    // Default groupBy is 'status' — group headers should already be present.
    await switchToAll()
    await waitFor(() => {
      const groups = Array.from(container.querySelectorAll('tr.grp'))
      expect(groups.length).toBeGreaterThanOrEqual(1)
    })
    const groups = Array.from(container.querySelectorAll('tr.grp'))
    const openHeader = groups.find(g => g.querySelector('.glabel')?.textContent?.includes('Open'))!
    expect(openHeader).toBeTruthy()
    const addBtn = openHeader.querySelector('button.gadd') as HTMLButtonElement
    expect(addBtn).toBeTruthy()
    // The Status group + Add must carry an empty (or absent) prefill — no ?status= param
    const prefill = addBtn.getAttribute('data-prefill') ?? ''
    expect(prefill).not.toMatch(/status=/i)
  })
})

// ── C1: Done task must not appear in overdue count / subtotal / row label ──────
describe('C1 — Done tasks excluded from overdue (RI-1 regression guard)', () => {
  it('RI-1: a Done task with a past due_date does NOT contribute to the page overdue count', async () => {
    const overdueDate = '2020-01-01'
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Done past due', status: 'Done', due_date: overdueDate }),
      makeTask({ id: 't2', title: 'Open past due', status: 'Open', due_date: overdueDate }),
    ])
    renderTable()
    await waitFor(() => screen.getByRole('heading', { name: /tasks/i }))
    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)
    await waitFor(() => {
      expect(screen.getByText('Done past due')).toBeInTheDocument()
      expect(screen.getByText('Open past due')).toBeInTheDocument()
    })
    // Page count line: only 1 overdue (Open one), not 2
    const countLine = document.querySelector('[data-testid="tasks-count-line"]')
    expect(countLine?.textContent).toMatch(/1 overdue/)
    expect(countLine?.textContent).not.toMatch(/2 overdue/)
  })

  it('RI-1: a Done task with a past due_date does NOT show the red "Overdue ·" row label', async () => {
    const overdueDate = '2020-01-01'
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Done past due', status: 'Done', due_date: overdueDate }),
    ])
    renderTable()
    await waitFor(() => screen.getByRole('heading', { name: /tasks/i }))
    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)
    await waitFor(() => screen.getByText('Done past due'))
    // The row cell must NOT carry due-overdue class
    const dueCells = document.querySelectorAll('.due-overdue')
    expect(dueCells.length).toBe(0)
  })

  it('RI-1: the Done group header shows no overdue subtotal when only Done tasks have past due_dates', async () => {
    const overdueDate = '2020-01-01'
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Done past due', status: 'Done', due_date: overdueDate }),
    ])
    renderTable()
    await waitFor(() => screen.getByRole('heading', { name: /tasks/i }))
    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)
    await waitFor(() => screen.getByText('Done past due'))
    // Done group header must not render an overdue subtotal button
    const grps = Array.from(document.querySelectorAll('tr.grp'))
    const doneHeader = grps.find(g => g.querySelector('.glabel')?.textContent === 'Done')
    expect(doneHeader).toBeTruthy()
    // No overdue subtotal button in the Done group header
    const overdueBtns = doneHeader!.querySelectorAll('button.gsub')
    expect(overdueBtns.length).toBe(0)
  })
})

// ── M1: condensed off-track glyph (WCAG 1.4.1 non-color cue) ─────────────────
describe('M1 — condensed off-track glyph (non-color cue, WCAG 1.4.1)', () => {
  it('M1: in condensed split-view, overdue row retains a non-color "!" glyph in the DUE cell', async () => {
    const overdueDate = '2020-01-01'
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Overdue task', status: 'Open', due_date: overdueDate }),
    ])
    // drawerOpen=true + splitLayout=true → condensed=true
    renderTable({ drawerOpen: true, splitLayout: true })
    await waitFor(() => screen.getByRole('heading', { name: /tasks/i }))
    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)
    await waitFor(() => screen.getByText('Overdue task'))
    // In condensed mode the cell drops "Overdue · " text prefix, but must show a non-color glyph
    const dueCell = document.querySelector('tr.task-row .due-overdue')
    expect(dueCell).toBeTruthy()
    // The glyph "!" (or similar) must be present — conveys off-track without relying on color alone
    expect(dueCell!.textContent).toMatch(/!/)
  })

  it('M1: non-condensed (no drawer) overdue row shows the full "Overdue · <date>" text (not just the glyph)', async () => {
    const overdueDate = '2020-01-01'
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Overdue task', status: 'Open', due_date: overdueDate }),
    ])
    // drawerOpen=false → condensed=false
    renderTable({ drawerOpen: false })
    await waitFor(() => screen.getByRole('heading', { name: /tasks/i }))
    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)
    await waitFor(() => screen.getByText('Overdue task'))
    const dueCell = document.querySelector('tr.task-row .due-overdue')
    expect(dueCell).toBeTruthy()
    expect(dueCell!.textContent).toMatch(/^Overdue · /)
  })
})

describe('Task 22 — mobile grouped cards (AC-129)', () => {
  it('AC-129: <768px renders grouped cards (group headers + cards)', async () => {
    stubMatchMedia(false, false) // not split, not desktop → mobile
    mockListTasks.mockResolvedValue([makeTask({ id: 'a', title: 'Mobile task', status: 'Open' })])
    renderTable()
    await waitFor(() => screen.getByText('Mobile task'))
    await switchToAll()
    await waitFor(() => screen.getByText('Mobile task'))
    // Group headings present (the chosen group-by: status)
    expect(screen.getByText('Mobile task')).toBeInTheDocument()
    expect(document.querySelector('[data-testid="task-card"]')).toBeTruthy()
    // A group heading for the status grouping
    expect(document.querySelector('.mgc-group-head')).toBeTruthy()
  })
})

// ── PR-2 — Record table craft (overline + hover affordances + Chip-link) ──────

// Helper that reads a CSS rule body from TasksWorkspace.css (jsdom does not compute
// styles, so we lock the authored rule — same pattern as task-surface.css.test.ts).
function cssRuleBody(selector: string): string {
  const cssPath = resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css')
  const css = readFileSync(cssPath, 'utf8')
  const idx = css.indexOf(selector)
  expect(idx, `expected to find ${selector} in TasksWorkspace.css`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('PR-2 — AC-T01 thead th overline (weight-400 uppercase text-muted-foreground)', () => {
  it('AC-T01: a populated table columnheader carries the th-cell class', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Overline task' })])
    renderTable()
    await waitFor(() => screen.getByText('Overline task'))
    const th = screen.getByRole('columnheader', { name: /Task/ })
    expect(th.className).toContain('th-cell')
  })

  it('AC-T01: .th-cell rule is weight 400 + UPPERCASE + 0.06em tracking + text-muted-foreground', () => {
    const body = cssRuleBody('.th-cell')
    // OD-P4-10 overline, scoped to thead th only: weight 400 (NOT 600), uppercase,
    // 0.06em tracking, the --ds-font-color-tertiary crosswalk (text-muted-foreground).
    expect(body).toMatch(/font-weight:\s*400/)
    expect(body).not.toMatch(/font-weight:\s*600/)
    expect(body).toMatch(/text-transform:\s*uppercase/)
    expect(body).toMatch(/letter-spacing:\s*\.?0*\.?06em/) // 0.06em
    expect(body).toMatch(/color:\s*var\(--muted-foreground\)/)
    expect(body).toMatch(/font-size:\s*var\(--ds-font-size-xs\)/)
  })
})
