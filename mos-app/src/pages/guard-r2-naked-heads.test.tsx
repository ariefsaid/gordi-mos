/**
 * MECH-GUARD R2 — page-head enumeration sweep (Census R2 DO-7).
 *
 * The Tasks head got the naked-number remediation first (see
 * components/tasks/guard-r2-naked-numbers.test.tsx — the class's owning guard and oracle
 * definition: a digit with no attached noun carries no meaning). The census then found the
 * SAME defect re-grown on sibling heads (objectives F7's bare count pill; Money's "0";
 * admin's digit pill), because the guard's enumeration was Tasks-only.
 *
 * This file extends the enumeration to the catalog + admin heads owned by this lane:
 * Objectives, Projects & Processes, Admin People. (Money's head belongs to the money lane —
 * add its render here when that lane lands.) Oracle, per head, ready AND loading:
 * no `.ch-count` digit pill, and no descendant leaf whose entire text is a bare number.
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
vi.mock('@/lib/db/admin-users', () => ({
  listAdminPeople: vi.fn(),
  createPerson: vi.fn(),
  createLogin: vi.fn(),
  resetPassword: vi.fn(),
  setLoginEnabled: vi.fn(),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
  archivePerson: vi.fn(),
  restorePerson: vi.fn(),
  synthesizeEmail: vi.fn((name: string) => `${name.toLowerCase().replace(/\s+/g, '-')}@ops.gordi.local`),
}))
// Census FLAG-D enumeration — the four Café/Kitchen heads (Plan editor + Pesanan, Stock,
// Review, Pushes) join the sweep so their naked count chips (32/326/10/81) can't re-grow.
vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return {
    ...actual,
    fetchKitchenStock: vi.fn(),
    listActiveWipItems: vi.fn(),
    fetchPlanMap: vi.fn(),
    listSubmittedKitchenLogs: vi.fn(),
    approveKitchenLog: vi.fn(),
    rejectKitchenLog: vi.fn(),
  }
})
vi.mock('@/lib/db/kitchen-plans', () => ({
  listKitchenPlans: vi.fn(),
  listPesanan: vi.fn(),
  upsertKitchenPlan: vi.fn(),
}))
vi.mock('@/lib/db/kitchen-pushes', () => ({ listEsbPushes: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn(), getBusinessUnits: vi.fn() }))

import { listObjectivesAll } from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
import { listTasks } from '@/lib/db/tasks'
import { useAuth } from '@/auth/use-auth'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { listAdminPeople } from '@/lib/db/admin-users'
import { fetchKitchenStock, listActiveWipItems, fetchPlanMap, listSubmittedKitchenLogs } from '@/lib/db/kitchen-logs'
import { listKitchenPlans, listPesanan } from '@/lib/db/kitchen-plans'
import { listEsbPushes } from '@/lib/db/kitchen-pushes'
import { getPeople } from '@/lib/db/directory'
import { ObjectivesPage } from './objectives-page'
import { ProjectsProcessesPage } from './projects-processes-page'
import { AdminUsersPage } from './admin-users-page'
import { KitchenStockPage } from './kitchen-stock-page'
import { KitchenPlanPage } from './kitchen-plan-page'
import { KitchenReviewPage } from './kitchen-review-page'
import { KitchenPushesPage } from './kitchen-pushes-page'

const ADMIN_VIEWER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'admin-person-id', org_id: 'org-1', user_id: 'admin-user-id',
      full_name: 'Admin Gordi', email: 'admin@gordi.id', archived_at: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [], isManager: false, accessRoles: ['admin'],
  },
  signOut: vi.fn(),
}

const PEOPLE: AdminPersonRow[] = [
  { id: 'p-1', full_name: 'Admin Gordi', email: 'admin@gordi.id', archived_at: null, login: 'active', access_roles: ['admin'] },
  { id: 'p-2', full_name: 'Budi Santoso', email: 'budi@gordi.id', archived_at: null, login: 'none', access_roles: ['member'] },
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
  vi.mocked(listObjectivesAll).mockResolvedValue([
    { id: 'obj-1', name: 'Grow revenue', archived_at: null },
  ])
  vi.mocked(listWorkLinesAll).mockResolvedValue([
    { id: 'wl-1', name: 'Menu launch', type: 'project', archived_at: null },
  ])
  vi.mocked(listTasks).mockResolvedValue([task('t1', 'obj-1', 'wl-1')])
  vi.mocked(listAdminPeople).mockResolvedValue(PEOPLE)
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

// ── Census FLAG-D: the Café/Kitchen heads join the sweep ──────────────────────
const MEMBER_VIEWER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'member-id', org_id: 'org-1', user_id: 'member-user', full_name: 'Krishna Kitchen',
      email: 'krishna@gordi.id', archived_at: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [], isManager: false, accessRoles: ['member'],
  },
  signOut: vi.fn(),
}

describe('GUARD-R2 sweep (FLAG-D): the Café/Kitchen heads carry labeled meta, no naked chip', () => {
  beforeEach(() => {
    // ADMIN_VIEWER (from the outer beforeEach) sees the lead faces: Plan EDITOR, Review, Pushes.
    vi.mocked(fetchKitchenStock).mockResolvedValue([
      { wip_item_id: 'w1', wip_item_name: 'Nasi Putih', category: 'Rice/Staple', stok: 10, tersedia: 20 },
    ])
    vi.mocked(listActiveWipItems).mockResolvedValue([{ id: 'w1', name: 'Ayam Bakar', category: 'Chicken' }])
    vi.mocked(listKitchenPlans).mockResolvedValue([
      { id: 'pl1', wip_item_id: 'w1', action_type: 'Production', qty_porsi: 12 },
    ])
    vi.mocked(listPesanan).mockResolvedValue([
      { log_date: '2026-07-23', wip_item_id: 'w1', wip_item_name: 'Sate', category: 'Meat', action_type: 'Production', qty_porsi: 5 },
    ])
    vi.mocked(listSubmittedKitchenLogs).mockResolvedValue([
      { id: 'lg1', log_date: '2026-07-23', action_type: 'Production', wip_item_id: 'w1', wip_item_name: 'Risoles', qty_porsi: 8, notes: null, status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb', created_at: '2026-07-23T09:00:00Z' },
    ])
    vi.mocked(fetchPlanMap).mockResolvedValue({})
    vi.mocked(getPeople).mockResolvedValue([{ id: 'p1', full_name: 'Budi Santoso' }])
    vi.mocked(listEsbPushes).mockResolvedValue([
      { id: 'e1', source_module: 'kitchen', source_ref: 'PR-20260723-001', endpoint: 'assembly-actual', target_env: 'goo', status: 'posted', retry_count: 0, last_error: null, esb_doc_num: 'ESB-1', created_at: '2026-07-23T09:00:00Z', posted_at: '2026-07-23T09:05:00Z' },
    ])
  })

  it('GUARD-R2/cafe-stock: the Stock head has no .ch-count pill and no bare-number leaf', async () => {
    renderInApp(<KitchenStockPage />)
    await assertHeadClean('Nasi Putih')
  })

  it('GUARD-R2/cafe-plan (editor): the Plan head has no .ch-count pill and no bare-number leaf', async () => {
    renderInApp(<KitchenPlanPage />)
    await assertHeadClean('Ayam Bakar')
  })

  it('GUARD-R2/cafe-plan (pesanan): the member horizon head has no .ch-count pill and no bare-number leaf', async () => {
    vi.mocked(useAuth).mockReturnValue(MEMBER_VIEWER)
    renderInApp(<KitchenPlanPage />)
    await assertHeadClean('Sate')
  })

  it('GUARD-R2/cafe-review: the Review head has no .ch-count pill and no bare-number leaf', async () => {
    renderInApp(<KitchenReviewPage />)
    await assertHeadClean('Risoles')
  })

  it('GUARD-R2/cafe-pushes: the Pushes head has no .ch-count pill and no bare-number leaf', async () => {
    renderInApp(<KitchenPushesPage />)
    await assertHeadClean('PR-20260723-001')
  })
})
