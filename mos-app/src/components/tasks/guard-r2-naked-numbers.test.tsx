/**
 * MECH-GUARD R2 — no naked numbers in the Tasks page head (structural layer).
 *
 * Owner catch (review r2, missed by 5 audit rounds): the head rendered a bare "14" count
 * pill next to a differently-sized "2 blocked" fragment — number soup with no label
 * sentence ("size soup" incident). The fix: ONE muted meta sentence, "14 tasks · 2 blocked",
 * in a single `.ch-meta-line` at one font token.
 * Skill rule mechanized: impeccable distill "Every element should justify its existence"
 * (.claude/skills/impeccable/reference/distill.md) — a digit with no attached noun carries
 * no meaning; plus the one-type-scale rule (ui-ux-pro-max ux-guidelines "Font Size Scale —
 * don't: random font sizes").
 *
 * Structure asserted (jsdom, no pixels): the rendered Tasks head contains exactly one
 * `.ch-meta-line` whose text is a labeled sentence, NO `.ch-count` pill sibling, and no
 * descendant leaf anywhere in the head whose entire text is a bare number.
 *
 * ENUMERATION (Census R2 DO-7): this guard was Tasks-only, so the same class re-grew on
 * sibling heads. The page-level sweep lives in src/pages/guard-r2-naked-heads.test.tsx
 * (Objectives / Projects / Admin People). A new page head MUST be added to that sweep.
 * The MONEY head is enumerated HERE — its cut row-count folds into one labeled meta
 * sentence ("5 branches · as of …"); loading / empty / error show the "—" placeholder,
 * never a bare digit pill. r5 F-1 extends the money-lane enumeration to the BUDGET
 * ("2 scenarios") and PRICING ("3 checks") heads — same oracle, same placeholder rule.
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
vi.mock('@/lib/db/reporting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/reporting')>('@/lib/db/reporting')
  return { ...actual, listSalesDailyRevenue: vi.fn() }
})
vi.mock('@/lib/db/reporting-margin', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/db/reporting-margin')>('@/lib/db/reporting-margin')
  return { ...actual, listSalesMarginDaily: vi.fn() }
})
vi.mock('@/lib/db/plan-budget', () => ({
  listIngredientCostLines: vi.fn(),
  listBomLines: vi.fn(),
  listBudgets: vi.fn(),
  getCertifiedMetric: vi.fn(),
  captureBudget: vi.fn(),
}))

import { listTasks } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { listSalesDailyRevenue, type SalesDailyRevenueRow } from '@/lib/db/reporting'
import { listSalesMarginDaily } from '@/lib/db/reporting-margin'
import {
  listIngredientCostLines,
  listBomLines,
  listBudgets,
  getCertifiedMetric,
} from '@/lib/db/plan-budget'
import { DashboardPage } from '@/pages/dashboard-page'
import { BudgetPage } from '@/pages/budget-page'
import { PricingPage } from '@/pages/pricing-page'
import { TasksWorkspace } from './tasks-workspace'
import { __resetExpandPrefForTests } from './use-expand-pref'
import { __resetTasksViewPrefForTests } from './use-tasks-view-pref'

const VIEWER_ID = 'viewer-id'
const VIEWER_PERSON: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Arief Said',
  email: 'arief@gordi.id', archived_at: null,
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
  __resetExpandPrefForTests()
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
    const metaLines = head.querySelectorAll('.ch-meta-line')
    expect(metaLines).toHaveLength(1)
    expect(metaLines[0].textContent?.trim()).toBe('3 tasks · 1 blocked')

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

// ── DO-7 (census sweep r2) — the MONEY head under the same guard ─────────────────────

const MONEY_LATEST = '2026-06-30'
function moneyIsoDaysFrom(dateIso: string, delta: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
function moneyRevRow(
  date: string, channel: 'POS' | 'B2B', branchCode: string, branchName: string,
): SalesDailyRevenueRow {
  return {
    revenue_date: date,
    channel,
    esb_code: channel === 'B2B' ? 'GRI' : 'GKID',
    branch_code: branchCode,
    branch_name: branchName,
    transactions: 100,
    clean_revenue: 10_000_000,
    snapshot_as_of: '2026-07-01T03:14:00Z',
    source_contract_version: 'v1',
  }
}
function moneyRevenueRows(): SalesDailyRevenueRow[] {
  const rows: SalesDailyRevenueRow[] = []
  for (let i = 59; i >= 0; i--) {
    const d = moneyIsoDaysFrom(MONEY_LATEST, -i)
    rows.push(moneyRevRow(d, 'POS', 'GHQ', 'Gordi HQ'))
    rows.push(moneyRevRow(d, 'B2B', 'GRI', 'Gordi Roastery'))
  }
  return rows
}

function renderMoney() {
  return render(
    <MemoryRouter initialEntries={['/money']}>
      <DashboardPage />
    </MemoryRouter>,
  )
}

describe('GUARD-R2 (DO-7): the Money page head never shows a number without a label sentence', () => {
  it('GUARD-R2: populated head meta is one .ch-meta-line labeled sentence ("2 branches · as of …") — no .ch-count pill, no bare-number leaf', async () => {
    vi.mocked(listSalesDailyRevenue).mockResolvedValue(moneyRevenueRows())
    vi.mocked(listSalesMarginDaily).mockResolvedValue([])

    renderMoney()
    await waitFor(() => expect(screen.getByText(/channel mix/i)).toBeInTheDocument())

    const head = screen.getByTestId('page-head')
    const metaLines = head.querySelectorAll('.ch-meta-line')
    expect(metaLines).toHaveLength(1)
    // Count carries its noun AND the freshness sentence rides the same labeled line.
    expect(metaLines[0].textContent?.trim()).toMatch(/^2 branches · as of /)
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)
  })

  it('GUARD-R2: while Money data is loading the head shows the "—" placeholder, never a stale bare digit', async () => {
    vi.mocked(listSalesDailyRevenue).mockReturnValue(new Promise(() => {}))
    vi.mocked(listSalesMarginDaily).mockReturnValue(new Promise(() => {}))

    renderMoney()
    const head = await screen.findByTestId('page-head')
    const metaLine = head.querySelector('.ch-meta-line')
    expect(metaLine).not.toBeNull()
    expect(metaLine?.textContent?.trim()).toBe('—')
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)
  })

  it('GUARD-R2: the empty state (no snapshot rows) keeps the placeholder — no "0" pill', async () => {
    vi.mocked(listSalesDailyRevenue).mockResolvedValue([])
    vi.mocked(listSalesMarginDaily).mockResolvedValue([])

    renderMoney()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /no sales snapshot/i })).toBeInTheDocument(),
    )
    const head = screen.getByTestId('page-head')
    expect(head.querySelector('.ch-meta-line')?.textContent?.trim()).toBe('—')
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)
  })
})

// ── r5 F-1 — the BUDGET + PRICING heads under the same guard ─────────────────────────

const FRESH_BASIS = '2026-07-01T00:00:00Z'
function budgetRow(id: string, label: string) {
  return {
    id,
    menu_item_esb_code: 'MENU-CAPPUC',
    menu_item_name: 'Cappuccino',
    scenario_label: label,
    scenario_type: 'baseline' as const,
    owning_bu_id: 'bu-1',
    total_budgeted_cogs: 9000,
    cost_basis_as_of: FRESH_BASIS,
    certified_metric_key: 'cogs.budgeted',
    is_complete: true,
  }
}

function planBeforeEach() {
  vi.mocked(getCertifiedMetric).mockResolvedValue({
    key: 'cogs.budgeted', name: 'Budgeted COGS', certified: true,
  })
  vi.mocked(listBomLines).mockResolvedValue([
    { menu_item_esb_code: 'MENU-CAPPUC', ingredient_esb_code: 'ING-MILK', recipe_qty: 0.18, qty_unit: 'L' },
  ])
  vi.mocked(listIngredientCostLines).mockResolvedValue([
    { ingredient_esb_code: 'ING-MILK', name: 'Fresh Milk', unit_cost: 18000, unit: 'L', as_of: FRESH_BASIS },
  ])
}

function renderBudget() {
  return render(
    <I18nProvider>
      <AuthContext.Provider value={authedState}>
        <BudgetPage />
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

function renderPricing() {
  return render(
    <I18nProvider>
      <AuthContext.Provider value={authedState}>
        <PricingPage />
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

describe('GUARD-R2 (r5 F-1): the Budget page head never shows a number without a label sentence', () => {
  it('GUARD-R2: populated head meta is one labeled sentence ("2 scenarios") — no .ch-count pill, no bare-number leaf', async () => {
    planBeforeEach()
    vi.mocked(listBudgets).mockResolvedValue([budgetRow('b1', 'Baseline'), budgetRow('b2', 'Promo')])

    renderBudget()
    await waitFor(() => expect(screen.getAllByText('Fresh Milk').length).toBeGreaterThan(0))

    const head = screen.getByTestId('page-head')
    // The scenario list hydrates in a second effect (per-menu fetch) — wait on the meta.
    await waitFor(() =>
      expect(head.querySelector('.ch-meta-line')?.textContent?.trim()).toBe('2 scenarios'),
    )
    const metaLines = head.querySelectorAll('.ch-meta-line')
    expect(metaLines).toHaveLength(1)
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)
  })

  it('GUARD-R2: while Budget data is loading the head shows the "—" placeholder, never a stale bare digit', async () => {
    planBeforeEach()
    vi.mocked(listBomLines).mockReturnValue(new Promise(() => {}))
    vi.mocked(listBudgets).mockResolvedValue([])

    renderBudget()
    const head = await screen.findByTestId('page-head')
    expect(head.querySelector('.ch-meta-line')?.textContent?.trim()).toBe('—')
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)
  })
})

describe('GUARD-R2 (r5 F-1): the Pricing page head never shows a number without a label sentence', () => {
  it('GUARD-R2: populated head meta is one labeled sentence ("3 checks") — no .ch-count pill, no bare-number leaf', async () => {
    planBeforeEach()
    vi.mocked(listBudgets).mockResolvedValue([
      budgetRow('b1', 'Baseline'), budgetRow('b2', 'Promo'), budgetRow('b3', 'Peak'),
    ])

    renderPricing()
    await waitFor(() => expect(screen.getByText(/budget scenario/i)).toBeInTheDocument())

    const head = screen.getByTestId('page-head')
    const metaLines = head.querySelectorAll('.ch-meta-line')
    expect(metaLines).toHaveLength(1)
    expect(metaLines[0].textContent?.trim()).toBe('3 checks')
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)
  })

  it('GUARD-R2: the empty state (no budgets) keeps the placeholder — no "0" pill', async () => {
    planBeforeEach()
    vi.mocked(listBudgets).mockResolvedValue([])

    renderPricing()
    await waitFor(() =>
      expect(screen.getByText(/no budgets captured yet/i)).toBeInTheDocument(),
    )
    const head = screen.getByTestId('page-head')
    expect(head.querySelector('.ch-meta-line')?.textContent?.trim()).toBe('—')
    expect(head.querySelectorAll('.ch-count')).toHaveLength(0)
    expect(bareNumberLeaves(head)).toHaveLength(0)
  })
})
