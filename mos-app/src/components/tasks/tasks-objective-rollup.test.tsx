// AC-204 — the Tasks half of the Objective roll-up: a member on a PHONE, narrowing to Mine,
// seeing their work grouped under its Objective and Project/Process.
//
// This is the journey #179 deleted with the cascade spec, re-covered at the lowest layer that can
// still assert it: the real TasksWorkspace at 390px, over seeded fixtures. Both synthetic branches
// — "No Project/Process" and "(Unlinked)" — must RENDER rather than hide their tasks; they are the
// buckets that hold work nobody is tracking, so a drill that drops them is worse than no drill.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { __resetTasksViewPrefForTests } from './use-tasks-view-pref'

vi.mock('@/lib/db/tasks', () => ({
  listTasks: vi.fn(), getTask: vi.fn(), createTask: vi.fn(), updateTaskStatus: vi.fn(),
  updateTaskRaci: vi.fn(), updateTaskFields: vi.fn(), addChecklistItem: vi.fn(),
  toggleChecklistItem: vi.fn(), reorderChecklistItem: vi.fn(), deleteChecklistItem: vi.fn(),
  archiveTask: vi.fn(), unarchiveTask: vi.fn(),
}))
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn(), getPeople: vi.fn(), listRoleNames: vi.fn(),
}))
vi.mock('@/lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('@/lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))

import { listTasks } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople, listRoleNames } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { TasksWorkspace } from './tasks-workspace'
import { OverlayHostProvider } from '@/shell/overlay-host'

const MINE = 'person-mine'
const OTHER = 'person-other'

const VIEWER_PERSON: PeopleRow = {
  id: MINE, org_id: 'org', user_id: 'uid', full_name: 'E2E Member',
  email: 'member@example.test', must_change_password: false, archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: VIEWER_PERSON, roles: [], isManager: false, accessRoles: ['member'] },
  signOut: async () => {},
}

function makeTask(over: Partial<TaskListRow> & Pick<TaskListRow, 'id' | 'title'>): TaskListRow {
  return {
    org_id: 'org', business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: MINE, accountable_person_id: MINE,
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, objective_id: null, work_line_id: null,
    last_activity_at: '2026-08-01T10:00:00Z', archived_at: null, created_by: MINE,
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
    ...over,
  }
}

const OBJECTIVES = [{ id: 'obj-1', name: 'Grow revenue' }]
const WORK_LINES = [
  { id: 'wl-1', name: 'Menu launch', type: 'project' as const, objective_id: 'obj-1' },
  { id: 'wl-orphan', name: 'Loose ends', type: 'process' as const, objective_id: null },
]

// The seeded world, shaped so every AC-204 branch is present at once.
const TASKS: TaskListRow[] = [
  // …under a real Objective → real Project/Process.
  makeTask({ id: 't-launch', title: 'Brief the floor', work_line_id: 'wl-1' }),
  // …the work-line-only case: no objective_id of its own, reachable only via wl-1's direct edge.
  makeTask({ id: 't-edge', title: 'Print the menus', work_line_id: 'wl-1', status: 'Done' }),
  // …hanging straight off the Objective → the "No Project/Process" branch.
  makeTask({ id: 't-direct', title: 'Sign the lease', objective_id: 'obj-1' }),
  // …on a Project/Process with no parent Objective → the "(Unlinked)" branch.
  makeTask({ id: 't-orphan', title: 'Chase the invoice', work_line_id: 'wl-orphan' }),
  // …linked to nothing at all → "(Unlinked)" → "No Project/Process".
  makeTask({ id: 't-nowhere', title: 'Reconcile the float' }),
  // …someone else's work. Mine must not show it, at any level of the drill.
  makeTask({
    id: 't-theirs', title: 'Not my task', work_line_id: 'wl-1',
    responsible_person_id: OTHER, accountable_person_id: OTHER,
  }),
]

/** 390px phone: no split view, no desktop table — the grouped card list. */
function stubPhone() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

function renderPhoneMineByObjective() {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={['/work/tasks?view=my-work&group=objective']}>
        <OverlayHostProvider><TasksWorkspace /></OverlayHostProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

/** The card-list group whose header carries this Project/Process title. */
function branch(label: string): HTMLElement {
  const head = screen.getAllByText(label).find((el) => el.className.includes('mgc-label'))
  if (!head) throw new Error(`no group header labelled "${label}"`)
  return head.closest('.mgc-group') ?? head.closest('section') ?? head.parentElement!.parentElement!
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  __resetTasksViewPrefForTests()
  stubPhone()
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Retail Ops' }])
  vi.mocked(getPeople).mockResolvedValue([
    { id: MINE, full_name: 'E2E Member' }, { id: OTHER, full_name: 'Someone Else' },
  ])
  vi.mocked(listRoleNames).mockResolvedValue([])
  vi.mocked(listObjectives).mockResolvedValue(OBJECTIVES)
  vi.mocked(listWorkLines).mockResolvedValue(WORK_LINES)
  vi.mocked(listTasks).mockResolvedValue(TASKS)
})

describe('AC-204: Tasks grouped by Objective, Mine, on a phone', () => {
  it('groups the viewer\'s work under its Objective and Project/Process', async () => {
    renderPhoneMineByObjective()
    await screen.findByText('Brief the floor')

    const launch = branch('Menu launch')
    // The Objective hint sits ABOVE the Project/Process title and is its own record door.
    expect(within(launch).getByRole('link', { name: 'Grow revenue' }))
      .toHaveAttribute('href', '/work/objectives?q=Grow%20revenue')
    expect(within(launch).getByText('Brief the floor')).toBeInTheDocument()
    // The work-line-only task reaches this Objective through the direct edge, not its own field.
    expect(within(launch).getByText('Print the menus')).toBeInTheDocument()
  })

  it('renders BOTH synthetic branches rather than hiding their Tasks', async () => {
    renderPhoneMineByObjective()
    await screen.findByText('Sign the lease')

    // An Objective's own tasks: real Objective, synthesised Project/Process.
    const noWorkLine = branch('No Project/Process')
    expect(within(noWorkLine).getByText('Grow revenue')).toBeInTheDocument()
    expect(within(noWorkLine).getByText('Sign the lease')).toBeInTheDocument()

    // A real Project/Process with no parent: synthesised Objective, and it is NOT a link — there
    // is no "(Unlinked)" record to open.
    const loose = branch('Loose ends')
    expect(within(loose).getByText('(Unlinked)')).toBeInTheDocument()
    expect(within(loose).queryByRole('link', { name: '(Unlinked)' })).toBeNull()
    expect(within(loose).getByText('Chase the invoice')).toBeInTheDocument()

    // Linked to nothing at all — still visible, still owned by someone.
    expect(screen.getByText('Reconcile the float')).toBeInTheDocument()
  })

  it('Mine excludes work the viewer neither owns nor supervises', async () => {
    renderPhoneMineByObjective()
    await screen.findByText('Brief the floor')
    expect(screen.queryByText('Not my task')).toBeNull()
  })

  it('offers no cascade navigation — the screen is cut and stays cut (OD-WAY-32)', async () => {
    const { container } = renderPhoneMineByObjective()
    await screen.findByText('Brief the floor')
    for (const link of Array.from(container.querySelectorAll('a'))) {
      expect(link.getAttribute('href')).not.toContain('cascade')
    }
    expect(container.textContent?.toLowerCase()).not.toContain('cascade')
  })
})
