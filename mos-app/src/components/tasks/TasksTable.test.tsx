/**
 * PR-2 TasksTable tests — Task 9 (toolbar + ViewTabStrip), Task 10 (Person-overrides-segment),
 * Task 11 (missing states + overdue filter button).
 * Tests that cover behavior via the full split-view (TasksLayout.test.tsx) are kept there.
 * These tests mount TasksTable directly to assert PR-2-specific additions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '../../auth/context'
import { AuthContext } from '../../auth/context'
import type { PeopleRow, RolesRow } from '../../lib/database.types'
import type { TaskListRow } from '../../lib/db/tasks.types'
import { __resetTasksViewPrefForTests } from './useTasksViewPref'

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

import { listTasks } from '../../lib/db/tasks'
import { getBusinessUnits, getPeople } from '../../lib/db/directory'
import { TasksTable } from './TasksTable'
import { __resetExpandPrefForTests } from './useExpandPref'

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
  viewer: { person: VIEWER_PERSON, roles: [mockRole], isManager: false },
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

function renderTable(props: Partial<React.ComponentProps<typeof TasksTable>> = {}) {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={['/tasks']}>
        <TasksTable {...props} />
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

// ── Task 9 — ViewTabStrip in toolbar region (AC-122) ──────────────────────────

describe('Task 9 — ViewTabStrip + group-by control in toolbar', () => {
  it('renders the ViewTabStrip tablist above the toolbar (AC-122)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    // ViewTabStrip tablist present
    const tablist = screen.getByRole('tablist', { name: /workspace view/i })
    expect(tablist).toBeInTheDocument()
    // Table tab is selected
    expect(screen.getByRole('tab', { name: /table/i })).toHaveAttribute('aria-selected', 'true')
    // Board and Calendar are SOON stubs
    expect(screen.getByRole('tab', { name: /board/i })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('tab', { name: /calendar/i })).toHaveAttribute('aria-disabled', 'true')
  })

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
      // count line should NOT contain "0 overdue"
      const countEl = document.querySelector('.tasks-count-line')
      if (countEl) {
        expect(countEl.textContent).not.toMatch(/0 overdue/)
      }
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

    // The "N overdue" text should be a button
    const overdueBtn = screen.getByRole('button', { name: /filter to.*overdue/i })
    expect(overdueBtn).toBeInTheDocument()

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
