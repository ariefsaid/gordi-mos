// BudgetPage tests — TDD (AC-tagged). Route /plan/budget (finance/admin-gated at the router; this
// suite proves the page's OWN behavior once mounted): the linked BOM × cost lines -> budgeted COGS,
// the drill to the linked cost line (link-never-copy — AC-PB-007), the capture write shape
// (AC-PB-008), and the fail-loud badge on a stale cost basis.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthContext, type AuthState } from '@/auth/context'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { PeopleRow } from '@/lib/database.types'
import type { BudgetRow } from '@/lib/plan-budget-logic'
import * as planBudgetLogic from '@/lib/plan-budget-logic'

vi.mock('@/lib/db/plan-budget', () => ({
  listIngredientCostLines: vi.fn(),
  listBomLines: vi.fn(),
  listBudgetsPage: vi.fn(),
  getCertifiedMetric: vi.fn(),
  captureBudget: vi.fn(),
}))
vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn() }))

import {
  listIngredientCostLines,
  listBomLines,
  listBudgetsPage,
  getCertifiedMetric,
  captureBudget,
} from '@/lib/db/plan-budget'
import { getBusinessUnits } from '@/lib/db/directory'
import { BudgetPage } from './budget-page'

const PERSON_ID = 'person-1'

// Freshness is measured against NOW (assessCostStatus: `reference = basisAsOf ?? new Date()`,
// STALENESS_DAYS = 30 in lib/plan-budget-logic.ts), so an absolute fixture date is a TIME BOMB:
// it silently ages past the threshold and turns the suite red on a day nobody changed anything.
// That is not hypothetical — `2026-07-01` was fresh all morning on 2026-07-30 and went stale at
// 2026-07-31T00:00Z, mid-session, breaking "AC-PB-006: a fresh + certified basis renders the
// healthy badge" with no code change behind it.
// Anchored to now instead, so the scenario means what its name says in perpetuity.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const FRESH = daysAgo(5)    // well inside STALENESS_DAYS (30)
const STALE = daysAgo(200)  // unambiguously outside it

const viewerPerson: PeopleRow = {
  id: PERSON_ID,
  org_id: 'org-1',
  user_id: 'user-1',
  full_name: 'Fitri Finance',
  email: 'fitri@example.test',
  must_change_password: false,
  archived_at: null,
  created_at: '2026-07-06T00:00:00Z',
  updated_at: '2026-07-06T00:00:00Z',
}
const authed: AuthState = {
  status: 'authenticated',
  viewer: { person: viewerPerson, roles: [], isManager: false, accessRoles: ['finance'], affiliated: [] },
  signOut: async () => {},
}

function renderPage(locale: 'en' | 'id' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter>
        <AuthContext.Provider value={authed}>
          <BudgetPage />
        </AuthContext.Provider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCertifiedMetric).mockResolvedValue({ key: 'cogs.budgeted', name: 'Budgeted COGS', certified: true })
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Finance' }])
  vi.mocked(listBudgetsPage).mockResolvedValue({ rows: [], cursor: null, hasMore: false })
})

describe('BudgetPage — head (r5 F-9)', () => {
  it('r5 F-9: the head speaks the Budget-specific job sentence — never the shared job.money', async () => {
    vi.mocked(listBomLines).mockResolvedValue([])
    vi.mocked(listIngredientCostLines).mockResolvedValue([])
    renderPage()
    await screen.findByText(/no bom snapshot data/i)
    const head = screen.getByTestId('page-head')
    expect(head.textContent).toContain('Capture certified-cost budget scenarios pricing can trust.')
    expect(head.textContent).not.toContain('Trust the financial figures')
  })
})

describe('BudgetPage — states', () => {
  it.each([
    { locale: 'en' as const, name: 'Loading…' },
    { locale: 'id' as const, name: 'Memuat…' },
  ])('loading: shows a busy skeleton with a localized accessible name in $locale', ({ locale, name }) => {
    vi.mocked(listBomLines).mockReturnValue(new Promise(() => {}))
    vi.mocked(listIngredientCostLines).mockResolvedValue([])
    renderPage(locale)
    expect(screen.getByRole('status', { name })).toBeInTheDocument()
  })

  it('empty: names the snapshot source without leaking internal schema strings', async () => {
    vi.mocked(listBomLines).mockResolvedValue([])
    vi.mocked(listIngredientCostLines).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/no bom snapshot data/i)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/reporting\.bom_lines/i)
  })

  it('error: retryable, non-secret', async () => {
    vi.mocked(listBomLines).mockRejectedValue(new Error('permission denied for table'))
    vi.mocked(listIngredientCostLines).mockResolvedValue([])
    renderPage()
    expect(await screen.findByRole('button', { name: /retry|try again/i })).toBeInTheDocument()
  })
})

