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
 * The Money, Budget, and Pricing heads use this same grammar: one labeled `.ch-meta-line`,
 * with `—` while their source data is unknown. Their page-level suites cover the data journeys;
 * the shared guard below remains the Tasks census because the head grammar is intentionally shared.
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
vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('../../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))

import { listTasks } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listSalesDailyRevenue, type SalesDailyRevenueRow } from '@/lib/db/reporting'
import { listSalesMarginDaily, type SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { listBomLines, listIngredientCostLines, listBudgets, getCertifiedMetric } from '@/lib/db/plan-budget'
import { useAuth } from '@/auth/use-auth'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { TasksWorkspace } from './tasks-workspace'
import { DashboardPage } from '@/pages/dashboard-page'
import { BudgetPage } from '@/pages/budget-page'
import { PricingPage } from '@/pages/pricing-page'
import { __resetTasksViewPrefForTests } from './use-tasks-view-pref'

const VIEWER_ID = 'viewer-id'
const VIEWER_PERSON: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Arief Said',
  email: 'arief@example.test', must_change_password: false, archived_at: null,
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
  vi.mocked(useAuth).mockReturnValue(authedState)
  vi.mocked(listSalesDailyRevenue).mockResolvedValue([])
  vi.mocked(listSalesMarginDaily).mockResolvedValue([])
  vi.mocked(listBomLines).mockResolvedValue([])
  vi.mocked(listIngredientCostLines).mockResolvedValue([])
  vi.mocked(listBudgets).mockResolvedValue([])
  vi.mocked(getCertifiedMetric).mockResolvedValue({ key: 'cogs.budgeted', name: 'Budgeted COGS', certified: true })
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(listWorkLines).mockResolvedValue([])
})

/** Elements with no element children whose whole visible text is just digits. */
function bareNumberLeaves(root: Element): Element[] {
  return Array.from(root.querySelectorAll('*')).filter(
    (el) => el.children.length === 0 && /^\d+$/.test(el.textContent?.trim() ?? ''),
  )
}

const recentDate = new Date().toISOString().slice(0, 10)
const moneyRevenue: SalesDailyRevenueRow[] = [
  { revenue_date: recentDate, channel: 'POS', esb_code: 'A', branch_code: 'BR-1', branch_name: 'Main', transactions: 10, clean_revenue: 100000, snapshot_as_of: new Date().toISOString(), source_contract_version: 'v1' },
  { revenue_date: recentDate, channel: 'POS', esb_code: 'B', branch_code: 'BR-2', branch_name: 'Second', transactions: 8, clean_revenue: 80000, snapshot_as_of: new Date().toISOString(), source_contract_version: 'v1' },
]
const moneyMargin: SalesMarginDailyRow[] = [
  { margin_date: recentDate, esb_code: 'A', branch_code: 'BR-1', branch_name: 'Main', revenue: 100000, cogs_interim_sm: 50000, cogs_budget_bom: 50000, margin_interim: 50000, margin_interim_pct: 0.5, bom_coverage_pct: 1, snapshot_as_of: new Date().toISOString(), source_contract_version: 'v1' },
]
const budgetFixture = (id: string, scenario_label: string) => ({
  id, menu_item_esb_code: 'MENU-1', menu_item_name: 'Menu one', scenario_label,
  scenario_type: 'baseline' as const, owning_bu_id: 'bu-1', total_budgeted_cogs: 1000,
  cost_basis_as_of: new Date().toISOString(), certified_metric_key: 'cogs.budgeted', is_complete: true,
})

function renderMoney() {
  return render(<I18nProvider><MemoryRouter initialEntries={['/money']}><DashboardPage /></MemoryRouter></I18nProvider>)
}
function renderBudget() {
  return render(<I18nProvider><AuthContext.Provider value={authedState}><BudgetPage /></AuthContext.Provider></I18nProvider>)
}
function renderPricing() {
  return render(<I18nProvider><PricingPage /></I18nProvider>)
}

