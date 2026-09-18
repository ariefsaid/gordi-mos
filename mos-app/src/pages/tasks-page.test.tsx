import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { OverlayHostProvider } from '@/shell/overlay-host'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { DueProcessRun, PendingTaskRow, ProcessRunRollup } from '@/lib/db/processes.types'

// ── Mock the data layer ──────────────────────────────────────────────────────
vi.mock('../lib/db/tasks', () => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
}))
vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
  getPersonTeams: vi.fn().mockResolvedValue([]),
  getTeamsByIds: vi.fn().mockResolvedValue([]),
  // Design fix wave item 4 — the "via <role name>" provenance line's role-name batch lookup.
  listRoleNames: vi.fn(),
  getDownlinePersonIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))
// Design fix wave item 1a: the due-runs membership-scoping loader (reused from signals.ts).
vi.mock('../lib/db/signals', () => ({
  listAuthorTeams: vi.fn(),
}))
// Step 6 (Track C wiring, C1/C2): mocked at the DAL boundary, never a live DB.
vi.mock('../lib/db/processes', () => ({
  canStartProcessForTeam: vi.fn(),
  listDueRuns: vi.fn(),
  startRun: vi.fn(),
  listRunRollups: vi.fn(),
  listPendingTasks: vi.fn(),
  resolvePendingTask: vi.fn(),
  // Design fix wave items 2/4 — batched process_task_defs lookup by id.
  listTaskDefs: vi.fn(),
}))

import { listTasks, getTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople, listRoleNames } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { listAuthorTeams } from '@/lib/db/signals'
import { canStartProcessForTeam, listDueRuns, listRunRollups, listPendingTasks, resolvePendingTask, listTaskDefs } from '@/lib/db/processes'
// Re-homed from the deleted TasksPage host onto the LIVE table surface (TasksWorkspace).
// The host was a thin <PageFrame><TasksWorkspace/></PageFrame> wrapper, so every table
// behavior AC (AC-060..067, filters, sort, archived toggle, states) now runs against the
// real component the /tasks page renders.
import { TasksWorkspace } from '@/components/tasks/tasks-workspace'
const mockListTasks = vi.mocked(listTasks)
const mockGetTask = vi.mocked(getTask)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)
const mockListAuthorTeams = vi.mocked(listAuthorTeams)
const mockListDueRuns = vi.mocked(listDueRuns)
const mockCanStartProcessForTeam = vi.mocked(canStartProcessForTeam)
const mockListRunRollups = vi.mocked(listRunRollups)
const mockListPendingTasks = vi.mocked(listPendingTasks)
const mockListTaskDefs = vi.mocked(listTaskDefs)
const mockListRoleNames = vi.mocked(listRoleNames)
const mockResolvePendingTask = vi.mocked(resolvePendingTask)
const mockListObjectives = vi.mocked(listObjectives)
const mockListWorkLines = vi.mocked(listWorkLines)

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
const SUPPORT_PERSON = 'support-person-id'
const OBSERVER_PERSON = 'observer-person-id'

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

// ── Task fixtures (raw rows — no embedded objects, Fix C1) ────────────────────
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

// ── Location spy helper ───────────────────────────────────────────────────────
let _capturedLocation: ReturnType<typeof useLocation> | null = null

function LocationCapture() {
  _capturedLocation = useLocation()
  return null
}

function makeSavedView(view: 'mine' | 'overdue' | 'all' = 'all'): React.ComponentProps<typeof TasksWorkspace>['savedView'] {
  switch (view) {
    case 'mine':
      return { view: 'mine', activeChip: 'mine', segment: 'mine', overdueOnly: false, search: '?view=mine' }
    case 'overdue':
      return { view: 'overdue', activeChip: 'overdue', segment: 'all', overdueOnly: true, search: '?view=overdue' }
    case 'all':
    default:
      return { view: 'all', activeChip: null, segment: 'all', overdueOnly: false, search: '' }
  }
}

// Desktop exposes the shared collection controls; phone places the same group behind one outer
// View & filters door. Keep that responsive seam in one place for behavior tests.
function openFilters() {
  const trigger = screen.queryByRole('button', { name: /^view & filters/i })
  if (trigger?.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger)
  return screen.getByRole('group', { name: /view & filters/i })
}

function taskFilter(name: RegExp | string) {
  const controls = within(openFilters())
  return controls.queryByRole('combobox', { name }) ?? controls.getByRole('button', { name })
}

function chooseTaskFilter(trigger: HTMLElement, label: string) {
  fireEvent.click(trigger)
  fireEvent.click(screen.queryByRole('option', { name: label }) ?? screen.getByRole('checkbox', { name: label }))
}

function taskFilterOptions(trigger: HTMLElement) {
  fireEvent.click(trigger)
  const labels = screen.getAllByRole('option').map(option => option.textContent)
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
  return labels
}

// §Task-11: the Team-work chip was removed; All is the org-visible set.
async function switchToAll() {
  const door = screen.queryByRole('button', { name: /^view & filters/i })
  if (door?.getAttribute('aria-expanded') === 'false') fireEvent.click(door)
  const all = screen.getByRole('button', { name: 'All' })
  fireEvent.click(all)
  await waitFor(() => expect(all).toHaveAttribute('aria-pressed', 'true'))
}

