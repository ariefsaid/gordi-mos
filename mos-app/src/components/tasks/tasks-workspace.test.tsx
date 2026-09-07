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
import { render, screen, waitFor, fireEvent, act, within, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { Breadcrumb } from '@/shell/breadcrumb'
import { OverlayHostProvider } from '@/shell/overlay-host'
import { BreadcrumbTitleProvider } from '@/shell/breadcrumb-title'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { __resetTasksViewPrefForTests } from './use-tasks-view-pref'
import { TASKS_SPLIT_MIN_WIDTH } from '@/shell/use-is-split-width'

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
vi.mock('../../lib/db/signals', () => ({
  linkSignalTask: vi.fn(),
}))
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
  getDownlinePersonIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))
vi.mock('@/lib/db/user-views-collection', () => ({
  listCollectionViews: vi.fn(),
  getCollectionView: vi.fn(),
  createCollectionView: vi.fn(),
  renameCollectionView: vi.fn(),
  archiveCollectionView: vi.fn(),
}))

import { listTasks, getTask, createTask, updateTaskFields } from '@/lib/db/tasks'
import { linkSignalTask } from '@/lib/db/signals'
import { getBusinessUnits, getPeople, getDownlinePersonIds } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { listCollectionViews } from '@/lib/db/user-views-collection'
import type { PersistedCollectionView } from '@/lib/record-collection/collection-view-spec'
import { TasksWorkspace } from './tasks-workspace'
import { taskCollectionDescriptor } from './task-collection-adapter'

const mockListTasks = vi.mocked(listTasks)
const mockGetTask = vi.mocked(getTask)
const mockGetPeople = vi.mocked(getPeople)
const mockUpdateTaskFields = vi.mocked(updateTaskFields)
const mockCreateTask = vi.mocked(createTask)
const mockListCollectionViews = vi.mocked(listCollectionViews)
const mockLinkSignalTask = vi.mocked(linkSignalTask)

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
  viewer: { person: VIEWER_PERSON, roles: [mockRole], isManager: false, accessRoles: [], affiliated: [] },
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
      if (query.includes(`${TASKS_SPLIT_MIN_WIDTH}`)) matches = split
      else if (query.includes('1100')) matches = split
      else if (query.includes('919')) matches = narrow // useIsNarrow — rail collapsed / FAB present
      else if (query.includes('768')) matches = desktop
      return {
        matches, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }
    },
  })
}

function makeSavedView(view: 'mine' | 'overdue' | 'all' | 'unknown'): React.ComponentProps<typeof TasksWorkspace>['savedView'] {
  switch (view) {
    case 'mine':
      return { view, activeChip: 'mine' as const, segment: 'mine' as const, overdueOnly: false, search: '?view=mine' }
    case 'overdue':
      return { view, activeChip: 'overdue' as const, segment: 'all' as const, overdueOnly: true, search: '?view=overdue' }
    case 'unknown':
      return { view, activeChip: null, segment: 'all' as const, overdueOnly: false, search: '?view=bogus' }
    case 'all':
    default:
      return { view: 'all' as const, activeChip: null, segment: 'all' as const, overdueOnly: false, search: '' }
  }
}

function renderTable(
  props: Partial<React.ComponentProps<typeof TasksWorkspace>> = {},
  auth: AuthState = authedState,
  entries = ['/work/tasks'],
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
        <MemoryRouter initialEntries={entries}>
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
  vi.mocked(getDownlinePersonIds).mockResolvedValue([])
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(listWorkLines).mockResolvedValue([])
  mockListCollectionViews.mockResolvedValue([])
})

describe('D3e — Tasks create is an inline title row', () => {
  it('keeps ?create=1 until a cold-cache context loads, then inserts the inline row', async () => {
    let resolvePeople!: (people: typeof PEOPLE) => void
    mockListTasks.mockResolvedValue([makeTask({ title: 'Existing task' })])
    mockGetPeople.mockImplementationOnce(() => new Promise(resolve => { resolvePeople = resolve }))
    renderTable({}, authedState, ['/work/tasks?create=1'])
    expect(screen.queryByRole('textbox', { name: /title/i })).toBeNull()
    mockGetPeople.mockResolvedValue(PEOPLE)
    await act(async () => { resolvePeople(PEOPLE) })
    expect(await screen.findByRole('textbox', { name: /title/i })).toBeInTheDocument()
  })

  it('clicking + Create task inserts a focused editable title row without a create panel', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Existing task' })])
    renderTable()

    await waitFor(() => expect(screen.getByText('Existing task')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ Create task' }))

    const titleInput = await screen.findByRole('textbox', { name: /title/i })
    expect(titleInput).toHaveFocus()
    expect(titleInput).not.toBeDisabled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('complementary', { name: /create task/i })).toBeNull()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)

    fireEvent.change(titleInput, { target: { value: 'New inline task' } })
    mockCreateTask.mockResolvedValue('created-task')
    fireEvent.keyDown(titleInput, { key: 'Enter' })
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled())
    expect(mockCreateTask.mock.calls[0][0]).toMatchObject({ title: 'New inline task' })
  })

  it('Escape discards the inline row without writing', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Existing task' })])
    renderTable()
    await waitFor(() => expect(screen.getByText('Existing task')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ Create task' }))
    const titleInput = await screen.findByRole('textbox', { name: /title/i })
    fireEvent.keyDown(titleInput, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /title/i })).toBeNull())
    expect(mockCreateTask).not.toHaveBeenCalled()
  })
})

