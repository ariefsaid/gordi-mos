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
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { OverlayHostProvider } from '@/shell/overlay-host'
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
vi.mock('../../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))

import { listTasks, getTask, updateTaskFields } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { TasksWorkspace } from './tasks-workspace'
import { taskCollectionDescriptor } from './task-collection-adapter'

const mockListTasks = vi.mocked(listTasks)
const mockGetTask = vi.mocked(getTask)
const mockUpdateTaskFields = vi.mocked(updateTaskFields)

const VIEWER_ID = 'viewer-id'
const VIEWER_PERSON: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Arief Said',
  email: 'arief@example.test', must_change_password: false, archived_at: null,
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

function stubMatchMedia(split = true, desktop = true, narrow = !desktop) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      let matches = false
      if (query.includes('1100')) matches = split
      else if (query.includes('919')) matches = narrow // useIsNarrow — rail collapsed / FAB present
      else if (query.includes('768')) matches = desktop
      return {
        matches, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }
    },
  })
}

function makeSavedView(view: 'mine' | 'overdue' | 'followups' | 'all' | 'unknown'): React.ComponentProps<typeof TasksWorkspace>['savedView'] {
  switch (view) {
    case 'mine':
      return { view, activeChip: 'mine' as const, segment: 'mine' as const, overdueOnly: false, reserved: null, search: '?view=mine' }
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
          <OverlayHostProvider>
            <Harness />
          </OverlayHostProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

// D-A1 (fix work-order item 4) + I2 (#379) share this harness: render at an explicit route and
// observe the location as the workspace navigates (?record= open/close journeys).
function renderAt(entries: string[]) {
  let current: ReturnType<typeof useLocation> | null = null
  function LocationProbe() {
    current = useLocation()
    const navigate = useNavigate()
    return <button type="button" onClick={() => navigate(-1)}>Back</button>
  }
  const utils = render(
    <I18nProvider>
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={entries}>
          <OverlayHostProvider>
            <LocationProbe />
            <TasksWorkspace savedView={makeSavedView('all')} onSavedViewChange={() => {}} />
          </OverlayHostProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
  return { ...utils, getLocation: () => current }
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  __resetTasksViewPrefForTests()
  stubMatchMedia(true, true)
  vi.mocked(getBusinessUnits).mockResolvedValue(BUS)
  vi.mocked(getPeople).mockResolvedValue(PEOPLE)
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(listWorkLines).mockResolvedValue([])
})

describe('FR-V3-013 — live Tasks collection wiring', () => {
  it('TasksWorkspace renders the canonical collection surface through the typed descriptor loader', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'One loader task' })])
    const load = vi.spyOn(taskCollectionDescriptor, 'load')

    renderTable()

    await waitFor(() => expect(screen.getByText('One loader task')).toBeInTheDocument())
    expect(load).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-collection-status="ready"]')).toBeTruthy()
  })
})

// Helper: group/sort (and toggles) are progressively disclosed. On phone that is the single
// "View & filters" wrapper; on desktop it is the toolbar's own "View options" trigger. Open
// whichever is present and collapsed — the capability itself is the goal-oracle, unchanged.
function ensureViewOptionsOpen() {
  const trigger = screen.queryByRole('button', { name: /view & filters|view options/i })
  if (trigger?.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger)
}