describe('BudgetPage — populated (fresh + certified)', () => {
  beforeEach(() => {
    vi.mocked(listBomLines).mockResolvedValue([
      { menu_item_esb_code: 'MENU-CAPPUC', ingredient_esb_code: 'ING-MILK', recipe_qty: 0.18, qty_unit: 'L' },
      { menu_item_esb_code: 'MENU-CAPPUC', ingredient_esb_code: 'ING-ESP', recipe_qty: 0.018, qty_unit: 'kg' },
    ])
    vi.mocked(listIngredientCostLines).mockResolvedValue([
      { ingredient_esb_code: 'ING-MILK', name: 'Fresh Milk', unit_cost: 18000, unit: 'L', as_of: FRESH },
      { ingredient_esb_code: 'ING-ESP', name: 'Espresso Beans', unit_cost: 320000, unit: 'kg', as_of: FRESH },
    ])
  })

  it('renders the budgeted COGS total (Σ qty × linked cost)', async () => {
    renderPage()
    // 0.18×18000 + 0.018×320000 = 3240 + 5760 = 9000
    // Cohesion-debt 2026-07-19, item #1: money now renders id-ID DOTS (Rp 9.000),
    // not en-US commas — the one canonical formatIDR (lib/format/money). Every other
    // IDR string in the app was already dotted; the Plan family was the outlier.
    expect(await screen.findByText(/Rp 9.000/)).toBeInTheDocument()
  })

  it.each([
    {
      locale: 'en' as const,
      preview: 'Budgeted COGS preview',
      capture: 'Capture budget scenario',
      linkedCost: 'Linked cost line for Fresh Milk',
      bom: 'Linked BOM evidence',
      scenarios: 'Captured scenarios',
    },
    {
      locale: 'id' as const,
      preview: 'Pratinjau HPP anggaran',
      capture: 'Catat skenario anggaran',
      linkedCost: 'Baris biaya tertaut untuk Fresh Milk',
      bom: 'Bukti BOM tertaut',
      scenarios: 'Skenario yang dicatat',
    },
  ])('provides localized accessible names for budget regions and cost links in $locale', async ({ locale, preview, capture, linkedCost, bom, scenarios }) => {
    renderPage(locale)
    await screen.findByText(/Rp 9.000/)
    expect(screen.getByRole('region', { name: preview })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: capture })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: linkedCost })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: bom })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: scenarios })).toBeInTheDocument()
  })

  it('AC-PB-007: each BOM line shows a drill link to the linked cost line (link-never-copy)', async () => {
    renderPage()
    await screen.findByText(/Rp 9.000/)
    const drills = screen.getAllByTestId('drill-cost-line')
    expect(drills).toHaveLength(2)
    // The drill anchor resolves to the linked cost-line record by ingredient code.
    expect(drills[0].getAttribute('href')).toBe('#cost-line-ING-MILK')
  })

  it('AC-PB-007: the linked cost-line rows are present (the consumer reads the linked record, not a copy)', async () => {
    renderPage()
    await screen.findByText(/Rp 9.000/)
    // The cost catalogue is folded away until asked for.
    fireEvent.click(screen.getByRole('button', { name: /^Linked ingredient cost lines/i }))
    const costRows = screen.getAllByTestId('cost-line-row')
    expect(costRows).toHaveLength(2)
    // The linked record's name renders in BOTH the BOM preview (resolved from the link) and the
    // cost-line table (the record itself) — both prove the consumer reads the linked record.
    expect(screen.getAllByText('Fresh Milk').length).toBeGreaterThanOrEqual(1)
  })

  it('AC-PB-006: a fresh + certified basis renders the healthy badge (no warning)', async () => {
    renderPage()
    await screen.findByText(/Rp 9.000/)
    expect(screen.getByText(/certified · fresh/i)).toBeInTheDocument()
    expect(screen.queryByText(/stale/i)).not.toBeInTheDocument()
  })

  it('uses the shared E7 text-field primitive for the scenario label', async () => {
    renderPage()
    const input = await screen.findByLabelText(/scenario label/i)
    expect(input).toHaveClass('mk-textinput__field')
    expect(input.closest('.mk-textinput')).toHaveClass('mk-textinput--full')
  })

  it.each([
    ['en', /Basis as of —/],
    ['id', /Dasar biaya per —/],
  ] as const)('keeps a missing cost basis absent when capturing in %s', async (locale, basisCopy) => {
    vi.mocked(captureBudget).mockResolvedValue('MISSING-BASIS-BUDGET')
    vi.mocked(listBomLines).mockResolvedValue([
      { menu_item_esb_code: 'MENU-CAPPUC', ingredient_esb_code: 'ING-MILK', recipe_qty: 1, qty_unit: 'L' },
    ])
    vi.mocked(listIngredientCostLines).mockResolvedValue([
      { ingredient_esb_code: 'ING-MILK', name: 'Fresh Milk', unit_cost: 9000, unit: 'L', as_of: FRESH },
    ])
    const compute = vi.spyOn(planBudgetLogic, 'computeBudgetedCogs').mockReturnValue({
      lines: [{ ingredient_esb_code: 'ING-MILK', ingredient_name: 'Fresh Milk', recipe_qty: 1, qty_unit: 'L', unit_cost: 9000, cost_as_of: null, line_total: 9000 }],
      total: 9000, complete: true, basis_as_of: null,
    })
    try {
      renderPage(locale)
      expect(await screen.findByText(basisCopy)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /capture budget|catat anggaran/i }))
      await waitFor(() => expect(captureBudget).toHaveBeenCalledTimes(1))
      expect(vi.mocked(captureBudget).mock.calls[0][0].costBasisAsOf).toBeNull()
    } finally {
      compute.mockRestore()
    }
  })

  it('AC-PB-008: capture submits a budget with the linked shape (no unit cost on lines)', async () => {
    vi.mocked(captureBudget).mockResolvedValue('NEW-BUDGET')
    renderPage()
    await screen.findByText(/Rp 9.000/)
    fireEvent.click(screen.getByRole('button', { name: /capture budget/i }))
    await waitFor(() => expect(captureBudget).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(captureBudget).mock.calls[0][0]
    expect(arg.menuItemEsbCode).toBe('MENU-CAPPUC')
    // A5: the client no longer sends a computed COGS total — capture_budget recomputes it
    // server-side from the linked cost lines (link-never-copy). No totalBudgetedCogs on the input.
    expect('totalBudgetedCogs' in arg).toBe(false)
    expect(arg.isComplete).toBe(true)
    // link-never-copy: the lines carry ingredient + qty only — NO unit_cost field.
    for (const line of arg.lines) {
      expect(line).toHaveProperty('ingredient_esb_code')
      expect(line).toHaveProperty('recipe_qty')
      expect(Object.keys(line)).not.toContain('unit_cost')
    }
    expect(await screen.findByText(/saved scenario/i)).toBeInTheDocument()
  })
})

