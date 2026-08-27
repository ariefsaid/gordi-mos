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
 * Enumeration: the catalog + admin heads — Objectives, Projects & Processes, Admin People —
 * and, since #250, the money-lane heads: Money, Budget, Pricing. (The Café/Kitchen heads have
 * diverged from v4 on this line — multi-branch/stream scaffolding — and join the sweep with
 * their own lane's fixtures, not v4's.) Oracle, per head: no `.ch-count` digit pill, and no
 * descendant leaf whose entire text is a bare number.
 *
 * #250 requires the money-lane heads to hold that oracle in EVERY state the requirement names —
 * populated, loading, empty and error — so each of those is its own `it`, and each one first
 * awaits the marker that only its own state renders (the loading status, the empty panel, the
 * error retry). Waiting on the head text alone would not have distinguished loading from empty
 * from error: all three render the same `—` placeholder, so an assertion that only checked the
 * placeholder passed in whichever state the page happened to be in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import type { PageFamilyState } from '@/shell/page-families'
import type { ReactElement } from 'react'

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
  listTeams: vi.fn(),
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

// ── money-lane heads (#250) ───────────────────────────────────────────────────────────────
// `importActual` spread: dashboard-page also imports pure helpers (latestReportingDate,
// latestMarginReportingDate) from these modules, and a bare factory would blank them.
vi.mock('@/lib/db/reporting', async () => ({
  ...(await vi.importActual<typeof import('@/lib/db/reporting')>('@/lib/db/reporting')),
  listSalesDailyRevenue: vi.fn(),
}))
vi.mock('@/lib/db/reporting-margin', async () => ({
  ...(await vi.importActual<typeof import('@/lib/db/reporting-margin')>('@/lib/db/reporting-margin')),
  listSalesMarginDaily: vi.fn(),
}))
vi.mock('@/lib/db/plan-budget', () => ({
  listIngredientCostLines: vi.fn(), listBomLines: vi.fn(), listBudgets: vi.fn(),
  getCertifiedMetric: vi.fn(), captureBudget: vi.fn(),
}))
// budget-page reads the BU list inside the same Promise.all as its cost lines — unmocked it
// hits Supabase and every Budget render lands in the error state.
vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn(), getPeople: vi.fn() }))

import { listObjectivesAll } from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
import { listTasks } from '@/lib/db/tasks'
import { useAuth } from '@/auth/use-auth'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsCoarsePointer } from '@/shell/use-is-coarse-pointer'
import { listAdminPeople, listRoles, listRevenueScopeOptions, listTeams } from '@/lib/db/admin-users'
import { listSalesDailyRevenue, type SalesDailyRevenueRow } from '@/lib/db/reporting'
import { listSalesMarginDaily, type SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { listBomLines, listIngredientCostLines, listBudgets, getCertifiedMetric } from '@/lib/db/plan-budget'
import { getBusinessUnits } from '@/lib/db/directory'
import { ObjectivesPage } from './objectives-page'
import { ProjectsProcessesPage } from './projects-processes-page'
import { AdminUsersPage } from './admin-users-page'
import { DashboardPage } from './dashboard-page'
import { BudgetPage } from './budget-page'
import { PricingPage } from './pricing-page'

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
    login: 'active', access_roles: ['admin'], jabatan: [], revenue_scope: [], teams: [],
  },
  {
    id: 'p-2', full_name: 'Budi Santoso', email: 'budi@example.test', archived_at: null,
    login: 'none', access_roles: ['member'], jabatan: [], revenue_scope: [], teams: [],
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

function renderInApp(ui: ReactElement, initialEntries: string[] = ['/']) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </I18nProvider>,
  )
}

async function assertHeadClean(readyText: RegExp | string) {
  await screen.findByText(readyText)
  const head = screen.getByTestId('page-head')
  expect(head.querySelector('.ch-count')).toBeNull()
  expect(bareNumberLeaves(head)).toHaveLength(0)
}

/**
 * The R2 oracle for a head that carries ONE `.ch-meta-line` sentence (#250): exactly one meta
 * line reading `expected`, no `.ch-count` pill, no bare-number leaf. Synchronous on purpose —
 * every caller has already awaited the marker for the state under test, so there is nothing
 * left to poll for.
 */