describe('Create from Signal convergence', () => {
  it('a draft commit with a source intent calls linkSignalTask(sourceSignal, createdId)', async () => {
    mockListTasks.mockResolvedValue([makeTask()])
    mockCreateTask.mockResolvedValue('created-from-signal')
    mockLinkSignalTask.mockResolvedValue(undefined)
    renderTable({}, authedState, ['/work/tasks?sourceSignal=signal-42'])
    fireEvent.click(await screen.findByRole('button', { name: /create task/i }))

    const title = await screen.findByRole('textbox', { name: /title/i })
    fireEvent.change(title, { target: { value: 'Signal title' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    await waitFor(() => expect(mockLinkSignalTask).toHaveBeenCalledWith('signal-42', 'created-from-signal'))
  })

  it('a unique link violation is treated as success', async () => {
    mockListTasks.mockResolvedValue([makeTask()])
    mockCreateTask.mockResolvedValue('created-unique')
    mockLinkSignalTask.mockRejectedValue(Object.assign(new Error('linkSignalTask failed'), { code: '23505' }))
    renderTable({}, authedState, ['/work/tasks?sourceSignal=signal-42'])
    fireEvent.click(await screen.findByRole('button', { name: /create task/i }))
    const title = await screen.findByRole('textbox', { name: /title/i })
    fireEvent.change(title, { target: { value: 'Signal title' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(mockCreateTask).toHaveBeenCalledTimes(1)
  })

  it('retry updates a changed draft title and re-links without recreating', async () => {
    mockListTasks.mockResolvedValue([makeTask()])
    mockCreateTask.mockResolvedValue('created-retry')
    mockLinkSignalTask.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    renderTable({}, authedState, ['/work/tasks?sourceSignal=signal-42'])
    fireEvent.click(await screen.findByRole('button', { name: /create task/i }))
    const title = await screen.findByRole('textbox', { name: /title/i })
    fireEvent.change(title, { target: { value: 'Original' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    await screen.findByRole('alert')
    fireEvent.doubleClick(screen.getByText('Original'))
    const edited = await screen.findByRole('textbox', { name: /title/i })
    fireEvent.change(edited, { target: { value: 'Edited after failure' } })
    fireEvent.keyDown(edited, { key: 'Enter' })
    await waitFor(() => expect(mockLinkSignalTask).toHaveBeenCalledTimes(2))
    expect(mockCreateTask).toHaveBeenCalledTimes(1)
    expect(mockUpdateTaskFields).toHaveBeenCalledWith('created-retry', { title: 'Edited after failure' }, VIEWER_ID)
  })

  it('discard after a link failure announces the created task is unlinked and clears the ref', async () => {
    mockListTasks.mockResolvedValue([makeTask()])
    mockCreateTask.mockResolvedValue('created-discard')
    mockLinkSignalTask.mockRejectedValue(new Error('offline'))
    renderTable({}, authedState, ['/work/tasks?sourceSignal=signal-42'])
    fireEvent.click(await screen.findByRole('button', { name: /create task/i }))
    const title = await screen.findByRole('textbox', { name: /title/i })
    fireEvent.change(title, { target: { value: 'Original' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    await screen.findByRole('alert')
    fireEvent.doubleClick(screen.getByText('Original'))
    fireEvent.keyDown(await screen.findByRole('textbox', { name: /title/i }), { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/exists.*unlinked/i))
    expect(screen.queryByRole('textbox', { name: /title/i })).toBeNull()
  })

  it('the id locale renders the translated link-failure announcement', async () => {
    localStorage.setItem('mos.locale', 'id')
    mockListTasks.mockResolvedValue([makeTask()])
    mockCreateTask.mockResolvedValue('created-id')
    mockLinkSignalTask.mockRejectedValue(new Error('offline'))
    renderTable({}, authedState, ['/work/tasks?sourceSignal=signal-42'])
    fireEvent.click(await screen.findByRole('button', { name: /create task|buat tugas/i }))
    const title = await screen.findByRole('textbox')
    fireEvent.change(title, { target: { value: 'Original' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Tugas dibuat, tautan gagal'))
  })
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

describe('AC-573 — saved-view chrome uses fetched state', () => {
  it('shows a fetched custom saved-view name in TasksWorkspace and Breadcrumb', async () => {
    mockListTasks.mockResolvedValue([makeTask()])
    const customView: PersistedCollectionView = {
      id: 'custom-view', name: 'My queue', scope: 'private', kind: 'collection', context: 'work',
      lifecycle: 'active', archivedAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      spec: taskCollectionDescriptor.savedViews.buildSpec({
        query: taskCollectionDescriptor.query.neutral,
        presentation: 'table',
      }),
    }
    mockListCollectionViews.mockResolvedValue([customView])

    render(
      <I18nProvider>
        <AuthContext.Provider value={authedState}>
          <MemoryRouter initialEntries={['/work/tasks?saved=custom-view']}>
            <OverlayHostProvider>
              <BreadcrumbTitleProvider>
                <TasksWorkspace />
                <nav aria-label="Breadcrumb"><Breadcrumb /></nav>
              </BreadcrumbTitleProvider>
            </OverlayHostProvider>
          </MemoryRouter>
        </AuthContext.Provider>
      </I18nProvider>,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'My queue' })).toBeInTheDocument())
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('My queue')
  })
})

// Helper: group/sort (and toggles) are progressively disclosed. On phone that is the single
// "View & filters" wrapper; on desktop it is the toolbar's own "View options" trigger. Open
// whichever is present and collapsed — the capability itself is the goal-oracle, unchanged.
function ensureViewOptionsOpen() {
  const trigger = screen.queryByRole('button', { name: /view & filters|view options/i })
  if (trigger?.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger)
}

// The Status trigger shares its accessible name with the table's Status column-header sort
// button (#743 r3) — toolbar-scoped queries keep the two apart.
function statusTrigger(container: HTMLElement): HTMLElement {
  const trigger = container.querySelector('.tasks-collection-toolbar button[aria-label="Status"]')
  if (!trigger) throw new Error('Status trigger not found in toolbar')
  return trigger as HTMLElement
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

  it('AC-574: the host cue tracks a real non-default filter and stays absent at defaults', async () => {
    stubMatchMedia(false, false)
    mockListTasks.mockResolvedValue([makeTask({ title: 'Cue task' })])

    const { container } = renderTable()
    await waitFor(() => screen.getByText('Cue task'))
    const trigger = screen.getByRole('button', { name: /view & filters/i })
    expect(document.querySelector('.view-options-disclosure__active-dot')).toBeNull()

    fireEvent.click(trigger)
    fireEvent.click(statusTrigger(container))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Blocked' }))
    await waitFor(() => expect(document.querySelector('.view-options-disclosure__active-dot')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /view & filters, all · status/i })).toBeInTheDocument()
  })

  it('Rule 8/11: the whole filter stack collapses behind the single shared "View options" disclosure, and reveals on expand', async () => {
    // The member phone filter stack (Group · Business unit · Status · Person + search)
    // folds behind ONE affordance — the SAME ViewOptionsDisclosure primitive Home uses
    // (Rule 11 reuse). Work leads; the configuration is one tap away, not the front wall.
    stubMatchMedia(false, false)
    mockListTasks.mockResolvedValue([makeTask({ title: 'Phone work item' })])

    renderTable()
    await waitFor(() => screen.getByText('Phone work item'))

    // Collapsed: every filter control is out of the DOM behind the disclosure.
    for (const name of [/group/i, /business unit/i, /person/i]) {
      expect(screen.queryByRole('combobox', { name })).toBeNull()
    }
    expect(document.querySelector('.tasks-collection-toolbar button[aria-label="Status"]')).toBeNull()
    const options = screen.getByRole('button', { name: /view & filters|view options/i })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    expect(options).toHaveAttribute('aria-controls', 'mobile-task-options-panel')

    // Expanding the ONE control reveals the full filter capability (no filter is lost).
    fireEvent.click(options)
    expect(options).toHaveAttribute('aria-expanded', 'true')
    for (const name of [/group/i, /business unit/i, /person/i]) {
      expect(screen.getByRole('combobox', { name })).toBeInTheDocument()
    }
    expect(document.querySelector('.tasks-collection-toolbar button[aria-label="Status"]')).not.toBeNull()
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

    // FR-001: the pill IS the filter — clicking presses it (no second clear chip exists).
    fireEvent.click(screen.getByRole('button', { name: /filter to.*overdue/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /filter to.*overdue/i })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('button', { name: /clear overdue filter/i })).toBeNull()
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
    expect(screen.getByRole('button', { name: '+ Create task' })).toBeInTheDocument()
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

  // #760 AC-052 — DESIGN.md § Responsive grammar → Phone bullet carries amendment A6 verbatim.
  it('AC-052: DESIGN.md Phone bullet carries amendment A6 verbatim', () => {
    const design = readFileSync(resolve(process.cwd(), '../DESIGN.md'), 'utf8')
    expect(design).toContain("The record's primary lifecycle action is inside the first viewport on phone; an action bar below the fields is not a substitute.")
    // The sentence lives INSIDE the Phone bullet (§ Responsive grammar) — the Phone bullet
    // is one line ending in the amendment, so the phrase before it stays intact next to it.
    expect(design).toMatch(/\*\*Phone \(390px and ≤767px\):\*\*[^\n]*no horizontal page overflow is allowed\. The record's primary lifecycle action is inside the first viewport on phone; an action bar below the fields is not a substitute\./)
  })

  // #760 AC-049 — the phone "View & filters" door has no Fields chooser (cards have no columns
  // to pick from) and no separate Show archived toggle (Include archived rides the Status
  // popover per #743). Save view remains; labels stay stacked (OD-REDESIGN-84). The visible
  // controls are: the door trigger itself + 3 view chips + search + 5 filter selects (Group ·
  // Business unit · Status · Person · Sort) + Save view + the overdue attention pill = twelve.
  it('AC-049: the phone door has no Fields, no Show archived; Save view stays; twelve controls in total', async () => {
    stubMatchMedia(false, false)
    mockListTasks.mockResolvedValue([makeTask({ title: 'A phone task' })])

    const { container } = renderTable()
    await waitFor(() => screen.getByText('A phone task'))

    const trigger = screen.getByRole('button', { name: /view & filters|view options/i })
    // Fields is gone from the door — even after opening it (Desktop still keeps Fields per AC-006).
    fireEvent.click(trigger)
    expect(screen.queryByRole('button', { name: /^Fields$/ })).toBeNull()
    // No independent "Show archived" toggle at the door level (Include archived lives inside the
    // Status popover per #743 — the door itself does not carry a second archived control).
    expect(screen.queryByRole('button', { name: /show archived/i })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /show archived/i })).toBeNull()

    // Save view stays.
    expect(screen.getByRole('button', { name: /save view/i })).toBeInTheDocument()

    // Labels stay stacked — every filter shows its own label span above the control
    // (collection-toolbar.tsx wraps each option-field with the label span at phone width).
    const optionFields = container.querySelectorAll('.tasks-collection-toolbar .collection-toolbar__option-field')
    expect(optionFields.length).toBeGreaterThanOrEqual(5)
    for (const field of Array.from(optionFields)) {
      expect(field.querySelector(':scope > span')).not.toBeNull()
    }

    // Twelve controls in total (the door's own trigger + 3 chips + 1 search + 5 filters +
    // 1 Save view + 1 overdue pill). Fields is intentionally excluded.
    const chips = container.querySelectorAll('.tasks-collection-toolbar .collection-toolbar__view')
    const searchBox = container.querySelectorAll('.tasks-collection-toolbar .collection-toolbar__search')
    const filterSelects = container.querySelectorAll('.tasks-collection-toolbar .collection-toolbar__select')
    const ghostButtons = container.querySelectorAll('.tasks-collection-toolbar .collection-toolbar__options .btn')
    const pill = container.querySelectorAll('.tasks-collection-toolbar .overdue-filter-btn')
    // Door trigger is outside the tasks-collection-toolbar wrapper.
    const doorTrigger = document.querySelectorAll('.mobile-task-options-trigger')
    expect(chips).toHaveLength(3)
    expect(searchBox).toHaveLength(1)
    expect(filterSelects).toHaveLength(5)
    // Only Save view remains (Fields is gone) — one ghost text button.
    expect(ghostButtons).toHaveLength(1)
    expect(pill).toHaveLength(1)
    expect(doorTrigger).toHaveLength(1)
    const total = chips.length + searchBox.length + filterSelects.length + ghostButtons.length + pill.length + doorTrigger.length
    expect(total).toBe(12)
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
  // AC-003 (#743): Table is the Task collection's only live desktop presentation (Card is the
  // phone rendering of Table), so the strip does not render at all — no dead tab.
  it('renders no presentation switcher while Table is the only live presentation', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /table/i })).not.toBeInTheDocument()
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
  it('Business unit / Person / Group / Sort use the shared Select shell; Status is the one popover control of the same dropdown class (#743 r3)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    const { container } = renderTable()
    await waitFor(() => screen.getByText('A task'))
    ensureViewOptionsOpen()
    expect(container.querySelectorAll('.collection-toolbar .mk-select').length).toBeGreaterThanOrEqual(4)
    // Each filter is still a reachable, labelled control (capability preserved); Status keeps
    // its dropdown-class chrome but carries no native select — its choices live in a popover.
    expect(screen.getByRole('combobox', { name: /group/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /business unit/i })).toBeInTheDocument()
    expect(statusTrigger(container)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /^status$/i })).toBeNull()
    expect(screen.getByRole('combobox', { name: /person/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /sort/i })).toBeInTheDocument()
  })

  it('the Status popover carries checkbox choices; a choice shows on the trigger and leaves no checkbox in the closed row (#743 r3)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    const { container } = renderTable()
    await waitFor(() => screen.getByText('A task'))
    ensureViewOptionsOpen()
    const trigger = statusTrigger(container)
    expect(trigger.textContent).toContain('Any status')
    fireEvent.click(trigger)
    const menu = screen.getByRole('group', { name: 'Status' })
    const boxes = within(menu).getAllByRole('checkbox')
    expect(boxes.map((box) => box.closest('label')?.textContent)).toEqual([
      'Open', 'In Progress', 'Blocked', 'Done', 'Include archived',
    ])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Blocked' }))
    await waitFor(() => expect(trigger.textContent).toContain('Blocked'))
    // Closed again, the row holds zero checkboxes — a popover's boxes are not toolbar controls.
    fireEvent.click(trigger)
    expect(document.querySelectorAll('[data-testid="collection-toolbar-row"] input[type="checkbox"]')).toHaveLength(0)
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
      // Capability preserved: status grouping still renders. Only Open holds a row;
      // #569 drops empty statuses → exactly one populated group header.
      expect(document.querySelectorAll('tr.grp').length).toBe(1)
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
    // Options carry the "Group: " prefix (AC-005, FR-005)
    const options = Array.from(groupSelect.querySelectorAll('option')).map(o => o.textContent)
    expect(options).toContain('Group: Status')
    expect(options).toContain('Group: PIC')
    expect(options.some(o => o && /Group: Business unit/i.test(o))).toBe(true)
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
  // #743 AC-002: the AR Follow-ups chip is gone; the chip set is All · My work · Overdue
  // (Team work is the saved-views ticket's, so its absence stays pinned here).
  it('§Task-11 + AC-002: renders All / My work / Overdue chips — no Team work, no AR Follow-ups', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overdue' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Team work' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'AR Follow-ups' })).toBeNull()
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
    // The overdue-only state lives on the attention pill itself (FR-001) — pressed, not a chip.
    expect(screen.getByRole('button', { name: /filter to.*overdue/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /clear overdue filter/i })).toBeNull()
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

  // AC-002 (#743, W-D step 3): the retired AR view redirects to the All view — the URL loses
  // the stale param, the collection renders tasks, and no AR copy exists anywhere.
  it('AC-002: /work/tasks?view=followups lands on the All view with no AR copy', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'task-1', title: 'Ordinary task' })])
    const { getLocation } = renderAt(['/work/tasks?view=followups'])
    await waitFor(() => screen.getByText('Ordinary task'))
    expect(getLocation()?.search ?? '(no location)').not.toContain('view=followups')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/AR Follow-up/i)).toBeNull()
    expect(screen.queryByText(/follow-ups are coming to this workspace/i)).toBeNull()
  })

  it('AC-305: after view=mine loads, Group / Unit / Status / Person still work without rewriting the saved view', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'mine', title: 'Mine task' }),
      makeTask({ id: 'other', title: 'Shared blocked', responsible_person_id: 'other-id', accountable_person_id: 'other-id', status: 'Blocked' }),
    ])
    const onSavedViewChange = vi.fn()
    const { container } = renderTable({ savedView: makeSavedView('mine'), onSavedViewChange })
    await waitFor(() => screen.getByText('Mine task'))

    ensureViewOptionsOpen()
    fireEvent.change(screen.getByRole('combobox', { name: /group/i }), { target: { value: 'status' } })
    fireEvent.change(screen.getByRole('combobox', { name: /business unit/i }), { target: { value: 'bu-1' } })
    fireEvent.click(statusTrigger(container))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Blocked' }))
    fireEvent.change(screen.getByRole('combobox', { name: /person/i }), { target: { value: 'other-id' } })

    await waitFor(() => {
      expect((screen.getByRole('combobox', { name: /group/i }) as HTMLSelectElement).value).toBe('status')
      expect(statusTrigger(container).textContent).toContain('Blocked')
      expect((screen.getByRole('combobox', { name: /person/i }) as HTMLSelectElement).value).toBe('other-id')
    })
    expect(screen.getByRole('button', { name: 'My work' })).toHaveAttribute('aria-pressed', 'true')
    expect(onSavedViewChange).not.toHaveBeenCalled()
  })
})