describe('BudgetPage — scenario paging', () => {
  const baseline: BudgetRow = {
    id: 'budget-1', menu_item_esb_code: 'MENU-CAPPUC', menu_item_name: 'Cappuccino', scenario_label: 'Baseline',
    scenario_type: 'baseline', owning_bu_id: 'bu-1', total_budgeted_cogs: 9000,
    cost_basis_as_of: FRESH, certified_metric_key: 'cogs.budgeted', is_complete: true,
  }
  const promo: BudgetRow = { ...baseline, id: 'budget-2', scenario_label: 'Promo', scenario_type: 'promo' }

  it.each([
    { locale: 'en' as const, more: 'Load more items' },
    { locale: 'id' as const, more: 'Muat item lainnya' },
  ])('loads additional scenarios in $locale only when the user continues the list', async ({ locale, more }) => {
    vi.mocked(listBudgetsPage).mockResolvedValueOnce({
      rows: [baseline], cursor: { id: 'budget-1', createdAt: '2026-10-01T00:00:00Z' }, hasMore: true,
    }).mockResolvedValueOnce({ rows: [promo], cursor: null, hasMore: false })
    vi.mocked(listBomLines).mockResolvedValue([{ menu_item_esb_code: 'MENU-CAPPUC', ingredient_esb_code: 'ING-MILK', recipe_qty: 1, qty_unit: 'L' }])
    vi.mocked(listIngredientCostLines).mockResolvedValue([{ ingredient_esb_code: 'ING-MILK', name: 'Milk', unit_cost: 9000, unit: 'L', as_of: FRESH }])

    renderPage(locale)
    await screen.findByRole('row', { name: /Baseline/ })
    fireEvent.click(screen.getByRole('button', { name: more }))
    await screen.findByRole('row', { name: /Promo/ })
    expect(listBudgetsPage).toHaveBeenLastCalledWith('MENU-CAPPUC', { id: 'budget-1', createdAt: '2026-10-01T00:00:00Z' })
  })
})