function expectHeadMeta(expected: string | RegExp) {
  const head = screen.getByTestId('page-head')
  expect(head.querySelectorAll('.ch-meta-line')).toHaveLength(1)
  const text = head.querySelector('.ch-meta-line')?.textContent?.trim() ?? ''
  if (typeof expected === 'string') expect(text).toBe(expected)
  else expect(text).toMatch(expected)
  expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
  expect(bareNumberLeaves(head)).toHaveLength(0)
}

/** The quiet placeholder every money-lane head shows while its count is unknown. */
const DASH = '—'

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
  vi.mocked(listTeams).mockResolvedValue([])
  // money lane (#250): a resolved-but-empty baseline, so each test states only the shape
  // its own case needs.
  vi.mocked(listSalesDailyRevenue).mockResolvedValue([])
  vi.mocked(listSalesMarginDaily).mockResolvedValue([])
  vi.mocked(listBomLines).mockResolvedValue([])
  vi.mocked(listIngredientCostLines).mockResolvedValue([])
  vi.mocked(listBudgets).mockResolvedValue([])
  vi.mocked(getCertifiedMetric).mockResolvedValue({ key: 'cogs.budgeted', name: 'Budgeted COGS', certified: true })
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Kitchen' }])
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

// ═════════════════════════════════════════════════════════════════════════════════════════
// #250 — the money-lane heads (Money, Budget, Pricing), in EVERY state the requirement names.
//
// These three heads already read as one labelled `.ch-meta-line` sentence on `dev`; what was
// missing was the guard. Their trap is that populated is the only state whose head text is
// distinctive — loading, empty and error all render the same `—` placeholder — so a test that
// waits only on the placeholder cannot tell which state it caught, and passes in all three.
// Each test below therefore pins the frame's declared state first.
// ═════════════════════════════════════════════════════════════════════════════════════════

/**
 * Awaits the page reaching `state` and returns the frame — `data-page-state` is PageFrame's own
 * declaration of which branch rendered, not a proxy inferred from what the head happens to say.
 */
async function findPageInState(state: PageFamilyState): Promise<HTMLElement> {
  return await waitFor(() => {
    const frame = document.querySelector<HTMLElement>(`[data-page-state="${state}"]`)
    expect(frame, `the page never reached its "${state}" state`).not.toBeNull()
    return frame as HTMLElement
  })
}

/** A promise that never settles — the honest way to hold a page in its loading branch. */
const pending = <T,>(): Promise<T> => new Promise<T>(() => {})

const recentDate = new Date().toISOString().slice(0, 10)
const MONEY_REVENUE: SalesDailyRevenueRow[] = [
  { revenue_date: recentDate, channel: 'POS', esb_code: 'A', branch_code: 'BR-1', branch_name: 'Main', transactions: 10, clean_revenue: 100000, snapshot_as_of: new Date().toISOString(), source_contract_version: 'v1' },
  { revenue_date: recentDate, channel: 'POS', esb_code: 'B', branch_code: 'BR-2', branch_name: 'Second', transactions: 8, clean_revenue: 80000, snapshot_as_of: new Date().toISOString(), source_contract_version: 'v1' },
]
const MONEY_MARGIN: SalesMarginDailyRow[] = [
  { margin_date: recentDate, esb_code: 'A', branch_code: 'BR-1', branch_name: 'Main', revenue: 100000, cogs_interim_sm: 50000, cogs_budget_bom: 50000, margin_interim: 50000, margin_interim_pct: 0.5, bom_coverage_pct: 1, snapshot_as_of: new Date().toISOString(), source_contract_version: 'v1' },
]
const budgetFixture = (id: string, scenario_label: string) => ({
  id, menu_item_esb_code: 'MENU-1', menu_item_name: 'Menu one', scenario_label,
  scenario_type: 'baseline' as const, owning_bu_id: 'bu-1', total_budgeted_cogs: 1000,
  cost_basis_as_of: new Date().toISOString(), certified_metric_key: 'cogs.budgeted', is_complete: true,
})
const BOM_LINE = { menu_item_esb_code: 'MENU-1', ingredient_esb_code: 'ING-1', recipe_qty: 1, qty_unit: 'kg' }
const COST_LINE = { ingredient_esb_code: 'ING-1', name: 'Ingredient', unit_cost: 1000, unit: 'kg', as_of: new Date().toISOString() }