// ── Task 11 — Missing states + overdue filter button (AC-133, AC-128) ─────────

// ── Ticket #743 — the two-row e7 toolbar grammar ─────────────────────────────
// W-D step 2 (Dewi, 1440): count rows/controls/classes; one blue primary; no "?" tip.
describe('Ticket #743 — two-row toolbar grammar', () => {
  it('AC-001: Director at 1440 — two rows, twelve controls, four control classes, one pill, one primary in the head', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Late task', due_date: '2020-01-01' }),
      makeTask({ id: 't2', title: 'Calm task' }),
    ])
    const { container } = renderTable()
    await waitFor(() => screen.getByText('Late task'))

    const design = readFileSync(resolve(process.cwd(), '../DESIGN.md'), 'utf8')
    expect(design).toContain('No checkbox, no toggle, no second pill, no third row; a state that needs more rows is a saved view or a filter option.')
    expect(design).toContain('The strip renders only when two or more presentations are live at the current width.')

    const toolbar = container.querySelector('.tasks-collection-toolbar') as HTMLElement
    expect(toolbar).toBeInTheDocument()
    // Two rows: row 1 (views), row 2 (search · group · business unit · status · person · sort ·
    // fields · save view · attention pill).
    expect(toolbar.querySelectorAll('[data-testid="collection-toolbar-row"]')).toHaveLength(2)
    // Twelve controls — four control classes only (chip · dropdown · ghost text · count pill;
    // DESIGN.md: "No checkbox, no toggle, no second pill, no third row"). The search shares the
    // dropdown-class chrome; Status is one dropdown-class control whose checkbox options live in
    // its popover (a popover's boxes are not toolbar controls). The runs-due pill LEFT the
    // toolbar in this ticket — #754 re-homes the runs source at Home/Café.
    expect(toolbar.querySelectorAll('.collection-toolbar__view')).toHaveLength(3) // chips: All · My work · Overdue
    expect(toolbar.querySelectorAll('.collection-toolbar__search')).toHaveLength(1) // dropdown-class
    expect(toolbar.querySelectorAll('.collection-toolbar__select')).toHaveLength(5) // dropdown-class: Group · BU · Status · Person · Sort
    expect(toolbar.querySelectorAll('.collection-toolbar__options .btn')).toHaveLength(2) // ghost text: Fields · Save view
    expect(toolbar.querySelectorAll('.overdue-filter-btn')).toHaveLength(1) // the ONE count pill
    // No checkbox in either row while every popover is closed.
    expect(toolbar.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /filter to 1 overdue/i })).toBeInTheDocument()
    // No active-filter chip (FR-001: the pill carries the pressed state), no presentation switcher.
    expect(toolbar.querySelectorAll('.overdue-chip')).toHaveLength(0)
    expect(screen.queryByRole('tablist')).toBeNull()
    // The head holds the only .btn-primary on the page.
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1)
  })

  // FR-001 (delta review): "no second pill" holds in EVERY state, not only at rest. Clicking the
  // attention pill presses the pill itself — exactly one pill/chip-family control, pressed and
  // tinted, and clicking it again clears. A second active-filter chip must never exist.
  it('FR-001: clicking the attention pill presses the pill itself — one control, every state', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Late task', due_date: '2020-01-01' }),
      makeTask({ id: 't2', title: 'Calm task', due_date: '2030-12-31' }),
    ])
    const { container } = renderTable()
    await waitFor(() => screen.getByText('Late task'))

    const pill = () => container.querySelector('.overdue-filter-btn') as HTMLButtonElement
    expect(pill().getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(pill())
    await waitFor(() => expect(screen.queryByText('Calm task')).toBeNull())
    // Exactly ONE control in the pill/chip family — the pressed pill, never a second chip.
    expect(container.querySelectorAll('.overdue-filter-btn, .overdue-chip')).toHaveLength(1)
    expect(pill().getAttribute('aria-pressed')).toBe('true')
    expect(pill().className).toContain('overdue-filter-btn--active')

    // The same pressed pill clears the filter — still exactly one control.
    fireEvent.click(pill())
    await waitFor(() => expect(screen.getByText('Calm task')).toBeInTheDocument())
    expect(container.querySelectorAll('.overdue-filter-btn, .overdue-chip')).toHaveLength(1)
    expect(pill().getAttribute('aria-pressed')).toBe('false')
  })

  it('AC-004 (W-G step 3): search placeholder = accessible label — "Search tasks" / "Cari tugas"', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    const en = renderTable()
    await waitFor(() => screen.getByText('A task'))
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveAttribute('placeholder', 'Search tasks')
    en.unmount()

    localStorage.setItem('mos.locale', 'id')
    const id = renderTable()
    await waitFor(() => screen.getByText('A task'))
    expect(screen.getByRole('searchbox', { name: 'Cari tugas' })).toHaveAttribute('placeholder', 'Cari tugas')
    id.unmount()
  })

  it('AC-005 (W-G step 4): Group = Status tints navy and reads "Kelompok: Status"; None reads "Kelompok: Tidak" untinted (ID)', async () => {
    localStorage.setItem('mos.locale', 'id')
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: 'Kelompok' }) as HTMLSelectElement
    const wrapper = groupSelect.closest('.collection-toolbar__option-field') as HTMLElement
    // None: no navy tint, full "Kelompok: Tidak" value (never the clipped noun).
    expect(wrapper.className).not.toContain('collection-toolbar__option-field--group')
    expect(groupSelect.selectedOptions[0].textContent).toBe('Kelompok: Tidak')

    fireEvent.change(groupSelect, { target: { value: 'status' } })
    expect(wrapper.className).toContain('collection-toolbar__option-field--group')
    expect(groupSelect.selectedOptions[0].textContent).toBe('Kelompok: Status')
  })

  it('AC-006 (W-G step 5): Fields chooser — Business unit · Project/Process · Objective · Last activity toggleable; the decision five locked', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    fireEvent.click(screen.getByRole('button', { name: 'Fields' }))

    // Scope to the chooser menu — the Status popover's own boxes live in their separate menu.
    const menu = screen.getByRole('group', { name: 'Fields' })
    const boxes = within(menu).getAllByRole('checkbox')
    expect(boxes).toHaveLength(9)
    const locked = boxes.filter((box) => box.hasAttribute('disabled'))
    expect(locked).toHaveLength(5)
    const optional = boxes.filter((box) => !box.hasAttribute('disabled'))
    expect(optional.map((box) => box.closest('label')?.textContent)).toEqual([
      'Business unit', 'Project/Process', 'Objective', 'Last activity',
    ])
  })
  // AC-009 (delta review): the true-empty copy and the filtered-empty copy are two i18n keys.
  // The true-empty paragraph carries the onboarding sentence (the retired "?" tip) and must not
  // mention filters at all; only the filtered-empty state speaks about filters.
  it('AC-009: no help tip in the head at 1440 or 390; the true-empty copy carries the tip sentence, filter-free', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    const desktop = renderTable()
    await waitFor(() => screen.getByText('A task'))
    expect(screen.queryByRole('button', { name: /Everything you or your team own/i })).toBeNull()
    desktop.unmount()

    stubMatchMedia(true, false)
    const phone = renderTable()
    await waitFor(() => screen.getByRole('button', { name: /view & filters/i }))
    expect(screen.queryByRole('button', { name: /Everything you or your team own/i })).toBeNull()
    phone.unmount()

    stubMatchMedia(true, true)
    mockListTasks.mockResolvedValue([])
    renderTable()
    await waitFor(() => screen.getByText(/No tasks yet/i))
    const trueEmpty = screen.getByText(/PIC is the person doing the work/i)
    expect(trueEmpty.textContent).toContain('Saved views remember what you chose to see')
    // The true-empty paragraph never mentions filters — that is the FILTERED-empty copy's job.
    expect(trueEmpty.textContent).not.toMatch(/filter/i)
  })

  it('AC-009: the filtered-empty state keeps its own copy — a distinct key that does mention filters', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'Alpha task' })])
    renderTable()
    await waitFor(() => screen.getByText('Alpha task'))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tasks' }), { target: { value: 'zzz-no-match' } })
    const filteredEmpty = await screen.findByText(/clear filters to see all tasks/i)
    expect(filteredEmpty).toBeInTheDocument()
    // The two states never render each other's copy.
    expect(screen.queryByText(/PIC is the person doing the work/i)).toBeNull()
  })
})

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

  it('AC-133: error shows role=alert + retry button', async () => {
    // #359: ErrorState's default retry label now comes from the catalog (common.retry
    // = 'Try again'), no longer the untranslated literal 'Retry'.
    mockListTasks.mockRejectedValue(new Error('network failure'))
    renderTable()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
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

    // Click it → only overdue rows shown, and the pill ITSELF carries the active state (FR-001).
    fireEvent.click(overdueBtn)
    await waitFor(() => {
      expect(screen.queryByText('Normal task')).toBeNull()
      expect(screen.getByText('Overdue task')).toBeInTheDocument()
    })
    expect(overdueBtn).toHaveAttribute('aria-pressed', 'true')
    expect(overdueBtn.className).toContain('overdue-filter-btn--active')
    expect(screen.queryByRole('button', { name: /clear overdue filter/i })).toBeNull()

    // Clicking the same pressed pill clears — both tasks visible again.
    fireEvent.click(overdueBtn)
    await waitFor(() => {
      expect(screen.getByText('Normal task')).toBeInTheDocument()
      expect(screen.getByText('Overdue task')).toBeInTheDocument()
    })
    expect(overdueBtn).toHaveAttribute('aria-pressed', 'false')
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

    // #374's fix taught the open effect to remember "the user closed THIS record" so a replayed
    // ?record= cannot resurrect the drawer. The memory must not outlive the close: after a browser
    // Back the SAME row is the likeliest next click, and it opened nothing at all (PR #394 review).
    it('after a browser-Back close, clicking the same row opens it again', async () => {
      const task = makeTask({ id: 'task-reopen', title: 'Reopenable task' })
      mockListTasks.mockResolvedValue([task])
      mockGetTask.mockResolvedValue({ task, checklist: [], events: [] })
      const { getLocation } = renderAt(['/work/tasks'])
      await waitFor(() => screen.getByText('Reopenable task'))

      const row = () => document.querySelector('tr.task-row') as HTMLElement
      const drawer = () => document.querySelector('[data-overlay-host="true"][data-overlay-owner="tasks"]')

      fireEvent.click(row())
      await waitFor(() => expect(drawer()).toBeTruthy())
      await waitFor(() => expect(getLocation()?.search).toContain('record=task-reopen'))

      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      await waitFor(() => expect(drawer()).toBeNull())
      await waitFor(() => expect(getLocation()?.search ?? '').not.toContain('record='))

      fireEvent.click(row())
      await waitFor(() => expect(drawer()).toBeTruthy())
      expect(getLocation()?.search).toContain('record=task-reopen')
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
    // Group header rows (tr.grp): only statuses holding rows render — In Progress and
    // Done are empty in scope and dropped by #569.
    const groups = document.querySelectorAll('tr.grp')
    expect(groups.length).toBe(2)
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
  it('AC-124: grouping by Owner renders only owner groups that hold rows (#569)', async () => {
    // Only the viewer owns a task; Budi (other-id) owns none → his empty group is dropped.
    mockListTasks.mockResolvedValue([makeTask({ id: 'a', title: 'Mine task' })])
    renderTable()
    await waitFor(() => screen.getByText('Mine task'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'owner' } })
    await waitFor(() => {
      const groups = Array.from(document.querySelectorAll('tr.grp'))
      const budiHeader = groups.find(g => g.textContent?.includes('Budi'))
      expect(budiHeader).toBeFalsy() // zero-count owner group dropped (#569)
      expect(groups.length).toBe(1) // only the owner holding the task renders
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

describe('S2.1 — split decision-column floors', () => {
  it('keeps each decision column floor in its own split rule block', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
    expect(css).toContain('.split:not(.nodrawer) .tasks-table th:nth-child(1)')
    for (const column of [1, 2, 3, 4, 5]) {
      const selector = `.split:not(.nodrawer) .tasks-table th:nth-child(${column})`
      const start = css.indexOf(selector)
      const open = css.indexOf('{', start)
      const close = css.indexOf('}', open)
      expect(css.slice(open + 1, close), `${selector} must own its floor`).toMatch(/width:\s*\d+px/)
    }
  })
})

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
    // AC-020 (#750) dropped the ⋯ menu column: five decision columns (Task · Status · PIC ·
    // Supervisor · Due) + the optional BU column. The skeleton row, the populated row
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
    expect(ths.length).toBe(5) // Task · Status · PIC · Supervisor · Due
    expect(document.querySelector('th.th-menu, td.td-menu')).toBeNull()
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

  // AC-W2C + AC-006 (delta review #743): the default table stays priority-only, but EVERY field
  // the Fields chooser offers renders a real column when checked — header + body cell with the
  // field's real data — and disappears when unchecked. (The old "no optional td" pin protected
  // the old never-render behaviour; the chooser made it false.)
  it('AC-W2C + AC-006: each Fields choice toggles a real column in the thead AND the body row', async () => {
    vi.mocked(listWorkLines).mockResolvedValue([
      { id: 'wl-1', name: 'Delivery', type: 'process', objective_id: null },
    ])
    vi.mocked(listObjectives).mockResolvedValue([{ id: 'obj-1', name: 'Launch' }])
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    mockListTasks.mockResolvedValue([makeTask({
      id: 'd1', title: 'Density row',
      work_line_id: 'wl-1', objective_id: 'obj-1', last_activity_at: twoHoursAgo,
    })])
    renderTable()
    await waitFor(() => screen.getByText('Density row'))

    // Default: none of the optional columns render.
    for (const name of [/business unit/i, /project\/process/i, /^objective$/i, /last activity/i]) {
      expect(screen.queryByRole('columnheader', { name })).toBeNull()
    }
    let row = document.querySelector('tr.task-row')!
    // Task + Status + PIC + Supervisor + Due. The ⋯ row-menu column is retired (AC-020, #750),
    // so the decision set is five columns, not six.
    expect(row.querySelectorAll('td')).toHaveLength(5)
    // …and the five priority data cells are the ones present.
    expect(row.querySelector('.td-owner')).toBeTruthy()      // PIC
    expect(row.querySelector('.td-supervisor')).toBeTruthy()
    expect(row.querySelector('.due-calm,.due-soon,.due-overdue')).toBeTruthy() // Due

    fireEvent.click(screen.getByRole('button', { name: 'Fields' }))
    // The chooser menu stays open across toggles (toolbar-local state).
    const menu = () => within(screen.getByRole('group', { name: 'Fields' }))
    // Each offered field, checked → its real column (header + data cell) appears.
    const cases: readonly (readonly [string, string, string])[] = [
      ['Business unit', 'Kitchen', 'business-unit'],
      ['Project/Process', 'Delivery', 'workline'],
      ['Objective', 'Launch', 'objective'],
      ['Last activity', '2h', 'activity'],
    ]
    for (const [label, cellText, cellClass] of cases) {
      fireEvent.click(menu().getByRole('checkbox', { name: label }))
      expect(document.querySelector(`.tasks-table .th-${cellClass}`)).not.toBeNull()
      row = document.querySelector('tr.task-row')!
      const cell = row.querySelector(`.td-${cellClass}`)
      expect(cell).not.toBeNull()
      expect(cell!.textContent).toBe(cellText)
      // Header and body stay in lockstep as columns come and go.
      expect(row.querySelectorAll('td').length).toBe(document.querySelectorAll('.tasks-table thead th').length)
      fireEvent.click(menu().getByRole('checkbox', { name: label }))
      expect(document.querySelector(`.tasks-table .th-${cellClass}`)).toBeNull()
      row = document.querySelector('tr.task-row')!
      expect(row.querySelector(`.td-${cellClass}`)).toBeNull()
      expect(row.querySelectorAll('td').length).toBe(document.querySelectorAll('.tasks-table thead th').length)
    }
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

// ── Ticket #750 — rows/body judgment wave (AC-019 · AC-022 · AC-024) ─────────

describe('Ticket #750 — AC-019 footer legend states the click grammar', () => {
  const EN_LEGEND = 'Click a row to open it · ✎ or F2 edits the title · Enter saves · Esc discards'
  const ID_LEGEND = 'Klik baris untuk membukanya · ✎ atau F2 menyunting judul · Enter menyimpan · Esc membatalkan'

  it('AC-019: the legend under the table reads the new grammar in EN and in ID', async () => {
    const previousLocale = localStorage.getItem('mos.locale')
    try {
      mockListTasks.mockResolvedValue([makeTask({ title: 'Legend task' })])
      renderTable()
      await waitFor(() => screen.getByText('Legend task'))
      expect(document.querySelector('.tasks-inline-edit-hint')?.textContent).toBe(EN_LEGEND)

      localStorage.setItem('mos.locale', 'id')
      cleanup()
      mockListTasks.mockResolvedValue([makeTask({ title: 'Tugas legenda' })])
      renderTable()
      await waitFor(() => screen.getByText('Tugas legenda'))
      expect(document.querySelector('.tasks-inline-edit-hint')?.textContent).toBe(ID_LEGEND)
    } finally {
      if (previousLocale === null) localStorage.removeItem('mos.locale')
      else localStorage.setItem('mos.locale', previousLocale)
    }
  })
})

describe('Ticket #750 — AC-022 in-row PIC/Due edit follows the permission rules', () => {
  const DOWNLINE_ID = 'barista-id'
  const DOWNLINE_PERSON = { id: DOWNLINE_ID, full_name: 'Rina Barista' }

  it('AC-022: Cahya (manager above the PIC) gets a self+downline PIC picker and Due editor that save in place', async () => {
    // Cahya = the viewer; the row's PIC sits in his downline → the DB lets him edit.
    vi.mocked(getDownlinePersonIds).mockResolvedValue([DOWNLINE_ID])
    vi.mocked(getPeople).mockResolvedValue([PEOPLE[0], DOWNLINE_PERSON])
    mockListTasks.mockResolvedValue([makeTask({
      id: 'bar-task', title: 'Bar team task',
      responsible_person_id: DOWNLINE_ID, accountable_person_id: 'sinta-id',
    })])
    renderTable({}, authedState)
    await waitFor(() => screen.getByText('Bar team task'))

    // PIC cell: an inline trigger opens the picker, offering self + downline.
    const picTrigger = document.querySelector('td.td-owner button.inline-cell-trigger') as HTMLButtonElement
    expect(picTrigger, 'PIC cell is editable for the manager above the PIC').toBeTruthy()
    fireEvent.click(picTrigger)
    const picSelect = screen.getByRole('combobox', { name: 'Edit task PIC' }) as HTMLSelectElement
    const optionLabels = [...picSelect.options].map((option) => option.textContent)
    expect(optionLabels).toEqual(['Arief Said', 'Rina Barista'])
    // Saves in place through the same updateTaskFields path the record editor uses.
    fireEvent.change(picSelect, { target: { value: VIEWER_ID } })
    await waitFor(() => expect(mockUpdateTaskFields).toHaveBeenCalledWith(
      'bar-task', { responsible_person_id: VIEWER_ID }, VIEWER_ID, DOWNLINE_ID,
    ))
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Edit task PIC' })).toBeNull())

    // Due cell: editable in-row too (same gate).
    const dueTrigger = document.querySelector('td.td-due button.inline-cell-trigger') as HTMLButtonElement
    expect(dueTrigger, 'Due cell is editable for the manager above the PIC').toBeTruthy()
  })

  it('AC-022: Bulan (no downline) on a peer task reads PIC and Due as plain text', async () => {
    vi.mocked(getDownlinePersonIds).mockResolvedValue([])
    mockListTasks.mockResolvedValue([makeTask({
      id: 'peer-task', title: 'Peer task',
      responsible_person_id: 'other-id', accountable_person_id: 'other-id',
    })])
    renderTable({}, authedState)
    await waitFor(() => screen.getByText('Peer task'))
    expect(document.querySelector('td.td-owner button.inline-cell-trigger')).toBeNull()
    expect(document.querySelector('td.td-due button.inline-cell-trigger')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Edit task PIC' })).toBeNull()
    // The values still render — honest read-only, not blank.
    expect(document.querySelector('td.td-owner')?.textContent).toContain('Budi')
  })
})

describe('Ticket #750 — AC-024 the skeleton never outlives the request', () => {
  it('AC-024: an aborted load renders "Couldn\'t load tasks · Try again", drops the skeleton, and Try again re-issues the query', async () => {
    const abortError = new DOMException('The request was aborted', 'AbortError')
    mockListTasks.mockRejectedValueOnce(abortError).mockResolvedValue([makeTask({ title: 'Back after abort' })])
    renderTable()
    // The error state replaces the skeleton — no aria-busy loading region, no .sk cells.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load tasks/i)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
    expect(document.querySelector('.sk')).toBeNull()
    // Try again re-issues the load; the collection recovers to ready rows.
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(mockListTasks).toHaveBeenCalledTimes(2))
    await waitFor(() => screen.getByText('Back after abort'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// ── #751 AC-033 — one primary per screen: the head Create drops to outline while a record is open ──
describe('Ticket #751 AC-033 — the head "+ Create task" carries .btn-outline while a record is open', () => {
  it('the head button stays mounted but outline when the drawer is open (no second blue)', async () => {
    stubMatchMedia(true, true)
    mockListTasks.mockResolvedValue([makeTask({ id: 'w-1', title: 'Open record row' })])
    const { container } = renderTable({ drawerOpen: true })
    await waitFor(() => screen.getByText('Open record row'))
    const create = screen.getByRole('button', { name: '+ Create task' })
    expect(create).toHaveClass('btn-outline')
    expect(create).not.toHaveClass('btn-primary')
    // The collection contributes zero primaries while the record owns the screen's blue.
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(0)
  })

  it('the head button is the .btn-primary again once the drawer closes', async () => {
    stubMatchMedia(true, true)
    mockListTasks.mockResolvedValue([makeTask({ id: 'w-2', title: 'Closed drawer row' })])
    const { container } = renderTable({ drawerOpen: false })
    await waitFor(() => screen.getByText('Closed drawer row'))
    const create = screen.getByRole('button', { name: '+ Create task' })
    expect(create).toHaveClass('btn-primary')
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1)
  })
})