// ── F-A / OD-REDESIGN-61 — member phone disclosure (RED) ─────────────────────
// A member's first phone viewport must show work, not the configuration wall.
// The options control should be the only toolbar affordance before the card list.
describe('F-A / OD-REDESIGN-61 — member phone capture-first disclosure', () => {
  it('AC-W1-A: member phone shows a task card while View options starts collapsed', async () => {
    stubMatchMedia(false, false)
    mockListTasks.mockResolvedValue([makeTask({ title: 'First mobile work item' })])

    renderTable()
    await waitFor(() => screen.getByText('First mobile work item'))

    const options = screen.getByRole('button', { name: /view & filters|view options/i })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('combobox', { name: /group/i })).toBeNull()
    expect(screen.getByTestId('task-card')).toContainElement(screen.getByText('First mobile work item'))
  })

  it('Rule 8/11: the whole filter stack collapses behind the single shared "View options" disclosure, and reveals on expand', async () => {
    // The member phone filter stack (Group · Business unit · Status · Person + search)
    // folds behind ONE affordance — the SAME ViewOptionsDisclosure primitive Home uses
    // (Rule 11 reuse). Work leads; the configuration is one tap away, not the front wall.
    stubMatchMedia(false, false)
    mockListTasks.mockResolvedValue([makeTask({ title: 'Phone work item' })])

    renderTable()
    await waitFor(() => screen.getByText('Phone work item'))

    // Collapsed: every filter combobox is out of the DOM behind the disclosure.
    for (const name of [/group/i, /business unit/i, /status/i, /person/i]) {
      expect(screen.queryByRole('combobox', { name })).toBeNull()
    }
    const options = screen.getByRole('button', { name: /view & filters|view options/i })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    expect(options).toHaveAttribute('aria-controls', 'mobile-task-options-panel')

    // Expanding the ONE control reveals the full filter capability (no filter is lost).
    fireEvent.click(options)
    expect(options).toHaveAttribute('aria-expanded', 'true')
    for (const name of [/group/i, /business unit/i, /status/i, /person/i]) {
      expect(screen.getByRole('combobox', { name })).toBeInTheDocument()
    }
  })

  // RATIFY-BEFORE-MERGE: Luna 390 audit (b) — manager phones now ALSO collapse the View & filters
  // config behind the single disclosure so the first task card is above the fold. This reverses
  // OD-REDESIGN-61's member-only "manager keeps the dense toolbar" exemption at phone width.
  it('AC-W1-A (Luna 390): manager phone collapses config behind the View & filters disclosure so the first card leads', async () => {
    stubMatchMedia(false, false)
    mockListTasks.mockResolvedValue([makeTask({ title: 'Manager mobile work item' })])

    renderTable({}, managerState)
    await waitFor(() => screen.getByText('Manager mobile work item'))

    const options = screen.getByRole('button', { name: /view & filters|view options/i })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    // Collapsed: the dense toolbar's filter comboboxes are out of the DOM; the first card leads.
    expect(screen.queryByRole('combobox', { name: /group/i })).toBeNull()
    expect(screen.getByTestId('task-card')).toContainElement(screen.getByText('Manager mobile work item'))
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

    fireEvent.click(screen.getByRole('button', { name: /view & filters|view options/i }))
    expect(screen.getByRole('button', { name: /filter to.*overdue/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /filter to.*overdue/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /clear overdue filter/i })).toBeInTheDocument())
  })

  // RATIFY-BEFORE-MERGE: Luna 390 audit (d) — one create door. The header "+ Create task" is the
  // DESKTOP door; on phone the single door is the global Action Launcher FAB (DESIGN.md one-launcher
  // rule), so the in-page header create button is hidden at phone width to kill the duplicate door.
  it('AC-W1-D (Luna 390): desktop shows the header "+ Create task" door; phone hides it (single FAB door)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Only work item' })])

    // Desktop: the header create door is present.
    stubMatchMedia(true, true)
    const desktop = renderTable()
    await waitFor(() => screen.getByText('Only work item'))
    expect(screen.getByRole('link', { name: '+ Create task' })).toBeInTheDocument()
    desktop.unmount()

    // Phone: no in-page header create button — the single phone create door is the global FAB
    // (rendered by the app shell, not this component).
    stubMatchMedia(false, false)
    renderTable()
    await waitFor(() => screen.getByText('Only work item'))
    expect(screen.queryByRole('link', { name: '+ Create task' })).toBeNull()
  })

  // DO-17 (census-sweep R2 tasks FINDING2): the shell's Action Launcher FAB exists whenever the
  // rail is collapsed (isNarrow, <920) — so in the 768–919 band (desktop by useIsDesktop, but
  // narrow by useIsNarrow) the header door must hide too, or BOTH create doors co-exist.
  it('DO-17: the 768–919 band hides the header create door (FAB owns it while the rail is collapsed)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Only work item' })])
    stubMatchMedia(false, true, true) // not split, ≥768, but rail collapsed (<920)
    renderTable()
    await waitFor(() => screen.getByText('Only work item'))
    expect(screen.queryByRole('link', { name: '+ Create task' })).toBeNull()
  })

  it('AC-I-TASK: Indonesian locale translates the member disclosure and typed filter grammar', async () => {
    localStorage.setItem('mos.locale', 'id')
    stubMatchMedia(false, false)
    mockListTasks.mockResolvedValue([makeTask({ title: 'Pekerjaan pertama' })])

    renderTable()
    await waitFor(() => screen.getByText('Pekerjaan pertama'))

    expect(screen.getByRole('button', { name: 'Tampilan & filter' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tampilan & filter' }))
    expect(screen.getByRole('button', { name: 'Pekerjaan saya' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Kelompok' })).toBeInTheDocument()
    localStorage.removeItem('mos.locale')
  })
})

// V3 Issue 3, Task 7/8 — Tasks is the Workspace page-family representative.
describe('TasksWorkspace — V3 Workspace frame (Issue 3)', () => {
  it('mounts Tasks inside the Workspace page family with one main, one h1, and the Tasks job sentence', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 't1', title: 'Prep the bar' })])
    renderTable()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: /^tasks$/i }))

    // Exactly one <main> landmark, carrying the workspace family marker.
    const mains = document.querySelectorAll('main')
    expect(mains).toHaveLength(1)
    expect(mains[0].getAttribute('data-page-family')).toBe('workspace')

    // Exactly one h1 — the Tasks title (never the internal family name).
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)

    // The Tasks job sentence is visible; the internal family name never renders as chrome.
    expect(screen.getByText('Find and do the work I own or my Team owns.')).toBeInTheDocument()
    expect(screen.queryByText('Workspace')).toBeNull()

    // The typed Tasks region survives the frame swap.
    expect(screen.getByRole('region', { name: /tasks/i })).toBeInTheDocument()
  })

  it('marks the loading state on the Workspace frame before tasks resolve', () => {
    mockListTasks.mockReturnValue(new Promise(() => {}))
    renderTable()
    const main = document.querySelector('main')
    expect(main?.getAttribute('data-page-family')).toBe('workspace')
    expect(main?.getAttribute('data-page-state')).toBe('loading')
    expect(main?.getAttribute('aria-busy')).toBe('true')
  })
})

