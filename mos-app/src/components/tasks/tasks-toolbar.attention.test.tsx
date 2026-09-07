/**
 * #754 (AC-026..029) — ONE attention pill on the Tasks toolbar.
 *
 * Mounted against the live TasksWorkspace + collection engine so the popover's chosen
 * item actually pushes ?view=overdue / ?status=blocked into the URL — the projection
 * is the goal-oracle, not a shallow snapshot of what the toolbar rendered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { OverlayHostProvider } from '@/shell/overlay-host'
import { BreadcrumbTitleProvider } from '@/shell/breadcrumb-title'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { __resetTasksViewPrefForTests } from './use-tasks-view-pref'
import { TASKS_SPLIT_MIN_WIDTH } from '@/shell/use-is-split-width'

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
vi.mock('../../lib/db/signals', () => ({ linkSignalTask: vi.fn() }))
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
  getDownlinePersonIds: vi.fn().mockResolvedValue([]),
  getPersonTeams: vi.fn().mockResolvedValue([]),
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
// Mocked at the DAL boundary so the workspace does not attempt to load any runs source
// (AC-029 in spirit: no runs door on /work/tasks; the projector never calls this either).
vi.mock('../../lib/db/processes', () => ({
  listDueRuns: vi.fn(),
  startRun: vi.fn(),
  listRunRollups: vi.fn(),
  listPendingTasks: vi.fn(),
  resolvePendingTask: vi.fn(),
  listTaskDefs: vi.fn(),
}))

import { listTasks } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { listCollectionViews } from '@/lib/db/user-views-collection'
import { listDueRuns } from '@/lib/db/processes'
import { TasksWorkspace } from './tasks-workspace'

const mockListTasks = vi.mocked(listTasks)

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

const BUS = [{ id: 'bu-1', name: 'Kitchen' }]
const PEOPLE = [{ id: VIEWER_ID, full_name: 'Arief Said' }]

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Default task',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T10:00:00Z', archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

function stubMatchMedia(desktop = true, narrow = !desktop) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      let matches = false
      if (query.includes(`${TASKS_SPLIT_MIN_WIDTH}`)) matches = desktop
      else if (query.includes('1100')) matches = desktop
      else if (query.includes('919')) matches = narrow
      else if (query.includes('768')) matches = desktop
      return {
        matches, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }
    },
  })
}

let capturedLocation: ReturnType<typeof useLocation> | null = null
function LocationProbe() {
  capturedLocation = useLocation()
  return null
}

function renderPage(entries = ['/work/tasks']) {
  return render(
    <I18nProvider>
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={entries}>
          <BreadcrumbTitleProvider>
            <OverlayHostProvider>
              <LocationProbe />
              <TasksWorkspace savedView={{ view: 'all', activeChip: null, segment: 'all', overdueOnly: false, search: '' }} onSavedViewChange={() => {}} />
            </OverlayHostProvider>
          </BreadcrumbTitleProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  __resetTasksViewPrefForTests()
  stubMatchMedia(true)
  vi.mocked(getBusinessUnits).mockResolvedValue(BUS)
  vi.mocked(getPeople).mockResolvedValue(PEOPLE)
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(listWorkLines).mockResolvedValue([])
  vi.mocked(listCollectionViews).mockResolvedValue([])
  vi.mocked(listDueRuns).mockResolvedValue([])
  capturedLocation = null
})

describe('Ticket #754 AC-026 — the ONE attention pill: overdue + blocked, one count, outline chrome', () => {
  it('3 overdue + 1 blocked open tasks in scope → exactly one pill "4 need attention", outline chrome, no runs-due door', async () => {
    const overdueDate = '2020-01-01'
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'o1', title: 'Overdue A', due_date: overdueDate }),
      makeTask({ id: 'o2', title: 'Overdue B', due_date: overdueDate }),
      makeTask({ id: 'o3', title: 'Overdue C', due_date: overdueDate }),
      makeTask({ id: 'b1', title: 'Blocked A', status: 'Blocked' }),
      makeTask({ id: 'calm', title: 'Calm task', due_date: '2030-12-31' }),
    ])
    const { container } = renderPage()
    await waitFor(() => screen.getByText('Overdue A'))

    // Exactly ONE pill on the toolbar (DESIGN.md § DB-view toolbar controls: one count pill).
    const pills = container.querySelectorAll('.attention-pill')
    expect(pills).toHaveLength(1)

    // Its accessible name is the total attention count — "4 need attention".
    const pill = screen.getByRole('button', { name: /open attention breakdown — 4 need attention/i })
    expect(pill).toBeInTheDocument()
    expect(pill.textContent).toContain('4')

    // Outline chrome: transparent background, one border, only the count text carries the
    // status-lost hue (the label stays foreground). The class contract encodes the DESIGN
    // rule — the pill is `.attention-pill` (outline), never a filled tint.
    expect(pill.className).toContain('attention-pill')
    expect(pill.className).not.toContain('overdue-filter-btn--active')

    // AC-026: no runs-due door anywhere on the route.
    expect(screen.queryByRole('button', { name: /due to start|runs due/i })).toBeNull()

    // AC-026 pin against DESIGN.md — the "one count pill for attention" rule is present
    // (rendered with markdown bold as `**one**`), and the "no second pill" ratchet stays.
    const design = readFileSync(resolve(process.cwd(), '../DESIGN.md'), 'utf8')
    expect(design).toContain('**one** count pill for attention (outline, status-coloured count text)')
    expect(design).toContain('No checkbox, no toggle, no second pill, no third row')
  })

  it('reads "1 needs attention" as a regular singular when only one task attends', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'o1', title: 'Just one', due_date: '2020-01-01' }),
      makeTask({ id: 'calm', title: 'Calm task', due_date: '2030-12-31' }),
    ])
    renderPage()
    await waitFor(() => screen.getByText('Just one'))

    const pill = screen.getByRole('button', { name: /open attention breakdown — 1 need attention/i })
    expect(pill.textContent).toContain('1')
    expect(pill.textContent).toMatch(/needs attention/)
  })
})

describe('Ticket #754 AC-027 — the popover splits the count, applies view/filter, Escape returns focus', () => {
  it('activating the pill opens a menu listing "3 overdue" and "1 blocked"', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'o1', title: 'Overdue A', due_date: '2020-01-01' }),
      makeTask({ id: 'o2', title: 'Overdue B', due_date: '2020-01-01' }),
      makeTask({ id: 'o3', title: 'Overdue C', due_date: '2020-01-01' }),
      makeTask({ id: 'b1', title: 'Blocked A', status: 'Blocked' }),
    ])
    renderPage()
    await waitFor(() => screen.getByText('Overdue A'))

    fireEvent.click(screen.getByRole('button', { name: /open attention breakdown/i }))
    expect(screen.getByRole('menuitem', { name: '3 overdue' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '1 blocked' })).toBeInTheDocument()
  })

  it('choosing "N overdue" applies the Overdue view and the URL reflects it (?view=overdue)', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'o1', title: 'Overdue A', due_date: '2020-01-01' }),
      makeTask({ id: 'calm', title: 'Calm task', due_date: '2030-12-31' }),
    ])
    renderPage()
    await waitFor(() => screen.getByText('Overdue A'))

    fireEvent.click(screen.getByRole('button', { name: /open attention breakdown/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: '1 overdue' }))

    // The Overdue saved-view chip is now pressed and the URL carries ?view=overdue.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute('aria-pressed', 'true')
    })
    expect(capturedLocation?.search ?? '').toMatch(/view=overdue/)
  })

  it('choosing "N blocked" applies Status = Blocked and the URL reflects it (?status=blocked)', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'b1', title: 'Blocked A', status: 'Blocked' }),
      makeTask({ id: 'open', title: 'Open one', status: 'Open' }),
    ])
    renderPage()
    await waitFor(() => screen.getByText('Blocked A'))

    fireEvent.click(screen.getByRole('button', { name: /open attention breakdown/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: '1 blocked' }))

    // Table now shows only Blocked; URL carries ?status=blocked.
    await waitFor(() => expect(screen.queryByText('Open one')).toBeNull())
    expect(screen.getByText('Blocked A')).toBeInTheDocument()
    expect(capturedLocation?.search ?? '').toMatch(/status=blocked/)
  })

  it('Escape closes the popover and returns focus to the pill', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'o1', title: 'Overdue A', due_date: '2020-01-01' }),
    ])
    renderPage()
    await waitFor(() => screen.getByText('Overdue A'))

    const pill = screen.getByRole('button', { name: /open attention breakdown/i })
    fireEvent.click(pill)
    expect(screen.getByRole('menuitem', { name: '1 overdue' })).toBeInTheDocument()

    // Escape on the menu closes it — focus returns to the trigger (the useMenuPopover contract).
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: /overdue|blocked/ })).toBeNull())
    expect(document.activeElement).toBe(pill)
  })
})

describe('Ticket #754 AC-028 — the pill follows the scope: a filtered-empty table never shows a stale count', () => {
  it('a search filter that yields no rows → the pill is absent (never a stale count)', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'o1', title: 'Overdue A', due_date: '2020-01-01' }),
      makeTask({ id: 'b1', title: 'Blocked A', status: 'Blocked' }),
    ])
    const { container } = renderPage()
    await waitFor(() => screen.getByText('Overdue A'))

    // At rest the pill is present with 2 in the total.
    expect(screen.getByRole('button', { name: /open attention breakdown — 2 need attention/i })).toBeInTheDocument()

    // Type a search that matches nothing.
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'zzz-no-match' } })

    // The filtered-empty state renders, and the pill disappears — no "2 need attention" left
    // hanging over rows the viewer cannot see, no "0 need attention" click target either.
    await waitFor(() => {
      expect(container.querySelectorAll('.attention-pill')).toHaveLength(0)
    })
    expect(screen.queryByRole('button', { name: /need attention/i })).toBeNull()
  })
})

describe('Ticket #754 AC-029 — regression pin: no runs door on /work/tasks, Home/Café keep theirs', () => {
  it('the Tasks route mounts no runs source and no runs-due control appears', async () => {
    mockListTasks.mockResolvedValue([makeTask({ id: 'o1', title: 'Overdue A', due_date: '2020-01-01' })])
    renderPage()
    await waitFor(() => screen.getByText('Overdue A'))
    expect(vi.mocked(listDueRuns)).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /due to start|runs due/i })).toBeNull()
  })
})