describe('BudgetPage — fail-loud freshness (AC-PB-006)', () => {
  it('renders a stale warning when a linked cost line is old', async () => {
    vi.mocked(listBomLines).mockResolvedValue([
      { menu_item_esb_code: 'MENU-CROISS', ingredient_esb_code: 'ING-BUTTER', recipe_qty: 0.04, qty_unit: 'kg' },
    ])
    vi.mocked(listIngredientCostLines).mockResolvedValue([
      { ingredient_esb_code: 'ING-BUTTER', name: 'Butter', unit_cost: 95000, unit: 'kg', as_of: STALE },
    ])
    renderPage()
    // The fail-loud badge surfaces the stale reason.
    expect(await screen.findByText(/stale/i)).toBeInTheDocument()
  })
})

it('recovers a failed scenario read without reporting an empty list', async () => {
  vi.mocked(listBomLines).mockResolvedValue([{ menu_item_esb_code: 'MENU-CAPPUC', ingredient_esb_code: 'ING-MILK', recipe_qty: 1, qty_unit: 'L' }])
  vi.mocked(listIngredientCostLines).mockResolvedValue([])
  vi.mocked(listBudgetsPage).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ rows: [], cursor: null, hasMore: false })
  renderPage()
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.queryByText(/no scenarios/i)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText(/no scenarios/i)).toBeVisible()
})


it('does not show the previous menu scenarios while the new menu loads', async () => {
  const row: BudgetRow = { id: 'old', menu_item_esb_code: 'A', menu_item_name: 'A', scenario_label: 'Old scenario', scenario_type: 'baseline', owning_bu_id: 'bu-1', total_budgeted_cogs: 1, cost_basis_as_of: FRESH, certified_metric_key: 'cogs.budgeted', is_complete: true }
  vi.mocked(listBomLines).mockResolvedValue(['A', 'B'].map(menu_item_esb_code => ({ menu_item_esb_code, ingredient_esb_code: 'ING', recipe_qty: 1, qty_unit: 'L' })))
  vi.mocked(listIngredientCostLines).mockResolvedValue([])
  vi.mocked(listBudgetsPage).mockResolvedValueOnce({ rows: [row], cursor: null, hasMore: false }).mockReturnValueOnce(new Promise(() => {}))
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Old scenario')
  await user.click(screen.getByRole('combobox', { name: /menu item/i }))
  await user.click(screen.getByRole('option', { name: 'B' }))
  expect(screen.queryByText('Old scenario')).not.toBeInTheDocument()
})

it('ignores late scenario response from previously selected menu', async () => {
  const rowA: BudgetRow = { id: 'a', menu_item_esb_code: 'A', menu_item_name: 'A', scenario_label: 'A scenario', scenario_type: 'baseline', owning_bu_id: 'bu-1', total_budgeted_cogs: 1, cost_basis_as_of: FRESH, certified_metric_key: 'cogs.budgeted', is_complete: true }
  const rowB: BudgetRow = { id: 'b', menu_item_esb_code: 'B', menu_item_name: 'B', scenario_label: 'B scenario', scenario_type: 'baseline', owning_bu_id: 'bu-1', total_budgeted_cogs: 2, cost_basis_as_of: FRESH, certified_metric_key: 'cogs.budgeted', is_complete: true }
  vi.mocked(listBomLines).mockResolvedValue(['A', 'B'].map(menu_item_esb_code => ({ menu_item_esb_code, ingredient_esb_code: 'ING', recipe_qty: 1, qty_unit: 'L' })))
  vi.mocked(listIngredientCostLines).mockResolvedValue([])

  let resolveLateA!: (val: { rows: BudgetRow[]; cursor: null; hasMore: false }) => void
  const lateAPromise = new Promise<{ rows: BudgetRow[]; cursor: null; hasMore: false }>((res) => { resolveLateA = res })

  vi.mocked(listBudgetsPage)
    .mockReturnValueOnce(lateAPromise)
    .mockResolvedValueOnce({ rows: [rowB], cursor: null, hasMore: false })

  const user = userEvent.setup()
  renderPage()

  const combobox = await screen.findByRole('combobox', { name: /menu item/i })
  await user.click(combobox)
  await user.click(screen.getByRole('option', { name: 'B' }))

  expect(await screen.findByText('B scenario')).toBeVisible()

  // Now resolve A late
  resolveLateA({ rows: [rowA], cursor: null, hasMore: false })
  await new Promise((r) => setTimeout(r, 10))

  expect(screen.getByText('B scenario')).toBeVisible()
  expect(screen.queryByText('A scenario')).not.toBeInTheDocument()
})