// ── Visual-fidelity chrome (feat/ui-fidelity-tasks-chrome) ────────────────────
// Restores the signed mockup's toolbar/header idiom (mock-shell-and-table.html):
// the live Table presentation (no decorative future tabs), built-in work views,
// shared collection filter controls, the content-header (count + inline
// Create task), and a FLAT default list. Behavioral goal-oracles (filtering, segment
// scope, overdue filter, Create task) are unchanged — these assert the new chrome.
describe('V3 collection grammar — live presentation tabs', () => {
  it('renders the one live Task presentation with Table active', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    const tabs = screen.getByRole('tablist', { name: /view/i })
    expect(tabs).toBeInTheDocument()
    const table = screen.getByRole('tab', { name: /table/i })
    expect(table.getAttribute('aria-selected')).toBe('true')
  })

  it('omits unsupported Board and Calendar presentations instead of decorative disabled tabs', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    expect(screen.queryByRole('tab', { name: /board/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /calendar/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('record-collection-toolbar')).toBeInTheDocument()
  })
})

describe('V3 collection grammar — shared filter controls', () => {
  it('Status / Business unit / Person / Group / Sort use the shared Select shell', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    const { container } = renderTable()
    await waitFor(() => screen.getByText('A task'))
    ensureViewOptionsOpen()
    expect(container.querySelectorAll('.collection-toolbar .mk-select').length).toBeGreaterThanOrEqual(5)
    // Each filter is still a reachable, labelled combobox (capability preserved)
    expect(screen.getByRole('combobox', { name: /group/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /business unit/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /status/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /person/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /sort/i })).toBeInTheDocument()
  })

  it('the shared Status control reflects the chosen value', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    ensureViewOptionsOpen()
    const statusSelect = screen.getByRole('combobox', { name: /status/i })
    fireEvent.change(statusSelect, { target: { value: 'Blocked' } })
    await waitFor(() => {
      expect(statusSelect).toHaveValue('Blocked')
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
    ensureViewOptionsOpen()
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
    ensureViewOptionsOpen()
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
    ensureViewOptionsOpen()
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
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i }) as HTMLSelectElement
    // Default is FLAT to match the signed mockup; grouping is opt-in via the chip.
    expect(groupSelect.value).toBe('none')
  })

  it('changing group-by persists the choice to localStorage (flat — no grouping output in PR-2)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    ensureViewOptionsOpen()
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
  it('§Task-11: renders All / My work / Overdue / Follow-ups chips — NO Team-work chip (Issue-8 gate)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overdue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AR Follow-ups' })).toBeInTheDocument()
    // DELIBERATE goal change (record-collection plan §Task-11): the legacy Team-work chip is removed
    // until Issue 8 lands the real Task team_id contract.
    expect(screen.queryByRole('button', { name: 'Team work' })).toBeNull()
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
    ensureViewOptionsOpen()
    expect(screen.getByRole('button', { name: /clear overdue filter/i })).toBeInTheDocument()
  })

  it('§Task-11: the org-visible task set is the All view (the removed Team-work chip is gone)', async () => {
    // DELIBERATE goal change (§Task-11): "Team work" no longer exists as a saved view; the
    // org-visible set is reached via All, which is the default view.
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'mine', title: 'Mine task' }),
      makeTask({ id: 'shared', title: 'Shared task', responsible_person_id: 'other-id', accountable_person_id: 'other-id' }),
    ])
    renderTable({ savedView: makeSavedView('all') })
    await waitFor(() => screen.getByText('Mine task'))
    expect(screen.getByText('Shared task')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Team work' })).toBeNull()
  })

  it('AC-311: view=followups shows reserved-state copy instead of task rows', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Ordinary task' })])
    renderTable({ savedView: makeSavedView('followups') })
    await waitFor(() => screen.getByRole('region', { name: /follow-ups/i }))
    expect(screen.getByText(/follow-ups are coming to this workspace/i)).toBeInTheDocument()
    expect(screen.getByText(/choose another view to review tasks/i)).toBeInTheDocument()
    expect(screen.queryByText('Ordinary task')).toBeNull()
  })

  // Census R2 DO-6 (follow-ups F1 P1 + F2 P2): the reserved view must not lie about its scope
  // ("11 items in your scope" counted TASKS) nor render live row-operating controls above a
  // coming-soon placeholder. Only the view chips — the way back out — survive.
  it('DO-6: the reserved Follow-ups view shows no task count and no dead row controls', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'task-1', title: 'Ordinary task' }),
      makeTask({ id: 'task-2', title: 'Second task' }),
    ])
    renderTable({ savedView: makeSavedView('followups') })
    await waitFor(() => screen.getByRole('region', { name: /follow-ups/i }))

    // The result header never claims the task count as follow-up scope — it shows the honest "—".
    const header = screen.getByTestId('collection-result-header')
    expect(header.textContent).not.toMatch(/\d+ items in your scope/)
    expect(header.textContent).toContain('—')
    // The page head's meta sentence is a placeholder too, not "2 tasks".
    expect(screen.getByTestId('tasks-count-line').textContent?.trim()).toBe('—')

    // No dead row-operating controls: search, the View & filters door, the Table/Card switch.
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /view & filters/i })).toBeNull()
    expect(screen.queryByRole('tab', { name: /table/i })).toBeNull()

    // The view chips stay — they are the door out of the reserved view.
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AR Follow-ups' })).toBeInTheDocument()
  })

  it('AC-305: after view=mine loads, Group / Unit / Status / Person still work without rewriting the saved view', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'mine', title: 'Mine task' }),
      makeTask({ id: 'other', title: 'Shared blocked', responsible_person_id: 'other-id', accountable_person_id: 'other-id', status: 'Blocked' }),
    ])
    const onSavedViewChange = vi.fn()
    renderTable({ savedView: makeSavedView('mine'), onSavedViewChange })
    await waitFor(() => screen.getByText('Mine task'))

    ensureViewOptionsOpen()
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

  it('AC-133: empty (no tasks, no active filter) shows segment-aware empty copy + Create task CTA', async () => {
    mockListTasks.mockResolvedValue([])
    renderTable()
    await waitFor(() => {
      expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /\+ create task/i })).toBeInTheDocument()
  })

  it('AC-133: no-results-after-filter shows distinct message + Clear filters + Create task (not the empty-no-tasks copy)', async () => {
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
    // + Create task CTA present
    expect(screen.getByRole('link', { name: /\+ create task/i })).toBeInTheDocument()
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

// Helper: switch to the org-visible All saved view so non-viewer tasks are visible.
// (§Task-11: the Team-work chip was removed; All is the org-visible set.)
async function switchToAll() {
  const options = screen.queryByRole('button', { name: /view & filters|view options/i })
  if (options?.getAttribute('aria-expanded') === 'false') fireEvent.click(options)
  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })
}

