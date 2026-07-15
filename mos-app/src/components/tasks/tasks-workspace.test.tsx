/**
 * PR-2 TasksTable tests — Task 9 (toolbar), Task 10 (Person-overrides-segment),
 * Task 11 (missing states + overdue filter button).
 * Tests that cover behavior via the full split-view (TasksLayout.test.tsx) are kept there.
 * These tests mount TasksTable directly to assert PR-2-specific additions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
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
const managerState: AuthState = {
  ...authedState,
  viewer: { ...authedState.viewer, isManager: true },
}

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Default task',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T10:00:00Z',
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

function makeSavedView(view: 'mine' | 'team' | 'overdue' | 'followups' | 'all' | 'unknown'): React.ComponentProps<typeof TasksWorkspace>['savedView'] {
  switch (view) {
    case 'mine':
      return { view, activeChip: 'mine' as const, segment: 'mine' as const, overdueOnly: false, reserved: null, search: '?view=mine' }
    case 'team':
      return { view, activeChip: 'team' as const, segment: 'all' as const, overdueOnly: false, reserved: null, search: '?view=team' }
    case 'overdue':
      return { view, activeChip: 'overdue' as const, segment: 'all' as const, overdueOnly: true, reserved: null, search: '?view=overdue' }
    case 'followups':
      return { view, activeChip: 'followups' as const, segment: 'all' as const, overdueOnly: false, reserved: 'followups' as const, search: '?view=followups' }
    case 'unknown':
      return { view, activeChip: null, segment: 'all' as const, overdueOnly: false, reserved: null, search: '?view=bogus' }
    case 'all':
    default:
      return { view: 'all' as const, activeChip: null, segment: 'all' as const, overdueOnly: false, reserved: null, search: '' }
  }
}

function renderTable(
  props: Partial<React.ComponentProps<typeof TasksWorkspace>> = {},
  auth: AuthState = authedState,
) {
  function Harness() {
    const initialSavedView = props.savedView ?? makeSavedView('all')
    const [savedView, setSavedView] = useState(initialSavedView)
    return (
      <TasksWorkspace
        {...props}
        savedView={savedView}
        onSavedViewChange={props.onSavedViewChange ?? ((next) => setSavedView(makeSavedView(next)))}
      />
    )
  }

  return render(
    <I18nProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/work/tasks']}>
          <Harness />
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
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

// ── F-A / OD-REDESIGN-61 — member phone disclosure (RED) ─────────────────────
// A member's first phone viewport must show work, not the configuration wall.
// The options control should be the only toolbar affordance before the card list.
describe('F-A / OD-REDESIGN-61 — member phone capture-first disclosure', () => {
  it('AC-W1-A: member phone shows a task card while View options starts collapsed', async () => {
    stubMatchMedia(false, false)
    mockListTasks.mockResolvedValue([makeTask({ title: 'First mobile work item' })])

    renderTable()
    await waitFor(() => screen.getByText('First mobile work item'))

    const options = screen.getByRole('button', { name: /view options/i })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('combobox', { name: /group/i })).toBeNull()
    expect(screen.getByTestId('task-card')).toContainElement(screen.getByText('First mobile work item'))
  })

  it('AC-W1-A: manager phone keeps the dense toolbar visible', async () => {
    stubMatchMedia(false, false)
    mockListTasks.mockResolvedValue([makeTask({ title: 'Manager mobile work item' })])

    renderTable({}, managerState)
    await waitFor(() => screen.getByText('Manager mobile work item'))

    expect(screen.queryByRole('button', { name: /view options/i })).toBeNull()
    expect(screen.getByRole('combobox', { name: /group/i })).toBeInTheDocument()
  })

  it('AC-W1-B: member phone keeps overdue filter and clear controls behind View options', async () => {
    stubMatchMedia(false, false)
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'late', title: 'Overdue mobile work', due_date: '2020-01-01' }),
      makeTask({ id: 'future', title: 'Future mobile work', due_date: '2030-12-31' }),
    ])

    renderTable()
    await waitFor(() => screen.getByText('Overdue mobile work'))

    expect(screen.queryByRole('button', { name: /filter to.*overdue/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /clear overdue filter/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /view options/i }))
    expect(screen.getByRole('button', { name: /filter to.*overdue/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /filter to.*overdue/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /clear overdue filter/i })).toBeInTheDocument())
  })

  it('AC-I-TASK: Indonesian locale translates the member disclosure and typed filter grammar', async () => {
    localStorage.setItem('mos.locale', 'id')
    stubMatchMedia(false, false)
    mockListTasks.mockResolvedValue([makeTask({ title: 'Pekerjaan pertama' })])

    renderTable()
    await waitFor(() => screen.getByText('Pekerjaan pertama'))

    expect(screen.getByRole('button', { name: 'Opsi tampilan' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Opsi tampilan' }))
    expect(screen.getByRole('button', { name: 'Pekerjaan saya' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Kelompok' })).toBeInTheDocument()
    localStorage.removeItem('mos.locale')
  })
})

// ── Visual-fidelity chrome (feat/ui-fidelity-tasks-chrome) ────────────────────
// Restores the signed mockup's toolbar/header idiom (mock-shell-and-table.html):
// view-tabs (Table active; Board/Calendar disabled "soon"), the My work/Team work
// segmented pill, chip-style filter controls, the content-header (count + inline
// New task), and a FLAT default list. Behavioral goal-oracles (filtering, segment
// scope, overdue filter, New task) are unchanged — these assert the new chrome.
describe('UI-fidelity chrome — view tabs (mockup `.vtab`)', () => {
  it('renders Table / Board / Calendar view-tabs with Table active', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    const tabs = screen.getByRole('tablist', { name: /view/i })
    expect(tabs).toBeInTheDocument()
    const table = screen.getByRole('tab', { name: /table/i })
    expect(table.getAttribute('aria-selected')).toBe('true')
  })

  it('Board and Calendar view-tabs are disabled placeholders ("soon")', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    const board = screen.getByRole('tab', { name: /board/i })
    const calendar = screen.getByRole('tab', { name: /calendar/i })
    expect(board).toBeDisabled()
    expect(calendar).toBeDisabled()
    expect(board.getAttribute('aria-disabled')).toBe('true')
    expect(calendar.getAttribute('aria-disabled')).toBe('true')
  })
})

describe('UI-fidelity chrome — chip-style filter controls (mockup `.chip`)', () => {
  it('Status / Business unit / Person / Group filters render as .chip controls', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    const { container } = renderTable()
    await waitFor(() => screen.getByText('A task'))
    // At least 4 chip controls (Group, Business unit, Status, Person)
    expect(container.querySelectorAll('.toolbar .chip').length).toBeGreaterThanOrEqual(4)
    // Each filter is still a reachable, labelled combobox (capability preserved)
    expect(screen.getByRole('combobox', { name: /group/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /business unit/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /status/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /person/i })).toBeInTheDocument()
  })

  it('the chip shows the current value (Status chip reflects the chosen status)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    const { container } = renderTable()
    await waitFor(() => screen.getByText('A task'))
    const statusSelect = screen.getByRole('combobox', { name: /status/i })
    fireEvent.change(statusSelect, { target: { value: 'Blocked' } })
    await waitFor(() => {
      const chip = container.querySelector('.toolbar .chip .ch-v')
      // Some chip's current-value span reads "Blocked" after the change
      const values = Array.from(container.querySelectorAll('.toolbar .chip .ch-v')).map(n => n.textContent)
      expect(values).toContain('Blocked')
      expect(chip).toBeTruthy()
    })
  })
})

describe('UI-fidelity chrome — default-flat list (mockup is ungrouped)', () => {
  it('defaults to a FLAT list — no group-header rows on first paint', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'a', title: 'Open one', status: 'Open' }),
      makeTask({ id: 'b', title: 'Blocked one', status: 'Blocked', responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Open one'))
    // Flat: leaf rows render, but NO group header rows by default.
    expect(document.querySelector('tr.task-row')).toBeTruthy()
    expect(document.querySelectorAll('tr.grp').length).toBe(0)
    // Group-by control still defaults to a flat (none) value.
    const groupSelect = screen.getByRole('combobox', { name: /group/i }) as HTMLSelectElement
    expect(groupSelect.value).toBe('none')
  })

  it('choosing a group dimension brings grouping back (capability preserved)', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'a', title: 'Open one', status: 'Open' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Open one'))
    await switchToAll()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'status' } })
    await waitFor(() => {
      expect(document.querySelectorAll('tr.grp').length).toBeGreaterThanOrEqual(4)
    })
  })
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
    expect(options).toContain('PIC')
    expect(options.some(o => o && /business unit/i.test(o))).toBe(true)
  })

  it('group-by control defaults to "none" / FLAT (UI-fidelity: mockup is ungrouped)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    const groupSelect = screen.getByRole('combobox', { name: /group/i }) as HTMLSelectElement
    // Default is FLAT to match the signed mockup; grouping is opt-in via the chip.
    expect(groupSelect.value).toBe('none')
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

// ── Task 10 — saved-view mapping + reserved state ─────────────────────────────

describe('Task 10 — saved-view mapping (AC-301/302/303/305/311)', () => {
  it('renders My work / Team work / Overdue / Follow-ups chips', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    expect(screen.getByRole('button', { name: 'My work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Team work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overdue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Follow-ups' })).toBeInTheDocument()
  })

  it('AC-301: view=mine seeds the shipped mine scope', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'mine', title: 'Mine task' }),
      makeTask({ id: 'other', title: 'Other task', responsible_person_id: 'other-id', accountable_person_id: 'other-id' }),
    ])
    renderTable({ savedView: makeSavedView('mine') })
    await waitFor(() => screen.getByText('Mine task'))
    expect(screen.queryByText('Other task')).toBeNull()
    expect(screen.getByRole('button', { name: 'My work' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('AC-302: view=overdue seeds overdue-only behavior', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'late', title: 'Late task', responsible_person_id: 'other-id', accountable_person_id: 'other-id', due_date: '2020-01-01' }),
      makeTask({ id: 'future', title: 'Future task', responsible_person_id: 'other-id', accountable_person_id: 'other-id', due_date: '2030-12-31' }),
    ])
    renderTable({ savedView: makeSavedView('overdue') })
    await waitFor(() => screen.getByText('Late task'))
    expect(screen.queryByText('Future task')).toBeNull()
    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /clear overdue filter/i })).toBeInTheDocument()
  })

  it('AC-303: view=team reuses the org-visible task set', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'mine', title: 'Mine task' }),
      makeTask({ id: 'shared', title: 'Shared task', responsible_person_id: 'other-id', accountable_person_id: 'other-id' }),
    ])
    renderTable({ savedView: makeSavedView('team') })
    await waitFor(() => screen.getByText('Mine task'))
    expect(screen.getByText('Shared task')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Team work' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('AC-311: view=followups shows reserved-state copy instead of task rows', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Ordinary task' })])
    renderTable({ savedView: makeSavedView('followups') })
    await waitFor(() => screen.getByRole('region', { name: /follow-ups/i }))
    expect(screen.getByText(/follow-ups are coming to this workspace/i)).toBeInTheDocument()
    expect(screen.getByText(/choose another view to review tasks/i)).toBeInTheDocument()
    expect(screen.queryByText('Ordinary task')).toBeNull()
  })

  it('AC-305: after view=mine loads, Group / Unit / Status / Person still work without rewriting the saved view', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'mine', title: 'Mine task' }),
      makeTask({ id: 'other', title: 'Shared blocked', responsible_person_id: 'other-id', accountable_person_id: 'other-id', status: 'Blocked' }),
    ])
    const onSavedViewChange = vi.fn()
    renderTable({ savedView: makeSavedView('mine'), onSavedViewChange })
    await waitFor(() => screen.getByText('Mine task'))

    fireEvent.change(screen.getByRole('combobox', { name: /group/i }), { target: { value: 'status' } })
    fireEvent.change(screen.getByRole('combobox', { name: /business unit/i }), { target: { value: 'bu-1' } })
    fireEvent.change(screen.getByRole('combobox', { name: /status/i }), { target: { value: 'Blocked' } })
    fireEvent.change(screen.getByRole('combobox', { name: /person/i }), { target: { value: 'other-id' } })

    await waitFor(() => {
      expect((screen.getByRole('combobox', { name: /group/i }) as HTMLSelectElement).value).toBe('status')
      expect((screen.getByRole('combobox', { name: /status/i }) as HTMLSelectElement).value).toBe('Blocked')
      expect((screen.getByRole('combobox', { name: /person/i }) as HTMLSelectElement).value).toBe('other-id')
    })
    expect(screen.getByRole('button', { name: 'My work' })).toHaveAttribute('aria-pressed', 'true')
    expect(onSavedViewChange).not.toHaveBeenCalled()
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
      expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /\+ new task/i })).toBeInTheDocument()
  })

  it('AC-133: no-results-after-filter shows distinct message + Clear filters + New task (not the empty-no-tasks copy)', async () => {
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

  // AC-D04 (PR-6 state-vocabulary lock): the table distinguishes a truly-empty result
  // ("no tasks" + create CTA) from a filtered-empty result ("no tasks match these filters"
  // + Clear filters) — they must NOT share copy. This is the durable cross-surface state
  // invariant the capstone audit verified; tagged here so grep -r AC-D04 finds the proof.
  it('AC-D04: filtered-empty copy differs from truly-empty copy (distinct state vocabulary)', async () => {
    // truly-empty
    mockListTasks.mockResolvedValue([])
    const { unmount } = renderTable()
    await waitFor(() => expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument())
    expect(screen.queryByText(/no tasks match these filters/i)).toBeNull()
    unmount()

    // filtered-empty (a task exists but the search matches nothing)
    mockListTasks.mockResolvedValue([makeTask({ title: 'Alpha task' })])
    renderTable()
    await waitFor(() => screen.getByText('Alpha task'))
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'zzz-no-match' } })
    await waitFor(() => expect(screen.getByText(/no tasks match these filters/i)).toBeInTheDocument())
    // distinct from the truly-empty copy + offers Clear filters
    expect(screen.queryByText(/no tasks yet/i)).toBeNull()
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
  })

  it('AC-133: zero-overdue omits the overdue segment entirely (no "0 overdue" in count line)', async () => {
    mockListTasks.mockResolvedValue([
      // Switch to All segment to make non-viewer tasks visible
      makeTask({ id: 't1', title: 'On time task', due_date: '2030-12-31' }),
    ])
    renderTable()
    await waitFor(() => screen.getByRole('heading', { name: /tasks/i }))
    await switchToAll()
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
    // Switch to the org-visible view to see both tasks
    await switchToAll()

    // Wait for both tasks visible
    await waitFor(() => {
      expect(screen.getByText('Overdue task')).toBeInTheDocument()
      expect(screen.getByText('Normal task')).toBeInTheDocument()
    })

    // The overdue control lives in the toolbar/options surface, not the page head.
    const overdueBtn = screen.getByRole('button', { name: /filter to.*overdue/i })
    expect(overdueBtn).toBeInTheDocument()
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

// Helper: switch to the org-visible saved view so non-viewer tasks are visible.
async function switchToAll() {
  const options = screen.queryByRole('button', { name: /view options/i })
  if (options?.getAttribute('aria-expanded') === 'false') fireEvent.click(options)
  fireEvent.click(screen.getByRole('button', { name: 'Team work' }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Team work' })).toHaveAttribute('aria-pressed', 'true')
  })
}

// Helper: opt into a group-by dimension (the default is FLAT after the UI-fidelity
// rework — grouping is now an explicit choice via the Group chip). Tests that assert
// grouping behavior select the dimension as a step; the GOAL-oracles are unchanged.
function selectGroupBy(value: 'none' | 'status' | 'owner' | 'bu') {
  const groupSelect = screen.getByRole('combobox', { name: /group/i })
  fireEvent.change(groupSelect, { target: { value } })
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
    expect(link.getAttribute('href')).toBe('/work/tasks/task-9')
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
    selectGroupBy('status') // opt into grouping (default is flat)
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
    selectGroupBy('status') // opt into grouping (default is flat)
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
    await switchToAll()
    selectGroupBy('status') // opt into grouping (default is flat) — then assert Status-group prefill
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
    await switchToAll()
    await waitFor(() => {
      expect(screen.getByText('Done past due')).toBeInTheDocument()
      expect(screen.getByText('Open past due')).toBeInTheDocument()
    })
    // The toolbar control counts only the open task, not the Done task.
    const overdueButton = screen.getByRole('button', { name: /filter to.*overdue/i })
    expect(overdueButton).toHaveTextContent('1 overdue')
    expect(overdueButton).not.toHaveTextContent('2 overdue')
  })

  it('RI-1: a Done task with a past due_date does NOT show the red "Overdue ·" row label', async () => {
    const overdueDate = '2020-01-01'
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Done past due', status: 'Done', due_date: overdueDate }),
    ])
    renderTable()
    await waitFor(() => screen.getByRole('heading', { name: /tasks/i }))
    await switchToAll()
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
    await switchToAll()
    selectGroupBy('status') // opt into grouping (default is flat) — then assert the Done group subtotal
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
    await switchToAll()
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
    await switchToAll()
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
    selectGroupBy('status') // opt into grouping (default is flat) — then assert grouped cards
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
    // Mockup overline is a literal 11px (the kit --ds-font-size-xs resolves ~13.6px, too large for this role).
    expect(body).toMatch(/font-size:\s*11px/)
  })
})

// ── PR-2 AC-T03..T07 wiring — the kit row craft (name Chip-link, status nowrap,
//    50px rows, hover-revealed checkbox + ⋯, select-all aria-checked="mixed").
//    Goal-oracle: the populated row carries the same 8-col anatomy the loading
//    skeleton already renders, the name is a real <a> with hover-bg + title, and
//    status never wraps. The app conforms to these; do not weaken them.
describe('PR-2 — AC-T03/T04/T05/T06/T07 row craft (wired)', () => {
  it('AC-T03: name cell is a real <a href="/work/tasks/:id"> Chip-link carrying title', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 't3', title: 'Wire the kit row craft' })])
    renderTable()
    await waitFor(() => screen.getByText('Wire the kit row craft'))
    const link = document.querySelector('tr.task-row a.task-row-link') as HTMLAnchorElement | null
    expect(link, 'expected a.task-row-link in the populated row').not.toBeNull()
    expect(link!.getAttribute('href')).toBe('/work/tasks/t3')
    // The name is an identity-bearing string → carries a title (no-bleed, AC-D03).
    expect(link!.getAttribute('title')).toBe('Wire the kit row craft')
    // Chip = hover-background affordance. The CSS targets .task-row-link; the chip
    // treatment is asserted via the rule body (hover bg) below.
  })

  it('AC-T03: the name link rule carries a hover-background (chip treatment, not plain text)', () => {
    const body = cssRuleBody('.task-row-link')
    // kit Chip: hover bg + radius. Accept either a :hover rule on .task-row-link or a
    // background on the link itself; the mockup's .name-chip is hover-bg → tertiary.
    // We assert the link is NOT bare (display:block + color:inherit only) — it has a
    // border-radius and/or a hover background rule exists.
    const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
    const hasHoverBg = /\.task-row-link[^{]*:hover[^{]*\{[^}]*background/.test(css)
    const hasRadius = /border-radius/.test(body)
    expect(hasHoverBg || hasRadius, 'name link must have a chip affordance (hover bg or radius)').toBe(true)
  })

  it('AC-T05: status cell renders StatusPill text + dot, never wraps (td-nowrap)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 't5', title: 'Status row', status: 'Blocked' })])
    renderTable()
    await waitFor(() => screen.getByText('Status row'))
    // The status word is present inside the row's pill (the non-color cue). Scope to
    // the body row's pill — "Blocked" also appears as a filter dropdown <option>.
    const pill = document.querySelector('tr.task-row .mk-tag') as HTMLElement | null
    expect(pill, 'expected a status pill (.mk-tag) in the row').not.toBeNull()
    expect(pill!.textContent).toContain('Blocked')
    // StatusPill renders a leading dot (never color-alone) inside the pill.
    expect(pill!.querySelector('.status-dot'), 'expected a leading status dot').not.toBeNull()
    // The status cell never wraps (td-nowrap).
    const statusCell = document.querySelector('tr.task-row td.td-status') as HTMLElement | null
    expect(statusCell, 'expected a td-status cell').not.toBeNull()
    expect(statusCell!.className).toContain('td-nowrap')
  })

  it('AC-T06: body row is 50px tall (OD-P3-6 dense DB-view)', () => {
    // The row height is owned by .td-main/.td-cell (height:50px). Assert the rule.
    const body = cssRuleBody('.td-main, .td-cell')
    expect(body).toMatch(/height:\s*50px/)
  })

  it('AC-T07: thead has a select-all checkbox exposing aria-checked="mixed" when partial', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'a', title: 'A' }),
      makeTask({ id: 'b', title: 'B' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('A'))
    // The select-all lives in the thead's leading cell.
    const selectAll = document.querySelector('thead [role="checkbox"]') as HTMLElement | null
    expect(selectAll, 'expected a select-all checkbox in the thead').not.toBeNull()
    // With nothing selected it reads "false"; toggle one row → "mixed".
    expect(selectAll!.getAttribute('aria-checked')).toBe('false')
    // Select one of two rows.
    const rowCheckboxes = document.querySelectorAll('tbody [role="checkbox"]')
    expect(rowCheckboxes.length).toBe(2)
    fireEvent.click(rowCheckboxes[0])
    expect(selectAll!.getAttribute('aria-checked')).toBe('mixed')
  })

  it('AC-T02/T07: every row (header, skeleton, body) agrees on column count (no-bleed)', async () => {
    // The skeleton already renders 8 cells (td-cb + 6 + td-menu). The populated row
    // and thead must agree, else a long group header colSpan misaligns the grid.
    mockListTasks.mockResolvedValue([makeTask({ id: 'cc', title: 'Column count' })])
    renderTable()
    await waitFor(() => screen.getByText('Column count'))
    const ths = document.querySelectorAll('thead tr th')
    const bodyRow = document.querySelector('tr.task-row') as HTMLElement | null
    expect(bodyRow, 'expected a populated task row').not.toBeNull()
    const tds = bodyRow!.querySelectorAll('td')
    // Thead and body row must have the same column count (the checkbox col counts on both).
    expect(tds.length, 'thead th count must equal body td count').toBe(ths.length)
    expect(ths.length).toBeGreaterThanOrEqual(7) // 6 data cols + checkbox + (menu is in-row)
  })
})

// ── Wave 2c — desktop table density (OD-REDESIGN-61..64, e7 priority columns) ───
// The design re-review found the desktop Tasks table overflowed at 1280px
// (10 cols ≈ 1284px in a <1284px content area), clipping the decision-critical
// Due column off-screen. Option A: the default desktop DB-view shows ONLY the
// e7 priority decision columns (Title · PIC · Supervisor · Status · Due);
// Project/Process, Objective, Team, Source, Activity move to the record drawer
// (where the typed Task already shows them — OD-62). This is column PRIORITY,
// not data removal. Tagged so grep -r AC-W2C finds the proof.
describe('AC-W2C — desktop density: Due in-frame, optional cols in drawer', () => {
  it('AC-W2C: renders ONLY the priority headers (Task/Status/PIC/Supervisor/Due) at desktop', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Density task' })])
    renderTable()
    await waitFor(() => screen.getByText('Density task'))
    // Priority decision headers present (Due MUST be in the first paint).
    expect(screen.getByRole('columnheader', { name: /^task$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^status$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^pic$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^supervisor$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^due$/i })).toBeInTheDocument()
    // Optional headers moved OUT of the default table (to the drawer/full page).
    expect(screen.queryByRole('columnheader', { name: /project\/process/i })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: /^objective$/i })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: /^team$/i })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: /^source$/i })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: /^activity$/i })).toBeNull()
  })

  it('AC-W2C: a body row renders exactly the priority cells — no optional td-workline/objective/source/activity/bu', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'd1', title: 'Density row' })])
    renderTable()
    await waitFor(() => screen.getByText('Density row'))
    const row = document.querySelector('tr.task-row')!
    // 7 cells: cb + Task + Status + PIC + Supervisor + Due + menu (no optional cols).
    expect(row.querySelectorAll('td').length).toBe(7)
    // Optional cells gone (moved to drawer)…
    expect(row.querySelector('.td-workline')).toBeNull()
    expect(row.querySelector('.td-objective')).toBeNull()
    expect(row.querySelector('.td-source')).toBeNull()
    expect(row.querySelector('.td-activity')).toBeNull()
    expect(row.querySelector('.td-bu')).toBeNull()
    // …priority data cells present.
    expect(row.querySelector('.td-owner')).toBeTruthy()      // PIC
    expect(row.querySelector('.td-supervisor')).toBeTruthy()
    expect(row.querySelector('.due-calm,.due-soon,.due-overdue')).toBeTruthy() // Due
  })

  it('AC-W2C: .tasks-table min-width no longer forces a 1284px overflow (Due cannot clip at 1280px)', () => {
    // The regression's root cause was `.tasks-table { min-width: 1284px }`: in any
    // content area < 1284px (the live split at 1280px ≈ 994px), the table overflowed
    // and the right-hand Due column scrolled out of the first paint. The fix drops
    // the authored min-width to a value that fits the desktop content width.
    const body = cssRuleBody('.tasks-table')
    const m = body.match(/min-width:\s*(\d+)px/)
    const minPx = m ? Number(m[1]) : 0 // removed entirely (width:100%) is also valid
    expect(minPx, 'min-width must fit a ~994px content area so Due is never clipped')
      .toBeLessThanOrEqual(1000)
  })
})
