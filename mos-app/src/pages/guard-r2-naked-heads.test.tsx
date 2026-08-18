/**
 * MECH-GUARD R2 — page-head enumeration sweep (Census R2 DO-7), ported from the
 * v4-redesign line.
 *
 * The Tasks head got the naked-number remediation first (see
 * components/tasks/guard-r2-naked-numbers.test.tsx — the class's owning guard and oracle
 * definition: a digit with no attached noun carries no meaning). The census then found the
 * SAME defect re-grown on sibling heads, because the guard's enumeration was Tasks-only.
 * The remediation is in place on this line (objectives-page.tsx / admin-users-page.tsx
 * carry the GUARD-R2-class comments); this file is what makes it stick — PageHead still
 * ships a `count` prop that renders the bare `.ch-count` digit pill, so the defect is one
 * prop away from re-growing.
 *
 * Enumeration: the catalog + admin heads — Objectives, Projects & Processes, Admin People.
 * (Money's head belongs to the money lane; the Café/Kitchen heads have diverged from v4 on
 * this line — multi-branch/stream scaffolding — and join the sweep with their own lane's
 * fixtures, not v4's.) Oracle, per head, ready AND loading: no `.ch-count` digit pill, and
 * no descendant leaf whose entire text is a bare number.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'

vi.mock('@/lib/db/objectives', () => ({
  listObjectivesAll: vi.fn(),
  createObjective: vi.fn(),
  renameObjective: vi.fn(),
  setObjectiveArchived: vi.fn(),
}))
vi.mock('@/lib/db/work-lines', () => ({
  listWorkLinesAll: vi.fn(),
  createWorkLine: vi.fn(),
  renameWorkLine: vi.fn(),
  setWorkLineArchived: vi.fn(),
}))
vi.mock('@/lib/db/tasks', () => ({ listTasks: vi.fn() }))
vi.mock('@/auth/use-auth')
vi.mock('@/shell/use-is-desktop')
vi.mock('@/shell/use-is-coarse-pointer')
vi.mock('@/lib/db/admin-users', () => ({
  listAdminPeople: vi.fn(),
  listRoles: vi.fn(),
  listRevenueScopeOptions: vi.fn(),
  createPerson: vi.fn(),
  createLogin: vi.fn(),
  resetPassword: vi.fn(),
  setLoginEnabled: vi.fn(),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
  archivePerson: vi.fn(),
  restorePerson: vi.fn(),
  assignJabatan: vi.fn(),
  removeJabatan: vi.fn(),
  synthesizeEmail: vi.fn((name: string) => `${name.toLowerCase().replace(/\s+/g, '-')}@ops.gordi.local`),
}))

import { listObjectivesAll } from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
import { listTasks } from '@/lib/db/tasks'
import { useAuth } from '@/auth/use-auth'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsCoarsePointer } from '@/shell/use-is-coarse-pointer'
import { listAdminPeople, listRoles, listRevenueScopeOptions } from '@/lib/db/admin-users'
import { ObjectivesPage } from './objectives-page'
import { ProjectsProcessesPage } from './projects-processes-page'
import { AdminUsersPage } from './admin-users-page'

const ADMIN_VIEWER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'admin-person-id', org_id: 'org-1', user_id: 'admin-user-id',
      full_name: 'Admin Gordi', email: 'admin@example.test', must_change_password: false,
      archived_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [], isManager: false, accessRoles: ['admin'],
  },
  signOut: vi.fn(),
}

const PEOPLE: AdminPersonRow[] = [
  {
    id: 'p-1', full_name: 'Admin Gordi', email: 'admin@example.test', archived_at: null,
    login: 'active', access_roles: ['admin'], jabatan: [], revenue_scope: [],
  },
  {
    id: 'p-2', full_name: 'Budi Santoso', email: 'budi@example.test', archived_at: null,
    login: 'none', access_roles: ['member'], jabatan: [], revenue_scope: [],
  },
]

function task(id: string, objectiveId: string | null, workLineId: string | null): TaskListRow {
  return {
    id, org_id: 'org-1', title: id, business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: 'p1', accountable_person_id: 'p1', consulted_person_ids: [],
    informed_person_ids: [], description: null, due_date: null,
    objective_id: objectiveId, work_line_id: workLineId,
    last_activity_at: '2026-07-07T00:00:00Z', archived_at: null, created_by: 'p1',
    created_at: '2026-07-07T00:00:00Z', updated_at: '2026-07-07T00:00:00Z',
  }
}

/** Elements with no element children whose whole visible text is just digits (the R2 oracle). */
function bareNumberLeaves(root: Element): Element[] {
  return Array.from(root.querySelectorAll('*')).filter(
    (el) => el.children.length === 0 && /^\d+$/.test(el.textContent?.trim() ?? ''),
  )
}

function renderInApp(ui: React.ReactElement) {
  return render(
    <I18nProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nProvider>,
  )
}

async function assertHeadClean(readyText: RegExp | string) {
  await screen.findByText(readyText)
  const head = screen.getByTestId('page-head')
  expect(head.querySelector('.ch-count')).toBeNull()
  expect(bareNumberLeaves(head)).toHaveLength(0)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue(ADMIN_VIEWER)
  vi.mocked(useIsDesktop).mockReturnValue(true)
  vi.mocked(useIsCoarsePointer).mockReturnValue(false)
  vi.mocked(listObjectivesAll).mockResolvedValue([
    { id: 'obj-1', name: 'Grow revenue', archived_at: null },
  ])
  vi.mocked(listWorkLinesAll).mockResolvedValue([
    { id: 'wl-1', name: 'Menu launch', type: 'project', archived_at: null },
  ])
  vi.mocked(listTasks).mockResolvedValue([task('t1', 'obj-1', 'wl-1')])
  vi.mocked(listAdminPeople).mockResolvedValue(PEOPLE)
  vi.mocked(listRoles).mockResolvedValue([])
  vi.mocked(listRevenueScopeOptions).mockResolvedValue([])
})

describe('GUARD-R2 sweep: no page head shows a number without a label sentence', () => {
  it('GUARD-R2/objectives: the Objectives head has no .ch-count pill and no bare-number leaf', async () => {
    renderInApp(<ObjectivesPage />)
    await assertHeadClean('Grow revenue')
  })

  it('GUARD-R2/projects: the Projects & Processes head has no .ch-count pill and no bare-number leaf', async () => {
    renderInApp(<ProjectsProcessesPage />)
    await assertHeadClean('Menu launch')
  })

  it('GUARD-R2/admin: the People head carries a labeled sentence, no pill, no bare-number leaf', async () => {
    renderInApp(<AdminUsersPage />)
    await assertHeadClean('Budi Santoso')
    expect(screen.getByTestId('people-count-line').textContent?.trim()).toBe('2 people')
  })

  it('GUARD-R2/admin: while counts are unknown the People head shows a placeholder, never a bare digit', () => {
    vi.mocked(listAdminPeople).mockReturnValue(new Promise(() => {}))
    renderInApp(<AdminUsersPage />)
    const head = screen.getByTestId('page-head')
    expect(head.querySelector('.ch-count')).toBeNull()
    expect(bareNumberLeaves(head)).toHaveLength(0)
    expect(screen.getByTestId('people-count-line').textContent?.trim()).toBe('—')
  })
})