// Helper: opt into a group-by dimension (the default is FLAT after the UI-fidelity
// rework — grouping is now an explicit choice via the Group chip). Tests that assert
// grouping behavior select the dimension as a step; the GOAL-oracles are unchanged.
function selectGroupBy(value: 'none' | 'status' | 'owner' | 'bu') {
  ensureViewOptionsOpen()
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

  it('opens a task in the shared RecordViewer overlay instead of a route-local drawer', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-overlay', title: 'Shared viewer task' })])
    renderTable()
    await waitFor(() => screen.getByText('Shared viewer task'))

    fireEvent.click(document.querySelector('tr.task-row') as HTMLElement)

    await waitFor(() => {
      expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeTruthy()
    })
  })

  // D-A1 (fix work-order item 4): a Task drawer opened from a list row must be URL-addressable
  // (?record=<id>) exactly like a Signal, so a bookmark/refresh of "the task I'm working on"
  // restores it instead of dropping to a bare list. RULED by OD-REDESIGN-19/63 + I1/I7.
  describe('D-A1 — Task open is URL-addressable (?record=)', () => {
    it('clicking a task row writes ?record=<id> into the URL (bookmarkable/shareable)', async () => {
      mockListTasks.mockResolvedValue([makeTask({ id: 'task-addr', title: 'Addressable task' })])
      const { getLocation } = renderAt(['/work/tasks'])
      await waitFor(() => screen.getByText('Addressable task'))
      fireEvent.click(document.querySelector('tr.task-row') as HTMLElement)
      await waitFor(() => expect(getLocation()?.search).toContain('record=task-addr'))
      expect(
        document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]'),
      ).toBeTruthy()
    })

    it('bookmark/refresh: rendering at /work/tasks?record=<id> restores the open task drawer', async () => {
      const task = makeTask({ id: 'task-restore', title: 'Restored task' })
      mockListTasks.mockResolvedValue([task])
      mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
      renderAt(['/work/tasks?record=task-restore'])
      await waitFor(() =>
        expect(
          document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]'),
        ).toBeTruthy(),
      )
    })

    it('Browser Back from an in-app-opened drawer returns to the collection and clears ?record=', async () => {
      const task = makeTask({ id: 'task-clear', title: 'Clearable task' })
      mockListTasks.mockResolvedValue([task])
      mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
      const { getLocation } = renderAt(['/work/tasks'])
      await waitFor(() => screen.getByText('Clearable task'))
      fireEvent.click(document.querySelector('tr.task-row') as HTMLElement)
      await waitFor(() =>
        expect(
          document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]'),
        ).toBeTruthy(),
      )
      await waitFor(() => expect(getLocation()?.search).toContain('record=task-clear'))

      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      await waitFor(() =>
        expect(
          document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]'),
        ).toBeNull(),
      )
      expect(getLocation()?.search ?? '').not.toContain('record=')
    })
  })

  // I2 (issue #379, audit 8e4c0e93 finding 4): ✕ and Esc → underlying page with focus returned to
  // the OPENER. The opener of a Tasks row click is the row's title link; a click on a
  // non-focusable cell leaves DOM focus on <body>, which the shared RecordPanelHost then captured
  // as its invoker — so Escape returned focus to the page region. fireEvent deliberately does not
  // move focus, mirroring the live body-focus case.
  describe('I2 — record panel close returns focus to the invoking row (issue #379)', () => {
    it('Escape after a row-click open returns focus to the invoking row link', async () => {
      const task = makeTask({ id: 'task-i2', title: 'I2 focus row' })
      mockListTasks.mockResolvedValue([task])
      mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
      renderAt(['/work/tasks'])
      await waitFor(() => screen.getByText('I2 focus row'))
      const row = document.querySelector('tr.task-row') as HTMLElement
      fireEvent.click(row)
      const panel = await waitFor(() =>
        document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]') as HTMLElement,
      )
      fireEvent.keyDown(panel, { key: 'Escape' })
      await waitFor(() =>
        expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeNull(),
      )
      expect(document.activeElement).toBe(row.querySelector('a.task-row-link'))
    })

    it('Escape after a j/k+Enter open returns focus to the cursor row link', async () => {
      const first = makeTask({ id: 'task-c1', title: 'Cursor one' })
      const second = makeTask({ id: 'task-c2', title: 'Cursor two' })
      mockListTasks.mockResolvedValue([first, second])
      mockGetTask.mockResolvedValue({ task: first, checklist: [], events: [] })
      renderAt(['/work/tasks'])
      await waitFor(() => screen.getByText('Cursor one'))
      fireEvent.keyDown(window, { key: 'j' })
      await waitFor(() => expect(document.querySelector('tr.task-row.kfocus')?.textContent).toContain('Cursor one'))
      fireEvent.keyDown(window, { key: 'Enter' })
      const panel = await waitFor(() =>
        document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]') as HTMLElement,
      )
      fireEvent.keyDown(panel, { key: 'Escape' })
      await waitFor(() =>
        expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeNull(),
      )
      const cursorRow = document.querySelector('tr.task-row.kfocus') as HTMLElement
      expect(document.activeElement).toBe(cursorRow.querySelector('a.task-row-link'))
    })

    it('Issue #379 I3 phone: Escape on the open View & filters door closes it', async () => {
      stubMatchMedia(false, false)
      mockListTasks.mockResolvedValue([makeTask({ title: 'Phone escape work' })])
      renderTable()
      await waitFor(() => screen.getByText('Phone escape work'))
      const options = screen.getByRole('button', { name: /view & filters/i })
      fireEvent.click(options)
      expect(options).toHaveAttribute('aria-expanded', 'true')
      fireEvent.keyDown(options, { key: 'Escape' })
      expect(options).toHaveAttribute('aria-expanded', 'false')
      expect(options).toHaveFocus()
    })

    it('Issue #379 I3 phone: Escape in the save-view input closes only the save row — the door stays open', async () => {
      stubMatchMedia(false, false)
      mockListTasks.mockResolvedValue([makeTask({ title: 'Phone save isolation' })])
      renderTable()
      await waitFor(() => screen.getByText('Phone save isolation'))
      fireEvent.click(screen.getByRole('button', { name: /view & filters/i }))
      fireEvent.click(screen.getByRole('button', { name: /save view/i }))
      const input = screen.getByRole('textbox', { name: /view name/i })
      input.focus()
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(screen.queryByRole('textbox', { name: /view name/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /view & filters/i })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('button', { name: /save view/i })).toHaveFocus()
    })
  })

  it('AC-V3-008: a dirty task overlay asks before Close, keeps the record on Cancel, and leaves on Discard', async () => {
    const task = makeTask({ id: 'task-dirty', title: 'Dirty task' })
    mockListTasks.mockResolvedValue([task])
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderTable()

    await waitFor(() => screen.getByText('Dirty task'))
    fireEvent.click(document.querySelector('tr.task-row') as HTMLElement)
    // Value-first: activate the Due row to swap in the date control.
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Due' }))
    const due = screen.getByLabelText('Due') as HTMLInputElement
    mockUpdateTaskFields.mockRejectedValue(new Error('offline'))
    fireEvent.change(due, { target: { value: '2026-08-01' } })
    fireEvent.keyDown(due, { key: 'Enter' })
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(/discard unsaved changes/i)
    expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeTruthy()

    // The field remains usable after Stay; make a fresh failed draft before exercising Discard.
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '2026-08-02' } })
    fireEvent.keyDown(screen.getByLabelText('Due'), { key: 'Enter' })
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    fireEvent.click(await screen.findByRole('button', { name: /discard changes/i }))
    await waitFor(() => expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeNull())
  })

  // AC-V3-008b — the clean-record half of the dirty-leave contract (I2/I5, brief step 4):
  // a record with NO uncommitted edit closes on Escape with NO retain/discard dialog.
  // AC-V3-008 proves the dirty veto via the Close button; this proves the no-dirty close via
  // Escape through the live host's native keydown listener (the same path Esc always takes).
  it('AC-V3-008b: a clean record closes on Escape with NO confirm dialog', async () => {
    const task = makeTask({ id: 'task-clean', title: 'Clean task' })
    mockListTasks.mockResolvedValue([task])
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderTable()

    await waitFor(() => screen.getByText('Clean task'))
    fireEvent.click(document.querySelector('tr.task-row') as HTMLElement)
    const panel = await waitFor(() =>
      document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]') as HTMLElement,
    )
    // No field edit was made → the record is clean; no dialog is ever shown.
    expect(screen.queryByRole('dialog')).toBeNull()

    // Escape reaches the panel's native keydown listener → host.close('escape') → clean commit.
    fireEvent.keyDown(panel, { key: 'Escape' })

    await waitFor(() =>
      expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeNull(),
    )
    // The leave-guard was never consulted (no guard attached while clean) → no dialog.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // NOTE (DO-18): the "clean panel closed via ✕/Escape stays closed (no self-reopen), ?record=
  // cleared" regression is a REAL-BrowserRouter history bug — opening a task PUSHed TWO history
  // entries (the collection's ?record= AND the host's route marker), so an explicit close's single
  // -1 pop (historyDeltaForClose(0)) landed on a still-?record= entry and the collection open effect
  // resurrected the just-closed session. MemoryRouter flushes navigate(-1) synchronously inside
  // act(), so jsdom cannot reproduce the timing (AC-V3-008b already closes cleanly here on the
  // unfixed code). Its regression proof lives at the e2e layer: e2e/tasks-record-close.spec.ts
  // (mirrors tasks-browser-back-dirty-veto.spec.ts's real-browser rationale). The fix collapses the
  // open to ONE history step: overlay-host's openRoot gained a `replaceMarker` flag, and this
  // collection passes it (host.openRoot(taskEntry, 'route', true)) so the depth-0 marker REPLACES
  // the ?record= entry the collection already pushed instead of duplicating it — close's -1 then
  // lands on the clean collection URL. The single-push shape is asserted end-to-end by the e2e.

  // AC-V3-008c — the field-Escape isolation + dirty-record × Escape-key journey, ratified
  // by OD-REDESIGN-83.1: on a focused DIRTY field the FIRST Escape cancels only that
  // field's draft (no dialog, panel stays); a SECOND Escape — once the field draft is clean,
  // or with focus outside the field on a record that still has other uncommitted dirty state
  // — is the panel-close intent and fires the retain/discard leave-guard. AC-V3-008 proved the
  // dirty veto via the Close (✕) button; AC-V3-008b proved Escape closes a CLEAN record with
  // no dialog. This proves both halves of the ratified keyboard contract through the live
  // host: (1) the FIRST Escape on the focused dirty input isolates (RecordField's native
  // capture-phase listener cancels the draft and shields the host's native panel listener),
  // and (2) a later panel-level Escape on the still-dirty record reaches the host close path
  // and fires the guard. The persisted dirty state is a FAILED commit (FieldErrorRetryContract)
  // — the realistic state where an uncommitted edit survives long enough for a later leave.
  it('AC-V3-008c: first Escape on a focused dirty field cancels only the draft (no dialog); a later panel Escape on the still-dirty record fires the retain/discard guard (Cancel keeps, Discard closes)', async () => {
    const task = makeTask({ id: 'task-dirty-esc', title: 'Dirty escape task', due_date: '2026-07-01' })
    mockListTasks.mockResolvedValue([task])
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    renderTable()

    await waitFor(() => screen.getByText('Dirty escape task'))
    fireEvent.click(document.querySelector('tr.task-row') as HTMLElement)
    // Value-first: activate the Due row to swap in the date control.
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Due' }))
    const due = screen.getByLabelText('Due') as HTMLInputElement

    // (1) FIRST Escape — focused editing field + dirty: cancels ONLY the field draft and RETURNS
    // to the value rendering. No retain/discard dialog, panel stays open, value restored to the
    // saved baseline (OD-REDESIGN-83.1).
    fireEvent.change(due, { target: { value: '2026-09-01' } })
    fireEvent.keyDown(due, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeTruthy()
    // Back in value mode: the edit control is gone and the field shows the saved baseline date.
    expect(screen.queryByLabelText('Due')).toBeNull()
    const dueField = document.querySelector('[data-field-key="dueDate"]') as HTMLElement
    expect(within(dueField).getByText(/1 Jul/)).toBeInTheDocument()

    // (2) Re-dirty the record via a FAILED commit (FieldErrorRetryContract) — the persisted
    // tenant dirty state attaches the leave-guard. Re-activate the field, then the failed Enter
    // keeps the draft in edit mode. The next Escape is the panel-close intent, not a field
    // cancel, so it is dispatched on the overlay host: a panel-level keystroke does not pass
    // through the field's capture listener (focus is outside the field).
    mockUpdateTaskFields.mockRejectedValue(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Due' }))
    const due2 = screen.getByLabelText('Due') as HTMLInputElement
    fireEvent.change(due2, { target: { value: '2026-08-01' } })
    fireEvent.keyDown(due2, { key: 'Enter' })
    await screen.findByRole('alert')

    const panel = document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]') as HTMLElement
    expect(panel).toBeTruthy()

    // Panel-level Escape reaches the host's native keydown listener → host.close('escape') →
    // the dirty leave-guard vetoes → the retain/discard confirmation appears.
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(await screen.findByRole('dialog')).toHaveTextContent(/discard unsaved changes/i)

    // Retain/Cancel: the dialog closes and the record stays open. The tenant dirty state
    // remains — proven by the guard re-firing on the very next Escape below. The deny
    // resolves the host's in-flight leave request in a microtask, so flush it before the
    // next Escape or the host's coalescing swallows the second keystroke.
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeTruthy()
    await act(async () => {})

    // Again: panel-level Escape re-fires the guard (dirty state remains) → confirm → Discard → close.
    fireEvent.keyDown(panel, { key: 'Escape' })
    fireEvent.click(await screen.findByRole('button', { name: /discard changes/i }))
    await waitFor(() =>
      expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeNull(),
    )
  })

  // D1 — the field/tenant seam: ModalShell (the shared dialog primitive under ConfirmDialog)
  // auto-focuses its own Cancel button the instant it mounts (its own a11y contract). If a
  // RecordField is still focused and mid-draft when the "Discard unsaved changes?" dialog
  // opens, that auto-focus fires a REAL native blur on the field BEFORE the user has chosen
  // Retain or Discard — and an unguarded blur handler would commit the draft right there,
  // silently persisting the very edit the dialog is asking about (Discard would then discard
  // nothing). TaskOverlayContent's `fieldCommitsFrozen` (task-drawer.tsx) exists to prevent
  // exactly that: it freezes RecordField's blur-commit for as long as the dialog is mounted.
  // This test never fires a synthetic blur itself — it types a draft, leaves the field
  // genuinely DOM-focused (record-field.tsx's `autoFocus`), and lets the SAME real dialog-open
  // path the live app uses (Close → dirty guard → ConfirmDialog → ModalShell mount) do the
  // focus-stealing, so it reproduces the actual race rather than asserting around it.
  it('D1: opening the leave-guard dialog freezes field commits — ConfirmDialog auto-focus cannot silently save the draft', async () => {
    const task = makeTask({ id: 'task-d1', title: 'D1 task', description: 'original description' })
    mockListTasks.mockResolvedValue([task])
    mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
    mockUpdateTaskFields.mockResolvedValue(undefined) // a SUCCESSFUL commit — the dangerous case (D1's "silent save")

    renderTable()
    await waitFor(() => screen.getByText('D1 task'))
    fireEvent.click(document.querySelector('tr.task-row') as HTMLElement)

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Description' }))
    const description = screen.getByLabelText('Description') as HTMLTextAreaElement
    // Sanity: RecordField's own autoFocus really landed DOM focus on the field — otherwise
    // ModalShell's later focus-steal wouldn't fire a blur on it at all and this test would
    // prove nothing.
    expect(document.activeElement).toBe(description)

    const draftText = 'a draft in flight when the leave-guard dialog opens'
    fireEvent.change(description, { target: { value: draftText } })
    expect(description.value).toBe(draftText)

    // Trigger the guard via Close WITHOUT ever blurring the field ourselves — the dialog's own
    // ModalShell mount effect is what steals focus next, exactly like the live browser Back path.
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(/discard unsaved changes/i)

    // ModalShell really did steal focus (a genuine jsdom blur fired on the field) — if the D1
    // defect were still live, THAT blur is what would have committed the draft.
    expect(document.activeElement).not.toBe(description)
    expect(mockUpdateTaskFields).not.toHaveBeenCalled()

    // Retain: the dialog closes, ModalShell returns focus to the field (its own
    // invoker-refocus contract), and the draft is exactly what the user typed — never
    // committed by the stray blur, never rolled back to the saved baseline either.
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Description')).toHaveValue(draftText)
    expect(mockUpdateTaskFields).not.toHaveBeenCalled()
    // The deny resolves the host's in-flight leave request in a microtask (same as
    // AC-V3-008c above) — flush it so the assertion above is the true settled state.
    await act(async () => {})
    expect(mockUpdateTaskFields).not.toHaveBeenCalled()
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
    ensureViewOptionsOpen()
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
    // j/k are collection shortcuts only outside native controls; avoid inheriting toolbar focus.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
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

  // I7 (cohesion-debt 2026-07-19): the keyboard cursor is a SELECTION → aria-selected.
  // aria-current is reserved for the rail/breadcrumb ("exactly one aria-current" holds).
  // The goal is unchanged: exactly one leaf row is marked as the cursor, never a header.
  it('I1/I7/OBS-121: j/k move aria-selected across leaf rows; group headers never receive it', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'o1', title: 'Open one', status: 'Open' }),
      makeTask({ id: 'b1', title: 'Blocked one', status: 'Blocked' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Open one'))
    await switchToAll()
    await waitFor(() => screen.getByText('Blocked one'))

    // The collection hotkeys intentionally stand down for native controls. Keep this cursor
    // contract test focused on the collection rather than whichever toolbar control last focused.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()

    // Before any j press: no row is marked as the cursor, and NO row emits aria-current
    expect(document.querySelector('tr.task-row[aria-selected="true"]')).toBeNull()
    expect(document.querySelector('tr.task-row[aria-current]')).toBeNull()

    // First j: cursor lands on leaf index 0 → that row should be aria-selected
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => {
      const currentRow = document.querySelector('tr.task-row[aria-selected="true"]')
      expect(currentRow).toBeTruthy()
      // Must be a task-row, not a group header
      expect(currentRow!.classList.contains('task-row')).toBe(true)
      expect(currentRow!.classList.contains('grp')).toBe(false)
    })

    // j again: selection moves to next leaf row; previous row loses it
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => {
      const currentRows = document.querySelectorAll('tr.task-row[aria-selected="true"]')
      // Exactly one row carries the cursor at a time
      expect(currentRows.length).toBe(1)
      // And it is still a task-row, never a .grp
      expect(currentRows[0].classList.contains('grp')).toBe(false)
      // aria-current stays reserved for the rail/breadcrumb — no row emits it
      expect(document.querySelector('tr.task-row[aria-current]')).toBeNull()
    })
  })
})