// ── Render helper ─────────────────────────────────────────────────────────────
function renderPage(auth: AuthState = authedState, props: Partial<React.ComponentProps<typeof TasksWorkspace>> = {}) {
  _capturedLocation = null

  function Harness() {
    const [savedView, setSavedView] = useState(props.savedView ?? makeSavedView())
    return (
      <>
        <TasksWorkspace
          {...props}
          savedView={savedView}
          onSavedViewChange={props.onSavedViewChange ?? ((next) => setSavedView(makeSavedView(next === 'mine' || next === 'overdue' ? next : 'all')))}
        />
        <LocationCapture />
      </>
    )
  }

  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/work/tasks']}>
        <OverlayHostProvider>
          <Harness />
        </OverlayHostProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// Default directory stubs (override per test as needed)
const DEFAULT_BUS = [
  { id: 'bu-1', name: 'Kitchen' },
  { id: 'bu-ops', name: 'Ops Unit' },
  { id: 'bu-kitchen', name: 'Kitchen BU' },
  { id: 'bu-roastery', name: 'Roastery BU' },
]
const DEFAULT_PEOPLE = [
  { id: VIEWER_ID, full_name: 'Arief Said' },
  { id: OTHER_ID,  full_name: 'Budi Setiawan' },
  { id: SUPPORT_PERSON,  full_name: 'Sari Support' },
  { id: OBSERVER_PERSON, full_name: 'Iman Observer' },
]

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks resets call history but NOT queued mockResolvedValueOnce values. The live engine
  // now reloads only on load-affecting query keys (includeArchived/groupBy), so a per-filter second
  // `Once` some tests queue is no longer consumed within its own test — fully reset listTasks so no
  // leftover resolution leaks into the next test's initial load.
  mockListTasks.mockReset()
  stubMatchMedia(true) // desktop by default
  mockGetBusinessUnits.mockResolvedValue(DEFAULT_BUS)
  mockGetPeople.mockResolvedValue(DEFAULT_PEOPLE)
  mockListObjectives.mockResolvedValue([])
  mockListWorkLines.mockResolvedValue([])
  mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
  // Step 6 (Track C wiring): quiet defaults so pre-existing tests (accessRoles: [], no occurrence
  // groupBy) never see the Start-run control or an occurrence fetch.
  mockListDueRuns.mockResolvedValue([])
  mockCanStartProcessForTeam.mockResolvedValue(false)
  mockListRunRollups.mockResolvedValue([])
  mockListPendingTasks.mockResolvedValue([])
  // Design fix wave item 4: quiet defaults — no generated_from_task_def_id rows in the base
  // fixtures, so this stays a silent no-op unless a test opts in.
  mockListTaskDefs.mockResolvedValue([])
  mockListRoleNames.mockResolvedValue([])
  // Design fix wave item 1a: zero memberships (the default fixture has none seeded) keeps every
  // due row — the "pure admin/capability grant" branch of the scoping rule. Tests that need
  // membership SCOPING set this explicitly.
  mockListAuthorTeams.mockResolvedValue([])
})

// ── T-030: AC-067 — loading / error / empty states ─────────────────────────
describe('AC-067 — Tasks table (live surface) states (loading, error, empty)', () => {
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
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('AC-067: shows empty state with "+ New task" when list resolves empty', async () => {
    mockListTasks.mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /\+ create task/i })).toBeTruthy()
    })
  })

  it('AC-067: queue toolbar stays rendered during error state', async () => {
    mockListTasks.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() => screen.getByRole('alert'))
    // Error state keeps the same usable desktop collection controls beside the result message.
    expect(screen.getByRole('group', { name: /task views/i })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search tasks/i })).toBeInTheDocument()
    // The options now live behind the surface's own door at every width; "usable" means REACHABLE,
    // so open it and assert the controls, rather than asserting a group that is meant to be closed.
    expect(within(openFilters()).getByRole('combobox', { name: /business unit/i })).toBeInTheDocument()
  })
})

