/**
 * MECH-GUARD R2 — no naked numbers in the Tasks page head (structural layer).
 *
 * Owner catch (review r2, missed by 5 audit rounds): the head rendered a bare "14" count
 * pill next to a differently-sized "2 blocked" fragment — number soup with no label
 * sentence ("size soup" incident). The fix: ONE muted meta sentence in a single
 * `.ch-meta-line` at one font token. Since OD-REDESIGN-91 #17 the Tasks sentence reads
 * "N open · M total" (counts are OPEN everywhere; the head agrees with the rail badge).
 * Skill rule mechanized: impeccable distill "Every element should justify its existence"
 * (.claude/skills/impeccable/reference/distill.md) — a digit with no attached noun carries
 * no meaning; plus the one-type-scale rule (ui-ux-pro-max ux-guidelines "Font Size Scale —
 * don't: random font sizes").
 *
 * Structure asserted (jsdom, no pixels): the rendered Tasks head contains exactly one
 * `.ch-meta-line` whose text is a labeled sentence, NO `.ch-count` pill sibling, and no
 * descendant leaf anywhere in the head whose entire text is a bare number.
 *
 * #192 (Tasks) scope note: v4's version of this file ALSO enumerates the same guard onto the
 * Money (dashboard-page.tsx), Budget (budget-page.tsx) and Pricing (pricing-page.tsx) page heads
 * (census R2 DO-7 and r5 F-1). Those three cases are dropped here — the pages themselves differ
 * between `dev` and v4 by 300+ combined lines (a Money-domain redesign, not a one-line head fix),
 * and fixing them is Money surface work — #200, not this PR (docs/specs/v4-port.spec.md "Staging
 * and merge shape" — surface-by-surface, one PR per surface). Flagged on wayfinder map #150 for
 * #200 to pick up. The Tasks-scoped case below is unaffected and stays; it already passes against
 * `dev`'s unmodified Tasks page head.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { OverlayHostProvider } from '@/shell/overlay-host'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'

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

import { listTasks } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { TasksWorkspace } from './tasks-workspace'
import { __resetTasksViewPrefForTests } from './use-tasks-view-pref'

const VIEWER_ID = 'viewer-id'
const VIEWER_PERSON: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Arief Said',
  email: 'arief@gordi.id', must_change_password: false, archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const role: RolesRow = {
  id: 'role-1', org_id: 'org', business_unit_id: 'bu-1', name: 'CEO',
  reports_to_role_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: VIEWER_PERSON, roles: [role], isManager: false, accessRoles: [] },
  signOut: async () => {},
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

const allSavedView = {
  view: 'all', activeChip: null, segment: 'all', overdueOnly: false, reserved: null, search: '',
} as const

function renderWorkspace() {
  return render(
    <I18nProvider>
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/work/tasks']}>
          <OverlayHostProvider>
            <TasksWorkspace savedView={allSavedView} onSavedViewChange={() => {}} />
          </OverlayHostProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  __resetTasksViewPrefForTests()
  stubMatchMedia()
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Kitchen' }])
  vi.mocked(getPeople).mockResolvedValue([{ id: VIEWER_ID, full_name: 'Arief Said' }])
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(listWorkLines).mockResolvedValue([])
})

/** Elements with no element children whose whole visible text is just digits. */
function bareNumberLeaves(root: Element): Element[] {
  return Array.from(root.querySelectorAll('*')).filter(
    (el) => el.children.length === 0 && /^\d+$/.test(el.textContent?.trim() ?? ''),
  )
}

describe('GUARD-R2: the Tasks page head never shows a number without a label sentence', () => {
  it('GUARD-R2: head meta is exactly one .ch-meta-line labeled sentence — no .ch-count pill, no bare-number leaf', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 't1', title: 'Task one' }),
      makeTask({ id: 't2', title: 'Task two', status: 'Blocked' }),
      makeTask({ id: 't3', title: 'Task three' }),
    ])

    renderWorkspace()
    await waitFor(() => expect(screen.getByText('Task one')).toBeInTheDocument())

    const head = screen.getByTestId('page-head')

    // ONE meta sentence, and it reads as a sentence: every number is followed by its noun.
    // OD-REDESIGN-91 #17: counts are OPEN — "N open · M total" (none Done here → open === total).
    const metaLines = head.querySelectorAll('.ch-meta-line')
    expect(metaLines).toHaveLength(1)
    expect(metaLines[0].textContent?.trim()).toBe('3 open · 3 total')

    // The size-soup pill is gone from this head — count lives inside the sentence.
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)

    // No leaf anywhere in the head renders a naked number ("14" with no attached label).
    expect(bareNumberLeaves(head)).toHaveLength(0)
  })

  it('GUARD-R2: while counts are unknown the head shows a placeholder, never a stale bare digit', async () => {
    vi.mocked(listTasks).mockReturnValue(new Promise(() => {})) // never resolves — loading

    renderWorkspace()
    const head = await screen.findByTestId('page-head')
    const metaLine = head.querySelector('.ch-meta-line')
    expect(metaLine).not.toBeNull()
    expect(metaLine?.textContent?.trim()).toBe('—')
    expect(bareNumberLeaves(head)).toHaveLength(0)
  })
})