describe('Task 19 — "+ Create task" pre-fill (AC-125)', () => {
  it('AC-125: in an Owner-grouped view, a group "+ Create task" navigates to /tasks/new?r=<personId>', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'a', title: 'Mine task' })])
    // Capture navigation by rendering a route that echoes the URL
    const { container } = renderTable()
    await waitFor(() => screen.getByText('Mine task'))
    ensureViewOptionsOpen()
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

  it('AC-125 / FR-123 (refined): Status-group "+ Create task" has NO ?status= pre-fill (plain create link)', async () => {
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

// ── OD-REDESIGN-91 #17: the head meta reads "N open · M total" (counts are OPEN) ──
describe('#17 — Tasks head meta is "N open · M total" (open excludes Done)', () => {
  it('#17: a Done task lowers the open count but not the total', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Open one', status: 'Open' }),
      makeTask({ id: 't2', title: 'Open two', status: 'Blocked' }),
      makeTask({ id: 't3', title: 'Resolved', status: 'Done' }),
    ])
    renderTable()
    await waitFor(() => screen.getByRole('heading', { name: /tasks/i }))
    await switchToAll()
    await waitFor(() => expect(screen.getByText('Resolved')).toBeInTheDocument())
    // Blocked still counts as open (not Done); only the Done task is excluded from open.
    await waitFor(() =>
      expect(screen.getByTestId('tasks-count-line').textContent?.trim()).toBe('2 open · 3 total'),
    )
  })
})