// ── T-031: AC-060 — row content (priority decision columns) ───────────────
// Wave 2c (OD-REDESIGN-61..64, e7 priority columns): the row shows ONLY Title ·
// Status · PIC · Supervisor · Due. BU/Team + Activity moved to the record drawer
// (where the typed Task already shows them — OD-62).
describe('AC-060 — row renders the priority decision columns', () => {
  it('AC-060: renders title, status pill, PIC name, and due (priority columns)', async () => {
    // Fix C1: names resolved from directory. task only carries IDs.
    // bu-ops is in DEFAULT_BUS as 'Ops Unit', VIEWER_ID is in DEFAULT_PEOPLE as 'Arief Said'.
    const task = makeTask({
      title: 'SOP stock opname mingguan',
      business_unit_id: 'bu-ops',
      status: 'In Progress',
      responsible_person_id: VIEWER_ID,
      last_activity_at: '2020-01-01T00:00:00Z', // very old → shows days
      due_date: '2099-12-31',
    })
    mockListTasks.mockResolvedValue([task])
    renderPage()

    await waitFor(() => screen.getByText('SOP stock opname mingguan'))
    // Status tag (not the select option) — soft Tag (.mk-tag)
    expect(screen.getAllByText('In Progress').find(el => el.closest('.mk-tag'))).toBeTruthy()
    expect(screen.getAllByText('Arief')[0]).toBeTruthy() // PIC first name from directory
    // Due renders (calm future date) — the decision-critical column stays in-frame.
    expect(document.querySelector('.due-calm')).toBeTruthy()
    // Wave 2c: BU/Team + Activity moved OUT of the row into the drawer.
    expect(document.querySelector('tr.task-row .td-bu')).toBeNull()
    expect(document.querySelector('tr.task-row .act')).toBeNull()
  })

  it('AC-060: shows typed ownership — PIC + Supervisor columns, no RACI overflow (OD-62)', async () => {
    // accountable (Supervisor) + consulted + informed differ from responsible (PIC);
    // under the typed-Task contract the row surfaces PIC + Supervisor only — the
    // consulted/informed ids must NOT leak as a RACI "+N" overflow.
    const task = makeTask({
      responsible_person_id: VIEWER_ID,   // PIC = Arief Said
      accountable_person_id: OTHER_ID,    // Supervisor = Budi Setiawan
      consulted_person_ids: [SUPPORT_PERSON],
      informed_person_ids: [OBSERVER_PERSON],
    })
    mockListTasks.mockResolvedValue([task])
    renderPage()

    await waitFor(() => screen.getByText('Arief'))
    const row = document.querySelector('tbody tr.task-row')!
    // PIC column renders the responsible person (first name) and names the role.
    const ownerCell = row.querySelector('.td-owner')
    expect(ownerCell?.textContent).toContain('Arief')
    expect(ownerCell?.querySelector('[aria-label]')?.getAttribute('aria-label')).toMatch(/PIC: Arief Said/i)
    // Supervisor is its own column (OD-62) — the accountable person.
    expect(row.querySelector('.td-supervisor')?.textContent).toContain('Budi')
    // No RACI "+N" overflow or RACI grammar on a Task surface (OD-62).
    expect(screen.queryByText(/^\+\d+$/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/RACI|Owner \(R\)|Responsible \(R\)/)
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
  // Fix C1: no embedded objects — BU/person names come from directory (DEFAULT_BUS/DEFAULT_PEOPLE)
  const taskKitchen = makeTask({
    id: 'task-kitchen', title: 'Kitchen task',
    business_unit_id: 'bu-kitchen',
    status: 'Open',
    responsible_person_id: VIEWER_ID,
    accountable_person_id: VIEWER_ID,
  })
  const taskRoastery = makeTask({
    id: 'task-roastery', title: 'Roastery task',
    business_unit_id: 'bu-roastery',
    status: 'Blocked',
    responsible_person_id: VIEWER_ID,
    accountable_person_id: VIEWER_ID,
  })

  it('AC-063: BU filter — selecting a BU shows only matching BU tasks', async () => {
    // First call returns all; second (after BU filter) returns filtered set
    mockListTasks.mockResolvedValueOnce([taskKitchen, taskRoastery])
    mockListTasks.mockResolvedValueOnce([taskKitchen])
    renderPage()
    await waitFor(() => screen.getByText('Roastery task'))

    const buSelect = taskFilter(/business unit/i)
    chooseTaskFilter(buSelect, 'Kitchen BU')

    await waitFor(() => {
      expect(screen.queryByText('Roastery task')).toBeNull()
      expect(screen.getByText('Kitchen task')).toBeTruthy()
    })
    // NOTE: BU/Status filtering is now client-side in the collection projector (honest
    // empty-vs-filtered-empty; only includeArchived is a server concern). The user goal — "selecting
    // a BU shows only matching BU tasks" — is asserted by the row visibility above; the previous
    // server-call assertion tested the retired server-side-filter implementation.
  })

  it('AC-063: Status filter — selecting a status shows only matching rows', async () => {
    mockListTasks.mockResolvedValueOnce([taskKitchen, taskRoastery])
    mockListTasks.mockResolvedValueOnce([taskRoastery])
    renderPage()
    await waitFor(() => screen.getByText('Kitchen task'))

    // Status popover flow (#743 r3): open the trigger, check the Blocked choice.
    chooseTaskFilter(taskFilter(/^status$/i), 'Blocked')

    await waitFor(() => {
      expect(screen.queryByText('Kitchen task')).toBeNull()
      expect(screen.getByText('Roastery task')).toBeTruthy()
    })
    // Status filtering is client-side in the projector now (see the BU-filter note above); the user
    // goal is asserted by row visibility, not by the retired server-call shape.
  })

  it('AC-063: Person filter — selecting a person shows tasks where they are PIC or Supervisor', async () => {
    // Use "All" view so all tasks load visibly regardless of typed ownership scope.
    // Tasks: viewer is PIC on first, viewer is Supervisor on second, neither on third.
    // Fix C1: no embedded objects.
    const taskViewerPic = makeTask({
      id: 'task-viewer-pic', title: 'Viewer is PIC',
      responsible_person_id: VIEWER_ID, accountable_person_id: OTHER_ID,
    })
    const taskViewerSupervisor = makeTask({
      id: 'task-viewer-supervisor', title: 'Viewer is Supervisor',
      responsible_person_id: OTHER_ID, accountable_person_id: VIEWER_ID,
    })
    const taskUnrelated = makeTask({
      id: 'task-unrelated', title: 'Not viewer task',
      responsible_person_id: OTHER_ID, accountable_person_id: OTHER_ID,
    })
    mockListTasks.mockResolvedValue([taskViewerPic, taskViewerSupervisor, taskUnrelated])
    renderPage()
    await switchToAll()
    await waitFor(() => screen.getByText('Not viewer task'))

    // Now apply person filter for the viewer
    const personSelect = taskFilter(/^person$/i)
    chooseTaskFilter(personSelect, 'Arief Said')

    await waitFor(() => {
      expect(screen.getByText('Viewer is PIC')).toBeTruthy()
      expect(screen.getByText('Viewer is Supervisor')).toBeTruthy()
      expect(screen.queryByText('Not viewer task')).toBeNull()
    })
  })
})

// ── T-034: AC-064 — saved-view chips ─────────────────────────────────────────
describe('AC-064 — saved-view chips', () => {
  // Fix C1: no embedded objects
  const taskMine = makeTask({
    id: 'mine', title: 'My task',
    responsible_person_id: VIEWER_ID,
    accountable_person_id: VIEWER_ID,
  })
  const taskOtherWork = makeTask({
    id: 'other-work', title: 'Other team task',
    responsible_person_id: OTHER_ID,
    accountable_person_id: OTHER_ID,
  })
  const taskUnrelated = makeTask({
    id: 'unrelated', title: 'Unrelated task',
    responsible_person_id: OTHER_ID,
    accountable_person_id: OTHER_ID,
  })

  beforeEach(() => {
    mockListTasks.mockResolvedValue([taskMine, taskOtherWork, taskUnrelated])
  })

  it('AC-064: "My work" shows only PIC-or-Supervisor tasks when seeded from view=mine', async () => {
    renderPage(authedState, { savedView: makeSavedView('mine') })
    await waitFor(() => screen.getByText('My task'))
    expect(screen.queryByText('Other team task')).toBeNull()
    expect(screen.queryByText('Unrelated task')).toBeNull()
    expect(screen.getByRole('button', { name: 'My work' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('the Task scope tabs expose All, My work, Team work and Overdue', async () => {
    renderPage()
    await waitFor(() => screen.getByText('My task'))
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My work' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Overdue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Team work' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'AR Follow-ups' })).toBeNull()
  })

  it('AC-064 / §Task-11: "All" shows every loaded row regardless of ownership scope', async () => {
    renderPage()
    await waitFor(() => screen.getByText('My task'))

    await switchToAll()

    await waitFor(() => {
      expect(screen.getByText('My task')).toBeTruthy()
      expect(screen.getByText('Other team task')).toBeTruthy()
      expect(screen.getByText('Unrelated task')).toBeTruthy()
    })
  })
})

// ── T-035: AC-065 + #743 AC-008 — archived rows hidden by default; "Include archived" is an
// ADDITIVE checkbox option INSIDE the Status popover (the Fields-chooser pattern — a popover's
// boxes are not toolbar controls): it coexists with any chosen status, never an exclusive
// option of a select.
describe('AC-065 / AC-008 — archived rows hidden by default; Include archived is additive to Status', () => {
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

  // Ruling test (#743 r3): Status=Blocked + Include archived → BOTH applied and BOTH visible,
  // and with the popover closed neither toolbar row holds a checkbox.
  it('AC-008: Status=Blocked plus Include archived keeps the chosen status AND checks the archived option (both applied, both visible, no toolbar checkbox)', async () => {
    mockListTasks.mockResolvedValueOnce([makeTask({ id: 'active', title: 'Active task' })])
    mockListTasks.mockResolvedValueOnce([
      makeTask({ id: 'active', title: 'Active task', status: 'Blocked' }),
      makeTask({ id: 'arch', title: 'Archived task', archived_at: '2026-06-01T00:00:00Z', status: 'Blocked' }),
    ])
    renderPage()
    await waitFor(() => screen.getByText('Active task'))

    const statusSelect = taskFilter(/^status$/i)
    chooseTaskFilter(statusSelect, 'Blocked')
    await waitFor(() => expect(_capturedLocation?.search).toMatch(/status=blocked/))

    // The archived option lives in the same disclosed Filters panel and is additive — choosing a
    // status never checks it.
    const archived = screen.getByRole('checkbox', { name: /include archived/i }) as HTMLInputElement
    expect(archived.checked).toBe(false)
    fireEvent.click(archived)

    // Both applied: the URL carries the status AND the archived opt-in…
    await waitFor(() => expect(_capturedLocation?.search).toMatch(/archived=1/))
    expect(_capturedLocation?.search).toMatch(/status=blocked/)
    // …and both choices read as engaged: the status select still shows Blocked, the box stays checked.
    expect(statusSelect).toHaveTextContent('Blocked')
    expect((screen.getByRole('checkbox', { name: /include archived/i }) as HTMLInputElement).checked).toBe(true)
    // The re-query honors the archived opt-in, and the Status control never became "__archived".
    await waitFor(() => {
      expect(mockListTasks).toHaveBeenLastCalledWith(expect.objectContaining({ includeArchived: true }))
    })
    await waitFor(() => screen.getByText('Archived task'))

    // The Status popover keeps both choices visible until the user closes that anchored control.
    expect(screen.getByRole('checkbox', { name: /include archived/i })).toBeVisible()
  })
})

// ── T-036: AC-066 — default queue order (urgent work before completed/archive) ─────────────
describe('AC-066 — default queue order', () => {
  it('AC-066: the first paint prioritizes due work before completed work', async () => {
    const completed = makeTask({ id: 't1', title: 'Completed task', status: 'Done', due_date: '2026-06-01' })
    const later = makeTask({ id: 't2', title: 'Later task', status: 'Open', due_date: '2026-06-20' })
    const urgent = makeTask({ id: 't3', title: 'Urgent task', status: 'Open', due_date: '2026-06-12' })
    // The neutral queue is urgent-first: active work leads, then completed/archive records, with
    // due ordering still authoritative within each tier.
    mockListTasks.mockResolvedValue([completed, later, urgent])
    renderPage()
    await waitFor(() => screen.getByText('Urgent task'))

    const titles = Array.from(document.querySelectorAll('tbody tr.task-row')).map(row => row.textContent)
    const urgentIdx = titles.findIndex(t => t?.includes('Urgent task'))
    const laterIdx = titles.findIndex(t => t?.includes('Later task'))
    const completedIdx = titles.findIndex(t => t?.includes('Completed task'))
    expect(urgentIdx).toBeLessThan(laterIdx)
    expect(laterIdx).toBeLessThan(completedIdx)
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
  it('saved-view controls expose button semantics with aria-pressed', async () => {
    mockListTasks.mockResolvedValue([makeTask()])
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: 'My work' }))
    expect(screen.getByRole('group', { name: /task views/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My work' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
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
    await waitFor(() => screen.getByRole('link', { name: /\+ create task/i }))
    const link = screen.getByRole('link', { name: /\+ create task/i })
    expect(link.getAttribute('href')).toContain('/work/tasks?create=1')
  })
})

// ── Fix-1: row-click SPA navigation (no full reload, no hardcoded basename) ────
describe('V3 RecordViewer — task collection opens one shared host', () => {
  it('clicking desktop row opens the shared host without losing the collection route', async () => {
    const task = makeTask({ id: 'task-nav-1', title: 'Nav test task' })
    mockListTasks.mockResolvedValue([task])
    renderPage()

    await waitFor(() => screen.getByText('Nav test task'))

    // Click the <tr> row (not the inner Link)
    const rows = document.querySelectorAll('tbody tr.task-row')
    expect(rows.length).toBeGreaterThan(0)
    fireEvent.click(rows[0])

    await waitFor(() => expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeTruthy())
    expect(_capturedLocation?.pathname).toBe('/work/tasks')

    // window.location.href must NOT contain the hardcoded /mos/ basename
    // (in jsdom this stays at initial; we assert it's still the test origin, not '/mos/tasks/...')
    expect(window.location.href).not.toContain('/mos/tasks/')
  })

  it('clicking the mobile card opens the same shared host', async () => {
    stubMatchMedia(false) // narrow
    const task = makeTask({ id: 'task-nav-2', title: 'Mobile nav task' })
    mockListTasks.mockResolvedValue([task])
    renderPage()

    await waitFor(() => screen.getByText('Mobile nav task'))

    // Click the card link directly (it wraps the whole card)
    const cardLink = document.querySelector('.task-card-link') as HTMLAnchorElement
    expect(cardLink).toBeTruthy()
    fireEvent.click(cardLink)

    await waitFor(() => expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')).toBeTruthy())
    expect(_capturedLocation?.pathname).toBe('/work/tasks')
  })
})

// ── Fix C1: directory-sourced options (I1 regression — options stable under status narrowing) ──
describe('Fix C1 — directory-sourced BU + Person filter options', () => {
  it('AC-C1-I1: BU dropdown options come from directory and remain stable when status filter narrows rows', async () => {
    // I1 regression: when status filter narrowed rows, buOptions derived from rows disappeared.
    // Fix: options come from directory, not from loaded row set.
    // Initial load: both BUs; after status filter, only Kitchen rows remain.
    const taskKitchen = makeTask({
      id: 'tk', title: 'Kitchen task', business_unit_id: 'bu-kitchen',
      responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID, status: 'Open',
    })
    const taskRoastery = makeTask({
      id: 'tr', title: 'Roastery task', business_unit_id: 'bu-roastery',
      responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID, status: 'Blocked',
    })
    mockListTasks.mockResolvedValueOnce([taskKitchen, taskRoastery])
    mockListTasks.mockResolvedValueOnce([taskKitchen]) // after status=Open filter
    renderPage()
    await waitFor(() => screen.getByText('Roastery task'))

    // Both BU options present before filtering (from directory DEFAULT_BUS)
    const buSelect = taskFilter(/business unit/i)
    const optsBefore = taskFilterOptions(buSelect)
    expect(optsBefore).toContain('Kitchen BU')
    expect(optsBefore).toContain('Roastery BU')

    // Apply status filter — only Kitchen tasks remain in the list (popover flow, #743 r3)
    chooseTaskFilter(taskFilter(/^status$/i), 'Open')
    await waitFor(() => expect(screen.queryByText('Roastery task')).toBeNull())

    // BU options STILL contain both BUs (from directory, not from rows)
    const optsAfter = taskFilterOptions(buSelect)
    expect(optsAfter).toContain('Kitchen BU')
    expect(optsAfter).toContain('Roastery BU')
  })

  it('AC-C1-person: Person dropdown options come from the directory, not only loaded PIC/Supervisor rows', async () => {
    // Directory-only people still receive stable display names even when absent from the rows.
    const task = makeTask({
      id: 't1', title: 'Task with CI',
      responsible_person_id: VIEWER_ID, accountable_person_id: OTHER_ID,
      consulted_person_ids: [SUPPORT_PERSON], informed_person_ids: [OBSERVER_PERSON],
    })
    mockListTasks.mockResolvedValue([task])
    renderPage()
    await waitFor(() => screen.getByText('Task with CI'))

    const personSelect = taskFilter(/^person$/i)
    const opts = taskFilterOptions(personSelect)
    // All people from directory are present, with stable display names.
    expect(opts).toContain('Arief Said')
    expect(opts).toContain('Budi Setiawan')
    expect(opts).toContain('Sari Support')
    expect(opts).toContain('Iman Observer')
    // Must NOT show raw UUIDs as display names.
    expect(opts.some(o => o === SUPPORT_PERSON)).toBe(false)
    expect(opts.some(o => o === OBSERVER_PERSON)).toBe(false)
  })
})

// ── Fix M2: error state suppresses task count ─────────────────────────────────
describe('Fix M2 — task count suppressed in error state', () => {
  it('AC-M2: count line shows "—" (not "0 tasks") when error banner is shown', async () => {
    mockListTasks.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() => screen.getByRole('alert'))

    // Count line must not show "0 tasks" — it should show "—"
    const countLine = document.querySelector('[data-testid="tasks-count-line"]')
    expect(countLine?.textContent).not.toMatch(/0 task/)
    expect(countLine?.textContent).toContain('—')
  })

  it('AC-M2: count shows correct value once data loads successfully', async () => {
    mockListTasks.mockResolvedValue([makeTask(), makeTask({ id: 'task-2', title: 'Task 2' })])
    renderPage()
    await waitFor(() => screen.getByText('Default task'))
    // Goal-oracle: the loaded count is visible. OD-REDESIGN-91 #17 makes the head meta
    // explicitly distinguish open work from what the current view holds: "N open · M in view".
    const countLine = document.querySelector('[data-testid="tasks-count-line"]')
    expect(countLine?.textContent).toContain('2 open · 2 in view')
  })
})

// ── Fix C1: directory error state ─────────────────────────────────────────────
describe('Fix C1 — directory error shows error banner', () => {
  it('AC-C1-direrr: when getBusinessUnits rejects, shows friendly error banner (not raw error)', async () => {
    mockListTasks.mockResolvedValue([makeTask()])
    mockGetBusinessUnits.mockRejectedValue(new Error('directory down'))
    renderPage()
    await waitFor(() => screen.getByRole('alert'))
    // Must show the friendly message, not the raw error string
    expect(screen.getByText(/couldn't load tasks/i)).toBeTruthy()
    expect(screen.queryByText(/directory down/i)).toBeNull()
  })

  it('AC-C1-direrr2: when getPeople rejects, shows friendly error banner (not raw error)', async () => {
    mockListTasks.mockResolvedValue([makeTask()])
    mockGetPeople.mockRejectedValue(new Error('people unavailable'))
    renderPage()
    await waitFor(() => screen.getByRole('alert'))
    // Must show the friendly message, not the raw error string
    expect(screen.getByText(/couldn't load tasks/i)).toBeTruthy()
    expect(screen.queryByText(/people unavailable/i)).toBeNull()
  })
})

// ── Fix DR-1: archived row treatment ──────────────────────────────────────────
describe('archived row treatment — "Archived" chip + muted title', () => {
  // AC-008 (delta): the archived door is the Include-archived checkbox beside Status — additive
  // to whatever status is (or is not) chosen.
  async function chooseIncludeArchived() {
    fireEvent.click(taskFilter(/^status$/i))
    fireEvent.click(screen.getByRole('checkbox', { name: /include archived/i }))
  }

  it('AC-008: Status Blocked and Include archived apply together and remain visible', async () => {
    const archivedBlocked = makeTask({
      id: 'arch-blocked', title: 'Archived blocked task', status: 'Blocked',
      archived_at: '2026-06-01T00:00:00Z',
    })
    const liveBlocked = makeTask({ id: 'live-blocked', title: 'Live blocked task', status: 'Blocked' })
    const liveOpen = makeTask({ id: 'live-open', title: 'Live open task', status: 'Open' })
    mockListTasks.mockResolvedValue([archivedBlocked, liveBlocked, liveOpen])
    renderPage()
    await switchToAll()

    const statusSelect = taskFilter(/^status$/i)
    chooseTaskFilter(statusSelect, 'Blocked')
    fireEvent.click(screen.getByRole('checkbox', { name: /include archived/i }))

    await waitFor(() => {
      expect(screen.getByText('Archived blocked task')).toBeInTheDocument()
      expect(screen.getByText('Live blocked task')).toBeInTheDocument()
      expect(screen.queryByText('Live open task')).not.toBeInTheDocument()
    })
    expect(statusSelect).toHaveTextContent('Blocked')
  })

  it('DR-1a: desktop — archived task row renders "Archived" tag and muted title; live row does not', async () => {
    stubMatchMedia(true) // desktop
    const archived = makeTask({
      id: 'arch-1', title: 'Archived task',
      archived_at: '2026-06-01T00:00:00Z',
      responsible_person_id: VIEWER_ID,
      accountable_person_id: VIEWER_ID,
    })
    const live = makeTask({
      id: 'live-1', title: 'Live task',
      archived_at: null,
      responsible_person_id: VIEWER_ID,
      accountable_person_id: VIEWER_ID,
    })
    // Use "All" segment so both tasks are visible
    mockListTasks.mockResolvedValue([archived, live])
    renderPage()

    await switchToAll()

    // Reveal archived rows through the Status popover's Include archived option.
    await chooseIncludeArchived()

    await waitFor(() => screen.getByText('Archived task'))

    // Archived row: "Archived" chip present
    const archivedChips = document.querySelectorAll('.archived-tag')
    expect(archivedChips.length).toBeGreaterThan(0)

    // Archived row title: has muted styling (task-name-archived class)
    const archivedTitle = document.querySelector('.task-name-archived')
    expect(archivedTitle).toBeTruthy()
    expect(archivedTitle?.textContent).toBe('Archived task')

    // Live row: no archived chip, no muted title
    const liveRows = Array.from(document.querySelectorAll('tbody tr.task-row'))
    const liveRow = liveRows.find(r => r.textContent?.includes('Live task'))
    expect(liveRow?.querySelector('.archived-tag')).toBeNull()
    expect(liveRow?.querySelector('.task-name-archived')).toBeNull()
  })

  it('DR-1b: mobile — archived TaskCard renders "Archived" tag and muted title; live card does not', async () => {
    stubMatchMedia(false) // mobile
    const archived = makeTask({
      id: 'arch-mob', title: 'Archived mobile task',
      archived_at: '2026-06-01T00:00:00Z',
      responsible_person_id: VIEWER_ID,
      accountable_person_id: VIEWER_ID,
    })
    const live = makeTask({
      id: 'live-mob', title: 'Live mobile task',
      archived_at: null,
      responsible_person_id: VIEWER_ID,
      accountable_person_id: VIEWER_ID,
    })
    mockListTasks.mockResolvedValue([archived, live])
    renderPage()

    await switchToAll()
    await chooseIncludeArchived()

    await waitFor(() => screen.getByText('Archived mobile task'))

    // Archived card: "Archived" chip present
    const archivedCards = document.querySelectorAll('[data-testid="task-card"]')
    const archivedCard = Array.from(archivedCards).find(c => c.textContent?.includes('Archived mobile task'))
    expect(archivedCard?.querySelector('.archived-tag')).toBeTruthy()
    expect(archivedCard?.querySelector('.task-name-archived')).toBeTruthy()

    // Live card: no archived chip
    const liveCard = Array.from(archivedCards).find(c => c.textContent?.includes('Live mobile task'))
    expect(liveCard?.querySelector('.archived-tag')).toBeNull()
    expect(liveCard?.querySelector('.task-name-archived')).toBeNull()
  })
})

// ── Fix DR-2: error banner shows only friendly copy ───────────────────────────
describe('DR-2 — error banner shows only friendly copy, not raw error message', () => {
  it('DR-2a: error banner text is exactly "Couldn\'t load tasks" without appended raw error', async () => {
    mockListTasks.mockRejectedValue(new Error('listTasks failed — forced error'))
    renderPage()
    const results = document.querySelector('.record-collection-results') as HTMLElement
    const banner = await waitFor(() => within(results).getByRole('alert'))
    // Should contain the friendly message
    expect(banner.textContent).toMatch(/couldn't load tasks/i)
    // Must NOT expose the internal error string
    expect(banner.textContent).not.toContain('listTasks failed')
    expect(banner.textContent).not.toContain('forced error')
  })

  it('DR-2b: Retry button is present alongside the friendly message', async () => {
    mockListTasks.mockRejectedValue(new Error('network timeout'))
    renderPage()
    const results = document.querySelector('.record-collection-results') as HTMLElement
    const banner = await waitFor(() => within(results).getByRole('alert'))
    expect(within(banner).getByRole('button', { name: /try again/i })).toBeTruthy()
  })
})

// process.start-capable fixture — shared by the Step 6 C1 (due-runs) and C2 (assign) describes
// below; design fix wave item 3 also gates the "N to assign" affordance on this same capability.
const CAPABLE_AUTH: AuthState = {
  ...authedState,
  viewer: { ...authedState.viewer, accessRoles: ['ops_lead'] },
}

// ── Step 6 (Track C, C1) — the due-runs disclosure (trigger + list). The runs-due PILL left the
// Tasks toolbar in #743 (ruling round 3: the toolbar is twelve controls in every state); #754
// re-homes the pill + list at Home/Café and takes the Start-run journey tests with it. Until
// then the list rests closed here; these tests pin what REMAINS true on /work/tasks: the runs
// source renders no toolbar control (even with due runs + a capable viewer) while the overdue
// pill still carries its own filter, and the Team scoping still gates the source.
describe('Step 6 — Occurrence-as-Tasks wiring (C1)', () => {
  const DUE_ROW: DueProcessRun = {
    work_line_id: 'wl-1', process_name: 'Café HQ daily opening',
    owning_team_id: 'team-1', team_name: 'HQ Operations',
    period_key: '2026-07-17', scheduled_date: '2026-07-17',
  }

  it('the toolbar shows exactly ONE pill even when runs are due — the runs pill left the toolbar (#743 r3)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ due_date: '2020-01-01' })])
    mockListDueRuns.mockResolvedValue([DUE_ROW])
    renderPage(CAPABLE_AUTH)

    openFilters()
    const attention = await screen.findByRole('combobox', { name: /tasks need attention/i })
    fireEvent.click(attention)
    const overduePill = screen.getByRole('option', { name: '1 overdue' })
    expect(overduePill).toBeInTheDocument()
    // No runs-due control anywhere in the toolbar; the overdue pill performs only its own action.
    expect(screen.queryByRole('button', { name: /due to start/i })).not.toBeInTheDocument()
    fireEvent.click(overduePill)
    await waitFor(() => expect(_capturedLocation?.search).toMatch(/overdue=1/))
    expect(_capturedLocation?.search).not.toMatch(/archived=1/)
  })

  it('the overdue pill applies its filter without opening the due-runs disclosure', async () => {
    mockListTasks.mockResolvedValue([makeTask({ due_date: '2020-01-01' })])
    mockListDueRuns.mockResolvedValue([])
    renderPage(CAPABLE_AUTH)

    openFilters()
    const attention = await screen.findByRole('combobox', { name: /tasks need attention/i })
    fireEvent.click(attention)
    fireEvent.click(screen.getByRole('option', { name: '1 overdue' }))
    // FR-001: the pressed pill IS the filter — no second clear chip, no due-runs disclosure.
    await waitFor(() => expect(_capturedLocation?.search).toMatch(/overdue=1/))
    expect(screen.queryByRole('button', { name: /clear overdue/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /due to start/i })).not.toBeInTheDocument()
  })

  it('the due-runs trigger is absent for a viewer without process.start', async () => {
    mockListTasks.mockResolvedValue([])
    renderPage() // default authedState: accessRoles: []
    await waitFor(() => screen.getByRole('link', { name: /\+ create task/i }))
    expect(screen.queryByRole('button', { name: /due to start/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Start ·/ })).not.toBeInTheDocument()
    expect(mockListDueRuns).not.toHaveBeenCalled()
  })

  it('1a: the Tasks surface does not load or render due runs (#754 relocates the door)', async () => {
    mockListTasks.mockResolvedValue([])
    renderPage(CAPABLE_AUTH)

    await waitFor(() => screen.getByRole('link', { name: /\+ create task/i }))
    expect(mockListDueRuns).not.toHaveBeenCalled()
    expect(mockListAuthorTeams).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /due to start/i })).not.toBeInTheDocument()
  })

  it('AC-622/FR-611: the Occurrence group-by groups generated Tasks under the run caption — "Process Run" never appears', async () => {
    const genTask = makeTask({
      id: 'gen-1', title: 'Open the café',
      process_run_id: 'run-1', generated_from_task_def_id: 'def-1',
      responsible_person_id: OTHER_ID, accountable_person_id: OTHER_ID,
    })
    mockListTasks.mockResolvedValue([genTask])
    const rollup: ProcessRunRollup = {
      process_run_id: 'run-1', caption: 'Café HQ daily opening · 17 Jul 2026', scheduled_date: '2026-07-17',
      status: 'open', total: 1, open: 1, in_progress: 0, blocked: 0, done: 0,
      overdue: 0, pending_unresolved: 1, completion_pct: 0,
    }
    mockListRunRollups.mockResolvedValue([rollup])
    renderPage()
    await switchToAll()
    await waitFor(() => screen.getByText('Open the café'))

    chooseTaskFilter(taskFilter(/^group$/i), 'Occurrence')

    await waitFor(() => {
      expect(screen.getByText('Café HQ daily opening · 17 Jul 2026')).toBeInTheDocument()
    })
    expect(screen.getByText('Open the café')).toBeInTheDocument()
    expect(mockListRunRollups).toHaveBeenCalledWith(['run-1'])
    // FR-611 — the internal-only string never leaks into the DOM anywhere on this page.
    expect(document.body.textContent).not.toMatch(/Process Run/)
  })

  // Design fix wave item 4 (OD-65 mockup regression) — full-stack: an occurrence-grouped row whose
  // generating def binds a pic_role shows "via <role name>" beside the PIC.
  it('item 4: an occurrence-grouped row generated from a Role-bound def shows "via <role name>" beside the PIC', async () => {
    const genTask = makeTask({
      id: 'gen-1', title: 'Open the café',
      process_run_id: 'run-1', generated_from_task_def_id: 'def-1',
      responsible_person_id: OTHER_ID, accountable_person_id: OTHER_ID,
    })
    mockListTasks.mockResolvedValue([genTask])
    const rollup: ProcessRunRollup = {
      process_run_id: 'run-1', caption: 'Café HQ daily opening · 17 Jul 2026', scheduled_date: '2026-07-17',
      status: 'open', total: 1, open: 1, in_progress: 0, blocked: 0, done: 0,
      overdue: 0, pending_unresolved: 0, completion_pct: 0,
    }
    mockListRunRollups.mockResolvedValue([rollup])
    mockListTaskDefs.mockResolvedValue([{ id: 'def-1', title: 'Open the café', pic_role_id: 'role-1' }])
    mockListRoleNames.mockResolvedValue([{ id: 'role-1', name: 'Cafe Ops Lead' }])

    renderPage()
    await switchToAll()
    await waitFor(() => screen.getByText('Open the café'))
    chooseTaskFilter(taskFilter(/^group$/i), 'Occurrence')

    await waitFor(() => expect(mockListTaskDefs).toHaveBeenCalledWith(['def-1']))
    await waitFor(() => expect(screen.getByText('via Cafe Ops Lead')).toBeInTheDocument())
  })

  it('AC-622: an ad-hoc Task (no process_run_id) is never forced under an occurrence caption', async () => {
    const adhoc = makeTask({ id: 'adhoc-1', title: 'Ad-hoc task', process_run_id: null })
    mockListTasks.mockResolvedValue([adhoc])
    renderPage()
    await switchToAll()
    await waitFor(() => screen.getByText('Ad-hoc task'))

    chooseTaskFilter(taskFilter(/^group$/i), 'Occurrence')

    await waitFor(() => {
      expect(screen.getByText('One-off tasks')).toBeInTheDocument()
    })
    expect(screen.getByText('Ad-hoc task')).toBeInTheDocument()
  })
})

// ── Step 6 (Track C, C2) — the "N to assign" affordance opens PendingResolution ────────────────
describe('Step 6 — Occurrence-as-Tasks wiring (C2)', () => {
  it('clicking "N to assign" opens the pending-resolution surface; resolving materializes the Task in the same group', async () => {
    const genTask = makeTask({
      id: 'gen-1', title: 'Open the café', process_run_id: 'run-1',
      team_id: 'team-1',
      responsible_person_id: OTHER_ID, accountable_person_id: OTHER_ID,
    })
    // The workspace loads via the collection engine, which re-fetches on view/group changes; the
    // baseline resolution is persistent so those benign reloads keep returning the same single row.
    // A one-time override below simulates the post-resolve refresh returning the materialized Task.
    mockListTasks.mockResolvedValue([genTask])
    const rollup: ProcessRunRollup = {
      process_run_id: 'run-1', caption: 'Café HQ daily opening · 17 Jul 2026', scheduled_date: '2026-07-17',
      status: 'open', total: 1, open: 1, in_progress: 0, blocked: 0, done: 0,
      overdue: 0, pending_unresolved: 1, completion_pct: 0,
    }
    mockListRunRollups.mockResolvedValue([rollup])
    const pending: PendingTaskRow = {
      id: 'pending-1', process_run_id: 'run-1', task_def_id: 'def-2',
      candidate_person_ids: [VIEWER_ID, OTHER_ID], reason: 'multiple', resolved_at: null,
      title: 'Bakery handover',
    }
    mockListPendingTasks.mockResolvedValue([pending])
    mockResolvePendingTask.mockResolvedValue('task-new')
    mockCanStartProcessForTeam.mockResolvedValue(true)

    renderPage(CAPABLE_AUTH)
    await switchToAll()
    await waitFor(() => screen.getByText('Open the café'))
    chooseTaskFilter(taskFilter(/^group$/i), 'Occurrence')
    await waitFor(() => screen.getByText('Café HQ daily opening · 17 Jul 2026'))

    fireEvent.click(screen.getByRole('button', { name: '1 to assign' }))

    const dialog = await screen.findByRole('dialog', { name: 'Assign — two people could own this' })
    expect(mockListPendingTasks).toHaveBeenCalledWith('run-1')

    const nextTask = makeTask({
      id: 'gen-2', title: 'Bakery handover', process_run_id: 'run-1', responsible_person_id: VIEWER_ID,
    })
    mockListTasks.mockResolvedValueOnce([genTask, nextTask])

    await userEvent.click(within(dialog).getByRole('button', { name: 'Arief Said' }))

    await waitFor(() => expect(mockResolvePendingTask).toHaveBeenCalledWith('pending-1', VIEWER_ID))
    // The newly-resolved Task appears alongside the single-holder Task, still under the ONE
    // occurrence caption for this run (no second/divergent group was introduced).
    await waitFor(() => screen.getByText('Bakery handover'))
    expect(screen.getAllByText('Café HQ daily opening · 17 Jul 2026')).toHaveLength(1)
    expect(screen.getByText('Open the café')).toBeInTheDocument()
  })

  // Design fix wave item 3 — the affordance is capability-gated (RLS remains the real gate on the
  // underlying resolve_pending_task RPC; the UI simply never shows an action a viewer can't take).
  it('item 3: a viewer without process.start sees the roll-up summary but never the "N to assign" affordance', async () => {
    const genTask = makeTask({
      id: 'gen-1', title: 'Open the café', process_run_id: 'run-1',
      team_id: 'team-1',
      responsible_person_id: OTHER_ID, accountable_person_id: OTHER_ID,
    })
    mockListTasks.mockResolvedValue([genTask])
    const rollup: ProcessRunRollup = {
      process_run_id: 'run-1', caption: 'Café HQ daily opening · 17 Jul 2026', scheduled_date: '2026-07-17',
      status: 'open', total: 1, open: 0, in_progress: 0, blocked: 0, done: 1,
      overdue: 0, pending_unresolved: 1, completion_pct: 100,
    }
    mockListRunRollups.mockResolvedValue([rollup])

    renderPage() // default authedState: accessRoles: []
    await switchToAll()
    await waitFor(() => screen.getByText('Open the café'))
    chooseTaskFilter(taskFilter(/^group$/i), 'Occurrence')

    await waitFor(() => screen.getByText('Café HQ daily opening · 17 Jul 2026'))
    expect(screen.getByText(/1\/1 done/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /to assign/i })).not.toBeInTheDocument()
    expect(mockListPendingTasks).not.toHaveBeenCalled()
  })
})

// ── Step 7 (Track C, C2) — the Café panel's ?occurrence=<runId> link is honored on arrival ──────
// (docs/plans/2026-07-17-cafe-retrofit.md C2; cafe-retrofit.spec.md FR-704). Reuses the SAME
// Step-6 occurrence grouping (Rule 11) — visiting /work/tasks?occurrence=<runId> simply switches the
// view to the occurrence group-by so the caption for that run is in view; no new grouping mechanism.
describe('Step 7 — the ?occurrence=<runId> query param switches to Occurrence grouping (C2)', () => {
  function renderWithOccurrenceParam(runId: string) {
    function Harness() {
      const [savedView, setSavedView] = useState(makeSavedView())
      return (
        <>
          <TasksWorkspace
            savedView={savedView}
            onSavedViewChange={(next) => setSavedView(makeSavedView(next === 'mine' || next === 'overdue' ? next : 'all'))}
          />
          <LocationCapture />
        </>
      )
    }
    return render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={[`/work/tasks?occurrence=${runId}`]}>
          <OverlayHostProvider>
            <Harness />
          </OverlayHostProvider>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
  }

  it('AC: arriving with ?occurrence=<runId> groups the Tasks page by Occurrence — the run\'s caption is in view; "Process Run" never appears', async () => {
    const genTask = makeTask({
      id: 'gen-1', title: 'Open the café floor', process_run_id: 'run-1',
      responsible_person_id: OTHER_ID, accountable_person_id: OTHER_ID,
    })
    mockListTasks.mockResolvedValue([genTask])
    const rollup: ProcessRunRollup = {
      process_run_id: 'run-1', caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
      status: 'open', total: 1, open: 1, in_progress: 0, blocked: 0, done: 0,
      overdue: 0, pending_unresolved: 0, completion_pct: 0,
    }
    mockListRunRollups.mockResolvedValue([rollup])

    renderWithOccurrenceParam('run-1')

    // No manual "Group" toggle needed — the query param alone lands on the Occurrence grouping.
    await waitFor(() => {
      expect(screen.getByText('Café Opening · 17 Jul 2026')).toBeInTheDocument()
    })
    expect(taskFilter(/^group$/i)).toHaveTextContent('Occurrence')
    expect(document.body.textContent).not.toMatch(/Process Run/)
  })
})

describe('R5 task failure and filter boundaries', () => {
  it.each(['timeout', 'server'])('keeps %s failure framed and retries to real rows', async (failure) => {
    mockListTasks.mockRejectedValueOnce(new Error(failure))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load tasks")
    expect(screen.getByRole('searchbox', { name: /search tasks/i })).toBeInTheDocument()
    mockListTasks.mockResolvedValue([makeTask({ title: 'Recovered task' })])
    // Scoped to the results region, the way DR-2b below already scopes to its banner. The
    // toolbar's saved-view read is a separate failure with its own retry, and when it also
    // fails the page carries two "Try again" buttons — correctly, one per failure. An
    // unscoped query then matched both and this test failed intermittently on the ambiguity,
    // not on the retry. The assertion is unchanged: this retry must bring back real rows.
    const results = document.querySelector('.record-collection-results') as HTMLElement
    fireEvent.click(within(results).getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Recovered task')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load tasks")).toBeNull()
  })

  it('keeps an empty additive Include archived view a true empty, without Clear filters', async () => {
    mockListTasks.mockResolvedValue([])
    renderPage()
    await screen.findByRole('link', { name: /\+ create task/i })
    fireEvent.click(taskFilter(/^status$/i))
    fireEvent.click(screen.getByRole('checkbox', { name: /include archived/i }))
    await waitFor(() => expect(_capturedLocation?.search).toContain('archived=1'))
    expect(await screen.findByRole('heading', { name: 'Nothing archived yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /\+ create task/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^clear filters$/i })).toBeNull()
  })
})