/** GUARD-R2 enumerations for the already-shipped Money-family page heads. */
describe('GUARD-R2 (DO-7): the Money page head never shows naked numbers', () => {
  it('populated Money uses one labeled meta sentence', async () => {
    vi.mocked(listSalesDailyRevenue).mockResolvedValue(moneyRevenue)
    vi.mocked(listSalesMarginDaily).mockResolvedValue(moneyMargin)
    renderMoney()
    const head = await screen.findByTestId('page-head')
    await waitFor(() => expect(head.querySelector('.ch-meta-line')?.textContent).toMatch(/^2 branches · as of /))
    expect(head.querySelectorAll('.ch-meta-line')).toHaveLength(1)
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)
  })

  it('Money loading and empty states use the dash placeholder', async () => {
    vi.mocked(listSalesDailyRevenue).mockReturnValue(new Promise(() => {}))
    vi.mocked(listSalesMarginDaily).mockReturnValue(new Promise(() => {}))
    const loadingRender = renderMoney()
    const head = await screen.findByTestId('page-head')
    expect(head.querySelectorAll('.ch-meta-line')).toHaveLength(1)
    expect(head.querySelector('.ch-meta-line')?.textContent?.trim()).toBe('—')
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)

    loadingRender.unmount()
    vi.mocked(listSalesDailyRevenue).mockResolvedValue([])
    vi.mocked(listSalesMarginDaily).mockResolvedValue([])
    renderMoney()
    const emptyHead = await screen.findByTestId('page-head')
    await waitFor(() => expect(emptyHead.querySelector('.ch-meta-line')?.textContent?.trim()).toBe('—'))
    expect(emptyHead.querySelectorAll('.ch-meta-line')).toHaveLength(1)
    expect(emptyHead.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(emptyHead)).toHaveLength(0)
  })

  it('Money error state uses one dash meta line without a count or bare number', async () => {
    vi.mocked(listSalesDailyRevenue).mockRejectedValue(new Error('report unavailable'))
    vi.mocked(listSalesMarginDaily).mockRejectedValue(new Error('report unavailable'))
    renderMoney()
    const head = await screen.findByTestId('page-head')
    await waitFor(() => expect(head.querySelector('.ch-meta-line')?.textContent?.trim()).toBe('—'))
    expect(head.querySelectorAll('.ch-meta-line')).toHaveLength(1)
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)
  })
})

describe('GUARD-R2 (r5 F-1): the Budget and Pricing page heads never show naked numbers', () => {
  it('Budget populated head says scenarios and loading uses a dash', async () => {
    vi.mocked(listBomLines).mockResolvedValue([{ menu_item_esb_code: 'MENU-1', ingredient_esb_code: 'ING-1', recipe_qty: 1, qty_unit: 'kg' }])
    vi.mocked(listIngredientCostLines).mockResolvedValue([{ ingredient_esb_code: 'ING-1', name: 'Ingredient', unit_cost: 1000, unit: 'kg', as_of: new Date().toISOString() }])
    vi.mocked(listBudgets).mockResolvedValue([budgetFixture('b1', 'Baseline'), budgetFixture('b2', 'Promo')])
    const budgetRender = renderBudget()
    const head = await screen.findByTestId('page-head')
    await waitFor(() => expect(head.querySelector('.ch-meta-line')?.textContent?.trim()).toBe('2 scenarios'))
    expect(head.querySelectorAll('.ch-meta-line')).toHaveLength(1)
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)

    budgetRender.unmount()
    vi.mocked(listBomLines).mockReturnValue(new Promise(() => {}))
    renderBudget()
    const loadingHead = await screen.findByTestId('page-head')
    expect(loadingHead.querySelectorAll('.ch-meta-line')).toHaveLength(1)
    expect(loadingHead.querySelector('.ch-meta-line')?.textContent?.trim()).toBe('—')
    expect(loadingHead.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(loadingHead)).toHaveLength(0)
  })

  it('Pricing populated head says checks and empty uses a dash', async () => {
    vi.mocked(listBudgets).mockResolvedValue([
      budgetFixture('b1', 'Baseline'), budgetFixture('b2', 'Promo'), budgetFixture('b3', 'Peak'),
    ])
    const pricingRender = renderPricing()
    const head = await screen.findByTestId('page-head')
    await waitFor(() => expect(head.querySelector('.ch-meta-line')?.textContent?.trim()).toBe('3 checks'))
    expect(head.querySelectorAll('.ch-meta-line')).toHaveLength(1)
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)

    pricingRender.unmount()
    vi.mocked(listBudgets).mockResolvedValue([])
    renderPricing()
    const emptyHead = await screen.findByTestId('page-head')
    await waitFor(() => expect(emptyHead.querySelector('.ch-meta-line')?.textContent?.trim()).toBe('—'))
    expect(emptyHead.querySelectorAll('.ch-meta-line')).toHaveLength(1)
    expect(emptyHead.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(emptyHead)).toHaveLength(0)
  })
})

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