// ── F3 (design review): one overdue token everywhere, no density-dependent glyph ──
describe('F3 — overdue label stays consistent across densities (no bare "!" glyph)', () => {
  it('F3: in condensed split-view, overdue keeps a dated label with the overdue treatment — never a bare "!" and never clipped (owner-eyes item 3: the "Overdue ·" prefix yields at condensed width; color + full label at normal density carry it)', async () => {
    const overdueDate = '2020-01-01'
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Overdue task', status: 'Open', due_date: overdueDate }),
    ])
    // drawerOpen=true + splitLayout=true → condensed=true
    renderTable({ drawerOpen: true, splitLayout: true })
    await waitFor(() => screen.getByRole('heading', { name: /tasks/i }))
    await switchToAll()
    await waitFor(() => screen.getByText('Overdue task'))
    // Condensed keeps a dated label with the overdue treatment — never a bare "!" and never
    // clipped (owner-eyes item 3: the "Overdue ·" prefix yields at condensed width).
    const dueCell = document.querySelector('tr.task-row .due-overdue')
    expect(dueCell).toBeTruthy()
    expect(dueCell!.textContent).toMatch(/1 Jan/)
    expect(dueCell!.textContent!.trim()).not.toBe('!')
  })

  it('F3: non-condensed (no drawer) overdue row shows the same full "Overdue · <date>" text', async () => {
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

describe('PR-2 — AC-T01 thead th header (e7 grammar: 600/38 uppercase muted — supersedes OD-P4-10 weight-400)', () => {
  it('AC-T01: a populated table columnheader carries the th-cell class', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Overline task' })])
    renderTable()
    await waitFor(() => screen.getByText('Overline task'))
    const th = screen.getByRole('columnheader', { name: /Task/ })
    expect(th.className).toContain('th-cell')
    expect(th.closest('table')).toHaveClass('record-collection-table')
  })

  it('WCAG 2.1.1 (convention audit 2026-07-18): sort headers are real buttons, keyboard-operable', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Sortable task' })])
    renderTable()
    await waitFor(() => screen.getByText('Sortable task'))
    const sortBtn = screen.getByRole('button', { name: /^Task/ })
    expect(sortBtn.tagName).toBe('BUTTON')
    const th = sortBtn.closest('th')!
    const before = th.getAttribute('aria-sort')
    fireEvent.click(sortBtn) // keyboard Enter/Space fire click on a real <button>
    await waitFor(() => expect(th.getAttribute('aria-sort')).not.toBe(before))
  })

  it('AC-T01: .th-cell rule is e7 table-header grammar — weight 600, h38, UPPERCASE, 0.06em, muted color', () => {
    const body = cssRuleBody('.th-cell')
    // Parity sweep A3 (2026-07-18): e7 owns the table grammar for the redesign skin (SALVAGE);
    // weight 600 + height 38 SUPERSEDE the pre-redesign OD-P4-10/ADR-0013 weight-400 overline.
    // Uppercase + 0.06em + muted color + 11px retained (measured non-divergent vs e7).
    expect(body).toMatch(/font-weight:\s*600/)
    expect(body).toMatch(/height:\s*38px/)
    expect(body).toMatch(/text-transform:\s*uppercase/)
    expect(body).toMatch(/letter-spacing:\s*\.?0*\.?06em/) // 0.06em
    expect(body).toMatch(/color:\s*var\(--muted-foreground\)/)
    // Mockup overline is 11px — authored as the semantic token that resolves to exactly 11px
    // (GUARD-VOCAB tokenization; the kit --ds-font-size-xs resolves ~13.6px, too large for this role).
    expect(body).toMatch(/font-size:\s*var\(--font-size-overline\)/)
  })
})