const renderMoney = () => renderInApp(<DashboardPage />, ['/money'])
const renderBudget = () => renderInApp(<BudgetPage />, ['/plan/budget'])
const renderPricing = () => renderInApp(<PricingPage />, ['/plan/pricing'])

describe('GUARD-R2/money (#250): the Money head never shows a naked number, in any state', () => {
  it('populated: one labelled meta sentence naming the cut and its freshness', async () => {
    vi.mocked(listSalesDailyRevenue).mockResolvedValue(MONEY_REVENUE)
    vi.mocked(listSalesMarginDaily).mockResolvedValue(MONEY_MARGIN)
    renderMoney()
    await findPageInState('default')
    expectHeadMeta(/^2 branches · as of /)
  })

  it('loading: the dash placeholder, never a stale digit', async () => {
    vi.mocked(listSalesDailyRevenue).mockReturnValue(pending())
    vi.mocked(listSalesMarginDaily).mockReturnValue(pending())
    renderMoney()
    await findPageInState('loading')
    expectHeadMeta(DASH)
  })

  it('empty: the dash placeholder, never a "0" pill', async () => {
    vi.mocked(listSalesDailyRevenue).mockResolvedValue([])
    vi.mocked(listSalesMarginDaily).mockResolvedValue([])
    renderMoney()
    await findPageInState('empty')
    expectHeadMeta(DASH)
  })

  it('error: the dash placeholder beside the retry, never a half-loaded count', async () => {
    vi.mocked(listSalesDailyRevenue).mockRejectedValue(new Error('report unavailable'))
    vi.mocked(listSalesMarginDaily).mockRejectedValue(new Error('report unavailable'))
    renderMoney()
    await findPageInState('error')
    expectHeadMeta(DASH)
  })
})

describe('GUARD-R2/budget (#250): the Budget head never shows a naked number, in any state', () => {
  it('populated: the scenario count reads as a sentence', async () => {
    vi.mocked(listBomLines).mockResolvedValue([BOM_LINE])
    vi.mocked(listIngredientCostLines).mockResolvedValue([COST_LINE])
    vi.mocked(listBudgets).mockResolvedValue([budgetFixture('b1', 'Baseline'), budgetFixture('b2', 'Promo')])
    renderBudget()
    await findPageInState('default')
    // Budget's scenario list arrives on a SECOND effect, after the frame is already out of
    // loading — so the sentence is awaited on its own, not polled for behind a stale read.
    await screen.findByText('2 scenarios')
    expectHeadMeta('2 scenarios')
  })

  it('loading: the dash placeholder', async () => {
    vi.mocked(listBomLines).mockReturnValue(pending())
    renderBudget()
    await findPageInState('loading')
    expectHeadMeta(DASH)
  })

  it('empty (no BOM snapshot): the dash placeholder', async () => {
    vi.mocked(listBomLines).mockResolvedValue([])
    renderBudget()
    await findPageInState('empty')
    expectHeadMeta(DASH)
  })

  it('error: the dash placeholder beside the retry', async () => {
    vi.mocked(listBomLines).mockRejectedValue(new Error('cost lines unavailable'))
    renderBudget()
    await findPageInState('error')
    expectHeadMeta(DASH)
  })
})

describe('GUARD-R2/pricing (#250): the Pricing head never shows a naked number, in any state', () => {
  it('populated: the check count reads as a sentence', async () => {
    vi.mocked(listBudgets).mockResolvedValue([
      budgetFixture('b1', 'Baseline'), budgetFixture('b2', 'Promo'), budgetFixture('b3', 'Peak'),
    ])
    renderPricing()
    await findPageInState('read-only')
    expectHeadMeta('3 checks')
  })

  it('loading: the dash placeholder', async () => {
    vi.mocked(listBudgets).mockReturnValue(pending())
    renderPricing()
    await findPageInState('loading')
    expectHeadMeta(DASH)
  })

  it('empty (no budgets captured): the dash placeholder', async () => {
    vi.mocked(listBudgets).mockResolvedValue([])
    renderPricing()
    await findPageInState('empty')
    expectHeadMeta(DASH)
  })

  it('error: the dash placeholder beside the retry', async () => {
    vi.mocked(listBudgets).mockRejectedValue(new Error('budgets unavailable'))
    renderPricing()
    await findPageInState('error')
    expectHeadMeta(DASH)
  })
})