// ── PR-2 AC-T03..T07 wiring — the kit row craft (name Chip-link, status nowrap,
//    shared E7-measure rows, hover-revealed checkbox + ⋯, select-all aria-checked="mixed").
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

  it('AC-T06: body rows consume the one RecordCollection row measure', () => {
    // The surface-scoped RecordCollection skin resolves this token to E7's 52px measure.
    const body = cssRuleBody('.td-main, .td-cell')
    expect(body).toMatch(/height:\s*var\(--row-min-h\)/)
  })

  it('AC-T02: every row (header, skeleton, body) agrees on column count (no-bleed)', async () => {
    // The skeleton already renders 6 cells (6 + td-menu). The populated row
    // and thead must agree, else a long group header colSpan misaligns the grid.
    mockListTasks.mockResolvedValue([makeTask({ id: 'cc', title: 'Column count' })])
    renderTable()
    await waitFor(() => screen.getByText('Column count'))
    const ths = document.querySelectorAll('thead tr th')
    const bodyRow = document.querySelector('tr.task-row') as HTMLElement | null
    expect(bodyRow, 'expected a populated task row').not.toBeNull()
    const tds = bodyRow!.querySelectorAll('td')
    // Thead and body row must have the same column count.
    expect(tds.length, 'thead th count must equal body td count').toBe(ths.length)
    expect(ths.length).toBeGreaterThanOrEqual(6) // 6 data cols + (menu is in-row)
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
    // 6 cells: Task + Status + PIC + Supervisor + Due + menu (no optional cols).
    expect(row.querySelectorAll('td').length).toBe(6)
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
